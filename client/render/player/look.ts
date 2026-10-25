// PlayerKit -> HeroLook: class silhouette, palette roles and "dev" accessories.
// Driven by kit.design (Gemini art direction) when present, else derived from the seed.
import type { HeroDesign, PlayerKit, WeaponKind } from "../../../shared/types.ts";
import { hexToHsl, hslToHex, light, mix, rng, shade, hashStr } from "./color.ts";
import { glyphBits } from "./font.ts";

export type HeroClass = "knight" | "ranger" | "mage" | "heavy" | "engineer" | "rogue";
/** Base head covering. "hair" = no covering. */
export type Headgear = "helmet" | "hood" | "wizard-hat" | "goggles" | "bandana" | "beanie" | "hair";
/** Extra item perched on top of the headgear. */
export type Topper = "none" | "headphones" | "catears" | "antenna" | "crown";
export type BackItem = "none" | "cape" | "laptop" | "scarf" | "jetpack" | "shield" | "tail";
export type Crest = "plume" | "horns" | "fin" | "none";
/** Syntax crest made of a code glyph, chosen from the repo's real tokens ("" = classic crest). */
export type SyntaxCrest = "" | "{" | "<>" | "#" | "~" | "*";
export type FaceMode = "prompt" | "braces" | "eyes";

export interface SyntaxColors { kw: string; str: string; fn: string; num: string; type: string; plain: string; com: string; bg: string }

export interface HeroColors {
  outline: string;
  primary: string; primaryL: string; primaryD: string;
  secondary: string; secondaryL: string; secondaryD: string;
  accent: string; accentL: string;
  metal: string; metalL: string; metalD: string;
  skin: string; skinD: string;
  hair: string; hairL: string; hairD: string;
  visor: string;
  eye: string; white: string; blush: string;
  cloth: string; clothD: string; boot: string;
  wood: string; woodL: string;
  ring: string; // friendly ground ring
  rim: string;  // light 1px rim around the outline so heroes pop off busy floors
}

/** Small elemental accent picked from the repo's real traits (via the kit's stat profile). */
export type Element = "fire" | "ice" | "electric" | "void" | "nature" | "arcane";
export const ELEMENTS: Record<Element, { c: string; cL: string; d: string }> = {
  fire:     { c: "#ff7a2a", cL: "#ffd25a", d: "#a8320f" },
  ice:      { c: "#7fe6ff", cL: "#e8fbff", d: "#2c78a8" },
  electric: { c: "#ffe94a", cL: "#fffbd0", d: "#b08a10" },
  void:     { c: "#a35cff", cL: "#e2c8ff", d: "#4a1f8a" },
  nature:   { c: "#6dff7a", cL: "#d8ffcf", d: "#1f8a3a" },
  arcane:   { c: "#ff5fd2", cL: "#ffd0f4", d: "#9a1f7c" },
};

/** Seeded gear roll: silhouette variant, armour sets, palette family, pattern, element and weapon skin. */
export interface Gear {
  body: 0 | 1 | 2;                                   // silhouette variant within the class
  shoulders: "plate" | "spiked" | "round" | "mantle" | "none";
  coat: "cape" | "longcoat" | "tabard" | "halfcape" | "none";
  helm: "horned" | "great" | "sallet" | "skull" | "crowned";
  armor: "tinted" | "obsidian" | "ivory" | "gunmetal" | "bronze" | "royal";
  trim: "gold" | "silver" | "primary" | "copper";
  scheme: "complement" | "triad" | "split" | "analog" | "mono";
  pattern: "none" | "stripes" | "circuit" | "runes" | "chevron";
  element: Element;
  wskin: 0 | 1 | 2 | 3;                              // weapon skin: classic, light theme, neon, gilded
}

