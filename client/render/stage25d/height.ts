/** Presentation-only table comfort controls. Never move the tracked camera. */
const KEY = 'kaiju.xr.tableHeightOffset';
export const TABLE_HEIGHT_STEP = 0.1;
export const VISION_PRO_TABLE_CORRECTION = -1;

export function isVisionProSafari(nav = globalThis.navigator): boolean {
  const ua = nav?.userAgent ?? '';
  // Called after immersive session grant. Safari uses desktop/iPad UAs on
  // Vision Pro; touch-point reporting alone is not a reliable headset signal.
  return /visionOS|Vision Pro/i.test(ua) ||
    (/Safari/.test(ua) && !/Chrome|Chromium|Edg|OculusBrowser/.test(ua) &&
      (!!nav?.xr || (/Macintosh/.test(ua) && (nav?.maxTouchPoints ?? 0) > 0)));
}
export function getTableHeightOffset(): number {
  try { return normalize(Number(globalThis.localStorage?.getItem(KEY) ?? 0)); } catch { return 0; }
}
function normalize(meters: number) {
  if (!Number.isFinite(meters)) return 0;
  return Math.round(Math.max(-2, Math.min(2, meters)) * 1000) / 1000;
}
export function setTableHeightOffset(meters: number): number {
  const value = normalize(meters);
  try { globalThis.localStorage?.setItem(KEY, String(value)); } catch { /* private browsing */ }
  return value;
}
export function getComfortTableHeight(headY: number, userOffset = 0, visionPro = false): number {
  if (!Number.isFinite(headY)) throw new RangeError('A tracked head height is required');
  // Preserve the existing normal/emulator placement; apply the user-requested
  // 1m lowering only on Vision Pro. User adjustment is always additive.
  return Math.max(0.5, headY - 0.15) + (visionPro ? VISION_PRO_TABLE_CORRECTION : 0) + normalize(userOffset);
}
