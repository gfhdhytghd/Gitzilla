// Player renderer: Soul Knight-style chibi heroes generated from repo kits.
// All drawing is in logical arena px; the caller applies integer scale + imageSmoothingEnabled=false.
import type { GameEvent, PlayerKit, PlayerState, WeaponKind } from "../../../shared/types.ts";
import { lookFor, type HeroLook } from "./look.ts";
import { heroFrame, heroRim, tinted, ANCHOR_X, type Expr, type FrameSpec } from "./sprite.ts";
import { weaponSprite, drawMuzzle } from "./weapons.ts";
import { drawText } from "./font.ts";
import { rgba, hashStr, hexToHsl, hslToHex } from "./color.ts";

export { lookFor } from "./look.ts";

/** Grid row of the feet bottom edge relative to sprite top. Feet bottom = p.y + FOOT. */
const FOOT = 8;
const SPRITE_FOOT = 27;

// ---------------------------------------------------------------- per-player memory
interface Particle {
  x: number; y: number; vx: number; vy: number; g: number;
  life: number; max: number; col: string; sz: number; glyph?: string; add?: boolean; front?: boolean;
}
interface Ghost { x: number; y: number; fr: HTMLCanvasElement; flip: number; t: number; life: number; alpha: number }
interface Mem {
  t: number; x: number; y: number;
  hp: number; armor: number; energy: number; alive: boolean; dashCd: number;
  buffs: Set<string>;
  dist: number; flip: number;
  hurtT: number; hpHit: boolean; shotT: number; dashT: number; reviveT: number; downT: number;
  skillT: Record<string, number>;
  ghosts: Ghost[]; parts: Particle[];
  hist: { t: number; x: number; y: number }[];
  forkX: number; forkY: number; rollX: number; rollY: number;
  lastGhost: number; lastDust: number; lastFlame: number; lastPlus: number;
  swingDir: number;
  phase: number;
  duckX: number; duckY: number; duckFlip: number;
  kbT: number; kbX: number; kbY: number; kbAmp: number; crit: boolean;
}

const mems = new Map<string, Mem>();
/** Last known position of the local player (for proximity-revealed teammate tags). */
let youPos: { x: number; y: number; t: number } | null = null;
const externalShots = new Map<string, number>();
const externalHits = new Map<string, { dir: [number, number]; impact: number; crit: boolean }>();

/**
 * Optional hook: forward each snapshot's events (call once per released batch). "hit" events that
 * target a player give that hero directional knockback scaled by `impact`, and a harder flash on crits.
 * Hurt FX still trigger without this from hp/armor drops; this only adds direction/strength.
 */
export function notePlayerEvents(events: GameEvent[]): void {
  for (const e of events) {
    if (e.type !== "hit" || e.target === "boss") continue;
    const d = e.direction;
    const len = d ? Math.hypot(d[0], d[1]) : 0;
    externalHits.set(e.target, {
      dir: len > 0 ? [d![0] / len, d![1] / len] : [0, 0],
      impact: Math.max(0, Math.min(1, e.impact ?? 0.4)),
      crit: !!e.crit,
    });
  }
}

function normTime(time: number): number {
  return time > 1e4 ? time / 1000 : time;
}

/**
 * Optional hook: call when you see a new bullet owned by a player (or on any "fire" knowledge),
 * so muzzle flashes / sword swings sync exactly with shots. Energy drops are also detected automatically.
 */
export function notePlayerShot(playerId: string): void {
  externalShots.set(playerId, -1);
}

function memFor(p: PlayerState, t: number): Mem {
  let m = mems.get(p.id);
  if (!m) {
    m = {
      t, x: p.x, y: p.y, hp: p.hp, armor: p.armor, energy: p.energy, alive: p.alive, dashCd: p.dashCd,
      buffs: new Set(p.buffs), dist: 0, flip: p.facing[0] < 0 ? -1 : 1,
      hurtT: -99, hpHit: false, shotT: -99, dashT: -99, reviveT: -99, downT: -99, skillT: {},
      ghosts: [], parts: [], hist: [], forkX: p.x, forkY: p.y, rollX: p.x, rollY: p.y,
      lastGhost: 0, lastDust: 0, lastFlame: 0, lastPlus: 0, swingDir: 1, duckX: p.x - 12, duckY: p.y - 10, duckFlip: 1,
      kbT: -99, kbX: 0, kbY: 0, kbAmp: 0, crit: false,
      phase: (hashStr(p.id) % 1000) / 1000,
    };
    if (mems.size > 48) for (const [k, v] of mems) if (t - v.t > 5) mems.delete(k);
    mems.set(p.id, m);
  }
  return m;
}

const FIRE_INTERVAL: Record<WeaponKind, number> = {
  blaster: 0.22, smg: 0.09, shotgun: 0.5, cannon: 0.7, staff: 0.3, laser: 0.08, blade: 0.35,
};

const SKILL_COLOR: Record<string, string> = {
  firewall: "#58e6ff", fork: "#b98bff", hotfix: "#5dff8a", overclock: "#ffa53a", rollback: "#6aa8ff",
};
const SKILL_TEXT: Record<string, string> = {
  firewall: "$ FIREWALL", fork: "$ GIT FORK", hotfix: "$ HOTFIX", overclock: "$ OVERCLOCK", rollback: "$ GIT REVERT",
};

function spawn(m: Mem, n: number, f: (i: number) => Particle) {
  for (let i = 0; i < n; i++) m.parts.push(f(i));
  if (m.parts.length > 120) m.parts.splice(0, m.parts.length - 120);
}

