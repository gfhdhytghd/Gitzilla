import { expect, it } from 'vitest';
import { sanitizeInputFrame } from './input.ts';

it('drops frames without a safe nonnegative integer sequence', () => {
  for (const value of [null, [], {}, { seq: -1 }, { seq: 1.5 }, { seq: Infinity }, { seq: '1' }, { seq: Number.MAX_SAFE_INTEGER + 1 }]) {
    expect(sanitizeInputFrame(value)).toBeNull();
  }
});
it('replaces malformed/nonfinite movement and aim, coerces flags, and discards extra fields', () => {
  const result = sanitizeInputFrame({ seq: 2, move: [NaN, Infinity], aim: {}, fire: 'yes', dash: 0, skill: [], source: {}, extra: { anything: true } });
  expect(result).toEqual({ seq: 2, move: [0, 0], aim: null, fire: true, dash: false, skill: true, source: 'keyboard' });
  for (const aim of [undefined, {}, 'oops', [1], [1, 2, 3], ['oops', 0], [NaN, 0], [Infinity, 1], [0, 0]]) {
    expect(sanitizeInputFrame({ seq: 1, move: {}, aim })?.aim).toBeNull();
  }
});
it('clamps and normalizes movement, and normalizes finite aim without overflow', () => {
  const frame = sanitizeInputFrame({ seq: 3, move: [1000, -1000], aim: [3, 4], source: 'motion' })!;
  expect(Math.hypot(...frame.move)).toBeCloseTo(1);
  expect(frame.move.every(n => Number.isFinite(n) && Math.abs(n) <= 1)).toBe(true);
  expect(frame.aim).toEqual([0.6, 0.8]);
  expect(frame.source).toBe('motion');
  for (const magnitude of [Number.MAX_VALUE, Number.MIN_VALUE]) {
    const aim = sanitizeInputFrame({ seq: 1, aim: [magnitude, -magnitude] })!.aim!;
    expect(aim.every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...aim)).toBeCloseTo(1);
  }
});
