import { describe, expect, it } from 'vitest';
import type { InputFrame, MatchState, PlayerKit } from '../shared/types.ts';
import { bossKitFromProfile, playerKitFromProfile } from './kits.ts';
import { createMatch, type Match } from './match.ts';
import { bossRegions } from './regions.ts';
import { balanceTable, runBalance, syntheticProfile } from './bots.ts';
import { BossAi } from './bossAi.ts';

const frame = (patch: Partial<InputFrame> = {}): InputFrame => ({ seq: 1, move: [0, 0], aim: null, fire: false, dash: false, skill: false, source: 'keyboard', ...patch });
const internals = (match: Match) => (match as unknown as { state: MatchState }).state;
const advance = (match: Match, seconds: number, inputs = new Map<string, InputFrame>()) => {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) match.step(1 / 30, inputs);
};
function fixture(count = 1, overrides: Partial<PlayerKit> = {}) {
  const kit = { ...playerKitFromProfile(syntheticProfile(2)), ...overrides };
  const boss = bossKitFromProfile(syntheticProfile(4), count);
  const match = createMatch(Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Hero ${i}`, kit })), boss);
  advance(match, 2.1);
  return match;
}

describe('repository kits', () => {
  it('keeps the normalized player budget equal for every shape and repo size', () => {
    const budgets = Array.from({ length: 40 }, (_, i) => {
      const profile = syntheticProfile(i + 1); profile.totalFiles += i * 7; profile.totalLoc *= i + 1;
      const k = playerKitFromProfile(profile);
      return (k.maxHp - 5) + (k.maxArmor - 3) + (k.maxEnergy - 150) / 35 + (k.speed - 77) / 8 + (k.damageMul - 0.9) / 0.1;
    });
    for (const budget of budgets) expect(budget).toBeCloseTo(5);
  });
  it('maps languages, shape skills, cycles and scaled boss stats deterministically', () => {
    const p = syntheticProfile(3); p.primaryLanguage = 'Rust'; p.testRatio = 0.3;
    expect(playerKitFromProfile(p)).toMatchObject({ weapon: 'cannon', skill: 'hotfix', title: 'Rust Paladin' });
    const one = bossKitFromProfile(p, 1), four = bossKitFromProfile(p, 4);
    expect(four.maxHp / one.maxHp).toBeCloseTo(2.2);
    expect(four).toEqual(bossKitFromProfile(p, 4));
    expect(four.limbs.some(l => l.weakPoint)).toBe(true);
    expect(four.attacks.every(a => a.telegraph >= 0.6)).toBe(true);
    const variants = Array.from({ length: 10 }, (_, i) => { const profile = syntheticProfile(i + 1); if (i % 2) profile.heart = 'external/main'; return profile; });
    expect(new Set(variants.flatMap(profile => bossKitFromProfile(profile, 4).attacks.map(a => a.kind))).size).toBe(8);
  });
});

describe('authoritative arena', () => {
  it('has a countdown, clamps walls, and normalizes diagonal movement', () => {
    const m = fixture(); const p = internals(m).players[0];
    advance(m, 1, new Map([['p0', frame({ move: [-1, -1] })]]));
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(p.kit.speed);
    advance(m, 8, new Map([['p0', frame({ move: [-1, -1] })]]));
    expect(p.x).toBe(23); expect(p.y).toBe(23);
  });
  it('dashes with invulnerability, consumes energy and drains events only on snapshot', () => {
    const m = fixture();
    m.step(1 / 30, new Map([['p0', frame({ dash: true, move: [1, 0], fire: true, skill: true })]]));
    const s = m.snapshot(), p = s.players[0];
    expect(p.invuln).toBeGreaterThan(0); expect(p.dashCd).toBeGreaterThan(1);
    expect(p.energy).toBeLessThan(p.kit.maxEnergy); expect(s.bullets.length).toBeGreaterThan(0);
    expect(s.events.some(e => e.type === 'skill')).toBe(true); expect(m.snapshot().events).toEqual([]);
    s.players[0].hp = -100; expect(m.snapshot().players[0].hp).toBeGreaterThan(0);
  });
  it('preserves the analyzed heart path in the autopsy', () => {
    const profile = syntheticProfile(4);
    const match = createMatch([], bossKitFromProfile(profile, 1));
    expect(match.autopsy().boss.heart).toBe(profile.heart);
  });
  it('publishes every limb and heart region in absolute arena pixels, including broken limbs', () => {
    const m = fixture(), s = internals(m);
    s.boss.limbs[0].broken = true;
    m.step(1 / 30, new Map());
    const b = m.snapshot().boss;
    expect(b.regions).toEqual(bossRegions(b));
    expect(b.regions.map(r => r.id)).toEqual([...b.limbs.map(l => l.id), 'heart']);
    expect(b.regions.at(-1)).toEqual({ id: 'heart', x: b.x, y: b.y, r: 19 });
  });
  it('regenerates armor after the damage delay and applies armor before health', () => {
    const m = fixture(), s = internals(m), p = s.players[0];
    p.armor = 1;
    // A live, telegraphed attack is placed directly under a stationary hero.
    const attack = s.boss.kit.attacks[0]; attack.kind = 'slam'; attack.damage = 2;
    s.boss.casting = { attackId: attack.id, t: 0, total: 0.6, target: [p.x, p.y] };
    // Charge contact gives a deterministic authoritative damage source.
    (m as unknown as { charge: unknown }).charge = { vx: 0, vy: 0, t: 0.1, damage: 2 };
    s.boss.x = p.x; s.boss.y = p.y;
    m.step(1 / 30, new Map());
    expect(p.armor).toBe(0); expect(p.hp).toBe(p.kit.maxHp - 1);
    s.boss.casting = { attackId: attack.id, t: 0, total: 999, target: [400, 200] };
    s.boss.x = 400; s.boss.y = 200;
    advance(m, 3); expect(p.armor).toBe(0);
    advance(m, 1.6); expect(p.armor).toBeGreaterThan(0);
  });
  it('revives a downed teammate after two seconds within 24px', () => {
    const m = fixture(2), s = internals(m), [p, helper] = s.players;
    p.alive = false; p.hp = 0; p.x = helper.x; p.y = helper.y;
    advance(m, 1.5); expect(p.alive).toBe(false);
    advance(m, 0.6); expect(p.alive).toBe(true); expect(p.hp).toBe(Math.ceil(p.kit.maxHp / 2));
    expect(helper.stats.revives).toBe(1); expect(m.snapshot().events.some(e => e.type === 'revived')).toBe(true);
  });
  it('handles all five skills and their cooldowns', () => {
    for (const skill of ['hotfix', 'firewall', 'fork', 'overclock', 'rollback'] as const) {
      const m = fixture(2, { skill }); const s = internals(m); const p = s.players[0]; p.hp = 1;
      m.step(1 / 30, new Map([['p0', frame({ skill: true })]]));
      expect(p.skillCd).toBeGreaterThan(0);
      if (skill === 'hotfix') expect(p.hp).toBe(3);
      if (skill === 'firewall') expect(s.hazards.some(h => h.kind === 'firewall')).toBe(true);
      if (skill === 'fork' || skill === 'overclock') expect(p.buffs).toContain(skill);
      if (skill === 'rollback') expect(p.invuln).toBeGreaterThan(0);
    }
  });
  it('breaks limbs, chips the core, records combos and transitions phases', () => {
    const m = fixture(2, { weapon: 'laser' }), s = internals(m);
    const region = bossRegions(s.boss)[0];
    for (const p of s.players) { p.x = region.x - 35; p.y = region.y; }
    s.boss.limbs[0].hp = 1;
    const inputs = new Map(s.players.map(p => [p.id, frame({ fire: true, aim: [1, 0] })]));
    advance(m, 0.3, inputs);
    expect(s.boss.limbs[0].broken).toBe(true); expect(s.boss.hp).toBeLessThan(s.boss.maxHp);
    expect(m.autopsy().boss.limbs[0].damageTaken).toBeGreaterThan(0);
    // Repeated heart shots by both players share a combo window.
    s.boss.limbs.forEach(l => { l.broken = true; l.hp = 0; });
    s.players.forEach(p => { p.x = s.boss.x - 40; p.y = s.boss.y; });
    s.boss.hp = s.boss.maxHp * 0.49;
    advance(m, 0.3, inputs); expect(s.boss.phase).toBe(2);
    expect(Math.max(...s.players.map(p => p.stats.bestCombo))).toBe(2);
    s.boss.hp = s.boss.maxHp * 0.14;
    advance(m, 0.3, inputs); expect(s.boss.phase).toBe(3);
    s.boss.hp = 1; advance(m, 0.3, inputs);
    expect(m.over).toBe(true); expect(m.autopsy().victory).toBe(true);
    expect(m.autopsy().players.filter(p => p.stats.killingBlow)).toHaveLength(1);
  });
  it('interrupts a casting limb and removes its pending hazard when that limb breaks', () => {
    const m = fixture(2, { weapon: 'laser' }), s = internals(m), region = bossRegions(s.boss)[0];
    const a = s.boss.kit.attacks.find(a => a.source === s.boss.kit.limbs[0].component)!;
    a.kind = 'slam';
    s.boss.casting = { attackId: a.id, t: 0, total: 1, target: [80, 80] };
    (m as unknown as { telegraph: (attack: typeof a, target: [number, number]) => void }).telegraph(a, [80, 80]);
    s.boss.limbs[0].hp = 1;
    for (const p of s.players) { p.x = region.x - 35; p.y = region.y; }
    advance(m, 0.3, new Map(s.players.map(p => [p.id, frame({ fire: true, aim: [1, 0] })])));
    expect(s.boss.limbs[0].broken).toBe(true);
    expect(s.boss.casting).toBeNull(); expect(s.hazards).toHaveLength(0);
  });
  it('defeats an all-downed team and leaves terminal state stable', () => {
    const m = fixture(2); internals(m).players.forEach(p => { p.alive = false; p.hp = 0; });
    m.step(1 / 30, new Map()); expect(m.autopsy().victory).toBe(false); expect(m.snapshot().status).toBe('defeat');
    const s = m.snapshot(); advance(m, 2); expect(m.snapshot()).toEqual(s);
  });
  it('telegraphs every selected attack, excludes broken sources and keeps heart patterns varied', () => {
    const m = fixture(2), s = internals(m), b = s.boss;
    const ai = new BossAi(99);
    b.limbs.forEach(l => { l.broken = true; l.hp = 0; }); b.phase = 3;
    const seen = new Set<string>();
    for (let i = 0; i < 1800; i++) {
      const decision = ai.step(1 / 30, b, s.players);
      if (decision.started) {
        expect(decision.started.source).toBe('heart');
        expect(b.casting!.total).toBeGreaterThanOrEqual(0.6);
        expect(b.casting!.t).toBe(0); seen.add(decision.started.kind);
      }
      if (decision.fired) expect(b.casting).toBeNull();
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
  it('resolves all eight boss attacks into visible bullets, hazards, charges or minions', () => {
    for (const kind of ['ring', 'spiral', 'fan', 'laser', 'slam', 'charge', 'summon', 'cascade'] as const) {
      const m = fixture(2), s = internals(m);
      const attack = { ...s.boss.kit.attacks[0], kind, params: { count: 8, speed: 50, radius: 30 } };
      s.boss.kit.attacks = [attack];
      const runtime = m as unknown as { telegraph: (a: typeof attack, target: [number, number]) => void; attack: (a: typeof attack, target: [number, number]) => void; charge: unknown };
      runtime.telegraph(attack, [100, 100]);
      if (['laser', 'slam', 'cascade', 'charge'].includes(kind)) expect(s.hazards.length).toBeGreaterThan(0);
      runtime.attack(attack, [100, 100]);
      m.step(1 / 30, new Map());
      if (['ring', 'spiral', 'fan'].includes(kind)) expect(s.bullets.length).toBeGreaterThan(0);
      if (kind === 'summon') expect(s.minions.length).toBeGreaterThan(0);
      if (kind === 'charge') expect(runtime.charge).not.toBeNull();
    }
  });
  it('runs all weapons and yields identical snapshots for identical seed and inputs', () => {
    for (const weapon of ['blaster', 'smg', 'shotgun', 'cannon', 'staff', 'laser', 'blade'] as const) {
      const a = fixture(1, { weapon }), b = fixture(1, { weapon });
      for (const match of [a, b]) { const s = internals(match); s.players[0].x = s.boss.x - 95; s.players[0].y = s.boss.y; }
      const input = new Map([['p0', frame({ fire: true, move: [0, 0.1] })]]);
      advance(a, 6, input); advance(b, 6, input);
      expect(a.snapshot()).toEqual(b.snapshot());
      expect(a.autopsy().players[0].stats.damage).toBeGreaterThan(0);
    }
  });
});

it('headless bots complete solo, squad and large-team runs', () => {
  const rows = runBalance([syntheticProfile(1)], 1);
  console.log(balanceTable(rows));
  expect(rows.map(r => r.players)).toEqual([1, 4, 8]);
  for (const r of rows) { expect(r.duration).toBeGreaterThan(0); expect(r.duration).toBeLessThanOrEqual(359); }
}, 30000);
