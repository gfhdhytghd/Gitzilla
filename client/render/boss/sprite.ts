// Procedural boss body sprite: smooth-union of lobes from bossLayout (archetype-specific),
// shaded per material with ordered dithering, plus appendages, growths, veins, scars, carved code.
// Built once per (layout, broken mask, tint, breath frame) and cached.
import type { BossKit } from "../../../shared/types.ts";
import { bayer, disc, hash2, line, makeCanvas, outlineSprite, rng, silhouette } from "../arena/pix.ts";
import { drawTextRaw } from "../arena/font.ts";
import { bossArt, matRamp, type BossArt } from "./art.ts";
import type { BossLayout, LimbLayout, Lobe, Material } from "./layout.ts";

export const BREATH_FRAMES = 4;

export interface BodySprite { canvas: HTMLCanvasElement; white: HTMLCanvasElement | null; cx: number; cy: number }

const cache = new Map<string, BodySprite>();

function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function stumpOf(l: LimbLayout): { x: number; y: number; r: number } {
  return { x: l.x * 0.78, y: l.y * 0.78, r: Math.max(6, l.r * 0.55) };
}

const layoutIds = new WeakMap<BossLayout, number>();
let nextLayoutId = 1;

export function getBodySprite(kit: BossKit, L: BossLayout, broken: boolean[], tint: number, frame: number): BodySprite {
  let lid = layoutIds.get(L);
  if (!lid) layoutIds.set(L, (lid = nextLayoutId++));
  const key = kit.seed + "|" + kit.repo + "|" + lid + "|" + broken.map((b) => (b ? 1 : 0)).join("") + "|" + tint + "|" + frame + "|" + kit.palette.join("") + "|" + kit.limbs.map((l) => (l.fragile ? 1 : 0)).join("") + "|" + (kit.code ? (kit.code.snippets?.[0] ?? "") + Object.keys(kit.code.limbSymbols ?? {}).length : "");
  let s = cache.get(key);
  if (s) return s;
  if (cache.size > 64) cache.clear();
  s = buildBody(kit, L, broken, tint, frame);
  cache.set(key, s);
  return s;
}

export function whiteOf(s: BodySprite): HTMLCanvasElement {
  if (!s.white) s.white = silhouette(s.canvas, "#ffffff");
  return s.white;
}

function lobeDist(o: Lobe, px: number, py: number) {
  const dx = px - o.x, dy = (py - o.y) * (o.ry ? o.r / o.ry : 1);
  if (o.sq) {
    const p = o.sq;
    return Math.pow(Math.pow(Math.abs(dx), p) + Math.pow(Math.abs(dy), p), 1 / p) - o.r;
  }
  return Math.hypot(dx, dy) - o.r;
}

