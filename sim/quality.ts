import type { CriterionResult, KnownVuln, PlayerKit, QualityStat, RepoProfile, Rubric, RubricSignal } from '../shared/types.ts';
import { clamp } from './math.ts';
import type { PvpPower, PowerScaleFacts } from './pvpPower.ts';

export interface ClassroomFacts {
  heart: string; heartFanIn: number; files: string[];
  components: { name: string; loc: number; fanIn: number; fanOut: number }[];
  cycles: string[][]; testRatio: number; hasTests: boolean; loc: number; readmeLength: number | null; hasReadme: boolean;
  avgFanOut: number; maxDepth: number; functionsPerFile: number | null; avgFunctionLength: number | null;
  functionLengthApproximate: boolean; longestFunction: number; commentRatio: number | null;
  todoCount: number; todoDensity: number; vulns: Pick<KnownVuln, 'id' | 'pkg' | 'fixed'>[];
}
type BattleStats = Pick<PlayerKit, 'maxHp' | 'maxArmor' | 'maxEnergy' | 'speed' | 'damageMul'>;
export type ClassroomKit = PlayerKit & { classroom?: ClassroomFacts; rubricQuality?: { title: string; rows: QualityStat[] }; battleStats?: BattleStats; pvpPower?: PvpPower; powerSource?: PowerScaleFacts };
export interface ScoredRubric { rubric: Rubric; results: CriterionResult[] }
type ExtraSignals = { commentRatio?: number; readmeLength?: number; avgFunctionLength?: number; functionsPerFile?: number; hasTestDir?: boolean };
const grade = (score: number): QualityStat['grade'] => score >= 0.82 ? 'A' : score >= 0.64 ? 'B' : score >= 0.43 ? 'C' : score >= 0.23 ? 'D' : 'F';
const percent = (n: number) => `${(n * 100).toFixed(1)}%`;

export function classroomFacts(p: RepoProfile): ClassroomFacts {
  const d = p.dna, extra = (d ?? {}) as ExtraSignals;
  const definitions = d?.counts.functions ?? 0;
  const todos = d ? d.counts.todo + d.counts.fixme + d.counts.hack : 0;
  const files = d?.bigFiles.map(f => f.path) ?? p.tree?.slice(0, 8) ?? [];
  const hasTests = extra.hasTestDir ?? (p.testRatio > 0 || [...files, ...(p.tree ?? []), ...p.components.map(c => c.name)].some(f => /(^|\/)(__tests__|tests?|spec)(\/|$)|\.(test|spec)\./i.test(f)));
  return {
    heart: p.heart, heartFanIn: p.heartFanIn, files,
    components: p.components.map(c => ({ name: c.name, loc: c.loc, fanIn: c.fanIn, fanOut: c.fanOut })),
    cycles: p.cycles.map(c => [...c]), testRatio: p.testRatio, hasTests, loc: p.totalLoc,
    readmeLength: extra.readmeLength ?? p.readme?.length ?? null,
    hasReadme: (extra.readmeLength ?? p.readme?.length ?? 0) > 0 || !!p.tree?.some(f => /(^|\/)readme\b/i.test(f)),
    avgFanOut: p.components.reduce((s, c) => s + c.fanOut, 0) / Math.max(1, p.components.length), maxDepth: p.maxDepth,
    functionsPerFile: extra.functionsPerFile ?? (definitions > 0 ? definitions / Math.max(1, p.totalFiles) : null),
    avgFunctionLength: extra.avgFunctionLength ?? (definitions > 0 ? p.totalLoc / definitions : null),
    functionLengthApproximate: extra.avgFunctionLength === undefined,
    longestFunction: d?.longestFunction?.lines ?? 0,
    commentRatio: extra.commentRatio ?? (d ? d.counts.comments / Math.max(1, p.totalLoc) : null),
    todoCount: todos, todoDensity: todos * 1000 / Math.max(1, p.totalLoc),
    vulns: (p.vulns ?? []).slice(0, 12).map(({ id, pkg, fixed }) => ({ id, pkg, ...(fixed ? { fixed } : {}) })),
  };
}

