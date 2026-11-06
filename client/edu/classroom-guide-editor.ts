import type { ClassroomPlan } from '../../shared/classroom';
import { GUIDE_TEXT_MAX_CHARS, normalizeGuideText, normalizeGuideUrl, validateGuideFile } from '../../shared/classroom-guide';
import { h } from '../app/util';
import { richText } from './task-card';

export type ClassroomGuidePlan = Pick<ClassroomPlan, 'guideUrl' | 'guideText'>;
export interface ClassroomGuideEditor {
  el: HTMLElement;
  /** Synchronize fields into the supplied draft. False also blocks pending/failed uploads. */
  validate(): boolean;
  /** Call before replacing the editor/draft or leaving the screen. */
  dispose(): void;
}

/** Mutates only guideUrl/guideText on this draft; the two resources are independent. */
export function createClassroomGuideEditor(plan: ClassroomGuidePlan, onChange?: () => void): ClassroomGuideEditor {
  let disposed = false, generation = 0, pending = false, uploadError = '';
  const url = h('input', { type: 'url', value: plan.guideUrl ?? '', maxlength: 2048,
    placeholder: 'https://canvas.example.edu/courses/...', 'data-testid': 'lesson-guide-url',
    'aria-describedby': 'lesson-guide-help lesson-guide-error' });
  const text = h('textarea', { rows: 8, maxlength: GUIDE_TEXT_MAX_CHARS, 'data-testid': 'lesson-guide-text',
    'aria-describedby': 'lesson-guide-text-help lesson-guide-text-error' }, plan.guideText ?? '');
  const file = h('input', { type: 'file', accept: '.md,text/markdown', 'data-testid': 'lesson-guide-file',
    'aria-describedby': 'lesson-guide-file-error' });
  const urlError = h('p.cr-form-error', { id: 'lesson-guide-error', role: 'alert' });
  const textError = h('p.cr-form-error', { id: 'lesson-guide-text-error', role: 'alert' });
  const fileError = h('p.cr-form-error', { id: 'lesson-guide-file-error', role: 'alert', 'data-testid': 'lesson-guide-file-error' });
  const status = h('p', { role: 'status', 'data-testid': 'lesson-guide-file-status' });
  const field = (label: string, control: HTMLElement) => h('label', null, h('span', null, label), control);
  const sync = (key: keyof ClassroomGuidePlan, input: HTMLInputElement | HTMLTextAreaElement,
    error: HTMLElement, normalize: (value: unknown) => string | undefined) => {
    try {
      const value = normalize(input.value);
      if (value === undefined) delete plan[key]; else plan[key] = value;
      error.textContent = ''; input.setAttribute('aria-invalid', 'false'); return true;
    } catch (e) {
      error.textContent = (e as Error).message; input.setAttribute('aria-invalid', 'true'); return false;
    }
  };
  const validate = () => {
    if (disposed) return false;
    const validUrl = sync('guideUrl', url, urlError, normalizeGuideUrl);
    const validText = sync('guideText', text, textError, normalizeGuideText);
    return validUrl && validText && !pending && !uploadError;
  };
  const cancelUpload = () => {
    generation++; pending = false; uploadError = ''; fileError.textContent = ''; status.textContent = '';
    file.setAttribute('aria-invalid', 'false');
  };
  url.oninput = () => { if (!disposed) { sync('guideUrl', url, urlError, normalizeGuideUrl); onChange?.(); } };
  text.oninput = () => {
    if (disposed) return;
    cancelUpload(); sync('guideText', text, textError, normalizeGuideText); onChange?.();
  };
  file.onchange = async () => {
    if (disposed) return;
    cancelUpload();
    const selected = file.files?.[0];
    file.value = ''; // Permit selecting the same file again after a failed read.
    if (!selected) return;
    const token = generation;
    try {
      validateGuideFile(selected);
      pending = true; status.textContent = 'Reading Markdown file…';
      const content = await selected.text();
      if (disposed || token !== generation) return;
      const normalized = normalizeGuideText(content);
      if (!normalized) throw new Error('The Markdown file is empty.');
      text.value = normalized;
      sync('guideText', text, textError, normalizeGuideText);
      status.textContent = 'Markdown instructions loaded.';
    } catch (e) {
      if (disposed || token !== generation) return;
      uploadError = e instanceof Error ? e.message : 'Could not read the Markdown file.';
      fileError.textContent = uploadError; file.setAttribute('aria-invalid', 'true'); status.textContent = '';
    } finally {
      if (!disposed && token === generation) { pending = false; onChange?.(); }
    }
  };
  const el = h('div', { 'data-testid': 'lesson-guide-editor' },
    field('Class guide link (optional)', url),
    h('small', { id: 'lesson-guide-help' }, 'Link to Canvas, an assignment, or your class instructions. Students see this link in every step. They may need to sign in.'), urlError,
    field('Class instructions (optional)', text),
    h('small', { id: 'lesson-guide-text-help' }, `Paste plain text or Markdown, or load a local .md file (maximum ${GUIDE_TEXT_MAX_CHARS} characters). Link and text can be used together. Loading a file replaces the text.`), textError,
    field('Load Markdown instructions', file), fileError, status);
  return { el, validate, dispose() { disposed = true; generation++; url.oninput = null; text.oninput = null; file.onchange = null; } };
}

/** Student integration API. richText creates text/code nodes, never HTML or active Markdown links. */
export function classroomGuideText(value: unknown): HTMLElement {
  let content: string | undefined;
  try { content = normalizeGuideText(value); } catch { /* Ignore malformed legacy room content. */ }
  const el = h('div', { 'data-testid': 'classroom-guide-text', style: 'white-space: pre-wrap; overflow-wrap: anywhere' },
    ...richText(content ?? ''));
  el.hidden = !content;
  return el;
}
