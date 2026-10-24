import { describe, expect, it } from "vitest";
import { tokenize } from "./codefmt";

describe("weapon code formatting", () => {
  it("highlights keywords, calls and punctuation without losing characters", () => {
    for (const src of ["for { go serve() }", "yield from app()", "unsafe { search() }", "puts() Cutter", `match "x" => 42`]) {
      const toks = tokenize(src);
      expect(toks.map((t) => t.text).join("")).toBe(src);
    }
    const kinds = Object.fromEntries(tokenize("for { go serve() }").filter((t) => t.text.trim()).map((t) => [t.text, t.kind]));
    expect(kinds).toMatchObject({ for: "kw", go: "kw", serve: "fn", "{": "op", "()": "op" });
    expect(tokenize("yield from app()").find((t) => t.text === "app")?.kind).toBe("fn");
  });
});
