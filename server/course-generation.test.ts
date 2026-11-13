import { describe, expect, it, vi } from 'vitest';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { createCourseGenerator, validateGeneratedCourse } from './course-generation';
const gemini = (value: unknown) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }));
describe('AI course generation', () => {
  it('uses the configured Gemini provider and validates the complete lesson', async () => {
    const fetcher = vi.fn(async () => gemini(defaultClassroomPlan()));
    const generate = createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', model: 'test-model', fetch: fetcher });
    expect(await generate('# Python\nTeach variables')).toMatchObject({ provider: 'gemini:test-model', plan: { title: 'Build. Review. Improve.' } });
    expect(fetcher.mock.calls[0]).toBeDefined();
  });
  it('falls back to configured DeepSeek when Gemini returns an invalid plan', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(gemini({ steps: [] })).mockResolvedValueOnce(gemini({ steps: [] })).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(defaultClassroomPlan()) } }] })));
    expect(await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: 'mock', fetch: fetcher })('Teach Python')).toMatchObject({ provider: 'deepseek' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('fails visibly for absent providers, invalid input, and failed providers', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('sensitive upstream body'));
    const offline = createCourseGenerator({ apiKey: '', deepseekApiKey: '', fetch: fetcher });
    await expect(offline('Teach Python')).rejects.toThrow('unavailable');
    expect(fetcher).not.toHaveBeenCalled();
    await expect(offline(' ')).rejects.toThrow('1–80000');
    await expect(offline('é'.repeat(40001))).rejects.toThrow('1–80000');
    await expect(createCourseGenerator({ apiKey: 'mock', deepseekApiKey: 'mock', fetch: fetcher })('Teach Python')).rejects.toThrow('unavailable');
  });
  it('repairs duplicate step ids and drops bad checks but rejects oversized model output', () => {
    const plan = defaultClassroomPlan(); plan.steps[1].id = plan.steps[0].id;
    expect(new Set(validateGeneratedCourse(plan).steps.map(step => step.id)).size).toBe(plan.steps.length);
    plan.steps[1].id = 'other'; plan.steps[0].checks = [{ id: 'bad', kind: 'file', label: 'Bad', path: '../secret' }];
    expect(validateGeneratedCourse(plan).steps[0].checks).toEqual([]);
    expect(() => validateGeneratedCourse({ ...plan, title: 'x'.repeat(256001) })).toThrow('too large');
  });
});

it('generates non-code question sets with the shared normalizer and question-aware schema/prompt', async () => {
  const plan = defaultClassroomPlan();
  plan.steps = [{ ...plan.steps[0], mode: 'questions', questions: [
    { id: 'history', kind: 'single', prompt: 'When?', options: [{ id: 'a', text: 'Earlier' }, { id: 'b', text: 'Later' }], answer: 'a' },
    { id: 'math', kind: 'blank', prompt: 'Compute {{1}}', blanks: [{ accept: ['2'], numeric: { value: 2, tolerance: 0 } }] },
  ] }];
  const { rubric, checks, checksWeight, ...step } = plan.steps[0];
  const raw = { ...plan, steps: [step] };
  let request: any;
  const fetcher = vi.fn(async (_url: any, init: any) => { request = JSON.parse(init.body); return gemini(raw); });
  const result = await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: fetcher })('History and arithmetic', 'medium', 'quiz', 'Exactly 2 questions.');
  expect(result.plan.steps[0]).toMatchObject({ mode: 'questions', answerFeedback: 'after-close', questions: [{ points: 1 }, { kind: 'blank' }] });
  const serialized = JSON.stringify(request);
  expect(serialized).toContain('question-set steps only');
  expect(serialized).toContain('questionsWeight'); expect(serialized).toContain('maxAttempts'); expect(serialized).toContain('caseSensitive');
  expect(result.plan.steps[0].checks).toEqual([]);
});

it('rejects invalid model question keys, blank markers and mixed weights', () => {
  const plan = defaultClassroomPlan();
  Object.assign(plan.steps[0], { mode: 'mixed', questions: [{ id: 'test', kind: 'blank', prompt: '{{2}}', blanks: [{ accept: ['yes'] }] }] });
  expect(() => validateGeneratedCourse(plan)).toThrow('markers');
  plan.steps[0].questions = [{ id: 'test', kind: 'single', prompt: 'Pick', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], answer: 'unknown' }];
  expect(() => validateGeneratedCourse(plan)).toThrow('option id');
  if (plan.steps[0].questions[0].kind === 'single') plan.steps[0].questions[0].answer = 'a'; plan.steps[0].questionsWeight = 101;
  expect(() => validateGeneratedCourse(plan)).toThrow('weight');
});

