// Final-frame sprites for the cinematic, built from the real renderers (playerPortrait / bossPortrait),
// plus everything the cinematic needs to take them apart: per-pixel/block code-rain cells, part anchors,
// a weapon mask for heroes and the limb/heart/eye skeleton for bosses. Built once per kit and cached.
import type { BossKit, PlayerKit } from "../../shared/types.ts";
import { bossLayout, bossPortrait } from "../render/boss/index.ts";
import { lookFor, playerPortrait } from "../render/player/index.ts";
import { weaponSprite } from "../render/player/weapons.ts";
import type { Pt } from "./graph.ts";

export interface Cell { x: number; y: number; size: number; color: string; row: number }

export interface CharSprite {
  kind: "hero" | "boss";
  frames: HTMLCanvasElement[];   // hero: idle0, idle1, blink. boss: [portrait]
  size: number;                  // square sprite canvas size (sprite px)
  bbox: { x0: number; y0: number; x1: number; y1: number };
  cells: Cell[];                 // code-rain targets (sprite px)
  silhouette: HTMLCanvasElement; // flat white silhouette
  outline: HTMLCanvasElement;    // 1px outline ring (white)
  weapon?: HTMLCanvasElement;    // hero weapon only (true colors)
  body?: HTMLCanvasElement;      // hero body without weapon (flat white)
  anchors: Record<string, Pt>;   // sprite px
  limbs: { id: string; component: string; x: number; y: number; r: number; weak: boolean }[];
  eyes: { x: number; y: number; r: number }[];
  heart: { x: number; y: number; r: number } | null;
  center: Pt;                    // boss center (drawBoss state.x/y) in sprite px
}

const HERO_SIZE = 32;
const BOSS_SIZE = 176;
const cache = new Map<string, CharSprite>();

function mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

function flat(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const [c, g] = mk(src.width, src.height);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function outlineOf(src: HTMLCanvasElement): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const d = src.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const [c, g] = mk(w, h);
  g.fillStyle = "#ffffff";
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 40;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    if (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1)) g.fillRect(x, y, 1, 1);
  }
  return c;
}

const hex2 = (n: number) => n.toString(16).padStart(2, "0");

function scan(src: HTMLCanvasElement, block: number) {
  const w = src.width, h = src.height;
  const d = src.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const cells: Cell[] = [];
  for (let by = 0; by < h; by += block) for (let bx = 0; bx < w; bx += block) {
    let n = 0, r = 0, gg = 0, b = 0, best = 0;
    for (let y = by; y < Math.min(h, by + block); y++) for (let x = bx; x < Math.min(w, bx + block); x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] <= 40) continue;
      n++; r += d[i]; gg += d[i + 1]; b += d[i + 2];
      best = Math.max(best, d[i] + d[i + 1] + d[i + 2]);
    }
    if (n < Math.max(1, (block * block) / 4)) continue;
    // lift block colors a touch so glyphs read on the dark background
    const lift = (v: number) => Math.min(255, Math.round(v / n * 0.8 + 50));
    cells.push({ x: bx, y: by, size: block, color: "#" + hex2(lift(r)) + hex2(lift(gg)) + hex2(lift(b)), row: by });
  }
  return { bbox: { x0, y0, x1: Math.max(x0, x1), y1: Math.max(y0, y1) }, cells, data: d };
}

