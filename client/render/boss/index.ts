// Boss renderer: procedural eldritch code-monster assembled from the BossKit (+ Gemini BossDesign).
import type { BossKit, BossState } from "../../../shared/types.ts";
import { disc, drawGlow, hash2, line, makeCanvas, outlineSprite, TAU } from "../arena/pix.ts";
import { drawText, drawTextRaw, textSprite } from "../arena/font.ts";
import { addShake, burst, emit, every, fx } from "../arena/fx.ts";
import { bossArt, type BossArt } from "./art.ts";
import { bossLayout, type Anchor, type BossLayout, type LegLayout, type PlateLayout, type TentacleLayout } from "./layout.ts";
import { BREATH_FRAMES, getBodySprite, stumpOf, whiteOf } from "./sprite.ts";

export { bossLayout, bossHitRegions } from "./layout.ts";

/** Optional: point the boss's eyes at something (e.g. the target player's position). */
export function bossLookAt(x: number, y: number) {
  fx.look = [x, y];
  fx.lookAt = fx.now;
}

const ERR_GLYPHS = ["ERR", "404", "NAN", "NULL", "SIGSEGV", "E_FAIL", "0XDEAD", "PANIC", "UNDEF"];

interface DrawOpts { portrait?: boolean }

const lastLayout = new Map<string, { anchors: Anchor[]; L: BossLayout }>();
const lastPos = new Map<string, { x: number; y: number; t: number }>();
const kaijuBreathUntil = new Map<string, number>();

function layoutFor(b: BossState): BossLayout {
  const regs = b.regions;
  if (!regs || !regs.length) return bossLayout(b.kit);
  const anchors = regs.map((r) => ({ id: r.id, x: r.x - b.x, y: r.y - b.y, r: r.r }));
  const key = b.kit.repo + "|" + b.kit.seed + "|" + (b.kit.design?.body ?? "");
  const prev = lastLayout.get(key);
  // hysteresis: tiny anchor jitter (interpolation) must not rebuild the sprite
  if (prev && prev.anchors.length === anchors.length && prev.anchors.every((a, i) => a.id === anchors[i].id && Math.abs(a.x - anchors[i].x) < 2.5 && Math.abs(a.y - anchors[i].y) < 2.5))
    return prev.L;
  const L = bossLayout(b.kit, anchors);
  lastLayout.set(key, { anchors, L });
  return L;
}

export function drawBoss(ctx: CanvasRenderingContext2D, b: BossState | null, time: number): void {
  fx.now = time;
  if (!b) { fx.boss = null; return; }
  fx.boss = b;
  fx.bossSeenAt = time;
  drawBossAt(ctx, b, time, {});
}

