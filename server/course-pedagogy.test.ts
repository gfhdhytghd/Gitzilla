import { describe, it, expect, vi } from 'vitest';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { normalizeClassroomPlan } from './classroom';
import { studentPlan } from './classroom-questions';
import { recoverGeneratedCourse, validationDiagnostics } from './course-output';
import { assertCourseConstraints, assertGeneratedQuestionCounts, selfContainedError, verifyCourseQuestions, type QualityDiagnostics } from './course-quality';
import { generationInputPool } from './course-generation-inputs';
import { createCourseGenerator } from './course-generation';

const concept = (id = 'concept'): any => ({ id, kind: 'single', prompt: 'Which search needs sorted input?', options: [{ id: 'a', text: 'Binary search' }, { id: 'b', text: 'Ordinary linear search' }], answer: 'a', explain: 'Binary search relies on sorted order.', verification: null });
function rawPlan(count = 1): any {
  const p: any = defaultClassroomPlan(); p.steps = [{ ...p.steps[0], mode: 'questions', questions: Array.from({ length: count }, (_, i) => concept('q-' + i)) }]; return p;
}
const response = (p: any) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(p) }] } }] }));
async function verify(raw: any, preset: any = 'lesson') {
  const d: QualityDiagnostics = { ...validationDiagnostics(), keyVerification: [] }, sources = new Map();
  const p = recoverGeneratedCourse(raw, preset, d, sources);
  try { return { plan: await verifyCourseQuestions(p, sources, d), diagnostics: d }; }
  catch (error) { return { error, diagnostics: d }; }
}
function executable(id: string, code: string, expression: string, correct: string): any {
  return { id, kind: 'single', prompt: 'What does the call return?\n```python\n' + code + '\n```', options: [{ id: 'a', text: correct }, { id: 'b', text: '999' }], answer: 'a', explain: 'Compute the stated call.', verification: { code, expression } };
}

