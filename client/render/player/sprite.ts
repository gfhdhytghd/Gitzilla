// Procedural chibi hero sprites: paint into a color grid, auto 1px outline, rasterize once, cache.
import type { HeroLook } from "./look.ts";

export const SW = 26;          // sprite grid width
export const SH = 28;          // sprite grid height
export const CX = 13;          // body center column
/** Grid cell that maps onto (p.x, p.y). Feet end at grid row 26 => p.y + 7. */
export const ANCHOR_X = 13;
export const ANCHOR_Y = 19;

export type Expr = "normal" | "blink" | "hurt" | "ko";
export interface FrameSpec { pose: "idle" | "run"; i: number; expr: Expr }

class Grid {
  cells: (string | null)[] = new Array(SW * SH).fill(null);
  set(x: number, y: number, c: string) {
    if (x < 0 || y < 0 || x >= SW || y >= SH) return;
    this.cells[y * SW + x] = c;
  }
  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= SW || y >= SH) return null;
    return this.cells[y * SW + x];
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: string) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }
  /** Set only where already painted (clip to existing shape). */
  over(x: number, y: number, c: string) {
    if (this.get(x, y)) this.set(x, y, c);
  }
  rows(y0: number, rows: string[], x0: number, pal: Record<string, string>) {
    rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const ch = row[dx];
        if (ch !== "." && ch !== " " && pal[ch]) this.set(x0 + dx, y0 + dy, pal[ch]);
      }
    });
  }
}

// Head silhouette: [x0, x1] per row (r = 0..9), facing right.
const HEAD: [number, number][] = [
  [9, 16], [8, 17], [7, 18], [7, 18], [7, 18], [7, 18], [7, 18], [7, 18], [8, 17], [9, 16],
];
const HEAD_TOP = 9;

