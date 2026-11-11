import { describe, it, expect } from 'vitest';
import { ClassroomSession, normalizeClassroomPlan } from './classroom';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { profileFromFiles } from '../analysis/graph';
import { classroomExport, gradesExport } from './classroom-export';
const sha = 'a'.repeat(40);
const files = [{path:'src/main.ts',text:'export const answer = 42'}, {path:'README.md',text:'# Example'}];
const source = {profile:profileFromFiles('demo/repo', files), commit:sha, files, checks:[]};
function lesson() {
  let time=1000;
  const plan=defaultClassroomPlan(); plan.steps[0].checksWeight=100;
  plan.steps[0].checks=[{id:'readme',kind:'file',path:'README.md',label:'Documentation'}, {id:'answer',kind:'contains',path:'src/main.ts',text:'answer',label:'Answer'}];
  delete plan.steps[0].brief; // Custom check fixture uses the free-text fallback.
  const s=new ClassroomSession(plan,()=>time);
  s.roster([{id:'a',name:'Alice',connected:true},{id:'b',name:'Bob',connected:true}]);
  return {s, advance:(ms:number)=>{time+=ms;}, plan};
}
describe('staged classroom lesson',()=>{
  it('S2 explicit leave removes the live row without changing locked HP or frozen exports', () => {
    const {s}=lesson(); s.control('start'); s.accept(s.begin('a','demo/repo'),source); s.control('attack');
    const rounds=structuredClone(s.state.rounds), csv=classroomExport(s.publicState(),'csv'), hp=s.state.bossHp, max=s.state.bossMaxHp;
    s.remove('a'); expect(s.state.rows.some(r=>r.id==='a')).toBe(false);
    expect(s.state.rounds).toEqual(rounds); expect(classroomExport(s.publicState(),'csv')).toBe(csv);
    expect(s.state.bossHp).toBe(hp); expect(s.state.bossMaxHp).toBe(max);
  });
  it('S9 restores the prior commit, score and its review after a failed resubmission', () => {
    const {s,advance}=lesson(); s.control('start'); s.accept(s.begin('a','demo/repo'),source);
    s.review('a',80,'Reviewed this commit only'); const report=structuredClone(s.privatePayload('a',true).reports.a);
    advance(5000); const ticket=s.begin('a','other/repo'); expect(s.state.rows[0].status).toBe('queued');
    s.fail(ticket,'GitHub rate limit');
    expect(s.state.rows[0]).toMatchObject({status:'submitted',repo:'demo/repo',commit:sha,score:80,attempts:2});
    expect(s.privatePayload('a',true).reports.a).toEqual(report); expect(s.privatePayload('a',false).errors.a).toBe('GitHub rate limit');
    s.control('attack'); expect(s.state.rounds[0].attacks[0]).toMatchObject({commit:sha,score:80}); expect(s.state.rounds[0].attacks[0].damage).toBeGreaterThan(0);
  });
  it('S9 replaces a prior reviewed result on a lower successful score', () => {
    const {s,advance}=lesson(); s.control('start'); s.accept(s.begin('a','demo/repo'),source); s.review('a',90,'Old review');
    advance(5000); s.accept(s.begin('a','demo/repo'),{...source,commit:'b'.repeat(40),files:[]});
    expect(s.state.rows[0]).toMatchObject({status:'submitted',score:0,commit:'b'.repeat(40)});
    expect(s.privatePayload('a',true).reports.a.teacherReview).toBeUndefined();
  });
  it('S9 restores graded state on lesson end and never resurrects a kicked pending row', () => {
    const {s,advance}=lesson(); s.control('start');
    for(const id of ['a','b']) { s.accept(s.begin(id,'demo/repo'),source); s.review(id,75,'Review belongs to old commit'); }
    advance(5000); const a=s.begin('a','next/repo'),b=s.begin('b','next/repo'); s.kick('b'); s.end();
    expect(s.valid(a)).toBe(false); expect(s.valid(b)).toBe(false); s.accept(a,source);s.accept(b,source);s.fail(a,'stale');
    expect(s.state.rows).toHaveLength(1);expect(s.state.rows[0]).toMatchObject({id:'a',status:'submitted',score:75,commit:sha});
    expect(s.privatePayload('a',true).reports.a.teacherReview?.score).toBe(75);
    expect(s.privatePayload('a',true).reports.b).toBeUndefined(); expect(s.privatePayload('a',false).errors.a).toContain('ended');
  });
  it('freezes roster and positional check totals from this round scored reports only', () => {
    const {s} = lesson(); s.roster([{ id:'a', name:'Alice', connected:true }, { id:'b', name:'Bob', connected:true }, { id:'c', name:'Missing', connected:true }, { id:'d', name:'Removed', connected:true }]);
    s.control('start'); s.accept(s.begin('a','demo/repo'),source);
    s.accept(s.begin('b','demo/repo'),{ ...source, commit:'b'.repeat(40), files:files.slice(0,1) });
    s.accept(s.begin('d','demo/repo'),source); s.kick('d');
    s.roster([{ id:'a', name:'Alice', connected:true }, { id:'b', name:'Bob', connected:false }, { id:'c', name:'Missing', connected:true }]);
    s.review('b',100,'Reviewed separately; static check evidence stays unchanged.'); s.control('attack');
    const frozen = structuredClone(s.state.rounds[0]);
    expect(frozen.roster).toBe(3); expect(frozen.attacks).toHaveLength(2);
    expect(frozen.checkStats).toEqual([{label:'Documentation',passed:1,total:2},{label:'Answer',passed:2,total:2}]);
    expect(JSON.stringify(frozen.checkStats)).not.toContain('Alice');
    s.kick('a'); s.roster([{ id:'e', name:'Late student', connected:true }]);
    expect(s.state.rounds[0]).toEqual(frozen);
    expect(ClassroomSession.restore(JSON.parse(JSON.stringify(s.save()))).state.rounds[0]).toEqual(frozen);
  });
  it('records fresh check totals on retries and supports checkless rounds', () => {
    const {s,advance}=lesson(); s.control('start'); s.accept(s.begin('a','demo/repo'),source); s.control('attack');
    const first=structuredClone(s.state.rounds[0]); advance(10001);s.tick();s.control('retry');
    s.accept(s.begin('b','demo/repo'),{...source,files:files.slice(0,1)});s.control('attack');
    expect(s.state.rounds[0]).toEqual(first); expect(s.state.rounds[1].checkStats).toEqual([{label:'Documentation',passed:0,total:1},{label:'Answer',passed:1,total:1}]);
    advance(10001);s.tick();s.control('next');
    s.accept(s.begin('a','demo/repo'),source);s.control('attack'); expect(s.state.rounds[2].roster).toBe(2);expect(s.state.rounds[2].checkStats).toEqual([]);
  });
  it('preserves absent legacy aggregates and never guesses checks from restored scores', () => {
    const {s}=lesson(); s.control('start');s.accept(s.begin('a','demo/repo'),source);
    const coding=JSON.parse(JSON.stringify(s.save())); const restoredCoding=ClassroomSession.restore(coding);
    restoredCoding.control('attack'); expect(restoredCoding.state.rounds[0].roster).toBe(1);
    expect(restoredCoding.state.rounds[0]).not.toHaveProperty('checkStats');
    s.control('attack');const legacy=JSON.parse(JSON.stringify(s.save()));delete legacy.rounds[0].roster;delete legacy.rounds[0].checkStats;
    const restored=ClassroomSession.restore(legacy);expect(restored.state.rounds[0]).not.toHaveProperty('roster');expect(restored.state.rounds[0]).not.toHaveProperty('checkStats');
    expect(JSON.parse(JSON.stringify(restored.save())).rounds[0]).toEqual(legacy.rounds[0]);
  });
  it('drops kicked queued submissions/live rows but preserves attacks that already earned credit', () => {
    const {s} = lesson(); s.control('start');
    const pending = s.begin('a', 'demo/repo'); s.accept(s.begin('b', 'demo/repo'), source);
    s.kick('a'); expect(s.valid(pending)).toBe(false); s.accept(pending, source);
    expect(s.state.rows.map(r => r.id)).toEqual(['b']); expect(s.privatePayload('a', true).reports.a).toBeUndefined();
    s.control('attack'); const rounds = structuredClone(s.state.rounds), exported = classroomExport(s.publicState(), 'csv');
    s.kick('b'); expect(s.state.rows).toEqual([]); expect(s.state.rounds).toEqual(rounds);
    expect(classroomExport(s.publicState(), 'csv')).toBe(exported); expect(s.privatePayload('teacher', true).reports).toEqual({});
  });
  it('freezes the host raid clock and shifts its deadline without replaying attacks', () => {
    const {s, advance} = lesson();
    s.control('start'); s.accept(s.begin('a','demo/repo'), source); s.control('attack');
    const before = s.publicState(), remaining = before.raidEndsAt! - before.serverTime;
    s.pauseHostClock(); advance(20_000); s.pauseHostClock();
    expect(s.tick()).toBe(false); expect(s.publicState()).toEqual(before);
    s.resumeHostClock(); s.resumeHostClock();
    expect(s.state.raidEndsAt! - s.publicState().serverTime).toBe(remaining);
    expect(s.state.rounds).toEqual(before.rounds); expect(s.state.bossHp).toBe(before.bossHp);
    advance(remaining - 1); expect(s.tick()).toBe(false);
    advance(1); expect(s.tick()).toBe(true); expect(s.state.phase).toBe('feedback');
  });
  it.each([1, 2, 4, 8, 30])('budgets one step of HP for %i perfect students while preserving later steps', count => {
    const {plan}=lesson(),s=new ClassroomSession(plan);
    const students=Array.from({length:count},(_,i)=>({id:`s${i}`,name:`Student ${i}`,connected:true}));
    s.roster(students);
    expect(s.state.bossMaxHp).toBe(60 * count / 4);
    s.control('start');
    for(const student of students) s.accept(s.begin(student.id,'demo/repo'),source);
    s.control('attack');
    expect(s.state.rounds[0].attacks.every(a=>a.damage===5)).toBe(true);
    expect(s.state.bossHp / s.state.bossMaxHp).toBeCloseTo(2/3);
  });
  it('updates the setup preview but locks HP through disconnects, late joins and restore',()=>{
    const {s,plan}=lesson();
    expect(s.state.bossMaxHp).toBe(30);
    s.remove('b'); expect(s.state.bossMaxHp).toBe(15);
    s.setPlan({...plan,steps:plan.steps.slice(0,2)}); expect(s.state.bossMaxHp).toBe(10);
    s.control('start'); s.accept(s.begin('a','demo/repo'),source);
    s.review('a',25,'Partial implementation'); s.control('attack');
    const hp=s.state.bossHp; expect(hp).toBe(8.3);
    s.roster([{id:'c',name:'Late student',connected:true}]); s.remove('a');
    expect(s.state.bossHp).toBe(hp); expect(s.state.bossMaxHp).toBe(10);
    const restored=ClassroomSession.restore(s.save());
    restored.roster([{id:'a',name:'Alice',connected:true},{id:'c',name:'Late student',connected:true}]);
    expect(restored.state.bossHp).toBe(hp); expect(restored.state.bossMaxHp).toBe(10);
  });
  it('validates bounded tasks, relative paths and unique task ids',()=>{
    const {plan}=lesson(); expect(normalizeClassroomPlan(plan).steps).toHaveLength(3);
    plan.steps[0].checks[0].path='../secrets'; expect(()=>normalizeClassroomPlan(plan)).toThrow('relative');
    plan.steps[0].checks=[]; plan.steps[1].id=plan.steps[0].id; expect(()=>normalizeClassroomPlan(plan)).toThrow('unique');
    expect(()=>normalizeClassroomPlan({...plan,steps:[]})).toThrow();
  });
  it('grades actual pinned evidence, isolates private reports, and drains a pause',()=>{
    const {s}=lesson(); s.control('start'); const a=s.begin('a','demo/repo'), b=s.begin('b','demo/repo');
    expect(()=>s.control('attack')).toThrow('queued'); s.control('pause'); s.accept(a,source);
    s.accept(b,{...source,files:files.slice(0,1),commit:'b'.repeat(40)});
    expect(s.privatePayload('a',false).reports.a.score).toBe(100);
    expect(Object.keys(s.privatePayload('a',false).reports)).toEqual(['a']);
    expect(Object.keys(s.privatePayload('teacher',true).reports)).toHaveLength(2);
    expect(s.privatePayload('b',false).reports.b.score).toBe(50);
    s.control('attack'); expect(s.state.rounds[0].attacks.map(a=>a.commit)).toEqual([sha,'b'.repeat(40)]);
    expect(s.state.bossMaxHp).toBe(30); expect(s.state.bossHp).toBe(20); expect(s.valid(a)).toBe(false);
  });
  it('rejects synthetic grades and missing SHA; never treats skipped CI as passed',()=>{
    const {s}=lesson(); s.state.plan.steps[0].checks=[{id:'ci',kind:'ci',path:'unit-tests',label:'Tests'}];
    s.control('start'); const ticket=s.begin('a','demo/repo');
    expect(()=>s.accept(ticket,{...source,profile:{...source.profile,fallback:true}})).toThrow('fallback');
    expect(()=>s.accept(ticket,{...source,commit:'main'})).toThrow('immutable');
    s.accept(ticket,{...source,checks:[{name:'unit-tests',status:'completed',conclusion:'skipped'}]});
    expect(s.privatePayload('a',false).reports.a.score).toBe(0);
    expect(s.privatePayload('a',false).reports.a.advice.join()).toContain('unit-tests');
  });
  it('locks versions per round and grants only incremental credit on retries',()=>{
    const {s,advance}=lesson(); s.control('start'); s.accept(s.begin('a','demo/repo'),source); s.control('attack');
    const first=s.state.bossHp; advance(10000); s.tick(); s.control('retry');
    s.accept(s.begin('a','demo/repo'),source); s.control('attack'); expect(s.state.bossHp).toBe(first);
    advance(10000); s.tick(); s.control('next'); expect(s.state.stepIndex).toBe(1); expect(s.state.phase).toBe('coding');
    s.accept(s.begin('a','demo/repo'),source); expect(s.privatePayload('a',false).reports.a.improvement).toBe(0);
  });
  it('stops submissions at deadline, supports extension, review and revoked pending tickets',()=>{
    const {s,advance}=lesson(); s.control('start'); const ticket=s.begin('a','demo/repo');
    advance(600001); expect(s.tick()).toBe(true); expect(s.state.phase).toBe('paused');
    expect(()=>s.begin('b','demo/repo')).toThrow('coding'); s.accept(ticket,source);
    s.review('a',80,'Verified outputs locally'); expect(s.privatePayload('a',false).reports.a.teacherReview?.score).toBe(80);
    s.control('extend'); s.control('resume'); expect(s.state.deadline).toBeGreaterThan(600000);
    const b=s.begin('b','demo/repo'); s.remove('b'); expect(s.valid(b)).toBe(false); s.accept(b,source);
    s.control('attack'); expect(s.state.rounds[0].attacks).toHaveLength(1);
  });
  it('restores aggregates with paused coding and without private feedback',()=>{
    const {s,advance}=lesson(); s.control('start'); s.accept(s.begin('a','demo/repo'),source); s.control('attack'); advance(10000);s.tick();s.control('retry');
    const restored=ClassroomSession.restore(s.save()); expect(restored.state.phase).toBe('paused'); expect(restored.privatePayload('a',true).reports).toEqual({});
    restored.roster([{id:'a',name:'Alice',connected:true}]); restored.control('resume'); restored.accept(restored.begin('a','demo/repo'),source); restored.control('attack');
    expect(restored.state.rounds[1].attacks[0].damage).toBe(0);
  });
  it('exports frozen round history and escapes spreadsheet and Markdown injection',()=>{
    const {s}=lesson();s.roster([{id:'a',name:'=SUM(1,2)| <img>',connected:true}]);s.control('start');s.accept(s.begin('a','demo/repo'),source);s.control('attack');
    const csv=classroomExport(s.publicState(),'csv');expect(csv).toContain('"\'=SUM(1,2)| <img>"');expect(csv).toContain(sha);
    expect(classroomExport(s.publicState(),'md')).toContain('\\| \\<img\\>');
  });
});

