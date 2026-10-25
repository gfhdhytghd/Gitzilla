import type { MotionProfile } from '../../shared/types';
import { MOTION_SETTINGS } from './profiles';

export interface GestureThresholds {
  swingThreshold: number;
  releaseThreshold: number;
  refractoryMs: number;
  twistThreshold: number; // deg/s, both iOS and Android
  spinAngle: number; // monotonic acceleration sweep in fitted motion plane
  spinWindowMs: number;
  spinMagnitude: number; // minimum centripetal linear acceleration, m/s²
  deadzone: number;
  fullSpeed: number;
  neutral: [number, number] | null;
}
export const CALIBRATION_KEY = 'kaiju.motionCalibration.v4';
export function defaultThresholds(profile: MotionProfile = 'standard'): GestureThresholds {
  return { ...MOTION_SETTINGS[profile], twistThreshold: profile === 'seated' ? 100 : 180,
    spinAngle: 300, spinWindowMs: 1500, spinMagnitude: profile === 'seated' ? 2 : 3, neutral: null };
}
const clamp = (v: number, min: number, max: number, fallback: number) => Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
export function sanitizeThresholds(value: Partial<GestureThresholds>, base = defaultThresholds()): GestureThresholds {
  const fullSpeed = clamp(value.fullSpeed!, 6, 40, base.fullSpeed);
  const swingThreshold = clamp(value.swingThreshold!, 4, 24, base.swingThreshold);
  return {
    swingThreshold,
    releaseThreshold: Math.min(swingThreshold * 0.5, clamp(value.releaseThreshold!, 2, 8, base.releaseThreshold)),
    refractoryMs: clamp(value.refractoryMs!, 180, 600, base.refractoryMs),
    twistThreshold: clamp(value.twistThreshold!, 80, 350, base.twistThreshold),
    spinAngle: clamp(value.spinAngle!, 280, 340, base.spinAngle),
    spinWindowMs: clamp(value.spinWindowMs!, 1000, 1800, base.spinWindowMs),
    spinMagnitude: clamp(value.spinMagnitude!, 2, 8, base.spinMagnitude),
    deadzone: Math.min(fullSpeed - 1, clamp(value.deadzone!, 0, 1, base.deadzone)), fullSpeed,
    neutral: Array.isArray(value.neutral) && value.neutral.length === 2 && value.neutral.every(Number.isFinite)
      ? [value.neutral[0], value.neutral[1]] : value.neutral === null ? null : base.neutral,
  };
}
export function loadThresholds(profile: MotionProfile = 'standard', storage?: Pick<Storage, 'getItem'>): GestureThresholds {
  const base = defaultThresholds(profile);
  try {
    const store = storage ?? globalThis.localStorage;
    const saved = JSON.parse(store?.getItem(CALIBRATION_KEY) || store?.getItem('kaiju.motionCalibration.v3') || 'null');
    if (saved?.profile !== profile) return base;
    if (saved.version === 4) return sanitizeThresholds(saved.thresholds, base);
    return saved.version === 3 ? sanitizeThresholds({ ...saved.thresholds, spinAngle: base.spinAngle, spinWindowMs: base.spinWindowMs, spinMagnitude: base.spinMagnitude }, base) : base;
  } catch { return base; }
}
export function saveThresholds(thresholds: GestureThresholds, profile: MotionProfile, storage?: Pick<Storage, 'setItem'>): void {
  try { (storage ?? globalThis.localStorage)?.setItem(CALIBRATION_KEY, JSON.stringify({ version: 4, profile, thresholds })); } catch { /* Private browsing. */ }
}
