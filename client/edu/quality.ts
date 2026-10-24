// Report-card math for edu PvP: grades → points, GPA, the one tip that would help most, class-wide highlights.
// Pure (no DOM). The QualityStat values themselves come from codex-sim (PlayerKit.quality / Autopsy.ranking).
import type { QualityStat } from "../../shared/types.ts";

export type Grade = QualityStat["grade"];
export const GRADE_POINTS: Record<Grade, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
export const GRADE_COLOR: Record<Grade, string> = { A: "#39ff88", B: "#3de8ff", C: "#ffd23d", D: "#ffb000", F: "#ff3355" };
/** Display order on a report card. */
export const STAT_ORDER: QualityStat["stat"][] = ["armor", "speed", "damage", "energy", "regen", "hp", "weakness"];

export function sortStats(q: QualityStat[]): QualityStat[] {
  return [...q].sort((a, b) => STAT_ORDER.indexOf(a.stat) - STAT_ORDER.indexOf(b.stat));
}

/** Grade point average 0..4 (weakness counts like any other subject: an A there means "no debt"). */
export function gpa(q: QualityStat[] | undefined): number {
  if (!q?.length) return 0;
  return q.reduce((s, x) => s + GRADE_POINTS[x.grade], 0) / q.length;
}

export function gpaGrade(v: number): Grade {
  return v >= 3.5 ? "A" : v >= 2.5 ? "B" : v >= 1.5 ? "C" : v >= 0.5 ? "D" : "F";
}

/** The stat with the worst grade (ties: report-card order). That's the tip to show first. Project size (hp) isn't
 *  something to "improve", so it's only picked when it's the only stat. */
export function weakest(q: QualityStat[] | undefined): QualityStat | null {
  if (!q?.length) return null;
  const actionable = q.filter((x) => x.stat !== "hp");
  return sortStats(actionable.length ? actionable : q).reduce((w, x) => (GRADE_POINTS[x.grade] < GRADE_POINTS[w.grade] ? x : w));
}

export function strongest(q: QualityStat[] | undefined): QualityStat | null {
  if (!q?.length) return null;
  return sortStats(q).reduce((w, x) => (GRADE_POINTS[x.grade] > GRADE_POINTS[w.grade] ? x : w));
}

export interface Student { id: string; name: string; repo: string; quality?: QualityStat[] }

/** "Best tests in class: @ana (A — tests: 31% of files)". One line per stat where someone stands out. */
export function classHighlights(students: Student[]): { stat: QualityStat["stat"]; who: Student; q: QualityStat }[] {
  const out: { stat: QualityStat["stat"]; who: Student; q: QualityStat }[] = [];
  for (const stat of STAT_ORDER) {
    let best: { who: Student; q: QualityStat } | null = null;
    for (const s of students) {
      const q = s.quality?.find((x) => x.stat === stat);
      if (!q) continue;
      if (!best || GRADE_POINTS[q.grade] > GRADE_POINTS[best.q.grade]) best = { who: s, q };
    }
    if (best && GRADE_POINTS[best.q.grade] >= 3) out.push({ stat, ...best });
  }
  return out;
}

/** Class grade distribution for one stat (projector chart). */
export function gradeDistribution(students: Student[], stat: QualityStat["stat"]): Record<Grade, number> {
  const d: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const s of students) {
    const q = s.quality?.find((x) => x.stat === stat);
    if (q) d[q.grade]++;
  }
  return d;
}