function drawBossAt(ctx: CanvasRenderingContext2D, b: BossState, time: number, opts: DrawOpts) {
  const kit = b.kit;
  const L = opts.portrait ? bossLayout(kit) : layoutFor(b);
  if (!opts.portrait) fx.bossKind = L.body;
  const brokenById = new Map(b.limbs.map((l) => [l.id, l.broken]));
  const broken = L.limbs.map((l) => brokenById.get(l.id) ?? false);
  const tint = b.phase === 3 ? 2 : b.enraged || b.phase === 2 ? 1 : 0;
  const art = bossArt(kit, tint);
  const frame = Math.floor(time * (tint ? 4 : 2.6)) % BREATH_FRAMES;
  const body = getBodySprite(kit, L, broken, tint, frame);

  // death sequence (victory): violent glitching, then gone
  const dying = !opts.portrait && fx.victoryAt > 0 ? time - fx.victoryAt : -1;
  if (dying > 1.65) return;

  // casting state
  const atk = b.casting ? kit.attacks.find((a) => a.id === b.casting!.attackId) : undefined;
  const castP = b.casting ? Math.min(1, b.casting.t / Math.max(0.01, b.casting.total)) : 0;
  const srcIdx = atk ? L.limbs.findIndex((l) => l.component === atk.source) : -1;

  const pm = poseMotion(b, L, time, !!opts.portrait);
  const bob = L.kaiju ? (pm.still ? 0 : Math.round(Math.sin(time * 1.7) * 0.6)) : L.body === "machine" || L.body === "golem" ? Math.round(Math.sin(time * 1.7) * 0.6) : Math.round(Math.sin(time * 1.7) * 1.5);
  let jx = 0, jy = 0;
  if (castP > 0.6) { jx = Math.round((hash2(Math.floor(time * 30), 1) - 0.5) * 2 * castP); jy = Math.round((hash2(Math.floor(time * 30), 2) - 0.5) * 2 * castP); }
  if (tint === 2 && hash2(Math.floor(time * 12), 7) < 0.15) jx += hash2(Math.floor(time * 12), 8) < 0.5 ? -2 : 2;
  if (dying >= 0) { jx += Math.round((Math.random() - 0.5) * 8 * dying); jy += Math.round((Math.random() - 0.5) * 6 * dying); }
  const lift = atk?.kind === "slam" ? -Math.round(Math.sin(castP * Math.PI * 0.5) * 6) : 0;
  // death: topple, then the victory explosion (events) takes over; nothing is left standing
  if (b.pose?.name === "death" && b.pose.t >= b.pose.total * 0.97 && !opts.portrait) return;
  jx += pm.jx; jy += pm.jy;
  const bx = Math.round(b.x + pm.dx) + jx, by = Math.round(b.y + pm.dy) + bob + jy + lift;
  // abyssal burrowed: only a crack + mound travels under the floor
  if (L.kaiju?.kind === "abyssal" && pm.hidden) { drawBurrowMound(ctx, Math.round(b.x), Math.round(b.y) + 36, time, opts.portrait); return; }

  // ---- ground shadow (dithered) ----
  if (!opts.portrait) {
    const sh = Math.max(0.45, 1 - pm.air / 40);
    if (L.kaiju) drawShadow(ctx, Math.round(b.x + pm.dx * 0.5) + 22, Math.round(b.y) + (L.kaiju.kind === "abyssal" ? 40 : 58), Math.round((66 - lift) * sh), Math.max(3, Math.round(8 * sh)));
    else drawShadow(ctx, Math.round(b.x), Math.round(b.y) + 46, 46 - lift, 9);
  }
  // pose transform for the whole body (death topple / burrow clip); restored at the end of the body block
  ctx.save();
  if (pm.clipY !== null) { ctx.beginPath(); ctx.rect(-4000, -4000, 8000, Math.round(b.y) + pm.clipY + 4000); ctx.clip(); }
  if (pm.rot) { const px = bx + 14, py = by + 58; ctx.translate(px, py); ctx.rotate(pm.rot); ctx.translate(-px, -py); }
  if (pm.alpha < 1) ctx.globalAlpha = Math.max(0, pm.alpha);
  // kaiju signature: the dorsal plates charge up tail -> head before the atomic breath (laser)
  const breathCharge = L.kaiju ? Math.max(atk?.kind === "laser" ? castP : 0, pm.charge) : 0;
  // the jaw stays open for the beam only after a laser wind-up (other wind-ups just charge the fins)
  if (L.kaiju && atk?.kind === "laser" && castP > 0.9) kaijuBreathUntil.set(kit.repo, time + 0.9);
  const breathing = L.kaiju ? time < (kaijuBreathUntil.get(kit.repo) ?? -1) : false;

  // ---- heart light on the floor ----
  const beat = heartbeat(time, tint);
  if (!opts.portrait) drawGlow(ctx, bx + L.heart.x, by + L.heart.y + 30, art.danger, 52, 0.22 + beat * 0.12);

  // ---- wings (behind everything) ----
  if (L.kaiju?.wing) drawDragonWing(ctx, L, art, bx, by, time, pm.flap, tint, L.kaiju.wing.limb >= 0 && broken[L.kaiju.wing.limb]);
  else for (const g of L.spots) if (g.kind === "wings") drawWings(ctx, bx + g.x, by + g.y, g.size, art, time, tint);

  // ---- kaiju dorsal plates (behind the body so they grow out of the spine) ----
  if (L.kaiju) drawKaijuPlates(ctx, L, kit, broken, bx, by, time, breathing ? 1 : breathCharge, tint);

  // ---- legs + tentacles behind body ----
  for (const lg of L.legs) if (lg.limb < 0 || !broken[lg.limb]) drawLeg(ctx, lg, art, bx, by, time, castP, b);
  for (const t of L.tentacles) drawTentacle(ctx, t, L, broken, art, bx, by, time, castP);

  // ---- body ----
  const sx = bx - body.cx, sy = by - body.cy;
  const squash = atk ? Math.round(castP * 3) : 0;
  const glitchy = (tint === 2 && hash2(Math.floor(time * 9), 3) < 0.35) || (dying >= 0 && hash2(Math.floor(time * 20), 4) < 0.6);
  if (glitchy) {
    const h = body.canvas.height, slices = 6;
    for (let i = 0; i < slices; i++) {
      const y0 = Math.floor((i * h) / slices), y1 = Math.floor(((i + 1) * h) / slices);
      const off = Math.round((hash2(Math.floor(time * 9), i + 10) - 0.5) * (dying >= 0 ? 20 : 8));
      ctx.drawImage(body.canvas, 0, y0, body.canvas.width, y1 - y0, sx + off, sy + y0, body.canvas.width, y1 - y0);
    }
  } else if (squash) {
    ctx.drawImage(body.canvas, sx - squash, sy + squash * 2, body.canvas.width + squash * 2, body.canvas.height - squash * 2);
  } else {
    ctx.drawImage(body.canvas, sx, sy);
  }

  // ---- RGB split ghosts in last stand ----
  if (tint === 2 || dying >= 0) {
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = dying >= 0 ? 0.4 : L.kaiju ? 0.07 : 0.18;
    const w = whiteOf(body);
    const o = 1 + Math.round(beat * 2) + (dying >= 0 ? Math.round(dying * 6) : 0);
    ctx.drawImage(tinted(w, "#ff0040"), sx - o, sy);
    ctx.drawImage(tinted(w, "#00e5ff"), sx + o, sy);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = prev;
  }

  // ---- weak point pulses ----
  L.limbs.forEach((l, i) => {
    if (!l.weakPoint || broken[i]) return;
    const p = 0.5 + 0.5 * Math.sin(time * 5 + i);
    drawGlow(ctx, bx + l.x, by + l.y, art.danger, l.r + 2, 0.1 + p * 0.25);
    if (p > 0.85) { ctx.fillStyle = "#ffffff"; ctx.fillRect(bx + Math.round(l.x), by + Math.round(l.y), 1, 1); }
  });

  // ---- fragile organs (bus factor 1): pulsing amber glow + tiny "1 MAINTAINER" tag ----
  L.limbs.forEach((l, i) => {
    const kl = kit.limbs[i];
    if (broken[i] || !kl?.fragile) return;
    const p = 0.5 + 0.5 * Math.sin(time * 3.2 + i * 1.3);
    drawGlow(ctx, bx + l.x, by + l.y, "#ffb02e", l.r + 4, 0.25 + p * 0.35);
    if (!opts.portrait) {
      const n = kl.maintainers ?? 1;
      const tag = n + " MAINTAINER" + (n === 1 ? "" : "S");
      const tx = Math.round(bx + l.x), ty = Math.round(by + l.y + (l.y >= 0 ? l.r + 3 : -l.r - 9));
      ctx.globalAlpha = 0.85;
      drawText(ctx, tag, tx, ty, p > 0.5 ? "#ffd27a" : "#ffb02e", { align: "center" });
      ctx.globalAlpha = 1;
    }
  });

  // ---- parasites: publicly known vulnerabilities crawling on their organ ----
  L.limbs.forEach((l, i) => {
    const vulns = kit.limbs[i]?.parasites;
    if (broken[i] || !vulns?.length) return;
    const n = Math.min(3, vulns.length);
    for (let k = 0; k < n; k++) {
      const a = time * (0.5 + k * 0.17) * (k % 2 ? -1 : 1) + k * 2.1 + i;
      const rr = l.r * (0.55 + 0.25 * Math.sin(time * 0.7 + k));
      drawParasite(ctx, bx + l.x + Math.cos(a) * rr, by + l.y + Math.sin(a) * rr * 0.85, a + Math.PI / 2 * (k % 2 ? -1 : 1), time + k);
    }
    if (!opts.portrait && every("cve" + l.id, 2.6 + i * 0.3, time)) emit({ kind: "glyph", x: bx + l.x, y: by + l.y - l.r, vy: -12, max: 1.2, text: vulns[Math.floor(time) % vulns.length].id.slice(0, 16).toUpperCase(), color: "#b6ff3a" });
  });

  // ---- appendage + growth dynamics ----
  L.limbs.forEach((l, i) => {
    if (broken[i]) return;
    const charging = i === srcIdx ? castP : 0;
    if (l.appendage === "lens" && L.body !== "eye" && L.body !== "tree" && L.body !== "hydra") {
      const cx = bx + Math.round(l.x + Math.cos(l.angle) * 3), cy = by + Math.round(l.y + Math.sin(l.angle) * 3);
      drawGlow(ctx, cx, cy, charging ? art.danger : art.accent, 8 + charging * 14, 0.4 + charging * 0.6);
      if (charging) { ctx.fillStyle = charging > 0.7 ? "#ffffff" : art.dangerRamp[3]; disc(ctx, cx, cy, 1 + charging * 3); }
    }
    if (l.appendage === "antenna" && !opts.portrait && L.body !== "eye" && L.body !== "tree" && L.body !== "hydra") {
      const tx = bx + l.x + Math.cos(l.angle) * (l.r + 16), ty = by + l.y + Math.sin(l.angle) * (l.r + 16);
      drawGlow(ctx, tx, ty, art.danger, 7, 0.5 + 0.5 * Math.sin(time * 9 + i));
      if (every("ant" + i, 0.35 - charging * 0.25, time)) emit({ kind: "spark", x: tx, y: ty, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, max: 0.25, color: art.danger, color2: art.dangerRamp[1] });
    }
  });
  for (const g of L.spots) {
    if (g.owner >= 0 && broken[g.owner]) continue;
    if (g.kind === "gears") drawGear(ctx, bx + g.x, by + g.y, g.size, time * (g.phase > 3 ? 1.5 : -1.5) + g.phase, art);
    if (g.kind === "servers") for (let k = 0; k < 3; k++) {
      const on = hash2(Math.floor(time * (3 + k * 2) + g.phase), k) < 0.6;
      ctx.fillStyle = on ? (k === 2 ? "#ffb02e" : "#39ff6a") : "#0a200e";
      ctx.fillRect(bx + g.x + 8, by + g.y + 1 + k * 2, 1, 1);
    }
    if (g.kind === "pipes" && !opts.portrait && every("pipe" + g.phase, 0.18, time)) {
      const ex = bx + g.x + Math.cos(g.angle) * g.size, ey = by + g.y + Math.sin(g.angle) * g.size;
      emit({ kind: "smoke", x: ex, y: ey, vx: Math.cos(g.angle) * 14, vy: Math.sin(g.angle) * 14 - 10, max: 0.8, size: 2, color: "#d8d0d8", color2: "#5a5260" });
    }
    if (g.kind === "crystals") drawGlow(ctx, bx + g.x, by + g.y - g.size * 0.5, art.accent, 8, 0.35 + 0.2 * Math.sin(time * 3 + g.phase));
  }

  // ---- kaiju jaw, claws (in front of the body) ----
  if (L.kaiju) drawKaijuFront(ctx, L, art, broken, bx, by, time, breathing ? 1 : breathCharge, castP + pm.jaw, tint, opts.portrait, pm.head);

  // ---- heart ----
  drawHeart(ctx, bx + L.heart.x, by + L.heart.y, L, art, time, beat, tint, b, castP);

  // ---- eyes ----
  const look = lookTarget(b, time, bx, by);
  L.eyes.forEach((e, k) => {
    if (e.limb >= 0 && broken[e.limb]) return;
    if (L.kaiju?.kind === "mecha" && k === 0) { drawVisor(ctx, bx + e.x, by + e.y, time, Math.max(castP, pm.charge)); return; }
    if (L.kaiju) { drawKaijuEye(ctx, bx + e.x, by + e.y, e.r, e.phase + k, time, look, castP, tint); return; }
    drawEye(ctx, bx + e.x, by + e.y, e.r, e.phase + k, art, time, look, tint, castP, L.body === "machine");
  });

  // ---- mouth ----
  if (L.mouth) drawMouth(ctx, bx + L.mouth.x, by + L.mouth.y, L.mouth.w, L.mouthKind, art, time, castP, tint);

  // ---- swarm orbiters (also the kaiju's "swarm" design hint) ----
  if (L.body === "swarm" || L.kaiju?.hint === "swarm") drawOrbiters(ctx, bx, by, art, time, castP);

  // ---- hit flash (whole body, then per region) ----
  const since = fx.now - fx.bossFlash;
  if (!opts.portrait && ((since >= 0 && since < 0.07) || (dying >= 0 && Math.floor(time * 16) % 2 === 0))) {
    ctx.globalAlpha = L.kaiju && dying < 0 ? 0.4 : 0.75;
    ctx.drawImage(whiteOf(body), sx, sy);
    ctx.globalAlpha = 1;
  }
  if (!opts.portrait) {
    const spots = L.limbs.filter((_, i) => !broken[i]).map((l) => ({ id: l.id, x: l.x, y: l.y, r: l.r + 3 })).concat([{ id: "heart", x: L.heart.x, y: L.heart.y, r: 14 }]);
    for (const sp of spots) {
      const t = fx.now - (fx.limbFlash.get(sp.id) ?? -10);
      if (t < 0 || t > 0.07) continue;
      ctx.save();
      ctx.beginPath(); ctx.arc(bx + sp.x, by + sp.y, sp.r, 0, TAU); ctx.clip();
      ctx.globalAlpha = 0.55;
      ctx.drawImage(whiteOf(body), sx, sy);
      ctx.restore();
    }
  }

  ctx.restore(); // end of the pose transform

  // ---- archetype pose FX (stomps, roars, steam, jets, vein pulses) ----
  if (L.kaiju) drawPoseFx(ctx, b, L, art, bx, by, time, pm, tint, !!opts.portrait);

  // ---- casting: energy converging on the source limb ----
  if (atk && !opts.portrait) {
    const src = srcIdx >= 0 && !broken[srcIdx] ? L.limbs[srcIdx] : null;
    let cx = bx + (src ? src.x + Math.cos(src.angle) * src.r : L.heart.x), cy = by + (src ? src.y + Math.sin(src.angle) * src.r : L.heart.y);
    if (L.kaiju && atk.kind === "laser") { cx = bx + L.kaiju.mouth.x; cy = by + L.kaiju.mouth.y; }
    drawGlow(ctx, cx, cy, art.danger, 6 + castP * 16, 0.5 + castP * 0.5);
    for (let k = 0; k < 14; k++) {
      const f = (time * 1.6 + k * 0.137) % 1;
      const a = k * 2.399 + time * 2;
      const d = (1 - f) * (34 - castP * 10);
      ctx.fillStyle = f > 0.7 ? "#ffffff" : k % 2 ? art.dangerRamp[3] : art.accentRamp[3];
      ctx.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 1, 1);
    }
    if (castP > 0.5) { ctx.fillStyle = "#ffffff"; disc(ctx, cx, cy, 1 + (castP - 0.5) * 6 * (0.7 + 0.3 * Math.sin(time * 40))); }
    if (b.casting?.target && atk.kind !== "laser" && atk.kind !== "charge") {
      const [tx, ty] = b.casting.target;
      const dx = tx - cx, dy = ty - cy, dist = Math.hypot(dx, dy);
      ctx.fillStyle = art.dangerRamp[2];
      for (let s = ((time * 40) % 6); s < dist; s += 6) ctx.fillRect(Math.round(cx + (dx * s) / dist), Math.round(cy + (dy * s) / dist), 1, 1);
    }
  }

  // ---- npm install: summon casts show a progress bar on the floor that births the bugs ----
  if (atk?.kind === "summon" && !opts.portrait) {
    const w = 64, x0 = Math.round(b.x - w / 2), y0 = Math.round(b.y + 50);
    ctx.fillStyle = "#07040c"; ctx.fillRect(x0 - 2, y0 - 9, w + 4, 18);
    drawText(ctx, "$ NPM INSTALL", x0, y0 - 8, "#b6ff3a", { outline: null });
    ctx.fillStyle = "#1a2a10"; ctx.fillRect(x0, y0, w, 4);
    ctx.fillStyle = "#b6ff3a"; ctx.fillRect(x0, y0, Math.round(w * castP), 4);
    for (let k = 4; k < w; k += 5) { ctx.fillStyle = "#07040c"; ctx.fillRect(x0 + k, y0, 1, 4); }
    drawText(ctx, Math.round(castP * 100) + "% (BUGS INCOMING)", x0, y0 + 5, "#9fe88a", { outline: null });
  }

  // ---- git push --force: a red force-push trail while charging across the arena ----
  if (!opts.portrait) {
    const prev = lastPos.get(kit.repo);
    if (prev && time > prev.t) {
      const sp = Math.hypot(b.x - prev.x, b.y - prev.y) / Math.max(0.001, time - prev.t);
      if (sp > 70 && sp < 2000) {
        const ux = (b.x - prev.x) / (sp * (time - prev.t)), uy = (b.y - prev.y) / (sp * (time - prev.t));
        for (let k = 0; k < 3; k++) emit({ kind: "spark", x: b.x - ux * 30 + (Math.random() - 0.5) * 40, y: b.y - uy * 30 + (Math.random() - 0.5) * 30, vx: -ux * 120, vy: -uy * 120, max: 0.3, color: "#ff2a4a", color2: "#7a0a24" });
        if (every("force", 0.22, time)) emit({ kind: "glyph", x: b.x - ux * 40, y: b.y - uy * 40 - 10, vx: -ux * 30, vy: -10, max: 0.6, text: "--FORCE", color: "#ff5a6a" });
      }
    }
    lastPos.set(kit.repo, { x: b.x, y: b.y, t: time });
  }

  // ---- broken limbs: sparks + error glyphs ----
  if (!opts.portrait) L.limbs.forEach((l, i) => {
    if (!broken[i]) return;
    const st = L.kaiju ? { x: l.x - Math.cos(l.angle) * l.r * 0.6, y: l.y - Math.sin(l.angle) * l.r * 0.6, r: l.r } : stumpOf(l);
    const x = bx + st.x + Math.cos(l.angle) * st.r * 0.6, y = by + st.y + Math.sin(l.angle) * st.r * 0.6;
    if (every("stump" + l.id, 0.12, time)) emit({ kind: "spark", x, y, vx: Math.cos(l.angle + (Math.random() - 0.5) * 1.5) * 70, vy: Math.sin(l.angle) * 40 - 40, grav: 160, max: 0.45, color: "#ffd23f", color2: "#ff5a2a" });
    if (every("err" + l.id, 2.2 + (i % 3) * 0.7, time)) emit({ kind: "glyph", x: x + (Math.random() - 0.5) * 10, y, vx: Math.cos(l.angle) * 14, vy: -22, max: 1.1, text: ERR_GLYPHS[(Math.floor(time) + i) % ERR_GLYPHS.length], color: art.dangerRamp[3] });
    if (every("smk" + l.id, 0.2, time)) emit({ kind: "smoke", x, y, vx: (Math.random() - 0.5) * 6, vy: -16, max: 1.0, size: 2.5, color: "#3a3446", color2: "#211d29" });
  });

  // ---- enraged steam vents ----
  if (tint && !opts.portrait && every("steam", 0.07, time)) {
    const l = L.limbs[Math.floor(Math.random() * Math.max(1, L.limbs.length))];
    const ox = l ? l.x : 0, oy = l ? l.y - l.r : -L.bodyR;
    emit({ kind: "smoke", x: bx + ox + (Math.random() - 0.5) * 8, y: by + oy, vx: (Math.random() - 0.5) * 10, vy: -22 - Math.random() * 12, max: 0.9, size: 2 + Math.random() * 2, color: tint === 2 ? "#ff6a8a" : "#f2d6dc", color2: "#6d5a68" });
  }
}

