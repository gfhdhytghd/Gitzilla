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
