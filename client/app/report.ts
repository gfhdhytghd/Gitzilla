// Edu "report card": every hero stat with its grade, the real code signal behind it and a concrete tip.
import type { QualityStat } from "../../shared/types";
import { h } from "./util";

const STAT_LABEL: Record<QualityStat["stat"], string> = {
  hp: "hp · health", armor: "try{} · armor", speed: "speed", damage: "damage", energy: "RAM · energy", regen: "regen", weakness: "weakness",
};
const ORDER: QualityStat["stat"][] = ["hp", "armor", "speed", "damage", "energy", "regen", "weakness"];
const GPA: Record<QualityStat["grade"], number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };

export function gpaOf(q: QualityStat[] | undefined): number {
  if (!q?.length) return 0;
  return q.reduce((a, s) => a + GPA[s.grade], 0) / q.length;
}

/** Compact report card. `tips` shows the improvement tip under each line. */
export function reportCard(q: QualityStat[] | undefined, opts: { tips?: boolean; title?: string } = {}): HTMLElement {
  if (!q?.length) return h("div.report.empty", null, "report card appears when the repo is analyzed in classroom mode");
  const rows = [...q].sort((a, b) => ORDER.indexOf(a.stat) - ORDER.indexOf(b.stat));
  return h(
    "div.report",
    null,
    h("div.rp-head", null, opts.title ?? "$ report-card", h("span.rp-gpa", null, `GPA ${gpaOf(q).toFixed(1)}`)),
    ...rows.map((r) =>
      h(
        `div.rp-row.g-${r.grade}`,
        { title: r.tip },
        h("span.rp-grade", null, r.grade),
        h("span.rp-stat", null, STAT_LABEL[r.stat] ?? r.stat),
        h("span.rp-signal", null, r.signal),
        opts.tips ? h("span.rp-tip", null, `tip: ${r.tip}`) : null,
      ),
    ),
  );
}
