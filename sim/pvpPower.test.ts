import { describe, expect, it } from 'vitest';
import { pvpPowerFromProfile, statsFromPower, asPvpKit } from './pvpPower.ts';
import { loadBalanceProfiles, syntheticProfile } from './bots.ts';
import { qualityProfile } from './classroom-bots.ts';
import { playerKitFromProfile } from './kits.ts';
import { asBattleKit, asClassroomKit, qualitySignals, classroomFacts, type ClassroomKit } from './quality.ts';
import { createMatch } from './match.ts';

describe('repo power: quality60% plus real scale40%', () => {
  it('uses normalized measured parts, exact edu quality scores, and deterministic weighted totals', () => {
    for (const p of loadBalanceProfiles()) {
      const power = pvpPowerFromProfile(p), q = qualitySignals(classroomFacts(p));
      expect(power.parts).toHaveLength(9); expect(power.parts.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(1);
      expect(power.parts.slice(0, 5).reduce((s, p) => s + p.weight, 0)).toBeCloseTo(0.6);
      expect(power.parts.every(p => Number.isFinite(p.value) && p.value >= 0 && p.value <= 100)).toBe(true);
      expect(Math.abs(power.score - power.parts.reduce((s, p) => s + p.value * p.weight, 0))).toBeLessThanOrEqual(0.051);
      for (const [i, score] of [q.testing, q.modularity, q.cohesion, q.documentation, 1 - q.weakness / 0.2].entries())
        expect(power.parts[i].value).toBeCloseTo(score * 100, 0);
      expect(pvpPowerFromProfile({ ...p, seed: p.seed + 123, slug: 'same/signals', description: 'I am stronger' })).toEqual(power);
    }
  });
  it('rewards independently improved quality and scale and penalizes actual cycles/debt', () => {
    const good = qualityProfile(true), weak = qualityProfile(false);
    expect(pvpPowerFromProfile(good).score).toBeGreaterThan(pvpPowerFromProfile(weak).score);
    const poorScale = { ...good, stars: 0, contributors: 1, totalLoc: 100, commits: 1, ageDays: 365 };
    const richScale = { ...good, stars: 100000, contributors: 1000, totalLoc: 500000, commits: 10000, ageDays: 1000 };
    expect(pvpPowerFromProfile(richScale).score).toBeGreaterThan(pvpPowerFromProfile(poorScale).score);
    expect(pvpPowerFromProfile({ ...good, cycles: [['a', 'b'], ['c', 'd']] }).score).toBeLessThan(pvpPowerFromProfile(good).score);
    const debt = structuredClone(good); debt.dna!.counts.todo = 1000;
    expect(pvpPowerFromProfile(debt).score).toBeLessThan(pvpPowerFromProfile(good).score);
  });
  it('labels unavailable commit activity neutrally instead of inventing recent commits', () => {
    const p = syntheticProfile(1); p.ageDays = 0;
    const activity = pvpPowerFromProfile(p).parts.at(-1)!;
    expect(activity.value).toBe(50); expect(activity.label).toContain('unmeasured');
    p.ageDays = 365; p.commits = 0; expect(pvpPowerFromProfile(p).parts.at(-1)!.value).toBe(50);
  });
  it('makes all five stats monotone and caps extreme effective power below3x', () => {
    let previous = statsFromPower(0);
    for (let score = 1; score <= 100; score++) {
      const stats = statsFromPower(score);
      for (const key of Object.keys(stats) as (keyof typeof stats)[]) expect(stats[key]).toBeGreaterThanOrEqual(previous[key]);
      previous = stats;
    }
    const weak = statsFromPower(0), strong = statsFromPower(100);
    expect(weak).toEqual({ maxHp: 6, maxArmor: 4, damageMul: 1, speed: 85, maxEnergy: 185 });
    expect(strong).toEqual({ maxHp: 9, maxArmor: 6, damageMul: 1.75, speed: 95, maxEnergy: 245 });
    const ratio = (strong.maxHp + strong.maxArmor) / (weak.maxHp + weak.maxArmor) * strong.damageMul / weak.damageMul * strong.speed / weak.speed;
    expect(ratio).toBeGreaterThan(2.9); expect(ratio).toBeLessThanOrEqual(3);
    expect(statsFromPower(-100)).toEqual(weak); expect(statsFromPower(1000)).toEqual(strong);
  });
  it('is idempotent through lobby, constructor and mode switches while battle/edu retain their own stats', () => {
    for (const p of loadBalanceProfiles()) {
      const battle = playerKitFromProfile(p), edu = playerKitFromProfile(p, { mode: 'edu' }), pvp = playerKitFromProfile(p, { mode: 'pvp' }) as ClassroomKit;
      expect(pvp.pvpPower).toEqual(pvpPowerFromProfile(p)); expect(asPvpKit(pvp)).toEqual(pvp);
      expect(asPvpKit(edu)).toEqual(pvp); expect(asBattleKit(pvp)).toEqual(battle); expect(asClassroomKit(pvp)).toEqual(edu);
      expect((battle as ClassroomKit).pvpPower).toBeUndefined(); expect((edu as ClassroomKit).pvpPower).toBeUndefined();
      const match = createMatch([{ id: 'a', name: 'A', kit: pvp }, { id: 'b', name: 'B', kit: battle }], null, { mode: 'pvp' });
      expect(match.snapshot().players[0].kit).toEqual(pvp); expect(match.snapshot().players[1].kit).toEqual(pvp);
      expect([pvp.weapon, pvp.skill, pvp.code, pvp.design]).toEqual([battle.weapon, battle.skill, battle.code, battle.design]);
      expect((battle.maxHp - 5) + (battle.maxArmor - 3) + (battle.maxEnergy - 150) / 35 + (battle.speed - 77) / 8 + (battle.damageMul - 0.9) / 0.1).toBeCloseTo(5);
    }
  });
  it('retains spawn shields and the40%-max-HP impact cap even against extreme repo-power attackers', () => {
    const strong = playerKitFromProfile(loadBalanceProfiles().at(-1)!, { mode: 'pvp' });
    const m = createMatch([{ id: 'a', name: 'A', kit: strong }, { id: 'b', name: 'B', kit: strong }], null, { mode: 'pvp' });
    const raw = m as unknown as { state: import('./pvp.ts').ClassroomState; hurt(target: import('../shared/types.ts').PlayerState, source: import('../shared/types.ts').PlayerState, amount: number, dir: [number, number]): void };
    const [a, b] = raw.state.players, resources = b.hp + b.armor;
    raw.hurt(b, a, 1e9, [1, 0]); expect(b.hp + b.armor).toBe(resources);
    b.invuln = 0; raw.hurt(b, a, 1e9, [1, 0]);
    expect(resources - b.hp - b.armor).toBeCloseTo(b.kit.maxHp * 0.4); expect(b.alive).toBe(true);
  });
  it('also caps GC cleanup ticks at40% instead of turning the deadline into an environmental one-shot', () => {
    const p = loadBalanceProfiles()[0], m = createMatch(Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: 'P', kit: playerKitFromProfile(p, { mode: 'pvp' }) })), null, { mode: 'pvp' });
    const raw = m as unknown as { state: import('./pvp.ts').ClassroomState };
    raw.state.status = 'fighting'; raw.state.pvp.phase = 'round'; raw.state.t = raw.state.pvp.roundEndsAt - 0.01;
    m.step(0.25, new Map()); const state = m.snapshot();
    const hits = state.events.filter(e => e.type === 'hit' && e.source === 'gc-sweep'); expect(hits.length).toBeGreaterThan(3);
    for (const hit of hits) if (hit.type === 'hit') expect(hit.amount).toBeLessThanOrEqual(state.players.find(p => p.id === hit.target)!.kit.maxHp * 0.4 + 1e-8);
    expect(m.over).toBe(true); expect(state.players.filter(p => p.alive)).toHaveLength(1);
  });
});
