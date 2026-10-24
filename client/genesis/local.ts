// Client-side Genesis builders. The server (genesis/ by codex-genesis) is the source of truth; these exist so
// the demo page can replay data/fallback repos offline, and so the cinematic still has a story when a lobby
// entry carries a kit but no genesis yet. Mirrors the rules in sim/kits.ts; real data only.
import type { BossArchetype, BossKit, Genesis, PlayerKit, RepoProfile, TraceStep } from "../../shared/types.ts";
import { longestChain } from "./graph.ts";

const k = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const pct = (v: number, total: number) => `${Math.round((v / Math.max(1, total)) * 100)}%`;
const base = (p: string) => p.split("/").pop() || p;

export function isBossKit(kit: PlayerKit | BossKit): kit is BossKit {
  return (kit as BossKit).limbs !== undefined;
}

/** Equal stat budget for a hero: 5 points split between hp / armor / energy / speed / damage (sim/kits.ts). */
export function heroBudget(kit: PlayerKit): Genesis["budget"] {
  return [
    { label: "hp", value: Math.max(0, kit.maxHp - 5) },
    { label: "armor", value: Math.max(0, kit.maxArmor - 3) },
    { label: "energy", value: Math.max(0, Math.round((kit.maxEnergy - 150) / 35)) },
    { label: "speed", value: Math.max(0, Math.round((kit.speed - 77) / 8)) },
    { label: "damage", value: Math.max(0, Math.round((kit.damageMul - 0.9) / 0.1)) },
  ];
}

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

function bossBudget(kit: BossKit): Genesis["budget"] {
  const limbs = kit.limbs.reduce((s, l) => s + l.maxHp, 0);
  return [{ label: "core", value: Math.max(0, kit.maxHp - limbs) }, ...kit.limbs.slice(0, 6).map((l) => ({ label: base(l.component), value: l.maxHp }))];
}

function sampleFiles(p: RepoProfile): string[] {
  const dna = p.dna;
  const out = new Set<string>();
  const add = (s?: string) => { if (s && /\.[a-z0-9]+$/i.test(s) && out.size < 40) out.add(s); };
  add(p.heart);
  dna?.bigFiles.forEach((f) => add(f.path));
  dna?.snippets.forEach((s) => add(s.file));
  dna?.todos.forEach((t) => add(t.file));
  if (dna?.longestFunction) add(dna.longestFunction.file);
  p.tree?.forEach(add);
  // directories still make good "receiving" lines when the tree holds few files
  if (out.size < 16) p.tree?.forEach((d) => { if (out.size < 40) out.add(d); });
  return [...out];
}

function shell(p: RepoProfile, kit: PlayerKit | BossKit): Omit<Genesis, "trace" | "budget"> {
  const dna = p.dna;
  const snippets = [...(dna?.snippets.map((s) => s.code) ?? []), ...(dna?.heartLines ?? [])].filter(Boolean).slice(0, 10);
  return {
    slug: p.slug,
    languages: p.languages,
    metrics: {
      files: p.totalFiles, loc: p.totalLoc, functions: dna?.counts.functions ?? 0,
      todos: (dna?.counts.todo ?? 0) + (dna?.counts.fixme ?? 0) + (dna?.counts.hack ?? 0),
      contributors: p.contributors, commits: p.commits, ageDays: p.ageDays, testRatio: p.testRatio,
    },
    components: p.components.slice(0, 8).map((c) => ({ name: c.name, loc: c.loc, files: c.files })),
    edges: p.edges.filter(([a, b]) => a < 8 && b < 8),
    cycles: p.cycles,
    heart: p.heart, heartFanIn: p.heartFanIn,
    sampleFiles: sampleFiles(p),
    snippets: snippets.length ? snippets : [(kit as PlayerKit).code?.snippet ?? `// ${p.slug}`],
  };
}

