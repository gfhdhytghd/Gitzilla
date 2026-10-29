import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { RoomServer, type GameServices } from './rooms';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import type { ClientMsg, ServerMsg, StudentFeedback } from '../shared/types';
import { profileFromFiles } from '../analysis/graph';
import { buildGenesis } from '../genesis';
import { playerKitFromProfile } from '../sim';
import { handleEduRoute } from './edu-http';
import type { ServerResponse } from 'node:http';

class Socket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  messages: ServerMsg[] = [];
  send(raw: string) { this.messages.push(JSON.parse(raw)); }
  close() { this.readyState = WebSocket.CLOSED; this.emit('close'); }
  terminate() { this.close(); }
  latest() { return this.messages.filter(m => m.t === 'classroom').at(-1)!; }
  welcome() { return this.messages.find(m => m.t === 'welcome')! as Extract<ServerMsg, {t:'welcome'}>; }
}
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).forEach(close => close()); vi.useRealTimers(); });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fixture(services: Partial<GameServices> = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });
  const rooms = new RoomServer(wss, { listFallbackRepos: () => [], ...services } as GameServices, { allowLegacyEdu: true });
  const code = rooms.createRoom(undefined, 'edu'), room = rooms['rooms'].get(code)!;
  cleanup.push(() => { rooms.close(); wss.close(); });
  const socket = () => { const s = new Socket(); wss.emit('connection', s, {headers:{}} as IncomingMessage); return s; };
  const send = async (s: Socket, msg: ClientMsg) => { s.emit('message', Buffer.from(JSON.stringify(msg))); await flush(); };
  const join = async (role: 'player' | 'screen' = 'player', resume?: string, name: string = role) => {
    const s = socket(); await send(s, {t:'hello',room:code,role,resume,name}); expect(s.welcome()).toBeDefined(); return s;
  };
  const plan = async (teacher: Socket) => { await send(teacher, {t:'classroomPlan',plan:defaultClassroomPlan()}); return room.classroom!; };
  return {rooms,room,code,socket,send,join,plan};
}

