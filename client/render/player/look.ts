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
}

export interface HeroLook {
  key: string;
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

const lookCache = new Map<string, HeroLook>();

export function lookFor(kit: PlayerKit): HeroLook {
  const d: HeroDesign | undefined = kit.design;
  const key = kit.seed + "|" + kit.weapon + "|" + kit.palette.join(",") + "|" + kit.title +
    (d ? "|" + d.archetype + d.headgear + d.accessory + d.emblem + d.palette.join(",") : "");
  const hit = lookCache.get(key);
  if (hit) return hit;
  const r = rng(kit.seed ^ 0x9e3779b9);
  const cls: HeroClass = (d && d.archetype in DEFAULT_HEADGEAR ? d.archetype : CLASS_OF[kit.weapon]) ?? "ranger";
  const words = (kit.title || "").trim().split(/\s+/);
  const lang = words.length > 1 ? words.slice(0, -1).join(" ") : words[0] || "code";

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
    primary = hslToHex(ph, ps, pl);
    const offs = [150, 180, 210, 40, -40, 120];
    const sh = ph + pick(r, offs) + (r() - 0.5) * 20;
    secondary = hslToHex(sh, 0.6 + r() * 0.25, 0.5 + r() * 0.08);
    accent = hslToHex(ph + 180 + (r() - 0.5) * 60, 0.95, 0.62);
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
  let mug = false, duck = false;
  let emblem = emblemForLang(lang);

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
    key, cls, weapon: kit.weapon, lang, c, hairStyle, headgear, crest, topper, back, mug, duck,
    mask: cls === "rogue" && headgear === "bandana",
    hoodie, stickers: [], emblem,
  };
  const stickerCols = ["#ff5fa2", "#ffd84a", "#54e0ff", "#7dff6a", "#ffffff"];
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) look.stickers.push([Math.floor(r() * 3), Math.floor(r() * 4), pick(r, stickerCols)]);
  if (lookCache.size > 200) lookCache.clear();
  lookCache.set(key, look);
  return look;
}
