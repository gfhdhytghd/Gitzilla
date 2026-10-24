import { describe, expect, it } from 'vitest';
import type { WeaponKind } from '../shared/types.ts';
import { ATTACK_FLAVOR, ATTACK_FLAVOR_POOLS, attackFlavorPicker, SKILL_FLAVOR, weaponCode } from './flavor.ts';
import { bossKitFromProfile, playerKitFromProfile } from './kits.ts';
import { reconcileCodeNames, type BossCode } from './code.ts';
import { BossAi } from './bossAi.ts';
import { createMatch } from './match.ts';
import { loadBalanceProfiles, syntheticProfile } from './bots.ts';
import ts from 'typescript';

describe('code weapon flavor', () => {
  it('covers every weapon with short, detached, deterministic visual metadata', () => {
    for (const kind of ['blaster', 'smg', 'shotgun', 'cannon', 'staff', 'laser', 'blade'] as WeaponKind[]) {
      const a = weaponCode(kind, 'Unknown', 17, ['real']);
      expect(a).toEqual(weaponCode(kind, 'Unknown', 17, ['real']));
      expect(a.name.length).toBeLessThanOrEqual(24);
      expect(a.projectiles.length).toBeGreaterThan(0); expect(a.projectiles.length).toBeLessThanOrEqual(4);
      expect(a.projectiles.every(glyph => glyph.length > 0 && glyph.length <= 8)).toBe(true);
      expect(a.projectiles).toContain('real'); expect(a.muzzle).toBeTruthy(); expect(a.impact).toBeTruthy();
      a.projectiles.push('mutated'); expect(weaponCode(kind, 'Unknown', 17).projectiles).not.toContain('mutated');
    }
  });
  it.each([
    ['TypeScript', 'blaster', /await|Blaster|emit/], ['JavaScript', 'blaster', /await|then|emit/],
    ['Rust', 'cannon', /unsafe|blast|alloc/], ['Go', 'smg', /for|go/],
    ['C++', 'shotgun', /std::|Burst|scatter/], ['Python', 'staff', /yield|lambda|next/],
    ['Java', 'laser', /stream|map|trace/], ['C#', 'laser', /Select|select/], ['PHP', 'blade', /unset|exit|die/],
    ['Ruby', 'blaster', /puts|then|fire/], ['Kotlin', 'smg', /launch|repeat/], ['Haskell', 'staff', /fmap|cast/],
    ['Zig', 'cannon', /comptime|@as|blast/], ['SQL', 'laser', /^SELECT/], ['Lua', 'blade', /nil|remove/],
  ])('gives %s a language-specific code expression', (language, kind, pattern) => {
    const flavor = weaponCode(kind as WeaponKind, language as string, 1, [], ['route']);
    expect(flavor.name).toMatch(pattern as RegExp); expect(flavor.name).toContain('route');
    expect(flavor).toEqual(weaponCode(kind as WeaponKind, (language as string).toLowerCase(), 1, [], ['route']));
  });
  it('uses real identifiers and never repeats across all 15 fallback repositories', () => {
    const profiles = loadBalanceProfiles(), names = new Set<string>();
    expect(profiles).toHaveLength(15);
    for (const p of profiles) {
      const name = playerKitFromProfile(p).code!.weapon!.name;
      const symbols = [...p.dna!.identifiers, ...Object.values(p.dna!.componentSymbols).flat()];
      expect(symbols.some(id => name.includes(id))).toBe(true);
      expect(name.length).toBeLessThanOrEqual(24); expect(name).not.toMatch(/\b(Pistol|Blaster|SMG|Shotgun|Cannon|Staff|Beam|Katana|Saber)\s*$/);
      expect(names.has(name)).toBe(false); names.add(name);
    }
  });
  it('varies complete expressions by seed for every weapon/language without losing the repo identifier', () => {
    const languages = ['TypeScript', 'JavaScript', 'Go', 'C', 'C++', 'Rust', 'Python', 'Jupyter Notebook', 'Java', 'Kotlin', 'C#', 'Ruby', 'PHP', 'Lua', 'R', 'Julia', 'Zig', 'Haskell', 'Lisp', 'SQL'];
    for (const language of languages) for (const kind of ['blaster', 'smg', 'shotgun', 'cannon', 'staff', 'laser', 'blade'] as const) {
      const names = new Set<string>();
      for (let seed = 0; seed < 12; seed++) {
        const w = weaponCode(kind, language, seed, [], ['route']); names.add(w.name);
        expect(w.name).toContain('route'); expect(w.name.length).toBeLessThanOrEqual(24);
        expect(w.name).not.toContain('{id}'); expect(w.name).not.toContain('…');
        expect(w.projectiles.every(g => g.length <= 8)).toBe(true);
        expect(w.projectiles).toContain('route'); expect(w.muzzle).toBeTruthy(); expect(w.impact).toBeTruthy();
      }
      expect(names.size, `${language}/${kind}`).toBeGreaterThanOrEqual(3);
    }
  });
  it('fits a shorter whole template or another real identifier instead of clipping syntax', () => {
    const long = 'extremelyLongRepositoryFunctionIdentifier';
    for (const language of ['JavaScript', 'Python', 'Rust', 'C', 'Go']) {
      for (let seed = 0; seed < 8; seed++) {
        const w = weaponCode('blaster', language, seed, [], [long, 'route']);
        expect(w.name).toContain('route'); expect(w.name).not.toContain('extremely'); expect(w.name.length).toBeLessThanOrEqual(24);
      }
    }
    expect(weaponCode('blaster', 'JavaScript', 1, [], ['$router']).name).toContain('$router');
    const w = weaponCode('staff', 'Python', 0, [], ['class', 'for', 'app']); expect(w.name).toContain('app');
    expect(weaponCode('blade', 'Ruby', 0, [], ['dispatch!']).name).toContain('dispatch!');
  });
  it('keeps missing-source fallbacks complete, deterministic and short for all kinds', () => {
    for (const language of ['SQL', 'Lisp', 'Haskell', 'Unknown']) for (const kind of ['blaster', 'smg', 'shotgun', 'cannon', 'staff', 'laser', 'blade'] as const) {
      const w = weaponCode(kind, language, 0xffffffff, [], ['not a symbol', 'x'.repeat(100)]);
      expect(w.name.length).toBeLessThanOrEqual(24); expect(w.name).not.toContain('not a symbol');
      expect(w).toEqual(weaponCode(kind, language, 0xffffffff, [], ['not a symbol', 'x'.repeat(100)]));
    }
  });
  it('parses generated JS/TS expressions without executing them', () => {
    for (const language of ['JavaScript', 'TypeScript']) for (let seed = 0; seed < 24; seed++) {
      const name = weaponCode('blaster', language, seed, [], ['render']).name;
      const source = ts.createSourceFile('weapon.ts', `async function weapon(){ return (${name}); }`, ts.ScriptTarget.Latest, true, language === 'JavaScript' ? ts.ScriptKind.JS : ts.ScriptKind.TS);
      expect((source as typeof source & { parseDiagnostics: unknown[] }).parseDiagnostics).toEqual([]);
    }
  });
  it('fills all real fallback kits while preserving the existing weapon and stat budget', () => {
    for (const p of loadBalanceProfiles()) {
      const kit = playerKitFromProfile(p);
      expect(kit.code?.weapon?.name).toBeTruthy();
      const budget = (kit.maxHp - 5) + (kit.maxArmor - 3) + (kit.maxEnergy - 150) / 35 + (kit.speed - 77) / 8 + (kit.damageMul - 0.9) / 0.1;
      expect(budget).toBeCloseTo(5);
    }
    const p = syntheticProfile(1); p.primaryLanguage = 'Rust';
    expect(playerKitFromProfile(p).weapon).toBe('cannon');
    expect(Object.keys(SKILL_FLAVOR)).toHaveLength(5); expect(Object.keys(ATTACK_FLAVOR)).toHaveLength(8);
    expect(ATTACK_FLAVOR.cascade).toBe('Merge Conflict');
  });
  it('never repeats real attack identifiers, including heart patterns, or limb suffix patterns', () => {
    for (const p of loadBalanceProfiles()) {
      const kit = bossKitFromProfile(p, 4), code = kit.code as BossCode;
      const symbols = Object.values(code.attackSymbols);
      expect(kit.attacks.every(a => code.attackSymbols[a.id] && a.name.startsWith(code.attackSymbols[a.id]))).toBe(true);
      expect(new Set(symbols.map(s => s.toLowerCase())).size).toBe(symbols.length);
      expect(symbols.every(s => p.dna!.identifiers.concat(Object.values(p.dna!.componentSymbols).flat()).some(raw => `${raw.replace(/\(.*$/, '').slice(0, 40)}()` === s))).toBe(true);
      const names = Object.values(code.limbNames);
      expect(new Set(names.map(n => n.split(' ').at(-1))).size).toBe(kit.limbs.length);
      const state = createMatch([{ id: 'a', name: 'A', kit: playerKitFromProfile(p) }], kit).snapshot();
      state.boss.limbs.forEach(l => { l.broken = true; });
      new BossAi(1, 4).step(3, state.boss, state.players);
      for (const attack of state.boss.kit.attacks.filter(a => a.source === 'heart')) expect(attack.name.startsWith(code.attackSymbols[attack.id])).toBe(true);
    }
  });
  it('repairs repeated first-symbol names from a later design override without touching stats or the input kit', () => {
    const p = loadBalanceProfiles().find(p => p.slug === 'pallets/flask')!, kit = bossKitFromProfile(p, 4);
    kit.attacks.forEach(a => { a.name = `app() ${a.kind}`; });
    const state = createMatch([{ id: 'a', name: 'A', kit: playerKitFromProfile(p) }], kit).snapshot();
    const names = state.boss.kit.attacks.map(a => a.name.match(/^(.+?\(\))/)![1]);
    expect(new Set(names).size).toBe(names.length);
    expect(kit.attacks.every(a => a.name.startsWith('app()'))).toBe(true);
    expect(state.boss.kit.attacks.map(a => ({ ...a, name: '' }))).toEqual(kit.attacks.map(a => ({ ...a, name: '' })));
  });
  it('also repairs decorative names with no real identifier, so every attack retains its own assigned symbol', () => {
    const p = loadBalanceProfiles().find(p => p.slug === 'pallets/flask')!, kit = bossKitFromProfile(p, 4);
    kit.attacks.forEach((a, i) => { a.name = i % 2 ? 'Exception Orbit' : `app() ${a.kind}`; });
    const repaired = reconcileCodeNames(kit), symbols = (kit.code as BossCode).attackSymbols;
    expect(repaired.attacks.every(a => a.name.startsWith(symbols[a.id]))).toBe(true);
    expect(new Set(repaired.attacks.map(a => a.name.match(/^(.+?\(\))/)![1])).size).toBe(kit.attacks.length);
  });
  it('cycles each seeded kind pool evenly before reusing a phrase and reserves the first laser for breath', () => {
    for (const kind of Object.keys(ATTACK_FLAVOR_POOLS) as (keyof typeof ATTACK_FLAVOR_POOLS)[]) {
      const pool = ATTACK_FLAVOR_POOLS[kind], a = attackFlavorPicker(123), b = attackFlavorPicker(123);
      expect(pool.length).toBeGreaterThanOrEqual(6); expect(new Set(pool).size).toBe(pool.length);
      const phrases = Array.from({ length: pool.length * 3 }, () => a(kind));
      expect(phrases).toEqual(Array.from({ length: pool.length * 3 }, () => b(kind)));
      expect(new Set(phrases.slice(0, pool.length)).size).toBe(pool.length);
      for (let cycle = 0; cycle < 3; cycle++) expect(new Set(phrases.slice(cycle * pool.length, (cycle + 1) * pool.length)).size).toBe(pool.length);
      for (const phrase of pool) expect(phrases.filter(s => s === phrase)).toHaveLength(3);
    }
    expect(attackFlavorPicker(999)('laser')).toBe('</> Breath');
    expect(attackFlavorPicker(999, [{ kind: 'laser' }])('laser')).toBe('Race Condition');
    expect(new Set(Array.from({ length: 20 }, (_, seed) => attackFlavorPicker(seed)('ring'))).size).toBeGreaterThan(1);
  });
  it('varies React cascades and ripgrep rings/spirals while keeping identifiers, full names and combat budgets intact', () => {
    for (const p of loadBalanceProfiles()) {
      const kit = bossKitFromProfile(p, 4), code = kit.code as BossCode;
      expect(new Set(kit.attacks.map(a => a.name)).size).toBe(kit.attacks.length);
      expect(kit.attacks.every(a => a.name.startsWith(code.attackSymbols[a.id]))).toBe(true);
      for (const kind of Object.keys(ATTACK_FLAVOR_POOLS) as (keyof typeof ATTACK_FLAVOR_POOLS)[]) {
        const attacks = kit.attacks.filter(a => a.kind === kind), pool = ATTACK_FLAVOR_POOLS[kind];
        const phrases = attacks.map(a => a.name.slice(code.attackSymbols[a.id].length + 1));
        expect(phrases.every(s => pool.includes(s))).toBe(true);
        expect(new Set(phrases).size).toBe(Math.min(attacks.length, pool.length));
      }
      const legacy = structuredClone(kit);
      legacy.attacks.forEach(a => { a.name = `${code.attackSymbols[a.id]} ${ATTACK_FLAVOR[a.kind]}`; });
      const repaired = reconcileCodeNames(legacy);
      expect(repaired.attacks).toEqual(kit.attacks);
      const s = createMatch([{ id: 'a', name: 'A', kit: playerKitFromProfile(p) }], kit).snapshot();
      s.boss.limbs.forEach(l => { l.broken = true; }); new BossAi(1, 4).step(3, s.boss, s.players);
      expect(new Set(s.boss.kit.attacks.map(a => a.name)).size).toBe(s.boss.kit.attacks.length);
      for (const a of s.boss.kit.attacks.filter(a => a.source === 'heart')) expect(a.name.startsWith(code.attackSymbols[a.id])).toBe(true);
    }
  });
  it('keeps repeated custom art suffixes bounded and stable across repeated cache/application passes', () => {
    const p = loadBalanceProfiles().find(p => p.slug === 'facebook/react')!, kit = bossKitFromProfile(p, 4);
    kit.attacks.forEach(a => { a.name = 'Actual Attack'; });
    const repaired = reconcileCodeNames(kit);
    expect(reconcileCodeNames(repaired)).toEqual(repaired);
    expect(repaired.attacks.every(a => a.name.includes('Actual Attack') && a.name.length <= 64)).toBe(true);
    expect(new Set(repaired.attacks.map(a => a.name)).size).toBe(kit.attacks.length);
  });
  it('gives a legacy seven-cascade React deck distinct phrases before any reuse', () => {
    const p = loadBalanceProfiles().find(p => p.slug === 'facebook/react')!, kit = bossKitFromProfile(p, 4);
    const symbols = (kit.code as BossCode).attackSymbols;
    kit.attacks = kit.attacks.slice(0, 7).map(a => ({ ...a, kind: 'cascade', name: `${symbols[a.id]} Merge Conflict` }));
    kit.attacks = reconcileCodeNames(kit).attacks;
    const phrases = kit.attacks.filter(a => a.kind === 'cascade').map(a => a.name.slice(symbols[a.id].length + 1));
    expect(phrases).toHaveLength(7); expect(new Set(phrases).size).toBe(7);
    expect(phrases.every(phrase => ATTACK_FLAVOR_POOLS.cascade.includes(phrase))).toBe(true);
  });
});
