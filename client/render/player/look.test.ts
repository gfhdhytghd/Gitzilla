import { describe, expect, it } from "vitest";
import type { PlayerKit } from "../../../shared/types.ts";
import { lookFor } from "./look.ts";

const base: PlayerKit = {
  repo: "a/b", title: "Rust Paladin", weapon: "blade", skill: "hotfix", maxHp: 7, maxArmor: 5, maxEnergy: 200,
  speed: 90, damageMul: 1, palette: ["#172131", "#dea584", "#ffe2ac", "#f4faf7"], seed: 12345,
};

describe("player look", () => {
  it("is deterministic per seed and uses weapon class without design", () => {
    const a = lookFor(base), b = lookFor({ ...base });
    expect(a).toBe(b);
    expect(a.cls).toBe("knight");
    expect(a.headgear).toBe("helmet");
    expect(a.emblem.length).toBe(3);
  });

  it("follows kit.design when present", () => {
    const L = lookFor({
      ...base, weapon: "staff",
      design: { title: "Duck Sage", archetype: "rogue", headgear: "crown", accessory: "rubber-duck", emblem: "PY", palette: ["#3572a5", "#ffd43b", "#f6c193", "#ffe873"], catchphrase: "quack" },
    });
    expect(L.cls).toBe("rogue");
    expect(L.headgear).toBe("hair");
    expect(L.topper).toBe("crown");
    expect(L.duck).toBe(true);
    expect(L.emblem.length).toBe(5);       // 3x5 glyphs
    expect(L.emblem[0].length).toBe(7);    // two chars + gap
    expect(L.c.skin).toBe("#f6c193");
  });

  it("survives junk design palettes", () => {
    const L = lookFor({ ...base, design: { title: "x", archetype: "mage", headgear: "beanie", accessory: "jetpack", emblem: "§", palette: ["nope"], catchphrase: "" } });
    expect(L.headgear).toBe("beanie");
    expect(L.back).toBe("jetpack");
    expect(L.c.primary).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("hero variety (gear roll)", () => {
  const k = (seed: number, over: Partial<PlayerKit> = {}): PlayerKit => ({ ...base, seed, ...over });
  it("is deterministic per repo and keeps class readable", () => {
    const a = lookFor(k(4242)), b = lookFor({ ...k(4242) });
    expect(a.gear).toEqual(b.gear);
    expect(a.cls).toBe("knight");
  });
  it("varies gear, armour family and silhouette across repos of the same language", () => {
    const looks = Array.from({ length: 24 }, (_, i) => lookFor(k(1000 + i * 7919)));
    const sig = new Set(looks.map((L) => [L.gear.body, L.gear.armor, L.gear.coat, L.gear.shoulders, L.headgear].join("|")));
    expect(sig.size).toBeGreaterThan(18);
    expect(new Set(looks.map((L) => L.gear.armor)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(looks.map((L) => L.gear.body)).size).toBe(3);
    expect(new Set(looks.map((L) => L.c.primary)).size).toBeGreaterThan(12);
  });
  it("picks the element from the repo's stat profile", () => {
    expect(lookFor(k(77, { maxArmor: 7 })).gear.element).toBe("ice");
    expect(lookFor(k(78, { damageMul: 1.25 })).gear.element).toBe("fire");
    expect(lookFor(k(79, { speed: 110 })).gear.element).toBe("electric");
    expect(lookFor(k(80, { maxEnergy: 250 })).gear.element).toBe("void");
    expect(lookFor(k(81, { maxHp: 9 })).gear.element).toBe("nature");
  });
});