export interface HeroLook {
  key: string;
  gear: Gear;
  cls: HeroClass;
  weapon: WeaponKind;
  lang: string;
  c: HeroColors;
  hairStyle: number;   // 0 short, 1 spiky, 2 long, 3 ponytail, 4 ahoge
  headgear: Headgear;
  crest: Crest;
  topper: Topper;
  back: BackItem;
  mug: boolean;        // coffee mug in the off hand
  duck: boolean;       // rubber-duck companion floats nearby
  mask: boolean;       // rogue face mask
  hoodie: boolean;
  stickers: [number, number, string][];
  emblem: string[];    // rows of '0'/'1' (3x3 shape or 3x5 / 7x5 glyphs)
  etch: string;        // real token engraved on the weapon ("" when the kit has no code)
  syn: SyntaxColors;   // language syntax-highlight palette (armor stripes, cape code)
  crestGlyph: SyntaxCrest;
  face: FaceMode;      // helmet visor = ">_" prompt, mages = glowing {} eyes
  codeRows: (string | null)[][]; // minimap-style syntax-colored code lines (8 px wide) for capes / laptop screens
  tokens: string[];    // short real tokens (orbiting glyphs, sticker)
  idents: string[];    // real identifiers (stack traces)
  snippet: string;     // one real line of the repo (written on portrait capes)
}

const SYN_BASE: SyntaxColors = { kw: "#c678dd", str: "#98c379", fn: "#61afef", num: "#d19a66", type: "#e5c07b", plain: "#abb2bf", com: "#5c6370", bg: "#1d1f2b" };
const SYN_KW: Record<string, string> = {
  rust: "#ff8f40", python: "#ffd43b", go: "#00c8f0", java: "#f89820", kotlin: "#b07cff", ruby: "#ff5f6d",
  "c++": "#f34b7d", c: "#7fb4ff", "c#": "#9b59f6", swift: "#ff7043", php: "#8892bf", lua: "#6d8cff", haskell: "#a991d4",
};
const KEYWORDS = new Set(("fn let mut const var function def class return if else for while in of import export from pub use impl " +
  "struct enum match async await yield go func package public private static void new this self try catch throw end do " +
  "then lambda val fun type interface trait where loop break continue switch case default nil null None true false").split(" "));

