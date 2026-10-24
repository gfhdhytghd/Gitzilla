// Tiny 3x5 pixel font. Each glyph = 5 rows, each row a 3-bit number (4 = left pixel, 1 = right).
import { makeCanvas } from "./pix.ts";
import { t } from '../../i18n';
import { nativeTextSprite, nativeTextWidth } from '../localized-text';

const G: Record<string, string> = {
  "0": "75557", "1": "26227", "2": "71747", "3": "71717", "4": "55711", "5": "74717", "6": "74757",
  "7": "71122", "8": "75757", "9": "75717",
  A: "25755", B: "65656", C: "34443", D: "65556", E: "74647", F: "74644", G: "34553", H: "55755",
  I: "72227", J: "11152", K: "55655", L: "44447", M: "57755", N: "65555", O: "25552", P: "65644",
  Q: "25563", R: "65655", S: "34216", T: "72222", U: "55557", V: "55552", W: "55775", X: "55255",
  Y: "55222", Z: "71247",
  " ": "00000", "-": "00700", "+": "02720", "!": "22202", "?": "61202", ".": "00002", ",": "00024",
  ":": "02020", ";": "02024", "/": "11244", "\\": "44211", "(": "24442", ")": "21112", "[": "64446",
  "]": "31113", "{": "32623", "}": "62326", "<": "12421", ">": "42124", "=": "07070", "#": "57575",
  "*": "05250", _: "00007", $: "36736", "%": "51245", "&": "25253", "@": "75747", "'": "22000",
  '"': "55000", "|": "22222", "~": "03600", "^": "25000", "`": "42000", "×": "05250",
  "λ": "42255", "Λ": "42255", "✓": "01152", "→": "01710", "←": "04740", "·": "00200", "☕": "07553",
};

export const FONT_W = 3, FONT_H = 5;

export function glyphRows(ch: string): number[] {
  const g = G[ch] ?? G[ch.toUpperCase()] ?? G["?"];
  return g.split("").map(Number);
}

export function textWidth(str: string, scale = 1): number {
  str = t(str);
  if (Array.from(str).some(ch => !G[ch] && !G[ch.toUpperCase()])) return nativeTextWidth(str, scale);
  return str.length ? (str.length * (FONT_W + 1) - 1) * scale : 0;
}

/** Draw raw glyph pixels (no cache) directly. */
export function drawTextRaw(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, scale = 1) {
  x = Math.round(x); y = Math.round(y);
  for (let i = 0; i < str.length; i++) {
    const rows = glyphRows(str[i]);
    for (let r = 0; r < 5; r++) {
      const bits = rows[r];
      for (let c = 0; c < 3; c++) if (bits & (4 >> c)) ctx.fillRect(x + (i * 4 + c) * scale, y + r * scale, scale, scale);
    }
  }
}

const cache = new Map<string, HTMLCanvasElement>();

/** Cached text sprite with optional 1px outline (outline is 1 logical px regardless of scale). */
export function textSprite(str: string, color: string, outline: string | null = "#07040c", scale = 1): HTMLCanvasElement {
  str = t(str);
  const key = str + "\u0000" + color + "\u0000" + outline + "\u0000" + scale;
  let c = cache.get(key);
  if (c) { cache.delete(key); cache.set(key, c); return c; }
  if (cache.size >= 600) cache.delete(cache.keys().next().value!);
  if (Array.from(str).some(ch => !G[ch] && !G[ch.toUpperCase()])) {
    const sprite = nativeTextSprite(str, color, outline, scale); cache.set(key, sprite); return sprite;
  }
  const pad = outline ? 1 : 0;
  const [cv, ctx] = makeCanvas(textWidth(str, scale) + pad * 2, FONT_H * scale + pad * 2);
  if (outline) {
    ctx.fillStyle = outline;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) drawTextRaw(ctx, str, pad + dx, pad + dy, scale);
  }
  ctx.fillStyle = color;
  drawTextRaw(ctx, str, pad, pad, scale);
  cache.set(key, cv);
  return cv;
}

export function drawText(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, color: string, opts: { outline?: string | null; scale?: number; align?: "left" | "center" | "right" } = {}) {
  const s = textSprite(str, color, opts.outline === undefined ? "#07040c" : opts.outline, opts.scale ?? 1);
  let dx = x;
  if (opts.align === "center") dx = x - s.width / 2;
  else if (opts.align === "right") dx = x - s.width;
  ctx.drawImage(s, Math.round(dx), Math.round(y));
  return s.width;
}

const boldCache = new Map<string, HTMLCanvasElement>();

/** Bold 4x5 glyphs with a 1px outline (projectile text): the 3x5 glyph's middle column is doubled, so stems get
 *  heavier while 1px gaps (Y, H, U, V, W, M, N) stay open; 5px advance. */
export function boldSprite(str: string, color: string, outline = "#07040c"): HTMLCanvasElement {
  const key = str + "\u0000" + color + "\u0000" + outline;
  let c = boldCache.get(key);
  if (c) return c;
  if (boldCache.size > 400) boldCache.clear();
  const w = Math.max(1, str.length * 5 - 1);
  const [cv, ctx] = makeCanvas(w + 2, FONT_H + 2);
  const paint = (ox: number, oy: number) => {
    for (let i = 0; i < str.length; i++) {
      const rows = glyphRows(str[i]);
      for (let r = 0; r < 5; r++) {
        const b = rows[r];
        if (b & 4) ctx.fillRect(1 + ox + i * 5, 1 + oy + r, 1, 1);
        if (b & 2) ctx.fillRect(1 + ox + i * 5 + 1, 1 + oy + r, 2, 1);
        if (b & 1) ctx.fillRect(1 + ox + i * 5 + 3, 1 + oy + r, 1, 1);
      }
    }
  };
  ctx.fillStyle = outline;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) paint(dx, dy);
  ctx.fillStyle = color;
  paint(0, 0);
  boldCache.set(key, cv);
  return cv;
}
