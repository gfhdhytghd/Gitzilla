import { describe, expect, it } from 'vitest';
import type { ClassroomState } from '../shared/classroom';
import { pythonClassroomPlan } from '../shared/classroom-presets';
import { assertClassroomRound } from './playtest-edu';

function feedback(): ClassroomState {
  const plan = pythonClassroomPlan('01-hello', 'en');
  return { plan, phase: 'feedback', stepIndex: 0, attempt: 1, deadline: null, remainingMs: null,
    serverTime: 0, raidEndsAt: null, bossHp: 40, bossMaxHp: 60,
    rows: ['one', 'two'].map(id => ({ id, name: id, connected: true, status: 'submitted', improvement: 0, damage: 10, totalDamage: 10, attempts: 1 })),
    rounds: [{ stepId: plan.steps[0].id, attempt: 1, at: 0, bossBefore: 60, bossAfter: 40,
      attacks: ['one', 'two'].map(id => ({ id, name: id, score: 100, improvement: 0, damage: 10, commit: 'inapp:12345678' })) }],
  };
}
describe('cooperative classroom acceptance', () => {
  it('accepts the natural first-round debrief with surviving damaged boss and all students', () => {
    expect(() => assertClassroomRound(feedback(), 2)).not.toThrow();
  });
  it.each([0, 60, NaN])('rejects invalid first-round remaining HP %s', hp => {
    const state = feedback(); state.bossHp = state.rounds[0].bossAfter = hp;
    expect(() => assertClassroomRound(state, 2)).toThrow('decrease boss HP');
  });
  it('rejects feedback/state HP disagreement', () => {
    const state = feedback(); state.bossHp = 39;
    expect(() => assertClassroomRound(state, 2)).toThrow('decrease boss HP');
  });
  it('rejects a timed raid or a skipped first round', () => {
    const state = feedback(); state.phase = 'raid';
    expect(() => assertClassroomRound(state, 2)).toThrow('first round feedback');
    state.phase = 'feedback'; state.stepIndex = 1;
    expect(() => assertClassroomRound(state, 2)).toThrow('first round feedback');
  });
  it('rejects missing participants and ungraded submissions', () => {
    const state = feedback(); state.rounds[0].attacks.pop();
    expect(() => assertClassroomRound(state, 2)).toThrow('Every requested student');
    const ungraded = feedback(); ungraded.rows[0].status = 'queued';
    expect(() => assertClassroomRound(ungraded, 2)).toThrow('Every requested student');
  });
});
