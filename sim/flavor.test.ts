import { describe, expect, it } from 'vitest';
import type { WeaponKind } from '../shared/types.ts';
import { ATTACK_FLAVOR, SKILL_FLAVOR, weaponCode } from './flavor.ts';
import { bossKitFromProfile, playerKitFromProfile } from './kits.ts';
import type { BossCode } from './code.ts';
import { BossAi } from './bossAi.ts';
import { createMatch } from './match.ts';
import { loadBalanceProfiles, syntheticProfile } from './bots.ts';

describe('code weapon flavor', () => {
  it('covers every weapon with short, detached, deterministic visual metadata', () => {
    for (const kind of ['blaster', 'smg', 'shotgun', 'cannon', 'staff', 'laser', 'blade'] as WeaponKind[]) {
      const a = weaponCode(kind, 'Unknown', 17, ['real']);
      expect(a).toEqual(weaponCode(kind, 'Unknown', 17, ['real']));
      expect(a.name.length).toBeLessThanOrEqual(20);
      expect(a.projectiles.length).toBeGreaterThan(0); expect(a.projectiles.length).toBeLessThanOrEqual(4);
      expect(a.projectiles.every(glyph => glyph.length > 0 && glyph.length <= 8)).toBe(true);
      expect(a.projectiles).toContain('real'); expect(a.muzzle).toBeTruthy(); expect(a.impact).toBeTruthy();
      a.projectiles.push('mutated'); expect(weaponCode(kind, 'Unknown', 17).projectiles).not.toContain('mutated');
    }
  });
  it.each([
    ['TypeScript', 'blaster', 'as any Blaster', 'any'], ['JavaScript', 'blaster', 'Promise Blaster', '.then()'],
    ['Rust', 'cannon', 'unsafe{} Cannon', '&mut'], ['Go', 'smg', 'goroutine SMG', '<-ch'],
    ['C++', 'shotgun', 'template<> Shotgun', '::'], ['Python', 'staff', 'yield Staff', 'λ'],
    ['Java', 'laser', 'Stream Beam', '.map()'], ['C#', 'laser', 'LINQ Ray', 'JOIN'],
    ['PHP', 'blade', 'die() Saber', '?>'],
  ])('gives %s a language-specific code construct', (language, kind, name, glyph) => {
    const flavor = weaponCode(kind as WeaponKind, language, 1);
    expect(flavor.name).toBe(name); expect(flavor.projectiles).toContain(glyph);
    expect(flavor).toEqual(weaponCode(kind as WeaponKind, language.toLowerCase(), 1));
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
});