/** Syntax color for one word of real code. */
export function syntaxColor(w: string, syn: SyntaxColors, idents: string[] = []): string {
  return KEYWORDS.has(w) ? syn.kw : /^["'`]/.test(w) ? syn.str : /^\d/.test(w) ? syn.num
    : /^[A-Z]/.test(w) ? syn.type : idents.includes(w) || /\($/.test(w) ? syn.fn : /^(\/\/|#)/.test(w) ? syn.com : syn.plain;
}

/** Turn a real code line (+ identifiers/tokens) into 1px syntax-colored "minimap" rows, 8px wide. */
function buildCodeRows(snippet: string, idents: string[], toks: string[], syn: SyntaxColors): (string | null)[][] {
  const W = 8;
  const words: string[] = [];
  const src = [snippet, ...idents.slice(0, 6).map((i) => i + "()"), ...toks.slice(0, 4), snippet].join(" ¶ ");
  for (const w of src.split(/(\s+|[(){}\[\];,])/)) if (w && w.trim()) words.push(w.trim());
  const rows: (string | null)[][] = [];
  let row: (string | null)[] = new Array(W).fill(null);
  let x = 0, indent = 0;
  const flush = () => { rows.push(row); row = new Array(W).fill(null); x = indent; };
  for (const w of words) {
    if (w === "¶") { flush(); continue; }
    if (w === "{" || w === "(") indent = Math.min(3, indent + 1);
    if (w === "}" || w === ")") indent = Math.max(0, indent - 1);
    const col = syntaxColor(w, syn, idents);
    const len = Math.max(1, Math.min(4, Math.round(w.length / 2)));
    if (x + len > W) flush();
    for (let i = 0; i < len && x + i < W; i++) row[x + i] = col;
    x += len + 1;
    if (rows.length > 20) break;
  }
  flush();
  while (rows.length < 12) rows.push(...rows.slice(0, 12 - rows.length), new Array(W).fill(null));
  return rows;
}

function crestFromTokens(toks: string[], seed: number): SyntaxCrest {
  const all = toks.join(" ");
  if (/[{}]/.test(all)) return "{";
  if (/[<>]/.test(all)) return "<>";
  if (/#/.test(all)) return "#";
  if (/~/.test(all)) return "~";
  if (/[*&]/.test(all)) return "*";
  return (["{", "<>", "#", "~", "*"] as SyntaxCrest[])[seed % 5];
}

export const CLASS_OF: Record<WeaponKind, HeroClass> = {
  blade: "knight",
  smg: "ranger",
  blaster: "ranger",
  staff: "mage",
  cannon: "heavy",
  laser: "engineer",
  shotgun: "rogue",
};

const DEFAULT_HEADGEAR: Record<HeroClass, Headgear> = {
  knight: "helmet", heavy: "helmet", ranger: "hood", mage: "wizard-hat", engineer: "goggles", rogue: "bandana",
};

const SKINS = ["#ffd9b8", "#f6c193", "#e0a274", "#b97a52", "#8d5a3b", "#ffe9d6"];
const HAIRS = ["#2b1d2e", "#5e3a28", "#f0c75e", "#ff86c0", "#5fb4ff", "#eef0ff", "#e0523a", "#5fd17a", "#a07bff", "#ff9a3c"];

const EMBLEMS: Record<string, string> = {
  typescript: "111010010", javascript: "001001111", python: "011010110", rust: "111101111",
  go: "110101011", c: "111100111", "c++": "010111010", cpp: "010111010", "c#": "101111101",
  java: "101111111", kotlin: "101110101", ruby: "111111010", php: "110110100", swift: "011110011",
  shell: "100010101", lua: "010101010", haskell: "100010100", scala: "111111111", zig: "111010111",
  elixir: "010101111", dart: "110111011", r: "110110101", julia: "101000010", jupyter: "101010101",
};

function emblem3(bits: string): string[] {
  return [bits.slice(0, 3), bits.slice(3, 6), bits.slice(6, 9)];
}

function emblemForLang(lang: string): string[] {
  const k = lang.toLowerCase();
  if (EMBLEMS[k]) return emblem3(EMBLEMS[k]);
  const h = hashStr(k || "code");
  const b = (i: number) => ((h >> i) & 1 ? "1" : "0");
  return [b(0) + b(1) + b(0), b(2) + "1" + b(2), b(3) + b(4) + b(3)];
}

/** Design emblem text (1–2 chars) -> pixel rows using the 3x5 font. */
function emblemForText(text: string, fallbackLang: string): string[] {
  const chars = [...text.trim()].slice(0, 2);
  const glyphs = chars.map((ch) => glyphBits(ch)).filter((g): g is string => !!g);
  if (!glyphs.length) return emblemForLang(text || fallbackLang);
  const rows: string[] = [];
  for (let r = 0; r < 5; r++) rows.push(glyphs.map((g) => g.slice(r * 3, r * 3 + 3)).join("0"));
  return rows;
}

function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length) % arr.length];
}

function isHex(s: unknown): s is string {
  return typeof s === "string" && /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(s.trim());
}

/** Clamp a color into a readable range for pixel sprites. */
function vivid(hex: string, minS: number, minL: number, maxL: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.max(minS, s), Math.max(minL, Math.min(maxL, l)));
}

function looksLikeSkin(hex: string): boolean {
  const [h, s, l] = hexToHsl(hex);
  return l > 0.3 && l < 0.92 && ((h <= 50 || h >= 340) && s < 0.85);
}

/** Element from the kit's stat profile (real repo traits: tests -> armour, size -> hp, modularity -> speed ...). */
export function elementFor(kit: PlayerKit, rnd: () => number): Element {
  const dev: [Element, number][] = [
    ["ice", kit.maxArmor / 5 - 1],           // well-tested repos: cold, clean armour
    ["fire", kit.damageMul / 1.0 - 1],      // hard-hitting
    ["electric", kit.speed / 90 - 1],       // fast / modular
    ["void", kit.maxEnergy / 200 - 1],      // big energy pool
    ["nature", kit.maxHp / 7 - 1],          // big, living codebase
  ];
  dev.sort((a, b) => b[1] - a[1]);
  if (dev[0][1] < 0.04) return rnd() < 0.5 ? "arcane" : dev[0][0]; // balanced repos get arcane half the time
  return dev[0][0];
}

