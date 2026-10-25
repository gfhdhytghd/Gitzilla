// Minions are literal bugs: little beetles with an error glyph on their shell.
import type { Minion } from "../../../shared/types.ts";
import { disc, drawGlow, line } from "./pix.ts";
import { drawTextRaw } from "./font.ts";
import { burst, emit, fx } from "./fx.ts";
import { drawText } from "./font.ts";

interface Track { x: number; y: number; fx: number; fy: number; hp: number; flash: number; born: number }
const tracks = new Map<number, Track>();

type Variant = "todo" | "fixme" | "hack" | "xxx";
const STYLE: Record<Variant, { shell: [string, string, string]; mark: string; label: string; legs: number; spots: boolean; antenna: number }> = {
  todo: { shell: ["#1d3a12", "#3f7a1e", "#7ad03a"], mark: "T", label: "#b6ff3a", legs: 3, spots: false, antenna: 3 },   // green beetle
  fixme: { shell: ["#4a0a10", "#b0202a", "#ff5a4a"], mark: "!", label: "#ff7a6a", legs: 3, spots: true, antenna: 2 },  // ladybug
  hack: { shell: ["#2a1240", "#5a2a8a", "#b46bff"], mark: "#", label: "#d0a0ff", legs: 3, spots: false, antenna: 6 },   // roach, long feelers
  xxx: { shell: ["#0a0a0e", "#24242e", "#5a5a6a"], mark: "X", label: "#c8c8d8", legs: 4, spots: false, antenna: 2 },    // black mite
};

function variantOf(todo: string): Variant {
  const t = todo.toUpperCase();
  return t.includes("FIXME") ? "fixme" : t.includes("HACK") ? "hack" : t.includes("XXX") ? "xxx" : "todo";
}

function todoFor(id: number): string {
  const todos = fx.boss?.kit.code?.todos;
  return todos?.length ? todos[id % todos.length] : ["TODO", "FIXME", "HACK", "XXX"][id % 4];
}

