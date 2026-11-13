import { describe, expect, it } from 'vitest';
import { ClassroomSession, normalizeClassroomPlan } from './classroom';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import type { ClassroomPlan } from '../shared/classroom';

export function questionPlan(): ClassroomPlan {
  const plan = defaultClassroomPlan();
  plan.steps = [{ ...plan.steps[0], mode: 'questions', questions: [
    { id: 'single', kind: 'single', prompt: 'Pick one', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], answer: 'a', explain: 'KEY_EXPLANATION' },
    { id: 'multi', kind: 'multi', prompt: 'Pick several', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], answer: ['a', 'b'] },
    { id: 'blank', kind: 'blank', prompt: 'Fill {{1}}', blanks: [{ accept: ['SECRET_ACCEPT'] }] },
  ] }];
  return plan;
}

describe('question plan regression', () => {
  it('preserves and normalizes question sets', () => {
    expect(normalizeClassroomPlan(questionPlan()).steps[0]).toMatchObject({ mode: 'questions', answerFeedback: 'after-close', revealAnswers: 'after-raid', questions: [{ points: 1, maxAttempts: 3 }, { scoring: 'partial' }, { kind: 'blank' }] });
  });
  it('ignores code fields on questions-only steps', () => {
    const plan = questionPlan();
    Object.assign(plan.steps[0], { rubric: {}, checks: null, checksWeight: null, starter: [] });
    expect(() => new ClassroomSession(plan)).not.toThrow();
  });
});

import { gradeQuestion, normalizeQuestions, normalizeQuestionAnswer, questionSetScore, stepScore, studentPlan } from './classroom-questions';
import { profileFromFiles } from '../analysis/graph';
import { classroomExport, gradesExport } from './classroom-export';
import { lessonGrades } from '../shared/classroom-grades';
import type { ClassroomQuestion, QuestionAnswer, ClassroomStep, SingleChoiceQuestion, MultiChoiceQuestion } from '../shared/classroom';

const single = () => questionPlan().steps[0].questions![0] as SingleChoiceQuestion;
const multi = () => questionPlan().steps[0].questions![1] as MultiChoiceQuestion;
const blank = (): ClassroomQuestion => ({ id: 'fill', kind: 'blank', prompt: '{{1}} {{2}}', blanks: [{ accept: [' Hello   world ', 'hi'] }, { accept: ['Python'], caseSensitive: true }] });
function session(plan = questionPlan()) {
  let now = 1000;
  const s = new ClassroomSession(plan, () => now);
  s.roster(['a', 'b', 'c'].map(id => ({ id, name: id, connected: true })));
  s.control('start');
  return { s, advance: (ms = 1000) => { now += ms; }, save: (answers: Record<string, QuestionAnswer>, who = 'a') => s.saveAnswers(who, s.state.plan.steps[s.state.stepIndex].id, s.state.attempt, answers), report: (teacher = true, who = 'a') => s.privatePayload(who, teacher).reports[who] };
}
function codeSource(pass = true) {
  const files = pass ? [{ path: 'README.md', text: 'yes' }] : [];
  return { profile: profileFromFiles('demo/repo', files), commit: (pass ? 'a' : 'b').repeat(40), files, checks: [] };
}
function mixedPlan() {
  const plan = questionPlan();
  Object.assign(plan.steps[0], { mode: 'mixed', durationSec: 0, checksWeight: 100, checks: [{ id: 'readme', kind: 'file', path: 'README.md', label: 'README' }] });
  return plan;
}

