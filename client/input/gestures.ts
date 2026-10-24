import type { MotionProfile } from '../../shared/types';
import { defaultThresholds, type GestureThresholds } from './thresholds';

/** Pure sensor processing. Times: monotonic ms; acceleration: m/s²; gyro: deg/s. */
export interface Acceleration { x: number; y: number; z: number }
export interface RotationRate { alpha: number; beta: number; gamma: number }
interface RotationState {
  at: number | null;
  started: number | null;
  lastRate: Acceleration;
  direction: Acceleration;
  net: Acceleration;
  path: number;
  peak: number;
  reversed: boolean;
  blocked: boolean;
  quietAt: number | null;
  samples: { at: number; degrees: number }[];
}
export interface GestureState {
  fireUntil: number;
  lastFire: number;
  peakHeld: boolean;
  lastPeak: Acceleration | null;
  lastDash: number;
  lastSkill: number;
  rotation: RotationState;
}
export interface GestureResult {
  state: GestureState;
  fire: boolean;
  fired: boolean;
  dash: boolean;
  skill: boolean;
  spinDegrees: number;
  gyroPeak: number;
}
const zero = (): Acceleration => ({ x: 0, y: 0, z: 0 });
const length = (a: Acceleration) => Math.hypot(a.x, a.y, a.z);
const dot = (a: Acceleration, b: Acceleration) => a.x * b.x + a.y * b.y + a.z * b.z;
const emptyRotation = (): RotationState => ({ at: null, started: null, lastRate: zero(), direction: zero(), net: zero(), path: 0,
  peak: 0, reversed: false, blocked: false, quietAt: null, samples: [] });
export function createGestureState(): GestureState {
  return { fireUntil: 0, lastFire: -Infinity, peakHeld: false, lastPeak: null,
    lastDash: -Infinity, lastSkill: -Infinity, rotation: emptyRotation() };
}

/** A twist is classified only AFTER it returns and settles. Never dash on a gyro spike:
 * it could be the beginning of a spin. A >=120° net excursion blocks dash for that episode. */
export function recognizeGesture(previous: GestureState, a: Acceleration, now: number, profile: MotionProfile = 'standard',
  rate: RotationRate | null = null, thresholds: GestureThresholds = defaultThresholds(profile)): GestureResult {
  if (profile === 'tap-only') return { state: createGestureState(), fire: false, fired: false, dash: false, skill: false, spinDegrees: 0, gyroPeak: 0 };
  const state = { ...previous };
  const r = { ...previous.rotation, net: { ...previous.rotation.net }, samples: [...previous.rotation.samples] };
  state.rotation = r;
  let dash = false, skill = false;
  const magnitude = length(a);
  if (magnitude < thresholds.releaseThreshold) state.peakHeld = false;
  const opposite = state.lastPeak && dot(a, state.lastPeak) < 0;
  const fired = magnitude >= thresholds.swingThreshold && (!state.peakHeld || !!opposite) && now - state.lastFire >= thresholds.refractoryMs;
  if (fired) {
    state.peakHeld = true; state.lastPeak = { ...a }; state.lastFire = now; state.fireUntil = now + 600;
  }
  let spinDegrees = 0;
  if (rate && [rate.alpha, rate.beta, rate.gamma].every(Number.isFinite)) {
    const v = { x: rate.alpha, y: rate.beta, z: rate.gamma };
    const speed = length(v);
    const gap = r.at === null ? 0 : now - r.at;
    if (gap > 200 || gap < 0) Object.assign(r, emptyRotation());
    const dt = r.at === null ? 0 : Math.min(100, Math.max(0, now - r.at)) / 1000;
    // Ignore slow turning/walking/tremor; integrate actual timestamps, never e.interval.
    const moving = speed >= 45;
    if (r.started === null && moving) {
      r.started = now; r.direction = { ...v }; r.peak = speed;
    }
    if (r.started !== null) {
      r.peak = Math.max(r.peak, speed);
      const degrees = (speed >= 20 ? speed : 0) * dt;
      r.path += degrees;
      r.samples.push({ at: now, degrees });
      r.samples = r.samples.filter(s => now - s.at <= thresholds.spinWindowMs);
      spinDegrees = r.samples.reduce((sum, s) => sum + s.degrees, 0);
      r.net = { x: r.net.x + v.x * dt, y: r.net.y + v.y * dt, z: r.net.z + v.z * dt };
      if (moving && dot(v, r.direction) < 0) r.reversed = true;
      if (fired || now - state.lastFire < 400 || length(r.net) >= 120) r.blocked = true;
      if (spinDegrees >= thresholds.spinAngle && now - state.lastSkill >= 1200) {
        skill = true; state.lastSkill = now; state.fireUntil = 0; r.blocked = true;
        r.samples = []; // One skill per revolution window; no repeated threshold frames.
      }
      if (moving) r.quietAt = null;
      else r.quietAt ??= now;
      if (r.quietAt !== null && now - r.quietAt >= 100) {
        dash = !r.blocked && r.reversed && r.peak >= thresholds.twistThreshold && r.path >= 12
          && length(r.net) <= 22 && now - r.started <= 650 && now - state.lastDash >= 650;
        if (dash) { state.lastDash = now; state.fireUntil = 0; }
        Object.assign(r, emptyRotation());
      }
      // A slow turn can never accumulate into a delayed twist, even after reversing.
      if (r.started !== null && now - r.started > 650) r.blocked = true;
    }
    r.at = now; r.lastRate = v;
  }
  return { state, fire: now < state.fireUntil, fired: fired && !skill && !dash,
    dash, skill, spinDegrees, gyroPeak: r.peak };
}

