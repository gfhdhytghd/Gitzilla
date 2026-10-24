/** PvP authority comes exclusively from the connected player's GitHub token.
 * https://docs.github.com/en/rest/users/users#get-the-authenticated-user
 * https://docs.github.com/en/rest/repos/repos#get-a-repository
 */
export interface PvpAccess { userId: number; login: string; repo: string; private: boolean }
export async function verifyPvpAccess(repo: string, token: string, fetcher: typeof fetch = fetch): Promise<PvpAccess> {
  if (!token) throw new Error('Connect GitHub before choosing a PvP repository.');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Use a GitHub owner/repository name.');
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Gitzilla-PvP' };
  async function get(path: string) {
    const response = await fetcher(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); throw new Error('GitHub could not verify repository eligibility. Reconnect GitHub and retry.'); }
    return response.json();
  }
  const user = await get('/user');
  const metadata = await get(`/repos/${repo}`);
  if (!Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.login !== 'string' || !Number.isSafeInteger(metadata.owner?.id) || metadata.owner.id <= 0
      || typeof metadata.private !== 'boolean' || typeof metadata.fork !== 'boolean' || typeof metadata.full_name !== 'string'
      || metadata.full_name.toLowerCase() !== repo.toLowerCase()) throw new Error('GitHub returned incomplete repository eligibility.');
  const own = metadata.owner.id === user.id;
  if (own && metadata.fork) throw new Error('Your own fork is not eligible for PvP. Choose an original repository.');
  if (!(own && !metadata.fork) && !(metadata.private === false && (metadata.permissions?.maintain === true || metadata.permissions?.admin === true))) {
    throw new Error('PvP requires your own non-fork repository or a public repository you maintain or administer.');
  }
  return { userId: user.id, login: user.login, repo: metadata.full_name, private: metadata.private };
}
