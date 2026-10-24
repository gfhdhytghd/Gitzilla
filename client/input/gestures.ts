import type { MotionProfile } from '../../shared/types';
import { MOTION_SETTINGS } from './profiles';

/** Pure sensor processing. Times are monotonic milliseconds; acceleration is m/s². */
export interface Acceleration { x: number; y: number; z: number }
export interface GestureState {
  fireUntil: number;
  lastFire: number;
  peakHeld: boolean;
  lastPeak: Acceleration | null;
}
export interface GestureResult {
  state: GestureState;
  fire: boolean;
  fired: boolean;
  dash: false;
  skill: false;
}

export function createGestureState(): GestureState {
  return { fireUntil: 0, lastFire: -Infinity, peakHeld: false, lastPeak: null };
}

/** Motion v2: any-axis swing attacks. Dash and skill belong exclusively to buttons. */
export function recognizeGesture(previous: GestureState, a: Acceleration, now: number, profile: MotionProfile = 'standard'): GestureResult {
  if (profile === 'tap-only') return { state: createGestureState(), fire: false, fired: false, dash: false, skill: false };
  const settings = MOTION_SETTINGS[profile];
  const state = { ...previous };
  const magnitude = Math.hypot(a.x, a.y, a.z);
  if (magnitude < settings.releaseThreshold) state.peakHeld = false;
  const opposite = state.lastPeak && a.x * state.lastPeak.x + a.y * state.lastPeak.y + a.z * state.lastPeak.z < 0;
  const fired = magnitude >= settings.swingThreshold && (!state.peakHeld || !!opposite) && now - state.lastFire >= settings.refractoryMs;
  if (fired) {
    state.peakHeld = true;
    state.lastPeak = { ...a };
    state.lastFire = now;
    state.fireUntil = now + 600;
  }
  return { state, fire: now < state.fireUntil, fired, dash: false, skill: false };
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

export function tiltMove(current: [number, number], neutral: [number, number], profile: MotionProfile = 'standard'): [number, number] {
  if (profile === 'tap-only') return [0, 0];
  const settings = MOTION_SETTINGS[profile];
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
