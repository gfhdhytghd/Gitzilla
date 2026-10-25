import type { IncomingMessage } from 'node:http';

export interface GithubSession { login: string; userId?: string }
export interface GithubIdentity { id: string; login: string }

export function githubIdFromSession(session: GithubSession): string | null {
  const id = session.userId?.match(/^github\|([1-9]\d*)$/)?.[1];
  return id && Number.isSafeInteger(Number(id)) ? id : null;
}

/** The session is decoded by the auth service, never supplied by a hello packet. */
export async function resolveGithubIdentity(request: IncomingMessage, session: GithubSession,
  getToken: (request: IncomingMessage) => Promise<string | null>, fetcher: typeof fetch = fetch): Promise<GithubIdentity | null> {
  const direct = githubIdFromSession(session);
  if (direct) return { id: direct, login: session.login };
  const token = await getToken(request);
  if (!token) return null;
  const response = await fetcher('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Gitzilla-controller' },
    redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!response.ok) { await response.body?.cancel(); return null; }
  const user = await response.json() as { id?: number; login?: string };
  return Number.isSafeInteger(user.id) && user.id! > 0 && typeof user.login === 'string' ? { id: String(user.id), login: user.login } : null;
}
