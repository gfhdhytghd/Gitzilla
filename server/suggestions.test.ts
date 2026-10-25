import { createServer } from 'node:http';
import { once } from 'node:events';
import { readdirSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { RepoSuggestion } from '../shared/types.ts';
import { CURATED_REPOS } from '../analysis/suggestion-pool.ts';
import { createSuggestions, handleSuggestionsRoute, SUGGESTIONS_TTL, type SuggestionResult } from './suggestions.ts';

const instant = Date.parse('2026-10-25T12:00:00Z');
const pool = Array.from({ length: 48 }, (_, i): RepoSuggestion => ({ slug: `curated/python-${i}`, language: 'Python', stars: i * 100, source: 'curated' }));
const row = (i: number) => ({ full_name: `rising/repo-${i}`, language: 'Python', stargazers_count: 400 + i, description: 'Real Python code', size: 100, private: false, fork: false, archived: false });
const response = (items = Array.from({ length: 32 }, (_, i) => row(i))) => new Response(JSON.stringify({ items }));
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const slugs = (r: SuggestionResult) => r.repos.map(repo => repo.slug);
const trendCount = (r: SuggestionResult) => r.repos.filter(repo => repo.source === 'trending').length;
function fixture(fetcher = vi.fn(async () => response()), extra: Parameters<typeof createSuggestions>[0] = {}) {
  const routed = ((input, init) => String(input).endsWith('/graphql') ? Promise.resolve(new Response(JSON.stringify({ data: {} }))) : (fetcher as typeof fetch)(input, init)) as typeof fetch;
  return createSuggestions({ fetcher: routed, getToken: () => 'server-secret-fixture', pool, now: () => instant, random: () => 0.5, ...extra });
}
async function warm(service: ReturnType<typeof fixture>) { service.get(); await tick(); return service.get(); }

describe('suggestions curated catalog', () => {
  it('has a broad unique pool and exactly the fifteen actual offline fallbacks', () => {
    expect(CURATED_REPOS.length).toBeGreaterThanOrEqual(80); expect(CURATED_REPOS.length).toBeLessThanOrEqual(100);
    expect(new Set(CURATED_REPOS.map(repo => repo.slug)).size).toBe(CURATED_REPOS.length);
    expect(new Set(CURATED_REPOS.map(repo => repo.language)).size).toBeGreaterThanOrEqual(12);
    const fallbacks = readdirSync(new URL('../data/fallback/', import.meta.url)).filter(name => name.endsWith('.json')).map(name => name.replace('__', '/').replace('.json', '')).sort();
    expect(CURATED_REPOS.filter(repo => repo.fallback).map(repo => repo.slug).sort()).toEqual(fallbacks);
    for (const repo of CURATED_REPOS) {
      expect(repo.slug).toMatch(/^[a-z\d-]+\/[a-z\d_.-]+$/); expect(repo.source).toBe('curated');
      expect(repo.stars).toBeGreaterThan(0); expect(repo.description!.length).toBeLessThanOrEqual(140);
      expect(repo.description).not.toMatch(/<[^>]*>/);
    }
  });
});

describe('nonblocking GitHub suggestions cache and mixing', () => {
  it('returns curated only without a token, clamps n, and filters case-insensitive language aliases', () => {
    const fetcher = vi.fn(); const service = fixture(fetcher, { getToken: () => undefined, pool: CURATED_REPOS });
    for (const [n, expected] of [[undefined, 8], [0, 4], [99, 16], ['garbage', 8], [8.9, 8], ['', 8]] as const) expect(service.get({ n }).repos).toHaveLength(expected);
    expect(service.get().trendingAt).toBeNull(); expect(service.get().repos.every(repo => repo.source === 'curated')).toBe(true);
    expect(service.get({ lang: 'py' }).repos.every(repo => repo.language === 'Python')).toBe(true);
    expect(service.get({ lang: 'CPLUSPLUS' }).repos).toEqual([]);
    expect(service.get({ lang: 'cpp' }).repos.every(repo => repo.language === 'C++')).toBe(true);
    expect(service.get({ lang: 'Python" is:private' })).toEqual({ repos: [], trendingAt: null });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('never waits for GitHub, shares one in-flight refresh, and later mixes six curated with three live repos', async () => {
    const pending = deferred<Response>(); const fetcher = vi.fn(() => pending.promise); const service = fixture(fetcher);
    expect(service.get({ n: 9 }).trendingAt).toBeNull();
    expect(service.get({ n: 9 }).repos).toHaveLength(9); expect(fetcher).toHaveBeenCalledOnce();
    pending.resolve(response()); await tick();
    const result = service.get({ n: 9 });
    expect(trendCount(result)).toBe(3); expect(result.trendingAt).toBe(instant);
    expect(new Set(slugs(result)).size).toBe(9);
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.origin + url.pathname).toBe('https://api.github.com/search/repositories');
    expect(url.searchParams.get('q')).toContain('created:>=2026-09-25');
    expect(url.searchParams.get('q')).toMatch(/is:public.*fork:false.*archived:false.*size:1\.\.204800.*stars:>=200/);
    expect(url.searchParams.get('sort')).toBe('stars');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer server-secret-fixture');
    expect(JSON.stringify(result)).not.toContain('server-secret-fixture');
    result.repos[0].slug = 'mutated/repo'; expect(slugs(service.get())).not.toContain('mutated/repo');
  });
  it('keeps results for one hour, then serves stale immediately during a single background refresh', async () => {
    let time = instant; const next = deferred<Response>();
    const fetcher = vi.fn(async () => response()).mockImplementationOnce(async () => response()).mockImplementationOnce(() => next.promise);
    const service = fixture(fetcher, { now: () => time }); await warm(service);
    time += SUGGESTIONS_TTL - 1; expect(service.get().trendingAt).toBe(instant); expect(fetcher).toHaveBeenCalledOnce();
    time++; expect(service.get().trendingAt).toBe(instant); service.get(); expect(fetcher).toHaveBeenCalledTimes(2);
    next.resolve(response()); await tick(); expect(service.get().trendingAt).toBe(time);
  });
  it('retains stale live results on network and 5xx errors, with a retry cooldown', async () => {
    let time = instant; const fetcher = vi.fn(async () => response()); const service = fixture(fetcher, { now: () => time });
    await warm(service); time += SUGGESTIONS_TTL;
    fetcher.mockRejectedValueOnce(new Error('network error containing server-secret-fixture'));
    expect(service.get().trendingAt).toBe(instant); await tick();
    expect(trendCount(service.get())).toBeGreaterThan(0); expect(fetcher).toHaveBeenCalledTimes(2);
    time += 60000; fetcher.mockResolvedValueOnce(new Response('', { status: 503 })); service.get(); await tick();
    expect(service.get().trendingAt).toBe(instant); expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each([401, 403, 429])('returns curated only globally on GitHub %i and retries after reset', async status => {
    let time = instant; const fetcher = vi.fn(async () => response()); const service = fixture(fetcher, { now: () => time });
    await warm(service); time += SUGGESTIONS_TTL;
    fetcher.mockResolvedValueOnce(new Response('', { status, headers: { 'x-ratelimit-reset': String((time + 120000) / 1000) } }));
    service.get(); await tick();
    const limited = service.get(); expect(limited.trendingAt).toBeNull(); expect(trendCount(limited)).toBe(0);
    service.get({ lang: 'Python' }); expect(fetcher).toHaveBeenCalledTimes(2);
    time += 120000; service.get(); await tick(); expect(service.get().trendingAt).toBe(time);
  });
  it('does not get stuck on malformed retry headers and stops using cached live data when the token disappears', async () => {
    let time = instant, token: string | undefined = 'server-secret-fixture';
    const fetcher = vi.fn(async () => response()); const service = fixture(fetcher, { now: () => time, getToken: () => token });
    await warm(service); token = undefined; expect(service.get().trendingAt).toBeNull(); expect(trendCount(service.get())).toBe(0);
    token = 'server-secret-fixture'; time += SUGGESTIONS_TTL;
    fetcher.mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': 'bad', 'x-ratelimit-reset': 'bad' } }));
    service.get(); await tick(); expect(service.get().trendingAt).toBeNull();
    time += 60000; service.get(); await tick(); expect(service.get().trendingAt).toBe(time);
    token = 'rotated-server-fixture'; expect(service.get().trendingAt).toBeNull(); await tick(); expect(service.get().trendingAt).toBe(time);
  });
  it('runs created/recently-pushed per-language searches and rejects other languages from their responses', async () => {
    const fetcher = vi.fn(async () => response([row(1), { ...row(2), language: 'Go' }, row(1)])); const service = fixture(fetcher);
    service.get({ lang: 'py' }); expect(fetcher).toHaveBeenCalledTimes(2); await tick();
    const queries = fetcher.mock.calls.map(call => new URL(String((call as unknown as [URL])[0])).searchParams.get('q')!);
    expect(queries.every(q => q.includes('language:"Python"'))).toBe(true);
    expect(queries.some(q => q.includes('pushed:>=2026-10-18') && q.includes('created:>=2026-04-28'))).toBe(true);
    const result = service.get({ n: 16, lang: 'PYTHON' });
    expect(result.repos.every(repo => repo.language === 'Python')).toBe(true); expect(trendCount(result)).toBe(1);
    expect(new Set(slugs(result)).size).toBe(result.repos.length);
  });
  it('filters forks, archives, private/empty/huge/non-code/NSFW rows and emits bounded plain descriptions', async () => {
    const invalid = [
      { fork: true }, { archived: true }, { private: true }, { disabled: true }, { size: 204801 }, { size: 0 }, { size: NaN },
      { language: null }, { language: 'CSS' }, { language: 'Markdown' }, { stargazers_count: 199 },
      { full_name: 'example/awesome-tools' }, { full_name: 'example/docs' }, { full_name: 'example/nsfw-tool' },
      { topics: ['awesome-list'] }, { description: 'A curated list of tools' }, { topics: ['pornography'] },
      { full_name: 'not-a-slug' }, { private: undefined },
    ].map((changes, i) => ({ ...row(i + 100), ...changes }));
    const good = [
      { ...row(1), description: '<b>Useful</b> [tool](https://example.test)\n&amp; data' },
      { ...row(2), description: '&lt;b&gt;Encoded&lt;/b&gt; ' + 'z'.repeat(200), size: 204800 },
    ];
    const fetcher = vi.fn(async () => response([...invalid, ...good] as ReturnType<typeof row>[])); const service = fixture(fetcher);
    await warm(service); const result = service.get({ n: 16 });
    const trending = result.repos.filter(repo => repo.source === 'trending'); expect(trending).toHaveLength(2);
    expect(trending.find(repo => repo.slug === 'rising/repo-1')?.description).toBe('Useful tool & data');
    expect(trending.find(repo => repo.slug === 'rising/repo-2')?.description).not.toMatch(/[<>\n]/);
    expect(trending.every(repo => repo.description!.length <= 140)).toBe(true);
  });
  it('avoids repeats across each three-request session window when possible, including curated-only mode', async () => {
    const service = fixture(); await warm(service);
    const a = service.get({ n: 9, session: 'one' }), b = service.get({ n: 9, session: 'one' }), c = service.get({ n: 9, session: 'one' });
    expect(new Set([...slugs(a), ...slugs(b), ...slugs(c)]).size).toBe(27);
    expect([a, b, c].map(trendCount)).toEqual([3, 3, 3]);
    expect(slugs(service.get({ n: 9, session: 'two' }))).toEqual(slugs(a));
    const offline = fixture(vi.fn(), { getToken: () => undefined });
    const requests = Array.from({ length: 3 }, () => offline.get({ n: 16, session: 'offline' }));
    expect(new Set(requests.flatMap(slugs)).size).toBe(48);
  });
  it('deduplicates a curated/trending overlap and reuses older results gracefully for scarce language pools', async () => {
    const small = pool.slice(0, 8).map((repo, i) => ({ ...repo, ...(i === 0 ? { fallback: true } : {}) }));
    const fetcher = vi.fn(async () => response([{ ...row(1), full_name: small[0].slug }]));
    const service = fixture(fetcher, { pool: small }); await warm(service);
    const all = service.get({ n: 16 }); expect(all.repos).toHaveLength(8); expect(new Set(slugs(all)).size).toBe(8);
    expect(all.repos.find(repo => repo.slug === small[0].slug)?.fallback).toBe(true);
    const a = service.get({ n: 4, session: 'small' }), b = service.get({ n: 4, session: 'small' }), c = service.get({ n: 4, session: 'small' });
    expect(new Set([...slugs(a), ...slugs(b)]).size).toBe(8);
    expect(slugs(c).some(slug => slugs(b).includes(slug))).toBe(false);
    expect(c.repos).toHaveLength(4);
  });
});

it('serves real HTTP responses with a private session cookie, no-store, language/n params and method handling', async () => {
  const service = fixture(vi.fn(), { getToken: () => undefined, pool: CURATED_REPOS });
  const server = createServer((req, res) => {
    if (!handleSuggestionsRoute(req, res, new URL(req.url ?? '/', 'http://localhost'), service)) { res.writeHead(404); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const first = await fetch(base + '/api/suggestions?n=8'); expect(first.status).toBe(200); expect(first.headers.get('cache-control')).toBe('no-store');
    expect(first.headers.get('set-cookie')).toMatch(/gitzilla_suggestions=[a-f0-9]{32};.*HttpOnly; SameSite=Lax/);
    const cookie = first.headers.get('set-cookie')!.split(';')[0], a = await first.json() as SuggestionResult;
    const b = await (await fetch(base + '/api/suggestions?n=8', { headers: { Cookie: cookie } })).json() as SuggestionResult;
    const c = await (await fetch(base + '/api/suggestions?n=8', { headers: { Cookie: cookie } })).json() as SuggestionResult;
    expect(new Set([...slugs(a), ...slugs(b), ...slugs(c)]).size).toBe(24);
    const py = await fetch(base + '/api/suggestions?n=4&lang=py');
    expect(((await py.json()) as SuggestionResult).repos.every(repo => repo.language === 'Python')).toBe(true);
    const method = await fetch(base + '/api/suggestions', { method: 'POST' }); expect(method.status).toBe(405); expect(method.headers.get('allow')).toBe('GET');
    expect((await fetch(base + '/elsewhere')).status).toBe(404);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