/** Observe state transitions -> trigger FX timers & particles. */
function observe(p: PlayerState, m: Mem, L: HeroLook, t: number, dt: number) {
  const hit = externalHits.get(p.id);
  if (hit) {
    externalHits.delete(p.id);
    m.kbT = t; m.kbX = hit.dir[0]; m.kbY = hit.dir[1]; m.kbAmp = 1.5 + 3 * hit.impact; m.crit = hit.crit;
    if (t - m.hurtT > 0.1) m.hurtT = t; // event may land before the hp drop is visible
  }
  const tot = p.hp + p.armor, lastTot = m.hp + m.armor;
  if (p.alive && m.alive && tot < lastTot - 0.001) {
    m.hurtT = t;
    m.hpHit = p.hp < m.hp - 0.001;
    const hy = p.y - 4;
    if (m.hpHit) {
      spawn(m, 8, () => ({
        x: p.x, y: hy, vx: (Math.random() - 0.5) * 90, vy: -Math.random() * 70 - 10, g: 220,
        life: 0.5, max: 0.5, col: Math.random() < 0.5 ? "#ff3b5c" : "#ffd0d8", sz: 1, front: true,
      }));
    } else {
      // armor shards (hexy cyan)
      spawn(m, 7, (i) => {
        const a = (i / 7) * Math.PI * 2 + Math.random();
        return { x: p.x + Math.cos(a) * 6, y: hy + Math.sin(a) * 6, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 - 20, g: 120,
          life: 0.4, max: 0.4, col: i % 2 ? "#9df3ff" : "#3fc8ff", sz: 2, add: true, front: true };
      });
    }
  }
  if (p.energy < m.energy - 0.01) m.shotT = Math.max(m.shotT, t - 0.0);
  const ext = externalShots.get(p.id);
  if (ext !== undefined) { m.shotT = t; externalShots.delete(p.id); }
  const firing = (p as PlayerState & { firing?: boolean }).firing;
  if (firing && p.alive && t - m.shotT >= FIRE_INTERVAL[p.kit.weapon]) m.shotT = t;
  if (m.shotT === t && p.kit.weapon === "blade") m.swingDir = -m.swingDir;

  if (p.dashCd > m.dashCd + 0.05 && p.alive) {
    m.dashT = t;
    spawn(m, 6, () => ({
      x: p.x + (Math.random() - 0.5) * 6, y: p.y + FOOT - 1, vx: -p.vx * 0.1 + (Math.random() - 0.5) * 30, vy: -Math.random() * 15, g: 0,
      life: 0.35, max: 0.35, col: "#d8d0e8", sz: 2,
    }));
  }
  if (!p.alive && m.alive) {
    m.downT = t;
    spawn(m, 14, (i) => {
      const a = (i / 14) * Math.PI * 2;
      return { x: p.x, y: p.y, vx: Math.cos(a) * 50, vy: Math.sin(a) * 30 - 20, g: 40, life: 0.8, max: 0.8,
        col: i % 3 === 0 ? "#ff3b5c" : "#9aa0b8", sz: 1, glyph: i % 4 === 0 ? (i % 8 ? "0" : "1") : undefined, front: true };
    });
  }
  if (p.alive && !m.alive) {
    m.reviveT = t;
    spawn(m, 18, (i) => {
      const a = (i / 18) * Math.PI * 2;
      return { x: p.x, y: p.y - 2, vx: Math.cos(a) * 70, vy: Math.sin(a) * 50 - 30, g: 60, life: 0.9, max: 0.9,
        col: i % 2 ? "#5dff8a" : "#e8fff0", sz: i % 3 ? 1 : 2, add: true, front: true, glyph: i % 6 === 0 ? "+" : undefined };
    });
  }
  // skills
  for (const b of p.buffs) {
    if (!m.buffs.has(b)) {
      m.skillT[b] = t;
      const col = SKILL_COLOR[b] ?? L.c.accent;
      if (b === "fork") { m.forkX = p.x; m.forkY = p.y; }
      if (b === "rollback") { m.rollX = m.x; m.rollY = m.y; }
      spawn(m, 16, (i) => {
        const a = (i / 16) * Math.PI * 2;
        return { x: p.x, y: p.y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 50, g: 0, life: 0.5, max: 0.5, col, sz: 1, add: true, front: true };
      });
    }
  }
  // history for rollback ghost
  m.hist.push({ t, x: p.x, y: p.y });
  while (m.hist.length && t - m.hist[0].t > 2.2) m.hist.shift();

  // run distance for animation
  const sp = Math.hypot(p.vx, p.vy);
  m.dist += sp * dt;
  void L;
}

// ---------------------------------------------------------------- small pixel primitives
function px(ctx: CanvasRenderingContext2D, x: number, y: number, w = 1, h = 1) {
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function pixLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 200; i++) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function pixEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, from = 0, to = Math.PI * 2, gap = 0, offset = 0) {
  const n = Math.max(12, Math.round((rx + ry) * 3));
  let last = "";
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    if (gap && Math.floor(((a + offset) / (Math.PI * 2)) * gap * 2) % 2 === 1) continue;
    const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
    const k = x + "," + y;
    if (k === last) continue;
    last = k;
    ctx.fillRect(x, y, 1, 1);
  }
}

function filledEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  cx = Math.round(cx); cy = Math.round(cy);
  for (let dy = -ry; dy <= ry; dy++) {
    const w = Math.round(rx * Math.sqrt(1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5))));
    ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}

// ---------------------------------------------------------------- frame selection
function pickFrame(p: PlayerState, m: Mem, t: number): FrameSpec {
  const sp = Math.hypot(p.vx, p.vy);
  let expr: Expr = "normal";
  if (!p.alive) expr = "ko";
  else if (t - m.hurtT < 0.35) expr = "hurt";
  else {
    const bt = (t + m.phase * 3.7) % 3.3;
    if (bt < 0.12) expr = "blink";
  }
  if (p.alive && sp > 12) return { pose: "run", i: Math.floor(m.dist / 6) % 4, expr };
  return { pose: "idle", i: Math.floor(t * 1.6 + m.phase * 2) % 2, expr };
}

