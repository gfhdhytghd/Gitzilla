import { describe, expect, it } from 'vitest';
import type { InputFrame } from '../shared/types.ts';
import { safeInput } from './input.ts';
import { createMatch } from './match.ts';
import { bossKitFromProfile, playerKitFromProfile } from './kits.ts';
import { syntheticProfile } from './bots.ts';

describe('QA-NET-01 sim boundary', () => {
  it.each([null, undefined, true, 42, 'bad', {}, [], [0], [1, 0, 0], ['1', 0], [NaN, 0], [0, Infinity], Array(2), { length: 2, 0: 1, 1: 0 }])
    ('turns malformed vectors into stationary movement and auto-aim (%j)', bad => {
      expect(safeInput({ move: bad, aim: bad })).toMatchObject({ move: [0, 0], aim: null });
    });
  it('handles malformed whole frames and strict action flags without mutating caller data', () => {
    for (const value of [null, undefined, 10, 'bad', [], { fire: 'yes', dash: [], skill: 1 }]) {
      expect(safeInput(value)).toMatchObject({ move: [0, 0], aim: null, fire: false, dash: false, skill: false });
    }
    const frame: InputFrame = { seq: 1, move: [0.25, -0.5], aim: [1, 0], fire: true, dash: true, skill: false, source: 'touch' };
    const copy = structuredClone(frame), safe = safeInput(frame);
    expect(safe).toEqual(frame); safe.move[0] = 0;
    expect(frame).toEqual(copy);
  });
  it('normalizes huge finite vectors without overflowing and treats zero aim as auto-aim', () => {
    const safe = safeInput({ move: [Number.MAX_VALUE, Number.MAX_VALUE], aim: [Number.MAX_VALUE, -Number.MAX_VALUE] });
    expect(Math.hypot(...safe.move)).toBeCloseTo(1); expect(Math.hypot(...safe.aim!)).toBeCloseTo(1);
    expect(safe.aim![1]).toBeLessThan(0); expect(safeInput({ aim: [0, 0] }).aim).toBeNull();
  });
  it('keeps real Match.step alive and finite for the malformed-aim repro and poisoned moves', () => {
    const p = syntheticProfile(), kit = playerKitFromProfile(p);
    const m = createMatch([{ id: 'p', name: 'p', kit }], bossKitFromProfile(p, 1));
    for (let i = 0; i < 61; i++) m.step(1 / 30, new Map());
    const before = m.snapshot().players[0];
    for (const frame of [{ aim: {}, move: [0, 0], fire: true }, { aim: null, move: [NaN, Infinity] }, null, { aim: 'bad', move: [1] }]) {
      expect(() => m.step(1 / 30, new Map([['p', frame as unknown as InputFrame]]))).not.toThrow();
      const state = m.snapshot(), hero = state.players[0];
      expect(hero.x).toBe(before.x); expect(hero.y).toBe(before.y);
      expect([hero.x, hero.y, ...hero.facing, ...state.bullets.flatMap(b => [b.x, b.y, b.vx, b.vy])].every(Number.isFinite)).toBe(true);
    }
    expect(m.over).toBe(false);
  });
});
