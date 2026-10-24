import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { GenesisProgress, RepoProfile } from '../shared/types.ts';
import { analyzeGitHubRepo } from './github.ts';
import { componentTopology, fnv1a } from './graph.ts';
import { selectPrimaryLanguage } from './files.ts';
import { emptyDNA } from './dna.ts';
import { notifyProgress, replayProfileProgress, type ProgressCallback } from './progress.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CACHE_ROOT = join(ROOT, '.cache/analysis');
const FALLBACK_ROOT = join(ROOT, 'data/fallback');
const CACHE_TTL = 24 * 60 * 60 * 1000;
const memory = new Map<string, { profile: RepoProfile; expires: number; source: 'cache' | 'fallback' | 'synthetic' }>();
interface AnalysisJob {
  promise: Promise<RepoProfile>;
  subscribers: Map<symbol, ProgressCallback>;
  latest?: GenesisProgress;
}
const inFlight = new Map<string, AnalysisJob>();

export function normalizeSlug(input: string): string {
  let value = input.trim();
  if (/^(?:https?:\/\/)?(?:www\.)?github\.com\//i.test(value)) {
    if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    value = parts.slice(0, 2).join('/');
  }
  value = value.replace(/\/$/, '').replace(/\.git$/i, '');
  if (!/^[a-z\d](?:[a-z\d-]{0,38})\/[a-z\d_.-]{1,100}$/i.test(value) || value.split('/')[1] === '.' || value.split('/')[1] === '..') {
    throw new Error('Enter a GitHub repository as owner/name or https://github.com/owner/name');
  }
  return value.toLowerCase();
}

function refreshLanguage(profile: RepoProfile): RepoProfile {
  return { ...profile, primaryLanguage: selectPrimaryLanguage(profile.languages, profile.primaryLanguage), readme: profile.readme ?? '', tree: profile.tree ?? [profile.heart], dna: profile.dna ?? emptyDNA() };
}

function fallbackProfiles(): RepoProfile[] {
  try {
    return readdirSync(FALLBACK_ROOT).filter(name => name.endsWith('.json')).flatMap(name => {
      try { return [refreshLanguage(JSON.parse(readFileSync(join(FALLBACK_ROOT, name), 'utf8')) as RepoProfile)]; }
      catch { return []; }
    });
  } catch { return []; }
}

export function listFallbackRepos(): string[] {
  return fallbackProfiles().map(profile => profile.slug).sort();
}

/** Offline stand-in is clearly labeled synthetic; no invented GitHub metadata. */
export function syntheticProfile(slug: string): RepoProfile {
  const seed = fnv1a(slug.toLowerCase());
  let state = seed;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  const language = ['TypeScript', 'Python', 'Rust', 'Go', 'Java', 'C', 'Ruby', 'C#'][seed % 8];
  const extension = ['ts', 'py', 'rs', 'go', 'java', 'c', 'rb', 'cs'][seed % 8];
  const names = ['src/core', 'src/api', 'src/storage', 'src/runtime', 'tests', 'tools'].slice(0, 3 + seed % 4);
  const components = names.map(name => ({ name, files: 4 + Math.floor(random() * 30), loc: 150 + Math.floor(random() * 2400), fanIn: 0, fanOut: 0 })).sort((a, b) => b.loc - a.loc || a.name.localeCompare(b.name));
  const edges: [number, number][] = [];
  for (let i = 1; i < components.length; i++) edges.push([i, i - 1]);
  if (seed % 2) edges.push([0, 1]);
  for (const [from, to] of edges) { components[from].fanOut++; components[to].fanIn++; }
  const totalLoc = components.reduce((n, c) => n + c.loc, 0);
  const totalFiles = components.reduce((n, c) => n + c.files, 0);
  return {
    slug, description: 'Offline synthetic repo creature. Reconnect to analyze the real source graph.',
    primaryLanguage: language, languages: { [language]: totalLoc * 30 },
    stars: 0, commits: 0, contributors: 0, ageDays: 0,
    totalFiles, totalLoc, components, edges,
    heart: `${components[0].name}/index.${extension}`, heartFanIn: components[0].fanIn,
    ...componentTopology(components.map(c => c.name), edges),
    testRatio: components.filter(c => c.name === 'tests').reduce((n, c) => n + c.files, 0) / totalFiles,
    seed, fallback: true, dna: emptyDNA(), readme: '', tree: [...components.map(c => c.name + '/'), `${components[0].name}/index.${extension}`],
  };
}