// ---------- pieces ----------

function heartbeat(time: number, tint: number) {
  const bpm = tint === 2 ? 2.6 : tint ? 1.9 : 1.2;
  const ph = (time * bpm) % 1;
  return Math.max(Math.exp(-ph * 14), 0.7 * Math.exp(-Math.abs(ph - 0.22) * 18));
}

const shadowCache = new Map<string, HTMLCanvasElement>();
function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  const key = rx + "x" + ry;
  let c = shadowCache.get(key);
  if (!c) {
    const [cv, g] = makeCanvas(rx * 2 + 1, ry * 2 + 1);
    g.fillStyle = "#000000";
    for (let yy = 0; yy <= ry * 2; yy++)
      for (let xx = 0; xx <= rx * 2; xx++) {
        const d = Math.hypot((xx - rx) / rx, (yy - ry) / ry);
        if (d > 1) continue;
        if (d > 0.7 && (xx + yy) % 2) continue;
        g.fillRect(xx, yy, 1, 1);
      }
    shadowCache.set(key, (c = cv));
  }
  ctx.globalAlpha = 0.4;
  ctx.drawImage(c, x - rx, y - ry);
  ctx.globalAlpha = 1;
}

const tintCache = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();
function tinted(src: HTMLCanvasElement, color: string) {
  let m = tintCache.get(src);
  if (!m) tintCache.set(src, (m = new Map()));
  let c = m.get(color);
  if (!c) {
    const [cv, g] = makeCanvas(src.width, src.height);
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, cv.width, cv.height);
    m.set(color, (c = cv));
  }
  return c;
}

function bezier(t: number, p0: number, p1: number, p2: number, p3: number) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function drawTentacle(ctx: CanvasRenderingContext2D, t: TentacleLayout, L: BossLayout, broken: boolean[], art: BossArt, bx: number, by: number, time: number, castP: number) {
  const sway = Math.sin(time * 1.4 + t.phase) * (4 + castP * 3);
  const sway2 = Math.cos(time * 1.1 + t.phase * 1.3) * 3;
  let pts: [number, number, number][] = [];
  let ramp: string[] = t.knot ? art.dangerRamp : art.flesh;
  if (t.style === "root") ramp = [rgb(art.mats.bark[0]), rgb(art.mats.bark[2]), rgb(art.mats.bark[3]), rgb(art.mats.bark[4])];
  if (t.style === "nerve") ramp = t.knot ? art.dangerRamp : [art.dangerRamp[0], art.dangerRamp[1], art.boneRamp[1], art.boneRamp[2]];
  if (t.style === "neck") ramp = [rgb(art.mats.scales[1]), rgb(art.mats.scales[2]), rgb(art.mats.scales[3]), rgb(art.mats.scales[4])];
  if (t.style === "cable") {
    // catenary wire between two body points
    const n = t.segs;
    ctx.fillStyle = art.outline;
    const P: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      P.push([t.ax + (t.bx - t.ax) * u + Math.sin(time * 1.2 + t.phase) * Math.sin(u * Math.PI) * 2, t.ay + (t.by - t.ay) * u + Math.sin(u * Math.PI) * t.bulge]);
    }
    for (let i = 1; i < P.length; i++) line(ctx, bx + P[i - 1][0], by + P[i - 1][1] + 1, bx + P[i][0], by + P[i][1] + 1, 2);
    ctx.fillStyle = t.color ?? art.accent;
    for (let i = 1; i < P.length; i++) line(ctx, bx + P[i - 1][0], by + P[i - 1][1], bx + P[i][0], by + P[i][1]);
    return;
  }
  if (t.from >= 0 || t.from === -2) {
    const fromBroken = t.from >= 0 && broken[t.from], toBroken = broken[t.to];
    if ((fromBroken && toBroken) || (t.from === -2 && toBroken)) return;
    const A = t.from >= 0 ? L.limbs[t.from] : { x: t.ax, y: t.ay };
    const B = L.limbs[t.to];
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const ml = Math.hypot(mx, my) || 1;
    const px = (mx / ml) * t.bulge, py = (my / ml) * t.bulge;
    const s1 = t.style === "neck" ? sway * 0.6 : sway;
    const c1x = A.x + (B.x - A.x) * 0.25 + px + s1, c1y = A.y + (B.y - A.y) * 0.25 + py + sway2;
    const c2x = A.x + (B.x - A.x) * 0.75 + px - sway2, c2y = A.y + (B.y - A.y) * 0.75 + py + s1;
    const n = t.segs;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      pts.push([bezier(u, A.x, c1x, c2x, B.x), bezier(u, A.y, c1y, c2y, B.y), t.thick * (t.style === "neck" ? 1.1 - u * 0.35 : 0.8 + 0.4 * Math.sin(u * Math.PI))]);
    }
    if (fromBroken || toBroken) {
      pts = fromBroken ? pts.slice(Math.ceil(n / 2)).reverse() : pts.slice(0, Math.floor(n / 2) + 1);
      pts = pts.map(([x, y, w], k) => [x, y + k * k * 0.15, w]);
      const tip = pts[pts.length - 1];
      if (every("sev" + t.from + "-" + t.to, 0.3, time)) emit({ kind: "px", x: bx + tip[0], y: by + tip[1], vy: 20, grav: 80, max: 0.6, color: art.dangerRamp[2], color2: art.dangerRamp[0] });
    }
  } else {
    // dangling leg / root / nerve
    const n = t.segs;
    const amp = t.style === "root" ? 0.25 : 1;
    const ex = t.bx + sway * 1.6 * amp, ey = t.by + sway2 * amp;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const wig = Math.sin(time * 2.2 + t.phase + u * 5) * u * 3 * amp;
      const x = bezier(u, t.ax, t.ax + t.bulge * 0.3, ex - t.bulge, ex) + wig;
      const y = bezier(u, t.ay, t.ay + 10, ey - 12, ey);
      pts.push([x, y, Math.max(0.6, t.thick * (1 - u * 0.85))]);
    }
  }
  ctx.fillStyle = art.outline;
  for (const [x, y, w] of pts) disc(ctx, bx + x, by + y, w + 1);
  ctx.fillStyle = ramp[1];
  for (const [x, y, w] of pts) disc(ctx, bx + x, by + y, w);
  ctx.fillStyle = ramp[2];
  for (const [x, y, w] of pts) if (w >= 1.5) disc(ctx, bx + x - 0.5, by + y - 0.7, w - 1);
  ctx.fillStyle = ramp[3];
  pts.forEach(([x, y, w], i) => { if (w >= 2 && i % 2 === 0) ctx.fillRect(Math.round(bx + x - w * 0.4), Math.round(by + y - w * 0.6), 1, 1); });
  if (t.style === "flesh") {
    ctx.fillStyle = art.boneRamp[2];
    pts.forEach(([x, y, w], i) => { if (w >= 2 && i % 3 === 1) ctx.fillRect(Math.round(bx + x + w * 0.3), Math.round(by + y + w * 0.5), 1, 1); });
  }
  if (t.style === "nerve" && t.from === -1) {
    // optic nerve tip pulses data
    const [x, y] = pts[pts.length - 1];
    drawGlow(ctx, bx + x, by + y, art.danger, 4, 0.5 + 0.5 * Math.sin(time * 4 + t.phase));
  }
  if (t.knot) {
    const [kx, ky] = pts[Math.floor(pts.length / 2)];
    const p = 0.5 + 0.5 * Math.sin(time * 6 + t.phase);
    drawGlow(ctx, bx + kx, by + ky, art.danger, 9 + p * 4, 0.6 + p * 0.4);
    ctx.fillStyle = art.outline;
    disc(ctx, bx + kx, by + ky, 4.5);
    ctx.fillStyle = art.dangerRamp[2];
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * TAU + time * 2;
      ctx.fillRect(Math.round(bx + kx + Math.cos(a) * 3.5), Math.round(by + ky + Math.sin(a * 2) * 2.5), 1, 1);
    }
    ctx.fillStyle = p > 0.6 ? "#ffffff" : art.dangerRamp[3];
    ctx.fillRect(Math.round(bx + kx), Math.round(by + ky), 1, 1);
  } else if (t.from === -1 && t.style === "flesh") {
    const [x, y] = pts[pts.length - 1];
    ctx.fillStyle = art.accentRamp[2];
    ctx.fillRect(Math.round(bx + x), Math.round(by + y), 1, 1);
  }
}

