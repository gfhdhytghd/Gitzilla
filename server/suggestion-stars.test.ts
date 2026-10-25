import { describe, expect, it, vi } from 'vitest';
import { CURATED_REPOS } from '../analysis/suggestion-pool.ts';
import snapshot from '../analysis/suggestion-stars.json' with { type: 'json' };
import { createSuggestions, SUGGESTIONS_TTL, type SuggestedRepo } from './suggestions.ts';

const epoch = Date.parse('2026-10-25T12:00:00Z');
const tick = () => new Promise(resolve => setImmediate(resolve));
const json = (body: unknown) => new Response(JSON.stringify(body));
const seed: SuggestedRepo[] = [
  { slug: 'git/git', language: 'C', source: 'curated', stars: 17 },
  { slug: 'example/unknown', language: 'Python', source: 'curated' },
  { slug: 'example/known', language: 'Python', source: 'curated', stars: 123 },
  { slug: 'example/zero', language: 'Python', source: 'curated', stars: 0 },
];
const publicRepo = (nameWithOwner: string, stargazerCount: number) => ({ nameWithOwner, stargazerCount, isPrivate: false });
const bySlug = (service: ReturnType<typeof createSuggestions>) => Object.fromEntries(service.get({ n: 16 }).repos.map(repo => [repo.slug, repo]));

