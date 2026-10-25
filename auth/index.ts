// "Connect GitHub" via Auth0: OIDC authorization-code + PKCE against Auth0 (GitHub social connection),
// a sealed (AES-256-GCM) httpOnly session cookie, and the user's GitHub token fetched server-side from
// the Auth0 Management API (identities[].access_token). Zero dependencies; tokens never reach the client.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TLSSocket } from 'node:tls';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pvpRepoEligible, type PvpRepoMetadata } from '../server/pvp-access';

export interface Session { userId: string; login: string; avatar: string }
export interface MyRepo {
  name: string; full_name: string; private: boolean; language: string | null; stars: number; pushed_at: string;
  fork: boolean; permission: 'admin' | 'maintain' | 'push' | 'read'; pvpEligible: boolean;
}

const SESSION_COOKIE = 'rk_session';
const TX_COOKIE = 'rk_auth_tx';
const SESSION_TTL = 7 * 24 * 3600;
const TX_TTL = 10 * 60;

// ---------- config (.env in repo root, then parent; process.env wins) ----------

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let fileEnv: Record<string, string> | undefined;
export function parseEnv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?(AUTH0_[A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || m[1] in out) continue;
    const raw = m[2];
    const value = raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, raw.lastIndexOf(raw[0]) > 0 ? raw.lastIndexOf(raw[0]) : undefined) : raw.replace(/\s+#.*$/, '');
    if (value) out[m[1]] = value;
  }
  return out;
}
function env(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  if (!fileEnv) {
    fileEnv = {};
    for (const file of [resolve(root, '.env'), resolve(root, '../.env')]) {
      try { fileEnv = { ...parseEnv(readFileSync(file, 'utf8')), ...fileEnv }; } catch { /* optional */ }
    }
  }
  return fileEnv[key];
}
function config() {
  const domain = env('AUTH0_DOMAIN')?.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const clientId = env('AUTH0_CLIENT_ID');
  const clientSecret = env('AUTH0_CLIENT_SECRET');
  if (!domain || !clientId || !clientSecret) return null;
  const secret = env('AUTH0_COOKIE_SECRET') || clientSecret;
  return {
    domain, clientId, clientSecret,
    // Management API reader: a separate M2M app ("Gitzilla Server") granted read:users + read:user_idp_tokens.
    mgmtClientId: env('AUTH0_MGMT_CLIENT_ID') || clientId,
    mgmtClientSecret: env('AUTH0_MGMT_CLIENT_SECRET') || clientSecret,
    connection: env('AUTH0_CONNECTION') || 'github',
    key: createHash('sha256').update(`gitzilla:${secret}`).digest(),
  };
}
/** True when AUTH0_DOMAIN / AUTH0_CLIENT_ID / AUTH0_CLIENT_SECRET are configured. */
export function authEnabled() { return !!config(); }

// ---------- sealed cookies ----------

export function seal(data: unknown, key: Buffer, ttlSeconds: number): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ d: data, e: Math.floor(Date.now() / 1000) + ttlSeconds })), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}
export function unseal<T>(value: string | undefined, key: Buffer): T | null {
  if (!value) return null;
  try {
    const buf = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const { d, e } = JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8'));
    return e > Date.now() / 1000 ? d as T : null;
  } catch { return null; }
}
function cookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function cookie(req: IncomingMessage, name: string, value: string, maxAge: number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
}

// ---------- request helpers ----------

function isHttps(req: IncomingMessage) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return proto ? proto === 'https' : !!(req.socket as TLSSocket).encrypted;
}
/** Origin the browser used (tunnel-aware). Must be listed in the Auth0 app's callback / logout URLs. */
export function originOf(req: IncomingMessage) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5173').split(',')[0].trim();
  return `${isHttps(req) ? 'https' : 'http'}://${host}`;
}
/** Only same-site relative paths ("/r/ABCD"); anything else becomes "/". */
export function safeReturnTo(value: string | null | undefined) {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/';
}
function redirect(res: ServerResponse, location: string, setCookies: string[] = []) {
  res.writeHead(302, { Location: location, 'Set-Cookie': setCookies, 'Cache-Control': 'no-store' }); res.end();
}
function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data));
}
const b64url = (buf: Buffer) => buf.toString('base64url');

// ---------- session + GitHub token ----------

export async function getSession(req: IncomingMessage): Promise<Session | null> {
  const cfg = config();
  return cfg ? unseal<Session>(cookies(req)[SESSION_COOKIE], cfg.key) : null;
}

