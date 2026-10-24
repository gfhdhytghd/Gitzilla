// Arena tilesets per theme. Static layer is generated once per (theme, seed) with ImageData
// + crisp fillRect decorations; ambient animation is a small list of cheap per-frame items.
import type { ArenaTheme } from "../../../shared/types.ts";
import { ARENA_H, ARENA_W } from "../../../shared/types.ts";
import { bayer, disc, drawGlow, hash2, hexToRgb, line, makeCanvas, mix, rgbToHex, rng, type RGB } from "./pix.ts";
import { drawTextRaw } from "./font.ts";

export const WALL_TOP = 22, WALL_SIDE = 10, WALL_BOTTOM = 8;

export interface Pal {
  f: string[];       // floor shades dark->light (3)
  grout: string;
  line: string;      // grid / rules
  engrave: string;   // carved code text
  accent: string;    // main glow color
  accent2: string;
  cap: string; face: string; faceDark: string; edge: string;
  light: string;     // light pool color
  rainColor?: string;
}

export const PALETTES: Record<ArenaTheme, Pal> = {
  terminal: { f: ["#060b08", "#09120c", "#0d1911"], grout: "#030604", line: "#0f2617", engrave: "#174428", accent: "#39ff6a", accent2: "#b6ff3a", cap: "#1d2a22", face: "#0e1612", faceDark: "#070c09", edge: "#2f4638", light: "#1bd14a", rainColor: "#1f8a3c" },
  kernel: { f: ["#28221f", "#332c27", "#3f3630"], grout: "#161210", line: "#4a3f36", engrave: "#55473b", accent: "#ff8a2a", accent2: "#ffd23f", cap: "#55504b", face: "#2e2926", faceDark: "#1b1715", edge: "#7a716a", light: "#ff7a1a" },
  web: { f: ["#0a081d", "#0f0c28", "#151133"], grout: "#05040f", line: "#2a1d63", engrave: "#2b2672", accent: "#ff3df2", accent2: "#2ef2ff", cap: "#2a2158", face: "#130f33", faceDark: "#0a0820", edge: "#5a48b8", light: "#b02cff" },
  notebook: { f: ["#a39577", "#b0a283", "#bdb08f"], grout: "#8e8166", line: "#8a9cb5", engrave: "#7d7360", accent: "#3b6fd8", accent2: "#e0574a", cap: "#4a3a30", face: "#33271f", faceDark: "#211912", edge: "#6d5a4a", light: "#fff2c8" },
  enterprise: { f: ["#55524b", "#605c54", "#6b675d"], grout: "#47443e", line: "#77736a", engrave: "#7a766b", accent: "#7fb4ff", accent2: "#ffe28a", cap: "#9aa3b5", face: "#4b5874", faceDark: "#323c52", edge: "#c3cad8", light: "#fff4d0" },
  legacy: { f: ["#353a32", "#41473d", "#4d5447"], grout: "#20231e", line: "#5a6152", engrave: "#5f6656", accent: "#ffb347", accent2: "#c6ff7a", cap: "#5d6358", face: "#30342d", faceDark: "#1e211c", edge: "#7c8474", light: "#ff9a3a" },
};

export type Ambient =
  | { k: "led"; x: number; y: number; c: string; period: number; ph: number; duty: number }
  | { k: "trace"; pts: [number, number][]; c: string; speed: number; ph: number; len: number }
  | { k: "rain"; x: number; speed: number; ph: number; len: number; glyphs: string }
  | { k: "screen"; x: number; y: number; w: number; h: number; c: string; bg: string; ph: number; style: "code" | "sheet" | "cursor" | "graph" }
  | { k: "flame"; x: number; y: number; ph: number }
  | { k: "firefly"; x: number; y: number; ph: number; c: string }
  | { k: "neon"; x: number; y: number; text: string; c: string; ph: number; scale: number }
  | { k: "fan"; x: number; y: number; r: number; ph: number }
  | { k: "grate"; x: number; y: number; w: number; h: number; ph: number }
  | { k: "drip"; x: number; y: number; ph: number }
  | { k: "plot"; pts: [number, number][]; c: string; ph: number }
  | { k: "fluoro"; x: number; w: number; ph: number };

export interface ArenaLayer { canvas: HTMLCanvasElement; ambient: Ambient[]; pal: Pal }

const cache = new Map<string, ArenaLayer>();

/** code: the boss repo's real lines (heartLines + snippets) to print on the floor; optional. */
export function getArena(theme: ArenaTheme, seed: number, code?: string[]): ArenaLayer {
  const key = theme + "|" + seed + "|" + (code ? code.length + ":" + code.join("").length : "");
  let a = cache.get(key);
  if (!a) {
    if (cache.size > 8) cache.clear();
    a = build(theme in PALETTES ? theme : "terminal", seed, code);
    cache.set(key, a);
  }
  return a;
}

// ---------- noise ----------
function vnoise(x: number, y: number, s: number, seed: number) {
  const gx = x / s, gy = y / s;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x: number, y: number, s: number, seed: number) {
  return vnoise(x, y, s, seed) * 0.6 + vnoise(x, y, s / 2, seed + 1) * 0.3 + vnoise(x, y, s / 4, seed + 2) * 0.1;
}

const CODE_LINES = [
  "if (err != nil) { return err }", "while(1) fork();", "SELECT * FROM users;", "git rebase -i HEAD~3", "sudo rm -rf node_modules",
  "fn main() -> Result<()> {", "#include <stdio.h>", "def __init__(self):", "for (;;) { /* TODO */ }", "throw new Error('nope');",
  "goto fail;", "let x = undefined ?? null;", "import * as everything", "while (true) {}", "0xDEADBEEF", "segfault (core dumped)",
  "kill -9 $(pgrep boss)", "chmod 777 /", "// here be dragons", "return -1; // fixme", "npm audit fix --force", "ERROR: 418 I'M A TEAPOT",
];

