import { describe, expect, it, vi } from 'vitest';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { recoverGeneratedCourse, validationDiagnostics } from './course-output';
import { verifyCourseQuestions, type QualityDiagnostics } from './course-quality';
import { generationInputPool } from './course-generation-inputs';
import { runDoctests } from './py-sandbox';
import { createCourseGenerator } from './course-generation';

const concept = (id = 'concept'): any => ({ id, kind: 'single', prompt: 'Which search requires sorted input?', options: [{ id: 'a', text: 'Binary search' }, { id: 'b', text: 'Ordinary linear search' }], answer: 'a', explain: 'Binary search relies on sorted order.', verification: null });
function plan(questions = [concept()]): any { const p = defaultClassroomPlan(); p.steps = [{ ...p.steps[0], mode: 'questions', questions }]; return p; }
function task(questions = [concept()]): any {
  const p = plan(questions); Object.assign(p.steps[0], { mode: 'mixed', language: 'python', checksWeight: 100,
    starter: [{ path: 'main.py', content: 'def f(x):\n    raise NotImplementedError\n' }],
    checks: [{ id: 'task', path: 'main.py', label: 'Increment contract', kind: 'doctest', text: '>>> f(0)\n1\n>>> f(1)\n2\n>>> f(2)\n3\n>>> f(3)\n4' }] }); return p;
}
async function verify(raw: any, reference?: string) {
  const d: QualityDiagnostics = { ...validationDiagnostics(), keyVerification: [] }, sources = new Map();
  const p = recoverGeneratedCourse(raw, 'lesson', d, sources);
  try { return { plan: await verifyCourseQuestions(p, sources, d, runDoctests, reference), diagnostics: d }; }
  catch (error) { return { error, diagnostics: d }; }
}

