import { describe, expect, it, vi } from 'vitest';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { createCourseGenerator, validateGeneratedCourse } from './course-generation';
import type { ClassroomPlan, ClassroomQuestion, SingleChoiceQuestion } from '../shared/classroom';

function choice(id = 'choice'): SingleChoiceQuestion {
  return { id, kind: 'single', prompt: 'Which result is correct?', options: [{ id: 'first', text: 'One' }, { id: 'second', text: 'Two' }, { id: 'third', text: 'Three' }], answer: 'second' };
}
function plan(questions: ClassroomQuestion[] = [choice()]): ClassroomPlan {
  const p = defaultClassroomPlan(); p.steps = [{ ...p.steps[0], mode: 'questions', questions }]; return p;
}

describe('course recovery regressions', () => {
  it('drops one invalid blank without losing other valid questions', () => {
    const p = plan([choice(), { id: 'bad', kind: 'blank', prompt: 'Fill {{2}}', blanks: [{ accept: ['two'] }] }]);
    expect(validateGeneratedCourse(p, 'quiz').steps[0].questions?.map(q => q.id)).toEqual(['choice']);
  });
  it('maps a single answer given as option text to its id', () => {
    expect(validateGeneratedCourse(plan([{ ...choice(), answer: 'Two' }]), 'quiz').steps[0].questions![0]).toHaveProperty('answer', 'second');
  });
  it('drops a mismatched brief while retaining the code step', () => {
    const p = defaultClassroomPlan(); p.steps[0].brief = { goal: 'Apply the material.', todo: ['Solve the task.'], doneWhen: ['A mismatched row.'] };
    expect(validateGeneratedCourse(p).steps[0]).not.toHaveProperty('brief');
  });
});

import { parseCourseJson, recoverGeneratedCourse, shuffleCourseOptions, courseKeyHistogram, validationDiagnostics } from './course-output';
import { gradeQuestion } from './classroom-questions';
import { CourseGenerationError } from './course-generation';
const gemini = (value: unknown) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }));
const deepseek = (text: string) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: text } }] }));

describe('unambiguous recovery and item isolation', () => {
  it.each(['Two', ' two ', 'B', '(B)', 'Option B', 'second'])('maps single key %j to its intended option', answer => {
    const diagnostics = validationDiagnostics();
    const result = recoverGeneratedCourse(plan([{ ...choice(), answer }]), 'quiz', diagnostics);
    expect(result.steps[0].questions![0]).toHaveProperty('answer', 'second');
  });
  it('maps multi text, letters and letter lists without changing the answer set', () => {
    for (const answer of [['A', 'Three'], 'A; C', ['first', 'first', 'third']]) {
      const q = { ...choice(), kind: 'multi', answer } as ClassroomQuestion;
      const result = validateGeneratedCourse(plan([q]), 'quiz').steps[0].questions![0];
      expect(result).toHaveProperty('answer', ['first', 'third']);
      expect(gradeQuestion(result, { choices: ['first', 'third'] }).score).toBe(1);
    }
  });
  it('drops ambiguous text, conflicting letter labels and partially invalid multi keys rather than guessing', () => {
    const repeated = { ...choice('ambiguous'), answer: 'Two', options: [{ id: 'x', text: 'Two' }, { id: 'y', text: 'Two' }] };
    const conflict = { ...choice('conflict'), answer: 'B', options: [{ id: 'b', text: 'One' }, { id: 'c', text: 'Two' }] };
    const partial = { ...choice('partial'), kind: 'multi', answer: ['A', 'unknown'] } as ClassroomQuestion;
    const diagnostics = validationDiagnostics(), result = recoverGeneratedCourse(plan([repeated, conflict, partial, choice('valid')]), 'quiz', diagnostics);
    expect(result.steps[0].questions!.map(q => q.id)).toEqual(['valid']); expect(diagnostics.droppedItems).toHaveLength(3);
  });
  it('retains a valid explicit ID even if it is not in its alphabetic position', () => {
    const q = { ...choice(), options: [{ id: 'second', text: 'Two' }, { id: 'first', text: 'One' }, { id: 'third', text: 'Three' }], answer: 'first' };
    expect(validateGeneratedCourse(plan([q]), 'quiz').steps[0].questions![0]).toHaveProperty('answer', 'first');
  });
  it('drops invalid checks and mismatched briefs without mutating code or invalidating good questions', () => {
    const p = plan(); Object.assign(p.steps[0], { mode: 'mixed', checks: [{ id: 'good', kind: 'file', path: 'README.md', label: 'Readme' }, { id: 'bad', kind: 'file', path: '../secret', label: 'Bad' }], brief: { goal: 'Apply.', todo: ['Solve.'], doneWhen: ['One', 'Two'] } });
    const before = structuredClone(p), diagnostics = validationDiagnostics(), result = recoverGeneratedCourse(p, 'exercise', diagnostics);
    expect(result.steps[0].checks).toHaveLength(1); expect(result.steps[0]).not.toHaveProperty('brief'); expect(result.steps[0].questions).toHaveLength(1);
    expect(diagnostics.droppedItems.map(d => d.path)).toEqual(['steps[0].checks[1]', 'steps[0].brief']); expect(p).toEqual(before);
  });
  it('fails if any required question set or the whole plan ends up empty, with actionable errors', () => {
    const bad = { id: 'bad', kind: 'blank', prompt: '{{2}}', blanks: [{ accept: ['two'] }] } as ClassroomQuestion;
    expect(() => validateGeneratedCourse(plan([bad]), 'quiz')).toThrow('markers');
    const p = plan([bad]); p.steps.push({ ...plan().steps[0], id: 'valid-step' });
    expect(() => validateGeneratedCourse(p, 'quiz')).toThrow('steps[0]');
    expect(() => validateGeneratedCourse({ ...p, steps: [] })).toThrow('empty');
  });
  it('renames duplicate question metadata IDs and drops excess questions instead of losing the draft', () => {
    const p = plan(Array.from({ length: 31 }, () => choice()));
    const diagnostics = validationDiagnostics(), result = recoverGeneratedCourse(p, 'quiz', diagnostics);
    expect(result.steps[0].questions).toHaveLength(30);
    expect(new Set(result.steps[0].questions!.map(q => q.id)).size).toBe(30); expect(diagnostics.droppedItems).toHaveLength(1);
  });
});

