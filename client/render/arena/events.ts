// Game events -> juice: damage numbers, glitch flashes, shrapnel, banners, death sequences.
import type { GameEvent, PlayerState, SkillKind } from "../../../shared/types.ts";
import { drawGlow, hash2, TAU } from "./pix.ts";
import { drawText, textWidth } from "./font.ts";
import { addShake, burst, drawParticles, emit, every, fx, stepParticles, type Particle } from "./fx.ts";
import { telegraphInfo } from "./hazards.ts";
import { drawPerkCards } from "./props.ts";
import { playerGlyphs, registerPlayerGlyphs } from "./bullets.ts";

type HitExtra = { source?: string; direction?: [number, number]; crit?: boolean; impact?: number; hitStop?: number };

const seen = new WeakSet<object>();
const players = new Map<string, { x: number; y: number; name: string }>();
const glyphKeys = new Map<string, string>();
const numbers = new Map<string, { p: Particle; sum: number; at: number; crit: boolean }>();
const MAX_NUMBERS = 7;
function liveNumbers() {
  let n = 0;
  for (const v of numbers.values()) if (v.p.life < v.p.max && v.p.text.startsWith("-")) n++;
  return n;
}
let avgHit = 8;

interface Banner { text: string; sub: string; color: string; at: number; dur: number; scale: number; y: number }
const banners: Banner[] = [];

/** Optional: give the FX layer player positions (for downed/revived/skill effects). Call once per frame. */
export function trackPlayers(ps: PlayerState[]) {
  for (const p of ps) {
    players.set(p.id, { x: p.x, y: p.y, name: p.name });
    // re-register whenever the hero's token list changes (e.g. repo swapped between rematches)
    const toks = p.kit.code?.tokens ?? [];
    const key = toks.join("\u0000");
    if (glyphKeys.get(p.id) !== key) {
      glyphKeys.set(p.id, key);
      if (toks.length) registerPlayerGlyphs(p.id, toks);
      else playerGlyphs.delete(p.id);
    }
  }
}

/** Suggested camera feedback for the render loop (all optional to use). */
export function getFxCues(): { shake: number; hitStop: boolean; slowmo: boolean; flash: number } {
  return { shake: fx.shake, hitStop: fx.now < fx.hitStop, slowmo: fx.now < fx.slowmoUntil, flash: fx.flash };
}

const SKILL_CMD: Record<SkillKind, string> = {
  firewall: "$ IPTABLES -A BOSS -J DROP",
  fork: "$ GIT FORK --DECOY",
  hotfix: "$ HOTFIX --DEPLOY --NOW",
  overclock: "$ CFLAGS=-O3 MAKE",
  rollback: "$ GIT RESET --HARD HEAD@{2S}",
};
const SKILL_COLOR: Record<SkillKind, string> = { firewall: "#5ad8ff", fork: "#c78bff", hotfix: "#7dff9a", overclock: "#ffb02e", rollback: "#9ff0ff" };

function limbPos(id: string): [number, number] | null {
  const b = fx.boss;
  if (!b) return null;
  const r = b.regions?.find((q) => q.id === id);
  return r ? [r.x, r.y] : [b.x, b.y];
}

function limbLabel(id: string): string {
  const b = fx.boss;
  const l = b?.kit.limbs.find((q) => q.id === id);
  return (b?.kit.design?.limbNames?.[id] ?? l?.component ?? id).toUpperCase();
}

function dangerColor() {
  const k = fx.boss?.kit;
  return k ? (k.design ? k.palette[2] : k.palette[3]) ?? "#ff3a5c" : "#ff3a5c";
}

