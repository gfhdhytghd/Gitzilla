// Concept library for edu mode: every idea the game can teach, in plain words, plus fact templates that turn a
// lesson event's REAL repo data into one concrete sentence. Pure data + string helpers (no DOM).
import type { BossAttackKind, Concept, QualityStat } from "../../shared/types.ts";

/** Contract concepts plus the code-quality ones edu PvP needs (contract request in docs/progress/claude-edu.md). */
export type EduConcept = Concept | "code-quality" | "modularity" | "cohesion" | "documentation" | "code-size";

export type Facts = Record<string, string | number>;

export interface ConceptInfo {
  title: string;
  /** Short badge text for the icon (1–4 chars, pixel font). */
  glyph: string;
  /** Badge color. */
  color: string;
  /** 1–2 plain sentences, CS-101 friendly. */
  text: string;
  /** "Learn more": one or two extra sentences shown when a card is expanded. */
  more: string;
  /** Fact templates, best first. `{key}` is filled from facts; a template is used only if every key is present. */
  facts: string[];
}

const C = {
  graph: "#3de8ff",
  hot: "#ff3355",
  warn: "#ffb000",
  good: "#39ff88",
  git: "#ff3d7f",
  oss: "#ffd23d",
  mem: "#b48cff",
};

export const CONCEPTS: Record<EduConcept, ConceptInfo> = {
  "dependency-graph": {
    title: "Dependency graph",
    glyph: "A>B",
    color: C.graph,
    text: "Every arrow means one part of the code imports another. Draw them all and you get the project's map.",
    more: "Reading the graph tells you what is safe to change: arrows show which parts break when another does.",
    facts: ["`{repo}` has {components} components joined by {edges} import arrows.", "`{component}` imports {fanOut} other components."],
  },
  "fan-in": {
    title: "Fan-in",
    glyph: ">O",
    color: C.graph,
    text: "Fan-in counts how many parts import a module. High fan-in means a lot of code leans on it.",
    more: "Modules with high fan-in should be stable and well tested, because a bug there spreads everywhere.",
    facts: ["`{component}` is imported by {fanIn} components.", "`{file}` is imported from {fanIn} places."],
  },
  "fan-out": {
    title: "Fan-out",
    glyph: "O>",
    color: C.graph,
    text: "Fan-out counts how many other parts a module imports. High fan-out means it breaks whenever any of them change.",
    more: "A module with huge fan-out is often doing too many jobs. Splitting it lowers the risk.",
    facts: ["`{component}` imports {fanOut} other components."],
  },
  "heart-module": {
    title: "Heart module",
    glyph: "<3",
    color: C.hot,
    text: "The heart is the file that the most code depends on. Break it and almost everything stops working.",
    more: "Projects protect their heart with tests and careful reviews, because a change there touches everyone.",
    facts: ["The heart of `{repo}` is `{file}`, imported {fanIn} times.", "`{file}` is the heart: fan-in {fanIn}."],
  },
  "circular-dependency": {
    title: "Circular dependency",
    glyph: "LOOP",
    color: C.hot,
    text: "A imports B and B imports A, so neither can be understood, tested or loaded alone. That's a knot in the code.",
    more: "To fix one, move the shared part into a third module that both import, or pass the dependency in.",
    facts: ["{members} import each other in a loop.", "`{repo}` has {cycles} import loop(s). Each one is a weak point.", "`{component}` is stuck in an import loop."],
  },
  coupling: {
    title: "Coupling",
    glyph: "<=>",
    color: C.warn,
    text: "Coupling is how tangled modules are with each other. Loosely coupled code can change one piece without touching the rest.",
    more: "Fewer imports between modules and shorter import chains mean lower coupling and easier changes.",
    facts: ["`{repo}`: {edges} import arrows between {components} components.", "Longest import chain in `{repo}`: {depth} hops."],
  },
  component: {
    title: "Component",
    glyph: "[ ]",
    color: C.graph,
    text: "A component is a folder of code with one job. Good projects are built from parts with clear borders.",
    more: "When each component has a single job, you can find bugs faster and swap parts out.",
    facts: ["`{component}` holds {files} files and {loc} lines.", "`{component}`: {loc} lines of code."],
  },
  cascade: {
    title: "Cascading failure",
    glyph: ">>>",
    color: C.hot,
    text: "When a module breaks, everything that imports it can break too, like dominoes.",
    more: "That's why high fan-in modules need tests: one bug there cascades through every dependent.",
    facts: ["`{component}` broke, and {dependents} components depend on it.", "`{component}` is imported by {fanIn} components, which is why the hit cascaded."],
  },
  "dead-code": {
    title: "Dead code",
    glyph: "DEAD",
    color: "#9aa7b4",
    text: "Dead code is code that nothing uses anymore. It still has to be read, compiled and maintained.",
    more: "Deleting unused code is one of the safest refactors, and version control keeps a copy if you ever need it back.",
    facts: ["`{file}` ({loc} lines) just got deleted, and nothing broke.", "`{file}` went down."],
  },
  "tech-debt": {
    title: "Tech debt",
    glyph: "TODO",
    color: C.warn,
    text: "Every quick hack and TODO is a loan against the future. Like money debt, it piles up interest: slower changes and more bugs.",
    more: "Teams pay it down a little at a time by fixing TODOs and cleaning up hacks when they touch that code.",
    facts: ["`{repo}` carries {todos} TODO/FIXME/HACK notes.", "Real TODO: \"{todo}\"", "{todos} TODOs hatched into bugs."],
  },
  "test-coverage": {
    title: "Tests",
    glyph: "TEST",
    color: C.good,
    text: "Tests are code that checks your code. They catch bugs before your users do, so they act as armor.",
    more: "Start by testing the code most others depend on (high fan-in). That's where a bug hurts the most.",
    facts: ["Tests are {testPct}% of the files in `{repo}`.", "`{player}` has armor {grade}: {signal}."],
  },
  recursion: {
    title: "Recursion",
    glyph: "F(F)",
    color: C.mem,
    text: "A recursive function calls itself on a smaller problem until it hits a base case.",
    more: "Every recursion needs a stopping rule. Without one, it runs until the stack overflows.",
    facts: ["Incoming: `{attack}`."],
  },
  "stack-overflow": {
    title: "Stack overflow",
    glyph: "SO!",
    color: C.hot,
    text: "Each function call stacks a frame in memory. Call too deep, like endless recursion, and the stack overflows and the program crashes.",
    more: "The fix is a proper base case, or turning deep recursion into a loop.",
    facts: ["Incoming: `{attack}`."],
  },
  "race-condition": {
    title: "Race condition",
    glyph: "RACE",
    color: C.warn,
    text: "Two things run at once and touch the same data. Whoever wins the race decides the result, and that changes run to run.",
    more: "Locks, queues and immutable data stop races. These bugs are hard to reproduce, so they're nasty.",
    facts: ["Incoming: `{attack}`."],
  },
  "memory-leak": {
    title: "Memory leak",
    glyph: "LEAK",
    color: C.mem,
    text: "A leak is memory the program grabs and never gives back. It grows and grows until something falls over.",
    more: "Forgotten listeners, caches with no limit and global lists are classic leaks.",
    facts: ["Incoming: `{attack}`."],
  },
  "merge-conflict": {
    title: "Merge conflict",
    glyph: "<<<",
    color: C.git,
    text: "Two people changed the same lines in different ways. Git can't guess who's right, so a human must choose.",
    more: "Small, frequent commits and talking to teammates keep conflicts rare and small.",
    facts: ["Incoming: `{attack}`."],
  },
  "force-push": {
    title: "Force push",
    glyph: "-f",
    color: C.git,
    text: "`git push --force` overwrites history on the server, and teammates' commits can vanish.",
    more: "Use `--force-with-lease`, and never force-push a shared branch like main.",
    facts: ["Incoming: `{attack}`."],
  },
  "dependency-hell": {
    title: "Dependency hell",
    glyph: "v?",
    color: C.warn,
    text: "Package A needs lib v1, package B needs lib v2, and you can't have both. Welcome to dependency hell.",
    more: "Lockfiles, fewer dependencies and regular updates keep you out of it.",
    facts: ["Incoming: `{attack}`."],
  },
  "null-pointer": {
    title: "Null pointer",
    glyph: "NUL",
    color: C.hot,
    text: "Code follows a reference that points at nothing, so null crashes the program.",
    more: "Check for missing values, or use types that force you to (Option, Maybe, strict null checks).",
    facts: ["Incoming: `{attack}`."],
  },
  "infinite-loop": {
    title: "Infinite loop",
    glyph: "LOOP",
    color: C.warn,
    text: "A loop whose exit condition never becomes true runs forever and freezes the program.",
    more: "Make sure something inside the loop moves toward the exit condition every time.",
    facts: ["Incoming: `{attack}`."],
  },
  refactor: {
    title: "Refactoring",
    glyph: "REF",
    color: C.good,
    text: "Refactoring changes how code is organized without changing what it does: cleaner, smaller, easier to read.",
    more: "Tests make refactoring safe. They prove the behavior stayed the same.",
    facts: ["`{file}` ({loc} lines) got refactored away.", "Tip for `{player}`: {tip}"],
  },
  "bus-factor": {
    title: "Bus factor",
    glyph: "BUS",
    color: C.oss,
    text: "The bus factor is how many people would have to disappear before nobody understands a piece of code. A factor of 1 is fragile.",
    more: "Documentation, code review and new contributors raise the bus factor.",
    facts: ["`{component}` has only {maintainers} maintainer(s): @{maintainer}.", "`{repo}` bus factor: {busFactor}."],
  },
  "good-first-issue": {
    title: "Good first issue",
    glyph: "GFI",
    color: C.good,
    text: "Open-source projects label easy starter tasks `good first issue`. They're a real way to make your first contribution.",
    more: "Read CONTRIBUTING.md, comment on the issue to claim it, then open a small pull request.",
    facts: ["Open now: #{issue} \"{title}\".", "`{component}` has {count} beginner-friendly issues."],
  },
  "open-source-maintenance": {
    title: "Open-source maintenance",
    glyph: "OSS",
    color: C.oss,
    text: "Much of the world's software rests on projects kept alive by a handful of volunteers. The xz and Log4Shell incidents both started in projects like that.",
    more: "Fixing docs, triaging issues and reviewing PRs all help. Maintenance isn't only writing new code.",
    facts: ["`{repo}` is maintained by {contributors} contributors."],
  },
  "supply-chain": {
    title: "Supply chain",
    glyph: "DEPS",
    color: C.warn,
    text: "Your app ships every dependency, and every dependency's dependencies. One weak link affects everyone downstream.",
    more: "Pin versions, review new dependencies, and update when advisories land.",
    facts: ["`{repo}` declares {deps} dependencies.", "`{pkg}` is a dependency of `{repo}`."],
  },
  vulnerability: {
    title: "Known vulnerability",
    glyph: "CVE",
    color: C.hot,
    text: "A public advisory says a version of a package has a security hole. Usually the fix is simply upgrading.",
    more: "We only read public advisory databases (OSV.dev). Nothing gets scanned or attacked.",
    facts: ["{id} in `{pkg}`: upgrade to ≥ {fixed}.", "{id} affects `{pkg}`."],
  },
  "code-quality": {
    title: "Code quality = your stats",
    glyph: "A+",
    color: C.good,
    text: "In class mode your hero's stats come from how your code is built, not luck. Every grade has a real reason and a tip to raise it.",
    more: "Tests give armor, modular code gives speed, cohesive functions hit harder, docs refill energy, and loops and TODOs make you weak.",
    facts: ["`{player}`'s best grade: {stat} {grade} ({signal}).", "`{player}` is weakest at {stat} ({grade}). Tip: {tip}"],
  },
  modularity: {
    title: "Modularity",
    glyph: "MOD",
    color: C.graph,
    text: "Modular code is split into small parts that barely need each other, so each is quick to change. Here, modular code makes your hero fast.",
    more: "Keep import chains short and let each module import only what it needs.",
    facts: ["`{player}` speed {grade}: {signal}.", "Tip for `{player}`: {tip}"],
  },
  cohesion: {
    title: "Cohesion",
    glyph: "{ }",
    color: C.good,
    text: "Cohesive code keeps related things together, with functions that do one job and are short enough to read. Focused code hits harder.",
    more: "If a function needs a scroll bar, it probably wants to be three functions.",
    facts: ["`{player}` damage {grade}: {signal}.", "Tip for `{player}`: {tip}"],
  },
  documentation: {
    title: "Documentation",
    glyph: "DOC",
    color: C.oss,
    text: "Comments and a README let the next person (often future you) understand the code without guessing. Docs recharge your energy.",
    more: "A good README says what the project does, how to run it, and how to help.",
    facts: ["`{player}` energy {grade}: {signal}.", "Tip for `{player}`: {tip}"],
  },
  "code-size": {
    title: "Project size",
    glyph: "LOC",
    color: C.graph,
    text: "More code means more to hit before you go down, but huge isn't automatically better. Size is capped so nobody becomes a tank.",
    more: "Lines of code measure effort, not quality. Deleting code is often an improvement!",
    facts: ["`{player}` hp {grade}: {signal}."],
  },
};