function buildBody(kit: BossKit, L: BossLayout, broken: boolean[], tint: number, frame: number): BodySprite {
  const art = bossArt(kit, tint);
  const size = L.extent * 2;
  const C = L.extent;
  const R = rng(kit.seed ^ 0x51ed);
  const ph = (frame / BREATH_FRAMES) * Math.PI * 2;
  const isKaiju = !!L.kaiju; // kaiju / mecha / dragon / abyssal share the anatomy pipeline
  const blend = L.body === "swarm" ? 2.5 : L.body === "golem" || L.body === "machine" || L.body === "mecha" ? 4 : L.body === "serpent" || L.body === "abyssal" ? 4.5 : isKaiju ? 6 : 9;
  const cuts: { x: number; y: number; r: number }[] = []; // kaiju: where a severed part was cut off

  // lobes with breathing + broken limbs collapsed to stumps
  const lobes: Lobe[] = [];
  const stumped = new Set<number>();
  L.lobes.forEach((o, i) => {
    if (isKaiju && o.owner >= 0 && broken[o.owner]) {
      // kaiju: severed parts (forearm, tail tip) vanish; legs/plates stay and get charred later
      if (o.sever) { if (!stumped.has(o.owner)) { stumped.add(o.owner); cuts.push({ x: o.x, y: o.y, r: o.r }); } return; }
      lobes.push({ ...o });
      return;
    }
    if (o.owner >= 0 && broken[o.owner]) {
      if (stumped.has(o.owner)) return;
      stumped.add(o.owner);
      const st = stumpOf(L.limbs[o.owner]);
      lobes.push({ ...o, x: st.x, y: st.y, r: st.r, owner: o.owner, ry: undefined, mat: o.mat === "foliage" ? "bark" : o.mat });
      return;
    }
    const wob = o.mat === "metal" || o.mat === "stone" || (isKaiju && i > 1) ? 0 : Math.sin(ph + i * 1.9) * (o.owner < 0 && i === 0 ? 0.8 : 0.6);
    lobes.push({ ...o, r: o.r + wob });
  });

  // ---- 1. body shading via ImageData ----
  const [bodyC, bctx] = makeCanvas(size, size);
  const img = bctx.createImageData(size, size);
  const d = img.data;
  const lx = -0.45, ly = -0.68, lz = 0.58;
  const moss = L.growths.includes("moss");
  // per-limb moss (variety.ts: docs / examples components) grows only around that limb, and not once it broke
  const mossSpots = L.spots.filter((g) => g.kind === "moss" && g.size > 0 && !(g.owner >= 0 && broken[g.owner]));
  // bounding box for speed
  let x0 = size, y0 = size, x1 = 0, y1 = 0;
  for (const o of lobes) {
    const ry = o.ry ?? o.r;
    x0 = Math.min(x0, Math.floor(C + o.x - o.r - 6)); x1 = Math.max(x1, Math.ceil(C + o.x + o.r + 6));
    y0 = Math.min(y0, Math.floor(C + o.y - ry - 6)); y1 = Math.max(y1, Math.ceil(C + o.y + ry + 6));
  }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(size, x1); y1 = Math.min(size, y1);
  // Neighbouring pixels share their distance-field samples. Previously each
  // shaded pixel recomputed all lobes four more times for its surface normal,
  // causing long main-thread stalls whenever a breath/broken-limb sprite was cold.
  // Keep float64 samples so the original shading and dither thresholds are exact.
  const stride = x1 - x0 + 2, rows = y1 - y0 + 2;
  const field = new Float64Array(stride * rows);
  const nearest = new Float64Array(stride * rows);
  const owner = new Uint16Array(stride * rows);
  for (let y = y0 - 1; y <= y1; y++) {
    for (let x = x0 - 1; x <= x1; x++) {
      const px = x - C + 0.5, py = y - C + 0.5;
      let best = 1e9, bi = 0, sd = 1e9;
      for (let i = 0; i < lobes.length; i++) {
        const di = lobeDist(lobes[i], px, py);
        sd = smin(sd, di, blend);
        if (di < best) { best = di; bi = i; }
      }
      const at = (y - y0 + 1) * stride + x - x0 + 1;
      field[at] = sd; nearest[at] = best; owner[at] = bi;
    }
  }
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const px = x - C + 0.5, py = y - C + 0.5;
      const at = (y - y0 + 1) * stride + x - x0 + 1;
      const sd = field[at], best = nearest[at], bi = owner[at];
      if (sd > 0) continue;
      const lobe = lobes[bi];
      const mat: Material = lobe.mat;
      const gx = field[at + 1] - field[at - 1];
      const gy = field[at + stride] - field[at - stride];
      const gl = Math.hypot(gx, gy) || 1;
      const rl = Math.min(lobe.r, lobe.ry ?? lobe.r);
      const t = Math.min(1, -sd / Math.max(4, rl * 0.85));
      const ring = 1 - t;
      let nz = Math.sqrt(Math.max(0, 1 - ring * ring));
      let nx = (gx / gl) * ring, ny = (gy / gl) * ring;
      if (mat === "stone") {
        // faceted: snap the normal to a few directions
        const a = Math.round(Math.atan2(ny, nx) / (Math.PI / 3)) * (Math.PI / 3);
        const m = Math.round(Math.hypot(nx, ny) * 2) / 2;
        nx = Math.cos(a) * m; ny = Math.sin(a) * m; nz = Math.sqrt(Math.max(0, 1 - m * m));
      }
      let v = Math.max(0, nx * lx + ny * ly + nz * lz);
      v = 0.12 + v * 0.95;
      const crease = best - sd;
      v -= Math.min(0.35, crease * 0.07);
      let dith = 0.9;
      switch (mat) {
        case "flesh": v += (hash2(x >> 1, y >> 1, kit.seed) - 0.5) * 0.12; break;
        case "scales": {
          const u = (x + ((y >> 2) & 1) * 2) & 3, w = y & 3;
          if (w === 3 && u !== 0) v -= 0.16; else if (w === 0 && u === 1) v += 0.1;
          break;
        }
        case "chitin": v = Math.pow(Math.max(0, v), 1.3) * 1.05; dith = 0.5; break;
        case "obsidian": {
          // dense reptile scales + a glossy rim of light
          const u = (x + ((y >> 1) & 1)) & 1, w = y & 1;
          if (w === 1 && u === 0) v -= 0.12;
          if (((x * 7 + y * 13) & 15) === 0) v += 0.15;
          if (v > 0.9) v += 0.2;
          dith = 0.6;
          break;
        }
        case "gold": {
          // dragon scales: overlapping rows, bright stepped highlights
          const u = (x + ((y >> 1) & 1) * 2) & 3, w = y & 1;
          if (w === 1 && u === 0) v -= 0.14; else if (w === 0 && u === 2) v += 0.08;
          dith = 0.5;
          break;
        }
        case "void": {
          // black crystal: faceted planes with hard glossy edges
          v = 0.15 + Math.round(v * 4) / 4 * 0.8;
          if (((x * 3 + y * 5) % 23) === 0) v += 0.35;
          dith = 0.25;
          break;
        }
        case "belly": {
          // horizontal armored belly bands
          if (((y - C) & 3) === 0) v -= 0.22; else if (((y - C) & 3) === 1) v += 0.08;
          dith = 0.4;
          break;
        }
        case "stone": v += (hash2(x, y, kit.seed) - 0.5) * 0.18; dith = 0.4; break;
        case "metal": {
          v = 0.25 + Math.round(v * 3) / 3 * 0.7; dith = 0.3;
          const gxp = ((x - C) % 9 + 9) % 9, gyp = ((y - C) % 9 + 9) % 9;
          if (gxp === 0 || gyp === 0) v -= 0.3;
          else if (gxp === 1 || gyp === 1) v += 0.12;
          if (gxp === 4 && gyp === 4 && hash2(x, y, 3) < 0.5) v += 0.4;
          break;
        }
        case "bark": {
          const s = Math.sin(px * 1.4 + Math.sin(py * 0.3 + px) * 2 + hash2(x, 0, kit.seed) * 3);
          if (s > 0.55) v -= 0.22;
          dith = 0.5;
          break;
        }
        case "foliage": {
          const cl = hash2((x + 2) >> 2, y >> 2, kit.seed + 4);
          v = v * (0.7 + cl * 0.5);
          const lu = (x & 3), lw = (y & 3);
          if (lu === 0 && lw === 0 && cl > 0.5) v += 0.25;
          break;
        }
        case "sclera": v = 0.35 + v * 0.7; dith = 0.5; break;
      }
      let idx = Math.floor(v * 5 + (bayer(x, y) - 0.5) * dith);
      idx = Math.max(0, Math.min(5, idx));
      let c = art.mats[mat]?.[idx];
      if (!c) c = art.mats[mat][2];
      // moss on upward-facing surfaces
      if ((moss || (mossSpots.length && mossSpots.some((g) => (px - g.x) ** 2 + (py - g.y) ** 2 < g.size * g.size))) && ny < -0.25 && mat !== "sclera") {
        const mn = hash2(x >> 2, y >> 1, kit.seed + 11);
        if (mn > 0.45 && bayer(x, y) < (-ny - 0.2) * 1.6) c = mn > 0.8 ? [111, 150, 58] : idx > 2 ? [86, 120, 50] : [58, 86, 38];
      }
      const k = (y * size + x) * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
  bctx.putImageData(img, 0, 0);

  // ---- 2. surface details (clipped to body) ----
  bctx.globalCompositeOperation = "source-atop";
  bctx.translate(C, C);
  const organic = L.body === "blob" || L.body === "hydra" || L.body === "serpent" || L.body === "spider" || isKaiju;
  if (organic) drawVeins(bctx, L, art, R, tint);
  if (L.body === "golem" || L.kaiju?.form === "golem" || L.kaiju?.form === "ironclad") drawCracks(bctx, L, art, R, tint);
  if (L.body === "eye" || L.kaiju?.form === "eye") drawScleraVeins(bctx, L, art, R);
  if (L.body === "machine") drawPanels(bctx, L, art, R);
  const solid = (x: number, y: number) => {
    const ax = Math.round(x + C), ay = Math.round(y + C);
    return ax >= 0 && ay >= 0 && ax < size && ay < size && d[(ay * size + ax) * 4 + 3] > 0;
  };
  if (L.body !== "swarm" && L.body !== "eye") drawEngravings(bctx, kit, L, art, R, broken, solid);
  if (organic || L.body === "tree") drawScars(bctx, L, art);
  drawKnots(bctx, L, art, broken);
  drawFragile(bctx, kit, L, broken);
  if (L.heart.style !== "iris") drawSocket(bctx, L, art);
  // kaiju damage: cut ends (severed tail tip / forearm) and charred, cracked parts that stay attached
  if (isKaiju) drawKaijuDamage(bctx, kit, L, art, broken, cuts);
  // crescent veins (ref boss-5): the abyssal always glows; every archetype's veins flare when enraged / last stand
  if (L.kaiju && (L.kaiju.kind === "abyssal" || L.kaiju.glowVeins || tint > 0)) drawVeinCrescents(bctx, L, art, tint);
  // broken stumps: charred
  if (!isKaiju) L.limbs.forEach((l, i) => {
    if (!broken[i]) return;
    const st = stumpOf(l);
    const ox = st.x + Math.cos(l.angle) * st.r * 0.55, oy = st.y + Math.sin(l.angle) * st.r * 0.55;
    bctx.fillStyle = art.outline; disc(bctx, ox, oy, st.r * 0.62);
    bctx.fillStyle = art.inside; disc(bctx, ox - 1, oy - 1, st.r * 0.42);
    bctx.fillStyle = art.dangerRamp[1];
    for (let k = 0; k < 6; k++) bctx.fillRect(Math.round(ox + (R() - 0.5) * st.r), Math.round(oy + (R() - 0.5) * st.r), 1, 1);
  });
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.globalCompositeOperation = "source-over";
  outlineSprite(bodyC, art.outline);

  // ---- 3. compose: back appendages/growths, body, front ----
  const [out, octx] = makeCanvas(size, size);
  octx.translate(C, C);
  const useAppendages = L.body !== "eye" && L.body !== "tree" && L.body !== "hydra" && !isKaiju;
  drawGrowths(octx, L, art, broken, "back", kit.seed);
  if (useAppendages) L.limbs.forEach((l, i) => { if (!broken[i]) drawAppendage(octx, l, art, kit.seed + i * 77, "back", frame); });
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.drawImage(bodyC, 0, 0);
  octx.translate(C, C);
  L.limbs.forEach((l, i) => {
    if (broken[i] && !isKaiju) drawWires(octx, l, art, kit.seed + i);
    else if (useAppendages) drawAppendage(octx, l, art, kit.seed + i * 77, "front", frame);
    else if (L.body === "hydra") drawJaw(octx, l, art);
  });
  drawGrowths(octx, L, art, broken, "front", kit.seed);
  if (isKaiju) for (const c of cuts) drawCutWires(octx, c, art, kit.seed);
  octx.setTransform(1, 0, 0, 1, 0, 0);
  outlineSprite(out, art.outline);
  return { canvas: out, white: null, cx: C, cy: C };
}