describe('first complete JSON object extraction', () => {
  it('handles markdown, nested arrays, escaped quotes/braces and trailing extra objects', () => {
    const value = { text: 'a quoted "}" and \\ and {', nested: [{ child: '{"x"}' }] }, diagnostics = validationDiagnostics();
    expect(parseCourseJson(`Here is JSON:\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n${JSON.stringify({ ignored: true })}`, diagnostics)).toEqual(value);
    expect(diagnostics.repairs).toHaveLength(1); expect(parseCourseJson('{} {"later":true}')).toEqual({});
  });
  it.each(['', '{"incomplete":', '{"bad":}', 'only prose'])('rejects incomplete or invalid first object %j', raw => expect(() => parseCourseJson(raw)).toThrow('course'));
  it('accepts a 22 KB complete DeepSeek object followed by extra output without a model retry', async () => {
    const p = defaultClassroomPlan(); for (const step of p.steps) step.instructions = 'x'.repeat(7500);
    const raw = `${JSON.stringify(p)}\nAdditional output that previously broke JSON.parse`; expect(raw.length).toBeGreaterThan(22000);
    const fetcher = vi.fn(async () => deepseek(raw));
    const result = await createCourseGenerator({ apiKey: '', deepseekApiKey: 'mock', fetch: fetcher, seed: 10 })('Material');
    expect(result.provider).toBe('deepseek'); expect(result.plan.steps).toHaveLength(3); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.diagnostics?.repairRounds).toBe(0); expect(result.diagnostics?.repairs[0].reason).toContain('first complete');
  });
});

