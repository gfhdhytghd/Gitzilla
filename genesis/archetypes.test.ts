import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BossArchetype, BossKit, RepoProfile } from '../shared/types.ts';
import { bossKitFromProfile, playerKitFromProfile } from '../sim/kits.ts';
import { bossArchetypeTrace, buildGenesis, MAX_GENESIS_BYTES } from './index.ts';

const profile: RepoProfile = JSON.parse(readFileSync(new URL('../data/fallback/burntsushi__ripgrep.json', import.meta.url), 'utf8'));

describe('why this boss archetype', () => {
  it.each(['kaiju', 'hydra', 'mecha', 'abyssal'] as BossArchetype[])('explains final %s identity with real facts, without rerolling the kit', archetype => {
    const p = structuredClone(profile);
    p.cycles = Array.from({ length: 4 }, () => ['crates/core', 'crates/ignore']);
    p.components[0].fanOut = 7;
    p.maxDepth = 6;
    const kit: BossKit = { ...bossKitFromProfile(p, 4), archetype };
    const before = JSON.stringify({ p, kit });
    const g = buildGenesis(p, kit, 'boss');
    const row = g.trace[2];
    expect(row).toEqual(bossArchetypeTrace(p, kit));
    expect(row).toMatchObject({ part: 'class', ref: 'archetype', to: expect.stringMatching(new RegExp(archetype, 'i')) });
    expect(row.from.length).toBeLessThanOrEqual(40); expect(row.to.length).toBeLessThanOrEqual(40);
    expect(row.from).not.toMatch(/seed|>=|<=|#[0-9a-f]{6}/i);
    if (archetype === 'kaiju') expect(row.from).toBe(`${p.components.length} modules · 4 cycles`);
    if (archetype === 'hydra') expect(row.from).toBe('4 import cycles');
    if (archetype === 'mecha') expect(row.from).toBe('Rust · 6 import layers');
    if (archetype === 'abyssal') expect(row.from).toContain('50,796 LOC');
    expect(g.budget.reduce((s, b) => s + b.value, 0)).toBeCloseTo(100);
    expect(Buffer.byteLength(JSON.stringify(g))).toBeLessThanOrEqual(MAX_GENESIS_BYTES);
    expect(g.trace.filter(t => t.ref === 'archetype')).toHaveLength(1);
    expect(JSON.stringify({ p, kit })).toBe(before);
  });

  it('uses the precise sim-owned winning reason for every selection branch', () => {
    const p = structuredClone(profile);
    p.primaryLanguage = 'TypeScript'; p.totalLoc = 10000; p.ageDays = 1000; p.maxDepth = 1; p.cycles = [];
    p.components.forEach(c => c.fanOut = 0);
    Object.assign(p.dna!.counts, { todo: 0, fixme: 0, hack: 0 });
    const cases: [Partial<RepoProfile>, BossArchetype, string][] = [
      [{}, 'kaiju', `${p.components.length} components, 0 cycles, depth 1`],
      [{ cycles: [['a', 'b'], ['c', 'd']] }, 'hydra', '2 import cycles'],
      [{ components: [{ ...p.components[0], fanOut: 6 }] }, 'hydra', 'fan-out 6'],
      [{ primaryLanguage: 'Rust', maxDepth: 3 }, 'mecha', 'Rust · import depth 3 · 10,000 LOC'],
      [{ totalLoc: 150000 }, 'abyssal', '150,000 LOC'],
      [{ ageDays: 6000 }, 'abyssal', '6,000 days old'],
      [{ dna: { ...p.dna!, counts: { ...p.dna!.counts, todo: 128 } } }, 'abyssal', '128 debt marks'],
    ];
    for (const [overrides, archetype, from] of cases) {
      const source = { ...p, ...overrides };
      const kit = bossKitFromProfile(source, 4);
      expect(kit.archetype).toBe(archetype);
      expect(bossArchetypeTrace(source, kit).from).toBe(from);
    }
  });

  it('keeps arbitrary design body changes from changing the authoritative archetype', () => {
    const kit = { ...bossKitFromProfile(profile, 4), archetype: 'hydra' as const };
    const before = bossArchetypeTrace(profile, kit);
    const changed = structuredClone(kit);
    Object.assign(changed, { design: { body: 'blob' } });
    expect(bossArchetypeTrace(profile, changed)).toEqual(before);
  });

  it('filters credentials from the sim reason before caption clipping', () => {
    const token = `ghp_${'x'.repeat(36)}`;
    const p = { ...profile, primaryLanguage: `Rust ${token}` };
    const kit = { ...bossKitFromProfile(p, 4), archetype: 'mecha' as const };
    const row = bossArchetypeTrace(p, kit);
    expect(row.from).toBe('[source omitted]'); expect(JSON.stringify(row)).not.toContain(token);
  });

  it('keeps boss archetype captions out of classroom PvP report cards', () => {
    const kit = playerKitFromProfile(profile, { mode: 'edu' });
    const g = buildGenesis(profile, kit, 'hero');
    expect(g.trace.some(t => t.ref === 'archetype')).toBe(false);
    expect(g.trace[0].ref).toBe('quality:armor');
  });
});
