// Duelyst-style "general" heroes: tall armored silhouettes with real proportions, big pauldrons, horned
// helms, capes, dark armor with glowing accents and rim light. A parametric rig (polygons / tapered limbs /
// ellipses in a 100-unit figure space) is rasterized at any height (32 px in-game, 64 edu, 96 portraits),
// then pixel-art passes add plate seams, bevels, rim light, a 1px outline and glows. Code identity stays:
// cursor visor ">_", syntax-striped armor, the repo token etched on the chest, real code on the cape.
import type { HeroLook } from "./look.ts";
import { hexToHsl, hslToHex, light, mix, shade } from "./color.ts";
import { glyphBits } from "./font.ts";

export type GExpr = "normal" | "blink" | "hurt" | "ko" | "happy";
export interface GFrame { pose: "idle" | "run"; i: number; expr: GExpr }

/** Logical canvas (res 1) — every res r renders at r x these. Feet center = (GX, GFOOT). */
export const GW = 60, GH = 55, GX = 30, GFOOT = 49;
/** Figure height in px at res 1 (feet to helmet top, horns extra). */
export const FIG = 40; // ~1/4 of the kaiju's height on screen (UI-6)

type Pt = [number, number];
type Shape =
  | { t: "poly"; p: Pt[] }
  | { t: "limb"; a: Pt; b: Pt; ra: number; rb: number }
  | { t: "ell"; c: Pt; rx: number; ry: number };
interface Part {
  s: Shape;
  col: string;
  seam?: boolean;   // dark seam where it meets another armor part (plate look)
  flat?: boolean;   // no bevel shading (glows, small details)
  glow?: boolean;   // painted after all passes, never outlined/shaded
  code?: boolean;   // detail line: only drawn from res 2 up (too noisy at 32 px)
  cape?: boolean;   // code-cape surface
}

interface Arch {
  sh: number; pa: number; chest: number; waist: number; hip: number; leg: number; stance: number;
  head: number; robe: boolean; cape: number; knee: number; spikes: number; bulk: number;
}
const ARCH: Record<string, Arch> = {
  knight:   { sh: 19, pa: 13, chest: 16, waist: 10, hip: 12, leg: 5.6, stance: 14, head: 7.2, robe: false, cape: 0.95, knee: 28, spikes: 1, bulk: 1.15 },
  heavy:    { sh: 24, pa: 17, chest: 20, waist: 14, hip: 15, leg: 7.6, stance: 16, head: 6.8, robe: false, cape: 0.55, knee: 25, spikes: 2, bulk: 1.4 },
  ranger:   { sh: 16, pa: 8, chest: 13, waist: 9, hip: 11, leg: 5, stance: 15, head: 7, robe: false, cape: 0.8, knee: 29, spikes: 0, bulk: 1 },
  mage:     { sh: 17, pa: 11, chest: 14, waist: 10, hip: 14, leg: 4.6, stance: 9, head: 7, robe: true, cape: 1, knee: 29, spikes: 1, bulk: 1.05 },
  engineer: { sh: 18, pa: 12, chest: 15, waist: 11, hip: 12, leg: 6, stance: 13, head: 7.6, robe: false, cape: 0, knee: 28, spikes: 0, bulk: 1.2 },
  rogue:    { sh: 15, pa: 8, chest: 12, waist: 8, hip: 10, leg: 4.6, stance: 17, head: 6.6, robe: false, cape: 0.85, knee: 26, spikes: 1, bulk: 0.95 },
};

export interface GPalette {
  armor: string; armorL: string; armorD: string; trim: string; trimL: string; cloth: string; clothL: string; clothD: string;
  glow: string; glowL: string; skin: string; rim: string; outline: string; metal: string; dark: string;
}

export function generalPalette(L: HeroLook): GPalette {
  const c = L.c;
  const [ph, ps] = hexToHsl(c.primary);
  // dark armor tinted by the primary hue; trims in the vivid primary; glows in the accent
  const armor = hslToHex(ph, Math.min(0.42, ps * 0.5 + 0.1), 0.21);
  const [sh2, ss] = hexToHsl(c.secondary);
  const cloth = hslToHex(sh2, Math.min(0.7, ss), 0.3);
  return {
    armor, armorL: light(armor, 1.1), armorD: shade(armor, 0.6),
    trim: mix(c.primaryL, "#ffe39a", 0.35), trimL: mix(c.primaryL, "#fff4cf", 0.55),
    cloth, clothL: light(cloth, 0.8), clothD: shade(cloth, 0.7),
    glow: c.accent, glowL: c.accentL, skin: c.skin,
    rim: mix(c.accentL, "#ffffff", 0.15), outline: "#0a0710", metal: mix("#9aa6bd", armor, 0.35), dark: "#120e1a",
  };
}

