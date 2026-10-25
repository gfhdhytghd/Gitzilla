import { describe, expect, it } from "vitest";
import type { BossState } from "../../../shared/types.ts";
import { every, fx, fxClock, fxMatchTime, onFxReset, resetFx } from "./fx.ts";
import { drawBoss } from "../boss/index.ts";

// rematch soak (docs/progress/codex-qa.md): stale victory / defeat timestamps and per-match state came back in later fights
describe("fx match lifecycle", () => {
  it("resetFx drops end-of-match / timing state, emit gates and registered per-match state", () => {
    let hooked = 0;
    onFxReset(() => hooked++);
    Object.assign(fx, { victoryAt: 82.5, defeatAt: 40.6, phaseGlitch: 80, limbBreak: 81, bossFlash: 81, flash: 1, danger: 1, shake: 5 });
    fx.limbFlash.set("limb0", 81);
    expect(every("k", 5, 100)).toBe(true);
    expect(every("k", 5, 101)).toBe(false);
    resetFx();
    expect([fx.victoryAt, fx.defeatAt]).toEqual([-1, -1]);
    expect([fx.phaseGlitch, fx.limbBreak, fx.bossFlash, fx.flash, fx.danger, fx.shake]).toEqual([-10, -10, -10, 0, 0, 0]);
    expect(fx.limbFlash.size).toBe(0);
    expect(every("k", 5, 101)).toBe(true);
    expect(hooked).toBe(1);
  });

  it("a rewound match clock (rematch on the same screen) resets; a running one does not", () => {
    resetFx();
    fxMatchTime(10); fxMatchTime(50);
    fx.victoryAt = 82.5;
    fxMatchTime(50.5);
    expect(fx.victoryAt).toBe(82.5);
    fxMatchTime(0.2);
    expect(fx.victoryAt).toBe(-1);
  });

  it("the render clock restarting near 0 (a new game screen) resets; a step back after leaving XR does not", () => {
    resetFx();
    fxClock(88);
    fx.defeatAt = 80;
    fxClock(60); // screen clock behind the stage's XR clock
    expect(fx.defeatAt).toBe(80);
    fxClock(0.016);
    expect(fx.defeatAt).toBe(-1);
    expect(fx.now).toBe(0.016);
  });

  it("drawBoss hands the caller's context back balanced even when drawing throws", () => {
    let depth = 0;
    const ctx = { save: () => depth++, restore: () => depth--, canvas: { width: 1, height: 1 } } as unknown as CanvasRenderingContext2D;
    const bad = { x: 0, y: 0, hp: 1, maxHp: 1, phase: 1, limbs: [], regions: [], kit: null } as unknown as BossState;
    expect(() => drawBoss(ctx, bad, 1)).toThrow();
    expect(depth).toBe(0);
  });
});