function rgb(c: [number, number, number]) {
  return "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

function drawLeg(ctx: CanvasRenderingContext2D, lg: LegLayout, art: BossArt, bx: number, by: number, time: number, castP: number, b: BossState) {
  const ca = Math.cos(lg.dir), side = ca >= 0 ? 1 : -1;
  const ax = bx + lg.ax, ay = by + lg.ay;
  // walk cycle: foot steps in place, faster when moving
  const step = Math.sin(time * 5 + lg.phase);
  const raise = Math.max(0, step) * 3;
  const fx2 = ax + side * Math.max(16, Math.abs(ca) * lg.reach) + step * 2;
  const fy = Math.round(b.y) + 40 - raise + Math.sin(lg.dir) * 4;
  if (lg.style === "spider") {
    const kx = ax + side * Math.abs(ca) * lg.reach * 0.6 + side * 6, ky = ay - lg.lift - castP * 4 + raise * 0.5;
    const ramp = art.mats.chitin;
    for (const [w, c] of [[5, art.outline], [3, rgb(ramp[2])], [1, rgb(ramp[4])]] as [number, string][]) {
      ctx.fillStyle = c;
      line(ctx, ax, ay, kx, ky, w);
      line(ctx, kx, ky, fx2, fy, Math.max(1, w - 2));
    }
    ctx.fillStyle = art.outline; disc(ctx, kx, ky, 2.5);
    ctx.fillStyle = rgb(ramp[4]); disc(ctx, kx, ky, 1.5);
    ctx.fillStyle = art.boneRamp[3]; ctx.fillRect(Math.round(fx2), Math.round(fy), 1, 2);
  } else {
    // piston leg: two metal segments + hydraulic
    const kx = ax + side * 12, ky = ay + 6 - raise;
    const ramp = art.mats.metal;
    ctx.fillStyle = art.outline; line(ctx, ax, ay, kx, ky, 7); line(ctx, kx, ky, fx2, fy, 5);
    ctx.fillStyle = rgb(ramp[2]); line(ctx, ax, ay, kx, ky, 5);
    ctx.fillStyle = rgb(ramp[4]); line(ctx, kx, ky, fx2, fy, 3);
    ctx.fillStyle = "#e0b020"; line(ctx, (ax + kx) / 2, (ay + ky) / 2, (kx + fx2) / 2, (ky + fy) / 2, 1);
    ctx.fillStyle = art.outline; disc(ctx, kx, ky, 2.5);
    ctx.fillStyle = rgb(ramp[4]); ctx.fillRect(Math.round(kx), Math.round(ky), 1, 1);
    ctx.fillStyle = art.outline; ctx.fillRect(Math.round(fx2) - 3, Math.round(fy), 7, 2);
  }
}

function drawWings(ctx: CanvasRenderingContext2D, x: number, y: number, span: number, art: BossArt, time: number, tint: number) {
  const flap = Math.sin(time * 2.4) * 0.35;
  const mem = tint ? art.dangerRamp : [rgb(art.mats.flesh[1]), rgb(art.mats.flesh[2]), rgb(art.mats.flesh[3])];
  for (const s of [-1, 1]) {
    // finger bones from shoulder, membrane between them
    const tips: [number, number][] = [];
    for (let k = 0; k < 4; k++) {
      const a = -Math.PI / 2 + s * (0.55 + k * 0.32 + flap);
      const len = span * (1 - k * 0.12);
      tips.push([x + Math.cos(a) * len * 0.9 * 1, y + Math.sin(a) * len * 0.75 + k * 4]);
    }
    for (let k = 0; k < tips.length - 1; k++) {
      // fill membrane triangle with dithered rows
      const [x1, y1] = tips[k], [x2, y2] = tips[k + 1];
      ctx.fillStyle = mem[k % 2];
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const ex = x1 + (x2 - x1) * u, ey = y1 + (y2 - y1) * u + Math.sin(u * Math.PI) * 6;
        line(ctx, x, y, ex, ey);
      }
    }
    for (const [tx, ty] of tips) {
      ctx.fillStyle = art.outline; line(ctx, x, y, tx, ty, 2);
      ctx.fillStyle = art.boneRamp[2]; line(ctx, x, y, tx, ty, 1);
      ctx.fillStyle = art.boneRamp[3]; ctx.fillRect(Math.round(tx), Math.round(ty), 1, 1);
    }
  }
}

function drawGear(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ang: number, art: BossArt) {
  x = Math.round(x); y = Math.round(y);
  const teeth = Math.max(6, Math.round(r * 1.4));
  ctx.fillStyle = art.outline;
  disc(ctx, x, y, r + 1);
  for (let k = 0; k < teeth; k++) {
    const a = ang + (k / teeth) * TAU;
    ctx.fillRect(Math.round(x + Math.cos(a) * (r + 1.5)) - 1, Math.round(y + Math.sin(a) * (r + 1.5)) - 1, 3, 3);
  }
  ctx.fillStyle = "#8a8070";
  disc(ctx, x, y, r);
  for (let k = 0; k < teeth; k++) {
    const a = ang + (k / teeth) * TAU;
    ctx.fillRect(Math.round(x + Math.cos(a) * (r + 1.5)), Math.round(y + Math.sin(a) * (r + 1.5)), 1, 1);
  }
  ctx.fillStyle = "#b8ac98"; disc(ctx, x - 0.5, y - 0.5, r - 1.5);
  ctx.fillStyle = "#5a5246"; disc(ctx, x, y, Math.max(1, r * 0.35));
  ctx.fillStyle = art.outline; ctx.fillRect(x, y, 1, 1);
}

function drawOrbiters(ctx: CanvasRenderingContext2D, bx: number, by: number, art: BossArt, time: number, castP: number) {
  for (let k = 0; k < 22; k++) {
    const sp = 0.6 + hash2(k, 1) * 1.2;
    const a = time * sp * (k % 2 ? 1 : -1) + k * 2.1;
    const rx = 40 + hash2(k, 2) * 22 - castP * 14, ry = rx * (0.55 + hash2(k, 3) * 0.3);
    const x = Math.round(bx + Math.cos(a) * rx), y = Math.round(by + Math.sin(a) * ry);
    ctx.fillStyle = art.outline; ctx.fillRect(x - 1, y - 1, 3, 2);
    ctx.fillStyle = k % 3 ? rgb(art.mats.chitin[3]) : art.dangerRamp[2];
    ctx.fillRect(x - 1, y - 1, 2, 1);
    if (Math.floor(time * 20 + k) % 2) { ctx.fillStyle = "#c8c8d8"; ctx.fillRect(x, y - 2, 1, 1); } // wing flutter
  }
}

function lookTarget(b: BossState, time: number, bx: number, by: number): [number, number] {
  if (b.casting?.target) return b.casting.target;
  if (fx.look && fx.now - fx.lookAt < 1.5) return fx.look;
  const k = Math.floor(time * 0.7);
  return [bx + (hash2(k, 11) - 0.5) * 300, by + (hash2(k, 12) - 0.5) * 200];
}

function drawEye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ph: number, art: BossArt, time: number, look: [number, number], tint: number, castP: number, lens: boolean) {
  x = Math.round(x); y = Math.round(y);
  const period = 2.6 + (ph % 3);
  const bt = (time + ph * 1.7) % period;
  const closed = lens ? 0 : bt < 0.16 ? Math.sin((bt / 0.16) * Math.PI) : 0;
  ctx.fillStyle = art.outline;
  disc(ctx, x, y, r + 1);
  if (lens) {
    // camera lens eye for machines
    ctx.fillStyle = "#1a1c24"; disc(ctx, x, y, r);
    ctx.fillStyle = castP > 0.3 || tint ? "#ff2a3a" : art.accent; disc(ctx, x, y, Math.max(1, r * 0.5));
    ctx.fillStyle = "#ffffff"; ctx.fillRect(x - 1, y - 1, 1, 1);
    drawGlow(ctx, x, y, castP > 0.3 || tint ? "#ff2a3a" : art.accent, r + 4, 0.6);
    return;
  }
  const sclera = tint ? art.dangerRamp[3] : art.boneRamp[3];
  ctx.fillStyle = sclera;
  disc(ctx, x, y, r);
  if (r >= 3) { ctx.fillStyle = tint ? art.dangerRamp[2] : art.boneRamp[2]; ctx.fillRect(x - r + 1, y + 1, 2 * r - 1, Math.max(1, r - 2)); }
  if (tint && r >= 3) { ctx.fillStyle = art.dangerRamp[1]; ctx.fillRect(x - r + 1, y, 1, 1); ctx.fillRect(x + r - 1, y - 1, 1, 1); }
  const dx = look[0] - x, dy = look[1] - y, dl = Math.hypot(dx, dy) || 1;
  const ir = Math.max(1, Math.round(r * 0.6));
  const m = Math.max(0, r - ir);
  const ix = Math.round(x + (dx / dl) * m), iy = Math.round(y + (dy / dl) * m);
  ctx.fillStyle = castP > 0.3 ? art.danger : art.accent;
  disc(ctx, ix, iy, ir);
  ctx.fillStyle = art.outline;
  if (r >= 3) ctx.fillRect(ix, iy - Math.max(1, ir - 1), 1, Math.max(1, ir * 2 - 1));
  else ctx.fillRect(ix, iy, 1, 1);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(ix - 1, iy - 1, 1, 1);
  if (castP > 0.3) drawGlow(ctx, ix, iy, art.danger, r + 4, castP);
  if (closed > 0) {
    const rows = Math.ceil((2 * r + 1) * closed);
    ctx.fillStyle = art.body[2];
    for (let k = 0; k < rows; k++) {
      const yy = -r + k;
      const w = Math.floor(Math.sqrt(Math.max(0, r * r - yy * yy)) + 0.5);
      ctx.fillRect(x - w, y + yy, w * 2 + 1, 1);
    }
    ctx.fillStyle = art.outline;
    const yy = -r + rows;
    const w = Math.floor(Math.sqrt(Math.max(0, r * r - yy * yy)) + 0.5);
    ctx.fillRect(x - w, y + yy, w * 2 + 1, 1);
  }
}