function paintHero(L: HeroLook, f: FrameSpec): Grid {
  const g = new Grid();
  const c = L.c;
  const run = f.pose === "run";
  const hd = f.pose === "idle" ? (f.i === 1 ? 1 : 0) : (f.i % 2 === 1 ? -1 : 0); // head dy
  const bd = run && f.i % 2 === 1 ? -1 : 0;                                       // body dy
  const ht = HEAD_TOP + hd;

  // ---------- behind: back items, long hair ----------
  if (L.back === "cape") {
    const flap = run ? (f.i % 2 === 0 ? 2 : 1) : f.i === 1 ? 0 : 0;
    for (let y = 19; y <= 25; y++) {
      const t = y - 19;
      const x0 = 8 - Math.floor((t * (1 + flap)) / 4);
      g.rect(x0, y + bd, 10, y + bd, t < 2 ? c.secondaryL : y === 25 ? c.secondaryD : c.secondary);
    }
    if (run) g.set(8 - flap - 1, 24 + bd, c.secondaryD);
  } else if (L.back === "laptop") {
    g.rect(5, 18 + bd, 9, 23 + bd, c.metalD);
    g.rect(5, 18 + bd, 9, 18 + bd, c.metal);
    g.rect(5, 19 + bd, 5, 23 + bd, c.metal);
    g.set(7, 20 + bd, c.accentL); // glowing logo
    g.set(6, 22 + bd, L.stickers[0]?.[2] ?? c.secondary);
    g.set(8, 22 + bd, L.stickers[1]?.[2] ?? c.secondaryL);
    if (L.stickers[2]) g.set(6, 19 + bd, L.stickers[2][2]);
  } else if (L.back === "scarf") {
    const wave = run ? (f.i % 2) : 0;
    g.rect(6, 19 + bd, 9, 19 + bd, c.secondary);
    g.rect(5 - wave, 20 + bd, 8, 20 + bd, c.secondaryD);
    g.set(4 - wave, 21 + bd + wave, c.secondaryD);
  } else if (L.back === "jetpack") {
    g.rect(5, 18 + bd, 6, 23 + bd, c.metal);
    g.rect(7, 18 + bd, 8, 23 + bd, c.metalD);
    g.rect(5, 18 + bd, 8, 18 + bd, c.metalL);
    g.set(6, 20 + bd, c.accentL); g.set(7, 21 + bd, c.secondary);
    // exhaust flame flickers per frame
    const fl = (f.i % 2 === 0) ? 2 : 1;
    g.rect(5, 24 + bd, 8, 24 + bd, "#ff9a3c");
    g.rect(6, 25 + bd, 7, 24 + bd + fl, "#ffe45c");
  } else if (L.back === "shield") {
    // round shield slung on the back, covered in stickers
    const rows: [number, number][] = [[6, 8], [5, 9], [5, 9], [5, 9], [5, 9], [6, 8]];
    rows.forEach(([x0, x1], i) => g.rect(x0 - 1, 18 + i + bd, x1 - 1, 18 + i + bd, i === 0 ? c.primaryL : c.primary));
    g.rect(4, 20 + bd, 4, 21 + bd, c.primaryD);
    g.set(6, 20 + bd, c.metalL);
    for (const [sx, sy, col] of L.stickers) g.set(5 + sx, 19 + sy + bd, col);
  } else if (L.back === "tail") {
    const sw = run ? (f.i % 2) : (f.i === 1 ? 1 : 0);
    const tc = L.headgear === "hair" || L.headgear === "beanie" ? c.hair : c.primary;
    g.rect(7, 23 + bd, 9, 23 + bd, tc);
    g.rect(5, 22 + bd, 6, 22 + bd, tc);
    g.rect(4, 20 + bd - sw, 4, 21 + bd, tc);
    g.set(4, 19 + bd - sw, c.white);
  }
  const hasHair = L.headgear !== "helmet" && L.headgear !== "hood";
  if (hasHair && L.hairStyle === 2) g.rect(6, ht + 4, 9, 22 + bd, c.hairD);
  if (hasHair && L.hairStyle === 3) {
    const sw = run ? (f.i % 2) : f.i;
    g.rect(4 - sw, ht + 3, 6, ht + 4, c.hair);
    g.rect(3 - sw, ht + 5, 5 - sw, ht + 8, c.hairD);
  }

  // ---------- back arm ----------
  const sleeve = bodyColors(L).main;
  const armSwing = run ? [0, 1, 0, -1][f.i % 4] : 0;
  g.rect(8 + armSwing, 20 + bd, 9 + armSwing, 21 + bd, shadeOf(L, sleeve));
  g.rect(8 + armSwing, 22 + bd, 9 + armSwing, 22 + bd, c.skinD);
  if (L.mug) {
    const mx = 5 + armSwing, my = 21 + bd;
    g.rect(mx, my, mx + 2, my + 2, "#f4f1ff");
    g.rect(mx, my, mx + 2, my, "#6b3f22");
    g.set(mx - 1, my + 1, "#f4f1ff");
    g.set(mx + 2, my + 2, L.stickers[0]?.[2] ?? c.accent);
  }

  // ---------- legs ----------
  const legs = legLayout(f);
  for (const [lx, lift, isBack] of legs) {
    const top = 24, bot = 26 - lift;
    g.rect(lx, top + (isBack ? 0 : 0), lx + 1, bot, isBack ? c.clothD : c.cloth);
    g.rect(lx, bot, lx + 2, bot, c.boot); // boot, toe points forward
  }

  // ---------- body ----------
  paintBody(g, L, bd, f);

  // ---------- head ----------
  for (let r = 0; r < 10; r++) {
    const [x0, x1] = HEAD[r];
    g.rect(x0, ht + r, x1, ht + r, c.skin);
  }
  // under-chin shade
  g.rect(9, ht + 9, 16, ht + 9, c.skinD);
  paintHead(g, L, ht, f, run);
  return g;
}

