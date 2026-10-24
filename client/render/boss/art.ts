// Boss palette derivation. Deliberately separate from player palettes: bosses are
// sickly / eldritch, players are bright heroic colors.
// Palette semantics:
//   sim kit (no design): [outline dark, body, language accent, danger, bone]
//   kit.design (Gemini): [body dark, body light, glow, accent, eye]
import type { BossKit } from "../../../shared/types.ts";
import { hexToRgb, mix, ramp, rgbToHex, rgbToHsl, shiftHue, type RGB } from "../arena/pix.ts";
import type { Material } from "./layout.ts";

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
}

const cache = new Map<string, BossArt>();

function darkest(c: RGB): RGB {
  const [, , l] = rgbToHsl(c);
  return l > 0.12 ? mix(c, [6, 3, 12], 0.75) : mix(c, [0, 0, 0], 0.25);
}

/** tint: 0 normal, 1 enraged (red), 2 last stand (dark, burning) */
export function bossArt(kit: BossKit, tint = 0): BossArt {
  const key = kit.seed + "|" + kit.palette.join(",") + "|" + tint + "|" + (kit.design ? 1 : 0);
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
  const mats: Record<Material, RGB[]> = {
    flesh: body,
    scales: body,
    chitin: mk(shiftHue(base, 0, 1.1, -0.05)),
    stone: mk(redden(mix(base, [118, 116, 124], 0.55))),
    metal: mk(redden(mix(base, [120, 134, 158], 0.6))),
    bark: mk(redden(mix(base, [104, 72, 48], 0.65))),
    foliage: mk(redden(mix(base, [70, 150, 80], 0.72))),
    sclera: mk(tint ? mix(bone, danger, 0.35) : mix(bone, base, 0.12)),
    // kaiju hide: charcoal/obsidian with a hint of the repo hue; belly: ash-grey plates
    // stays charcoal when enraged (only a faint red undertone); the plates and cracks carry the rage
    obsidian: mk(mix(mix(base, [30, 32, 42], 0.66), [70, 12, 24], tint ? 0.18 : 0)),
    belly: mk(redden(mix(base, [128, 122, 120], 0.55))),
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
  };
  cache.set(key, art);
  return art;
}

export function matRamp(art: BossArt, m: Material): string[] {
  return art.mats[m].map(rgbToHex);
}
