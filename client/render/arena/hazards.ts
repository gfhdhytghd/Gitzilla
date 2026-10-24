// Telegraphed boss hazards (marching ants + red stack-trace text) and the firewall skill bubble.
import type { Hazard } from "../../../shared/types.ts";
import { ARENA_H, ARENA_W } from "../../../shared/types.ts";
import { bayer, disc, drawGlow, hash2, line, TAU } from "./pix.ts";
import { drawText, textSprite } from "./font.ts";
import { addShake, burst, emit, fx } from "./fx.ts";

const names = new Map<number, string>();      // hazard id -> attack name (from latest telegraph event)
const firstSeen = new Map<number, number>();
const armedAt = new Map<number, number>();
let lastSeen = new Set<number>();

/** set by drawEvents when a telegraph event arrives */
export const telegraphInfo = { name: "", at: -10 };

function activeWindow(h: Hazard) {
  if (h.kind === "laser") return h.r >= 15 ? 0.1 : 0.75;
  return 0.45;
}

function dangerColor() {
  const k = fx.boss?.kit;
  return k ? (k.design ? k.palette[2] : k.palette[3]) ?? "#ff3a5c" : "#ff3a5c";
}

export function drawHazards(ctx: CanvasRenderingContext2D, hazards: Hazard[], time: number) {
  const seen = new Set<number>();
  const red = dangerColor();
  // cascade groups for chain lightning
  const cascades = hazards.filter((h) => h.kind === "cascade");
  for (const h of hazards) {
    seen.add(h.id);
    if (!firstSeen.has(h.id)) firstSeen.set(h.id, time);
    // the telegraph event may be ingested a frame after the hazard first appears
    if (!names.get(h.id) && Math.abs(telegraphInfo.at - firstSeen.get(h.id)!) < 0.6) names.set(h.id, telegraphInfo.name);
    if (h.armed && !armedAt.has(h.id)) {
      armedAt.set(h.id, time);
      onArm(h, red);
    }
    const tele = Math.max(0.05, h.total - activeWindow(h));
    const p = Math.min(1, h.t / tele);
    const left = Math.max(0, tele - h.t);
    switch (h.kind) {
      case "slam": slam(ctx, h, p, left, time, red); break;
      case "laser": laser(ctx, h, p, left, time, red); break;
      case "cascade": cascade(ctx, h, p, time, red); break;
      case "firewall": firewall(ctx, h, time); break;
    }
  }
  // lightning between cascade nodes while telegraphing
  if (cascades.length > 1) {
    for (let i = 1; i < cascades.length; i++) {
      const a = cascades[i - 1], b = cascades[i];
      bolt(ctx, a.x, a.y, b.x, b.y, time, a.armed || b.armed ? "#ffffff" : red, a.armed || b.armed ? 2 : 1);
    }
  }
  for (const id of lastSeen) if (!seen.has(id)) { names.delete(id); armedAt.delete(id); firstSeen.delete(id); }
  lastSeen = seen;
}

function onArm(h: Hazard, red: string) {
  if (h.kind === "slam") {
    addShake(6);
    burst(h.x, h.y, 26, { kind: "spark", speed: 120, max: 0.5, colors: ["#ffffff", red, "#ffd23f"], drag: 3 });
    burst(h.x, h.y, 10, { kind: "smoke", speed: 40, max: 0.9, size: 4, color: "#5a4a50", color2: "#2a2228", drag: 2 });
    emit({ kind: "ring", x: h.x, y: h.y, size: h.r * 1.4, max: 0.4, color: "#ffffff" });
    burst(h.x, h.y, 8, { kind: "shard", speed: 90, max: 0.7, text: "/\\#*;", spin: 18, color: "#ffd23f", color2: red, grav: 160 });
    emit({ kind: "glyph", x: h.x, y: h.y - 10, vy: -20, max: 0.8, text: "STACK OVERFLOW", color: "#ffffff" });
  } else if (h.kind === "cascade") {
    addShake(3);
    burst(h.x, h.y, 14, { kind: "spark", speed: 100, max: 0.35, colors: ["#ffffff", "#9ff0ff", red] });
    emit({ kind: "ring", x: h.x, y: h.y, size: h.r * 1.3, max: 0.3, color: "#9ff0ff" });
  } else if (h.kind === "laser" && h.r < 15) {
    addShake(4);
  }
}

function antsRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number, c1: string, c2: string) {
  const n = Math.max(16, Math.round(r * TAU));
  const off = Math.floor(time * 18);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    ctx.fillStyle = ((i + off) >> 2) % 2 ? c1 : c2;
    ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1);
  }
}

function ditherDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, level: number, color: string) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = color;
  const ri = Math.ceil(r);
  for (let dy = -ri; dy <= ri; dy++) {
    const w = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
    for (let dx = -w; dx <= w; dx++) if (bayer(x + dx, y + dy) < level) ctx.fillRect(x + dx, y + dy, 1, 1);
  }
}

function stackTrace(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, left: number, red: string, time: number) {
  // compact label at the hazard; the full FATAL banner lives in claude-ui's HUD
  const n = (name || "").split("::")[0].trim().toUpperCase();
  const msg = (n ? n + " " : "") + left.toFixed(1) + "S";
  const blink = Math.floor(time * 8) % 2 === 0;
  const sc = fx.textScale;
  const w = msg.length * 4 * sc;
  const v = fx.view;
  const lo = Math.max(12, v.x + 2), hi = Math.min(ARENA_W - 12, v.x + v.w - 2);
  const tx = Math.max(lo, Math.min(hi - w, Math.round(x) - (w >> 1)));
  const ty = Math.max(Math.max(24, v.y + 2), Math.min(Math.min(ARENA_H - 18, v.y + v.h - 6 * sc), Math.round(y - (sc - 1) * 5)));
  drawText(ctx, msg, tx, ty, blink ? "#ffffff" : red, { scale: sc });
}

function frameNames(): string[] {
  const code = fx.boss?.kit.code;
  const syms = code ? Object.values(code.limbSymbols ?? {}).flat().filter((x) => x && x.length <= 14) : [];
  return syms.length ? syms : ["MAIN", "RECURSE", "RECURSE", "RECURSE", "RECURSE"];
}

/** "Stack Overflow": stack frames rain down and pile into a column on the target while the slam winds up. */
function stackFrames(ctx: CanvasRenderingContext2D, h: Hazard, p: number, time: number, red: string) {
  const names = frameNames();
  const n = Math.min(8, Math.floor(p * 8) + 1);
  const fw = 30, fh = 6;
  for (let i = 0; i < n; i++) {
    const falling = i === n - 1 && p < 0.98;
    const fp = falling ? (p * 8) % 1 : 1;
    const y = Math.round(h.y + 2 - (i + 1) * (fh + 1) - (1 - fp) * 60);
    const x = Math.round(h.x - fw / 2 + Math.sin(i * 1.7 + time * (i * 0.3)) * Math.min(3, i * 0.5));
    ctx.globalAlpha = falling ? fp : 1;
    ctx.fillStyle = "#07040c"; ctx.fillRect(x - 1, y - 1, fw + 2, fh + 2);
    ctx.fillStyle = i % 2 ? "#3a0a18" : "#4a0e20"; ctx.fillRect(x, y, fw, fh);
    ctx.fillStyle = red; ctx.fillRect(x, y, 1, fh);
    const label = ("AT " + names[i % names.length]).toUpperCase().slice(0, 7);
    drawText(ctx, label, x + 2, y, i === n - 1 ? "#ffffff" : "#ff9ab0", { outline: null });
  }
  ctx.globalAlpha = 1;
}