// ---------- build ----------
function build(theme: ArenaTheme, seed: number, code?: string[]): ArenaLayer {
  const pal = PALETTES[theme];
  const [c, ctx] = makeCanvas(ARENA_W, ARENA_H);
  const img = ctx.createImageData(ARENA_W, ARENA_H);
  const d = img.data;
  const F = pal.f.map(hexToRgb);
  const G = hexToRgb(pal.grout);
  const LN = hexToRgb(pal.line);
  const R = rng(seed ^ 0xa11ce);
  const put = (x: number, y: number, col: RGB) => { const i = (y * ARENA_W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
  const shade = (v: number, x: number, y: number) => F[Math.max(0, Math.min(2, Math.floor(v * 3 + (bayer(x, y) - 0.5) * 0.55)))];

  for (let y = 0; y < ARENA_H; y++)
    for (let x = 0; x < ARENA_W; x++) {
      const u = x & 15, v = y & 15, tx = x >> 4, ty = y >> 4;
      const tn = hash2(tx, ty, seed);
      let col: RGB;
      switch (theme) {
        case "terminal": {
          let val = 0.25 + tn * 0.35 + (fbm(x, y, 40, seed) - 0.5) * 0.4;
          col = shade(val, x, y);
          if (u === 0 || v === 0) col = G;
          else if (u === 1 || v === 1) col = mix(col, LN, 0.5);
          if ((x % 64 === 32 || y % 64 === 32) && (x + y) % 2 === 0) col = mix(col, LN, 0.8);
          break;
        }
        case "kernel": {
          const pu = x & 31, pv = y & 31, pn = hash2(x >> 5, y >> 5, seed);
          let val = 0.3 + pn * 0.4 + (fbm(x, y, 24, seed) - 0.5) * 0.5;
          // brushed metal streaks
          val += (hash2(x >> 3, y, seed + 9) - 0.5) * 0.12;
          col = shade(val, x, y);
          const rust = fbm(x, y, 30, seed + 5);
          if (rust > 0.62) col = mix(col, [122, 63, 31], Math.min(1, (rust - 0.62) * 5) * (bayer(x, y) < 0.7 ? 1 : 0.5));
          if (pu === 0 || pv === 0) col = G;
          else if (pu === 1 || pv === 1) col = mix(col, [120, 110, 100], 0.35);
          else if (pu === 31 || pv === 31) col = mix(col, G, 0.5);
          // rivets
          if ((pu === 3 || pu === 28) && (pv === 3 || pv === 28)) col = [150, 140, 130];
          if ((pu === 4 || pu === 29) && (pv === 4 || pv === 29)) col = [30, 26, 24];
          break;
        }
        case "web": {
          let val = 0.2 + (fbm(x, y, 60, seed) - 0.5) * 0.5 + tn * 0.15;
          col = shade(val, x, y);
          if (u === 0 || v === 0) col = mix(col, LN, (tx + ty) % 4 === 0 ? 1 : 0.6);
          if ((x % 64 === 0 || y % 64 === 0)) col = mix(LN, [255, 61, 242], 0.25);
          break;
        }
        case "notebook": {
          const fiber = (hash2(x, y >> 1, seed) - 0.5) * 0.1 + (fbm(x, y, 70, seed) - 0.5) * 0.35;
          col = shade(0.55 + fiber, x, y);
          if (y % 12 === 0) col = mix(col, LN, 0.75);
          else if (x % 12 === 0) col = mix(col, LN, 0.35);
          if (x === 44 || x === 45) col = mix(col, [194, 91, 91], 0.8);
          // page fold
          if (x === ARENA_W / 2 || x === ARENA_W / 2 + 1) col = mix(col, [70, 60, 45], x === ARENA_W / 2 ? 0.35 : 0.15);
          break;
        }
        case "enterprise": {
          const cu = x & 31, cv = y & 31, ct = ((x >> 5) + (y >> 5)) & 1;
          const grain = ct ? hash2(x >> 1, y, seed) : hash2(x, y >> 1, seed);
          let val = 0.45 + (grain - 0.5) * 0.35 + (hash2(x >> 5, y >> 5, seed) - 0.5) * 0.2;
          col = shade(val, x, y);
          if ((ct ? x : y) % 3 === 0) col = mix(col, F[0], 0.3);
          if (cu === 0 || cv === 0) col = mix(col, G, 0.7);
          // coffee stains
          break;
        }
        case "legacy":
        default: {
          // voronoi cobbles
          const cs = 14;
          const gx = Math.floor(x / cs), gy = Math.floor(y / cs);
          let f1 = 1e9, f2 = 1e9, id = 0;
          for (let oy = -1; oy <= 1; oy++)
            for (let ox = -1; ox <= 1; ox++) {
              const cx = (gx + ox) * cs + hash2(gx + ox, gy + oy, seed) * cs, cy = (gy + oy) * cs + hash2(gx + ox, gy + oy, seed + 3) * cs;
              const dd = Math.hypot(x - cx, y - cy);
              if (dd < f1) { f2 = f1; f1 = dd; id = (gx + ox) * 7919 + (gy + oy); } else if (dd < f2) f2 = dd;
            }
          const edge = f2 - f1;
          let val = 0.35 + hash2(id, 1, seed) * 0.35 - f1 * 0.012 + (fbm(x, y, 20, seed) - 0.5) * 0.3;
          col = shade(val, x, y);
          if (edge < 1.6) col = G;
          else if (edge < 2.6) col = mix(col, G, 0.4);
          const moss = fbm(x, y, 28, seed + 7) + (1 - Math.min(1, Math.min(x, y, ARENA_W - x, ARENA_H - y) / 70)) * 0.25;
          if (moss > 0.74 || (moss > 0.68 && bayer(x, y) < (moss - 0.68) * 16)) col = mix([62, 88, 40], [92, 122, 52], fbm(x, y, 6, seed + 9) > 0.55 ? 1 : 0.35);
          break;
        }
      }
      put(x, y, col);
    }
  ctx.putImageData(img, 0, 0);


  // ---- floor engravings: code text, git graph, circuit traces ----
  const ambient: Ambient[] = [];
  const ambientEarly = ambient;
  if (code && code.length) floorSource(ctx, theme, code);
  else engraveCode(ctx, pal, R, theme);
  gitGraph(ctx, pal, R, theme, ambientEarly);
  if (theme === "terminal" || theme === "web" || theme === "kernel") circuitTraces(ctx, pal, R, theme, ambient);

  // ---- theme props (floor) ----
  floorProps(ctx, theme, pal, R, ambient, seed);

  // ---- walls ----
  walls(ctx, theme, pal, R, ambient, seed);
  if (code && code.length) bracketWalls(ctx, pal, theme);

  // ---- baked light pools ----
  ctx.globalCompositeOperation = "lighter";
  for (const a of ambient) {
    if (a.k === "flame") drawGlow(ctx, a.x, a.y + 14, pal.light, 30, 0.35);
    if (a.k === "screen") drawGlow(ctx, a.x + a.w / 2, a.y + a.h + 6, a.c, Math.max(14, a.w), 0.18);
    if (a.k === "neon") drawGlow(ctx, a.x, a.y + 16, a.c, 26, 0.25);
    if (a.k === "grate") drawGlow(ctx, a.x + a.w / 2, a.y + a.h / 2, pal.accent, 22, 0.25);
    if (a.k === "fluoro") drawGlow(ctx, a.x + a.w / 2, 40, pal.light, 46, 0.22);
  }
  ctx.globalCompositeOperation = "source-over";

  return { canvas: c, ambient, pal };
}

function inPlay(x: number, y: number, m = 0) {
  return x > WALL_SIDE + m && x < ARENA_W - WALL_SIDE - m && y > WALL_TOP + m && y < ARENA_H - WALL_BOTTOM - m;
}

function engraveCode(ctx: CanvasRenderingContext2D, pal: Pal, R: () => number, theme: ArenaTheme) {
  const n = theme === "notebook" ? 5 : 7;
  for (let i = 0; i < n; i++) {
    const t = CODE_LINES[Math.floor(R() * CODE_LINES.length)].toUpperCase();
    const x = Math.round(WALL_SIDE + 8 + R() * (ARENA_W - 2 * WALL_SIDE - 16 - t.length * 4));
    const y = Math.round(WALL_TOP + 10 + R() * (ARENA_H - WALL_TOP - WALL_BOTTOM - 24));
    // carved: dark groove with a lit lower lip
    ctx.fillStyle = theme === "notebook" ? "#3a4568" : pal.grout;
    ctx.globalAlpha = theme === "notebook" ? 0.55 : 0.9;
    drawTextRaw(ctx, t, x, y);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = pal.engrave;
    if (theme !== "notebook") drawTextRaw(ctx, t, x, y + 1);
    ctx.globalAlpha = 1;
  }
}

function gitGraph(ctx: CanvasRenderingContext2D, pal: Pal, R: () => number, theme: ArenaTheme, ambient: Ambient[]) {
  // a git log graph running along the floor seams (tile grid lines), with merges, commit dots and glowing pulses
  const lanes = 3;
  const seam = Math.round((R() < 0.5 ? 48 + R() * 32 : ARENA_W - 96 - R() * 32) / 16) * 16;
  const colors = theme === "notebook" ? ["#3b6fd8", "#e0574a", "#3a9a5a"] : theme === "web" ? ["#ff3df2", "#2ef2ff", "#ffe14a"] : theme === "terminal" ? ["#39ff6a", "#b6ff3a", "#1fd1a0"] : theme === "kernel" ? ["#ff8a2a", "#ffd23f", "#c8a050"] : theme === "enterprise" ? ["#3a6ad8", "#2a8a5a", "#b05a2a"] : ["#ffb347", "#c6ff7a", "#8ac0ff"];
  const top = WALL_TOP + 4, bot = ARENA_H - WALL_BOTTOM - 4;
  const active = [true, R() < 0.6, R() < 0.3];
  const segs: [number, number, number, number, number][] = [];
  for (let y = top; y < bot; y += 16) {
    for (let l = 0; l < lanes; l++) {
      if (!active[l]) continue;
      segs.push([seam + l * 16, y, seam + l * 16, Math.min(bot, y + 16), l]);
    }
    if (R() < 0.3) {
      const a = Math.floor(R() * lanes), b = (a + 1) % lanes;
      segs.push([seam + a * 16, y, seam + b * 16, y + 16, b]);
      active[b] = !active[b] || R() < 0.5;
      if (!active.some(Boolean)) active[0] = true;
    }
  }
  ctx.globalAlpha = theme === "notebook" ? 0.6 : 0.4;
  for (const [x0, y0, x1, y1, l] of segs) { ctx.fillStyle = colors[l]; line(ctx, x0, y0, x1, y1); }
  ctx.globalAlpha = theme === "notebook" ? 0.8 : 0.6;
  for (const [x0, y0, , , l] of segs) if (hash2(x0, y0, 7) < 0.4) { ctx.fillStyle = "#07040c"; disc(ctx, x0, y0, 2.5); ctx.fillStyle = colors[l]; disc(ctx, x0, y0, 1.5); }
  ctx.globalAlpha = 1;
  // a pulse per lane travels the branch (glowing commits flowing)
  for (let l = 0; l < lanes; l++) {
    const pts: [number, number][] = [];
    for (const [x0, y0, x1, y1, ll] of segs) if (ll === l && x0 === x1) { if (!pts.length) pts.push([x0, y0]); pts.push([x1, y1]); }
    if (pts.length > 1) ambient.push({ k: "trace", pts: [pts[0], pts[pts.length - 1]], c: colors[l], speed: 40 + l * 12, ph: R() * 10, len: 0 });
  }
}

// ---- the arena floor is a source file of the BOSS repo ----
const KW = new Set("if else elif for while do return def fn func function class struct enum impl trait match case switch break continue const let var mut pub use import from export package module type interface extends implements new delete try catch except finally throw raise async await yield lambda public private protected static void int float bool string char true false null none nil self this super go defer select range in is not and or with as unsafe where loop".split(" "));
const SYNTAX: Record<ArenaTheme, { kw: string; str: string; num: string; com: string; id: string; pun: string; alpha: number }> = {
  terminal: { kw: "#39ff6a", str: "#b6ff3a", num: "#7dffb0", com: "#1f6a34", id: "#2fb85a", pun: "#1f8a3c", alpha: 0.12 },
  kernel: { kw: "#ff8a2a", str: "#ffd23f", num: "#ffb36b", com: "#6a5a4a", id: "#c8a888", pun: "#8a7a6a", alpha: 0.12 },
  web: { kw: "#ff3df2", str: "#2ef2ff", num: "#ffe14a", com: "#5a4a9a", id: "#b48aff", pun: "#7a6ad8", alpha: 0.12 },
  notebook: { kw: "#3b6fd8", str: "#c25b5b", num: "#3a9a5a", com: "#8a7f66", id: "#2b3550", pun: "#5a5040", alpha: 0.13 },
  enterprise: { kw: "#3a6ad8", str: "#b05a2a", num: "#2a8a5a", com: "#8a8678", id: "#3a3830", pun: "#5a5850", alpha: 0.12 },
  legacy: { kw: "#ffb347", str: "#c6ff7a", num: "#ffd27a", com: "#5f6656", id: "#a8b098", pun: "#7c8474", alpha: 0.12 },
};

function tokenize(line: string): { t: string; k: "kw" | "str" | "num" | "com" | "id" | "pun" | "ws" }[] {
  const out: { t: string; k: "kw" | "str" | "num" | "com" | "id" | "pun" | "ws" }[] = [];
  const re = /(\s+)|("[^"]*"?|'[^']*'?|`[^`]*`?)|(\/\/.*|#.*|--.*)|(\b\d[\w.]*)|([A-Za-z_$][\w$]*)|(.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m[1]) out.push({ t: m[1], k: "ws" });
    else if (m[2]) out.push({ t: m[2], k: "str" });
    else if (m[3]) out.push({ t: m[3], k: "com" });
    else if (m[4]) out.push({ t: m[4], k: "num" });
    else if (m[5]) out.push({ t: m[5], k: KW.has(m[5].toLowerCase()) ? "kw" : "id" });
    else out.push({ t: m[6], k: "pun" });
  }
  return out;
}

function floorSource(ctx: CanvasRenderingContext2D, theme: ArenaTheme, code: string[]) {
  const syn = SYNTAX[theme];
  const rowH = 13, sc = 2;
  const x0 = WALL_SIDE + 6;
  const maxChars = Math.floor((ARENA_W - x0 - WALL_SIDE - 4) / (4 * sc));
  let row = 0;
  for (let y = WALL_TOP + 5; y + 10 < ARENA_H - WALL_BOTTOM; y += rowH, row++) {
    const src = code[row % code.length] ?? "";
    // line number on the left wall
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = theme === "notebook" ? "#c8b898" : "#5a6070";
    const ln = String(row + 1);
    drawTextRaw(ctx, ln, WALL_SIDE - 2 - ln.length * 4, y + 3);
    // syntax-coloured giant source
    ctx.globalAlpha = syn.alpha;
    let col = 0;
    const lead = src.length - src.trimStart().length;
    col = Math.min(8, lead);
    for (const tok of tokenize(src.trim())) {
      if (col >= maxChars) break;
      if (tok.k === "ws") { col += tok.t.length; continue; }
      const text = tok.t.slice(0, maxChars - col);
      ctx.fillStyle = syn[tok.k];
      drawTextRaw(ctx, text, x0 + col * 4 * sc, y, sc);
      col += text.length;
    }
  }
  ctx.globalAlpha = 1;
}

function bracketWalls(ctx: CanvasRenderingContext2D, pal: Pal, theme: ArenaTheme) {
  // walls built from brackets: { } along the top cap, } down the right wall, }; along the bottom
  ctx.globalAlpha = theme === "notebook" ? 0.5 : 0.45;
  ctx.fillStyle = pal.edge;
  for (let x = 2; x < ARENA_W - 4; x += 8) drawTextRaw(ctx, (x >> 3) % 2 ? "}" : "{", x, 0);
  for (let y = 10; y < ARENA_H - 8; y += 7) drawTextRaw(ctx, "}", ARENA_W - WALL_SIDE + 4, y);
  for (let x = 4; x < ARENA_W - 8; x += 8) drawTextRaw(ctx, (x >> 3) % 2 ? ";" : "}", x, ARENA_H - WALL_BOTTOM + 2);
  ctx.globalAlpha = 1;
}

function circuitTraces(ctx: CanvasRenderingContext2D, pal: Pal, R: () => number, theme: ArenaTheme, ambient: Ambient[]) {
  const n = theme === "web" ? 9 : 6;
  for (let i = 0; i < n; i++) {
    // start at a wall edge, run inward with 45-degree bends
    const side = Math.floor(R() * 4);
    let x = side === 0 ? WALL_SIDE + 1 : side === 1 ? ARENA_W - WALL_SIDE - 2 : Math.round(30 + R() * (ARENA_W - 60));
    let y = side === 2 ? WALL_TOP + 1 : side === 3 ? ARENA_H - WALL_BOTTOM - 2 : Math.round(40 + R() * (ARENA_H - 80));
    let dir = side === 0 ? 0 : side === 1 ? 4 : side === 2 ? 2 : 6; // 8 dirs, 0 = east
    const pts: [number, number][] = [[x, y]];
    const segs = 3 + Math.floor(R() * 4);
    for (let s = 0; s < segs; s++) {
      const len = 10 + Math.floor(R() * 34);
      const dx = Math.round(Math.cos((dir * Math.PI) / 4)), dy = Math.round(Math.sin((dir * Math.PI) / 4));
      const nx = x + dx * len, ny = y + dy * len;
      if (!inPlay(nx, ny, 4)) break;
      x = nx; y = ny;
      pts.push([x, y]);
      dir = (dir + (R() < 0.5 ? 1 : 7)) % 8;
      if (R() < 0.5) dir = (dir + (R() < 0.5 ? 1 : 7)) % 8;
    }
    if (pts.length < 2) continue;
    const traceCol = theme === "web" ? (i % 2 ? "#2a2a7a" : "#4a1f6a") : theme === "kernel" ? "#5a4a2e" : "#123d20";
    ctx.fillStyle = pal.grout;
    for (let k = 1; k < pts.length; k++) line(ctx, pts[k - 1][0] + 1, pts[k - 1][1] + 1, pts[k][0] + 1, pts[k][1] + 1);
    ctx.fillStyle = traceCol;
    for (let k = 1; k < pts.length; k++) line(ctx, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]);
    const [ex, ey] = pts[pts.length - 1];
    ctx.fillStyle = pal.grout; disc(ctx, ex, ey, 2.5);
    ctx.fillStyle = traceCol; disc(ctx, ex, ey, 1.5);
    ctx.fillStyle = theme === "kernel" ? "#c8a050" : pal.accent2; ctx.fillRect(ex, ey, 1, 1);
    ambient.push({ k: "trace", pts, c: i % 2 ? pal.accent : pal.accent2, speed: 30 + R() * 40, ph: R() * 10, len: 0 });
  }
  for (const a of ambient) if (a.k === "trace") { let L = 0; for (let k = 1; k < a.pts.length; k++) L += Math.max(Math.abs(a.pts[k][0] - a.pts[k - 1][0]), Math.abs(a.pts[k][1] - a.pts[k - 1][1])); a.len = L; }
}