// ---------------------------------------------------------------- body composition
function drawBody(ctx: CanvasRenderingContext2D, L: HeroLook, fr: FrameSpec, x: number, feet: number, flip: number, sx: number, sy: number, variant = "") {
  const cv = heroFrame(L, fr, variant);
  ctx.save();
  ctx.translate(x, feet);
  ctx.scale(flip * sx, sy);
  ctx.drawImage(cv, -ANCHOR_X, -SPRITE_FOOT);
  ctx.restore();
}

function drawWeapon(ctx: CanvasRenderingContext2D, L: HeroLook, p: PlayerState, m: Mem, t: number, x: number, feet: number, flip: number, bob: number) {
  const kind = p.kit.weapon;
  const ws = weaponSprite(L, kind);
  let ang = Math.atan2(p.facing[1], p.facing[0]);
  if (!isFinite(ang) || (p.facing[0] === 0 && p.facing[1] === 0)) ang = flip < 0 ? Math.PI : 0;
  const since = t - m.shotT;
  let recoil = 0;
  let swing = 0;
  if (kind === "blade") {
    if (since < 0.2) {
      const k = since / 0.2;
      swing = m.swingDir * (-1.4 + 2.8 * (1 - (1 - k) * (1 - k)));
    } else swing = -0.5 * m.swingDir; // resting angle, blade raised
  } else if (since < 0.12) {
    const big = kind === "cannon" ? 4 : kind === "shotgun" ? 3 : 2;
    recoil = big * (1 - since / 0.12);
  }
  // idle sway of the weapon
  if (kind !== "blade") ang += Math.sin(t * 2 + m.phase * 6) * 0.03;
  const hx = x + 3 * flip, hy = feet - 6 + bob;
  ctx.save();
  ctx.translate(hx, hy);
  // slash arc behind the blade
  if (kind === "blade" && since < 0.22) {
    const k = since / 0.22;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 1 - k;
    const a0 = ang - 1.4 * m.swingDir, a1 = ang + swing * (Math.cos(ang) < 0 ? -1 : 1);
    ctx.fillStyle = L.c.accentL;
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
    for (let r = 11; r <= 15; r++) {
      ctx.fillStyle = r === 13 || r === 14 ? "#ffffff" : r === 15 ? L.c.accentL : "#a8ecff";
      pixEllipse(ctx, 0, 0, r, r, lo, hi);
    }
    ctx.restore();
  }
  ctx.rotate(ang);
  const leftward = Math.cos(ang) < 0;
  if (leftward) ctx.scale(1, -1);
  ctx.rotate(swing);
  ctx.translate(-Math.round(recoil), 0);
  ctx.drawImage(ws.canvas, -ws.px, -ws.py);
  // tip glow for staff/laser, muzzle flash on shot
  if (kind === "staff" || kind === "laser") {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 6 + m.phase * 9);
    ctx.fillStyle = L.c.accent;
    ctx.beginPath();
    ctx.arc(ws.tipX - 1, ws.tipY, kind === "staff" ? 4 : 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (kind !== "blade" && since < 0.07) {
    ctx.translate(ws.tipX, ws.tipY);
    drawMuzzle(ctx, L, kind, 1 - since / 0.07);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- auras
function hexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number, sq = 0.8) {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = rot + (i * Math.PI) / 3;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * sq]);
  }
  for (let i = 0; i < 6; i++) pixLine(ctx, pts[i][0], pts[i][1], pts[(i + 1) % 6][0], pts[(i + 1) % 6][1]);
  return pts;
}

function drawFirewall(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, age: number) {
  const pop = Math.min(1, age / 0.18);
  const r = 15 * (0.4 + 0.6 * pop) + Math.sin(t * 5) * 0.6;
  const cy = y - 2;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = "#58e6ff";
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = t * 0.6 + (i * Math.PI) / 3;
    const xx = x + Math.cos(a) * r, yy = cy + Math.sin(a) * r * 0.85;
    if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
  }
  ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "#58e6ff";
  const pts = hexagon(ctx, x, cy, r, t * 0.6, 0.85);
  ctx.globalAlpha = 0.35;
  hexagon(ctx, x, cy, r - 4, -t * 0.9, 0.85);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#e6fdff";
  for (const [px0, py0] of pts) px(ctx, px0 - 1, py0 - 1, 2, 2);
  // scrolling bits on the shell
  ctx.globalAlpha = 0.8;
  const bits = Math.floor(t * 8);
  for (let i = 0; i < 3; i++) {
    const a = t * 0.6 + (i * 2 + 1) * (Math.PI / 3) - Math.PI / 6;
    drawText(ctx, (bits + i) % 2 ? "1" : "0", x + Math.cos(a) * (r + 1), cy + Math.sin(a) * (r + 1) * 0.85 - 3, "#9df3ff", "center", "");
  }
  ctx.restore();
}

function drawRevive(ctx: CanvasRenderingContext2D, x: number, y: number, prog: number, t: number) {
  const cx = x, cy = y + 2, r = 14;
  ctx.fillStyle = "rgba(93,255,138,0.25)";
  pixEllipse(ctx, cx, cy, r, r * 0.7, 0, Math.PI * 2, 12, t * 1.5);
  if (prog > 0) {
    ctx.fillStyle = "#5dff8a";
    const a0 = -Math.PI / 2;
    pixEllipse(ctx, cx, cy, r, r * 0.7, a0, a0 + prog * Math.PI * 2);
    pixEllipse(ctx, cx, cy, r + 1, r * 0.7 + 1, a0, a0 + prog * Math.PI * 2);
    drawText(ctx, "REVIVE " + Math.floor(prog * 100) + "%", x, y + 14, "#5dff8a");
  }
}

