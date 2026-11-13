import { afterEach, describe, it, expect, vi } from 'vitest';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { createCourseGenerator, courseGeminiModel, courseProviderTimeout } from './course-generation';
import { courseEvaluationSummary } from './course-evaluation';

afterEach(() => vi.unstubAllEnvs());
const response = () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(defaultClassroomPlan()) }] } }] }));
const stepShape = (schema: any) => schema.properties.steps.items.anyOf?.find((shape: any) => shape.properties.mode.enum.includes('code')) ?? schema.properties.steps.items;
describe('course Gemini Hydrogen configuration', () => {
  it('uses Hydrogen generateContent, supported JSON/thinking options, and env credentials without exposing them', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'mock-env-credential'); vi.stubEnv('GEMINI_MODEL', '');
    const fetcher = vi.fn(async (_url: any, _init: any) => response());
    const raw: any[] = [];
    const result = await createCourseGenerator({ deepseekApiKey: '', fetch: fetcher, onRawResponse: r => raw.push(r) })('Search material');
    const [url, init] = fetcher.mock.calls[0], body = JSON.parse(init.body);
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('mock-env-credential');
    expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json', responseJsonSchema: { type: 'object' }, maxOutputTokens: 32768, thinkingConfig: { thinkingLevel: 'HIGH' } });
    expect(Object.keys(body.generationConfig).sort()).toEqual(['maxOutputTokens', 'responseJsonSchema', 'responseMimeType', 'thinkingConfig']);
    expect(result).toMatchObject({ provider: 'gemini:gemini-4-hydrogen', model: 'gemini-4-hydrogen' });
    expect(raw[0].model).toBe('gemini-4-hydrogen');
    const summary = courseEvaluationSummary('lesson-easy', 1, result);
    expect(summary.model).toBe('gemini-4-hydrogen'); expect(JSON.stringify({ summary, raw })).not.toContain('mock-env-credential');
  });
  it('omits array cardinality keywords throughout the Gemini schema while preserving other constraints', async () => {
    const fetcher = vi.fn(async (_url: any, _init: any) => response());
    await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: fetcher })('Material');
    const body = JSON.parse(fetcher.mock.calls[0][1].body), schema = body.generationConfig.responseJsonSchema;
    expect(JSON.stringify(schema)).not.toMatch(/"(?:minItems|maxItems)":/);
    const question = stepShape(schema).properties.questions.items;
    expect(question.properties.id.pattern).toBe('^[a-z0-9-]{1,32}$');
    expect(question.properties.prompt.maxLength).toBe(2000);
    expect(question.properties.points).toMatchObject({ minimum: 1, maximum: 100 });
    expect(question.properties.answer.anyOf).toHaveLength(2);
    const prompt = body.contents[0].parts[0].text;
    for (const limit of ['1–12 steps', 'questions (1–30)', 'options (2–8)', 'blanks (1–6)', '1–10 non-empty accepted strings']) expect(prompt).toContain(limit);
  });
  it('retains the Gemini response error message in course/evaluator diagnostics', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Request contains an invalid argument: minItems is unsupported.' } }), { status: 400 }));
    const error = await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: fetcher })('Material').catch(e => e);
    expect(error.diagnostics.attempts[0].errors).toEqual(['Gemini HTTP 400: Request contains an invalid argument: minItems is unsupported.']);
    expect(courseEvaluationSummary('lesson-easy', 1, undefined, error).failureReason).toContain('minItems is unsupported');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('honors GEMINI_MODEL and explicit model overrides without forcing Hydrogen thinking options onto other models', async () => {
    vi.stubEnv('GEMINI_MODEL', 'models/custom-model');
    expect(courseGeminiModel()).toBe('custom-model'); expect(courseGeminiModel('explicit-model')).toBe('explicit-model');
    const fetcher = vi.fn(async (_url: any, _init: any) => response());
    const result = await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: fetcher })('Material');
    expect(result.model).toBe('custom-model'); expect(JSON.parse(fetcher.mock.calls[0][1].body).generationConfig).not.toHaveProperty('thinkingConfig');
  });
  it('has a larger configurable course timeout, independently of other provider consumers', () => {
    vi.stubEnv('COURSE_GENERATION_TIMEOUT_MS', ''); expect(courseProviderTimeout()).toBe(180000);
    vi.stubEnv('COURSE_GENERATION_TIMEOUT_MS', '120000'); expect(courseProviderTimeout()).toBe(120000); expect(courseProviderTimeout(240000)).toBe(240000);
    for (const v of ['0', 'NaN', '-1', '600001', '1000.5']) { vi.stubEnv('COURSE_GENERATION_TIMEOUT_MS', v); expect(() => courseProviderTimeout()).toThrow('timeout'); }
  });
});


