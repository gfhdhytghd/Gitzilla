// Screen-space post FX. Works at device resolution: reads the current transform to find the
// logical 480x288 rect (caller's integer scale + letterbox offset), then draws in identity space.
import { ARENA_H, ARENA_W } from "../../../shared/types.ts";
import { bayer, hash2, makeCanvas } from "./pix.ts";
import { drawText } from "./font.ts";
import { fx } from "./fx.ts";

let vignette: HTMLCanvasElement | null = null;
let dangerVig: HTMLCanvasElement | null = null;
let scratch: [HTMLCanvasElement, CanvasRenderingContext2D] | null = null;
const scanCache = new Map<number, HTMLCanvasElement>();

function buildVignette(color: string, strength: number, power: number, edge = 0.78) {
  const [c, g] = makeCanvas(ARENA_W, ARENA_H);
  g.fillStyle = color;
  for (let y = 0; y < ARENA_H; y++)
    for (let x = 0; x < ARENA_W; x++) {
      const dx = (x - ARENA_W / 2) / (ARENA_W / 2), dy = (y - ARENA_H / 2) / (ARENA_H / 2);
      const d = Math.pow((dx * 0.9) ** 2 + (dy * 0.95) ** 2, 0.5);
      const v = Math.pow(Math.max(0, d - edge) / (1.35 - edge), power) * strength;
      if (v > bayer(x, y)) g.fillRect(x, y, 1, 1);
    }
  return c;
}

function scanlines(scale: number) {
  const s = Math.max(1, Math.round(scale));
  let c = scanCache.get(s);
  if (!c) {
    const h = s >= 3 ? s : 2;
    const [cv, g] = makeCanvas(1, h);
    g.fillStyle = "rgba(0,0,0,0.22)";
    g.fillRect(0, h - 1, 1, 1);
    if (s >= 4) { g.fillStyle = "rgba(255,255,255,0.025)"; g.fillRect(0, 0, 1, 1); }
    scanCache.set(s, (c = cv));
  }
  return c;
}

function getScratch(w: number, h: number) {
  if (!scratch || scratch[0].width < w || scratch[0].height < h) scratch = makeCanvas(w, h);
  return scratch;
}

export function drawPostFx(ctx: CanvasRenderingContext2D, time: number, shake: number) {
  fx.now = time;
  const m = ctx.getTransform();
  const sx = m.a || 1, sy = m.d || 1;
  const x0 = Math.round(m.e), y0 = Math.round(m.f);
  const W = Math.round(ARENA_W * sx), H = Math.round(ARENA_H * sy);
  const canvas = ctx.canvas as HTMLCanvasElement;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  const sh = Math.max(shake, fx.shake);
  const sincePhase = time - fx.phaseGlitch;
  const glitch = sincePhase >= 0 && sincePhase < 0.7 ? 1 - sincePhase / 0.7 : time - fx.limbBreak < 0.15 ? 0.4 : fx.defeatAt > 0 && hash2(Math.floor(time * 10), 3) < 0.2 ? 0.5 : 0;

  // ---- glitch slices (phase change, limb break, defeat) ----
  if (glitch > 0) {
    const [sc, sg] = getScratch(W, H);
    sg.clearRect(0, 0, W, H);
    sg.drawImage(canvas, x0, y0, W, H, 0, 0, W, H);
    const n = 10;
    for (let i = 0; i < n; i++) {
      const r = hash2(Math.floor(time * 24), i, 9);
      if (r > 0.25 + glitch * 0.5) continue;
      const yy = Math.floor(hash2(Math.floor(time * 24), i, 1) * H);
      const hh = Math.max(sy, Math.floor(hash2(Math.floor(time * 24), i, 2) * 24 * sy));
      const off = Math.round((hash2(Math.floor(time * 24), i, 3) - 0.5) * 40 * sx * glitch);
      ctx.drawImage(sc, 0, yy, W, hh, x0 + off, y0 + yy, W, hh);
      if (r < 0.08) {
        ctx.fillStyle = r < 0.04 ? "rgba(255,0,80,0.35)" : "rgba(0,229,255,0.35)";
        ctx.fillRect(x0, y0 + yy, W, hh);
      }
    }
  }

  // ---- chromatic aberration on shake / glitch ----
  const ca = Math.min(3, sh * 0.35 + glitch * 3);
  if (ca >= 0.8) {
    const k = Math.max(1, Math.round(ca)) * Math.max(1, Math.round(sx / 2));
    const [sc, sg] = getScratch(W, H);
    sg.globalCompositeOperation = "source-over";
    sg.clearRect(0, 0, W, H);
    sg.drawImage(canvas, x0, y0, W, H, 0, 0, W, H);
    sg.globalCompositeOperation = "multiply";
    sg.fillStyle = "#ff0000";
    sg.fillRect(0, 0, W, H);
    sg.globalCompositeOperation = "source-over";
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "#00ffff";
    ctx.fillRect(x0, y0, W, H);
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(sc, 0, 0, W, H, x0 - k, y0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }

  // ---- danger vignette (red edges) ----
  if (fx.danger > 0.05) {
    if (!dangerVig) dangerVig = buildVignette("#c0002a", 1.1, 1.5, 0.85);
    ctx.globalAlpha = Math.min(1, fx.danger) * (0.3 + 0.12 * Math.sin(time * 14));
    ctx.drawImage(dangerVig, x0, y0, W, H);
    ctx.globalAlpha = 1;
  }

  // ---- white flash ----
  if (fx.flash > 0.02) {
    ctx.globalAlpha = Math.min(0.8, fx.flash * 0.6);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x0, y0, W, H);
    ctx.globalAlpha = 1;
  }

  // ---- CRT: scanlines + vignette ----
  const pat = ctx.createPattern(scanlines(sy), "repeat");
  if (pat) {
    pat.setTransform(new DOMMatrix().translate(0, y0));
    ctx.fillStyle = pat;
    ctx.fillRect(x0, y0, W, H);
  }
  if (!vignette) vignette = buildVignette("#000000", 1, 1.8, 0.8);
  const bright = fx.boss?.kit.theme === "notebook" || fx.boss?.kit.theme === "enterprise";
  ctx.globalAlpha = bright ? 0.35 : 0.7;
  ctx.drawImage(vignette, x0, y0, W, H);
  ctx.globalAlpha = 1;

  ctx.restore();

  // ---- end screens (drawn in logical space) ----
  if (fx.victoryAt > 0 && time - fx.victoryAt > 1.75) bsod(ctx, time - fx.victoryAt - 1.75);
  if (fx.defeatAt > 0 && time - fx.defeatAt > 0.6) panic(ctx, time - fx.defeatAt - 0.6);
}