/** hires: edu heroes (heroScale 2) use the 2x high-detail sprite, one detail pixel per sprite px. */
export function heroSprite(kit: PlayerKit, hires = false): CharSprite {
  const key = (hires ? "H|" : "h|") + kit.repo + "|" + kit.seed + "|" + (kit.design?.title ?? "") + "|" + kit.palette.join("");
  const hit = cache.get(key);
  if (hit) return hit;
  const size = hires ? HERO_SIZE * 2 : HERO_SIZE;
  const frames = [0, 1, 2].map((f) => playerPortrait(kit, size, f, hires));
  const base = frames[0];
  const { bbox, cells } = scan(base, 1);
  // weapon-only layer: same transform as playerPortrait (size 32 -> scale 1, feet at (16, 28); hires: 64 -> 2)
  const L = lookFor(kit);
  const res = hires ? 2 : 1, sc = hires ? 2 : 1;
  const ws = weaponSprite(L, kit.weapon, res);
  const [wc, wg] = mk(size, size);
  wg.translate(Math.floor(size / 2), Math.floor(size / 2 + 12.5 * sc));
  wg.scale(sc, sc);
  wg.translate(2, -6);
  wg.rotate(kit.weapon === "blade" ? -0.9 : kit.weapon === "staff" ? -1.2 : -0.25);
  wg.drawImage(ws.canvas, -ws.px, -ws.py, ws.canvas.width / res, ws.canvas.height / res);
  const wd = wg.getImageData(0, 0, size, size).data;
  let wx = 0, wy = 0, wn = 0;
  for (let i = 0; i < size * size; i++) if (wd[i * 4 + 3] > 40) { wx += i % size; wy += (i / size) | 0; wn++; }
  const [bc, bg] = mk(size, size);
  bg.drawImage(flat(base, "#ffffff"), 0, 0);
  bg.globalCompositeOperation = "destination-out";
  bg.drawImage(wc, 0, 0);
  const cx = (bbox.x0 + bbox.x1) / 2, h = bbox.y1 - bbox.y0;
  const sp: CharSprite = {
    kind: "hero", frames, size, bbox, cells,
    silhouette: flat(base, "#ffffff"), outline: outlineOf(base), weapon: wc, body: bc,
    anchors: {
      head: { x: cx - 1, y: bbox.y0 + h * 0.25 },
      body: { x: cx - 1, y: bbox.y0 + h * 0.62 },
      weapon: wn ? { x: wx / wn, y: wy / wn } : { x: bbox.x1 - 2, y: bbox.y0 + h * 0.7 },
      back: { x: bbox.x0 + 3 * sc, y: bbox.y0 + h * 0.6 },
      feet: { x: cx - 1, y: bbox.y1 },
      top: { x: cx - 1, y: bbox.y0 - 3 * sc },
    },
    limbs: [], eyes: [], heart: null, center: { x: size / 2, y: size * 0.62 },
  };
  if (cache.size > 40) cache.clear();
  cache.set(key, sp);
  return sp;
}

export function bossSprite(kit: BossKit): CharSprite {
  const key = "b|" + kit.repo + "|" + kit.seed + "|" + kit.name + "|" + kit.palette.join("") + "|" + (kit.design?.body ?? "");
  const hit = cache.get(key);
  if (hit) return hit;
  const portrait = bossPortrait(kit, BOSS_SIZE);
  const { bbox, cells } = scan(portrait, 4);
  const L = bossLayout(kit);
  const cx = BOSS_SIZE / 2, cy = BOSS_SIZE / 2 - 8;
  const sp: CharSprite = {
    kind: "boss", frames: [portrait], size: BOSS_SIZE, bbox, cells,
    silhouette: flat(portrait, "#ffffff"), outline: outlineOf(portrait),
    anchors: {
      body: { x: cx, y: cy },
      top: { x: cx, y: bbox.y0 },
      feet: { x: cx, y: bbox.y1 },
      head: { x: cx + (L.eyes[0]?.x ?? 0), y: cy + (L.eyes[0]?.y ?? -20) },
    },
    limbs: L.limbs.map((l) => ({ id: l.id, component: l.component, x: cx + l.x, y: cy + l.y, r: Math.max(6, l.r), weak: l.weakPoint })),
    eyes: L.eyes.map((e) => ({ x: cx + e.x, y: cy + e.y, r: e.r })),
    heart: { x: cx + L.heart.x, y: cy + L.heart.y, r: L.heart.r },
    center: { x: cx, y: cy },
  };
  if (cache.size > 40) cache.clear();
  cache.set(key, sp);
  return sp;
}