// ---------------------------------------------------------------- main entry
export function drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerState, time: number, isYou: boolean): void {
  const t = normTime(time);
  const L = lookFor(p.kit);
  const m = memFor(p, t);
  const dt = Math.max(0, Math.min(0.1, t - m.t));
  if (isYou) youPos = { x: p.x, y: p.y, t };
  observe(p, m, L, t, dt);

  const x = Math.round(p.x), y = Math.round(p.y);
  const feet = y + FOOT;
  const sp = Math.hypot(p.vx, p.vy);
  if (p.facing[0] > 0.12) m.flip = 1;
  else if (p.facing[0] < -0.12) m.flip = -1;
  const flip = m.flip;
  const fr = pickFrame(p, m, t);
  const dashing = t - m.dashT < 0.25 || sp > p.kit.speed * 1.7;
  const overclock = p.buffs.includes("overclock");

  // --- ground: shadow + friendly ring
  ctx.fillStyle = "rgba(8,4,16,0.42)";
  filledEllipse(ctx, x, feet, 6, 2);
  if (p.alive) {
    const pulse = 0.55 + 0.45 * Math.sin(t * 4 + m.phase * 6);
    if (isYou) {
      ctx.fillStyle = rgba("#ffe45c", 0.5 + 0.4 * pulse);
      pixEllipse(ctx, x, feet, 10, 4, 0, Math.PI * 2, 6, t * 2);
    } else {
      ctx.fillStyle = rgba(L.c.ring, 0.62);
      pixEllipse(ctx, x, feet, 9, 3.5, 0, Math.PI * 2);
    }
  }

  // --- emitters
  if (p.alive && sp > 25 && t - m.lastDust > 0.14 && !dashing) {
    m.lastDust = t;
    spawn(m, 2, () => ({ x: x - Math.sign(p.vx || flip) * 3 + (Math.random() - 0.5) * 3, y: feet - 1, vx: -p.vx * 0.15 + (Math.random() - 0.5) * 10, vy: -Math.random() * 8, g: 0,
      life: 0.35, max: 0.35, col: "#c9bfd8", sz: Math.random() < 0.4 ? 2 : 1 }));
  }
  if (p.alive && (dashing || (overclock && sp > 20)) && t - m.lastGhost > (dashing ? 0.04 : 0.08)) {
    m.lastGhost = t;
    const tint = overclock && !dashing ? "#ff8a2a" : "#a8ecff";
    m.ghosts.push({ x, y: feet, fr: heroFrame(L, fr, tint), flip, t, life: dashing ? 0.22 : 0.3, alpha: dashing ? 0.42 : 0.3 });
    if (m.ghosts.length > 14) m.ghosts.shift();
  }
  if (overclock && p.alive && t - m.lastFlame > 0.04) {
    m.lastFlame = t;
    spawn(m, 2, () => ({ x: x + (Math.random() - 0.5) * 10, y: feet - Math.random() * 6, vx: (Math.random() - 0.5) * 10 - p.vx * 0.2, vy: -25 - Math.random() * 25, g: -20,
      life: 0.45, max: 0.45, col: Math.random() < 0.5 ? "#ffcf3a" : "#ff6a1a", sz: Math.random() < 0.3 ? 2 : 1, add: true }));
  }
  if (p.buffs.includes("hotfix") && p.alive && t - m.lastPlus > 0.18) {
    m.lastPlus = t;
    spawn(m, 1, () => ({ x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 8, vx: 0, vy: -18, g: 0,
      life: 0.9, max: 0.9, col: "#5dff8a", sz: 1, glyph: "+", front: true }));
  }

  // --- particles (back layer) + afterimages
  updateDrawParticles(ctx, m, dt, false);
  for (let i = m.ghosts.length - 1; i >= 0; i--) {
    const gh = m.ghosts[i];
    const k = 1 - (t - gh.t) / gh.life;
    if (k <= 0) { m.ghosts.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = gh.alpha * k;
    ctx.translate(gh.x, gh.y);
    ctx.scale(gh.flip, 1);
    ctx.drawImage(gh.fr, -ANCHOR_X, -SPRITE_FOOT);
    ctx.restore();
  }

  // --- skill: hotfix pulse rings (ground)
  if (p.buffs.includes("hotfix")) {
    const k = ((t - (m.skillT.hotfix ?? 0)) % 0.8) / 0.8;
    ctx.fillStyle = rgba("#5dff8a", 0.8 * (1 - k));
    pixEllipse(ctx, x, feet, 4 + k * 22, (4 + k * 22) * 0.45);
  }
  // --- skill: fork decoy
  if (p.buffs.includes("fork")) {
    const dx = Math.round(m.forkX), dy = Math.round(m.forkY) + FOOT;
    const glitch = Math.floor(t * 12) % 7 === 0 ? 2 : 0;
    ctx.fillStyle = "rgba(8,4,16,0.35)";
    filledEllipse(ctx, dx, dy, 6, 2);
    ctx.save();
    ctx.globalAlpha = 0.55;
    drawBody(ctx, L, { pose: "idle", i: Math.floor(t * 2) % 2, expr: "normal" }, dx + glitch, dy, flip, 1, 1);
    ctx.globalAlpha = 0.45;
    ctx.globalCompositeOperation = "lighter";
    drawBody(ctx, L, { pose: "idle", i: Math.floor(t * 2) % 2, expr: "normal" }, dx - glitch, dy, flip, 1, 1, "#b98bff");
    ctx.restore();
    drawText(ctx, "FORK()", dx, dy - 30, "#b98bff");
    if (Math.floor(t * 4) % 2 === 0) drawText(ctx, "!", dx, dy - 37 + Math.round(Math.sin(t * 8)), "#ff4a5a");
  }
  // --- skill: rollback rewind ghost (where you were ~2s ago) + blink trail
  if (p.buffs.includes("rollback")) {
    const age = t - (m.skillT.rollback ?? t);
    if (age < 0.5) {
      const n = Math.max(2, Math.min(5, Math.round(Math.hypot(p.x - m.rollX, p.y - m.rollY) / 12)));
      for (let i = 0; i < n; i++) {
        const u = i / n;
        const gx = Math.round(m.rollX + (p.x - m.rollX) * u), gy = Math.round(m.rollY + (p.y - m.rollY) * u) + FOOT;
        ctx.save();
        ctx.globalAlpha = (0.1 + 0.3 * u) * (1 - age / 0.5);
        ctx.globalCompositeOperation = "lighter";
        drawBody(ctx, L, fr, gx, gy, flip, 1, 1, "#6aa8ff");
        ctx.restore();
      }
      drawText(ctx, "<<", (m.rollX + p.x) / 2, (m.rollY + p.y) / 2 - 4, "#6aa8ff");
    }
  }

  // rollback preview (you only): faint marker where the skill would send you
  if (isYou && p.alive && p.kit.skill === "rollback" && p.skillCd <= 0 && !p.buffs.includes("rollback") && m.hist.length > 30) {
    const h0 = m.hist[0];
    if (Math.hypot(h0.x - p.x, h0.y - p.y) > 10) {
      ctx.save();
      ctx.globalAlpha = 0.22 + 0.06 * Math.sin(t * 4);
      drawBody(ctx, L, { pose: "idle", i: 0, expr: "normal" }, Math.round(h0.x), Math.round(h0.y) + FOOT, flip, 1, 1, "#6aa8ff");
      ctx.restore();
    }
  }

  // --- downed
  if (!p.alive) {
    drawDowned(ctx, L, p, m, t, x, y, feet, flip, fr);
    updateDrawParticles(ctx, m, 0, true);
    drawTag(ctx, p, L, isYou, x, y - 6, t, true);
    m.t = t; m.x = p.x; m.y = p.y; m.hp = p.hp; m.armor = p.armor; m.energy = p.energy; m.alive = p.alive; m.dashCd = p.dashCd; m.buffs = new Set(p.buffs);
    return;
  }

  // --- squash & stretch
  let sx = 1, sy = 1;
  const hk = Math.max(0, 1 - (t - m.hurtT) / 0.16);
  if (hk > 0) { const c = m.crit && t - m.kbT < 0.3 ? 1.6 : 1; sx += 0.16 * hk * c; sy -= 0.12 * hk * c; }
  const dk = Math.max(0, 1 - (t - m.dashT) / 0.18);
  if (dk > 0) { sx += 0.2 * dk; sy -= 0.12 * dk; }
  const rk = Math.max(0, 1 - (t - m.reviveT) / 0.3);
  if (rk > 0) { sx -= 0.2 * rk; sy += 0.3 * rk; }
  const bob = fr.pose === "run" ? (fr.i % 2 === 1 ? -1 : 0) : 0;
  // directional knockback lean from forwarded hit events (snaps back over ~150ms)
  const kk = Math.max(0, 1 - (t - m.kbT) / 0.15);
  const bx = x + Math.round(m.kbX * m.kbAmp * kk), bfeet = feet + Math.round(m.kbY * m.kbAmp * kk * 0.6);

  // invulnerability blink (not during dashes)
  let alpha = 1;
  if (p.invuln > 0 && !dashing && Math.floor(t * 18) % 2 === 0) alpha = 0.35;

  ctx.save();
  ctx.globalAlpha = alpha;
  const aimUp = p.facing[1] < -0.55;
  if (aimUp) drawWeapon(ctx, L, p, m, t, bx, bfeet, flip, bob);

  // glow outline for overclock / hotfix
  const glowCol = overclock ? "#ffb13a" : p.buffs.includes("hotfix") ? "#5dff8a" : p.buffs.includes("rollback") ? "#6aa8ff" : "";
  const since = t - m.hurtT;
  const flashT = m.crit && t - m.kbT < 0.3 ? 0.11 : 0.07;
  if (since >= flashT) {
    // light rim (or buff glow) hugging the dark outline: makes heroes pop off busy arena floors
    ctx.save();
    if (glowCol) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * (0.8 + 0.2 * Math.sin(t * 12));
    } else {
      ctx.globalAlpha = alpha * (isYou ? 0.6 : 0.45);
    }
    const rim = heroRim(L, fr, glowCol || L.c.rim);
    ctx.translate(bx, bfeet);
    ctx.scale(flip * sx, sy);
    ctx.drawImage(rim, -ANCHOR_X - 1, -SPRITE_FOOT - 1);
    ctx.restore();
  }

  if (since < flashT) {
    drawBody(ctx, L, fr, bx, bfeet, flip, sx, sy, "#ffffff");
  } else if (since < 0.24) {
    // RGB split glitch
    const o = since < 0.15 ? 2 : 1;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha * 0.8;
    drawBody(ctx, L, fr, bx - o, bfeet, flip, sx, sy, "#ff2050");
    drawBody(ctx, L, fr, bx + o, bfeet, flip, sx, sy, "#20e0ff");
    ctx.restore();
    drawBody(ctx, L, fr, bx, bfeet, flip, sx, sy);
    // horizontal slice displacement
    const cv = heroFrame(L, fr);
    const band = 3 + ((Math.floor(t * 60) * 7) % 14);
    ctx.save();
    ctx.translate(bx + (Math.floor(t * 60) % 2 ? 2 : -2), bfeet);
    ctx.scale(flip, 1);
    ctx.drawImage(cv, 0, band, cv.width, 3, -ANCHOR_X, -SPRITE_FOOT + band, cv.width, 3);
    ctx.restore();
  } else {
    drawBody(ctx, L, fr, bx, bfeet, flip, sx, sy);
  }
  if (!aimUp) drawWeapon(ctx, L, p, m, t, bx, bfeet, flip, bob);
  ctx.restore();

  if (L.duck) {
    const tx = p.x - flip * 13, ty = p.y - 12;
    const k = 1 - Math.exp(-dt * 5);
    m.duckX += (tx - m.duckX) * k; m.duckY += (ty - m.duckY) * k;
    if (Math.abs(tx - m.duckX) > 1.5) m.duckFlip = tx > m.duckX ? 1 : -1;
    else m.duckFlip = flip;
    drawDuck(ctx, m.duckX, m.duckY, m.duckFlip, t, m.phase);
  }

  // --- front auras
  if (p.buffs.includes("firewall")) drawFirewall(ctx, x, y, t, t - (m.skillT.firewall ?? -9));
  if (overclock) {
    // speed sparks: tiny lightning ticks
    if (Math.floor(t * 20) % 3 === 0) {
      ctx.fillStyle = "#ffe08a";
      const a = (Math.floor(t * 20) * 2.4) % (Math.PI * 2);
      pixLine(ctx, x + Math.cos(a) * 9, y - 4 + Math.sin(a) * 9, x + Math.cos(a) * 12 + 1, y - 4 + Math.sin(a) * 12);
    }
  }

  updateDrawParticles(ctx, m, dt, true);

  // --- skill cast callout & revive pop
  for (const b of p.buffs) {
    const age = t - (m.skillT[b] ?? -9);
    if (age < 1.1 && b in SKILL_TEXT) {
      const k = age / 1.1;
      ctx.save();
      ctx.globalAlpha = k < 0.8 ? 1 : (1 - k) / 0.2;
      drawText(ctx, SKILL_TEXT[b], x, y - 40 - Math.round(k * 8), SKILL_COLOR[b] ?? "#ffffff");
      ctx.restore();
    }
  }
  const ra = t - m.reviveT;
  if (ra < 1) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = rgba("#5dff8a", 1 - ra);
    pixEllipse(ctx, x, y, 4 + ra * 30, (4 + ra * 30) * 0.7);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = Math.min(1, (1 - ra) * 2);
    drawText(ctx, "200 OK", x, y - 40 - Math.round(ra * 10), "#5dff8a");
    ctx.restore();
  }

  drawTag(ctx, p, L, isYou, x, y, t);

  m.t = t; m.x = p.x; m.y = p.y; m.hp = p.hp; m.armor = p.armor; m.energy = p.energy; m.alive = p.alive; m.dashCd = p.dashCd;
  if (m.buffs.size !== p.buffs.length || p.buffs.some((b) => !m.buffs.has(b))) m.buffs = new Set(p.buffs);
}