function ingest(e: GameEvent, time: number) {
  switch (e.type) {
    case "hit": {
      const x = e as typeof e & HitExtra;
      const toBoss = e.target === "boss";
      const toPlayer = !toBoss && (x.source === "boss" || players.has(e.target));
      if (toBoss) {
        // full-body flash only on heavy hits (and rate-limited); light hits flash the limb
        if ((x.crit || (x.impact ?? 0) >= 0.5 || e.amount > avgHit * 2) && time - fx.bossFlash > 0.25) fx.bossFlash = time;
        const lf = fx.limbFlash.get(e.limb ?? "heart") ?? -10;
        if (time - lf > 0.14) fx.limbFlash.set(e.limb ?? "heart", time);
      }
      if (toPlayer) {
        players.set(e.target, { ...(players.get(e.target) ?? { name: "" }), x: e.x, y: e.y });
        emit({ kind: "glyph", x: e.x, y: e.y - 14, vx: (Math.random() - 0.5) * 20, vy: -30, grav: 40, max: 0.9, text: "-" + Math.round(e.amount) + " ERR", color: "#ff3a5c" });
        emit({ kind: "glitch", x: e.x, y: e.y - 4, max: 0.2, size: 10 });
        burst(e.x, e.y, 8, { kind: "px", speed: 50, max: 0.4, colors: ["#ff3a5c", "#ffffff"], drag: 3 });
        addShake(3 + (x.impact ?? 0.3) * 4);
        fx.danger = Math.max(fx.danger, 0.8);
        if (x.hitStop) fx.hitStop = Math.max(fx.hitStop, time + x.hitStop / 1000);
        break;
      }
      // damage dealt by players (boss or minion)
      avgHit = avgHit * 0.97 + e.amount * 0.03;
      const crit = x.crit ?? e.amount > avgHit * 2.4;
      const dir = x.direction ?? [0, -1];
      const ang = Math.atan2(dir[1], dir[0]);
      burst(e.x, e.y, crit ? 10 : 4, { kind: "spark", speed: crit ? 120 : 80, spread: 1.6, dir: ang + Math.PI, max: 0.25, colors: ["#ffffff", "#ffd23f", "#ff9a2a"] });
      // big CRIT label only for genuinely heavy hits, globally rate-limited; other crits roll into orange numbers
      const critOk = crit && e.amount >= Math.max(10, avgHit * 1.4) && every("crit", 0.45, time);
      if (critOk) {
        emit({ kind: "glitch", x: e.x, y: e.y, max: 0.18, size: 14 });
        burst(e.x, e.y, 3, { kind: "shard", speed: 70, max: 0.6, text: "{};<>/#*01", spin: 20, color: "#ffd23f", color2: "#ff5a2a", grav: 150 });
        addShake(2 + (x.impact ?? 0.5) * 3);
      }
      if (x.hitStop) fx.hitStop = Math.max(fx.hitStop, time + x.hitStop / 1000);
      // one rolling number per limb: keep summing while it's still on screen
      const key = e.target + "|" + (e.limb ?? "");
      const prev = numbers.get(key);
      if (!critOk && prev && !prev.crit && prev.p.life < prev.p.max * 0.75 && prev.p.text === "-" + Math.round(prev.sum)) {
        prev.sum += e.amount;
        prev.p.text = "-" + Math.round(prev.sum);
        prev.p.life = Math.min(prev.p.life, 0.15);
        prev.at = time;
      } else if (critOk || liveNumbers() < MAX_NUMBERS) {
        // drift outward, away from the boss face
        const b = fx.boss;
        let ox = 0, oy = -1;
        if (toBoss && b) { const dx = e.x - b.x, dy = e.y - b.y, l = Math.hypot(dx, dy) || 1; ox = dx / l; oy = Math.min(-0.3, dy / l); }
        const p = emit({
          kind: "glyph", x: e.x + ox * 10, y: e.y + oy * 8, vx: ox * 26 + (Math.random() - 0.5) * 8, vy: oy * 30 - 18, grav: 50, drag: 1.5, max: critOk ? 1.0 : 0.8,
          text: critOk ? "-" + Math.round(e.amount) + " CRIT" : "-" + Math.round(e.amount), color: critOk ? "#ff7a2a" : crit ? "#ffb05a" : toBoss ? "#fff4c4" : "#d0ffb0", size: critOk ? 2 : 1,
        });
        if (p) numbers.set(key, { p, sum: e.amount, at: time, crit: critOk });
      }
      for (const [k, v] of numbers) if (time - v.at > 1.2) numbers.delete(k);
      // small combo tag next to the number (claude-ui shows the big HUD combo)
      if (e.combo && e.combo >= 2 && every("combo", 0.5, time) && liveNumbers() < MAX_NUMBERS + 2) {
        emit({ kind: "glyph", x: e.x + 12, y: e.y - 4, vx: 10, vy: -16, max: 0.6, text: "X" + e.combo, color: "#ffe14a", size: 1 });
        if (e.combo >= 3) emit({ kind: "ring", x: e.x, y: e.y, size: 16, max: 0.3, color: "#ffe14a" });
      }
      break;
    }
    case "telegraph": {
      telegraphInfo.name = e.name;
      telegraphInfo.at = time;
      fx.danger = Math.max(fx.danger, 0.6);
      break;
    }
    case "limbBroken": {
      const pos = limbPos(e.limb);
      fx.limbBreak = time;
      fx.slowmoUntil = time + 0.45;
      fx.hitStop = time + 0.06;
      fx.flash = Math.max(fx.flash, 0.5);
      addShake(9);
      if (pos) {
        const [x, y] = pos;
        emit({ kind: "boom", x, y, size: 14, max: 0.6, color: "#ff7a2a", color2: "#3a2a30" });
        burst(x, y, 26, { kind: "shard", speed: 150, max: 1.1, text: "{}();<>/#*=01$&", spin: 16, colors: ["#ffffff", "#ffd23f", dangerColor()], color2: "#5a4a50", grav: 180, drag: 1 });
        burst(x, y, 30, { kind: "spark", speed: 170, max: 0.5, colors: ["#ffffff", "#ffd23f", "#ff5a2a"], drag: 2 });
        burst(x, y, 10, { kind: "smoke", speed: 40, max: 1.2, size: 4, color: "#4a3a40", color2: "#1e1820", drag: 2 });
        emit({ kind: "ring", x, y, size: 40, max: 0.45, color: "#ffffff" });
      }
      banners.push({ text: "LIMB BROKEN", sub: "- " + limbLabel(e.limb) + "  [DELETED]", color: "#ffd23f", at: time, dur: 1.8, scale: 2, y: 54 });
      break;
    }
    case "downed": {
      const p = players.get(e.player);
      if (p) {
        burst(p.x, p.y, 16, { kind: "px", speed: 60, max: 0.7, colors: ["#8a8a9a", "#ffffff", "#ff3a5c"], drag: 3 });
        emit({ kind: "glyph", x: p.x + 14, y: p.y - 26, vx: 10, vy: -40, max: 0.6, text: "SEGFAULT", color: "#ff3a5c" });
        emit({ kind: "glitch", x: p.x, y: p.y - 4, max: 0.4, size: 14 });
      }
      addShake(5);
      fx.danger = 1;
      break;
    }
    case "revived": {
      const p = players.get(e.player);
      if (p) {
        emit({ kind: "ring", x: p.x, y: p.y, size: 24, max: 0.5, color: "#7dff9a" });
        burst(p.x, p.y, 18, { kind: "px", speed: 50, max: 0.8, colors: ["#7dff9a", "#ffffff"], grav: -30, glow: true });
        emit({ kind: "glyph", x: p.x, y: p.y - 18, vy: -12, max: 1.4, text: "200 OK", color: "#7dff9a" });
      }
      break;
    }
    case "skill": {
      const p = players.get(e.player);
      if (p) {
        const c = SKILL_COLOR[e.skill] ?? "#ffffff";
        emit({ kind: "glyph", x: p.x, y: p.y - 22, vy: -10, max: 1.5, text: SKILL_CMD[e.skill] ?? "$ " + e.skill, color: c });
        emit({ kind: "ring", x: p.x, y: p.y, size: 22, max: 0.4, color: c });
        burst(p.x, p.y, 10, { kind: "px", speed: 45, max: 0.6, colors: [c, "#ffffff"], glow: true });
      }
      break;
    }
    case "phase": {
      fx.phaseGlitch = time;
      fx.flash = Math.max(fx.flash, 0.7);
      addShake(10);
      fx.hitStop = time + 0.08;
      const b = fx.boss;
      if (b) {
        burst(b.x, b.y, 40, { kind: "shard", speed: 160, max: 1.2, text: "01{}#*;<>/", spin: 12, colors: ["#ffffff", dangerColor()], color2: "#5a4a50", grav: 120, drag: 1 });
        emit({ kind: "ring", x: b.x, y: b.y, size: 90, max: 0.6, color: dangerColor() });
      }
      banners.push(e.phase === 2
        ? { text: "PHASE 2 :: ENRAGED", sub: "WARN: BOSS RECOMPILED WITH -O3", color: "#ff3a5c", at: time, dur: 2.2, scale: 3, y: 112 }
        : { text: "PHASE 3 :: LAST STAND", sub: "HEART EXPOSED. KILL -9 IT.", color: "#ff2a6a", at: time, dur: 2.4, scale: 3, y: 112 });
      break;
    }
    case "pickup": {
      const label = e.kind === "heart" ? "+1 HP" : e.kind === "armor" ? "+ARMOR" : "+NRG";
      const c = e.kind === "heart" ? "#ff5a7a" : e.kind === "armor" ? "#c8d4ff" : "#5ae6ff";
      emit({ kind: "glyph", x: e.x, y: e.y - 10, vy: -26, max: 0.7, text: label, color: c });
      emit({ kind: "ring", x: e.x, y: e.y, size: 10, max: 0.25, color: c });
      break;
    }
    case "obstacleBroken": {
      fx.flash = Math.max(fx.flash, 0.15);
      break;
    }
    case "perk": {
      const p = players.get(e.player);
      if (p) {
        emit({ kind: "glyph", x: p.x, y: p.y - 24, vy: -14, max: 1.6, text: "MERGED " + e.perk.toUpperCase(), color: "#3dff9a" });
        emit({ kind: "ring", x: p.x, y: p.y, size: 22, max: 0.45, color: "#3dff9a" });
        burst(p.x, p.y, 14, { kind: "px", speed: 50, max: 0.7, colors: ["#3dff9a", "#ffffff"], grav: -40, glow: true });
      }
      break;
    }
    case "victory": {
      fx.victoryAt = time;
      fx.slowmoUntil = time + 1.2;
      addShake(10);
      break;
    }
    case "defeat": {
      fx.defeatAt = time;
      addShake(8);
      break;
    }
  }
}

