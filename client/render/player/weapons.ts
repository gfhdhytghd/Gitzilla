// Weapons v2: every weapon IS code. Silhouettes are built from big bold syntax-colored glyphs ({=>}, [ ],
// ;;, [*], λ, /.*/, // + a selected-text blade) plus an editor "plate" that shows the repo's real top token
// as readable letters. Pointing right; the hand is the pivot. Auto 1px outline; EPX 2x for edu heroes.
import type { WeaponKind } from "../../../shared/types.ts";
import { ELEMENTS, type HeroLook } from "./look.ts";
import { shade } from "./color.ts";
import { glyphBits } from "./font.ts";
import { scale2x, shadePass, outlinePass, rasterCells, type Cells } from "./hires.ts";

// Bold code glyphs, 7 rows tall (X = ink).
const BOLD: Record<string, string[]> = {
  "{": [".XX", "XX.", "XX.", "X..", "XX.", "XX.", ".XX"],
  "}": ["XX.", ".XX", ".XX", "..X", ".XX", ".XX", "XX."],
  "[": ["XXX", "XX.", "XX.", "XX.", "XX.", "XX.", "XXX"],
  "]": ["XXX", ".XX", ".XX", ".XX", ".XX", ".XX", "XXX"],
  "=": ["...", "...", "XXX", "...", "XXX", "...", "..."],
  ">": ["X..", "XX.", ".XX", "..X", ".XX", "XX.", "X.."],
  "<": ["..X", ".XX", "XX.", "X..", "XX.", ".XX", "..X"],
  ";": ["...", ".XX", ".XX", "...", ".XX", ".XX", "XX."],
  "/": ["..X", "..X", ".XX", ".X.", "XX.", "X..", "X.."],
  "*": [".....", "X.X.X", ".XXX.", "XXXXX", ".XXX.", "X.X.X", "....."],
  "0": [".XX.", "X..X", "X.XX", "XXXX", "XX.X", "X..X", ".XX."],
  "x": ["....", "....", "X..X", ".XX.", ".XX.", "X..X", "...."],
  "λ": ["XX...", ".XX..", "..X..", ".XXX.", ".X.X.", "XX.XX", "X...X"],
  "|": ["XX", "XX", "XX", "XX", "XX", "XX", "XX"],
};

export interface WeaponSprite {
  canvas: HTMLCanvasElement;
  px: number; py: number;     // pivot (hand) in 1x logical px
  tipX: number; tipY: number; // muzzle relative to pivot (1x logical px)
  res: number;                // canvas px per logical px (draw at canvas size / res)
}

/** The word shown on the weapon's editor plate: the repo's real top token, else a per-kind keyword. */
const DEFAULT_WORD: Record<WeaponKind, string> = {
  blaster: "IO", smg: "FOR", shotgun: "CASE", cannon: "0X", staff: "FN", laser: "RE", blade: "CUT",
};

export function weaponWord(L: HeroLook, kind: WeaponKind, max: number): string {
  const ok = (s: string) => s.length > 0 && s.length <= max && [...s].every((ch) => glyphBits(ch));
  const toks = [L.etch, ...L.tokens].map((s) => (s ?? "").trim());
  // prefer real words (fn, go, def, impl), then 2+ char operators (=>, ::, &mut), then anything
  const tok = toks.find((s) => s.length >= 2 && /[a-z]/i.test(s) && ok(s)) ?? toks.find((s) => s.length >= 2 && ok(s)) ?? toks.find(ok);
  return (tok ?? DEFAULT_WORD[kind].slice(0, max)).toUpperCase();
}

// Weapon skin (set per build from L.gear.wskin): classic dark plate, light-theme plate, neon (element glyphs), gilded.
let PLATE_BG = "#1d1f2b", PLATE_BOT = "#13141c", TEXT_DARKEN = false;
let GLYPH_OVR = "", GLYPH_OVR_TOP = "";
function setSkin(L: HeroLook | null) {
  const sk = L?.gear?.wskin ?? 0;
  const el = ELEMENTS[L?.gear?.element ?? "arcane"];
  PLATE_BG = sk === 1 ? "#e6eaf3" : "#1d1f2b";
  PLATE_BOT = sk === 1 ? "#aeb6c9" : "#13141c";
  TEXT_DARKEN = sk === 1;
  GLYPH_OVR = sk === 2 ? el.c : sk === 3 ? "#ffc94a" : "";
  GLYPH_OVR_TOP = sk === 2 ? el.cL : sk === 3 ? "#fff2b0" : "";
}

