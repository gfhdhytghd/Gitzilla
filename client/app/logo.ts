// "GITZILLA" pixel logo: rasterised from Press Start 2P (sampled at native 8px), two-band dithered fill,
// 1px outline + hard drop shadow; underneath, a tiny kaiju stomps along a git graph. The low-res frame is
// composed each tick, then upscaled with an occasional RGB-split / slice glitch.
import { fontsReady } from "./util";

type RGB = [number, number, number];
interface Word { text: string; top: RGB; bot: RGB }

function rasterLogo(words: Word[]): HTMLCanvasElement {
  const glyph = 8, pad = 3;
  const chars = words.reduce((n, w) => n + w.text.length, 0);
  const w = chars * glyph + pad * 2;
  const hgt = glyph + pad * 2;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = hgt;
  const o = out.getContext("2d")!;
  const img = o.createImageData(w, hgt);
  const mask = new Uint8Array(w * hgt);
  const wordOf = new Int8Array(w * hgt).fill(-1);
  // rasterise at 4x and sample pixel centres: immune to sub-pixel AA at the native 8px size
  const K = 4;
  const tmp = document.createElement("canvas");
  tmp.width = w * K;
  tmp.height = hgt * K;
  const t = tmp.getContext("2d", { willReadFrequently: true })!;
  let cx = pad;
  words.forEach((wd, wi) => {
    t.clearRect(0, 0, tmp.width, tmp.height);
    t.font = `${8 * K}px "Press Start 2P", monospace`;
    t.textBaseline = "top";
    t.fillStyle = "#fff";
    t.fillText(wd.text, cx * K, pad * K);
    const d = t.getImageData(0, 0, tmp.width, tmp.height).data;
    for (let y = 0; y < hgt; y++)
      for (let x = 0; x < w; x++) {
        const j = ((y * K + K / 2) * tmp.width + x * K + K / 2) * 4;
        if (d[j + 3] > 127) (mask[y * w + x] = 1), (wordOf[y * w + x] = wi);
      }
    cx += wd.text.length * glyph;
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

// 12x11 side-view kaiju, two walk frames. X body, s spikes, e eye, o belly, k outline-ish dark
const KAIJU_TOP = [
  "........XXX.",
  ".......XXeXX",
  "......sXXXXX",
  ".....sXXXk..",
  "....sXXoo...",
  "...sXXXoo.X.",
  "..sXXXXoo...",
  "XXXXXXXoo...",
  "X...XXXXX...",
];
const KAIJU_LEGS = [
  ["....XX.XX...", "....X...XX.."],
  ["....XX.XX...", "...XX...X..."],
];
const KCOL: Record<string, string> = { X: "#39ff88", s: "#ffd23d", e: "#ff3355", o: "#1a8a4a", k: "#05070a" };

function kaijuSprite(frame: number): HTMLCanvasElement {
  const rows = [...KAIJU_TOP, ...KAIJU_LEGS[frame]];
  const c = document.createElement("canvas");
  c.width = 14;
  c.height = rows.length + 2;
  const g = c.getContext("2d")!;
  // 1px dark outline: draw silhouette offset in 4 directions first
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      if (ch === ".") return;
      g.fillStyle = "#05070a";
      g.fillRect(x + 1 + dx, y + 1 + dy, 1, 1);
    }));
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === ".") return;
    g.fillStyle = KCOL[ch] ?? "#39ff88";
    g.fillRect(x + 1, y + 1, 1, 1);
  }));
  return c;
}

export interface Logo {
  canvas: HTMLCanvasElement;
  destroy(): void;
}