function legLayout(f: FrameSpec): [number, number, boolean][] {
  // [x, lift, isBack]
  if (f.pose === "idle") return [[10, 0, true], [13, 0, false]];
  switch (f.i % 4) {
    case 0: return [[9, 0, true], [14, 1, false]];
    case 1: return [[11, 1, true], [12, 0, false]];
    case 2: return [[13, 0, true], [10, 1, false]];
    default: return [[11, 0, true], [12, 1, false]];
  }
}

function bodyColors(L: HeroLook): { main: string; light: string; dark: string } {
  const c = L.c;
  switch (L.cls) {
    case "knight": return { main: c.metal, light: c.metalL, dark: c.metalD };
    case "heavy": return { main: c.primary, light: c.primaryL, dark: c.primaryD };
    case "engineer": return L.hoodie ? { main: c.secondary, light: c.secondaryL, dark: c.secondaryD } : { main: "#e9eef6", light: "#ffffff", dark: "#aeb8cc" };
    case "rogue": return L.hoodie ? { main: c.secondaryD, light: c.secondary, dark: c.outline === "" ? c.secondaryD : c.clothD } : { main: c.cloth, light: c.primaryD, dark: c.clothD };
    default: return L.hoodie ? { main: c.secondary, light: c.secondaryL, dark: c.secondaryD } : { main: c.primary, light: c.primaryL, dark: c.primaryD };
  }
}

function shadeOf(L: HeroLook, col: string): string {
  const b = bodyColors(L);
  return col === b.main ? b.dark : col;
}

let emblemCol = "";
let emblemY = 0;
function emblem(g: Grid, L: HeroLook, x: number, y: number, col: string) {
  const rows = L.emblem;
  const w = rows[0]?.length ?? 3;
  const tall = rows.length > 3;
  const x0 = w === 3 ? x : 13 - (w >> 1) - (w > 3 ? 0 : 0);
  const y0 = tall ? y - 1 : y;
  emblemCol = col; emblemY = y0;
  rows.forEach((row, dy) => { for (let dx = 0; dx < row.length; dx++) if (row[dx] === "1") g.set(x0 + dx, y0 + dy, col); });
}
function emblemRedraw(g: Grid, L: HeroLook) {
  if (L.emblem.length <= 3 || !emblemCol) return;
  const w = L.emblem[0].length, x0 = 13 - (w >> 1);
  L.emblem.forEach((row, dy) => { for (let dx = 0; dx < row.length; dx++) if (row[dx] === "1") g.set(x0 + dx, emblemY + dy, emblemCol); });
}

