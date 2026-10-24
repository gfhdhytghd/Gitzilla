import { normalizeSlug } from './index';
import { analyzeGitHubRepo } from './github';
import type { ClassroomSource } from '../server/classroom';

/** Always resolve and analyze the submitted SHA. No 24h cache, synthetic fallback or external enrichment. */
export async function analyzeClassroomSubmission(repo: string, ref = 'HEAD', token = '', fetcher: typeof fetch = fetch, needsChecks = true): Promise<ClassroomSource> {
  const slug = normalizeSlug(repo);
  if (typeof ref !== 'string' || !ref.trim() || ref.length > 200 || /[\x00-\x1f]/.test(ref)) throw new Error('Enter a branch, tag or commit');
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'Gitzilla-Classroom' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetcher(`https://api.github.com/repos/${slug}/commits/${encodeURIComponent(ref.trim())}`, { headers, signal: AbortSignal.timeout(10000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`GitHub could not resolve this submission (${response.status}). Check the repo/ref, connect GitHub or retry after a rate limit.`); }
  const commit = ((await response.json()) as { sha?: string }).sha;
  if (!commit || !/^[a-f0-9]{40,64}$/i.test(commit)) throw new Error('GitHub did not return an immutable commit');
  let files: ClassroomSource['files'] = [];
  const profile = await analyzeGitHubRepo(slug, { token, ref: commit, fetcher, skipEnrichment: true, onFiles: list => { files = list; } });
  const checks: ClassroomSource['checks'] = [];
  if (needsChecks) {
    // Checks are optional unless the teacher requests them; a 403 must not fabricate a pass.
    const runs = await fetcher(`https://api.github.com/repos/${slug}/commits/${commit}/check-runs?per_page=100&filter=latest`, { headers, signal: AbortSignal.timeout(10000) });
    if (runs.ok) {
      const body = await runs.json() as { check_runs?: { name: string; status: string; conclusion: string | null; head_sha: string }[] };
      for (const c of body.check_runs ?? []) if (c.head_sha === commit && typeof c.name === 'string') checks.push({ name: c.name.slice(0, 240), status: c.status, conclusion: c.conclusion });
    } else await runs.body?.cancel();
  }
  return { profile, commit, files, checks };
}