describe('curated suggestion star metadata', () => {
  it('has a real positive offline snapshot for all 85 curated repos, including Git and Lazygit', () => {
    expect(CURATED_REPOS).toHaveLength(85);
    expect(Object.keys(snapshot.stars)).toHaveLength(85);
    expect(Date.parse(snapshot.fetchedAt)).not.toBeNaN();
    for (const repo of CURATED_REPOS) {
      expect(Number.isSafeInteger(repo.stars)).toBe(true); expect(repo.stars).toBeGreaterThan(0);
      expect(repo.stars).toBe((snapshot.stars as Record<string, number>)[repo.slug]);
    }
    expect(CURATED_REPOS.find(repo => repo.slug === 'git/git')?.stars).toBeGreaterThan(10000);
    expect(CURATED_REPOS.find(repo => repo.slug === 'jesseduffield/lazygit')?.stars).toBeGreaterThan(10000);
    expect(CURATED_REPOS.some(repo => repo.slug === 'raysan5/raylib')).toBe(true);
  });
  it('returns immediately, refreshes all languages once, accepts public redirects, and never emits unknown as zero', async () => {
    let resolve!: (value: Response) => void;
    const pending = new Promise<Response>(r => { resolve = r; });
    const fetcher = vi.fn(async (input: string | URL | Request) => String(input).endsWith('/graphql') ? pending : json({ items: [] })) as unknown as typeof fetch;
    const service = createSuggestions({ pool: seed, getToken: () => 'metadata-token-fixture', now: () => epoch, fetcher });
    const first = bySlug(service);
    expect(first['git/git'].stars).toBe(17);
    expect(Object.hasOwn(first['example/unknown'], 'stars')).toBe(false);
    expect(Object.hasOwn(first['example/zero'], 'stars')).toBe(false);
    service.get({ lang: 'Python' }); service.get({ lang: 'C' });
    const calls = vi.mocked(fetcher).mock.calls.filter(([url]) => String(url).endsWith('/graphql'));
    expect(calls).toHaveLength(1);
    const request = calls[0][1]!;
    expect(request.method).toBe('POST'); expect(new Headers(request.headers).get('Authorization')).toBe('Bearer metadata-token-fixture');
    expect(JSON.parse(request.body as string).query).toContain('repository(owner:"git",name:"git")');
    resolve(json({ data: { r0: publicRepo('new-owner/git', 50000), r1: publicRepo('example/unknown', 400), r2: publicRepo('example/known', 0), r3: null } }));
    await tick();
    const fresh = bySlug(service);
    expect(fresh['git/git'].stars).toBe(50000); expect(fresh['example/unknown'].stars).toBe(400);
    expect(fresh['example/known'].stars).toBe(123); expect(Object.hasOwn(fresh['example/zero'], 'stars')).toBe(false);
    expect(JSON.stringify(fresh)).not.toContain('metadata-token-fixture'); expect(JSON.stringify(fresh)).not.toContain('"stars":0');
    expect(seed[0].stars).toBe(17);
  });
  it('refreshes counts hourly across language filters and accepts genuine decreases', async () => {
    let time = epoch, count = 0;
    const fetcher = vi.fn(async (input: string | URL | Request) => String(input).endsWith('/graphql')
      ? json({ data: { r0: publicRepo('git/git', ++count === 1 ? 50000 : 49900) } }) : json({ items: [] })) as unknown as typeof fetch;
    const service = createSuggestions({ pool: seed, now: () => time, getToken: () => 'fixture', fetcher });
    service.get(); await tick(); expect(bySlug(service)['git/git'].stars).toBe(50000);
    time += SUGGESTIONS_TTL - 1; service.get({ lang: 'Python' }); service.get({ lang: 'C' }); await tick(); expect(count).toBe(1);
    time++; expect(bySlug(service)['git/git'].stars).toBe(50000); service.get({ lang: 'Python' });
    await tick(); expect(count).toBe(2); expect(bySlug(service)['git/git'].stars).toBe(49900);
  });
  it.each(['network', 'http', 'graphql'])('keeps last-known counts when the hourly refresh fails with %s', async failure => {
    let time = epoch, broken = false;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (!String(input).endsWith('/graphql')) return json({ items: [] });
      if (!broken) return json({ data: { r0: publicRepo('git/git', 50000) } });
      if (failure === 'network') throw new Error('offline');
      return failure === 'http' ? new Response('', { status: 503 }) : json({ errors: [{ type: 'RATE_LIMITED' }], data: null });
    }) as unknown as typeof fetch;
    const service = createSuggestions({ pool: seed, now: () => time, getToken: () => 'fixture', fetcher });
    service.get(); await tick(); broken = true; time += SUGGESTIONS_TTL; service.get(); await tick();
    expect(bySlug(service)['git/git'].stars).toBe(50000); expect(bySlug(service)['example/known'].stars).toBe(123);
    expect(Object.hasOwn(bySlug(service)['example/zero'], 'stars')).toBe(false);
  });
  it('ignores private, missing, zero, nonnumeric and invalid metadata in a partial response', async () => {
    const changes = [
      { ...publicRepo('git/git', 999), isPrivate: true }, publicRepo('git/git', 0), publicRepo('git/git', -1),
      { ...publicRepo('git/git', 999), stargazerCount: '999' }, publicRepo('git/git', Number.MAX_SAFE_INTEGER + 1), null,
    ];
    for (const item of changes) {
      const fetcher = vi.fn(async (input: string | URL | Request) => String(input).endsWith('/graphql')
        ? json({ data: { r0: item, r1: publicRepo('example/unknown', 321) }, errors: [{ type: 'NOT_FOUND' }] }) : json({ items: [] })) as unknown as typeof fetch;
      const service = createSuggestions({ pool: seed, getToken: () => 'fixture', fetcher });
      service.get(); await tick(); const result = bySlug(service);
      expect(result['git/git'].stars).toBe(17); expect(result['example/unknown'].stars).toBe(321);
    }
  });
  it('serves positive static counts with no token or failed initial refresh', async () => {
    for (const getToken of [() => undefined, () => 'fixture']) {
      const fetcher = vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
      const service = createSuggestions({ getToken, fetcher }); service.get(); await tick();
      for (let i = 0; i < 12; i++) expect(service.get({ n: 16 }).repos.every(repo => typeof repo.stars === 'number' && repo.stars > 0)).toBe(true);
      if (!getToken()) expect(fetcher).not.toHaveBeenCalled();
    }
  });
});
