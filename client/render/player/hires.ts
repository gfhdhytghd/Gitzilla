// 2x high-detail pipeline for edu heroes (heroScale 2): the SAME 1x color grid is upscaled with EPX/Scale2x
// (smooth diagonals, identical identity), then shaded and outlined at 2x so details read finer.
import { hexToHsl, light, shade } from "./color.ts";

export type Cells = (string | null)[];

/** EPX / Scale2x on a color grid (null = transparent). Returns a (2w x 2h) grid. */
export function scale2x(src: Cells, w: number, h: number): Cells {
  const out: Cells = new Array(w * 2 * h * 2).fill(null);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? null : src[y * w + x]);
  const W2 = w * 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    let p1 = P, p2 = P, p3 = P, p4 = P;
    if (C === A && C !== D && A !== B) p1 = A;
    if (A === B && A !== C && B !== D) p2 = B;
    if (D === C && D !== B && C !== A) p3 = C;
    if (B === D && B !== A && D !== C) p4 = D;
    // never grow paint into transparent corners of single pixels (keeps thin details intact)
    if (P && !p1) p1 = P; if (P && !p2) p2 = P; if (P && !p3) p3 = P; if (P && !p4) p4 = P;
    const o = y * 2 * W2 + x * 2;
    out[o] = p1; out[o + 1] = p2; out[o + W2] = p3; out[o + W2 + 1] = p4;
  }
  return out;
}

const lightCache = new Map<string, string>();
const shadeCache = new Map<string, string>();

/** Hi-res lighting: 1px top highlight and bottom shade on every painted shape (skips eyes / near-black / white). */
export function shadePass(cells: Cells, w: number, h: number): void {
  const src = cells.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = src[y * w + x];
    if (!c) continue;
    const [, , l] = hexToHsl(c);
    if (l < 0.16 || l > 0.97) continue;
    const up = y > 0 ? src[(y - 1) * w + x] : null;
    const down = y < h - 1 ? src[(y + 1) * w + x] : null;
    if (!up) {
      let v = lightCache.get(c);
      if (!v) { v = light(c, 0.55); lightCache.set(c, v); }
      cells[y * w + x] = v;
    } else if (!down) {
      let v = shadeCache.get(c);
      if (!v) { v = shade(c, 0.45); shadeCache.set(c, v); }
      cells[y * w + x] = v;
    }
  }
}

/** 1px outline (4-neighbour) around everything painted. */
export function outlinePass(cells: Cells, w: number, h: number, col: string): void {
  const add: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (cells[y * w + x]) continue;
    if ((x > 0 && cells[y * w + x - 1]) || (x < w - 1 && cells[y * w + x + 1]) || (y > 0 && cells[(y - 1) * w + x]) || (y < h - 1 && cells[(y + 1) * w + x])) add.push(y * w + x);
  }
  for (const i of add) cells[i] = col;
}

export function rasterCells(cells: Cells, w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d")!;
  for (let i = 0; i < cells.length; i++) {
    const col = cells[i];
    if (!col) continue;
    g.fillStyle = col;
    g.fillRect(i % w, (i / w) | 0, 1, 1);
  }
  return cv;
}