// ---------- archetype details ----------

function drawKaijuDamage(ctx: CanvasRenderingContext2D, kit: BossKit, L: BossLayout, art: BossArt, broken: boolean[], cuts: { x: number; y: number; r: number }[]) {
  const R = rng(kit.seed ^ 0xdead);
  // cut faces: dark ring + raw red flesh + bone
  for (const c of cuts) {
    ctx.fillStyle = art.outline; disc(ctx, c.x, c.y, c.r + 1);
    ctx.fillStyle = art.dangerRamp[0]; disc(ctx, c.x, c.y, c.r - 0.5);
    ctx.fillStyle = art.dangerRamp[1]; disc(ctx, c.x - 0.5, c.y - 0.5, Math.max(1, c.r - 2));
    ctx.fillStyle = art.boneRamp[3]; disc(ctx, c.x, c.y, Math.max(1, c.r * 0.3));
  }
  // charred cracks on broken parts that stay attached (legs, jaw, plates base)
  L.limbs.forEach((l, i) => {
    if (!broken[i]) return;
    ctx.fillStyle = art.outline;
    disc(ctx, l.x, l.y, Math.max(3, l.r * 0.45));
    for (let k = 0; k < 5; k++) {
      let a = R() * Math.PI * 2, x = l.x, y = l.y;
      for (let st = 0; st < 5; st++) {
        const nx = x + Math.cos(a) * 2.2, ny = y + Math.sin(a) * 2.2;
        ctx.fillStyle = "#07040c"; line(ctx, x, y + 1, nx, ny + 1);
        ctx.fillStyle = st < 2 ? "#ff7a2a" : art.dangerRamp[1]; line(ctx, x, y, nx, ny);
        x = nx; y = ny; a += (R() - 0.5) * 1.2;
      }
    }
  });
}