function slam(ctx: CanvasRenderingContext2D, h: Hazard, p: number, left: number, time: number, red: string) {
  if (!h.armed) {
    ditherDisc(ctx, h.x, h.y, h.r, 0.15 + p * 0.45, "#7a0a24");
    drawGlow(ctx, h.x, h.y, red, h.r + 6, 0.25 + p * 0.35);
    antsRing(ctx, h.x, h.y, h.r, time, red, "#ffffff");
    // closing inner ring = countdown
    ctx.fillStyle = "#ffd23f";
    const ir = h.r * (1 - p);
    if (ir > 1) antsRing(ctx, h.x, h.y, ir, -time, "#ffd23f", "#7a0a24");
    // crosshair
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(Math.round(h.x) - 3, Math.round(h.y), 7, 1);
    ctx.fillRect(Math.round(h.x), Math.round(h.y) - 3, 1, 7);
    stackFrames(ctx, h, p, time, red);
    stackTrace(ctx, h.x, h.y - h.r - 9, names.get(h.id) ?? "", left, red, time);
  } else {
    const since = time - (armedAt.get(h.id) ?? time);
    const f = Math.min(1, since / 0.35);
    if (since < 0.08) { ctx.fillStyle = "#ffffff"; disc(ctx, h.x, h.y, h.r); }
    else {
      ditherDisc(ctx, h.x, h.y, h.r, 0.6 * (1 - f), red);
      // crater cracks
      ctx.fillStyle = "#2a0810";
      for (let k = 0; k < 7; k++) {
        const a = hash2(h.id, k) * TAU;
        line(ctx, h.x, h.y, h.x + Math.cos(a) * h.r * 0.9, h.y + Math.sin(a) * h.r * 0.9);
      }
    }
    drawGlow(ctx, h.x, h.y, red, h.r + 10, 1 - f);
  }
}

