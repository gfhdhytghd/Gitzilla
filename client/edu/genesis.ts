// Narration for the Genesis cinematic in edu mode: each stage pauses on one plain-language note grounded in the
// repo's real numbers. claude-genesis shows it when lobby.mode === "edu". Pure (no DOM).
import type { Genesis, GenesisStage, QualityStat } from "../../shared/types.ts";
import { STAT_LABEL } from "./concepts.ts";
import { gpa, gpaGrade, sortStats, strongest, weakest } from "./quality.ts";

/** Contract stages plus the cinematic's own assemble/reveal beats. */
export type EduStage = GenesisStage | "assemble" | "reveal";

export interface EduNote {
  stage: EduStage;
  title: string;   // terminal caption, e.g. "$ git clone"
  text: string;    // ≤ 2 short sentences: what this step means
  fact: string;    // one real number from THIS repo
}

const n = (v: number) => v.toLocaleString("en-US");
const base = (p: string) => p.split("/").pop() || p;

export function eduGenesisNotes(g: Genesis, kind: "hero" | "boss" = "hero", quality?: QualityStat[]): Record<EduStage, EduNote> {
  const m = g.metrics;
  const comps = g.components;
  const biggest = [...comps].sort((a, b) => b.loc - a.loc)[0];
  const fanIn = new Array(comps.length).fill(0);
  const fanOut = new Array(comps.length).fill(0);
  for (const [a, b] of g.edges) {
    fanOut[a]++;
    fanIn[b]++;
  }
  const maxOut = comps.length ? fanOut.indexOf(Math.max(...fanOut)) : -1;
  const langs = Object.entries(g.languages).sort((a, b) => b[1] - a[1]);
  const langTotal = langs.reduce((s, [, v]) => s + v, 0) || 1;
  const lang = langs[0] ? `${langs[0][0]} ${Math.round((langs[0][1] / langTotal) * 100)}%` : "unknown";
  const testPct = Math.round(m.testRatio * 100);
  const who = kind === "hero" ? "your hero" : "the monster";
  const q = quality?.length ? sortStats(quality) : null;
  const best = strongest(quality);
  const worst = weakest(quality);

  const notes: Record<EduStage, EduNote> = {
    clone: {
      stage: "clone",
      title: "$ git clone",
      text: "First we download every file in the repository, the same way you'd clone it to work on it.",
      fact: `${n(m.files)} files · ${n(m.loc)} lines · mostly ${lang}`,
    },
    parse: {
      stage: "parse",
      title: "$ parse",
      text: "Each file is read to find its imports: which other code it needs. Files in the same folder group into components.",
      fact: biggest
        ? `${comps.length} components; biggest is ${biggest.name} (${n(biggest.loc)} lines)`
        : `${n(m.functions)} functions found`,
    },
    graph: {
      stage: "graph",
      title: "$ graph",
      text: g.cycles.length
        ? "Arrows show who imports whom. Red loops are circular dependencies: parts that can't work without each other."
        : "Arrows show who imports whom. The more arrows point at a file, the more of the project depends on it.",
      fact: g.cycles.length
        ? `${g.cycles.length} loop${g.cycles.length > 1 ? "s" : ""}: ${g.cycles[0].map(base).join(" ↔ ")}`
        : g.heart
          ? `heart: ${base(g.heart)}, imported ${g.heartFanIn}×; ${g.edges.length} arrows, 0 loops`
          : `${g.edges.length} import arrows, 0 loops`,
    },
    dna: {
      stage: "dna",
      title: "$ read code",
      text: "Then we read the code itself: functions, comments, and the TODO notes programmers leave for later.",
      fact: `${n(m.functions)} functions · ${n(m.todos)} TODO/FIXME · tests ${testPct}% of files`,
    },
    map: {
      stage: "map",
      title: "$ grade",
      text: q
        ? "Now every stat is earned. Tests become armor, modular code becomes speed, focused functions become damage, docs become energy."
        : "Now every real fact becomes part of the character. Watch each wire: a fact on the left turns into a body part on the right.",
      fact: q
        ? q.slice(0, 3).map((x) => `${STAT_LABEL[x.stat].plain} ${x.grade}`).join(" · ")
        : maxOut >= 0 && fanOut[maxOut] > 0
          ? `${comps[maxOut].name} imports ${fanOut[maxOut]} others: the most tangled part`
          : `${g.trace.length} facts mapped`,
    },
    design: {
      stage: "design",
      title: "$ design",
      text: `An AI artist dresses ${who} using the repo's README and file names. Looks only: it never changes the stats.`,
      fact: `${m.contributors} contributor${m.contributors === 1 ? "" : "s"} · ${n(m.commits)} commits`,
    },
    assemble: {
      stage: "assemble",
      title: "$ build",
      text: "The sprite is assembled from real lines of this repo's code: they fall into place as pixels.",
      fact: g.snippets[0] ? g.snippets[0].trim().slice(0, 48) : `${n(m.loc)} lines compiled`,
    },
    reveal: {
      stage: "reveal",
      title: "$ report card",
      text: q
        ? "Better-engineered code makes a stronger hero. Every grade has a tip, so you can improve your real project."
        : `Same code, same ${who}, every time. Change the code and ${who} changes too.`,
      fact: q
        ? `GPA ${gpa(quality).toFixed(1)} (${gpaGrade(gpa(quality))}) · best: ${STAT_LABEL[best!.stat].plain} ${best!.grade} · fix next: ${STAT_LABEL[worst!.stat].plain} ${worst!.grade}`
        : g.budget.map((b) => `${b.label} ${b.value}`).join(" · "),
    },
    ready: {
      stage: "ready",
      title: "$ ready",
      text: q && worst ? `To level up for real: ${worst.tip}` : "Ready to fight. Every move it makes comes from the code you just watched.",
      fact: q && worst ? `${STAT_LABEL[worst.stat].plain} ${worst.grade}: ${worst.signal}` : `${g.slug}`,
    },
  };
  return notes;
}

/** Ordered list (the cinematic's beat order). */
export const EDU_STAGE_ORDER: EduStage[] = ["clone", "parse", "graph", "dna", "map", "design", "assemble", "reveal", "ready"];
