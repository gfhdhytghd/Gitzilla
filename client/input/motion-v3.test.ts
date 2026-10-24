import { describe, expect, it } from 'vitest';
import { createGestureState, recognizeGesture, removeGravity, type Acceleration, type RotationRate } from './gestures';
import { createTouchGestureState, recognizeTouch, type TouchSignal } from './touch-gestures';
import { createCalibrationRecorder } from './calibration';
import { defaultThresholds, loadThresholds, saveThresholds, sanitizeThresholds } from './thresholds';
import { createTraceBuffer } from './trace';
const zero = { x: 0, y: 0, z: 0 };
const rate = (axis: keyof RotationRate, speed: number): RotationRate => ({ alpha: 0, beta: 0, gamma: 0, [axis]: speed });
function gyroTrace(segments: [number, number][], axis: keyof RotationRate = 'alpha', interval = 20, acceleration: Acceleration = zero) {
  let state = createGestureState(), at = 0;
  const frames = [recognizeGesture(state, zero, 0, 'standard', rate(axis, 0))]; state = frames[0].state;
  for (const [duration, speed] of segments) for (let elapsed = 0; elapsed < duration; elapsed += interval) {
    at += interval; const frame = recognizeGesture(state, acceleration, at, 'standard', rate(axis, speed)); state = frame.state; frames.push(frame);
  }
  return frames;
}
describe('motion v3 rotation classification', () => {
  it.each(['alpha', 'beta', 'gamma'] as const)('twist-return on %s produces exactly one settled dash, never skill', axis => {
    const frames = gyroTrace([[100, 300], [100, -300], [180, 0]], axis);
    expect(frames.filter(f => f.dash)).toHaveLength(1);
    expect(frames.every(f => !f.skill && !f.fired)).toBe(true);
    expect(frames.slice(0, 11).every(f => !f.dash)).toBe(true);
  });
  it.each([16, 30, 60])('integrates deg/s at %sms: spins emit one skill and zero dashes', interval => {
    const frames = gyroTrace([[600, 600], [200, 0]], 'beta', interval);
    expect(frames.filter(f => f.skill)).toHaveLength(1);
    expect(frames.every(f => !f.dash)).toBe(true);
  });
  it('never dashes on the start, ending or reversal of a spin, including >120° sub-skill turns', () => {
    for (const frames of [gyroTrace([[300, 600], [300, -600], [300, 0]]), gyroTrace([[350, 500], [350, -500], [300, 0]])]) {
      expect(frames.every(f => !f.dash)).toBe(true);
    }
  });
  it('allows a 90 degree wrist turn and return: net excursion stays below 120 degrees', () => {
    const frames = gyroTrace([[150, 600], [150, -600], [140, 0]]);
    expect(frames.filter(f => f.dash)).toHaveLength(1);
    expect(frames.every(f => !f.skill)).toBe(true);
  });
  it('does not dash on a single unreturned twist or gradual turning/walking', () => {
    expect(gyroTrace([[150, 300], [200, 0]]).some(f => f.dash)).toBe(false);
    expect(gyroTrace([[2000, 30], [2000, -30], [200, 0]]).some(f => f.dash || f.skill)).toBe(false);
    expect(gyroTrace([[4000, 60], [300, 0]]).some(f => f.skill)).toBe(false);
  });
  it('suppresses twist dashes while swinging and never treats one swing as a skill', () => {
    const frames = gyroTrace([[100, 300], [100, -300], [180, 0]], 'gamma', 20, { x: 18, y: 0, z: 0 });
    expect(frames.some(f => f.fired)).toBe(true);
    expect(frames.every(f => !f.dash && !f.skill)).toBe(true);
  });
  it('does not integrate stale timestamps across sensor loss and leaves previous state immutable', () => {
    const previous = createGestureState();
    const first = recognizeGesture(previous, zero, 0, 'standard', rate('alpha', 600));
    const afterGap = recognizeGesture(first.state, zero, 5000, 'standard', rate('alpha', 600));
    expect(afterGap.skill).toBe(false); expect(afterGap.spinDegrees).toBe(0);
    expect(previous.rotation.started).toBeNull(); expect(previous.rotation.samples).toEqual([]);
  });
  it('works without gyro, and gravity high-pass detects iOS null-acceleration impulses', () => {
    let state = createGestureState(); let gravity: Acceleration | null = null;
    for (let at = 0; at < 1000; at += 20) {
      const sample = removeGravity({ x: 0.1 * Math.sin(at), y: 6.9, z: 6.9 }, gravity); gravity = sample.gravity;
      const frame = recognizeGesture(state, sample.acceleration, at, 'standard', null); state = frame.state;
      expect(frame.fired || frame.dash || frame.skill).toBe(false);
    }
    const swing = removeGravity({ x: -20, y: 6.9, z: 6.9 }, gravity);
    expect(recognizeGesture(state, swing.acceleration, 1020).fired).toBe(true);
  });
});

