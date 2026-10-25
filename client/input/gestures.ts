import type { MotionProfile } from '../../shared/types';
import { defaultThresholds, type GestureThresholds } from './thresholds';
import { emptyCircle, recognizeCircle, type CircleState } from './circle';

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
}
export interface GestureState {
  fireUntil: number;
  lastFire: number;
  peakHeld: boolean;
  lastPeak: Acceleration | null;
  lastDash: number;
  lastSkill: number;
  rotation: RotationState;
  circle: CircleState;
  circleHeld: boolean;
  pendingSwing: { at: number; peak: number } | null;
}
export interface GestureResult {
  state: GestureState;
  fire: boolean;
  fired: boolean;
  dash: boolean;
  skill: boolean;
  spinDegrees: number;
  gyroPeak: number;
  spinMagnitude: number;
  spinGyroDegrees: number;
  circleActive: boolean;
  pendingSwing: boolean;
  swingPeak: number;
}
const zero = (): Acceleration => ({ x: 0, y: 0, z: 0 });
const length = (a: Acceleration) => Math.hypot(a.x, a.y, a.z);
const dot = (a: Acceleration, b: Acceleration) => a.x * b.x + a.y * b.y + a.z * b.z;
const emptyRotation = (): RotationState => ({ at: null, started: null, lastRate: zero(), direction: zero(), net: zero(), path: 0,
  peak: 0, reversed: false, blocked: false, quietAt: null });
export function createGestureState(): GestureState {
  return { fireUntil: 0, lastFire: -Infinity, peakHeld: false, lastPeak: null,
    lastDash: -Infinity, lastSkill: -Infinity, rotation: emptyRotation(), circle: emptyCircle(), circleHeld: false, pendingSwing: null };
}

/** Twist uses gyro only. Circle skills use acceleration, never rotation integration.
 * Swings wait for release/120ms so a curving centripetal peak cannot leak fire. */