export function buildGenesisLocal(p: RepoProfile, kit: PlayerKit | BossKit): Genesis {
  const g = shell(p, kit);
  const langTotal = Object.values(p.languages).reduce((s, v) => s + v, 0);
  const lang = p.primaryLanguage || "Code";
  const langLine = `language: ${lang} ${pct(p.languages[lang] ?? 0, langTotal)}`;
  const trace: TraceStep[] = [];
  if (!isBossKit(kit)) {
    const w = kit.code?.weapon;
    trace.push({ from: langLine, to: `class: ${kit.title}`, part: "class" });
    trace.push({ from: langLine, to: `weapon: ${w?.name ?? kit.weapon}${w ? ` fires ${w.projectiles.slice(0, 2).join(" ")}` : ""}`, part: "weapon" });
    const conc = Math.max(0, ...p.components.map((c) => c.fanIn)) / Math.max(1, p.components.reduce((s, c) => s + c.fanIn, 0));
    const why = p.testRatio >= 0.18 ? `tests ${pct(p.testRatio, 1)} of files` : p.cycles.length >= 2 ? `${p.cycles.length} import cycles`
      : p.components.length >= 4 && conc < 0.4 ? `${p.components.length} balanced modules` : p.contributors >= 15 ? `${p.contributors} contributors` : "tight solo codebase";
    trace.push({ from: `shape: ${why}`, to: `skill: ${kit.skill}`, part: "skill" });
    const toks = (kit.code?.tokens ?? []).slice(0, 4);
    if (toks.length) trace.push({ from: `tokens: ${toks.join(" ")}`, to: "glyphs: orbiting tokens + crest", part: "glyphs" });
    if (kit.code?.snippet) trace.push({ from: `snippet: ${kit.code.snippet.slice(0, 34)}`, to: "cape: scrolling source", part: "cape" });
    trace.push({ from: `${lang} syntax colors`, to: `palette: ${kit.palette.slice(0, 2).join(" ")}`, part: "palette" });
    if (kit.quality?.length) {
      // edu: the trace is the report card (signal -> stat -> grade)
      for (const q of kit.quality) trace.push({ from: q.signal, to: `${q.stat}: grade ${q.grade}`, part: q.stat === "weakness" ? "scars" : "stats", ref: q.stat });
    } else trace.push({ from: `shape: ${k(p.totalFiles)} files, depth ${p.maxDepth}`, to: "stats: same 5-pt budget, new split", part: "stats" });
    if (kit.code?.signature) trace.push({ from: `top identifier: ${kit.code.signature}`, to: "signature move", part: "name", ref: kit.code.signature });
    if (kit.design?.title) trace.push({ from: `readme + code DNA`, to: `name: ${kit.design.title}`, part: "name" });
    const budget = kit.quality?.length ? kit.quality.map((q) => ({ label: q.stat, value: q.value })) : heroBudget(kit);
    return { ...g, trace, budget };
  }
  // boss: the silhouette first (why this archetype), then the parts
  trace.push(archetypeStep(g, kit));
  trace.push({ from: langLine + (p.ageDays > 3650 ? `, ${Math.round(p.ageDays / 365)}y old` : ""), to: `theme: ${kit.theme} arena`, part: "theme" });
  kit.limbs.forEach((l, i) => {
    const c = p.components.find((cc) => cc.name === l.component);
    const name = kit.design?.limbNames?.[l.id] ?? base(l.component);
    trace.push({ from: `${l.component} ${c ? k(c.loc) + " loc" : ""}`.trim(), to: `limb: ${name}`, part: "limb", ref: l.component });
    const atk = kit.attacks.find((a) => a.source === l.component);
    if (atk && i < 3) trace.push({ from: `${base(l.component)} fan-out ${c?.fanOut ?? 0}`, to: `attack: ${atk.name} (${atk.kind})`, part: "attack", ref: l.component });
  });
  trace.push({ from: `heart: ${base(p.heart)} (fan-in ${p.heartFanIn})`, to: "core: pulsing heart", part: "heart", ref: p.heart });
  if (p.cycles.length) {
    const weak = kit.limbs.filter((l) => l.weakPoint);
    trace.push({ from: `cycles: ${p.cycles.length} (${p.cycles[0].slice(0, 2).map(base).join(" <-> ")})`, to: `weak points: ${weak.length} red knots`, part: "weakpoint", ref: weak[0]?.component });
  }
  trace.push({ from: `contributors: ${k(p.contributors)}`, to: `eyes: ${kit.design?.eyes ?? "many"}`, part: "eyes" });
  const todos = g.metrics.todos;
  if (todos) trace.push({ from: `TODO/FIXME/HACK x${k(todos)}`, to: "minions: bugs wearing real TODOs", part: "minions" });
  if (p.commits) trace.push({ from: `commits: ${k(p.commits)}`, to: "scars across the hide", part: "scars" });
  trace.push({ from: p.slug, to: `name: ${kit.name}`, part: "name" });
  return { ...g, trace, budget: bossBudget(kit) };
}

/** Thin genesis from a kit alone (no profile): enough for a short replay when the server sent none. */
export function genesisFromKit(kit: PlayerKit | BossKit): Genesis {
  const boss = isBossKit(kit);
  const comps = boss ? kit.limbs.map((l, i) => ({ name: l.component, loc: 1000 * (8 - i), files: 10 })) : [{ name: kit.repo, loc: 1000, files: 10 }];
  const trace: TraceStep[] = boss
    ? [
        { from: `${kit.limbs.length} components`, to: `form: ${archetypeOf(kit).toUpperCase()}`, part: "theme", ref: archetypeOf(kit) },
        ...kit.limbs.map((l) => ({ from: l.component, to: `limb: ${kit.design?.limbNames?.[l.id] ?? base(l.component)}`, part: "limb" as const, ref: l.component })),
        { from: `heart: ${base(kit.heart)}`, to: "core: pulsing heart", part: "heart", ref: kit.heart },
        { from: kit.repo, to: `name: ${kit.name}`, part: "name" },
      ]
    : [
        { from: "language", to: `class: ${kit.title}`, part: "class" },
        { from: "language", to: `weapon: ${kit.code?.weapon?.name ?? kit.weapon}`, part: "weapon" },
        { from: "repo shape", to: `skill: ${kit.skill}`, part: "skill" },
        { from: "repo shape", to: "stats: same 5-pt budget", part: "stats" },
      ];
  const code = boss ? [...(kit.code?.heartLines ?? []), ...(kit.code?.snippets ?? [])] : [kit.code?.snippet ?? ""];
  return {
    slug: kit.repo, languages: {}, metrics: { files: 0, loc: 0, functions: 0, todos: 0, contributors: 0, commits: 0, ageDays: 0, testRatio: 0 },
    components: comps, edges: [], cycles: [], heart: boss ? kit.heart : "", heartFanIn: 0,
    sampleFiles: boss ? [kit.heart, ...(kit.code as { bigFiles?: { path: string }[] } | undefined)?.bigFiles?.map((f) => f.path) ?? []] : [],
    snippets: code.filter(Boolean).length ? code.filter(Boolean) : [`// ${kit.repo}`],
    trace, budget: boss ? bossBudget(kit) : heroBudget(kit),
  };
}
