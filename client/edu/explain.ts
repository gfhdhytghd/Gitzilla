// Plain-language report-card rows. The sim sends each grade with a short technical `signal` ("Average fan-out 5.0;
// dependency depth 1"). Here we read the numbers back out, say them in CS-101 words with a scale (class average +
// what the next grade needs), and give every B-or-worse row a concrete tip that names a real file when one exists.
// Next-grade targets are computed with the sim's own grading (sim/quality.ts qualityRows), so they always match the
// real thresholds; if the numbers can't be reproduced exactly, the target is left out instead of guessed.
import type { QualityStat } from "../../shared/types.ts";
import { type ClassroomFacts, qualityRows } from "../../sim/quality.ts";

type Stat = QualityStat["stat"];
type Grade = QualityStat["grade"];
const ORDER: Grade[] = ["F", "D", "C", "B", "A"];

/** Numbers recovered from a row's signal/tip (sim/quality.ts wording; unknown wording → empty). */
export interface Measures {
  loc?: number; readme?: boolean;
  testPct?: number; testDir?: boolean;
  avgImports?: number; depth?: number;
  perFile?: number; avgFn?: number; longestFn?: number;
  commentPct?: number; readmeChars?: number;
  cycles?: number; todoPer1k?: number; advisories?: number;
  file?: string; cycle?: string[];
}

const num = (s: string, re: RegExp): number | undefined => {
  const m = s.match(re);
  return m ? Number(m[1].replace(/,/g, "")) : undefined;
};

export function measures(q: QualityStat): Measures {
  const s = q.signal, t = q.tip;
  const m: Measures = {};
  const file = t.match(/(?:tests for|function from) ([^\s]+?)(?: to|\.?$)/)?.[1];
  if (file) m.file = file;
  switch (q.stat) {
    case "hp":
      m.loc = num(s, /([\d,]+) analyzed LOC/);
      if (/README present/.test(s)) m.readme = true;
      else if (/README not found/.test(s)) m.readme = false;
      break;
    case "armor":
      m.testPct = num(s, /Tests: ([\d.]+)%/);
      m.testDir = /test directory detected/.test(s);
      break;
    case "speed":
      m.avgImports = num(s, /fan-out ([\d.]+)/);
      m.depth = num(s, /dependency depth (\d+)/);
      break;
    case "damage":
      m.perFile = num(s, /([\d.]+) definitions\/file/);
      m.avgFn = num(s, /(?:average function length|LOC\/definition) ([\d.]+)/);
      m.longestFn = num(s, /longest (\d+) lines/);
      break;
    case "energy":
    case "regen":
      m.commentPct = num(s, /Comment ratio ([\d.]+)%/);
      m.readmeChars = num(s, /README (\d+) characters/);
      break;
    case "weakness": {
      m.cycles = num(s, /(\d+) dependency cycles?/);
      m.todoPer1k = num(s, /([\d.]+) TODO\/FIXME\/HACK per kLOC/);
      m.advisories = num(s, /(\d+) public advisor/);
      const c = t.match(/Break the (.+) cycle/)?.[1];
      if (c) m.cycle = c.split(" ↔ ");
      break;
    }
  }
  for (const k of Object.keys(m) as (keyof Measures)[]) if (m[k] === undefined || Number.isNaN(m[k])) delete m[k];
  return m;
}

// ---------- re-grading with the sim's real formula ----------

