import { describe, expect, it } from "vitest";
import type { BossState } from "../../../shared/types.ts";
import { bossKitFromProfile, bossRegions } from "../../../sim/index.ts";
import { syntheticProfile } from "../../../sim/bots.ts";
import { bossPlane, lift } from "./staging.ts";

function boss(seed: number): BossState {
  const kit = bossKitFromProfile(syntheticProfile(seed), 4);
  const s: BossState = {
    x: 300, y: 140, hp: kit.maxHp, maxHp: kit.maxHp, phase: 1,
    limbs: kit.limbs.map((l) => ({ id: l.id, hp: l.maxHp, maxHp: l.maxHp, broken: false })),
    casting: null, targetPlayer: null, enraged: false, regions: [], kit,
    pose: { name: "idle", t: 0, total: 1, dir: [-1, 0] }, airborne: false,
  };
  s.regions = bossRegions(s);
  return s;
}

describe("3D stage boss staging", () => {
  it("hits on a limb region land on that limb of the standing billboard", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const b = boss(seed);
      const P = bossPlane(b)!;
      const out: [number, number, number] = [0, 0, 0];
      for (const r of b.regions) {
        if (r.y >= P.feetY || r.x <= P.x0 || r.x >= P.x1) continue;
        lift(P, r.x, r.y, 0, out);
        // the billboard draws the 2D sprite point (x, y) at height feetY - y on the plane z = feetY
        expect(out[0]).toBe(r.x);
        expect(out[2]).toBeCloseTo(P.feetY, 6);
        expect(out[1]).toBeCloseTo(P.feetY - r.y, 6);
      }
    }
  });

  it("is continuous (no jumps when a shot crosses the feet line or the footprint edges)", () => {
    const P = bossPlane(boss(3))!;
    const a: [number, number, number] = [0, 0, 0], c: [number, number, number] = [0, 0, 0];
    for (let x = P.x0 - 30; x <= P.x1 + 30; x += 3)
      for (let y = P.top - 50; y <= P.feetY + 30; y += 0.5) {
        lift(P, x, y, 12, a);
        lift(P, x, y + 0.5, 12, c);
        // a 0.5 px step never moves the 3D point more than a few px (a jump would be ~the plane height, 50+ px)
        expect(Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2])).toBeLessThan(4);
      }
  });

  it("leaves points away from the boss (and with no boss) on the floor at their height", () => {
    const out: [number, number, number] = [0, 0, 0];
    expect(lift(null, 10, 20, 12, out)).toEqual([10, 12, 20]);
    const P = bossPlane(boss(2))!;
    expect(lift(P, P.x0 - 40, P.top + 10, 12, out)).toEqual([P.x0 - 40, 12, P.top + 10]);
    expect(lift(P, P.bx, P.feetY + 5, 12, out)).toEqual([P.bx, 12, P.feetY + 5]);
  });
});