class WGrid {
  cells: Cells;
  /** text stamps, re-drawn unmirrored on the left-facing variant so words stay readable */
  stamps: { s: string; x: number; y: number; c: string; bg: string }[] = [];
  constructor(public w: number, public h: number) { this.cells = new Array(w * h).fill(null); }
  set(x: number, y: number, c: string) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y * this.w + x] = c; }
  rect(x: number, y: number, w: number, h: number, c: string) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  /** Bold glyph with a lighter top row for a bit of bevel. Returns its width. */
  glyph(ch: string, x: number, y: number, c: string, top = c): number {
    if (GLYPH_OVR) { c = GLYPH_OVR; top = GLYPH_OVR_TOP; }
    const rows = BOLD[ch];
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === "X") this.set(x + i, y + j, j === 0 ? top : c); });
    return rows[0].length;
  }
  /** 3x5 readable text (bg = what's behind it, used when re-stamping the mirrored variant). */
  text(s: string, x: number, y: number, c: string, bg = "") {
    this.stamps.push({ s, x, y, c, bg });
    [...s].forEach((ch, k) => {
      const b = glyphBits(ch) ?? glyphBits("?")!;
      for (let i = 0; i < 15; i++) if (b[i] === "1") this.set(x + k * 4 + (i % 3), y + ((i / 3) | 0), c);
    });
  }
  /** Dark editor plate (7 tall) with the word in syntax color; returns its width. */
  plate(word: string, x: number, y: number, txt: string, edge: string): number {
    const w = word.length * 4 + 3;
    this.rect(x, y, w, 7, PLATE_BG);
    this.rect(x, y, w, 1, GLYPH_OVR || edge);
    this.rect(x, y + 6, w, 1, PLATE_BOT);
    this.text(word, x + 2, y + 1, TEXT_DARKEN ? shade(txt, 1.4) : txt, PLATE_BG);
    return w;
  }
}

interface Built { g: WGrid; hand: [number, number]; tip: [number, number] }

const MARGIN = 2; // room for the outline (and the 2x outline)

