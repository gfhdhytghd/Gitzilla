import { createHash } from 'node:crypto';
import type { InAppFile } from '../shared/classroom';

export const MAX_EDITOR_FILES = 20;
export const MAX_EDITOR_BYTES = 200 * 1024;
const utf8 = (s: string) => Buffer.from(s, 'utf8').toString('utf8') === s;

/** Shared bounds for teacher starters and student submissions. No filesystem access. */
export function normalizeEditorFiles(value: unknown): InAppFile[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_EDITOR_FILES) throw new Error('Use 1–20 editor files');
  const paths = new Set<string>();
  let bytes = 0;
  return value.map(file => {
    if (!file || typeof file.path !== 'string' || typeof file.content !== 'string' || !utf8(file.path) || !utf8(file.content)) throw new Error('Editor files must contain UTF-8 paths and text');
    const path: string = file.path;
    if (!path || path.length > 240 || /[\\:\u0000-\u001f\u007f]/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Use safe relative editor file paths');
    if (paths.has(path)) throw new Error('Editor file paths must be unique');
    paths.add(path);
    bytes += Buffer.byteLength(path, 'utf8') + Buffer.byteLength(file.content, 'utf8');
    if (bytes > MAX_EDITOR_BYTES) throw new Error('Editor files must total at most 200 KB');
    return { path, content: file.content };
  });
}

export function editorCommit(files: InAppFile[]): string {
  const canonical = [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return `inapp:${createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 8)}`;
}
