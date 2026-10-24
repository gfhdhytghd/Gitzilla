import type { BossArchetype, BossAttackKind } from '../shared/types.ts';
import { clamp } from './math.ts';

/** Central playtest knobs. Odd-sized squads interpolate neighboring budgets. */
export const SQUAD_TUNING = {
  4: { pressurePeriod: 3.6, hitDamage: 5 },
  6: { pressurePeriod: 3.4, hitDamage: 4.3 },
  8: { pressurePeriod: 3.2, hitDamage: 4 },
};
export const MATCH_TUNING = { bossBaseHp: 11600, bossReferencePlayers: 4, bossHealthDivisor: 3 };

/** One room-wide budget; repo anatomy never adds HP, casts or pressure lanes. */
export function squadBudget(playerCount: number) {
  const n = clamp(playerCount, 1, 8);
  const lo = n <= 6 ? SQUAD_TUNING[4] : SQUAD_TUNING[6];
  const hi = n <= 6 ? SQUAD_TUNING[6] : SQUAD_TUNING[8];
  const t = clamp((n - (n <= 6 ? 4 : 6)) / 2, 0, 1);
  return {
    // Equal HP per combatant, at one third of the previous encounter health.
    hp: Math.round(MATCH_TUNING.bossBaseHp * 2.2 * n / MATCH_TUNING.bossReferencePlayers / MATCH_TUNING.bossHealthDivisor),
    pressureLanes: n >= 8 ? 4 : n >= 6 ? 2 : n >= 4 ? 1 : 0,
    pressurePeriod: lo.pressurePeriod + (hi.pressurePeriod - lo.pressurePeriod) * t,
    recoveryScale: 1 / (1 + Math.max(0, n - 4) * 0.065),
    hitDamage: n === 1 ? 2 : lo.hitDamage + (hi.hitDamage - lo.hitDamage) * t,
  };
}

// Repo seed directs art/anatomy, not an accidentally easier/harder AI random stream.
export const ENCOUNTER_SEED = 0x4b41494a;

/** Contact risk per threat unit: homing/low ground shots land more often than head beams.
 * Apply once at impact, including shared pressure, rather than awarding a style extra HP/casts.
 */
export const ARCHETYPE_CONTACT_COST: Record<4 | 6 | 8, Record<BossArchetype, number>> = {
  4: { kaiju: 1.2, hydra: 0.95, mecha: 1.14, abyssal: 1.1 },
  6: { kaiju: 1.1, hydra: 1.02, mecha: 1.1, abyssal: 1.2 },
  8: { kaiju: 1, hydra: 0.84, mecha: 1, abyssal: 1 },
};
export function archetypeContactCost(archetype: BossArchetype, count: number) {
  const n = clamp(count, 1, 8);
  const lo = n < 4 ? 1 : n < 6 ? 4 : 6, hi = n < 4 ? 4 : n < 6 ? 6 : 8;
  const a = lo === 1 ? 1 : ARCHETYPE_CONTACT_COST[lo][archetype], b = ARCHETYPE_CONTACT_COST[hi][archetype];
  return a + (b - a) * (n - lo) / (hi - lo);
}

/** Relative occupancy/contact risk. Expensive shapes spend longer recovering. */
export const ATTACK_COST: Record<BossAttackKind, number> = {
  ring: 1.6, spiral: 1.5, fan: 1, laser: 0.9, slam: 0.6, charge: 1.4, summon: 0.6,
  // Cascade warns up to four different positions; it must pay more than one slam.
  cascade: 1.2,
};

/** These optional fields are emitted today without requiring a shared/ edit. */
export interface HitFeedback {
  crit: boolean;
  direction: [number, number];
  impact: number;
  hitStop: number;
  source: string;
}
