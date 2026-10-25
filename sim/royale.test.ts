import { describe, expect, it } from 'vitest';
import type { InputFrame, PlayerState } from '../shared/types.ts';
import { ARENA_H, ARENA_W } from '../shared/types.ts';
import { createMatch, type Match } from './match.ts';
import { pvpArenaSize, type ClassroomState } from './pvp.ts';
import { createBot, syntheticProfile } from './bots.ts';
import { playerKitFromProfile } from './kits.ts';
import { asBattleKit, asClassroomKit, qualityFromRubric, type ClassroomKit } from './quality.ts';
import { asPvpKit } from './pvpPower.ts';
import { royaleTimeline } from './royale-balance.ts';

const roster = (n = 4) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Hero ${i}`, kit: playerKitFromProfile(syntheticProfile(i + 1)) }));
const frame = (patch: Partial<InputFrame> = {}): InputFrame => ({ seq: 1, move: [0, 0], aim: null, fire: false, skill: false, dash: false, source: 'keyboard', ...patch });
const advance = (m: Match, seconds: number, inputs = new Map<string, InputFrame>()) => {
  for (let i = 0; i < Math.ceil(seconds * 30) && !m.over; i++) m.step(1 / 30, inputs);
};
const match = (n = 4) => createMatch(roster(n), null, { mode: 'pvp' });
const raw = (m: Match) => m as unknown as { state: ClassroomState; hurt(p: PlayerState, source: PlayerState, amount: number, direction: [number, number]): void };
function ko(m: Match, victim: PlayerState, by: PlayerState) {
  for (let i = 0; i < 20 && victim.alive; i++) { victim.invuln = 0; raw(m).hurt(victim, by, 1000, [1, 0]); }
  expect(victim.eliminated).toBe(true);
}

describe('last-one-standing PvP royale', () => {
  it.each([2, 4, 8])('spawns %i distinct heroes evenly on a visible edge with a two-second shield', count => {
    const m = match(count), s = m.snapshot(), arena = pvpArenaSize(count, 'pvp');
    expect(s.mode).toBe('pvp'); expect(s.boss).toBeNull(); expect(s.heroScale).toBe(2);
    expect(s.pvp).toMatchObject({ arenaW: arena.width, arenaH: arena.height, rounds: 1, round: 1 });
    expect(arena.width).toBeLessThanOrEqual(ARENA_W); expect(arena.height).toBeLessThanOrEqual(ARENA_H);
    expect(new Set(s.players.map(p => `${p.x},${p.y}`)).size).toBe(count);
    for (const p of s.players) {
      expect(p.x).toBeGreaterThanOrEqual(32); expect(p.x).toBeLessThanOrEqual(arena.width - 32);
      expect(p.y).toBeGreaterThanOrEqual(32); expect(p.y).toBeLessThanOrEqual(arena.height - 32);
      expect(((p.x - arena.width / 2) / (arena.width / 2 - 40)) ** 2 + ((p.y - arena.height / 2) / (arena.height / 2 - 40)) ** 2).toBeCloseTo(1);
      expect(p.invuln).toBe(2); expect(p.eliminated).toBe(false); expect(p.killedBy).toBeNull();
    }
    expect(s.pvp.royale!.alive).toHaveLength(count); expect(s.pvp.royale!.placements).toEqual({});
    advance(m, 2.1); expect(m.snapshot().players.every(p => p.invuln > 1.8)).toBe(true);
    advance(m, 8, new Map(s.players.map(p => [p.id, frame({ move: [1, 1] })])));
    expect(m.snapshot().players.every(p => p.x <= arena.width - 32 && p.y <= arena.height - 32)).toBe(true);
  });
  it('accepts 2–8 only, applies repo power on edu/rubric mode switches, and preserves battle/code identity', () => {
    expect(() => match(1)).toThrow('2–8'); expect(() => match(9)).toThrow('2–8');
    const players = roster(4), original = structuredClone(players);
    players[0].kit = asClassroomKit(players[0].kit);
    players[1].kit = qualityFromRubric(players[1].kit, { rubric: { title: 'Tests', source: 'doc', criteria: [{ id: 'tests', name: 'Tests', weight: 1, signal: 'tests', description: 'Tests' }] }, results: [{ criterionId: 'tests', score: 1, evidence: '10 test files' }] });
    const m = createMatch(players, null, { mode: 'pvp' }), s = m.snapshot();
    expect(s.players.map(p => p.kit)).toEqual(original.map(p => asPvpKit(p.kit)));
    expect(s.players.every(p => !p.kit.quality && !!(p.kit as ClassroomKit).pvpPower)).toBe(true);
    expect(s.players.map(p => asBattleKit(p.kit))).toEqual(original.map(p => p.kit));
  });
  it('permits moving and firing, hits only opponents and permanently eliminates with kill attribution', () => {
    const m = match(), r = raw(m); advance(m, 4.1); const [a, b] = r.state.players;
    a.x = 180; a.y = 150; b.x = 230; b.y = 150; a.kit.weapon = 'blaster';
    advance(m, 0.5, new Map([[a.id, frame({ fire: true, aim: [1, 0], move: [0, 1] })]]));
    expect(a.y).toBeGreaterThan(150); expect(a.hp).toBe(a.kit.maxHp); expect(r.state.pvp.scores[a.id].damage).toBeGreaterThan(0);
    ko(m, b, a); const snapshot = m.snapshot();
    expect(snapshot.pvp.royale!.placements[b.id]).toBe(4); expect(b.killedBy).toBe(a.id);
    expect(snapshot.pvp.scores[a.id].kos).toBe(1); expect(snapshot.pvp.scores[b.id].downs).toBe(1);
    expect(snapshot.events.some(e => e.type === 'downed' && e.player === b.id)).toBe(true);
    const dead = { x: b.x, y: b.y };
    advance(m, 10, new Map([[b.id, frame({ move: [1, 1], fire: true, skill: true, dash: true })]]));
    expect(b.alive).toBe(false); expect(b.hp).toBe(0); expect(b.reviveProgress).toBe(0); expect({ x: b.x, y: b.y }).toEqual(dead);
    const bot = createBot(12); expect(bot(m.snapshot(), b)).toMatchObject({ fire: false, move: [0, 0], skill: false, dash: false });
    expect(m.snapshot().bullets.some(bullet => bullet.owner === b.id)).toBe(false);
  });
  it('awards survival placement above KO count and records an immutable chronological elimination log', () => {
    const m = match(), r = raw(m), [a, b, c, d] = r.state.players; advance(m, 4.1);
    ko(m, b, a); ko(m, c, a); ko(m, a, d);
    expect(m.over).toBe(true); const s = m.snapshot(); expect(s.players.filter(p => p.alive).map(p => p.id)).toEqual([d.id]);
    expect(s.pvp.royale!.placements).toEqual({ [b.id]: 4, [c.id]: 3, [a.id]: 2, [d.id]: 1 });
    expect(s.pvp.royale!.winner).toBe(d.id); expect(s.pvp.leader).toBe(d.id);
    const report = m.autopsy() as ReturnType<import('./pvp.ts').ClassroomMatch['autopsy']>;
    expect(report.mvp).toBe(d.id); expect(report.victory).toBe(true); expect(report.ranking.map(p => p.id)).toEqual([d.id, a.id, c.id, b.id]);
    expect(report.ranking[1]).toMatchObject({ placement: 2, killedBy: d.id, kos: 2 });
    expect(report.royale!.eliminations.map(e => [e.player, e.by, e.reason])).toEqual([[b.id, a.id, 'weapon'], [c.id, a.id, 'weapon'], [a.id, d.id, 'weapon']]);
    report.royale!.eliminations[0].by = 'changed'; expect((m.autopsy() as typeof report).royale!.eliminations[0].by).toBe(a.id);
    const before = m.snapshot(); advance(m, 15); expect(m.snapshot()).toEqual(before);
  });
  it('drops only a small heart and energy pickup, collected by living heroes and capped at maxima', () => {
    const m = match(), r = raw(m); advance(m, 4.1); const [a, b, c] = r.state.players;
    ko(m, b, a); expect(r.state.pickups.map(p => p.kind).sort()).toEqual(['energy', 'heart']);
    c.x = b.x; c.y = b.y; c.hp = c.kit.maxHp - 0.5; c.energy = c.kit.maxEnergy - 10;
    m.step(1 / 30, new Map()); const s = m.snapshot();
    expect(c.hp).toBe(c.kit.maxHp); expect(c.energy).toBe(c.kit.maxEnergy); expect(s.pickups).toEqual([]);
    expect(s.events.filter(e => e.type === 'pickup')).toHaveLength(2);
  });
  it('eliminates leavers, keeps their ranking, and lets the remaining squad continue', () => {
    const m = match(); m.removePlayer('p0');
    expect(m.over).toBe(false); expect(m.snapshot().players).toHaveLength(3);
    expect(m.snapshot().pvp.royale!.alive).not.toContain('p0');
    m.removePlayer('p1'); expect(m.over).toBe(false); m.removePlayer('p2');
    expect(m.over).toBe(true); expect(m.autopsy().mvp).toBe('p3');
    const report = m.autopsy() as ReturnType<import('./pvp.ts').ClassroomMatch['autopsy']>;
    expect(report.ranking.map(r => r.placement)).toEqual([1, 2, 3, 4]); expect(report.ranking.slice(1).every(r => r.left)).toBe(true);
    expect(report.royale!.eliminations.every(e => e.reason === 'left' && e.by === null)).toBe(true);
  });
  it('does not count an already-eliminated departure twice or erase their killer', () => {
    const m = match(), r = raw(m), [a, b] = r.state.players; advance(m, 4.1); ko(m, b, a); m.removePlayer(b.id); m.removePlayer(b.id);
    const report = m.autopsy() as ReturnType<import('./pvp.ts').ClassroomMatch['autopsy']>;
    expect(report.royale!.eliminations).toHaveLength(1); expect(report.ranking.find(p => p.id === b.id)).toMatchObject({ placement: 4, killedBy: a.id, left: true });
  });
  it('previews the GC circle, warns before shrinking and bypasses shields outside it', () => {
    const m = match(), r = raw(m), initial = m.snapshot().pvp.royale!.zone!;
    expect(initial.dps).toBe(0); expect(initial.targetR).toBeLessThan(initial.r); expect(initial.shrinkStart).toBe(royaleTimeline(4).start);
    advance(m, initial.shrinkStart - 4.9); expect(m.snapshot().events.some(e => e.type === 'telegraph' && e.attackId === 'gc-sweep')).toBe(true);
    for (const player of r.state.players) { player.x = initial.cx; player.y = initial.cy; }
    advance(m, initial.shrinkEnd - 10 - r.state.t); const zone = r.state.pvp.royale!.zone!, p = r.state.players.find(p => p.alive)!;
    p.x = 32; p.y = 32; p.invuln = 999; const resources = p.hp + p.armor, before = zone.r;
    advance(m, 0.3); expect(p.hp + p.armor).toBeLessThan(resources); expect(zone.r).toBeLessThan(before); expect(zone.dps).toBeGreaterThan(0);
    expect(p.killedBy).toBeNull();
  });
  it('makes bots steer into the closing zone rather than chase an unsafe opponent', () => {
    const m = match(), s = m.snapshot(), p = s.players[0], zone = s.pvp.royale!.zone!;
    s.t = 80; zone.r = 35; p.x = zone.cx + 100; p.y = zone.cy;
    const input = createBot(901, 0.7)(s, p);
    expect(input.move[0]).toBeLessThan(-0.8); expect(Math.abs(input.move[1])).toBeLessThan(0.1);
  });
  it.each([2, 4, 8])('ends a %ip stationary stall with exactly one survivor, unique placements and no quizzes', count => {
    const m = match(count), deadline = royaleTimeline(count).limit; advance(m, deadline + 1); const s = m.snapshot();
    expect(m.over).toBe(true); expect(s.t).toBeLessThanOrEqual(deadline + 1e-6);
    expect(s.players.filter(p => p.alive)).toHaveLength(1); expect(s.pvp.royale!.alive).toHaveLength(1);
    expect(Object.values(s.pvp.royale!.placements).sort((a, b) => a - b)).toEqual(Array.from({ length: count }, (_, i) => i + 1));
    expect(s.pvp.round).toBe(1); expect(s.perkOffer).toBeNull(); expect(s.events.some(e => e.type === 'lesson' || e.type === 'revived')).toBe(false);
    expect(s.pvp.royale!.eliminations.every(e => e.by === null && e.reason === 'zone')).toBe(true);
    expect(s.players.some(p => p.stats.killingBlow)).toBe(false);
  });
  it('finishes camping at the exact zone center, including equal-health simultaneous GC deaths', () => {
    const m = match(8), r = raw(m), zone = r.state.pvp.royale!.zone!;
    for (const p of r.state.players) { p.x = zone.cx; p.y = zone.cy; p.hp = 7; p.armor = 0; p.kit.maxHp = 7; p.kit.maxArmor = 0; }
    advance(m, royaleTimeline(8).limit + 1); expect(m.over).toBe(true); expect(m.snapshot().players.filter(p => p.alive)).toHaveLength(1);
    expect(m.snapshot().t).toBeGreaterThan(zone.shrinkEnd); expect(m.snapshot().pvp.royale!.winner).toBeTruthy();
  });
  it('enforces the final cleanup deadline even for custom huge-health kits', () => {
    const m = match(), r = raw(m); for (const p of r.state.players) p.hp = p.kit.maxHp = 1e9;
    advance(m, 153); expect(m.over).toBe(true); expect(m.snapshot().players.filter(p => p.alive)).toHaveLength(1);
    expect(m.snapshot().pvp.royale!.eliminations.some(e => e.reason === 'timeout')).toBe(true);
  });
  it.each([2, 4, 8])('replays normal-input %ip bots deterministically, with bounded state and sensible combat', count => {
    const play = () => {
      const m = match(count), bots = roster(count).map((_, i) => createBot(1901 + i * 37, 0.7)); let maxBullets = 0, hit = 0;
      while (!m.over) {
        const s = m.snapshot(); maxBullets = Math.max(maxBullets, s.bullets.length); hit += s.events.filter(e => e.type === 'hit' && e.source !== 'gc-sweep').length;
        expect(s.players.every(p => Number.isFinite(p.x + p.y + p.hp + p.armor + p.energy))).toBe(true);
        m.step(1 / 30, new Map(s.players.map((p, i) => [p.id, bots[i](s, p)])));
      }
      return { state: m.snapshot(), report: m.autopsy(), maxBullets, hit };
    };
    const a = play(), b = play(); expect(a).toEqual(b); expect(a.maxBullets).toBeLessThanOrEqual(1200);
    expect(a.hit).toBeGreaterThan(0); expect(a.report.mvp).toBeTruthy(); expect(a.state.players.filter(p => p.alive)).toHaveLength(1);
  });
});
