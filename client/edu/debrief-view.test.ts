import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Debrief, LessonDebrief } from "./debrief.ts";
import { createDebriefCard, debriefMarkdown } from "./debrief-view.ts";
import { installTestDom, TestNode } from "./test-dom.ts";

const round: Debrief = {
  headline: "2 of 3 submitted · class average 75 · boss −83%",
  participation: { roster: 3, submitted: 2, missing: ["chloe"] },
  scores: { avg: 75, median: 75, bands: [{ label: "Below 50", count: 0 }, { label: "50 to under 80", count: 1 }, { label: "80–100", count: 1 }] },
  checks: [{ text: "Your code uses `print()`", passed: 1, total: 2 }],
  reteach: ["1/2: Your code uses `print()`. Work through one example together."],
  needHelp: [{ id: "c", name: "chloe", why: "No submission in this round. Help them send one small change." }],
  shoutouts: [{ id: "a", name: "ana", why: "Met every recorded check on the first round." }],
  next: "Work through one example together, then retry this step.",
};
const grades: LessonDebrief["grades"] = {
  steps: [{ stepId: "s1", title: "Say hello", recorded: true }, { stepId: "s2", title: "Add a name", recorded: false }],
  students: [{ id: "a", name: "ana", steps: [90, null], total: 90, max: 200, average: 45 }, { id: "c", name: "chloe", steps: [null, null], total: 0, max: 200, average: 0 }],
};
const step = (title = "Say hello"): LessonDebrief["steps"][number] => ({ stepId: "s1", title, attempt: 1, attempts: 2, avg: 75, median: 75, submitted: 2, roster: 3, weakestCheck: { text: "Your code uses `print()`", passed: 1, total: 2 } });

