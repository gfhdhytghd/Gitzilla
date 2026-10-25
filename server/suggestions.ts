import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RepoSuggestion, SuggestionsResponse } from '../shared/types.ts';
import { CURATED_REPOS } from '../analysis/suggestion-pool.ts';
import { selectPrimaryLanguage } from '../analysis/files.ts';

export const SUGGESTIONS_TTL = 60 * 60 * 1000;
const RETRY_MS = 60_000;
const MAX_SIZE_KIB = 200 * 1024;
const COOKIE = 'gitzilla_suggestions';
const aliases: Record<string, string> = { js: 'JavaScript', ts: 'TypeScript', py: 'Python', golang: 'Go', cpp: 'C++', csharp: 'C#', 'jupyter notebook': 'Python', bash: 'Shell' };
const languages = new Map(CURATED_REPOS.map(repo => [repo.language!.toLowerCase(), repo.language!]));
function languageFilter(raw?: string | null): string | undefined | null {
  const value = raw?.trim();
  if (!value) return undefined;
  if (!/^[\w+# .-]{1,40}$/.test(value)) return null;
  return aliases[value.toLowerCase()] ?? languages.get(value.toLowerCase()) ?? value;
}
function plainText(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[entity]!)
    .replace(/<[^>]*>/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[\u0000-\u001f\u007f\s]+/g, ' ').trim().slice(0, 140);
}
interface SearchRepo {
  full_name?: unknown; language?: unknown; description?: unknown; stargazers_count?: unknown;
  size?: unknown; fork?: unknown; archived?: unknown; disabled?: unknown; private?: unknown; topics?: unknown;
}
/** Search qualifiers are repeated here as response checks; private/non-code/oversized rows never escape. */
function searchRepo(value: SearchRepo, lang?: string): RepoSuggestion | undefined {
  if (typeof value.full_name !== 'string' || !/^[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]{1,100}$/i.test(value.full_name)) return;
  if (value.private !== false || value.fork !== false || value.archived !== false || value.disabled === true) return;
  if (typeof value.size !== 'number' || !Number.isFinite(value.size) || value.size <= 0 || value.size > MAX_SIZE_KIB) return;
  if (typeof value.stargazers_count !== 'number' || !Number.isFinite(value.stargazers_count) || value.stargazers_count < 200) return;
  if (typeof value.language !== 'string') return;
  const language = selectPrimaryLanguage({ [value.language]: 1 });
  if (language === 'Unknown' || (lang && language.toLowerCase() !== lang.toLowerCase())) return;
  const slug = value.full_name.toLowerCase();
  const description = typeof value.description === 'string' ? plainText(value.description) : '';
  const topics = Array.isArray(value.topics) ? value.topics.filter((topic): topic is string => typeof topic === 'string') : [];
  const text = [slug, description, ...topics].join(' ');
  if (/\b(?:nsfw|porn(?:ography|hub)?|hentai|xxx|erotica|adult[- ]content)\b/i.test(text)) return;
  const name = slug.split('/')[1];
  if (/(?:^|[-_])awesome(?:[-_]|$)|^(?:docs?|documentation|books?|roadmaps?|cheatsheets?)$/i.test(name)) return;
  if (topics.some(topic => /^(?:awesome(?:-list)?|curated-list|docs-only|learning-resources)$/i.test(topic))) return;
  if (/\b(?:curated|awesome|exhaustive)\s+list\b|\bcollection of (?:links|resources|cheat sheets)\b/i.test(description)) return;
  return { slug, language, stars: Math.floor(value.stargazers_count), ...(description ? { description } : {}), source: 'trending' };
}
interface CacheEntry { repos: RepoSuggestion[]; fetchedAt: number | null; refreshAfter: number; pending?: Promise<void> }
interface Recent { requests: string[][]; expires: number }
export interface SuggestionRequest { n?: number | string | null; lang?: string | null; session?: string }
export interface SuggestionsService { get(request?: SuggestionRequest): SuggestionsResponse }
interface Options {
  fetcher?: typeof fetch; now?: () => number; random?: () => number; getToken?: () => string | undefined;
  pool?: readonly RepoSuggestion[];
}
class SearchUnavailable extends Error {
  constructor(readonly limited: boolean, readonly retryAt: number) { super('GitHub suggestions unavailable'); }
}

/** Reads return immediately; cold/expired public search refreshes run in the background, single-flight. */
export function createSuggestions(options: Options = {}): SuggestionsService {
  const fetcher = options.fetcher ?? fetch, now = options.now ?? Date.now, random = options.random ?? Math.random;
  const getToken = options.getToken ?? (() => process.env.GITHUB_TOKEN);
  const pool = [...new Map((options.pool ?? CURATED_REPOS).map(repo => [repo.slug.toLowerCase(), { ...repo, slug: repo.slug.toLowerCase() }])).values()];
  const curatedSlugs = new Set(pool.map(repo => repo.slug));
  const cache = new Map<string, CacheEntry>(), recent = new Map<string, Recent>(), blocked = new Map<string, number>();
  const shuffled = <T>(items: readonly T[]): T[] => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  };
  async function refresh(entry: CacheEntry, token: string, credential: string, lang?: string) {
    try {
      const day = (days: number) => new Date(now() - days * 86400_000).toISOString().slice(0, 10);
      const common = 'is:public fork:false archived:false size:1..204800 stars:>=200';
      const language = lang ? ` language:"${lang}"` : '';
      // Recently created + recently active within six months are discoverability proxies, not measured star velocity.
      const queries = [`${common} created:>=${day(30)}${language}`];
      if (lang) queries.push(`${common} created:>=${day(180)} pushed:>=${day(7)}${language}`);
      const pages = await Promise.all(queries.map(async query => {
        const url = new URL('https://api.github.com/search/repositories');
        url.searchParams.set('q', query); url.searchParams.set('sort', 'stars'); url.searchParams.set('order', 'desc'); url.searchParams.set('per_page', '100');
        const response = await fetcher(url, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'Gitzilla-Suggestions' }, signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
          await response.body?.cancel();
          const limited = [401, 403, 429].includes(response.status);
          const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
          const after = Number(response.headers.get('retry-after')) * 1000 + now();
          throw new SearchUnavailable(limited, now() + Math.min(SUGGESTIONS_TTL, Math.max(RETRY_MS, Number.isFinite(reset) ? reset - now() : 0, Number.isFinite(after) ? after - now() : 0)));
        }
        const body = await response.json() as { items?: SearchRepo[] };
        if (!Array.isArray(body.items)) throw new SearchUnavailable(false, now() + RETRY_MS);
        return body.items;
      }));
      const repos = new Map<string, RepoSuggestion>();
      for (const item of pages.flat()) {
        if (!item || typeof item !== 'object') continue;
        const repo = searchRepo(item, lang);
        if (repo && !curatedSlugs.has(repo.slug)) repos.set(repo.slug, repo);
      }
      entry.repos = [...repos.values()]; entry.fetchedAt = now(); entry.refreshAfter = now() + SUGGESTIONS_TTL;
    } catch (error) {
      entry.refreshAfter = error instanceof SearchUnavailable ? error.retryAt : now() + RETRY_MS;
      if (error instanceof SearchUnavailable && error.limited) blocked.set(credential, entry.refreshAfter);
      // Ordinary transport/5xx failures keep stale public results. Rate-limit/auth failures hide them globally.
    }
  }
  return { get(request = {}) {
    const nValue = request.n === '' ? NaN : Number(request.n ?? 8);
    const n = Number.isFinite(nValue) ? Math.max(4, Math.min(16, Math.floor(nValue))) : 8;
    const lang = languageFilter(request.lang);
    if (lang === null) return { repos: [], trendingAt: null };
    const token = getToken()?.trim();
    let trending: RepoSuggestion[] = [], trendingAt: number | null = null;
    if (token) {
      const credential = createHash('sha256').update(token).digest('hex');
      if ((blocked.get(credential) ?? 0) <= now()) {
        const key = credential + ':' + (lang?.toLowerCase() ?? '');
        let entry = cache.get(key);
        if (!entry) { entry = { repos: [], fetchedAt: null, refreshAfter: 0 }; cache.set(key, entry); }
        if (!entry.pending && now() >= entry.refreshAfter) {
          const target = entry;
          target.pending = refresh(target, token, credential, lang).finally(() => { target.pending = undefined; });
        }
        trending = entry.repos; trendingAt = entry.fetchedAt;
      }
    }
    const curated = pool.filter(repo => !lang || repo.language?.toLowerCase() === lang.toLowerCase());
    const history = request.session ? recent.get(request.session) : undefined;
    const previous = history && history.expires > now() ? history.requests : [];
    const forbidden = new Set(previous.flat());
    const picked: RepoSuggestion[] = [], used = new Set<string>();
    const take = (from: RepoSuggestion[], count: number) => {
      for (const repo of shuffled(from)) { if (count <= 0 || picked.length >= n) break; if (!used.has(repo.slug)) { picked.push(repo); used.add(repo.slug); count--; } }
    };
    const fresh = (repos: RepoSuggestion[]) => repos.filter(repo => !forbidden.has(repo.slug));
    const targetTrending = Math.round(n / 3);
    take(fresh(curated), n - targetTrending); take(fresh(trending), targetTrending);
    take(fresh([...curated, ...trending]), n - picked.length);
    // With a small filtered pool, reuse the oldest request before the immediately previous one.
    const last = new Set(previous.at(-1) ?? []);
    take([...curated, ...trending].filter(repo => !last.has(repo.slug)), n - picked.length);
    take([...curated, ...trending], n - picked.length);
    if (request.session) {
      recent.delete(request.session);
      recent.set(request.session, { requests: [...previous, picked.map(repo => repo.slug)].slice(-2), expires: now() + SUGGESTIONS_TTL });
      if (recent.size > 1000) recent.delete(recent.keys().next().value!);
    }
    return { repos: shuffled(picked).map(repo => ({ ...repo })), trendingAt };
  } };
}

const suggestions = createSuggestions();
export function handleSuggestionsRoute(req: IncomingMessage, res: ServerResponse, url: URL, service: SuggestionsService = suggestions): boolean {
  if (url.pathname !== '/api/suggestions') return false;
  if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: 'Method not allowed' })); return true; }
  const session = req.headers.cookie?.match(/(?:^|;\s*)gitzilla_suggestions=([a-f0-9]{32})(?:;|$)/)?.[1] ?? randomBytes(16).toString('hex');
  const secure = ('encrypted' in req.socket && req.socket.encrypted) || req.headers['x-forwarded-proto'] === 'https';
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Set-Cookie': `${COOKIE}=${session}; Path=/api/suggestions; Max-Age=3600; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}` });
  res.end(JSON.stringify(service.get({ n: url.searchParams.get('n'), lang: url.searchParams.get('lang'), session })));
  return true;
}
