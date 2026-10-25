import { describe, expect, it } from 'vitest';
import { createGestureState, gravityMove, orientationGravity, gravityTilt, normalize, recognizeGesture, removeGravity, screenTilt, tiltMove } from './gestures';

function trace(samples: [number, number, number, number][]) {
  let state = createGestureState();
  return samples.map(([time, x, y, z]) => {
    const result = recognizeGesture(state, { x, y, z }, time);
    state = result.state;
    return result;
  });
}

describe('circle-safe swing recognizer', () => {
  it.each([[15, 0, 0], [-15, 0, 0], [0, 15, 0], [0, -15, 0], [0, 0, 15], [0, 0, -15]])
    ('attacks for axis direction (%s, %s, %s), never dash/skill', (x, y, z) => {
      const frames = trace([[0, x, y, z], [30, 0, 0, 0], [629, 0, 0, 0], [630, 0, 0, 0]]);
      expect(frames.map(f => f.fire)).toEqual([false, true, true, false]);
      expect(frames.map(f => f.fired)).toEqual([false, true, false, false]);
      expect(frames.every(f => !f.dash && !f.skill)).toBe(true);
    });
  it('uses vector magnitude for diagonal swings and ignores low jitter', () => {
    expect(trace([[0, 8, 8, 8], [30, 0, 0, 0]])[1].fired).toBe(true);
    expect(trace([[0, 3, 4, 2], [100, 11, 0, 0]]).some(f => f.fire)).toBe(false);
  });
  it('debounces sustained peaks and requires 200ms between attacks', () => {
    const frames = trace([[0, 15, 0, 0], [80, 0, 0, 0], [100, 15, 0, 0], [150, 0, 0, 0],
      [300, 15, 0, 0], [330, 0, 0, 0], [1000, 0, 0, 0]]);
    expect(frames.map(f => f.fired)).toEqual([false, true, false, false, false, true, false]);
    expect(frames.at(-1)?.fire).toBe(false);
  });
  it('recognizes direct reversals as attacks instead of shake skills', () => {
    const frames = trace([[0, 15, 0, 0], [130, 15, 0, 0], [350, -15, 0, 0], [480, -15, 0, 0], [700, 15, 0, 0], [830, 15, 0, 0]]);
    expect(frames.filter(f => f.fired)).toHaveLength(3);
    expect(frames.every(f => !f.dash && !f.skill)).toBe(true);
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
  it.each([[0, 0], [0.5, 0], [7.5, 0.5], [15, 1], [30, 1]])('horizontal angle %s° maps linearly to %s speed', (angle, speed) => {
    const move = gravityMove(orientationGravity(0, angle));
    expect(move[0]).toBeCloseTo(speed); expect(move[1]).toBeCloseTo(0);
  });
  it.each([[0, 15, 1, 0], [0, -15, -1, 0], [15, 0, 0, 1], [-15, 0, 0, -1]])
    ('beta=%s gamma=%s follows downhill x=%s y=%s', (beta, gamma, x, y) => {
      const move = gravityMove(orientationGravity(beta, gamma));
      expect(move[0]).toBeCloseTo(x); expect(move[1]).toBeCloseTo(y);
    });
  it('rotates downhill into screen coordinates, supports opposite gravity polarity and vertical poses', () => {
    const upright = orientationGravity(89.99, 45);
    expect(Math.hypot(...gravityMove(upright))).toBeCloseTo(1);
    expect(gravityMove(upright).every(Number.isFinite)).toBe(true);
    const g = orientationGravity(-15, 0);
    expect(gravityMove(g, 90)[0]).toBeCloseTo(-1);
    expect(gravityMove({ x: -g.x, y: -g.y, z: -g.z }, 0, -1)).toEqual(gravityMove(g));
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
  it('never subtracts a stored upright neutral from horizontal movement', () => {
    expect(tiltMove([0, 0], [45, 0])).toEqual([0, 0]);
    expect(tiltMove([0, 45], [0, 45])[1]).toBeCloseTo(1);
  });
});
