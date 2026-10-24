import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeGitHubRepo, countFromPage } from './github.ts';
import { archive } from './fixtures.ts';

const body = archive([{ path: 'README.md', text: '# Test Kaiju\n![Badge](https://badge.example/x.svg)\nA repo for graph tests.' }, { path: 'src/main.ts', text: "import './heart';" }, { path: 'src/heart.ts', text: 'export const heart = 1' }]);
const json = (data: unknown, headers?: HeadersInit) => new Response(JSON.stringify(data), { headers });

beforeEach(() => { vi.stubEnv('GITHUB_TOKEN', ''); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('GitHub source and metadata requests', () => {
  it('combines a real archive with metadata and one-item pagination counts', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input); calls.push({ url, init });
      if (url.includes('codeload')) return new Response(new Uint8Array(body));
      if (url.endsWith('/languages')) return json({ TypeScript: 1234 });
      if (url.includes('/contributors?')) return json([{}], { link: '<https://api.github.com/repos/demo/repo/contributors?per_page=1&page=27>; rel="last"' });
      if (url.includes('/commits?')) return json([{ commit: { message: 'Fix renderer batching\n\nLong body' } }, { commit: { message: 'secret=not-for-display' } }], { link: '<https://api.github.com/repos/demo/repo/commits?page=32&per_page=10>; rel="last"' });
      return json({ description: 'Repo heart', stargazers_count: 99, language: 'TypeScript', created_at: '2020-01-01T00:00:00Z' });
    }) as typeof fetch;
    const p = await analyzeGitHubRepo('demo/repo', { fetcher });
    expect(p.totalFiles).toBe(2); expect(p.heart).toBe('src/heart.ts'); expect(p.heartFanIn).toBe(1);
    expect(p.stars).toBe(99); expect(p.commits).toBe(320); expect(p.contributors).toBe(27);
    expect(p.languages).toEqual({ TypeScript: 1234 }); expect(p.ageDays).toBeGreaterThan(1000);
    expect(p.readme).toContain('Test Kaiju'); expect(p.readme).not.toContain('badge.example');
    expect(p.tree).toContain('src/heart.ts'); expect(p.tree).toContain('README.md');
    expect(calls).toHaveLength(9);
    expect(p.dna?.commits).toEqual(['Fix renderer batching']);
    const commitCalls = calls.filter(call => call.url.includes('/commits?') && new URL(call.url).searchParams.get('per_page') === '10');
    expect(commitCalls).toHaveLength(1); expect(commitCalls[0].url).toContain('per_page=10');
    expect(calls.find(call => call.url.includes('codeload'))?.init?.headers).not.toHaveProperty('Authorization');
  });
  it('still returns real source metrics if optional API metadata is rate limited', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => String(input).includes('codeload')
      ? new Response(new Uint8Array(body)) : new Response('rate limited', { status: 403 })) as typeof fetch;
    const p = await analyzeGitHubRepo('demo/rate-limited', { fetcher });
    expect(p.fallback).toBeUndefined(); expect(p.totalFiles).toBe(2); expect(p.stars).toBe(0);
    expect(p.primaryLanguage).toBe('TypeScript'); expect(p.commits).toBe(0); expect(p.dna?.commits).toEqual([]);
  });
  it('aborts a stalled archive at the analysis deadline', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (!String(input).includes('codeload')) return json([]);
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    }) as typeof fetch;
    await expect(analyzeGitHubRepo('demo/stalled', { fetcher, timeoutMs: 20 })).rejects.toThrow('timed out');
  });
  it('rejects archive HTTP errors and unsupported/empty source instead of caching fake live profiles', async () => {
    const missing = vi.fn(async () => new Response('', { status: 404 })) as typeof fetch;
    await expect(analyzeGitHubRepo('demo/missing', { fetcher: missing })).rejects.toThrow('404');
    const empty = vi.fn(async (input: string | URL | Request) => String(input).includes('codeload')
      ? new Response(new Uint8Array(archive([{ path: 'README.md', text: 'Hello' }]))) : json([])) as typeof fetch;
    await expect(analyzeGitHubRepo('demo/readme', { fetcher: empty })).rejects.toThrow('No supported source');
  });
  it.each([true, undefined])('blocks authenticated snapshot writes when public visibility is %s', async (visibility) => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/tarball')) return new Response(new Uint8Array(body));
      if (url.endsWith('/languages') || url.includes('/commits?') || url.includes('/contributors?')) return json([]);
      return json(visibility === undefined ? {} : { private: visibility });
    }) as typeof fetch;
    await expect(analyzeGitHubRepo('demo/repo', { token: 'fixture-only', publicOnly: true, fetcher })).rejects.toThrow('verified public');
    expect(vi.mocked(fetcher).mock.calls.some(([url]) => String(url).endsWith('/tarball'))).toBe(false);
  });
  it('allows authenticated precompute only after verified public metadata and includes recent commits', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fixture-only');
      if (url.endsWith('/tarball')) return new Response(new Uint8Array(body));
      if (url.endsWith('/languages')) return json({ TypeScript: 100 });
      if (url.includes('/commits?')) return json([{ commit: { message: 'Improve graph layout' } }]);
      if (url.includes('/contributors?')) return json([{}]);
      return json({ private: false, language: 'TypeScript' });
    }) as typeof fetch;
    const profile = await analyzeGitHubRepo('demo/repo', { token: 'fixture-only', publicOnly: true, fetcher });
    expect(profile.dna?.commits).toEqual(['Improve graph layout']);
    expect(vi.mocked(fetcher).mock.calls.some(([url]) => String(url).endsWith('/tarball'))).toBe(true);
    expect(JSON.stringify(profile)).not.toContain('fixture-only');
  });
  it('uses array length without a last-page link', () => {
    expect(countFromPage(null, [{}])).toBe(1); expect(countFromPage(null, [])).toBe(0);
    expect(countFromPage('<https://api.github.com/x?page=2>; rel="next"', [{}])).toBe(1);
  });
});
