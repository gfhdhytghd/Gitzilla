import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getGithubToken, getSession, handleAuthRoute, parseEnv, safeReturnTo, seal, unseal } from './index.ts';

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
          { name: 'old', full_name: 'octocat/old', private: false, language: 'Go', stargazers_count: 3, pushed_at: '2020-01-01T00:00:00Z' },
          { name: 'new', full_name: 'acme/new', private: true, language: null, stargazers_count: 0, pushed_at: '2026-01-01T00:00:00Z' },
        ]);
      }
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
    expect(repos.map((r: { full_name: string }) => r.full_name)).toEqual(['acme/new', 'octocat/old']);
    expect(repos[0]).toEqual({ name: 'new', full_name: 'acme/new', private: true, language: null, stars: 0, pushed_at: '2026-01-01T00:00:00Z' });
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
});