function rollGear(kit: PlayerKit, cls: HeroClass, g: () => number): Gear {
  const pk = <T,>(a: readonly T[]): T => a[Math.floor(g() * a.length) % a.length];
  const heavyish = cls === "knight" || cls === "heavy";
  return {
    body: Math.floor(g() * 3) as 0 | 1 | 2,
    shoulders: pk(heavyish ? ["plate", "spiked", "round", "mantle", "plate"] as const : ["plate", "round", "mantle", "none", "spiked"] as const),
    coat: pk(cls === "mage" ? ["cape", "halfcape", "tabard", "cape"] as const : cls === "engineer" ? ["none", "longcoat", "tabard", "halfcape"] as const
      : ["cape", "longcoat", "tabard", "halfcape", "none"] as const),
    helm: pk(["horned", "great", "sallet", "skull", "crowned"] as const),
    armor: pk(["tinted", "obsidian", "ivory", "gunmetal", "bronze", "royal", "tinted"] as const),
    trim: pk(["gold", "silver", "primary", "copper"] as const),
    scheme: pk(["complement", "triad", "split", "analog", "mono"] as const),
    pattern: pk(["none", "stripes", "circuit", "runes", "chevron"] as const),
    element: elementFor(kit, g),
    wskin: Math.floor(g() * 4) as 0 | 1 | 2 | 3,
  };
}

const lookCache = new Map<string, HeroLook>();
const byKit = new WeakMap<PlayerKit, HeroLook>();

export function lookFor(kit: PlayerKit): HeroLook {
  const fast = byKit.get(kit);
  if (fast) return fast;
  const L = lookForKey(kit);
  byKit.set(kit, L);
  return L;
}