describe("debriefMarkdown (teacher export)", () => {
  it("writes headline, check rates, reteach, next and the private name lists", () => {
    const md = debriefMarkdown("round", "Step 1 · Say hello", round);
    expect(md).toContain("## Round debrief: Step 1 · Say hello");
    expect(md).toContain("**2 of 3 submitted · class average 75 · boss −83%**");
    expect(md).toContain("- Your code uses \\`print()\\`: 1/2 (50%)");
    expect(md).toContain("### What to reteach");
    expect(md).toContain("- chloe: No submission in this round.");
    expect(md).toContain("### Shout-outs");
  });

  it("adds one line per lesson step and passes every sentence through the translator", () => {
    const lesson: LessonDebrief = { ...round, steps: [step()], grades };
    const seen: string[] = [];
    const md = debriefMarkdown("lesson", "Python Basics", lesson, (s) => { seen.push(s); return s; });
    expect(md).toContain("- Say hello: average 75 · 2/3 submitted · Hardest: Your code uses \\`print()\\` 1/2");
    expect(seen).toEqual(expect.arrayContaining([round.headline, round.next, round.reteach[0], round.needHelp[0].why, "Lesson debrief"]));
  });

  it("writes the grade book as a table after the steps, with — for missing scores and the unrecorded note", () => {
    const md = debriefMarkdown("lesson", "Python Basics", { ...round, steps: [step()], grades });
    expect(md.indexOf("### Grades")).toBeGreaterThan(md.indexOf("### Steps"));
    expect(md.indexOf("### Grades")).toBeLessThan(md.indexOf("### What the class got"));
    expect(md).toContain("| Student | Say hello | Add a name (not recorded) | Total | Average |\n| --- | --- | --- | --- | --- |");
    expect(md).toContain("| ana | 90 | — | 90/200 | 45 |");
    expect(md).toContain("| chloe | — | — | 0/200 | 0 |");
    expect(md).toContain("Unrecorded steps count 0.");
    const recorded = debriefMarkdown("lesson", "Python Basics", { ...round, steps: [step()], grades: { ...grades, steps: grades.steps.map((s) => ({ ...s, recorded: true })) } });
    expect(recorded).not.toContain("Unrecorded steps count 0.");
    expect(debriefMarkdown("lesson", "Python Basics", { ...round, steps: [step()], grades: { steps: [], students: [] } })).not.toContain("### Grades");
  });

  it("leaves out empty sections", () => {
    const md = debriefMarkdown("round", "Step 1", { ...round, checks: [], reteach: [], needHelp: [], shoutouts: [] });
    expect(md).not.toContain("What the class got");
    expect(md).not.toContain("Need help");
  });

  it("escapes every authored field after translation and collapses newlines", () => {
    const injected = "<img src=//evil.test/x> | # * _ { } [ ] ` \\\r\nnext";
    const escaped = "\\<img src=//evil.test/x\\> \\| \\# \\* \\_ \\{ \\} \\[ \\] \\` \\\\ next";
    const lesson: LessonDebrief = {
      ...round, headline: injected, checks: [{ text: injected, passed: 0, total: 1 }], reteach: [injected], next: injected,
      needHelp: [{ id: "a", name: injected, why: injected }], shoutouts: [{ id: "b", name: injected, why: injected }],
      steps: [{ stepId: "s1", title: injected, attempt: 1, attempts: 1, avg: 0, median: 0, submitted: 1, roster: 1, weakestCheck: { text: injected, passed: 0, total: 1 } }],
      grades: { steps: [{ stepId: "s1", title: injected, recorded: true }], students: [{ id: "a", name: injected, steps: [0], total: 0, max: 100, average: 0 }] },
    };
    const md = debriefMarkdown("lesson", injected, lesson, s => s === injected ? `${s} *translated*` : s);
    expect(md).not.toContain(injected);
    expect(md).not.toMatch(/(?<!\\)<img/);
    expect(md).not.toContain("\r");
    expect(md).toContain(`## Lesson debrief: ${escaped}\n`);
    expect(md).toContain(`**${escaped} \\*translated\\***`);
    expect(md).toContain(`- ${escaped}: average 0 · 1/1 submitted · Hardest: ${escaped} 0/1`);
    expect(md).toContain(`- ${escaped}: 0/1 (0%)`);
    expect(md).toContain(`### What to reteach\n\n- ${escaped} \\*translated\\*`);
    expect(md).toContain(`### Next\n\n- ${escaped} \\*translated\\*`);
    for (const label of ["Need help", "Shout-outs"]) expect(md).toContain(`### ${label}\n\n- ${escaped}: ${escaped} \\*translated\\*`);
    expect(md).toContain(`| Student | ${escaped} | Total | Average |`);
    expect(md).toContain(`| ${escaped} | 0 | 0/100 | 0 |`);
  });
});

describe("debrief card grades", () => {
  beforeEach(() => { installTestDom(); });
  afterEach(() => { vi.unstubAllGlobals(); });
  const lesson: LessonDebrief = { ...round, steps: [step()], grades };
  const show = (mode: "teacher" | "projector", namesVisible: boolean) => {
    const card = createDebriefCard();
    card.update({ kind: "lesson", debrief: lesson, mode, title: "Python Basics", namesVisible });
    return card.el as unknown as TestNode;
  };

  it("shows the teacher a grade table with one row per student, — for missing scores and the unrecorded marker", () => {
    const el = show("teacher", true), table = el.querySelector('[data-testid="classroom-grades"]')!;
    expect(table).not.toBeNull();
    expect(table.querySelectorAll("th").map((th) => th.textContent)).toEqual(["Student", "Say hello", "Add a namenot recorded", "Total", "Average", "ana", "chloe"]);
    expect(el.querySelector('[data-testid="classroom-grade-a"]')!.querySelectorAll("td").map((td) => td.textContent)).toEqual(["90", "—", "90/200", "45"]);
    expect(el.querySelector('[data-testid="classroom-grade-c"]')!.querySelectorAll("td").map((td) => td.textContent)).toEqual(["—", "—", "0/200", "0"]);
    expect(table.textContent).toContain("Unrecorded steps count 0.");
  });

  it("renders nothing of the grade book while projecting or while names are hidden", () => {
    for (const el of [show("projector", true), show("projector", false), show("teacher", false)]) {
      expect(el.querySelector('[data-testid="classroom-grades"]')).toBeNull();
      expect(el.textContent).not.toMatch(/Grades|ana|chloe|90\/200/);
    }
  });
});
