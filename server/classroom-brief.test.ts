import { describe, expect, it } from 'vitest';
import type { StepBrief } from '../shared/classroom';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { profileFromFiles } from '../analysis/graph';
import { ClassroomSession, normalizeClassroomPlan } from './classroom';

function fixture() {
  const plan = defaultClassroomPlan(); plan.steps = [plan.steps[0]];
  plan.steps[0].checks = [
    { id: 'docs', kind: 'file', path: 'README.md', label: 'Documentation' },
    { id: 'answer', kind: 'contains', path: 'main.py', text: 'answer = 42', label: 'Answer' },
    { id: 'ci', kind: 'ci', path: 'python-tests', label: 'Tests' },
  ];
  plan.steps[0].brief = { goal: 'Print an answer.', todo: ['Open `main.py`.', 'Write your answer.'], doneWhen: ['A README exists.', 'Your file assigns 42.', 'The tests pass.'],
    example: { title: 'Expected output', output: '  42\n' }, hints: ['Use a variable.'], concepts: ['assignment', 'print()'] };
  return plan;
}

describe('classroom brief normalization and positional check feedback', () => {
  it('round-trips detached briefs through public state, JSON persistence and restore', () => {
    const plan = fixture(), expected = structuredClone(plan.steps[0].brief);
    const normalized = normalizeClassroomPlan(plan);
    plan.steps[0].brief!.todo[0] = 'Changed after publication'; plan.steps[0].brief!.example!.output = 'Changed';
    expect(normalized.steps[0].brief).toEqual(expected);
    const session = new ClassroomSession(normalized);
    expect(session.publicState().plan.steps[0].brief).toEqual(expected);
    const restored = ClassroomSession.restore(JSON.parse(JSON.stringify(session.save())));
    expect(restored.publicState().plan.steps[0].brief).toEqual(expected);
    expect(restored.state.plan.steps[0].brief!.example!.output).toBe('  42\n');
  });
  it('accepts exact maxima and optional empty lists/output, preserving doneWhen order', () => {
    const plan = fixture(), brief = plan.steps[0].brief!;
    brief.goal = 'g'.repeat(160); brief.todo = Array(8).fill('t'.repeat(160)); brief.doneWhen = Array.from({ length: 12 }, (_, i) => `Check ${i}`);
    plan.steps[0].checks = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, kind: 'file', path: `file${i}.py`, label: `File ${i}` }));
    brief.example!.output = 'x'.repeat(2000); brief.hints = Array(5).fill('Hint'); brief.concepts = Array(6).fill('Concept');
    expect(normalizeClassroomPlan(plan).steps[0].brief).toEqual(brief);
    plan.steps[0].checks = []; brief.doneWhen = []; brief.hints = []; brief.concepts = []; brief.example!.output = '';
    expect(normalizeClassroomPlan(plan).steps[0].brief).toEqual(brief);
    delete plan.steps[0].brief;
    expect(normalizeClassroomPlan(plan).steps[0]).not.toHaveProperty('brief');
  });
  it.each([
    ['goal', 42], ['goal', 'g'.repeat(161)], ['todo', []], ['todo', Array(9).fill('Action')], ['todo', ['t'.repeat(161)]], ['todo', [{}]],
    ['doneWhen', ['Only one row']], ['doneWhen', ['a', 'b', 3]], ['doneWhen', Array(13).fill('Check')],
    ['example', { output: 'x'.repeat(2001) }], ['example', { output: 42 }], ['example', { output: 'ok', title: {} }],
    ['hints', Array(6).fill('Hint')], ['hints', [null]], ['concepts', Array(7).fill('Concept')], ['concepts', [[]]],
  ])('rejects invalid brief %s data', (field, value) => {
    const plan = fixture(); Object.assign(plan.steps[0].brief!, { [field as string]: value });
    expect(() => normalizeClassroomPlan(plan)).toThrow(/brief/i);
  });
  it.each([null, [], 'Goal text'])('rejects non-object brief %j', value => {
    const plan = fixture(); plan.steps[0].brief = value as unknown as StepBrief;
    expect(() => normalizeClassroomPlan(plan)).toThrow('brief');
  });
  it('pairs each doneWhen row with the original check result, without sorting passes ahead of failures', () => {
    const plan = fixture(), session = new ClassroomSession(plan);
    session.roster([{ id: 'student', name: 'Alice', connected: true }]); session.control('start');
    const files = [{ path: 'main.py', text: 'answer = 42\n' }];
    session.accept(session.begin('student', 'demo/repo'), { profile: profileFromFiles('demo/repo', files), files, commit: 'a'.repeat(40),
      checks: [{ name: 'unrelated', status: 'completed', conclusion: 'failure' }, { name: 'python-tests', status: 'completed', conclusion: 'success' }] });
    const student = session.privatePayload('student', false).reports.student;
    expect(student.checks.map(check => check.label)).toEqual(['Documentation', 'Answer', 'Tests']);
    expect(student.checks.map(check => check.passed)).toEqual([false, true, true]);
    expect(session.publicState().plan.steps[0].brief!.doneWhen.map((text, i) => [text, student.checks[i].passed])).toEqual([
      ['A README exists.', false], ['Your file assigns 42.', true], ['The tests pass.', true],
    ]);
    expect(session.privatePayload('teacher', true).reports.student.checks).toEqual(student.checks);
  });
});
