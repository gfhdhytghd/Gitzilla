import { describe, expect, it } from 'vitest';
import { createBot, createReferenceBot, loadBalanceProfiles, syntheticProfile } from './bots.ts';
import { createPvpController } from './pvpAi.ts';
import { asPvpAiKit, statsFromPower } from './pvpPower.ts';
import { playerKitFromProfile, bossKitFromProfile } from './kits.ts';
import { asBattleKit, asClassroomKit, type ClassroomKit } from './quality.ts';
import { createMatch } from './match.ts';

const kit = () => playerKitFromProfile(loadBalanceProfiles()[0], { mode: 'pvp' }) as ClassroomKit;
function fixture() {
  return createMatch([{ id: 'bot-0', name: 'AI', kit: kit() }, { id: 'human', name: 'Human', kit: kit() }, { id: 'bot-1', name: 'AI', kit: kit() }], null, { mode: 'pvp' });
}
describe('softer PvP AI and honest power handicap', () => {
  it('applies score×.8 exactly once, keeps the raw signals visible, and removes the handicap outside PvP', () => {
    for (const p of loadBalanceProfiles()) {
      const ordinary = playerKitFromProfile(p, { mode: 'pvp' }) as ClassroomKit, ai = asPvpAiKit(ordinary);
      expect(ai.pvpAi).toEqual({ baseScore: ordinary.pvpPower!.score, powerMultiplier: 0.8 });
      expect(ai.pvpPower!.score).toBe(Math.round(ordinary.pvpPower!.score * 8) / 10);
      expect(ai.pvpPower!.parts).toEqual(ordinary.pvpPower!.parts); expect(asPvpAiKit(ai)).toEqual(ai);
      for (const [key, value] of Object.entries(statsFromPower(ai.pvpPower!.score))) expect(ai[key as keyof typeof ai]).toBe(value);
      expect(asBattleKit(ai)).toEqual(playerKitFromProfile(p)); expect(asClassroomKit(ai)).toEqual(playerKitFromProfile(p, { mode: 'edu' }));
      const m = createMatch([{ id: 'human', name: 'H', kit: ordinary }, { id: 'bot-1', name: 'AI', kit: ai }], null, { mode: 'pvp' });
      expect(m.snapshot().players[1].kit).toEqual(ai); expect(m.snapshot().players[0].kit).toEqual(ordinary);
    }
  });
  it('recognizes authoritative bot IDs even if a caller omitted the lobby marker', () => {
    const ordinary = kit(), m = createMatch([{ id: 'human', name: 'H', kit: ordinary }, { id: 'bot-fallback', name: 'AI', kit: ordinary }], null, { mode: 'pvp' });
    expect((m.snapshot().players[1].kit as ClassroomKit).pvpAi!.powerMultiplier).toBe(0.8);
    expect((m.snapshot().players[0].kit as ClassroomKit).pvpAi).toBeUndefined();
  });
  it('replays finite inputs with350–500ms decisions, bounded aim error, pauses and one-use edges', () => {
    const s = fixture().snapshot(), p = s.players[0], a = createPvpController(123), b = createPvpController(123);
    let shots = 0, pauses = 0, previousChange = -1, previousAim = '';
    for (let i = 0; i < 1800; i++) {
      s.t = i / 30; const input = a(s, p); expect(input).toEqual(b(s, p));
      expect(Number.isFinite(input.move[0] + input.move[1] + input.aim![0] + input.aim![1])).toBe(true);
      const aim = JSON.stringify(input.aim);
      if (aim !== previousAim) { if (previousChange >= 0) expect(s.t - previousChange).toBeGreaterThanOrEqual(0.35 - 1e-6); previousChange = s.t; previousAim = aim; }
      if (input.fire) shots++; else pauses++;
    }
    expect(a.metrics.minReaction).toBeGreaterThanOrEqual(0.35); expect(a.metrics.maxReaction).toBeLessThanOrEqual(0.5);
    expect(a.metrics.maxAimError).toBeGreaterThan(10); expect(a.metrics.maxAimError).toBeLessThanOrEqual(14);
    expect(shots).toBeGreaterThan(0); expect(pauses).toBeGreaterThan(0); expect(shots / (shots + pauses)).toBeLessThan(0.9);
  });
  it('makes only one40% dodge decision per threat instead of retrying every frame until successful', () => {
    const s = fixture().snapshot(), p = s.players[0], ai = createPvpController(777); p.x = 200; p.y = 120;
    for (let i = 0; i < 1000; i++) {
      s.t = 2 + i * 0.6; s.bullets = [{ id: 10000 + i, owner: 'human', kind: 'blaster', x: 225, y: 120, vx: -100, vy: 0, r: 3 }];
      ai(s, p); ai(s, p); ai(s, p);
    }
    expect(ai.metrics.threats).toBe(1000); expect(ai.metrics.dodges / ai.metrics.threats).toBeGreaterThan(0.35);
    expect(ai.metrics.dodges / ai.metrics.threats).toBeLessThan(0.45);
  });
  it('prefers another AI about half the time when a human is nearest and both groups are available', () => {
    const s = fixture().snapshot(), p = s.players[0], ai = createPvpController(445); p.x = 200; p.y = 120;
    s.players[1].x = 220; s.players[1].y = 120; s.players[2].x = 350; s.players[2].y = 120;
    for (let i = 0; i < 1000; i++) { s.t = 2 + i * 3; ai(s, p); }
    expect(ai.metrics.mixedChoices).toBe(1000);
    expect(ai.metrics.forcedBotChoices / ai.metrics.mixedChoices).toBeGreaterThan(0.45);
    expect(ai.metrics.forcedBotChoices / ai.metrics.mixedChoices).toBeLessThan(0.55);
    expect(ai.metrics.botTargets / (ai.metrics.botTargets + ai.metrics.humanTargets)).toBeGreaterThan(0.45);
  });
  it.each(['battle', 'edu'] as const)('keeps every previous %s input frame unchanged', mode => {
    const profile = syntheticProfile(4), roster = ['p0', 'p1', 'p2', 'p3'].map(id => ({ id, name: id, kit: playerKitFromProfile(profile) }));
    const match = mode === 'battle' ? createMatch(roster, bossKitFromProfile(profile, 4)) : createMatch(roster, null, { mode: 'edu' });
    const fresh = roster.map((_, i) => createBot(1009 + i * 37)), old = roster.map((_, i) => createReferenceBot(1009 + i * 37));
    for (let i = 0; i < 600 && !match.over; i++) {
      const s = match.snapshot(); const frames = s.players.map((p, j) => { const frame = fresh[j](s, p); expect(frame).toEqual(old[j](s, p)); return [p.id, frame] as const; });
      match.step(1 / 30, new Map(frames));
    }
  });
});
