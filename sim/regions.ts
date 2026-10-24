import type { BossState } from '../shared/types.ts';
import { bossAnchors } from '../shared/kaiju-anatomy.ts';

// Anatomy supplies visual centers. Preserve the existing combat radii/budget.
export const BOSS_HIT_RADII = { limb: 13, heart: 19 } as const;

export function bossMouth(boss: BossState, head = boss.pose?.head ?? 0): { x: number; y: number } {
  const anatomy = bossAnchors(boss.kit), mouth = anatomy.mouths[head] ?? anatomy.mouth;
  return { x: boss.x + mouth.dx, y: boss.y + mouth.dy };
}

/** Shared pure geometry for renderer and authoritative collision. Core is last. */
export function bossRegions(boss: BossState): { id: string; x: number; y: number; r: number }[] {
  const anatomy = bossAnchors(boss.kit), anchors = new Map(anatomy.limbs.map(a => [a.id, a]));
  return boss.limbs.map<BossState['regions'][number]>(l => {
    const anchor = anchors.get(l.id)!;
    return { id: l.id, x: boss.x + anchor.dx, y: boss.y + anchor.dy, r: BOSS_HIT_RADII.limb };
  }).concat([{ id: 'heart', x: boss.x + anatomy.chest.dx, y: boss.y + anatomy.chest.dy, r: BOSS_HIT_RADII.heart }]);
}

/** Broken limbs remain in snapshot geometry, but cannot be aimed at or hit. */
export function activeBossRegions(boss: BossState) {
  if (boss.kit.archetype === 'abyssal' && boss.airborne) return [];
  const aloft = boss.kit.archetype === 'hydra' && boss.airborne ? new Set(bossAnchors(boss.kit).limbs.filter(a => a.tag === 'head' || a.tag === 'wing').map(a => a.id)) : null;
  return bossRegions(boss).filter(region => (!aloft || aloft.has(region.id)) && (region.id === 'heart' || !boss.limbs.find(l => l.id === region.id)?.broken));
}