/** Animated logo canvas. `scale` = integer upscale of the 8px raster. */
export function createLogo(scale: number): Logo {
  const canvas = document.createElement("canvas");
  canvas.className = "logo";
  let raf = 0;
  let text: HTMLCanvasElement | null = null;
  let src: HTMLCanvasElement | null = null; // composed low-res frame
  const STRIP = 15;
  const kaiju = [kaijuSprite(0), kaijuSprite(1)];
  const stomped = new Map<number, number>(); // commit x -> time stomped
  const dust: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  let lastStep = -1;
  fontsReady.then(() => {
    text = rasterLogo([
      { text: "GIT", top: [61, 232, 255], bot: [57, 255, 136] },
      { text: "ZILLA", top: [255, 61, 127], bot: [255, 210, 61] },
    ]);
    src = document.createElement("canvas");
    src.width = text.width;
    src.height = text.height + STRIP;
    canvas.width = src.width * scale;
    canvas.height = src.height * scale;
    raf = requestAnimationFrame(draw);
  });

  const compose = (now: number) => {
    const g = src!.getContext("2d")!;
    const W = src!.width, H = src!.height;
    g.clearRect(0, 0, W, H);
    const t = now / 1000;
    const base = H - 4; // main branch line
    const feat = base - 5; // feature branch line
    // kaiju walk: loop across, pausing mid-way to breathe glyph fire
    const period = 9;
    const ph = (t % period) / period;
    const walkPh = ph < 0.45 ? ph / 0.9 : ph < 0.6 ? 0.5 : (ph - 0.15) / 0.9;
    const kx = Math.round(-16 + walkPh * (W + 20));
    const walking = ph < 0.45 || ph >= 0.6;
    const step = walking ? Math.floor(t * 5) : lastStep;
    const frame = step & 1;
    // git graph: main line, feature branch with diagonal fork/merge, commit dots
    g.fillStyle = "#1d6b43";
    g.fillRect(0, base, W, 1);
    const fx0 = Math.round(W * 0.28), fx1 = Math.round(W * 0.62);
    g.fillStyle = "#7b2fbe";
    g.fillRect(fx0 + 5, feat, fx1 - fx0 - 10, 1);
    for (let i = 0; i < 5; i++) {
      g.fillRect(fx0 + i, base - i, 1, 1);
      g.fillRect(fx1 - i, base - i, 1, 1);
    }
    const commits: [number, number, string][] = [];
    for (let x = 5; x < W - 2; x += 12) commits.push([x, base, "#39ff88"]);
    for (let x = fx0 + 10; x < fx1 - 6; x += 10) commits.push([x, feat, "#c13cff"]);
    for (const [x, y, col] of commits) {
      const st = stomped.get(x * 100 + y);
      const squash = st !== undefined && t - st < 1.4;
      g.fillStyle = "#05070a";
      g.fillRect(x - 2, y - (squash ? 1 : 2), 5, squash ? 3 : 5);
      g.fillStyle = squash ? "#ff3355" : col;
      if (squash) g.fillRect(x - 1, y, 3, 1);
      else g.fillRect(x - 1, y - 1, 3, 3);
    }
    // footfall: stomp nearby commits + dust
    if (walking && step !== lastStep) {
      lastStep = step;
      const footX = kx + 6 + (frame ? 0 : 3);
      for (const [x, y] of commits)
        if (Math.abs(x - footX) <= 3 && y === base) {
          stomped.set(x * 100 + y, t);
          for (let i = 0; i < 5; i++) dust.push({ x, y: base - 1, vx: (Math.random() - 0.5) * 18, vy: -Math.random() * 14, life: 0.5 });
        }
    }
    // kaiju (stands on the main line); bob on steps
    const ky = base - kaiju[0].height + 2 + (walking && frame ? -1 : 0);
    g.drawImage(kaiju[frame], kx, ky);
    if (!walking) {
      // glyph breath: flickering cyan beam of "pixels" from the mouth
      const mx = kx + 13, my = ky + 4;
      for (let i = 0; i < 18; i++) {
        if (Math.random() < 0.25) continue;
        g.fillStyle = i % 3 ? "#3de8ff" : "#e8fff2";
        g.fillRect(mx + i, my + Math.round(Math.sin(t * 30 + i) * (i / 10)), 1, 1);
      }
    }
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i];
      d.life -= 1 / 60;
      if (d.life <= 0) {
        dust.splice(i, 1);
        continue;
      }
      d.x += d.vx / 60;
      d.y += d.vy / 60;
      d.vy += 40 / 60;
      g.fillStyle = "#6f9b85";
      g.fillRect(Math.round(d.x), Math.round(d.y), 1, 1);
    }
    // the title on top, with a tiny stomp shake
    const shake = stomped.size && [...stomped.values()].some((s) => t - s < 0.08) ? 1 : 0;
    g.drawImage(text!, 0, shake);
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
      g.drawImage(tint(text, "#ff0040"), -scale * 2, bob, text.width * scale, text.height * scale);
      g.drawImage(tint(text, "#00e5ff"), scale * 2, bob, text.width * scale, text.height * scale);
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