export function normalize(x: number, y: number): [number, number] {
  const length = Math.hypot(x, y);
  return length > 1 ? [x / length, y / length] : [x, y];
}

function rotateScreen(x: number, y: number, angle: number): [number, number] {
  const radians = angle * Math.PI / 180;
  return [x * Math.cos(radians) + y * Math.sin(radians), y * Math.cos(radians) - x * Math.sin(radians)];
}

/** Calibratable roll/pitch degrees, primary pose: portrait tilted back 30–50°.
 * Device frame stays in natural orientation when the screen rotates (W3C):
 * https://www.w3.org/TR/orientation-event/#device-orientation-model
 */
export function screenTilt(beta: number, gamma: number, angle: number): [number, number] {
  const b = beta * Math.PI / 180;
  // Preserve roll sensitivity at upright neutral, rather than attenuating it by cos(beta).
  return rotateScreen(gamma,
    Math.asin(Math.sin(b)) * 180 / Math.PI, angle);
}

/** For browsers whose orientation angles are null, use the low-pass gravity vector. */
export function gravityTilt(gravity: Acceleration, angle: number, sign: number): [number, number] {
  const length = Math.hypot(gravity.x, gravity.y, gravity.z) || 1;
  return rotateScreen(Math.atan2(-sign * gravity.x, sign * gravity.z) * 180 / Math.PI,
    Math.asin(Math.max(-1, Math.min(1, sign * gravity.y / length))) * 180 / Math.PI, angle);
}

export function tiltMove(current: [number, number], neutral: [number, number], profile: MotionProfile = 'standard', thresholds?: GestureThresholds): [number, number] {
  if (profile === 'tap-only') return [0, 0];
  const settings = thresholds ?? defaultThresholds(profile);
  const x = current[0] - neutral[0];
  const y = current[1] - neutral[1];
  const magnitude = Math.hypot(x, y);
  if (magnitude <= settings.deadzone) return [0, 0];
  const strength = Math.min(1, (magnitude - settings.deadzone) / (settings.fullSpeed - settings.deadzone));
  return [x / magnitude * strength, y / magnitude * strength];
}

/** Low-pass gravity estimate for devices lacking acceleration without gravity. */
export function removeGravity(raw: Acceleration, gravity: Acceleration | null): {
  acceleration: Acceleration; gravity: Acceleration;
} {
  if (!gravity) return { acceleration: { x: 0, y: 0, z: 0 }, gravity: { ...raw } };
  const next = { x: gravity.x * 0.92 + raw.x * 0.08,
    y: gravity.y * 0.92 + raw.y * 0.08, z: gravity.z * 0.92 + raw.z * 0.08 };
  return { acceleration: { x: raw.x - next.x, y: raw.y - next.y, z: raw.z - next.z }, gravity: next };
}