function paintBody(g: Grid, L: HeroLook, bd: number, f: FrameSpec) {
  emblemCol = "";
  const c = L.c;
  const b = bodyColors(L);
  const y0 = 19 + bd, y1 = 23 + bd;
  switch (L.cls) {
    case "heavy": {
      g.rect(8, y0, 17, y1, b.main);
      g.rect(8, y0, 17, y0, b.dark);           // neck shadow
      g.rect(8, y1, 17, y1, b.dark);
      g.rect(10, y0 + 1, 15, y0 + 3, c.metal);  // chest plate
      g.rect(10, y0 + 1, 15, y0 + 1, c.metalL);
      emblem(g, L, 12, y0 + 1, c.accent);
      // pauldrons
      g.rect(6, y0 - 1, 9, y0 + 1, c.metal);
      g.rect(6, y0 - 1, 9, y0 - 1, c.metalL);
      g.rect(15, y0 - 1, 18, y0 + 1, c.metal);
      g.rect(15, y0 - 1, 18, y0 - 1, c.metalL);
      g.set(7, y0, c.primary); g.set(17, y0, c.primary);
      g.rect(8, y1 - 1, 17, y1 - 1, c.wood); // belt
      g.set(13, y1 - 1, c.accentL);
      break;
    }
    case "knight": {
      g.rect(9, y0, 16, y1, b.main);
      g.rect(9, y0, 16, y0, b.dark);
      g.rect(9, y0 + 1, 9, y1, b.light);
      g.rect(16, y0 + 1, 16, y1, b.dark);
      g.rect(11, y0 + 1, 15, y1, c.primary);    // tabard
      g.rect(11, y0 + 1, 15, y0 + 1, c.primaryL);
      emblem(g, L, 12, y0 + 1, c.accentL);
      g.rect(9, y1 - 1, 16, y1 - 1, c.wood);
      g.set(13, y1 - 1, c.accentL);
      break;
    }
    case "mage": {
      // robe flares out and covers upper legs
      g.rect(9, y0, 16, y1, c.primary);
      g.rect(8, y1 - 1, 17, y1 + 1, c.primary);
      g.rect(8, y1 + 1, 17, y1 + 1, c.secondary);    // hem trim
      g.rect(9, y0, 16, y0, c.primaryD);
      g.rect(9, y0 + 1, 9, y1, c.primaryL);
      g.rect(12, y0 + 1, 13, y1 + 1, c.secondaryD);  // front panel
      g.rect(9, y0 + 3, 16, y0 + 3, c.secondary);     // sash
      g.set(14, y0 + 3, c.accentL);
      g.set(15, y0 + 1, c.accent); // little gem
      break;
    }
    case "engineer": {
      g.rect(9, y0, 16, y1, b.main);
      g.rect(9, y0, 16, y0, b.dark);
      g.rect(9, y0 + 1, 9, y1, b.light);
      if (!L.hoodie) {
        g.rect(12, y0, 14, y1, c.primary);           // shirt under lab coat
        emblem(g, L, 12, y0 + 1, c.primaryL);
        g.rect(15, y0 + 2, 16, y0 + 2, b.dark);      // pocket
        g.set(16, y0 + 1, c.accent);                 // pen
        g.rect(9, y1, 16, y1, b.dark);
      } else {
        g.rect(11, y0 + 3, 15, y0 + 4, b.dark);     // kangaroo pocket
        g.set(12, y0 + 1, c.white); g.set(14, y0 + 1, c.white); // drawstrings
        emblem(g, L, 12, y0 + 1, c.accentL);
      }
      break;
    }
    case "rogue": {
      g.rect(9, y0, 16, y1, b.main);
      g.rect(9, y0, 16, y0, b.dark);
      // diagonal sash
      for (let i = 0; i < 5; i++) g.set(10 + i + 1, y0 + i, c.secondary), g.set(10 + i + 2, y0 + i, c.secondaryD);
      g.rect(9, y1 - 1, 16, y1 - 1, c.wood);
      g.set(15, y1 - 1, c.metalL);
      g.rect(9, y1 - 2, 10, y1 - 1, c.woodL); // pouch
      emblem(g, L, 12, y0 + 1, c.accent);
      break;
    }
    default: { // ranger
      g.rect(9, y0, 16, y1, b.main);
      g.rect(9, y0, 16, y0, b.dark);
      g.rect(9, y0 + 1, 9, y1, b.light);
      g.rect(16, y0 + 1, 16, y1, b.dark);
      if (L.hoodie) {
        g.rect(11, y0 + 3, 15, y0 + 4, b.dark);
        g.set(12, y0 + 1, c.white); g.set(14, y0 + 1, c.white);
        emblem(g, L, 12, y0 + 1, c.accentL);
      } else {
        g.rect(9, y1 - 1, 16, y1 - 1, c.wood);   // belt
        g.set(13, y1 - 1, c.metalL);
        emblem(g, L, 12, y0 + 1, c.accentL);
        g.rect(9, y1, 16, y1, b.dark);
      }
      break;
    }
  }
  emblemRedraw(g, L);
  void f;
}

