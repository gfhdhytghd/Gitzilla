import { describe, expect, it } from "vitest";
import { heroScaleOf, memIsStale, pulse, safeScale } from "./memory.ts";

describe("per-player render memory across rematches", () => {
  it("rebuilds memory when the clock goes backwards (rematch: ids reused, visTime restarts near 0)", () => {
    expect(memIsStale({ t: 120, seed: 7 }, 0.05, 7)).toBe(true);
    expect(memIsStale({ t: 120, seed: 7 }, 120.016, 7)).toBe(false);   // normal next frame
    expect(memIsStale({ t: 120, seed: 7 }, 119.9, 7)).toBe(false);     // tiny jitter is fine
  });
  it("rebuilds after a long gap or when the same id gets a different hero", () => {
    expect(memIsStale({ t: 10, seed: 7 }, 20, 7)).toBe(true);
    expect(memIsStale({ t: 10, seed: 7 }, 10.02, 8)).toBe(true);
    expect(memIsStale({ t: NaN, seed: 7 }, 1, 7)).toBe(true);
  });
  it("never lets a timed effect exceed 1 or go negative for future / NaN ages", () => {
    expect(pulse(-119.9, 0.16)).toBe(0);
    expect(pulse(NaN, 0.16)).toBe(0);
    expect(pulse(0, 0.16)).toBe(1);
    expect(pulse(0.08, 0.16)).toBeCloseTo(0.5);
    expect(pulse(1, 0.16)).toBe(0);
  });
  it("regression: the old squash math exploded on rematch, the guarded one stays sane", () => {
    const hurtT = 119.95, t = 0.05;                       // hurt at the end of match 1, first frame of match 2
    const oldK = Math.max(0, 1 - (t - hurtT) / 0.16);
    expect(1 + 0.16 * oldK).toBeGreaterThan(100);         // HUGE
    expect(1 - 0.12 * oldK).toBeLessThan(0);              // FLIPPED (negative scale)
    const k = pulse(t - hurtT, 0.16);
    expect(safeScale(1 + 0.16 * k)).toBe(1);
    expect(safeScale(1 - 0.12 * k)).toBe(1);
    expect(safeScale(-88)).toBeGreaterThan(0);
    expect(safeScale(NaN)).toBe(1);
  });
  it("sanitizes the caller's hero scale", () => {
    expect(heroScaleOf(undefined)).toBe(1);
    expect(heroScaleOf(NaN)).toBe(1);
    expect(heroScaleOf(-2)).toBe(1);
    expect(heroScaleOf(2)).toBe(2);
    expect(heroScaleOf(9)).toBe(3);
  });
});