export function recognizeGesture(previous: GestureState, a: Acceleration, now: number, profile: MotionProfile = 'standard',
  rate: RotationRate | null = null, thresholds: GestureThresholds = defaultThresholds(profile)): GestureResult {
  if (profile === 'tap-only') return { state: createGestureState(), fire: false, fired: false, dash: false, skill: false,
    spinDegrees: 0, gyroPeak: 0, spinMagnitude: 0, spinGyroDegrees: 0, circleActive: false, pendingSwing: false, swingPeak: 0 };
  const state = { ...previous, pendingSwing: previous.pendingSwing ? { ...previous.pendingSwing } : null };
  const r = { ...previous.rotation, net: { ...previous.rotation.net } }; state.rotation = r;
  const circle = recognizeCircle(previous.circle, a, rate, now, thresholds); state.circle = circle.state;
  let dash = false, skill = false, fired = false, swingPeak = 0;
  const magnitude = length(a);
  if (state.pendingSwing) state.pendingSwing.peak = Math.max(state.pendingSwing.peak, magnitude);
  if (magnitude < thresholds.spinMagnitude) state.circleHeld = false;
  if (circle.potential || circle.active) state.circleHeld = true;
  // Once a curved peak is classified, its reversal/failed fit cannot reappear
  // as a delayed swing. A fresh flick requires returning below the noise floor.
  if (state.circleHeld) state.pendingSwing = null; // aborted circles have no attack refund
  if (circle.active) state.fireUntil = 0;
  if (state.pendingSwing && (magnitude < thresholds.releaseThreshold || now - state.pendingSwing.at >= 120)) {
    if (now - state.lastFire >= thresholds.refractoryMs) {
      fired = true; swingPeak = state.pendingSwing.peak; state.lastFire = now; state.fireUntil = now + 600;
    }
    state.pendingSwing = null;
  }
  if (magnitude < thresholds.releaseThreshold) state.peakHeld = false;
  const opposite = state.lastPeak && dot(a, state.lastPeak) < 0;
  if (!state.circleHeld && magnitude >= thresholds.swingThreshold &&
    (!state.peakHeld || !!opposite) && now - state.lastFire >= thresholds.refractoryMs && !state.pendingSwing) {
    state.peakHeld = true; state.lastPeak = { ...a }; state.pendingSwing = { at: now, peak: magnitude };
  }
  if (circle.completed && now - state.lastSkill >= 1200) {
    skill = true; state.lastSkill = now; state.fireUntil = 0; state.pendingSwing = null;
    state.circle = { ...circle.state, samples: circle.state.samples.slice(-1) };
    if (r.started !== null) r.blocked = true;
  }
  if (rate && [rate.alpha, rate.beta, rate.gamma].every(Number.isFinite)) {
    const v = { x: rate.alpha, y: rate.beta, z: rate.gamma }, speed = length(v);
    const gap = r.at === null ? 0 : now - r.at;
    if (gap > 200 || gap < 0) Object.assign(r, emptyRotation());
    const dt = r.at === null ? 0 : Math.min(100, Math.max(0, now - r.at)) / 1000;
    const moving = speed >= 45;
    if (r.started === null && moving) { r.started = now; r.direction = { ...v }; r.peak = speed; }
    if (r.started !== null) {
      r.peak = Math.max(r.peak, speed); r.path += (speed >= 20 ? speed : 0) * dt;
      r.net = { x: r.net.x + v.x * dt, y: r.net.y + v.y * dt, z: r.net.z + v.z * dt };
      if (moving && dot(v, r.direction) < 0) r.reversed = true;
      if (fired || state.pendingSwing || circle.active || now - state.lastFire < 400 || length(r.net) >= 120) r.blocked = true;
      if (moving) r.quietAt = null; else r.quietAt ??= now;
      if (r.quietAt !== null && now - r.quietAt >= 100) {
        dash = !r.blocked && r.reversed && r.peak >= thresholds.twistThreshold && r.path >= 12
          && length(r.net) <= 22 && now - r.started <= 650 && now - state.lastDash >= 650;
        if (dash) { state.lastDash = now; state.fireUntil = 0; }
        Object.assign(r, emptyRotation());
      }
      if (r.started !== null && now - r.started > 650) r.blocked = true;
    }
    r.at = now; r.lastRate = v;
  }
  return { state, fire: now < state.fireUntil, fired: fired && !skill && !dash, dash, skill,
    spinDegrees: circle.degrees, gyroPeak: r.peak, spinMagnitude: circle.magnitude, spinGyroDegrees: circle.gyroDegrees,
    circleActive: circle.active, pendingSwing: !!state.pendingSwing, swingPeak: swingPeak || state.pendingSwing?.peak || 0 };
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

/** World-up projected into device coordinates (Z-X-Y device orientation); alpha
 * rotates about world gravity and therefore does not enter this vector. */
export function orientationGravity(beta: number, gamma: number): Acceleration {
  const b = beta * Math.PI / 180, g = gamma * Math.PI / 180;
  return { x: -Math.cos(b) * Math.sin(g), y: Math.sin(b), z: Math.cos(b) * Math.cos(g) };
}

/** Horizontal-plane movement: flat screen-up=0, 7.5°=.5, 15°=1.
 * sign normalizes platform accelerationIncludingGravity polarity, not a neutral pose.
 * Device +Y points toward its top; screen +Y points down. */
export function gravityMove(gravity: Acceleration, angle = 0, sign = 1, fullSpeed = 15): [number, number] {
  const x = -sign * gravity.x, y = sign * gravity.y, z = sign * gravity.z;
  const horizontal = Math.hypot(x, y);
  if (horizontal < 1e-8) return [0, 0];
  const tilt = Math.atan2(horizontal, z) * 180 / Math.PI;
  if (tilt <= 0.6) return [0, 0];
  const strength = Math.min(1, tilt / fullSpeed);
  return rotateScreen(x / horizontal * strength, y / horizontal * strength, angle);
}

/** Legacy helper signature. Neutral is deliberately ignored: movement is gravity-relative. */
export function tiltMove(current: [number, number], _neutral: [number, number], profile: MotionProfile = 'standard', _thresholds?: GestureThresholds): [number, number] {
  if (profile === 'tap-only') return [0, 0];
  return gravityMove(orientationGravity(current[1], current[0]), 0, 1, 15);
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
