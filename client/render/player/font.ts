// 3x5 monospace pixel font with a 1px dark outline, rendered to cached canvases.

const G: Record<string, string> = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110",
  E: "111100110100111", F: "111100110100100", G: "011100101101011", H: "101101111101101",
  I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
  M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100",
  Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
  Y: "101101010010010", Z: "111001010100111",
  "0": "111101101101111", "1": "010110010010111", "2": "110001010100111", "3": "110001010001110",
  "4": "101101111001001", "5": "111100110001110", "6": "011100111101111", "7": "111001010010010",
  "8": "111101111101111", "9": "111101111001110",
  ".": "000000000000010", ",": "000000000010100", "-": "000000111000000", "_": "000000000000111",
  "/": "001001010100100", ":": "000010000010000", "@": "010101111100011", "#": "101111101111101",
  "!": "010010010000010", "?": "110001010000010", "(": "001010010010001", ")": "100010010010100",
  "[": "011010010010011", "]": "110010010010110", "<": "001010100010001", ">": "100010001010100",
  "+": "000010111010000", "=": "000111000111000", "*": "101010101000000", "'": "010010000000000",
  "$": "011110010011110", "%": "101001010100101", "~": "000011110000000", "|": "010010010010010",
  "{": "011010110010011", "}": "110010011010110", ";": "000010000010100", "&": "010101010101011",
  "^": "010101000000000", '"': "101101000000000", " ": "000000000000000",
  "λ": "100010010101101", "\\": "100100010001001", "`": "100010000000000", "→": "000010111010000",
};

/** 15-char '0'/'1' bitmap (3x5) for a character, or null if unsupported. */
export function glyphBits(ch: string): string | null {
  return G[ch] ?? G[ch.toUpperCase()] ?? null;
}

export const GLYPH_W = 4; // 3 px + 1 px spacing
export const GLYPH_H = 5;

const cache = new Map<string, HTMLCanvasElement>();

/** Text measured in logical px (without outline). */
export function textWidth(text: string): number {
  return Math.max(0, text.length * GLYPH_W - 1);
}

/** Returns a canvas with the text drawn (plus 1px outline border on all sides). */
export function textCanvas(text: string, color: string, outline = "#0b0710"): HTMLCanvasElement {
  const key = text + "|" + color + "|" + outline;
  let c = cache.get(key);
  if (c) { cache.delete(key); cache.set(key, c); return c; }
  const up = text.toUpperCase();
  const w = textWidth(up) + 2, h = GLYPH_H + 2;
  c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = h;
  const g = c.getContext("2d")!;
  const on = (ox: number, oy: number, col: string) => {
    g.fillStyle = col;
    for (let i = 0; i < up.length; i++) {
      const bits = glyphBits(up[i]) ?? glyphBits(text[i]) ?? G["?"];
      for (let k = 0; k < 15; k++) {
        if (bits[k] === "1") g.fillRect(1 + ox + i * GLYPH_W + (k % 3), 1 + oy + ((k / 3) | 0), 1, 1);
      }
    }
  };
  if (outline) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) on(dx, dy, outline);
  }
  on(0, 0, color);
  if (cache.size >= 400) cache.delete(cache.keys().next().value!);
  cache.set(key, c);
  return c;
}

/** Draws text centered horizontally at x, top at y (logical px). */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, align: "center" | "left" = "center", outline?: string): void {
  const c = textCanvas(text, color, outline);
  const dx = align === "center" ? Math.round(x - c.width / 2) : Math.round(x - 1);
  ctx.drawImage(c, dx, Math.round(y - 1));
}
