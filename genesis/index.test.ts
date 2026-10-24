import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BossArchetype, BossAttackKind, RepoProfile } from '../shared/types.ts';
import { bossKitFromProfile, playerKitFromProfile } from '../sim/kits.ts';
import { applyBossDesign, applyHeroDesign } from '../design/index.ts';
import { fallbackBoss, fallbackHero } from '../design/fallback.ts';
import { buildGenesis, MAX_GENESIS_BYTES } from './index.ts';

const folder = new URL('../data/fallback/', import.meta.url);
const profiles = readdirSync(folder).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(new URL(f, folder), 'utf8')) as RepoProfile);
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

describe('Genesis fallback stories', () => {
  it.each(profiles.map(p => [p.slug, p] as const))('%s carries real data, all mappings and equal budgets', (_, p) => {
    const before = JSON.stringify(p);
    const hero = playerKitFromProfile(p);
    const boss = bossKitFromProfile(p, 4);
    const heroBefore = JSON.stringify(hero), bossBefore = JSON.stringify(boss);
    const h = buildGenesis(p, hero, 'hero'), b = buildGenesis(p, boss, 'boss');
    expect(h.metrics).toEqual({ files: p.totalFiles, loc: p.totalLoc, functions: p.dna?.counts.functions ?? 0, todos: p.dna?.counts.todo ?? 0, contributors: p.contributors, commits: p.commits, ageDays: p.ageDays, testRatio: p.testRatio });
    expect(b.components).toEqual(p.components.map(({ name, loc, files }) => ({ name, loc, files })));
    expect(b.edges).toEqual(p.edges);
    expect(b.cycles).toEqual(p.cycles);
    expect(b.heart).toBe(p.heart);
    expect(b.heartFanIn).toBe(p.heartFanIn);
    for (const g of [h, b]) {
      expect(bytes(g)).toBeLessThanOrEqual(MAX_GENESIS_BYTES);
      expect(g.sampleFiles.length).toBeLessThanOrEqual(40);
      const paths = [...(p.tree ?? []), ...(p.dna?.bigFiles.map(f => f.path) ?? []), ...(p.dna?.snippets.map(s => s.file) ?? []), ...(p.dna?.todos.map(t => t.file) ?? []), p.heart];
      expect(g.sampleFiles.every(path => paths.includes(path))).toBe(true);
      expect(g.snippets.every(s => [...(p.dna?.heartLines ?? []), ...(p.dna?.snippets.map(s => s.code) ?? [])].map(line => line.trim()).includes(s))).toBe(true);
      expect(g.trace.every(step => step.from && step.to)).toBe(true);
      for (const step of g.trace) {
        expect(step.from.length).toBeLessThanOrEqual(40);
        expect(step.to.length).toBeLessThanOrEqual(40);
        expect(`${step.from} ${step.to}`).not.toMatch(/seed|weight=|shape=|>=|<=|#[0-9a-f]{6}\b/i);
      }
      expect(g.trace.at(-1)?.part).toBe('name');
    }
    expect(h.trace.slice(0, 4).map(t => t.part)).toEqual(['weapon', 'skill', 'glyphs', 'name']);
    const bossOpening = ['limb', 'heart', 'class', boss.limbs.some(l => l.weakPoint) ? 'weakpoint' : 'eyes', 'attack'];
    expect(b.trace.slice(0, bossOpening.length).map(t => t.part)).toEqual(bossOpening);
    expect(b.trace[2]).toMatchObject({ ref: 'archetype', to: expect.stringMatching(new RegExp(boss.archetype, 'i')) });
    expect(h.trace.find(t => t.part === 'weapon')?.to).toBe(hero.code?.weapon?.name ?? hero.weapon);
    expect(h.trace.find(t => t.part === 'skill')?.to).toBe(`skill: ${hero.skill}`);
    expect(h.budget.reduce((s, b) => s + b.value, 0)).toBeCloseTo(5);
    expect(b.budget.reduce((s, b) => s + b.value, 0)).toBeCloseTo(100);
    expect(b.trace.filter(t => t.part === 'attack').map(t => t.ref)).toEqual(boss.attacks.map(a => a.id));
    expect(b.trace.filter(t => t.part === 'limb' && t.ref !== 'dependencies').map(t => t.ref)).toEqual(boss.limbs.map(l => l.id));
    for (const limb of boss.limbs) {
      expect(b.trace.find(t => t.part === 'weakpoint' && t.ref === limb.id)?.to).toBe(limb.weakPoint ? 'Glowing weak point · 1.5× damage' : 'Armored limb');
    }
    expect(buildGenesis(p, hero, 'hero')).toEqual(h);
    expect(JSON.stringify(p)).toBe(before); expect(JSON.stringify(hero)).toBe(heroBefore); expect(JSON.stringify(boss)).toBe(bossBefore);
    b.edges[0]?.splice(0, 1, 999); b.components[0].name = 'mutated'; b.cycles[0]?.push('mutated');
    expect(JSON.stringify(p)).toBe(before);
  });

  it('uses final design names, palette, eyes, theme and weapon without changing budgets', () => {
    const p = profiles[0];
    const baseHero = playerKitFromProfile(p), baseBoss = bossKitFromProfile(p, 4);
    const hd = { ...fallbackHero(p, baseHero), title: 'Actual Hero', weaponName: 'unsafe { blast() }' };
    const bd = { ...fallbackBoss(p, baseBoss), name: 'Actual Boss', eyes: 7, theme: 'web' as const, attackNames: Object.fromEntries(baseBoss.attacks.map(a => [a.id, 'Actual Attack'])) };
    const h = buildGenesis(p, applyHeroDesign(baseHero, hd), 'hero');
    const b = buildGenesis(p, applyBossDesign(baseBoss, bd), 'boss');
    expect(h.trace.find(t => t.part === 'weapon')?.to).toBe('unsafe { blast() }');
    expect(h.trace.at(-1)?.to).toBe('name: Actual Hero');
    expect(b.trace.at(-1)?.to).toBe('name: Actual Boss');
    expect(b.trace.find(t => t.part === 'eyes')?.to).toContain('7');
    expect(b.trace.find(t => t.part === 'theme')?.to).toBe('arena: web');
    expect(b.trace.filter(t => t.part === 'attack').every(t => t.to.includes('Actual Attack'))).toBe(true);
    expect(h.budget).toEqual(buildGenesis(p, baseHero, 'hero').budget);
    expect(b.budget).toEqual(buildGenesis(p, baseBoss, 'boss').budget);
  });

  it('shows human numbers and keeps each transformation readable on phones', () => {
    const p = structuredClone(profiles[0]);
    p.primaryLanguage = 'Rust'; p.languages = { Rust: 9500, Python: 500 };
    p.components[0].loc = 12485; p.heart = 'src/ignore/gitignore.rs'; p.heartFanIn = 41; p.cycles = [];
    const heroKit = playerKitFromProfile(p);
    const hero = buildGenesis(p, heroKit, 'hero');
    const kit = bossKitFromProfile(p, 4); kit.limbs[0].maxHp = 1703;
    const design = fallbackBoss(p, kit); design.limbNames[kit.limbs[0].id] = 'Core Claw';
    const boss = buildGenesis(p, applyBossDesign(kit, design), 'boss');
    expect(hero.trace[0].from).toContain('Rust · 95%');
    expect(hero.trace[0].to).toBe(heroKit.code?.weapon?.name);
    expect(`${hero.trace[0].from} → ${hero.trace[0].to}`.length).toBeLessThanOrEqual(40);
    expect(boss.trace[0]).toMatchObject({ from: `${p.components[0].name} · 12,485 LOC`, to: 'Core Claw · 1,703 HP' });
    expect(boss.trace[1]).toMatchObject({ from: '0 cycles · heart fan-in 41', to: 'heart: gitignore.rs' });
    const bossOpening = ['limb', 'heart', 'class', 'eyes', 'attack'];
    expect(boss.trace.slice(0, bossOpening.length).map(t => t.part)).toEqual(bossOpening);
    for (const profile of profiles) {
      const base = bossKitFromProfile(profile, 4);
      const g = buildGenesis(profile, applyBossDesign(base, fallbackBoss(profile, base)), 'boss');
      expect(g.trace.every(t => t.from.length <= 40 && t.to.length <= 40)).toBe(true);
    }
  });

  it('keeps complete 24-character code names and shortens the source caption to fit', () => {
    const p = structuredClone(profiles[0]);
    p.primaryLanguage = 'Go'; p.languages = { Go: 9500, Rust: 500 };
    const kit = playerKitFromProfile(p);
    for (const name of ['for { go serveLonger() }', 'unsafe { allocateBuf() }']) {
      expect(name).toHaveLength(24);
      kit.code!.weapon!.name = name;
      const row = buildGenesis(p, kit, 'hero').trace[0];
      expect(row).toEqual({ part: 'weapon', from: 'Go · 95%', to: name });
      expect(`${row.from} → ${row.to}`.length).toBeLessThanOrEqual(40);
      expect(row.to).not.toContain('…');
    }
    p.primaryLanguage = 'Jupyter Notebook'; p.languages = { 'Jupyter Notebook': 9500, Rust: 500 };
    const row = buildGenesis(p, kit, 'hero').trace[0];
    expect(row.to).toBe(kit.code!.weapon!.name);
    expect(row.from).toContain('95%');
    expect(`${row.from} → ${row.to}`.length).toBeLessThanOrEqual(40);
  });

  it('handles absent DNA/tree without inventing files, functions or source', () => {
    const p = structuredClone(profiles[0]); delete p.dna; delete p.tree;
    const h = buildGenesis(p, playerKitFromProfile(p), 'hero');
    expect(h.sampleFiles).toEqual([p.heart]); expect(h.snippets).toEqual([]);
    expect(h.metrics.functions).toBe(0); expect(h.metrics.todos).toBe(0);
    expect(h.trace.find(t => t.part === 'glyphs')?.from).toBe(`${p.primaryLanguage} syntax`);
    expect(h.trace.some(t => t.part === 'cape')).toBe(false);
  });

  it('explains skill precedence and all five shape allocations against the sim', () => {
    const p = structuredClone(profiles[0]);
    p.components = Array.from({ length: 4 }, (_, i) => ({ name: `src/${i}`, loc: 100, files: 5, fanIn: 1, fanOut: 0 }));
    const cases = [
      { testRatio: 0.18, cycles: [['src/0', 'src/1'], ['src/2', 'src/3']], contributors: 99, skill: 'hotfix' },
      { testRatio: 0, cycles: [['src/0', 'src/1'], ['src/2', 'src/3']], contributors: 99, skill: 'rollback' },
      { testRatio: 0, cycles: [], contributors: 99, skill: 'firewall' },
    ];
    for (const c of cases) {
      Object.assign(p, c);
      const g = buildGenesis(p, playerKitFromProfile(p), 'hero');
      expect(g.trace.find(t => t.part === 'skill')?.to).toBe(`skill: ${c.skill}`);
    }
    p.components = p.components.slice(0, 1);
    for (const contributors of [15, 14]) {
      p.contributors = contributors;
      expect(buildGenesis(p, playerKitFromProfile(p), 'hero').trace.find(t => t.part === 'skill')?.to).toBe(`skill: ${contributors === 15 ? 'fork' : 'overclock'}`);
    }
    const allocations = new Set<string>();
    for (let i = 0; i < 5; i++) {
      p.totalFiles = i;
      const g = buildGenesis(p, playerKitFromProfile(p), 'hero');
      expect(g.budget.reduce((s, b) => s + b.value, 0)).toBeCloseTo(5);
      allocations.add(JSON.stringify(g.budget));
    }
    expect(allocations.size).toBe(5);
  });

  it('explains all four preset decks with exact source slots, IDs and all eight kinds', () => {
    const p = structuredClone(profiles[0]);
    p.primaryLanguage = 'TypeScript'; p.totalLoc = 10000; p.ageDays = 1000;
    p.maxDepth = 5; p.heart = 'src/0/heart.ts';
    p.components = Array.from({ length: 8 }, (_, i) => ({ name: `src/${i}`, loc: 100, files: i === 2 ? 40 : 5, fanIn: 1, fanOut: i === 3 ? 5 : 0 }));
    p.cycles = [['src/4', 'src/5']];
    Object.assign(p.dna!.counts, { todo: 0, fixme: 0, hack: 0 });
    // This anatomy allocates two slots to component 0, then one to each other
    // component. Kinds follow the preset deck in order, regardless of fan-out.
    const slots = [[0, 0], [0, 1], ...Array.from({ length: 7 }, (_, i) => [i + 1, 0])];
    const cases: [BossArchetype, Partial<RepoProfile>, BossAttackKind[]][] = [
      ['kaiju', {}, ['laser', 'slam', 'fan', 'charge', 'ring']],
      ['hydra', { cycles: [...p.cycles, ['src/6', 'src/7']] }, ['laser', 'fan', 'charge', 'spiral']],
      ['mecha', { primaryLanguage: 'Rust' }, ['fan', 'charge', 'ring', 'laser', 'summon']],
      ['abyssal', { totalLoc: 150000 }, ['cascade', 'ring', 'slam', 'fan', 'charge']],
    ];
    const kinds = new Set<string>();
    for (const [archetype, overrides, deck] of cases) {
      for (const heart of ['src/0/heart.ts', 'elsewhere.ts']) {
        const source = { ...p, ...overrides, heart };
        const kit = bossKitFromProfile(source, 4), g = buildGenesis(source, kit, 'boss');
        expect(kit.archetype).toBe(archetype);
        const expected = slots.map(([component, slot], i) => ({
          id: `${component}-${deck[i % deck.length]}-${slot}`,
          kind: deck[i % deck.length], source: `src/${component}`,
        }));
        expect(kit.attacks.map(({ id, kind, source }) => ({ id, kind, source }))).toEqual(expected);
        const trace = g.trace.filter(t => t.part === 'attack');
        expect(trace.map(t => t.ref)).toEqual(expected.map(a => a.id));
        for (const [i, attack] of kit.attacks.entries()) {
          kinds.add(attack.kind);
          expect(trace[i].from).toBe(`${attack.source} · ${archetype[0].toUpperCase() + archetype.slice(1)} ${attack.kind}`);
          expect(attack.name.startsWith(trace[i].to.replace(/…$/, ''))).toBe(true);
          expect(trace[i].from).not.toMatch(/files|imports out|layers deep|dependency loop/);
          expect(attack.params.count).toBe(attack.kind === 'ring' ? 17 : attack.kind === 'spiral' ? 28 : attack.kind === 'summon' ? 3 : 7);
        }
        expect(kit.attacks.reduce((sum, a) => sum + a.params.threatShare, 0)).toBeCloseTo(1);
      }
    }
    expect([...kinds].sort()).toEqual(['cascade', 'charge', 'fan', 'laser', 'ring', 'slam', 'spiral', 'summon']);
  });

  it('does not leak credentials from source, paths, overrides or extra runtime fields', () => {
    const p = structuredClone(profiles[0]);
    const credential = `ghp_${'x'.repeat(36)}`;
    const assignment = 'const password = "hunter42";';
    p.tree = [`src/${credential}.ts`, 'src/safe.ts'];
    p.dna!.snippets = [{ file: 'src/safe.ts', line: 1, code: assignment }, { file: 'src/safe.ts', line: 2, code: `return "${credential}";` }];
    p.dna!.heartLines = [assignment]; p.dna!.tokens = [credential, '=>'];
    p.dna!.identifiers = [credential]; p.dna!.todos = [{ file: 'src/safe.ts', text: `TODO ${credential}` }];
    Object.assign(p, { token: credential, readme: assignment });
    for (const kind of ['hero', 'boss'] as const) {
      const kit = kind === 'hero' ? playerKitFromProfile(p) : bossKitFromProfile(p, 4);
      Object.assign(kit, { token: credential });
      const json = JSON.stringify(buildGenesis(p, kit, kind));
      expect(json).not.toContain(credential); expect(json).not.toContain('hunter42');
      expect(json).toContain('src/safe.ts');
    }
  });

  it('bounds long UTF-8 input without dropping limb/attack mapping steps', () => {
    const p = structuredClone(profiles[0]);
    p.tree = Array.from({ length: 120 }, (_, i) => `${'漢'.repeat(90)}/${i}.ts`);
    p.components.forEach((c, i) => c.name = `${'界'.repeat(80)}/${i}`);
    p.cycles = [p.components.map(c => c.name)];
    const kit = bossKitFromProfile(p, 4);
    kit.attacks.forEach(a => a.name = '魔'.repeat(200));
    const g = buildGenesis(p, kit, 'boss');
    expect(bytes(g)).toBeLessThanOrEqual(MAX_GENESIS_BYTES);
    expect(g.trace.filter(t => t.part === 'attack')).toHaveLength(kit.attacks.length);
    expect(g.trace.filter(t => t.part === 'limb' && t.ref !== 'dependencies')).toHaveLength(kit.limbs.length);
  });

  it('keeps boss allocation percentages equal across squad sizes, while reporting actual HP', () => {
    const p = profiles[0];
    const results = [1, 4, 8].map(n => {
      const kit = bossKitFromProfile(p, n), g = buildGenesis(p, kit, 'boss');
      expect(g.trace.find(t => t.part === 'stats')?.to).toContain(`${kit.maxHp.toLocaleString('en-US')} HP`);
      return g;
    });
    expect(results[0].budget).toEqual(results[1].budget);
    expect(results[1].budget).toEqual(results[2].budget);
  });
});