// ---------- small prop sprites ----------
function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, outline = "#07040c", hi?: string) {
  ctx.fillStyle = outline; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  if (hi) { ctx.fillStyle = hi; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h); }
}

function crt(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, shell: string, shellHi: string, screenBg: string, c: string, style: "code" | "sheet" | "cursor" | "graph", ambient: Ambient[], R: () => number) {
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x + 1, y + h + 2, w + 2, 3);
  box(ctx, x, y, w + 4, h + 4, shell, "#07040c", shellHi);
  ctx.fillStyle = "#07040c"; ctx.fillRect(x + 2, y + 2, w, h);
  ctx.fillStyle = screenBg; ctx.fillRect(x + 2, y + 2, w, h);
  ctx.fillStyle = shellHi; ctx.fillRect(x + w + 1, y + h + 2, 1, 1);
  ambient.push({ k: "screen", x: x + 2, y: y + 2, w, h, c, bg: screenBg, ph: R() * 10, style });
}

function floorProps(ctx: CanvasRenderingContext2D, theme: ArenaTheme, pal: Pal, R: () => number, ambient: Ambient[], seed: number) {
  const L = WALL_SIDE + 4, Rt = ARENA_W - WALL_SIDE - 4, B = ARENA_H - WALL_BOTTOM - 4;
  switch (theme) {
    case "terminal": {
      // CRT terminals in the corners + server rack along bottom corners
      crt(ctx, L + 2, B - 22, 24, 16, "#2a332d", "#4a5a50", "#03130a", pal.accent, "code", ambient, R);
      crt(ctx, Rt - 32, B - 22, 24, 16, "#2a332d", "#4a5a50", "#03130a", pal.accent, "cursor", ambient, R);
      // keyboard
      box(ctx, L + 4, B - 3, 22, 3, "#1d2620", "#07040c", "#33443a");
      // matrix rain columns on the floor (very dim)
      for (let i = 0; i < 18; i++) ambient.push({ k: "rain", x: WALL_SIDE + 8 + Math.floor(R() * 114) * 4, speed: 18 + R() * 30, ph: R() * 50, len: 5 + Math.floor(R() * 8), glyphs: "01{};<>/#*=$" });
      break;
    }
    case "kernel": {
      // floor grates with fire glow beneath
      for (let i = 0; i < 3; i++) {
        const gx = 64 + Math.floor(R() * 11) * 32, gy = WALL_TOP + 26 + Math.floor(R() * 6) * 32;
        if (Math.abs(gx - 300) < 70 && Math.abs(gy - 144) < 60) continue;
        box(ctx, gx, gy, 24, 14, "#120c0a", "#07040c");
        ambient.push({ k: "grate", x: gx, y: gy, w: 24, h: 14, ph: R() * 10 });
      }
      // hazard stripes near bottom wall
      for (let x = WALL_SIDE; x < ARENA_W - WALL_SIDE; x++)
        for (let y = B - 2; y < B + 4; y++) { ctx.fillStyle = ((x + y) >> 2) % 2 ? "#d8a520" : "#1a1612"; ctx.globalAlpha = 0.65; ctx.fillRect(x, y, 1, 1); }
      ctx.globalAlpha = 1;
      // fan
      ctx.fillStyle = "#07040c"; disc(ctx, Rt - 20, B - 24, 14);
      ctx.fillStyle = "#3a3330"; disc(ctx, Rt - 20, B - 24, 13);
      ctx.fillStyle = "#120c0a"; disc(ctx, Rt - 20, B - 24, 11);
      ambient.push({ k: "fan", x: Rt - 20, y: B - 24, r: 10, ph: R() });
      // barrels
      for (const [bx, by] of [[L + 6, B - 18], [L + 20, B - 12]]) {
        ctx.fillStyle = "#07040c"; ctx.fillRect(bx - 1, by - 1, 12, 16);
        ctx.fillStyle = "#6a3a1e"; ctx.fillRect(bx, by, 10, 14);
        ctx.fillStyle = "#8a4e28"; ctx.fillRect(bx + 1, by, 3, 14);
        ctx.fillStyle = "#3a1f10"; ctx.fillRect(bx, by + 4, 10, 1); ctx.fillRect(bx, by + 10, 10, 1);
        ctx.fillStyle = "#ffd23f"; drawTextRaw(ctx, "!", bx + 4, by + 5);
      }
      ambient.push({ k: "led", x: L + 26, y: B - 4, c: "#ff3a2a", period: 1.2, ph: 0, duty: 0.5 });
      break;
    }
    case "web": {
      // holo floor tiles marking hot spots
      for (let i = 0; i < 2; i++) {
        const hx = i ? Rt - 40 : L + 10, hy = B - 30;
        ctx.globalAlpha = 0.5; ctx.fillStyle = i ? pal.accent2 : pal.accent;
        for (let k = 0; k < 6; k++) { ctx.fillRect(hx, hy + k * 5, 30, 1); }
        ctx.globalAlpha = 1;
      }
      break;
    }
    case "notebook": {
      // ink plots on the "paper": scatter + a sine curve that draws itself
      const px = 60 + Math.round(R() * 20), py = ARENA_H - 70;
      ctx.fillStyle = "#2b3550";
      ctx.fillRect(px, py - 34, 1, 36); ctx.fillRect(px, py + 1, 70, 1);
      for (let k = 0; k < 7; k++) ctx.fillRect(px + 2 + k * 10, py + 2, 1, 2);
      const pts: [number, number][] = [];
      for (let k = 0; k <= 64; k++) pts.push([px + 2 + k, py - 14 - Math.round(Math.sin(k / 8 + seed) * 10 + Math.sin(k / 3) * 2)]);
      ambient.push({ k: "plot", pts, c: "#e0574a", ph: R() * 10 });
      for (let k = 0; k < 18; k++) { ctx.fillStyle = "#3b6fd8"; const sx = px + 4 + R() * 62, sy = py - 4 - R() * 26; ctx.fillRect(Math.round(sx), Math.round(sy), 2, 2); }
      // histogram top right
      const hx = ARENA_W - 110, hy = WALL_TOP + 50;
      ctx.fillStyle = "#2b3550"; ctx.fillRect(hx, hy, 60, 1);
      for (let k = 0; k < 8; k++) {
        const h = Math.round(4 + Math.exp(-((k - 3.5) ** 2) / 4) * 22 + R() * 3);
        ctx.fillStyle = "#2b3550"; ctx.fillRect(hx + 2 + k * 7, hy - h, 6, h);
        ctx.fillStyle = k % 2 ? "#3b6fd8" : "#5b8ae8"; ctx.fillRect(hx + 3 + k * 7, hy - h + 1, 4, h - 1);
      }
      // coffee ring
      ctx.fillStyle = "#6a4a2a"; ctx.globalAlpha = 0.5;
      for (let a = 0; a < 80; a++) { if (a % 9 === 0) continue; const ang = (a / 80) * Math.PI * 2; ctx.fillRect(Math.round(120 + Math.cos(ang) * 11), Math.round(64 + Math.sin(ang) * 10), 1, 1 + (a % 3 === 0 ? 1 : 0)); }
      ctx.globalAlpha = 1;
      // sticky notes
      const notes: [number, number, string, string][] = [[L + 6, WALL_TOP + 8, "#ffe36e", "TODO"], [Rt - 30, B - 26, "#ff9ec7", "FIXME"], [Rt - 50, WALL_TOP + 12, "#9ef0ff", "WIP"]];
      for (const [nx, ny, col, txt] of notes) {
        ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(nx + 2, ny + 2, 24, 18);
        box(ctx, nx, ny, 24, 18, col, "#5a4a30");
        ctx.fillStyle = "#2b3550"; drawTextRaw(ctx, txt, nx + 2, ny + 3);
        ctx.fillRect(nx + 2, ny + 10, 14, 1); ctx.fillRect(nx + 2, ny + 13, 18, 1);
      }
      // In [*]: cell markers in the margin
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = "#3b6fd8"; drawTextRaw(ctx, "IN[" + (k + 1) + "]", 14, WALL_TOP + 30 + k * 56);
      }
      ambient.push({ k: "screen", x: 14, y: WALL_TOP + 30 + 4 * 56, w: 28, h: 5, c: "#e0574a", bg: "", ph: 0, style: "cursor" });
      break;
    }
    case "enterprise": {
      // cubicle desks with monitors in the bottom corners, plants, water cooler
      for (const dx of [L + 4, Rt - 52]) {
        box(ctx, dx, B - 18, 48, 16, "#8a7458", "#07040c", "#a88e6c");
        ctx.fillStyle = "#6a5842"; ctx.fillRect(dx, B - 4, 48, 2);
        crt(ctx, dx + 14, B - 36, 18, 12, "#2a2e38", "#545a6a", "#16305a", pal.accent, "sheet", ambient, R);
        ctx.fillStyle = "#c9c9c9"; ctx.fillRect(dx + 6, B - 12, 8, 3); // paper
        ctx.fillStyle = "#ffffff"; ctx.fillRect(dx + 36, B - 14, 6, 6); // mug
        ctx.fillStyle = "#c04a3a"; ctx.fillRect(dx + 36, B - 14, 6, 2);
      }
      // plants
      for (const px of [L + 64, Rt - 70]) {
        box(ctx, px, B - 10, 10, 8, "#8a5a3a", "#07040c", "#a87050");
        ctx.fillStyle = "#07040c"; disc(ctx, px + 5, B - 16, 7);
        ctx.fillStyle = "#3a7a3a"; disc(ctx, px + 5, B - 16, 6);
        ctx.fillStyle = "#5aa04a"; disc(ctx, px + 3, B - 18, 3);
        ctx.fillStyle = "#8ad06a"; ctx.fillRect(px + 2, B - 20, 1, 1);
      }
      // carpet "synergy" logo
      ctx.globalAlpha = 0.25; ctx.fillStyle = "#3a3830";
      drawTextRaw(ctx, "Q3 SYNERGY", 240 - 38, ARENA_H - 30, 2);
      ctx.globalAlpha = 1;
      break;
    }
    case "legacy": {
      // broken pillars in corners, half-buried CRT, rubble
      for (const [px, py] of [[L + 4, B - 30], [Rt - 22, B - 30], [L + 4, WALL_TOP + 6]]) {
        ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(px + 2, py + 26, 18, 4);
        box(ctx, px, py + 4, 16, 24, "#6d7365", "#07040c", "#8c937f");
        ctx.fillStyle = "#4e5447"; ctx.fillRect(px + 12, py + 4, 4, 24);
        ctx.fillStyle = "#07040c"; ctx.fillRect(px + 4, py + 4, 1, 6); ctx.fillRect(px + 5, py + 10, 1, 4);
        ctx.fillStyle = "#4f6b2f"; ctx.fillRect(px, py + 18, 6, 10); ctx.fillStyle = "#6f8c3a"; ctx.fillRect(px + 1, py + 20, 3, 6);
        ctx.fillStyle = "#8c937f"; ctx.fillRect(px - 1, py + 2, 18, 3);
      }
      crt(ctx, Rt - 46, WALL_TOP + 8, 16, 11, "#8a8070", "#b0a690", "#0a1a10", "#5aff8a", "code", ambient, R);
      ctx.fillStyle = "#4f6b2f"; ctx.fillRect(Rt - 48, WALL_TOP + 22, 24, 3); // moss over it
      for (let i = 0; i < 12; i++) ambient.push({ k: "firefly", x: 30 + R() * 420, y: 40 + R() * 220, ph: R() * 20, c: pal.accent2 });
      // rubble
      for (let i = 0; i < 14; i++) {
        const rx = Math.round(L + R() * (Rt - L)), ry = Math.round(WALL_TOP + 6 + R() * (B - WALL_TOP - 6));
        if (Math.abs(rx - 300) < 80 && Math.abs(ry - 144) < 70) continue;
        ctx.fillStyle = "#07040c"; ctx.fillRect(rx - 1, ry - 1, 5, 4);
        ctx.fillStyle = "#6d7365"; ctx.fillRect(rx, ry, 3, 2);
        ctx.fillStyle = "#8c937f"; ctx.fillRect(rx, ry, 1, 1);
      }
      break;
    }
  }
}

