import { afterEach, expect, it, vi } from 'vitest';
import { getComfortTableHeight, getTableHeightOffset, isVisionProSafari, setTableHeightOffset } from './height';
afterEach(() => vi.unstubAllGlobals());
it('lowers Vision Pro by exactly1m while preserving normal local-floor placement', () => {
  expect(getComfortTableHeight(1.6, 0, false)).toBeCloseTo(1.45);
  expect(getComfortTableHeight(1.6, 0, true)).toBeCloseTo(0.45);
  expect(getComfortTableHeight(3.2, 0, true)).toBeCloseTo(2.05);
  expect(getComfortTableHeight(0, 0, true)).toBeCloseTo(-0.5); // actual zero is valid, no fake1.5m
  expect(getComfortTableHeight(1.6, 0.1, true)).toBeCloseTo(0.55);
});
it('persists10cm offsets and tolerates unavailable storage', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) });
  expect(getTableHeightOffset()).toBe(0); setTableHeightOffset(-0.1); expect(getTableHeightOffset()).toBe(-0.1);
  setTableHeightOffset(100); expect(getTableHeightOffset()).toBe(2);
  vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  expect(getTableHeightOffset()).toBe(0); expect(setTableHeightOffset(0.1)).toBe(0.1);
});
it('keeps Quest/desktop emulation out of the Vision Pro correction', () => {
  const nav = (userAgent: string, maxTouchPoints: number) => ({ userAgent, maxTouchPoints }) as Navigator;
  expect(isVisionProSafari(nav('Macintosh AppleWebKit Safari', 5))).toBe(true);
  expect(isVisionProSafari(nav('Macintosh AppleWebKit Safari', 0))).toBe(false);
  expect(isVisionProSafari({ ...nav('Macintosh AppleWebKit Safari', 0), xr: {} } as Navigator)).toBe(true);
  expect(isVisionProSafari(nav('OculusBrowser Chrome Safari', 5))).toBe(false);
});