describe('round-3 execution and leakage boundaries', () => {
  it('gets individual example totals without changing ordinary sandbox result payloads', async () => {
    const files = [{ path: 'main.py', text: 'x = 1' }], checks = [{ id: 'x', path: 'main.py', text: '>>> x\n1\n>>> x\n2\n>>> x\n1' }];
    const result = await runDoctests(files, checks, { exampleCounts: true });
    expect(result.x.examples).toEqual({ passed: 2, total: 3 }); expect(result.x.passed).toBe(false);
    expect((await runDoctests(files, checks)).x).not.toHaveProperty('examples');
  }, 30000);
  it.each([[3, true], [2, false]] as const)('uses strict MORE THAN HALF of examples: %s/4 rejected=%s, including renamed functions', async (passing, rejected) => {
    const p = task(); p.steps[0].questionContext = '```python\ndef renamed(x):\n    return x + 1 if x < ' + passing + ' else -1\n```';
    const result = await verify(p); expect(!!result.error).toBe(rejected);
    if (rejected) expect(result.diagnostics.droppedItems[0].reason).toContain('3/4');
  }, 60000);
  it('rejects a starter that passes even one example before student edits', async () => {
    const p = task(); p.steps[0].starter[0].content = 'def f(x):\n    return 1\n';
    const result = await verify(p); expect(String(result.error)).toContain('starter passes 1/4');
  }, 30000);
  it('rejects exact code fixes in hints but allows conceptual hints', async () => {
    const p = task(); p.steps[0].brief = { goal: 'Implement increment.', todo: ['Solve.'], doneWhen: ['The contract passes.'], hints: ['Replace the missing return with `return x + 1`.'] };
    expect(String((await verify(p)).error)).toContain('exact code fix');
    p.steps[0].brief.hints = ['Think about how the output relates to the input.']; expect((await verify(p)).error).toBeUndefined();
  }, 30000);
  it('drops immediate-feedback answers that supply a missing code-task line', async () => {
    const q = { ...concept('missing-line'), prompt: 'Which missing line completes the code task?', options: [{ id: 'a', text: 'return x + 1' }, { id: 'b', text: 'return x - 1' }] };
    const p = task([q, concept()]); p.steps[0].answerFeedback = 'immediate';
    const result = await verify(p); expect(result.error).toBeUndefined(); expect(result.plan!.steps[0].questions!.map(q => q.id)).toEqual(['concept']);
    expect(result.diagnostics.droppedItems[0].reason).toContain('missing code-task line');
  }, 30000);
  it('retains conceptual items despite code context or code-looking identifiers and missing verification', async () => {
    const prompts = [
      'True or False: In merge(lst1, lst2), after the main while loop finishes comparing elements from both lists, at most one of the two remaining-elements loops can execute.',
      'Suppose lst1 and lst2 are sorted, and you pass the output of merge(lst1, lst2) into binarySearch. Which statement explains why omitting the second trailing loop breaks the size contract?',
      'What is the purpose of the return statement in this code?\n```python\ndef inc(x):\n    return x + 1\n```',
    ];
    const p = plan(prompts.map((prompt, i) => ({ ...concept('q-' + i), prompt, verification: null })));
    delete p.steps[0].questions[0].verification;
    p.steps[0].questionContext = '```python\ndef merge(lst1, lst2):\n    return lst1 + lst2\n```';
    const result = await verify(p); expect(result.error).toBeUndefined(); expect(result.plan!.steps[0].questions).toHaveLength(3);
    expect(result.diagnostics.keyVerification?.every(v => v.status === 'not-required')).toBe(true);
  }, 30000);
  it('still requires verification for a true/false claim of a concrete call value', async () => {
    const q = { ...concept(), prompt: 'True or false: f(4) returns 5?\n```python\ndef f(x):\n    return x + 1\n```', verification: null };
    const result = await verify(plan([q])); expect(result.error).toBeDefined(); expect(result.diagnostics.keyVerification?.[0].status).toBe('missing');
  });
  it('reconciles counts in public context and brief todos after a bad concrete key drops', async () => {
    const bad = { ...concept('bad'), prompt: 'What does f(4) return?\n```python\ndef f(x):\n    return x + 1\n```', options: [{ id: 'a', text: '4' }, { id: 'b', text: '5' }], verification: { code: 'def f(x):\n    return x + 1', expression: 'f(4)' } };
    const p = plan([concept(), bad]); Object.assign(p.steps[0], { instructions: 'Answer two questions.', questionContext: 'Two checkpoint questions follow.', brief: { goal: 'Practice.', todo: ['Answer all two checkpoint questions.'], doneWhen: [] } });
    const result = await verify(p); expect(result.error).toBeUndefined();
    expect(result.plan!.steps[0].instructions).toBe('Answer 1 question.'); expect(result.plan!.steps[0].questionContext).toBe('1 checkpoint question follow.');
    expect(result.plan!.steps[0].brief!.todo).toEqual(['Answer all 1 checkpoint question.']);
  }, 30000);
  it('preserves input sizes while reconciling question counts and does not misclassify a definition as a trace', async () => {
    const p = plan(); p.steps[0].instructions = 'The input list has 5 items. Answer two questions.';
    p.steps[0].questionContext = '```python\ndef search(xs):\n    return xs\n```'; p.steps[0].questions[0].prompt = 'What is binarySearch?';
    const result = await verify(p); expect(result.error).toBeUndefined();
    expect(result.plan!.steps[0].instructions).toBe('The input list has 5 items. Answer 1 question.');
    expect(result.diagnostics.keyVerification?.[0].status).toBe('not-required');
  });
});