describe('question validation limits', () => {
  it('accepts limits and unique ids scoped per step', () => {
    const plan = questionPlan();
    plan.steps[0].questions = Array.from({ length: 30 }, (_, i) => ({ ...single(), id: `q-${i}`, points: 100, maxAttempts: 10, prompt: 'p'.repeat(2000), explain: 'e'.repeat(1000), options: Array.from({ length: 8 }, (_, j) => ({ id: String.fromCharCode(97 + j).repeat(16), text: 'o'.repeat(300) })), answer: 'a'.repeat(16) }));
    plan.steps.push({ ...plan.steps[0], id: 'another' });
    expect(normalizeClassroomPlan(plan).steps[0].questions).toHaveLength(30);
    expect(normalizeQuestions([{ ...blank(), prompt: Array.from({ length: 6 }, (_, i) => `{{${i + 1}}}`).join(''), blanks: Array.from({ length: 6 }, () => ({ accept: Array.from({ length: 10 }, () => 'a'.repeat(200)) })) }])).toHaveLength(1);
  });
  const bad: [string, (q: any) => void][] = [
    ['empty id', q => q.id = ''], ['long id', q => q.id = 'x'.repeat(33)], ['bad id', q => q.id = 'Bad!'],
    ['empty prompt', q => q.prompt = ' '], ['long prompt', q => q.prompt = 'x'.repeat(2001)],
    ['low points', q => q.points = 0], ['high points', q => q.points = 101], ['fractional points', q => q.points = 1.5], ['NaN points', q => q.points = NaN], ['null points', q => q.points = null],
    ['low attempts', q => q.maxAttempts = 0], ['high attempts', q => q.maxAttempts = 11], ['fractional attempts', q => q.maxAttempts = 1.5], ['null attempts', q => q.maxAttempts = null],
    ['long explain', q => q.explain = 'x'.repeat(1001)], ['bad explain', q => q.explain = 4],
    ['few options', q => q.options = q.options.slice(0, 1)], ['many options', q => q.options = Array(9).fill(q.options[0])],
    ['duplicate options', q => q.options[1].id = 'a'], ['long option id', q => q.options[0].id = 'x'.repeat(17)],
    ['bad option id', q => q.options[0].id = 'A'], ['long option text', q => q.options[0].text = 'x'.repeat(301)], ['empty option text', q => q.options[0].text = ''],
    ['unknown key', q => q.answer = 'z'], ['array single key', q => q.answer = ['a']], ['invalid kind', q => q.kind = 'essay'],
  ];
  it.each(bad)('rejects %s', (_, mutate) => {
    const q = structuredClone(single()); mutate(q); expect(() => normalizeQuestions([q])).toThrow();
  });
  it.each([[], Array(31).fill(single()), null, [null], [single(), single()]])('rejects invalid set %j', value => expect(() => normalizeQuestions(value)).toThrow());
  it.each([[], ['z'], ['a', 'a'], 'a', null])('rejects invalid multi key %j', answer => expect(() => normalizeQuestions([{ ...multi(), answer }])).toThrow());
  it('accepts integer point bounds and rejects invalid multi scoring', () => {
    expect(normalizeQuestions([{ ...single(), points: 1 }])[0].points).toBe(1);
    expect(normalizeQuestions([{ ...single(), points: 100 }])[0].points).toBe(100);
    expect(() => normalizeQuestions([{ ...multi(), scoring: 'other' }])).toThrow();
  });
  it.each([
    { prompt: '{{2}} {{1}}' }, { prompt: '{{1}}' }, { prompt: '{{1}} {{1}}' }, { prompt: '{{0}} {{2}}' }, { prompt: '{{01}} {{2}}' },
    { blanks: [] }, { blanks: Array(7).fill({ accept: ['a'] }) }, { blanks: [{ accept: [] }, { accept: ['a'] }] },
    { blanks: [{ accept: Array(11).fill('a') }, { accept: ['a'] }] }, { blanks: [{ accept: ['a'.repeat(201)] }, { accept: ['a'] }] },
    { blanks: [{ accept: [' '] }, { accept: ['a'] }] }, { blanks: [{ accept: ['a'], caseSensitive: 'yes' }, { accept: ['a'] }] },
    { blanks: [{ accept: ['a'], numeric: { value: Infinity, tolerance: 0 } }, { accept: ['a'] }] },
    { blanks: [{ accept: ['a'], numeric: { value: 1, tolerance: -1 } }, { accept: ['a'] }] },
    { blanks: [{ accept: ['a'], numeric: { value: 1, tolerance: NaN } }, { accept: ['a'] }] },
  ])('rejects blank constraints %j', change => expect(() => normalizeQuestions([{ ...blank(), ...change }])).toThrow());
  it.each([{ mode: 'essay' }, { mode: null }, { answerFeedback: 'later' }, { answerFeedback: null }, { revealAnswers: 'always' }, { questionsWeight: -1 }, { questionsWeight: 101 }, { questionsWeight: NaN }])('rejects step settings %j', change => {
    const plan = questionPlan(); Object.assign(plan.steps[0], change); expect(() => normalizeClassroomPlan(plan)).toThrow();
  });
  it('keeps legacy code defaults and mixed defaults', () => {
    expect(normalizeClassroomPlan(defaultClassroomPlan()).steps[0].mode ?? 'code').toBe('code');
    expect(normalizeClassroomPlan(mixedPlan()).steps[0].questionsWeight).toBe(50);
  });
});

