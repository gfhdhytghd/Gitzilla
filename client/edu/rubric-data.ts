// Rubric helpers (pure, no DOM): what each signal means in plain words, weight math, a pre-fight estimate of a
// student's rubric score from their real report card, class summaries and CSV/Markdown export of feedback.
// Parsing/scoring for real lives server-side in rubric/ (codex-rubric); this file never invents a score: criteria the
// report card can't speak to are marked "measured after the fight" (score null).
import type { CriterionResult, QualityStat, Rubric, RubricCriterion, RubricSignal, StudentFeedback } from "../../shared/types.ts";
import { plainRow } from "./explain.ts";
import { GRADE_POINTS } from "./quality.ts";

export interface SignalInfo {
  label: string;           // plain name in the dropdown
  what: string;            // one line for students
  unit: "%" | "lines" | "count" | null;   // natural unit of `target` (display)
  /** Report-card row that already measures it (pre-fight estimate), if any. */
  stat?: QualityStat["stat"];
}

export const SIGNALS: Record<RubricSignal, SignalInfo> = {
  tests: { label: "Tests", what: "how much of the code is checked by tests", unit: "%", stat: "armor" },
  modularity: { label: "Modularity", what: "how independent the parts of the code are", unit: null, stat: "speed" },
  cohesion: { label: "Focused code", what: "functions and files that each do one job", unit: null, stat: "damage" },
  "function-length": { label: "Function length", what: "how long the longest functions are", unit: "lines", stat: "damage" },
  documentation: { label: "Documentation", what: "comments and README that explain the code", unit: "%", stat: "energy" },
  readme: { label: "README", what: "a README that says what it does and how to run it", unit: "count", stat: "energy" },
  size: { label: "Project size", what: "how much working code there is", unit: "lines", stat: "hp" },
  cycles: { label: "No import loops", what: "parts of the code that don't import each other in circles", unit: "count", stat: "weakness" },
  "tech-debt": { label: "Tech debt", what: "few leftover TODO/FIXME/HACK notes", unit: "count", stat: "weakness" },
  ci: { label: "Automated checks (CI)", what: "tests run automatically on every push", unit: null },
  license: { label: "License", what: "a LICENSE file so others know how they may use it", unit: null },
  typing: { label: "Types", what: "type hints / TypeScript that catch mistakes early", unit: "%" },
  commits: { label: "Commit history", what: "steady, well-described commits", unit: "count" },
  check: { label: "Custom rule", what: "a yes/no rule from the teacher", unit: null },
};

export const SIGNAL_ORDER = Object.keys(SIGNALS) as RubricSignal[];