function drawVeinCrescents(ctx: CanvasRenderingContext2D, L: BossLayout, art: BossArt, tint: number) {
  const K = L.kaiju!;
  K.veins.forEach((v, i) => {
    // calm veins glow in the element's color (void = the original cyan); enraged red, last stand red / element
    const calm = tint === 0 ? true : tint === 2 ? i % 2 === 1 : false;
    const core = calm ? art.lit.mid : "#ffb0b8", mid = calm ? art.el.vein : "#ff2a3a";
    for (let k = 0; k <= 10; k++) {
      const a = v.a + (k / 10) * 2.3;
      const x = v.x + Math.cos(a) * v.r, y = v.y + Math.sin(a) * v.r;
      ctx.fillStyle = mid; ctx.fillRect(Math.round(x), Math.round(y), 2, 1);
      if (k > 2 && k < 8) { ctx.fillStyle = core; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
    }
  });
}

function drawCutWires(ctx: CanvasRenderingContext2D, c: { x: number; y: number; r: number }, art: BossArt, seed: number) {
  const R = rng(seed ^ Math.round(c.x * 31 + c.y));
  const cols = ["#ff4d4d", "#ffd23f", "#3fd2ff", "#7dff6b", art.bone];
  for (let i = 0; i < 4; i++) {
    let x = c.x + (R() - 0.5) * c.r, y = c.y + (R() - 0.5) * c.r, a = R() * Math.PI * 2;
    ctx.fillStyle = cols[i % cols.length];
    for (let s2 = 0; s2 < 4 + R() * 5; s2++) { ctx.fillRect(Math.round(x), Math.round(y), 1, 1); a += (R() - 0.5) * 0.8; x += Math.cos(a); y += Math.sin(a); }
  }
}

function drawCracks(ctx: CanvasRenderingContext2D, L: BossLayout, art: BossArt, R: () => number, tint: number) {
  const big = L.lobes.filter((o) => o.r >= 8);
  for (let i = 0; i < 9; i++) {
    const o = big[Math.floor(R() * big.length)] ?? L.lobes[0];
    let x = o.x + (R() - 0.5) * o.r, y = o.y + (R() - 0.5) * o.r;
    let a = R() * Math.PI * 2;
    for (let s = 0; s < 8 + R() * 8; s++) {
      a += (R() - 0.5) * 1.4;
      const nx = x + Math.cos(a) * 2, ny = y + Math.sin(a) * 2;
      ctx.fillStyle = art.outline; line(ctx, x, y + 1, nx, ny + 1);
      ctx.fillStyle = s % 3 === 0 ? (tint ? art.dangerRamp[3] : art.accentRamp[3]) : tint ? art.dangerRamp[2] : art.accentRamp[2];
      line(ctx, x, y, nx, ny);
      x = nx; y = ny;
    }
  }
  // rune ring around the heart
  ctx.fillStyle = art.accentRamp[2];
  const { x, y } = L.heart;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    drawTextRaw(ctx, "01#*<>{}"[k], Math.round(x + Math.cos(a) * 18) - 1, Math.round(y + Math.sin(a) * 17) - 2);
  }
}

function drawScleraVeins(ctx: CanvasRenderingContext2D, L: BossLayout, art: BossArt, R: () => number) {
  for (const o of L.lobes) {
    if (o.mat !== "sclera") continue;
    const n = Math.max(2, Math.round(o.r / 3));
    for (let i = 0; i < n; i++) {
      let a = R() * Math.PI * 2;
      let x = o.x + Math.cos(a) * (o.r - 1), y = o.y + Math.sin(a) * (o.r - 1);
      a += Math.PI;
      for (let s = 0; s < o.r * 0.5; s++) {
        a += (R() - 0.5) * 0.9;
        ctx.fillStyle = s < 2 ? art.dangerRamp[0] : art.dangerRamp[1];
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
        x += Math.cos(a); y += Math.sin(a);
        if (R() < 0.1) { const b = a + 0.8; ctx.fillRect(Math.round(x + Math.cos(b) * 2), Math.round(y + Math.sin(b) * 2), 1, 1); }
      }
    }
  }
}

function drawPanels(ctx: CanvasRenderingContext2D, L: BossLayout, art: BossArt, R: () => number) {
  // hazard stripes + status lights + vents
  for (const o of L.lobes.slice(0, 3)) {
    ctx.fillStyle = "#0a0a10";
    for (let k = 0; k < 4; k++) ctx.fillRect(Math.round(o.x - o.r * 0.5), Math.round(o.y + o.r * 0.35 + k * 2), Math.round(o.r), 1);
  }
  ctx.fillStyle = "#e0b020";
  const top = L.lobes[0];
  for (let k = -12; k < 12; k++) if (((k >> 1) & 1) === 0) ctx.fillRect(Math.round(top.x + k), Math.round(top.y - top.r + 4), 1, 2);
  void R;
}