describe('round-3 content and workload policies', () => {
  it('lengthens counterexample rounds beyond the old short-timer cap when list/trace workload requires it', () => {
    const q = { ...concept(), prompt: 'Which input is a counterexample between the two functions?', options: Array.from({ length: 4 }, (_, i) => ({ id: String.fromCharCode(97 + i), text: '[' + Array.from({ length: 8 }, (_, j) => i + j).join(',') + ']' })) };
    const p = plan([q, { ...q, id: 'q2' }, { ...q, id: 'q3' }]); p.steps[0].durationSec = 30;
    const n = recoverGeneratedCourse(p, 'quiz'); expect(n.steps[0].durationSec).toBeGreaterThan(180);
    const small = structuredClone(p); small.steps[0].questions[0].options.forEach((o: any) => { o.text = '[1,2,3,4]'; });
    expect(recoverGeneratedCourse(small, 'quiz').steps[0].durationSec).toBeLessThan(n.steps[0].durationSec);
  });
  it('includes list sizes in shared code when computing a concrete trace budget', () => {
    const q = { ...concept(), prompt: 'What does scan(xs) return in the code above?' };
    const p = plan([q]); p.steps[0].durationSec = 1;
    p.steps[0].questionContext = '```python\nxs = [1,2,3,4]\ndef scan(xs):\n    return sum(xs)\n```';
    const small = recoverGeneratedCourse(p, 'warmup').steps[0].durationSec;
    p.steps[0].questionContext = p.steps[0].questionContext.replace('[1,2,3,4]', '[1,2,3,4,5,6,7,8]');
    expect(recoverGeneratedCourse(p, 'warmup').steps[0].durationSec).toBeGreaterThan(small);
  });
  it('drops syllabus recall and unsupported sorting headings while retaining taught search concepts', async () => {
    const p = plan([concept(), { ...concept('syllabus'), prompt: 'Which algorithms does Module 7 cover?' }, { ...concept('sorting'), prompt: 'How does bubble sort order its values?' }]);
    const r = await verify(p, 'Binary search requires ascending sorted input.\nQuestion 5: Sorting\n** Bubble sort\n** Insertion sort\nQuestion 6: Implement merge.');
    expect(r.error).toBeUndefined(); expect(r.plan!.steps[0].questions!.map(q => q.id)).toEqual(['concept']);
    expect(r.diagnostics.droppedItems.map(d => d.reason).join(' ')).toContain('syllabus');
    expect(r.diagnostics.droppedItems.map(d => d.reason).join(' ')).toContain('headings');
  });
  it.each([
    ['Bubble sort repeatedly compares adjacent elements and swaps an out-of-order pair until all adjacent pairs are ordered.', 'Why does bubble sort swap adjacent elements?'],
    ['冒泡排序：这个算法反复比较相邻的元素，并且交换顺序错误的元素，直到所有相邻的元素都有序。', '冒泡排序为什么交换相邻元素？'],
  ])('retains sorting concepts when the actual explanation is available', async (reference, prompt) => {
    const result = await verify(plan([{ ...concept(), prompt }]), reference); expect(result.error).toBeUndefined();
    expect(result.diagnostics.droppedItems).toEqual([]);
  });
  it.each(['easy', 'medium'] as const)('%s uses small positive lists while hard+ can use larger signed values', difficulty => {
    for (const seed of [0, 42, 20261113]) {
      const pool = generationInputPool(seed, 'quiz', difficulty);
      for (const xs of pool.sortedLists) { expect(xs.length).toBeGreaterThanOrEqual(4); expect(xs.length).toBeLessThanOrEqual(5); expect(xs.every(x => x > 0 && x <= 20)).toBe(true); }
      const hard = generationInputPool(seed, 'quiz', 'hard'); expect(hard.sortedLists.some(xs => xs.length >= 7)).toBe(true);
      const warm = generationInputPool(seed, 'warmup', 'extreme'); expect(warm.sortedLists.every(xs => xs.length <= 5 && xs.every(x => x > 0 && x <= 20))).toBe(true);
    }
  });
  it('rejects multi-selects with only one wrong option, preserving raw evidence without guessing distractors', async () => {
    const multi = { ...concept('multi'), kind: 'multi', answer: ['a', 'b', 'c'], options: ['a', 'b', 'c', 'd'].map(id => ({ id, text: 'Claim ' + id })) };
    const r = await verify(plan([concept(), multi])); expect(r.error).toBeUndefined(); expect(r.plan!.steps[0].questions).toHaveLength(1);
    expect(r.diagnostics.droppedItems[0]).toMatchObject({ raw: multi, reason: expect.stringContaining('two plausible wrong options') });
  });
  it('sends all policy constraints in the actual mocked provider prompt', async () => {
    let prompt = '';
    const fetcher = vi.fn(async (_url: any, init: any) => { prompt = JSON.parse(init.body).contents[0].parts[0].text; return new Response('{}', { status: 402 }); });
    await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: fetcher })('** Bubble sort\n** Insertion sort', 'extreme', 'exercise').catch(() => {});
    for (const phrase of ['MORE THAN HALF', 'starter must fail every', 'exact fix', 'syllabus-recall', 'at least two plausible wrong options', '4–5 small positive']) expect(prompt).toContain(phrase);
    expect(prompt).toContain('UNSUPPORTED SORTING TOPICS');
  });
});