export function offlineProfile(slug: string): RepoProfile {
  const known = fallbackProfiles().find(profile => profile.slug.toLowerCase() === slug.toLowerCase());
  return known ? { ...known, fallback: true } : syntheticProfile(slug);
}

async function loadCache(slug: string): Promise<{ profile: RepoProfile; fresh: boolean } | null> {
  try {
    const file = join(CACHE_ROOT, `${slug}.json`);
    const [contents, info] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
    const profile = JSON.parse(contents) as RepoProfile;
    if (profile.slug !== slug || !Array.isArray(profile.components) || !profile.totalFiles) return null;
    return { profile: refreshLanguage(profile), fresh: Date.now() - info.mtimeMs < CACHE_TTL && typeof profile.readme === 'string' && Array.isArray(profile.tree) && profile.dna !== undefined && 'avgFunctionLength' in profile.dna && 'hasTestDir' in profile.dna };
  } catch { return null; }
}

export async function analyzeRepo(slugOrUrl: string, opts: { token?: string; onProgress?: ProgressCallback } = {}): Promise<RepoProfile> {
  const slug = normalizeSlug(slugOrUrl);
  const token = (opts.token ?? process.env.GITHUB_TOKEN)?.trim() || undefined;
  // Authenticated results never enter public disk cache or another credential's jobs.
  const cacheKey = token ? `${slug}:${createHash('sha256').update(token).digest('hex')}` : slug;
  const cachedMemory = memory.get(cacheKey);
  if (cachedMemory && cachedMemory.expires > Date.now()) {
    replayProfileProgress(cachedMemory.profile, opts.onProgress, cachedMemory.source);
    return structuredClone(cachedMemory.profile);
  }
  let job = inFlight.get(cacheKey);
  if (!job) {
    // The microtask starts after every initial caller can register its own observer.
    const next: AnalysisJob = {
      subscribers: new Map(),
      promise: Promise.resolve().then(async () => {
        const stages = ['clone', 'parse', 'graph', 'dna', 'map', 'design', 'ready'];
        const emit: ProgressCallback = progress => {
          if (next.latest && stages.indexOf(progress.stage) < stages.indexOf(next.latest.stage)) return;
          next.latest = { ...progress, pct: Math.max(next.latest?.pct ?? 0, progress.pct), ...(progress.paths ? { paths: progress.paths.slice(0, 8) } : {}) };
          for (const callback of [...next.subscribers.values()]) notifyProgress(callback, next.latest);
        };
        emit({ stage: 'clone', pct: 0, note: `Loading ${slug}` });
        const cached = token ? null : await loadCache(slug);
        let profile: RepoProfile;
        let source: 'live' | 'cache' | 'fallback' | 'synthetic' = 'live';
        if (cached?.fresh) { profile = cached.profile; source = 'cache'; }
        else {
          try {
            profile = await analyzeGitHubRepo(slug, { token: token ?? '', onProgress: emit });
            if (!token) try {
              const file = join(CACHE_ROOT, `${slug}.json`);
              await mkdir(dirname(file), { recursive: true });
              await writeFile(file, JSON.stringify(profile) + '\n');
            } catch { /* A read-only cache must not stop the demo. */ }
          } catch {
            const known = cached ? undefined : fallbackProfiles().find(p => p.slug.toLowerCase() === slug);
            profile = cached ? { ...cached.profile, fallback: true } : known ? { ...known, fallback: true } : syntheticProfile(slug);
            source = cached ? 'cache' : known ? 'fallback' : 'synthetic';
          }
        }
        if (source !== 'live') replayProfileProgress(profile, emit, source);
        memory.set(cacheKey, { profile, expires: Date.now() + (profile.fallback ? 60_000 : CACHE_TTL), source: source === 'live' ? 'cache' : source });
        return profile;
      }),
    };
    job = next;
    inFlight.set(cacheKey, job);
  }
  const subscription = Symbol();
  if (opts.onProgress) {
    job.subscribers.set(subscription, opts.onProgress);
    if (job.latest) notifyProgress(opts.onProgress, job.latest);
  }
  try { return structuredClone(await job.promise); }
  finally {
    job.subscribers.delete(subscription);
    if (inFlight.get(cacheKey) === job) inFlight.delete(cacheKey);
  }
}