describe('question scoring', () => {
  it.each([['a', 1], ['b', 0]])('scores single %s', (choice, score) => expect(gradeQuestion(single(), { choice })).toEqual({ score, correct: score === 1 }));
  it.each([[['a', 'b'], 1], [['a'], .5], [['a', 'c'], 0], [['a', 'b', 'c'], .5], [['c'], 0], [[], 0]])('scores partial multi %j', (choices, score) => expect(gradeQuestion(multi(), { choices })).toMatchObject({ score }));
  it.each([[['b', 'a'], 1], [['a'], 0], [['a', 'b', 'c'], 0], [[], 0]])('scores exact multi %j', (choices, score) => expect(gradeQuestion({ ...multi(), scoring: 'exact' } as ClassroomQuestion, { choices })).toMatchObject({ score }));
  it('grades blank shares, whitespace, alternatives and case', () => {
    expect(gradeQuestion(blank(), { blanks: [' HELLO\n\tworld ', 'python'] })).toEqual({ score: .5, correct: false, blankCorrect: [true, false] });
    expect(gradeQuestion(blank(), { blanks: ['HI', 'Python'] }).score).toBe(1);
    expect(gradeQuestion(blank(), { blanks: ['hi'] }).score).toBe(.5);
  });
  const numeric = (tolerance = .1): ClassroomQuestion => ({ id: 'num', kind: 'blank', prompt: '{{1}}', blanks: [{ accept: ['2'], numeric: { value: 2, tolerance } }] });
  it.each(['2', ' 2.0 ', '+2.', '2.1', '1.9', '02.00'])('accepts decimal %s', value => expect(gradeQuestion(numeric(), { blanks: [value] }).correct).toBe(true));
  it.each(['2.10001', '1,999', '2e0', '0x2', 'Infinity', '', ' ', 'two', '2 0', '2_0'])('rejects decimal %s', value => expect(gradeQuestion(numeric(), { blanks: [value] }).correct).toBe(false));
  it('zero tolerance requires equality', () => {
    expect(gradeQuestion(numeric(0), { blanks: ['2'] }).correct).toBe(true);
    expect(gradeQuestion(numeric(0), { blanks: ['2.000000000000001'] }).correct).toBe(false);
  });
  it('weights unanswered questions as zero and rounds to tenths', () => {
    const step = questionPlan().steps[0]; step.questions![0].points = 2;
    expect(questionSetScore(step, { single: { answer: { choice: 'a' }, attempts: 1, score: 1 } })).toBe(50);
    step.questions![0].points = 1;
    expect(questionSetScore(step, { single: { answer: { choice: 'a' }, attempts: 1, score: 1 } })).toBe(33.3);
    expect(stepScore({ ...step, mode: 'mixed', questionsWeight: 25 }, 80, 20)).toBe(65);
    expect(stepScore({ ...step, mode: 'mixed' }, undefined, 100)).toBe(50);
    expect(stepScore({ ...step, mode: 'mixed', questionsWeight: 0 }, 80, 100)).toBe(80);
    expect(stepScore({ ...step, mode: 'mixed', questionsWeight: 100 }, 80, 20)).toBe(20);
  });
  it.each([{ choice: 'z' }, { choices: [] }, { choice: 'a', blanks: [] }, null])('rejects wrong answer shape %j', answer => expect(() => normalizeQuestionAnswer(single(), answer)).toThrow());
  it('rejects duplicate/unknown picks and oversized blanks', () => {
    for (const choices of [['a', 'a'], ['z']]) expect(() => normalizeQuestionAnswer(multi(), { choices })).toThrow();
    for (const blanks of [['x'.repeat(201)], ['a', 'b', 'c']]) expect(() => normalizeQuestionAnswer(blank(), { blanks })).toThrow();
  });
});