function laser(ctx: CanvasRenderingContext2D, h: Hazard, p: number, left: number, time: number, red: string) {
  const ux = Math.cos(h.angle), uy = Math.sin(h.angle);
  const px = -uy, py = ux;
  const len = 640;
  const charge = h.r >= 15;
  if (!h.armed) {
    // telegraph lane
    const w = charge ? h.r : Math.max(1, h.r * (0.3 + p * 0.7));
    for (let s = 0; s < len; s += 2) {
      const x = h.x + ux * s, y = h.y + uy * s;
      if (x < 0 || y < 0 || x > ARENA_W || y > ARENA_H) break;
      const on = ((s >> 2) + Math.floor(time * 20)) % 2 === 0;
      ctx.fillStyle = on ? red : "#ffffff";
      ctx.fillRect(Math.round(x + px * w), Math.round(y + py * w), 1, 1);
      ctx.fillRect(Math.round(x - px * w), Math.round(y - py * w), 1, 1);
      if (bayer(Math.round(x), Math.round(y)) < 0.12 + p * 0.25) {
        ctx.fillStyle = "#7a0a24";
        for (let k = -w + 1; k < w; k += 2) ctx.fillRect(Math.round(x + px * k), Math.round(y + py * k), 1, 1);
      }
    }
    // chevrons racing down the lane
    const chev = charge ? ">>" : ">";
    for (let s = (time * 120) % 40; s < len; s += 40) {
      const x = h.x + ux * s, y = h.y + uy * s;
      if (x < 0 || y < 0 || x > ARENA_W || y > ARENA_H) break;
      for (let k = -2; k <= 2; k++) {
        ctx.fillStyle = "#ffd23f";
        ctx.fillRect(Math.round(x + px * k - ux * Math.abs(k)), Math.round(y + py * k - uy * Math.abs(k)), 1, 1);
      }
      void chev;
    }
    // race condition: two thin beams converge onto the lane as the wind-up completes
    if (!charge) {
      for (const sgn of [-1, 1]) {
        const a = h.angle + sgn * (1 - p) * 0.55;
        const cx = Math.cos(a), cy = Math.sin(a);
        ctx.fillStyle = sgn < 0 ? "#ff9ab0" : "#9ff0ff";
        for (let s2 = 6; s2 < 400; s2 += 3) {
          const xx = h.x + cx * s2, yy = h.y + cy * s2;
          if (xx < 0 || yy < 0 || xx > ARENA_W || yy > ARENA_H) break;
          if (((s2 / 3) | 0) % 3 !== 0) ctx.fillRect(Math.round(xx), Math.round(yy), 1, 1);
        }
      }
    } else {
      // git push --force: label the charge lane
      const lx = h.x + ux * 70, ly = h.y + uy * 70;
      drawText(ctx, "GIT PUSH --FORCE", lx, ly - 3, Math.floor(time * 8) % 2 ? "#ffd23f" : "#ffffff", { align: "center", scale: fx.textScale });
    }
    // charging flicker at origin
    drawGlow(ctx, h.x, h.y, red, 8 + p * 12, 0.4 + p * 0.6);
    stackTrace(ctx, h.x + ux * 60, h.y + uy * 60 - 14, names.get(h.id) ?? (charge ? "RACE CONDITION" : ""), left, red, time);
  } else if (!charge) {
    const since = time - (armedAt.get(h.id) ?? time);
    const fade = Math.max(0, 1 - Math.max(0, since - 0.55) / 0.2);
    const w = h.r + Math.sin(time * 60) * 1.2;
    let endS = 0;
    for (let s = 0; s < len; s += 1) {
      const x = h.x + ux * s, y = h.y + uy * s;
      if (x < 4 || y < 4 || x > ARENA_W - 4 || y > ARENA_H - 4) break;
      endS = s;
      for (let k = -Math.ceil(w); k <= Math.ceil(w); k++) {
        const ak = Math.abs(k);
        ctx.fillStyle = ak <= w * 0.35 ? "#ffffff" : ak <= w * 0.7 ? "#ffb0c0" : red;
        if (ak > w * fade) continue;
        ctx.fillRect(Math.round(x + px * k), Math.round(y + py * k), 1, 1);
      }
      if (s % 14 === 0) drawGlow(ctx, x, y, red, 14, 0.5 * fade);
    }
    // the beam is made of text: the attack name crawls along the white core
    const text = ((names.get(h.id) ?? "") || "RACE CONDITION").split("::")[0].trim().toUpperCase() + "  ";
    if (fade > 0.6 && w >= 3) {
      const off = (time * 140) % (text.length * 5);
      for (let s2 = 10 - off; s2 < endS - 4; s2 += 5) {
        const ci = Math.floor((s2 + off) / 5) % text.length;
        const ch = text[ci];
        if (ch === " " || s2 < 8) continue;
        const g = textSprite(ch, "#7a0a24", null);
        ctx.drawImage(g, Math.round(h.x + ux * s2) - 1, Math.round(h.y + uy * s2) - 2);
      }
    }
    // impact sparks where the beam hits the wall
    const ex = h.x + ux * endS, ey = h.y + uy * endS;
    drawGlow(ctx, ex, ey, "#ffffff", 10, fade);
    if (Math.random() < 0.6) emit({ kind: "spark", x: ex, y: ey, vx: -ux * 60 + (Math.random() - 0.5) * 120, vy: -uy * 60 + (Math.random() - 0.5) * 120, max: 0.3, color: red, color2: "#ffd23f" });
  }
}

function bolt(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, time: number, color: string, w: number) {
  const n = 8;
  const seed = Math.floor(time * 20);
  let px = x0, py = y0;
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const j = i === n ? 0 : (hash2(seed, i, Math.round(x0)) - 0.5) * 14;
    const x = x0 + dx * t + nx * j, y = y0 + dy * t + ny * j;
    ctx.fillStyle = color;
    line(ctx, px, py, x, y, w);
    px = x; py = y;
  }
  drawGlow(ctx, (x0 + x1) / 2, (y0 + y1) / 2, color === "#ffffff" ? "#9ff0ff" : color, 12, 0.4);
}