describe('classroom production boundaries', () => {
  it('S1 reserves the unpublished teacher seat across disconnect, other hellos and token resume', async () => {
    const f = fixture(), teacher = await f.join('screen'), student = await f.join();
    const id = teacher.welcome().you; teacher.close();
    expect(f.room.ownerId).toBe(id); expect(f.room.teacherId).toBe(id);
    student.close(); await f.join('player', student.welcome().token); await f.join(); await f.join('screen');
    expect(f.room.ownerId).toBe(id); expect(f.room.teacherId).toBe(id);
    const resumed = await f.join('screen', teacher.welcome().token);
    expect(resumed.welcome().you).toBe(id); await f.plan(resumed); expect(f.room.classroom).toBeDefined();
  });
  it('S1 preserves same-room migration without a teacher and releases an explicitly left teacher', async () => {
    const f = fixture(), student = await f.join(), teacher = await f.join('screen');
    expect(student.welcome().lobby.ownerId).toBe(student.welcome().you);
    expect(f.room.teacherId).toBe(teacher.welcome().you);
    await f.send(teacher, {t:'leave'}); expect(f.room.teacherId).toBeUndefined();
    const replacement = await f.join('screen'); expect(f.room.ownerId).toBe(replacement.welcome().you);
  });
  it('S2 releases an explicit leave at thirty students but retains a disconnected seat', async () => {
    const f = fixture(), teacher = await f.join('screen'), students: Socket[] = [];
    for (let i = 0; i < 30; i++) students.push(await f.join());
    const session = await f.plan(teacher); expect(session.state.rows).toHaveLength(30);
    students[1].close(); expect(session.state.rows).toHaveLength(30);
    await f.send(students[0], {t:'leave'}); expect(session.state.rows).toHaveLength(29);
    const replacement = await f.join(); expect(session.state.rows).toHaveLength(30);
    expect(session.state.rows.some(r => r.id === replacement.welcome().you)).toBe(true);
    await f.join('player', students[1].welcome().token); expect(session.state.rows).toHaveLength(30);
  });
  it('S2 evicts the longest-offline ungraded identity before publishing at most thirty rows', async () => {
    vi.useFakeTimers();
    const f = fixture(), teacher = await f.join('screen'), ids: string[] = [];
    for (let i = 0; i < 31; i++) { const s = await f.join(); ids.push(s.welcome().you); s.close(); vi.advanceTimersByTime(1); }
    expect(f.room.members.has(ids[0])).toBe(false); expect(f.room.members.has(ids[1])).toBe(true);
    expect([...f.room.members.values()].filter(m => m.role === 'player')).toHaveLength(30);
    const session = await f.plan(teacher); expect(session.state.rows).toHaveLength(30);
    const returning = await f.join('player', f.room.members.get(ids[1])!.token); returning.close(); vi.advanceTimersByTime(1);
    const next = await f.join(); next.close();
    expect(f.room.members.has(ids[1])).toBe(true); expect(f.room.members.has(ids[2])).toBe(false);
    // Legacy over-capacity lobbies also pass through the publication guard.
    f.room.classroom = undefined;
    const member = {...f.room.members.get(ids[1])!, id:'legacy', disconnectedAt:-1};
    member.lobby = {...member.lobby,id:'legacy'}; f.room.members.set('legacy', member);
    await f.plan(teacher); expect(f.room.classroom!.state.rows).toHaveLength(30); expect(f.room.members.has('legacy')).toBe(false);
  });
  it('S2 rejects a new identity when thirty offline seats have submission attempts', async () => {
    const f = fixture(), teacher = await f.join('screen'), students: Socket[] = [];
    for (let i = 0; i < 30; i++) students.push(await f.join());
    const session = await f.plan(teacher); session.control('start');
    for (const student of students) { const ticket = session.begin(student.welcome().you, 'demo/repo'); session.fail(ticket, 'Retry later'); student.close(); }
    const extra = f.socket(); await f.send(extra, {t:'hello',room:f.code,role:'player',name:'Extra'});
    expect(extra.messages).toContainEqual({t:'error',message:'This lesson already has 30 students; reconnect with your existing session'});
    expect(session.state.rows).toHaveLength(30);
  });
  it('F1 publishes the roster on disconnect with thirty-one contributing legacy rows', async () => {
    const f = fixture(), teacher = await f.join('screen'), student = await f.join();
    const session = await f.plan(teacher), id = student.welcome().you;
    // Reproduce an over-capacity classroom saved before the admission limit.
    session.roster([{id,name:'Student',connected:true},
      ...Array.from({length:30}, (_, i) => ({id:`legacy-${i}`,name:`Legacy ${i}`,connected:false}))]);
    session.control('start');
    for (const row of session.state.rows) session.fail(session.begin(row.id, 'demo/repo'), 'Retry later');
    expect(session.state.rows).toHaveLength(31);
    expect(session.state.rows.every(row => row.attempts > 0)).toBe(true);
    const published = teacher.messages.filter(m => m.t === 'classroom').length;
    expect(() => student.close()).not.toThrow();
    expect(teacher.messages.filter(m => m.t === 'classroom')).toHaveLength(published + 1);
    expect(teacher.latest().state.rows).toHaveLength(31);
    expect(teacher.latest().state.rows.find(row => row.id === id)?.connected).toBe(false);
    expect(teacher.messages.filter(m => m.t === 'lobby').at(-1)!.lobby.classroom?.rows).toHaveLength(31);
  });
  it('S2 kicks orphan classroom rows without banning another identity', async () => {
    const f = fixture(), teacher = await f.join('screen'); await f.join(); const session = await f.plan(teacher);
    session.roster([{id:'orphan',name:'Old student',connected:false}]);
    await f.send(teacher, {t:'kick',playerId:'orphan'});
    expect(session.state.rows.some(r => r.id === 'orphan')).toBe(false);
    expect(f.room.bans.tokens.size).toBe(0); expect(f.room.bans.identities.size).toBe(0);
  });
  it('S3 sends Alice rubric evidence only to Alice and the reserved teacher, including welcome', async () => {
    const result = {criterionId:'tests',score:0.5,evidence:'private evidence',tip:'private tip'};
    const f = fixture({defaultRubric:() => defaultClassroomPlan().steps[0].rubric,scoreRepo:() => [result]});
    const teacher = await f.join('screen'), alice = await f.join('player', undefined, 'Alice');
    const member = f.room.members.get(alice.welcome().you)!;
    member.profile = profileFromFiles('demo/repo', [{path:'main.py',text:'answer=42'}]); member.lobby.status = 'ready';
    member.lobby.kit = {repo:'demo/repo',title:'Student',weapon:'blaster',skill:'hotfix',maxHp:7,maxArmor:4,maxEnergy:180,speed:70,damageMul:1,palette:[],seed:1,
      code:{tokens:[],signature:'private signature',snippet:'private source',identifiers:[]},
      quality:[{stat:'hp',value:7,grade:'B',signal:'private signal',tip:'private quality tip'}]};
    member.lobby.progress = {stage:'parse',pct:0.5,paths:['private/file.py'],note:'private progress'};
    const bob = await f.join('player', undefined, 'Bob'), spectator = await f.join('screen');
    const preview = (s: Socket) => s.messages.filter(m => m.t === 'lobby').at(-1)!.lobby.players.find(p => p.id === member.id)?.rubricPreview;
    expect(preview(alice)).toEqual([result]); expect(preview(teacher)).toEqual([result]);
    expect(JSON.stringify(alice.messages)).toContain('private source');
    expect(JSON.stringify(teacher.messages)).toContain('private signal');
    for (const s of [bob,spectator]) {
      for (const secret of ['private source','private signature','private signal','private quality tip','private/file.py','private progress']) expect(JSON.stringify(s.messages)).not.toContain(secret);
    }
    expect(preview(bob)).toBeUndefined(); expect(preview(spectator)).toBeUndefined();
    expect(bob.welcome().lobby.players.find(p => p.id === member.id)?.rubricPreview).toBeUndefined();
    expect(JSON.stringify(bob.messages)).not.toContain('private evidence'); expect(JSON.stringify(spectator.messages)).not.toContain('private tip');
  });
  it('F2 keeps bot code, genesis and quality evidence visible to classroom viewers', async () => {
    const profile = profileFromFiles('demo/bot', [{path:'main.py',text:'answer=42'}]);
    const kit = {...playerKitFromProfile(profile, {mode:'edu'}),
      code:{tokens:[],signature:'bot signature',snippet:'bot source',identifiers:[]},
      quality:[{stat:'hp' as const,value:7,grade:'B' as const,signal:'bot signal',tip:'bot tip'}]};
    const f = fixture({listFallbackRepos:() => ['demo/bot'],botProfile:() => profile,playerKitFromProfile:() => kit,buildGenesis});
    const teacher = await f.join('screen'); await f.send(teacher, {t:'setBots',count:1});
    const student = await f.join(), spectator = await f.join('screen');
    const genesis = buildGenesis(profile, kit, 'hero');
    for (const viewer of [student, spectator]) {
      const bot = viewer.welcome().lobby.players.find(p => p.bot)!;
      expect(bot.kit).toEqual(kit); expect(bot.genesis).toEqual(genesis);
    }
    const bot = f.rooms.lobby(f.room, f.room.members.get(student.welcome().you), true).players.find(p => p.bot)!;
    expect(bot.kit).toEqual(kit); expect(bot.genesis).toEqual(genesis);
  });
  it('S4 passes only current-step file and contains paths into GitHub analysis', async () => {
    const analyze = vi.fn(async () => { throw new Error('fixture failure'); });
    const f = fixture({analyzeClassroomSubmission:analyze}), teacher = await f.join('screen'), student = await f.join();
    const p = defaultClassroomPlan(); p.steps[0].brief = undefined;
    p.steps[0].checks = [{id:'file',kind:'file',path:'data.csv',label:'Data'},{id:'text',kind:'contains',path:'docs/notes.md',text:'answer',label:'Notes'},{id:'ci',kind:'ci',path:'unit',label:'Tests'}];
    await f.send(teacher,{t:'classroomPlan',plan:p}); await f.send(teacher,{t:'classroomControl',action:'start'});
    await f.send(student,{t:'classroomSubmit',repo:'demo/repo'});
    expect(analyze).toHaveBeenCalledWith('demo/repo','HEAD','',true,['data.csv','docs/notes.md']);
  });
  it('S5 rejects UTF-8 submissions over two MiB and pre-hello frames over 256 KiB', async () => {
    const f = fixture(), student = await f.join();
    const raw = JSON.stringify({t:'classroomSubmitCode',files:[],padding:'中'.repeat(750000)});
    expect(raw.length).toBeLessThan(2 * 1024 * 1024); expect(Buffer.byteLength(raw)).toBeGreaterThan(2 * 1024 * 1024);
    student.emit('message',Buffer.from(raw)); await flush();
    expect(student.messages.at(-1)).toEqual({t:'error',message:'Room message is too large'});
    const pending = f.socket(); pending.emit('message',Buffer.alloc(256 * 1024 + 1, 32)); await flush();
    expect(pending.messages.at(-1)).toEqual({t:'error',message:'Room message is too large'}); expect(pending.welcome()).toBeUndefined();
  });
  it('S6 publishes host pause transitions without rebroadcasting reports on timer ticks', async () => {
    vi.useFakeTimers();
    const f = fixture(), teacher = await f.join('screen'), student = await f.join(); const session = await f.plan(teacher);
    session.control('start');
    const files = [{path:'main.py',text:'answer=42'}];
    session.accept(session.begin(student.welcome().you,'demo/repo'),{profile:profileFromFiles('demo/repo',files),files,commit:'a'.repeat(40),checks:[]});
    session.control('attack');
    await f.send(teacher,{t:'pause',paused:true}); expect(teacher.latest().state.paused?.resumeAt).toBeNull();
    const pausedCount = teacher.messages.length; await vi.advanceTimersByTimeAsync(2000); expect(teacher.messages).toHaveLength(pausedCount);
    await f.send(teacher,{t:'pause',paused:false}); const countdown = teacher.latest().state.paused!.resumeAt!;
    expect(countdown).toBe(Date.now()+3000); const resumeCount = teacher.messages.length;
    await vi.advanceTimersByTimeAsync(2800); expect(teacher.messages).toHaveLength(resumeCount);
    await vi.advanceTimersByTimeAsync(200); expect(teacher.latest().state.paused).toBeNull();
    expect(teacher.messages.length).toBe(resumeCount+1);
  });
  it('S8 restricts full legacy feedback, exports and rubric parse to the reserved teacher', async () => {
    const f = fixture(), owner = await f.join(), spectator = await f.join('screen');
    // Reproduce a saved legacy player owner with no reserved teacher.
    f.room.ownerId = owner.welcome().you; f.room.teacherId = undefined;
    f.room.feedback = [{playerId:owner.welcome().you,name:'Owner'},{playerId:'other',name:'Private'}] as StudentFeedback[];
    f.rooms['publishFeedback'](f.room);
    expect(spectator.messages.filter(m => m.t === 'feedback').at(-1)?.items).toEqual([]);
    expect(owner.messages.filter(m => m.t === 'feedback').at(-1)?.items).toHaveLength(1);
    const request = async (path: string, token: string, method = 'GET') => {
      const req = Object.assign(new EventEmitter(),{method,headers:{'x-room-token':token},resume(){}}) as unknown as IncomingMessage;
      const res = {status:0,writeHead(status:number){this.status=status;},end(){}};
      expect(await handleEduRoute(req,res as unknown as ServerResponse,new URL(path,'http://fixture'),f.rooms)).toBe(true);
      return res.status;
    };
    for (const name of ['feedback.csv','feedback.md','classroom.csv','classroom.md']) expect(await request(`/api/room/${f.code}/${name}`,owner.welcome().token)).toBe(403);
    expect(await request(`/api/rubric/parse?room=${f.code}`,owner.welcome().token,'POST')).toBe(403);
    f.room.ownerId = spectator.welcome().you; f.room.teacherId = spectator.welcome().you;
    f.rooms['publishFeedback'](f.room); expect(spectator.messages.filter(m => m.t === 'feedback').at(-1)?.items).toHaveLength(2);
    expect(f.rooms.eduOwnerError(f.code,spectator.welcome().token)).toBeUndefined();
    expect(f.rooms.eduOwnerError(f.code,'x'.repeat(spectator.welcome().token.length))?.status).toBe(403);
    expect(f.rooms.eduOwnerError(f.code,'short')?.status).toBe(403);
  });
});