it('normalizes doctests and grades only supplied executed results', () => {
  const { plan } = lesson();
  plan.steps[0].checks = [{ id: 'd', kind: 'doctest', label: 'Python', path: 'main.py', text: '>>> answer\n42' }];
  const normalized = normalizeClassroomPlan(plan); expect(normalized.steps[0].checks[0].text).toBe('>>> answer\n42');
  let now = 1000;
  const s = new ClassroomSession(plan, () => now); s.roster([{ id: 'a', name: 'Alice', connected: true }]); s.control('start');
  s.accept(s.begin('a', 'demo/repo'), { ...source, doctests: { 'check-0': { passed: true, detail: '1/1 examples passed' } } });
  expect(s.privatePayload('a', false).reports.a).toMatchObject({ score: 100, checks: [{ label: 'Python', passed: true, detail: '1/1 examples passed' }] });
  now += 5000; s.accept(s.begin('a', 'demo/repo'), source);
  expect(s.privatePayload('a', false).reports.a).toMatchObject({ score: 0, checks: [{ passed: false, detail: 'doctest runner unavailable on this server' }] });
  plan.steps[0].checks[0].text = 'x'.repeat(4001); expect(() => normalizeClassroomPlan(plan)).toThrow('doctest');
  plan.steps[0].checks[0].text = ''; expect(normalizeClassroomPlan(plan).steps[0].checks[0].text).toBe('');
  delete plan.steps[0].checks[0].text; expect(normalizeClassroomPlan(plan).steps[0].checks[0].text).toBeUndefined();
  plan.steps[0].checks[0].path = '../bad.py'; expect(() => normalizeClassroomPlan(plan)).toThrow('relative');
});

