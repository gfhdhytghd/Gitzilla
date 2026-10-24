import type { KnownVuln, RepoProfile } from '../shared/types.ts';
import type { SourceFile } from './files.ts';
import { declaredDependencies, type DeclaredDependency } from './dependencies.ts';

/** Producer contract until the shared KnownVuln adds these provenance fields. */
export interface VerifiedVuln extends KnownVuln { version: string; source: string; aliases?: string[] }
interface Advisory {
  id?: string; summary?: string; details?: string; withdrawn?: string; aliases?: string[];
  affected?: { package?: { name?: string; ecosystem?: string }; versions?: string[];
    ranges?: { type?: string; events?: { introduced?: string; fixed?: string; last_affected?: string; limit?: string }[] }[] }[];
}
const normalizedName = (name: string, ecosystem: string) => ['PyPI', 'crates.io'].includes(ecosystem) ? name.toLowerCase().replace(/[-_.]+/g, '-') : name;
const packageEntries = (advisory: Advisory, dependency: DeclaredDependency) => (advisory.affected ?? []).filter(affected => affected.package?.ecosystem === dependency.ecosystem && normalizedName(affected.package.name ?? '', dependency.ecosystem) === normalizedName(dependency.name, dependency.ecosystem));

/** Deliberately narrow ordering. Unsupported ecosystem qualifiers are not guessed. */
function compareVersions(a: string, b: string, ecosystem: string): number | undefined {
  const parse = (value: string) => {
    const match = value.match(/^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
    if (!match || (match[2] && !['npm', 'Go', 'crates.io'].includes(ecosystem))) return undefined;
    const release = match[1].split('.').map(Number);
    if (!release.every(Number.isSafeInteger)) return undefined;
    return { release, pre: match[2]?.split('.') };
  };
  const x = parse(a), y = parse(b);
  if (!x || !y) return undefined;
  for (let i = 0; i < Math.max(x.release.length, y.release.length); i++) {
    const difference = (x.release[i] ?? 0) - (y.release[i] ?? 0);
    if (difference) return difference;
  }
  if (!x.pre || !y.pre) return x.pre ? -1 : y.pre ? 1 : 0;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const left = x.pre[i], right = y.pre[i];
    if (left === undefined || right === undefined) return left === undefined ? -1 : 1;
    if (left === right) continue;
    const ln = /^\d+$/.test(left), rn = /^\d+$/.test(right);
    return ln && rn ? Number(left) - Number(right) : ln ? -1 : rn ? 1 : left < right ? -1 : 1;
  }
  return 0;
}

function evidence(advisory: Advisory, dependency: DeclaredDependency): { affected: boolean; fixes: string[] } {
  let affected = false;
  const fixes: string[] = [];
  const cmp = (a: string, b: string) => compareVersions(a, b, dependency.ecosystem);
  for (const entry of packageEntries(advisory, dependency)) {
    if (entry.versions?.includes(dependency.version)) affected = true;
    for (const range of entry.ranges ?? []) {
      if (!['SEMVER', 'ECOSYSTEM'].includes(range.type ?? '')) continue;
      let introduced: string | undefined;
      for (const event of range.events ?? []) {
        if (event.introduced !== undefined) introduced = event.introduced;
        const end = event.fixed ?? event.last_affected ?? event.limit;
        if (end === undefined) continue;
        const afterStart = introduced === '0' ? true : introduced !== undefined && (cmp(dependency.version, introduced) ?? -1) >= 0;
        const endOrder = cmp(dependency.version, end);
        if (afterStart && endOrder !== undefined && (event.last_affected !== undefined ? endOrder <= 0 : endOrder < 0)) {
          affected = true;
          if (event.fixed) fixes.push(event.fixed);
        }
        introduced = undefined;
      }
      if (introduced === '0' || (introduced !== undefined && (cmp(dependency.version, introduced) ?? -1) >= 0)) affected = true;
    }
  }
  return { affected, fixes };
}
export function fixedVersion(advisory: Advisory, dependency: DeclaredDependency): string | undefined {
  return evidence(advisory, dependency).fixes.sort((a, b) => compareVersions(a, b, dependency.ecosystem) ?? 0)[0];
}

/** Strip pre-verification cached records rather than replaying unsupported security claims. */
export function isVerifiedVuln(value: KnownVuln): value is VerifiedVuln {
  const record = value as Partial<VerifiedVuln>;
  return typeof record.version === 'string' && /^v?\d[^\s^~*><|,]*$/.test(record.version) && typeof record.source === 'string' && record.source.length > 0;
}

/** Public exact-version API matches AND matching advisory evidence; failures never create records. */
export async function queryDeclaredVulns(files: SourceFile[], profile: RepoProfile, options: { fetcher?: typeof fetch; signal?: AbortSignal } = {}): Promise<VerifiedVuln[] | undefined> {
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
      for (const vulnerability of result.vulns ?? []) if (typeof vulnerability.id === 'string' && vulnerability.id) {
        const dependency = dependencies[i];
        matches.set([vulnerability.id, dependency.ecosystem, dependency.name, dependency.version, dependency.file].join('\0'), { id: vulnerability.id, dependency });
      }
    });
    // Bound advisory enrichment work; apply the display cap after alias consolidation.
    const limited = [...matches.values()].slice(0, 48);
    const details = new Map<string, Advisory>();
    const ids = [...new Set(limited.map(match => match.id))];
    for (let start = 0; start < ids.length; start += 4) {
      const results = await Promise.allSettled(ids.slice(start, start + 4).map(id => request(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`)));
      results.forEach((result, i) => { if (result.status === 'fulfilled') details.set(ids[start + i], result.value as Advisory); });
    }
    const records: VerifiedVuln[] = [];
    for (const { id, dependency } of limited) {
      const advisory = details.get(id);
      if (!advisory || advisory.id !== id || advisory.withdrawn || !evidence(advisory, dependency).affected) continue;
      const aliases = [...new Set([id, ...(advisory.aliases ?? []).filter(alias => typeof alias === 'string')])];
      const same = records.filter(record => record.ecosystem === dependency.ecosystem && normalizedName(record.pkg, record.ecosystem) === normalizedName(dependency.name, dependency.ecosystem) && record.version === dependency.version && record.component === dependency.component && [record.id, ...(record.aliases ?? [])].some(alias => aliases.includes(alias)));
      if (same.length) {
        const first = same[0];
        first.aliases = [...new Set([...aliases, ...same.flatMap(record => [record.id, ...(record.aliases ?? [])])])].filter(alias => alias !== first.id).sort();
        for (const duplicate of same.slice(1)) records.splice(records.indexOf(duplicate), 1);
        continue;
      }
      const fixed = fixedVersion(advisory, dependency);
      records.push({ id, pkg: dependency.name, ecosystem: dependency.ecosystem, version: dependency.version, source: dependency.file,
        summary: (advisory.summary ?? advisory.details?.split('\n')[0] ?? id).trim().slice(0, 180),
        ...(fixed ? { fixed } : {}), ...(aliases.length > 1 ? { aliases: aliases.filter(alias => alias !== id).sort() } : {}), ...(dependency.component ? { component: dependency.component } : {}) });
    }
    return records.slice(0, 12);
  } catch { return undefined; }
}
