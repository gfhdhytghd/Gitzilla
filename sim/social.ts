import type { AdoptIssue, BossKit, RepoComponent, RepoProfile } from '../shared/types.ts';

/** Source metadata survives kit cloning without adding combat budget. Pending shared contract. */
export type SocialBossKit = BossKit & { social?: { busFactor?: number; repoIssues?: AdoptIssue[]; topMaintainers: Record<string, string[]> } };
export function fragileComponents(p: RepoProfile, components: RepoComponent[]): Set<string> {
  const measured = components.filter(c => c.maintainers !== undefined && Number.isFinite(c.maintainers) && c.maintainers >= 0);
  const fragile = new Set(measured.filter(c => c.maintainers! <= 2).map(c => c.name));
  // Stable component order breaks ties; absent measurements never become fake zeroes.
  if (p.busFactor === 1 && measured.length) {
    const least = measured.reduce((a, b) => b.maintainers! < a.maintainers! ? b : a);
    fragile.add(least.name);
  }
  return fragile;
}
export function bossSocial(p: RepoProfile): NonNullable<SocialBossKit['social']> {
  return {
    ...(p.busFactor === undefined ? {} : { busFactor: p.busFactor }),
    ...(p.repoIssues ? { repoIssues: structuredClone(p.repoIssues) } : {}),
    topMaintainers: Object.fromEntries(p.components.filter(c => c.topMaintainers).map(c => [c.name, [...c.topMaintainers!]])),
  };
}