describe('answer saves, immediate feedback and raids', () => {
  it('merges partial saves, hides after-close feedback and supports clearing', () => {
    const f = session(); f.save({ single: { choice: 'a' } });
    expect(f.s.state.rows[0]).toMatchObject({ status: 'submitted', score: 33.3 });
    expect(f.report(false)).toMatchObject({ answers: { single: { answer: { choice: 'a' }, attempts: 1 } } });
    expect(f.report(false).answers!.single.score).toBeUndefined();
    expect(f.s.publicState('student').rows[0].score).toBeUndefined();
    f.advance(); f.save({ multi: { choices: ['a'] } }); expect(f.report().questionScore).toBe(50);
    f.advance(); f.save({ single: { choice: 'b' } }); expect(f.report().questionScore).toBe(16.7);
    f.advance(); f.save({ single: { choice: '' } }); expect(f.report().answers!.single).toBeUndefined();
  });
  it('ignores unanswered controls without spending an attempt or submitting a row', () => {
    const plan = questionPlan(); plan.steps[0].answerFeedback = 'immediate'; const f = session(plan);
    f.save({ single: { choice: '' }, multi: { choices: [] }, blank: { blanks: [' '] } });
    expect(f.s.state.rows[0].status).toBe('empty'); expect(f.report()).toBeUndefined();
  });
  it('validates a save atomically', () => {
    const f = session(); expect(() => f.save({ single: { choice: 'a' }, multi: { choices: ['z'] } })).toThrow();
    expect(f.report()).toBeUndefined(); f.save({ single: { choice: 'a' } }); expect(f.report().questionScore).toBe(33.3);
  });
  it('limits by student, time and attempt, resetting on retry', () => {
    const f = session(); f.save({ single: { choice: 'a' } }); expect(() => f.save({})).toThrow('1 second');
    f.save({ single: { choice: 'b' } }, 'b');
    for (let i = 1; i < 200; i++) { f.advance(); f.save({ single: { choice: 'b' } }); }
    f.advance(); expect(() => f.save({})).toThrow('save limit');
    f.s.control('attack'); f.advance(10001); f.s.tick(); f.s.control('retry');
    expect(() => f.save({ single: { choice: 'a' } })).not.toThrow();
  });
  it('rejects stale identity, phase and wrong mode', () => {
    const f = session(); expect(() => f.s.saveAnswers('a', 'old', 1, {})).toThrow('Stale');
    expect(() => f.s.saveAnswers('a', f.s.state.plan.steps[0].id, 2, {})).toThrow('Stale');
    expect(() => f.save({}, 'stranger')).toThrow('Join');
    expect(() => f.save({ unknown: { choice: 'a' } })).toThrow('Unknown');
    f.s.control('pause'); expect(() => f.save({})).toThrow('coding');
    const code = session(defaultClassroomPlan()); expect(() => code.save({})).toThrow('no question');
    expect(() => f.s.begin('a', 'repo')).toThrow('coding'); f.s.control('resume'); expect(() => f.s.begin('a', 'repo')).toThrow('answers only');
  });
  it('immediate locks correct answers and exhausted questions independently', () => {
    const plan = questionPlan(); plan.steps[0].answerFeedback = 'immediate'; plan.steps[0].questions![1].maxAttempts = 2;
    const f = session(plan); f.save({ single: { choice: 'a' }, multi: { choices: ['a'] } });
    expect(f.report(false).answers!.single).toMatchObject({ correct: true, locked: true, attempts: 1, key: { choice: 'a' }, explain: 'KEY_EXPLANATION' });
    expect(f.report(false).answers!.multi).toMatchObject({ score: .5, locked: false, attempts: 1 });
    expect(f.report(false).answers!.multi.key).toBeUndefined();
    f.advance(); f.save({ single: { choice: 'b' }, multi: { choices: ['c'] } });
    expect(f.report().answers!.single.attempts).toBe(1);
    expect(f.report(false).answers!.multi).toMatchObject({ attempts: 2, locked: true, correct: false, key: { choices: ['a', 'b'] } });
    f.advance(); f.save({ multi: { choices: ['a', 'b'] } }); expect(f.report().answers!.multi.score).toBe(0);
    expect(f.s.publicState('student').plan.steps[0].questions![0]).not.toHaveProperty('answer');
    expect(f.s.privatePayload('b', false).reports).toEqual({});
  });
  it('never reveals keys or per-question correctness in exam mode', () => {
    const plan = questionPlan(); Object.assign(plan.steps[0], { answerFeedback: 'immediate', revealAnswers: 'never' }); const f = session(plan);
    f.save({ single: { choice: 'a' } }); f.s.control('attack'); f.advance(10001); f.s.tick(); f.s.control('next');
    expect(f.report(false).score).toBe(33.3);
    for (const property of ['correct', 'score', 'key', 'explain', 'locked']) expect(f.report(false).answers!.single).not.toHaveProperty(property);
    expect(f.s.publicState('student').plan.steps[0].questions![0]).not.toHaveProperty('answer');
    expect(f.s.publicState('student').rounds[0].questionStats![0]).toEqual({ id: 'single', answered: 1, correct: 0, total: 3 });
  });
  it('blends both arrival orders and preserves new answers across queued code success/failure', () => {
    const f = session(mixedPlan()); f.save({ single: { choice: 'a' } }); expect(f.report().score).toBe(16.7);
    const ticket = f.s.begin('a', 'demo/repo'); f.advance(); f.save({ multi: { choices: ['a', 'b'] } });
    expect(() => f.s.control('attack')).toThrow('queued'); f.s.accept(ticket, codeSource());
    expect(f.report()).toMatchObject({ codeScore: 100, questionScore: 66.7, score: 83.4 });
    f.advance(5000); const retry = f.s.begin('a', 'other/repo'); f.save({ blank: { blanks: ['SECRET_ACCEPT'] } }); f.s.fail(retry, 'error');
    expect(f.report()).toMatchObject({ codeScore: 100, questionScore: 100, score: 100 });
    f.s.accept(f.s.begin('b', 'demo/repo'), codeSource()); expect(f.report(true, 'b').score).toBe(50);
    f.save({ single: { choice: 'a' } }, 'b'); expect(f.report(true, 'b').score).toBe(66.7);
    f.s.review('b', 40, 'Code review'); expect(f.report(true, 'b').score).toBe(36.7);
  });
  it('keeps answers submitted if their first queued code submission fails', () => {
    const f = session(mixedPlan()); const ticket = f.s.begin('a', 'repo'); f.save({ single: { choice: 'a' } }); f.s.fail(ticket, 'error');
    expect(f.s.state.rows[0].status).toBe('submitted'); expect(f.report().score).toBe(16.7);
  });
  it('updates the code review blend without overwriting question grades', () => {
    const plan = mixedPlan(); plan.grading = { automaticWeight: 50, checklist: ['Check code'] }; const f = session(plan);
    f.save({ single: { choice: 'a' } }); f.s.accept(f.s.begin('a', 'repo'), codeSource()); f.s.review('a', 20, 'Code only');
    expect(f.report()).toMatchObject({ codeScore: 60, questionScore: 33.3, score: 46.7, reviewPending: false });
    f.advance(); f.save({ multi: { choices: ['a', 'b'] } }); expect(f.report().score).toBe(63.4);
  });
  it('freezes anonymous stats and uses blended scores for retry credits and improvement', () => {
    const f = session(mixedPlan());
    f.save({ single: { choice: 'a' } }); f.s.accept(f.s.begin('a', 'repo'), codeSource(false)); f.s.control('attack');
    const frozen = structuredClone(f.s.state.rounds[0]); expect(frozen.questionStats![0]).toMatchObject({ answered: 1, correct: 1, total: 3 });
    expect(f.s.publicState('student').rounds[0].questionStats![0].options).toBeUndefined();
    f.advance(10001); f.s.tick(); expect(f.s.publicState('student').rounds[0].questionStats).toEqual(frozen.questionStats);
    expect(f.report(false).answers!.single.key).toEqual({ choice: 'a' });
    f.s.control('retry'); f.save({ single: { choice: 'a' } }); f.s.accept(f.s.begin('a', 'repo'), codeSource(false)); f.s.control('attack');
    expect(f.s.state.rounds[1].attacks[0]).toMatchObject({ improvement: 0, damage: 0 });
    f.advance(10001); f.s.tick(); f.s.control('retry'); f.save({ single: { choice: 'a' }, multi: { choices: ['a', 'b'] } }); f.s.control('attack');
    expect(f.s.state.rounds[2].attacks[0].improvement).toBe(16.7); expect(f.s.state.rounds[2].attacks[0].damage).toBeGreaterThan(0);
    f.s.kick('a'); expect(f.s.state.rounds[0]).toEqual(frozen);
  });
  it('persists plans and frozen numeric export evidence, but never saves live answers', () => {
    const f = session(); f.save({ single: { choice: 'a' } });
    const saved = JSON.parse(JSON.stringify(f.s.save())); expect(saved.reports).toBeUndefined();
    const restored = ClassroomSession.restore(saved); expect(restored.state.plan.steps[0].questions).toEqual(f.s.state.plan.steps[0].questions);
    expect(restored.privatePayload('a', true).reports).toEqual({}); expect(restored.state.phase).toBe('paused');
    f.s.control('attack'); const csv = classroomExport(f.s.publicState('teacher'), 'csv'), grades = gradesExport(f.s.publicState('teacher'), 'csv');
    const again = ClassroomSession.restore(JSON.parse(JSON.stringify(f.s.save())));
    expect(classroomExport(again.publicState('teacher'), 'csv')).toBe(csv); expect(gradesExport(again.publicState('teacher'), 'csv')).toBe(grades);
    expect(csv).toContain('"s1-single","s1-multi","s1-blank"'); expect(csv).not.toContain('SECRET_ACCEPT');
    expect(grades).toContain('"s1-questions"'); expect(lessonGrades(again.publicState('teacher')).students.find(s => s.id === 'a')?.parts).toEqual([{ code: null, questions: 33.3 }]);
  });
  it('redacts every unrevealed step without mutating the teacher plan', () => {
    const plan = questionPlan(); plan.steps.push({ ...structuredClone(plan.steps[0]), id: 'second' });
    const before = structuredClone(plan), safe = studentPlan(plan, 1);
    expect(plan).toEqual(before); expect(safe.steps[0].questions![0]).not.toHaveProperty('answer'); expect(safe.steps[0].questions![2]).toMatchObject({ blankCount: 1 });
    expect(safe.steps[1].questions![0]).toHaveProperty('answer', 'a');
  });
});

