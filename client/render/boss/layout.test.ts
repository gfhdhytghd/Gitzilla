import { describe, expect, it } from "vitest";
import type { BossBody, BossKit, BossState } from "../../../shared/types.ts";
import { bossKitFromProfile, bossRegions } from "../../../sim/index.ts";
import { syntheticProfile } from "../../../sim/bots.ts";
import { bossHitRegions, bossLayout } from "./layout.ts";
import { kaijuAnchors } from "../../../shared/kaiju-anatomy.ts";

const BODIES: BossBody[] = ["blob", "serpent", "spider", "hydra", "golem", "swarm", "eye", "tree", "machine"];

function stateFor(seed: number): BossState {
  const kit = bossKitFromProfile(syntheticProfile(seed), 4);
  const s: BossState = {
    x: 300, y: 144, hp: kit.maxHp, maxHp: kit.maxHp, phase: 1,
    limbs: kit.limbs.map((l) => ({ id: l.id, hp: l.maxHp, maxHp: l.maxHp, broken: false })),
    casting: null, targetPlayer: null, enraged: false, regions: [], kit,
    pose: { name: "idle", t: 0, total: 1, dir: [-1, 0] }, airborne: false,
  };
  s.regions = bossRegions(s);
  return s;
}

describe("boss layout", () => {
  it("kaiju art sits exactly on the shared anatomy anchors (the sim builds hit regions from the same function)", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const kit = { ...stateFor(seed).kit, forceBody: "kaiju" } as BossKit;
      const L = bossLayout(kit);
      const A = kaijuAnchors(kit);
      expect(L.body).toBe("kaiju");
      expect(A.limbs.map((l) => l.id)).toEqual(kit.limbs.map((l) => l.id));
      for (const a of A.limbs) {
        const l = L.limbs.find((q) => q.id === a.id)!;
        expect([l.x, l.y, l.hitR]).toEqual([a.dx, a.dy, a.r]);
      }
      expect([L.heart.x, L.heart.y, L.heart.hitR]).toEqual([A.chest.dx, A.chest.dy, A.chest.r]);
      expect(L.kaiju?.plates.length).toBeGreaterThanOrEqual(7);
    }
  });

  it("fallback (no regions) limb positions match sim bossRegions for kaiju and variants", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s0 = stateFor(seed);
      const s = { ...s0, kit: { ...s0.kit, forceBody: seed % 2 ? "blob" : "kaiju" } as BossKit };
      const mine = bossHitRegions(s.kit, s.x, s.y);
      for (const r of s.regions) {
        const m = mine.find((q) => q.id === r.id)!;
        expect(m).toBeTruthy();
        expect(Math.abs(m.x - r.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(m.y - r.y)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("anchors from regions drive limb positions for every archetype", () => {
    const s = stateFor(5);
    const anchors = s.regions.map((r) => ({ id: r.id, x: r.x - s.x + 3, y: r.y - s.y - 2, r: r.r }));
    for (const body of BODIES) {
      const kit = { ...s.kit, forceBody: body, design: { name: "X", epithet: "", body, eyes: 7, mouth: "maw" as const, growths: ["spikes" as const, "wings" as const], palette: ["#211329", "#465b72", "#ff547b", "#bb83ef", "#fff4bd"], theme: "web" as const, intro: [], taunts: [], attackNames: {}, limbNames: {} } };
      const L = bossLayout(kit, anchors);
      expect(L.body).toBe(body);
      for (const l of L.limbs) {
        const a = anchors.find((q) => q.id === l.id)!;
        expect(l.x).toBe(Math.round(a.x));
        expect(l.y).toBe(Math.round(a.y));
      }
      expect(L.lobes.length).toBeGreaterThan(0);
      expect(L.eyes.length).toBeGreaterThan(0);
    }
  });
});
