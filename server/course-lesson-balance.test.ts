import { describe, expect, it, vi } from 'vitest';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import type { ClassroomPlan, ClassroomQuestion } from '../shared/classroom';
import { normalizeClassroomPlan } from './classroom';
import { recoverGeneratedCourse, validationDiagnostics, shuffleCourseOptions, courseKeyHistogram } from './course-output';
import { createCourseGenerator } from './course-generation';
import { gradeQuestion } from './classroom-questions';

const question = (id: string, count = 4): ClassroomQuestion => ({ id, kind: 'single', prompt: 'Choose the matching value.', explain: 'The first value matches the stated facts.', options: Array.from({ length: count }, (_, i) => ({ id: 'o' + i, text: 'Value ' + i })), answer: 'o0' });
function codePlan(mode: 'questions' | 'mixed', questions?: ClassroomQuestion[]): ClassroomPlan {
  const p = defaultClassroomPlan(); p.steps = [{ ...p.steps[0], mode, ...(questions === undefined ? {} : { questions }) }]; return p;
}
const gemini = (p: any) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(p) }] } }] }));
function balanced(p: ClassroomPlan) { for (const counts of Object.values(courseKeyHistogram(p))) expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1); }

describe('lesson omission recovery', () => {
  it.each(['questions', 'mixed'] as const)('downgrades %s without questions only when the code task validates', mode => {
    for (const questions of [undefined, null, []]) {
      const p = codePlan(mode, questions as never), before = structuredClone(p), d = validationDiagnostics();
      const result = recoverGeneratedCourse(p, 'lesson', d);
      expect(result.steps[0].mode).toBe('code'); expect(result.steps[0]).not.toHaveProperty('questions');
      expect(d.repairs).toContainEqual(expect.objectContaining({ path: 'steps[0].mode', reason: expect.stringContaining('code') }));
      expect(d.droppedItems).toEqual([]); expect(p).toEqual(before);
      expect(() => normalizeClassroomPlan(p)).toThrow('question');
    }
  });
  it('preserves valid question/mixed steps, rejects invalid code, and never changes question-only presets to code', () => {
    expect(recoverGeneratedCourse(codePlan('mixed', [question('q')])).steps[0].mode).toBe('mixed');
    const bad: any = codePlan('mixed'); bad.steps[0].rubric = { title: 'Unused', source: 'default', criteria: [] };
    expect(() => recoverGeneratedCourse(bad)).toThrow('cannot become code');
    const noWeight: any = codePlan('mixed'); delete noWeight.steps[0].checksWeight;
    expect(() => recoverGeneratedCourse(noWeight)).toThrow('Invalid step duration, checks or weights');
    for (const preset of ['quiz', 'warmup', 'exercise', 'exam'] as const) expect(() => recoverGeneratedCourse(codePlan('mixed'), preset)).toThrow('question');
  });
  it('recovers missing arrays on the Gemini path but still repairs unmet exact teacher counts', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(gemini(codePlan('mixed'))).mockResolvedValueOnce(gemini(codePlan('mixed', [question('q')])));
    const result = await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: fetcher })('Material', 'medium', 'lesson', 'Exactly 1 question.');
    expect(result.diagnostics?.repairRounds).toBe(1); expect(result.plan.steps[0].questions).toHaveLength(1);
    expect(fetcher.mock.calls[1][1].body).toContain('generated 0');
  });
  it('requires a code task on every Gemini lesson step, with optional mixed checkpoints', async () => {
    let request: any;
    await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: async (_url, init) => { request = JSON.parse(init!.body as string); return gemini(codePlan('mixed')); } })('Material');
    const step = request.generationConfig.responseJsonSchema.properties.steps.items;
    expect(step.type).toBe('object'); expect(step.anyOf).toBeUndefined();
    expect(step.properties.mode.enum).toEqual(['code', 'mixed']);
    expect(step.required).toEqual(expect.arrayContaining(['id', 'title', 'instructions', 'durationSec', 'mode', 'rubric', 'checks', 'checksWeight']));
    expect(step.required).not.toContain('questions'); expect(step.properties.questions).toBeDefined();
  });
});

describe('default question-count guidance', () => {
  it.each([['quiz', '8–12 questions total'], ['warmup', '6–10 questions total'], ['exam', '10–15 questions total'], ['exercise', '2–4 questions per step plus a code task']] as const)('requests the target for %s', async (preset, phrase) => {
    let prompt = '';
    const generate = createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: async (_url, init) => { prompt = JSON.parse(init!.body as string).contents[0].parts[0].text; return new Response('{}', { status: 400 }); } });
    await generate('Six-page source', 'medium', preset).catch(() => {});
    expect(prompt).toContain(phrase); expect(prompt).not.toContain('1–2 steps with 4–6 total questions');
    expect(prompt).not.toContain('For exercises use exactly 1 question');
    await generate('Six-page source', 'medium', preset, 'Exactly 5 questions.').catch(() => {});
    expect(prompt).toContain('Exactly 5 questions TOTAL'); expect(prompt).not.toContain(phrase);
  });
});

describe('lesson-wide answer-position balance', () => {
  it('balances small single/multi buckets across steps and preserves each key meaning and grade', () => {
    const p = codePlan('questions', []);
    p.steps = Array.from({ length: 5 }, (_, i) => ({ ...structuredClone(p.steps[0]), id: 's' + i, questions: [question('q' + i)] }));
    p.steps[1].questions!.push({ ...question('multi'), kind: 'multi', answer: ['o0', 'o1'], scoring: 'partial' } as ClassroomQuestion);
    p.steps[2].questions!.push(question('three', 3));
    const before = structuredClone(p);
    for (const seed of [0, 1, 42, 20261113]) {
      const shuffled = shuffleCourseOptions(p, seed); balanced(shuffled); expect(shuffleCourseOptions(p, seed)).toEqual(shuffled);
      for (const s of shuffled.steps) for (const q of s.questions ?? []) if (q.kind !== 'blank') {
        const keys = q.kind === 'single' ? [q.answer] : q.answer;
        expect(keys.map(id => q.options.find(o => o.id === id)!.text).sort()).toEqual(q.kind === 'single' ? ['Value 0'] : ['Value 0', 'Value 1']);
        expect(gradeQuestion(q, q.kind === 'single' ? { choice: q.answer } : { choices: q.answer }).score).toBe(1);
      }
    }
    expect(p).toEqual(before);
  });
  it.each(['gemini', 'deepseek'] as const)('applies balance to every generated %s lesson, not across evaluation cases', async provider => {
    const p = codePlan('questions', Array.from({ length: 9 }, (_, i) => question('q' + i)));
    const fetcher = vi.fn(async () => provider === 'gemini' ? gemini(p) : new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(p) } }] })));
    const generate = createCourseGenerator({ apiKey: provider === 'gemini' ? 'mock' : '', deepseekApiKey: 'mock', fetch: fetcher, seed: 42 });
    const first = await generate('Material', 'medium', 'quiz'), second = await generate('Material', 'medium', 'quiz');
    balanced(first.plan); balanced(second.plan); expect(second.plan).toEqual(first.plan); expect(first.provider).toContain(provider);
  });
});
