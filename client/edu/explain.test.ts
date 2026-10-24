import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { QualityStat, RepoProfile } from "../../shared/types.ts";
import { playerKitFromProfile } from "../../sim/kits.ts";
import { qualityRows } from "../../sim/quality.ts";
import { measures, nextGrade, plainRow } from "./explain.ts";
import { GRADE_POINTS, classHighlights, gpa, sortStats } from "./quality.ts";

// Real report cards: every fallback repo through the sim's actual edu grading.
const dir = new URL("../../data/fallback/", import.meta.url);
const cards = readdirSync(dir).map((f) => {
  const p = JSON.parse(readFileSync(new URL(f, dir), "utf8")) as RepoProfile;
  return { slug: p.slug, quality: playerKitFromProfile(p, { mode: "edu" }).quality! };
});
const JARGON = /fan-out|kLOC|definitions\/file|\bLOC\b|Documentation score|dependency depth|analyzed/i;
const ORDER = ["F", "D", "C", "B", "A"];

describe("plain report-card rows (real sim grades)", () => {
  it("reads the numbers back out of every sim signal", () => {
    for (const c of cards)
      for (const q of sortStats(c.quality)) {
        const m = measures(q);
        expect(Object.keys(m).length, `${c.slug} ${q.stat}: ${q.signal}`).toBeGreaterThan(0);
        expect(plainRow(q).measure, `${c.slug} ${q.stat}`).not.toBe(q.signal);
      }
  });

  it("speaks plain words: no metric jargon in what/measure/tip/next", () => {
    for (const c of cards)
      for (const q of sortStats(c.quality)) {
        const r = plainRow(q, cards.flatMap((x) => x.quality));
        for (const s of [r.what, r.measure, r.tip ?? "", r.next ?? ""]) expect(s, `${c.slug} ${q.stat}: ${s}`).not.toMatch(JARGON);
      }
  });

  it("gives every B-or-worse row a concrete tip (size only when there's no README)", () => {
    for (const c of cards)
      for (const q of sortStats(c.quality)) {
        const r = plainRow(q);
        if (q.grade === "A") expect(r.tip).toBeNull();
        else if (q.stat !== "hp") expect(r.tip, `${c.slug} ${q.stat}`).toBeTruthy();
      }
  });

  it("next-grade targets come from the sim's real thresholds and really reach the next grade", () => {
    let checked = 0;
    for (const c of cards)
      for (const q of sortStats(c.quality)) {
        if (q.grade === "A" || q.stat === "hp") continue;
        const t = nextGrade(q);
        expect(t, `${c.slug} ${q.stat} ${q.grade}: ${q.signal}`).not.toBeNull();
        expect(ORDER.indexOf(t!.grade)).toBe(ORDER.indexOf(q.grade) + 1);
        // the target moves the number in the improving direction
        const cur = measures(q)[t!.key] as number;
        const better = ["testPct", "commentPct", "readmeChars"].includes(t!.key) ? t!.value > cur : t!.value < cur;
        expect(better, `${c.slug} ${q.stat}: ${cur} → ${t!.value}`).toBe(true);
        checked++;
      }
    expect(checked).toBeGreaterThan(10);
  });

  it("adds the class average and the tech-debt effect", () => {
    const all = cards.flatMap((c) => c.quality);
    const armor = cards[0].quality.find((q) => q.stat === "armor")!;
    expect(plainRow(armor, all).measure).toMatch(/% of your files are tests \(class median [\d.]+%\)/);
    const weak = cards.map((c) => c.quality.find((q) => q.stat === "weakness")!).find((q) => q.value > 0)!;
    expect(plainRow(weak).effect).toMatch(/^you take (\+\d+% damage|almost no extra damage)$/);
    expect(plainRow(weak).word).toBe("tech-debt penalty");
  });
});

describe("grade consistency (EDU-3)", () => {
  it("GPA uses exactly the letters shown (regen is folded into energy)", () => {
    for (const c of cards) {
      const shown = sortStats(c.quality);
      expect(shown.some((q) => q.stat === "regen")).toBe(false);
      expect(gpa(c.quality)).toBeCloseTo(shown.reduce((s, q) => s + GRADE_POINTS[q.grade], 0) / shown.length);
    }
  });

  it("grades are monotonic in the number shown (tests %, tech-debt penalty)", () => {
    const rows = (stat: QualityStat["stat"]) => cards.map((c) => c.quality.find((q) => q.stat === stat)!);
    const armor = rows("armor").filter((q) => measures(q).testDir).sort((a, b) => measures(a).testPct! - measures(b).testPct!);
    for (let i = 1; i < armor.length; i++) expect(GRADE_POINTS[armor[i].grade]).toBeGreaterThanOrEqual(GRADE_POINTS[armor[i - 1].grade]);
    const debt = rows("weakness").sort((a, b) => a.value - b.value);
    for (let i = 1; i < debt.length; i++) expect(GRADE_POINTS[debt[i].grade]).toBeLessThanOrEqual(GRADE_POINTS[debt[i - 1].grade]);
    // and across the whole test-% range at the sim's own formula
    let last = -1;
    for (let pct = 0; pct <= 60; pct += 0.5) {
      const g = GRADE_POINTS[qualityRows({ ...base, testRatio: pct / 100, hasTests: true }).find((r) => r.stat === "armor")!.grade];
      expect(g).toBeGreaterThanOrEqual(last);
      last = g;
    }
  });

  it("class highlights name the student with the best real number, not just the first A", () => {
    const students = cards.map((c, i) => ({ id: `s${i}`, name: c.slug, repo: c.slug, quality: c.quality }));
    const best = classHighlights(students).find((x) => x.stat === "armor")!;
    const top = Math.max(...students.map((s) => measures(s.quality.find((q) => q.stat === "armor")!)).filter((m) => m.testPct !== undefined).map((m) => m.testPct!));
    const bestPct = measures(best.q).testPct!;
    const sameGradeBetter = students.some((s) => {
      const q = s.quality.find((x) => x.stat === "armor")!;
      return q.grade === best.q.grade && measures(q).testPct! > bestPct;
    });
    expect(sameGradeBetter).toBe(false);
    expect(bestPct).toBeLessThanOrEqual(top);
  });
});

const base = {
  heart: "", heartFanIn: 0, files: [], components: [], cycles: [], testRatio: 0, hasTests: false, loc: 1000, readmeLength: null,
  hasReadme: false, avgFanOut: 0, maxDepth: 0, functionsPerFile: null, avgFunctionLength: null, functionLengthApproximate: false,
  longestFunction: 0, commentRatio: null, todoCount: 0, todoDensity: 0, vulns: [],
};