export function drawEvents(ctx: CanvasRenderingContext2D, events: GameEvent[], time: number) {
  fx.now = time;
  for (const e of events) {
    if (seen.has(e)) continue;
    seen.add(e);
    ingest(e, time);
  }
  // reset end-of-match state on rematch (boss alive again long after)
  if (fx.victoryAt > 0 && time - fx.victoryAt > 10 && fx.boss && fx.boss.hp > 0) fx.victoryAt = -1;
  if (fx.defeatAt > 0 && time - fx.defeatAt > 10) fx.defeatAt = -1;

  // victory: the boss segfaults - chain of explosions over ~1.6 s
  const b = fx.boss;
  if (b && fx.victoryAt > 0) {
    const t = time - fx.victoryAt;
    if (t < 1.7 && every("vboom", 0.07, time)) {
      const a = Math.random() * TAU, d = Math.random() * 50;
      emit({ kind: "boom", x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d * 0.8, size: 6 + Math.random() * 10, max: 0.5, color: Math.random() < 0.5 ? "#ff7a2a" : dangerColor(), color2: "#3a2a30" });
      burst(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, 4, { kind: "shard", speed: 120, max: 1, text: "SEGFAULT01{}#", spin: 14, colors: ["#ffffff", "#ffd23f"], color2: "#5a4a50", grav: 150 });
      addShake(5);
    }
    if (t >= 1.6 && t < 1.7 && every("vfinal", 5, time)) {
      emit({ kind: "boom", x: b.x, y: b.y, size: 50, max: 0.9, color: "#ffffff", color2: "#4a4a6a" });
      burst(b.x, b.y, 60, { kind: "shard", speed: 220, max: 1.6, text: "0x0000DEAD{}();#*01", spin: 10, colors: ["#ffffff", "#ffd23f", dangerColor(), "#5ad8ff"], color2: "#5a4a50", grav: 90, drag: 0.6 });
      fx.flash = 1;
      addShake(10);
    }
  }

  stepParticles(time);
  drawParticles(ctx);
  drawPerkCards(ctx, time);

  // banners
  for (let i = banners.length - 1; i >= 0; i--) {
    const bn = banners[i];
    const t = time - bn.at;
    if (t > bn.dur) { banners.splice(i, 1); continue; }
    const typed = Math.min(bn.text.length, Math.floor(t * 40));
    const txt = bn.text.slice(0, typed) + (typed < bn.text.length || Math.floor(time * 4) % 2 ? "_" : "");
    const jx = t < 0.3 ? Math.round((hash2(Math.floor(time * 30), 1) - 0.5) * 6) : 0;
    const fade = t > bn.dur - 0.3 ? Math.floor(time * 20) % 2 : 1;
    if (!fade) continue;
    const bw = textWidth(bn.text + "_", bn.scale);
    ctx.globalAlpha = 0.7; ctx.fillStyle = "#07040c"; ctx.fillRect(240 - bw / 2 - 6, bn.y - 4, bw + 12, 5 * bn.scale + 16); ctx.globalAlpha = 1;
    drawGlow(ctx, 240, bn.y + 6, bn.color, 40, 0.25);
    if (t < 0.4) { drawText(ctx, txt, 240 - bw / 2 + jx - 1, bn.y, "#ff0040", { scale: bn.scale, outline: null }); drawText(ctx, txt, 240 - bw / 2 + jx + 1, bn.y, "#00e5ff", { scale: bn.scale, outline: null }); }
    drawText(ctx, txt, 240 - bw / 2 + jx, bn.y, bn.color, { scale: bn.scale });
    if (t > 0.3) drawText(ctx, bn.sub, 240, bn.y + 5 * bn.scale + 4, "#e8e0f0", { align: "center" });
  }
}
