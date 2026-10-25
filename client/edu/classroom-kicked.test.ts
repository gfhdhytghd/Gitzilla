import { describe, expect, it } from "vitest";
import { bundleFiles } from "./classroom-kicked.ts";

describe("bundleFiles (download my code after being removed)", () => {
  it("downloads a single file as-is, named after it", () => {
    expect(bundleFiles([{ path: "python/01_hello.py", content: "print('hi')\n" }, { path: "README.md", content: "  \n" }], "ABCD"))
      .toEqual({ name: "01_hello.py", text: "print('hi')\n" });
  });
  it("joins several files into one text file with a header per file", () => {
    const out = bundleFiles([{ path: "a.py", content: "x = 1" }, { path: "README.md", content: "notes\n" }], "ABCD")!;
    expect(out.name).toBe("classroom-ABCD-code.txt");
    expect(out.text).toBe("# ---- a.py ----\nx = 1\n\n# ---- README.md ----\nnotes\n");
  });
  it("offers nothing when there's no code", () => {
    expect(bundleFiles([], "ABCD")).toBeNull();
    expect(bundleFiles([{ path: "a.py", content: "\n" }], "ABCD")).toBeNull();
  });
});

describe("remove / removed strings are in the real catalog (shared/i18n), zh/es/fr", async () => {
  const { translate } = await import("../../shared/i18n/text.ts");
  it("translates the strings exactly as the UI renders them (names filled into {0})", () => {
    expect(translate("Remove Ana from the class? They can't rejoin this classroom. Work they already handed in stays in your exports.", "zh")).toBe("要将 Ana 移出课堂吗？移出后无法再加入本课堂。已提交的作业仍保留在你的导出结果中。");
    expect(translate("Removing Ana…", "es")).toBe("Quitando a Ana…");
    expect(translate("Ms Lee removed you from this classroom.", "fr")).toBe("Ms Lee vous a retiré de cette classe.");
    expect(translate("Remove Ana from class", "es")).toBe("Quitar a Ana de la clase");
    expect(translate("Remove from class", "zh")).toBe("移出课堂");
    expect(translate("⇩ Download my code", "fr")).toBe("⇩ Télécharger mon code");
    expect(translate("Removed from this classroom", "es")).toBe("Te han quitado de esta clase");
  });
});
