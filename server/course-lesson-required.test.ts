import { describe, expect, it, vi } from 'vitest';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { createCourseGenerator } from './course-generation';
import { courseEvaluationSummary } from './course-evaluation';
import { recoverGeneratedCourse, validationDiagnostics } from './course-output';

const gemini = (p: unknown) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(p) }] } }] }));
const deepseek = () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(defaultClassroomPlan()) } }] }));
function shell() {
  return { title: 'Searching and Merging Sorted Lists', bossName: 'The Sentinel Warden', steps: [{ id: 'search', title: 'Search', instructions: 'Implement linearSearch(numList, item) in main.py. Then answer the checkpoint questions below.', durationSec: 900, mode: 'questions', questions: [], questionContext: null, answerFeedback: 'after-close', revealAnswers: 'after-raid' }] };
}

describe('Hydrogen round-4 lesson shells', () => {
  it.each(['easy', 'extreme'] as const)('rejects the unrecoverable %s shell and asks for actual code fields in one repair', async difficulty => {
    const raw = shell(), before = structuredClone(raw), diagnostics = validationDiagnostics();
    expect(() => recoverGeneratedCourse(raw, 'lesson', diagnostics)).toThrow('Empty question step cannot become code');
    expect(diagnostics.repairs).toEqual([]); expect(raw).toEqual(before);
    const fetcher = vi.fn().mockResolvedValueOnce(gemini(raw)).mockResolvedValueOnce(gemini(defaultClassroomPlan()));
    const result = await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: fetcher })('Teach the given searching functions.', difficulty, 'lesson');
    expect(result.diagnostics?.repairRounds).toBe(1); expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [, init] of fetcher.mock.calls) {
      const body = JSON.parse(init.body), step = body.generationConfig.responseJsonSchema.properties.steps.items;
      expect(step.required).toEqual(expect.arrayContaining(['rubric', 'checks', 'checksWeight']));
      expect(step.properties.mode.enum).toEqual(['code', 'mixed']); expect(step.anyOf).toBeUndefined();
      const prompt = body.contents[0].parts[0].text;
      expect(prompt).toContain('LESSON REQUIRED SHAPE'); expect(prompt).toContain('Never use mode:"questions" for the lesson preset');
      expect(prompt).not.toContain('for non-coding material use question sets');
    }
    expect(fetcher.mock.calls[1][1].body).toContain('Empty question step cannot become code');
    for (const step of result.plan.steps) { expect(step.mode ?? 'code').toBe('code'); expect(step.rubric.criteria.length).toBeGreaterThan(0); expect(Array.isArray(step.checks)).toBe(true); expect(step.checksWeight).toBeGreaterThanOrEqual(0); }
  });
  it('rejects a generated question-only lesson even with valid questions; teacher plans remain supported', async () => {
    const raw = shell(); raw.steps[0].questions = [{ id: 'q', kind: 'single', prompt: 'Which search needs sorted data?', options: [{ id: 'a', text: 'Binary' }, { id: 'b', text: 'Linear' }], answer: 'a', explain: 'Binary search uses sortedness.', verification: null }] as never;
    expect(recoverGeneratedCourse(raw, 'lesson').steps[0].mode).toBe('questions');
    const fetcher = vi.fn(async () => gemini(raw));
    const error = await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: fetcher })('Searching').catch(e => e);
    expect(error.diagnostics.attempts).toHaveLength(2);
    expect(error.diagnostics.attempts[0].errors.join(' ')).toContain('lesson requires a code task on every step');
  });
});

describe('Gemini quota/rate fallback', () => {
  it.each([[402, 'billing', 'Prepaid credits depleted'], [429, 'rate-limit', 'Resource exhausted']] as const)('switches immediately from HTTP %s to DeepSeek and retains actionable diagnostics', async (status, kind, message) => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (url: any) => {
      calls.push(String(url));
      return calls.length === 1 ? new Response(JSON.stringify({ error: { message } }), { status }) : deepseek();
    });
    const result = await createCourseGenerator({ apiKey: 'gemini-mock', deepseekApiKey: 'deepseek-mock', fetch: fetcher })('Search material');
    expect(calls).toHaveLength(2); expect(calls[0]).toContain('generativelanguage'); expect(calls[1]).toContain('api.deepseek.com');
    expect(result.provider).toBe('deepseek'); expect(result.diagnostics?.repairRounds).toBe(0);
    expect(result.diagnostics?.attempts[0]).toMatchObject({ repair: false, httpStatus: status, failureKind: kind, errors: [expect.stringContaining(message)] });
    expect(result.diagnostics?.fallbacks).toEqual([expect.objectContaining({ from: expect.stringContaining('gemini:'), to: 'deepseek', httpStatus: status, reason: expect.stringContaining(message) })]);
    const summary = courseEvaluationSummary('lesson-easy', 1, result);
    expect(summary.status).toBe('PASS'); expect(summary.provider).toBe('deepseek'); expect(summary.fallbacks).toEqual(result.diagnostics?.fallbacks);
    expect(summary.attemptErrors[0]).toMatchObject({ httpStatus: status, failureKind: kind });
  });
  it.each([402, 429])('reports HTTP %s clearly when fallback is explicitly disabled', async status => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Quota unavailable' } }), { status }));
    const error = await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: fetcher })('Material').catch(e => e);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(error.diagnostics.repairRounds).toBe(0);
    expect(error.diagnostics.attempts[0].httpStatus).toBe(status); expect(error.diagnostics.fallbacks ?? []).toEqual([]);
    expect(courseEvaluationSummary('lesson-easy', 1, undefined, error).failureReason).toContain('Gemini HTTP ' + status);
  });
  it.each([402, 429])('also switches immediately if a repair request hits HTTP %s', async status => {
    const fetcher = vi.fn().mockResolvedValueOnce(gemini(shell()))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Quota unavailable during repair' } }), { status }))
      .mockResolvedValueOnce(deepseek());
    const result = await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: 'mock', fetch: fetcher })('Material');
    expect(fetcher).toHaveBeenCalledTimes(3); expect(result.provider).toBe('deepseek');
    expect(result.diagnostics?.repairRounds).toBe(1);
    expect(result.diagnostics?.attempts[1]).toMatchObject({ repair: true, httpStatus: status });
    expect(result.diagnostics?.fallbacks).toHaveLength(1); expect(result.diagnostics?.fallbacks?.[0].httpStatus).toBe(status);
    expect(String(fetcher.mock.calls[2][0])).toContain('api.deepseek.com');
  });
});
