// Boss variety (claude-boss; pure, no DOM): deterministic look choices from repo traits, on top of the sim's archetype.
//   form     body plan drawn on the archetype's anchors (hitboxes / heart / mouths never move: shared/kaiju-anatomy.ts)
//   element  hide + crystal + glow palette and FX tint, from the arena theme family + component keywords
//   variants fin style, horns, tail tip, wing style, per-limb part kind (from the limb's component name)
// Same kit -> same look. Nothing here feeds the sim.
import type { BossKit } from "../../../shared/types.ts";
import { bossArchetype } from "../../../shared/kaiju-anatomy.ts";

/** Body plans. kaiju/mecha/dragon/abyssal are the archetypes' classic plans; the rest are alternates on the same anchors. */
export type BossForm = "kaiju" | "golem" | "insectoid" | "eye" | "mecha" | "ironclad" | "dragon" | "naga" | "abyssal" | "wyrm";
export type ElementId = "jade" | "molten" | "neon" | "sunset" | "arcane" | "frost" | "chrome" | "verdant" | "toxic" | "phosphor" | "storm" | "void" | "gilded";
export type FinStyle = "crystal" | "blade" | "plate" | "needle";
export type HornStyle = "none" | "brow" | "nose" | "crown" | "swept";
export type TailTip = "curl" | "club" | "spade" | "blade";
export type WingStyle = "membrane" | "feather" | "crystal";
/** what grows on a limb, from its component's name */
export type LimbPart = "gears" | "servers" | "crystals" | "moss" | "cables" | "plain";

export interface FinColors { lo: string; mid: string; hi: string; glow: string }
export interface ElementDef {
  id: ElementId;
  label: string;
  /** hide mid tone, darker secondary (plates / limbs), underside */
  hide: string; hide2: string; belly: string;
  /** calm fins / crystals, and charged (breath wind-up) fins */
  crystal: FinColors; lit: FinColors;
  /** breath / beam / sparks (the element's FX tint) */
  breath: string;
  eye: string; pupil: string;
  /** calm vein / crack glow */
  vein: string;
}

const EL = (id: ElementId, label: string, hide: string, hide2: string, belly: string, crystal: string[], lit: string[], breath: string, eye: string, pupil: string, vein: string): ElementDef =>
  ({ id, label, hide, hide2, belly, crystal: { lo: crystal[0], mid: crystal[1], hi: crystal[2], glow: crystal[3] }, lit: { lo: lit[0], mid: lit[1], hi: lit[2], glow: lit[3] }, breath, eye, pupil, vein });

