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
    const fetcher = vi.fn().mockResolvedValueOnce(gemini({ steps: [] })).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(defaultClassroomPlan()) } }] })));
    expect(await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: 'mock', fetch: fetcher })('Teach Python')).toMatchObject({ provider: 'deepseek' });
    expect(fetcher).toHaveBeenCalledTimes(2);
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
  it('rejects invalid checks, duplicate ids, and oversized model output', () => {
    const plan = defaultClassroomPlan(); plan.steps[1].id = plan.steps[0].id;
    expect(() => validateGeneratedCourse(plan)).toThrow('unique');
    plan.steps[1].id = 'other'; plan.steps[0].checks = [{ id: 'bad', kind: 'file', label: 'Bad', path: '../secret' }];
    expect(() => validateGeneratedCourse(plan)).toThrow('relative');
    expect(() => validateGeneratedCourse({ ...plan, title: 'x'.repeat(256001) })).toThrow('too large');
  });
});
