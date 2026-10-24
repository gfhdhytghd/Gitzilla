import { describe, expect, it } from 'vitest';
import type { BossAttack, Hazard } from '../shared/types.ts';
import { kaijuAnchors } from '../shared/kaiju-anatomy.ts';
import { createMatch, type BattleState } from './match.ts';
import { bossKitFromProfile, playerKitFromProfile } from './kits.ts';
import { loadBalanceProfiles, syntheticProfile } from './bots.ts';
import { activeBossRegions, bossMouth, bossRegions } from './regions.ts';

function fixture() {
  const p = syntheticProfile(5), m = createMatch([{ id: 'p', name: 'Hero', kit: playerKitFromProfile(p) }], bossKitFromProfile(p, 4));
  return m as typeof m & { state: BattleState; telegraph(a: BossAttack, target: [number, number]): void; updateHazards(dt: number): void };
}

describe('shared upright kaiju anatomy', () => {
  it('anchors every organ to the shared anatomy while preserving the exact old hit-area budget', () => {
    for (const profile of loadBalanceProfiles()) {
      const m = createMatch([{ id: 'p', name: 'Hero', kit: playerKitFromProfile(profile) }], bossKitFromProfile(profile, 4));
      const boss = m.snapshot().boss, anchors = kaijuAnchors(boss.kit), before = structuredClone(boss);
      const regions = bossRegions(boss);
      for (const limb of anchors.limbs) expect(regions.find(r => r.id === limb.id)).toEqual({ id: limb.id, x: boss.x + limb.dx, y: boss.y + limb.dy, r: 13 });
      expect(regions.at(-1)).toEqual({ id: 'heart', x: boss.x + anchors.chest.dx, y: boss.y + anchors.chest.dy, r: 19 });
      expect(regions.reduce((sum, r) => sum + r.r ** 2, 0)).toBe(boss.limbs.length * 13 ** 2 + 19 ** 2);
      expect(boss).toEqual(before);
    }
  });
  it('translates with the boss and retains broken anatomy for art while excluding it from targeting', () => {
    const boss = fixture().snapshot().boss, before = bossRegions(boss);
    boss.x += 17; boss.y -= 9; boss.limbs[0].broken = true;
    const after = bossRegions(boss);
    after.forEach((r, i) => { expect(r.x - before[i].x).toBe(17); expect(r.y - before[i].y).toBe(-9); expect(r.r).toBe(before[i].r); });
    expect(after.some(r => r.id === boss.limbs[0].id)).toBe(true);
    expect(activeBossRegions(boss).some(r => r.id === boss.limbs[0].id)).toBe(false);
    expect(activeBossRegions(boss).some(r => r.id === 'heart')).toBe(true);
  });
  it('uses a mouth-origin laser with the existing .95s charge, damage, width and .75s armed window', () => {
    const m = fixture(), boss = m.state.boss, player = m.state.players[0];
    const a: BossAttack = { ...boss.kit.attacks[0], kind: 'laser', telegraph: 0.95 };
    const mouth = bossMouth(boss); player.x = mouth.x - 80; player.y = mouth.y; player.invuln = 0;
    boss.targetPlayer = player.id; const resources = player.hp + player.armor;
    m.telegraph(a, [player.x, player.y]); const h = m.state.hazards[0];
    expect(h).toMatchObject({ kind: 'laser', x: mouth.x, y: mouth.y, r: 7, total: 1.7, armed: false });
    expect(mouth).toEqual({ x: boss.x + kaijuAnchors(boss.kit).mouth.dx, y: boss.y + kaijuAnchors(boss.kit).mouth.dy });
    expect(mouth).not.toEqual({ x: boss.x, y: boss.y });
    m.updateHazards(0.94); expect(player.hp + player.armor).toBe(resources); expect(h.armed).toBe(false);
    m.updateHazards(0.02); expect(h.armed).toBe(true); expect(resources - player.hp - player.armor).toBeCloseTo(a.damage);
    m.updateHazards(0.75); expect(m.state.hazards).toHaveLength(0);
  });
  it('keeps the beam at the mouth while the boss moves and leaves body-based charge/pressure unchanged', () => {
    const m = fixture(), boss = m.state.boss, attack = { ...boss.kit.attacks[0], kind: 'laser' as const, telegraph: 0.95 };
    m.telegraph(attack, [100, 100]); const beam: Hazard = m.state.hazards[0];
    boss.x += 12; boss.y -= 6; m.updateHazards(0.1);
    expect({ x: beam.x, y: beam.y }).toEqual(bossMouth(boss));
    m.telegraph({ ...attack, kind: 'charge' }, [100, 100]);
    expect(m.state.hazards[1]).toMatchObject({ x: boss.x, y: boss.y, r: 18 });
    expect(attack.damage).toBe(boss.kit.attacks[0].damage);
  });
});