function walls(ctx: CanvasRenderingContext2D, theme: ArenaTheme, pal: Pal, R: () => number, ambient: Ambient[], seed: number) {
  const W = ARENA_W, H = ARENA_H;
  // shadow cast by the top wall onto the floor (dithered)
  ctx.fillStyle = "#000000";
  for (let y = WALL_TOP; y < WALL_TOP + 6; y++)
    for (let x = WALL_SIDE; x < W - WALL_SIDE; x++) if (bayer(x, y) < 0.6 - (y - WALL_TOP) * 0.1) ctx.fillRect(x, y, 1, 1);
  for (let x = WALL_SIDE; x < WALL_SIDE + 4; x++)
    for (let y = WALL_TOP; y < H - WALL_BOTTOM; y++) if (bayer(x, y) < 0.45 - (x - WALL_SIDE) * 0.1) ctx.fillRect(x, y, 1, 1);

  // top wall: cap (6px) + face
  const capH = 6;
  ctx.fillStyle = pal.cap; ctx.fillRect(0, 0, W, capH);
  ctx.fillStyle = pal.edge; ctx.fillRect(0, capH - 1, W, 1);
  ctx.fillStyle = pal.face; ctx.fillRect(WALL_SIDE, capH, W - 2 * WALL_SIDE, WALL_TOP - capH);
  ctx.fillStyle = pal.faceDark; ctx.fillRect(WALL_SIDE, WALL_TOP - 2, W - 2 * WALL_SIDE, 2);
  // sides + bottom caps
  ctx.fillStyle = pal.cap;
  ctx.fillRect(0, 0, WALL_SIDE, H); ctx.fillRect(W - WALL_SIDE, 0, WALL_SIDE, H); ctx.fillRect(0, H - WALL_BOTTOM, W, WALL_BOTTOM);
  ctx.fillStyle = pal.edge;
  ctx.fillRect(WALL_SIDE - 1, capH, 1, H - capH - WALL_BOTTOM + 1); ctx.fillRect(W - WALL_SIDE, capH, 1, H - capH - WALL_BOTTOM + 1);
  ctx.fillRect(WALL_SIDE - 1, H - WALL_BOTTOM, W - 2 * WALL_SIDE + 2, 1);
  ctx.fillStyle = "#07040c";
  ctx.fillRect(WALL_SIDE, H - WALL_BOTTOM + 1, W - 2 * WALL_SIDE, 1);

  // cap texture per theme
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const onCap = y < capH || x < WALL_SIDE - 1 || x > W - WALL_SIDE || y > H - WALL_BOTTOM + 1;
      if (!onCap) continue;
      const n = hash2(x >> 2, y >> 2, seed + 77);
      if (theme === "legacy" && n > 0.7) { ctx.fillStyle = n > 0.85 ? "#6f8c3a" : "#4f6b2f"; ctx.fillRect(x, y, 1, 1); }
      else if (theme === "kernel" && (x + y) % 8 === 0) { ctx.fillStyle = "#3e3935"; ctx.fillRect(x, y, 1, 1); }
      else if (theme === "web" && (x % 16 === 0 || y % 16 === 0)) { ctx.fillStyle = pal.edge; ctx.fillRect(x, y, 1, 1); }
      else if (theme === "terminal" && (x % 4 === 0 && y % 4 === 0)) { ctx.fillStyle = "#2a3a30"; ctx.fillRect(x, y, 1, 1); }
      else if (theme === "notebook" && hash2(x, y, 5) > 0.92) { ctx.fillStyle = "#5a473a"; ctx.fillRect(x, y, 1, 1); }
      else if (theme === "enterprise" && y % 3 === 0 && y < capH) { ctx.fillStyle = "#b0b8c8"; ctx.fillRect(x, y, 1, 1); }
    }

  // face decorations
  const fy = capH, fh = WALL_TOP - capH - 2;
  switch (theme) {
    case "terminal": {
      // rack units with LEDs + small green monitors
      for (let x = WALL_SIDE + 4; x < W - WALL_SIDE - 30; x += 34) {
        if (R() < 0.35) {
          crt(ctx, x + 2, fy + 2, 22, fh - 6, "#1d2620", "#33443a", "#021006", pal.accent, R() < 0.5 ? "code" : "graph", ambient, R);
        } else {
          box(ctx, x, fy + 2, 28, fh - 3, "#141c17", "#050806", "#26332b");
          for (let r = 0; r < 3; r++) {
            ctx.fillStyle = "#0a0f0c"; ctx.fillRect(x + 2, fy + 4 + r * 4, 16, 2);
            for (let k = 0; k < 3; k++) ambient.push({ k: "led", x: x + 20 + k * 2, y: fy + 4 + r * 4, c: k === 2 && R() < 0.3 ? "#ffb02e" : pal.accent, period: 0.3 + R() * 2.5, ph: R() * 5, duty: 0.2 + R() * 0.6 });
          }
        }
      }
      break;
    }
    case "kernel": {
      // pipes along the face
      for (const [py, col, hi] of [[fy + 3, "#8a4e28", "#c07a40"], [fy + 9, "#4a5560", "#7a8a98"]] as [number, string, string][]) {
        ctx.fillStyle = "#07040c"; ctx.fillRect(WALL_SIDE, py - 1, W - 2 * WALL_SIDE, 6);
        ctx.fillStyle = col; ctx.fillRect(WALL_SIDE, py, W - 2 * WALL_SIDE, 4);
        ctx.fillStyle = hi; ctx.fillRect(WALL_SIDE, py, W - 2 * WALL_SIDE, 1);
        for (let x = WALL_SIDE + 20 + Math.floor(R() * 20); x < W - WALL_SIDE; x += 50 + Math.floor(R() * 30)) {
          ctx.fillStyle = "#07040c"; ctx.fillRect(x - 1, py - 2, 6, 8);
          ctx.fillStyle = "#9a9088"; ctx.fillRect(x, py - 1, 4, 6);
        }
      }
      // gauges + status LEDs
      for (let x = 60; x < W - 60; x += 90 + Math.floor(R() * 40)) {
        ctx.fillStyle = "#07040c"; disc(ctx, x, fy + 7, 4.5);
        ctx.fillStyle = "#e8e0c8"; disc(ctx, x, fy + 7, 3.5);
        ctx.fillStyle = "#c02a1a"; line(ctx, x, fy + 7, x + 2, fy + 5);
        ambient.push({ k: "led", x: x + 8, y: fy + 4, c: R() < 0.5 ? "#ff3a2a" : "#ffd23f", period: 0.6 + R() * 1.5, ph: R() * 3, duty: 0.5 });
      }
      break;
    }
    case "web": {
      const signs = ["</>", "{ }", "=>", "NPM", "404", "<DIV>", "JS", "CSS"];
      let x = WALL_SIDE + 24 + Math.floor(R() * 20);
      while (x < W - 60) {
        R();
        const t = signs[Math.floor(hash2(x, seed, 31) * signs.length)];
        ambient.push({ k: "neon", x: x, y: fy + 3, text: t, c: R() < 0.5 ? pal.accent : pal.accent2, ph: R() * 10, scale: 2 });
        x += t.length * 8 + 40 + Math.floor(R() * 50);
      }
      // window strip of a cyber city
      break;
    }
    case "notebook": {
      // spiral binding rings
      for (let x = WALL_SIDE + 8; x < W - WALL_SIDE - 4; x += 12) {
        ctx.fillStyle = "#07040c"; ctx.fillRect(x - 1, fy, 6, fh + 1);
        ctx.fillStyle = "#9aa3ad"; ctx.fillRect(x, fy, 4, fh);
        ctx.fillStyle = "#d8dee6"; ctx.fillRect(x, fy, 1, fh);
        ctx.fillStyle = "#5a636d"; ctx.fillRect(x + 3, fy, 1, fh);
        ctx.fillStyle = "#120c08"; ctx.fillRect(x + 1, WALL_TOP - 3, 2, 2); // punch hole
      }
      break;
    }
    case "enterprise": {
      // windows with blinds + whiteboard + motivational poster
      for (let x = WALL_SIDE + 10; x < W - WALL_SIDE - 40; x += 70) {
        if (R() < 0.25) {
          box(ctx, x, fy + 1, 40, fh - 2, "#e8ecf0", "#5a6070", "#ffffff");
          ctx.fillStyle = "#3a6ad8"; for (let k = 0; k < 4; k++) ctx.fillRect(x + 3 + k * 6, fy + 3 + k * 2, 10, 2);
          ctx.fillStyle = "#d84a3a"; ctx.fillRect(x + 28, fy + 4, 8, 2);
          continue;
        }
        box(ctx, x, fy + 1, 40, fh - 2, "#7ab0e8", "#2a3242", "#a8d0f8");
        for (let k = 2; k < fh - 2; k += 2) { ctx.fillStyle = "#c8d4e0"; ctx.fillRect(x, fy + 1 + k, 40, 1); }
        ctx.fillStyle = "#2a3242"; ctx.fillRect(x + 19, fy + 1, 2, fh - 2);
        ambient.push({ k: "fluoro", x, w: 40, ph: R() * 10 });
      }
      break;
    }
    case "legacy": {
      // stone bricks + vines + torches
      for (let y = fy; y < WALL_TOP - 2; y += 5)
        for (let x = WALL_SIDE + ((y / 5) % 2) * 6; x < W - WALL_SIDE; x += 12) {
          ctx.fillStyle = pal.faceDark; ctx.fillRect(x, y, 1, 5); ctx.fillRect(x, y + 4, 12, 1);
          ctx.fillStyle = "#3b4036"; ctx.fillRect(x + 1, y, 10, 1);
        }
      for (let x = WALL_SIDE + 40; x < W - 40; x += 100 + Math.floor(R() * 30)) {
        ctx.fillStyle = "#07040c"; ctx.fillRect(x - 2, fy + 6, 5, 9);
        ctx.fillStyle = "#6a4a2a"; ctx.fillRect(x - 1, fy + 8, 3, 7);
        ambient.push({ k: "flame", x, y: fy + 6, ph: R() * 10 });
      }
      for (let i = 0; i < 9; i++) {
        let vx = WALL_SIDE + Math.floor(R() * (W - 2 * WALL_SIDE));
        const len = 8 + Math.floor(R() * 22);
        for (let k = 0; k < len; k++) {
          ctx.fillStyle = k % 4 === 0 ? "#6f8c3a" : "#3f5a26";
          ctx.fillRect(vx, k, 1, 1);
          if (k % 4 === 2) { ctx.fillStyle = "#8aac4a"; ctx.fillRect(vx + (k % 8 < 4 ? 1 : -1), k, 1, 1); }
          if (R() < 0.25) vx += R() < 0.5 ? 1 : -1;
        }
        if (len > 22) ambient.push({ k: "drip", x: vx, y: len, ph: R() * 5 });
      }
      break;
    }
  }
}