function touchTrace(signals: TouchSignal[]) {
  let state = createTouchGestureState();
  return signals.map(signal => { const frame = recognizeTouch(state, signal); state = frame.state; return frame; });
}
describe('touch alternates without controls', () => {
  it('quick tap emits a 600ms attack request only after ruling out double-tap', () => {
    const frames = touchTrace([{ type: 'down', at: 0 }, { type: 'up', at: 100 }, { type: 'tick', at: 399 }, { type: 'tick', at: 400 }]);
    expect(frames.map(f => f.action)).toEqual([null, null, null, 'attack']);
  });
  it('double-tap dashes once, with no attack on either tap', () => {
    const frames = touchTrace([{ type: 'down', at: 0 }, { type: 'up', at: 60 }, { type: 'down', at: 200 }, { type: 'up', at: 240 }, { type: 'tick', at: 700 }]);
    expect(frames.map(f => f.action)).toEqual([null, null, null, 'dash', null]);
  });
  it('long-press charges, skills once at 550ms, never attacks during hold or release', () => {
    const frames = touchTrace([{ type: 'down', at: 0 }, { type: 'tick', at: 275 }, { type: 'tick', at: 550 }, { type: 'tick', at: 2000 }, { type: 'up', at: 2100 }, { type: 'tick', at: 3000 }]);
    expect(frames[1].charge).toBe(0.5); expect(frames.filter(f => f.action === 'skill')).toHaveLength(1);
    expect(frames.every(f => f.action !== 'attack' && f.action !== 'dash')).toBe(true);
  });
  it('second-tap held becomes skill, with no first-tap leak; drags/cancels never trigger actions', () => {
    expect(touchTrace([{ type: 'down', at: 0 }, { type: 'up', at: 60 }, { type: 'down', at: 160 }, { type: 'tick', at: 710 }, { type: 'up', at: 800 }]).map(f => f.action))
      .toEqual([null, null, null, 'skill', null]);
    const frames = touchTrace([{ type: 'down', at: 0, x: 0, y: 0 }, { type: 'move', at: 100, x: 40, y: 0 }, { type: 'tick', at: 800 }, { type: 'up', at: 900 }, { type: 'down', at: 1000 }, { type: 'cancel', at: 1050 }, { type: 'tick', at: 2000 }]);
    expect(frames.every(f => !f.action)).toBe(true);
  });
});

