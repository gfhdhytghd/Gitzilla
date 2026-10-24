import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { archive } from './fixtures.ts';

const disk = vi.hoisted(() => ({ readFile: vi.fn(), stat: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn() }));
vi.mock('node:fs/promises', () => disk);
const ALPHA = 'fixture-token-alpha';
const BETA = 'fixture-token-beta';
const LABELS: Record<string, string> = { [ALPHA]: 'Alpha private source', [BETA]: 'Beta private source' };
const json = (data: unknown) => new Response(JSON.stringify(data));

function installFetch() {
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const authorization = new Headers(init?.headers).get('Authorization');
    const token = authorization?.replace(/^Bearer /, '') ?? '';
    if (token === 'fixture-invalid') return new Response('', { status: 401 });
    const label = token ? LABELS[token] : 'Public source';
    if (url.includes('codeload.github.com') || url.endsWith('/tarball')) {
      return new Response(new Uint8Array(archive([
        { path: 'README.md', text: `# ${label}` },
        { path: 'src/main.ts', text: `import './heart';` },
        { path: 'src/heart.ts', text: `export function ${token === ALPHA ? 'alphaHandler' : token === BETA ? 'betaHandler' : 'publicHandler'}() { return 1; }` },
      ])));
    }
    if (url.endsWith('/languages')) return json({ TypeScript: 100 });
    if (url.includes('/commits?') || url.includes('/contributors?')) return json([{}]);
    return json({ description: label, language: 'TypeScript', private: !!token });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); vi.stubEnv('GITHUB_TOKEN', '');
  disk.readFile.mockRejectedValue(new Error('ENOENT')); disk.stat.mockRejectedValue(new Error('ENOENT'));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('per-request GitHub authentication', () => {
  it('authenticates REST and API tarballs, overrides env token, and never reads/writes public disk cache', async () => {
    vi.stubEnv('GITHUB_TOKEN', BETA);
    const fetcher = installFetch();
    const { analyzeRepo } = await import('./index.ts');
    const profile = await analyzeRepo('demo/private', { token: ALPHA });
    expect(profile.fallback).toBeUndefined(); expect(profile.readme).toBe('Alpha private source');
    expect(profile.heart).toBe('src/heart.ts'); expect(profile.totalFiles).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(5);
    for (const [url, init] of fetcher.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/api\.github\.com\/repos\/demo\/private(?:\/|$)/);
      expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${ALPHA}`);
    }
    expect(fetcher.mock.calls.some(([url]) => String(url) === 'https://api.github.com/repos/demo/private/tarball')).toBe(true);
    expect(disk.readFile).not.toHaveBeenCalled(); expect(disk.stat).not.toHaveBeenCalled();
    expect(disk.mkdir).not.toHaveBeenCalled(); expect(disk.writeFile).not.toHaveBeenCalled();
    expect(JSON.stringify(profile)).not.toContain(ALPHA);
  });
  it('partitions memory and concurrent jobs by credential and anonymous access, deduplicating only identical tokens', async () => {
    const fetcher = installFetch();
    const { analyzeRepo } = await import('./index.ts');
    const [a, b, anonymous, aAgain] = await Promise.all([
      analyzeRepo('demo/project', { token: ALPHA }), analyzeRepo('demo/project', { token: BETA }),
      analyzeRepo('demo/project'), analyzeRepo('https://github.com/demo/project', { token: ALPHA }),
    ]);
    expect(a.readme).toBe('Alpha private source'); expect(b.readme).toBe('Beta private source');
    expect(a.dna?.identifiers).toContain('alphaHandler'); expect(b.dna?.identifiers).toContain('betaHandler');
    expect(anonymous.dna?.identifiers).toContain('publicHandler'); expect(anonymous.dna?.identifiers).not.toContain('alphaHandler');
    expect(anonymous.readme).toBe('Public source'); expect(aAgain).toEqual(a); expect(aAgain).not.toBe(a);
    expect(fetcher).toHaveBeenCalledTimes(15);
    expect((await analyzeRepo('demo/project', { token: ALPHA })).readme).toBe('Alpha private source');
    expect((await analyzeRepo('demo/project', { token: BETA })).readme).toBe('Beta private source');
    expect((await analyzeRepo('demo/project')).readme).toBe('Public source');
    expect(fetcher).toHaveBeenCalledTimes(15);
    expect(disk.readFile).toHaveBeenCalledTimes(1); expect(disk.writeFile).toHaveBeenCalledTimes(1);
    const written = disk.writeFile.mock.calls[0];
    expect(written[0]).toContain('/.cache/analysis/demo/project.json');
    expect(written[1]).toContain('Public source');
    for (const privateValue of [ALPHA, BETA, 'Alpha private source', 'Beta private source', 'alphaHandler', 'betaHandler']) expect(written[1]).not.toContain(privateValue);
  });
  it('does not let fresh public disk cache mask an authenticated repository', async () => {
    disk.readFile.mockResolvedValue(JSON.stringify({ slug: 'demo/project', totalFiles: 9, components: [], primaryLanguage: 'Java', languages: { Java: 100 }, readme: 'Public old source', tree: [] }));
    disk.stat.mockResolvedValue({ mtimeMs: Date.now() });
    installFetch();
    const { analyzeRepo } = await import('./index.ts');
    expect((await analyzeRepo('demo/project', { token: ALPHA })).readme).toBe('Alpha private source');
    expect(disk.readFile).not.toHaveBeenCalled(); expect(disk.writeFile).not.toHaveBeenCalled();
  });
  it('isolates invalid credentials from previously cached private data and keeps offline fallback working', async () => {
    const fetcher = installFetch();
    const { analyzeRepo } = await import('./index.ts');
    expect((await analyzeRepo('demo/private', { token: ALPHA })).readme).toBe('Alpha private source');
    const denied = await analyzeRepo('demo/private', { token: 'fixture-invalid' });
    expect(denied.fallback).toBe(true); expect(denied.description).toContain('synthetic');
    expect(denied.readme).toBe(''); expect(JSON.stringify(denied)).not.toContain('Alpha private source');
    const publicProfile = await analyzeRepo('demo/private');
    expect(publicProfile.readme).toBe('Public source'); expect(publicProfile.fallback).toBeUndefined();
    expect(fetcher.mock.calls.some(([url]) => String(url).startsWith('https://codeload.github.com/'))).toBe(true);
  });
  it('treats env-token requests as authenticated and allows an explicit empty token to use anonymous mode', async () => {
    vi.stubEnv('GITHUB_TOKEN', BETA);
    const fetcher = installFetch();
    const { analyzeRepo } = await import('./index.ts');
    expect((await analyzeRepo('demo/project')).readme).toBe('Beta private source');
    expect(disk.writeFile).not.toHaveBeenCalled();
    expect((await analyzeRepo('demo/project', { token: '' })).readme).toBe('Public source');
    expect(disk.writeFile).toHaveBeenCalledOnce();
    const anonymous = fetcher.mock.calls.filter(([, init]) => !new Headers(init?.headers).has('Authorization'));
    expect(anonymous).toHaveLength(5);
    expect(anonymous.some(([url]) => String(url).includes('codeload.github.com'))).toBe(true);
  });
});
