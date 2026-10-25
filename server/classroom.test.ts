import { describe, it, expect } from 'vitest';
import { ClassroomSession, normalizeClassroomPlan } from './classroom';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { profileFromFiles } from '../analysis/graph';
import { classroomExport } from './classroom-export';
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
  it.each([1, 2, 4, 8, 30])('scales HP for %i students while keeping individual damage fixed', count => {
    const {s}=lesson();
    const students=Array.from({length:count},(_,i)=>({id:`s${i}`,name:`Student ${i}`,connected:true}));
    s.roster(students);
    expect(s.state.bossMaxHp).toBe(60 * count / 4);
    s.control('start');
    for(const student of students) s.accept(s.begin(student.id,'demo/repo'),source);
    s.control('attack');
    expect(s.state.rounds[0].attacks.every(a=>a.damage===25)).toBe(true);
    expect(s.state.bossHp / s.state.bossMaxHp).toBe(0);
  });
  it('updates the setup preview but locks HP through disconnects, late joins and restore',()=>{
    const {s,plan}=lesson();
    expect(s.state.bossMaxHp).toBe(30);
    s.remove('b'); expect(s.state.bossMaxHp).toBe(15);
    s.setPlan({...plan,steps:plan.steps.slice(0,2)}); expect(s.state.bossMaxHp).toBe(10);
    s.control('start'); s.accept(s.begin('a','demo/repo'),source);
    s.review('a',25,'Partial implementation'); s.control('attack');
    const hp=s.state.bossHp; expect(hp).toBe(3.7);
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
    expect(s.state.bossMaxHp).toBe(30); expect(s.state.bossHp).toBe(0); expect(s.valid(a)).toBe(false);
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