// ------------------------------------------------------------------ rig
interface Rig { parts: Part[]; hand: Pt; eye: Pt; capeTop: number }

function rig(L: HeroLook, f: GFrame): Rig {
  const A = ARCH[L.cls] ?? ARCH.knight;
  const P = generalPalette(L);
  const run = f.pose === "run";
  const ph = run ? f.i % 4 : 0;
  const bob = run ? (ph % 2 === 1 ? -3 : 0) : f.i === 1 ? 1.5 : 0;   // breathing / run bob (units)
  const swing = run ? [1, 0, -1, 0][ph] : 0;
  const parts: Part[] = [];
  const add = (s: Shape, col: string, o: Partial<Part> = {}) => parts.push({ s, col, ...o });
  const Y = (v: number) => v + bob;   // upper body moves with bob

  const { sh, pa, chest, waist, hip, leg, stance, knee } = A;
  // ---------- cape (behind everything)
  if (A.cape > 0 && (L.back === "cape" || L.back === "scarf" || L.cls === "mage" || L.cls === "knight" || L.cls === "rogue")) {
    const fl = run ? 9 + (ph % 2) * 4 : f.i === 1 ? 2 : 0;
    const len = 76 * A.cape;
    const top = Y(-80);
    const tatter = L.cls === "rogue";
    const p: Pt[] = [[-sh * 0.6, top], [sh * 0.45, top - 1], [sh * 0.1, top + len * 0.55], [-6 - fl * 0.4, top + len]];
    if (tatter) p.push([-12 - fl * 0.6, top + len - 7], [-17 - fl * 0.7, top + len - 1], [-22 - fl * 0.8, top + len - 9]);
    else p.push([-14 - fl * 0.6, top + len + 2], [-24 - fl, top + len - 3]);
    p.push([-sh - 8 - fl * 0.6, top + len * 0.45], [-sh - 2, top + 6]);
    add({ t: "poly", p }, P.cloth, { cape: true });
  }
  // ---------- back items
  if (L.back === "jetpack" || L.back === "laptop" || L.cls === "engineer") {
    add({ t: "poly", p: [[-sh - 3, Y(-82)], [-sh + 6, Y(-84)], [-sh + 6, Y(-58)], [-sh - 4, Y(-60)]] }, P.metal, { seam: true });
    add({ t: "ell", c: [-sh - 1, Y(-74)], rx: 2.2, ry: 2.2 }, P.glow, { glow: true });
  }
  if (L.back === "shield") add({ t: "ell", c: [-sh - 4, Y(-64)], rx: 10, ry: 13 }, P.trim, { seam: true });

  // ---------- back arm
  const bsh: Pt = [-sh + 3, Y(-76)], bel: Pt = [-sh - 3 - swing * 2, Y(-61)], bhd: Pt = [-sh - 1 - swing * 3, Y(-48)];
  add({ t: "limb", a: bsh, b: bel, ra: 4.6 * A.bulk, rb: 3.8 * A.bulk }, P.armorD, { seam: true });
  add({ t: "limb", a: bel, b: bhd, ra: 4.2 * A.bulk, rb: 4 * A.bulk }, P.armorD, { seam: true });

  // ---------- legs (hidden by robes)
  const legSwing = run ? [10, 0, -10, 0][ph] : 0;
  const lift = run ? [0, 4, 0, 4][ph] : 0;
  const bHip: Pt = [-hip * 0.45, Y(-48)], fHip: Pt = [hip * 0.4, Y(-48)];
  const bKnee: Pt = [-stance * 0.6 - legSwing * 0.5, -knee - (ph === 3 ? lift : 0)], fKnee: Pt = [stance * 0.55 + 2 + legSwing * 0.5, -knee - (ph === 1 ? lift : 0)];
  const bAnk: Pt = [-stance - legSwing, -5 - (ph === 3 ? lift * 1.5 : 0)], fAnk: Pt = [stance * 0.85 + legSwing, -5 - (ph === 1 ? lift * 1.5 : 0)];
  if (!A.robe) {
    add({ t: "limb", a: bHip, b: bKnee, ra: leg * 1.1, rb: leg * 0.9 }, P.armorD, { seam: true });
    add({ t: "limb", a: bKnee, b: bAnk, ra: leg * 0.9, rb: leg * 0.8 }, P.armorD, { seam: true });
    add({ t: "poly", p: [[bAnk[0] - leg, bAnk[1] - 2], [bAnk[0] + leg, bAnk[1] - 2], [bAnk[0] + leg * 1.8, bAnk[1] + 5], [bAnk[0] - leg * 1.1, bAnk[1] + 5]] }, P.dark, { seam: true });
    add({ t: "limb", a: fHip, b: fKnee, ra: leg * 1.15, rb: leg * 0.95 }, P.armor, { seam: true });
    add({ t: "limb", a: fKnee, b: fAnk, ra: leg * 0.95, rb: leg * 0.85 }, P.armor, { seam: true });
    add({ t: "poly", p: [[fAnk[0] - leg, fAnk[1] - 2], [fAnk[0] + leg, fAnk[1] - 2], [fAnk[0] + leg * 2, fAnk[1] + 5], [fAnk[0] - leg * 1.1, fAnk[1] + 5]] }, P.dark, { seam: true });
    // greave glow seams (front leg) + knee guards (trim)
    add({ t: "limb", a: [fKnee[0] + 1.5, fKnee[1] + 4], b: [fAnk[0] + 1.2, fAnk[1] - 3], ra: 0.7, rb: 0.7 }, P.glow, { flat: true, code: true });
    const kneeG = (k: Pt, c: string) => add({ t: "poly", p: [[k[0] - leg * 0.9, k[1]], [k[0] + 1, k[1] - leg * 1.2], [k[0] + leg * 1.3, k[1] + 0.5], [k[0] + 1, k[1] + leg * 1.1]] }, c, { seam: true });
    kneeG(fKnee, P.trim);
    kneeG(bKnee, shade(P.trim, 0.5));
    // tassets (plate skirt)
    add({ t: "poly", p: [[-hip - 1, Y(-54)], [hip + 1, Y(-54)], [hip + 2, Y(-40)], [3, Y(-43)], [-2, Y(-38)], [-hip - 2, Y(-41)]] }, P.armor, { seam: true });
  } else {
    const fl = run ? 4 : 0;
    add({ t: "poly", p: [[-waist - 1, Y(-58)], [waist + 1, Y(-58)], [hip + 9 + fl, -1], [hip * 0.3, 1], [-hip * 0.5, -2], [-hip - 10 - fl, 0]] }, P.cloth, { seam: true });
    add({ t: "poly", p: [[-2, Y(-56)], [4, Y(-56)], [8, 0], [-5, 0]] }, P.trim, { seam: true });      // robe front panel
  }

  // ---------- torso
  add({ t: "poly", p: [[-chest - 1, Y(-79)], [chest + 1, Y(-79)], [chest, Y(-67)], [waist + 1, Y(-55)], [-waist - 1, Y(-55)], [-chest, Y(-67)]] }, P.armorD, { seam: true });
  add({ t: "poly", p: [[-chest + 2, Y(-78)], [chest - 1, Y(-78)], [chest - 3, Y(-65)], [1, Y(-60)], [-chest + 4, Y(-65)]] }, P.armor, { seam: true });
  add({ t: "poly", p: [[-waist - 2, Y(-58)], [waist + 2, Y(-58)], [waist + 2, Y(-53)], [-waist - 2, Y(-53)]] }, P.trim, { seam: true });   // belt
  // code-etched armor: glowing syntax-highlighted "lines" across the chest plate (Duelyst glow seams)
  const syn = L.syn;
  [[syn.kw, -chest + 5, -chest + 11, -74], [syn.fn, -chest + 7, chest - 6, -70.5], [syn.str, -chest + 6, 2, -67]].forEach(([c, x0, x1, yy]) =>
    add({ t: "poly", p: [[x0 as number, Y((yy as number) - 0.7)], [x1 as number, Y((yy as number) - 0.7)], [x1 as number, Y((yy as number) + 0.7)], [x0 as number, Y((yy as number) + 0.7)]] }, c as string, { flat: true, code: true }));
  // ---------- head (+ gorget)
  const hc: Pt = [1.5, Y(-89)];
  add({ t: "ell", c: [1, Y(-81)], rx: A.head * 0.9, ry: 3.4 }, P.armorD, { seam: true });
  paintHead(add, L, A, P, hc, f.expr);
  // ---------- pauldrons (back then front), spikes
  // angular layered pauldrons (back one darker), each with a gilded lip
  const pauldron = (cx: number, dir: number, body: string, lip: string) => {
    const q = (dx: number, dy: number): Pt => [cx + dx * dir, Y(dy)];
    add({ t: "poly", p: [q(-pa * 0.55, -71), q(pa * 0.95, -70), q(pa * 0.85, -64), q(-pa * 0.25, -65)] }, shade(body, 0.3), { seam: true });          // lower lame
    add({ t: "poly", p: [q(-pa * 0.9, -79), q(-pa * 0.2, -86), q(pa * 0.7, -85), q(pa * 1.1, -78), q(pa * 1.0, -71), q(-pa * 0.7, -72)] }, body, { seam: true }); // main plate
    add({ t: "poly", p: [q(-pa * 0.7, -73.5), q(pa * 1.02, -72.5), q(pa * 1.0, -70.5), q(-pa * 0.75, -71.2)] }, lip, { seam: true });                     // lip
  };
  pauldron(-sh + 1, -1, P.armorD, shade(P.trim, 0.35));
  pauldron(sh - 1, 1, P.armor, P.trim);
  if (A.spikes) {
    for (let k = 0; k < A.spikes; k++) {
      const sx = sh - 2 + k * 5;
      add({ t: "poly", p: [[sx - 2.5, Y(-82)], [sx + 2.5, Y(-82)], [sx + 4, Y(-95 + k * 3)]] }, P.trimL, { seam: true });
      add({ t: "poly", p: [[-sh - 1 - k * 4, Y(-82)], [-sh + 4 - k * 4, Y(-83)], [-sh - 5 - k * 4, Y(-94 + k * 3)]] }, shade(P.trim, 0.3), { seam: true });
    }
  }
  // ---------- front arm (holds the weapon)
  const fsh: Pt = [sh - 2, Y(-75)], fel: Pt = [sh + 5 + swing, Y(-62)], fhd: Pt = [sh + 4 + swing, Y(-52)];
  add({ t: "limb", a: fsh, b: fel, ra: 4.8 * A.bulk, rb: 4 * A.bulk }, P.armor, { seam: true });
  add({ t: "limb", a: fel, b: fhd, ra: 4.6 * A.bulk, rb: 4.4 * A.bulk }, P.armorL, { seam: true });
  add({ t: "ell", c: [fel[0] + 0.5, fel[1] + 4], rx: 3.2 * A.bulk, ry: 2 }, P.trim, { seam: true }); // vambrace band
  // ---------- glows: chest core, belt gem, gauntlet rune
  add({ t: "ell", c: [2, Y(-71)], rx: 2.4, ry: 2.4 }, P.glowL, { glow: true });
  add({ t: "ell", c: [1, Y(-55.5)], rx: 1.6, ry: 1.4 }, P.glow, { glow: true });
  return { parts, hand: fhd, eye: [hc[0] + 3, hc[1]], capeTop: Y(-80) };
}

