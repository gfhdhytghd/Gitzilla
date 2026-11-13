import { describe, expect, it } from 'vitest';
import { defaultClassroomPlan } from './classroom-defaults';
import { mergeClassroomPacket, type ClassroomPacket } from './classroom-delta';

const full = (): ClassroomPacket => ({t:'classroom',state:{plan:defaultClassroomPlan(),phase:'coding',stepIndex:0,attempt:1,
  deadline:null,remainingMs:null,serverTime:1,raidEndsAt:null,bossHp:10,bossMaxHp:20,rows:[],
  rounds:[{stepId:'s',attempt:1,at:1,bossBefore:20,bossAfter:10,attacks:[]}]},
  reports:{student:{stepId:'s',attempt:1,repo:'in-app',commit:'a',submittedAt:1,score:50,improvement:0,checks:[],criteria:[],advice:[]}}});

describe('opt-in classroom delta merge',()=>{
  it('retains unchanged history, patches reports and advances ordinary state without mutating the prior frame',()=>{
    const before=full(), changed={...before.reports.student,score:75};
    const delta:ClassroomPacket={...full(),state:{...before.state,serverTime:2,rounds:[],plan:{title:'',bossName:'',steps:[]}},reports:{student:changed},
      delta:{planUnchanged:true,roundsUnchanged:true,reports:true,removedReports:[]}};
    const merged=mergeClassroomPacket(before,delta);
    expect(merged.state.rounds).toEqual(before.state.rounds);
    expect(merged.state.plan).toEqual(before.state.plan);expect(merged.state.serverTime).toBe(2);expect(merged.reports.student.score).toBe(75);
    expect(before.reports.student.score).toBe(50);expect(delta.state.rounds).toEqual([]);
    expect(merged.delta).toBeUndefined();
  });
  it('removes reports on retry and replaces history when the server supplies new rounds',()=>{
    const before=full();
    const delta:ClassroomPacket={...full(),state:{...before.state,attempt:2,rounds:[]},reports:{},
      delta:{reports:true,removedReports:['student']}};
    const merged=mergeClassroomPacket(before,delta);
    expect(merged.state.rounds).toEqual([]);expect(merged.reports).toEqual({});
    expect(merged.state.attempt).toBe(2);expect(before.reports.student).toBeDefined();
  });
  it('requires a full initial frame and accepts a new full snapshot after reconnect',()=>{
    const initial=full();
    expect(mergeClassroomPacket(undefined,initial)).toBe(initial);
    expect(()=>mergeClassroomPacket(undefined,{...initial,delta:{reports:true,removedReports:[]}})).toThrow('initial full');
    const replacement={...initial,reports:{}};
    expect(mergeClassroomPacket(initial,replacement).reports).toEqual({});
  });
});
