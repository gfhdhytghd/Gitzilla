import { describe, expect, it } from "vitest";
import type { BossBody, BossState } from "../../../shared/types.ts";
import { bossKitFromProfile, bossRegions } from "../../../sim/index.ts";
import { syntheticProfile } from "../../../sim/bots.ts";
import { bossHitRegions, bossLayout } from "./layout.ts";

const BODIES: BossBody[] = ["blob", "serpent", "spider", "hydra", "golem", "swarm", "eye", "tree", "machine"];

function stateFor(seed: number): BossState {
  const kit = bossKitFromProfile(syntheticProfile(seed), 4);
  const s: BossState = {
    x: 300, y: 144, hp: kit.maxHp, maxHp: kit.maxHp, phase: 1,
    limbs: kit.limbs.map((l) => ({ id: l.id, hp: l.maxHp, maxHp: l.maxHp, broken: false })),
    casting: null, targetPlayer: null, enraged: false, regions: [], kit,
  };
  s.regions = bossRegions(s);
  return s;
}

describe("boss layout", () => {
  it("fallback layout matches sim bossRegions", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = stateFor(seed);
      const mine = bossHitRegions(s.kit, s.x, s.y);
      for (const r of s.regions) {
        const m = mine.find((q) => q.id === r.id)!;
        expect(m).toBeTruthy();
        expect(Math.abs(m.x - r.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(m.y - r.y)).toBeLessThanOrEqual(1);
        expect(m.r).toBe(r.r);
      }
    }
  });

  it("anchors from regions drive limb positions for every archetype", () => {
    const s = stateFor(5);
    const anchors = s.regions.map((r) => ({ id: r.id, x: r.x - s.x + 3, y: r.y - s.y - 2, r: r.r }));
    for (const body of BODIES) {
      const kit = { ...s.kit, design: { name: "X", epithet: "", body, eyes: 7, mouth: "maw" as const, growths: ["spikes" as const, "wings" as const], palette: ["#211329", "#465b72", "#ff547b", "#bb83ef", "#fff4bd"], theme: "web" as const, intro: [], taunts: [], attackNames: {}, limbNames: {} } };
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
