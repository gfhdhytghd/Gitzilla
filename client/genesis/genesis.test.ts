import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RepoProfile } from "../../shared/types.ts";
import { bossKitFromProfile, playerKitFromProfile } from "../../sim/kits.ts";
import { componentOf, cycleEdges, forceLayout, longestChain } from "./graph.ts";
import { archetypeStep, buildGenesisLocal, genesisFromKit, heroBudget, isFormStep } from "./local.ts";

const dir = new URL("../../data/fallback/", import.meta.url);
const profiles = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")) as RepoProfile);

describe("genesis graph helpers", () => {
  it("matches paths to the longest component prefix", () => {
    const comps = [{ name: "src" }, { name: "src/core" }, { name: "tests" }];
    expect(componentOf("src/core/a.ts", comps)).toBe(1);
    expect(componentOf("src/b.ts", comps)).toBe(0);
    expect(componentOf("docs/x.md", comps)).toBe(-1);
  });
  it("finds cycle edges and the longest chain", () => {
    const comps = [{ name: "a" }, { name: "b" }, { name: "c" }];
    const edges: [number, number][] = [[0, 1], [1, 0], [1, 2]];
    expect([...cycleEdges(comps, edges, [["a", "b"]])].sort()).toEqual([0, 1]);
    expect(longestChain(3, [[0, 1], [1, 2]])).toEqual([0, 1, 2]);
  });
  it("force layout is deterministic and stays in the box", () => {
    const a = forceLayout([5, 8, 4, 6], [[0, 1], [1, 2]], 200, 120, 7);
    const b = forceLayout([5, 8, 4, 6], [[0, 1], [1, 2]], 200, 120, 7);
    expect(a).toEqual(b);
    for (const p of a) { expect(Math.abs(p.x)).toBeLessThanOrEqual(100); expect(Math.abs(p.y)).toBeLessThanOrEqual(60); }
  });
});

describe("local genesis", () => {
  it("builds a compact, real-data genesis for every fallback hero and boss", () => {
    for (const p of profiles) {
      const hero = playerKitFromProfile(p);
      const gh = buildGenesisLocal(p, hero);
      expect(gh.trace.map((s) => s.part)).toEqual(expect.arrayContaining(["class", "weapon", "skill", "stats"]));
      expect(gh.budget.reduce((s, b) => s + b.value, 0)).toBe(5); // equal budget in battle
      expect(JSON.stringify(gh).length).toBeLessThan(14000);
      for (const f of gh.sampleFiles) expect(typeof f).toBe("string");
      const boss = bossKitFromProfile(p, 4);
      const gb = buildGenesisLocal(p, boss);
      expect(gb.trace.filter((s) => s.part === "limb")).toHaveLength(boss.limbs.length);
      expect(gb.trace.some((s) => s.part === "heart")).toBe(true);
      if (p.cycles.length) expect(gb.trace.some((s) => s.part === "weakpoint")).toBe(true);
    }
  });
  it("edu trace is the report card", () => {
    const p = profiles[0];
    const kit = playerKitFromProfile(p, { mode: "edu" });
    const g = buildGenesisLocal(p, kit);
    if (kit.quality?.length) {
      expect(g.trace.filter((s) => s.ref && kit.quality!.some((q) => q.stat === s.ref))).toHaveLength(kit.quality.length);
      expect(g.budget.map((b) => b.label)).toEqual(kit.quality.map((q) => q.stat));
    }
  });
  it("kit-only fallback still tells a story", () => {
    const p = profiles[0];
    expect(genesisFromKit(bossKitFromProfile(p, 4)).trace.length).toBeGreaterThan(2);
    const hero = playerKitFromProfile(p);
    expect(genesisFromKit(hero).budget).toEqual(heroBudget(hero));
  });
  it("boss stories open with why this archetype", () => {
    for (const p of profiles) {
      const boss = bossKitFromProfile(p, 4);
      const g = buildGenesisLocal(p, boss);
      expect(isFormStep(g.trace[0])).toBe(true);
      expect(g.trace[0].ref).toBe(boss.archetype ?? "kaiju");
      expect(g.trace.filter(isFormStep)).toHaveLength(1);
      expect(isFormStep(genesisFromKit(boss).trace[0])).toBe(true);
    }
    const kit = { ...bossKitFromProfile(profiles[0], 4), archetype: "hydra" as const };
    kit.code = { ...kit.code!, archetypeReason: "4 circular dependency groups → multiple heads and winged flight." } as typeof kit.code;
    expect(archetypeStep(buildGenesisLocal(profiles[0], kit), kit)).toMatchObject({ from: "4 circular dependency groups", to: "form: HYDRA · multiple heads and winged flight", ref: "hydra" });
    // limb / name steps never count as the form step, even when a limb is named after the archetype
    expect(isFormStep({ from: "src", to: "limb: hydra", part: "limb", ref: "hydra" })).toBe(false);
    expect(isFormStep({ from: "5 modules · 0 cycles", to: "Kaiju · crystal-backed titan", part: "class", ref: "archetype" })).toBe(true);
  });
});
