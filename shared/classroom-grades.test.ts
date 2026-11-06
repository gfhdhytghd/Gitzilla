import { expect, it } from 'vitest';
import { lessonGrades } from './classroom-grades';
import { defaultClassroomPlan } from './classroom-defaults';
import { ClassroomSession } from '../server/classroom';
import { gradesExport } from '../server/classroom-export';

it('uses latest rounds across retries, stable ties, missing and kicked students, and unrecorded steps', () => {
  const state = new ClassroomSession(defaultClassroomPlan()).state;
  state.plan.steps = state.plan.steps.slice(0, 3);
  state.rows = [{ id: 'missing', name: 'Absent', connected: true, status: 'empty', improvement: 0, damage: 0, totalDamage: 0, attempts: 0 }];
  const attack = (id: string, name: string, score: number) => ({ id, name, score, improvement: 0, damage: 0, commit: 'sha' });
  const stepId = state.plan.steps[0].id;
  state.rounds = [
    { stepId, at: 20, attempt: 2, bossBefore: 100, bossAfter: 80, attacks: [attack('a', 'Old name', 30)] },
    { stepId, at: 10, attempt: 1, bossBefore: 100, bossAfter: 80, attacks: [attack('a', 'Older', 100), attack('k', 'Kicked', 45.25)] },
    { stepId, at: 20, attempt: 3, bossBefore: 100, bossAfter: 80, attacks: [attack('a', 'Zoe', 80.25)] },
    { stepId: state.plan.steps[1].id, at: 30, attempt: 1, bossBefore: 80, bossAfter: 70, attacks: [attack('a', 'Zoe', 20)] },
  ];
  const before = structuredClone(state), grades = lessonGrades(state);
  expect(state).toEqual(before);
  expect(grades.steps.map(s => s.recorded)).toEqual([true, true, false]);
  expect(grades.students).toEqual([
    { id: 'missing', name: 'Absent', steps: [null, null, null], total: 0, max: 300, average: 0 },
    { id: 'k', name: 'Kicked', steps: [45.25, null, null], total: 45.3, max: 300, average: 15.1 },
    { id: 'a', name: 'Zoe', steps: [80.25, 20, null], total: 100.3, max: 300, average: 33.4 },
  ]);
  state.plan.steps[0].title = 'A,"quoted" | step';
  const csv = gradesExport(state, 'csv'), md = gradesExport(state, 'md');
  expect(csv).toContain('"A,""quoted"" | step"'); expect(csv).toContain(' (not recorded)');
  expect(csv).toContain('"missing","Absent","","","","","0","300","0"');
  expect(md).toContain('launch the class attack'); expect(md).toContain('Unrecorded steps count 0'); expect(md).toContain('\\| step');
});
