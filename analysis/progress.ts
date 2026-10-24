import type { GenesisProgress, RepoProfile } from '../shared/types.ts';

export type ProgressCallback = (progress: GenesisProgress) => void;

/** An observer must not fail analysis or mutate another observer's progress. */
export function notifyProgress(callback: ProgressCallback | undefined, progress: GenesisProgress): void {
  if (!callback) return;
  try {
    const returned: unknown = callback({ ...progress, ...(progress.paths ? { paths: progress.paths.slice(0, 8) } : {}) });
    if (returned && typeof (returned as PromiseLike<unknown>).then === 'function') void Promise.resolve(returned).catch(() => {});
  } catch { /* Room disconnects / observer failures do not change the repo result. */ }
}

/** No timer/queue survives a download. Only the latest eight real paths are buffered. */
export function cloneProgress(callback: ProgressCallback | undefined, maxBytes: number): {
  file(path: string, files: number, expandedBytes: number): void;
  finish(): void;
} {
  let lastAt = -Infinity;
  let paths: string[] = [];
  let files = 0;
  let bytes = 0;
  const emit = (done: boolean) => {
    notifyProgress(callback, {
      stage: 'clone', pct: done ? 0.35 : 0.02 + 0.31 * Math.min(1, bytes / maxBytes),
      paths, note: `${done ? 'Downloaded' : 'Receiving'} ${files} source/metadata files`,
    });
    paths = [];
    lastAt = Date.now();
  };
  return {
    file(path, count, expandedBytes) {
      files = count; bytes = expandedBytes;
      paths.push(path); if (paths.length > 8) paths.shift();
      if (Date.now() - lastAt >= 125) emit(false);
    },
    finish() { emit(true); },
  };
}

/** Cached data still tells the same story; no source bodies or secrets enter progress. */
export function replayProfileProgress(profile: RepoProfile, callback: ProgressCallback | undefined, source: 'cache' | 'fallback' | 'synthetic'): void {
  const realPaths = source === 'synthetic' ? [] : [...new Set([
    ...(profile.dna?.bigFiles.map(file => file.path) ?? []), ...(profile.tree ?? []), profile.heart,
    ...(profile.dna?.snippets.map(snippet => snippet.file) ?? []),
  ])].filter(path => path && !path.endsWith('/'));
  const batch = (start: number) => realPaths.slice(start, start + 8).length ? realPaths.slice(start, start + 8) : realPaths.slice(0, 8);
  const unavailable = source === 'synthetic';
  notifyProgress(callback, { stage: 'clone', pct: 0.35, paths: batch(0), note: unavailable ? 'Offline synthetic profile; source unavailable' : `Loaded ${source} profile for ${profile.slug}` });
  notifyProgress(callback, { stage: 'parse', pct: 0.4, paths: batch(8), note: unavailable ? 'No source available to parse' : `${profile.totalFiles} source files, ${profile.totalLoc} LOC` });
  notifyProgress(callback, { stage: 'graph', pct: 0.55, paths: unavailable ? [] : [profile.heart], note: unavailable ? 'Synthetic graph; source unavailable' : `${profile.components.length} components, ${profile.edges.length} dependency edges` });
  notifyProgress(callback, { stage: 'dna', pct: 0.7, paths: unavailable ? [] : [...new Set(profile.dna?.snippets.map(snippet => snippet.file) ?? [])].slice(0, 8), note: unavailable ? 'Synthetic creature; no real-code DNA' : `${profile.dna?.counts.functions ?? 0} functions, ${profile.dna?.identifiers.length ?? 0} signature symbols` });
}