it('exports zero for missing mixed parts, blank for unanswered questions, and latest retry parts', () => {
  const f = session(mixedPlan());
  f.save({ single: { choice: 'b' } }); f.s.control('attack');
  const read = (csv: string) => {
    const rows = csv.trimEnd().split('\r\n').map(line => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(m => m[1].replaceAll('""', '"')));
    const header = rows.shift()!; return rows.map(cells => Object.fromEntries(header.map((h, i) => [h, cells[i]])));
  };
  const first = read(classroomExport(f.s.publicState('teacher'), 'csv')).find(r => r.row_type === 'attack')!;
  expect(first).toMatchObject({ 's1-single': '0', 's1-multi': '', 's1-blank': '', score: '0' });
  expect(read(gradesExport(f.s.publicState('teacher'), 'csv')).find(r => r.student_id === 'a')).toMatchObject({ 's1-code': '0', 's1-questions': '0', average: '0' });
  f.advance(10001); f.s.tick(); f.s.control('retry');
  f.s.accept(f.s.begin('a', 'demo/repo'), codeSource()); f.s.control('attack');
  expect(read(gradesExport(f.s.publicState('teacher'), 'csv')).find(r => r.student_id === 'a')).toMatchObject({ 's1-code': '100', 's1-questions': '0', average: '50' });
  const restored = ClassroomSession.restore(JSON.parse(JSON.stringify(f.s.save())));
  expect(gradesExport(restored.publicState('teacher'), 'csv')).toBe(gradesExport(f.s.publicState('teacher'), 'csv'));
  expect(classroomExport(restored.publicState('teacher'), 'csv')).toBe(classroomExport(f.s.publicState('teacher'), 'csv'));
});

