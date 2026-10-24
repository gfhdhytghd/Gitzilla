import { describe, expect, it } from 'vitest';
import type { BossArchetype, BossAttack, PlayerState } from '../shared/types.ts';
import { bossAnchors } from '../shared/kaiju-anatomy.ts';
import { ARCHETYPE_DECKS, bossArchetypeFromProfile } from './archetypes.ts';
import { bossKitFromProfile, playerKitFromProfile } from './kits.ts';
import { loadBalanceProfiles, syntheticProfile } from './bots.ts';
import { createMatch, type BattleState } from './match.ts';
import { BossMotion } from './bossMotion.ts';
import { activeBossRegions, bossMouth } from './regions.ts';
import type { BossCode } from './code.ts';
import { archetypeContactCost } from './balance.ts';

const archetypes: BossArchetype[] = ['kaiju', 'hydra', 'mecha', 'abyssal'];
function fixture(archetype: BossArchetype) {
  const p = loadBalanceProfiles().find(p => p.slug === 'facebook/react')!;
  const kit = bossKitFromProfile(p, 4); kit.archetype = archetype;
  const m = createMatch([{ id: 'p', name: 'P', kit: playerKitFromProfile(syntheticProfile()) }], kit);
  type Raw = { state: BattleState; motion: BossMotion; telegraph(a: BossAttack, target: [number, number]): void; attack(a: BossAttack, target: [number, number]): void;
    updateHazards(dt: number): void; updateBullets(dt: number): void; hurtBoss(p: PlayerState, id: string, damage: number, x: number, y: number): void };
  const raw = m as unknown as Raw;
  return { m, raw, b: raw.state.boss, p: raw.state.players[0] };
}
const advance = (m: ReturnType<typeof createMatch>, seconds: number) => { for (let i = 0; i < Math.ceil(seconds * 30); i++) m.step(1 / 30, new Map()); };

describe('repo-grounded archetype identity and budgets', () => {
  it('spreads actual fallback repos across four archetypes with exact real-signal reasons', () => {
    const profiles = loadBalanceProfiles();
    expect(new Set(profiles.map(p => bossArchetypeFromProfile(p).archetype)).size).toBe(4);
    for (const p of profiles) {
      const chosen = bossArchetypeFromProfile(p), kit = bossKitFromProfile(p, 4);
      expect(kit.archetype).toBe(chosen.archetype); expect((kit.code as BossCode).archetypeReason).toBe(chosen.reason);
      expect(bossArchetypeFromProfile({ ...p, seed: p.seed + 1, readme: 'I am a dragon' })).toEqual(chosen);
      expect(kit.attacks.every(a => ARCHETYPE_DECKS[kit.archetype].includes(a.kind))).toBe(true);
      expect(kit.attacks.reduce((sum, a) => sum + a.params.threatShare, 0)).toBeCloseTo(1);
      expect(kit.limbs.reduce((sum, l) => sum + l.maxHp / (l.weakPoint || l.fragile ? 1.5 : 1), 0) / kit.maxHp).toBeCloseTo(0.36, 3);
    }
  });
  it('uses cycles/coupling before language/depth, then size/age/debt, with a grounded default', () => {
    const p = syntheticProfile(7); p.cycles = []; p.components.forEach(c => { c.fanOut = 1; }); p.primaryLanguage = 'Python'; p.maxDepth = 1; p.ageDays = 100;
    expect(bossArchetypeFromProfile(p).archetype).toBe('kaiju');
    expect(bossArchetypeFromProfile({ ...p, ageDays: 6500 }).archetype).toBe('abyssal');
    expect(bossArchetypeFromProfile({ ...p, totalLoc: 200000 }).archetype).toBe('abyssal');
    expect(bossArchetypeFromProfile({ ...p, primaryLanguage: 'Rust', maxDepth: 4 }).archetype).toBe('mecha');
    expect(bossArchetypeFromProfile({ ...p, cycles: [['a', 'b'], ['c', 'd']] }).archetype).toBe('hydra');
    p.components[0].fanOut = 6; expect(bossArchetypeFromProfile(p).archetype).toBe('hydra');
  });
  it('spends contact-risk costs once at impact, with identical HP and cast budgets across styles', () => {
    for (const archetype of archetypes) {
      const profile = loadBalanceProfiles()[0], kit = bossKitFromProfile(profile, 4); kit.archetype = archetype;
      const match = createMatch(Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: 'Hero', kit: playerKitFromProfile(profile) })), kit);
      const raw = match as unknown as { state: BattleState; hurtPlayer(p: PlayerState, damage: number): void };
      const p = raw.state.players[0], before = p.hp + p.armor;
      raw.hurtPlayer(p, 5);
      expect(before - p.hp - p.armor).toBeCloseTo(5 / archetypeContactCost(archetype, 4));
      expect(archetypeContactCost(archetype, 1)).toBe(1);
      expect(archetypeContactCost(archetype, 5)).toBeCloseTo((archetypeContactCost(archetype, 4) + archetypeContactCost(archetype, 6)) / 2);
    }
  });
});

