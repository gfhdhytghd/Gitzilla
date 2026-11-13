import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pathJoin } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';
import { RoomServer, type GameServices } from './rooms';
import { RoomStore } from './room-store';
import { mergeClassroomPacket } from '../shared/classroom-delta';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import type { ClientMsg, ServerMsg } from '../shared/types';

class Socket extends EventEmitter {
  readyState = 1;
  messages: ServerMsg[] = [];
  classrooms = 0;
  send(raw: string) {
    const msg = JSON.parse(raw) as ServerMsg;
    if (msg.t === 'classroom') this.classrooms++;
    this.messages.push(msg); if (this.messages.length > 12) this.messages.shift();
  }
  close() { this.readyState = 3; this.emit('close'); }
  terminate() { this.close(); }
  latest() { return this.messages.filter(m => m.t === 'classroom').at(-1)!; }
}
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).forEach(f => f()); vi.restoreAllMocks(); vi.useRealTimers(); });
function fixture(persistenceFile?: string) {
  const wss = new WebSocketServer({ noServer: true });
  const rooms = new RoomServer(wss, { listFallbackRepos: () => [] } as unknown as GameServices, { allowLegacyEdu: true, persistenceFile });
  cleanup.push(() => { rooms.close(); wss.close(); });
  const code = rooms.createRoom(undefined, 'edu');
  const room = rooms['rooms'].get(code)!;
  const send = async (socket: Socket, msg: ClientMsg) => { socket.emit('message', Buffer.from(JSON.stringify(msg))); for (let i = 0; i < 20; i++) await Promise.resolve(); };
  const join = async (role: 'player' | 'screen', resume?: string, classroomDelta?: boolean) => {
    const s = new Socket(); wss.emit('connection', s, { headers: {} } as IncomingMessage);
    await send(s, { t: 'hello', room: code, role, name: role, resume, classroomDelta });
    const welcome = s.messages.find(m => m.t === 'welcome') as Extract<ServerMsg, {t: 'welcome'}> | undefined;
    return { s, welcome };
  };
  const plan = async (teacher: Socket) => {
    const plan = defaultClassroomPlan();
    plan.steps = [{ ...plan.steps[0], id: 'questions', mode: 'questions', durationSec: 0,
      questions: [{ id: 'q', kind: 'single', prompt: 'Pick', options: [{id:'yes',text:'Yes'}, {id:'no',text:'No'}], answer: 'yes' }] }];
    await send(teacher, {t:'classroomPlan',plan});
  };
  return { rooms, room, code, send, join, plan };
}

