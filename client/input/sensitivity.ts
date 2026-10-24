export type TiltSensitivity = 'slow' | 'normal' | 'fast';
export const TILT_SENSITIVITIES: TiltSensitivity[] = ['slow', 'normal', 'fast'];
export const TILT_SENSITIVITY_KEY = 'kaiju.tiltSensitivity';
export const TILT_FULL_SPEED: Record<TiltSensitivity, number> = { slow: 20, normal: 15, fast: 10 };
export function loadTiltSensitivity(): TiltSensitivity {
  try { const value = localStorage.getItem(TILT_SENSITIVITY_KEY); return value === 'slow' || value === 'fast' ? value : 'normal'; }
  catch { return 'normal'; }
}
export function saveTiltSensitivity(value: TiltSensitivity): void {
  if (!TILT_SENSITIVITIES.includes(value)) return;
  try { localStorage.setItem(TILT_SENSITIVITY_KEY, value); } catch { /* Private browsing. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('kaiju:tilt-sensitivity'));
}