function facts(stat: Stat, m: Measures): ClassroomFacts | null {
  const f: ClassroomFacts = {
    heart: "", heartFanIn: 0, files: [], components: [], cycles: [], testRatio: 0, hasTests: false, loc: 1000,
    readmeLength: null, hasReadme: false, avgFanOut: 0, maxDepth: 0, functionsPerFile: null, avgFunctionLength: null,
    functionLengthApproximate: false, longestFunction: 0, commentRatio: null, todoCount: 0, todoDensity: 0, vulns: [],
  };
  switch (stat) {
    case "armor":
      if (m.testPct === undefined) return null;
      return { ...f, testRatio: m.testPct / 100, hasTests: !!m.testDir };
    case "speed":
      if (m.avgImports === undefined || m.depth === undefined) return null;
      return { ...f, avgFanOut: m.avgImports, maxDepth: m.depth };
    case "damage":
      if (m.perFile === undefined || m.avgFn === undefined || m.longestFn === undefined) return null;
      return { ...f, functionsPerFile: m.perFile, avgFunctionLength: m.avgFn, longestFunction: m.longestFn };
    case "energy":
      if (m.commentPct === undefined || m.readmeChars === undefined) return null;
      return { ...f, commentRatio: m.commentPct / 100, readmeLength: m.readmeChars, hasReadme: m.readmeChars > 0 };
    case "weakness":
      if (m.cycles === undefined || m.todoPer1k === undefined) return null;
      return { ...f, cycles: Array.from({ length: m.cycles }, () => ["a", "b"]), todoDensity: m.todoPer1k };
    default:
      return null;
  }
}

const gradeOf = (stat: Stat, f: ClassroomFacts): Grade => qualityRows(f).find((r) => r.stat === stat)!.grade;

type Knob = [keyof Measures, "up" | "down", number];
/** The knobs a student can turn for each stat, easiest first: [measure key, direction, limit]. */
function knobs(stat: Stat, m: Measures): Knob[] {
  switch (stat) {
    case "armor": return [["testPct", "up", 100]];
    case "speed": return [["avgImports", "down", 0]];
    case "damage": return [["longestFn", "down", 20], ["avgFn", "down", 5], ["perFile", "down", 8]];
    // a short README is the cheapest fix; otherwise comments
    case "energy": return (m.readmeChars ?? 0) < 1500 ? [["readmeChars", "up", 6000], ["commentPct", "up", 40]] : [["commentPct", "up", 40], ["readmeChars", "up", 6000]];
    case "weakness": return [["cycles", "down", 0], ["todoPer1k", "down", 0]];
    default: return [];
  }
}

export interface Target { grade: Grade; key: keyof Measures; value: number }

/** What the next grade needs (one knob, others unchanged). null if already A, unreproducible or unreachable. */
export function nextGrade(q: QualityStat, m = measures(q)): Target | null {
  if (q.grade === "A") return null;
  const base = facts(q.stat, m);
  if (!base || gradeOf(q.stat, base) !== q.grade) return null; // can't reproduce: never show a made-up threshold
  const want = ORDER[ORDER.indexOf(q.grade) + 1];
  const reaches = (k: keyof Measures, v: number) => {
    const f = facts(q.stat, { ...m, [k]: v });
    return !!f && ORDER.indexOf(gradeOf(q.stat, f)) >= ORDER.indexOf(want);
  };
  for (const [k, dir, limit] of knobs(q.stat, m)) {
    const cur = m[k] as number;
    if (!reaches(k, limit)) continue;
    if (k === "cycles") {
      for (let c = cur - 1; c >= 0; c--) if (reaches(k, c)) return { grade: want, key: k, value: c };
      continue;
    }
    // bisection between the current value (not enough) and the limit (enough)
    let lo = cur, hi = limit;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (reaches(k, mid)) hi = mid;
      else lo = mid;
    }
    const round = (v: number) => (k === "readmeChars" || k === "longestFn" ? (dir === "up" ? Math.ceil(v / 10) * 10 : Math.floor(v)) : dir === "up" ? Math.ceil(v * 10) / 10 : Math.floor(v * 10) / 10);
    let v = round(hi);
    if (!reaches(k, v)) v = hi;
    return { grade: want, key: k, value: v };
  }
  return null;
}

// ---------- words ----------

export interface PlainRow {
  stat: Stat;
  grade: Grade;
  /** "speed" */
  word: string;
  /** "try{}" (small, after the word) */
  alias: string;
  /** "how independent the parts of your code are" */
  what: string;
  /** "each part of your code uses 5 others on average" (+ class average when peers are given) */
  measure: string;
  /** "next: B needs ≤ 3.1 per part" */
  next: string | null;
  /** concrete tip for B-or-worse rows (always one) */
  tip: string | null;
  /** the game effect in plain words: "you take +4% damage" */
  effect: string | null;
  concept: string;
}