describe('200-seat classroom delivery', () => {
  it('admits 200 students, refuses the 201st, and resumes a retained seat at capacity', async () => {
    vi.useFakeTimers();
    const f = fixture(), teacher = await f.join('screen'); await f.plan(teacher.s);
    const students = [];
    for (let i = 0; i < 200; i++) students.push(await f.join('player'));
    expect(students.every(s => !!s.welcome)).toBe(true);
    expect(f.room.classroom!.state.rows).toHaveLength(200);
    const extra = await f.join('player'); expect(extra.welcome).toBeUndefined();
    expect(extra.s.messages.at(-1)).toMatchObject({t:'error',message:expect.stringContaining('200')});
    students[0].s.close();
    const resumed = await f.join('player', students[0].welcome!.token);
    expect(resumed.welcome?.you).toBe(students[0].welcome!.you);
    expect(f.room.classroom!.state.rows).toHaveLength(200);
  });

  it('keeps the own row on every wire path and aggregates peers without identity leakage', async () => {
    const f = fixture(), teacher = await f.join('screen'), alice = await f.join('player'), bob = await f.join('player'), projector = await f.join('screen');
    await f.plan(teacher.s); await f.send(teacher.s, {t:'classroomControl',action:'start'});
    await f.send(alice.s, {t:'classroomAnswers',stepId:'questions',attempt:1,answers:{q:{choice:'yes'}}});
    const state = alice.s.latest().state;
    expect(state.rows.map(r => r.id)).toEqual([alice.welcome!.you]);
    expect(state.summary).toEqual({roster:2,submitted:1,connected:2,queued:0,away:0});
    expect(state.rows[0]).not.toHaveProperty('score');
    const resumed = await f.join('player', alice.welcome!.token);
    expect(resumed.welcome!.lobby.classroom!.rows.map(r => r.id)).toEqual([alice.welcome!.you]);
    expect(resumed.welcome!.lobby.players.map(r => r.id)).toEqual([alice.welcome!.you]);
    expect(f.rooms.lobby(f.room, f.room.members.get(bob.welcome!.you)).classroom!.rows.map(r => r.id)).toEqual([bob.welcome!.you]);
    expect(f.rooms.lobby(f.room, f.room.members.get(projector.welcome!.you)).classroom!.rows).toEqual([]);
    expect(f.rooms.lobby(f.room, f.room.members.get(projector.welcome!.you)).players).toEqual([]);
    expect(teacher.s.latest().state.rows).toHaveLength(2);
    expect(JSON.stringify(projector.s.latest().state.rows)).not.toContain(alice.welcome!.you);
  });

  it('coalesces peer updates, acknowledges own saves immediately, and flushes phase changes', async () => {
    vi.useFakeTimers();
    const f = fixture(), teacher = await f.join('screen'), alice = await f.join('player'), bob = await f.join('player');
    await f.plan(teacher.s); await f.send(teacher.s, {t:'classroomControl',action:'start'});
    const before = teacher.s.classrooms;
    await f.send(alice.s, {t:'classroomAnswers',stepId:'questions',attempt:1,answers:{q:{choice:'yes'}}});
    expect(alice.s.latest().reports[alice.welcome!.you].answers!.q).toBeDefined();
    await f.send(bob.s, {t:'classroomAnswers',stepId:'questions',attempt:1,answers:{q:{choice:'no'}}});
    expect(teacher.s.classrooms).toBe(before);
    await vi.advanceTimersByTimeAsync(249); expect(teacher.s.classrooms).toBe(before);
    await vi.advanceTimersByTimeAsync(1); expect(teacher.s.classrooms).toBe(before + 1);
    expect(teacher.s.latest().questionLive![0].answered).toBe(2);
    await f.send(teacher.s, {t:'classroomControl',action:'attack'});
    expect(teacher.s.latest().state.phase).toBe('raid');
    expect(bob.s.latest().state.phase).toBe('raid');
    const final = teacher.s.classrooms;
    await vi.advanceTimersByTimeAsync(250); expect(teacher.s.classrooms).toBe(final);
  });

  it('debounces answer persistence, bounds continuous traffic and flushes on shutdown', async () => {
    vi.useFakeTimers();
    const dir = mkdtempSync(pathJoin(tmpdir(), 'classroom-200-'));
    const file = pathJoin(dir, 'rooms.json'), f = fixture(file), teacher = await f.join('screen'), student = await f.join('player');
    cleanup.push(() => rmSync(dir, {recursive:true,force:true}));
    await f.plan(teacher.s); await f.send(teacher.s,{t:'classroomControl',action:'start'});
    await vi.advanceTimersByTimeAsync(1000);
    const save = vi.spyOn(RoomStore.prototype, 'save');
    await f.send(student.s,{t:'classroomAnswers',stepId:'questions',attempt:1,answers:{q:{choice:'yes'}}});
    await vi.advanceTimersByTimeAsync(250); expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(750); expect(save).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 15; i++) { f.rooms['persist'](1000); await vi.advanceTimersByTimeAsync(100); }
    expect(save.mock.calls.length).toBeGreaterThanOrEqual(2);
    f.rooms.close();
    expect(JSON.parse(readFileSync(file,'utf8')).rooms[0].classroom.rows[0].status).toBe('submitted');
  });
  it('sends only own frozen attacks and anonymous totals on every non-teacher wire path', async () => {
    const f = fixture(), teacher = await f.join('screen'), alice = await f.join('player'), bob = await f.join('player'), projector = await f.join('screen');
    await f.plan(teacher.s);
    const session = f.room.classroom!; session.state.phase = 'feedback';
    const attacks = [
      {id:alice.welcome!.you,name:'ALICE_PRIVATE',score:80,improvement:20,damage:4,commit:'alice-secret'},
      {id:bob.welcome!.you,name:'BOB_PRIVATE',score:20,improvement:0,damage:1,commit:'bob-secret'},
    ];
    session.state.rounds.push({stepId:'questions',attempt:1,at:1,bossBefore:10,bossAfter:5,roster:2,attacks,
      checkStats:[{label:'Check',passed:1,total:2}]});
    const controller = new Socket(); f.room.members.get(alice.welcome!.you)!.controllerSocket = controller as any;
    f.rooms['publishClassroom'](f.room, false);
    expect(teacher.s.latest().state.rounds[0].attacks).toEqual(attacks);
    for (const [peer, id] of [[alice.s,alice.welcome!.you],[bob.s,bob.welcome!.you],[controller,alice.welcome!.you],[projector.s,undefined]] as const) {
      const round = peer.latest().state.rounds[0];
      expect(round.attacks.map(a=>a.id)).toEqual(id ? [id] : []);
      expect(round.totals).toMatchObject({submitted:2,damage:5,score:100,average:50,median:50,bands:[1,0,1]});
      const other = id === bob.welcome!.you ? 'ALICE_PRIVATE' : 'BOB_PRIVATE';
      expect(JSON.stringify(peer.latest())).not.toContain(other);
      expect(round.checkStats).toEqual([{label:'Check',passed:1,total:2}]);
    }
    for (const viewer of [f.room.members.get(alice.welcome!.you),f.room.members.get(projector.welcome!.you)]) {
      expect(f.rooms.lobby(f.room,viewer).classroom!.rounds[0].attacks).toHaveLength(viewer!.role==='player'?1:0);
    }
    const resumed = await f.join('player',alice.welcome!.token);
    expect(resumed.welcome!.lobby.classroom!.rounds[0].attacks.map(a=>a.id)).toEqual([alice.welcome!.you]);
    expect(session.state.rounds[0].attacks).toEqual(attacks);
  });

  it('sends opt-in teacher history only on change, resets on reconnect, and preserves legacy snapshots', async () => {
    const f = fixture(), teacher = await f.join('screen',undefined,true); await f.join('player'); await f.plan(teacher.s);
    f.rooms['publishClassroom'](f.room, false);
    expect(teacher.s.latest().delta).toMatchObject({roundsUnchanged:true});
    const round = {stepId:'questions',attempt:1,at:1,bossBefore:10,bossAfter:5,roster:1,attacks:[{id:'test',name:'Test',score:80,improvement:0,damage:5,commit:'a'}]};
    f.room.classroom!.state.rounds.push(round);
    f.rooms['publishClassroom'](f.room,false);
    expect(teacher.s.latest().state.rounds).toEqual([round]);
    f.rooms['publishClassroom'](f.room,false);
    expect(teacher.s.latest().state.rounds).toEqual([]);
    expect(teacher.s.latest().delta?.roundsUnchanged).toBe(true);
    const resumed = await f.join('screen',teacher.welcome!.token,true);
    expect(resumed.s.latest().state.rounds).toEqual([round]);
    expect(resumed.s.latest().delta).toBeUndefined();
    const legacy = await f.join('screen',teacher.welcome!.token);
    f.rooms['publishClassroom'](f.room,false); f.rooms['publishClassroom'](f.room,false);
    expect(legacy.s.latest().state.rounds).toEqual([round]);
    expect(legacy.s.latest().delta).toBeUndefined();
  });

  it('patches only changed teacher reports and explicitly removes cleared reports', async () => {
    const f=fixture(), teacher=await f.join('screen',undefined,true), student=await f.join('player');
    await f.plan(teacher.s);await f.send(teacher.s,{t:'classroomControl',action:'start'});
    await f.send(student.s,{t:'classroomAnswers',stepId:'questions',attempt:1,answers:{q:{choice:'yes'}}});
    f.rooms['publishClassroom'](f.room,false);
    expect(Object.keys(teacher.s.latest().reports)).toEqual([student.welcome!.you]);
    f.rooms['publishClassroom'](f.room,false);expect(teacher.s.latest().reports).toEqual({});
    f.room.classroom!.state.phase='feedback';
    await f.send(teacher.s,{t:'classroomControl',action:'retry'});
    expect(teacher.s.latest().delta?.removedReports).toEqual([student.welcome!.you]);
    expect(teacher.s.latest().state.attempt).toBe(2);
  });

  it('does not expose hidden question scores through anonymous totals', async () => {
    const f=fixture(),teacher=await f.join('screen'),student=await f.join('player'),projector=await f.join('screen');
    await f.plan(teacher.s);await f.send(teacher.s,{t:'classroomControl',action:'start'});
    await f.send(student.s,{t:'classroomAnswers',stepId:'questions',attempt:1,answers:{q:{choice:'yes'}}});
    await f.send(teacher.s,{t:'classroomControl',action:'attack'});
    expect(teacher.s.latest().state.rounds[0].attacks[0].score).toBe(100);
    expect(projector.s.latest().state.rounds[0].totals?.score).toBe(0);
    expect(projector.s.latest().state.rounds[0].attacks).toEqual([]);
    f.room.classroom!.state.phase='feedback';f.rooms['publishClassroom'](f.room,false);
    expect(projector.s.latest().state.rounds[0].totals?.score).toBe(100);
  });

  it('reuses the negotiated student plan but replaces it at reveal and retry boundaries', async () => {
    const f=fixture(),teacher=await f.join('screen'),student=await f.join('player',undefined,true);
    await f.plan(teacher.s);let merged=student.s.latest();
    expect(merged.delta).toBeUndefined();
    await f.send(teacher.s,{t:'classroomControl',action:'start'});
    expect(student.s.latest().delta?.planUnchanged).toBe(true);
    merged=mergeClassroomPacket(merged,student.s.latest());
    expect(merged.state.plan.steps[0].questions![0]).not.toHaveProperty('answer');
    await f.send(student.s,{t:'classroomAnswers',stepId:'questions',attempt:1,answers:{q:{choice:'yes'}}});
    merged=mergeClassroomPacket(merged,student.s.latest());
    await f.send(teacher.s,{t:'classroomControl',action:'attack'});
    merged=mergeClassroomPacket(merged,student.s.latest());
    f.room.classroom!.state.phase='feedback';f.rooms['publishClassroom'](f.room,false);
    expect(student.s.latest().delta?.planUnchanged).toBeUndefined();
    merged=mergeClassroomPacket(merged,student.s.latest());
    expect(merged.state.plan.steps[0].questions![0]).toHaveProperty('answer','yes');
    expect(merged.state.rounds[0].attacks.map(a=>a.id)).toEqual([student.welcome!.you]);
    await f.send(teacher.s,{t:'classroomControl',action:'retry'});
    merged=mergeClassroomPacket(merged,student.s.latest());
    expect(merged.state.plan.steps[0].questions![0]).not.toHaveProperty('answer');
    expect(merged.reports).toEqual({});
  });

});
