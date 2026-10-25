import { clamp } from './math.ts';

/** Ordinary PvP only. Edu and battle retain their independent damage/health rules. */
export const ROYALE_TUNING = {
  weaponDamage: 0.03,
  armorDelay: 1.5,
  armorInterval: 0.25,
  dashCooldown: 1.1,
  dashShield: 0.38,
  armorBreakShield: 2.4,
  homingTurn: 1.4,
};

/** Larger rosters get room for several exchanges before GC compresses the final survivors. */
export function royaleTimeline(count: number) {
  const n = clamp(count, 2, 8), lo = n <= 4 ? 2 : 4, hi = n <= 4 ? 4 : 8;
  const phases = {
    2: { start: 47, end: 107, limit: 132 },
    4: { start: 67, end: 127, limit: 152 },
    8: { start: 102, end: 147, limit: 162 },
  };
  const t = (n - lo) / (hi - lo), a = phases[lo], b = phases[hi];
  return { start: a.start + (b.start - a.start) * t, end: a.end + (b.end - a.end) * t, limit: a.limit + (b.limit - a.limit) * t };
}
