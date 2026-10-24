// Temporary stand-ins for client/render/* and client/input/* until those modules land.
// Kept deliberately simple; renderers.ts swaps in the real ones automatically.
import type {
  ArenaTheme, BossKit, BossState, Bullet, GameEvent, Hazard, InputFrame, Minion, Obstacle, PerkOffer, Pickup, PlayerKit, PlayerState,
} from "../../shared/types";
import { ARENA_H, ARENA_W, TILE } from "../../shared/types";
import type { InputHandle } from "./renderers";

const FONT = '8px "Press Start 2P", monospace';

export function drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerState, time: number, isYou: boolean) {
  const [c0, c1, c2] = p.kit.palette;
  const x = Math.round(p.x), y = Math.round(p.y);
  const bob = Math.round(Math.sin(time * 6 + p.kit.seed) * 1);
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.fillRect(x - 5, y + 6, 10, 2);
  if (!p.alive) {
    ctx.fillStyle = "#555";
    ctx.fillRect(x - 7, y + 1, 14, 6);
    ctx.fillStyle = "#ff3355";
    ctx.font = FONT;
    ctx.textAlign = "center";
    ctx.fillText("404", x, y - 6);
    return;
  }
  if (p.invuln > 0 && Math.floor(time * 20) % 2) return;
  ctx.fillStyle = "#111";
  ctx.fillRect(x - 5, y - 10 + bob, 10, 17);
  ctx.fillStyle = c0 ?? "#39ff88";
  ctx.fillRect(x - 4, y - 9 + bob, 8, 8);
  ctx.fillStyle = c1 ?? "#3de8ff";
  ctx.fillRect(x - 4, y - 1 + bob, 8, 7);
  ctx.fillStyle = c2 ?? "#fff";
  const fx = p.facing[0] >= 0 ? 1 : -1;
  ctx.fillRect(x + fx * 1, y - 6 + bob, 2, 2);
  ctx.fillStyle = "#ddd";
  ctx.fillRect(x + fx * 5 - (fx < 0 ? 4 : 0), y + bob, 5, 2);
  if (isYou) {
    ctx.fillStyle = "#39ff88";
    ctx.fillRect(x - 1, y - 16 + bob, 3, 1);
    ctx.fillRect(x, y - 15 + bob, 1, 1);
  }
}

export function playerPortrait(kit: PlayerKit, size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const u = Math.max(1, Math.floor(size / 20));
  const o = Math.floor((size - u * 16) / 2);
  const px = (x: number, y: number, w: number, hh: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(o + x * u, o + y * u, w * u, hh * u);
  };
  px(3, 1, 10, 15, "#0b0d12");
  px(4, 2, 8, 7, kit.palette[0] ?? "#39ff88");
  px(4, 9, 8, 6, kit.palette[1] ?? "#3de8ff");
  px(6, 5, 1, 2, "#fff");
  px(9, 5, 1, 2, "#fff");
  px(5, 11, 6, 1, kit.palette[2] ?? "#fff");
  return c;
}