// Free plan allows 1,000 M2M tokens/month: one token is reused until it expires (24h), and each user's GitHub
// token is fetched once per sign-in and kept in memory (GitHub OAuth-app tokens don't expire; evicted on error/logout).
let mgmt: { token: string; exp: number } | null = null;
let mgmtPending: Promise<string> | null = null;
const githubTokens = new Map<string, string>();
async function managementToken(cfg: NonNullable<ReturnType<typeof config>>): Promise<string> {
  if (mgmt && mgmt.exp > Date.now()) return mgmt.token;
  return mgmtPending ??= (async () => {
    const r = await fetch(`https://${cfg.domain}/oauth/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: cfg.mgmtClientId, client_secret: cfg.mgmtClientSecret, audience: `https://${cfg.domain}/api/v2/` }),
    });
    if (!r.ok) throw new Error(`Auth0 management token failed: ${r.status} ${await r.text()}`);
    const body = await r.json() as { access_token: string; expires_in: number };
    mgmt = { token: body.access_token, exp: Date.now() + (body.expires_in - 300) * 1000 };
    return mgmt.token;
  })().finally(() => { mgmtPending = null; });
}
/** The signed-in user's GitHub OAuth token (server-side only; never send it to a client or to Gemini). */
export async function githubTokenForUser(userId: string): Promise<string | null> {
  const cfg = config();
  if (!cfg) return null;
  const cached = githubTokens.get(userId);
  if (cached) return cached;
  const r = await fetch(`https://${cfg.domain}/api/v2/users/${encodeURIComponent(userId)}?fields=identities&include_fields=true`, {
    headers: { Authorization: `Bearer ${await managementToken(cfg)}` },
  });
  if (r.status === 401) mgmt = null;
  if (!r.ok) { console.error(`auth: user lookup failed ${r.status}`); return null; }
  const { identities = [] } = await r.json() as { identities?: { provider: string; access_token?: string }[] };
  const token = identities.find(i => i.provider === 'github')?.access_token ?? null;
  if (token) githubTokens.set(userId, token);
  return token;
}
export async function getGithubToken(req: IncomingMessage): Promise<string | null> {
  const session = await getSession(req);
  return session ? githubTokenForUser(session.userId) : null;
}

