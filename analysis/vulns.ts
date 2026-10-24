import type { KnownVuln, RepoProfile } from '../shared/types.ts';
import type { SourceFile } from './files.ts';
import { declaredDependencies, type DeclaredDependency } from './dependencies.ts';

interface Advisory {
  id?: string; summary?: string; details?: string; withdrawn?: string;
  affected?: { package?: { name?: string; ecosystem?: string }; ranges?: { events?: { fixed?: string }[] }[] }[];
}
const normalizedName = (name: string, ecosystem: string) => ecosystem === 'PyPI' ? name.toLowerCase().replace(/[-_.]+/g, '-') : name;
function compareVersions(a: string, b: string): number {
  const parse = (value: string) => {
    const match = value.replace(/^v/, '').match(/^(\d+(?:\.\d+)*)([^+]*)/);
    return { release: match?.[1].split('.').map(Number) ?? [], suffix: match?.[2] ?? '' };
  };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < Math.max(x.release.length, y.release.length); i++) {
    const difference = (x.release[i] ?? 0) - (y.release[i] ?? 0);
    if (difference) return difference;
  }
  if (x.suffix === y.suffix) return 0;
  const rank = (suffix: string) => !suffix ? 0 : /post/i.test(suffix) ? 1 : -1;
  return rank(x.suffix) - rank(y.suffix) || x.suffix.localeCompare(y.suffix);
}
export function fixedVersion(advisory: Advisory, dependency: DeclaredDependency): string | undefined {
  const candidates = (advisory.affected ?? []).filter(affected => affected.package?.ecosystem === dependency.ecosystem && normalizedName(affected.package.name ?? '', dependency.ecosystem) === normalizedName(dependency.name, dependency.ecosystem))
    .flatMap(affected => affected.ranges ?? []).flatMap(range => range.events ?? []).flatMap(event => event.fixed ? [event.fixed] : [])
    .filter(version => /^v?\d+(?:\.\d+)+/.test(version) && compareVersions(version, dependency.version) > 0).sort(compareVersions);
  return candidates[0];
}

/** Public advisory lookups only; caller must exclude private/unknown-authenticated source. */
export async function queryDeclaredVulns(files: SourceFile[], profile: RepoProfile, options: { fetcher?: typeof fetch; signal?: AbortSignal } = {}): Promise<KnownVuln[] | undefined> {
  const dependencies = declaredDependencies(files, profile);
  if (!dependencies.length) return undefined;
  const fetcher = options.fetcher ?? fetch;
  const request = async (url: string, init: RequestInit = {}) => {
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(4000)]) : AbortSignal.timeout(4000);
    const response = await fetcher(url, { ...init, signal });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`OSV ${response.status}`); }
    return response.json();
  };
  try {
    const batch = await request('https://api.osv.dev/v1/querybatch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: dependencies.map(dependency => ({ package: { name: dependency.name, ecosystem: dependency.ecosystem }, version: dependency.version })) }),
    }) as { results?: { vulns?: { id?: string }[] }[] };
    if (!Array.isArray(batch.results) || batch.results.length !== dependencies.length) return undefined;
    const matches = new Map<string, { id: string; dependency: DeclaredDependency }>();
    batch.results.forEach((result, i) => {
      for (const vulnerability of result.vulns ?? []) if (vulnerability.id) {
        const dependency = dependencies[i];
        matches.set([vulnerability.id, dependency.name, dependency.component ?? ''].join('\0'), { id: vulnerability.id, dependency });
      }
    });
    const limited = [...matches.values()].slice(0, 12);
    const details = new Map<string, Advisory>();
    const ids = [...new Set(limited.map(match => match.id))];
    for (let start = 0; start < ids.length; start += 4) {
      const results = await Promise.allSettled(ids.slice(start, start + 4).map(id => request(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`)));
      results.forEach((result, i) => { if (result.status === 'fulfilled') details.set(ids[start + i], result.value as Advisory); });
    }
    return limited.flatMap(({ id, dependency }) => {
      const advisory = details.get(id);
      if (advisory?.withdrawn) return [];
      const fixed = advisory ? fixedVersion(advisory, dependency) : undefined;
      return [{ id, pkg: dependency.name, ecosystem: dependency.ecosystem, summary: (advisory?.summary ?? advisory?.details?.split('\n')[0] ?? id).trim().slice(0, 180), ...(fixed ? { fixed } : {}), ...(dependency.component ? { component: dependency.component } : {}) }];
    });
  } catch { return undefined; }
}