describe('same-provider repair before fallback', () => {
  it.each(['gemini', 'deepseek'] as const)('sends validation errors and the bad draft back to %s exactly once', async provider => {
    const fetcher = vi.fn().mockResolvedValueOnce(provider === 'gemini' ? gemini({ steps: [] }) : deepseek('{"steps":[]}')).mockResolvedValueOnce(provider === 'gemini' ? gemini(plan()) : deepseek(JSON.stringify(plan())));
    const result = await createCourseGenerator({ apiKey: provider === 'gemini' ? 'mock' : '', deepseekApiKey: 'mock', fetch: fetcher, seed: 1 })('Reference material', 'hard', 'quiz', 'Exactly 1 question.');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe(fetcher.mock.calls[1][0]);
    expect(fetcher.mock.calls[1][1].body).toContain('REPAIR ROUND (one attempt only)');
    expect(fetcher.mock.calls[1][1].body).toContain('plan is empty');
    expect(fetcher.mock.calls[1][1].body).toContain('PREVIOUS MODEL OUTPUT');
    expect(result.diagnostics?.repairRounds).toBe(1);
  });
  it('falls back only after the same-provider repair failed, and repairs the fallback at most once too', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(gemini({ steps: [] })).mockResolvedValueOnce(gemini({ steps: [] })).mockResolvedValueOnce(deepseek('{"steps":[]}')).mockResolvedValueOnce(deepseek(JSON.stringify(plan())));
    const result = await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: 'mock', fetch: fetcher })('Material', 'medium', 'quiz', 'Exactly 1 question.');
    expect(fetcher).toHaveBeenCalledTimes(4); expect(result.provider).toBe('deepseek'); expect(result.diagnostics?.repairRounds).toBe(2);
    expect(fetcher.mock.calls[0][0]).toBe(fetcher.mock.calls[1][0]); expect(fetcher.mock.calls[2][0]).toBe(fetcher.mock.calls[3][0]);
  });
  it('does not spend a repair request on a network/auth failure', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('private upstream payload')).mockResolvedValueOnce(deepseek(JSON.stringify(plan())));
    const result = await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: 'mock', fetch: fetcher })('Material', 'medium', 'quiz', 'Exactly 1 question.');
    expect(fetcher).toHaveBeenCalledTimes(2); expect(result.diagnostics?.repairRounds).toBe(0); expect(JSON.stringify(result.diagnostics)).not.toContain('private upstream');
  });
  it('keeps good questions and records dropped items without spending a repair round', async () => {
    const invalid = { id: 'bad', kind: 'blank', prompt: '{{3}}', blanks: [{ accept: ['three'] }] } as ClassroomQuestion;
    const fetcher = vi.fn(async () => gemini(plan([choice(), invalid])));
    const result = await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: fetcher })('Material', 'medium', 'quiz', 'Exactly 1 question.');
    expect(fetcher).toHaveBeenCalledTimes(1); expect(result.plan.steps[0].questions).toHaveLength(1);
    expect(result.diagnostics?.droppedItems).toHaveLength(1); expect(result.diagnostics?.repairRounds).toBe(0);
  });
  it('records diagnostics on complete failure and never retries a provider more than once', async () => {
    const fetcher = vi.fn(async () => deepseek('{"steps":[]}'));
    const error = await createCourseGenerator({ apiKey: '', deepseekApiKey: 'mock', fetch: fetcher })('Material').catch(e => e);
    expect(error).toBeInstanceOf(CourseGenerationError); expect(error.diagnostics.attempts).toHaveLength(2); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('repairs incomplete JSON using the original raw text as untrusted data', async () => {
    const raw = '{"title":"truncated"', captured: string[] = [];
    const fetcher = vi.fn().mockResolvedValueOnce(deepseek(raw)).mockResolvedValueOnce(deepseek(JSON.stringify(plan())));
    const result = await createCourseGenerator({ apiKey: '', deepseekApiKey: 'mock', fetch: fetcher, onRawResponse: r => captured.push(r.content) })('Material', 'medium', 'quiz', 'Exactly 1 question.');
    expect(result.diagnostics?.repairRounds).toBe(1); expect(captured[0]).toBe(raw); expect(fetcher.mock.calls[1][1].body).toContain('no complete object');
  });
});