it('keeps numeric tolerance exact at decimal boundaries and large magnitudes', () => {
  const numeric = (value: number, tolerance: number): ClassroomQuestion => ({ id: 'n', kind: 'blank', prompt: '{{1}}', blanks: [{ accept: [String(value)], numeric: { value, tolerance } }] });
  expect(gradeQuestion(numeric(100000, .1), { blanks: ['100000.1'] }).correct).toBe(true);
  expect(gradeQuestion(numeric(1e20, 1), { blanks: ['100000000000000010000'] }).correct).toBe(false);
  expect(gradeQuestion(numeric(0, 0), { blanks: ['0.00000000000000001'] }).correct).toBe(false);
  expect(gradeQuestion(numeric(-.2, .1), { blanks: ['-.3'] }).correct).toBe(true);
});

it('marks a mixed row submitted whenever answers exist while still waiting for queued code', () => {
  const f = session(mixedPlan());
  f.save({ single: { choice: 'a' } }); const ticket = f.s.begin('a', 'repo');
  expect(f.s.state.rows[0]).toMatchObject({ status: 'submitted', score: 16.7 });
  expect(f.s.valid(ticket)).toBe(true);
  expect(() => f.s.begin('a', 'repo')).toThrow('already being checked');
  expect(() => f.s.control('attack')).toThrow('queued');
  f.s.fail(ticket, 'unavailable'); expect(f.s.state.rows[0]).toMatchObject({ status: 'submitted', score: 16.7 });
  const second = f.s.begin('b', 'repo'); f.save({ single: { choice: 'a' } }, 'b');
  expect(f.s.state.rows[1]).toMatchObject({ status: 'submitted', score: 16.7 });
  expect(() => f.s.control('finish')).toThrow('queued');
  f.s.end(); expect(f.s.valid(second)).toBe(false); expect(f.s.state.rows[1]).toMatchObject({ status: 'submitted', score: 16.7 });
});

