// Pixel-art helpers shared by the boss + arena renderers (claude-boss owns both dirs).

export type RGB = [number, number, number];

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap stable hash -> [0,1). */
export function hash2(x: number, y: number, s = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hexToRgb(hex: string): RGB {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360 / 360;
  s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** Pixel-art ramp: darker shades drift toward purple/blue, lighter toward yellow. */
export function ramp(base: RGB, n = 5, hueShift = 0): RGB[] {
  const [h, s, l] = rgbToHsl(base);
  const out: RGB[] = [];
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : i / (n - 1) - 0.5; // -0.5..0.5
    const hh = h + hueShift - k * 36 * (h > 60 && h < 240 ? -1 : 1) * 0.6;
    out.push(hslToRgb(k < 0 ? lerpHue(hh, 260, -k * 0.35) : lerpHue(hh, 55, k * 0.3), s * (1 - Math.abs(k) * 0.3), Math.max(0.05, Math.min(0.95, l + k * 0.62))));
  }
  return out;
}

function lerpHue(a: number, b: number, t: number) {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}

export function shiftHue(c: RGB, deg: number, sMul = 1, lAdd = 0): RGB {
  const [h, s, l] = rgbToHsl(c);
  return hslToRgb(h + deg, s * sMul, l + lAdd);
}

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x: number, y: number) => BAYER4[(y & 3) * 4 + (x & 3)];

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

/** Filled pixel disc (no anti-aliasing). */
export function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  cx = Math.round(cx); cy = Math.round(cy);
  if (r < 0.75) { ctx.fillRect(cx, cy, 1, 1); return; }
  const rr = r * r;
  const ri = Math.ceil(r);
  for (let dy = -ri; dy <= ri; dy++) {
    const w = Math.floor(Math.sqrt(Math.max(0, rr - dy * dy)) + 0.5);
    if (w <= 0 && Math.abs(dy) >= r) continue;
    ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}

/** 1px pixel ring. */
export function ring(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, step = 1, phase = 0) {
  cx = Math.round(cx); cy = Math.round(cy);
  const n = Math.max(8, Math.round(r * 2 * Math.PI));
  let last = "";
  for (let i = 0; i < n; i++) {
    if (step > 1 && Math.floor(i / step + phase) % 2) continue;
    const a = (i / n) * Math.PI * 2;
    const x = cx + Math.round(Math.cos(a) * r), y = cy + Math.round(Math.sin(a) * r);
    const k = x + "," + y;
    if (k === last) continue;
    last = k;
    ctx.fillRect(x, y, 1, 1);
  }
}

/** Bresenham line with fillRect pixels. */
export function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, n = 0;
  const o = Math.floor(w / 2);
  while (n++ < 2000) {
    ctx.fillRect(x0 - o, y0 - o, w, w);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// ---------- glow sprites (additive, dithered bands) ----------
const glowCache = new Map<string, HTMLCanvasElement>();

/** Dithered radial glow, meant for globalCompositeOperation = "lighter". */
export function glowSprite(color: string, r: number, strength = 1): HTMLCanvasElement {
  r = Math.max(2, Math.round(r));
  const key = color + "|" + r + "|" + strength;
  let c = glowCache.get(key);
  if (c) return c;
  const size = r * 2 + 1;
  const [cv, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const [cr, cg, cb] = hexToRgb(color);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - r, y - r) / r;
      if (d >= 1) continue;
      let v = Math.pow(1 - d, 1.6) * strength;
      // quantize to 5 bands with ordered dither between them
      const bands = 5;
      const q = Math.floor(v * bands + bayer(x, y) - 0.25) / bands;
      v = Math.max(0, Math.min(1, q));
      if (v <= 0) continue;
      const i = (y * size + x) * 4;
      img.data[i] = cr * v; img.data[i + 1] = cg * v; img.data[i + 2] = cb * v; img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  glowCache.set(key, cv);
  return cv;
}

export function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, r: number, alpha = 1, strength = 1) {
  const g = glowSprite(color, r, strength);
  const prevA = ctx.globalAlpha, prevOp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = prevA * alpha;
  ctx.drawImage(g, Math.round(x - g.width / 2), Math.round(y - g.height / 2));
  ctx.globalAlpha = prevA;
  ctx.globalCompositeOperation = prevOp;
}

/** Tint a sprite into a solid silhouette (cached by caller). */
export function silhouette(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Add a 1px outline around opaque pixels of a sprite (in place, via ImageData; build-time only). */
export function outlineSprite(c: HTMLCanvasElement, color: string, diagonal = false): HTMLCanvasElement {
  const ctx = c.getContext("2d")!;
  const w = c.width, h = c.height;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const [r, g, b] = hexToRgb(color);
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (solid[y * w + x]) continue;
      const s = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < w && yy < h && solid[yy * w + xx] === 1;
      let hit = s(x - 1, y) || s(x + 1, y) || s(x, y - 1) || s(x, y + 1);
      if (!hit && diagonal) hit = s(x - 1, y - 1) || s(x + 1, y - 1) || s(x - 1, y + 1) || s(x + 1, y + 1);
      if (hit) {
        const i = (y * w + x) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      }
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
