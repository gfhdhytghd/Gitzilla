// "GITZILLA" logo: the brand mark (kaiju roaring </>, client/app/mark.ts) + the brand's 5x7 bitmap wordmark,
// two-band dithered fill, 1px outline + hard drop shadow. The low-res frame is composed each
// tick, then upscaled with an occasional RGB-split / slice glitch.
import { MARK_H, MARK_W, drawMark } from "./mark";
import { fontsReady } from "./util";

type RGB = [number, number, number];
interface Word { text: string; top: RGB; bot: RGB }

// 5x7 pixel font from brand/make_logo.py — a bitmap, so the wordmark is identical in every browser (sampling a web
// font's pixels broke on WebKit, whose glyph rasterisation/offsets differ).
const FONT5x7: Record<string, string[]> = {
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
};

function rasterLogo(words: Word[]): HTMLCanvasElement {
  const cw = 6, glyph = 7, pad = 3; // 5px glyph + 1px gap, 7px tall
  const chars = words.reduce((n, w) => n + w.text.length, 0);
  const w = chars * cw - 1 + pad * 2;
  const hgt = glyph + pad * 2;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = hgt;
  const o = out.getContext("2d")!;
  const img = o.createImageData(w, hgt);
  const mask = new Uint8Array(w * hgt);
  const wordOf = new Int8Array(w * hgt).fill(-1);
  let cx = pad;
  words.forEach((wd, wi) => {
    for (const ch of wd.text) {
      (FONT5x7[ch] ?? []).forEach((row, y) =>
        [...row].forEach((px, x) => {
          if (px !== "#") return;
          const i = (pad + y) * w + cx + x;
          mask[i] = 1;
          wordOf[i] = wi;
        }),
      );
      cx += cw;
    }
  });
  const set = (i: number, r: number, g: number, b: number) => {
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  };
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < hgt ? mask[y * w + x] : 0);
  for (let y = 0; y < hgt; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i]) {
        const wd = words[wordOf[i]];
        const f = (y - pad) / (glyph - 1);
        // two solid bands with a single checker-dithered transition row
        const band = f < 0.4 ? 0 : f > 0.6 ? 1 : (x + y) & 1;
        const c = band ? wd.bot : wd.top;
        set(i, c[0], c[1], c[2]);
      } else if (at(x - 1, y - 1) || at(x - 2, y - 2)) set(i, 40, 6, 30); // hard drop shadow
      if (!mask[i] && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) set(i, 5, 7, 10); // outline
    }
  o.putImageData(img, 0, 0);
  return out;
}

export interface Logo {
  canvas: HTMLCanvasElement;
  destroy(): void;
}

/**
 * Animated logo: the GITZILLA mark (pixel kaiju roaring </>) + the two-tone GIT/ZILLA wordmark (brand colors),
 * side by side ("row") or stacked for narrow phones. `scale` = integer upscale of the low-res composition.
 */
