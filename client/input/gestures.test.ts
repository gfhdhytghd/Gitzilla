import { describe, expect, it } from 'vitest';
import { createGestureState, normalize, recognizeGesture, removeGravity, screenTilt, tiltMove } from './gestures';
import type { Acceleration } from './gestures';

function trace(samples: [number, number, number, number][]) {
  let state = createGestureState();
  return samples.map(([time, x, y, z]) => {
    const result = recognizeGesture(state, { x, y, z }, time);
    state = result.state;
    return result;
  });
}

describe('pure gesture recognizer', () => {
  it('holds fire for 600ms after a forward thrust, without extending on a sustained peak', () => {
    const frames = trace([[100, 0, 0, 9], [300, 0, 0, 9], [699, 0, 0, 0], [700, 0, 0, 0]]);
    expect(frames.map(f => f.fire)).toEqual([true, true, true, false]);
    expect(frames.every(f => !f.dash && !f.skill)).toBe(true);
  });
  it('ignores reverse thrust and small sensor jitter', () => {
    expect(trace([[0, 1, 2, 3], [50, 0, 0, -12], [100, 0, 0, 0]])
      .every(f => !f.fire && !f.dash && !f.skill)).toBe(true);
  });
  it('emits a single dash per swing with a refractory period', () => {
    const frames = trace([[0, 12, 0, 0], [20, 12, 0, 0], [100, 0, 0, 0], [200, -12, 0, 0],
      [300, 0, 0, 0], [700, -12, 0, 0]]);
    expect(frames.map(f => f.dash)).toEqual([true, false, false, false, false, true]);
  });
  it('recognizes three alternating peaks inside 600ms, including direct reversals', () => {
    const frames = trace([[0, 0, 16, 0], [150, 0, -16, 0], [300, 0, 16, 0],
      [400, 0, -16, 0], [500, 0, 16, 0], [600, 0, -16, 0]]);
    expect(frames.map(f => f.skill)).toEqual([false, false, true, false, false, false]);
  });
  it('requires alternating signs and rejects slow shakes', () => {
    const repeated = trace([[0, 0, 16, 0], [50, 0, 0, 0], [100, 0, 16, 0], [150, 0, 0, 0], [200, 0, 16, 0]]);
    const slow = trace([[0, 0, 16, 0], [400, 0, -16, 0], [800, 0, 16, 0]]);
    expect([...repeated, ...slow].some(f => f.skill)).toBe(false);
  });
  it('allows another shake after skill refractory expires', () => {
    const frames = trace([[0, 0, 16, 0], [100, 0, -16, 0], [200, 0, 16, 0], [300, 0, 0, 0],
      [1500, 0, 16, 0], [1600, 0, -16, 0], [1700, 0, 16, 0]]);
    expect(frames.filter(f => f.skill)).toHaveLength(2);
  });
  it('does not mutate the previous state', () => {
    const previous = createGestureState();
    const a = { x: 0, y: 16, z: 0 };
    const result = recognizeGesture(previous, a, 0);
    expect(previous.peaks).toEqual([]);
    expect(previous.peakHeld).toBe(false);
    expect(result.state.peaks).toHaveLength(1);
  });
});

describe('tilt and acceleration processing', () => {
  it('rotates both landscape directions and upside-down portrait', () => {
    expect(screenTilt(10, 20, 0)).toEqual([20, 10]);
    const left = screenTilt(10, 20, 90);
    const right = screenTilt(10, 20, 270);
    expect(left[0]).toBeCloseTo(10);
    expect(left[1]).toBeCloseTo(-20);
    expect(right[0]).toBeCloseTo(-10);
    expect(right[1]).toBeCloseTo(20);
    expect(screenTilt(10, 20, 180)[0]).toBeCloseTo(-20);
  });
  it('uses calibrated neutral, radial 5° deadzone and 25° saturation', () => {
    expect(tiltMove([34, 20], [30, 20])).toEqual([0, 0]);
    expect(tiltMove([45, 20], [30, 20])).toEqual([0.5, 0]);
    expect(tiltMove([55, 20], [30, 20])).toEqual([1, 0]);
    expect(Math.hypot(...tiltMove([90, 90], [0, 0]))).toBeCloseTo(1);
    expect(normalize(1, -1)[0]).toBeCloseTo(Math.SQRT1_2);
    expect(normalize(1, -1)[1]).toBeCloseTo(-Math.SQRT1_2);
  });
  it('subtracts resting gravity and preserves a short impulse', () => {
    const resting: Acceleration = { x: 0, y: 0, z: 9.81 };
    const first = removeGravity(resting, null);
    expect(first.acceleration).toEqual({ x: 0, y: 0, z: 0 });
    const next = removeGravity(resting, first.gravity);
    expect(next.acceleration.z).toBeCloseTo(0);
    const impulse = removeGravity({ x: 0, y: 0, z: 20 }, next.gravity);
    expect(impulse.acceleration.z).toBeGreaterThan(7);
  });
});