function drawDowned(ctx: CanvasRenderingContext2D, L: HeroLook, p: PlayerState, m: Mem, t: number, x: number, y: number, feet: number, flip: number, fr: FrameSpec) {
  // lying body: rotated 90deg (exact, cached once fallen), slightly dimmed
  const fall = Math.min(1, (t - m.downT) / 0.25);
  const ko: FrameSpec = { pose: "idle", i: 0, expr: "ko" };
  if (fall < 1) {
    const cv = heroFrame(L, ko);
    ctx.save();
    ctx.translate(x, feet - 1);
    ctx.rotate(-flip * (Math.PI / 2) * fall);
    ctx.scale(flip, 1);
    ctx.drawImage(cv, -ANCHOR_X, -SPRITE_FOOT + 4);
    ctx.restore();
  } else {
    const ly = lyingFrame(L);
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(flip, 1);
    ctx.drawImage(ly, -14, y + 3 - 12);
    ctx.restore();
  }
  void fr;

  // revive ring
  drawRevive(ctx, x, y + 2, p.reviveProgress, t);

  // floating ghost with "404" halo
  if (fall >= 1) {
    const rise = Math.min(1, (t - m.downT - 0.25) / 0.6);
    const gx = x + Math.round(Math.sin(t * 1.7 + m.phase * 5) * 2);
    const gy = y - Math.round(rise * 4 + Math.sin(t * 2.4) * 1.5);
    const gc = ghostSprite(L, Math.floor(t * 4) % 2);
    ctx.save();
    ctx.globalAlpha = 0.3 * rise;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#5f7cff";
    filledEllipse(ctx, gx, gy - 14, 8, 7);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.85 * rise;
    ctx.translate(gx, 0);
    ctx.scale(flip, 1);
    ctx.drawImage(gc, -Math.floor(gc.width / 2), gy - 21);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = rise;
    ctx.fillStyle = "#ffe45c";
    pixEllipse(ctx, gx, gy - 23, 4, 1.2);
    ctx.restore();
  }
}

