import type { AdoptIssue, RepoComponent, RepoProfile } from '../shared/types.ts';

export interface GitHubApiResult { data: unknown; link: string | null }
export type GitHubApi = (endpoint: string) => Promise<GitHubApiResult>;
interface Author { login?: string; type?: string }
interface CommitRow { author?: Author | null; commit?: { author?: { name?: string; email?: string } } }
interface Contributor extends Author { name?: string; contributions?: number }
interface IssueRow {
  number?: number; title?: string; html_url?: string; body?: string | null; state?: string;
  labels?: (string | { name?: string })[]; pull_request?: unknown;
}
const isBot = (author: Author | undefined | null, name?: string) => author?.type === 'Bot' || /\[bot\]$/i.test(author?.login ?? name ?? '');

export function componentMaintainers(rows: CommitRow[]): Pick<RepoComponent, 'maintainers' | 'topMaintainers'> | undefined {
  const authors = new Map<string, { login?: string; commits: number }>();
  for (const row of rows) {
    if (isBot(row.author, row.commit?.author?.name)) continue;
    const login = row.author?.login;
    const identity = login ? `login:${login.toLowerCase()}` : row.commit?.author?.email ? `email:${row.commit.author.email.toLowerCase()}` : row.commit?.author?.name ? `name:${row.commit.author.name}` : undefined;
    if (!identity) continue;
    const previous = authors.get(identity) ?? { login, commits: 0 };
    previous.commits++; authors.set(identity, previous);
  }
  if (rows.length && !authors.size) return undefined;
  return {
    maintainers: authors.size,
    topMaintainers: [...authors.values()].filter(author => author.login).sort((a, b) => b.commits - a.commits || a.login!.localeCompare(b.login!)).slice(0, 3).map(author => author.login!),
  };
}

/** Exact for the complete contributor list returned by GitHub, excluding automation. */
export function busFactorFromContributors(rows: Contributor[]): number | undefined {
  const contributions = rows.filter(row => !isBot(row, row.name)).map(row => row.contributions ?? 0).filter(value => value > 0).sort((a, b) => b - a);
  const total = contributions.reduce((sum, value) => sum + value, 0);
  if (!total) return undefined;
  let covered = 0;
  for (let i = 0; i < contributions.length; i++) { covered += contributions[i]; if (covered > total / 2) return i + 1; }
}

function page(link: string | null, relation: string): number | undefined {
  const url = link?.split(',').find(part => part.includes(`rel="${relation}"`))?.match(/<([^>]+)>/)?.[1];
  return url ? Number(new URL(url).searchParams.get('page')) || 1 : undefined;
}

async function completeContributors(api: GitHubApi, maxPages: number): Promise<Contributor[] | undefined> {
  try {
    const first = await api('/contributors?per_page=100&anon=true');
    if (!Array.isArray(first.data)) return undefined;
    const last = page(first.link, 'last');
    if (page(first.link, 'next') && !last) return undefined;
    if ((last ?? 1) > maxPages) return undefined; // Never call a partial top-100 list a repo-wide bus factor.
    const all = [...first.data] as Contributor[];
    for (let start = 2; start <= (last ?? 1); start += 5) {
      const batch = await Promise.all(Array.from({ length: Math.min(5, last! - start + 1) }, (_, i) => api(`/contributors?per_page=100&anon=true&page=${start + i}`)));
      for (const result of batch) { if (!Array.isArray(result.data)) return undefined; all.push(...result.data as Contributor[]); }
    }
    return all;
  } catch { return undefined; }
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function mapAdoptableIssues(profile: RepoProfile, rows: IssueRow[]): void {
  const unique = new Map<number, { issue: AdoptIssue; search: string }>();
  for (const row of rows) {
    if (row.pull_request || row.state === 'closed' || !row.number || !row.title || !row.html_url) continue;
    const labels = (row.labels ?? []).flatMap(label => typeof label === 'string' ? [label] : label.name ? [label.name] : []);
    if (!labels.some(label => ['good first issue', 'help wanted'].includes(label.toLowerCase()))) continue;
    unique.set(row.number, {
      issue: { number: row.number, title: row.title.trim().slice(0, 180), url: row.html_url, labels: labels.slice(0, 8) },
      search: [row.title, row.body ?? '', ...labels].join('\n').toLowerCase(),
    });
  }
  profile.repoIssues = [];
  profile.components.forEach(component => { component.issues = []; });
  for (const { issue, search } of unique.values()) {
    const scored = profile.components.map(component => {
      if (['root', 'misc'].includes(component.name)) return { component, score: 0 };
      const full = component.name.toLowerCase();
      const leaf = full.split('/').at(-1)!;
      const contains = (value: string) => new RegExp(`(^|[^a-z0-9_-])${escapeRegex(value)}(?=$|[^a-z0-9_-])`, 'i').test(search);
      const score = contains(full) ? 100 : leaf.length >= 3 && !['src', 'lib', 'test', 'tests', 'core'].includes(leaf) && contains(leaf) ? 10 : 0;
      return { component, score };
    });
    const best = Math.max(0, ...scored.map(row => row.score));
    const targets = best ? scored.filter(row => row.score === best).map(row => row.component) : [];
    if (targets.length) {
      for (const component of targets) if (component.issues!.length < 3) component.issues!.push(issue);
    } else if (profile.repoIssues.length < 10) profile.repoIssues.push(issue);
  }
}

/** Read-only GitHub enrichment. Missing/rate-limited endpoints leave fields absent. */
export async function enrichSocial(profile: RepoProfile, api: GitHubApi, options: { fullContributorHistory?: boolean } = {}): Promise<void> {
  const components = profile.components.filter(component => component.name !== 'misc').slice(0, 8);
  const tasks = components.map(async component => {
    try {
      const path = component.name === 'root' ? '' : `path=${encodeURIComponent(component.name)}&`;
      const result = await api(`/commits?${path}per_page=100`);
      if (Array.isArray(result.data)) {
        const measured = componentMaintainers(result.data as CommitRow[]);
        if (measured) Object.assign(component, measured);
      }
    } catch { /* No guessed maintenance counts. */ }
  });
  tasks.push((async () => {
    const contributors = await completeContributors(api, options.fullContributorHistory ? 50 : 1);
    if (contributors) {
      const factor = busFactorFromContributors(contributors);
      if (factor !== undefined) profile.busFactor = factor;
    }
  })());
  tasks.push((async () => {
    const results = await Promise.allSettled(['good first issue', 'help wanted'].map(label => api(`/issues?labels=${encodeURIComponent(label)}&state=open&per_page=30`)));
    const successful = results.flatMap(result => result.status === 'fulfilled' && Array.isArray(result.value.data) ? [result.value.data as IssueRow[]] : []);
    if (successful.length) mapAdoptableIssues(profile, successful.flat());
  })());
  await Promise.all(tasks);
}
