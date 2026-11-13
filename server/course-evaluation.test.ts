import { describe, expect, it, vi } from 'vitest';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { normalizeClassroomPlan } from './classroom';
import { recoverGeneratedCourse, validationDiagnostics } from './course-output';
import { courseEvaluationSummary } from './course-evaluation';
import { createCourseGenerator, CourseGenerationError } from './course-generation';

const reply = (content: string, finish_reason = 'stop') => new Response(JSON.stringify({ choices: [{ finish_reason, message: { content } }] }));
function validPlan() {
  const p = defaultClassroomPlan(); p.steps = [{ ...p.steps[0], mode: 'questions', questions: [
    { id: 'q', kind: 'single', prompt: 'Choose a value.', options: [{ id: 'a', text: 'One' }, { id: 'b', text: 'Two' }], answer: 'a' },
  ] }]; return p;
}

describe('eval1 failure and drop regressions', () => {
  it('repairs one missing blank marker without changing correctness or weakening the strict plan validator', () => {
    const p = validPlan(); p.steps[0].questions = [{ id: 'blank', kind: 'blank', prompt: 'What index is returned? Enter the number.', blanks: [{ accept: ['1'], numeric: { value: 1, tolerance: 0 } }] }];
    const before = structuredClone(p), diagnostics = validationDiagnostics();
    const result = recoverGeneratedCourse(p, 'quiz', diagnostics);
    expect(result.steps[0].questions![0]).toMatchObject({ prompt: p.steps[0].questions[0].prompt + '\n{{1}}', blanks: [{ accept: ['1'], numeric: { value: 1, tolerance: 0 } }] });
    expect(diagnostics.droppedItems).toEqual([]); expect(diagnostics.repairs).toHaveLength(1); expect(p).toEqual(before);
    expect(() => normalizeClassroomPlan(p)).toThrow('markers');
  });
  it('does not invent keys from explanations or guess multiple missing blank placements', () => {
    const p = validPlan(); p.steps[0].questions!.push(
      { id: 'missing-key', kind: 'single', prompt: 'Pick.', options: [{ id: 'a', text: 'One' }, { id: 'b', text: 'Two' }], explain: 'The answer is One.' } as never,
      { id: 'two-blanks', kind: 'blank', prompt: 'What are the results?', blanks: [{ accept: ['1'] }, { accept: ['2'] }] },
    );
    const diagnostics = validationDiagnostics(); expect(recoverGeneratedCourse(p, 'quiz', diagnostics).steps[0].questions).toHaveLength(1);
    expect(diagnostics.droppedItems).toHaveLength(2);
  });
  it('captures a length-limited response and repairs it on the same provider without accepting the incomplete draft', async () => {
    const captured: { content: string; finishReason?: string }[] = [];
    const raw = JSON.stringify(validPlan());
    const fetcher = vi.fn().mockResolvedValueOnce(reply(raw, 'length')).mockResolvedValueOnce(reply(raw));
    const result = await createCourseGenerator({ apiKey: '', deepseekApiKey: 'mock', fetch: fetcher, onRawResponse: r => captured.push(r) })('Material', 'extreme', 'quiz', 'Exactly 1 question.');
    expect(fetcher).toHaveBeenCalledTimes(2); expect(captured[0]).toMatchObject({ content: raw, finishReason: 'length' });
    expect(result.diagnostics?.attempts[0].errors).toContain('Incomplete DeepSeek response (finish_reason=length)');
    expect(result.diagnostics?.repairRounds).toBe(1);
    expect(fetcher.mock.calls[1][1].body).toContain('finish_reason=length');
    for (const [, init] of fetcher.mock.calls) { expect(JSON.parse(init.body).max_tokens).toBe(16384); expect(JSON.parse(init.body).thinking).toEqual({ type: 'enabled' }); expect(JSON.parse(init.body).reasoning_effort).toBe('high'); }
  });
  it('records safe HTTP and timeout reasons instead of hiding pre-validation failures', async () => {
    const http = vi.fn(async () => new Response('PRIVATE_PROVIDER_BODY', { status: 403 }));
    const error = await createCourseGenerator({ apiKey: '', deepseekApiKey: 'mock', fetch: http })('Material').catch(e => e);
    expect(error.diagnostics.attempts[0].errors).toEqual(['DeepSeek HTTP 403']); expect(JSON.stringify(error.diagnostics)).not.toContain('PRIVATE_PROVIDER_BODY');
    const timeoutFetch = vi.fn((_url: any, init: any) => new Promise<Response>((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('private timeout body')))));
    const timeout = await createCourseGenerator({ apiKey: '', deepseekApiKey: 'mock', fetch: timeoutFetch, timeoutMs: 5 })('Material').catch(e => e);
    expect(timeout.diagnostics.attempts[0].errors).toEqual(['DeepSeek request timed out after 5 ms']);
  });
  it('prints/saves every dropped item with its error and the complete provider failure chain', () => {
    const diagnostics = { seed: 1, repairRounds: 1, repairs: [], droppedItems: [
      { path: 'steps[0].questions[0]', reason: 'Missing answer', provider: 'deepseek', attempt: 1 },
      { path: 'steps[1].questions[0]', reason: 'Invalid marker', provider: 'deepseek', attempt: 1 },
    ], attempts: [{ provider: 'deepseek', repair: false, errors: ['Empty required question set'] }, { provider: 'deepseek', repair: true, errors: ['Incomplete DeepSeek response (finish_reason=length)'] }] };
    const summary = courseEvaluationSummary('exercise-extreme', 58000, undefined, new CourseGenerationError(diagnostics));
    expect(summary.failureReason).toContain('Empty required question set'); expect(summary.failureReason).toContain('finish_reason=length');
    expect(summary.droppedDetails).toEqual(diagnostics.droppedItems); expect(summary.attemptErrors).toHaveLength(2);
    const encoded = JSON.stringify(summary); for (const d of diagnostics.droppedItems) { expect(encoded).toContain(d.path); expect(encoded).toContain(d.reason); }
  });
  it('gives DeepSeek compact complete code-field and answer-key instructions', async () => {
    let prompt = '';
    const fetcher = vi.fn(async (_url: any, init: any) => { prompt = JSON.parse(init.body).messages[0].content; return reply(JSON.stringify(defaultClassroomPlan())); });
    await createCourseGenerator({ apiKey: '', deepseekApiKey: 'mock', fetch: fetcher })('Material', 'extreme', 'lesson');
    for (const phrase of ['Extreme means deeper reasoning, not more steps', 'Each code/mixed STEP', '1–3 criteria', 'MUST have its own explicit answer field', 'no {{1}} input marker is INVALID', 'doneWhen is an array of strings']) expect(prompt).toContain(phrase);
    expect(prompt).toContain('"answer":"b"'); expect(prompt).not.toContain('\\"answer\\"');
  });
});