const lyingCache = new Map<string, HTMLCanvasElement>();
/** KO frame rotated 90deg counter-clockwise (head toward -x), pixel-exact. */
function lyingFrame(L: HeroLook): HTMLCanvasElement {
  let cv = lyingCache.get(L.key);
  if (cv) return cv;
  const src = heroFrame(L, { pose: "idle", i: 0, expr: "ko" });
  cv = document.createElement("canvas");
  cv.width = src.height; cv.height = src.width;
  const g = cv.getContext("2d")!;
  g.translate(0, src.width);
  g.rotate(-Math.PI / 2);
  g.drawImage(src, 0, 0);
  lyingCache.set(L.key, cv);
  return cv;
}

const GHOST = [
  "...hhhhh...",
  "..hhhhhhh..",
  ".wwwwwwwwws",
  ".wwwwwwwwws",
  ".wwEwwwEwws",
  ".wwEwwwEwws",
  ".wwwwwwwwws",
  ".wbwwowwbws",
  ".wwwwwwwwss",
  ".wwwwwwwwss",
];
const GHOST_TAIL = [".w.ww.ww.s.", ".ww.ww.ww.s"];
const ghostCache = new Map<string, HTMLCanvasElement>();

/** Cute pixel ghost wearing the hero's color as a cap. */
function ghostSprite(L: HeroLook, f: number): HTMLCanvasElement {
  const key = L.key + "|g" + f;
  let cv = ghostCache.get(key);
  if (cv) return cv;
  const rows = [...GHOST, GHOST_TAIL[f]];
  const pal: Record<string, string> = { w: "#e8f2ff", s: "#a8bdf5", E: "#2b1d4a", o: "#2b1d4a", b: "#ff9ec0", h: L.c.primary };
  const w = rows[0].length + 2, h = rows.length + 2;
  const grid: (string | null)[][] = Array.from({ length: h }, () => new Array(w).fill(null));
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] !== ".") grid[y + 1][x + 1] = pal[r[x]]; });
  cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d")!;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const col = grid[y][x] ?? ((grid[y][x - 1] || grid[y][x + 1] || grid[y - 1]?.[x] || grid[y + 1]?.[x]) ? "#1b1438" : null);
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }
  g.fillStyle = L.c.primaryL;
  g.fillRect(5, 1, 3, 1);
  ghostCache.set(key, cv);
  return cv;
}

