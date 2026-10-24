import { describe, expect, it } from 'vitest';
import { createGestureState, gravityTilt, normalize, recognizeGesture, removeGravity, screenTilt, tiltMove } from './gestures';

function trace(samples: [number, number, number, number][]) {
  let state = createGestureState();
  return samples.map(([time, x, y, z]) => {
    const result = recognizeGesture(state, { x, y, z }, time);
    state = result.state;
    return result;
  });
}

describe('motion-v2 swing recognizer', () => {
  it.each([[15, 0, 0], [-15, 0, 0], [0, 15, 0], [0, -15, 0], [0, 0, 15], [0, 0, -15]])
    ('attacks for axis direction (%s, %s, %s), never dash/skill', (x, y, z) => {
      const frames = trace([[0, x, y, z], [100, x, y, z], [599, 0, 0, 0], [600, 0, 0, 0]]);
      expect(frames.map(f => f.fire)).toEqual([true, true, true, false]);
      expect(frames.map(f => f.fired)).toEqual([true, false, false, false]);
      expect(frames.every(f => !f.dash && !f.skill)).toBe(true);
    });
  it('uses vector magnitude for diagonal swings and ignores low jitter', () => {
    expect(trace([[0, 8, 8, 8]])[0].fired).toBe(true);
    expect(trace([[0, 3, 4, 2], [100, 11, 0, 0]]).some(f => f.fire)).toBe(false);
  });
  it('debounces sustained peaks and requires 200ms between attacks', () => {
    const frames = trace([[0, 15, 0, 0], [80, 0, 0, 0], [100, 15, 0, 0], [150, 0, 0, 0],
      [220, 15, 0, 0], [1000, 15, 0, 0]]);
    expect(frames.map(f => f.fired)).toEqual([true, false, false, false, true, false]);
    expect(frames.at(-1)?.fire).toBe(false);
  });
  it('recognizes direct reversals as attacks instead of shake skills', () => {
    const frames = trace([[0, 15, 0, 0], [220, -15, 0, 0], [440, 15, 0, 0]]);
    expect(frames.every(f => f.fired && !f.dash && !f.skill)).toBe(true);
  });
  it('does not mutate previous state or sensor samples', () => {
    const previous = createGestureState();
    const a = Object.freeze({ x: 0, y: 16, z: 0 });
    const result = recognizeGesture(previous, a, 0);
    expect(previous.lastPeak).toBeNull();
    expect(previous.peakHeld).toBe(false);
    expect(result.state.lastPeak).toEqual(a);
  });
});

describe('screen-relative tilt', () => {
  it.each([[0, 0, 20], [90, 20, 0], [180, 0, -20], [270, -20, 0]])
    ('tilt toward screen-right at %s° gives positive x', (angle, beta, gamma) => {
      const [x, y] = screenTilt(beta, gamma, angle);
      expect(x).toBeCloseTo(20);
      expect(y).toBeCloseTo(0);
    });
  it.each([[0, 20, 0], [90, 0, -20], [180, -20, 0], [270, 0, 20]])
    ('tilt toward screen-bottom at %s° gives positive y', (angle, beta, gamma) => {
      const [x, y] = screenTilt(beta, gamma, angle);
      expect(x).toBeCloseTo(0);
      expect(y).toBeCloseTo(20);
    });
  it('avoids a discontinuity when Euler beta wraps at ±180°', () => {
    const before = screenTilt(179, 10, 90);
    const after = screenTilt(-179, 10, 90);
    expect(Math.hypot(before[0] - after[0], before[1] - after[1])).toBeLessThan(3);
  });
  it('uses a 4° deadzone and saturates at 20° relative to neutral', () => {
    expect(tiltMove([34, 20], [30, 20])).toEqual([0, 0]);
    expect(tiltMove([42, 20], [30, 20])).toEqual([0.5, 0]);
    expect(tiltMove([50, 20], [30, 20])).toEqual([1, 0]);
    expect(Math.hypot(...tiltMove([90, 90], [0, 0]))).toBeCloseTo(1);
    expect(normalize(1, -1)[0]).toBeCloseTo(Math.SQRT1_2);
  });
  it('subtracts resting gravity, preserves impulses and supports opposite platform gravity signs', () => {
    const resting = { x: 0, y: 0, z: 9.81 };
    const first = removeGravity(resting, null);
    expect(first.acceleration).toEqual({ x: 0, y: 0, z: 0 });
    const impulse = removeGravity({ x: 0, y: 0, z: 25 }, first.gravity);
    expect(impulse.acceleration.z).toBeGreaterThan(12);
    const up = gravityTilt({ x: -3.35, y: 0, z: 9.22 }, 0, 1);
    const inverted = gravityTilt({ x: 3.35, y: 0, z: -9.22 }, 0, -1);
    expect(up[0]).toBeCloseTo(20, 0);
    expect(up[0]).toBeCloseTo(inverted[0]);
    expect(up[1]).toBeCloseTo(inverted[1]);
  });
  it('keeps full roll and pitch sensitivity at an upright portrait neutral', () => {
    const neutral = screenTilt(45, 0, 0);
    expect(tiltMove(screenTilt(45, 20, 0), neutral)[0]).toBeCloseTo(1);
    expect(tiltMove(screenTilt(45, -20, 0), neutral)[0]).toBeCloseTo(-1);
    expect(tiltMove(screenTilt(65, 0, 0), neutral)[1]).toBeCloseTo(1);
    expect(tiltMove(screenTilt(25, 0, 0), neutral)[1]).toBeCloseTo(-1);
  });
});
