// PvP royale "GC sweep": the safe circle shrinks; outside it the garbage collector is sweeping (dark, dithered,
// a ring of `rm -rf` glyphs marches along the edge, a radar-like sweep wedge passes over the doomed area).
import type { PvpState } from "../../../shared/types.ts";
import { bayer, drawGlow, makeCanvas, TAU } from "./pix.ts";
import { boldSprite, drawText } from "./font.ts";
import { fx } from "./fx.ts";

type Zone = NonNullable<NonNullable<PvpState["royale"]>["zone"]>;

let dither: CanvasPattern | null = null;
function ditherPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (dither) return dither;
  const [c, g] = makeCanvas(4, 4);
  g.fillStyle = "#05020a";
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (bayer(x, y) < 0.5) g.fillRect(x, y, 1, 1);
  dither = ctx.createPattern(c, "repeat");
  return dither;
}

const RING = "RM -RF ";

/**
 * Draw the royale safe zone in world space (call after the arena background, before heroes).
 * matchT = MatchState.t (zone timing is in match seconds); time = render clock (animation).
 * `world` = arena size (pvpArenaSize); defaults to the visible view.
 */
export function drawRoyaleZone(ctx: CanvasRenderingContext2D, pvp: PvpState | null | undefined, matchT: number, time: number, world?: { w: number; h: number }) {
  const z = pvp?.royale?.zone;
  if (!z) return;
  const W = world?.w ?? Math.max(fx.view.x + fx.view.w, 480), H = world?.h ?? Math.max(fx.view.y + fx.view.h, 288);
  const r = Math.max(0, z.r);
  const shrinking = matchT >= z.shrinkStart && matchT < z.shrinkEnd && z.targetR < r - 0.5;
  const pending = matchT < z.shrinkStart && z.targetR < r - 0.5;

  // ---- outside: darkened, dithered "freed memory" ----
  ctx.save();
  ctx.beginPath();
  ctx.rect(-8, -8, W + 16, H + 16);
  ctx.arc(z.cx, z.cy, r, 0, TAU, true);
  ctx.closePath();
  ctx.clip("evenodd");
  ctx.fillStyle = "rgba(20,0,16,0.58)";
  ctx.fillRect(-8, -8, W + 16, H + 16);
  const pat = ditherPattern(ctx);
  if (pat) { ctx.globalAlpha = 0.55; ctx.fillStyle = pat; ctx.fillRect(-8, -8, W + 16, H + 16); ctx.globalAlpha = 1; }
  // radar sweep wedge passing over the doomed area
  const sweepA = (time * 1.4) % TAU;
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "rgba(255,40,90,0.10)";
  ctx.beginPath();
  ctx.moveTo(z.cx, z.cy);
  ctx.arc(z.cx, z.cy, Math.hypot(W, H), sweepA - 0.35, sweepA);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  // scattered "0x0 FREED" garbage glyphs drifting outside
  for (let k = 0; k < 14; k++) {
    const gx = ((k * 97 + time * 6 * (k % 2 ? 1 : -1)) % (W + 40) + W + 40) % (W + 40) - 20;
    const gy = (k * 53) % H;
    if (Math.hypot(gx - z.cx, gy - z.cy) < r + 6) continue;
    ctx.globalAlpha = 0.35;
    drawText(ctx, k % 3 ? "0X0" : "FREE()", gx, gy, "#ff5a8a", { outline: null });
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // ---- the edge: a marching ring of `RM -RF` glyphs + glow ----
  const step = 7;
  const n = Math.max(12, Math.floor((TAU * r) / step));
  const off = time * 0.25;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + off;
    const x = z.cx + Math.cos(a) * r, y = z.cy + Math.sin(a) * r;
    if (x < -6 || y < -6 || x > W + 6 || y > H + 6) continue;
    const ch = RING[i % RING.length];
    if (ch === " ") continue;
    const g = boldSprite(ch, shrinking ? "#ff3a6a" : "#ff8ab0");
    ctx.drawImage(g, Math.round(x - g.width / 2), Math.round(y - g.height / 2));
    if (i % 6 === 0) drawGlow(ctx, x, y, "#ff2a5a", 8, shrinking ? 0.6 : 0.35);
  }

  // ---- telegraph the next circle (dashed white) + countdown ----
  if ((pending || shrinking) && z.targetR > 1) {
    const m = Math.max(16, Math.floor(TAU * z.targetR / 3));
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < m; i++) {
      if (((i + Math.floor(time * 10)) >> 1) % 2) continue;
      const a = (i / m) * TAU;
      ctx.fillRect(Math.round(z.cx + Math.cos(a) * z.targetR), Math.round(z.cy + Math.sin(a) * z.targetR), 1, 1);
    }
  }
  // label at the top of the ring (clamped into the visible view so phones always see it)
  const v = fx.view;
  const label = pending ? "GC SWEEP IN " + Math.max(0, z.shrinkStart - matchT).toFixed(0) + "S" : shrinking ? "GC SWEEP!" : "";
  if (label) {
    const ly = Math.max(v.y + 30, Math.min(v.y + v.h - 20, z.cy - r - 10));
    const lx = Math.max(v.x + 40, Math.min(v.x + v.w - 40, z.cx));
    drawText(ctx, label, lx, ly, Math.floor(time * 4) % 2 ? "#ffffff" : "#ff5a8a", { align: "center", scale: fx.textScale });
  }
}
