// Hero sprites: Duelyst-style generals (see general.ts) rasterized per frame and resolution, cached.
// res 1 = in-game (~32 px tall), 2 = edu heroScale 2, 3 = full-detail portraits (~96 px, real code on the cape).
import type { HeroLook } from "./look.ts";
import { renderGeneral, GW, GH, GX, GFOOT } from "./general.ts";

/** Logical sprite canvas (res 1); res r renders at r x this size. */
export const SW = GW;
export const SH = GH;
export const ANCHOR_X = GX;
/** Feet row (bottom of the boots) in the logical canvas. */
export const SPRITE_FEET = GFOOT;

export type Expr = "normal" | "blink" | "hurt" | "ko" | "happy";
export interface FrameSpec { pose: "idle" | "run"; i: number; expr: Expr }

export function tinted(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = src.width; cv.height = src.height;
  const x = cv.getContext("2d")!;
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = color;
  x.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

const frameCache = new Map<string, HTMLCanvasElement>();
const codeCells = new Map<string, [number, number][]>();
const hands = new Map<string, [number, number]>();
const fkey = (L: HeroLook, f: FrameSpec, res: number) => L.key + "|" + f.pose + f.i + f.expr + "|r" + res;

function build(L: HeroLook, f: FrameSpec, res: number): HTMLCanvasElement {
  const k = fkey(L, f, res);
  let cv = frameCache.get(k + "|");
  if (cv) return cv;
  const r = renderGeneral(L, f, res, res >= 3 ? L.snippet : undefined);
  codeCells.set(k, r.code);
  hands.set(k, r.hand);
  if (frameCache.size > 3000) frameCache.clear();
  frameCache.set(k + "|", r.canvas);
  return r.canvas;
}

/** Canvas px (at `res`) of the cape surface where scrolling code is drawn. */
export function heroCodeCells(L: HeroLook, f: FrameSpec, res = 1): [number, number][] {
  const k = fkey(L, f, res);
  if (!codeCells.has(k)) build(L, f, res);
  return codeCells.get(k) ?? [];
}

/** Weapon grip in logical px relative to the feet anchor (x toward facing). */
export function heroHand(L: HeroLook, f: FrameSpec): [number, number] {
  const k = fkey(L, f, 1);
  if (!hands.has(k)) build(L, f, 1);
  return hands.get(k) ?? [6, -16];
}

/** 1px dilated flat-color silhouette (sprite + 1px border each side), drawn under the body as a rim/glow. */
export function heroRim(L: HeroLook, f: FrameSpec, color: string, res = 1): HTMLCanvasElement {
  const k = fkey(L, f, res) + "|rim" + color;
  let cv = frameCache.get(k);
  if (cv) return cv;
  const flat = heroFrame(L, f, color, res);
  cv = document.createElement("canvas");
  cv.width = SW * res + 2; cv.height = SH * res + 2;
  const g = cv.getContext("2d")!;
  for (const [ox, oy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) g.drawImage(flat, ox, oy);
  frameCache.set(k, cv);
  return cv;
}

/** Variant: "" normal, or a CSS color to flat-tint the silhouette (white flash, RGB split, ghosts). */
export function heroFrame(L: HeroLook, f: FrameSpec, variant = "", res = 1): HTMLCanvasElement {
  if (!variant) return build(L, f, res);
  const k = fkey(L, f, res) + "|" + variant;
  let cv = frameCache.get(k);
  if (cv) return cv;
  cv = tinted(build(L, f, res), variant);
  frameCache.set(k, cv);
  return cv;
}
