import type { BossAttackKind } from '../shared/types.ts';
import { clamp } from './math.ts';

/** Central playtest knobs. Odd-sized squads interpolate neighboring budgets. */
export const SQUAD_TUNING = {
  4: { pressurePeriod: 3.3, hitDamage: 4.5 },
  6: { pressurePeriod: 3.1, hitDamage: 4 },
  8: { pressurePeriod: 3, hitDamage: 4 },
};

/** One room-wide budget; repo anatomy never adds HP, casts or pressure lanes. */
export function squadBudget(playerCount: number) {
  const n = clamp(playerCount, 1, 8);
  const lo = n <= 6 ? SQUAD_TUNING[4] : SQUAD_TUNING[6];
  const hi = n <= 6 ? SQUAD_TUNING[6] : SQUAD_TUNING[8];
  const t = clamp((n - (n <= 6 ? 4 : 6)) / 2, 0, 1);
  return {
    hp: Math.round(13200 * (0.6 + 0.4 * n) * (1 + Math.max(0, n - 4) * 0.085)),
    pressureLanes: n >= 8 ? 4 : n >= 6 ? 2 : n >= 4 ? 1 : 0,
    pressurePeriod: lo.pressurePeriod + (hi.pressurePeriod - lo.pressurePeriod) * t,
    recoveryScale: 1 / (1 + Math.max(0, n - 4) * 0.065),
    hitDamage: n === 1 ? 2 : lo.hitDamage + (hi.hitDamage - lo.hitDamage) * t,
  };
}

// Repo seed directs art/anatomy, not an accidentally easier/harder AI random stream.
export const ENCOUNTER_SEED = 0x4b41494a;

/** Relative occupancy/contact risk. Expensive shapes spend longer recovering. */
export const ATTACK_COST: Record<BossAttackKind, number> = {
  ring: 1.6, spiral: 1.5, fan: 1, laser: 0.9, slam: 0.6, charge: 1.4, summon: 0.6, cascade: 0.6,
};

/** These optional fields are emitted today without requiring a shared/ edit. */
export interface HitFeedback {
  crit: boolean;
  direction: [number, number];
  impact: number;
  hitStop: number;
  source: string;
}
