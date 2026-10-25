import { afterAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { ClassroomSession } from './classroom';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { profileFromFiles } from '../analysis/graph';

const files = [{ path:'main.py', text:'answer = 42\n' }];
const source = { profile:profileFromFiles('classroom/budget-fixture',files), files, commit:'a'.repeat(40), checks:[] };
const measurements: { kind:string;size:number;steps:number;maxHp:number;hp:number[] }[] = [];
afterAll(()=>{ if(process.env.BUDGET_REPORT)writeFileSync(process.env.BUDGET_REPORT,JSON.stringify(measurements,null,2)+'\n'); });

function fixture(steps:number,size:number) {
  let now=1000;const plan=defaultClassroomPlan();
  plan.steps=Array.from({length:steps},(_,i)=>({...plan.steps[0],id:`step-${i}`,title:`Step ${i+1}`,durationSec:0,brief:undefined,checks:[],checksWeight:0}));
  const session=new ClassroomSession(plan,()=>now),students=Array.from({length:size},(_,i)=>({id:`s${i}`,name:`Student ${i}`,connected:true}));
  session.roster(students);session.control('start');
  const submit=(score:number,count=size)=>{for(const student of students.slice(0,count)){session.accept(session.begin(student.id,source.profile.slug),source);session.review(student.id,score,'Synthetic class score for deterministic balance regression.');}};
  const feedback=()=>{now+=10001;session.tick();expect(session.state.phase).toBe('feedback');};
  return {session,students,submit,feedback};
}

describe('lesson-long classroom HP budget',()=>{
  const matrix=[3,9].flatMap(steps=>[4,12,30].flatMap(size=>['typical','perfect','weak'].map(kind=>({steps,size,kind}))));
  it.each(matrix)('$steps steps / $size students / $kind class',({steps,size,kind})=>{
    const f=fixture(steps,size),hp:number[]=[],score=kind==='perfect'?100:kind==='typical'?70:35;
    const participants=kind==='perfect'?size:Math.floor(size*(kind==='typical'?0.8:0.5));
    for(let step=0;step<steps;step++){
      f.submit(score,participants);f.session.control('attack');hp.push(f.session.state.bossHp);
      const result=f.session.state.rounds.at(-1)!;
      expect(result.bossBefore-result.bossAfter).toBeCloseTo(result.attacks.reduce((sum,a)=>sum+a.damage,0));
      expect(result.attacks.every(a=>a.damage>=0)).toBe(true);
      const floor=f.session.state.bossMaxHp*(steps-step-1)/steps;
      expect(f.session.state.bossHp).toBeGreaterThanOrEqual(floor);
      if(step<steps-1){expect(f.session.state.bossHp).toBeGreaterThan(0);f.feedback();f.session.control('next');}
    }
    if(kind==='typical'&&f.session.state.bossHp>0){f.feedback();f.session.control('retry');f.submit(100,participants);f.session.control('attack');hp.push(f.session.state.bossHp);}
    if(kind==='typical'||kind==='perfect')expect(f.session.state.bossHp).toBe(0);else expect(f.session.state.bossHp).toBeGreaterThan(0);
    measurements.push({kind,size,steps,maxHp:f.session.state.bossMaxHp,hp});
  });
  it.each([3,9].flatMap(steps=>[4,12,30].map(size=>({steps,size}))))('pays the same for first and improvement points; unchanged retry cannot farm ($steps/$size)',({steps,size})=>{
    const f=fixture(steps,size);f.submit(20);f.session.control('attack');const first=f.session.state.rounds[0],damage=first.bossBefore-first.bossAfter;
    f.feedback();f.session.control('retry');f.submit(20);f.session.control('attack');expect(f.session.state.bossHp).toBe(first.bossAfter);expect(f.session.state.rounds[1].attacks.every(a=>a.damage===0)).toBe(true);
    f.feedback();f.session.control('retry');f.submit(40);f.session.control('attack');const improved=f.session.state.rounds[2];
    expect(improved.bossBefore-improved.bossAfter).toBeCloseTo(damage);expect(improved.attacks.some(a=>a.damage>0)).toBe(true);
  });
  it('normalizes late joiners by attack-time roster and carries unspent earlier slices forward',()=>{
    const f=fixture(3,4),initialHp=f.session.state.bossMaxHp;
    const late=Array.from({length:26},(_,i)=>({id:`late${i}`,name:'Late student',connected:true}));f.session.roster([...f.students,...late]);
    for(const student of [...f.students,...late]){f.session.accept(f.session.begin(student.id,source.profile.slug),source);f.session.review(student.id,20,'Synthetic low score.');}
    f.session.control('attack');expect(f.session.state.bossMaxHp).toBe(initialHp);expect(f.session.state.rounds[0].roster).toBe(30);
    expect(initialHp-f.session.state.bossHp).toBeCloseTo(7.4);
    f.feedback();f.session.control('next');f.submit(100); // Only4/30 participate, so this remains proportional.
    f.session.control('attack');expect(f.session.state.rounds[1].bossBefore-f.session.state.rounds[1].bossAfter).toBeCloseTo(4.9);
    const carry=fixture(3,4);carry.submit(20);carry.session.control('attack');carry.feedback();carry.session.control('next');carry.submit(100);carry.session.control('attack');
    expect(carry.session.state.rounds[1].bossBefore-carry.session.state.rounds[1].bossAfter).toBeGreaterThan(20);
    expect(carry.session.state.bossHp).toBe(20);
  });
  it('reconstructs credits and remaining slice budgets after restart without changing frozen rounds',()=>{
    const f=fixture(3,4);f.submit(20);f.session.control('attack');f.feedback();f.session.control('retry');
    const saved=JSON.parse(JSON.stringify(f.session.save())),restored=ClassroomSession.restore(saved);
    restored.roster(f.students);restored.control('resume');
    const submit=(score:number)=>{for(const s of f.students){restored.accept(restored.begin(s.id,source.profile.slug),source);restored.review(s.id,score,'Synthetic restart regression.');}};
    submit(20);restored.control('attack');expect(restored.state.bossHp).toBe(saved.bossHp);expect(restored.state.rounds[1].attacks.every(a=>a.damage===0)).toBe(true);
    const after=ClassroomSession.restore(JSON.parse(JSON.stringify(restored.save())));after.control('retry');
    for(const s of f.students){after.accept(after.begin(s.id,source.profile.slug),source);after.review(s.id,40,'Improved since last attempt.');}after.control('attack');
    expect(after.state.rounds[2].bossBefore-after.state.rounds[2].bossAfter).toBeCloseTo(7.4);expect(after.state.rounds[0]).toEqual(saved.rounds[0]);
    const broken=JSON.parse(JSON.stringify(saved));broken.bossHp=0;
    const legacy=ClassroomSession.restore(broken);expect(legacy.state.bossHp).toBe(40);expect(legacy.state.rounds).toEqual(broken.rounds);
  });
});
