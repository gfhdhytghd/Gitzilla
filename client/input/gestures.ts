/** Pure sensor processing. Times are monotonic milliseconds; acceleration is m/s². */
export interface Acceleration { x: number; y: number; z: number }
export interface GestureState {
  fireUntil: number;
  lastFire: number;
  lastDash: number;
  lastSkill: number;
  peakHeld: boolean;
  shakeAxis: keyof Acceleration | null;
  peaks: { at: number; sign: number }[];
}
export interface GestureResult {
  state: GestureState;
  fire: boolean;
  dash: boolean;
  skill: boolean;
}

export function createGestureState(): GestureState {
  return { fireUntil: 0, lastFire: -Infinity, lastDash: -Infinity, lastSkill: -Infinity,
    peakHeld: false, shakeAxis: null, peaks: [] };
}

export function recognizeGesture(previous: GestureState, a: Acceleration, now: number): GestureResult {
  const state = { ...previous, peaks: previous.peaks.filter(p => now - p.at <= 600) };
  let dash = false;
  let skill = false;
  const axis = (Object.keys(a) as (keyof Acceleration)[])
    .reduce((best, key) => Math.abs(a[key]) > Math.abs(a[best]) ? key : best, 'x');
  const peak = Math.abs(a[axis]);
  // Hysteresis: a sustained acceleration is one gesture, not a gesture every sample.
  if (peak < 4) state.peakHeld = false;
  const sign = Math.sign(a[axis]);
  const last = state.peaks.at(-1);
  const reversed = peak >= 14 && axis === state.shakeAxis && last && last.sign !== sign;
  if (peak >= 7 && (!state.peakHeld || reversed)) {
    state.peakHeld = true;
    if (peak >= 14) {
      if (state.shakeAxis !== axis) state.peaks = [];
      state.shakeAxis = axis;
      if (state.peaks.at(-1)?.sign !== sign) state.peaks.push({ at: now, sign });
      if (state.peaks.length >= 3 && now - state.lastSkill >= 1200) {
        skill = true;
        state.lastSkill = now;
        state.peaks = [];
      }
    }
    if (!skill && axis === 'z' && a.z >= 7 && now - state.lastFire >= 300) {
      state.fireUntil = now + 600;
      state.lastFire = now;
    }
    if (!skill && axis === 'x' && Math.abs(a.x) >= 10 && now - state.lastDash >= 650) {
      dash = true;
      state.lastDash = now;
    }
  }
  return { state, fire: now < state.fireUntil, dash, skill };
}

export function normalize(x: number, y: number): [number, number] {
  const length = Math.hypot(x, y);
  return length > 1 ? [x / length, y / length] : [x, y];
}

/** Screen-relative tilt: portrait gamma moves right, beta moves down. */
export function screenTilt(beta: number, gamma: number, angle: number): [number, number] {
  const radians = angle * Math.PI / 180;
  return [gamma * Math.cos(radians) + beta * Math.sin(radians),
    beta * Math.cos(radians) - gamma * Math.sin(radians)];
}

export function tiltMove(current: [number, number], neutral: [number, number]): [number, number] {
  const x = current[0] - neutral[0];
  const y = current[1] - neutral[1];
  const magnitude = Math.hypot(x, y);
  if (magnitude <= 5) return [0, 0];
  const strength = Math.min(1, (magnitude - 5) / 20);
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
