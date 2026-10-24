import { codeExpression } from './expressions.ts';
import type { BossAttack, BossAttackKind, PlayerKit, SkillKind, WeaponKind } from '../shared/types.ts';

export type CodeWeapon = NonNullable<NonNullable<PlayerKit['code']>['weapon']>;
/** Display metadata only: never changes WeaponKind, cadence, damage, speed or energy. */
export function weaponCode(kind: WeaponKind, language: string, seed: number, realTokens: string[] = [], realIdentifiers: string[] = []): CodeWeapon {
  const style = codeExpression(kind, language, seed, realIdentifiers);
  const genuine = realTokens.find(token => token.length > 0 && token.length <= 8 && !/\s/.test(token));
  const glyphs = [...new Set([...style.projectiles, ...(genuine ? [genuine] : [])])].slice(0, 4);
  const rotation = (seed >>> 0) % glyphs.length;
  return { ...style, projectiles: [...glyphs.slice(rotation), ...glyphs.slice(0, rotation)] };
}

export const SKILL_FLAVOR: Record<SkillKind, string> = {
  firewall: 'try { } catch', fork: 'git fork', hotfix: '+patch', overclock: 'sudo !!', rollback: 'git revert',
};
export const ATTACK_FLAVOR_POOLS: Record<BossAttackKind, readonly string[]> = {
  ring: ['while(true) Loop', 'Infinite Scroll', 'Busy Wait'],
  spiral: ['Recursion', 'Callback Hell', 'Deep Clone'],
  fan: ['throw', 'Exception Spray', 'Panic!'],
  laser: ['</> Breath', 'Race Condition', 'grep Beam'],
  slam: ['Stack Overflow', 'Segfault', 'Kernel Panic'],
  charge: ['git push --force', 'rm -rf', 'Hard Reset'],
  summon: ['npm install Swarm', 'Dependency Hell'],
  cascade: ['Merge Conflict', 'Memory Leak'],
};
/** First-choice aliases retained for older callers; generation uses the full pools. */
export const ATTACK_FLAVOR = Object.fromEntries(Object.entries(ATTACK_FLAVOR_POOLS).map(([kind, pool]) => [kind, pool[0]])) as Record<BossAttackKind, string>;

/** Cycle each kind's pool evenly, independent of HP, player count and gameplay RNG. */
export function attackFlavorPicker(seed: number, existing: Pick<BossAttack, 'kind'>[] = []) {
  const counts = new Map<BossAttackKind, number>();
  for (const attack of existing) counts.set(attack.kind, (counts.get(attack.kind) ?? 0) + 1);
  return (kind: BossAttackKind): string => {
    const pool = ATTACK_FLAVOR_POOLS[kind], n = counts.get(kind) ?? 0;
    counts.set(kind, n + 1);
    let hash = seed >>> 0;
    for (const ch of kind) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
    // Every boss's first beam is its signature atomic breath; later beams still vary.
    return pool[kind === 'laser' ? n % pool.length : (hash + n) % pool.length];
  };
}