export const ELEMENTS: Record<ElementId, ElementDef> = {
  // the original kaiju look (refs boss-1/4): dark teal hide, mint crystal fins, cyan breath
  jade: EL("jade", "jade", "#183530", "#0f2420", "#6a8a87", ["#1f8a80", "#4fd2c2", "#c8fff6", "#3ee6d6"], ["#7fe8ff", "#d8fbff", "#ffffff", "#3ee6ff"], "#3ee6ff", "#ff2a3a", "#3ee6ff", "#2ee6ff"),
  molten: EL("molten", "molten", "#3a1a14", "#24100c", "#7a3420", ["#7a1a06", "#ff5a12", "#ffe07a", "#ff6a1a"], ["#ffb040", "#fff0a0", "#ffffff", "#ffb040"], "#ff8a2a", "#ffd23f", "#2a0600", "#ff5a12"),
  neon: EL("neon", "neon", "#1a1238", "#100a24", "#3a2a6a", ["#7a0a7a", "#ff3ad6", "#ffd6fa", "#ff4ae0"], ["#ff9af0", "#fff0fd", "#ffffff", "#ff6af0"], "#ff4ae0", "#3effe0", "#0a0020", "#ff3ad6"),
  sunset: EL("sunset", "sunset", "#3a1630", "#240c1e", "#a0506a", ["#a01a5a", "#ff6a8a", "#ffd8a0", "#ff7a9a"], ["#ffc0a0", "#fff0e0", "#ffffff", "#ffa080"], "#ff8aa8", "#ffd23f", "#2a0010", "#ff6a8a"),
  arcane: EL("arcane", "arcane", "#241a44", "#160f2e", "#4a3a7a", ["#3a1a8a", "#9a6aff", "#ffe9a8", "#a07aff"], ["#d0b0ff", "#fff4d0", "#ffffff", "#c8a0ff"], "#b48aff", "#ffd86a", "#1a0a3a", "#9a6aff"),
  frost: EL("frost", "frost", "#5a7a98", "#3a5674", "#c0d8ea", ["#3a7ab0", "#9ad8ff", "#ffffff", "#9ae0ff"], ["#e0f6ff", "#ffffff", "#ffffff", "#c8f0ff"], "#bfefff", "#e8fbff", "#0a2a4a", "#8ad8ff"),
  chrome: EL("chrome", "chrome", "#8a94a8", "#5a6274", "#c8ccd8", ["#4a5262", "#c8d0e0", "#ffffff", "#a0e8ff"], ["#c0f0ff", "#ffffff", "#ffffff", "#7ad8ff"], "#7ad8ff", "#ff3a3a", "#1a0000", "#6ad0ff"),
  verdant: EL("verdant", "verdant", "#2e4a26", "#1c3018", "#8aa060", ["#2a6a1a", "#7ad84a", "#e8ffb0", "#8aff5a"], ["#d0ff9a", "#fbffe0", "#ffffff", "#b0ff70"], "#a8ff6a", "#ffd23f", "#102a00", "#7ad84a"),
  toxic: EL("toxic", "toxic", "#3a3814", "#24220c", "#6a5a8a", ["#4a6a00", "#c8ff1a", "#f8ffb0", "#b8ff2a"], ["#e8ff8a", "#fdffe0", "#ffffff", "#d8ff4a"], "#c8ff2a", "#c8ff2a", "#1a0a1a", "#a8ff1a"),
  phosphor: EL("phosphor", "phosphor", "#0e2216", "#08140c", "#1e4a2a", ["#0a5a2a", "#3aff7a", "#d0ffd8", "#3aff7a"], ["#9affb8", "#efffef", "#ffffff", "#6aff9a"], "#3aff7a", "#3aff7a", "#001a08", "#3aff7a"),
  storm: EL("storm", "storm", "#2a3450", "#1a2034", "#5a6a8a", ["#6a5a10", "#ffe23a", "#fffbd0", "#ffe84a"], ["#fff5a0", "#ffffff", "#ffffff", "#fff07a"], "#fff07a", "#9ae6ff", "#0a1030", "#ffe23a"),
  // the original abyssal look (ref boss-5): near-black crystal with cyan edges
  void: EL("void", "void", "#12101a", "#08070c", "#2a2638", ["#0a0a12", "#2a2838", "#2ee6ff", "#2ee6ff"], ["#7fe8ff", "#d8fbff", "#ffffff", "#2ee6ff"], "#2ee6ff", "#ff2a3a", "#2ee6ff", "#2ee6ff"),
  // the original hydra look (ref boss-2): golden scales
  gilded: EL("gilded", "gilded", "#c49030", "#8a5a10", "#e8c878", ["#8a5a10", "#e0a828", "#fff0a0", "#ffc840"], ["#fff0a0", "#fffbe0", "#ffffff", "#ffd84a"], "#ffd84a", "#ff2a3a", "#2a0a00", "#ffc840"),
};

/** element families per arena theme (task: kernel -> molten, web -> neon, notebook -> arcane, enterprise -> chrome) */
const THEME_ELEMENTS: Record<string, ElementId[]> = {
  kernel: ["molten", "storm", "chrome", "jade"],
  web: ["neon", "sunset", "storm", "jade", "gilded"],
  notebook: ["arcane", "frost", "verdant", "gilded"],
  enterprise: ["chrome", "frost", "gilded", "storm"],
  legacy: ["verdant", "toxic", "molten", "jade"],
  terminal: ["phosphor", "toxic", "void", "jade", "molten"],
};

/** component-name keywords -> element affinity (the biggest components weigh most) */
const KEYWORDS: [RegExp, ElementId[]][] = [
  [/test|spec|fixture|bench|perf/, ["frost", "chrome"]],
  [/compil|parse|lex|regex|glob|template|syntax|ast/, ["arcane", "storm"]],
  [/dom|render|ui|view|css|style|component|attribute|selector|devtools/, ["neon", "sunset"]],
  [/kernel|core|runtime|engine|reconcil|internal|src/, ["molten", "void"]],
  [/db|data|storage|cache|model|orm|reactiv/, ["chrome", "arcane"]],
  [/doc|example|guide|tutorial|solution|exercise|website|hello/, ["verdant", "gilded"]],
  [/cli|print|term|log|console|watch|list|search/, ["phosphor", "toxic"]],
  [/net|http|server|route|binding|codec|api|openapi|security|rag/, ["storm", "neon"]],
  [/util|misc|tool|script|config|dev|root|lib|fp|module/, ["sunset", "toxic"]],
];

const PARTS: [RegExp, LimbPart][] = [
  [/core|engine|runtime|kernel|reconcil|internal|compil/, "gears"],
  [/db|data|storage|cache|server|redis|model|module/, "servers"],
  [/test|spec|fixture|bench|regex|glob|selector|syntax/, "crystals"],
  [/doc|example|guide|solution|exercise|website|hello|tutorial/, "moss"],
  [/net|http|route|binding|codec|api|dom|render|io/, "cables"],
];

function h32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return (h ^ (h >>> 13)) >>> 0;
}
/** 0..1 hash of the repo + a salt (stable across seeds/player counts) */
const pick = (kit: BossKit, salt: string) => h32(kit.repo + "|" + salt) / 4294967296;