function bsod(ctx: CanvasRenderingContext2D, t: number) {
  const k = Math.min(1, t / 0.25);
  ctx.save();
  ctx.globalAlpha = k * 0.93;
  ctx.fillStyle = "#0a3fb0";
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  ctx.globalAlpha = k;
  const name = (fx.boss?.kit.name ?? "BOSS").split(",")[0].toUpperCase();
  const lines: [string, number, string][] = [
    [":(", 4, "#ffffff"],
    ["", 1, ""],
    ["YOUR BOSS RAN INTO A PROBLEM AND NEEDS TO RESTART.", 1, "#ffffff"],
    ["", 1, ""],
    ["SEGMENTATION FAULT (CORE DUMPED)", 2, "#ffffff"],
    ["", 1, ""],
    ["PROCESS: " + name + "   SIGNAL: SIGSEGV   ADDR: 0X0000DEAD", 1, "#cfe0ff"],
    ["STOP CODE: SQUAD_DIFF", 1, "#cfe0ff"],
    ["", 1, ""],
    ["COLLECTING AUTOPSY DATA... " + Math.min(100, Math.floor(t * 45)) + "% COMPLETE", 1, "#ffffff"],
  ];
  let y = 40;
  const shown = Math.floor(t * 18);
  lines.forEach(([s, sc, c], i) => {
    if (i <= shown && s) drawText(ctx, s, 40, y, c, { scale: sc, outline: null });
    y += 5 * sc + 6;
  });
  // QR-ish block, for authenticity
  for (let yy = 0; yy < 9; yy++) for (let xx = 0; xx < 9; xx++) if (hash2(xx, yy, 42) < 0.5 || xx % 8 === 0 && yy % 8 === 0) { ctx.fillStyle = "#ffffff"; ctx.fillRect(40 + xx * 3, y + 4 + yy * 3, 3, 3); }
  ctx.restore();
}

function panic(ctx: CanvasRenderingContext2D, t: number) {
  const k = Math.min(1, t / 0.4);
  ctx.save();
  ctx.globalAlpha = k * 0.75;
  ctx.fillStyle = "#1a0006";
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  ctx.globalAlpha = k;
  const blink = Math.floor(t * 3) % 2 === 0;
  drawText(ctx, "KERNEL PANIC", ARENA_W / 2, 92, blink ? "#ff2a4a" : "#ffffff", { scale: 4, align: "center" });
  drawText(ctx, "NOT SYNCING: ATTEMPTED TO KILL INIT! EXITCODE=0X00000009", ARENA_W / 2, 124, "#ff8a9a", { align: "center" });
  const trace = ["CALL TRACE:", " <SQUAD_WIPE+0X1F/0X40>", " <BOSS_GLOAT+0X2A/0X80>", " <DO_EXIT+0X99/0XA0>", "---[ END KERNEL PANIC ]---"];
  trace.forEach((s, i) => { if (t * 8 > i) drawText(ctx, s, 150, 140 + i * 8, "#c04a5a"); });
  ctx.restore();
}