export function createLogo(scale: number, layout: "row" | "stack" = "row"): Logo {
  const canvas = document.createElement("canvas");
  canvas.className = "logo";
  let raf = 0;
  let text: HTMLCanvasElement | null = null; // wordmark at 2x (crisp, same weight as the brand lockup)
  let src: HTMLCanvasElement | null = null; // composed low-res frame
  let tx = 0, ty = 0, mx = 0, my = 0;
  fontsReady.then(() => {
    const raw = rasterLogo([
      { text: "GIT", top: [168, 255, 216], bot: [47, 227, 154] },
      { text: "ZILLA", top: [255, 156, 204], bot: [255, 62, 154] },
    ]);
    text = document.createElement("canvas");
    text.width = raw.width * 2;
    text.height = raw.height * 2;
    const tg = text.getContext("2d")!;
    tg.imageSmoothingEnabled = false;
    tg.drawImage(raw, 0, 0, text.width, text.height);
    src = document.createElement("canvas");
    if (layout === "row") {
      src.width = MARK_W + 2 + text.width;
      src.height = Math.max(MARK_H, text.height);
      mx = 0;
      my = Math.round((src.height - MARK_H) / 2);
      tx = MARK_W + 2;
      ty = Math.round((src.height - text.height) / 2);
    } else {
      src.width = Math.max(MARK_W, text.width);
      src.height = MARK_H + 2 + text.height;
      mx = Math.round((src.width - MARK_W) / 2);
      my = 0;
      tx = Math.round((src.width - text.width) / 2);
      ty = MARK_H + 2;
    }
    canvas.width = src.width * scale;
    canvas.height = src.height * scale;
    raf = requestAnimationFrame(draw);
  });

  const compose = (now: number) => {
    const g = src!.getContext("2d")!;
    g.clearRect(0, 0, src!.width, src!.height);
    drawMark(g, mx, my, now / 1000);
    g.drawImage(text!, tx, ty);
  };
  let glitchUntil = 0;
  let nextGlitch = performance.now() + 900;
  const draw = (now: number) => {
    raf = requestAnimationFrame(draw);
    if (!src || !text) return;
    compose(now);
    const g = canvas.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (now > nextGlitch) {
      glitchUntil = now + 120 + Math.random() * 220;
      nextGlitch = now + 1400 + Math.random() * 2600;
    }
    const glitch = now < glitchUntil;
    const bob = Math.round(Math.sin(now / 500) * 1) * scale;
    if (glitch) {
      // RGB split ghosts
      g.globalAlpha = 0.65;
      g.globalCompositeOperation = "lighter";
      g.filter = "none";
      g.drawImage(tint(text, "#ff0040"), (tx - 2) * scale, ty * scale + bob, text.width * scale, text.height * scale);
      g.drawImage(tint(text, "#00e5ff"), (tx + 2) * scale, ty * scale + bob, text.width * scale, text.height * scale);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
      // horizontal slice displacement
      const rows = src.height;
      for (let y = 0; y < rows; y++) {
        const off = Math.random() < 0.18 ? Math.round((Math.random() - 0.5) * 6) * scale : 0;
        g.drawImage(src, 0, y, src.width, 1, off, y * scale + bob, canvas.width, scale);
      }
    } else {
      g.drawImage(src, 0, bob, canvas.width, canvas.height);
    }
    // scan shimmer line
    const sy = Math.floor(((now / 14) % (canvas.height + 60)) - 30);
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = "rgba(255,255,255,.25)";
    g.fillRect(0, sy, canvas.width, scale);
    g.globalCompositeOperation = "source-over";
  };
  const tintCache = new Map<string, HTMLCanvasElement>();
  function tint(s: HTMLCanvasElement, col: string) {
    let c = tintCache.get(col);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = s.width;
    c.height = s.height;
    const g = c.getContext("2d")!;
    g.drawImage(s, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = col;
    g.fillRect(0, 0, c.width, c.height);
    tintCache.set(col, c);
    return c;
  }
  return { canvas, destroy: () => cancelAnimationFrame(raf) };
}

/** Just the pixel kaiju mark, animated (roaring </>, plate wave, gentle bob), upscaled by an integer factor. */
export function createMarkAnim(scale: number): Logo {
  const src = document.createElement("canvas");
  src.width = MARK_W;
  src.height = MARK_H + 2; // room for the 1px bob
  const canvas = document.createElement("canvas");
  canvas.className = "logo-mark";
  canvas.width = src.width * scale;
  canvas.height = src.height * scale;
  let raf = 0;
  const draw = (now: number) => {
    raf = requestAnimationFrame(draw);
    const s = src.getContext("2d")!;
    s.clearRect(0, 0, src.width, src.height);
    drawMark(s, 0, 1 + Math.round(Math.sin(now / 500)), now / 1000);
    const g = canvas.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(src, 0, 0, canvas.width, canvas.height);
  };
  raf = requestAnimationFrame(draw);
  return { canvas, destroy: () => cancelAnimationFrame(raf) };
}