export const ALL_CONCEPTS = Object.keys(CONCEPTS) as EduConcept[];

export function conceptInfo(c: string): ConceptInfo {
  return (CONCEPTS as Record<string, ConceptInfo>)[c] ?? {
    title: c.replace(/-/g, " "),
    glyph: "?",
    color: C.graph,
    text: "",
    more: "",
    facts: [],
  };
}

// ---------- boss attacks → concepts (battle-style matches and the earlier boss-based edu) ----------

export const ATTACK_KIND_CONCEPT: Record<BossAttackKind, EduConcept> = {
  ring: "infinite-loop",
  spiral: "recursion",
  fan: "null-pointer",
  laser: "dependency-graph",
  slam: "stack-overflow",
  charge: "force-push",
  summon: "dependency-hell",
  cascade: "merge-conflict",
};

const NAME_KEYWORDS: [RegExp, EduConcept][] = [
  [/stack ?overflow/i, "stack-overflow"],
  [/recurs/i, "recursion"],
  [/while ?\(true\)|infinite|loop/i, "infinite-loop"],
  [/race|thread|async|await|goroutine|mutex/i, "race-condition"],
  [/leak|malloc|heap|garbage/i, "memory-leak"],
  [/merge|conflict|rebase/i, "merge-conflict"],
  [/force|push -f|--force/i, "force-push"],
  [/npm install|pip install|cargo|depend|node_modules|version/i, "dependency-hell"],
  [/null|nil|none|undefined|segfault|throw/i, "null-pointer"],
  [/todo|fixme|hack/i, "tech-debt"],
  [/cascade|domino/i, "cascade"],
];

