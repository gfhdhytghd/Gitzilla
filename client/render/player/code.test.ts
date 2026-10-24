import { describe, expect, it } from "vitest";
import { lookFor } from "./look.ts";
import type { PlayerKit } from "../../../shared/types.ts";

describe("look from kit.code", () => {
  const base: PlayerKit = {
    repo: "a/b", title: "Rust Paladin", weapon: "blade", skill: "hotfix", maxHp: 7, maxArmor: 5, maxEnergy: 200,
    speed: 90, damageMul: 1, palette: ["#172131", "#dea584", "#ffe2ac", "#f4faf7"], seed: 777,
  };
  it("puts a short real token on the chest and etches the top token", () => {
    const L = lookFor({ ...base, code: { tokens: ["impl", "::", "fn"], signature: "borrow_mut()", snippet: "fn main() {", identifiers: [] } });
    expect(L.emblem.length).toBe(5);        // "::" rendered as 3x5 glyphs
    expect(L.emblem[0].length).toBe(7);
    expect(L.etch).toBe("impl");
  });
  it("falls back to the language emblem without code", () => {
    const L = lookFor({ ...base, seed: 778 });
    expect(L.emblem.length).toBe(3);
    expect(L.etch).toBe("");
  });
});