function drawJaw(ctx: CanvasRenderingContext2D, l: LimbLayout, art: BossArt) {
  // hydra head: open jaw pointing outward with bracket teeth
  const ca = Math.cos(l.angle), sa = Math.sin(l.angle);
  const tx = l.x + ca * (l.r * 1.05), ty = l.y + sa * (l.r * 1.05) + 2;
  ctx.fillStyle = art.outline; disc(ctx, tx, ty, 3.5);
  ctx.fillStyle = art.inside; disc(ctx, tx, ty, 2.5);
  ctx.fillStyle = art.boneRamp[3];
  ctx.fillRect(Math.round(tx - 1), Math.round(ty - 2), 1, 2); ctx.fillRect(Math.round(tx + 1), Math.round(ty + 1), 1, 2);
  // nostril
  ctx.fillStyle = art.outline;
  ctx.fillRect(Math.round(l.x + ca * l.r * 1.25 - sa * 2), Math.round(l.y + sa * l.r * 1.25 + ca * 2 - 3), 1, 1);
}

function drawGrowths(ctx: CanvasRenderingContext2D, L: BossLayout, art: BossArt, broken: boolean[], layer: "back" | "front", seed: number) {
  const R = rng(seed ^ 0x6a0);
  const bone = art.boneRamp;
  for (const g of L.spots) {
    if (g.owner >= 0 && broken[g.owner]) continue;
    switch (g.kind) {
      case "spikes": if (layer === "back") {
        for (let k = 0; k < 3; k++) {
          const a = -Math.PI / 2 + (k - 1) * 0.6 + (g.x > 0 ? 0.3 : -0.3);
          taper(ctx, g.x + Math.cos(a) * (g.size - 3), g.y + Math.sin(a) * (g.size - 3), a, 6 + R() * 6, 2.2, (R() - 0.5) * 0.5, bone);
        }
      } break;
      case "horns": if (layer === "back") {
        for (const s of [-1, 1]) taper(ctx, g.x + s * 10, g.y + 2, -Math.PI / 2 + s * 0.7, 22, 4, s * 2.2, bone);
      } break;
      case "crystals": if (layer === "front") {
        for (let k = 0; k < 3; k++) {
          const a = g.angle + (k - 1) * 0.45, len = g.size * (k === 1 ? 1.3 : 0.8);
          const bx = g.x + Math.cos(a) * 1, by = g.y + Math.sin(a) * 1;
          const tx = bx + Math.cos(a) * len, ty = by + Math.sin(a) * len;
          const px = -Math.sin(a) * 2, py = Math.cos(a) * 2;
          ctx.fillStyle = art.outline;
          for (let t = 0; t <= 1; t += 0.08) disc(ctx, bx + (tx - bx) * t, by + (ty - by) * t, Math.max(0.5, 2.6 * (1 - t)) + 1);
          for (let t = 0; t <= 1; t += 0.08) { ctx.fillStyle = t < 0.5 ? art.accentRamp[1] : art.accentRamp[2]; disc(ctx, bx + (tx - bx) * t, by + (ty - by) * t, Math.max(0.5, 2.6 * (1 - t))); }
          ctx.fillStyle = art.accentRamp[3];
          line(ctx, bx + px * 0.3, by + py * 0.3, tx, ty);
          ctx.fillStyle = "#ffffff"; ctx.fillRect(Math.round(tx), Math.round(ty), 1, 1);
        }
      } break;
      case "servers": if (layer === "front") {
        ctx.fillStyle = art.outline; ctx.fillRect(g.x - 1, g.y - 1, 12, 9);
        ctx.fillStyle = "#2a2e3a"; ctx.fillRect(g.x, g.y, 10, 7);
        ctx.fillStyle = "#4a5060"; ctx.fillRect(g.x, g.y, 10, 1);
        ctx.fillStyle = "#14161e"; ctx.fillRect(g.x + 1, g.y + 2, 6, 1); ctx.fillRect(g.x + 1, g.y + 4, 6, 1);
      } break;
      case "pipes": if (layer === "back") {
        const ex = g.x + Math.cos(g.angle) * g.size, ey = g.y + Math.sin(g.angle) * g.size;
        ctx.fillStyle = art.outline; line(ctx, g.x, g.y, ex, ey, 6);
        ctx.fillStyle = "#7a6a5a"; line(ctx, g.x, g.y, ex, ey, 4);
        ctx.fillStyle = "#b09a80"; line(ctx, g.x - 1, g.y - 1, ex - 1, ey - 1, 1);
        ctx.fillStyle = art.outline; disc(ctx, ex, ey, 4);
        ctx.fillStyle = "#5a4a3a"; disc(ctx, ex, ey, 3);
        ctx.fillStyle = "#14100c"; disc(ctx, ex, ey, 1.5);
      } break;
    }
  }
}

// ---------- details ----------