/** Concept an attack teaches: name keywords win (they're more specific), then the attack kind. */
export function conceptForAttack(a: { kind?: string; name?: string }): EduConcept | null {
  for (const [re, c] of NAME_KEYWORDS) if (a.name && re.test(a.name)) return c;
  return (a.kind && (ATTACK_KIND_CONCEPT as Record<string, EduConcept>)[a.kind]) || null;
}

// ---------- quality stats → concepts / labels ----------

export const STAT_CONCEPT: Record<QualityStat["stat"], EduConcept> = {
  hp: "code-size",
  armor: "test-coverage",
  speed: "modularity",
  damage: "cohesion",
  energy: "documentation",
  regen: "documentation",
  weakness: "tech-debt",
};

/** Game stat → (code vocabulary, plain word). Matches the HUD's labels. */
export const STAT_LABEL: Record<QualityStat["stat"], { code: string; plain: string; from: string }> = {
  hp: { code: "hp", plain: "health", from: "project size" },
  armor: { code: "try{}", plain: "armor", from: "tests" },
  speed: { code: "speed", plain: "speed", from: "modularity" },
  damage: { code: "dmg", plain: "damage", from: "cohesion" },
  energy: { code: "RAM", plain: "energy", from: "documentation" },
  regen: { code: "gc()", plain: "regen", from: "documentation" },
  weakness: { code: "debt", plain: "tech-debt penalty", from: "import loops + TODOs" },
};

// ---------- fact templates ----------

const fmt = (v: string | number) => (typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString("en-US") : String(Math.round(v * 10) / 10)) : v);

/** Fill `{key}` placeholders; returns null if any key is missing. */
export function fill(tpl: string, facts: Facts): string | null {
  let ok = true;
  const out = tpl.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = facts[k];
    if (v === undefined || v === null || v === "") {
      ok = false;
      return "";
    }
    return String(fmt(v));
  });
  return ok ? out : null;
}

/** Fallback for any concept when the facts carry a player's report-card line. */
const REPORT_LINE = ["`{player}` {stat} {grade}: {signal}. Tip: {tip}", "`{player}` {stat} {grade}: {signal}."];

/** First template of the concept that the facts can fully fill, else null. */
export function factLine(concept: string, facts: Facts | undefined): string | null {
  if (!facts) return null;
  for (const t of [...conceptInfo(concept).facts, ...REPORT_LINE]) {
    const s = fill(t, facts);
    if (s) return s;
  }
  return null;
}
