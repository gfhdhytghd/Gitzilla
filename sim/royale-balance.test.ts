import { describe, expect, it } from 'vitest';
import type { InputFrame, PlayerKit, PlayerState } from '../shared/types.ts';
import { focusedFireTrials } from './royale-bots.ts';
import { ROYALE_TUNING } from './royale-balance.ts';
import { createMatch } from './match.ts';
import { playerKitFromProfile, bossKitFromProfile } from './kits.ts';
import { syntheticProfile } from './bots.ts';
import type { ClassroomState } from './pvp.ts';

const frame = (patch: Partial<InputFrame> = {}): InputFrame => ({ seq: 1, move: [0, 0], aim: null, fire: false, dash: false, skill: false, source: 'keyboard', ...patch });
const roster = (): { id: string; name: string; kit: PlayerKit }[] => Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, kit: { ...playerKitFromProfile(syntheticProfile(i + 1)), weapon: 'blaster' } }));
const advance = (m: ReturnType<typeof createMatch>, seconds: number) => { for (let i = 0; i < seconds * 30 && !m.over; i++) m.step(1 / 30, new Map()); };
const raw = (m: ReturnType<typeof createMatch>) => m as unknown as { state: ClassroomState; hurt(p: PlayerState, source: PlayerState, base: number, dir: [number, number]): void };

describe('PvP defensive balance', () => {
  for (const result of focusedFireTrials()) it(`${result.weapon} needs4–6s of close sustained focused fire, with no two-hit kills`, () => {
    expect(result.eliminated).toBe(true); expect(result.seconds).toBeGreaterThanOrEqual(4); expect(result.seconds).toBeLessThanOrEqual(6);
    expect(result.impacts).toBeGreaterThanOrEqual(4);
  });
  it('a dash absorbs an incoming shot, keeps resources intact, and recovers on the PvP cooldown', () => {
    const m = createMatch(roster(), null, { mode: 'pvp' }); advance(m, 4.1); const r = raw(m), [a, b] = r.state.players;
    a.x = 180; a.y = 128; b.x = 220; b.y = 128; const resources = b.hp + b.armor;
    m.step(1 / 30, new Map([[a.id, frame({ fire: true, aim: [1, 0] })], [b.id, frame({ dash: true, move: [-1, 0] })]]));
    expect(b.invuln).toBeGreaterThanOrEqual(ROYALE_TUNING.dashShield - 1e-6);
    advance(m, 0.3); expect(b.hp + b.armor).toBe(resources); expect(a.stats.damage).toBe(0);
    expect(m.snapshot().bullets.some(shot => shot.owner === a.id)).toBe(false);
    advance(m, 0.85); expect(b.dashCd).toBe(0);
  });
  it('armor break offers a real escape window, then a clean disengagement recharges armor', () => {
    const m = createMatch(roster(), null, { mode: 'pvp' }); advance(m, 4.1); const r = raw(m), [a, b] = r.state.players;
    b.armor = 0.1; r.hurt(b, a, 1, [1, 0]); const hp = b.hp;
    expect(b.invuln).toBe(ROYALE_TUNING.armorBreakShield); r.hurt(b, a, 1, [1, 0]); expect(b.hp).toBe(hp);
    advance(m, ROYALE_TUNING.armorDelay - 0.1); expect(b.armor).toBe(0);
    advance(m, ROYALE_TUNING.armorInterval + 0.2); expect(b.armor).toBeGreaterThanOrEqual(1);
    advance(m, ROYALE_TUNING.armorInterval * 3); expect(b.armor).toBeGreaterThanOrEqual(3); expect(b.hp).toBe(hp);
  });
  it.each(['edu', 'battle'] as const)('does not change any observable %s replay when PvP knobs change', mode => {
    const play = () => {
      const players = roster(); players[0].kit.weapon = 'staff';
      const m = mode === 'edu' ? createMatch(players, null, { mode: 'edu' }) : createMatch(players, bossKitFromProfile(syntheticProfile(4), 4));
      for (let i = 0; i < 600 && !m.over; i++) m.step(1 / 30, new Map(players.map(p => [p.id, frame({ fire: true, dash: i % 70 === 0, move: [Math.sin(i / 100), Math.cos(i / 100)] })])));
      return m.snapshot();
    };
    const before = play(), saved = { ...ROYALE_TUNING };
    try {
      Object.assign(ROYALE_TUNING, { weaponDamage: 5, armorDelay: 0, armorInterval: 0, dashCooldown: 0.1, dashShield: 8, armorBreakShield: 9, homingTurn: 20, assistCone: 3, assistSnap: 3, assistTurn: 20, assistCredit: 100, fullDamageRange: 100, falloffRange: 200, rangedDamage: 0 });
      expect(play()).toEqual(before);
    } finally { Object.assign(ROYALE_TUNING, saved); }
  });
});
