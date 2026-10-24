import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenesisProgress } from '../shared/types.ts';
import { archive } from './fixtures.ts';
import { profileFromFiles } from './graph.ts';
import { cloneProgress, notifyProgress } from './progress.ts';

const disk = vi.hoisted(() => ({ readFile: vi.fn(), stat: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn() }));
vi.mock('node:fs/promises', () => disk);
const files = [
  { path: 'README.md', text: '# Actual fixture repo' },
  ...Array.from({ length: 32 }, (_, i) => ({ path: `src/module${i}.ts`, text: `export function run${i}(value: number) { return value + ${i}; }` })),
];
const body = archive([...files, { path: 'vendor/ignored.ts', text: 'vendored' }, { path: 'src/binary.ts', text: '\0binary' }]);
const profile = profileFromFiles('demo/project', files);
const json = (data: unknown) => new Response(JSON.stringify(data));
function installFetch(gate?: { started(): void; allow: Promise<void> }) {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('codeload') || url.endsWith('/tarball')) {
      gate?.started(); if (gate) await gate.allow;
      return new Response(new Uint8Array(body));
    }
    if (url.endsWith('/languages')) return json({ TypeScript: 1000 });
    if (url.includes('/commits?')) return json([{ commit: { message: 'Improve fixture rendering' } }]);
    if (url.includes('/contributors?')) return json([{}]);
    return json({ private: false, language: 'TypeScript' });
  });
  vi.stubGlobal('fetch', fetcher); return fetcher;
}
const stages = (events: GenesisProgress[]) => events.map(event => event.stage).filter((stage, i, all) => i === 0 || stage !== all[i - 1]);
function expectPipeline(events: GenesisProgress[]): void {
  expect(stages(events)).toEqual(['clone', 'parse', 'graph', 'dna']);
  expect(events.map(event => event.pct)).toEqual(events.map(event => event.pct).sort((a, b) => a - b));
  expect(events.every(event => event.pct >= 0 && event.pct <= 0.7 && (event.paths?.length ?? 0) <= 8)).toBe(true);
  expect(events.at(-1)?.pct).toBe(0.7);
}

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); vi.stubEnv('GITHUB_TOKEN', '');
  disk.readFile.mockRejectedValue(new Error('ENOENT')); disk.stat.mockRejectedValue(new Error('ENOENT'));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Genesis repo progress', () => {
  it('emits clone paths from actual retained tar members followed by parse, graph and DNA without source bodies', async () => {
    const fetcher = installFetch();
    const { analyzeRepo } = await import('./index.ts');
    const events: GenesisProgress[] = [];
    const result = await analyzeRepo('demo/project', { onProgress: p => events.push(p) });
    expect(result.totalFiles).toBe(32); expect(fetcher).toHaveBeenCalledTimes(9); expectPipeline(events);
    const paths = events.flatMap(event => event.paths ?? []);
    expect(paths).toContain('README.md'); expect(paths.some(path => path.startsWith('src/module'))).toBe(true);
    expect(paths).not.toContain('vendor/ignored.ts'); expect(paths).not.toContain('src/binary.ts');
    expect(paths.every(path => files.some(file => file.path === path))).toBe(true);
    expect(JSON.stringify(events)).not.toContain('export function');
    expect(events.find(event => event.stage === 'parse')?.note).toContain('32');
  });
  it('fans out one credential-scoped job to independent observers and replays latest state to a late joiner', async () => {
    let release!: () => void, started!: () => void;
    const archiveStarted = new Promise<void>(resolve => { started = resolve; });
    const allow = new Promise<void>(resolve => { release = resolve; });
    const fetcher = installFetch({ started, allow });
    const { analyzeRepo } = await import('./index.ts');
    const aEvents: GenesisProgress[] = [], bEvents: GenesisProgress[] = [];
    const a = analyzeRepo('Demo/Project', { token: 'fixture-token', onProgress: p => {
      aEvents.push(structuredClone(p)); p.paths?.push('mutated-path'); p.note = 'mutated-note';
    } });
    await archiveStarted;
    const b = analyzeRepo('https://github.com/demo/project', { token: 'fixture-token', onProgress: p => bEvents.push(p) });
    expect(bEvents[0].stage).toBe('clone');
    release();
    const [pa, pb] = await Promise.all([a, b]);
    expect(pa).toEqual(pb); expect(pa).not.toBe(pb); expect(fetcher).toHaveBeenCalledTimes(9);
    expectPipeline(aEvents); expectPipeline(bEvents);
    expect(JSON.stringify(bEvents)).not.toContain('mutated-');
    const aCount = aEvents.length, bCount = bEvents.length;
    await analyzeRepo('demo/project', { token: 'fixture-token', onProgress: () => {} });
    expect(aEvents).toHaveLength(aCount); expect(bEvents).toHaveLength(bCount);
    expect(disk.readFile).not.toHaveBeenCalled(); expect(disk.writeFile).not.toHaveBeenCalled();
    expect(JSON.stringify([...aEvents, ...bEvents])).not.toContain('fixture-token');
  });
  it('replays real file paths for fresh disk and memory cache without downloading again', async () => {
    disk.readFile.mockResolvedValue(JSON.stringify(profile)); disk.stat.mockResolvedValue({ mtimeMs: Date.now() });
    const fetcher = installFetch(); const { analyzeRepo } = await import('./index.ts');
    const diskEvents: GenesisProgress[] = [], memoryEvents: GenesisProgress[] = [];
    await analyzeRepo('demo/project', { onProgress: p => diskEvents.push(p) });
    await analyzeRepo('demo/project', { onProgress: p => memoryEvents.push(p) });
    expect(fetcher).not.toHaveBeenCalled(); expectPipeline(diskEvents); expectPipeline(memoryEvents);
    expect(memoryEvents).toHaveLength(4);
    expect(memoryEvents.flatMap(event => event.paths ?? []).every(path => files.some(file => file.path === path))).toBe(true);
  });
  it('replays known offline snapshots with real paths and labels source-free synthetic fallbacks honestly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { analyzeRepo } = await import('./index.ts');
    const known: GenesisProgress[] = [], unknown: GenesisProgress[] = [];
    const p = await analyzeRepo('facebook/react', { onProgress: progress => known.push(progress) });
    expect(p.fallback).toBe(true); expectPipeline(known);
    expect(known.flatMap(event => event.paths ?? []).length).toBeGreaterThan(0);
    const synthetic = await analyzeRepo('demo/offline-unknown', { onProgress: progress => unknown.push(progress) });
    expect(synthetic.description).toContain('synthetic'); expectPipeline(unknown);
    expect(unknown.flatMap(event => event.paths ?? [])).toEqual([]);
    expect(unknown.at(-1)?.note).toContain('no real-code DNA');
  });
  it('ignores failing sync/async observers without changing success, caching or other observers', async () => {
    installFetch(); const { analyzeRepo } = await import('./index.ts');
    const events: GenesisProgress[] = [];
    const [a, b] = await Promise.all([
      analyzeRepo('demo/project', { onProgress: () => { throw new Error('room disconnected'); } }),
      analyzeRepo('demo/project', { onProgress: p => events.push(p) }),
    ]);
    expect(a.fallback).toBeUndefined(); expect(a).toEqual(b); expectPipeline(events);
    const cached = await analyzeRepo('demo/project', { onProgress: async () => { throw new Error('async observer disconnected'); } });
    await Promise.resolve();
    expect(cached.fallback).toBeUndefined(); expect(disk.writeFile).toHaveBeenCalledOnce();
  });
  it('throttles clone file batches to 8Hz with a bounded buffer and flushes the final real paths', () => {
    let now = 0; vi.spyOn(Date, 'now').mockImplementation(() => now);
    const events: { at: number; progress: GenesisProgress }[] = [];
    const progress = cloneProgress(p => events.push({ at: now, progress: p }), 10000);
    for (let i = 0; i < 100; i++) { now = i * 10; progress.file(`src/file${i}.ts`, i + 1, (i + 1) * 100); }
    progress.finish();
    const streamed = events.slice(0, -1);
    expect(streamed.length).toBeLessThanOrEqual(8);
    expect(streamed.slice(1).every((event, i) => event.at - streamed[i].at >= 125)).toBe(true);
    expect(events.every(event => (event.progress.paths?.length ?? 0) <= 8)).toBe(true);
    expect(events.at(-1)!.progress.paths).toEqual(Array.from({ length: 8 }, (_, i) => `src/file${92 + i}.ts`));
    expect(events.at(-1)!.progress.pct).toBe(0.35);
  });
  it('isolates observer objects and caps paths even if an internal producer supplies extra paths', () => {
    const source: GenesisProgress = { stage: 'parse', pct: 0.4, paths: Array.from({ length: 20 }, (_, i) => `src/${i}.ts`) };
    const received: GenesisProgress[] = [];
    notifyProgress(p => { received.push(structuredClone(p)); p.paths!.length = 0; }, source);
    expect(received[0].paths).toHaveLength(8); expect(source.paths).toHaveLength(20);
  });
});
