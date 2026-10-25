/** Presentation-only table height. Never move the tracked camera. */
export const TABLE_HEIGHT_OFFSET_KEY = 'kaiju.xr.tableHeightOffset.v2';
export const TABLE_HEIGHT_STEP = 0.1;
export const TABLE_HEIGHT_METERS = 0.8;
export const FALLBACK_EYE_HEIGHT = 1.6;
export interface TableHeightOptions {
  referenceSpaceType: 'local-floor' | 'local';
  /** Raw (before any reference-space offset) viewer y captured once at session start. */
  initialHeadY: number | null;
  /** Existing XR adapter's origin offset; zero for an unmodified reference space. */
  referenceOffsetY?: number;
  userOffset?: number;
}
export interface TableHeightPlacement {
  /** Height in the effective reference space used to render the arena. */
  tableY: number;
  /** Height in the unmodified runtime reference space, before user adjustment. */
  baseTableY: number;
  estimatedEyeHeight: number | null;
  heightSource: 'local-floor' | 'initial-pose-estimate' | 'fallback-1.6m';
}
export function getTableHeightPlacement(options: TableHeightOptions): TableHeightPlacement {
  const floor = options.referenceSpaceType === 'local-floor';
  // WebXR local has no floor guarantee. A plausible nonzero initial y is treated
  // as a runtime-provided floor-relative eye-height *estimate* (0.5–2.5m).
  // A head-origin pose near zero cannot reveal standing height: use1.6m.
  // This is calibration, frozen at session start; later crouching must not move the table.
  const y = options.initialHeadY;
  const plausible = y !== null && Number.isFinite(y) && y >= 0.5 && y <= 2.5;
  const estimatedEyeHeight = floor ? null : plausible ? y : FALLBACK_EYE_HEIGHT;
  const baseTableY = floor ? TABLE_HEIGHT_METERS : TABLE_HEIGHT_METERS - estimatedEyeHeight!;
  const originOffset = Number.isFinite(options.referenceOffsetY) ? options.referenceOffsetY! : 0;
  return {
    // Our XR adapter currently synthesizes a floor for local with a negative
    // offset. Convert back into that effective space exactly once, not twice.
    tableY: baseTableY - originOffset + normalize(options.userOffset ?? 0),
    baseTableY, estimatedEyeHeight,
    heightSource: floor ? 'local-floor' : plausible ? 'initial-pose-estimate' : 'fallback-1.6m',
  };
}
export function isVisionProSafari(nav = globalThis.navigator): boolean {
  const ua = nav?.userAgent ?? '';
  // Identification is diagnostic only; table height never depends on headset brand.
  return /visionOS|Vision Pro/i.test(ua) ||
    (/Safari/.test(ua) && !/Chrome|Chromium|Edg|OculusBrowser/.test(ua) &&
      (!!nav?.xr || (/Macintosh/.test(ua) && (nav?.maxTouchPoints ?? 0) > 0)));
}
export function getTableHeightOffset(): number {
  try { return normalize(Number(globalThis.localStorage?.getItem(TABLE_HEIGHT_OFFSET_KEY) ?? 0)); } catch { return 0; }
}
function normalize(meters: number) {
  if (!Number.isFinite(meters)) return 0;
  return Math.round(Math.max(-2, Math.min(2, meters)) * 1000) / 1000;
}
export function setTableHeightOffset(meters: number): number {
  const value = normalize(meters);
  try { globalThis.localStorage?.setItem(TABLE_HEIGHT_OFFSET_KEY, String(value)); } catch { /* private browsing */ }
  return value;
}
/** Compatibility for callers already in a floor (including synthesized-floor) space.
 * New XR callers should use getTableHeightPlacement with their session-start raw pose. */
export function getComfortTableHeight(_headY: number, userOffset = 0, _visionPro = false): number {
  return TABLE_HEIGHT_METERS + normalize(userOffset);
}