function drawVeins(ctx: CanvasRenderingContext2D, L: BossLayout, art: BossArt, R: () => number, tint: number) {
  const n = 6 + Math.floor(R() * 4);
  for (let i = 0; i < n; i++) {
    let a = R() * Math.PI * 2;
    let x = Math.cos(a) * (L.heart.r + 2), y = Math.sin(a) * (L.heart.r + 2);
    const steps = 14 + Math.floor(R() * 20);
    for (let s = 0; s < steps; s++) {
      a += (R() - 0.5) * 0.9;
      // circuit-ish: snap to 45 degrees
      const sa = Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
      x += Math.cos(sa) * 2; y += Math.sin(sa) * 2;
      ctx.fillStyle = art.body[1];
      line(ctx, x, y, x - Math.cos(sa) * 2, y - Math.sin(sa) * 2);
      if (s % 5 === 4) {
        ctx.fillStyle = tint === 2 ? art.dangerRamp[3] : art.accentRamp[2];
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
      if (R() < 0.08) a += (R() < 0.5 ? 1 : -1) * Math.PI / 2;
    }
    // via pad at the end
    ctx.fillStyle = art.body[0];
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
    ctx.fillStyle = tint ? art.dangerRamp[2] : art.accentRamp[1];
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
}

const TOKENS = ["{}", "0X", "FN", "IF", "=>", ";;", "&&", "[]", "//", "!=", "++", "<>", "$_", "0B1"];

/** Carve real code into the flesh: limbSymbols on each limb lobe, snippets on the core.
 *  Text is placed by searching the body mask so it never spills off the silhouette or over the heart/eyes/mouth. */
function drawEngravings(ctx: CanvasRenderingContext2D, kit: BossKit, L: BossLayout, art: BossArt, R: () => number, broken: boolean[], solid: (x: number, y: number) => boolean) {
  const code = kit.code;
  const taken: [number, number, number, number][] = [];
  const hx = L.heart.x, hy = L.heart.y;
  taken.push([hx - 19, hy - 12, 38, 24]);
  for (const e of L.eyes) taken.push([e.x - e.r - 2, e.y - e.r - 2, e.r * 2 + 4, e.r * 2 + 4]);
  if (L.mouth) taken.push([L.mouth.x - L.mouth.w / 2 - 6, L.mouth.y - 3, L.mouth.w + 12, 12]);
  for (const l of L.limbs) if (l.appendage === "lens" && L.body !== "hydra" && L.body !== "eye" && L.body !== "tree") taken.push([l.x - 10, l.y - 10, 20, 20]);
  const overlaps = (x: number, y: number, w: number, h: number) => taken.some(([a, b, c, d]) => x < a + c && x + w > a && y < b + d && y + h > b);
  const fits = (x: number, y: number, w: number) => {
    if (overlaps(x - 1, y - 1, w + 2, 8)) return false;
    for (let yy = y - 1; yy <= y + 6; yy += 1) for (let xx = x - 1; xx <= x + w; xx += 2) if (!solid(xx, yy)) return false;
    return solid(x + w, y + 6) && solid(x + w, y - 1);
  };
  const place = (text: string, px: number, py: number, minChars: number, radius: number): [string, number, number] | null => {
    for (let n = text.length; n >= minChars; n = n > 12 ? 12 : n - 1) {
      const t = n < text.length ? text.slice(0, n) : text;
      const w = t.length * 4 - 1;
      for (let rad = 0; rad <= radius; rad += 2)
        for (let k = 0; k < Math.max(1, rad * 2); k++) {
          const a = (k / Math.max(1, rad * 2)) * Math.PI * 2;
          const x = Math.round(px - w / 2 + Math.cos(a) * rad), y = Math.round(py - 2 + Math.sin(a) * rad * 0.7);
          if (fits(x, y, w)) return [t, x, y];
        }
    }
    return null;
  };
  const carve = (t: string, x: number, y: number) => {
    const mat = nearestMat(L, x + t.length * 2, y + 2);
    const ramp = art.mats[mat];
    const rgb = (c: number[]) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    ctx.fillStyle = rgb(ramp[5]); drawTextRaw(ctx, t, x, y + 1);   // lit lower lip
    ctx.fillStyle = rgb(ramp[0]); drawTextRaw(ctx, t, x, y);       // groove
    taken.push([x - 1, y - 1, t.length * 4 + 1, 8]);
  };
  const clean = (t: string) => t.replace(/\s+/g, " ").trim();

  const hasCode = !!code && ((code.snippets?.length ?? 0) > 0 || Object.values(code.limbSymbols ?? {}).some((v) => v.length > 0));
  if (code && hasCode) {
    // limb symbols first: they label the breakable parts
    L.limbs.forEach((l, i) => {
      if (broken[i]) return;
      const sym = code.limbSymbols?.[l.id]?.[0];
      if (!sym) return;
      const p = place(clean(sym), l.x, l.y + (l.r > 12 ? 3 : 0), 3, Math.max(4, l.r - 4));
      if (p) carve(...p);
    });
    // core snippets wherever they fit
    let placed = 0;
    for (const sn of code.snippets ?? []) {
      if (placed >= 3) break;
      const pref: [number, number][] = [[hx, hy + 22], [hx, hy - 20], [hx - 22, hy + 6], [hx + 22, hy + 6]];
      const [px, py] = pref[placed % pref.length];
      const p = place(clean(sn), px, py, 5, 30);
      if (p) { carve(...p); placed++; }
    }
    return;
  }
  // no CodeDNA: generic carved tokens
  for (let i = 0; i < 5; i++) {
    const t = TOKENS[Math.floor(R() * TOKENS.length)];
    const a = Math.PI * (0.15 + R() * 0.7) + (R() < 0.5 ? Math.PI : 0);
    const dd = L.heart.r + 8 + R() * 6;
    const p = place(t, hx + Math.cos(a) * dd, hy + Math.sin(a) * dd, 2, 6);
    if (p) carve(...p);
  }
  L.limbs.forEach((l, i) => {
    if (broken[i] || l.r < 12) return;
    const p = place(TOKENS[Math.floor(R() * TOKENS.length)], l.x, l.y + 1, 2, 4);
    if (p) carve(...p);
  });
}

function nearestMat(L: BossLayout, x: number, y: number): Material {
  let best = 1e9, m: Material = L.lobes[0]?.mat ?? "flesh";
  for (const o of L.lobes) { const d = Math.hypot(x - o.x, y - o.y) - o.r; if (d < best) { best = d; m = o.mat; } }
  return m;
}

function drawScars(ctx: CanvasRenderingContext2D, L: BossLayout, art: BossArt) {
  for (const s of L.scars) {
    ctx.fillStyle = art.body[0];
    line(ctx, s.x0, s.y0 + 1, s.x1, s.y1 + 1);
    ctx.fillStyle = art.body[4];
    line(ctx, s.x0, s.y0, s.x1, s.y1);
    // stitches
    const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
    const nx = -(s.y1 - s.y0) / len, ny = (s.x1 - s.x0) / len;
    ctx.fillStyle = art.boneRamp[3];
    for (let k = 2; k < len - 1; k += 3) {
      const x = s.x0 + ((s.x1 - s.x0) * k) / len, y = s.y0 + ((s.y1 - s.y0) * k) / len;
      line(ctx, x - nx * 1.6, y - ny * 1.6, x + nx * 1.6, y + ny * 1.6);
    }
  }
}

function drawKnots(ctx: CanvasRenderingContext2D, L: BossLayout, art: BossArt, broken: boolean[]) {
  L.limbs.forEach((l, i) => {
    if (!l.weakPoint || broken[i]) return;
    // tangled loops = circular dependency
    ctx.fillStyle = art.dangerRamp[1];
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + l.angle;
      const cx = l.x + Math.cos(a) * l.r * 0.35, cy = l.y + Math.sin(a) * l.r * 0.35;
      const rr = l.r * 0.42;
      for (let j = 0; j < 22; j++) {
        const b = (j / 22) * Math.PI * 2;
        ctx.fillRect(Math.round(cx + Math.cos(b) * rr), Math.round(cy + Math.sin(b) * rr), 1, 1);
      }
    }
    ctx.fillStyle = art.dangerRamp[3];
    disc(ctx, l.x, l.y, 1.5);
  });
}

/** Single-maintainer components (bus factor 1): cracked organs with glowing amber fissures. */
function drawFragile(ctx: CanvasRenderingContext2D, kit: BossKit, L: BossLayout, broken: boolean[]) {
  L.limbs.forEach((l, i) => {
    if (broken[i] || !kit.limbs[i]?.fragile) return;
    const R = rng(kit.seed ^ (i * 977 + 13));
    for (let c = 0; c < 4; c++) {
      let a = R() * Math.PI * 2;
      let x = l.x + Math.cos(a) * l.r * 0.2, y = l.y + Math.sin(a) * l.r * 0.2;
      const steps = 4 + Math.floor(R() * 4);
      for (let k = 0; k < steps; k++) {
        a += (R() - 0.5) * 1.3;
        const nx = x + Math.cos(a) * 2.2, ny = y + Math.sin(a) * 2.2;
        if (Math.hypot(nx - l.x, ny - l.y) > l.r - 1) break;
        ctx.fillStyle = "#1a0a02"; line(ctx, x + 1, y + 1, nx + 1, ny + 1);
        ctx.fillStyle = k % 2 ? "#ffb02e" : "#ffd27a"; line(ctx, x, y, nx, ny);
        x = nx; y = ny;
      }
    }
  });
}

function drawSocket(ctx: CanvasRenderingContext2D, L: BossLayout, art: BossArt) {
  const { x, y, r } = L.heart;
  ctx.fillStyle = art.body[0];
  disc(ctx, x, y, r + 2);
  ctx.fillStyle = art.outline;
  disc(ctx, x, y, r + 1);
  ctx.fillStyle = art.inside;
  disc(ctx, x, y + 1, r);
  // lower rim catches light
  ctx.fillStyle = art.body[4];
  for (let a = 0.35; a < Math.PI - 0.35; a += 0.08) ctx.fillRect(Math.round(x + Math.cos(a) * (r + 2)), Math.round(y + Math.sin(a) * (r + 2)), 1, 1);
}

// ---------- appendages ----------

function ball(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ramp: string[]) {
  ctx.fillStyle = ramp[0]; disc(ctx, x, y, r);
  ctx.fillStyle = ramp[1]; disc(ctx, x - 0.5, y - 0.5, Math.max(0.5, r - 1));
  if (r >= 2.5) { ctx.fillStyle = ramp[2]; disc(ctx, x - r * 0.35, y - r * 0.35, Math.max(0.5, r * 0.45)); }
  if (ramp[3] && r >= 2) { ctx.fillStyle = ramp[3]; ctx.fillRect(Math.round(x - r * 0.45), Math.round(y - r * 0.5), 1, 1); }
}

/** tapered horn / talon along a curve */
function taper(ctx: CanvasRenderingContext2D, x0: number, y0: number, a: number, len: number, w0: number, curl: number, ramp: string[]) {
  const steps = Math.max(4, Math.round(len));
  let x = x0, y = y0, ang = a;
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([x, y, Math.max(0.5, w0 * (1 - t * 0.92))]);
    ang += curl / steps;
    x += Math.cos(ang) * (len / steps); y += Math.sin(ang) * (len / steps);
  }
  ctx.fillStyle = ramp[0];
  for (const [px, py, w] of pts) disc(ctx, px, py, w);
  ctx.fillStyle = ramp[1];
  for (const [px, py, w] of pts) if (w > 1) disc(ctx, px - 0.5, py - 0.5, w - 1);
  ctx.fillStyle = ramp[2];
  for (const [px, py, w] of pts) if (w > 1.6) ctx.fillRect(Math.round(px - w * 0.4), Math.round(py - w * 0.5), 1, 1);
}

