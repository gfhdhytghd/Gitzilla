// Shared FX state between drawBoss / drawEvents / drawPostFx + a pooled particle system.
import type { BossState } from "../../../shared/types.ts";
import { disc, drawGlow, hslToRgb, rgbToHex, TAU } from "./pix.ts";
import { boldSprite, textSprite } from "./font.ts";

export const fx = {
  now: 0,
  boss: null as BossState | null,
  bossSeenAt: -10,                      // drawBoss refreshes this; a stale boss (edu PvP has none) is dropped
  pvp: false,                           // edu classroom PvP: no boss, bullets colored per player
  bossFlash: -10,                       // time of last hit on the boss
  limbFlash: new Map<string, number>(), // limb id -> time of last hit
  look: null as [number, number] | null,
  lookAt: -10,
  phaseGlitch: -10,                     // time of last phase change
  limbBreak: -10,
  victoryAt: -1,
  defeatAt: -1,
  shake: 0,                             // suggested camera shake (px), decays
  hitStop: 0,                           // suggested freeze until this time
  slowmoUntil: 0,
  flash: 0,                             // full-screen white flash amount, decays
  danger: 0,                            // screen-edge danger vignette, decays
  view: { x: 0, y: 0, w: 480, h: 288 },  // visible logical window (camera); landscape default = whole arena
  textScale: 1,                         // floating-text upscale when the effective CSS zoom is small (portrait phones)
  cssPerLogical: 3,                     // measured on-screen zoom
};

export type View = { x: number; y: number; w: number; h: number };

/** Update the visible window + text scale from the caller's view and current transform. */
export function setView(ctx: CanvasRenderingContext2D, view?: View) {
  fx.view = view ? { ...view } : { x: 0, y: 0, w: 480, h: 288 };
  const m = ctx.getTransform();
  const cv = ctx.canvas as HTMLCanvasElement;
  // CSS px per logical px: use the canvas's on-screen size when it's in the DOM (callers may render at 1 canvas px per
  // logical px and upscale with CSS); otherwise assume the backing store is DPR-scaled.
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  const cssPerLogical = cv.clientWidth > 0 && cv.width > 0 ? (cv.clientWidth / cv.width) * Math.abs(m.a || 1) : Math.abs(m.a || 1) / dpr;
  fx.cssPerLogical = cssPerLogical;
  fx.textScale = cssPerLogical < 2.2 ? 2 : 1;
}

export function addShake(px: number) { fx.shake = Math.min(10, Math.max(fx.shake, px)); }

// ---------- particles ----------
export type PKind = "px" | "spark" | "smoke" | "glyph" | "ring" | "shard" | "glitch" | "boom" | "bold";

export interface Particle {
  kind: PKind;
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  size: number;
  color: string;
  color2: string;
  text: string;
  grav: number;
  drag: number;
  glow: boolean;
  spin: number;
}

const MAX = 900;
const pool: Particle[] = [];
const live: Particle[] = [];

export function emit(p: Partial<Particle> & { x: number; y: number }): Particle | null {
  if (live.length >= MAX) return null;
  const q = pool.pop() ?? ({} as Particle);
  q.kind = p.kind ?? "px"; q.x = p.x; q.y = p.y; q.vx = p.vx ?? 0; q.vy = p.vy ?? 0;
  q.life = 0; q.max = p.max ?? 0.6; q.size = p.size ?? 1; q.color = p.color ?? "#fff"; q.color2 = p.color2 ?? q.color;
  q.text = p.text ?? ""; q.grav = p.grav ?? 0; q.drag = p.drag ?? 0; q.glow = p.glow ?? false; q.spin = p.spin ?? 0;
  live.push(q);
  return q;
}

export function burst(x: number, y: number, n: number, opts: Partial<Particle> & { speed?: number; spread?: number; dir?: number; colors?: string[] }) {
  const sp = opts.speed ?? 60, spread = opts.spread ?? TAU, dir = opts.dir ?? 0;
  for (let i = 0; i < n; i++) {
    const a = dir + (Math.random() - 0.5) * spread;
    const v = sp * (0.35 + Math.random() * 0.75);
    emit({ ...opts, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: opts.colors ? opts.colors[i % opts.colors.length] : opts.color, max: (opts.max ?? 0.5) * (0.6 + Math.random() * 0.7) });
  }
}

let lastStep = -1;