type Add = (s: Shape, col: string, o?: Partial<Part>) => void;

function paintHead(add: Add, L: HeroLook, A: Arch, P: GPalette, hc: Pt, e: GExpr) {
  const r = A.head, [cx, cy] = hc;
  const eyeCol = e === "hurt" || e === "ko" ? "#ff4a5a" : P.glowL;
  const visor = (y: number, x0: number, x1: number) => {
    add({ t: "poly", p: [[x0, y - 1.6], [x1, y - 1.6], [x1, y + 1.6], [x0, y + 1.6]] }, "#07050b", { flat: true });
    if (e !== "blink") add({ t: "poly", p: [[x0 + 1, y - 0.9], [x1 - 0.5, y - 0.9], [x1 - 0.5, y + 0.9], [x0 + 1, y + 0.9]] }, eyeCol, { glow: true });
  };
  const horns = (big: number, col: string) => {
    add({ t: "poly", p: [[cx - r * 0.7, cy - r * 0.6], [cx - r * 0.2, cy - r * 0.9], [cx - r * 1.4, cy - r * 2.6 * big], [cx - r * 1.6, cy - r * 1.7 * big]] }, shade(col, 0.4), { seam: true });
    add({ t: "poly", p: [[cx + r * 0.3, cy - r * 0.9], [cx + r * 0.8, cy - r * 0.6], [cx + r * 1.9, cy - r * 1.9 * big], [cx + r * 1.5, cy - r * 2.8 * big]] }, col, { seam: true });
  };
  switch (L.headgear) {
    case "helmet": {
      const heavy = L.cls === "heavy";
      add({ t: "ell", c: [cx, cy], rx: r * (heavy ? 1.15 : 1), ry: r * 1.12 }, P.armor, { seam: true });
      add({ t: "poly", p: [[cx - r * 0.2, cy - r * 1.1], [cx + r * 0.25, cy - r * 1.1], [cx + r * 0.25, cy + r * 0.9], [cx - r * 0.2, cy + r * 0.9]] }, P.trim, { seam: true }); // center ridge
      visor(cy + 0.5, cx - r * 0.2, cx + r * 1.05);
      if (L.crest === "plume" && !L.crestGlyph) {
        add({ t: "poly", p: [[cx - r * 0.3, cy - r * 1.05], [cx + r * 0.3, cy - r * 1.1], [cx - r * 1.2, cy - r * 2.2], [cx - r * 2.6, cy - r * 0.6]] }, P.cloth, { seam: true });
      } else if (L.crest === "fin" && !L.crestGlyph) {
        add({ t: "poly", p: [[cx - r * 0.6, cy - r * 1.0], [cx + r * 0.5, cy - r * 1.05], [cx, cy - r * 2.4]] }, P.trimL, { seam: true });
      } else horns(heavy ? 0.85 : 1, P.trimL);
      break;
    }
    case "hood": {
      add({ t: "poly", p: [[cx - r * 1.1, cy + r * 1.1], [cx - r * 1.25, cy - r * 0.4], [cx - r * 0.2, cy - r * 1.6], [cx + r * 0.9, cy - r * 1.0], [cx + r * 1.2, cy + r * 0.2], [cx + r * 0.9, cy + r * 1.2]] }, P.cloth, { seam: true });
      add({ t: "ell", c: [cx + r * 0.35, cy + r * 0.1], rx: r * 0.62, ry: r * 0.75 }, "#0d0a14", { flat: true });  // shadowed face
      if (e !== "blink") { add({ t: "ell", c: [cx + r * 0.15, cy], rx: 0.9, ry: 0.8 }, eyeCol, { glow: true }); add({ t: "ell", c: [cx + r * 0.7, cy], rx: 0.9, ry: 0.8 }, eyeCol, { glow: true }); }
      add({ t: "poly", p: [[cx - r * 0.2, cy + r * 0.45], [cx + r * 1.05, cy + r * 0.45], [cx + r * 0.9, cy + r * 1.1], [cx - r * 0.1, cy + r * 1.1]] }, P.armorD, { seam: true }); // mask
      if (L.cls === "rogue") horns(0.75, P.trimL);
      break;
    }
    case "wizard-hat": {
      add({ t: "ell", c: [cx, cy], rx: r * 0.95, ry: r * 1.05 }, "#0d0a14", { flat: true });
      if (e !== "blink") { add({ t: "ell", c: [cx + r * 0.1, cy + 0.5], rx: 1, ry: 0.8 }, eyeCol, { glow: true }); add({ t: "ell", c: [cx + r * 0.7, cy + 0.5], rx: 1, ry: 0.8 }, eyeCol, { glow: true }); }
      add({ t: "poly", p: [[cx - r * 2, cy - r * 0.55], [cx + r * 2.1, cy - r * 0.75], [cx + r * 1.5, cy - r * 0.2], [cx - r * 1.6, cy - r * 0.05]] }, P.cloth, { seam: true });  // brim
      add({ t: "poly", p: [[cx - r * 1.1, cy - r * 0.6], [cx + r * 1.2, cy - r * 0.7], [cx + r * 0.2, cy - r * 2.2], [cx - r * 1.6, cy - r * 3.3], [cx - r * 0.6, cy - r * 1.9]] }, P.cloth, { seam: true });
      add({ t: "poly", p: [[cx - r * 1.05, cy - r * 0.95], [cx + r * 1.0, cy - r * 1.0], [cx + r * 0.9, cy - r * 0.7], [cx - r * 1.0, cy - r * 0.6]] }, P.trim, { seam: true }); // band
      add({ t: "ell", c: [cx - r * 1.55, cy - r * 3.25], rx: 1.4, ry: 1.4 }, P.glowL, { glow: true });
      break;
    }
    default: { // face visible: hair / goggles / bandana / beanie + toppers
      add({ t: "ell", c: [cx, cy], rx: r * 0.92, ry: r * 1.05 }, P.skin, { seam: true });
      add({ t: "poly", p: [[cx - r * 1.05, cy + r * 0.2], [cx - r * 1.0, cy - r * 0.7], [cx - r * 0.2, cy - r * 1.25], [cx + r * 0.9, cy - r * 0.9], [cx + r * 1.0, cy - r * 0.3], [cx + r * 0.1, cy - r * 0.5], [cx - r * 0.5, cy + r * 0.6]] }, L.c.hair, { seam: true });
      if (e === "ko") {
        add({ t: "poly", p: [[cx + r * 0.1, cy - 0.3], [cx + r * 0.9, cy - 0.3], [cx + r * 0.9, cy + 0.6], [cx + r * 0.1, cy + 0.6]] }, "#ff4a5a", { glow: true });
      } else if (e !== "blink") {
        add({ t: "ell", c: [cx + r * 0.2, cy + 0.6], rx: 0.9, ry: 1 }, L.headgear === "goggles" ? P.glowL : "#1b1226", { flat: true });
        add({ t: "ell", c: [cx + r * 0.75, cy + 0.6], rx: 0.9, ry: 1 }, L.headgear === "goggles" ? P.glowL : "#1b1226", { flat: true });
      }
      if (L.headgear === "goggles") add({ t: "poly", p: [[cx - r, cy - r * 0.35], [cx + r, cy - r * 0.35], [cx + r, cy + r * 0.0], [cx - r, cy + r * 0.0]] }, P.dark, { flat: true });
      if (L.headgear === "bandana" || L.mask) add({ t: "poly", p: [[cx - r * 0.3, cy + r * 0.4], [cx + r * 1.0, cy + r * 0.4], [cx + r * 0.8, cy + r * 1.05], [cx - r * 0.2, cy + r * 1.05]] }, P.armorD, { seam: true });
      if (L.headgear === "beanie") add({ t: "ell", c: [cx, cy - r * 0.7], rx: r * 1.02, ry: r * 0.6 }, P.cloth, { seam: true });
      if (L.topper === "crown") add({ t: "poly", p: [[cx - r * 0.8, cy - r * 0.9], [cx + r * 0.8, cy - r * 0.9], [cx + r * 0.9, cy - r * 1.9], [cx + r * 0.3, cy - r * 1.3], [cx, cy - r * 2.0], [cx - r * 0.3, cy - r * 1.3], [cx - r * 0.9, cy - r * 1.9]] }, "#ffd23f", { seam: true });
      if (L.topper === "catears") horns(0.6, L.c.hair);
      if (L.topper === "antenna") { add({ t: "limb", a: [cx - r * 0.2, cy - r], b: [cx - r * 0.6, cy - r * 2.2], ra: 0.6, rb: 0.6 }, P.dark, { flat: true }); add({ t: "ell", c: [cx - r * 0.6, cy - r * 2.3], rx: 1.4, ry: 1.4 }, P.glowL, { glow: true }); }
      if (L.topper === "headphones") add({ t: "ell", c: [cx - r * 0.35, cy + r * 0.1], rx: r * 0.4, ry: r * 0.5 }, P.trim, { seam: true });
      if (L.cls === "heavy" || L.cls === "knight") horns(0.7, P.trimL);
      break;
    }
  }
}

