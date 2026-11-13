import { describe, expect, it, vi } from 'vitest';
import fixtures from './course-review4.fixtures.json';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { recoverGeneratedCourse, validationDiagnostics } from './course-output';
import { assertCourseConstraints, verifyCourseQuestions, type QualityDiagnostics } from './course-quality';
import { asksConcreteExecution, stepQuestionSeconds } from './course-question-policy';
import { runDoctests } from './py-sandbox';
import { gradeQuestion } from './classroom-questions';
import { createCourseGenerator } from './course-generation';

const concept = (prompt = 'Which search needs sorted input?'): any => ({ id: 'concept', kind: 'single', prompt, options: [{ id: 'a', text: 'Binary search' }, { id: 'b', text: 'Ordinary linear search' }], answer: 'a', explain: 'Binary search relies on sortedness.' });
function plan(questions: any[]): any { const p = defaultClassroomPlan(); p.steps = [{ ...p.steps[0], mode: 'questions', questions }]; return p; }
async function verify(raw: any) {
  const d: QualityDiagnostics = { ...validationDiagnostics(), keyVerification: [] }, sources = new Map();
  const p = recoverGeneratedCourse(raw, 'lesson', d, sources);
  return { plan: await verifyCourseQuestions(p, sources, d), diagnostics: d };
}