export function qualitySignals(f: ClassroomFacts) {
  const testing = clamp(f.testRatio / 0.3 + (f.hasTests ? 0.1 : 0), 0, 1);
  const size = clamp((Math.log10(Math.max(1, f.loc)) - 2) / 4, 0, 1) * 0.7 + (f.hasReadme ? 0.3 : 0);
  const modularity = 1 - clamp(f.avgFanOut / 8 * 0.6 + f.maxDepth / 16 * 0.4, 0, 1);
  const density = f.functionsPerFile;
  const cohesion = density === null ? 0.5 : clamp(
    (density >= 1 && density <= 8 ? 1 : density < 1 ? density : 8 / density) * 0.45 +
    (1 - clamp(((f.avgFunctionLength ?? 40) - 20) / 120, 0, 1)) * 0.35 +
    (1 - clamp((f.longestFunction - 60) / 240, 0, 1)) * 0.2, 0, 1);
  const documentation = clamp((f.commentRatio === null ? 0.25 : clamp(f.commentRatio / 0.2, 0, 1) * 0.65) +
    (f.readmeLength === null ? f.hasReadme ? 0.15 : 0 : clamp(f.readmeLength / 1500, 0, 1) * 0.35), 0, 1);
  const weakness = clamp(f.cycles.length * 0.04 + Math.min(0.08, f.todoDensity * 0.01), 0, 0.2);
  return { testing, size, modularity, cohesion, documentation, weakness };
}

export function qualityRows(f: ClassroomFacts): QualityStat[] {
  const { testing, size, modularity, cohesion, documentation, weakness } = qualitySignals(f), density = f.functionsPerFile;
  const file = f.files[0] ?? f.heart;
  const row = (stat: QualityStat['stat'], value: number, score: number, signal: string, tip: string): QualityStat => ({ stat, value, grade: grade(score), signal, tip });
  return [
    row('hp', 10 + Math.round(size * 4), size, `${f.loc.toLocaleString('en-US')} analyzed LOC; README ${f.hasReadme ? 'present' : 'not found in sample'}`, 'Keep a README explaining how to run and test the project; size bonuses are capped.'),
    row('armor', 3 + Math.round(testing * 4), testing, `Tests: ${percent(f.testRatio)} of files${f.hasTests ? '; test directory detected' : ''}`, `Add focused tests for ${file} to raise your try/catch shield.`),
    row('speed', 90 + Math.round(modularity * 24), modularity, `Average fan-out ${f.avgFanOut.toFixed(1)}; dependency depth ${f.maxDepth}`, 'Reduce cross-module dependencies and split long dependency chains.'),
    row('damage', 0.9 + cohesion * 0.3, cohesion, density === null ? 'Function metrics unavailable in analyzed sample' : `${density.toFixed(1)} definitions/file; ${f.functionLengthApproximate ? 'approx. LOC/definition' : 'average function length'} ${(f.avgFunctionLength ?? 0).toFixed(0)}; longest ${f.longestFunction} lines`, `Keep functions focused; extract a smaller function from ${file}.`),
    row('energy', 140 + Math.round(documentation * 80), documentation, `Comment ratio ${f.commentRatio === null ? 'unavailable' : percent(f.commentRatio)}; README ${f.readmeLength === null ? 'length unavailable' : `${f.readmeLength} characters`}`, 'Add useful API comments and a README with examples, not filler comments.'),
    row('regen', 4 + documentation * 4, documentation, `Documentation score ${(documentation * 100).toFixed(0)}%; same source signals as RAM`, 'Explain tricky decisions and show working examples to improve energy recovery.'),
    row('weakness', weakness, 1 - weakness / 0.2, `${f.cycles.length} dependency cycles; ${f.todoDensity.toFixed(1)} TODO/FIXME/HACK per kLOC${f.vulns.length ? `; ${f.vulns.length} public advisories` : ''}`, f.vulns.length ? `Dependency ${f.vulns[0].pkg}: ${f.vulns[0].id}; ${f.vulns[0].fixed ? `upgrade to ≥ ${f.vulns[0].fixed}` : 'review the public advisory for a fixed version'}.` : f.cycles.length ? `Break the ${f.cycles[0].join(' ↔ ')} cycle; review stale TODOs.` : 'Keep the dependency graph acyclic and resolve stale TODO/FIXME comments.'),
  ];
}

export function asClassroomKit(kit: PlayerKit): ClassroomKit {
  const input = ((kit as ClassroomKit).pvpPower ? asBattleKit(kit) : kit) as ClassroomKit;
  const source = { ...input, battleStats: input.battleStats ?? { maxHp: input.maxHp, maxArmor: input.maxArmor, maxEnergy: input.maxEnergy, speed: input.speed, damageMul: input.damageMul } };
  if (source.rubricQuality) return withQuality(source, source.rubricQuality.rows);
  if (!source.classroom) {
    // Custom/mocked callers can still play, but never get fabricated source-based grades.
    return { ...structuredClone(source), maxHp: 12, maxArmor: 5, maxEnergy: 180, speed: 102, damageMul: 1.05,
      quality: (['hp', 'armor', 'speed', 'damage', 'energy', 'regen', 'weakness'] as const).map(stat => ({ stat,
        value: ({ hp: 12, armor: 5, speed: 102, damage: 1.05, energy: 180, regen: 6, weakness: 0 }[stat]), grade: 'C',
        signal: 'Source analysis unavailable; neutral classroom value', tip: 'Analyze this repository again to get a source-based report card.' })) };
  }
  return withQuality(source, qualityRows(source.classroom));
}