function drawMouth(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, kind: string, art: BossArt, time: number, castP: number, tint: number) {
  x = Math.round(x); y = Math.round(y);
  const chatter = Math.max(0, Math.sin(time * 2.3)) * 1.5 + (tint ? Math.max(0, Math.sin(time * 9)) * 1.5 : 0);
  const open = Math.round(2 + chatter + castP * 6);
  const hw = Math.round(w / 2);
  if (kind === "beak") {
    // hooked beak that gapes
    const g = Math.round(open * 0.6);
    for (const [dy, dir] of [[-g, -1], [g, 1]] as [number, number][]) {
      for (let k = 0; k < 7; k++) {
        const ww = 6 - k;
        ctx.fillStyle = art.outline; ctx.fillRect(x - ww - 1, y + dy + dir * k - (dir < 0 ? 1 : 0), ww * 2 + 3, 2);
      }
      for (let k = 0; k < 6; k++) {
        const ww = 5 - k;
        ctx.fillStyle = k < 2 ? art.boneRamp[3] : art.boneRamp[2];
        ctx.fillRect(x - ww, y + dy + dir * k, ww * 2 + 1, 1);
      }
    }
    ctx.fillStyle = art.inside; ctx.fillRect(x - 3, y - g + 1, 7, Math.max(1, g * 2 - 1));
    if (castP > 0) drawGlow(ctx, x, y, art.danger, 8 + open, castP);
    return;
  }
  if (kind === "zipper") {
    // a zipper across the face; it unzips while casting
    const unz = Math.round((castP > 0 ? castP : Math.max(0, Math.sin(time * 0.8)) * 0.2) * w);
    ctx.fillStyle = art.outline; ctx.fillRect(x - hw - 1, y - 2, w + 3, 5);
    for (let k = 0; k <= w; k++) {
      const px = x - hw + k;
      const opened = k < unz;
      const gap = opened ? Math.round(Math.sin((k / Math.max(1, unz)) * Math.PI) * open * 0.6) : 0;
      if (opened) { ctx.fillStyle = art.inside; ctx.fillRect(px, y - gap, 1, gap * 2 + 1); }
      ctx.fillStyle = k % 2 ? "#c8ccd8" : "#7a8090";
      ctx.fillRect(px, y - 1 - gap, 1, 1); ctx.fillRect(px, y + 1 + gap, 1, 1);
    }
    // pull tab
    const tx = x - hw + unz;
    ctx.fillStyle = art.outline; ctx.fillRect(tx - 2, y - 1, 5, 7);
    ctx.fillStyle = "#e0e4ee"; ctx.fillRect(tx - 1, y, 3, 5);
    ctx.fillStyle = art.outline; ctx.fillRect(tx, y + 3, 1, 1);
    return;
  }
  // maw / brackets
  ctx.fillStyle = art.outline;
  for (let k = -1; k <= open + 1; k++) {
    const f = 1 - Math.pow((k - open / 2) / (open / 2 + 1.5), 2);
    const ww = Math.round(hw * Math.sqrt(Math.max(0.15, f))) + 1;
    ctx.fillRect(x - ww, y + k, ww * 2 + 1, 1);
  }
  ctx.fillStyle = art.inside;
  for (let k = 0; k <= open; k++) {
    const f = 1 - Math.pow((k - open / 2) / (open / 2 + 1), 2);
    const ww = Math.round(hw * Math.sqrt(Math.max(0.1, f)));
    ctx.fillRect(x - ww, y + k, ww * 2 + 1, 1);
  }
  if (castP > 0 || tint) drawGlow(ctx, x, y + open / 2, art.danger, 6 + open * 2, 0.4 + castP * 0.6);
  if (open >= 4) { ctx.fillStyle = art.dangerRamp[castP > 0.5 ? 3 : 1]; ctx.fillRect(x - 2, y + Math.floor(open / 2), 5, 2); }
  ctx.fillStyle = art.boneRamp[3];
  if (kind === "maw") {
    // jagged fangs
    for (let tx = x - hw + 1; tx <= x + hw - 1; tx += 2) {
      const long = (tx + 99) % 6 === 0 ? 3 : 2;
      ctx.fillRect(tx, y, 1, long);
      ctx.fillRect(tx, y + open - long + 1, 1, long);
    }
  } else {
    // bracket teeth: } } } on top, { { { on bottom + corners
    for (let tx = x - hw + 2; tx <= x + hw - 2; tx += 3) {
      ctx.fillRect(tx, y, 1, 2); ctx.fillRect(tx + 1, y + 1, 1, 1);
      ctx.fillRect(tx, y + open - 1, 1, 2); ctx.fillRect(tx - 1, y + open - 1, 1, 1);
    }
    drawText(ctx, "{", x - hw - 4, y + Math.floor(open / 2) - 2, art.boneRamp[3], { outline: art.outline });
    drawText(ctx, "}", x + hw + 1, y + Math.floor(open / 2) - 2, art.boneRamp[3], { outline: art.outline });
  }
}

const heartCodeCache = new Map<number, number[]>();
function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, L: BossLayout, art: BossArt, time: number, beat: number, tint: number, b: BossState, castP: number) {
  const exposed = tint === 2;
  if (L.heart.style === "iris") {
    // the giant eye: iris = heart, pupil tracks
    const look = lookTarget(b, time, x, y);
    const dx = look[0] - x, dy = look[1] - y, dl = Math.hypot(dx, dy) || 1;
    const ir = 13 + beat;
    const ix = Math.round(x + (dx / dl) * 6), iy = Math.round(y + (dy / dl) * 5);
    drawGlow(ctx, ix, iy, art.danger, 22 + beat * 8, 0.5 + beat * 0.4);
    ctx.fillStyle = art.outline; disc(ctx, ix, iy, ir + 1);
    ctx.fillStyle = art.accentRamp[0]; disc(ctx, ix, iy, ir);
    ctx.fillStyle = art.accentRamp[1]; disc(ctx, ix, iy, ir - 2);
    // iris striations
    ctx.fillStyle = art.accentRamp[2];
    for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU + time * 0.2; line(ctx, ix + Math.cos(a) * 6, iy + Math.sin(a) * 6, ix + Math.cos(a) * (ir - 2), iy + Math.sin(a) * (ir - 2)); }
    const pr = 4 + castP * 3 + (exposed ? 2 : 0);
    ctx.fillStyle = art.outline; disc(ctx, ix, iy, pr + 1);
    ctx.fillStyle = art.dangerRamp[exposed ? 2 : 0]; disc(ctx, ix, iy, pr);
    ctx.fillStyle = art.dangerRamp[3]; disc(ctx, ix, iy, Math.max(1, pr * 0.4 * (0.6 + beat)));
    ctx.fillStyle = "#ffffff"; ctx.fillRect(ix - 5, iy - 6, 2, 2); ctx.fillRect(ix + 4, iy + 3, 1, 1);
    return;
  }
  const hasCode = !!b.kit.code?.heartLines?.length;
  const base = exposed ? (hasCode ? 11 : 9) : hasCode ? 9 : 7;
  const r = base + beat * 1.6;
  drawGlow(ctx, x, y, art.danger, Math.round(16 + beat * 8 + (exposed ? 8 : 0)), 0.55 + beat * 0.45);
  ctx.fillStyle = art.outline; disc(ctx, x, y, r + 1);
  ctx.fillStyle = art.dangerRamp[0]; disc(ctx, x, y, r);
  ctx.fillStyle = art.dangerRamp[1]; disc(ctx, x - 0.5, y - 0.5, r - 1);
  ctx.fillStyle = art.dangerRamp[2]; disc(ctx, x - 1, y - 1, Math.max(1, r - 3));
  const real = b.kit.code?.heartLines?.filter((l) => l.trim()) ?? [];
  if (real.length) drawHeartCode(ctx, x, y, r, real, art, time);
  else {
    let lines = heartCodeCache.get(Math.round(r));
    if (!lines) {
      lines = Array.from({ length: 64 }, (_, i) => Math.floor(hash2(i, 5) * 8) + 2);
      heartCodeCache.set(Math.round(r), lines);
    }
    const scroll = Math.floor(time * 10);
    const ri = Math.floor(r) - 1;
    for (let yy = -ri; yy <= ri; yy += 2) {
      const half = Math.floor(Math.sqrt(Math.max(0, ri * ri - yy * yy)));
      if (half < 2) continue;
      const idx = ((yy + scroll) % 64 + 64) % 64;
      const indent = idx % 3;
      const len = Math.min(lines[idx], half * 2 - indent - 1);
      ctx.fillStyle = idx % 5 === 0 ? art.accentRamp[3] : art.dangerRamp[3];
      ctx.fillRect(Math.round(x - half + 1 + indent), Math.round(y + yy), Math.max(1, len), 1);
    }
  }
  // exposed heart reveals the line it is executing
  if (exposed && real.length) {
    const cur = real[Math.floor(time * 0.8) % real.length].trim().toUpperCase().slice(0, 30);
    drawText(ctx, "> " + cur, x, y - 30, Math.floor(time * 4) % 2 ? art.dangerRamp[3] : "#ffffff", { align: "center" });
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(Math.round(x - r * 0.5), Math.round(y - r * 0.55), 2, 1);
  if (L.heart.style === "reactor") {
    // containment ring with rotating clamps
    const rr = 13;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + (exposed ? time * 3 : time * 0.5);
      const cx = x + Math.cos(a) * rr, cy = y + Math.sin(a) * rr;
      ctx.fillStyle = art.outline; disc(ctx, cx, cy, 2.5);
      ctx.fillStyle = exposed && k % 2 ? art.danger : "#9aa3b8"; disc(ctx, cx, cy, 1.5);
    }
    return;
  }
  if (!exposed) {
    const gap = hasCode ? 3 : 0;
    drawText(ctx, "{", x - 16 - gap, y - 7, art.boneRamp[3], { outline: art.outline, scale: 3 });
    drawText(ctx, "}", x + 8 + gap, y - 7, art.boneRamp[3], { outline: art.outline, scale: 3 });
  } else {
    for (let k = 0; k < 4; k++) {
      const a = time * 0.8 + k * (TAU / 4);
      drawText(ctx, k % 2 ? "{" : "}", x + Math.cos(a) * 17 - 2, y + Math.sin(a) * 13 - 3, art.boneRamp[2], { outline: art.outline });
    }
    if (hash2(Math.floor(time * 14), 4) < 0.3) { ctx.fillStyle = "#00e5ff"; ctx.fillRect(Math.round(x - r), Math.round(y + (hash2(Math.floor(time * 14), 5) - 0.5) * r * 2), Math.round(r * 2), 1); }
  }
}