// ------------------------------------------------------------------ raster
function inside(s: Shape, x: number, y: number): boolean {
  switch (s.t) {
    case "ell": { const dx = (x - s.c[0]) / s.rx, dy = (y - s.c[1]) / s.ry; return dx * dx + dy * dy <= 1; }
    case "limb": {
      const [ax, ay] = s.a, [bx, by] = s.b;
      const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2));
      const r = s.ra + (s.rb - s.ra) * t, dx = x - (ax + vx * t), dy = y - (ay + vy * t);
      return dx * dx + dy * dy <= r * r;
    }
    case "poly": {
      let c = false;
      const p = s.p;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
      }
      return c;
    }
  }
}

function bounds(s: Shape): [number, number, number, number] {
  if (s.t === "ell") return [s.c[0] - s.rx, s.c[1] - s.ry, s.c[0] + s.rx, s.c[1] + s.ry];
  if (s.t === "limb") { const r = Math.max(s.ra, s.rb); return [Math.min(s.a[0], s.b[0]) - r, Math.min(s.a[1], s.b[1]) - r, Math.max(s.a[0], s.b[0]) + r, Math.max(s.a[1], s.b[1]) + r]; }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of s.p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

/** Minimum on-screen thickness so small figures don't lose limbs. */
function thicken(s: Shape, k: number): Shape {
  const m = 0.6 / k;
  if (s.t === "limb") return { ...s, ra: Math.max(s.ra, m), rb: Math.max(s.rb, m) };
  if (s.t === "ell") return { ...s, rx: Math.max(s.rx, m), ry: Math.max(s.ry, m) };
  return s;
}

export interface GeneralRender {
  canvas: HTMLCanvasElement;
  code: [number, number][];  // canvas px of the cape surface (for scrolling code overlays)
  hand: Pt;                  // weapon grip, logical px relative to the feet anchor
  eye: Pt;
}

const lightCache = new Map<string, string>();
const lt = (c: string, k: number) => { const key = c + k; let v = lightCache.get(key); if (!v) { v = k > 0 ? light(c, k) : shade(c, -k); lightCache.set(key, v); } return v; };

export function renderGeneral(L: HeroLook, f: GFrame, res: number, snippet?: string): GeneralRender {
  const W = GW * res, H = GH * res, ax = GX * res, fy = GFOOT * res;
  const k = (FIG * res) / 100;
  const P = generalPalette(L);
  const R = rig(L, f);
  const col: (string | null)[] = new Array(W * H).fill(null);
  const pid = new Int16Array(W * H).fill(-1);
  const glows: { s: Shape; c: string }[] = [];
  R.parts.forEach((part, id) => {
    if (part.glow) { glows.push({ s: thicken(part.s, k), c: part.col }); return; }
    if (part.code && res < 2) return;
    const s = part.code ? part.s : thicken(part.s, k);
    const [x0, y0, x1, y1] = bounds(s);
    const px0 = Math.max(0, Math.floor(ax + x0 * k)), px1 = Math.min(W - 1, Math.ceil(ax + x1 * k));
    const py0 = Math.max(0, Math.floor(fy + y0 * k)), py1 = Math.min(H - 1, Math.ceil(fy + y1 * k));
    for (let py = py0; py <= py1; py++) for (let px = px0; px <= px1; px++) {
      if (!inside(s, (px + 0.5 - ax) / k, (py + 0.5 - fy) / k)) continue;
      col[py * W + px] = part.col;
      pid[py * W + px] = id;
    }
  });
  const src = col.slice();
  const big = res >= 2;
  const same = (i: number, j: number) => j >= 0 && j < W * H && pid[j] === pid[i];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const c0 = src[i];
    if (!c0) continue;
    const part = R.parts[pid[i]];
    // plate seams (only where two armor parts meet)
    if (part.seam && big) {
      const r = x < W - 1 ? i + 1 : -1, d = y < H - 1 ? i + W : -1;
      if ((r >= 0 && src[r] && pid[r] !== pid[i] && R.parts[pid[r]]?.seam) || (d >= 0 && src[d] && pid[d] !== pid[i] && R.parts[pid[d]]?.seam)) { col[i] = lt(c0, -1.1); continue; }
    }
    if (part.flat) continue;
    // bevel: top light, bottom dark (needs some thickness)
    const up = y > 0 ? i - W : -1, dn = y < H - 1 ? i + W : -1;
    const lf = x > 0 ? i - 1 : -1, rt = x < W - 1 ? i + 1 : -1;
    if (!same(i, up) && same(i, dn) && same(i, dn + W)) col[i] = lt(c0, big ? 0.9 : 0.7);
    else if (!same(i, dn) && same(i, up)) col[i] = lt(c0, -0.7);
    else if (big && !same(i, lf) && same(i, rt)) col[i] = lt(c0, 0.45);
    else if (big && !same(i, rt) && same(i, lf)) col[i] = lt(c0, -0.45);
    // rim light on the silhouette's back edge (left) + front edge glint
    if (x > 0 && !src[i - 1]) col[i] = mix(col[i] ?? c0, P.rim, big ? 0.65 : 0.5);
    else if (x < W - 1 && !src[i + 1] && y % 2 === 0) col[i] = mix(col[i] ?? c0, "#ffffff", 0.25);
  }
  // cape dither + code surface
  const code: [number, number][] = [];
  for (let i = 0; i < W * H; i++) if (pid[i] >= 0 && R.parts[pid[i]].cape) {
    const x = i % W, y = (i / W) | 0;
    if (src[i - 1] && src[i + 1] && pid[i - 1] === pid[i] && pid[i + 1] === pid[i] && pid[i - W] === pid[i]) code.push([x, y]);
    else if ((x + y) % 2 === 0) col[i] = P.clothD;
  }
  // portraits: real code text on the cape, syntax-colored
  if (res >= 3 && snippet && code.length) paintCapeText(col, pid, R.parts, W, H, snippet, L, P);
  // 1px outline
  const out: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (col[i]) continue;
    const x = i % W;
    if ((x > 0 && col[i - 1]) || (x < W - 1 && col[i + 1]) || col[i - W] || col[i + W]) out.push(i);
  }
  for (const i of out) col[i] = P.outline;
  // glows on top (no outline/shading), with a soft halo pixel ring on big renders
  for (const gl of glows) {
    const [x0, y0, x1, y1] = bounds(gl.s);
    for (let py = Math.max(0, Math.floor(fy + y0 * k) - 1); py <= Math.min(H - 1, Math.ceil(fy + y1 * k) + 1); py++)
      for (let px = Math.max(0, Math.floor(ax + x0 * k) - 1); px <= Math.min(W - 1, Math.ceil(ax + x1 * k) + 1); px++) {
        if (inside(gl.s, (px + 0.5 - ax) / k, (py + 0.5 - fy) / k)) col[py * W + px] = gl.c;
      }
  }
  // bloom: 1px halo around glows (only over painted pixels, so the silhouette stays crisp)
  if (big) {
    const glowSet = new Set(glows.map((g0) => g0.c));
    const halo: [number, string][] = [];
    for (let i = 0; i < W * H; i++) {
      const c0 = col[i];
      if (!c0 || glowSet.has(c0)) continue;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        const cj = col[j];
        if (cj && glowSet.has(cj)) { halo.push([i, mix(c0, cj, 0.45)]); break; }
      }
    }
    for (const [i, c0] of halo) col[i] = c0;
  }
  // chest emblem: the repo's token / language glyph, glowing (fits from res 2 up)
  if (res >= 2) {
    const rows = L.emblem;
    const ew = rows[0]?.length ?? 3;
    const ex = Math.round(ax + 2 * k - ew / 2 + (rows.length > 3 ? 0 : 0)), ey = Math.round(fy - 71 * k - 2 + 6 * k);
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === "1") col[(ey + j) * W + ex + i] = P.glowL; });
  }
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d")!;
  for (let i = 0; i < W * H; i++) { const c = col[i]; if (c) { g.fillStyle = c; g.fillRect(i % W, (i / W) | 0, 1, 1); } }
  return { canvas: cv, code, hand: [R.hand[0] * (FIG / 100), R.hand[1] * (FIG / 100)], eye: [R.eye[0] * (FIG / 100), R.eye[1] * (FIG / 100)] };
}