it('keeps previously revealed overall grades when a new question step opens', () => {
  const plan = questionPlan(); plan.steps.push({ ...structuredClone(plan.steps[0]), id: 'next' });
  const f = session(plan); f.save({ single: { choice: 'a' } }); f.s.control('attack'); f.advance(10001); f.s.tick();
  f.s.control('next'); const state = f.s.publicState('student');
  expect(state.rounds[0].attacks[0].score).toBe(33.3);
  expect(lessonGrades(state).students.find(s => s.id === 'a')?.steps[0]).toBe(33.3);
  expect(state.plan.steps[0].questions![0]).not.toHaveProperty('answer');
});


it('exposes only boolean numeric hints on unrevealed blanks', () => {
  const plan = questionPlan();
  plan.steps[0].questions = [{ id: 'hints', kind: 'blank', prompt: '{{1}} {{2}} {{3}}', explain: 'PRIVATE_EXPLANATION', blanks: [
    { accept: ['PRIVATE_WORD'] }, { accept: ['PRIVATE_NUMBER'], numeric: { value: 98765.4321, tolerance: .000123 } }, { accept: ['PRIVATE_CASE'], caseSensitive: true },
  ] }];
  const original = structuredClone(plan);
  for (const revealAnswers of ['after-raid', 'never'] as const) {
    plan.steps[0].revealAnswers = revealAnswers;
    const safe = studentPlan(plan, null).steps[0].questions![0];
    expect(safe).toMatchObject({ kind: 'blank', blankCount: 3, blankNumeric: [false, true, false] });
    expect(Object.keys(safe).sort()).toEqual(['blankCount', 'blankNumeric', 'id', 'kind', 'prompt']);
    for (const marker of ['PRIVATE_', '98765', '000123', 'caseSensitive', 'tolerance', 'numeric']) expect(JSON.stringify(safe)).not.toContain(marker);
  }
  delete plan.steps[0].revealAnswers;
  expect(plan).toEqual(original);
  expect(studentPlan(plan, 0).steps[0].questions![0]).toHaveProperty('blanks', original.steps[0].questions![0].kind === 'blank' ? original.steps[0].questions![0].blanks : []);
});

it('publishes answer counts without correctness in coding/paused and resets them by attempt and step', () => {
  const plan = questionPlan(); plan.steps.push({ ...structuredClone(plan.steps[0]), id: 'next', questions: [single()] });
  const f = session(plan);
  const counts = (expected: number[]) => { for (const audience of ['student', 'teacher'] as const) expect(f.s.publicState(audience).questionAnswered).toEqual(expected); };
  counts([0, 0, 0]);
  f.save({ single: { choice: 'a' }, multi: { choices: ['a'] } }); counts([1, 1, 0]);
  f.save({ single: { choice: 'b' } }, 'b'); counts([2, 1, 0]);
  expect(f.s.questionLive()[0].correct).toBe(1);
  f.advance(); f.save({ single: { choice: 'a' } }, 'b'); counts([2, 1, 0]);
  expect(f.s.questionLive()[0].correct).toBe(2);
  f.advance(); f.save({ multi: { choices: [] } }); counts([2, 0, 0]);
  f.s.control('pause'); counts([2, 0, 0]); f.s.control('resume'); counts([2, 0, 0]);
  f.s.control('attack'); expect(f.s.publicState('teacher').questionAnswered).toBeUndefined();
  f.advance(10001); f.s.tick(); expect(f.s.publicState('student').questionAnswered).toBeUndefined();
  f.s.control('retry'); counts([0, 0, 0]);
  f.save({ single: { choice: 'a' } }); f.s.control('attack'); f.advance(10001); f.s.tick(); f.s.control('next'); counts([0]);
  f.s.control('finish'); expect(f.s.publicState('teacher').questionAnswered).toBeUndefined();
});