/** Repos the user can see, sorted by stars; eligibility uses the same authenticated GitHub ID as PvP. */
export async function listGithubRepos(token: string): Promise<MyRepo[]> {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'gitzilla', 'X-GitHub-Api-Version': '2022-11-28' };
  const identity = await fetch('https://api.github.com/user', { headers, redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!identity.ok) throw new Error('GitHub could not verify your identity. Reconnect GitHub and retry.');
  const user = await identity.json() as { id?: number };
  if (!Number.isSafeInteger(user.id) || user.id! <= 0) throw new Error('GitHub returned incomplete repository eligibility.');
  const repos: MyRepo[] = [];
  for (let page = 1; page <= 3; page++) {
    const r = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`, {
      headers, redirect: 'error', signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`GitHub /user/repos ${r.status}`);
    const batch = await r.json() as (PvpRepoMetadata & { name: string; full_name: string; private: boolean; language: string | null; stargazers_count: number; pushed_at: string | null })[];
    for (const x of batch) repos.push({ name: x.name, full_name: x.full_name, private: x.private, language: x.language, stars: x.stargazers_count, pushed_at: x.pushed_at ?? '',
      fork: x.fork === true, permission: x.permissions?.admin === true ? 'admin' : x.permissions?.maintain === true ? 'maintain' : x.permissions?.push === true ? 'push' : 'read',
      pvpEligible: pvpRepoEligible(x, user.id!) });
    if (batch.length < 100) break;
  }
  // Most-starred first (ties: most recently pushed).
  return repos.sort((a, b) => b.stars - a.stars || b.pushed_at.localeCompare(a.pushed_at));
}

// ---------- routes ----------

interface Tx { state: string; verifier: string; nonce: string; returnTo: string; redirectUri: string }

/**
 * Handles /auth/login, /auth/callback, /auth/logout, /auth/logged-out, GET /api/me, GET /api/me/repos.
 * Returns false for any other path so the caller can continue routing.
 */
export async function handleAuthRoute(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '/', 'http://localhost');
  const path = url.pathname;
  if (path === '/api/me' && req.method === 'GET') {
    json(res, 200, { enabled: authEnabled(), user: await getSession(req) });
    return true;
  }
  if (path === '/api/me/repos' && req.method === 'GET') {
    const session = await getSession(req);
    if (!session) { json(res, 401, { error: 'Not signed in' }); return true; }
    const token = await githubTokenForUser(session.userId);
    if (!token) { json(res, 401, { error: 'No GitHub token; sign in again' }); return true; }
    try { const repos = await listGithubRepos(token); json(res, 200, url.searchParams.get('pvp') === '1' ? repos.filter(repo => repo.pvpEligible) : repos); }
    catch (error) { githubTokens.delete(session.userId); json(res, 502, { error: error instanceof Error ? error.message : 'GitHub error' }); }
    return true;
  }
  if (!path.startsWith('/auth/')) return false;
  req.resume();
  const cfg = config();
  if (!cfg) { json(res, 503, { error: 'Auth0 not configured (AUTH0_DOMAIN / AUTH0_CLIENT_ID / AUTH0_CLIENT_SECRET)' }); return true; }
  const origin = originOf(req);

  if (path === '/auth/login') {
    // Only localhost and PUBLIC_URL are registered callbacks: send LAN-IP visitors through the public origin.
    const publicOrigin = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).origin : '';
    const host = new URL(origin).hostname;
    if (publicOrigin && origin !== publicOrigin && host !== 'localhost' && host !== '127.0.0.1') {
      redirect(res, `${publicOrigin}${url.pathname}${url.search}`);
      return true;
    }
    const tx: Tx = {
      state: b64url(randomBytes(16)), verifier: b64url(randomBytes(32)), nonce: b64url(randomBytes(16)),
      returnTo: safeReturnTo(url.searchParams.get('returnTo')), redirectUri: `${origin}/auth/callback`,
    };
    const authorize = new URL(`https://${cfg.domain}/authorize`);
    authorize.search = new URLSearchParams({
      response_type: 'code', client_id: cfg.clientId, redirect_uri: tx.redirectUri, scope: 'openid profile',
      connection: cfg.connection, state: tx.state, nonce: tx.nonce,
      code_challenge: b64url(createHash('sha256').update(tx.verifier).digest()), code_challenge_method: 'S256',
      ...(url.searchParams.has('switch') ? { prompt: 'login' } : {}),
    }).toString();
    redirect(res, authorize.href, [cookie(req, TX_COOKIE, seal(tx, cfg.key, TX_TTL), TX_TTL)]);
    return true;
  }

  if (path === '/auth/callback') {
    const tx = unseal<Tx>(cookies(req)[TX_COOKIE], cfg.key);
    const clearTx = cookie(req, TX_COOKIE, '', 0);
    const fail = (why: string) => redirect(res, `${tx?.returnTo ?? '/'}${(tx?.returnTo ?? '/').includes('?') ? '&' : '?'}auth_error=${encodeURIComponent(why)}`, [clearTx]);
    if (url.searchParams.get('error')) { fail(url.searchParams.get('error_description') || url.searchParams.get('error')!); return true; }
    if (!tx || tx.state !== url.searchParams.get('state')) { fail('Login expired, try again'); return true; }
    const r = await fetch(`https://${cfg.domain}/oauth/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code', client_id: cfg.clientId, client_secret: cfg.clientSecret,
        code: url.searchParams.get('code'), code_verifier: tx.verifier, redirect_uri: tx.redirectUri,
      }),
    });
    if (!r.ok) { console.error(`auth: code exchange failed ${r.status} ${await r.text()}`); fail('Sign-in failed'); return true; }
    // ID token comes straight from the token endpoint over TLS with our client secret, so its signature
    // needn't be re-verified (OIDC Core 3.1.3.7); still check issuer/audience/nonce.
    const { id_token } = await r.json() as { id_token: string };
    const claims = JSON.parse(Buffer.from(id_token.split('.')[1], 'base64url').toString('utf8')) as Record<string, string>;
    if (claims.iss !== `https://${cfg.domain}/` || claims.aud !== cfg.clientId || claims.nonce !== tx.nonce) { fail('Invalid ID token'); return true; }
    const session: Session = { userId: claims.sub, login: claims.nickname || claims.name || claims.sub, avatar: claims.picture || '' };
    githubTokens.delete(session.userId);
    redirect(res, tx.returnTo, [clearTx, cookie(req, SESSION_COOKIE, seal(session, cfg.key, SESSION_TTL), SESSION_TTL)]);
    return true;
  }

  if (path === '/auth/logout') {
    // Auth0 only accepts exact registered returnTo URLs, so bounce through /auth/logged-out with the target in a cookie.
    const session = await getSession(req);
    if (session) githubTokens.delete(session.userId);
    const target = safeReturnTo(url.searchParams.get('returnTo'));
    const logout = new URL(`https://${cfg.domain}/v2/logout`);
    logout.search = new URLSearchParams({ client_id: cfg.clientId, returnTo: `${origin}/auth/logged-out` }).toString();
    redirect(res, logout.href, [cookie(req, SESSION_COOKIE, '', 0), cookie(req, TX_COOKIE, seal({ returnTo: target }, cfg.key, TX_TTL), TX_TTL)]);
    return true;
  }

  if (path === '/auth/logged-out') {
    const target = unseal<{ returnTo: string }>(cookies(req)[TX_COOKIE], cfg.key)?.returnTo;
    redirect(res, safeReturnTo(target), [cookie(req, TX_COOKIE, '', 0)]);
    return true;
  }

  json(res, 404, { error: 'Auth route not found' });
  return true;
}
