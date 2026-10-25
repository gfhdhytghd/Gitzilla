import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RepoProfile } from "../../shared/types.ts";
import { bossKitFromProfile, playerKitFromProfile } from "../../sim/kits.ts";
import { asPvpKit } from "../../sim/pvpPower.ts";
import { componentOf, cycleEdges, forceLayout, longestChain } from "./graph.ts";
import { archetypeStep, buildGenesisLocal, genesisFromKit, heroBudget, isFormStep } from "./local.ts";
import { TextLayer } from "./text.ts";

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
  it("wraps reveal captions without cutting a code identifier or closing delimiter", () => {
    const measure = { measure: (s: string) => s.length } as unknown as TextLayer;
    const text = "weapon for { go serveLonger() }";
    const rows = TextLayer.prototype.wrap.call(measure, text, 25);
    expect(rows.join(" ")).toBe(text);
    expect(rows.every(row => row.length <= 25)).toBe(true);
    expect(rows.some(row => row.includes("serveLonger()"))).toBe(true);
    expect(rows.at(-1)?.endsWith("}")).toBe(true);
  });
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
      expect(gb.trace.filter((s) => s.part === "limb" && s.ref !== "dependencies")).toHaveLength(boss.limbs.length);
      expect(gb.trace.some((s) => s.part === "heart")).toBe(true);
      if (p.cycles.length) expect(gb.trace.some((s) => s.part === "weakpoint")).toBe(true);
    }
  });
  it("edu trace is the report card", () => {
    const p = profiles[0];
    const kit = playerKitFromProfile(p, { mode: "edu" });
    const g = buildGenesisLocal(p, kit);
    if (kit.quality?.length) {
      expect(g.trace.filter((s) => s.ref && kit.quality!.some((q) => `quality:${q.stat}` === s.ref))).toHaveLength(kit.quality.length);
      expect(g.budget).toEqual([]);
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
      expect(g.trace[0].ref).toBe("archetype");
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

  it("kit-only PvP stories describe repo power, battle stories keep the equal budget", () => {
    const p = profiles[0];
    const pvp = asPvpKit(playerKitFromProfile(p));
    const g = genesisFromKit(pvp, "pvp");
    const text = g.trace.map((s) => `${s.from} ${s.to}`).join("\n");
    expect(text).not.toMatch(/5-pt|equal/i);
    expect(g.trace.find((s) => s.ref === "pvp-power")?.to).toBe(`stats: POWER ${Math.round(pvp.pvpPower!.score * 10) / 10}`);
    expect(g.trace.filter((s) => s.ref?.startsWith("pvp-power:part:"))).toHaveLength(Math.min(3, pvp.pvpPower!.parts.length));
    expect(g.budget.length).toBeGreaterThan(0);
    expect(g.budget.every((b) => b.value >= 0 && b.value <= 100)).toBe(true);
    // pvp mode before the sim attached a score: no invented numbers
    const bare = genesisFromKit(playerKitFromProfile(p), "pvp");
    expect(bare.trace.find((s) => s.ref === "pvp-power")?.to).toBe("stats: scaled by repo power");
    expect(bare.budget).toEqual([]);
    const battle = genesisFromKit(playerKitFromProfile(p), "battle");
    expect(battle.trace.some((s) => s.to === "stats: same 5-pt budget")).toBe(true);
  });
  it("kit-only edu stories never claim equal budgets or invent source metrics", () => {
    const p = profiles[0];
    const kit = playerKitFromProfile(p, { mode: "edu" });
    const g = genesisFromKit(kit);
    expect(g.trace).toContainEqual({ from: "code quality", to: "stats: see your report card", part: "stats" });
    expect(g.trace.filter(s => s.ref?.startsWith("quality:"))).toHaveLength(kit.quality!.length);
    expect(JSON.stringify(g)).not.toMatch(/5-pt|same 5|equal for all/);
    expect(g.budget).toEqual([]);
    const waiting = genesisFromKit(playerKitFromProfile(p), "edu");
    expect(waiting.budget).toEqual([]);
    expect(JSON.stringify(waiting)).not.toContain("5-pt");
    const boss = genesisFromKit(bossKitFromProfile(p, 4));
    expect(boss.components.every(c => c.loc === 0 && c.files === 0)).toBe(true);
    expect(boss.budget.reduce((s, b) => s + b.value, 0)).toBeCloseTo(100);
  });
});