it('recomputes memory-only answer counts after restore instead of replaying saved counts', () => {
  const f = session(); f.save({ single: { choice: 'a' } });
  const saved = f.s.save(); expect(saved.questionAnswered).toEqual([1, 0, 0]);
  const restored = ClassroomSession.restore(saved);
  expect(restored.publicState('student').questionAnswered).toEqual([0, 0, 0]);
  restored.state.phase = 'complete'; restored.state.questionAnswered = [99, 99, 99];
  for (const audience of ['student', 'teacher'] as const) expect(restored.publicState(audience)).not.toHaveProperty('questionAnswered');
});

it('requires an explicit state audience and rejects omitted or invalid audiences', () => {
  const f = session();
  // @ts-expect-error State readers must explicitly choose their audience.
  expect(() => f.s.publicState()).toThrow('audience');
  // @ts-expect-error The former boolean audience is no longer supported.
  expect(() => f.s.publicState(true)).toThrow('audience');
  // @ts-expect-error Unknown audiences must never receive teacher state.
  expect(() => f.s.publicState('visitor')).toThrow('audience');
  expect(f.s.publicState('teacher').plan.steps[0].questions![0]).toHaveProperty('answer');
  expect(f.s.publicState('student').plan.steps[0].questions![0]).not.toHaveProperty('answer');
});

it('sends only the code grade in mixed after-close reports and rows until feedback', () => {
  const f = session(mixedPlan());
  f.save({ single: { choice: 'a' } });
  expect(f.report(false)).not.toHaveProperty('questionScore'); expect(f.report(false)).not.toHaveProperty('score');
  f.s.accept(f.s.begin('a', 'repo'), codeSource());
  expect(f.report()).toMatchObject({ codeScore: 100, questionScore: 33.3, score: 66.7 });
  for (const phase of ['coding', 'paused', 'raid'] as const) {
    f.s.state.phase = phase;
    expect(f.report(false)).toMatchObject({ codeScore: 100, score: 100, improvement: 0 });
    expect(f.report(false)).not.toHaveProperty('questionScore');
    expect(f.s.publicState('student').rows.find(r => r.id === 'a')).toMatchObject({ score: 100, improvement: 0 });
    expect(f.s.publicState('teacher').rows.find(r => r.id === 'a')?.score).toBe(66.7);
  }
  f.s.state.phase = 'feedback'; expect(f.report(false)).toMatchObject({ questionScore: 33.3, score: 66.7 });
});

it('hides question-only grades before close even in never-reveal mode, then releases the final own grade', () => {
  const p = questionPlan(); p.steps[0].revealAnswers = 'never'; const f = session(p);
  f.save({ single: { choice: 'a' } });
  expect(f.report(false)).not.toHaveProperty('questionScore'); expect(f.report(false)).not.toHaveProperty('score');
  expect(f.s.publicState('student').rows[0]).not.toHaveProperty('score');
  f.s.state.phase = 'complete'; expect(f.report(false).score).toBe(33.3);
  expect(f.report(false).answers!.single).not.toHaveProperty('correct'); expect(f.report(false).answers!.single).not.toHaveProperty('key');
});

it('forces never-reveal plans to after-close feedback in every step mode', () => {
  for (const mode of ['code', 'questions', 'mixed'] as const) {
    const p = mixedPlan(); Object.assign(p.steps[0], { mode, revealAnswers: 'never', answerFeedback: 'immediate' });
    expect(normalizeClassroomPlan(p).steps[0]).toMatchObject({ revealAnswers: 'never', answerFeedback: 'after-close' });
  }
  const p = questionPlan(); Object.assign(p.steps[0], { revealAnswers: 'never', answerFeedback: 'immediate' }); const f = session(p);
  f.save({ single: { choice: 'a' } }); f.advance(); f.save({ single: { choice: 'b' } });
  expect(f.report().answers!.single).toMatchObject({ correct: false, attempts: 2 }); expect(f.report().answers!.single.locked).toBeUndefined();
});
