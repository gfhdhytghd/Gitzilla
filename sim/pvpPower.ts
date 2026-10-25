import type { PlayerKit, RepoProfile } from '../shared/types.ts';
import { clamp } from './math.ts';
import { asBattleKit, classroomFacts, qualitySignals, type ClassroomFacts, type ClassroomKit } from './quality.ts';

export interface PvpPower { score: number; parts: { label: string; value: number; weight: number }[] }
export interface PvpAi { baseScore: number; powerMultiplier: number }
export const PVP_AI_POWER_MULTIPLIER = 0.8;
export interface PowerScaleFacts { stars: number; contributors: number; commits: number; ageDays: number; todoMeasured?: boolean }
const finite = (n: number) => Number.isFinite(n) ? Math.max(0, n) : 0;
const logScore = (n: number, cap: number) => clamp(Math.log1p(finite(n)) / Math.log1p(cap), 0, 1);
const round = (n: number) => Math.round(n * 10) / 10;

/** The quality60% is the exact edu signal computation, not grades parsed from display strings. */
export function powerFromFacts(f: ClassroomFacts, scale: PowerScaleFacts): PvpPower {
  const q = qualitySignals(f);
  const part = (label: string, value: number, weight: number) => ({ label, value: round(clamp(value, 0, 1) * 100), weight });
  const activityMeasured = scale.ageDays > 0 && scale.commits > 0;
  const parts = [
    part(`Tests (${(f.testRatio * 100).toFixed(1)}% files)`, q.testing, 0.16),
    part(`Modularity (fan-out ${f.avgFanOut.toFixed(1)}, depth ${f.maxDepth})`, q.modularity, 0.12),
    part(f.functionsPerFile === null ? 'Cohesion (unmeasured; neutral)' : `Cohesion (${f.functionsPerFile.toFixed(1)} definitions/file)`, q.cohesion, 0.12),
    part(`Docs (README ${f.hasReadme ? 'present' : 'not found'}; comments ${f.commentRatio === null ? 'unmeasured' : `${(f.commentRatio * 100).toFixed(1)}%`})`, q.documentation, 0.12),
    part(`Debt hygiene (${f.cycles.length} cycles; ${scale.todoMeasured === false ? 'TODOs unmeasured' : `${f.todoDensity.toFixed(1)} TODO/kLOC`})`, 1 - q.weakness / 0.2, 0.08),
    part(`Stars (${finite(scale.stars)})`, logScore(scale.stars, 100_000), 0.12),
    part(`Contributors (${finite(scale.contributors)})`, logScore(scale.contributors, 1_000), 0.10),
    part(`Analyzed LOC (${finite(f.loc)})`, logScore(f.loc, 500_000), 0.10),
    part(activityMeasured ? `Commit activity (${scale.commits} commits/${scale.ageDays} days)` : 'Commit activity (unmeasured; neutral)',
      activityMeasured ? logScore(scale.commits / Math.max(30, scale.ageDays), 5) : 0.5, 0.08),
  ];
  return { score: round(parts.reduce((sum, p) => sum + p.value * p.weight, 0)), parts };
}

export function pvpPowerFromProfile(p: RepoProfile): PvpPower { return powerFromFacts(classroomFacts(p), { ...p, todoMeasured: !!p.dna }); }

/** Absolute neutral baseline, not bonuses added to the battle allocation. All five stats increase with score. */
export function statsFromPower(score: number) {
  const s = clamp(Number.isFinite(score) ? score / 100 : 0.5, 0, 1);
  return { maxHp: 6 + Math.round(3 * s), maxArmor: 4 + Math.round(2 * s), damageMul: 1 + 0.75 * s,
    speed: 85 + 10 * s, maxEnergy: 185 + Math.round(60 * s) };
}

/** Idempotent across constructor/design/mode changes. Missing evidence is labelled, not fabricated. */
export function asPvpKit(kit: PlayerKit, options: { ai?: boolean } = {}): ClassroomKit {
  const source = kit as ClassroomKit, base = asBattleKit(kit) as ClassroomKit;
  const rawPower = base.classroom && base.powerSource ? powerFromFacts(base.classroom, base.powerSource)
    : source.pvpPower ? { ...source.pvpPower, score: source.pvpAi?.baseScore ?? source.pvpPower.score }
      : { score: 50, parts: [{ label: 'Source analysis unavailable; neutral', value: 50, weight: 1 }] };
  const ai = options.ai ?? !!source.pvpAi;
  const pvpAi = ai ? { baseScore: rawPower.score, powerMultiplier: PVP_AI_POWER_MULTIPLIER } : undefined;
  const pvpPower = { ...rawPower, score: round(rawPower.score * (pvpAi?.powerMultiplier ?? 1)) };
  const battleStats = { maxHp: base.maxHp, maxArmor: base.maxArmor, maxEnergy: base.maxEnergy, speed: base.speed, damageMul: base.damageMul };
  return { ...base, battleStats, pvpPower: structuredClone(pvpPower), ...(pvpAi ? { pvpAi } : {}), ...statsFromPower(pvpPower.score) };
}

export const asPvpAiKit = (kit: PlayerKit) => asPvpKit(kit, { ai: true });
