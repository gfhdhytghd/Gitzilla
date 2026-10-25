import { describe, expect, it } from 'vitest';
import type { InputFrame, PlayerState } from '../shared/types.ts';
import { BATTLE_DIFFICULTY, squadBudget } from './balance.ts';
import { bossKitFromProfile, playerKitFromProfile } from './kits.ts';
import { loadBalanceProfiles, syntheticProfile } from './bots.ts';
import { createMatch, type BattleState } from './match.ts';
import { BossAi } from './bossAi.ts';

function atDifficulty<T>(damage: number, attackFrequency: number, run: () => T): T {
  const saved = { ...BATTLE_DIFFICULTY };
  try { Object.assign(BATTLE_DIFFICULTY, { damage, attackFrequency }); return run(); }
  finally { Object.assign(BATTLE_DIFFICULTY, saved); }
}
describe('battle-only one-third easier follow-up', () => {
  it('multiplies damage by2/3 and intervals by3/2, preserving already-reduced HP, limbs and telegraphs', () => {
    for (const profile of loadBalanceProfiles()) for (const count of [1, 4, 6, 8]) {
      const before = atDifficulty(1, 1, () => bossKitFromProfile(profile, count));
      const after = bossKitFromProfile(profile, count);
      expect(after.maxHp).toBe(before.maxHp); expect(after.limbs).toEqual(before.limbs);
      after.attacks.forEach((a, i) => {
        expect(a.damage).toBeCloseTo(before.attacks[i].damage * 2 / 3);
        expect(a.cooldown).toBeCloseTo(before.attacks[i].cooldown * 1.5);
        expect(a.telegraph).toBe(before.attacks[i].telegraph); expect(a.params).toEqual(before.attacks[i].params);
      });
      const budget = squadBudget(count), baseline = atDifficulty(1, 1, () => squadBudget(count));
      expect(budget.pressureLanes).toBe(baseline.pressureLanes);
      expect(budget.pressurePeriod).toBeCloseTo(baseline.pressurePeriod * 1.5);
      expect(budget.recoveryScale).toBeCloseTo(baseline.recoveryScale * 1.5);
    }
    expect([4, 6, 8].map(n => squadBudget(n).hp)).toEqual([8507, 12760, 17013]);
  });
  it.each([1, 2, 3] as const)('reduces measured phase%i primary casts and secondary volley frequency to approximately2/3', phase => {
    const profiles = [...new Map(loadBalanceProfiles().map(p => [bossKitFromProfile(p, 4).archetype, p])).values()];
    for (const count of [4, 6, 8]) {
      for (const profile of profiles) {
        const casts = (frequency: number) => atDifficulty(2 / 3, frequency, () => {
          const kit = bossKitFromProfile(profile, count), m = createMatch([{ id: 'p', name: 'P', kit: playerKitFromProfile(profile) }], kit);
          const s = m.snapshot(), ai = new BossAi(99, count); s.boss.phase = phase; s.boss.enraged = phase > 1; let fired = 0;
          for (let i = 0; i < 18000; i++) if (ai.step(1 / 30, s.boss, s.players).fired) fired++;
          return fired;
        });
        expect(Math.abs(casts(2 / 3) / casts(1) - 2 / 3)).toBeLessThan(0.035);
      }
      const volleys = (frequency: number) => atDifficulty(2 / 3, frequency, () => {
        const profile = profiles[0], m = createMatch(Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: 'P', kit: playerKitFromProfile(profile) })), bossKitFromProfile(profile, count));
        const r = m as unknown as { state: BattleState; updatePressure(dt: number, p: PlayerState[]): void };
        for (let i = 0; i < 5400; i++) r.updatePressure(1 / 30, r.state.players);
        return r.state.events.filter(e => e.type === 'telegraph').length;
      });
      expect(Math.abs(volleys(2 / 3) / volleys(1) - 2 / 3)).toBeLessThan(0.035);
    }
  });
  it('scales bug contact/projectile damage and slows their recurring shots without shortening warnings', () => {
    const profile = syntheticProfile(1), kit = bossKitFromProfile(profile, 1);
    const m = createMatch([{ id: 'p', name: 'P', kit: playerKitFromProfile(profile) }], kit);
    const r = m as unknown as { state: BattleState; updateMinions(dt: number): void; shots: Map<number, { damage: number }>; minionShot: number };
    const p = r.state.players[0], before = p.hp + p.armor; p.invuln = 0;
    r.state.minions.push({ id: 999, x: p.x, y: p.y, hp: 12, kind: 'bug' }); r.minionShot = 0;
    r.updateMinions(1 / 30);
    expect(before - p.hp - p.armor).toBeCloseTo(2 / 3);
    expect([...r.shots.values()][0].damage).toBeCloseTo(2 / 3); expect(r.minionShot).toBe(4.5);
  });
  it.each(['pvp', 'edu'] as const)('does not change the %s replay when battle difficulty is modified', mode => {
    const play = () => {
      const profile = syntheticProfile(1), m = createMatch([{ id: 'a', name: 'A', kit: playerKitFromProfile(profile) }, { id: 'b', name: 'B', kit: playerKitFromProfile(profile) }], null, { mode });
      for (let i = 0; i < 600 && !m.over; i++) {
        const input: InputFrame = { seq: i, move: [0, Math.sin(i / 100)], aim: null, fire: true, dash: i % 80 === 0, skill: false, source: 'keyboard' };
        m.step(1 / 30, new Map([['a', input], ['b', input]]));
      }
      return m.snapshot();
    };
    expect(atDifficulty(1, 1, play)).toEqual(atDifficulty(0.1, 0.1, play));
  });
});