function cascade(ctx: CanvasRenderingContext2D, h: Hazard, p: number, time: number, red: string) {
  if (!h.armed) {
    ditherDisc(ctx, h.x, h.y, h.r, 0.1 + p * 0.3, "#3a0a4a");
    antsRing(ctx, h.x, h.y, h.r, time, "#9ff0ff", red);
    // crackle on the rim
    for (let k = 0; k < 3; k++) {
      const a = hash2(Math.floor(time * 15), k, h.id) * TAU;
      bolt(ctx, h.x + Math.cos(a) * h.r, h.y + Math.sin(a) * h.r, h.x + Math.cos(a + 0.5) * (h.r - 5), h.y + Math.sin(a + 0.5) * (h.r - 5), time, "#9ff0ff", 1);
    }
    // merge conflict markers split the zone
    const rows: [string, string][] = [["<<<<<<< HEAD", "#7dff9a"], ["=======", "#ffffff"], [">>>>>>> MAIN", "#7ab8ff"]];
    rows.forEach(([t, c], k) => {
      const yy = Math.round(h.y + (k - 1) * Math.max(6, h.r * 0.45)) - 2;
      ctx.globalAlpha = 0.5 + p * 0.5;
      drawText(ctx, t.slice(0, Math.max(3, Math.floor((h.r * 2 - 2) / 4))), h.x, yy, c, { align: "center" });
    });
    ctx.globalAlpha = 1;
    if (h.r > 24) drawText(ctx, "MERGE CONFLICT", h.x, h.y - h.r - 8, Math.floor(time * 6) % 2 ? "#9ff0ff" : "#ffffff", { align: "center", scale: fx.textScale });
  } else {
    const since = time - (armedAt.get(h.id) ?? time);
    // lightning strike from the sky
    if (since < 0.25) bolt(ctx, h.x + (hash2(h.id, 1) - 0.5) * 30, 0, h.x, h.y, time, "#ffffff", 2);
    ditherDisc(ctx, h.x, h.y, h.r, Math.max(0, 0.5 - since), "#9ff0ff");
    drawGlow(ctx, h.x, h.y, "#9ff0ff", h.r + 8, Math.max(0, 1 - since * 2));
  }
}

function firewall(ctx: CanvasRenderingContext2D, h: Hazard, time: number) {
  const fade = Math.min(1, (h.total - h.t) / 0.5, h.t / 0.2);
  const c = "#5ad8ff";
  drawGlow(ctx, h.x, h.y, "#2a8aff", h.r, 0.25 * fade);
  ctx.globalAlpha = fade;
  // hex lattice inside (sparse, dithered)
  const s = 6;
  for (let gy = -h.r; gy <= h.r; gy += s * 0.87) {
    const row = Math.round(gy / (s * 0.87));
    for (let gx = -h.r; gx <= h.r; gx += s * 1.5) {
      const cx = gx + (row % 2 ? s * 0.75 : 0), cy = gy;
      const d = Math.hypot(cx, cy);
      if (d > h.r - 3) continue;
      const shimmer = 0.5 + 0.5 * Math.sin(time * 4 - d * 0.2);
      if (shimmer < 0.55) continue;
      ctx.fillStyle = shimmer > 0.9 ? "#ffffff" : "#2a7ad8";
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        ctx.fillRect(Math.round(h.x + cx + Math.cos(a) * 2), Math.round(h.y + cy + Math.sin(a) * 2), 1, 1);
      }
    }
  }
  antsRing(ctx, h.x, h.y, h.r, time * 0.5, c, "#ffffff");
  antsRing(ctx, h.x, h.y, h.r - 1, -time * 0.5, "#2a7ad8", c);
  drawText(ctx, "FIREWALL", h.x, h.y - h.r - 7, c, { align: "center" });
  ctx.globalAlpha = 1;
}
