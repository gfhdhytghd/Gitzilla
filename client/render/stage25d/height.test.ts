import { afterEach, expect, it, vi } from 'vitest';
import { FALLBACK_EYE_HEIGHT, getComfortTableHeight, getTableHeightPlacement, getTableHeightOffset, isVisionProSafari, setTableHeightOffset, TABLE_HEIGHT_OFFSET_KEY } from './height';
afterEach(() => vi.unstubAllGlobals());
it.each([0, 0.9, 1.6, 3.2, NaN])('local-floor table is0.50m regardless of head pose %s or headset brand', y => {
  expect(getTableHeightPlacement({ referenceSpaceType: 'local-floor', initialHeadY: y })).toEqual({ tableY: 0.5, baseTableY: 0.5, estimatedEyeHeight: null, heightSource: 'local-floor' });
  expect(getComfortTableHeight(y, 0, true)).toBe(0.5);
  expect(getComfortTableHeight(y, 0, false)).toBe(0.5);
});
it.each([0.5, 1.2, 1.6, 1.85, 2.5])('local uses a plausible initial floor-relative pose %s as an eye-height estimate', y => {
  const result = getTableHeightPlacement({ referenceSpaceType: 'local', initialHeadY: y, userOffset: 0.1 });
  expect(result.estimatedEyeHeight).toBe(y); expect(result.heightSource).toBe('initial-pose-estimate');
  expect(result.baseTableY).toBeCloseTo(0.5 - y); expect(result.tableY).toBeCloseTo(0.5 - y + 0.1);
});
it.each([null, 0, 0.01, -1, 0.49, 2.51, Infinity, NaN])('local head-origin/unknown/implausible pose %s uses documented1.6m fallback', y => {
  const result = getTableHeightPlacement({ referenceSpaceType: 'local', initialHeadY: y });
  expect(result.estimatedEyeHeight).toBe(FALLBACK_EYE_HEIGHT); expect(result.heightSource).toBe('fallback-1.6m');
  expect(result.tableY).toBeCloseTo(-1.1);
});
it('converts the raw local result into the existing synthesized-floor space once, retaining user adjustment', () => {
  expect(getTableHeightPlacement({ referenceSpaceType: 'local', initialHeadY: 0, referenceOffsetY: -1.6, userOffset: 0.1 }).tableY).toBeCloseTo(0.6);
  expect(getTableHeightPlacement({ referenceSpaceType: 'local', initialHeadY: 1.85, referenceOffsetY: -1.6 }).tableY).toBeCloseTo(0.25);
});
it('discards old-base offsets and persists only the new10cm adjustments', () => {
  const values = new Map<string, string>([['kaiju.xr.tableHeightOffset', '1.4'], ['kaiju.xr.tableHeightOffset.v2', '0.3']]);
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) });
  expect(getTableHeightOffset()).toBe(0); setTableHeightOffset(-0.1); expect(getTableHeightOffset()).toBe(-0.1);
  expect(TABLE_HEIGHT_OFFSET_KEY).toBe('kaiju.xr.tableHeightOffset.v3');
  expect(values.get('kaiju.xr.tableHeightOffset.v2')).toBe('0.3');
  expect(values.get(TABLE_HEIGHT_OFFSET_KEY)).toBe('-0.1'); expect(values.get('kaiju.xr.tableHeightOffset')).toBe('1.4');
  setTableHeightOffset(100); expect(getTableHeightOffset()).toBe(2);
  expect(getTableHeightPlacement({ referenceSpaceType: 'local-floor', initialHeadY: 1.6, userOffset: -0.1 }).tableY).toBeCloseTo(0.4);
  vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  expect(getTableHeightOffset()).toBe(0); expect(setTableHeightOffset(0.1)).toBe(0.1);
});
it('normalizes invalid offsets without altering the floor base', () => {
  expect(getTableHeightPlacement({ referenceSpaceType: 'local-floor', initialHeadY: null, userOffset: NaN, referenceOffsetY: NaN }).tableY).toBe(0.5);
});
it('keeps Vision Pro detection diagnostic, without a brand-dependent correction', () => {
  const nav = (userAgent: string, maxTouchPoints: number) => ({ userAgent, maxTouchPoints }) as Navigator;
  expect(isVisionProSafari(nav('Macintosh AppleWebKit Safari', 5))).toBe(true);
  expect(isVisionProSafari(nav('Macintosh AppleWebKit Safari', 0))).toBe(false);
  expect(isVisionProSafari({ ...nav('Macintosh AppleWebKit Safari', 0), xr: {} } as Navigator)).toBe(true);
  expect(isVisionProSafari(nav('OculusBrowser Chrome Safari', 5))).toBe(false);
});
