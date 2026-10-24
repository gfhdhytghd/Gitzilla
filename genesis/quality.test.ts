import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PlayerKit, QualityStat, RepoProfile } from '../shared/types.ts';
import { playerKitFromProfile } from '../sim/kits.ts';
import { buildGenesis, heroBudget, MAX_GENESIS_BYTES, qualityTrace } from './index.ts';

const folder = new URL('../data/fallback/', import.meta.url);
const profiles = readdirSync(folder).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(new URL(f, folder), 'utf8')) as RepoProfile);

// Supplied grades/values model the sim-owned contract, not a second scoring rule.
function reportCard(p: RepoProfile): QualityStat[] {
  const count = p.dna?.counts;
  return [
    { stat: 'hp', grade: 'B', value: 18, signal: `${p.totalLoc.toLocaleString('en-US')} LOC`, tip: 'Add a README explaining the project.' },
    { stat: 'armor', grade: 'C', value: 7, signal: `tests ${Math.round(p.testRatio * 100)}% of files`, tip: `Add tests for ${p.heart}.` },
    { stat: 'speed', grade: 'A', value: 110, signal: `${p.components.length} modules · ${p.maxDepth} layers deep`, tip: 'Reduce imports between modules.' },
    { stat: 'damage', grade: 'B', value: 1.25, signal: `${count?.functions ?? 0} functions · ${p.totalFiles} files`, tip: 'Split giant functions into small helpers.' },
    { stat: 'energy', grade: 'C', value: 185, signal: `${count?.comments ?? 0} comments`, tip: 'Document why the core algorithm works.' },
    { stat: 'regen', grade: 'D', value: 0.125, signal: `${p.readme?.length ?? 0} README characters`, tip: 'Add setup and usage examples.' },
    { stat: 'weakness', grade: 'F', value: 0.35, signal: `${p.cycles.length} cycles · ${count?.todo ?? 0} TODOs`, tip: 'Break dependency cycles and resolve TODOs.' },
  ];
}

describe('classroom PvP Genesis report card', () => {
  it.each(profiles.map(p => [p.slug, p] as const))('%s leads with earned stats, then concrete improvement tips', (_, p) => {
    const quality = reportCard(p);
    const kit: PlayerKit = { ...playerKitFromProfile(p), quality };
    const before = JSON.stringify({ p, kit });
    const g = buildGenesis(p, kit, 'hero');
    expect(g.trace.slice(0, 4).map(t => t.ref)).toEqual(['quality:armor', 'quality:speed', 'quality:damage', 'quality:weakness']);
    expect(g.trace.slice(0, 7).every(t => t.part === 'stats' && t.ref?.startsWith('quality:'))).toBe(true);
    for (const q of quality) {
      const row = g.trace.find(t => t.ref === `quality:${q.stat}`)!;
      expect(row.from).toBe(q.signal);
      expect(row.to).toBe(`${q.stat} ${q.grade} · ${q.value}`);
      const tip = g.trace.find(t => t.ref === `quality-tip:${q.stat}`)!;
      expect(tip.from).toBe(`Improve ${q.stat} · ${q.grade}`);
      expect(q.tip.startsWith(tip.to.replace(/…$/, ''))).toBe(true);
    }
    expect(g.trace.every(t => t.from.length <= 40 && t.to.length <= 40)).toBe(true);
    expect(g.trace.some(t => ['limb', 'heart', 'weakpoint', 'eyes', 'minions', 'attack'].includes(t.part))).toBe(false);
    expect(g.trace.some(t => /5 points|fair fight|budget points/.test(`${t.from} ${t.to}`))).toBe(false);
    expect(g.budget).toEqual([]); expect(heroBudget(kit)).toEqual([]);
    expect(g.metrics.loc).toBe(p.totalLoc);
    expect(Buffer.byteLength(JSON.stringify(g))).toBeLessThanOrEqual(MAX_GENESIS_BYTES);
    expect(JSON.stringify({ p, kit })).toBe(before);
    g.trace[0].from = 'mutated';
    expect(JSON.stringify({ p, kit })).toBe(before);
  });

  it('uses the supplied grade and exact fractional value without inferring strength from size', () => {
    const q: QualityStat = { stat: 'weakness', grade: 'A', value: 0, signal: '0 cycles · 0 TODOs', tip: 'Keep imports acyclic.' };
    expect(qualityTrace([q])[0]).toEqual({ part: 'stats', from: '0 cycles · 0 TODOs', to: 'weakness A · 0', ref: 'quality:weakness' });
    expect(qualityTrace([{ ...q, stat: 'regen', grade: 'D', value: 0.125 }])[0].to).toBe('regen D · 0.125');
  });

  it('does not invent missing report-card rows or tips, or display a battle budget', () => {
    const p = profiles[0];
    const kit = { ...playerKitFromProfile(p), quality: [] };
    const g = buildGenesis(p, kit, 'hero');
    expect(g.budget).toEqual([]);
    expect(g.trace.some(t => t.part === 'stats')).toBe(false);
    expect(qualityTrace([{ stat: 'armor', value: 0, grade: 'F', signal: 'No tests found', tip: '' }])).toHaveLength(1);
    const { quality, ...battle } = kit;
    expect(buildGenesis(p, battle, 'hero').budget.reduce((s, b) => s + b.value, 0)).toBe(5);
  });

  it('filters source credentials before clipping report-card signals and tips', () => {
    const token = `ghp_${'x'.repeat(36)}`;
    const q: QualityStat = { stat: 'armor', grade: 'F', value: 1, signal: `tests: ${token}`, tip: 'const password = "hunter42";' };
    const g = buildGenesis(profiles[0], { ...playerKitFromProfile(profiles[0]), quality: [q] }, 'hero');
    const json = JSON.stringify(g);
    expect(json).not.toContain(token); expect(json).not.toContain('hunter42');
    expect(g.trace[0].from).toBe('[source omitted]');
    expect(g.trace[1].to).toBe('[source omitted]');
  });
});