it('rejects fractional generated question points and advertises integer points to the mocked provider', async () => {
  const plan = defaultClassroomPlan();
  plan.steps = [{ ...plan.steps[0], mode: 'questions', questions: [
    { id: 'q', kind: 'single', prompt: 'Pick one', points: 1.5, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], answer: 'a' },
  ] }];
  expect(() => validateGeneratedCourse(plan)).toThrow('question points');
  const invalidFetch = vi.fn(async () => gemini(plan));
  await expect(createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: invalidFetch })('Teach a concept', 'medium', 'quiz', 'Exactly 1 question.')).rejects.toThrow('invalid lesson');
  plan.steps[0].questions![0].points = 100;
  let request: any;
  const fetcher = vi.fn(async (_url: any, init: any) => { request = JSON.parse(init.body); return gemini(plan); });
  expect((await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: fetcher })('Teach a concept', 'medium', 'quiz', 'Exactly 1 question.')).plan.steps[0].questions![0].points).toBe(100);
  const body = JSON.stringify(request);
  expect(body).toContain('points (integer 1–100');
  expect(body).toContain('"points":{"type":"integer","minimum":1,"maximum":100}');
});


describe('course difficulty prompt guidance', () => {
  it.each([
    ['easy', 'recall and direct application', 'short prompts'],
    ['medium', 'standard practice exercises', 'standard practice questions'],
    ['hard', 'multi-step reasoning', 'analysis of edge cases'],
    ['very-hard', 'efficiency and correctness arguments', 'tricky but unambiguous distractors'],
    ['extreme', 'competition/exam-challenge level tasks', 'competition/exam-challenge level questions'],
  ] as const)('gives concrete code and question guidance for %s', async (difficulty, codeGuidance, questionGuidance) => {
    let request: any;
    const provider = vi.fn(async (_url: any, init: any) => { request = JSON.parse(init.body); return gemini(defaultClassroomPlan()); });
    await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: provider })('Teach from this material', difficulty);
    const prompt = JSON.stringify(request);
    expect(prompt).toContain(`Requested difficulty: ${difficulty}.`);
    expect(prompt).toContain('Code tasks:'); expect(prompt).toContain(codeGuidance);
    expect(prompt).toContain('Question sets:'); expect(prompt).toContain(questionGuidance);
    expect(prompt).toContain('correct and answerable from the reference material');
    expect(prompt).toContain('Do not require untaught prerequisites or invent facts');
    expect(prompt).toContain('verify that every key matches the options or blanks');
  });
  it('defaults direct generator calls to medium', async () => {
    let request: any;
    const provider = vi.fn(async (_url: any, init: any) => { request = JSON.parse(init.body); return gemini(defaultClassroomPlan()); });
    await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: provider })('Teach from this material');
    expect(JSON.stringify(request)).toContain('Requested difficulty: medium.');
  });
  it('keeps difficulty guidance when falling back to the mocked DeepSeek provider', async () => {
    const provider = vi.fn().mockResolvedValueOnce(gemini({ steps: [] })).mockResolvedValueOnce(gemini({ steps: [] })).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(defaultClassroomPlan()) } }] })));
    expect(await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: 'mock', fetch: provider })('Teach from this material', 'very-hard')).toMatchObject({ provider: 'deepseek' });
    expect(provider).toHaveBeenCalledTimes(3);
    for (const [, init] of provider.mock.calls) {
      expect(init.body).toContain('Requested difficulty: very-hard.');
      expect(init.body).toContain('tricky but unambiguous distractors');
    }
  });
  it.each(['', 'invalid', 'MEDIUM', null, 1, '__proto__'])('rejects runtime difficulty %j without calling a provider', async difficulty => {
    const provider = vi.fn();
    const generate = createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: provider });
    await expect(generate('Teach a concept', difficulty as never)).rejects.toThrow('difficulty');
    expect(provider).not.toHaveBeenCalled();
  });
});
