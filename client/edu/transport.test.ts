import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultRubric as engineDefault, weightedScore as engineScore } from '../../rubric/index.ts';
import { editableRubric } from './rubric.ts';
import { localDefaultRubric, weightPercents } from './rubric-data.ts';
import { fetchFeedbackExport, serverParse } from './transport.ts';

afterEach(() => vi.unstubAllGlobals());

describe('room rubric transport contracts', () => {
  it('posts raw Markdown with room/filename query and the current room token', async () => {
    const rubric = engineDefault(), fetcher = vi.fn().mockResolvedValue(Response.json(rubric));
    vi.stubGlobal('fetch', fetcher);
    const text = 'Testing (30%): at least 20% test files';
    expect(await serverParse({ room: 'ABCD', token: 'room-token' })({ text, filename: 'CS 101.md' })).toEqual(rubric);
    const [url, request] = fetcher.mock.calls[0];
    expect(new URL(url, 'http://localhost').searchParams.get('filename')).toBe('CS 101.md');
    expect(new URL(url, 'http://localhost').searchParams.get('room')).toBe('ABCD');
    expect(request).toMatchObject({ method: 'POST', body: text, headers: { 'Content-Type': 'text/markdown', 'X-Room-Token': 'room-token' } });
    expect(url).not.toContain('room-token');
  });
  it('sends a picked PDF as raw bytes even if the browser reports a generic MIME', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(engineDefault())); vi.stubGlobal('fetch', fetcher);
    const file = new File(['%PDF-1.4'], 'class.pdf', { type: 'application/octet-stream' });
    await serverParse({ room: 'ABCD', token: 'owner' })({ file });
    expect(fetcher.mock.calls[0][1].body).toBe(file);
    expect(fetcher.mock.calls[0][1].headers['Content-Type']).toBe('application/pdf');
  });
  it.each([401, 403, 404])('shows HTTP %s owner/room errors without returning a local preview', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Current teacher token required' }, { status })));
    await expect(serverParse({ room: 'ABCD', token: 'old-owner' })({ text: 'Testing' })).rejects.toThrow('Current teacher token required');
  });
  it('keeps an offline room rubric unchanged, but permits a standalone text preview', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(serverParse({ room: 'ABCD' })({ text: 'Testing' })).rejects.toThrow('current rubric has not changed');
    expect((await serverParse()({ text: 'Testing (30%): target 20%' })).criteria[0].target).toBe(0.2);
  });
  it('authenticates teacher exports and preserves a 404 before the match ends', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('student,repo\nAna,class/parser\n'));
    vi.stubGlobal('fetch', fetcher);
    expect(await fetchFeedbackExport('ABCD', 'teacher-token', 'csv')).toContain('Ana');
    expect(fetcher).toHaveBeenCalledWith('/api/room/ABCD/feedback.csv', { headers: { 'X-Room-Token': 'teacher-token' }, cache: 'no-store' });
    fetcher.mockResolvedValue(Response.json({ error: 'Feedback is available after this classroom match finishes' }, { status: 404 }));
    await expect(fetchFeedbackExport('ABCD', 'teacher-token', 'md')).rejects.toThrow('after this classroom match finishes');
  });
});

describe('editor and server score consistency', () => {
  it('shares the exact default and expands normalized weights without changing scores', () => {
    const rubric = engineDefault(), editable = editableRubric(rubric);
    expect(localDefaultRubric()).toEqual(rubric);
    expect(editable.criteria.map(c => c.weight)).toEqual([25, 20, 20, 20, 5, 5, 5]);
    const rows = rubric.criteria.map((c, i) => ({ criterionId: c.id, score: (i + 1) / 8, evidence: 'measured' }));
    expect(engineScore(editable, rows)).toBe(engineScore(rubric, rows));
    expect(rubric.criteria[0].weight).toBe(0.25);
    expect(weightPercents([{ weight: 0 }, { weight: 0 }, { weight: 0 }])).toEqual([34, 33, 33]);
  });
});
