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

describe("code flavor look", () => {
  const kit = (over: Partial<PlayerKit>): PlayerKit => ({
    repo: "a/b", title: "Go Ranger", weapon: "smg", skill: "hotfix", maxHp: 7, maxArmor: 5, maxEnergy: 200,
    speed: 90, damageMul: 1, palette: ["#172131", "#00add8", "#ffe2ac", "#f4faf7"], seed: 4242, ...over,
  });
  const code = (tokens: string[]) => ({ tokens, signature: "run()", snippet: "if err != nil { return err }", identifiers: ["ListenAndServe"] });

  it("picks a syntax crest from the real tokens", () => {
    expect(lookFor(kit({ code: code(["{}", "fn"]) })).crestGlyph).toBe("{");
    expect(lookFor(kit({ seed: 4243, code: code(["=>", "let"]) })).crestGlyph).toBe("<>");
    expect(lookFor(kit({ seed: 4244, code: code(["#", "def"]) })).crestGlyph).toBe("#");
    expect(lookFor(kit({ seed: 4245 })).crestGlyph).toBe("");
  });

  it("gives helmets a prompt visor and mages brace eyes", () => {
    expect(lookFor(kit({ seed: 1, weapon: "blade" })).face).toBe("prompt");
    expect(lookFor(kit({ seed: 2, weapon: "staff" })).face).toBe("braces");
    expect(lookFor(kit({ seed: 3, weapon: "smg" })).face).toBe("eyes");
  });

  it("turns the real snippet into syntax-colored minimap rows", () => {
    const L = lookFor(kit({ seed: 77, code: code([":=", "err"]) }));
    expect(L.codeRows.length).toBeGreaterThanOrEqual(12);
    expect(L.codeRows.every((r) => r.length === 8)).toBe(true);
    const colors = new Set(L.codeRows.flat().filter(Boolean));
    expect(colors.has(L.syn.kw)).toBe(true);   // "if", "return", "nil"
    expect(colors.has(L.syn.fn)).toBe(true);   // ListenAndServe()
  });
});
