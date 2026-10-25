import type { Acceleration, RotationRate } from './gestures';
import { sanitizeThresholds, type GestureThresholds } from './thresholds';

export type CalibrationStep = 'neutral' | 'tilt' | 'swing' | 'twist' | 'dash' | 'spin';
export type GestureKind = 'attack' | 'dash' | 'skill';
export interface GestureNotice { kind: GestureKind; via: string; at: number }
export interface CalibrationSample {
  at: number; tilt?: [number, number]; acceleration?: Acceleration; rotationRate?: RotationRate | null;
  dashTiltDegrees?: number; spinDegrees?: number; spinMagnitude?: number; spinGyroDegrees?: number; swingPeak?: number; gesture?: GestureNotice;
}
export interface CalibrationMeter {
  step: CalibrationStep | null; elapsed: number; acceleration: number; gyro: number; gyroAvailable: boolean;
  dashTiltDegrees: number; spinDegrees: number; spinMagnitude: number; spinGyroDegrees: number; instruction: string;
  tilt: [number, number]; ranges: [number, number, number, number];
  count: number; goal: number; ready: boolean; peak: number; lastGesture: GestureNotice | null;
}
const median = (items: number[]) => { const sorted = [...items].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
/** One player's recorder, independent of DOM/network. UI polls meter(), drives steps, then applies result(). */
export function createCalibrationRecorder(getProfile: () => GestureThresholds,
  hooks: { start?(step: CalibrationStep): void; finish?(): void } = {}, now = () => performance.now()) {
  let step: CalibrationStep | null = null;
  let start = 0;
  let lastAt = 0;
  let neutral: [number, number] | null = null;
  let poseSum: [number, number] = [0, 0]; let poses = 0;
  let ranges: [number, number, number, number] = [0, 0, 0, 0];
  let acceleration = 0, gyro = 0, spinDegrees = 0, peak = 0, count = 0, gyroAvailable = false;
  let dashTiltDegrees = 0;
  let spinMagnitude = 0, spinGyroDegrees = 0, circlePeak = 0;
  let spinMagnitudes: number[] = [];
  let tilt: [number, number] = [0, 0]; let lastGesture: GestureNotice | null = null;
  let pendingSwing: number | null = null;
  let samples: Record<'swing' | 'dash' | 'spin', number[]> = { swing: [], dash: [], spin: [] };
  const goals = { neutral: 8, tilt: 4, swing: 3, twist: 3, dash: 3, spin: 2 };
  const api = {
    get active() { return step !== null; },
    startStep(next: CalibrationStep | 'attack' | 'dash' | 'skill') {
      step = next === 'attack' ? 'swing' : next === 'twist' ? 'dash' : next === 'skill' ? 'spin' : next;
      start = lastAt = now(); count = peak = spinDegrees = 0; lastGesture = null;
      acceleration = gyro = 0;
      dashTiltDegrees = spinMagnitude = spinGyroDegrees = circlePeak = 0;
      pendingSwing = null;
      if (step === 'neutral') { neutral = null; poseSum = [0, 0]; poses = 0; ranges = [0, 0, 0, 0]; samples = { swing: [], dash: [], spin: [] }; }
      if (step === 'tilt') ranges = [0, 0, 0, 0];
      if (step === 'swing' || step === 'dash' || step === 'spin') samples[step] = [];
      if (step === 'spin') spinMagnitudes = [];
      hooks.start?.(step);
    },
    observe(sample: CalibrationSample) {
      if (!step) return;
      lastAt = sample.at;
      if (sample.tilt) {
        if (step === 'neutral') {
          poseSum[0] += sample.tilt[0]; poseSum[1] += sample.tilt[1]; poses++;
          neutral = [poseSum[0] / poses, poseSum[1] / poses]; count = poses;
        }
        const zero = neutral ?? getProfile().neutral ?? [0, 0];
        tilt = [sample.tilt[0] - zero[0], sample.tilt[1] - zero[1]];
        if (step === 'tilt') {
          ranges = [Math.max(ranges[0], -tilt[0]), Math.max(ranges[1], tilt[0]), Math.max(ranges[2], -tilt[1]), Math.max(ranges[3], tilt[1])];
          count = ranges.filter(v => v >= 6).length;
        }
      }
      if (sample.acceleration) acceleration = Math.hypot(...Object.values(sample.acceleration));
      // Recognition happens at threshold crossing; retain the rest of that swing's
      // peak so training measures the person's actual flick, not just the threshold.
      if (step === 'swing' && sample.acceleration && pendingSwing !== null) {
        samples.swing[pendingSwing] = Math.max(samples.swing[pendingSwing], acceleration);
        if (acceleration < getProfile().releaseThreshold && lastGesture && sample.at - lastGesture.at > 50) { pendingSwing = null; peak = 0; }
      }
      if (sample.rotationRate) { gyroAvailable = true; gyro = Math.hypot(...Object.values(sample.rotationRate)); }
      if (sample.dashTiltDegrees !== undefined) dashTiltDegrees=sample.dashTiltDegrees;
      if (sample.spinDegrees !== undefined) spinDegrees = sample.spinDegrees;
      if (sample.spinMagnitude !== undefined) { spinMagnitude = sample.spinMagnitude; circlePeak = Math.max(circlePeak, spinMagnitude); }
      if (sample.spinGyroDegrees !== undefined) spinGyroDegrees = sample.spinGyroDegrees;
      peak = Math.max(peak, step === 'swing' ? Math.max(acceleration, sample.swingPeak ?? 0) : step === 'spin' ? spinDegrees : dashTiltDegrees);
      if (sample.gesture) {
        lastGesture = sample.gesture;
        const matches = step === 'swing' && (sample.gesture.via === 'swing' || sample.gesture.via === 'tap')
          || step === 'dash' && (sample.gesture.via === 'tilt-dash' || sample.gesture.via === 'double-tap')
          || step === 'spin' && (sample.gesture.via === 'spin' || sample.gesture.via === 'long-press');
        if (matches && (step === 'swing' || step === 'dash' || step === 'spin')) {
          if (sample.gesture.via === step || step === 'dash' && sample.gesture.via === 'tilt-dash') {
            samples[step].push(peak);
            if (step === 'spin') { spinMagnitudes.push(circlePeak); circlePeak = 0; }
            if (step === 'swing') pendingSwing = samples.swing.length - 1;
          }
          count++; peak = 0;
        }
      }
    },
    meter(): CalibrationMeter {
      return { step, elapsed: Math.max(0, lastAt - start), acceleration, gyro, gyroAvailable, dashTiltDegrees, spinDegrees, spinMagnitude, spinGyroDegrees,
        instruction: step === 'dash' ? 'Tilt hard to dash (50°); return below35°.' : step === 'spin' ? 'Draw circles with your phone; keep its orientation steady.' : '', tilt: [...tilt], ranges: [...ranges],
        count, goal: step ? goals[step] : 0, ready: step !== null && count >= goals[step] && (step !== 'neutral' || lastAt - start >= 300), peak, lastGesture };
    },
    /** Pure snapshot; call input.setProfile(result()) to persist. Skipped steps preserve defaults. */
    result(): GestureThresholds {
      const base = getProfile();
      return sanitizeThresholds({ ...base, neutral: null,
        swingThreshold: samples.swing.length ? median(samples.swing) * 0.6 : base.swingThreshold,
        spinAngle: samples.spin.length ? median(samples.spin) * 0.9 : base.spinAngle,
        spinMagnitude: spinMagnitudes.length ? median(spinMagnitudes) * 0.6 : base.spinMagnitude,
        fullSpeed: base.fullSpeed }, base);
    },
    stop() { step = null; hooks.finish?.(); return api.result(); },
  };
  return api;
}
export type CalibrationRecorder = ReturnType<typeof createCalibrationRecorder>;