const WORDS: Record<Stat, { word: string; alias: string; what: string; concept: string }> = {
  armor: { word: "armor", alias: "try{}", what: "how much of your code is checked by tests", concept: "test-coverage" },
  speed: { word: "speed", alias: "", what: "how independent the parts of your code are", concept: "modularity" },
  damage: { word: "damage", alias: "dmg", what: "how short and focused your functions are", concept: "cohesion" },
  energy: { word: "energy", alias: "RAM", what: "how well your code is explained (comments + README)", concept: "documentation" },
  regen: { word: "energy refill", alias: "gc()", what: "how well your code is explained", concept: "documentation" },
  hp: { word: "health", alias: "hp", what: "how much code you wrote (capped, so nobody is a tank)", concept: "code-size" },
  weakness: { word: "tech-debt penalty", alias: "", what: "import loops and leftover TODOs make you take extra damage (A = no penalty)", concept: "tech-debt" },
};

const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString("en-US");
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
/** Class median (one giant repo can't drag it around the way a mean would). */
const avgOf = (peers: Measures[], k: keyof Measures) => {
  const vs = peers.map((p) => p[k]).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
  if (vs.length < 2) return null;
  const mid = vs.length >> 1;
  return vs.length % 2 ? vs[mid] : (vs[mid - 1] + vs[mid]) / 2;
};
const avgNote = (a: number | null, fmt: (v: number) => string) => (a === null ? "" : ` (class median ${fmt(a)})`);
const base = (p: string) => p.split("/").pop() || p;

function targetText(t: Target): string {
  const v = t.value;
  switch (t.key) {
    case "testPct": return `${t.grade} needs tests in ${n1(v)}% of files`;
    case "avgImports": return `${t.grade} needs each part to use ≤ ${n1(v)} other${v === 1 ? "" : "s"}`;
    case "longestFn": return `${t.grade} needs your longest function ≤ ${n0(v)} lines`;
    case "avgFn": return `${t.grade} needs functions ≤ ${n0(v)} lines on average`;
    case "perFile": return `${t.grade} needs ≤ ${n1(v)} functions per file`;
    case "commentPct": return `${t.grade} needs ${n1(v)} comment lines per 100`;
    case "readmeChars": return `${t.grade} needs a README of ${n0(v)}+ characters`;
    case "cycles": return `${t.grade} needs ${v === 0 ? "no" : v} import loop${v === 1 ? "" : "s"}`;
    case "todoPer1k": return `${t.grade} needs ≤ ${n1(v)} TODOs per 1,000 lines`;
    default: return `${t.grade} is within reach`;
  }
}