describe('authoritative behavior and pose presets', () => {
  it.each(archetypes)('publishes finite timed %s poses, directions and in-arena anchors', archetype => {
    const { b, p } = fixture(archetype), motion = new BossMotion(b, 4), poses = new Set<string>();
    const before = structuredClone(b.kit);
    for (let i = 0; i < 600; i++) {
      motion.step(1 / 30, [p], false, false); poses.add(b.pose.name);
      expect(b.pose.t).toBeGreaterThanOrEqual(0); expect(b.pose.t).toBeLessThanOrEqual(b.pose.total + 1e-6);
      expect(Math.hypot(...b.pose.dir)).toBeCloseTo(1);
      expect(Number.isFinite(b.x + b.y)).toBe(true);
      for (const region of activeBossRegions(b)) {
        expect(region.x - region.r).toBeGreaterThanOrEqual(14 - 1e-6); expect(region.x + region.r).toBeLessThanOrEqual(466 + 1e-6);
        expect(region.y - region.r).toBeGreaterThanOrEqual(14 - 1e-6); expect(region.y + region.r).toBeLessThanOrEqual(274 + 1e-6);
      }
    }
    expect(b.kit).toEqual(before);
    if (archetype === 'kaiju' || archetype === 'abyssal') expect(poses.has('walk')).toBe(true);
    if (archetype === 'hydra') expect(poses.has('fly')).toBe(true);
  });
  it('warns before hydra takeoff and allows hits only on unbroken heads/wings while airborne', () => {
    const { b, p, raw } = fixture('hydra'), motion = new BossMotion(b, 4);
    let warnedAt = -1, liftedAt = -1;
    for (let i = 0; i < 240; i++) {
      motion.step(1 / 30, [p], false, false);
      if (motion.takeFlightNotice()) warnedAt = i / 30;
      if (b.airborne && liftedAt < 0) liftedAt = i / 30;
    }
    expect(liftedAt - warnedAt).toBeGreaterThanOrEqual(0.8);
    const exposed = new Set(bossAnchors(b.kit).limbs.filter(l => l.tag === 'head' || l.tag === 'wing').map(l => l.id));
    expect(b.airborne).toBe(true); expect(activeBossRegions(b).every(r => exposed.has(r.id))).toBe(true);
    const hp = b.hp; raw.hurtBoss(p, 'heart', 100, b.x, b.y); expect(b.hp).toBe(hp);
    const region = activeBossRegions(b)[0]; raw.hurtBoss(p, region.id, 1, region.x, region.y); expect(b.hp).toBeLessThan(hp);
  });
  it('rotates hydra beam heads, skips broken heads, and pins an existing beam to its original head', () => {
    const { b, raw } = fixture('hydra'), motion = new BossMotion(b, 4), a = { ...b.kit.attacks[0], kind: 'laser' as const };
    const heads: number[] = [];
    for (let i = 0; i < 3; i++) { motion.castStarted(a); heads.push(b.pose.head!); }
    expect(heads).toEqual([0, 1, 2]);
    const mouth = bossMouth(b, 2); raw.telegraph(a, [100, 100]); const h = raw.state.hazards[0];
    b.pose.head = 0; raw.updateHazards(0.1); expect({ x: h.x, y: h.y }).toEqual(mouth);
    const head = bossAnchors(b.kit).limbs.find(l => l.slot === 'head-1')!; b.limbs.find(l => l.id === head.id)!.broken = true;
    motion.castStarted(a); expect(b.pose.head).toBe(0); motion.castStarted(a); expect(b.pose.head).toBe(2);
  });
  it('burrows only inside recovery, publishes its destination and becomes hittable on emergence', () => {
    const { b, p } = fixture('abyssal'), motion = new BossMotion(b, 4), a = { ...b.kit.attacks[0], kind: 'ring' as const };
    motion.castFired(a, [p]); const destination = motion.takeEmergePoint(); expect(destination?.targetPlayer).toBe(p.id);
    for (let i = 0; i < 10; i++) motion.step(1 / 30, [p], false, false);
    expect(b.pose.name).toBe('burrow'); expect(b.airborne).toBe(true); expect(activeBossRegions(b)).toEqual([]);
    for (let i = 0; i < 18; i++) motion.step(1 / 30, [p], false, false);
    expect(b.airborne).toBe(false); expect(b.pose.name).toBe('emerge'); expect(activeBossRegions(b).length).toBeGreaterThan(0);
    expect({ x: b.x, y: b.y }).toEqual({ x: destination!.x, y: destination!.y });
  });
  it('keeps mecha hops hittable and launches budgeted rocket fists/missiles instead of physical charges/bugs', () => {
    const { b, p, raw } = fixture('mecha'), motion = new BossMotion(b, 4), a = { ...b.kit.attacks[0], kind: 'charge' as const };
    motion.castFired(a, [p]); for (let i = 0; i < 10; i++) motion.step(1 / 30, [p], false, false);
    expect(b.pose.name).toBe('fly'); expect(b.airborne).toBe(true); expect(activeBossRegions(b).some(r => r.id === 'heart')).toBe(true);
    raw.attack(a, [p.x, p.y]); expect(raw.state.bullets.some(b => b.kind === 'rocket-fist')).toBe(true);
    raw.attack({ ...a, kind: 'ring' }, [p.x, p.y]); expect(raw.state.bullets.some(b => b.kind === 'missile')).toBe(true);
    raw.attack({ ...a, kind: 'summon' }, [p.x, p.y]); expect(raw.state.minions).toEqual([]);
  });
  it('shows stagger/roar/enrage and a two-second death pose without extending recorded fight time', () => {
    const { m, b, p, raw } = fixture('kaiju'); advance(m, 2.1);
    b.limbs[0].hp = 1; raw.hurtBoss(p, b.limbs[0].id, 100, b.x, b.y); expect(b.pose.name).toBe('stagger');
    b.limbs.forEach(l => { l.broken = true; }); b.hp = b.maxHp * 0.49;
    raw.hurtBoss(p, 'heart', 1, b.x, b.y); expect(b.pose.name).toBe('roar');
    b.hp = b.maxHp * 0.14; raw.hurtBoss(p, 'heart', 1, b.x, b.y); expect(b.pose.name).toBe('enrage');
    b.hp = 1; raw.hurtBoss(p, 'heart', 100, b.x, b.y); m.step(1 / 30, new Map());
    expect(b.pose.name).toBe('death'); expect(m.over).toBe(false); const duration = m.autopsy().duration;
    advance(m, 1); expect(b.pose.t).toBeGreaterThan(0.9); expect(m.over).toBe(false);
    advance(m, 1.1); expect(m.over).toBe(true); expect(m.autopsy().duration).toBe(duration);
  });
  it('allows staff shots through a burrow window without a missing-target crash and cancels travel on leave', () => {
    const { m, raw, b, p } = fixture('abyssal'); advance(m, 2.1); p.kit.weapon = 'staff';
    raw.motion.castFired({ ...b.kit.attacks[0], kind: 'ring' }, [p]);
    advance(m, 0.4); expect(b.airborne).toBe(true);
    expect(() => m.step(1 / 30, new Map([[p.id, { seq: 1, move: [0, 0], aim: null, fire: true, dash: false, skill: false, source: 'keyboard' }]]))).not.toThrow();
    m.removePlayer(p.id); expect(m.over).toBe(true); expect(b.airborne).toBe(false);
  });
});
