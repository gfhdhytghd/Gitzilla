import { describe, expect, it } from "vitest";
import { asciiBar, fmtTime, normalizeRepo, shortRepo } from "./util";

describe("app utils", () => {
  it("normalizes repo input forms to owner/name", () => {
    expect(normalizeRepo("pallets/flask")).toBe("pallets/flask");
    expect(normalizeRepo(" https://github.com/pallets/flask.git ")).toBe("pallets/flask");
    expect(normalizeRepo("github.com/facebook/react/tree/main/packages")).toBe("facebook/react");
    expect(normalizeRepo("https://www.github.com/vuejs/core?tab=readme#x")).toBe("vuejs/core");
  });
  it("formats time, bars and short names", () => {
    expect(fmtTime(163.4)).toBe("02:43");
    expect(asciiBar(0.5, 4)).toBe("[##..]");
    expect(shortRepo("lodash/lodash")).toBe("lodash");
  });
});
