import type { MotionProfile } from '../../shared/types';
import { MOTION_SETTINGS } from './profiles';

export interface GestureThresholds {
  swingThreshold: number;
  releaseThreshold: number;
  refractoryMs: number;
  twistThreshold: number; // deprecated storage compatibility; gyro never dashes
  spinAngle: number; // monotonic acceleration sweep in fitted motion plane
  spinWindowMs: number;
  spinMagnitude: number; // minimum centripetal linear acceleration, m/s²
  deadzone: number;
  fullSpeed: number;
  neutral: [number, number] | null;
}
export const CALIBRATION_KEY = 'kaiju.motionCalibration.v5';
export function defaultThresholds(profile: MotionProfile = 'standard'): GestureThresholds {
  return { ...MOTION_SETTINGS[profile], twistThreshold: profile === 'seated' ? 100 : 180,
    spinAngle: 300, spinWindowMs: 1500, spinMagnitude: profile === 'seated' ? 0.4 : 0.6, neutral: null };
}
const clamp = (v: number, min: number, max: number, fallback: number) => Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
export function sanitizeThresholds(value: Partial<GestureThresholds>, base = defaultThresholds()): GestureThresholds {
  // app's v3 trainer still passes force thresholds >=6 plus twistThreshold.
  // It must not silently resurrect the dead real-phone defaults after migration.
  if(value.swingThreshold!>=4 && value.twistThreshold!==undefined && value.releaseThreshold===undefined)
    value={...value,swingThreshold:base.swingThreshold,releaseThreshold:base.releaseThreshold,spinMagnitude:base.spinMagnitude};
  const fullSpeed = clamp(value.fullSpeed!, 6, 40, base.fullSpeed);
  const swingThreshold = clamp(value.swingThreshold!, 0.6, 8, base.swingThreshold);
  return {
    swingThreshold,
    releaseThreshold: Math.min(swingThreshold * 0.5, clamp(value.releaseThreshold!, 0.15, 2, base.releaseThreshold)),
    refractoryMs: clamp(value.refractoryMs!, 180, 600, base.refractoryMs),
    twistThreshold: clamp(value.twistThreshold!, 80, 350, base.twistThreshold),
    spinAngle: clamp(value.spinAngle!, 280, 340, base.spinAngle),
    spinWindowMs: clamp(value.spinWindowMs!, 1000, 1800, base.spinWindowMs),
    spinMagnitude: clamp(value.spinMagnitude!, 0.3, 3, base.spinMagnitude),
    deadzone: Math.min(fullSpeed - 1, clamp(value.deadzone!, 0, 1, base.deadzone)), fullSpeed,
    neutral: Array.isArray(value.neutral) && value.neutral.length === 2 && value.neutral.every(Number.isFinite)
      ? [value.neutral[0], value.neutral[1]] : value.neutral === null ? null : base.neutral,
  };
}
export function loadThresholds(profile: MotionProfile = 'standard', storage?: Pick<Storage, 'getItem'>): GestureThresholds {
  const base = defaultThresholds(profile);
  try {
    const store = storage ?? globalThis.localStorage;
    const saved = JSON.parse(store?.getItem(CALIBRATION_KEY) || store?.getItem('kaiju.motionCalibration.v4') || store?.getItem('kaiju.motionCalibration.v3') || 'null');
    if (saved?.profile !== profile) return base;
    if (saved.version === 5) return sanitizeThresholds(saved.thresholds, base);
    return base; // Old force/gyro training caused real-phone dead gestures; reset it.
  } catch { return base; }
}
export function saveThresholds(thresholds: GestureThresholds, profile: MotionProfile, storage?: Pick<Storage, 'setItem'>): void {
  try { (storage ?? globalThis.localStorage)?.setItem(CALIBRATION_KEY, JSON.stringify({ version: 5, profile, thresholds })); } catch { /* Private browsing. */ }
}