/** Mode switches restore the original equal-budget stats rather than keeping earned edu bonuses. */
export function asBattleKit(kit: PlayerKit): PlayerKit {
  const { quality: _quality, rubricQuality: _rubric, pvpPower: _power, battleStats, ...identity } = structuredClone(kit as ClassroomKit);
  return { ...identity, ...battleStats };
}

function withQuality(source: ClassroomKit, rows: QualityStat[]): ClassroomKit {
  const quality = structuredClone(rows), value = (stat: QualityStat['stat']) => quality.find(q => q.stat === stat)!.value;
  return { ...structuredClone(source), quality, maxHp: value('hp'), maxArmor: value('armor'), maxEnergy: value('energy'), speed: value('speed'), damageMul: value('damage') };
}

const RUBRIC_SIGNALS: Record<QualityStat['stat'], RubricSignal[]> = {
  hp: ['size', 'commits', 'check'], armor: ['tests', 'ci', 'typing', 'check'], speed: ['modularity', 'check'],
  damage: ['cohesion', 'function-length', 'check'], energy: ['documentation', 'readme', 'license', 'check'],
  regen: ['documentation', 'readme', 'license', 'check'], weakness: ['cycles', 'tech-debt', 'check'],
};

/** Real scores only; parsing/scoring belong to rubric/. The default source preserves existing stats exactly.
 * Use (kit, {rubric, results}) or (kit, results, rubric). Arrays without criterion metadata keep defaults.
 */
export function qualityFromRubric(kit: PlayerKit, input: ScoredRubric | CriterionResult[], rubric?: Rubric): ClassroomKit {
  const { rubricQuality: _previous, ...original } = kit as ClassroomKit;
  const base = asClassroomKit(original);
  const scoring = Array.isArray(input) ? { rubric, results: input } : input;
  if (!scoring.rubric || scoring.rubric.source === 'default') return base;
  const seen = new Set<string>();
  const measured = scoring.rubric.criteria.flatMap(criterion => {
    const result = scoring.results.find(r => r.criterionId === criterion.id);
    if (seen.has(criterion.id) || !Number.isFinite(criterion.weight) || criterion.weight <= 0 || !result || !Number.isFinite(result.score)) return [];
    seen.add(criterion.id);
    return [{ criterion, result, score: clamp(result.score, 0, 1) }];
  });
  if (!measured.length) return base;
  const average = (rows: typeof measured) => rows.reduce((sum, r) => sum + r.score * r.criterion.weight, 0) /
    rows.reduce((sum, r) => sum + r.criterion.weight, 0);
  const overall = average(measured);
  const rows = base.quality!.map(row => {
    const relevant = measured.filter(r => RUBRIC_SIGNALS[row.stat].includes(r.criterion.signal));
    // Half overall grade makes teacher weights matter even when a stat has just one mapped criterion.
    const score = relevant.length ? (overall + average(relevant)) / 2 : overall;
    // Narrower than default ranges: even the product of vitality, damage, speed, recovery and weakness
    // at opposite extremes is <2.5x. A rubric cannot turn the classroom into an unwinnable stat gap.
    const value = ({ hp: 11 + Math.round(score * 2), armor: 4 + Math.round(score * 2), speed: 98 + score * 10,
      damage: 0.98 + score * 0.14, energy: 160 + Math.round(score * 40), regen: 5 + score * 2,
      weakness: (1 - score) * 0.1 })[row.stat];
    const evidence = (relevant.length ? relevant : measured).map(r => `${r.criterion.name} (${(r.criterion.weight / measured.reduce((s, r) => s + r.criterion.weight, 0) * 100).toFixed(0)}%): ${r.result.evidence}`).join('; ');
    return { ...row, value, grade: grade(score), signal: `${scoring.rubric!.title}: weighted grade ${(overall * 100).toFixed(0)}%; ${evidence}`,
      tip: (relevant.length ? relevant : measured).find(r => r.result.tip)?.result.tip ?? row.tip };
  });
  return withQuality({ ...base, rubricQuality: { title: scoring.rubric.title, rows } }, rows);
}

export const qualityValue = (p: PlayerKit, stat: QualityStat['stat'], fallback: number) => p.quality?.find(q => q.stat === stat)?.value ?? fallback;