/** Write the hero's real code onto the cape, 3x5 font, clipped to cape pixels. */
function paintCapeText(col: (string | null)[], pid: Int16Array, parts: Part[], W: number, H: number, snippet: string, L: HeroLook, P: GPalette) {
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let i = 0; i < W * H; i++) if (pid[i] >= 0 && parts[pid[i]].cape) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const words = snippet.split(/\s+/).filter(Boolean);
  const kw = /^(fn|let|const|def|return|if|else|for|while|import|export|class|pub|use|func|go|public|static|void|async|await|local|end|do|val|fun|impl|match|struct|new|from)$/;
  let x = x0 + 2, y = y0 + 4;
  for (const w of words) {
    const wd = w.length * 4;
    if (x + wd > x1 - 1) { x = x0 + 2 + ((y / 6) % 2 ? 4 : 0); y += 6; }
    if (y + 5 > y1 - 2) break;
    const c = kw.test(w) ? L.syn.kw : /^["'`]/.test(w) ? L.syn.str : /\(/.test(w) ? L.syn.fn : /^\d/.test(w) ? L.syn.num : mix(L.syn.plain, P.cloth, 0.25);
    [...w.toUpperCase()].forEach((ch, n) => {
      const b = glyphBits(ch);
      if (!b) return;
      for (let q = 0; q < 15; q++) {
        if (b[q] !== "1") continue;
        const px = x + n * 4 + (q % 3), py = y + ((q / 3) | 0);
        const i = py * W + px;
        if (px > 0 && px < W && py > 0 && py < H && pid[i] >= 0 && parts[pid[i]].cape) col[i] = c;
      }
    });
    x += wd + 2;
  }
}