async function requestedSchema(preset: 'lesson' | 'quiz' | 'exercise' | 'warmup' | 'exam') {
  const fetcher = vi.fn(async (_url: any, _init: any) => new Response(JSON.stringify({ error: { message: 'Mock request captured' } }), { status: 400 }));
  await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: fetcher })('Material', 'medium', preset).catch(() => {});
  expect(fetcher).toHaveBeenCalledTimes(1);
  return JSON.parse(fetcher.mock.calls[0][1].body).generationConfig.responseJsonSchema;
}
describe('preset-specific Gemini required fields', () => {
  it.each(['quiz', 'warmup', 'exam'] as const)('%s requires question-only steps and removes irrelevant code scaffolding', async preset => {
    const schema = await requestedSchema(preset), step = schema.properties.steps.items;
    expect(step.required).toEqual(expect.arrayContaining(['id', 'title', 'instructions', 'durationSec', 'mode', 'questions', 'answerFeedback', 'revealAnswers']));
    expect(step.properties.mode.enum).toEqual(['questions']);
    for (const key of ['brief', 'starter', 'language', 'rubric', 'checks', 'checksWeight']) expect(step.properties).not.toHaveProperty(key);
    expect(step.properties.answerFeedback.enum).toEqual(['after-close']);
    expect(step.properties.revealAnswers.enum).toEqual([preset === 'exam' ? 'never' : 'after-raid']);
  });
  it('exercise requires a mixed code task, questions, per-step hints and Python starter', async () => {
    const step = (await requestedSchema('exercise')).properties.steps.items;
    expect(step.required).toEqual(expect.arrayContaining(['mode', 'questions', 'rubric', 'checks', 'checksWeight', 'brief', 'starter', 'language']));
    expect(step.properties.mode.enum).toEqual(['mixed']);
    expect(step.properties.brief.required).toEqual(expect.arrayContaining(['goal', 'todo', 'doneWhen', 'hints']));
    expect(step.properties.language.enum).toEqual(['python']);
    expect(step.properties.starter.items.required).toEqual(['path', 'content']);
    expect(step.properties.answerFeedback.enum).toEqual(['immediate']);
  });
  it('lesson requires code fields on its single flat step shape, with no question-only escape branch', async () => {
    const step = (await requestedSchema('lesson')).properties.steps.items;
    expect(step.required).toEqual(expect.arrayContaining(['rubric', 'checks', 'checksWeight']));
    expect(step.required).not.toContain('questions'); expect(step.properties.questions).toBeDefined();
    expect(step.properties.mode.enum).toEqual(['code', 'mixed']); expect(step.anyOf).toBeUndefined();
  });
  it.each(['lesson', 'quiz', 'exercise', 'warmup', 'exam'] as const)('%s requires explanations, typed keys and explicit verification without array bounds', async preset => {
    const schema = await requestedSchema(preset), q = stepShape(schema).properties.questions.items;
    expect(JSON.stringify(schema)).not.toMatch(/"(?:minItems|maxItems)":/);
    expect(q.required).toEqual(expect.arrayContaining(['id', 'kind', 'prompt', 'explain', 'verification']));
    const single = q.anyOf.find((b: any) => b.properties.kind.enum[0] === 'single');
    const multi = q.anyOf.find((b: any) => b.properties.kind.enum[0] === 'multi');
    const blank = q.anyOf.find((b: any) => b.properties.kind.enum[0] === 'blank');
    expect(single.required).toEqual(expect.arrayContaining(['options', 'answer'])); expect(single.properties.answer.type).toBe('string');
    expect(multi.required).toEqual(expect.arrayContaining(['options', 'answer'])); expect(multi.properties.answer.type).toBe('array');
    expect(blank.required).toContain('blanks'); expect(q.properties.blanks.items.required).toContain('accept');
    const verification = q.properties.verification.anyOf.find((b: any) => b.type === 'object');
    expect(verification.required).toEqual(['code', 'expression']);
    expect(q.properties.verification.anyOf.some((b: any) => b.type === 'null')).toBe(true);
    const keys = Object.keys(q.properties); expect(keys.indexOf('explain')).toBeLessThan(keys.indexOf('answer'));
  });
  it('requires check text for literal/doctest checks without adding it to file/CI checks', async () => {
    const check = (await requestedSchema('exercise')).properties.steps.items.properties.checks.items;
    const executable = check.anyOf.find((b: any) => b.properties.kind.enum.includes('doctest'));
    expect(executable.properties.kind.enum).toEqual(['contains', 'doctest']); expect(executable.required).toContain('text');
    const file = check.anyOf.find((b: any) => b.properties.kind.enum.includes('file')); expect(file.required).not.toContain('text');
  });
  it('building exercise requirements does not mutate the lesson or exam schemas', async () => {
    const before = await requestedSchema('lesson'); await requestedSchema('exercise');
    expect(await requestedSchema('lesson')).toEqual(before);
    const exam = (await requestedSchema('exam')).properties.steps.items;
    expect(exam.properties).not.toHaveProperty('brief'); expect(exam.properties).not.toHaveProperty('starter');
  });
});