function lookForKey(kit: PlayerKit): HeroLook {
  const d: HeroDesign | undefined = kit.design;
  const key = kit.seed + "|" + kit.weapon + "|" + kit.palette.join(",") + "|" + kit.title +
    "|" + [kit.maxHp, kit.maxArmor, kit.maxEnergy, kit.speed, Math.round(kit.damageMul * 100)].join(",") +
    (d ? "|" + d.archetype + d.headgear + d.accessory + d.emblem + d.palette.join(",") : "") +
    (kit.code ? "|" + kit.code.tokens.slice(0, 4).join(" ") + "|" + kit.code.snippet + "|" + (kit.code.weapon?.name ?? "") : "");
  const hit = lookCache.get(key);
  if (hit) return hit;
  const r = rng(kit.seed ^ 0x9e3779b9);
  const cls: HeroClass = (d && d.archetype in DEFAULT_HEADGEAR ? d.archetype : CLASS_OF[kit.weapon]) ?? "ranger";
  const words = (kit.title || "").trim().split(/\s+/);
  const lang = words.length > 1 ? words.slice(0, -1).join(" ") : words[0] || "code";

  const gr = rng((kit.seed ^ 0x51ed27f3) >>> 0);
  const gear = rollGear(kit, cls, gr);

  // ---- palette
  let primary: string, secondary: string, accent: string, skin: string;
  let visor = "";
  const dpal = d?.palette?.filter(isHex).map((h) => (h.startsWith("#") ? h : "#" + h)) ?? [];
  const sk = pick(r, SKINS);
  if (dpal.length >= 4) {
    primary = vivid(dpal[0], 0.35, 0.38, 0.66);
    secondary = vivid(dpal[1], 0.3, 0.35, 0.7);
    accent = vivid(dpal[3], 0.6, 0.5, 0.78);
    if (looksLikeSkin(dpal[2])) skin = dpal[2];
    else { skin = sk; visor = vivid(dpal[2], 0.6, 0.55, 0.8); }
    r(); r(); // keep the rng stream aligned-ish with the fallback
  } else {
    // Primary = most vivid kit palette color; fall back to a seeded hue for dull palettes.
    const pal = kit.palette && kit.palette.length ? kit.palette : ["#3b82f6"];
    let best = pal[0], bestScore = -1;
    for (const col of pal) {
      const [, s, l] = hexToHsl(col);
      const score = s * (1 - Math.abs(l - 0.5) * 1.4);
      if (score > bestScore) { bestScore = score; best = col; }
    }
    let [ph, ps, pl] = hexToHsl(best);
    if (ps < 0.25 || bestScore < 0.12) { ph = kit.seed % 360; ps = 0.65; pl = 0.5; }
    ps = Math.max(0.5, Math.min(0.9, ps));
    pl = Math.max(0.42, Math.min(0.6, pl));
    // same language != same colours: jitter the primary, then derive secondary/accent from a seeded scheme
    ph += (gr() - 0.5) * 26; pl = Math.max(0.4, Math.min(0.64, pl + (gr() - 0.5) * 0.14));
    primary = hslToHex(ph, ps, pl);
    r(); r(); r(); r();
    const sch = gear.scheme;
    const sec = sch === "complement" ? 180 : sch === "triad" ? 120 : sch === "split" ? 150 : sch === "analog" ? 38 : 0;
    const acc = sch === "complement" ? 160 : sch === "triad" ? 240 : sch === "split" ? 210 : sch === "analog" ? -40 : 180;
    secondary = hslToHex(ph + sec, sch === "mono" ? 0.35 : 0.62 + gr() * 0.2, sch === "mono" ? 0.36 : 0.48 + gr() * 0.1);
    accent = hslToHex(ph + acc + (gr() - 0.5) * 20, 0.95, 0.62);
    skin = sk;
  }
  const hair = pick(r, HAIRS);
  const metalBase = mix("#b9c3d6", primary, 0.12);
  const clothBase = cls === "rogue" ? mix("#3a2b3f", primary, 0.2) : mix("#3c3550", primary, 0.25);

  const c: HeroColors = {
    outline: "#120b18",
    primary, primaryL: light(primary), primaryD: shade(primary),
    secondary, secondaryL: light(secondary), secondaryD: shade(secondary),
    accent, accentL: light(accent, 1.4),
    metal: metalBase, metalL: light(metalBase, 1.2), metalD: shade(metalBase, 1.2),
    skin, skinD: shade(skin, 0.6),
    hair, hairL: light(hair, 0.9), hairD: shade(hair, 0.9),
    visor: visor || light(accent, 1.4),
    eye: "#1b1226", white: "#ffffff", blush: "#ff8aa6",
    cloth: clothBase, clothD: shade(clothBase, 0.8), boot: "#2a1f2b",
    wood: "#8a5a34", woodL: "#b98450",
    ring: mix("#5dffb0", primary, 0.25),
    rim: mix(mix("#5dffb0", primary, 0.25), "#ffffff", 0.6),
  };

  // ---- seeded fallback choices (always drawn from rng so seeds stay stable)
  const hairStyle = Math.floor(r() * 5);
  const crest = pick(r, ["plume", "horns", "fin", "plume"] as Crest[]);
  const topChoices: Topper[] =
    cls === "mage" ? ["none", "headphones", "none"] :
    cls === "knight" || cls === "heavy" ? ["none", "antenna", "catears", "none", "crown"] :
    ["none", "headphones", "catears", "antenna", "headphones"];
  let topper = pick(r, topChoices);
  const backChoices: BackItem[] =
    cls === "knight" ? ["cape", "cape", "laptop", "scarf", "shield"] :
    cls === "mage" ? ["cape", "scarf", "none", "laptop", "tail"] :
    cls === "heavy" ? ["laptop", "jetpack", "cape"] :
    ["laptop", "scarf", "cape", "none", "jetpack", "tail"];
  let back = pick(r, backChoices);
  const hoodie = (cls === "ranger" || cls === "engineer" || cls === "rogue") && r() < 0.4;
  let headgear: Headgear = DEFAULT_HEADGEAR[cls];
  {
    // more silhouettes per class: a seeded head (class default stays the most likely, so classes still read)
    const HEADS: Record<HeroClass, Headgear[]> = {
      knight: ["helmet", "helmet", "helmet", "hood"],
      heavy: ["helmet", "helmet", "helmet", "hair"],
      ranger: ["hood", "hood", "helmet", "goggles", "hair", "beanie"],
      mage: ["wizard-hat", "wizard-hat", "hood", "hood"],
      engineer: ["goggles", "goggles", "helmet", "hair"],
      rogue: ["bandana", "hood", "hood", "bandana", "hair"],
    };
    const opts = HEADS[cls];
    headgear = opts[Math.floor(gr() * opts.length) % opts.length];
  }
  let mug = false, duck = false;
  let emblem = emblemForLang(lang);
  // Real code: the repo's most frequent short token (e.g. "=>", "fn", "::") goes on the chest.
  const codeTok = (kit.code?.tokens ?? []).map((x) => (x ?? "").trim()).find((x) => x.length >= 1 && x.length <= 2 && [...x].every((ch) => glyphBits(ch)));
  if (codeTok) emblem = emblemForText(codeTok, lang);

  if (d) {
    switch (d.headgear) {
      case "helmet": case "hood": case "wizard-hat": case "goggles": case "bandana": case "beanie":
        headgear = d.headgear; topper = "none"; break;
      case "cat-ears": headgear = "hair"; topper = "catears"; break;
      case "headphones": headgear = "hair"; topper = "headphones"; break;
      case "crown": headgear = "hair"; topper = "crown"; break;
      case "antenna": headgear = "hair"; topper = "antenna"; break;
      case "none": headgear = "hair"; topper = "none"; break;
    }
    switch (d.accessory) {
      case "cape": back = "cape"; break;
      case "scarf": back = "scarf"; break;
      case "laptop-backpack": back = "laptop"; break;
      case "jetpack": back = "jetpack"; break;
      case "sticker-shield": back = "shield"; break;
      case "tail": back = "tail"; break;
      case "rubber-duck": back = "none"; duck = true; break;
      case "coffee-mug": back = "none"; mug = true; break;
      case "none": back = "none"; break;
    }
    if (d.emblem) emblem = emblemForText(d.emblem, lang);
  }

  const look: HeroLook = {
    key, gear, cls, weapon: kit.weapon, lang, c, hairStyle, headgear, crest, topper, back, mug, duck,
    mask: cls === "rogue" && headgear === "bandana",
    hoodie, stickers: [], emblem,
    etch: (kit.code?.tokens ?? []).map((x) => (x ?? "").trim()).find((x) => x.length > 0) ?? "",
    syn: SYN_BASE, crestGlyph: "", face: "eyes", codeRows: [], tokens: [], idents: [], snippet: "",
  };
  const kwCol = SYN_KW[lang.toLowerCase()];
  look.syn = kwCol ? { ...SYN_BASE, kw: kwCol } : SYN_BASE;
  look.tokens = (kit.code?.tokens ?? []).map((x) => (x ?? "").trim()).filter((x) => x && x.length <= 4 && /^[\x21-\x7e]+$/.test(x)).slice(0, 4);
  look.idents = (kit.code?.identifiers ?? []).filter((x) => x && x.length <= 18).slice(0, 6);
  look.crestGlyph = kit.code ? crestFromTokens(kit.code.tokens ?? [], kit.seed) : "";
  look.face = headgear === "helmet" ? "prompt" : cls === "mage" || headgear === "wizard-hat" ? "braces" : "eyes";
  look.snippet = kit.code?.snippet || `${lang} ${kit.repo}`;
  look.codeRows = buildCodeRows(look.snippet, look.idents, look.tokens, look.syn);
  const stickerCols = ["#ff5fa2", "#ffd84a", "#54e0ff", "#7dff6a", "#ffffff"];
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) look.stickers.push([Math.floor(r() * 3), Math.floor(r() * 4), pick(r, stickerCols)]);
  if (lookCache.size > 200) lookCache.clear();
  lookCache.set(key, look);
  return look;
}
