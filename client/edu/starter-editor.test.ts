import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassroomStep } from '../../shared/classroom';
import { installTestDom, type TestNode } from './test-dom';
import { codeKeys, createStarterEditor, nextStarterPath, starterPathError, validateStarter } from './starter-editor';

beforeEach(() => { installTestDom(); });
const step = (extra: Partial<ClassroomStep> = {}): ClassroomStep => ({ id: 's1', title: 'Task', instructions: 'Do it', durationSec: 0,
  rubric: { title: 'r', criteria: [] } as unknown as ClassroomStep['rubric'], checks: [], checksWeight: 0, ...extra });

describe('starter file limits (match server/in-app.ts)', () => {
  it('accepts safe relative paths and rejects the rest', () => {
    for (const ok of ['main.py', 'src/app.py', 'python/01_hello.py', 'README.md']) expect(starterPathError(ok)).toBe('');
    for (const bad of ['', '/abs.py', 'a//b.py', './x.py', '../x.py', 'a/../b.py', 'C:\\x.py', 'a:b', 'tab\there', 'x/'.repeat(121) + 'y']) expect(starterPathError(bad)).not.toBe('');
  });
  it('limits count, uniqueness and total UTF-8 size', () => {
    expect(validateStarter([])).toEqual([]);
    expect(validateStarter(Array.from({ length: 21 }, (_, i) => ({ path: `f${i}.py`, content: '' }))).join(' ')).toMatch(/at most 20/);
    expect(validateStarter([{ path: 'a.py', content: '' }, { path: 'a.py', content: '' }]).join(' ')).toMatch(/already used/);
    // 'é' is 2 bytes in UTF-8: 102400 characters = 204800 bytes, over the limit with the path
    expect(validateStarter([{ path: 'a.py', content: 'é'.repeat(102400) }]).join(' ')).toMatch(/200 KB/);
    expect(validateStarter([{ path: 'a.py', content: 'x'.repeat(200 * 1024 - 4) }])).toEqual([]);
    expect(validateStarter([{ path: 'a.py', content: 'x'.repeat(200 * 1024 - 3) }]).join(' ')).toMatch(/200 KB/);
  });
  it('suggests main.py, then numbered files', () => {
    expect(nextStarterPath([])).toBe('main.py');
    expect(nextStarterPath([{ path: 'main.py', content: '' }, { path: 'file2.py', content: '' }])).toBe('file3.py');
  });
});