export function limbPart(component: string): LimbPart {
  const c = component.toLowerCase();
  for (const [re, p] of PARTS) if (re.test(c)) return p;
  return "plain";
}

export function bossElement(kit: BossKit): ElementDef {
  const fam = THEME_ELEMENTS[kit.theme] ?? THEME_ELEMENTS.terminal;
  const score = new Map<ElementId, number>(fam.map((e, i) => [e, 0.4 - i * 0.05]));
  const n = kit.limbs.length;
  kit.limbs.forEach((l, i) => {
    const c = l.component.toLowerCase(), w = 1 - (i / Math.max(1, n)) * 0.6;
    for (const [re, els] of KEYWORDS) if (re.test(c)) els.forEach((e, k) => score.has(e) && score.set(e, score.get(e)! + w * (k ? 0.5 : 1)));
  });
  const weak = kit.limbs.filter((l) => l.weakPoint).length;
  // repo shape rotates through the family (component count, cycles), so look-alike repos with generic names still split
  const rot = fam[(n + weak * 3) % fam.length];
  score.set(rot, score.get(rot)! + 0.45);
  // dependency cycles feel corrosive / unstable
  for (const e of ["toxic", "void", "neon"] as ElementId[]) if (score.has(e)) score.set(e, score.get(e)! + weak * 0.12);
  // tiny repos run cold; huge ones hot
  if (n <= 3) for (const e of ["frost", "phosphor"] as ElementId[]) if (score.has(e)) score.set(e, score.get(e)! + 0.6);
  // stable per-repo jitter breaks ties (and keeps similar repos apart)
  let best: ElementId = fam[0], bs = -1e9;
  for (const [e, s] of score) { const v = s + pick(kit, "el:" + e) * 1.1; if (v > bs) { bs = v; best = e; } }
  return ELEMENTS[best];
}

export interface BossVariety {
  form: BossForm;
  element: ElementDef;
  fins: FinStyle;
  horns: HornStyle;
  tail: TailTip;
  wing: WingStyle;
  /** per kit limb index */
  parts: LimbPart[];
  /** hide hue jitter in degrees (two bosses of one element still differ) */
  hue: number;
}

const cache = new Map<string, BossVariety>();

export function bossVariety(kit: BossKit): BossVariety {
  const key = kit.repo + "|" + kit.seed + "|" + kit.theme + "|" + kit.archetype + "|" + kit.limbs.map((l) => l.component + (l.weakPoint ? "!" : "")).join(",");
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 100) cache.clear();
  const arch = bossArchetype(kit);
  const n = kit.limbs.length;
  const weak = kit.limbs.filter((l) => l.weakPoint).length;
  const r = (s: string) => pick(kit, s);
  let form: BossForm;
  if (arch === "kaiju") {
    // small repos: a floating eye; otherwise the classic kaiju, a stone golem or an upright insectoid
    if (n <= 3) form = "eye";
    else {
      const comps = kit.limbs.map((l) => l.component.toLowerCase()).join(" ");
      // insectoid: many small functional / test modules; golem: a compact monolith; kaiju: the big classic
      const ins = weak * 0.2 + (/test|spec|fp|util|perf/.test(comps) ? 0.65 : 0) + r("form:ins") * 0.3;
      const gol = (/core|internal|main|src|engine/.test(comps) ? 0.4 : 0) + (n <= 5 ? 0.3 : 0) + r("form:gol") * 0.3;
      const kai = 0.45 + (n >= 7 ? 0.3 : 0) + r("form:kai") * 0.3;
      form = ins >= gol && ins >= kai ? "insectoid" : gol >= kai ? "golem" : "kaiju";
    }
  } else if (arch === "mecha") form = r("form") < 0.5 ? "ironclad" : "mecha";
  else if (arch === "abyssal") form = r("form") < 0.5 ? "wyrm" : "abyssal";
  else form = r("form") < 0.5 ? "naga" : "dragon";
  const FINS: FinStyle[] = ["crystal", "blade", "plate", "needle"];
  const HORNS: HornStyle[] = ["none", "brow", "nose", "crown", "swept"];
  const TAILS: TailTip[] = ["curl", "club", "spade", "blade"];
  const WINGS: WingStyle[] = ["membrane", "feather", "crystal"];
  const v: BossVariety = {
    form,
    element: bossElement(kit),
    fins: form === "mecha" || form === "ironclad" ? (r("fins") < 0.5 ? "blade" : "plate") : FINS[Math.floor(r("fins") * FINS.length)],
    horns: HORNS[Math.floor(r("horns") * HORNS.length)],
    tail: TAILS[Math.floor(r("tail") * TAILS.length)],
    wing: WINGS[Math.floor(r("wing") * WINGS.length)],
    parts: kit.limbs.map((l) => limbPart(l.component)),
    hue: Math.round((r("hue") - 0.5) * 36),
  };
  cache.set(key, v);
  return v;
}