describe('per-player calibration and trace capture', () => {
  it('records neutral, all tilt directions, three swings/twists and two spins; uses clamped median thresholds', () => {
    let now = 0;
    const recorder = createCalibrationRecorder(() => defaultThresholds(), {}, () => now);
    recorder.startStep('neutral');
    for (let i = 0; i < 12; i++) recorder.observe({ at: now += 40, tilt: [2, 45] });
    expect(recorder.meter().ready).toBe(true);
    recorder.startStep('tilt');
    for (const tilt of [[-10, 45], [14, 45], [2, 33], [2, 57]] as [number, number][]) recorder.observe({ at: now += 40, tilt });
    expect(recorder.meter()).toMatchObject({ count: 4, ready: true });
    for (const step of ['swing', 'twist', 'spin'] as const) {
      recorder.startStep(step);
      for (let i = 0; i < (step === 'spin' ? 2 : 3); i++) recorder.observe({ at: now += 300,
        acceleration: { x: 10, y: 0, z: 0 }, rotationRate: { alpha: 200, beta: 0, gamma: 0 }, spinDegrees: 300,
        gesture: { kind: step === 'swing' ? 'attack' : step === 'twist' ? 'dash' : 'skill', via: step, at: now } });
      expect(recorder.meter().ready).toBe(true);
    }
    expect(recorder.result()).toMatchObject({ neutral: [2, 45], swingThreshold: 6, twistThreshold: 120, spinAngle: 220, fullSpeed: 9.600000000000001 });
  });
  it('allows no-gyro long-press training alternate and skipped steps keep defaults', () => {
    const recorder = createCalibrationRecorder(() => defaultThresholds()); recorder.startStep('spin');
    for (let i = 0; i < 2; i++) recorder.observe({ at: i * 1000, gesture: { kind: 'skill', via: 'long-press', at: i * 1000 } });
    expect(recorder.meter()).toMatchObject({ gyroAvailable: false, ready: true });
    expect(recorder.result().spinAngle).toBe(270);
  });
  it('allows tap/double-tap training alternates without learning thresholds from touch', () => {
    const recorder = createCalibrationRecorder(() => defaultThresholds());
    for (const [step, via, kind] of [['swing', 'tap', 'attack'], ['twist', 'double-tap', 'dash']] as const) {
      recorder.startStep(step);
      for (let i = 0; i < 3; i++) recorder.observe({ at: i * 1000, gesture: { kind, via, at: i * 1000 } });
      expect(recorder.meter().ready).toBe(true);
    }
    expect(recorder.result()).toMatchObject({ swingThreshold: 12, twistThreshold: 180 });
  });
  it('records the whole swing peak after the early recognition threshold crossing', () => {
    const recorder = createCalibrationRecorder(() => defaultThresholds()); recorder.startStep('swing');
    recorder.observe({ at: 0, acceleration: { x: 5, y: 0, z: 0 }, gesture: { kind: 'attack', via: 'swing', at: 0 } });
    recorder.observe({ at: 20, acceleration: { x: 20, y: 0, z: 0 } });
    recorder.observe({ at: 80, acceleration: { x: 0, y: 0, z: 0 } });
    expect(recorder.result().swingThreshold).toBe(12);
  });
  it('saves per-player settings, rejects bad local JSON and clamps dangerous thresholds', () => {
    let raw = '';
    const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
    const thresholds = sanitizeThresholds({ swingThreshold: -1, twistThreshold: 2000, fullSpeed: NaN, spinAngle: 0 });
    expect(thresholds).toMatchObject({ swingThreshold: 4, twistThreshold: 350, fullSpeed: 20, spinAngle: 220 });
    saveThresholds(thresholds, 'standard', storage); expect(loadThresholds('standard', storage)).toEqual(thresholds);
    expect(loadThresholds('seated', storage).swingThreshold).toBe(6);
    raw = 'broken'; expect(loadThresholds('standard', storage).spinAngle).toBe(270);
  });
  it('captures raw streams and gesture edges at ≤60Hz per stream for ≤20s without identity data', () => {
    let now = 0; const trace = createTraceBuffer(() => now); trace.start();
    for (; now < 25000; now += 5) {
      trace.add({ type: 'motion', at: now, rotationRate: rate('beta', 10), acceleration: null });
      trace.add({ type: 'orientation', at: now, beta: 45, gamma: 0 });
    }
    const data = trace.data({ userAgent: 'test-phone', platform: 'test' });
    expect(trace.active).toBe(false); expect(data.samples.length).toBeLessThanOrEqual(2402);
    expect(data.samples.at(-1)?.at).toBeLessThanOrEqual(20000); expect(data.durationMs).toBe(20000);
    expect(JSON.stringify(data)).not.toMatch(/player|room|repo|name/);
  });
});