describe('starter editor', () => {
  const mount = (st: ClassroomStep) => {
    let changes = 0;
    const ed = createStarterEditor(st, 0, { onChange() { changes++; } });
    const root = ed.el as unknown as TestNode;
    const get = (id: string) => root.querySelector(`[data-testid="${id}"]`);
    return { ed, root, get, changes: () => changes };
  };
  it('adds a first Python file, renames it, edits it and removes it', () => {
    const st = step();
    const { ed, get, changes } = mount(st);
    expect(get('step-starter-mode-0')!.textContent).toMatch(/GitHub repository/);
    get('step-starter-add-0')!.click();
    expect(st.starter).toEqual([{ path: 'main.py', content: '# Write your code here.\n' }]);
    expect(st.language).toBe('python');
    expect((get('step-language-python-0') as unknown as { checked: boolean }).checked).toBe(true);
    expect(get('step-starter-mode-0')!.textContent).toMatch(/in-app editor/);
    const path = get('step-starter-path-0-0')!;
    path.value = 'src/app.py'; path.dispatchEvent(new Event('input'));
    expect(st.starter![0].path).toBe('src/app.py');
    const code = get('step-starter-content-0-0')!;
    code.value = 'def add(a, b):\n    return a + b\n'; code.dispatchEvent(new Event('input'));
    expect(st.starter![0].content).toBe('def add(a, b):\n    return a + b\n');
    expect(get('step-starter-usage-0')!.textContent).toMatch(/^1 \/ 20 files · /);
    expect(changes()).toBeGreaterThan(2);
    expect(ed.validate()).toBe(true);
    vi.stubGlobal('confirm', () => true);
    get('step-starter-remove-0-0')!.click();
    expect(st.starter).toBeUndefined();
    vi.unstubAllGlobals();
  });
  it('shows path errors that block publishing and clears them', () => {
    const st = step({ starter: [{ path: 'main.py', content: 'x = 1' }, { path: 'util.py', content: '' }], language: 'python' });
    const { ed, get } = mount(st);
    const second = get('step-starter-path-0-1')!;
    second.value = 'main.py'; second.dispatchEvent(new Event('input'));
    expect(get('step-starter-path-error-0-1')!.textContent).toMatch(/Another file/);
    expect(get('step-starter-errors-0')!.textContent).toMatch(/already used/);
    expect(ed.validate()).toBe(false);
    second.value = '../util.py'; second.dispatchEvent(new Event('input'));
    expect(get('step-starter-path-error-0-1')!.textContent).toMatch(/relative path/);
    second.value = 'lib/util.py'; second.dispatchEvent(new Event('input'));
    expect(get('step-starter-errors-0')!.textContent).toBe('');
    expect(ed.validate()).toBe(true);
  });
  it('keeps AI-generated starters editable and the language toggle optional', () => {
    const st = step({ starter: [{ path: 'python/01_hello.py', content: 'print("hi")\n' }], language: 'python' });
    const { get } = mount(st);
    expect(get('step-starter-content-0-0')!.value).toBe('print("hi")\n');
    const code = get('step-starter-content-0-0')!;
    code.value = 'print("hello")\n'; code.dispatchEvent(new Event('input'));
    expect(st.starter![0].content).toBe('print("hello")\n');
    const py = get('step-language-python-0')! as unknown as { checked: boolean; dispatchEvent(e: Event): void };
    py.checked = false; py.dispatchEvent(new Event('change'));
    expect(st.language).toBeUndefined();
  });
  it('stops adding files at 20', () => {
    const st = step({ starter: Array.from({ length: 20 }, (_, i) => ({ path: `f${i}.py`, content: '' })) });
    const { get } = mount(st);
    expect((get('step-starter-add-0') as unknown as { disabled: boolean }).disabled).toBe(true);
    get('step-starter-add-0')!.click();
    expect(st.starter).toHaveLength(20);
  });
});

describe('code textarea keys', () => {
  // a minimal textarea: value, selection and setRangeText like the browser
  const area = (value: string, start: number, end = start) => {
    const listeners: ((e: KeyboardEvent) => void)[] = [];
    const a = {
      value, selectionStart: start, selectionEnd: end, inputs: 0,
      addEventListener(type: string, f: (e: KeyboardEvent) => void) { if (type === 'keydown') listeners.push(f); },
      dispatchEvent(e: Event) { if (e.type === 'input') a.inputs++; return true; },
      setRangeText(text: string, s: number, e: number, mode: string) {
        a.value = a.value.slice(0, s) + text + a.value.slice(e);
        if (mode === 'end') a.selectionStart = a.selectionEnd = s + text.length; else { a.selectionStart = s; a.selectionEnd = s + text.length; }
      },
      key(key: string, shiftKey = false) { let prevented = false; const ev = { key, shiftKey, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, preventDefault() { prevented = true; } } as unknown as KeyboardEvent; listeners.forEach(f => f(ev)); return prevented; },
    };
    codeKeys(a as unknown as HTMLTextAreaElement);
    return a;
  };
  it('Tab inserts spaces, Shift+Tab outdents the selected lines, Enter keeps the indent', () => {
    const a = area('x', 0);
    expect(a.key('Tab')).toBe(true);
    expect(a.value).toBe('    x'); expect(a.inputs).toBe(1);
    const b = area('a\n    b\nc', 0, 8);
    b.key('Tab', true);
    expect(b.value).toBe('a\nb\nc');
    const c = area('def f():', 8);
    c.key('Enter');
    expect(c.value).toBe('def f():\n    ');
    const d = area('a\nb', 0, 3);
    d.key('Tab');
    expect(d.value).toBe('    a\n    b');
  });
  it('Escape releases the next Tab so keyboard users can leave the field', () => {
    const a = area('x', 1);
    a.key('Escape');
    expect(a.key('Tab')).toBe(false);
    expect(a.value).toBe('x');
    expect(a.key('Tab')).toBe(true);
  });
});