const DUCK = [
  "....yy.",
  "...yyEb",
  "y..yyy.",
  "yyyyyyy",
  ".YYYYY.",
];
const duckCache: HTMLCanvasElement[] = [];

/** Rubber-duck debugging companion. */
function duckSprite(): HTMLCanvasElement {
  if (duckCache[0]) return duckCache[0];
  const pal: Record<string, string> = { y: "#ffd84a", Y: "#e0a02a", E: "#1b1226", b: "#ff8a2a" };
  const w = DUCK[0].length + 2, h = DUCK.length + 2;
  const at = (x: number, y: number) => DUCK[y - 1]?.[x - 1] && DUCK[y - 1][x - 1] !== "." ? DUCK[y - 1][x - 1] : null;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d")!;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = at(x, y);
    const col = ch ? pal[ch] : (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) ? "#120b18" : null;
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }
  g.fillStyle = "#fff6c0";
  g.fillRect(5, 1, 1, 1);
  duckCache[0] = cv;
  return cv;
}

function drawDuck(ctx: CanvasRenderingContext2D, x: number, y: number, flip: number, t: number, phase: number) {
  const d = duckSprite();
  const bob = Math.round(Math.sin(t * 3 + phase * 7) * 1.5);
  ctx.fillStyle = "rgba(8,4,16,0.3)";
  ctx.fillRect(Math.round(x) - 3, Math.round(y) + 14, 7, 1);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y) + bob);
  ctx.scale(flip, 1);
  ctx.drawImage(d, -Math.floor(d.width / 2), 0);
  ctx.restore();
}

function updateDrawParticles(ctx: CanvasRenderingContext2D, m: Mem, dt: number, front: boolean) {
  const ps = m.parts;
  for (let i = ps.length - 1; i >= 0; i--) {
    const q = ps[i];
    if (!!q.front !== front) continue;
    q.life -= dt;
    if (q.life <= 0) { ps.splice(i, 1); continue; }
    q.vy += q.g * dt;
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vx *= 1 - 2 * dt;
    const k = q.life / q.max;
    ctx.save();
    if (q.add) ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, k * 1.5);
    if (q.glyph) drawText(ctx, q.glyph, q.x, q.y - 2, q.col);
    else {
      ctx.fillStyle = q.col;
      const s = k < 0.4 && q.sz > 1 ? 1 : q.sz;
      px(ctx, q.x, q.y, s, s);
    }
    ctx.restore();
  }
}

function shortRepo(slug: string): string {
  const name = (slug || "").split("/").pop() || slug || "";
  return name.length > 10 ? name.slice(0, 9) + "~" : name;
}

function shortName(n: string): string {
  const s = (n || "anon").trim();
  return s.length > 7 ? s.slice(0, 6) + "~" : s;
}

function repoColor(L: HeroLook): string {
  const [h, sat, l] = hexToHsl(L.c.primaryL);
  return hslToHex(h, Math.min(sat, 0.85), Math.max(l, 0.68));
}

/**
 * Tags: you = arrow + name + repo (2 lines). Teammates = 1-line short name; their repo slides in
 * when you're close (or when they're downed) to keep 8-player fights readable.
 */
function drawTag(ctx: CanvasRenderingContext2D, p: PlayerState, L: HeroLook, isYou: boolean, x: number, y: number, t: number, downed = false) {
  const top = y - 25;
  const repo = shortRepo(p.kit.repo);
  if (isYou) {
    const name = (p.name || "anon").slice(0, 10);
    const b = Math.round(Math.sin(t * 6) * 1.5);
    const ay = top - 14 + b;
    ctx.fillStyle = "#120b18";
    ctx.fillRect(x - 4, ay - 1, 9, 1);
    for (let i = 0; i < 4; i++) ctx.fillRect(x - 4 + i, ay + i, 9 - i * 2, 1);
    ctx.fillRect(x - 1, ay + 4, 3, 1);
    ctx.fillStyle = "#ffe45c";
    for (let i = 0; i < 3; i++) ctx.fillRect(x - 3 + i, ay + i, 7 - i * 2, 1);
    ctx.fillRect(x, ay + 3, 1, 1);
    drawText(ctx, downed ? name + " 404" : name, x, top - 6, downed && Math.floor(t * 3) % 2 ? "#ff4a5a" : "#ffe45c");
    drawText(ctx, repo, x, top, "#d8c25a");
    return;
  }
  let near = 0;
  if (youPos && t - youPos.t < 0.5) {
    const d = Math.hypot(p.x - youPos.x, p.y - youPos.y);
    near = Math.max(0, Math.min(1, (64 - d) / 16));
  }
  if (downed) near = 1;
  const nameY = top - Math.round(6 * near);
  const label = downed ? shortName(p.name) + " 404" : shortName(p.name);
  ctx.save();
  ctx.globalAlpha *= downed ? 1 : 0.92;
  drawText(ctx, label, x, nameY, downed && Math.floor(t * 3) % 2 ? "#ff4a5a" : "#f4f1ff");
  if (near > 0) {
    ctx.globalAlpha *= near;
    drawText(ctx, repo, x, top, repoColor(L));
  }
  ctx.restore();
}

// ---------------------------------------------------------------- portraits
const portraitCache = new Map<string, HTMLCanvasElement>();

/**
 * Big crisp portrait for lobby cards. `frame` (optional) picks an idle animation frame:
 * 0/1 breathe, 2 blink. Call with frame = playerPortraitFrame(time) to animate cheaply (all cached).
 */
