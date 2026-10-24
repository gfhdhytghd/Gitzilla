// Plain-words architecture summary of a repo (from its Genesis + kit): heart, top fan-in modules, loops, biggest
// component, coupling, and "if you refactored X, this monster would lose Y". Also used to compare two repos.
// Pure (no DOM).
import type { Autopsy, BossKit, Genesis } from "../../shared/types.ts";

export interface SummaryLine { concept: string; text: string }

const n = (v: number) => v.toLocaleString("en-US");
const base = (p: string) => p.split("/").pop() || p;

export function fanCounts(g: Pick<Genesis, "components" | "edges">) {
  const fanIn = g.components.map(() => 0), fanOut = g.components.map(() => 0);
  for (const [a, b] of g.edges) {
    if (a === b) continue;
    fanOut[a]++;
    fanIn[b]++;
  }
  return { fanIn, fanOut };
}

/** 0..1: share of possible component→component arrows that exist. */
export function couplingDensity(g: Pick<Genesis, "components" | "edges">): number {
  const k = g.components.length;
  return k < 2 ? 0 : Math.min(1, g.edges.length / (k * (k - 1)));
}

export function couplingWord(d: number): string {
  return d < 0.15 ? "loosely coupled" : d < 0.35 ? "moderately coupled" : "tightly coupled";
}

export function architectureSummary(g: Genesis, kit?: BossKit | null): SummaryLine[] {
  const out: SummaryLine[] = [];
  const { fanIn, fanOut } = fanCounts(g);
  const comps = g.components;
  const total = comps.reduce((s, c) => s + c.loc, 0) || 1;

  if (g.heart) out.push({ concept: "heart-module", text: `The heart is \`${g.heart}\`: ${g.heartFanIn} other files import it. A bug there reaches almost everything.` });

  const ranked = comps.map((c, i) => ({ c, i, fi: fanIn[i] })).filter((x) => x.fi > 0).sort((a, b) => b.fi - a.fi).slice(0, 3);
  if (ranked.length)
    out.push({ concept: "fan-in", text: `Most depended-on: ${ranked.map((r) => `\`${r.c.name}\` (${r.fi})`).join(", ")}. These would break the most if deleted.` });

  const big = [...comps].sort((a, b) => b.loc - a.loc)[0];
  if (big) out.push({ concept: "component", text: `Biggest component: \`${big.name}\`, ${n(big.loc)} lines in ${n(big.files)} files (${Math.round((big.loc / total) * 100)}% of the code).` });

  const mo = fanOut.indexOf(Math.max(0, ...fanOut));
  if (mo >= 0 && fanOut[mo] >= 2) out.push({ concept: "fan-out", text: `\`${comps[mo].name}\` imports ${fanOut[mo]} other components, the most of any. It breaks if any of them change.` });

  if (g.cycles.length)
    out.push({ concept: "circular-dependency", text: `${g.cycles.length} import loop${g.cycles.length > 1 ? "s" : ""}: ${g.cycles.slice(0, 2).map((c) => c.map(base).join(" ↔ ")).join("; ")}. Each became a glowing weak point.` });
  else out.push({ concept: "circular-dependency", text: "No import loops: every component can be understood on its own. Nice." });

  const d = couplingDensity(g);
  out.push({ concept: "coupling", text: `${comps.length} components joined by ${g.edges.length} arrows: ${couplingWord(d)} (${Math.round(d * 100)}% of possible links).` });

  out.push(...refactorIdeas(g, kit));
  return out;
}

/** "If you refactored X, this boss would lose Y": grounded in the kit's real limb/attack mapping. */
export function refactorIdeas(g: Genesis, kit?: BossKit | null): SummaryLine[] {
  const out: SummaryLine[] = [];
  const attacksOf = (comp: string) => kit?.attacks.filter((a) => a.source === comp) ?? [];
  if (g.cycles.length) {
    const cyc = g.cycles[0];
    const lost = cyc.flatMap(attacksOf).filter((a) => a.kind === "cascade");
    out.push({
      concept: "refactor",
      text: `Untangle ${cyc.map((c) => `\`${base(c)}\``).join(" ↔ ")} (move the shared code into a new module) and this monster loses ${cyc.length} weak point${cyc.length > 1 ? "s" : ""}${lost.length ? ` and its "${lost[0].name}" attack` : ""}.`,
    });
  }
  const big = [...g.components].sort((a, b) => b.loc - a.loc)[0];
  const limb = big && kit?.limbs.find((l) => l.component === big.name);
  if (big && limb) {
    const atk = attacksOf(big.name);
    out.push({
      concept: "refactor",
      text: `Split \`${big.name}\` into smaller modules and its ${n(limb.maxHp)}-HP limb would shrink${atk.length ? `, along with ${atk.map((a) => `"${a.name}"`).slice(0, 2).join(" and ")}` : ""}.`,
    });
  }
  return out;
}

/** "Where this project needs help" (social impact #1): fragile organs + adoptable issues, from the autopsy. */
export function helpWanted(boss: NonNullable<Autopsy["boss"]>): { component: string; maintainers?: number; issues: { number: number; title: string; url: string }[] }[] {
  return boss.limbs
    .filter((l) => l.fragile || (l.maintainers !== undefined && l.maintainers <= 1) || l.issues?.length)
    .sort((a, b) => (a.maintainers ?? 9) - (b.maintainers ?? 9) || (b.issues?.length ?? 0) - (a.issues?.length ?? 0))
    .map((l) => ({ component: l.component, maintainers: l.maintainers, issues: (l.issues ?? []).slice(0, 3) }));
}

export interface RepoStats { label: string; files: number; loc: number; components: number; cycles: number; testPct: number; todos: number; contributors: number; coupling: number }

export function repoStats(g: Genesis, label: string): RepoStats {
  return {
    label,
    files: g.metrics.files,
    loc: g.metrics.loc,
    components: g.components.length,
    cycles: g.cycles.length,
    testPct: Math.round(g.metrics.testRatio * 100),
    todos: g.metrics.todos,
    contributors: g.metrics.contributors,
    coupling: Math.round(couplingDensity(g) * 100),
  };
}