function drawAppendage(ctx: CanvasRenderingContext2D, l: LimbLayout, art: BossArt, seed: number, layer: "back" | "front", frame: number) {
  const R = rng(seed);
  const a = l.angle, ca = Math.cos(a), sa = Math.sin(a);
  const ex = l.x + ca * (l.r - 2), ey = l.y + sa * (l.r - 2); // edge point
  const bone = art.boneRamp;
  switch (l.appendage) {
    case "spines": if (layer === "back") {
      const k = 4 + Math.floor(R() * 3);
      for (let i = 0; i < k; i++) {
        const off = (i / (k - 1) - 0.5) * 1.6;
        const b = a + off;
        const len = 9 + R() * 8 - Math.abs(off) * 4;
        taper(ctx, l.x + Math.cos(b) * (l.r - 3), l.y + Math.sin(b) * (l.r - 3), b, len, 2.6, (R() - 0.5) * 0.6, bone);
      }
    } break;
    case "coil": if (layer === "back") {
      // spiralling horn of rings (stack overflow)
      let x = ex, y = ey, ang = a, r = 4.5;
      for (let i = 0; i < 16; i++) {
        ball(ctx, x, y, r, i % 2 ? art.accentRamp : [art.body[1], art.body[2], art.body[3], art.body[4]]);
        ang += 0.32; x += Math.cos(ang) * 2.2; y += Math.sin(ang) * 2.2; r = Math.max(1, r * 0.91);
      }
    } break;
    case "claw": if (layer === "back") {
      // arm segment then 3 talons
      const ax = l.x + ca * (l.r + 6), ay = l.y + sa * (l.r + 6);
      ball(ctx, ex, ey, 4.5, art.flesh);
      ball(ctx, ax, ay, 4, art.flesh);
      for (let i = -1; i <= 1; i++) taper(ctx, ax + ca * 2, ay + sa * 2, a + i * 0.55, 10 + (i === 0 ? 3 : 0), 2.2, -i * 0.9 + 0.5, bone);
    } break;
    case "lens": if (layer === "front") {
      // eye-cannon: metal barrel ring + lens (glows dynamically when charging)
      const cx = l.x + ca * 3, cy = l.y + sa * 3;
      ctx.fillStyle = art.outline; disc(ctx, cx, cy, 8);
      ctx.fillStyle = "#3a3f4f"; disc(ctx, cx, cy, 7);
      ctx.fillStyle = "#6b7287"; disc(ctx, cx - 0.5, cy - 0.5, 6);
      ctx.fillStyle = art.outline; disc(ctx, cx, cy, 5);
      ctx.fillStyle = art.accentRamp[1]; disc(ctx, cx, cy, 4);
      ctx.fillStyle = art.accentRamp[2]; disc(ctx, cx - 0.5, cy - 0.5, 2.5);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(Math.round(cx - 2), Math.round(cy - 2), 1, 1);
      // bolts
      ctx.fillStyle = "#9aa1b5";
      for (let i = 0; i < 6; i++) ctx.fillRect(Math.round(cx + Math.cos(i * 1.047) * 6.5), Math.round(cy + Math.sin(i * 1.047) * 6.5), 1, 1);
    } else {
      taper(ctx, l.x, l.y, a, l.r + 5, 4, 0, ["#2a2d3a", "#4a4f63", "#7c8299"]);
    } break;
    case "fist": if (layer === "front") {
      const fx = l.x + ca * (l.r + 1), fy = l.y + sa * (l.r + 1);
      const px = -sa, py = ca;
      ball(ctx, fx, fy, 6, art.flesh);
      for (let i = -1.5; i <= 1.5; i++) ball(ctx, fx + ca * 4 + px * i * 3, fy + sa * 4 + py * i * 3, 2.4, bone);
      ctx.fillStyle = art.outline;
      drawTextRaw(ctx, "}", Math.round(fx - 1), Math.round(fy - 2));
    } break;
    case "horns": if (layer === "back") {
      for (const s of [-1, 1]) {
        const b = a + s * 0.55;
        taper(ctx, l.x + Math.cos(b) * (l.r - 3), l.y + Math.sin(b) * (l.r - 3), b, 15 + R() * 4, 3.2, s * 1.6, bone);
      }
    } break;
    case "hive": if (layer === "front") {
      for (let i = 0; i < 4; i++) {
        const b = a + (R() - 0.5) * 2.2, dd = R() * (l.r - 4);
        const hx = l.x + Math.cos(b) * dd, hy = l.y + Math.sin(b) * dd;
        ctx.fillStyle = art.body[0]; disc(ctx, hx, hy, 2.5);
        ctx.fillStyle = art.outline; disc(ctx, hx, hy + 0.5, 1.6);
        if (R() < 0.6) { ctx.fillStyle = art.accentRamp[2]; ctx.fillRect(Math.round(hx), Math.round(hy), 1, 1); }
      }
    } break;
    case "antenna": if (layer === "back") {
      const tx = l.x + ca * (l.r + 16), ty = l.y + sa * (l.r + 16);
      ctx.fillStyle = art.outline; line(ctx, ex + 1, ey + 1, tx + 1, ty + 1, 2);
      ctx.fillStyle = "#8a90a6"; line(ctx, ex, ey, tx, ty, 1);
      for (let k = 0; k < 3; k++) {
        const t = 0.3 + k * 0.22;
        const cx = ex + (tx - ex) * t, cy = ey + (ty - ey) * t;
        ctx.fillStyle = art.dangerRamp[1]; line(ctx, cx - sa * 3, cy + ca * 3, cx + sa * 3, cy - ca * 3);
      }
      ball(ctx, tx, ty, 2.5, art.dangerRamp);
    } break;
    case "nub": if (layer === "back") {
      for (let i = 0; i < 3; i++) {
        const b = a + (i - 1) * 0.7;
        ball(ctx, l.x + Math.cos(b) * l.r, l.y + Math.sin(b) * l.r, 2.5, art.flesh);
      }
    } break;
  }
  void frame;
}

function drawWires(ctx: CanvasRenderingContext2D, l: LimbLayout, art: BossArt, seed: number) {
  const R = rng(seed);
  const st = stumpOf(l);
  const cols = ["#ff4d4d", "#ffd23f", "#3fd2ff", "#7dff6b", art.bone];
  for (let i = 0; i < 5; i++) {
    const b = l.angle + (R() - 0.5) * 1.4;
    const x0 = st.x + Math.cos(b) * (st.r - 1), y0 = st.y + Math.sin(b) * (st.r - 1);
    const len = 4 + R() * 6;
    ctx.fillStyle = cols[i % cols.length];
    let x = x0, y = y0, ang = b;
    for (let s = 0; s < len; s++) {
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      ang += (R() - 0.5) * 0.8;
      x += Math.cos(ang); y += Math.sin(ang);
    }
  }
}