function build(L: HeroLook, kind: WeaponKind): Built {
  const c = L.c, syn = L.syn;
  const skin = c.skin, wood = c.wood, metal = c.metal, metalD = c.metalD;
  const g = new WGrid(48, 20);
  const M = MARGIN;
  let hand: [number, number] = [M, M], tip: [number, number] = [M, M];
  switch (kind) {
    case "blaster": { // {TK}=>  pistol: brace frame, editor plate, arrow barrel
      const word = weaponWord(L, kind, 2);
      let x = M;
      x += g.glyph("{", x, M, syn.kw, c.white);
      x += g.plate(word, x, M, syn.str, syn.kw);
      x += g.glyph("}", x, M, syn.kw, c.white);
      x += g.glyph("=", x, M, syn.fn);
      x += g.glyph(">", x, M, syn.fn, c.white);
      g.rect(M + 1, M + 7, 3, 4, wood);     // grip
      g.rect(M + 1, M + 7, 2, 2, skin);     // hand
      hand = [M + 1, M + 7]; tip = [x, M + 3];
      break;
    }
    case "smg": { // < stock, FOR plate, = barrel, ;;; magazine
      const word = weaponWord(L, kind, 3).padEnd(3, " ");
      let x = M;
      x += g.glyph("<", x, M, syn.kw, c.white);
      const p0 = x;
      const pw = g.plate(word, x, M, syn.kw, syn.fn);
      x += pw;
      x += g.glyph("=", x, M, syn.fn);
      g.rect(x, M + 2, 4, 3, metal); g.rect(x, M + 2, 4, 1, c.metalL);
      x += 4;
      const mx = p0 + pw - 10;
      g.glyph(";", mx, M + 7, syn.str, c.white);
      g.glyph(";", mx + 3, M + 7, syn.str, c.white);
      g.glyph(";", mx + 6, M + 7, syn.str, c.white);
      g.rect(p0, M + 7, 3, 4, wood);
      g.rect(p0, M + 7, 2, 2, skin);
      hand = [p0, M + 7]; tip = [x, M + 3];
      break;
    }
    case "shotgun": { // [ ] stock + CASE plate (the pellets) + double barrel
      const word = weaponWord(L, kind, 4);
      let x = M;
      x += g.glyph("[", x, M, syn.kw, c.white);
      x += 1;
      x += g.glyph("]", x, M, syn.kw, c.white);
      const px0 = x;
      x += g.plate(word, x, M, syn.str, syn.type);
      g.rect(x, M + 1, 4, 2, metal); g.rect(x, M + 4, 4, 2, metal);
      g.rect(x, M + 1, 4, 1, c.metalL); g.rect(x, M + 4, 4, 1, c.metalL);
      x += 4;
      g.rect(px0 + 4, M + 7, 6, 2, wood);  // pump
      g.rect(px0 - 1, M + 7, 3, 4, wood);  // grip
      g.rect(px0 - 1, M + 7, 2, 2, skin);
      hand = [px0 - 1, M + 7]; tip = [x, M + 3];
      break;
    }
    case "cannon": { // fat barrel with the token etched + [*] pointer bore
      const word = weaponWord(L, kind, 4);
      let x = M;
      g.rect(x, M, 3, 9, metalD); g.rect(x, M, 3, 1, metal);  // breech
      x += 3;
      const pw = g.plate(word, x, M + 1, syn.num, syn.num);
      g.rect(x, M, pw, 1, metal); g.rect(x, M + 8, pw, 1, metalD);
      x += pw;
      x += g.glyph("[", x, M + 1, syn.num, c.white);
      x += g.glyph("*", x, M + 1, syn.type, c.white);
      x += g.glyph("]", x, M + 1, syn.num, c.white);
      g.rect(M + 6, M + 9, 3, 4, wood);
      g.rect(M + 6, M + 9, 2, 2, skin);
      hand = [M + 6, M + 9]; tip = [x, M + 4];
      break;
    }
    case "staff": { // | shaft with the token plate; the glowing λ head is drawn upright at the tip
      const word = weaponWord(L, kind, 3);
      let x = M;
      g.rect(x, M + 3, 6, 2, wood); g.rect(x, M + 3, 6, 1, c.woodL);
      x += 6;
      x += g.plate(word, x, M, syn.kw, syn.kw);
      g.rect(x, M + 3, 6, 2, wood); g.rect(x, M + 3, 6, 1, c.woodL);
      x += 6;
      g.glyph("|", x, M, c.accent, c.accentL);  // head socket
      x += 2;
      g.rect(M + 2, M + 3, 2, 2, skin);
      hand = [M + 2, M + 3]; tip = [x + 1, M + 3];
      break;
    }
    case "laser": { // RE plate body + /.*/ regex lens emitter
      const word = weaponWord(L, kind, 3);
      let x = M;
      g.rect(x, M + 2, 3, 4, metalD);
      x += 3;
      x += g.plate(word, x, M, syn.fn, syn.fn);
      x += g.glyph("/", x, M, c.accentL, c.white);
      g.text(".*", x, M + 1, syn.str);
      x += 7;
      x += g.glyph("/", x, M, c.accentL, c.white);
      g.rect(M + 4, M + 7, 3, 4, wood);
      g.rect(M + 4, M + 7, 2, 2, skin);
      hand = [M + 4, M + 7]; tip = [x, M + 3];
      break;
    }
    case "blade": { // grip + // comment guard + a "selected text" cursor blade carrying the token
      const word = weaponWord(L, kind, 4);
      let x = M;
      g.rect(x, M + 2, 4, 3, wood); g.rect(x + 1, M + 2, 1, 3, c.woodL);
      g.rect(x + 1, M + 2, 2, 2, skin);
      hand = [x + 1, M + 2];
      x += 4;
      x += g.glyph("/", x, M - 1, syn.com, c.white);
      x += g.glyph("/", x, M - 1, syn.kw, c.white);
      const bw = Math.max(13, word.length * 4 + 5);
      g.rect(x, M, bw, 6, "#dfe9ff");
      g.rect(x, M, bw, 1, "#ffffff");
      g.rect(x, M + 5, bw, 1, "#9fb4e6");
      g.text(word, x + 2, M, "#1d1f2b", "#dfe9ff");
      g.rect(x + bw, M + 1, 2, 4, "#dfe9ff");     // tapered tip
      g.set(x + bw + 2, M + 2, "#ffffff"); g.set(x + bw + 2, M + 3, "#dfe9ff");
      x += bw + 3;
      tip = [x, M + 3];
      break;
    }
  }
  return { g, hand, tip };
}

