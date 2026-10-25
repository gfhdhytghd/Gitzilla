// Boss palette derivation. Deliberately separate from player palettes: bosses are
// sickly / eldritch, players are bright heroic colors.
// Palette semantics:
//   sim kit (no design): [outline dark, body, language accent, danger, bone]
//   kit.design (Gemini): [body dark, body light, glow, accent, eye]
import type { BossKit } from "../../../shared/types.ts";
import { hexToRgb, mix, ramp, rgbToHex, rgbToHsl, shiftHue, type RGB } from "../arena/pix.ts";
import type { Material } from "./layout.ts";
import { bossVariety, type ElementDef, type FinColors } from "./variety.ts";

export interface BossArt {
  outline: string;
  body: string[];      // 6 shades, dark -> light
  bodyRgb: RGB[];
  mats: Record<Material, RGB[]>;
  flesh: string[];     // tentacle ramp, 4 shades
  accent: string;      // veins, iris, circuits
  accentRamp: string[];
  danger: string;      // heart / weak point glow
  dangerRamp: string[];
  bone: string;        // teeth, sclera, horns
  boneRamp: string[];
  inside: string;      // maw / socket interior
  /** element theme (variety.ts): fins, breath / FX tint, eyes, veins */
  el: ElementDef;
  /** calm / charged fin colors (element, hue-jittered like the hide) */
  fin: FinColors;
  lit: FinColors;
}

const cache = new Map<string, BossArt>();

function darkest(c: RGB): RGB {
  const [, , l] = rgbToHsl(c);
  return l > 0.12 ? mix(c, [6, 3, 12], 0.75) : mix(c, [0, 0, 0], 0.25);
}

/** tint: 0 normal, 1 enraged (red), 2 last stand (dark, burning) */
export function bossArt(kit: BossKit, tint = 0): BossArt {
  const V = bossVariety(kit);
  const key = kit.seed + "|" + kit.palette.join(",") + "|" + tint + "|" + (kit.design ? 1 : 0) + "|" + V.element.id + V.hue + V.form;
  const c = cache.get(key);
  if (c) return c;
  const p = kit.palette.length >= 5 ? kit.palette : ["#160f25", "#59365e", "#7cf2c8", "#ff527d", "#fff4c4"];
  let outlineRgb: RGB, base: RGB, accentRgb: RGB, danger: RGB, bone: RGB;
  if (kit.design) {
    const dark = hexToRgb(p[0]);
    outlineRgb = darkest(dark);
    base = mix(hexToRgb(p[1]), dark, 0.12);
    danger = hexToRgb(p[2]);
    accentRgb = hexToRgb(p[3]);
    bone = hexToRgb(p[4]);
  } else {
    outlineRgb = darkest(hexToRgb(p[0]));
    accentRgb = hexToRgb(p[2]);
    // Seeded hue drift so bosses sharing a palette still look different; pull a bit toward the accent.
    const drift = (((kit.seed >>> 4) % 9) - 4) * 16;
    base = shiftHue(mix(hexToRgb(p[1]), accentRgb, 0.18), drift, 1.15, 0.02);
    danger = hexToRgb(p[3]);
    bone = hexToRgb(p[4]);
  }
  // push saturation a bit so the boss pops off the floor
  base = shiftHue(base, 0, 1.25, 0.03);
  if (tint === 1) base = mix(base, [190, 30, 50], 0.45);
  if (tint === 2) base = mix(shiftHue(base, 0, 0.6, -0.08), [120, 10, 40], 0.35);
  const body = ramp(base, 6);
  body[0] = mix(body[0], outlineRgb, 0.35);
  const mk = (c: RGB) => { const r = ramp(c, 6); r[0] = mix(r[0], outlineRgb, 0.35); return r; };
  const redden = (c: RGB) => (tint === 1 ? mix(c, [190, 30, 50], 0.35) : tint === 2 ? mix(c, [120, 10, 40], 0.3) : c);
  // element hide (variety.ts): mostly the element, a little of the repo's own color, a per-repo hue jitter.
  // Enraged it darkens toward red-black (refs boss-5); last stand near-black.
  const el = V.element;
  const jit = (c: RGB) => shiftHue(c, V.hue, 1, 0);
  const hide0 = jit(mix(hexToRgb(el.hide), base, 0.12));
  const hide = tint === 2 ? mix(hide0, [14, 12, 16], 0.7) : tint === 1 ? mix(hide0, [70, 12, 24], 0.45) : hide0;
  const hide2 = mix(hide, jit(hexToRgb(el.hide2)), 0.5);
  // brighter takes on the hide (painted mech hulls, the hydra's shining scales, an insect's glossy shell)
  const atLeast = (c: RGB, l: number, sMul = 1.1): RGB => { const [, , l0] = rgbToHsl(c); return shiftHue(c, 0, sMul, Math.max(0, l - l0)); };
  const mats: Record<Material, RGB[]> = {
    flesh: body,
    scales: body,
    chitin: mk(atLeast(mix(hide, hide2, 0.3), 0.3, 1.2)),                     // insectoid shell
    stone: mk(mix(hide, [118, 116, 124], 0.4)),                              // golem rock in the element's tint
    metal: mk(mix(atLeast(hide, 0.48, 1.35), [150, 154, 164], 0.2)),         // steel hull painted in the element (ref boss-3)
    bark: mk(redden(mix(base, [104, 72, 48], 0.65))),
    foliage: mk(redden(mix(base, [70, 150, 80], 0.72))),
    sclera: mk(tint ? mix(bone, danger, 0.35) : mix(bone, base, 0.12)),
    // kaiju / hydra hide: the element (jade = the original dark teal, gilded = the original hydra gold)
    obsidian: mk(hide),
    gold: mk(tint ? hide : atLeast(hide, 0.45, 1.25)),
    // abyssal: a darker take on the element (void = the original near-black crystal)
    void: mk(mix(hide, [10, 8, 14], 0.45)),
    // underside
    belly: mk(tint ? mix(hide, [74, 70, 76], 0.6) : jit(mix(hexToRgb(el.belly), base, 0.15))),
  };
  const flesh = ramp(shiftHue(base, -22, 1.1, -0.04), 4);
  const art: BossArt = {
    outline: rgbToHex(outlineRgb),
    body: body.map(rgbToHex),
    bodyRgb: body,
    mats,
    flesh: flesh.map(rgbToHex),
    accent: rgbToHex(tint ? mix(accentRgb, danger, 0.5) : accentRgb),
    accentRamp: ramp(tint ? mix(accentRgb, danger, 0.5) : accentRgb, 4).map(rgbToHex),
    danger: rgbToHex(danger),
    dangerRamp: ramp(danger, 4).map(rgbToHex),
    bone: rgbToHex(bone),
    boneRamp: ramp(mix(bone, base, 0.15), 4).map(rgbToHex),
    inside: rgbToHex(mix(outlineRgb, danger, 0.18)),
    el,
    fin: jitFin(el.crystal, V.hue),
    lit: el.lit,
  };
  cache.set(key, art);
  return art;
}

function jitFin(f: FinColors, hue: number): FinColors {
  const j = (h: string) => rgbToHex(shiftHue(hexToRgb(h), hue, 1, 0));
  return { lo: j(f.lo), mid: j(f.mid), hi: j(f.hi), glow: j(f.glow) };
}

export function matRamp(art: BossArt, m: Material): string[] {
  return art.mats[m].map(rgbToHex);
}
