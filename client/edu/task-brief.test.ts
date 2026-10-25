import { describe, expect, it } from "vitest";
import type { ClassroomCheck } from "../../shared/classroom.ts";
import { alignDoneWhen, codeSpans, doneWhenStatus, hintKey, todoKey } from "./task-brief.ts";

describe("codeSpans", () => {
  it("splits `code` out of a TODO line", () => {
    expect(codeSpans("Print `name` with `print()`.")).toEqual([
      { text: "Print ", code: false }, { text: "name", code: true }, { text: " with ", code: false }, { text: "print()", code: true }, { text: ".", code: false },
    ]);
  });
  it("keeps an unmatched backtick and CJK text as plain text", () => {
    expect(codeSpans("用 `print()` 输出 ` 号")).toEqual([{ text: "用 ", code: false }, { text: "print()", code: true }, { text: " 输出 ` 号", code: false }]);
    expect(codeSpans("")).toEqual([]);
  });
});

describe("doneWhenStatus (doneWhen[i] ↔ checks[i] ↔ report.checks[i])", () => {
  const checks: ClassroomCheck[] = [
    { id: "check-0", kind: "file", path: "python/01_hello.py", label: "File exists: python/01_hello.py" },
    { id: "check-1", kind: "contains", path: "python/01_hello.py", text: "Hello, Python!", label: "Literal code evidence: python/01_hello.py" },
  ];
  const brief = { doneWhen: ["`python/01_hello.py` exists", "It prints `Hello, Python!`", "You can explain each line to a friend"] };
  it("is all 'self' before a submission", () => {
    expect(doneWhenStatus(brief, checks, null)).toEqual(["self", "self", "self"]);
  });
  it("pairs by position after a submission; lines without a check stay 'self'", () => {
    const report = { checks: [{ label: checks[0].label, passed: true, detail: "" }, { label: checks[1].label, passed: false, detail: "" }] };
    expect(doneWhenStatus(brief, checks, report)).toEqual(["pass", "fail", "self"]);
  });
  it("ignores report checks beyond the step's checks", () => {
    expect(doneWhenStatus({ doneWhen: ["a"] }, [], { checks: [{ label: "x", passed: true, detail: "" }] })).toEqual(["self"]);
  });
});

it("saves ticks and hints per room + step", () => {
  expect(todoKey("ABCD", "01-hello-1")).toBe("kaiju.todo.ABCD.01-hello-1");
  expect(hintKey("ABCD", "01-hello-1")).toBe("kaiju.hints.ABCD.01-hello-1");
});

describe("alignDoneWhen (teacher edits the checks)", () => {
  const checks: ClassroomCheck[] = [
    { id: "check-0", kind: "file", path: "python/09_dict.py", label: "File exists: python/09_dict.py" },
    { id: "check-1", kind: "contains", path: "python/09_dict.py", text: "inventory", label: "x" },
  ];
  const original = { checks, doneWhen: ["Your file is there", "You made an `inventory` dict"] };
  it("keeps written lines for checks that stayed, generates lines for new ones, one row per check in order", () => {
    const edited: ClassroomCheck[] = [
      { id: "check-0", kind: "file", path: "README.md", label: "File exists: README.md" },
      { ...checks[1], id: "check-1" },
      { id: "check-2", kind: "ci", path: "unit-tests", label: "GitHub check: unit-tests" },
    ];
    expect(alignDoneWhen(original, edited)).toEqual(["`README.md` is in your submission", "You made an `inventory` dict", "The GitHub check `unit-tests` passes"]);
    expect(alignDoneWhen(original, [])).toEqual([]);
    expect(alignDoneWhen(original, checks)).toEqual(original.doneWhen);
  });
});