function paintEyes(g: Grid, L: HeroLook, ht: number, e: Expr, glow?: string) {
  const c = L.c;
  const y = ht + 5;
  const col = glow ?? c.eye;
  if (e === "blink") {
    g.rect(13, y + 1, 14, y + 1, col);
    g.rect(16, y + 1, 17, y + 1, col);
  } else if (e === "hurt") {
    g.set(13, y - 1, col); g.set(14, y, col); g.set(13, y + 1, col);
    g.set(17, y - 1, col); g.set(16, y, col); g.set(17, y + 1, col);
  } else if (e === "ko") {
    for (const ex of [13, 16]) {
      g.set(ex, y - 1, col); g.set(ex + 1, y, col); g.set(ex + 2, y + 1, col);
      g.set(ex + 2, y - 1, col); g.set(ex, y + 1, col);
    }
  } else {
    g.rect(13, y, 14, y + 1, col);
    g.rect(16, y, 17, y + 1, col);
    if (!glow) { g.set(13, y, c.white); g.set(16, y, c.white); }
  }
}

function paintHair(g: Grid, L: HeroLook, ht: number, f: FrameSpec, coverTop: boolean) {
  const c = L.c;
  if (coverTop) {
    for (let r = 0; r < 4; r++) {
      const [x0, x1] = HEAD[r];
      g.rect(x0, ht + r, x1, ht + r, r === 0 ? c.hairL : c.hair);
    }
    // back of head hair + side lock
    g.rect(7, ht + 4, 10, ht + 7, c.hair);
    g.rect(7, ht + 7, 9, ht + 8, c.hairD);
    // bangs (front fringe, jagged)
    g.set(13, ht + 4, c.hair); g.set(14, ht + 4, c.hair); g.set(16, ht + 4, c.hair);
    g.set(18, ht + 4, c.hairD); g.set(18, ht + 5, c.hairD);
    g.rect(10, ht + 1, 12, ht + 1, c.hairL);
  }
  const s = L.hairStyle;
  if (s === 1) { // spiky
    for (const [x, y] of [[8, -1], [10, -2], [11, -1], [13, -2], [14, -1], [16, -1], [7, 0]]) g.set(x, ht + y, c.hair);
    g.set(10, ht - 2, c.hairL); g.set(13, ht - 2, c.hairL);
  } else if (s === 4) { // ahoge
    const sw = f.pose === "idle" && f.i === 1 ? 1 : 0;
    g.set(12, ht - 1, c.hair); g.set(13 + sw, ht - 2, c.hair); g.set(14 + sw, ht - 3, c.hairL);
  }
}