it('exports lesson grades only to the reserved teacher through the HTTP route', async () => {
  const { EventEmitter } = await import('node:events');
  const { WebSocketServer } = await import('ws');
  const { RoomServer } = await import('./rooms');
  const { handleEduRoute } = await import('./edu-http');
  const wss = new WebSocketServer({ noServer: true });
  const rooms = new RoomServer(wss, { listFallbackRepos: () => [] } as unknown as import('./rooms').GameServices, { allowLegacyEdu: true });
  try {
    const code = rooms.createRoom(undefined, 'edu');
    const join = async (role: 'player' | 'screen') => {
      const messages: import('../shared/types').ServerMsg[] = [];
      const socket = Object.assign(new EventEmitter(), { readyState: 1, send: (raw: string) => messages.push(JSON.parse(raw)), close() {}, terminate() {} });
      wss.emit('connection', socket, { headers: {} });
      socket.emit('message', Buffer.from(JSON.stringify({ t: 'hello', room: code, role, name: role })));
      for (let i = 0; i < 20; i++) await Promise.resolve();
      return messages.find(m => m.t === 'welcome')! as Extract<import('../shared/types').ServerMsg, { t: 'welcome' }>;
    };
    const teacher = await join('screen'), student = await join('player');
    rooms['rooms'].get(code)!.classroom = lesson().s;
    const request = async (token: string, format: 'csv' | 'md') => {
      const req = { method: 'GET', headers: { 'x-room-token': token }, resume() {} } as unknown as import('node:http').IncomingMessage;
      const res = { status: 0, headers: {} as Record<string, string>, body: '', writeHead(status: number, headers: Record<string, string>) { this.status = status; this.headers = headers; }, end(body: string) { this.body = body; } };
      expect(await handleEduRoute(req, res as unknown as import('node:http').ServerResponse, new URL(`http://fixture/api/room/${code}/grades.${format}`), rooms)).toBe(true);
      return res;
    };
    expect((await request(student.token, 'csv')).status).toBe(403);
    expect((await request('invalid', 'md')).status).toBe(403);
    const csv = await request(teacher.token, 'csv'); expect(csv.status).toBe(200);
    expect(csv.headers['Content-Disposition']).toContain(`gitzilla-${code}-grades.csv`);
    expect(csv.body).toContain('"student_id","student"'); expect(csv.body).toContain('"a","Alice"');
    const md = await request(teacher.token, 'md'); expect(md.status).toBe(200); expect(md.body).toContain('Unrecorded steps count 0');
  } finally { rooms.close(); wss.close(); }
});