/** Weights as whole percentages that sum to 100 (largest remainder), zero weights stay 0. */
export function weightPercents(criteria: Pick<RubricCriterion, "weight">[]): number[] {
  const total = criteria.reduce((s, c) => s + Math.max(0, c.weight), 0);
  if (!total) return criteria.map(() => (criteria.length ? Math.round(100 / criteria.length) : 0));
  const raw = criteria.map((c) => (Math.max(0, c.weight) / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((s, v) => s + v, 0);
  [...raw.keys()].sort((a, b) => (raw[b] % 1) - (raw[a] % 1)).forEach((i) => {
    if (left > 0 && raw[i] > 0) {
      out[i]++;
      left--;
    }
  });
  return out;
}

/** Target in its natural unit, for display ("20% of files", "≤ 300 lines"). */
export function targetText(c: RubricCriterion): string | null {
  if (c.check) {
    const v = c.check.value;
    switch (c.check.kind) {
      case "path-exists": return `must have \`${v}\``;
      case "path-absent": return `must not contain \`${v}\``;
      case "max-file-loc": return `no file over ${v} lines`;
      case "min-commits": return `at least ${v} commits`;
      case "language": return `written in ${v}`;
    }
  }
  if (c.target === undefined) return null;
  const u = SIGNALS[c.signal].unit;
  if (u === "%") return `target ${Math.round((c.target <= 1 ? c.target * 100 : c.target) * 10) / 10}%`;
  if (u === "lines") return c.signal === "size" ? `target ${c.target.toLocaleString("en-US")}+ lines` : `target ≤ ${c.target.toLocaleString("en-US")} lines`;
  if (u === "count") return c.signal === "cycles" || c.signal === "tech-debt" ? `target ≤ ${c.target}` : `target ${c.target}+`;
  return `target ${c.target}`;
}

export interface Estimate { criterionId: string; score: number | null; evidence: string }

/** Pre-fight estimate per criterion from the student's report card (real grades only). */
export function estimateFromQuality(rubric: Rubric, quality: QualityStat[] | undefined): Estimate[] {
  return rubric.criteria.map((c) => {
    const stat = SIGNALS[c.signal].stat;
    const q = stat && !c.check ? quality?.find((x) => x.stat === stat) : undefined;
    if (!q) return { criterionId: c.id, score: null, evidence: quality?.length ? "measured after the fight" : "waiting for your repo" };
    return { criterionId: c.id, score: GRADE_POINTS[q.grade] / 4, evidence: `${plainRow(q).measure} (report card ${q.grade})` };
  });
}

/** Weighted 0..100 over the criteria that have a score (null scores are left out and the rest renormalized). */
export function weightedScore(rubric: Rubric, results: { criterionId: string; score: number | null }[]): number | null {
  let w = 0, s = 0;
  for (const c of rubric.criteria) {
    const r = results.find((x) => x.criterionId === c.id);
    if (!r || r.score === null || c.weight <= 0) continue;
    w += c.weight;
    s += c.weight * Math.max(0, Math.min(1, r.score));
  }
  return w ? Math.round((s / w) * 100) : null;
}

export function scoreColor(score: number): string {
  return score >= 85 ? "#39ff88" : score >= 70 ? "#3de8ff" : score >= 55 ? "#ffd23d" : score >= 40 ? "#ffb000" : "#ff3355";
}

export function githubFileUrl(repo: string, file: string): string | null {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !file || /^https?:/.test(file)) return /^https:\/\/github\.com\//.test(file) ? file : null;
  return `https://github.com/${repo}/blob/HEAD/${file.replace(/^\.?\//, "").split("/").map(encodeURIComponent).join("/")}`;
}

/** Built-in default (used for the preview until the server's defaultRubric arrives); mirrors the report card. */
export function localDefaultRubric(): Rubric {
  const c = (id: string, name: string, signal: RubricSignal, weight: number, description: string): RubricCriterion => ({ id, name, signal, weight, description });
  return {
    title: "Default: code quality",
    source: "default",
    criteria: [
      c("tests", "Tests", "tests", 25, "The project has automated tests for its important parts."),
      c("modularity", "Modular design", "modularity", 20, "Parts of the code have clear jobs and don't depend on everything else."),
      c("functions", "Focused functions", "cohesion", 20, "Functions are short and do one thing."),
      c("docs", "Documentation", "documentation", 20, "A README explains the project; tricky code has comments."),
      c("debt", "No import loops or stale TODOs", "tech-debt", 15, "No circular imports; TODO/FIXME notes get resolved."),
    ],
  };
}

// ---------- class view ----------

export interface ClassSummary {
  students: number;
  average: number;
  median: number;
  perCriterion: { id: string; name: string; average: number }[];
  /** improvement most students share (by criterion), for a "next class" lesson */
  commonGap: { id: string; name: string; count: number } | null;
}

export function classSummary(items: StudentFeedback[], rubric: Rubric): ClassSummary {
  const scores = items.map((f) => f.rubricScore).sort((a, b) => a - b);
  const mid = scores.length >> 1;
  const perCriterion = rubric.criteria.map((c) => {
    const vs = items.map((f) => f.results.find((r) => r.criterionId === c.id)?.score).filter((v): v is number => typeof v === "number");
    return { id: c.id, name: c.name, average: vs.length ? Math.round((vs.reduce((s, v) => s + v, 0) / vs.length) * 100) : 0 };
  });
  const gaps = rubric.criteria
    .map((c) => ({ id: c.id, name: c.name, count: items.filter((f) => (f.results.find((r) => r.criterionId === c.id)?.score ?? 1) < 0.6).length }))
    .sort((a, b) => b.count - a.count);
  return {
    students: items.length,
    average: items.length ? Math.round(items.reduce((s, f) => s + f.rubricScore, 0) / items.length) : 0,
    median: scores.length ? (scores.length % 2 ? scores[mid] : Math.round((scores[mid - 1] + scores[mid]) / 2)) : 0,
    perCriterion,
    commonGap: gaps[0]?.count ? gaps[0] : null,
  };
}

export type SortKey = "name" | "score" | "rank" | `c:${string}`;

export function sortFeedback(items: StudentFeedback[], key: SortKey, desc: boolean): StudentFeedback[] {
  const val = (f: StudentFeedback): number | string =>
    key === "name" ? f.name.toLowerCase() : key === "score" ? f.rubricScore : key === "rank" ? f.match.rank : (f.results.find((r) => r.criterionId === key.slice(2))?.score ?? -1);
  return [...items].sort((a, b) => {
    const x = val(a), y = val(b);
    const c = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
    return desc ? -c : c;
  });
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function feedbackCsv(items: StudentFeedback[], rubric: Rubric): string {
  const head = ["student", "repo", "rubric score", ...rubric.criteria.map((c) => `${c.name} (0-100)`), "rank", "KOs", "rounds won", "damage", "strengths", "next steps", "summary"];
  const rows = items.map((f) => [
    f.name, f.repo, f.rubricScore,
    ...rubric.criteria.map((c) => {
      const r = f.results.find((x) => x.criterionId === c.id);
      return r ? Math.round(r.score * 100) : "";
    }),
    f.match.rank, f.match.kos, f.match.roundWins, Math.round(f.match.damage),
    f.strengths.join(" | "), f.improvements.map((i) => i.text).join(" | "), f.summary,
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export function feedbackMarkdown(items: StudentFeedback[], rubric: Rubric, title = "Class feedback"): string {
  const s = classSummary(items, rubric);
  const out = [`# ${title}`, "", `Rubric: **${rubric.title}** · ${s.students} students · average ${s.average}/100 (median ${s.median})`, ""];
  out.push("| Criterion | Weight | Class average |", "| --- | ---: | ---: |");
  const pct = weightPercents(rubric.criteria);
  rubric.criteria.forEach((c, i) => out.push(`| ${c.name} | ${pct[i]}% | ${s.perCriterion[i].average} |`));
  if (s.commonGap) out.push("", `Most common gap: **${s.commonGap.name}** (${s.commonGap.count} of ${s.students} students below 60).`);
  for (const f of sortFeedback(items, "name", false)) {
    out.push("", `## @${f.name} — ${f.repo} — ${f.rubricScore}/100`, "", f.summary, "");
    for (const c of rubric.criteria) {
      const r = f.results.find((x) => x.criterionId === c.id);
      if (r) out.push(`- **${c.name}**: ${Math.round(r.score * 100)}/100. ${r.evidence}${r.tip ? ` _Tip: ${r.tip}_` : ""}`);
    }
    if (f.strengths.length) out.push("", "Strengths:", ...f.strengths.map((x) => `- ${x}`));
    if (f.improvements.length) out.push("", "Next steps:", ...f.improvements.map((x) => `- ${x.text}${x.file ? ` (\`${x.file}\`)` : ""}`));
    out.push("", `Match: rank ${f.match.rank}, ${f.match.kos} KOs, ${f.match.roundWins} rounds won${f.match.quiz ? `, quiz ${f.match.quiz}` : ""}.`);
  }
  return out.join("\n") + "\n";
}

/** Results with tips shown first where the student lost the most weighted points. */
export function biggestGains(f: StudentFeedback, rubric: Rubric): { c: RubricCriterion; r: CriterionResult; lost: number }[] {
  const pct = weightPercents(rubric.criteria);
  return rubric.criteria
    .map((c, i) => ({ c, r: f.results.find((x) => x.criterionId === c.id)!, w: pct[i] }))
    .filter((x) => x.r)
    .map((x) => ({ c: x.c, r: x.r, lost: Math.round((1 - x.r.score) * x.w) }))
    .sort((a, b) => b.lost - a.lost);
}