function paintHead(g: Grid, L: HeroLook, ht: number, f: FrameSpec, run: boolean) {
  const c = L.c;
  const e = f.expr;
  const face = () => {
    paintEyes(g, L, ht, e);
    if (e !== "ko" && !L.mask) g.set(18, ht + 7, c.blush);
  };
  switch (L.headgear) {
    case "helmet": {
      const heavy = L.cls === "heavy";
      const shell = heavy ? c.primary : c.metal;
      const shellL = heavy ? c.primaryL : c.metalL;
      const shellD = heavy ? c.primaryD : c.metalD;
      for (let r = 0; r < 10; r++) {
        const [x0, x1] = HEAD[r];
        g.rect(x0, ht + r, x1, ht + r, shell);
        g.set(x0, ht + r, shellD);
      }
      g.rect(9, ht, 15, ht, shellL);
      g.rect(8, ht + 1, 10, ht + 1, shellL);
      g.rect(7, ht + 2, 7, ht + 5, shellL);
      g.rect(9, ht + 9, 16, ht + 9, shellD);
      const vg = c.visor;
      if (heavy) {
        // metal faceplate with T visor
        g.rect(12, ht + 3, 18, ht + 8, c.metal);
        g.rect(12, ht + 3, 18, ht + 3, c.metalL);
        g.rect(12, ht + 5, 18, ht + 5, "#160f1f");
        g.rect(15, ht + 5, 15, ht + 8, "#160f1f");
        const glow = e === "hurt" || e === "ko" ? "#ff4a5a" : vg;
        if (e !== "blink") { g.set(13, ht + 5, glow); g.set(17, ht + 5, glow); }
        g.set(9, ht + 7, c.metalL); g.set(10, ht + 3, c.metalL);
      } else {
        // brow band in primary, visor slit
        g.rect(8, ht + 3, 18, ht + 3, c.primary);
        g.rect(11, ht + 4, 18, ht + 6, "#160f1f");
        g.rect(11, ht + 7, 18, ht + 7, c.metalD);
        if (e === "blink") {
          g.rect(13, ht + 5, 14, ht + 5, c.primaryD); g.rect(16, ht + 5, 17, ht + 5, c.primaryD);
        } else if (e === "hurt" || e === "ko") {
          g.set(13, ht + 4, "#ff4a5a"); g.set(14, ht + 5, "#ff4a5a"); g.set(17, ht + 4, "#ff4a5a"); g.set(16, ht + 5, "#ff4a5a");
        } else {
          g.rect(13, ht + 5, 14, ht + 5, vg); g.rect(16, ht + 5, 17, ht + 5, vg);
          g.set(13, ht + 4, c.accent); g.set(16, ht + 4, c.accent);
        }
        g.set(17, ht + 8, c.metalD); g.set(15, ht + 8, c.metalD);
      }
      if (L.topper === "none" || L.topper === "antenna") {
        if (L.crest === "plume") {
          const sw = run ? 1 : 0;
          g.rect(11, ht - 1, 13, ht - 1, c.secondary);
          g.rect(9 - sw, ht - 2, 12, ht - 2, c.secondaryL);
          g.rect(7 - sw, ht - 1, 9 - sw, ht - 1, c.secondary);
          g.rect(6 - sw, ht, 7 - sw, ht + 1, c.secondaryD);
          g.set(5 - sw * 2, ht + 2, c.secondaryD);
        } else if (L.crest === "horns") {
          g.rect(7, ht, 8, ht, "#e9e2cf"); g.set(7, ht - 1, "#fffaf0"); g.set(7, ht - 2, "#fffaf0");
          g.rect(17, ht, 18, ht, "#e9e2cf"); g.set(18, ht - 1, "#fffaf0"); g.set(18, ht - 2, "#fffaf0");
        } else if (L.crest === "fin") {
          g.rect(9, ht - 1, 14, ht - 1, c.primary);
          g.rect(10, ht - 2, 13, ht - 2, c.primaryL);
          g.set(9, ht - 2, c.primaryD);
        }
      }
      break;
    }
    case "hood": {
      const hc = L.hoodie ? c.secondary : c.primary;
      const hcL = L.hoodie ? c.secondaryL : c.primaryL;
      const hcD = L.hoodie ? c.secondaryD : c.primaryD;
      for (let r = 0; r < 10; r++) {
        const [x0, x1] = HEAD[r];
        g.rect(x0, ht + r, x1, ht + r, hc);
      }
      g.rect(9, ht, 15, ht, hcL);
      g.rect(8, ht + 1, 9, ht + 1, hcL);
      // face opening
      g.rect(12, ht + 3, 18, ht + 9, c.skin);
      g.rect(11, ht + 4, 11, ht + 8, c.skin);
      g.rect(11, ht + 3, 11, ht + 3, hcD);
      g.rect(12, ht + 3, 18, ht + 3, c.hair);       // fringe
      g.set(13, ht + 4, c.hair); g.set(15, ht + 4, c.hair); g.set(17, ht + 4, c.hairD);
      g.rect(10, ht + 3, 10, ht + 9, hcD);           // hood rim
      g.rect(12, ht + 9, 16, ht + 9, c.skinD);
      g.set(18, ht + 9, hc); g.set(17, ht + 9, hc);
      const sw = run ? 1 : 0;
      g.rect(5 - sw, ht + 2, 7, ht + 3, hc);         // hood tip flops back
      g.set(4 - sw, ht + 4, hcD);
      face();
      break;
    }
    case "wizard-hat": {
      paintHair(g, L, ht, f, true);
      face();
      const tip = run ? 1 : 0;
      g.rect(5, ht + 1, 20, ht + 2, c.primary);
      g.rect(5, ht + 2, 20, ht + 2, c.primaryD);
      g.rect(6, ht + 1, 19, ht + 1, c.primaryL);
      g.rect(8, ht, 17, ht, c.secondary);            // hat band
      g.set(15, ht, c.accentL);                     // buckle
      const cone: [number, number][] = [[9, 16], [9, 15], [10, 15], [10, 14], [10, 13], [9, 12], [7, 10]];
      cone.forEach(([x0, x1], i) => g.rect(x0 - (i > 4 ? tip : 0), ht - 1 - i, x1 - (i > 4 ? tip : 0), ht - 1 - i, i % 3 === 0 ? c.primaryL : c.primary));
      g.set(6 - tip, ht - 7, c.primaryD);
      g.set(5 - tip, ht - 6, c.accentL);            // tip star
      g.set(12, ht - 3, c.accentL); g.set(14, ht - 5, c.accent);
      break;
    }
    case "goggles": {
      paintHair(g, L, ht, f, true);
      face();
      g.rect(7, ht + 2, 18, ht + 2, "#2a2033");
      g.rect(12, ht + 1, 14, ht + 3, "#2a2033");
      g.rect(15, ht + 1, 17, ht + 3, "#2a2033");
      g.set(13, ht + 2, c.visor); g.set(16, ht + 2, c.visor);
      g.set(14, ht + 2, c.accent); g.set(17, ht + 2, c.accent);
      break;
    }
    case "bandana": {
      paintHair(g, L, ht, f, true);
      face();
      g.rect(7, ht + 3, 18, ht + 3, c.secondary);
      g.rect(8, ht + 2, 17, ht + 2, c.secondaryL);
      const sw = run ? (f.i % 2) + 1 : f.i;
      g.rect(5 - sw, ht + 3, 6, ht + 3, c.secondaryD);
      g.rect(4 - sw, ht + 4, 5 - sw, ht + 4, c.secondaryD);
      g.set(5, ht + 5 + (sw > 1 ? 0 : 1), c.secondary);
      if (L.mask) {
        g.rect(13, ht + 7, 18, ht + 9, "#2b2236");
        g.rect(13, ht + 7, 18, ht + 7, "#41354f");
      }
      break;
    }
    case "beanie": {
      paintHair(g, L, ht, f, true);
      face();
      // knit cap with fold + pompom
      for (let r = -1; r < 4; r++) {
        const [x0, x1] = r < 0 ? [10, 15] : HEAD[r];
        g.rect(x0, ht + r, x1, ht + r, r === 3 ? c.secondaryD : c.secondary);
      }
      for (let x = 8; x <= 17; x += 2) g.set(x, ht + 1, c.secondaryD); // knit ribs
      g.rect(7, ht + 3, 18, ht + 3, c.secondaryL);   // fold
      g.rect(7, ht + 4, 18, ht + 4, c.secondaryD);
      g.rect(11, ht - 3, 13, ht - 2, c.white);       // pompom
      g.set(13, ht - 2, "#d8d4e8");
      break;
    }
    default: { // bare hair
      paintHair(g, L, ht, f, true);
      face();
      break;
    }
  }

  // ---------- toppers ----------
  const top = L.topper;
  const capCol = L.headgear === "helmet" ? (L.cls === "heavy" ? c.primary : c.metal)
    : L.headgear === "hood" ? (L.hoodie ? c.secondary : c.primary)
    : L.headgear === "beanie" ? c.secondary : c.hair;
  if (top === "headphones") {
    const hidden = L.headgear === "wizard-hat";
    if (!hidden) {
      g.rect(9, ht - 1, 15, ht - 1, "#2a2033");
      g.set(8, ht, "#2a2033"); g.set(16, ht, "#2a2033");
      g.rect(9, ht, 9, ht + 3, "#2a2033");
    }
    g.rect(8, ht + 3, 10, ht + 6, c.secondaryD);
    g.rect(9, ht + 4, 10, ht + 5, c.accent);
    g.set(9, ht + 3, c.secondary);
  } else if (top === "catears") {
    g.rect(8, ht - 1, 10, ht - 1, capCol); g.rect(8, ht - 2, 9, ht - 2, capCol); g.set(8, ht - 3, capCol);
    g.rect(14, ht - 1, 16, ht - 1, capCol); g.rect(15, ht - 2, 16, ht - 2, capCol); g.set(16, ht - 3, capCol);
    g.set(9, ht - 1, c.blush); g.set(15, ht - 1, c.blush);
  } else if (top === "antenna") {
    g.rect(11, ht - 4, 11, ht - 1, "#2a2033");
    const on = f.pose === "idle" ? f.i === 0 : f.i % 2 === 0;
    g.rect(10, ht - 6, 12, ht - 5, on ? c.accentL : c.accent);
    if (on) g.set(10, ht - 6, c.white);
  } else if (top === "crown") {
    const gold = "#ffd23f", goldD = "#d18b1c";
    g.rect(9, ht - 1, 16, ht, gold);
    g.rect(9, ht, 16, ht, goldD);
    g.set(9, ht - 2, gold); g.set(12, ht - 2, gold); g.set(13, ht - 2, gold); g.set(16, ht - 2, gold);
    g.set(9, ht - 3, "#fff3b0"); g.set(16, ht - 3, "#fff3b0"); g.set(12, ht - 3, "#fff3b0");
    g.set(11, ht - 1, c.accent); g.set(14, ht - 1, "#ff4a7a");
  }
}

