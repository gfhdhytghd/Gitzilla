import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classroomGuideText, createClassroomGuideEditor, type ClassroomGuidePlan } from './classroom-guide-editor';
import { GUIDE_FILE_MAX_BYTES, GUIDE_TEXT_MAX_CHARS } from '../../shared/classroom-guide';
import { installTestDom, TestNode } from './test-dom';

beforeEach(() => installTestDom());
afterEach(() => vi.unstubAllGlobals());
const setup = (plan: ClassroomGuidePlan = {}) => {
  const changed = vi.fn();
  const editor = createClassroomGuideEditor(plan, changed);
  const root = editor.el as unknown as TestNode;
  const find = (id: string) => root.querySelector(`[data-testid="lesson-guide-${id}"]`)!;
  const url = find('url'), text = find('text');
  const file = find('file') as TestNode & { files: unknown[] };
  const input = (node: TestNode, value: string) => { node.value = value; node.oninput?.(); };
  const upload = (selected: unknown) => {
    file.files = selected ? [selected] : [];
    return (file.onchange as (() => Promise<void>) | null)?.();
  };
  return { plan, editor, root, find, url, text, input, upload, changed };
};
const md = (text: () => Promise<string>, name = 'guide.md', size = 10) => ({ name, size, text });
const deferred = () => {
  let resolve!: (text: string) => void, reject!: (error: Error) => void;
  const promise = new Promise<string>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};

describe('classroom guide editor', () => {
  it('loads both fields, validates links, accepts pasted Markdown and clears optional content', () => {
    const s = setup({ guideUrl: 'https://example.com/guide', guideText: '# Instructions' });
    expect(s.url.value).toBe(s.plan.guideUrl);
    expect(s.text.value).toBe(s.plan.guideText);
    s.input(s.url, 'javascript:alert(1)');
    expect(s.editor.validate()).toBe(false);
    expect(s.url.getAttribute('aria-invalid')).toBe('true');
    s.input(s.url, ' https://example.com/next ');
    s.input(s.text, ' # Guide\r\nUse `print()` ');
    expect(s.editor.validate()).toBe(true);
    expect(s.plan).toEqual({ guideUrl: 'https://example.com/next', guideText: '# Guide\nUse `print()`' });
    s.input(s.text, 'x'.repeat(GUIDE_TEXT_MAX_CHARS + 1));
    expect(s.editor.validate()).toBe(false);
    s.input(s.text, '  '); s.input(s.url, '');
    expect(s.editor.validate()).toBe(true);
    expect(s.plan).toEqual({});
  });
  it('loads a local file while retaining the link and blocks publishing during reading', async () => {
    const s = setup({ guideUrl: 'https://example.com/' });
    const read = deferred();
    const pending = s.upload(md(() => read.promise));
    expect(s.editor.validate()).toBe(false);
    read.resolve('# Loaded\nUse `code`'); await pending;
    expect(s.plan).toEqual({ guideUrl: 'https://example.com/', guideText: '# Loaded\nUse `code`' });
    expect(s.text.value).toBe(s.plan.guideText);
    expect(s.editor.validate()).toBe(true);
  });
  it.each([
    ['notes.txt', 10, 'hello', 'Choose a Markdown'],
    ['guide.md', 0, '', 'empty'],
    ['guide.md', GUIDE_FILE_MAX_BYTES + 1, 'hello', 'no larger'],
    ['guide.md', 10, ' \n ', 'empty'],
    ['guide.md', 10, '\0binary', 'valid text'],
    ['guide.md', 10, '\ufffd', 'valid text'],
    ['guide.md', 10, 'x'.repeat(GUIDE_TEXT_MAX_CHARS + 1), 'maximum'],
  ])('reports invalid file %s (%s bytes)', async (name, size, content, error) => {
    const s = setup({ guideText: 'Keep me' });
    const read = vi.fn(async () => content);
    await s.upload(md(read, name, size));
    expect(s.find('file-error').textContent).toContain(error);
    expect(s.plan.guideText).toBe('Keep me');
    expect(s.editor.validate()).toBe(false);
    if (name.endsWith('.txt') || size === 0 || size > GUIDE_FILE_MAX_BYTES) expect(read).not.toHaveBeenCalled();
    s.input(s.text, 'Replacement');
    expect(s.editor.validate()).toBe(true);
  });
  it('reports read failure and permits selecting the same file again', async () => {
    const s = setup();
    await s.upload(md(async () => { throw new Error('Read failed'); }));
    expect(s.find('file-error').textContent).toBe('Read failed');
    await s.upload(md(async () => 'Retry'));
    expect(s.editor.validate()).toBe(true);
    expect(s.plan.guideText).toBe('Retry');
  });
  it('ignores older successful and failed reads after a newer file', async () => {
    for (const fail of [false, true]) {
      const s = setup(); const read = deferred();
      const old = s.upload(md(() => read.promise));
      await s.upload(md(async () => 'Latest'));
      if (fail) read.reject(new Error('Old failure')); else read.resolve('Old success');
      await old;
      expect(s.plan.guideText).toBe('Latest');
      expect(s.editor.validate()).toBe(true);
    }
  });
  it('ignores pending reads after typing, cancelling a selection or disposing', async () => {
    for (const action of ['type', 'cancel', 'dispose']) {
      const s = setup({ guideText: 'Original' }); const read = deferred();
      const pending = s.upload(md(() => read.promise));
      if (action === 'type') s.input(s.text, 'Typed');
      if (action === 'cancel') await s.upload(null);
      if (action === 'dispose') s.editor.dispose();
      const calls = s.changed.mock.calls.length;
      read.resolve('Stale'); await pending;
      expect(s.plan.guideText).toBe(action === 'type' ? 'Typed' : 'Original');
      expect(s.changed).toHaveBeenCalledTimes(calls);
      expect(s.editor.validate()).toBe(action !== 'dispose');
    }
  });
});

describe('student guide text integration', () => {
  it('renders text and code safely with line breaks, without active HTML/Markdown URLs', () => {
    const node = classroomGuideText('# Guide\n<img src=x onerror=alert(1)> [click](javascript:alert(1)) `print()`') as unknown as TestNode;
    expect(node.hidden).toBe(false);
    expect(node.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(node.textContent).toContain('\n');
    expect(node.querySelector('code')?.textContent).toBe('print()');
    expect(node.querySelector('img')).toBeNull();
    expect(node.querySelector('a')).toBeNull();
    expect(node.innerHTML).toBe('');
    expect(node.getAttribute('style')).toContain('white-space: pre-wrap');
  });
  it.each([undefined, '', '  ', null, '\0', 'x'.repeat(GUIDE_TEXT_MAX_CHARS + 1)])('hides empty or invalid content', value => {
    expect(classroomGuideText(value).hidden).toBe(true);
  });
});
