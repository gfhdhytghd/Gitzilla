import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTestDom, type TestNode } from '../edu/test-dom';
import { defaultClassroomPlan } from '../../shared/classroom-defaults';
import { createCourseUpload, mergeCourseDraft } from './course-upload';
const tick = async () => { await new Promise(r => setTimeout(r, 0)); };
beforeEach(() => installTestDom());
afterEach(() => vi.unstubAllGlobals());
function fixture(fetcher = vi.fn(async () => new Response(JSON.stringify({ plan: defaultClassroomPlan(), provider: 'mock', preview: true })))) {
  const apply = vi.fn(); const view = createCourseUpload({ room: 'ABCD', token: 'owner', fetch: fetcher, onApply: apply });
  const root = view.el as unknown as TestNode;
  const get = (id: string) => root.querySelector(`[data-testid="${id}"]`)!;
  Object.assign(get('course-file'), { files: [new File(['# Python'], 'lesson.md')] });
  return { ...view, get, apply, fetcher };
}
describe('course upload component', () => {
  it('shows editable preview and applies only on explicit Apply draft', async () => {
    const f = fixture(); f.get('course-generate').click(); await tick();
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.get('course-preview').textContent).toContain('Apply draft');
    f.get('course-preview-title').value = 'Edited lesson';
    f.get('course-apply').click(); expect(f.apply).toHaveBeenCalledWith(expect.objectContaining({ title: 'Edited lesson' }));
    expect(f.fetcher).toHaveBeenCalledWith(expect.stringContaining('room=ABCD'), expect.objectContaining({ headers: expect.objectContaining({ 'X-Room-Token': 'owner' }) }));
  });
  it('sends the difficulty (default medium) and names the level on the slider', async () => {
    const f = fixture();
    expect(f.get('course-difficulty-level').textContent).toBe('Medium');
    expect(f.get('course-difficulty').getAttribute('aria-valuetext')).toBe('Medium');
    f.get('course-generate').click(); await tick();
    expect(f.fetcher).toHaveBeenLastCalledWith(expect.stringContaining('&difficulty=medium'), expect.anything());
    f.get('course-difficulty').value = '4'; f.get('course-difficulty').dispatchEvent(new Event('input'));
    expect(f.get('course-difficulty-level').textContent).toBe('Extreme');
    f.get('course-generate').click(); await tick();
    expect(f.fetcher).toHaveBeenLastCalledWith(expect.stringContaining('&difficulty=extreme'), expect.anything());
  });
  it('sends the session preset and the extra AI instructions (header only when not empty)', async () => {
    const f = fixture();
    f.get('course-generate').click(); await tick();
    expect(f.fetcher).toHaveBeenLastCalledWith(expect.stringContaining('&preset=lesson'), expect.objectContaining({ headers: expect.not.objectContaining({ 'X-Course-Prompt': expect.anything() }) }));
    const quiz = f.get('course-preset-quiz') as unknown as { checked: boolean; dispatchEvent(e: Event): void }; quiz.checked = true; quiz.dispatchEvent(new Event('change'));
    f.get('course-prompt').value = 'Focus on binary search; 8 questions'; f.get('course-prompt').dispatchEvent(new Event('input'));
    expect(f.get('course-prompt-count').textContent).toBe('35 / 2000');
    f.get('course-generate').click(); await tick();
    expect(f.fetcher).toHaveBeenLastCalledWith(expect.stringContaining('&preset=quiz'),
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Course-Prompt': encodeURIComponent('Focus on binary search; 8 questions') }) }));
  });
  it('retains guide text, guide link and grading without retaining old steps', () => {
    const current = { ...defaultClassroomPlan(), guideUrl: 'https://example.com/guide', guideText: 'Teacher notes', grading: { automaticWeight: 50, checklist: ['Works'] } };
    const generated = { ...defaultClassroomPlan(), title: 'New title', steps: defaultClassroomPlan().steps.slice(0, 1) };
    const merged = mergeCourseDraft(current, generated);
    expect(merged).toMatchObject({ guideUrl: current.guideUrl, guideText: 'Teacher notes', grading: current.grading, title: 'New title' });
    expect(merged.steps).toHaveLength(1); merged.steps[0].title = 'Changed'; expect(generated.steps[0].title).not.toBe('Changed');
  });
  it('rejects invalid file sizes and extensions before sending a request', async () => {
    const f = fixture();
    for (const file of [new File(['x'], 'a.exe'), new File([], 'a.md'), new File(['x'.repeat(8 * 1024 * 1024 + 1)], 'a.txt')]) {
      Object.assign(f.get('course-file'), { files: [file] }); f.get('course-generate').click(); await tick();
    }
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.apply).not.toHaveBeenCalled();
  });
  it('shows clear AI failure and removes stale previews on file change', async () => {
    const f = fixture(); f.get('course-generate').click(); await tick();
    f.get('course-file').dispatchEvent(new Event('change'));
    expect(f.get('course-preview').children).toHaveLength(0);
    f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'AI course generation failed.' }), { status: 503 }));
    f.get('course-generate').click(); await tick();
    expect(f.get('course-status').textContent).toBe('AI course generation failed.'); expect(f.apply).not.toHaveBeenCalled();
  });
  it('ignores a response after disposal or a different file selection', async () => {
    let resolve!: (value: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(r => { resolve = r; }));
    const f = fixture(fetcher); f.get('course-generate').click();
    f.dispose(); resolve(new Response(JSON.stringify({ plan: defaultClassroomPlan() }))); await tick();
    expect(f.get('course-preview').children).toHaveLength(0); expect(f.apply).not.toHaveBeenCalled();
  });
});
