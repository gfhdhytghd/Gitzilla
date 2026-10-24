// The GITZILLA mark (same pixel grids as brand/make_logo.py): a kaiju head with three magenta `{` dorsal plates,
// roaring a cyan </> beam. drawMark() animates it: a roar cycle opens the jaw and pushes the beam out (flicker +
// glow), the plates ripple, the eye blinks. Drawn at 1 logical px per cell; callers upscale (pixelated).

const PAL: Record<string, string> = {
  G: "#2fe39a", g: "#1a9e6a", b: "#a8ffd8", M: "#ff3e9a", W: "#ffffff", P: "#ff3e9a", C: "#3ee6ff", K: "#06110c",
};

const HEAD = `
....................
.......GGGGGG.......
.....GGGGGGGGGG.....
....GGGGGGGKKKGG....
....GGGGGGWWGGGGG...
...GGGGGGGWPGGGGGG..
...GGGGGGGGGGGGGGGGG
...GgGGGGGGGGGGGGGGG
...GgGGGGGGGGGWGWGWG
...GgGGGGGGGGG......
...GgGGGGGGGG.......
...GgGGGGGGGGG......
...GgGGGGGGGGGWGWGWG
...GgGGGGGGGGGGGGGG.
...GgGbbbGGGGGGGGG..
...GgbbbbbGGGGGGG...
...Ggbbbbbbbb.......
...Ggbbbbbbb........
...GgGbbbbbG........
...GgGGGGGGG........
`.trim().split("\n");

const GLYPHS: Record<string, string[]> = {
  "<": ["..C", ".C.", "C..", ".C.", "..C"],
  "/": ["..C", "..C", ".C.", "C..", "C.."],
  ">": ["C..", ".C.", "..C", ".C.", "C.."],
};
const BRACE = [".MM", ".M.", "M..", ".M.", ".MM"];

export const MARK_W = 46;
export const MARK_H = 24;

type Grid = string[][];
const blank = (): Grid => Array.from({ length: MARK_H }, () => Array(MARK_W).fill("."));
const paste = (g: Grid, rows: string[], x0: number, y0: number) =>
  rows.forEach((r, y) => [...r].forEach((c, x) => c !== "." && g[y0 + y]?.[x0 + x] !== undefined && (g[y0 + y][x0 + x] = c)));

function outline(g: Grid): Grid {
  const out = g.map((r) => r.slice());
  for (let y = 0; y < MARK_H; y++)
    for (let x = 0; x < MARK_W; x++) {
      if (g[y][x] !== ".") continue;
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        if (g[y + dy]?.[x + dx] && !".K".includes(g[y + dy][x + dx])) {
          out[y][x] = "K";
          break;
        }
    }
  return out;
}

export interface MarkOpts {
  roar?: boolean; // draw the </> beam (false = favicon-style head only)
  still?: boolean; // static frame (share card)
}

/** Draws the mark at (x, y) in canvas pixels (1 cell = 1 px); `t` in seconds drives the animation. */
export function drawMark(g: CanvasRenderingContext2D, x: number, y: number, t: number, opts: MarkOpts = {}) {
  const roarBeam = opts.roar !== false;
  const still = !!opts.still;
  const period = 3.2;
  const p = still ? 0.5 : t % period;
  const roaring = p < 1.1; // jaw wide + beam surging
  const surge = roaring ? Math.sin((p / 1.1) * Math.PI) : 0; // 0 → 1 → 0
  const blink = !still && t % 4.7 < 0.12;

  const grid = blank();
  const head = HEAD.map((r) => [...r]);
  if (blink) for (const [yy, xx] of [[4, 10], [4, 11], [5, 10], [5, 11]]) head[yy][xx] = "G";
  if (roaring && surge > 0.25) {
    // lower jaw drops one pixel: the mouth opens wider
    for (let yy = 13; yy >= 12; yy--)
      for (let xx = 13; xx < 20; xx++) {
        head[yy + 1][xx] = head[yy][xx] === "." ? head[yy + 1][xx] : head[yy][xx];
        head[yy][xx] = ".";
      }
  }
  paste(grid, head.map((r) => r.join("")), 4, 2);
  for (const py of [3, 9, 15]) paste(grid, BRACE, 3, py);
  const spread = Math.round(surge * 2);
  const glyphs: { ch: string; gx: number; gy: number; on: boolean }[] = [];
  if (roarBeam)
    [..."</>"].forEach((ch, i) => {
      const flicker = !still && ((Math.floor(t * 18) * 7 + i * 13) % 17 === 0); // brief dropouts, like a bad CRT
      glyphs.push({ ch, gx: 25 + i * (4 + spread), gy: 10, on: !flicker });
    });
  for (const gl of glyphs) if (gl.on) paste(grid, GLYPHS[gl.ch], gl.gx, gl.gy);
  const out = outline(grid);

  // plates ripple down the spine; beam brightens with the roar
  const wave = still ? -1 : Math.floor((t * 3) % 6);
  for (let yy = 0; yy < MARK_H; yy++)
    for (let xx = 0; xx < MARK_W; xx++) {
      const c = out[yy][xx];
      if (c === ".") continue;
      let col = PAL[c];
      if (c === "M" && xx < 7) {
        const plate = yy < 9 ? 0 : yy < 15 ? 1 : 2;
        if (plate === wave % 3 && wave < 3) col = "#ff9ccc";
      }
      if (c === "C") col = roaring ? (surge > 0.6 ? "#bff7ff" : "#3ee6ff") : `rgba(62,230,255,${0.65 + 0.35 * Math.sin(t * 5)})`;
      g.fillStyle = col;
      g.fillRect(x + xx, y + yy, 1, 1);
    }
  // additive glow around the beam while roaring
  if (roarBeam && surge > 0.1) {
    g.save();
    g.globalCompositeOperation = "lighter";
    g.fillStyle = `rgba(62,230,255,${0.18 * surge})`;
    for (const gl of glyphs) if (gl.on) g.fillRect(x + gl.gx - 1, y + gl.gy - 1, 5, 7);
    g.fillStyle = `rgba(62,230,255,${0.08 * surge})`;
    g.fillRect(x + 22, y + 9, 4 + 3 * (4 + spread), 7);
    g.restore();
  }
}

/** Static mark as its own canvas, upscaled by an integer factor (share card, corners). */
export function markCanvas(scale: number, opts: MarkOpts = { still: true }): HTMLCanvasElement {
  const src = document.createElement("canvas");
  src.width = MARK_W;
  src.height = MARK_H;
  drawMark(src.getContext("2d")!, 0, 0, 0, { ...opts, still: true });
  const c = document.createElement("canvas");
  c.width = MARK_W * scale;
  c.height = MARK_H * scale;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
