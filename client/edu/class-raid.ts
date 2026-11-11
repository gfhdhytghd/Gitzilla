// The class attack ("raid") as a client-staged timeline. The server applies all damage at once and gives the raid
// 10 s (ClassroomState.raidEndsAt, frozen while the host pauses); every screen derives the same moment from that
// clock alone, so a reload or a late-opened projector lands mid-raid at the right beat. Pure: no DOM, no time source.
//
//   0.2 s  boss roars (intro)          1.5 … 6.5 s  six volleys land, HP steps bossBefore → bossAfter
//   6.5 s  kill: the last volley is the killing blow, death topple (1.8 s) instead of a stagger
//   7.1 s  no kill: enrage beat if the phase dropped, else a roar    7.2 s  class impact revealed   8.2 s  names revealed
import type { BossPose } from "../../shared/types.ts";
import type { ClassroomRound, ClassroomState } from "../../shared/classroom.ts";

export const RAID_SEC = 10;
export const HITS = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
export const STAGGER = 0.55, DEATH = 1.8, IMPACT_AT = 7.2, NAMES_AT = 8.2;
const INTRO = { at: 0.2, total: 1.1 }, END_BEAT = 7.1;

type RaidClock = Pick<ClassroomState, "phase" | "raidEndsAt" | "paused">;
type Hp = Pick<ClassroomRound, "bossBefore" | "bossAfter">;

/** Seconds into the running raid (0…10), frozen at the pause (also through the resume countdown: the server shifts
 *  raidEndsAt only once the raid runs again). null outside a raid. `serverNow` = Date.now() + server clock offset. */
export function raidElapsed(s: RaidClock, serverNow: number): number | null {
  if (s.phase !== "raid" || s.raidEndsAt === null) return null;
  const at = s.paused ? s.paused.since : serverNow;
  return Math.max(0, Math.min(RAID_SEC, (at - (s.raidEndsAt - RAID_SEC * 1000)) / 1000));
}

const tenth = (n: number) => Math.round(n * 10) / 10;
export const bossPhase = (hp: number, maxHp: number) => { const f = maxHp > 0 ? hp / maxHp : 1; return f > 0.66 ? 1 : f > 0.33 ? 2 : 3; };

export interface RaidStage {
  hp: number;          // HP to show now
  landed: number;      // volleys landed so far (0 when the round dealt no damage)
  kill: boolean;       // this round kills the boss
  dead: boolean;       // the killing blow has landed
  toppled: boolean;    // the death topple has finished: nothing left standing
  impact: boolean;     // reveal "Class impact: N damage"
  names: boolean;      // reveal the "big improvements" names
}

/** What to show `elapsed` seconds into the raid of `round`; `elapsed === null` (no raid, reduced motion) = final. */
export function raidStage(round: Hp, elapsed: number | null): RaidStage {
  const damage = Math.max(0, round.bossBefore - round.bossAfter), kill = round.bossBefore > 0 && round.bossAfter <= 0;
  const e = elapsed ?? Infinity;
  const landed = damage > 0 ? HITS.filter(at => e >= at).length : 0;
  let hp = landed >= HITS.length || elapsed === null ? round.bossAfter : tenth(round.bossBefore - damage * landed / HITS.length);
  if (round.bossAfter <= 0 && landed < HITS.length && elapsed !== null) hp = Math.max(0.1, hp); // alive until the killing blow
  const dead = round.bossAfter <= 0 && (kill ? landed >= HITS.length || elapsed === null : true);
  return { hp, landed, kill, dead, toppled: dead && (!kill || e >= HITS.at(-1)! + DEATH), impact: e >= IMPACT_AT, names: e >= NAMES_AT };
}

export interface RaidPose { name: BossPose; t: number; total: number }
/** The boss pose at `elapsed` seconds into the raid (null = idle). Staggers sit exactly on the volleys. */
export function raidPose(round: Hp, maxHp: number, elapsed: number): RaidPose | null {
  const at = (name: BossPose, start: number, total: number): RaidPose | null => elapsed >= start && elapsed < start + total ? { name, t: elapsed - start, total } : null;
  const damage = round.bossBefore - round.bossAfter;
  if (round.bossBefore <= 0) return null;
  if (damage <= 0) return at("roar", INTRO.at, INTRO.total) ?? at("roar", 4, INTRO.total); // shrugs the volley off
  const kill = round.bossAfter <= 0, last = HITS.at(-1)!;
  if (kill && elapsed >= last) return { name: "death", t: Math.min(elapsed - last, DEATH), total: DEATH };
  for (const hit of HITS) { const p = at("stagger", hit, STAGGER); if (p) return p; }
  if (bossPhase(round.bossAfter, maxHp) > bossPhase(round.bossBefore, maxHp)) return at("enrage", END_BEAT, 1.4) ?? at("roar", INTRO.at, INTRO.total);
  return at("roar", END_BEAT, 1) ?? at("roar", INTRO.at, INTRO.total);
}

/** Damage / HP for people: whole numbers stay whole ("12"), otherwise one decimal ("0.4"); a non-zero value never
 *  prints as 0 (0.04 → "0.1"), so a living boss never reads "0 / 180". */
export function amountParts(n: number): { value: number; digits: 0 | 1 } {
  let value = tenth(n);
  if (value === 0 && n !== 0) value = Math.sign(n) * 0.1;
  return { value: value === 0 ? 0 : value, digits: Number.isInteger(value) ? 0 : 1 };
}

/** HP floor the server keeps for this round's step (each step owns an equal share of the boss; the last step reaches 0). */
export function stepFloor(s: Pick<ClassroomState, "plan" | "bossMaxHp">, round: Pick<ClassroomRound, "stepId">): number {
  const n = s.plan.steps.length, i = s.plan.steps.findIndex(st => st.id === round.stepId);
  if (i < 0 || i >= n - 1) return 0;
  return Math.max(1, tenth(s.bossMaxHp - s.bossMaxHp / n * (i + 1)));
}

export type MyRound =
  | { kind: "none" }                                   // no class attack yet
  | { kind: "absent" }                                 // did not submit for the last attack
  | { kind: "hit"; damage: number }
  | { kind: "zero"; why: "defeated" | "capped" | "score0" | "nogain" };

/** A student's own part in the latest class attack. Read from the round (frozen at attack time, equal to row.damage
 *  during raid/feedback) so it stays right after the next step reopens and resets row.damage. */
export function myRound(s: Pick<ClassroomState, "plan" | "bossMaxHp" | "rounds">, you: string | undefined): MyRound {
  const round = s.rounds.at(-1);
  if (!round) return { kind: "none" };
  const mine = round.attacks.find(a => a.id === you);
  if (!mine) return { kind: "absent" };
  if (mine.damage > 0) return { kind: "hit", damage: mine.damage };
  if (round.bossBefore <= 0) return { kind: "zero", why: "defeated" };
  if (mine.score <= 0) return { kind: "zero", why: "score0" };
  if (round.bossAfter <= stepFloor(s, round) + 0.05) return { kind: "zero", why: "capped" };
  return { kind: "zero", why: "nogain" };
}
