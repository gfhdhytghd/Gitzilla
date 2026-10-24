// Client-side Genesis builders. The server (genesis/ by codex-genesis) is the source of truth; these exist so
// the demo page can replay data/fallback repos offline, and so the cinematic still has a story when a lobby
// entry carries a kit but no genesis yet. Mirrors the rules in sim/kits.ts; real data only.
import type { BossArchetype, BossKit, Genesis, PlayerKit, RepoProfile, TraceStep } from "../../shared/types.ts";
import { longestChain } from "./graph.ts";
import { buildGenesis, heroBudget as battleHeroBudget, bossBudget, qualityTrace } from "../../genesis/index.ts";

const k = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const base = (p: string) => p.split("/").pop() || p;

export function isBossKit(kit: PlayerKit | BossKit): kit is BossKit {
  return (kit as BossKit).limbs !== undefined;
}

/** The pure server builder is also safe offline; keep one source of truth. */
export const heroBudget = battleHeroBudget;

const ARCHS: BossArchetype[] = ["kaiju", "hydra", "mecha", "abyssal"];

/** The boss's archetype; kits from before the archetype contract count as the classic kaiju. */
export function archetypeOf(kit: BossKit): BossArchetype {
  return ARCHS.includes(kit.archetype) ? kit.archetype : "kaiju";
}

/** Is this the "why this archetype" step (server genesis: ref "archetype"; local: archetypeStep, ref = the archetype)? */
export function isFormStep(s: TraceStep): boolean {
  if (s.part === "name" || s.part === "limb" || s.part === "attack") return false;
  const ref = s.ref?.toLowerCase() ?? "";
  return ref === "archetype" || (ARCHS as string[]).includes(ref) || /^(archetype|form|body)\s*:/i.test(s.to);
}

/** "why this repo became this silhouette", from the same real facts the sim picks the archetype with. */
export function archetypeStep(g: Omit<Genesis, "trace" | "budget">, kit: BossKit): TraceStep {
  const arch = archetypeOf(kit);
  // the sim's own selection reason ("4 circular dependency groups → multiple heads and winged flight.") when it has one
  const said = (kit.code as { archetypeReason?: string } | undefined)?.archetypeReason?.trim().replace(/\.$/, "");
  const cut = said ? said.split(/\s*(?:→|->)\s*/) : [];
  if (cut.length === 2 && cut[0] && cut[1]) return { from: cut[0], to: `form: ${arch.toUpperCase()} · ${cut[1]}`, part: "theme", ref: arch };
  const m = g.metrics;
  const lang = Object.entries(g.languages).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const depth = longestChain(g.components.length, g.edges).length - 1;
  let from: string, to: string;
  if (arch === "hydra") {
    from = g.cycles.length ? `${g.cycles.length} import cycle${g.cycles.length > 1 ? "s" : ""}` : `${g.edges.length} import edges, high fan-out`;
    to = "form: HYDRA · many heads, wings";
  } else if (arch === "mecha") {
    from = `${lang || "systems code"}${depth > 1 ? ` · import depth ${depth}` : ""}`;
    to = "form: MECHA · armored machine";
  } else if (arch === "abyssal") {
    const why = [m.loc >= 50000 ? `${k(m.loc)} loc` : "", m.ageDays > 3650 ? `${Math.round(m.ageDays / 365)}y old` : "", m.todos >= 20 ? `${k(m.todos)} TODOs` : ""].filter(Boolean);
    from = why.length ? why.join(" · ") : `${k(m.loc)} loc of deep history`;
    to = "form: ABYSSAL · crystal serpent";
  } else {
    from = `${k(m.files)} files · one big body`;
    to = "form: KAIJU · upright saurian";
  }
  return { from, to, part: "theme", ref: arch };
}

/** Offline replay uses exactly the server's rules, including archetype decks and edu quality. */
export function buildGenesisLocal(p: RepoProfile, kit: PlayerKit | BossKit): Genesis {
  const g = buildGenesis(p, kit, isBossKit(kit) ? "boss" : "hero");
  if (isBossKit(kit)) {
    const form = g.trace.find(isFormStep);
    if (form) g.trace = [form, ...g.trace.filter(s => s !== form)];
  }
  return g;
}

/** Thin genesis from a kit alone (no profile): enough for a short replay when the server sent none. */
export function genesisFromKit(kit: PlayerKit | BossKit, mode?: "battle" | "edu"): Genesis {
  const boss = isBossKit(kit);
  const edu = !boss && (mode === "edu" || kit.quality !== undefined);
  // A kit knows its organ names, not analyzed file/LOC counts. Never invent them.
  const comps = boss ? kit.limbs.map(l => ({ name: l.component, loc: 0, files: 0 })) : [];
  const trace: TraceStep[] = boss
    ? [
        { from: `${kit.limbs.length} components`, to: `form: ${archetypeOf(kit).toUpperCase()}`, part: "theme", ref: archetypeOf(kit) },
        ...kit.limbs.map((l) => ({ from: l.component, to: `limb: ${kit.design?.limbNames?.[l.id] ?? base(l.component)}`, part: "limb" as const, ref: l.component })),
        { from: `heart: ${base(kit.heart)}`, to: "core: pulsing heart", part: "heart", ref: kit.heart },
        { from: kit.repo, to: `name: ${kit.name}`, part: "name" },
      ]
    : [
        { from: "language", to: `class: ${kit.title}`, part: "class" },
        { from: "Code weapon", to: kit.code?.weapon?.name ?? kit.weapon, part: "weapon" },
        { from: "repo shape", to: `skill: ${kit.skill}`, part: "skill" },
        ...(edu ? [
          { from: "code quality", to: "stats: see your report card", part: "stats" as const },
          ...qualityTrace(kit.quality ?? []),
        ] : [{ from: "repo shape", to: "stats: same 5-pt budget", part: "stats" as const }]),
      ];
  const code = boss ? [...(kit.code?.heartLines ?? []), ...(kit.code?.snippets ?? [])] : [kit.code?.snippet ?? ""];
  return {
    slug: kit.repo, languages: {}, metrics: { files: 0, loc: 0, functions: 0, todos: 0, contributors: 0, commits: 0, ageDays: 0, testRatio: 0 },
    components: comps, edges: [], cycles: [], heart: boss ? kit.heart : "", heartFanIn: 0,
    sampleFiles: boss ? [kit.heart, ...(kit.code as { bigFiles?: { path: string }[] } | undefined)?.bigFiles?.map((f) => f.path) ?? []] : [],
    snippets: code.filter(Boolean),
    trace, budget: boss ? bossBudget(kit) : edu ? [] : heroBudget(kit),
  };
}
