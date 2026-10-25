import { clamp } from './math.ts';

/** Ordinary PvP only. Edu and battle retain their independent damage/health rules. */
export const ROYALE_TUNING = {
  weaponDamage: 0.11,
  armorDelay: 1.5,
  armorInterval: 0.25,
  dashCooldown: 1.1,
  dashShield: 0.38,
  armorBreakShield: 2.4,
  homingTurn: 1.4,
  assistCone: 35 * Math.PI / 180,
  assistSnap: 6 * Math.PI / 180,
  assistTurn: 0.5,
  assistCredit: 8,
  // Projectile travel from muzzle; +15px muzzle and ~16px target radius => ~46px centre spacing.
  fullDamageRange: 15,
  falloffRange: 90,
  rangedDamage: 0.07,
};

/** Earlier gentle compression forces contact; the old cleanup deadlines remain a stall backstop. */
export function royaleTimeline(count: number) {
  const n = clamp(count, 2, 8), lo = n <= 4 ? 2 : 4, hi = n <= 4 ? 4 : 8;
  const phases = {
    2: { start: 27, end: 97, limit: 132 },
    4: { start: 27, end: 102, limit: 152 },
    8: { start: 32, end: 112, limit: 162 },
  };
  const t = (n - lo) / (hi - lo), a = phases[lo], b = phases[hi];
  return { start: a.start + (b.start - a.start) * t, end: a.end + (b.end - a.end) * t, limit: a.limit + (b.limit - a.limit) * t };
}
