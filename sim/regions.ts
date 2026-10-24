import type { BossState } from '../shared/types.ts';
import { kaijuAnchors } from '../shared/kaiju-anatomy.ts';

// Anatomy supplies visual centers. Preserve the existing combat radii/budget.
export const BOSS_HIT_RADII = { limb: 13, heart: 19 } as const;

export function bossMouth(boss: BossState): { x: number; y: number } {
  const { mouth } = kaijuAnchors(boss.kit);
  return { x: boss.x + mouth.dx, y: boss.y + mouth.dy };
}

/** Shared pure geometry for renderer and authoritative collision. Core is last. */
export function bossRegions(boss: BossState): { id: string; x: number; y: number; r: number }[] {
  const anatomy = kaijuAnchors(boss.kit), anchors = new Map(anatomy.limbs.map(a => [a.id, a]));
  return boss.limbs.map<BossState['regions'][number]>(l => {
    const anchor = anchors.get(l.id)!;
    return { id: l.id, x: boss.x + anchor.dx, y: boss.y + anchor.dy, r: BOSS_HIT_RADII.limb };
  }).concat([{ id: 'heart', x: boss.x + anatomy.chest.dx, y: boss.y + anatomy.chest.dy, r: BOSS_HIT_RADII.heart }]);
}

/** Broken limbs remain in snapshot geometry, but cannot be aimed at or hit. */
export function activeBossRegions(boss: BossState) {
  return bossRegions(boss).filter(region => region.id === 'heart' || !boss.limbs.find(l => l.id === region.id)?.broken);
}