// ---------- ambient animation ----------
export function drawAmbient(ctx: CanvasRenderingContext2D, layer: ArenaLayer, time: number) {
  const pal = layer.pal;
  for (const a of layer.ambient) {
    switch (a.k) {
      case "led": {
        const on = ((time + a.ph) / a.period) % 1 < a.duty;
        ctx.fillStyle = on ? a.c : "#1a1a1a";
        ctx.fillRect(a.x, a.y, 1, 1);
        if (on) drawGlow(ctx, a.x, a.y, a.c, 3, 0.7);
        break;
      }
      case "trace": {
        // a data pulse running along the trace
        const pos = ((time * a.speed + a.ph * 40) % (a.len + 60)) - 10;
        if (pos < 0 || pos > a.len) break;
        let acc = 0;
        for (let k = 1; k < a.pts.length; k++) {
          const [x0, y0] = a.pts[k - 1], [x1, y1] = a.pts[k];
          const seg = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
          if (pos <= acc + seg) {
            const f = (pos - acc) / seg;
            const px = Math.round(x0 + (x1 - x0) * f), py = Math.round(y0 + (y1 - y0) * f);
            const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
            ctx.fillStyle = a.c;
            ctx.fillRect(px - dx, py - dy, 1, 1);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(px, py, 1, 1);
            drawGlow(ctx, px, py, a.c, 5, 0.8);
            break;
          }
          acc += seg;
        }
        break;
      }
      case "rain": {
        const head = ((time * a.speed + a.ph * 10) % (ARENA_H + 80)) - 20;
        for (let k = 0; k < a.len; k++) {
          const y = Math.floor((head - k * 6) / 6) * 6;
          if (y < WALL_TOP || y > ARENA_H - WALL_BOTTOM - 6) continue;
          const g = a.glyphs[Math.floor(hash2(a.x, y, Math.floor(time * 4 + k)) * a.glyphs.length)];
          ctx.globalAlpha = k === 0 ? 0.55 : 0.28 * (1 - k / a.len);
          ctx.fillStyle = k === 0 ? "#b6ffc8" : pal.rainColor ?? pal.accent;
          drawTextRaw(ctx, g, a.x, y);
        }
        ctx.globalAlpha = 1;
        break;
      }
      case "screen": {
        if (a.bg) {
          const flick = hash2(Math.floor(time * 12), a.x) < 0.04;
          ctx.fillStyle = flick ? "#ffffff" : a.bg;
          ctx.globalAlpha = flick ? 0.25 : 1;
          ctx.fillRect(a.x, a.y, a.w, a.h);
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = a.c;
        if (a.style === "code") {
          const off = Math.floor(time * 3 + a.ph);
          for (let r = 0; r * 2 < a.h - 1; r++) {
            const len = Math.floor(hash2(r + off, 3) * (a.w - 4)) + 2;
            const ind = Math.floor(hash2(r + off, 4) * 3) * 2;
            ctx.fillRect(a.x + 1 + ind, a.y + 1 + r * 2, Math.min(len, a.w - 2 - ind), 1);
          }
        } else if (a.style === "sheet") {
          ctx.globalAlpha = 0.7;
          for (let r = 1; r < a.h - 1; r += 2) ctx.fillRect(a.x + 1, a.y + r, a.w - 2, 1);
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#ffffff";
          const cell = Math.floor(time * 2 + a.ph) % 12;
          ctx.fillRect(a.x + 1 + (cell % 4) * 4, a.y + 1 + Math.floor(cell / 4) * 2 * 2, 3, 1);
        } else if (a.style === "graph") {
          for (let k = 0; k < a.w - 2; k++) {
            const v = Math.sin((k + time * 12 + a.ph) * 0.5) * 0.5 + hash2(k + Math.floor(time * 6), 1) * 0.4;
            ctx.fillRect(a.x + 1 + k, a.y + Math.round(a.h / 2 + v * (a.h / 2 - 1)), 1, 1);
          }
        }
        if (a.style === "cursor" || a.style === "code") {
          if (Math.floor(time * 2 + a.ph) % 2) { ctx.fillStyle = a.style === "cursor" ? a.c : "#b6ffc8"; ctx.fillRect(a.x + (a.style === "cursor" && !a.bg ? a.w - 6 : 2), a.y + a.h - (a.bg ? 3 : 5), 3, a.bg ? 2 : 5); }
          if (a.style === "cursor" && a.bg) { ctx.fillStyle = a.c; drawTextRaw(ctx, "$", a.x + 2, a.y + 2); }
        }
        if (a.bg) drawGlow(ctx, a.x + a.w / 2, a.y + a.h / 2, a.c, Math.max(6, a.w * 0.6), 0.22 + 0.06 * Math.sin(time * 8 + a.ph));
        break;
      }
      case "flame": {
        const f = Math.sin(time * 13 + a.ph) * 0.5 + Math.sin(time * 7.3 + a.ph * 2) * 0.5;
        drawGlow(ctx, a.x, a.y, "#ff8a2a", 14 + Math.round(f * 2), 0.7);
        ctx.fillStyle = "#ff5a1a"; ctx.fillRect(a.x - 1, a.y - 3, 3, 3);
        ctx.fillStyle = "#ffd23f"; ctx.fillRect(a.x, a.y - 4 - (f > 0 ? 1 : 0), 1, 3);
        ctx.fillStyle = "#ffffff"; ctx.fillRect(a.x, a.y - 2, 1, 1);
        break;
      }
      case "firefly": {
        const x = a.x + Math.sin(time * 0.7 + a.ph) * 14 + Math.sin(time * 1.9 + a.ph * 2) * 4;
        const y = a.y + Math.cos(time * 0.5 + a.ph) * 10;
        const on = 0.5 + 0.5 * Math.sin(time * 3 + a.ph * 3);
        if (on < 0.25) break;
        ctx.fillStyle = a.c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
        drawGlow(ctx, x, y, a.c, 5, on);
        break;
      }
      case "neon": {
        const buzz = hash2(Math.floor(time * 15), Math.floor(a.ph * 100)) < 0.06 ? 0.25 : 1;
        const pulse = (0.75 + 0.25 * Math.sin(time * 3 + a.ph)) * buzz;
        const w = a.text.length * 4 * a.scale;
        drawGlow(ctx, a.x + w / 2, a.y + 5, a.c, 10 + w / 2, 0.5 * pulse);
        ctx.fillStyle = "#07040c"; drawTextRaw(ctx, a.text, a.x + 1, a.y + 1, a.scale);
        ctx.globalAlpha = 0.5 + 0.5 * pulse; ctx.fillStyle = a.c; drawTextRaw(ctx, a.text, a.x, a.y, a.scale);
        ctx.globalAlpha = pulse; ctx.fillStyle = "#ffffff";
        for (let i = 0; i < a.text.length; i++) drawTextRaw(ctx, a.text[i], a.x + i * 4 * a.scale + Math.floor(a.scale / 2), a.y + Math.floor(a.scale / 2), 1);
        ctx.globalAlpha = 1;
        break;
      }
      case "fan": {
        const ang = time * 9 + a.ph;
        ctx.fillStyle = "#5a524c";
        for (let k = 0; k < 4; k++) {
          const b = ang + (k * Math.PI) / 2;
          line(ctx, a.x, a.y, a.x + Math.cos(b) * a.r, a.y + Math.sin(b) * a.r, 2);
        }
        ctx.fillStyle = "#9a9088"; disc(ctx, a.x, a.y, 2);
        break;
      }
      case "grate": {
        const p = 0.5 + 0.5 * Math.sin(time * 2 + a.ph);
        ctx.fillStyle = p > 0.5 ? "#ff6a1a" : "#c8400f";
        for (let k = 2; k < a.h - 1; k += 3) ctx.fillRect(a.x + 2, a.y + k, a.w - 4, 1);
        ctx.fillStyle = "#07040c";
        for (let k = 4; k < a.w; k += 5) ctx.fillRect(a.x + k, a.y, 1, a.h);
        drawGlow(ctx, a.x + a.w / 2, a.y + a.h / 2, "#ff7a1a", 14, 0.4 + p * 0.4);
        if (hash2(Math.floor(time * 3), a.x) < 0.1) {
          ctx.fillStyle = "#ffd23f"; ctx.fillRect(a.x + 3 + Math.floor(hash2(Math.floor(time * 7), a.y) * (a.w - 6)), a.y - 1 - Math.floor((time * 20) % 6), 1, 1);
        }
        break;
      }
      case "drip": {
        const f = ((time * 0.6 + a.ph) % 1);
        const y = a.y + f * f * 30;
        if (y < WALL_TOP + 20) { ctx.fillStyle = "#7ac8ff"; ctx.fillRect(a.x, Math.round(y), 1, 2); }
        break;
      }
      case "plot": {
        // curve draws itself over 4s, holds, erases
        const cyc = (time * 0.25 + a.ph) % 1.5;
        const n = Math.min(a.pts.length, Math.floor(Math.min(1, cyc) * a.pts.length));
        ctx.fillStyle = a.c;
        for (let k = 1; k < n; k++) line(ctx, a.pts[k - 1][0], a.pts[k - 1][1], a.pts[k][0], a.pts[k][1]);
        if (n > 0 && n < a.pts.length) { const [x, y] = a.pts[n - 1]; ctx.fillStyle = "#2b3550"; ctx.fillRect(x, y - 2, 1, 5); }
        break;
      }
      case "fluoro": {
        const bad = hash2(Math.floor(time * 10), Math.floor(a.ph * 100)) < 0.03;
        if (!bad) drawGlow(ctx, a.x + a.w / 2, 30, "#fff4d0", 26, 0.18);
        break;
      }
    }
  }
}

export function themeAccent(theme: ArenaTheme) { return PALETTES[theme]?.accent ?? "#39ff6a"; }
void rgbToHex;