export function stepParticles(now: number) {
  let dt = lastStep < 0 ? 0 : now - lastStep;
  lastStep = now;
  if (dt < 0 || dt > 0.1) dt = dt < 0 ? 0 : 0.1;
  if (now < fx.slowmoUntil) dt *= 0.3;
  if (now < fx.hitStop) dt = 0;
  for (let i = live.length - 1; i >= 0; i--) {
    const p = live[i];
    p.life += dt;
    if (p.life >= p.max) { live[i] = live[live.length - 1]; live.pop(); pool.push(p); continue; }
    p.vy += p.grav * dt;
    if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  // decay screen cues
  fx.shake = Math.max(0, fx.shake - dt * 22);
  fx.flash = Math.max(0, fx.flash - dt * 3);
  fx.danger = Math.max(0, fx.danger - dt * 1.2);
}

export function drawParticles(ctx: CanvasRenderingContext2D) {
  for (const p of live) {
    const t = p.life / p.max;
    const x = Math.round(p.x), y = Math.round(p.y);
    switch (p.kind) {
      case "px":
        ctx.fillStyle = t < 0.5 ? p.color : p.color2;
        ctx.fillRect(x, y, p.size, p.size);
        if (p.glow) drawGlow(ctx, x, y, p.color, 3 + p.size, 1 - t);
        break;
      case "spark": {
        ctx.fillStyle = t < 0.4 ? "#ffffff" : t < 0.7 ? p.color : p.color2;
        const len = Math.min(5, Math.hypot(p.vx, p.vy) * 0.04);
        const a = Math.atan2(p.vy, p.vx);
        for (let k = 0; k <= len; k++) ctx.fillRect(Math.round(p.x - Math.cos(a) * k), Math.round(p.y - Math.sin(a) * k), 1, 1);
        if (p.glow) drawGlow(ctx, x, y, p.color, 4, 1 - t);
        break;
      }
      case "smoke": {
        const r = p.size * (0.6 + t * 1.2);
        ctx.globalAlpha = (1 - t) * 0.55;
        ctx.fillStyle = t < 0.3 ? p.color : p.color2;
        disc(ctx, x, y, r);
        ctx.globalAlpha = 1;
        break;
      }
      case "glyph": {
        const s = textSprite(p.text, t < 0.15 ? "#ffffff" : p.color, "#07040c", Math.min(3, p.size + fx.textScale - 1));
        if (t > 0.75 && Math.floor(p.life * 30) % 2) break; // flicker out
        ctx.drawImage(s, Math.round(p.x - s.width / 2), Math.round(p.y - s.height / 2));
        break;
      }
      case "bold": {
        // bold code text spark (weapon impact): pops white for a frame, then the hero's color
        const s = boldSprite(p.text, t < 0.12 ? "#ffffff" : p.color);
        ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
        ctx.drawImage(s, Math.round(p.x - s.width / 2), Math.round(p.y - s.height / 2));
        ctx.globalAlpha = 1;
        break;
      }
      case "shard": {
        // code glyph debris spinning (simulated by alternating glyphs)
        const g = p.text[Math.floor(p.life * p.spin) % p.text.length] ?? "#";
        const s = textSprite(g, t < 0.5 ? p.color : p.color2, "#07040c", 1);
        ctx.drawImage(s, x - 2, y - 3);
        break;
      }
      case "glitch": {
        // RGB-split bars around a hit point
        const k = Math.floor(p.life * 40);
        for (let i = 0; i < 3; i++) {
          const h1 = Math.sin(k * 12.9898 + i * 78.233 + p.x) * 43758.5453;
          const r = h1 - Math.floor(h1);
          ctx.fillStyle = i === 0 ? "#ff2a6a" : i === 1 ? "#2ae6ff" : "#ffffff";
          ctx.globalAlpha = 0.85 * (1 - t);
          ctx.fillRect(Math.round(p.x - p.size + r * 4 - 2), Math.round(p.y - p.size * 0.6 + r * p.size * 1.2), Math.round(p.size * (0.8 + r)), 1);
        }
        ctx.globalAlpha = 1;
        break;
      }
      case "boom": {
        // pixel explosion: white core -> color -> smoke ring
        const r = p.size * (0.4 + Math.sqrt(t) * 0.8);
        if (t < 0.15) { ctx.fillStyle = "#ffffff"; disc(ctx, x, y, r); }
        else if (t < 0.5) { ctx.fillStyle = p.color; disc(ctx, x, y, r); ctx.fillStyle = "#ffe8a0"; disc(ctx, x, y, r * (0.5 - t)); }
        else { ctx.globalAlpha = 1 - t; ctx.fillStyle = p.color2; disc(ctx, x, y, r); ctx.globalAlpha = 1; }
        if (t < 0.5) drawGlow(ctx, x, y, p.color, Math.round(r * 2 + 4), 1 - t * 2);
        break;
      }
      case "ring": {
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = p.color;
        const r = p.size * (0.2 + t);
        const n = Math.max(12, Math.round(r * 5));
        for (let k = 0; k < n; k++) ctx.fillRect(Math.round(p.x + Math.cos((k / n) * TAU) * r), Math.round(p.y + Math.sin((k / n) * TAU) * r), 1, 1);
        ctx.globalAlpha = 1;
        break;
      }
    }
  }
}

export function particleCount() { return live.length; }

/** Time-gated emitter helper: returns true at most every `every` seconds per key. */
const gates = new Map<string, number>();
export function every(key: string, every: number, now: number): boolean {
  const last = gates.get(key) ?? -1e9;
  if (now - last < every && now >= last) return false;
  gates.set(key, now);
  return true;
}

// ---------- per-player colors (PvP readability; shared with claude-ui / claude-player via playerColor) ----------
const BASE_COLS = ["#5ad8ff", "#ffd23f", "#7dff9a", "#ff7ad8", "#ff9a3a", "#b48aff", "#ffffff", "#ff5a5a"];
const colorIdx = new Map<string, number>();
export function playerColor(id: string): string {
  let i = colorIdx.get(id);
  if (i === undefined) colorIdx.set(id, (i = colorIdx.size));
  if (i < BASE_COLS.length) return BASE_COLS[i];
  // 30 students: golden-angle hues, bright and saturated so they read on any floor
  return rgbToHex(hslToRgb((i * 137.508) % 360, 0.9, 0.65));
}
