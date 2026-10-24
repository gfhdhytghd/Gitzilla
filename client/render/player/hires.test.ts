import { describe, expect, it } from "vitest";
import { outlinePass, scale2x, shadePass } from "./hires.ts";

describe("edu 2x hero pipeline", () => {
  const R = "#cc3344", B = "#3355cc";
  // 4x3 test sprite with a diagonal edge
  const src = [
    null, R, R, null,
    R, R, B, B,
    null, B, B, null,
  ];

  it("keeps identity: every painted 1x pixel stays painted in its 2x block, no new colors", () => {
    const out = scale2x(src, 4, 3);
    expect(out.length).toBe(8 * 6);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
      if (!src[y * 4 + x]) continue;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) expect(out[(y * 2 + dy) * 8 + x * 2 + dx]).not.toBeNull();
    }
    expect(new Set(out.filter(Boolean))).toEqual(new Set([R, B]));
  });

  it("smooths diagonals (EPX fills the inner corner)", () => {
    const out = scale2x(src, 4, 3);
    // top-left transparent pixel touching R above-right and R below: its bottom-right sub-pixel rounds in
    expect(out[1 * 8 + 1]).toBe(R);
  });

  it("outlines at 2x and shades top edges", () => {
    const out = scale2x(src, 4, 3);
    shadePass(out, 8, 6);
    outlinePass(out, 8, 6, "#000000");
    expect(out.filter((c) => c === "#000000").length).toBeGreaterThan(8);
    expect(out[2]).not.toBe(R); // top row of R got the highlight
  });
});