function bossBlob(g: CanvasRenderingContext2D, kit: BossKit, cx: number, cy: number, s: number, time: number, b?: BossState) {
  const pal = kit.palette;
  const n = Math.max(3, kit.limbs.length);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.sin(time + i) * 0.15;
    const broken = b?.limbs[i]?.broken;
    const r = s * (0.22 + ((kit.seed >> i) & 3) * 0.04);
    g.fillStyle = broken ? "#333" : kit.limbs[i]?.weakPoint ? "#ff3355" : pal[(i % (pal.length - 1)) + 1] ?? "#a3f";
    g.beginPath();
    g.arc(cx + Math.cos(a) * s * 0.42, cy + Math.sin(a) * s * 0.36, r, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = pal[0] ?? "#511";
  g.beginPath();
  g.arc(cx, cy, s * 0.36, 0, Math.PI * 2);
  g.fill();
  const pulse = 0.5 + 0.5 * Math.sin(time * 4);
  g.fillStyle = `rgba(255,${60 + pulse * 80},90,1)`;
  g.beginPath();
  g.arc(cx, cy, s * (0.1 + pulse * 0.03), 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fff";
  for (let i = 0; i < 3; i++) g.fillRect(Math.round(cx - s * 0.2 + i * s * 0.18), Math.round(cy - s * 0.22), Math.max(2, s / 24), Math.max(2, s / 24));
}

export function drawBoss(ctx: CanvasRenderingContext2D, b: BossState, time: number) {
  bossBlob(ctx, b.kit, b.x, b.y, 110, time, b);
  if (b.casting) {
    ctx.strokeStyle = "#ff3355";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 60 + (b.casting.t / b.casting.total) * 10, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function bossPortrait(kit: BossKit, size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  bossBlob(g, kit, size / 2, size / 2, size * 0.9, 0);
  return c;
}

const THEME_COL: Record<ArenaTheme, [string, string]> = {
  terminal: ["#04110a", "#0c2a18"],
  kernel: ["#17110c", "#2c2016"],
  web: ["#0d0820", "#22134a"],
  notebook: ["#e8e1cf", "#cfc6ae"],
  enterprise: ["#1b2533", "#2a3a52"],
  legacy: ["#0f1a10", "#203520"],
};

export function drawArenaBackground(ctx: CanvasRenderingContext2D, theme: ArenaTheme, _seed: number, time: number) {
  const [a, b] = THEME_COL[theme] ?? THEME_COL.terminal;
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  ctx.fillStyle = b;
  for (let y = 0; y < ARENA_H; y += TILE)
    for (let x = 0; x < ARENA_W; x += TILE) if (((x + y) / TILE) % 2 === 0) ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, ARENA_W, TILE);
  ctx.fillRect(0, 0, 4, ARENA_H);
  ctx.fillRect(ARENA_W - 4, 0, 4, ARENA_H);
  ctx.fillRect(0, ARENA_H - 4, ARENA_W, 4);
  ctx.fillStyle = "#39ff88";
  for (let i = 0; i < 12; i++) if (Math.floor(time * 2 + i * 7) % 5 === 0) ctx.fillRect(10 + i * 39, 6, 2, 2);
}

const GLYPH: Record<string, string> = {
  blaster: "*", smg: ";", shotgun: "#", cannon: "@", staff: "o", laser: "=", blade: "/",
  ring: "0", spiral: "1", fan: "{}", charge: "=>", summon: "!", cascade: "~", slam: "#", laser_: "-",
};

export function drawBullets(ctx: CanvasRenderingContext2D, bullets: Bullet[], _time: number) {
  ctx.font = FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const b of bullets) {
    ctx.fillStyle = b.owner === "boss" ? "#ff4d6d" : "#9dffcb";
    ctx.fillText(GLYPH[b.kind] ?? "*", Math.round(b.x), Math.round(b.y));
  }
  ctx.textBaseline = "alphabetic";
}

export function drawHazards(ctx: CanvasRenderingContext2D, hazards: Hazard[], time: number) {
  for (const z of hazards) {
    const armed = z.armed;
    ctx.strokeStyle = armed ? "#ff3355" : `rgba(255,51,85,${0.4 + 0.4 * Math.sin(time * 20)})`;
    ctx.fillStyle = armed ? "rgba(255,51,85,.45)" : "rgba(255,51,85,.12)";
    ctx.setLineDash([3, 3]);
    ctx.lineDashOffset = -time * 20;
    if (z.kind === "laser") {
      ctx.save();
      ctx.translate(z.x, z.y);
      ctx.rotate(z.angle);
      ctx.fillRect(0, -z.r, 600, z.r * 2);
      ctx.strokeRect(0, -z.r, 600, z.r * 2);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
}

export function drawMinions(ctx: CanvasRenderingContext2D, minions: Minion[], time: number) {
  for (const m of minions) {
    const x = Math.round(m.x), y = Math.round(m.y);
    ctx.fillStyle = "#111";
    ctx.fillRect(x - 4, y - 3, 8, 7);
    ctx.fillStyle = "#b6ff3d";
    ctx.fillRect(x - 3, y - 2, 6, 5);
    ctx.fillStyle = "#111";
    const leg = Math.floor(time * 10) % 2;
    ctx.fillRect(x - 5, y - 1 + leg, 1, 1);
    ctx.fillRect(x + 4, y - leg, 1, 1);
  }
}

const floaters: { x: number; y: number; t0: number; text: string; col: string }[] = [];
export function drawEvents(ctx: CanvasRenderingContext2D, events: GameEvent[], time: number) {
  for (const e of events) {
    if (e.type === "hit") {
      const crit = e.amount >= 20;
      floaters.push({ x: e.x, y: e.y, t0: time, text: `-${Math.round(e.amount)}${crit ? " CRIT" : ""}`, col: e.target === "boss" ? "#ffe14d" : "#ff3355" });
    }
  }
  ctx.font = FONT;
  ctx.textAlign = "center";
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    const age = time - f.t0;
    if (age > 0.8 || age < 0) {
      floaters.splice(i, 1);
      continue;
    }
    ctx.fillStyle = "#000";
    ctx.fillText(f.text, Math.round(f.x) + 1, Math.round(f.y - age * 24) + 1);
    ctx.fillStyle = f.col;
    ctx.fillText(f.text, Math.round(f.x), Math.round(f.y - age * 24));
  }
}

export function drawPostFx(ctx: CanvasRenderingContext2D, _time: number, _shake: number) {
  ctx.fillStyle = "rgba(0,0,0,.18)";
  for (let y = 0; y < ARENA_H; y += 2) ctx.fillRect(0, y, ARENA_W, 1);
}

/** Minimal keyboard/mouse/touch-hold input (real one: client/input). */
export function createInput(opts: {
  canvas: HTMLCanvasElement;
  toArena: (clientX: number, clientY: number) => [number, number];
  getSelf: () => { x: number; y: number } | null;
}): InputHandle {
  const keys = new Set<string>();
  let seq = 0, fire = false, dashQ = false, skillQ = false, mouse: [number, number] | null = null, lastMouse = 0;
  const kd = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (!keys.has(k)) {
      if (k === " " || k === "k" || k === "shift") dashQ = true;
      if (k === "e" || k === "l") skillQ = true;
    }
    keys.add(k);
  };
  const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  const mm = (e: PointerEvent) => {
    mouse = opts.toArena(e.clientX, e.clientY);
    lastMouse = performance.now();
  };
  const md = (e: PointerEvent) => {
    if (e.button === 2) skillQ = true;
    else fire = true;
  };
  const mu = () => (fire = false);
  const cm = (e: Event) => e.preventDefault();
  addEventListener("keydown", kd);
  addEventListener("keyup", ku);
  addEventListener("pointermove", mm);
  opts.canvas.parentElement!.addEventListener("pointerdown", md);
  addEventListener("pointerup", mu);
  addEventListener("contextmenu", cm);
  return {
    mode: "keyboard",
    needsPermission: false,
    requestPermission: async () => true,
    calibrate() {},
    sample(): InputFrame {
      let mx = 0, my = 0;
      if (keys.has("a") || keys.has("arrowleft")) mx -= 1;
      if (keys.has("d") || keys.has("arrowright")) mx += 1;
      if (keys.has("w") || keys.has("arrowup")) my -= 1;
      if (keys.has("s") || keys.has("arrowdown")) my += 1;
      const l = Math.hypot(mx, my) || 1;
      let aim: [number, number] | null = null;
      const self = opts.getSelf();
      if (mouse && self && performance.now() - lastMouse < 2000) {
        const dx = mouse[0] - self.x, dy = mouse[1] - self.y, d = Math.hypot(dx, dy) || 1;
        aim = [dx / d, dy / d];
      }
      const f: InputFrame = { seq: seq++, move: [mx / l, my / l], aim, fire: fire || keys.has("j"), dash: dashQ, skill: skillQ, source: "keyboard" };
      dashQ = skillQ = false;
      return f;
    },
    dispose() {
      removeEventListener("keydown", kd);
      removeEventListener("keyup", ku);
      removeEventListener("pointermove", mm);
      opts.canvas.parentElement?.removeEventListener("pointerdown", md);
      removeEventListener("pointerup", mu);
      removeEventListener("contextmenu", cm);
    },
  };
}

export function drawObstacles(ctx: CanvasRenderingContext2D, obstacles: Obstacle[], _time: number) {
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.textAlign = "center";
  for (const o of obstacles) {
    const x = Math.round(o.x - o.w / 2), y = Math.round(o.y - o.h / 2);
    ctx.fillStyle = "#05070a";
    ctx.fillRect(x - 1, y - 1, o.w + 2, o.h + 2);
    ctx.fillStyle = "#1b2a3a";
    ctx.fillRect(x, y, o.w, o.h);
    ctx.fillStyle = "#3de8ff";
    ctx.fillRect(x, y, Math.round(o.w * (o.hp / o.maxHp)), 2);
    ctx.fillStyle = "#d9ffe9";
    ctx.fillText(o.label.slice(0, Math.max(2, Math.floor(o.w / 8))), Math.round(o.x), Math.round(o.y + 4));
  }
  ctx.textAlign = "left";
}

const PICKUP_COL: Record<Pickup["kind"], string> = { heart: "#ff3355", energy: "#3de8ff", armor: "#c8d4e0" };
export function drawPickups(ctx: CanvasRenderingContext2D, pickups: Pickup[], time: number) {
  for (const p of pickups) {
    const y = Math.round(p.y + Math.sin(time * 5 + p.id) * 1.5);
    ctx.fillStyle = "#000";
    ctx.fillRect(Math.round(p.x) - 3, y - 3, 7, 7);
    ctx.fillStyle = PICKUP_COL[p.kind];
    ctx.fillRect(Math.round(p.x) - 2, y - 2, 5, 5);
  }
}

export function drawPerkPads(ctx: CanvasRenderingContext2D, offer: PerkOffer | null, _players: PlayerState[], time: number) {
  if (!offer) return;
  for (const pad of offer.pads) {
    ctx.strokeStyle = `rgba(57,255,136,${0.6 + 0.4 * Math.sin(time * 6)})`;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, pad.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
