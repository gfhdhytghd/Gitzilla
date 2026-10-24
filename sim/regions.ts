import type { BossState } from '../shared/types.ts';

/** Shared pure geometry for renderer and authoritative collision. Core is last. */
export function bossRegions(boss: BossState): { id: string; x: number; y: number; r: number }[] {
  const n = boss.limbs.length;
  return boss.limbs.map(l => {
    const i = boss.limbs.findIndex(other => other.id === l.id);
    const angle = -Math.PI / 2 + i * Math.PI * 2 / Math.max(1, n) + (boss.kit.seed % 7) * 0.045;
    return { id: l.id, x: boss.x + Math.cos(angle) * 37, y: boss.y + Math.sin(angle) * 32, r: 13 };
  }).concat([{ id: 'heart', x: boss.x, y: boss.y, r: 19 }]);
}

/** Broken limbs remain in snapshot geometry, but cannot be aimed at or hit. */
export function activeBossRegions(boss: BossState) {
  return bossRegions(boss).filter(region => region.id === 'heart' || !boss.limbs.find(l => l.id === region.id)?.broken);
}