describe('round-2 pedagogical gates', () => {
  it.each([['quiz', 8], ['warmup', 6], ['exam', 10]] as const)('enforces %s minimum and lets exact teacher counts override it', (preset, min) => {
    expect(() => assertGeneratedQuestionCounts(rawPlan(min - 1), preset)).toThrow('Add 1 more');
    expect(() => assertGeneratedQuestionCounts(rawPlan(min), preset)).not.toThrow();
    assertGeneratedQuestionCounts(rawPlan(1), preset, 'Exactly 1 question.');
  });
  it('enforces two exercise questions per step and exact global teacher counts still take precedence', () => {
    const p = rawPlan(1); p.steps[0].mode = 'mixed';
    expect(() => assertGeneratedQuestionCounts(p, 'exercise')).toThrow('per step');
    p.steps[0].questions.push(concept('other')); assertGeneratedQuestionCounts(p, 'exercise');
    assertGeneratedQuestionCounts(rawPlan(1), 'exercise', 'Exactly 1 question.');
  });
  it('asks the same provider to add the exact shortfall and reconciles stale instruction counts', async () => {
    const first = rawPlan(7), last = rawPlan(8); first.steps[0].instructions = last.steps[0].instructions = 'Answer seven quick questions.';
    const fetcher = vi.fn().mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response(last));
    const result = await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: fetcher })('Source', 'medium', 'quiz');
    expect(result.plan.steps[0].questions).toHaveLength(8); expect(result.plan.steps[0].instructions).toBe('Answer 8 quick questions.');
    expect(fetcher.mock.calls[1][1].body).toContain('Add 1 more questions on untested');
  });
  it('validates and publicly preserves shared context, including persistence normalization', () => {
    const p = rawPlan(); p.steps[0].questionContext = 'PUBLIC_SHARED_CODE\n```python\nx = 7\n```';
    const n = normalizeClassroomPlan(p); expect(studentPlan(n, null).steps[0].questionContext).toBe(p.steps[0].questionContext);
    expect(studentPlan(n, null).steps[0].questions![0]).not.toHaveProperty('answer');
    expect(normalizeClassroomPlan(n).steps[0].questionContext).toBe(n.steps[0].questionContext);
    for (const bad of ['x'.repeat(4001), 123, null]) { p.steps[0].questionContext = bad; expect(() => normalizeClassroomPlan(p)).toThrow('question context'); }
    p.steps[0].questionContext = 'x'.repeat(4000); expect(() => normalizeClassroomPlan(p)).not.toThrow();
  });
  it('uses shared code for several verified questions without duplicating it in each prompt', async () => {
    const p = rawPlan(2); p.steps[0].questionContext = '```python\ndef inc(x):\n    return x + 1\n```';
    p.steps[0].questions = [4, 7].map((n, i) => ({ ...executable('q' + i, 'pass', 'inc(' + n + ')', String(n + 1)), prompt: 'Using the code above, what does inc(' + n + ') return?', verification: { code: 'pass', expression: 'inc(' + n + ')' } }));
    const result = await verify(p); expect(result.error).toBeUndefined();
    expect(result.diagnostics.keyVerification?.filter(k => k.status === 'passed')).toHaveLength(2);
    for (const q of result.plan!.steps[0].questions!) expect(q.prompt).not.toContain('def inc');
  }, 30000);
  it('keeps pure concepts naming a function and fixes published item-count wording after a drop', async () => {
    const p = rawPlan(); p.steps[0].instructions = 'Four quick challenges.';
    p.steps[0].questions = [{ ...concept(), prompt: 'In `merge(lst1, lst2)`, once one list runs out, remaining elements can be appended in order without further comparisons. True or false?' }, executable('bad', 'x = 4', 'x', '3')];
    for (const text of [p.steps[0].questions[0].prompt, 'Which keyword returns a value from a Python function?', 'Why is a return statement different from print?']) expect(selfContainedError(text)).toBeUndefined();
    const result = await verify(p); expect(result.error).toBeUndefined(); expect(result.plan!.steps[0].questions).toHaveLength(1);
    expect(result.plan!.steps[0].instructions).toBe('1 quick challenge.');
  }, 30000);
  it.each(['f', 'renamed'])('drops a checkpoint solution (%s) that passes the code task doctests', async name => {
    const p = rawPlan(2), source = 'def ' + name + '(x):\n    return x + 1', bug = 'def bug(x):\n    return x - 1';
    Object.assign(p.steps[0], { mode: 'mixed', checks: [{ id: 'test', kind: 'doctest', path: 'main.py', label: 'Task tests', text: '>>> f(1)\n2\n>>> f(5)\n6' }] });
    p.steps[0].questions = [executable('solution', source, name + '(3)', '4'), executable('bug', bug, 'bug(3)', '2')];
    const result = await verify(p); expect(result.error).toBeUndefined(); expect(result.plan!.steps[0].questions!.map(q => q.id)).toEqual(['bug']);
    expect(result.diagnostics.droppedItems[0].reason).toContain('reveals its solution');
  }, 60000);
  it('executes concrete comparison counts and retains conceptual counterexample/fix items from shared code', async () => {
    const p = rawPlan(3); p.steps[0].questionContext = '```python\ndef comparisons(xs, target):\n    count = 0\n    for x in xs:\n        count += 1\n        if x == target:\n            break\n    return count\ndef broken(xs):\n    return len(xs) - 1 if len(xs) == 2 else len(xs)\ndef fixed(xs):\n    return len(xs)\n```';
    p.steps[0].questions = [
      { ...executable('count', 'pass', 'comparisons([7,12,19],12)', '2'), prompt: 'In the code above, how many comparisons are made by comparisons([7,12,19],12)?' },
      { ...concept('fix'), prompt: 'Which change makes the length test pass? Use broken/fixed above.', options: [{ id: 'a', text: 'Use broken' }, { id: 'b', text: 'Use fixed' }], answer: 'b', verification: null },
      { ...concept('counterexample'), prompt: 'Which input makes broken disagree with fixed in the code above?', options: [{ id: 'a', text: '[7]' }, { id: 'b', text: '[7,12]' }], answer: 'b', verification: null },
    ];
    const result = await verify(p); expect(result.error).toBeUndefined(); expect(result.diagnostics.keyVerification?.filter(v => v.status === 'passed')).toHaveLength(1);
    expect(result.diagnostics.keyVerification?.filter(v => v.status === 'not-required')).toHaveLength(2);
  }, 30000);
  it('checks shared context for complete task solutions even on a conceptual checkpoint', async () => {
    const p = rawPlan(); Object.assign(p.steps[0], { mode: 'mixed', questionContext: '```python\ndef f(x):\n    return x + 1\n```', checks: [{ id: 'test', kind: 'doctest', path: 'main.py', label: 'Task tests', text: '>>> f(1)\n2' }] });
    const result = await verify(p); expect(result.error).toBeDefined(); expect(result.diagnostics.droppedItems[0].reason).toContain('reveals its solution');
  }, 30000);
  it('injects the seeded pool and non-trace variety instructions into actual mocked requests', async () => {
    const pools: string[] = [];
    for (const [seed, preset] of [[42, 'quiz'], [42, 'exam'], [43, 'quiz']] as const) {
      let prompt = '';
      const generate = createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', seed, fetch: async (_url, init) => { prompt = JSON.parse(init!.body as string).contents[0].parts[0].text; return new Response('{}', { status: 400 }); } });
      await generate('Material', 'medium', preset).catch(() => {});
      const pool = JSON.stringify(generationInputPool(seed, preset)); expect(prompt).toContain('SEEDED INPUT POOL (server-supplied JSON): ' + pool); pools.push(pool);
      for (const phrase of ['loop-iteration/comparison counts', 'counterexample selection', 'which single-line change makes the tests pass', 'pure concept items']) expect(prompt).toContain(phrase);
    }
    expect(new Set(pools).size).toBe(3);
  });
  it('salts input pools by preset and seed, with diverse blank-index suggestions', () => {
    expect(generationInputPool(42, 'quiz')).toEqual(generationInputPool(42, 'quiz'));
    expect(generationInputPool(42, 'quiz')).not.toEqual(generationInputPool(42, 'exam'));
    expect(generationInputPool(43, 'quiz')).not.toEqual(generationInputPool(42, 'quiz'));
    expect(new Set(generationInputPool(42, 'quiz').preferredBlankIndices).size).toBe(5);
    expect(new Set(generationInputPool(42, 'quiz', 'hard').preferredBlankIndices).size).toBe(8);
  });
  it('normalizes exam attempts to one', () => {
    const p = rawPlan(); p.steps[0].questions[0].maxAttempts = 3;
    const n = recoverGeneratedCourse(p, 'exam'); expect(n.steps[0].questions![0].maxAttempts).toBe(1);
  });
});
