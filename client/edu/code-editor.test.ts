import { describe, expect, it } from "vitest";
import { pythonClassroomPlan } from "../../shared/classroom-presets.ts";
import { highlight, newlineEdit, seeded, tabEdit, tokenizeLine } from "./code-editor.ts";

const kinds = (line: string, inStr: string | null = null) => tokenizeLine(line, inStr).toks.filter((t) => t.t !== "txt").map((t) => `${t.t}:${t.s}`);

describe("python tokenizer", () => {
  it("colours keywords, builtins, strings, comments, numbers, def names, decorators", () => {
    expect(kinds('def greet(name):  # say hi')).toEqual(["kw:def", "def:greet", "op::", "com:# say hi"]);
    expect(kinds('print(f"hi {name}", 3.5, 0x1F)')).toEqual(["builtin:print", 'str:f"hi {name}"', "num:3.5", "num:0x1F"]);
    expect(kinds("@property")).toEqual(["deco:@property"]);
    expect(kinds("x = 'it\\'s'")).toEqual(["op:=", "str:'it\\'s'"]);
    expect(kinds("class Bag(object): pass")).toEqual(["kw:class", "def:Bag", "op::", "kw:pass"]);
    expect(kinds("items2 = len(x)")).toEqual(["op:=", "builtin:len"]); // digits inside names aren't numbers
  });

  it("keeps triple-quoted strings open across lines", () => {
    const a = tokenizeLine('s = """first', null);
    expect(a.inStr).toBe('"""');
    const b = tokenizeLine("still inside", a.inStr);
    expect(b.toks).toEqual([{ t: "str", s: "still inside" }]);
    const c = tokenizeLine('end""" + x', b.inStr);
    expect(c.inStr).toBeNull();
    expect(c.toks[0]).toEqual({ t: "str", s: 'end"""' });
  });

  it("escapes HTML and keeps the line count", () => {
    const src = "if a < b and c > d:\n    print('<b>')\n";
    const out = highlight(src, "python");
    expect(out).not.toContain("<b>");
    expect(out).toContain("&lt;b&gt;");
    expect(out.split("\n")).toHaveLength(src.split("\n").length);
    expect(highlight("<x>", undefined)).toBe("&lt;x&gt;");
  });

  it("handles CJK comments and identifiers (Chinese presets)", () => {
    expect(kinds("名字 = 'Ada'  # 在下面完成")).toEqual(["op:=", "str:'Ada'", "com:# 在下面完成"]);
  });
});

describe("editing helpers", () => {
  it("Enter keeps the indent and adds 4 after ':' (comments ignored)", () => {
    const t = "for i in range(3):  # loop";
    const e = newlineEdit(t, t.length, t.length);
    expect(e.text).toBe(t + "\n    ");
    expect(e.start).toBe(e.text.length);
    const t2 = "    x = 1";
    expect(newlineEdit(t2, t2.length, t2.length).text).toBe(t2 + "\n    ");
    const t3 = "if a:\n    b = 2";
    expect(newlineEdit(t3, 2, 2).text).toBe("if\n a:\n    b = 2"); // mid-line: keep indent of that line (none)
  });

  it("Tab inserts up to the next 4-column stop; Shift+Tab / selections (de)indent lines", () => {
    expect(tabEdit("ab", 2, 2, false)).toEqual({ text: "ab  ", start: 4, end: 4 });
    expect(tabEdit("x", 0, 0, false).text).toBe("    x");
    const src = "a\nb\nc";
    const ind = tabEdit(src, 0, src.length, false);
    expect(ind.text).toBe("    a\n    b\n    c");
    expect(ind.end).toBe(ind.text.length);
    const de = tabEdit(ind.text, 0, ind.text.length, true);
    expect(de.text).toBe(src);
    expect(tabEdit("  x", 3, 3, true).text).toBe("x"); // dedent removes up to 4 leading spaces
  });
});

describe("carry the student's code into the next step", () => {
  const plan = pythonClassroomPlan("01-hello", "en");
  const [s1, s2] = plan.steps;
  it("presets ship starter files on the same main path across a lesson's steps", () => {
    expect(s1.starter?.length).toBeGreaterThan(0);
    const main = s1.starter!.find((f) => f.path.endsWith(".py"))!;
    expect(main.path).toMatch(/^python\//);
    expect(s2.starter!.some((f) => f.path === main.path)).toBe(true);
  });

  it("takes the previous step's code for matching paths, but never the README", () => {
    const main = s1.starter!.find((f) => f.path.endsWith(".py"))!;
    const draft = [{ path: main.path, content: "print('my answer')\n" }, { path: "README.md", content: "old notes" }];
    const out = seeded(s2.starter!, draft)!;
    expect(out.find((f) => f.path === main.path)!.content).toBe("print('my answer')\n");
    const readme = out.find((f) => /readme/i.test(f.path));
    if (readme) expect(readme.content).toBe(s2.starter!.find((f) => f.path === readme.path)!.content);
    expect(seeded(s2.starter!, null)).toBeNull();
    expect(seeded(s2.starter!, [{ path: "other.py", content: "x" }])).toBeNull();
  });
});