function shortLabel(todo: string): string {
  const t = todo.replace(/^\s*(\/\/|#|\/\*|--)\s*/, "").replace(/\s+/g, " ").trim().toUpperCase();
  return t.length > 14 ? t.slice(0, 13) + "~" : t;
}

export function drawMinions(ctx: CanvasRenderingContext2D, minions: Minion[], time: number) {
  const seen = new Set<number>();
  for (const m of minions) {
    seen.add(m.id);
    let t = tracks.get(m.id);
    if (!t) {
      t = { x: m.x, y: m.y, fx: 1, fy: 0, hp: m.hp, flash: -1, born: time };
      tracks.set(m.id, t);
      emit({ kind: "ring", x: m.x, y: m.y, size: 14, max: 0.35, color: "#b6ff3a" });
      burst(m.x, m.y, 8, { kind: "smoke", speed: 25, max: 0.6, size: 2.5, color: "#4a5a3a", color2: "#22281e" });
      const todo = todoFor(m.id);
      emit({ kind: "glyph", x: m.x, y: m.y - 16, vy: -10, max: 0.9, prio: 0, text: todo.replace(/\s+/g, " ").trim().toUpperCase().slice(0, 28), color: STYLE[variantOf(todo)].label });
    }
    const dx = m.x - t.x, dy = m.y - t.y;
    if (Math.hypot(dx, dy) > 0.3) {
      const l = Math.hypot(dx, dy);
      t.fx = t.fx * 0.7 + (dx / l) * 0.3; t.fy = t.fy * 0.7 + (dy / l) * 0.3;
    }
    if (m.hp < t.hp) t.flash = time;
    t.x = m.x; t.y = m.y; t.hp = m.hp;
    const spawnK = Math.min(1, (time - t.born) / 0.25);
    const todo = todoFor(m.id);
    const st = STYLE[variantOf(todo)];
    drawBug(ctx, m.x, m.y, t.fx, t.fy, time + m.id * 0.37, time - t.flash < 0.08, st, spawnK);
    if (spawnK >= 1 && minions.length <= 8) {
      ctx.globalAlpha = 0.85;
      drawText(ctx, shortLabel(todo), Math.round(m.x), Math.round(m.y) - 13, st.label, { align: "center" });
      ctx.globalAlpha = 1;
    }
  }
  for (const [id, t] of tracks) {
    if (seen.has(id)) continue;
    // squashed!
    burst(t.x, t.y, 12, { kind: "px", speed: 60, max: 0.5, colors: ["#b6ff3a", "#3f7a1e", "#ffffff"], drag: 4 });
    burst(t.x, t.y, 4, { kind: "shard", speed: 50, max: 0.6, text: "!?#%", spin: 15, color: "#b6ff3a", color2: "#3f7a1e", grav: 120 });
    emit({ kind: "glyph", x: t.x, y: t.y - 10, vy: -16, max: 0.7, prio: 0, text: Math.random() < 0.5 ? "FIXED" : "WONTFIX", color: "#7dff9a" });
    tracks.delete(id);
  }
}

function drawBug(ctx: CanvasRenderingContext2D, x: number, y: number, fx: number, fy: number, time: number, flash: boolean, st: (typeof STYLE)[Variant], spawnK: number) {
  const fl = Math.hypot(fx, fy) || 1;
  const ux = fx / fl, uy = fy / fl, px = -uy, py = ux;
  x = Math.round(x); y = Math.round(y + Math.sin(time * 14) * 0.5);
  const [dark, mid, light] = st.shell;
  const step = Math.floor(time * 12) % 2;
  const sc = spawnK;
  // shadow
  ctx.globalAlpha = 0.35; ctx.fillStyle = "#000"; ctx.fillRect(x - 5, y + 4, 11, 2); ctx.globalAlpha = 1;
  // legs
  ctx.fillStyle = "#0a0a0a";
  const half = (st.legs - 1) / 2;
  for (let k = -half; k <= half; k++) {
    const off = (k + (step ? 0.5 : -0.5) * (Math.round(k * 2) % 2 === 0 ? -1 : 1)) * 2.6;
    for (const s of [-1, 1]) {
      const bx = x + ux * k * 2.5 + px * s * 3, by = y + uy * k * 2.5 + py * s * 3;
      line(ctx, bx, by, bx + px * s * 3.5 * sc + ux * off, by + py * s * 3.5 * sc + uy * off);
    }
  }
  // shell
  ctx.fillStyle = "#07040c"; disc(ctx, x, y, 5 * sc);
  ctx.fillStyle = flash ? "#ffffff" : dark; disc(ctx, x, y, 4 * sc);
  if (!flash) {
    ctx.fillStyle = mid; disc(ctx, x - 0.5, y - 0.5, 3 * sc);
    ctx.fillStyle = light; ctx.fillRect(x - 2, y - 2, 1, 1);
    // seam
    ctx.fillStyle = "#07040c";
    line(ctx, x - ux * 3, y - uy * 3, x + ux * 1, y + uy * 1);
    if (st.spots) { ctx.fillStyle = "#1a0606"; ctx.fillRect(x - 2, y, 1, 1); ctx.fillRect(x + 2, y - 1, 1, 1); ctx.fillRect(x + 1, y + 2, 1, 1); }
    ctx.fillStyle = "#ffd23f";
    if (sc >= 1) drawTextRaw(ctx, st.mark, x - 1 + Math.round(-ux * 1), y - 2 + Math.round(-uy * 1));
  }
  // head
  const hx = x + ux * 5, hy = y + uy * 5;
  ctx.fillStyle = "#07040c"; disc(ctx, hx, hy, 2.5 * sc);
  ctx.fillStyle = "#1a1a24"; disc(ctx, hx, hy, 1.5 * sc);
  ctx.fillStyle = "#ff2a3a";
  ctx.fillRect(Math.round(hx + px * 1.2), Math.round(hy + py * 1.2), 1, 1);
  ctx.fillRect(Math.round(hx - px * 1.2), Math.round(hy - py * 1.2), 1, 1);
  drawGlow(ctx, hx, hy, "#ff2a3a", 4, 0.5);
  // antennae
  ctx.fillStyle = "#0a0a0a";
  const wig = Math.sin(time * 9) * 1;
  const al = st.antenna;
  line(ctx, hx + px, hy + py, hx + ux * al + px * (3 + wig), hy + uy * al + py * (3 + wig));
  line(ctx, hx - px, hy - py, hx + ux * al - px * (3 - wig), hy + uy * al - py * (3 - wig));
}