/** Real heart-file lines scrolling up inside the core, each row a slow marquee, clipped to the disc. */
function drawHeartCode(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, lines: string[], art: BossArt, time: number) {
  const ri = Math.floor(r) - 1;
  const rowH = 6;
  const scrollY = time * 5;
  const first = Math.floor(scrollY / rowH);
  const sub = Math.round(scrollY % rowH);
  ctx.save();
  ctx.beginPath();
  ctx.arc(Math.round(x) + 0.5, Math.round(y) + 0.5, ri + 0.5, 0, TAU);
  ctx.clip();
  for (let k = -2; k <= 2; k++) {
    const idx = (((first + k) % lines.length) + lines.length) % lines.length;
    const text = lines[idx].trim().toUpperCase();
    const w = text.length * 4;
    const ry = Math.round(y + k * rowH - sub);
    const span = w + ri * 2;
    const mx = Math.round(x + ri - ((time * 9 + idx * 23) % span));
    const col = k === 0 ? "#ffffff" : art.dangerRamp[3];
    drawText(ctx, text, mx, ry - 2, col, { outline: null });
  }
  ctx.restore();
}

/** A tiny tick-like parasite (a CVE) with wiggling legs. */
function drawParasite(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, time: number) {
  x = Math.round(x); y = Math.round(y);
  const ux = Math.cos(dir), uy = Math.sin(dir), px = -uy, py = ux;
  const w = Math.floor(time * 10) % 2;
  ctx.fillStyle = "#0a1a04";
  for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) ctx.fillRect(Math.round(x + ux * k * 1.5 + px * s * (2.5 + (w ^ (k & 1)))), Math.round(y + uy * k * 1.5 + py * s * (2.5 + (w ^ (k & 1)))), 1, 1);
  ctx.fillStyle = "#0a1a04"; disc(ctx, x, y, 2.5);
  ctx.fillStyle = "#6a9a1a"; disc(ctx, x, y, 1.6);
  ctx.fillStyle = "#b6ff3a"; ctx.fillRect(x - 1, y - 1, 1, 1);
  ctx.fillStyle = "#ff2a3a"; ctx.fillRect(Math.round(x + ux * 2), Math.round(y + uy * 2), 1, 1);
  drawGlow(ctx, x, y, "#9dff3a", 4, 0.35);
}

// ---------- kaiju ----------

type FinState = "idle" | "lit" | "dead" | "rage" | "rage2" | "mech" | "gold" | "abyss";
const FIN_PAL: Record<FinState, { lo: string; mid: string; hi: string; glow: string }> = {
  idle: { lo: "#1f8a80", mid: "#4fd2c2", hi: "#c8fff6", glow: "#3ee6d6" },   // mint crystal (refs boss-1/4)
  lit: { lo: "#7fe8ff", mid: "#d8fbff", hi: "#ffffff", glow: "#3ee6ff" },    // charged: white-hot cyan
  dead: { lo: "#3e3a44", mid: "#77727f", hi: "#a8a3b0", glow: "#000000" },   // broken: cracked grey
  rage: { lo: "#7a0a1a", mid: "#ff3a4a", hi: "#ffc0c8", glow: "#ff2a3a" },   // phase 2: red (ref boss-5)
  rage2: { lo: "#0a5a6a", mid: "#2ee6ff", hi: "#d0ffff", glow: "#2ee6ff" },  // phase 3 alternates red / cyan
  mech: { lo: "#4a4a50", mid: "#9a9aa2", hi: "#f0f0f4", glow: "#ff4a3a" },   // machine hint: steel (ref boss-3)
  gold: { lo: "#8a5a10", mid: "#e0a828", hi: "#fff0a0", glow: "#ffc840" },   // hydra horns + neck spines (ref boss-2)
  abyss: { lo: "#0a0a12", mid: "#2a2838", hi: "#2ee6ff", glow: "#2ee6ff" },  // black crystal with cyan edge (ref boss-5)
};

const finCache = new Map<string, { c: HTMLCanvasElement; ox: number; oy: number }>();

/** Rasterize one crystal fin (cluster of jagged spikes) along its outward normal; cached per state. */
function finSprite(p: PlateLayout, state: FinState, mech: boolean): { c: HTMLCanvasElement; ox: number; oy: number } {
  const nx = Math.round(p.nx * 8) / 8, ny = Math.round(p.ny * 8) / 8;
  const key = p.seed + "|" + p.scale + "|" + p.spikes + "|" + nx + "," + ny + "|" + state + "|" + (mech ? 1 : 0) + "|" + p.ch;
  let f = finCache.get(key);
  if (f) return f;
  if (finCache.size > 400) finCache.clear();
  const H = p.scale;
  const size = Math.ceil(H * 2 + 10);
  const [c, g] = makeCanvas(size, size);
  const ox = size / 2, oy = size / 2;
  const tx = -ny, ty = nx; // tangent
  const R = (k: number) => hash2(p.seed, k, 31);
  const pal = FIN_PAL[state];
  const n = p.spikes;
  const w = Math.max(3, H * 0.42);
  const inTri = (px: number, py: number, a: number[], b: number[], c2: number[]) => {
    const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
    const d2 = (px - c2[0]) * (b[1] - c2[1]) - (b[0] - c2[0]) * (py - c2[1]);
    const d3 = (px - a[0]) * (c2[1] - a[1]) - (c2[0] - a[0]) * (py - a[1]);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  const tris: { a: number[]; b: number[]; c: number[]; axis: number[]; tip: number[] }[] = [];
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * w * 0.7;
    const mid = Math.abs(i - (n - 1) / 2) / Math.max(1, (n - 1) / 2);
    const len = mech ? H * (0.95 - mid * 0.3) : H * (1 - mid * 0.45) * (0.85 + R(i) * 0.3);
    const lean = (i - (n - 1) / 2) * (mech ? 0.05 : 0.22) + (R(i + 9) - 0.5) * 0.15;
    const dx = nx + tx * lean, dy = ny + ty * lean;
    const bx = ox + tx * off, by = oy + ty * off;
    const hw = (mech ? w * 0.62 : w * 0.5) * (1 - mid * 0.25);
    const tip = [bx + dx * len, by + dy * len];
    tris.push({ a: [bx - tx * hw, by - ty * hw], b: [bx + tx * hw, by + ty * hw], c: tip, axis: [bx, by], tip });
    // forked side jag (boss-1's branching crystal tips)
    if (!mech && len > 9) {
      const s2 = 0.45 + R(i + 3) * 0.2, side = R(i + 5) < 0.5 ? -1 : 1;
      const jx = bx + dx * len * s2, jy = by + dy * len * s2;
      const jt = [jx + (dx + tx * side * 0.9) * len * 0.35, jy + (dy + ty * side * 0.9) * len * 0.35];
      tris.push({ a: [jx - dx * 2.5, jy - dy * 2.5], b: [jx + dx * 2.5, jy + dy * 2.5], c: jt, axis: [jx, jy], tip: jt });
    }
  }
  // mech fins are flat-topped trapezoids: clip the tips
  const img = g.createImageData(size, size);
  const put = (x: number, y: number, hex: string) => {
    const k = (y * size + x) * 4, v = parseInt(hex.slice(1), 16);
    img.data[k] = v >> 16; img.data[k + 1] = (v >> 8) & 255; img.data[k + 2] = v & 255; img.data[k + 3] = 255;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = x + 0.5, py = y + 0.5;
      for (const t of tris) {
        if (!inTri(px, py, t.a, t.b, t.c)) continue;
        if (mech && (px - ox) * nx + (py - oy) * ny > H * 0.82) break;
        // facet: the half toward the light (left of the spike axis) is lighter; the tip is brightest
        const ax = t.tip[0] - t.axis[0], ay = t.tip[1] - t.axis[1];
        const side = (px - t.axis[0]) * ay - (py - t.axis[1]) * ax;
        const along = ((px - t.axis[0]) * ax + (py - t.axis[1]) * ay) / (ax * ax + ay * ay);
        const col = along > 0.78 ? pal.hi : side < 0 ? pal.mid : pal.lo;
        put(x, y, mech && (x + y) % 5 === 0 ? pal.lo : col);
        break;
      }
    }
  g.putImageData(img, 0, 0);
  // etched code bracket on the fin (code in spirit)
  if (H >= 16 && !mech) {
    g.fillStyle = state === "lit" ? "#3ee6ff" : state === "dead" ? "#2a2730" : "#0b2a2a";
    drawTextRaw(g, p.ch, Math.round(ox + nx * H * 0.4) - 1, Math.round(oy + ny * H * 0.4) - 2);
  }
  outlineSprite(c, "#06110c");
  f = { c, ox, oy };
  finCache.set(key, f);
  return f;
}

function drawKaijuPlates(ctx: CanvasRenderingContext2D, L: BossLayout, kit: BossKit, broken: boolean[], bx: number, by: number, time: number, charge: number, tint: number) {
  const K = L.kaiju!;
  const n = K.plates.length;
  for (const p of K.plates) {
    const dead = p.owner >= 0 && broken[p.owner];
    if (dead && p.order % 2 === 0) continue; // a broken fin row loses every other fin
    // the charge runs from the tail end (order 0) to the head
    const lit = !dead && charge > 0 && charge * 1.15 > (p.order + 1) / n;
    const calm: FinState = K.mech ? "mech" : K.kind === "dragon" ? "gold" : K.kind === "abyssal" ? "abyss" : "idle";
    const state: FinState = dead ? "dead" : lit ? "lit" : tint === 2 ? (p.order % 2 ? "rage" : "rage2") : tint && !K.mech ? "rage" : calm;
    const f = finSprite(p, state, K.mech);
    // the fin root sinks into the hide (drawn behind the body)
    const sink = Math.min(5, p.scale * 0.22);
    const cx = Math.round(bx + p.x - p.nx * sink), cy = Math.round(by + p.y - p.ny * sink) + (dead ? 2 : 0);
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.2 + p.order * 0.6);
    if (!dead && state !== "mech" && state !== "abyss") drawGlow(ctx, cx + p.nx * p.scale * 0.5, cy + p.ny * p.scale * 0.5, FIN_PAL[state].glow, lit ? p.scale + 8 : p.scale * 0.6 + 3, lit ? 0.9 : 0.22 + pulse * 0.18);
    ctx.drawImage(f.c, Math.round(cx - f.ox), Math.round(cy - f.oy));
    if (lit && Math.random() < 0.12) emit({ kind: "px", x: cx + p.nx * p.scale, y: cy + p.ny * p.scale, vx: (Math.random() - 0.5) * 20, vy: -30, max: 0.4, color: "#3ee6ff", color2: "#ffffff", glow: true });
    if (dead && Math.random() < 0.02) emit({ kind: "spark", x: cx, y: cy, vx: (Math.random() - 0.5) * 50, vy: -40, grav: 160, max: 0.4, color: "#ffd23f", color2: "#ff5a2a" });
  }
  void kit;
}