/** One report-card row in plain words. `peers` = the class's rows for the same stat (for averages). */
export function plainRow(q: QualityStat, peers: QualityStat[] = []): PlainRow {
  const w = WORDS[q.stat];
  const m = measures(q);
  const pm = peers.filter((p) => p.stat === q.stat).map((p) => measures(p));
  const weak = q.grade !== "A";
  let measure = q.signal;
  let tip: string | null = null;
  let effect: string | null = null;
  switch (q.stat) {
    case "armor":
      if (m.testPct !== undefined) measure = `${n1(m.testPct)}% of your files are tests${avgNote(avgOf(pm, "testPct"), (v) => `${n1(v)}%`)}`;
      tip = m.file ? `write a test for \`${m.file}\`: each test file adds armor` : "add a tests/ folder with one test per module";
      break;
    case "speed":
      if (m.avgImports !== undefined) measure = `each part of your code uses ${n1(m.avgImports)} other part${m.avgImports === 1 ? "" : "s"}${avgNote(avgOf(pm, "avgImports"), n1)}${m.depth ? ` · longest import chain: ${m.depth} step${m.depth === 1 ? "" : "s"}` : ""}`;
      tip = "move shared helpers into one small module, so the other parts import less from each other";
      break;
    case "damage":
      if (m.longestFn !== undefined) measure = `longest function: ${n0(m.longestFn)} lines${avgNote(avgOf(pm, "longestFn"), n0)}${m.avgFn !== undefined ? ` · typical function: ${n0(m.avgFn)} lines` : ""}${m.perFile !== undefined && m.perFile > 8 ? ` · ${n1(m.perFile)} functions per file` : ""}`;
      tip = m.perFile !== undefined && m.perFile > 8 && (m.longestFn ?? 0) <= 300
        ? `your files hold ${n1(m.perFile)} functions each: split the most crowded files by topic${m.file ? ` (start with \`${m.file}\`)` : ""}`
        : m.longestFn && m.longestFn > 60
        ? `split your ${n0(m.longestFn)}-line function${m.file ? ` (in \`${m.file}\`)` : ""} into small functions that each do one job`
        : `keep functions under ~40 lines${m.file ? `; start with \`${m.file}\`` : ""}`;
      break;
    case "energy":
    case "regen":
      if (m.commentPct !== undefined) measure = `${n1(m.commentPct)} comment lines per 100 lines of code${avgNote(avgOf(pm, "commentPct"), n1)}${m.readmeChars !== undefined ? ` · README: ${n0(m.readmeChars)} characters` : ""}`;
      tip = (m.readmeChars ?? 0) < 1500
        ? "grow your README: what the project does, how to run it, one example"
        : "add a comment above each tricky function saying WHY it works that way";
      break;
    case "hp":
      if (m.loc !== undefined) measure = `${n0(m.loc)} lines of code${m.readme === false ? " · no README found" : ""}`;
      tip = m.readme === false ? "add a README (it's worth more health than thousands of lines)" : null;
      break;
    case "weakness": {
      const parts: string[] = [];
      if (m.cycles !== undefined) parts.push(m.cycles ? `${m.cycles} import loop${m.cycles === 1 ? "" : "s"}` : "no import loops");
      if (m.todoPer1k !== undefined) parts.push(`${n1(m.todoPer1k)} TODOs per 1,000 lines`);
      if (m.advisories) parts.push(`${m.advisories} known security advisor${m.advisories === 1 ? "y" : "ies"} in dependencies`);
      if (parts.length) measure = parts.join(" · ");
      effect = q.value >= 0.005 ? `you take +${Math.round(q.value * 100)}% damage` : q.value > 0 ? "you take almost no extra damage" : "no penalty";
      tip = m.advisories && /upgrade|advisory/i.test(q.tip)
        ? q.tip
        : m.cycles
          ? `break the import loop${m.cycle ? ` ${m.cycle.slice(0, 3).map((c) => `\`${base(c)}\``).join(" ↔ ")}${m.cycle.length > 3 ? " ↔ …" : ""}` : ""}: move the code they share into a new module ${(m.cycle?.length ?? 2) > 2 ? "they all" : "both"} can import`
          : "fix or delete your oldest TODO comments";
      break;
    }
  }
  // unknown wording: keep the sim's own (specific) tip rather than a generic one
  if (measure === q.signal && tip) tip = q.tip;
  const t = weak ? nextGrade(q, m) : null;
  return {
    stat: q.stat,
    grade: q.grade,
    word: w.word,
    alias: w.alias,
    what: w.what,
    measure,
    next: t ? targetText(t) : null,
    tip: weak && !(q.stat === "hp" && !tip) ? tip ?? q.tip : null,
    effect,
    concept: w.concept,
  };
}

/** Primary number for ranking students on a stat (higher = better), for class highlights tie-breaks. */
export function primaryScore(q: QualityStat): number | null {
  const m = measures(q);
  switch (q.stat) {
    case "armor": return m.testPct ?? null;
    case "speed": return m.avgImports === undefined ? null : -m.avgImports;
    case "damage": return m.longestFn === undefined ? null : -m.longestFn;
    case "energy": case "regen": return m.commentPct ?? null;
    case "hp": return m.loc ?? null;
    case "weakness": return -q.value;
  }
}
