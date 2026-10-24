import type { MotionProfile } from '../../shared/types';
import { MOTION_SETTINGS } from './profiles';

export interface GestureThresholds {
  swingThreshold: number;
  releaseThreshold: number;
  refractoryMs: number;
  twistThreshold: number; // deg/s, both iOS and Android
  spinAngle: number; // integrated degrees in spinWindowMs
  spinWindowMs: number;
  deadzone: number;
  fullSpeed: number;
  neutral: [number, number] | null;
}
export const CALIBRATION_KEY = 'kaiju.motionCalibration.v3';
export function defaultThresholds(profile: MotionProfile = 'standard'): GestureThresholds {
  return { ...MOTION_SETTINGS[profile], twistThreshold: profile === 'seated' ? 100 : 180,
    spinAngle: 270, spinWindowMs: 1200, neutral: null };
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
    spinAngle: clamp(value.spinAngle!, 220, 300, base.spinAngle),
    spinWindowMs: clamp(value.spinWindowMs!, 900, 1400, base.spinWindowMs),
    deadzone: Math.min(fullSpeed - 1, clamp(value.deadzone!, 0, 1, base.deadzone)), fullSpeed,
    neutral: Array.isArray(value.neutral) && value.neutral.length === 2 && value.neutral.every(Number.isFinite)
      ? [value.neutral[0], value.neutral[1]] : value.neutral === null ? null : base.neutral,
  };
}
export function loadThresholds(profile: MotionProfile = 'standard', storage?: Pick<Storage, 'getItem'>): GestureThresholds {
  const base = defaultThresholds(profile);
  try {
    const saved = JSON.parse((storage ?? globalThis.localStorage)?.getItem(CALIBRATION_KEY) || 'null');
    return saved?.version === 3 && saved.profile === profile ? sanitizeThresholds(saved.thresholds, base) : base;
  } catch { return base; }
}
export function saveThresholds(thresholds: GestureThresholds, profile: MotionProfile, storage?: Pick<Storage, 'setItem'>): void {
  try { (storage ?? globalThis.localStorage)?.setItem(CALIBRATION_KEY, JSON.stringify({ version: 3, profile, thresholds })); } catch { /* Private browsing. */ }
}