const cache = new Map<string, WeaponSprite>();

/**
 * `left` = the variant held when aiming left: the silhouette is mirrored but every word on it is re-stamped
 * unmirrored, so the code stays readable (draw it rotated by angle - PI, no flip). Pivot/tip are for that variant.
 */
export function weaponSprite(L: HeroLook, kind: WeaponKind, res = 1, left = false): WeaponSprite {
  const key = L.key + "|w2|" + kind + "|" + L.etch + "|" + L.tokens.join(" ") + "|r" + res + (left ? "|L" : "");
  const hit = cache.get(key);
  if (hit) return hit;
  setSkin(L);
  const { g, hand, tip } = build(L, kind);
  setSkin(null);
  // crop to content (+margin) so canvases stay small
  let x1 = 0, y1 = 0;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.cells[y * g.w + x]) { x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const w = Math.min(g.w, x1 + MARGIN + 1), h = Math.min(g.h, y1 + MARGIN + 1);
  let cells: Cells = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push(g.cells[y * g.w + x]);
  let hx = hand[0], tx = tip[0];
  if (left) {
    const m: Cells = new Array(w * h).fill(null);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + (w - 1 - x)] = cells[y * w + x];
    // re-stamp words so they still read left-to-right
    const tmp = new WGrid(w, h);
    tmp.cells = m;
    for (const st of g.stamps) {
      const tw = st.s.length * 4 - 1;
      const nx = w - st.x - tw;
      if (st.bg) tmp.rect(nx, st.y, tw, 5, st.bg);
      tmp.text(st.s, nx, st.y, st.c);
    }
    cells = tmp.cells;
    hx = w - hand[0] - 2;
    tx = w - tip[0];
  }
  let cv: HTMLCanvasElement;
  if (res > 1) {
    const big = scale2x(cells, w, h);
    shadePass(big, w * 2, h * 2);
    outlinePass(big, w * 2, h * 2, L.c.outline);
    cv = rasterCells(big, w * 2, h * 2);
  } else {
    outlinePass(cells, w, h, L.c.outline);
    cv = rasterCells(cells, w, h);
  }
  const ws: WeaponSprite = { canvas: cv, px: hx, py: hand[1], tipX: tx - hx, tipY: tip[1] - hand[1], res: res > 1 ? 2 : 1 };
  if (cache.size > 300) cache.clear();
  cache.set(key, ws);
  return ws;
}

/** Bold glyph as a canvas (outlined), e.g. the staff's upright glowing λ head. */
const glyphCache = new Map<string, HTMLCanvasElement>();
export function boldGlyph(ch: string, color: string, outline: string, top = color): HTMLCanvasElement {
  const key = ch + color + outline + top;
  let cv = glyphCache.get(key);
  if (cv) return cv;
  const k = ch in BOLD ? ch : "*";
  const rows = BOLD[k];
  const g = new WGrid(rows[0].length + 2, rows.length + 2);
  g.glyph(k, 1, 1, color, top);
  outlinePass(g.cells, g.w, g.h, outline);
  cv = rasterCells(g.cells, g.w, g.h);
  glyphCache.set(key, cv);
  return cv;
}

/** Muzzle flash: tiny 4-point pixel star + additive glow, drawn in weapon-local space at the tip. */
export function drawMuzzle(ctx: CanvasRenderingContext2D, L: HeroLook, kind: WeaponKind, k: number): void {
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
