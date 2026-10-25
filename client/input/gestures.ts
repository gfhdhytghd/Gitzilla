import type { MotionProfile } from '../../shared/types';
import { defaultThresholds, type GestureThresholds } from './thresholds';
import { emptyCircle, recognizeCircle, type CircleState } from './circle';

/** Pure sensor processing. Times: monotonic ms; acceleration: m/s²; gyro: deg/s. */
export interface Acceleration { x: number; y: number; z: number }
export interface RotationRate { alpha: number; beta: number; gamma: number }
export interface GestureState {
  fireUntil: number;
  lastFire: number;
  peakHeld: boolean;
  lastPeak: Acceleration | null;
  lastSkill: number;
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
const length = (a: Acceleration) => Math.hypot(a.x, a.y, a.z);
const dot = (a: Acceleration, b: Acceleration) => a.x * b.x + a.y * b.y + a.z * b.z;
export function createGestureState(): GestureState {
  return { fireUntil: 0, lastFire: -Infinity, peakHeld: false, lastPeak: null,
    lastSkill: -Infinity, circle: emptyCircle(), circleHeld: false, pendingSwing: null };
}

/** Gyro is only a circle rejection signal; dash comes from gravity tilt.
 * Circle skills use acceleration, never rotation integration.
 * Swings wait for release/120ms so a curving centripetal peak cannot leak fire. */
export function recognizeGesture(previous: GestureState, a: Acceleration, now: number, profile: MotionProfile = 'standard',
  rate: RotationRate | null = null, thresholds: GestureThresholds = defaultThresholds(profile)): GestureResult {
  if (profile === 'tap-only') return { state: createGestureState(), fire: false, fired: false, dash: false, skill: false,
    spinDegrees: 0, gyroPeak: 0, spinMagnitude: 0, spinGyroDegrees: 0, circleActive: false, pendingSwing: false, swingPeak: 0 };
  const state = { ...previous, pendingSwing: previous.pendingSwing ? { ...previous.pendingSwing } : null };
  const circle = recognizeCircle(previous.circle, a, rate, now, thresholds); state.circle = circle.state;
  const dash=false;
  let skill = false, fired = false, swingPeak = 0;
  const magnitude = length(a);
  if (state.pendingSwing) state.pendingSwing.peak = Math.max(state.pendingSwing.peak, magnitude);
  if (magnitude < thresholds.spinMagnitude) state.circleHeld = false;
  if (circle.active) state.circleHeld = true;
  // Only a confirmed circle (90°), not a 20° flick fragment, claims the peak.
  // Once a circle is classified, its reversal/failed fit cannot reappear
  // as a delayed swing. A fresh flick requires returning below the noise floor.
  if (state.circleHeld) state.pendingSwing = null; // aborted circles have no attack refund
  if (circle.active) state.fireUntil = 0;
  if (state.pendingSwing && (magnitude < thresholds.releaseThreshold || (now - state.pendingSwing.at >= 120 && !circle.potential))) {
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
  }
  return { state, fire: now < state.fireUntil, fired: fired && !skill && !dash, dash, skill,
    spinDegrees: circle.degrees, gyroPeak: rate ? Math.hypot(rate.alpha,rate.beta,rate.gamma) : 0, spinMagnitude: circle.magnitude, spinGyroDegrees: circle.gyroDegrees,
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