describe('seeded option presentation and quality prompts', () => {
  it('remaps IDs and keys together while preserving answer meaning, text, grades and seed determinism', () => {
    const p = plan([choice(), { ...choice('multi'), kind: 'multi', answer: ['first', 'third'] }]); const before = structuredClone(p);
    const a = shuffleCourseOptions(p, 42), b = shuffleCourseOptions(p, 42);
    expect(a).toEqual(b); expect(p).toEqual(before);
    for (const [i, q] of a.steps[0].questions!.entries()) if (q.kind !== 'blank') {
      const original = p.steps[0].questions![i] as SingleChoiceQuestion;
      expect(q.options.map(o => o.text).sort()).toEqual(original.options.map(o => o.text).sort());
      expect(q.options.map(o => o.id)).toEqual(['a', 'b', 'c']);
    }
    const single = a.steps[0].questions![0] as SingleChoiceQuestion;
    expect(single.options.find(o => o.id === single.answer)!.text).toBe('Two');
    expect(gradeQuestion(single, { choice: single.answer }).score).toBe(1);
    const multi = a.steps[0].questions![1];
    if (multi.kind !== 'multi') throw new Error('Expected multi');
    expect(multi.answer.map(id => multi.options.find(o => o.id === id)!.text).sort()).toEqual(['One', 'Three']);
    expect(gradeQuestion(multi, { choices: multi.answer }).score).toBe(1);
  });
  it.each([2, 3, 4, 8])('spreads correct keys uniformly across %i positions over fixed seeds', count => {
    const p = plan([{ ...choice(), options: Array.from({ length: count }, (_, i) => ({ id: `o${i}`, text: `Choice ${i}` })), answer: 'o0' }]);
    const total = Array(count).fill(0);
    for (let seed = 0; seed < 4000; seed++) {
      const shuffled = shuffleCourseOptions(p, seed), question = shuffled.steps[0].questions![0] as SingleChoiceQuestion;
      const position = question.options.findIndex(o => o.text === 'Choice 0');
      expect(question.answer).toBe(String.fromCharCode(97 + position));
      courseKeyHistogram(shuffled)[count].forEach((n, i) => total[i] += n);
    }
    for (const n of total) expect(Math.abs(n - 4000 / count)).toBeLessThan(4000 / count * .15);
  });
  it('requests self-contained code, similar option lengths and energetic but objectively keyed warmups', async () => {
    let request: any;
    const fetcher = vi.fn(async (_url: any, init: any) => { request = JSON.parse(init.body); return gemini(plan()); });
    await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: fetcher })('Material', 'easy', 'warmup', 'Exactly 1 question.');
    const prompt: string = request.contents[0].parts[0].text;
    for (const phrase of ['options of similar length', 'self-contained', 'quote all needed code inline', "never refer to 'Question N'", 'page numbers', 'which bug would you rather debug', 'guess-the-output races', 'true/false lightning rounds', 'opinion-only preference is not a graded correct answer']) expect(prompt).toContain(phrase);
  });
});

it('normalizes generated never-reveal plans to after-close before returning them', async () => {
  const p = plan(); Object.assign(p.steps[0], { mode: 'mixed', answerFeedback: 'immediate', revealAnswers: 'never' });
  expect(validateGeneratedCourse(p).steps[0]).toMatchObject({ answerFeedback: 'after-close', revealAnswers: 'never' });
  const fetcher = vi.fn(async () => gemini(p));
  expect((await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: fetcher })('Material')).plan.steps[0]).toMatchObject({ answerFeedback: 'after-close', revealAnswers: 'never' });
});

it('does not ask the model to repair a local evaluation-output write failure', async () => {
  const fetcher = vi.fn(async () => gemini(plan()));
  const generate = createCourseGenerator({ apiKey: 'mock', deepseekApiKey: 'mock', fetch: fetcher, onRawResponse: () => { throw new Error('output directory unavailable'); } });
  await expect(generate('Material', 'medium', 'quiz', 'Exactly 1 question.')).rejects.toThrow('output directory unavailable');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('isolates a bad rubric criterion, preserves valid zero weights, and repairs duplicate step metadata', () => {
  const p = defaultClassroomPlan(), good = p.steps[0].rubric.criteria[0];
  p.steps[0].rubric.criteria = [good, { ...good, id: 'zero', weight: 0 }, { ...good, id: 'bad', signal: 'not-supported' as never }];
  p.steps[1].id = p.steps[0].id;
  const diagnostics = validationDiagnostics(), result = recoverGeneratedCourse(p, 'lesson', diagnostics);
  expect(result.steps[0].rubric.criteria.map(c => c.id)).toEqual([good.id, 'zero']);
  expect(result.steps[0].rubric.criteria[1].weight).toBe(0); expect(new Set(result.steps.map(s => s.id)).size).toBe(3);
  expect(diagnostics.droppedItems).toContainEqual(expect.objectContaining({ path: 'steps[0].rubric.criteria[2]' }));
});
