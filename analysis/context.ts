import { posix as path } from 'node:path';
import type { SourceFile } from './files.ts';

export const README_BYTES = 4 * 1024;
export const TREE_PATHS = 120;

export function isRootReadme(file: string): boolean {
  return /^readme(?:\.(?:md|markdown|mdown|rst|txt))?$/i.test(file);
}

/** Text context only: badges, images, HTML decoration, and link destinations add no repo identity. */
export function cleanReadme(markdown: string): string {
  const text = markdown
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(?:picture|svg|script|style)\b[^>]*>[\s\S]*?<\/(?:picture|svg|script|style)>/gi, '')
    .replace(/\[!\[[^\]]*\]\([^\n]*?\)\]\([^\n]*?\)/g, '')
    .replace(/\[!\[[^\]]*\]\[[^\]]*\]\]\[[^\]]*\]/g, '')
    .replace(/!\[[^\]]*\](?:\([^\n]*?\)|\[[^\]]*\])/g, '')
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')
    .replace(/\[([^\]\n]+)\]\([^\n]*?\)/g, '$1')
    .replace(/\[([^\]\n]+)\]\[[^\]]*\]/g, '$1')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*`{3,}[^\n]*$/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/&(?:nbsp|#160);/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const bytes = Buffer.from(text);
  let end = Math.min(bytes.length, README_BYTES);
  // Do not split a multi-byte character at the excerpt boundary.
  if (end < bytes.length) while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.toString('utf8', 0, end).trim();
}

export function readmeFromFiles(files: SourceFile[]): string {
  const readme = files.filter(file => isRootReadme(file.path)).sort((a, b) => {
    const preferred = (name: string) => /^readme\.md$/i.test(name) ? 0 : /^readme$/i.test(name) ? 1 : 2;
    return preferred(a.path) - preferred(b.path) || a.path.localeCompare(b.path);
  })[0];
  return readme ? cleanReadme(readme.text) : '';
}

/** Mix directory structure with large and heavily imported files; never send source bodies. */
export function notableTree(files: SourceFile[], graph: Map<string, Set<string>>, heart?: string): string[] {
  const incoming = new Map<string, number>();
  for (const targets of graph.values()) for (const target of targets) incoming.set(target, (incoming.get(target) ?? 0) + 1);
  const sizes = new Map(files.map(file => [file.path, Buffer.byteLength(file.text)]));
  const directories = new Map<string, number>();
  for (const file of files) {
    let dir = path.dirname(file.path);
    while (dir !== '.') {
      directories.set(dir + '/', (directories.get(dir + '/') ?? 0) + sizes.get(file.path)!);
      dir = path.dirname(dir);
    }
  }
  const result = new Set<string>();
  const dirs = [...directories].sort((a, b) => a[0].split('/').length - b[0].split('/').length || b[1] - a[1] || a[0].localeCompare(b[0]));
  dirs.slice(0, 40).forEach(([dir]) => result.add(dir));
  const roots = files.filter(file => !file.path.includes('/') && !graph.has(file.path)).sort((a, b) => a.path.localeCompare(b.path));
  roots.slice(0, 10).forEach(file => result.add(file.path));
  if (heart && sizes.has(heart)) result.add(heart);
  const sourcePaths = [...graph.keys()];
  const large = sourcePaths.slice().sort((a, b) => sizes.get(b)! - sizes.get(a)! || a.localeCompare(b));
  const central = sourcePaths.filter(file => incoming.has(file)).sort((a, b) => incoming.get(b)! - incoming.get(a)! || sizes.get(b)! - sizes.get(a)! || a.localeCompare(b));
  for (let i = 0; result.size < TREE_PATHS && (i < large.length || i < central.length); i++) {
    if (i < central.length) result.add(central[i]);
    if (result.size < TREE_PATHS && i < large.length) result.add(large[i]);
  }
  return [...result].slice(0, TREE_PATHS);
}
