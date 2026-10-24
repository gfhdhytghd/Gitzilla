import type { MotionProfile } from '../../shared/types';

export const MOTION_PROFILE_KEY = 'kaiju.motionProfile';
export const MOTION_PROFILES: MotionProfile[] = ['standard', 'seated', 'tap-only'];
export const MOTION_PROFILE_LABELS: Record<MotionProfile, string> = {
  standard: 'Standard', seated: 'Seated / low-motion', 'tap-only': 'Tap only',
};
export const MOTION_SETTINGS = {
  standard: { deadzone: 0.6, fullSpeed: 15, smoothingMs: 45, swingThreshold: 12, releaseThreshold: 5, refractoryMs: 200 },
  seated: { deadzone: 0.6, fullSpeed: 15, smoothingMs: 45, swingThreshold: 6, releaseThreshold: 3, refractoryMs: 350 },
  'tap-only': { deadzone: 0, fullSpeed: 1, smoothingMs: 65, swingThreshold: Infinity, releaseThreshold: 0, refractoryMs: 350 },
} satisfies Record<MotionProfile, Record<string, number>>;

export function isMotionProfile(value: unknown): value is MotionProfile {
  return value === 'standard' || value === 'seated' || value === 'tap-only';
}

export function loadMotionProfile(storage?: Pick<Storage, 'getItem'>): MotionProfile {
  try {
    const value = (storage ?? globalThis.localStorage)?.getItem(MOTION_PROFILE_KEY);
    return isMotionProfile(value) ? value : 'standard';
  } catch { return 'standard'; }
}

/** Client-local only: never sent to the room/server or mixed into quality stats. */
export function saveMotionProfile(profile: MotionProfile, storage?: Pick<Storage, 'setItem'>): void {
  try { (storage ?? globalThis.localStorage)?.setItem(MOTION_PROFILE_KEY, profile); } catch { /* Private browsing can disable storage. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('kaiju:motion-profile'));
}
