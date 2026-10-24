// Hand-authored pixel weapons (pointing right). 'h' cells are the holding hand (skin) = pivot.
import type { WeaponKind } from "../../../shared/types.ts";
import type { HeroLook } from "./look.ts";
import { hashStr } from "./color.ts";
import { scale2x, shadePass, outlinePass, rasterCells, type Cells } from "./hires.ts";

// keys: M metal light, m metal, d metal dark, p primary, P primary light, s secondary,
//       a accent, A accent light (glow; rightmost A = muzzle), w wood, W wood light, k near-black, h hand,
//       b brace glow, C cursor white, c cursor shade, K keycap light
// Every weapon is a code object: a {}-braced pistol, a ;-magazine SMG, a mechanical-switch shotgun,
// a keycap cannon, a USB-stick staff (λ floats at the tip), a regex-ring emitter and a cursor-bar katana.
const ART: Record<WeaponKind, string[]> = {
  blaster: [
    "...b.....b..",
    "..bMMMMMMMbA",
    ".ppbmmmmmb..",
    ".phh........",
    "..hh........",
  ],
  smg: [
    "....MMMMMM..",
    "ddPmmmmmmmmA",
    "d..hhm.a....",
    "...hh..d....",
    "......d.....",
  ],
  shotgun: [
    ".......s......",
    "......sss.....",
    "......kkk.....",
    "WWWWwwmmmmmmmA",
    "ww..hhd.wwww..",
    "....hh........",
  ],
  cannon: [
    "....mmmmmmmm...",
    "...mKKKKKKKKm..",
    "kddmKKkkKKKKmAa",
    "...mKKKKKKKKmAa",
    "....dddddddd...",
    ".....hh........",
    ".....hh........",
  ],
  staff: [
    "..........pppMM.",
    "wWWWWhhWWWpPpMkA",
    "w.....hh..pppMM.",
  ],
  laser: [
    "...a..a..a...",
    "..MaMMaMMaMM.",
    "kdmAmmAmmAmmA",
    "..hhpa..a....",
    "..hh.........",
  ],
  blade: [
    "....s..........",
    "WkWksCCCCCCCCCA",
    ".hh.scccccccc..",
    ".hh.s..........",
  ],
};

export interface WeaponSprite {
  canvas: HTMLCanvasElement;
  px: number; py: number;     // pivot (hand) in 1x logical px
  tipX: number; tipY: number; // muzzle relative to pivot (1x logical px)
  res: number;                // canvas px per logical px (draw at canvas size / res)
}

const cache = new Map<string, WeaponSprite>();

export function weaponSprite(L: HeroLook, kind: WeaponKind, res = 1): WeaponSprite {
  const key = L.key + "|w|" + kind + "|" + L.etch + "|r" + res;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = L.c;
  const pal: Record<string, string> = {
    M: c.metalL, m: c.metal, d: c.metalD, p: c.primary, P: c.primaryL, s: c.secondary,
    a: c.accent, A: c.accentL, w: c.wood, W: c.woodL, k: "#1d1626", h: c.skin,
    b: c.accentL, C: "#ffffff", c: "#bcd6ff", K: "#eef0f6",
  };
  const rows = ART[kind] ?? ART.blaster;
  const w = Math.max(...rows.map((r) => r.length)) + 2, h = rows.length + 2;
  const grid: (string | null)[][] = Array.from({ length: h }, () => new Array(w).fill(null));
  let px = -1, py = -1, tipX = 0, tipY = 0;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ".") continue;
      grid[y + 1][x + 1] = pal[ch] ?? null;
      if (ch === "h" && px < 0) { px = x + 1; py = y + 1; }
      if ((ch === "A") && x + 1 >= tipX) { tipX = x + 1; tipY = y + 1; }
    }
  });
  // Real-code engraving: the repo's top token, hashed into a rune pattern along the main metal row,
  // plus one glowing accent pixel. Reads as a "code-etched" weapon skin at 1x.
  if (L.etch) {
    let bestRow = -1, bestCount = 0;
    rows.forEach((row, y) => {
      const n = [...row].filter((ch) => ch === "m" || ch === "W").length;
      if (n > bestCount) { bestCount = n; bestRow = y; }
    });
    if (bestRow >= 0 && bestCount >= 4) {
      const bits = hashStr(L.etch);
      const row = rows[bestRow];
      let i = 0, lit = false;
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== "m" && row[x] !== "W") continue;
        if ((bits >> i) & 1) grid[bestRow + 1][x + 1] = row[x] === "W" ? "#5e3a1f" : c.metalD;
        else if (!lit && i > 1) { grid[bestRow + 1][x + 1] = c.accentL; lit = true; }
        i++;
      }
    }
  }
  if (res > 1) {
    const flat: Cells = grid.flat();
    const cells = scale2x(flat, w, h);
    shadePass(cells, w * 2, h * 2);
    outlinePass(cells, w * 2, h * 2, c.outline);
    const ws2: WeaponSprite = { canvas: rasterCells(cells, w * 2, h * 2), px, py, tipX: tipX + 1 - px, tipY: tipY - py, res: 2 };
    cache.set(key, ws2);
    return ws2;
  }
  // outline
  const out: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (grid[y][x]) continue;
    if (grid[y]?.[x - 1] || grid[y]?.[x + 1] || grid[y - 1]?.[x] || grid[y + 1]?.[x]) out.push([x, y]);
  }
  for (const [x, y] of out) grid[y][x] = c.outline;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d")!;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const col = grid[y][x];
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }
  const ws: WeaponSprite = { canvas: cv, px, py, tipX: tipX + 1 - px, tipY: tipY - py, res: 1 };
  cache.set(key, ws);
  return ws;
}

/** Muzzle flash: tiny 4-point pixel star + additive glow, drawn in weapon-local space at the tip. */
export function drawMuzzle(ctx: CanvasRenderingContext2D, L: HeroLook, kind: WeaponKind, k: number): void {
  // k: 1 => fresh, 0 => gone
  const c = L.c;
  const big = kind === "cannon" || kind === "shotgun" ? 1 : 0;
  const len = Math.round((3 + big * 2) * (0.5 + k));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.55 * k;
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.arc(1, 0, 4 + big * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = c.accentL;
  ctx.fillRect(0, -1, len, 3);
  ctx.fillRect(1, -2, 1, 5);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, Math.max(1, len - 1), 1);
  if (kind === "shotgun") {
    ctx.fillStyle = c.accentL;
    ctx.fillRect(1, -3, 2, 1);
    ctx.fillRect(1, 3, 2, 1);
  }
}
