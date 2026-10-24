import type { RepoProfile } from '../shared/types.ts';
import { profileFromFiles, type RepoMetadata } from './graph.ts';
import { extractTarGz, ARCHIVE_LIMITS } from './tar.ts';

export interface GitHubOptions {
  token?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  metadataFallback?: RepoMetadata;
}

/** A one-item page's last-page index is the approximate total count. */
export function countFromPage(link: string | null, items: unknown[]): number {
  const last = link?.split(',').find(part => /rel="last"/.test(part))?.match(/<([^>]+)>/)?.[1];
  return last ? Number(new URL(last).searchParams.get('page')) || items.length : items.length;
}

export async function analyzeGitHubRepo(slug: string, options: GitHubOptions = {}): Promise<RepoProfile> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('GitHub analysis timed out')), options.timeoutMs ?? 12_000);
  const fetcher = options.fetcher ?? fetch;
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'Repo-Kaiju-HackPSU' };
  const token = (options.token ?? process.env.GITHUB_TOKEN)?.trim() || undefined;
  if (token) headers.Authorization = `Bearer ${token}`;
  async function api(endpoint: string): Promise<{ data: unknown; link: string | null }> {
    const response = await fetcher(`https://api.github.com/repos/${slug}${endpoint}`, {
      headers,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4_000)]),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`GitHub API ${response.status}`); }
    return { data: await response.json(), link: response.headers.get('link') };
  }
  async function count(endpoint: string): Promise<number | undefined> {
    try {
      const result = await api(endpoint);
      return Array.isArray(result.data) ? countFromPage(result.link, result.data) : 0;
    } catch { return undefined; }
  }
  try {
    // Metadata can fail while an archive succeeds: keep the real source graph.
    const metaPromise = api('').catch(() => null);
    const languagesPromise = api('/languages').catch(() => null);
    const commitsPromise = count('/commits?per_page=1');
    const contributorsPromise = count('/contributors?per_page=1&anon=true');
    const archivePromise = (async () => {
      // GitHub's API issues an authorized archive redirect for private repositories.
      const archiveUrl = token
        ? `https://api.github.com/repos/${slug}/tarball`
        : `https://codeload.github.com/${slug}/tar.gz/HEAD`;
      const response = await fetcher(archiveUrl, {
        signal: controller.signal,
        headers: token ? headers : { 'User-Agent': 'Repo-Kaiju-HackPSU' },
      });
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error(`GitHub archive ${response.status}`); }
      const body = response.body;
      async function* chunks(): AsyncGenerator<Uint8Array> {
        const reader = body.getReader();
        let compressedBytes = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) return;
            compressedBytes += value.byteLength;
            if (compressedBytes > ARCHIVE_LIMITS.maxBytes) throw new Error('Compressed archive limit exceeded');
            yield value;
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      }
      return extractTarGz(chunks());
    })();
    const [files, meta, languageResult, commits, contributors] = await Promise.all([
      archivePromise, metaPromise, languagesPromise, commitsPromise, contributorsPromise,
    ]);
    const raw = meta?.data as { description?: string; stargazers_count?: number; language?: string; created_at?: string } | undefined;
    const previous = options.metadataFallback;
    const metadata: RepoMetadata = {
      description: raw?.description ?? previous?.description ?? '', stars: raw?.stargazers_count ?? previous?.stars ?? 0,
      primaryLanguage: raw?.language ?? previous?.primaryLanguage,
      languages: (languageResult?.data as Record<string, number> | undefined) ?? previous?.languages,
      commits: commits ?? previous?.commits ?? 0, contributors: contributors ?? previous?.contributors ?? 0,
      ageDays: raw?.created_at ? Math.max(0, Math.floor((Date.now() - Date.parse(raw.created_at)) / 86_400_000)) : previous?.ageDays ?? 0,
    };
    const profile = profileFromFiles(slug, files, metadata);
    if (!profile.totalFiles) throw new Error('No supported source files in archive sample');
    return profile;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
