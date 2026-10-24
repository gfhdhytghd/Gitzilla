import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RepoProfile, Rubric, StudentFeedback } from "../../shared/types.ts";
import { playerKitFromProfile } from "../../sim/kits.ts";
import {
  biggestGains, classSummary, estimateFromQuality, feedbackCsv, feedbackMarkdown, githubFileUrl, localDefaultRubric, sortFeedback,
  targetText, weightPercents, weightedScore,
} from "./rubric-data.ts";
import { guessSignal } from "./rubric.ts";

const quality = (slug: string) =>
  playerKitFromProfile(JSON.parse(readFileSync(new URL(`../../data/fallback/${slug.replace("/", "__")}.json`, import.meta.url), "utf8")) as RepoProfile, { mode: "edu" }).quality!;

const rubric: Rubric = {
  title: "CS 101 final project",
  source: "doc",
  criteria: [
    { id: "t", name: "Unit tests", weight: 30, signal: "tests", description: "Has unit tests", target: 0.2 },
    { id: "d", name: "Documentation", weight: 20, signal: "documentation", description: "README + comments" },
    { id: "f", name: "Short files", weight: 10, signal: "check", description: "No file over 300 lines", check: { kind: "max-file-loc", value: 300 } },
    { id: "l", name: "License", weight: 0, signal: "license", description: "" },
  ],
};

const fb = (name: string, score: number, t: number, d: number, f: number, rank: number): StudentFeedback => ({
  playerId: name, name, repo: `${name}/proj`, rubricScore: score,
  results: [{ criterionId: "t", score: t, evidence: `tests ${t}` , tip: "add tests" }, { criterionId: "d", score: d, evidence: "docs" }, { criterionId: "f", score: f, evidence: "files" }],
  strengths: ["good, \"quoted\" README"], improvements: [{ text: "add tests", file: "src/app.py" }],
  match: { rank, kos: 3, damage: 812.4, roundWins: 1, quiz: "1/2" }, summary: "Nice work.",
});
const items = [fb("ana", 82, 0.9, 0.8, 1, 2), fb("ben", 41, 0.1, 0.5, 1, 1), fb("cy", 64, 0.5, 0.9, 0, 3)];

describe("rubric data", () => {
  it("normalizes weights to whole percents summing to 100", () => {
    expect(weightPercents(rubric.criteria)).toEqual([50, 33, 17, 0]);
    expect(weightPercents([{ weight: 1 }, { weight: 1 }, { weight: 1 }]).reduce((s, v) => s + v, 0)).toBe(100);
    expect(weightPercents([{ weight: 0 }, { weight: 0 }])).toEqual([50, 50]);
  });

  it("describes targets and checks in plain units", () => {
    expect(targetText(rubric.criteria[0])).toBe("target 20%");
    expect(targetText(rubric.criteria[2])).toBe("no file over 300 lines");
    expect(targetText(rubric.criteria[1])).toBeNull();
  });

  it("estimates pre-fight scores only from real report-card grades (never invents the rest)", () => {
    const est = estimateFromQuality(rubric, quality("rust-lang/rustlings"));
    expect(est.find((e) => e.criterionId === "t")!.score).toBe(0); // armor F
    expect(est.find((e) => e.criterionId === "t")!.evidence).toMatch(/% of your files are tests \(report card F\)/);
    expect(est.find((e) => e.criterionId === "f")!.score).toBeNull(); // custom check: server measures it
    expect(est.find((e) => e.criterionId === "l")!.score).toBeNull();
    expect(estimateFromQuality(rubric, undefined).every((e) => e.score === null && e.evidence === "waiting for your repo")).toBe(true);
    // weighted over measurable criteria only: tests F (0) ×30 + docs C (0.5) ×20 → 20
    expect(weightedScore(rubric, est)).toBe(20);
    expect(weightedScore(rubric, [])).toBeNull();
  });

  it("summarizes the class and finds the most common gap", () => {
    const s = classSummary(items, rubric);
    expect(s).toMatchObject({ students: 3, average: 62, median: 64 });
    expect(s.perCriterion.map((c) => c.average)).toEqual([50, 73, 67, 0]);
    expect(s.commonGap).toEqual({ id: "t", name: "Unit tests", count: 2 });
  });

  it("sorts by score, name, criterion and rank", () => {
    expect(sortFeedback(items, "score", true).map((f) => f.name)).toEqual(["ana", "cy", "ben"]);
    expect(sortFeedback(items, "name", false).map((f) => f.name)).toEqual(["ana", "ben", "cy"]);
    expect(sortFeedback(items, "c:d", true).map((f) => f.name)).toEqual(["cy", "ana", "ben"]);
    expect(sortFeedback(items, "rank", false).map((f) => f.name)).toEqual(["ben", "ana", "cy"]);
  });

  it("exports CSV (escaped) and Markdown", () => {
    const csv = feedbackCsv(items, rubric).trim().split("\n");
    expect(csv).toHaveLength(4);
    expect(csv[0]).toBe("student,repo,rubric score,Unit tests (0-100),Documentation (0-100),Short files (0-100),License (0-100),rank,KOs,rounds won,damage,strengths,next steps,summary");
    expect(csv[1]).toContain('"good, ""quoted"" README"');
    expect(csv[1]).toContain(",90,80,100,,2,3,1,812,");
    const md = feedbackMarkdown(items, rubric, "Period 3");
    expect(md).toContain("# Period 3");
    expect(md).toContain("| Unit tests | 50% | 50 |");
    expect(md).toContain("## @ben — ben/proj — 41/100");
    expect(md).toContain("- add tests (`src/app.py`)");
  });

  it("ranks the biggest weighted gains first", () => {
    expect(biggestGains(items[1], rubric)[0]).toMatchObject({ lost: 45 });
    expect(biggestGains(items[1], rubric)[0].c.id).toBe("t");
  });

  it("links files on GitHub safely", () => {
    expect(githubFileUrl("pallets/flask", "src/flask/app.py")).toBe("https://github.com/pallets/flask/blob/HEAD/src/flask/app.py");
    expect(githubFileUrl("pallets/flask", "./a b.py")).toBe("https://github.com/pallets/flask/blob/HEAD/a%20b.py");
    expect(githubFileUrl("not a repo", "x.py")).toBeNull();
    expect(githubFileUrl("x/y", "javascript:alert(1)")).toBe("https://github.com/x/y/blob/HEAD/javascript%3Aalert(1)");
  });

  it("guesses a signal for unparsed lines and has a sane default rubric", () => {
    expect(guessSignal("Must include unit tests with pytest")).toBe("tests");
    expect(guessSignal("README explains setup")).toBe("readme");
    expect(guessSignal("Uses GitHub Actions")).toBe("ci");
    expect(guessSignal("Be creative")).toBe("check");
    const d = localDefaultRubric();
    expect(d.source).toBe("default");
    expect(weightPercents(d.criteria).reduce((s, v) => s + v, 0)).toBe(100);
  });
});
