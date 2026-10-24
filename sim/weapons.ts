import type { WeaponKind } from '../shared/types.ts';

export const WEAPONS: Record<WeaponKind, { interval: number; damage: number; speed: number; cost: number; life: number; count: number; spread: number; r: number }> = {
  blaster: { interval: 0.3, damage: 8, speed: 230, cost: 2, life: 2, count: 1, spread: 0, r: 3 },
  smg: { interval: 0.11, damage: 3, speed: 250, cost: 0.8, life: 1.8, count: 1, spread: 0.09, r: 2 },
  shotgun: { interval: 0.65, damage: 4, speed: 230, cost: 4, life: 0.8, count: 5, spread: 0.42, r: 2.5 },
  cannon: { interval: 0.85, damage: 23, speed: 175, cost: 5, life: 2.5, count: 1, spread: 0, r: 5 },
  staff: { interval: 0.5, damage: 13, speed: 160, cost: 3, life: 3, count: 1, spread: 0, r: 4 },
  laser: { interval: 0.14, damage: 3.8, speed: 540, cost: 1, life: 0.65, count: 1, spread: 0, r: 2 },
  blade: { interval: 0.38, damage: 11, speed: 285, cost: 1, life: 0.54, count: 1, spread: 0, r: 9 },
};
// A lone hero cannot earn multiplayer combos or be revived; keep solo demos playable.
export const SOLO_DAMAGE_MUL = 1.65;

