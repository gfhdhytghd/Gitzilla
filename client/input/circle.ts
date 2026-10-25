import type { Acceleration, RotationRate } from './gestures';
import type { GestureThresholds } from './thresholds';
interface Sample { at: number; a: Acceleration; gyro: number }
export interface CircleState { samples: Sample[]; at: number | null }
export const emptyCircle = (): CircleState => ({ samples: [], at: null });
const norm = (a: number[]) => Math.hypot(...a);
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Small symmetric3x3 PCA. The least-variance eigenvector is the motion-plane
 * normal. No fixed handset pose, Euler angles or axis-of-rotation assumptions. */
function plane(points: number[][]) {
  const mean = [0, 0, 0];
  for (const a of points) for (let i = 0; i < 3; i++) mean[i] += a[i] / points.length;
  const m = Array(9).fill(0) as number[], v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (const a of points) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i * 3 + j] += (a[i] - mean[i]) * (a[j] - mean[j]);
  for (let sweep = 0; sweep < 12; sweep++) {
    let p = 0, q = 1;
    for (const [i, j] of [[0, 2], [1, 2]]) if (Math.abs(m[i * 3 + j]) > Math.abs(m[p * 3 + q])) { p = i; q = j; }
    if (Math.abs(m[p * 3 + q]) < 1e-8) break;
    const angle = 0.5 * Math.atan2(2 * m[p * 3 + q], m[q * 3 + q] - m[p * 3 + p]);
    const c = Math.cos(angle), s = Math.sin(angle), pp = m[p * 3 + p], qq = m[q * 3 + q], pq = m[p * 3 + q];
    for (let k = 0; k < 3; k++) if (k !== p && k !== q) {
      const kp = m[k * 3 + p], kq = m[k * 3 + q];
      m[k * 3 + p] = m[p * 3 + k] = c * kp - s * kq;
      m[k * 3 + q] = m[q * 3 + k] = s * kp + c * kq;
    }
    m[p * 3 + p] = c * c * pp - 2 * s * c * pq + s * s * qq;
    m[q * 3 + q] = s * s * pp + 2 * s * c * pq + c * c * qq;
    m[p * 3 + q] = m[q * 3 + p] = 0;
    for (let k = 0; k < 3; k++) { const kp = v[k * 3 + p], kq = v[k * 3 + q]; v[k * 3 + p] = c * kp - s * kq; v[k * 3 + q] = s * kp + c * kq; }
  }
  const axes = [0, 1, 2].sort((a, b) => m[a * 3 + a] - m[b * 3 + b]);
  const total = m[0] + m[4] + m[8];
  return { normal: [v[axes[0]], v[3 + axes[0]], v[6 + axes[0]]], error: m[axes[0] * 3 + axes[0]] / (total || 1),
    spread: m[axes[1] * 3 + axes[1]] / (total || 1) };
}

export function recognizeCircle(previous: CircleState, acceleration: Acceleration, rate: RotationRate | null,
  now: number, thresholds: GestureThresholds) {
  const magnitude = Math.hypot(acceleration.x, acceleration.y, acceleration.z);
  const gap = previous.at === null ? 0 : now - previous.at;
  const valid = Number.isFinite(magnitude) && magnitude >= thresholds.spinMagnitude && gap >= 0 && gap <= 200;
  let samples = valid ? previous.samples.filter(s => now - s.at <= thresholds.spinWindowMs) : [];
  const gyro = rate ? Math.hypot(rate.alpha, rate.beta, rate.gamma) * Math.max(0, Math.min(gap, 100)) / 1000 : 0;
  if (magnitude >= thresholds.spinMagnitude && Number.isFinite(magnitude)) samples = [...samples, { at: now, a: { ...acceleration }, gyro }];
  const state = { at: now, samples };
  const gyroDegrees = samples.reduce((sum, s) => sum + s.gyro, 0);
  const result = { state, degrees: 0, magnitude, gyroDegrees, active: false, potential: false, completed: false };
  if (gyroDegrees >= 60 || samples.length < 2) { if (gyroDegrees >= 60) state.samples = samples.slice(-1); return result; }
  const points = samples.map(s => { const a = [s.a.x, s.a.y, s.a.z]; const n = norm(a); return a.map(v => v / n); });
  const fitted = points.length >= 3 ? plane(points) : { normal: cross(points[0], points[1]), error: 0, spread: 1 };
  const n = fitted.normal, nn = norm(n);
  if (nn < 1e-6 || fitted.error > 0.1 || fitted.spread < 0.001) return result;
  const normal = n.map(v => v / nn), initial = points[0], distance = dot(initial, normal);
  const projected = initial.map((v, i) => v - distance * normal[i]), pn = norm(projected);
  if (pn < 0.6) return result;
  const u = projected.map(v => v / pn), v = cross(normal, u);
  let prior = 0, sweep = 0, travel = 0, maxStep = 0, backward = 0;
  const deltas: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const angle = Math.atan2(dot(points[i], v), dot(points[i], u));
    const delta = Math.atan2(Math.sin(angle - prior), Math.cos(angle - prior)) * 180 / Math.PI;
    prior = angle; sweep += delta; travel += Math.abs(delta); maxStep = Math.max(maxStep, Math.abs(delta)); deltas.push(delta);
  }
  for (const delta of deltas) if (delta * sweep < 0) backward = Math.max(backward, Math.abs(delta));
  const monotonic = maxStep <= 80 && backward <= 12 && travel > 0 && Math.abs(sweep) / travel >= 0.9;
  if (!monotonic) { state.samples = samples.slice(-1); return result; }
  result.degrees = Math.abs(sweep);
  // Project observed rotation to a full circle: fast wrist flicks must not
  // claim swing arbitration merely because two acceleration vectors curved.
  const quiet = gyroDegrees * thresholds.spinAngle / Math.max(1,result.degrees) < 60;
  result.potential = result.degrees >= 20 && quiet;
  result.active = result.degrees >= 90 && quiet;
  result.completed = quiet && samples.length >= 6 && now - samples[0].at >= 200 && result.degrees >= thresholds.spinAngle;
  return result;
}
