import { describe, expect, it, vi } from 'vitest';
import { createClassroomReviewer, parseReview, type ReviewInput } from './classroom-review';
import { ClassroomSession } from './classroom';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { profileFromFiles } from '../analysis/graph';
import { gradesExport } from './classroom-export';

const settings = { automaticWeight: 50, checklist: ['Readable names', 'Correct edge cases'] };
const response = { items: [{ id: 0, verdict: 'pass', reason: 'main.py:1 names the result.' }, { id: 1, verdict: 'fail', reason: 'main.py:2 ignores empty input.' }], summary: 'Check empty inputs.', concerns: ['Teacher-only concern'] };
const input: ReviewInput = { settings, step: defaultClassroomPlan().steps[0], files: [{ path: 'main.py', text: 'answer = 42' }], checks: [{ label: 'Example', passed: true, detail: '1/1 examples passed' }] };
const gemini = (value: unknown) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }));

describe('AI checklist review provider', () => {
  it('derives scores from complete verdicts and rejects missing, duplicate or invalid items', () => {
    expect(parseReview(response, 2, 'mock').score).toBe(50);
    expect(parseReview({ ...response, items: response.items.map(i => ({ ...i, verdict: 'n/a' })) }, 2, 'mock')).toMatchObject({ status: 'pending' });
    expect(parseReview({ ...response, items: [{ ...response.items[0], verdict: 'partial' }, { ...response.items[1], verdict: 'n/a' }] }, 2, 'mock').score).toBe(50);
    for (const items of [response.items.slice(0, 1), [response.items[0], response.items[0]], [{ ...response.items[0], verdict: 'excellent' }, response.items[1]]]) expect(() => parseReview({ ...response, items }, 2, 'mock')).toThrow();
  });
  it('uses task, source, checks and checklist, ignores any model-provided numeric score', async () => {
    const fetcher = vi.fn(async () => gemini({ ...response, score: 100 }));
    const reviewer = createClassroomReviewer({ apiKey: 'mock-key', deepseekApiKey: '', fetch: fetcher });
    expect(await reviewer(input)).toMatchObject({ score: 50, status: 'complete' });
    const request = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    const prompt = request.contents[0].parts[0].text;
    expect(prompt).toContain('answer = 42'); expect(prompt).toContain('Readable names'); expect(prompt).toContain('1/1 examples passed'); expect(prompt).toContain(JSON.stringify(input.step.instructions));
  });
  it('never sends credentialed/private or oversized source to a provider', async () => {
    const fetcher = vi.fn();
    const reviewer = createClassroomReviewer({ apiKey: 'mock-key', deepseekApiKey: '', fetch: fetcher });
    expect((await reviewer({ ...input, credentialed: true })).status).toBe('pending');
    expect((await reviewer({ ...input, files: [{ path: 'huge.py', text: 'x'.repeat(80001) }] })).status).toBe('pending');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('falls back to DeepSeek on malformed Gemini output; fails visibly when both providers fail', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(gemini({})).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(response) } }] })));
    const reviewer = createClassroomReviewer({ apiKey: 'mock', deepseekApiKey: 'mock', fetch: fetcher });
    expect(await reviewer(input)).toMatchObject({ provider: 'deepseek', score: 50 });
    const failed = createClassroomReviewer({ apiKey: 'mock', deepseekApiKey: 'mock', fetch: vi.fn().mockRejectedValue(new Error('offline')) });
    expect(await failed(input)).toMatchObject({ status: 'pending' });
    const offline = createClassroomReviewer({ apiKey: '', deepseekApiKey: '', fetch: vi.fn() });
    expect((await offline(input)).status).toBe('pending');
  });
});

function lesson() {
  let time = 1000;
  const plan = defaultClassroomPlan(); plan.grading = structuredClone(settings);
  plan.steps[0].checks = [{ id: 'check-0', label: 'File', kind: 'file', path: 'main.py' }]; plan.steps[0].checksWeight = 100; delete plan.steps[0].brief;
  const session = new ClassroomSession(plan, () => time);
  session.roster([{ id: 'a', name: 'Ada', connected: true }]); session.control('start');
  const files = input.files;
  const source = { files, profile: profileFromFiles('demo/repo', files), commit: 'a'.repeat(40), checks: [] };
  return { session, source, advance: () => { time += 5000; } };
}

describe('50/50 classroom grading', () => {
  it('blends 100 automatic + 50 AI to 75; teacher 20 replaces AI to give 60', () => {
    const { session, source } = lesson();
    session.accept(session.begin('a', 'demo/repo'), { ...source, aiReview: parseReview(response, 2, 'mock') });
    expect(session.state.rows[0].score).toBe(75);
    expect(session.privatePayload('a', false).reports.a.aiReview).not.toHaveProperty('concerns');
    expect(session.privatePayload('teacher', true).reports.a.aiReview?.concerns).toEqual(['Teacher-only concern']);
    expect(session.privatePayload('b', false).reports).toEqual({});
    session.review('a', 20, 'Teacher inspected this exact commit.');
    expect(session.state.rows[0]).toMatchObject({ score: 60, reviewPending: false });
    session.control('attack');
    expect(session.state.rounds[0].attacks[0].score).toBe(60);
    expect(gradesExport(session.publicState('teacher'), 'csv')).toContain('"reviewed"');
  });
  it('keeps missing review provisional in feedback, saved rounds, and grade exports', () => {
    const { session, source } = lesson();
    session.accept(session.begin('a', 'demo/repo'), source);
    expect(session.privatePayload('a', false).reports.a).toMatchObject({ score: 100, automaticScore: 100, reviewPending: true });
    session.control('attack');
    const restored = ClassroomSession.restore(JSON.parse(JSON.stringify(session.save())));
    expect(restored.state.rounds[0].attacks[0].reviewPending).toBe(true);
    expect(gradesExport(restored.publicState('teacher'), 'csv')).toContain('provisional: review pending');
  });
  it('honors nondefault weights, rejects invalid settings, and isolates reviews across commits', () => {
    const { session, source, advance } = lesson();
    session.state.plan.grading!.automaticWeight = 20;
    session.accept(session.begin('a', 'demo/repo'), { ...source, aiReview: parseReview(response, 2, 'mock') });
    expect(session.state.rows[0].score).toBe(60);
    session.review('a', 0, 'No review credit.'); expect(session.state.rows[0].score).toBe(20);
    advance(); const ticket = session.begin('a', 'demo/repo'); session.fail(ticket, 'Network error');
    expect(session.state.rows[0].score).toBe(20);
    advance(); session.accept(session.begin('a', 'demo/repo'), { ...source, commit: 'b'.repeat(40) });
    expect(session.privatePayload('a', true).reports.a.reviewPending).toBe(true);
    expect(session.privatePayload('a', true).reports.a.teacherReview).toBeUndefined();
    const plan = defaultClassroomPlan(); plan.grading = { ...settings, automaticWeight: NaN };
    expect(() => new ClassroomSession(plan)).toThrow(/Review needs/);
  });
});