describe('classroom email grade matching', () => {
  it('keeps emails private, survives restart, and exports with frozen scores after removal', () => {
    const { s } = lesson();
    s.setEmail('a', '  Alice@psu.edu  '); s.setEmail('b', 'bob@psu.edu');
    expect(s.privatePayload('a', false).emails).toEqual({ a: 'Alice@psu.edu' });
    expect(s.privatePayload('projector', false).emails).toEqual({});
    expect(s.privatePayload('teacher', true).emails).toEqual({ a: 'Alice@psu.edu', b: 'bob@psu.edu' });
    expect(JSON.stringify(s.publicState())).not.toContain('@psu.edu');
    s.control('start'); s.accept(s.begin('a', 'demo/repo'), source); s.review('a', 87, 'Reviewed'); s.control('attack');
    s.remove('a');
    const restored = ClassroomSession.restore(JSON.parse(JSON.stringify(s.save())));
    expect(JSON.stringify(restored.publicState())).not.toContain('@psu.edu');
    for (const format of ['csv', 'md'] as const) {
      const report = classroomExport(restored.publicState(), format, 'en', restored.exportEmails());
      const grades = gradesExport(restored.publicState(), format, restored.exportEmails());
      for (const text of [report, grades]) { expect(text).toContain('Alice@psu.edu'); expect(text).toContain('87'); }
      expect(grades).toContain('bob@psu.edu');
    }
    expect(ClassroomSession.restore(s.publicState()).exportEmails()).toEqual({});
  });
  it('rejects malformed addresses and unknown students without changing the saved email', () => {
    const { s } = lesson(); s.setEmail('a', 'alice@psu.edu');
    for (const email of ['', 'alice', 'a@psu', 'a b@psu.edu', 'a@psu.edu\nb@psu.edu', '=evil@psu.edu', 'a'.repeat(255) + '@psu.edu', null]) {
      expect(() => s.setEmail('a', email)).toThrow();
    }
    expect(() => s.setEmail('unknown', 'b@psu.edu')).toThrow('Join as a student first');
    expect(s.exportEmails().a).toBe('alice@psu.edu');
    s.setEmail('a', 'corrected@psu.edu'); expect(s.exportEmails().a).toBe('corrected@psu.edu');
  });
});
