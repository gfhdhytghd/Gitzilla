import { describe, expect, it } from "vitest";
import type { Debrief, LessonDebrief } from "./debrief.ts";
import { debriefMarkdown } from "./debrief-view.ts";

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

describe("debriefMarkdown (teacher export)", () => {
  it("writes headline, check rates, reteach, next and the private name lists", () => {
    const md = debriefMarkdown("round", "Step 1 · Say hello", round);
    expect(md).toContain("## Round debrief: Step 1 · Say hello");
    expect(md).toContain("**2 of 3 submitted · class average 75 · boss −83%**");
    expect(md).toContain("- Your code uses `print()`: 1/2 (50%)");
    expect(md).toContain("### What to reteach");
    expect(md).toContain("- chloe: No submission in this round.");
    expect(md).toContain("### Shout-outs");
  });

  it("adds one line per lesson step and passes every sentence through the translator", () => {
    const lesson: LessonDebrief = { ...round, steps: [{ stepId: "s1", title: "Say hello", attempt: 1, attempts: 2, avg: 75, median: 75, submitted: 2, roster: 3, weakestCheck: { text: "Your code uses `print()`", passed: 1, total: 2 } }] };
    const seen: string[] = [];
    const md = debriefMarkdown("lesson", "Python Basics", lesson, (s) => { seen.push(s); return s; });
    expect(md).toContain("- Say hello: average 75 · 2/3 submitted · Hardest: Your code uses `print()` 1/2");
    expect(seen).toEqual(expect.arrayContaining([round.headline, round.next, round.reteach[0], round.needHelp[0].why, "Lesson debrief"]));
  });

  it("leaves out empty sections", () => {
    const md = debriefMarkdown("round", "Step 1", { ...round, checks: [], reteach: [], needHelp: [], shoutouts: [] });
    expect(md).not.toContain("What the class got");
    expect(md).not.toContain("Need help");
  });
});
