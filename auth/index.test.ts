import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getGithubToken, getSession, handleAuthRoute, listGithubRepos, parseEnv, safeReturnTo, seal, unseal } from './index.ts';

const DOMAIN = 'gitzilla-test.us.auth0.com';
const realFetch = globalThis.fetch;
let server: Server;
let base = '';

beforeAll(async () => {
  vi.stubEnv('AUTH0_DOMAIN', DOMAIN);
  vi.stubEnv('AUTH0_CLIENT_ID', 'cid');
  vi.stubEnv('AUTH0_CLIENT_SECRET', 'csecret');
  vi.stubEnv('AUTH0_COOKIE_SECRET', 'cookie-secret-for-tests');
  vi.stubEnv('PUBLIC_URL', '');
  server = createServer((req, res) => {
    void (async () => {
      if (await handleAuthRoute(req, res)) return;
      if (req.url === '/token') { res.end(String(await getGithubToken(req))); return; }
      res.end(JSON.stringify(await getSession(req)));
    })();
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => { server.close(); vi.unstubAllEnvs(); globalThis.fetch = realFetch; });
afterEach(() => { globalThis.fetch = realFetch; });

const jar = (res: Response) => res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => !c.endsWith('=')).join('; ');
const jwt = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`;

describe('auth helpers', () => {
  it('seals and rejects tampered or expired cookies', () => {
    const key = createHash('sha256').update('k').digest();
    const v = seal({ a: 1 }, key, 60);
    expect(unseal(v, key)).toEqual({ a: 1 });
    expect(unseal(v.slice(0, -2) + 'AA', key)).toBeNull();
    expect(unseal(seal({ a: 1 }, key, -1), key)).toBeNull();
    expect(unseal(v, createHash('sha256').update('other').digest())).toBeNull();
  });
  it('sanitizes returnTo', () => {
    expect(safeReturnTo('/r/ABCD')).toBe('/r/ABCD');
    expect(safeReturnTo('//evil.com')).toBe('/');
    expect(safeReturnTo('https://evil.com')).toBe('/');
    expect(safeReturnTo(null)).toBe('/');
  });
  it('parses AUTH0_ keys from dotenv text', () => {
    expect(parseEnv('AUTH0_DOMAIN=a.auth0.com\nexport AUTH0_CLIENT_ID="x y"\nGEMINI_API_KEY=z\nAUTH0_CLIENT_SECRET=s # c'))
      .toEqual({ AUTH0_DOMAIN: 'a.auth0.com', AUTH0_CLIENT_ID: 'x y', AUTH0_CLIENT_SECRET: 's' });
  });
});

describe('auth routes', () => {
  it('reports signed-out state', async () => {
    expect(await (await fetch(`${base}/api/me`)).json()).toEqual({ enabled: true, user: null });
    expect((await fetch(`${base}/api/me/repos`)).status).toBe(401);
  });

  it('runs login → callback → session → repos → logout', async () => {
    const login = await fetch(`${base}/auth/login?returnTo=/r/ABCD`, { redirect: 'manual' });
    expect(login.status).toBe(302);
    const authorize = new URL(login.headers.get('location')!);
    expect(authorize.origin).toBe(`https://${DOMAIN}`);
    expect(authorize.searchParams.get('connection')).toBe('github');
    expect(authorize.searchParams.get('redirect_uri')).toBe(`${base}/auth/callback`);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(login.headers.getSetCookie()[0]).toMatch(/HttpOnly; SameSite=Lax/);
    const state = authorize.searchParams.get('state')!, nonce = authorize.searchParams.get('nonce')!;

    const calls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const u = String(input);
      if (u.startsWith(base)) return realFetch(input, init);
      calls.push(u);
      if (u === `https://${DOMAIN}/oauth/token`) {
        const body = JSON.parse(String(init!.body));
        if (body.grant_type === 'client_credentials') return Response.json({ access_token: 'mgmt', expires_in: 86400 });
        expect(body).toMatchObject({ grant_type: 'authorization_code', code: 'abc', redirect_uri: `${base}/auth/callback` });
        return Response.json({ id_token: jwt({ iss: `https://${DOMAIN}/`, aud: 'cid', nonce, sub: 'github|42', nickname: 'octocat', picture: 'https://a/p.png' }) });
      }
      if (u.startsWith(`https://${DOMAIN}/api/v2/users/github%7C42`)) {
        expect(new Headers(init!.headers).get('authorization')).toBe('Bearer mgmt');
        return Response.json({ identities: [{ provider: 'github', access_token: 'gho_secret' }] });
      }
      if (u.startsWith('https://api.github.com/user/repos')) {
        return Response.json([
          { name: 'old', full_name: 'octocat/old', owner: { id: 42 }, fork: false, permissions: { admin: true }, private: false, language: 'Go', stargazers_count: 3, pushed_at: '2020-01-01T00:00:00Z' },
          { name: 'new', full_name: 'acme/new', owner: { id: 7 }, fork: false, permissions: { push: true }, private: true, language: null, stargazers_count: 0, pushed_at: '2026-01-01T00:00:00Z' },
        ]);
      }
      if (u === 'https://api.github.com/user') return Response.json({ id: 42, login: 'octocat' });
      throw new Error(`unexpected fetch ${u}`);
    }) as typeof fetch;

    const callback = await fetch(`${base}/auth/callback?code=abc&state=${state}`, { redirect: 'manual', headers: { cookie: jar(login) } });
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('/r/ABCD');
    const cookie = jar(callback);
    expect(cookie).toMatch(/^rk_session=/);

    const me = await (await fetch(`${base}/api/me`, { headers: { cookie } })).json();
    expect(me).toEqual({ enabled: true, user: { userId: 'github|42', login: 'octocat', avatar: 'https://a/p.png' } });
    expect(await (await fetch(`${base}/token`, { headers: { cookie } })).text()).toBe('gho_secret');
    const repos = await (await fetch(`${base}/api/me/repos`, { headers: { cookie } })).json();
    // Sorted by stars: the 3-star repo comes before the newer 0-star one.
    expect(repos.map((r: { full_name: string }) => r.full_name)).toEqual(['octocat/old', 'acme/new']);
    expect(repos[1]).toEqual({ name: 'new', full_name: 'acme/new', private: true, language: null, stars: 0, pushed_at: '2026-01-01T00:00:00Z', fork: false, permission: 'push', pvpEligible: false });
    expect(repos[0]).toMatchObject({ fork: false, permission: 'admin', pvpEligible: true });
    expect(JSON.stringify(me) + JSON.stringify(repos)).not.toContain('gho_secret');

    const logout = await fetch(`${base}/auth/logout?returnTo=/r/ABCD`, { redirect: 'manual', headers: { cookie } });
    expect(new URL(logout.headers.get('location')!).searchParams.get('returnTo')).toBe(`${base}/auth/logged-out`);
    expect(logout.headers.getSetCookie().some(c => c.startsWith('rk_session=;'))).toBe(true);
    const back = await fetch(`${base}/auth/logged-out`, { redirect: 'manual', headers: { cookie: jar(logout) } });
    expect(back.headers.get('location')).toBe('/r/ABCD');
  });

  it('rejects a callback with a wrong state', async () => {
    const login = await fetch(`${base}/auth/login?returnTo=/r/WXYZ`, { redirect: 'manual' });
    const res = await fetch(`${base}/auth/callback?code=abc&state=nope`, { redirect: 'manual', headers: { cookie: jar(login) } });
    expect(res.headers.get('location')).toMatch(/^\/r\/WXYZ\?auth_error=/);
    expect(jar(res)).not.toMatch(/rk_session/);
  });

  it('leaves other routes alone', async () => {
    expect(await (await fetch(`${base}/other`)).text()).toBe('null');
  });

  it('exposes eligibility and filters PvP picker rows without changing star order or leaking tokens', async () => {
    const key = createHash('sha256').update('gitzilla:cookie-secret-for-tests').digest();
    const cookie = `rk_session=${seal({ userId: 'github|picker', login: 'stale-login', avatar: '' }, key, 60)}`;
    const row = (name: string, stars: number, extra: object = {}) => ({ name, full_name: `renamed/${name}`, owner: { id: 42 }, fork: false, private: false, language: 'Python', stargazers_count: stars, pushed_at: '2026-01-01T00:00:00Z', permissions: { admin: true }, ...extra });
    const rows = [row('own-fork', 100, { fork: true }), row('public-own', 50), row('public-maintainer', 40, { owner: { id: 7 }, permissions: { maintain: true } }),
      row('public-admin', 35, { owner: { id: 7 } }), row('private-admin', 30, { owner: { id: 7 }, private: true }), row('private-own', 20, { private: true }),
      row('write-only', 10, { owner: { id: 7 }, permissions: { push: true } }), row('read-only', 8, { owner: { id: 7 }, permissions: { pull: true } }),
      row('missing-fork', 1, { fork: undefined })];
    const upstream: string[] = [];
    globalThis.fetch = (async (input, init) => {
      const url = String(input); if (url.startsWith(base)) return realFetch(input, init);
      upstream.push(url);
      if (url.startsWith(`https://${DOMAIN}/api/v2/users/`)) return Response.json({ identities: [{ provider: 'github', access_token: 'picker-private-token' }] });
      if (url === `https://${DOMAIN}/oauth/token`) return Response.json({ access_token: 'test-management', expires_in: 86400 });
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer picker-private-token');
      if (url === 'https://api.github.com/user') return Response.json({ id: 42, login: 'renamed' });
      if (url.startsWith('https://api.github.com/user/repos')) return Response.json(rows);
      throw new Error('Unexpected upstream');
    }) as typeof fetch;
    const response = await fetch(base + '/api/me/repos', { headers: { cookie } });
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    const all = await response.json(); expect(all.map((r: { name: string }) => r.name)).toEqual(rows.map(r => r.name));
    expect(all.map((r: { pvpEligible: boolean }) => r.pvpEligible)).toEqual([false, true, true, true, false, true, false, false, false]);
    expect(all.map((r: { permission: string }) => r.permission)).toEqual(['admin', 'admin', 'maintain', 'admin', 'admin', 'admin', 'push', 'read', 'admin']);
    const filtered = await (await fetch(base + '/api/me/repos?pvp=1', { headers: { cookie } })).json();
    expect(filtered.map((r: { name: string }) => r.name)).toEqual(['public-own', 'public-maintainer', 'public-admin', 'private-own']);
    expect(JSON.stringify(all) + JSON.stringify(filtered)).not.toContain('picker-private-token');
    expect(upstream.every(url => url.startsWith(`https://${DOMAIN}/`) || url.startsWith('https://api.github.com/'))).toBe(true);
  });

  it('preserves stars/pushed ordering across GitHub pages and fails closed on missing user identity', async () => {
    let pages = 0;
    globalThis.fetch = (async input => {
      const url = String(input);
      if (url === 'https://api.github.com/user') return Response.json({ id: 42 });
      pages++;
      const make = (name: string, stars: number, pushed_at: string) => ({ name, full_name: 'alice/' + name, owner: { id: 42 }, fork: false, private: false, language: null, stargazers_count: stars, pushed_at });
      return Response.json(pages === 1 ? Array.from({ length: 100 }, (_, i) => make('low' + i, 1, '2020-01-01')) : [make('top-old', 99, '2020-01-01'), make('top-new', 99, '2026-01-01')]);
    }) as typeof fetch;
    const rows = await listGithubRepos('server-only-token'); expect(pages).toBe(2); expect(rows.slice(0, 2).map(r => r.name)).toEqual(['top-new', 'top-old']);
    globalThis.fetch = (async () => Response.json({ login: 'alice' })) as typeof fetch;
    await expect(listGithubRepos('server-only-token')).rejects.toThrow('incomplete');
  });
});
