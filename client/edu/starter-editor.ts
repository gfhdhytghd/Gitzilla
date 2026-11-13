// Lesson editor: starter files for a step's in-app editor (ClassroomStep.starter + language).
// With starter files, students code in the browser and submit without GitHub; without them they submit a repository.
// Limits mirror server/in-app.ts normalizeEditorFiles (1–20 files, ≤ 200 KB of UTF-8 paths + contents, safe relative
// paths, unique). File paths and contents are authored text: data-i18n-skip, never translated.
import type { ClassroomStep, InAppFile } from '../../shared/classroom';
import { h } from '../app/util';
import './starter-editor.css';

export const STARTER_LIMITS = { files: 20, bytes: 200 * 1024, path: 240 } as const;
const encoder = new TextEncoder();
const bytesOf = (s: string) => encoder.encode(s).length;
export const starterBytes = (files: InAppFile[]) => files.reduce((n, f) => n + bytesOf(f.path) + bytesOf(f.content), 0);
const kb = (n: number) => `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;

/** Error for one path, or '' when the server accepts it. */
export function starterPathError(path: string): string {
  if (!path) return 'Enter a file name.';
  if (path.length > STARTER_LIMITS.path) return 'Use a file path of up to 240 characters.';
  // eslint-disable-next-line no-control-regex
  if (/[\\:\u0000-\u001f\u007f]/.test(path)) return 'Use / between folders; no \\, : or control characters.';
  if (path.split('/').some(p => !p || p === '.' || p === '..')) return 'Use a relative path such as main.py or src/app.py (no leading /, no . or .. folders).';
  return '';
}

/** All problems with a starter list, matching the server's checks. An empty list is valid (no in-app editor). */
export function validateStarter(files: InAppFile[]): string[] {
  const errors: string[] = [];
  if (files.length > STARTER_LIMITS.files) errors.push(`Use at most ${STARTER_LIMITS.files} starter files.`);
  const seen = new Set<string>();
  files.forEach((f, i) => {
    const e = starterPathError(f.path);
    if (e) errors.push(`File ${i + 1}: ${e}`);
    else if (seen.has(f.path)) errors.push(`File ${i + 1}: ${f.path} is already used by another file.`);
    seen.add(f.path);
  });
  if (starterBytes(files) > STARTER_LIMITS.bytes) errors.push('Starter files must total at most 200 KB.');
  return errors;
}

export function nextStarterPath(files: InAppFile[]): string {
  const used = new Set(files.map(f => f.path));
  if (!used.has('main.py')) return 'main.py';
  for (let n = 2; ; n++) if (!used.has(`file${n}.py`)) return `file${n}.py`;
}

const INDENT = '    ';
/**
 * Code textarea keys: Tab indents (the selected lines, or inserts 4 spaces), Shift+Tab outdents, Enter keeps the
 * line's indent. Escape releases Tab for one press, so keyboard users can leave the field.
 */
export function codeKeys(area: HTMLTextAreaElement) {
  let release = false;
  area.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') { release = true; return; }
    if (e.key !== 'Tab' && e.key !== 'Enter') { release = false; return; }
    if (e.key === 'Tab' && (release || e.ctrlKey || e.metaKey || e.altKey)) { release = false; return; }
    if (e.key === 'Enter' && (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing)) return;
    const v = area.value, s = area.selectionStart, end = area.selectionEnd;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    e.preventDefault();
    if (e.key === 'Enter') {
      const indent = /^[ \t]*/.exec(v.slice(lineStart, s))![0] + (/:\s*$/.test(v.slice(lineStart, s)) ? INDENT : '');
      area.setRangeText(`\n${indent}`, s, end, 'end');
    } else if (!e.shiftKey && s === end) {
      area.setRangeText(INDENT, s, end, 'end');
    } else {
      // indent / outdent every line touched by the selection
      const blockEnd = end > s && v[end - 1] === '\n' ? end - 1 : end;
      const lines = v.slice(lineStart, blockEnd).split('\n');
      const next = lines.map(l => e.shiftKey ? l.replace(/^( {1,4}|\t)/, '') : INDENT + l).join('\n');
      area.setRangeText(next, lineStart, blockEnd, 'select');
    }
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/**
 * Starter files and editor language for one step. Writes step.starter (removed when empty) and step.language.
 * Returns the element and validate(), which paints the error line (a .cr-form-error, so Publish blocks).
 */
export function createStarterEditor(step: ClassroomStep, index: number, hooks: { onChange(): void }) {
  const files = (): InAppFile[] => step.starter ?? [];
  const errorLine = h('p.cr-form-error.se-errors', { role: 'alert', 'data-testid': `step-starter-errors-${index}` });
  const usage = h('small.se-usage', { 'data-testid': `step-starter-usage-${index}`, 'aria-live': 'polite' });
  const list = h('div.se-files', { 'data-testid': `step-starter-files-${index}` });
  const python = h('input', { type: 'checkbox', 'data-testid': `step-language-python-${index}` }) as HTMLInputElement;
  python.checked = step.language === 'python';
  python.onchange = () => { if (python.checked) step.language = 'python'; else delete step.language; changed(); };
  const mode = h('p.se-mode', { 'data-testid': `step-starter-mode-${index}` });
  const add = h('button.btn.btn-ghost', { type: 'button', 'data-testid': `step-starter-add-${index}` }, '+ Add file') as HTMLButtonElement;

  const validate = () => {
    const errors = validateStarter(files());
    errorLine.textContent = errors.slice(0, 4).join(' ') + (errors.length > 4 ? ` (+${errors.length - 4} more)` : '');
    const n = files().length, b = starterBytes(files());
    usage.textContent = `${n} / ${STARTER_LIMITS.files} files · ${kb(b)} / 200 KB`;
    usage.classList.toggle('se-usage-full', n >= STARTER_LIMITS.files || b > STARTER_LIMITS.bytes);
    add.disabled = n >= STARTER_LIMITS.files;
    mode.textContent = n ? 'Students code in the in-app editor and can submit without GitHub. They can still submit a GitHub repository instead.'
      : 'No starter files: students submit a GitHub repository. Add a file to give them the in-app editor.';
    return !errors.length;
  };
  const changed = () => { validate(); hooks.onChange(); };
  const setFiles = (next: InAppFile[]) => { if (next.length) step.starter = next; else delete step.starter; };

  function fileRow(file: InAppFile, i: number): HTMLElement {
    const path = h('input.se-path', { value: file.path, maxlength: STARTER_LIMITS.path, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off',
      'aria-label': `File ${i + 1} name`, 'data-testid': `step-starter-path-${index}-${i}`, 'data-i18n-skip': '' }) as HTMLInputElement;
    const pathError = h('small.se-path-error', { 'data-testid': `step-starter-path-error-${index}-${i}` });
    const size = h('small.se-size');
    const code = h('textarea.se-code', { rows: Math.min(18, Math.max(6, file.content.split('\n').length + 1)), spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', wrap: 'off',
      translate: 'no', 'aria-label': `File ${i + 1} content`, 'aria-describedby': `se-keys-${index}`, 'data-testid': `step-starter-content-${index}-${i}`, 'data-i18n-skip': '' }, file.content) as HTMLTextAreaElement;
    const paint = () => {
      const e = starterPathError(file.path) || (files().filter(f => f.path === file.path).length > 1 ? 'Another file already uses this name.' : '');
      pathError.textContent = e; path.setAttribute('aria-invalid', e ? 'true' : 'false');
      size.textContent = kb(bytesOf(file.path) + bytesOf(file.content));
    };
    path.oninput = () => { file.path = path.value.trim(); paint(); for (const row of list.children) (row as HTMLElement & { paint?(): void }).paint?.(); changed(); };
    code.oninput = () => { file.content = code.value; paint(); changed(); };
    codeKeys(code);
    const remove = h('button.btn.btn-danger.se-remove', { type: 'button', 'aria-label': `Remove file ${i + 1}`, 'data-testid': `step-starter-remove-${index}-${i}`,
      onclick: () => {
        if (file.content.trim() && !confirm(`Remove ${file.path || `file ${i + 1}`} and its content?`)) return;
        setFiles(files().filter(f => f !== file)); rebuild(); changed();
      } }, 'Remove');
    const row = h('div.se-file', { 'data-testid': `step-starter-file-${index}-${i}` },
      h('div.se-file-head', null, path, size, remove), pathError, code) as HTMLElement & { paint?(): void };
    row.paint = paint; paint();
    return row;
  }
  function rebuild() { list.replaceChildren(...files().map((f, i) => fileRow(f, i))); }
  add.onclick = () => {
    if (files().length >= STARTER_LIMITS.files) return;
    const first = !files().length;
    const path = nextStarterPath(files());
    setFiles([...files(), { path, content: first ? '# Write your code here.\n' : '' }]);
    if (first && step.language === undefined && path.endsWith('.py')) { step.language = 'python'; python.checked = true; }
    rebuild(); changed();
    (list.lastElementChild?.querySelector('.se-path') as HTMLInputElement | null)?.focus();
  };

  rebuild(); validate();
  const el = h('section.se', { 'data-testid': `step-starter-editor-${index}` },
    h('div.se-head', null, h('h4', null, 'Starter files (in-app editor)'), usage),
    mode,
    h('label.se-check', null, python, h('span', null, 'Python: syntax highlighting and ▶ Run in the browser')),
    list,
    h('div.se-foot', null, add, h('small', { id: `se-keys-${index}` }, 'Tab indents · Shift+Tab outdents · Esc, then Tab leaves the code box')),
    errorLine);
  return { el, validate };
}