export function playerPortrait(kit: PlayerKit, size: number, frame = 0): HTMLCanvasElement {
  const L = lookFor(kit);
  const key = L.key + "|" + size + "|" + frame;
  const hit = portraitCache.get(key);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = size; cv.height = size;
  const g = cv.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  const s = Math.max(1, Math.floor(size / 26));
  const fr: FrameSpec = { pose: "idle", i: frame === 1 ? 1 : 0, expr: frame === 2 ? "blink" : "normal" };
  g.save();
  g.translate(Math.floor(size / 2), Math.floor(size / 2 + 12.5 * s));
  g.scale(s, s);
  g.fillStyle = "rgba(8,4,16,0.42)";
  filledEllipse(g, -1, 0, 7, 2);
  const body = heroFrame(L, fr);
  g.drawImage(body, -ANCHOR_X - 1, -SPRITE_FOOT);
  // weapon held forward-down, like a hero pose
  const ws = weaponSprite(L, kit.weapon);
  g.save();
  g.translate(2, -6 + (fr.i === 1 ? 0 : 0));
  g.rotate(kit.weapon === "blade" ? -0.9 : kit.weapon === "staff" ? -1.2 : -0.25);
  g.drawImage(ws.canvas, -ws.px, -ws.py);
  if (kit.weapon === "staff" || kit.weapon === "laser") {
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.35;
    g.fillStyle = L.c.accent;
    g.beginPath(); g.arc(ws.tipX - 1, ws.tipY, 3, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  if (L.duck) {
    const d = duckSprite();
    g.drawImage(d, -18, -22 + (fr.i === 1 ? 1 : 0));
  }
  g.restore();
  if (portraitCache.size > 300) portraitCache.clear();
  portraitCache.set(key, cv);
  return cv;
}

/** Idle frame index for animated portraits: breathe 0/1 with occasional blink (2). */
export function playerPortraitFrame(time: number, seed = 0): number {
  const t = normTime(time) + (seed % 100) / 37;
  if (t % 3.1 < 0.13) return 2;
  return Math.floor(t * 1.6) % 2;
}

// ---------------------------------------------------------------- lobby card spin-up
const SPIN = 0.9;
const tintCache = new Map<string, HTMLCanvasElement>();
function tintOf(src: HTMLCanvasElement, key: string, color: string): HTMLCanvasElement {
  const k = key + "|" + color;
  let c = tintCache.get(k);
  if (!c) {
    c = tinted(src, color);
    if (tintCache.size > 200) tintCache.clear();
    tintCache.set(k, c);
  }
  return c;
}

/**
 * Animated lobby card painter. Call every animation tick with the same canvas (square, any size).
 * `readyAge` = seconds since the hero's kit arrived (status -> ready): for the first 0.9s the hero
 * materializes bottom-up behind a scanline (wireframe + glitch slices + flash); afterwards it idles
 * (breathe/blink) with a rare RGB-split flicker. Omit readyAge for an already-revealed hero.
 */
export function paintHeroCard(c: HTMLCanvasElement, kit: PlayerKit, time: number, readyAge = 99): void {
  const size = c.width;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, c.width, c.height);
  const t = normTime(time);
  const L = lookFor(kit);
  const s = Math.max(1, Math.floor(size / 26));
  const key = L.key + "|" + size;

  if (readyAge >= SPIN) {
    const src = playerPortrait(kit, size, playerPortraitFrame(t, kit.seed));
    const glitch = (t + (kit.seed % 97) / 13) % 5.3 < 0.12;
    if (glitch) {
      g.save();
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.7;
      g.drawImage(tintOf(src, key + "|" + playerPortraitFrame(t, kit.seed), "#ff2050"), -s, 0);
      g.drawImage(tintOf(src, key + "|" + playerPortraitFrame(t, kit.seed), "#20e0ff"), s, 0);
      g.restore();
      g.drawImage(src, 0, 0);
      const band = Math.floor((size * 0.3 + ((t * 977) % (size * 0.5))) / s) * s;
      g.clearRect(0, band, size, s * 2);
      g.drawImage(src, 0, band, size, s * 2, s * 2, band, size, s * 2);
    } else {
      g.drawImage(src, 0, 0);
    }
    const fa = readyAge - SPIN;
    if (fa < 0.3) {
      g.save();
      g.globalAlpha = 1 - fa / 0.3;
      g.drawImage(tintOf(playerPortrait(kit, size, 0), key + "|0", "#ffffff"), 0, 0);
      g.restore();
    }
    return;
  }

  const k = Math.max(0, readyAge) / SPIN;
  const src = playerPortrait(kit, size, 0);
  const wire = tintOf(src, key + "|0", L.c.accentL);
  const ease = 1 - (1 - k) * (1 - k);
  const scanY = Math.round((size * (1 - ease)) / s) * s;
  // above the scanline: flickering wireframe silhouette
  g.save();
  g.globalAlpha = 0.18 + 0.22 * Math.random();
  if (scanY > 0) g.drawImage(wire, 0, 0, size, scanY, 0, 0, size, scanY);
  g.restore();
  // below: the real hero, with a couple of glitch-offset slices near the scan
  if (scanY < size) g.drawImage(src, 0, scanY, size, size - scanY, 0, scanY, size, size - scanY);
  for (let i = 0; i < 2; i++) {
    const by = scanY + Math.floor(Math.random() * 6) * s;
    const off = (Math.random() < 0.5 ? -1 : 1) * s * (1 + Math.floor(Math.random() * 3));
    g.clearRect(0, by, size, s);
    g.drawImage(src, 0, by, size, s, off, by, size, s);
  }
  // data bits rising off the scanline
  g.fillStyle = L.c.accentL;
  for (let i = 0; i < 8; i++) {
    const px0 = Math.floor((Math.random() * size) / s) * s;
    g.fillRect(px0, scanY - Math.floor(Math.random() * 5) * s, s, s);
  }
  // the scanline itself + glow
  g.fillStyle = L.c.accent;
  g.globalAlpha = 0.45;
  g.fillRect(0, scanY - s, size, s * 3);
  g.globalAlpha = 1;
  g.fillStyle = "#ffffff";
  g.fillRect(0, scanY, size, s);
}
