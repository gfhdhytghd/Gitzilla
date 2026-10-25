import { describe, expect, it } from 'vitest';
import type { Bullet, PlayerState } from '../shared/types.ts';
import { createMatch } from './match.ts';
import { syntheticProfile } from './bots.ts';
import { playerKitFromProfile } from './kits.ts';
import { createMotionPlayer } from './royale-bots.ts';
import type { ClassroomState } from './pvp.ts';
import { ROYALE_TUNING } from './royale-balance.ts';

function fixture(ai = false, mode: 'pvp' | 'edu' = 'pvp') {
  const kit = { ...playerKitFromProfile(syntheticProfile(1)), weapon: 'blaster' as const };
  const match = createMatch(Array.from({ length: 4 }, (_, i) => ({ id: i === 0 && ai ? 'bot-a' : `p${i}`, name: `P${i}`, kit })), null, { mode });
  const raw = match as unknown as { state: ClassroomState; fire(p: PlayerState): void;
    hurt(p: PlayerState, source: PlayerState, damage: number, dir: [number, number]): void; updateZone(dt: number): void; updateBullets(dt: number): void };
  raw.state.t = 5; raw.state.status = 'fighting'; raw.state.pvp.phase = 'round';
  raw.state.players.forEach((p, i) => { p.x = 120 + i * 60; p.y = 128; p.invuln = 0; });
  return { match, raw };
}
const angle = (b: Bullet) => Math.atan2(b.vy, b.vx);
describe('human motion royale contact', () => {
  it('is deterministic, holds stale input, includes wide tilt errors, burst pauses and movement', () => {
    const { match } = fixture(), state = match.snapshot(), player = state.players[0];
    const a = createMotionPlayer(123), b = createMotionPlayer(123);
    let maxError = 0, pauses = 0, firing = 0, dashes = 0;
    for (let i = 0; i < 1800; i++) {
      state.t = i / 30;
      const x = a(state, player); expect(x).toEqual(b(state, player));
      expect(Math.hypot(...x.move)).toBeLessThanOrEqual(1.00001);
      expect(x.source).toBe('motion'); expect(x.aim?.every(Number.isFinite)).toBe(true);
      maxError = Math.max(maxError, Math.abs(Math.atan2(x.aim![1], x.aim![0])) * 180 / Math.PI);
      if (x.fire) firing++; else pauses++; if (x.dash) dashes++;
    }
    expect(maxError).toBeGreaterThan(25); expect(maxError).toBeLessThanOrEqual(35);
    expect(firing).toBeGreaterThan(100); expect(pauses).toBeGreaterThan(100); expect(dashes).toBeGreaterThan(0);
  });
  it('assists the nearest forward enemy, preserves speed, and does not snap to the rear or outside the cone', () => {
    const { raw } = fixture(), [a, b, c, d] = raw.state.players;
    a.facing = [1, 0]; b.y = 148; c.x = 240; c.y = 100; d.x = 40;
    raw.fire(a); const shot = raw.state.bullets[0];
    expect(angle(shot)).toBeGreaterThan(0); expect(angle(shot)).toBeLessThanOrEqual(ROYALE_TUNING.assistSnap + 1e-9);
    const speed = Math.hypot(shot.vx, shot.vy); raw.updateBullets(1 / 30);
    expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(speed);
    expect(angle(shot)).toBeGreaterThan(ROYALE_TUNING.assistSnap);
    const other = fixture(); other.raw.state.players[0].facing = [-1, 0];
    other.raw.fire(other.raw.state.players[0]); expect(Math.abs(angle(other.raw.state.bullets[0]))).toBeCloseTo(Math.PI);
  });
  it('leaves shots outside the forward cone alone and stops homing when the launch target dies', () => {
    const { raw } = fixture(), [a, b, c, d] = raw.state.players;
    a.facing = [1, 0]; b.x = 140; b.y = 200; c.x = d.x = 40;
    raw.fire(a); const outside = raw.state.bullets[0];
    raw.updateBullets(1 / 30); expect(angle(outside)).toBe(0);
    const locked = fixture(), [attacker, target] = locked.raw.state.players;
    attacker.facing = [1, 0]; target.y += 20; locked.raw.fire(attacker);
    const shot = locked.raw.state.bullets[0], initial = angle(shot); target.alive = false;
    locked.raw.updateBullets(1 / 30); expect(angle(shot)).toBe(initial);
  });
  it('makes close fire stronger than distant poke without changing speed or repo stats', () => {
    const hit = (range: number) => {
      const { match, raw } = fixture(), [a, b, c, d] = raw.state.players;
      b.x = a.x + range; c.y = d.y = 32; raw.fire(a);
      for (let i = 0; i < 30; i++) raw.updateBullets(1 / 30);
      return { damage: match.autopsy().ranking.find(p => p.id === a.id)!.damage, kit: a.kit };
    };
    const close = hit(40), far = hit(180);
    expect(close.damage).toBeGreaterThan(0); expect(far.damage).toBeGreaterThan(0);
    expect(far.damage / close.damage).toBeCloseTo(ROYALE_TUNING.rangedDamage);
    expect(close.kit).toEqual(far.kit);
  });
  it.each([['AI', true, 'pvp'], ['edu', false, 'edu']] as const)('does not give %s the human assistance', (_, ai, mode) => {
    const { raw } = fixture(ai, mode), [a, b] = raw.state.players; b.y += 20; a.facing = [1, 0]; raw.fire(a);
    expect(angle(raw.state.bullets[0])).toBe(0); raw.updateBullets(1 / 30); expect(angle(raw.state.bullets[0])).toBe(0);
  });
  it.each([7.9, 8.1])('zone attribution uses actual last damage within8s (age %ss)', age => {
    const { match, raw } = fixture(), [a, b, c] = raw.state.players, zone = raw.state.pvp.royale!.zone!;
    raw.hurt(b, a, 0.1, [1, 0]); raw.hurt(b, c, 0.1, [-1, 0]);
    raw.state.t = 5 + age; zone.shrinkStart = 0; zone.shrinkEnd = 100; zone.targetR = 20;
    b.x = -1000; b.armor = 0; b.hp = 0.00001; raw.updateZone(1 / 30);
    const e = match.autopsy().royale!.eliminations[0];
    expect(e.reason).toBe('zone'); expect(e.by).toBe(age < 8 ? c.id : null);
    expect(raw.state.pvp.scores[c.id].kos).toBe(age < 8 ? 1 : 0); expect(raw.state.pvp.scores[a.id].kos).toBe(0);
  });
  it('records a departed attacker without resurrecting them or erasing their ranking', () => {
    const { match, raw } = fixture(), [a, b] = raw.state.players, zone = raw.state.pvp.royale!.zone!;
    raw.hurt(b, a, 0.1, [1, 0]); match.removePlayer(a.id);
    zone.shrinkStart = 0; zone.shrinkEnd = 100; b.x = -1000; b.armor = 0; b.hp = 0.00001;
    raw.updateZone(1 / 30); const report = match.autopsy();
    expect(report.royale!.eliminations.at(-1)).toMatchObject({ by: a.id, reason: 'zone' });
    expect(report.ranking.find(p => p.id === a.id)).toMatchObject({ left: true, kos: 1 });
    expect(raw.state.players.some(p => p.id === a.id)).toBe(false);
  });
  it('zone damage starts gently and the circle reaches close-weapon range before the cleanup deadline', () => {
    const { raw } = fixture(), zone = raw.state.pvp.royale!.zone!;
    raw.state.t = zone.shrinkStart; raw.updateZone(1 / 30); expect(zone.dps).toBeLessThan(0.1);
    raw.state.t = zone.shrinkEnd; raw.updateZone(1 / 30);
    expect(zone.r).toBeLessThanOrEqual(24); expect(zone.dps).toBeLessThan(0.5);
    expect(raw.state.pvp.roundEndsAt - zone.shrinkEnd).toBeGreaterThanOrEqual(40);
  });
});
