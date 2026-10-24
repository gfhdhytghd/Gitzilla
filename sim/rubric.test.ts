import { describe, expect, it } from 'vitest';
import type { CriterionResult, Rubric } from '../shared/types.ts';
import { defaultRubric, parseRubric, scoreRepo } from '../rubric/index.ts';
import { qualityFromRubric, asClassroomKit, qualityValue } from './quality.ts';
import { playerKitFromProfile } from './kits.ts';
import { loadBalanceProfiles } from './bots.ts';
import { createMatch } from './match.ts';

const rubric: Rubric = { source: 'doc', title: 'CS project', criteria: [
  { id: 'test', name: 'Tests', signal: 'tests', weight: 0.8, description: 'Focused tests' },
  { id: 'doc', name: 'README', signal: 'readme', weight: 0.2, description: 'Run instructions' },
] };
const results: CriterionResult[] = [
  { criterionId: 'test', score: 1, evidence: 'Tests: 12 of 40 files', tip: 'Cover the error branch in app.py.' },
  { criterionId: 'doc', score: 0, evidence: 'README not found', tip: 'Add run instructions to README.md.' },
];
const kit = () => playerKitFromProfile(loadBalanceProfiles()[0]);

describe('teacher rubric quality conversion', () => {
  it('preserves exact default classroom stats for every fallback, regardless of supplied scores', () => {
    for (const p of loadBalanceProfiles()) {
      const original = playerKitFromProfile(p), snapshot = structuredClone(original);
      expect(qualityFromRubric(original, { rubric: defaultRubric(), results: scoreRepo(p, defaultRubric()) })).toEqual(asClassroomKit(original));
      expect(original).toEqual(snapshot);
    }
  });
  it('uses actual evidence, mapped signals and normalized teacher weights without changing hero identity', () => {
    const original = kit(), weighted = qualityFromRubric(original, results, rubric);
    const reversed = qualityFromRubric(original, { rubric: { ...rubric, criteria: rubric.criteria.map(c => ({ ...c, weight: 1 - c.weight })) }, results });
    expect(weighted.maxArmor).toBeGreaterThan(reversed.maxArmor);
    expect(qualityValue(weighted, 'regen', 0)).toBeGreaterThan(qualityValue(reversed, 'regen', 0));
    expect(qualityValue(weighted, 'armor', 0)).toBeGreaterThan(qualityValue(weighted, 'weakness', 0));
    expect(weighted.quality!.find(q => q.stat === 'armor')!.signal).toContain('12 of 40');
    expect(weighted.quality!.find(q => q.stat === 'energy')!.tip).toContain('README.md');
    expect(weighted.code).toEqual(original.code); expect(weighted.design).toEqual(original.design);
    expect([weighted.weapon, weighted.skill, weighted.seed]).toEqual([original.weapon, original.skill, original.seed]);
  });
  it('caps opposite extremes, including combined combat advantages, below 2.5x', () => {
    const make = (score: number) => qualityFromRubric(kit(), results.map(r => ({ ...r, score })), rubric);
    const low = make(0), high = make(1);
    for (const stat of ['hp', 'armor', 'speed', 'damage', 'energy', 'regen'] as const)
      expect(qualityValue(high, stat, 0) / qualityValue(low, stat, 1)).toBeLessThanOrEqual(2.5);
    const combined = (high.maxHp + high.maxArmor) / (low.maxHp + low.maxArmor) * high.damageMul / low.damageMul *
      high.speed / low.speed * Math.max(high.maxEnergy / low.maxEnergy, qualityValue(high, 'regen', 1) / qualityValue(low, 'regen', 1)) *
      (1 + qualityValue(low, 'weakness', 0)) / (1 + qualityValue(high, 'weakness', 0));
    expect(combined).toBeLessThan(2.5);
    expect(make(-20).quality).toEqual(low.quality); expect(make(20).quality).toEqual(high.quality);
  });
  it('survives classroom conversion and match creation; reapplying defaults clears prior custom weighting', () => {
    const weighted = qualityFromRubric(kit(), { rubric, results });
    expect(asClassroomKit(weighted)).toEqual(weighted);
    const match = createMatch([{ id: 'one', name: 'One', kit: weighted }, { id: 'two', name: 'Two', kit: kit() }], null, { mode: 'edu' });
    expect(match.snapshot().players[0].kit).toEqual(weighted);
    expect(qualityFromRubric(weighted, { rubric: defaultRubric(), results })).toEqual(asClassroomKit(kit()));
  });
  it('ignores missing/unknown/nonfinite/zero-weight grades and never fabricates evidence', () => {
    const original = kit();
    expect(qualityFromRubric(original, results)).toEqual(asClassroomKit(original));
    expect(qualityFromRubric(original, [], rubric)).toEqual(asClassroomKit(original));
    expect(qualityFromRubric(original, [{ criterionId: 'unknown', score: 1, evidence: 'no' }, ...results.map(r => ({ ...r, score: NaN }))], rubric)).toEqual(asClassroomKit(original));
    expect(qualityFromRubric(original, results, { ...rubric, criteria: rubric.criteria.map(c => ({ ...c, weight: 0 })) })).toEqual(asClassroomKit(original));
    const custom = qualityFromRubric(original, [results[0]], rubric);
    expect(custom.quality!.every(q => !q.signal.includes('README not found'))).toBe(true);
  });
  it('accepts real parsed rubric scores for all 15 bundled profiles', () => {
    const parsed = parseRubric('# Web course\n- Tests (50%): test files at least 20%\n- Documentation (30%): README instructions\n- Modularity (20%): low coupling');
    for (const p of loadBalanceProfiles()) {
      const k = qualityFromRubric(playerKitFromProfile(p), { rubric: parsed, results: scoreRepo(p, parsed) });
      expect(k.rubricQuality).toBeDefined(); expect(k.quality).toHaveLength(7);
      expect(k.quality!.every(q => Number.isFinite(q.value))).toBe(true);
    }
  });
});