/** Generic outline: any empty cell 4-adjacent to paint becomes outline. */
function outline(g: Grid, col: string) {
  const add: number[] = [];
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    if (g.get(x, y)) continue;
    if (g.get(x - 1, y) || g.get(x + 1, y) || g.get(x, y - 1) || g.get(x, y + 1)) add.push(y * SW + x);
  }
  for (const i of add) g.cells[i] = col;
}

function raster(g: Grid): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = SW; cv.height = SH;
  const x = cv.getContext("2d")!;
  for (let i = 0; i < g.cells.length; i++) {
    const col = g.cells[i];
    if (!col) continue;
    x.fillStyle = col;
    x.fillRect(i % SW, (i / SW) | 0, 1, 1);
  }
  return cv;
}

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

/** 1px dilated flat-color silhouette (sprite + 1px border each side), drawn under the body as a rim/glow. */
export function heroRim(L: HeroLook, f: FrameSpec, color: string): HTMLCanvasElement {
  const k = L.key + "|" + f.pose + f.i + f.expr + "|rim" + color;
  let cv = frameCache.get(k);
  if (cv) return cv;
  const flat = heroFrame(L, f, color);
  cv = document.createElement("canvas");
  cv.width = SW + 2; cv.height = SH + 2;
  const g = cv.getContext("2d")!;
  for (const [ox, oy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) g.drawImage(flat, ox, oy);
  frameCache.set(k, cv);
  return cv;
}

/** Variant: "" normal, or a CSS color to flat-tint the silhouette (white flash, RGB split, ghosts). */
export function heroFrame(L: HeroLook, f: FrameSpec, variant = ""): HTMLCanvasElement {
  const k = L.key + "|" + f.pose + f.i + f.expr + "|" + variant;
  let cv = frameCache.get(k);
  if (cv) return cv;
  if (variant) {
    cv = tinted(heroFrame(L, f), variant);
  } else {
    const g = paintHero(L, f);
    outline(g, L.c.outline);
    cv = raster(g);
  }
  if (frameCache.size > 3000) frameCache.clear();
  frameCache.set(k, cv);
  return cv;
}
