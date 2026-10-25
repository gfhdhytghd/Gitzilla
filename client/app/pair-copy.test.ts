import { describe, expect, it } from "vitest";
import { LOCALES } from "../../shared/i18n/locale";
import { PAIR_COPY, trIn } from "./pair-copy";

describe("phone-controller copy", () => {
  it("has four non-empty locales per key with the same placeholders", () => {
    const tags = (s: string) => (s.match(/\{\d\}/g) ?? []).sort().join();
    for (const [key, row] of Object.entries(PAIR_COPY)) {
      expect(row, key).toHaveLength(LOCALES.length);
      for (const text of row) {
        expect(text.trim(), key).not.toBe("");
        expect(tags(text), key).toBe(tags(row[0]));
      }
    }
  });
  it("fills placeholders per language", () => {
    expect(trIn("en", "openOn", "gitzilla.wilflin.me/r/ABCD", "@octocat")).toBe("Open gitzilla.wilflin.me/r/ABCD on your phone, signed in as @octocat.");
    expect(trIn("zh", "offerSeat", "@octocat", "wilf")).toBe("已登录 @octocat · 你的座位：wilf");
    expect(trIn("fr", "dash")).toBe("ESQUIVE");
    expect(trIn("es", "look")).toBe("Mira tu pantalla grande 👀");
  });
  it("uses the server's exact takeover text in English", () => {
    expect(trIn("en", "replaced")).toBe("Another phone took over the controls");
  });
});