function drawKaijuFront(ctx: CanvasRenderingContext2D, L: BossLayout, art: BossArt, broken: boolean[], bx: number, by: number, time: number, charge: number, castP: number, tint: number, portrait?: boolean, headIdx = 0) {
  const K = L.kaiju!;
  const ramp = (K.kind === "dragon" ? art.mats.gold : K.kind === "mecha" ? art.mats.metal : K.kind === "abyssal" ? art.mats.void : art.mats.obsidian).map((c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`);
  const breathCol = K.kind === "dragon" ? "#ffd84a" : K.kind === "mecha" ? "#ff4a3a" : K.kind === "abyssal" ? (tint ? "#ff2a3a" : "#2ee6ff") : "#3ee6ff";
  K.jaws.forEach((J, ji) => {
    const jawBroken = J.limb >= 0 && broken[J.limb];
    if (jawBroken && K.kind === "dragon") return; // a severed hydra head is gone
    const active = K.jaws.length === 1 || ji === headIdx % K.jaws.length;
    const chatter = Math.max(0, Math.sin(time * 1.9 + ji)) * 0.06 + (tint ? Math.max(0, Math.sin(time * 7 + ji)) * 0.08 : 0);
    const open = Math.min(0.62, 0.05 + chatter + (active ? castP * 0.18 + charge * 0.42 : 0)) + (jawBroken ? 0.25 : 0);
    const hx = bx + J.hx, hy = by + J.hy;
    const a = Math.PI + 0.18 - open;
    const tx = hx + Math.cos(a) * J.len, ty = hy - Math.sin(a) * J.len;
    const cx0 = hx + Math.cos(Math.PI + 0.18) * J.len, cy0 = hy - Math.sin(Math.PI + 0.18) * J.len;
    if (open > 0.08) {
      for (let k = 0; k <= 14; k++) {
        const f = k / 14;
        ctx.fillStyle = art.inside; line(ctx, hx + (cx0 - hx) * f, hy + (cy0 - hy) * f - 1, hx + (tx - hx) * f, hy + (ty - hy) * f);
      }
      if (active && charge > 0) {
        const m = K.mouths[ji] ?? K.mouth;
        drawGlow(ctx, bx + m.x + 4, by + m.y + 2, breathCol, 8 + charge * 20 * (J.len / 26), 0.4 + charge * 0.6);
        ctx.fillStyle = charge > 0.6 ? "#ffffff" : breathCol;
        disc(ctx, bx + m.x + 5, by + m.y + 2, 1 + charge * 3 * (J.len / 26));
      }
    }
    // teeth under the snout and on the jaw
    ctx.fillStyle = K.kind === "mecha" ? "#c8ccd8" : "#f4f1e6";
    for (let x = Math.round(J.len * 0.25); x <= J.len - 2; x += 3) ctx.fillRect(Math.round(hx - x), Math.round(hy + 1), 1, 2);
    for (const [w, c] of [[J.w, art.outline], [J.w - 2, ramp[2]], [1, ramp[3]]] as [number, string][]) { ctx.fillStyle = c; line(ctx, hx, hy, tx, ty, Math.max(1, w)); }
    ctx.fillStyle = "#f4f1e6";
    for (let k = 0; k < Math.floor(J.len / 4); k++) {
      if (jawBroken && k % 2) continue;
      const f = 0.25 + k * (0.7 / Math.max(1, Math.floor(J.len / 4)));
      ctx.fillRect(Math.round(hx + (tx - hx) * f), Math.round(hy + (ty - hy) * f - 2), 1, 2);
    }
    if (jawBroken && !portrait && Math.random() < 0.05) emit({ kind: "px", x: tx, y: ty, vy: 20, grav: 80, max: 0.6, color: art.dangerRamp[2], color2: art.dangerRamp[0] });
  });
  // mecha: shoulder cannon barrel pointing at the heroes (ref boss-3's armor modules)
  if (K.kind === "mecha") {
    const ci = K.slots.indexOf("shoulder-cannon");
    if (!(ci >= 0 && broken[ci])) {
      const cx = bx + 6, cy = by - 46;
      ctx.fillStyle = art.outline; ctx.fillRect(cx - 18, cy - 3, 22, 7);
      ctx.fillStyle = "#8a8a94"; ctx.fillRect(cx - 17, cy - 2, 20, 5);
      ctx.fillStyle = "#d8d8e0"; ctx.fillRect(cx - 17, cy - 2, 20, 1);
      ctx.fillStyle = "#3a3a44"; ctx.fillRect(cx - 17, cy + 1, 20, 1);
      ctx.fillStyle = "#07040c"; ctx.fillRect(cx - 19, cy - 1, 2, 3);
      ctx.fillStyle = castP > 0.2 ? "#ffb02e" : "#5a2a1a"; ctx.fillRect(cx - 19, cy, 1, 1);
    }
  }
  // claws on the little arms and the toes (bipeds only)
  if (K.kind === "kaiju" || K.kind === "mecha") {
    ctx.fillStyle = K.kind === "mecha" ? "#c8ccd8" : "#f4f1e6";
    const armSlot = K.slots.findIndex((sl) => sl === "arms" || sl === "rocket-fist");
    if (!(armSlot >= 0 && broken[armSlot])) {
      ctx.fillRect(bx - 35, by - 2, 1, 2); ctx.fillRect(bx - 34, by + 1, 1, 2);
      if (K.hint === "spider") { ctx.fillRect(bx - 31, by + 13, 1, 2); ctx.fillRect(bx - 30, by + 15, 1, 2); }
    }
  }
  ctx.fillStyle = "#f4f1e6";
  for (const f of K.feet) for (const d of [-6, -2]) ctx.fillRect(bx + f.x + d, by + f.y, 2, 1);
}

function drawKaijuEye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ph: number, time: number, look: [number, number], castP: number, tint: number) {
  x = Math.round(x); y = Math.round(y);
  const bt = (time + ph * 1.7) % (3.4 + (ph % 2));
  const closed = bt < 0.12;
  drawGlow(ctx, x, y, "#ff2a3a", r + 5, 0.5 + castP * 0.5);
  ctx.fillStyle = "#06110c"; disc(ctx, x, y, r + 1);
  if (closed) { ctx.fillStyle = "#ff2a3a"; ctx.fillRect(x - r, y, r * 2 + 1, 1); return; }
  ctx.fillStyle = tint ? "#ffd23f" : "#ff2a3a"; disc(ctx, x, y, r);
  const dx = look[0] - x, dy = look[1] - y, dl = Math.hypot(dx, dy) || 1;
  const px = Math.round(x + (dx / dl) * Math.max(0, r - 1.5)), py = Math.round(y + (dy / dl) * Math.max(0, r - 1.5));
  ctx.fillStyle = "#3ee6ff"; ctx.fillRect(px, py - Math.max(1, r - 1), 1, Math.max(1, r * 2 - 1)); // cyan slit pupil
  ctx.fillStyle = "#ffffff"; ctx.fillRect(x - 1, y - r + 1, 1, 1);
}

// ---------- poses (driven by BossState.pose from the sim; never contradicts gameplay) ----------

interface PoseMotion {
  dx: number; dy: number; jx: number; jy: number; rot: number; alpha: number;
  clipY: number | null;  // burrow/emerge: hide everything below this y (relative to boss.y)
  charge: number;        // fins / vents / veins / head glow 0..1
  jaw: number;           // extra jaw opening
  head: number;          // hydra: which head acts
  flap: number;          // wing beat speed
  air: number;           // visual lift (px) for the shadow
  hidden: boolean;       // abyssal burrowed: only a mound
  still: boolean;
  step: number;          // walk phase 0..1 (stomp FX)
}

const ease = (t: number) => t * t * (3 - 2 * t);

function poseMotion(b: BossState, L: BossLayout, time: number, portrait: boolean): PoseMotion {
  const m: PoseMotion = { dx: 0, dy: 0, jx: 0, jy: 0, rot: 0, alpha: 1, clipY: null, charge: 0, jaw: 0, head: b.pose?.head ?? 0, flap: 1, air: 0, hidden: false, still: false, step: -1 };
  const pose = b.pose;
  if (portrait || !pose || !L.kaiju) return m;
  const kind = L.kaiju.kind;
  const p = Math.max(0, Math.min(1, pose.t / Math.max(0.01, pose.total)));
  const dir = pose.dir ?? [-1, 0];
  const dl = Math.hypot(dir[0], dir[1]) || 1;
  const ux = dir[0] / dl, uy = dir[1] / dl;
  const hop = (h: number) => -Math.sin(p * Math.PI) * h;
  switch (pose.name) {
    case "walk":
      if (kind === "abyssal") { m.dx = Math.sin(time * 6) * 1.2; m.flap = 1; }
      else { m.step = (p * 2) % 1; m.dy = -Math.round(Math.sin(m.step * Math.PI) * 2.5); m.still = true; }
      break;
    case "windup": m.dx = -ux * 2 * ease(p); m.dy = -1.5 * ease(p); m.charge = p; m.jaw = p * 0.4; m.jx = p > 0.7 ? Math.round((hash2(Math.floor(time * 30), 3) - 0.5) * 2) : 0; break;
    case "attack": m.dx = ux * 4 * (1 - p); m.dy = uy * 2 * (1 - p); m.charge = 1 - p; m.jaw = 1 - p * 0.6; break;
    case "recover": m.dx = ux * 1.5 * (1 - p); m.jaw = 0.2 * (1 - p); break;
    case "roar": m.dy = -2; m.jaw = 1; m.charge = 0.5; m.jx = Math.round((hash2(Math.floor(time * 24), 5) - 0.5) * 2); break;
    case "stagger": m.dx = -ux * 4 * (1 - p); m.jx = Math.round((hash2(Math.floor(time * 30), 7) - 0.5) * 5 * (1 - p)); m.jaw = 0.4; break;
    case "enrage": m.charge = 0.5 + 0.5 * Math.sin(time * 10); m.jaw = 0.6; m.jx = Math.round((hash2(Math.floor(time * 20), 9) - 0.5) * 2); break;
    case "death": m.rot = ease(p) * 1.2; m.dy = ease(p) * 8; m.alpha = 1 - Math.max(0, p - 0.85) / 0.15; m.jaw = 0.8; m.still = true; break;
    case "fly":
      // hydra hovers (wings beat fast); mecha jet-hops
      if (kind === "mecha") { m.dy = hop(14); m.air = -m.dy; }
      else { m.dy = -8 * ease(Math.min(1, p * 3)) + Math.sin(time * 5) * 1.5; m.air = -m.dy + 12; m.flap = 3; }
      m.still = true;
      break;
    case "dive": m.dx = ux * 6 * p; m.dy = -8 * (1 - p) * (1 - p) + uy * 4 * p; m.flap = 0.3; m.air = 8 * (1 - p); m.still = true; break;
    case "burrow": m.dy = ease(p) * 52; m.clipY = 42; m.still = true; if (p >= 0.98 && b.airborne) m.hidden = true; break;
    case "emerge": m.dy = (1 - ease(p)) * 52; m.clipY = 42; m.still = true; break;
  }
  // abyssal stays hidden while burrowed between burrow and emerge
  if (kind === "abyssal" && b.airborne && pose.name !== "emerge" && pose.name !== "burrow") m.hidden = true;
  // hydra keeps hovering while airborne
  if (kind === "dragon" && b.airborne && pose.name !== "fly" && pose.name !== "dive") { m.dy += -8 + Math.sin(time * 5) * 1.5; m.air = 20; m.flap = 3; }
  return m;
}

const stepSeen = new Map<string, number>();

function drawPoseFx(ctx: CanvasRenderingContext2D, b: BossState, L: BossLayout, art: BossArt, bx: number, by: number, time: number, pm: PoseMotion, tint: number, portrait: boolean) {
  if (portrait) return;
  const K = L.kaiju!;
  const pose = b.pose?.name;
  // stomp: shake + dust at the planted foot on each step
  if (pm.step >= 0) {
    const stepNo = Math.floor(((b.pose.t / Math.max(0.01, b.pose.total)) * 2));
    const key = b.kit.repo;
    if (stepSeen.get(key) !== stepNo && pm.step < 0.15) {
      stepSeen.set(key, stepNo);
      const f = K.feet[stepNo % Math.max(1, K.feet.length)] ?? { x: 0, y: 58 };
      addShake(K.kind === "mecha" ? 2 : 2.5);
      burst(bx + f.x, by + f.y, 8, { kind: "smoke", speed: 30, max: 0.6, size: 2.5, color: "#7a7062", color2: "#3a342e", drag: 3 });
      if (K.kind === "mecha") emit({ kind: "glyph", x: bx + f.x, y: by + f.y - 6, vy: -10, max: 0.5, text: "CLANK", color: "#c8ccd8" });
    }
  }
  // roar: shockwave rings from the mouth
  if (pose === "roar" && every("roar" + b.kit.repo, 0.22, time)) {
    const m = K.mouths[pm.head % K.mouths.length] ?? K.mouth;
    emit({ kind: "ring", x: bx + m.x, y: by + m.y, size: 34, max: 0.5, color: tint ? "#ff5a6a" : "#bfffff" });
    addShake(2);
  }
  // mecha: vents glow while charging, steam on recover, jets on a hop
  if (K.kind === "mecha") {
    for (const v of K.vents) {
      const x = bx + v.x, y = by + v.y;
      if (pm.charge > 0.05) { drawGlow(ctx, x, y, "#ff7a2a", 5 + pm.charge * 6, 0.4 + pm.charge * 0.6); ctx.fillStyle = pm.charge > 0.6 ? "#ffffff" : "#ffb02e"; ctx.fillRect(x - 1, y, 3, 1); }
      if ((pose === "recover" || tint) && every("vent" + v.x, 0.12, time)) emit({ kind: "smoke", x, y, vx: 10 + Math.random() * 8, vy: -14, max: 0.8, size: 2, color: "#e8e8f0", color2: "#5a5a66" });
    }
    if (pose === "fly") for (const f of K.feet) { drawGlow(ctx, bx + f.x, by + f.y + 2, "#ffb02e", 8, 0.9); if (Math.random() < 0.6) emit({ kind: "spark", x: bx + f.x, y: by + f.y + 2, vx: (Math.random() - 0.5) * 30, vy: 80, max: 0.3, color: "#ffd23f", color2: "#ff5a2a" }); }
  }
  // veins pulse (abyssal always; everyone when enraged / charging)
  if (K.kind === "abyssal" || tint || pm.charge > 0.2) {
    const col = tint ? "#ff2a3a" : "#2ee6ff";
    K.veins.forEach((v, i) => { const p2 = 0.5 + 0.5 * Math.sin(time * 4 + i); drawGlow(ctx, bx + v.x, by + v.y, col, v.r + 4, (0.18 + p2 * 0.25) * (0.6 + pm.charge)); });
  }
  // hydra: the acting head glows while it winds up its own beam
  if (K.kind === "dragon" && pm.charge > 0) {
    const m = K.mouths[pm.head % K.mouths.length];
    if (m) drawGlow(ctx, bx + m.x + 6, by + m.y, "#ffd84a", 6 + pm.charge * 12, 0.5 + pm.charge * 0.5);
  }
  // abyssal burrow / emerge: crystal shards burst from the ground line
  if ((pose === "burrow" || pose === "emerge") && every("dig" + b.kit.repo, 0.08, time)) {
    burst(bx + (Math.random() - 0.5) * 60, Math.round(b.y) + 42, 3, { kind: "shard", speed: 70, max: 0.6, text: "/\\<>{}", spin: 12, color: "#2ee6ff", color2: "#2a2838", grav: 200 });
    addShake(1.5);
  }
}

function drawBurrowMound(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, portrait?: boolean) {
  // a crack + mound of broken floor crawling under the arena (the boss is untargetable)
  ctx.fillStyle = "#07040c";
  for (let k = -18; k <= 18; k++) ctx.fillRect(x + k, y + Math.round(Math.sin(k * 0.9 + time * 6) * 1.5), 1, 2);
  for (let k = 0; k < 6; k++) {
    const a = k * 1.05 + time;
    ctx.fillStyle = k % 2 ? "#2a2838" : "#4a4658";
    disc(ctx, x + Math.cos(a) * 10, y - 2 + Math.sin(a) * 3, 3);
  }
  drawGlow(ctx, x, y, "#2ee6ff", 16, 0.35 + 0.15 * Math.sin(time * 5));
  if (!portrait && every("mound", 0.1, time)) emit({ kind: "px", x: x + (Math.random() - 0.5) * 30, y, vy: -30, grav: 120, max: 0.5, color: "#6a6478", color2: "#2a2838" });
}

function drawDragonWing(ctx: CanvasRenderingContext2D, L: BossLayout, art: BossArt, bx: number, by: number, time: number, flapSpeed: number, tint: number, torn: boolean) {
  // one big ribbed wing fanning up-right (ref boss-2): bright membrane bands between dark ribs
  const W = L.kaiju!.wing!;
  const sx = bx + W.x, sy = by + W.y;
  const flap = Math.sin(time * 2.2 * flapSpeed) * 0.22;
  const ribs = 5;
  const tips: [number, number][] = [];
  for (let k = 0; k < ribs; k++) {
    const a = -1.95 + k * 0.32 + flap * (1 - k * 0.12);
    const len = W.span * (1 - Math.abs(k - 1.5) * 0.12);
    tips.push([sx + Math.cos(a) * len, sy + Math.sin(a) * len]);
  }
  const gold = art.mats.gold.map((c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`);
  const bright = tint === 2 ? ["#3a1a14", "#5a2a1e"] : tint ? ["#a8501c", "#d07a2a"] : [gold[3], gold[4]];
  for (let k = 0; k < ribs - 1; k++) {
    if (torn && k % 2 === 1) continue;
    const [x1, y1] = tips[k], [x2, y2] = tips[k + 1];
    for (let i = 0; i <= 26; i++) {
      const u = i / 26;
      const ex = x1 + (x2 - x1) * u, ey = y1 + (y2 - y1) * u + Math.sin(u * Math.PI) * 7;
      ctx.fillStyle = (i >> 2) % 2 ? bright[0] : bright[1];
      line(ctx, sx, sy, ex, ey);
    }
  }
  for (const [tx, ty] of tips) {
    ctx.fillStyle = art.outline; line(ctx, sx, sy, tx, ty, 3);
    ctx.fillStyle = gold[1]; line(ctx, sx, sy, tx, ty, 1);
    ctx.fillStyle = "#fff0a0"; ctx.fillRect(Math.round(tx), Math.round(ty), 1, 1);
  }
}

function drawVisor(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, charge: number) {
  // mecha visor: a red slit with scanning glow (ref boss-3's red eyes)
  x = Math.round(x); y = Math.round(y);
  drawGlow(ctx, x - 2, y, "#ff2a1a", 7 + charge * 8, 0.6 + charge * 0.4);
  ctx.fillStyle = "#07040c"; ctx.fillRect(x - 7, y - 2, 11, 4);
  ctx.fillStyle = charge > 0.5 ? "#ffffff" : "#ff3a2a"; ctx.fillRect(x - 6, y - 1, 9, 2);
  const scan = Math.floor((time * 8) % 9);
  ctx.fillStyle = "#ffd0c8"; ctx.fillRect(x - 6 + scan, y - 1, 1, 2);
}

// ---------- portrait ----------

export function portraitFrame(kit: BossKit): { logical: number; bx: number; by: number } {
  const layout = bossLayout(kit);
  // The four presets share a 128px buffer extent. Leave room above the hydra's
  // wings and to the right of the longest tail, including their entrance poses.
  // World-target attack lines and the death topple are not portrait geometry.
  if (layout.kaiju) return { logical: layout.extent * 2, bx: layout.extent - 32, by: layout.extent - 16 };
  return { logical: 176, bx: 88, by: 80 };
}

export function bossPortrait(kit: BossKit, size: number): HTMLCanvasElement {
  const { logical: LOGICAL, bx, by } = portraitFrame(kit);
  const [c, ctx] = makeCanvas(size, size);
  const [l, lctx] = makeCanvas(LOGICAL, LOGICAL);
  const state: BossState = {
    x: bx, y: by, hp: kit.maxHp, maxHp: kit.maxHp, phase: 1,
    limbs: kit.limbs.map((m) => ({ id: m.id, hp: m.maxHp, maxHp: m.maxHp, broken: false })),
    casting: null, targetPlayer: null, enraged: false, regions: [], kit,
    pose: { name: "idle", t: 0, total: 1, dir: [-1, 0] }, airborne: false,
  };
  drawBossAt(lctx, state, 0.35, { portrait: true });
  const s = size / LOGICAL;
  const k = s >= 1 ? Math.floor(s) : s;
  const w = LOGICAL * k;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(l, Math.round((size - w) / 2), Math.round((size - w) / 2), w, w);
  return c;
}