describe('round-4 review regressions', () => {
  it.each(['quiz-extreme', 'exam-easy'] as const)('retains the exact dropped %s concept with unrelated shared code', async name => {
    const { question, context } = fixtures[name];
    expect(asksConcreteExecution(question.prompt, context)).toBe(false);
    const p = plan([question]); p.steps[0].questionContext = context;
    const r = await verify(p);
    expect(r.plan.steps[0].questions).toHaveLength(1);
    expect(r.diagnostics.keyVerification?.[0].status).toBe('not-required');
  });
  it('distinguishes statements about code from an actual call result', () => {
    const code = '\n```python\ndef f(x):\n    return x + 1\n```';
    expect(asksConcreteExecution('Which TWO statements about return values always hold?' + code)).toBe(false);
    expect(asksConcreteExecution('True or false: f() requires sorted input?' + code)).toBe(false);
    expect(asksConcreteExecution('True or false: f(4) returns 5?' + code)).toBe(true);
    expect(asksConcreteExecution('What does f(4) return?' + code)).toBe(true);
  });
  it('retains the exact binary-search checkpoint that only passes constant -1 task cases', async () => {
    const p = plan([]); p.steps = [fixtures.leakStep];
    const r = await verify(p);
    expect(r.plan.steps[0].questions?.map(q => q.id)).toEqual(['q1-bsearch-boundary']);
    expect(r.diagnostics.droppedItems).toEqual([]);
  }, 60000);
  it('still rejects a real renamed solution on the informative cases', async () => {
    const p = plan([concept()]); p.steps = [structuredClone(fixtures.leakStep)];
    p.steps[0].questions = [concept()];
    p.steps[0].questionContext = '```python\ndef solution(xs, start, end, item):\n    for i in range(max(0,start), min(len(xs)-1,end)+1):\n        if xs[i] == item:\n            return i\n    return -1\n```';
    await expect(verify(p)).rejects.toThrow('no questions after checkpoint solution-leak');
  }, 60000);
  it('allows zero informative examples without changing normal doctest scores', async () => {
    const files = [{ path: 'stub.py', text: 'def f(x):\n    return -1' }];
    const checks = [{ id: 'stub', path: 'stub.py', text: '>>> f(1)\n-1\n>>> f(2)\n-1' }];
    expect((await runDoctests(files, checks, { exampleCounts: true })).stub).toMatchObject({ passed: true, examples: { passed: 2, total: 2 } });
    expect((await runDoctests(files, checks, { exampleCounts: true, excludeConstantExamples: true })).stub).toMatchObject({ passed: true, examples: { passed: 0, total: 0 } });
    const direct = await runDoctests([{ path: 'value.py', text: 'answer = 42' }], [{ id: 'value', path: 'value.py', text: '>>> answer\n42' }], { exampleCounts: true, excludeConstantExamples: true });
    expect(direct.value.examples).toEqual({ passed: 1, total: 1 });
  }, 30000);
  it('requires four distinct grading-normalized aliases for recalled names', () => {
    const blank: any = { id: 'heap', kind: 'blank', prompt: 'The min-heap operation is called {{1}}.', blanks: [{ accept: ['deleteMin', 'deletemin', 'DELETEMIN', ' deleteMin '] }] };
    expect(() => assertCourseConstraints(recoverGeneratedCourse(plan([blank]), 'quiz'), 'quiz')).toThrow('4 distinct');
    blank.blanks[0].accept = ['deleteMin', 'delete min', 'delete_min', 'deleteMin()'];
    blank.blanks[0].caseSensitive = true;
    expect(() => assertCourseConstraints(recoverGeneratedCourse(plan([blank]), 'quiz'), 'quiz')).toThrow('ignore letter case');
    blank.blanks[0].caseSensitive = false;
    const normalized = recoverGeneratedCourse(plan([blank]), 'quiz');
    expect(() => assertCourseConstraints(normalized, 'quiz')).not.toThrow();
    for (const alias of ['DELETEMIN', 'delete min', 'delete_min', 'deleteMin()']) expect(gradeQuestion(normalized.steps[0].questions![0], { blanks: [alias] }).correct).toBe(true);
  });
  it('caps generated options at 120 characters without truncating the key', () => {
    const q = concept(); q.options[0].text = 'A'.repeat(121);
    expect(() => assertCourseConstraints(recoverGeneratedCourse(plan([q]), 'quiz'), 'quiz')).toThrow('120');
    q.options[0].text = 'A'.repeat(120);
    expect(() => assertCourseConstraints(recoverGeneratedCourse(plan([q]), 'quiz'), 'quiz')).not.toThrow();
  });
  it('budgets reading all stems/options, including conceptual sorting rounds', () => {
    const q = concept('Which sorting statement is correct? ' + 'Read each invariant carefully. '.repeat(6));
    q.options = Array.from({ length: 4 }, (_, i) => ({ id: String.fromCharCode(97+i), text: 'An invariant about a sorting pass and its remaining elements. '.repeat(3) }));
    const p = plan([q, {...q,id:'q2'}, {...q,id:'q3'}]);
    expect(stepQuestionSeconds(p.steps[0])).toBeGreaterThan(180);
    expect(stepQuestionSeconds(p.steps[0])).toBeGreaterThan(stepQuestionSeconds(plan([concept(), {...concept(),id:'q2'}, {...concept(),id:'q3'}]).steps[0]));
  });
  it('rejects a keyed heap convention hidden in the options but ignores wrong distractor conventions', () => {
    const q = { ...concept('Which statements accurately describe the sorting algorithms?'), kind: 'multi', answer: ['a', 'b'], options: [
      { id: 'a', text: 'Heap sort builds a min-heap and calls deleteMin' },
      { id: 'b', text: 'Bubble sort stops after a swap-free pass' },
      { id: 'c', text: 'Selection sort recursively splits halves' },
      { id: 'd', text: 'Heap sort uses a max-heap and deleteMax' },
    ] };
    expect(() => assertCourseConstraints(recoverGeneratedCourse(plan([q]), 'quiz'), 'quiz')).toThrow('min-heap/deleteMin convention');
    q.prompt = 'Use min-heap Heap sort with deleteMin. Which statements accurately describe the sorting algorithms?';
    expect(() => assertCourseConstraints(recoverGeneratedCourse(plan([q]), 'quiz'), 'quiz')).not.toThrow();
  });
  it.each([
    ['Quick sort', 'Quick sort uses the first element as pivot', 'For Quick sort, the first element is the pivot.'],
    ['Shell sort', 'Shell sort uses gaps 4, 2, 1', 'For Shell sort, use gaps 4, 2, 1.'],
  ])('requires visible %s conventions', (algorithm, correct, context) => {
    const q = { ...concept('Which statement describes ' + algorithm + '?'), options: [{ id: 'a', text: correct }, { id: 'b', text: 'It always reverses the list' }] };
    expect(() => assertCourseConstraints(recoverGeneratedCourse(plan([q]), 'quiz'), 'quiz')).toThrow(/convention|gap sequence/);
    const p = plan([q]); p.steps[0].questionContext = context;
    expect(() => assertCourseConstraints(recoverGeneratedCourse(p, 'quiz'), 'quiz')).not.toThrow();
  });
  it('repairs a hidden convention through the same mocked native provider', async () => {
    const q = { ...concept(), prompt: 'Which statement describes Heap sort?', options: [{ id: 'a', text: 'It builds a min-heap and calls deleteMin' }, { id: 'b', text: 'It recursively splits halves' }] };
    const first = plan([q, ...Array.from({ length: 7 }, (_, i) => ({ ...concept(), id: 'c' + i }))]);
    const fixed = structuredClone(first); fixed.steps[0].questions[0].prompt = 'Use min-heap Heap sort with deleteMin. Which statement describes this variant?';
    const response = (p: any) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(p) }] } }] }));
    const fetcher = vi.fn().mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response(fixed));
    const r = await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: fetcher })({ kind: 'pdf', data: Buffer.from(fixtures.pdf, 'base64') }, 'easy', 'quiz');
    expect(r.diagnostics?.repairRounds).toBe(1); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).contents[0].parts[0].text).toContain('min-heap/deleteMin convention');
  });
  it('sends conventions, name aliases, compact options and reading budgets on both provider paths', async () => {
    for (const native of [false, true]) {
      let prompt = '';
      const fetcher = vi.fn(async (_url: any, init: any) => { prompt = JSON.parse(init.body).contents[0].parts[0].text; return new Response('{}', {status: 503}); });
      const generate = createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: fetcher });
      const source = native ? { kind: 'pdf' as const, data: Buffer.from(fixtures.pdf, 'base64') } : 'Reference sorting material';
      await generate(source, 'easy', 'quiz').catch(() => {});
      for (const phrase of ['pivot = first element', 'min-heap with deleteMin', '4, 2, 1', '4 distinct', '120 characters', 'reading']) expect(prompt).toContain(phrase);
    }
  });
});
