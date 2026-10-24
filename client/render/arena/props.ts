// Round 2 props: destructible file blocks (obstacles), pickups, and "code review" perk pads.
import type { Obstacle, PerkOffer, Pickup, PlayerState } from "../../../shared/types.ts";
import { ARENA_W } from "../../../shared/types.ts";
import { disc, drawGlow, hash2, line, makeCanvas, TAU } from "./pix.ts";
import { drawText, drawTextRaw, textWidth } from "./font.ts";
import { addShake, burst, emit, fx } from "./fx.ts";

// ---------------- obstacles: files of the boss repo as cover ----------------

interface ObsTrack { hp: number; flash: number; x: number; y: number; w: number; h: number; label: string; maxHp: number }
const obsTracks = new Map<number, ObsTrack>();
const obsCache = new Map<string, HTMLCanvasElement>();

const EXT_COLORS: Record<string, string> = {
  ts: "#3178c6", tsx: "#3178c6", js: "#f1e05a", jsx: "#f1e05a", py: "#3572a5", rs: "#dea584", go: "#00add8", c: "#a8b9cc", h: "#a8b9cc",
  cc: "#f34b7d", cpp: "#f34b7d", java: "#b07219", kt: "#a97bff", rb: "#cc342d", php: "#4f5d95", cs: "#178600", lua: "#000080", md: "#83a598", json: "#cbcb41",
};

function baseName(label: string) {
  return (label.split("/").pop() || label).toUpperCase();
}

function extColor(label: string) {
  const ext = label.split(".").pop()?.toLowerCase() ?? "";
  return EXT_COLORS[ext] ?? "#8a94a8";
}

/** Static editor-window sprite for a file block. */
function obstacleSprite(o: Obstacle): HTMLCanvasElement {
  const w = Math.max(10, Math.round(o.w)), h = Math.max(10, Math.round(o.h));
  const key = o.label + "|" + w + "x" + h;
  let c = obsCache.get(key);
  if (c) return c;
  const depth = 4;
  const [cv, g] = makeCanvas(w + 2, h + depth + 2);
  const ox = 1, oy = 1;
  const accent = extColor(o.label);
  // outline + front face (depth)
  g.fillStyle = "#07040c"; g.fillRect(ox - 1, oy - 1, w + 2, h + depth + 2);
  g.fillStyle = "#1b1e28"; g.fillRect(ox, oy + h, w, depth);
  g.fillStyle = "#2a2e3c"; g.fillRect(ox, oy + h, w, 1);
  for (let x = ox + 2; x < ox + w - 1; x += 3) { g.fillStyle = "#12141c"; g.fillRect(x, oy + h + 2, 1, depth - 2); }
  // window body
  g.fillStyle = "#11131b"; g.fillRect(ox, oy, w, h);
  // title bar
  const tb = Math.min(7, Math.max(5, Math.round(h * 0.28)));
  g.fillStyle = "#2b3040"; g.fillRect(ox, oy, w, tb);
  g.fillStyle = "#3c4258"; g.fillRect(ox, oy, w, 1);
  g.fillStyle = accent; g.fillRect(ox, oy + tb - 1, w, 1);
  if (w >= 22) {
    g.fillStyle = "#ff5f56"; g.fillRect(ox + 2, oy + 2, 1, 1);
    g.fillStyle = "#ffbd2e"; g.fillRect(ox + 4, oy + 2, 1, 1);
    g.fillStyle = "#27c93f"; g.fillRect(ox + 6, oy + 2, 1, 1);
  }
  // filename tab
  const name = baseName(o.label);
  const room = Math.floor((w - (w >= 22 ? 10 : 3)) / 4);
  const shown = name.length > room ? name.slice(0, Math.max(1, room - 1)) + "~" : name;
  g.fillStyle = "#e8ecf8";
  if (tb >= 6) drawTextRaw(g, shown, ox + (w >= 22 ? 9 : 2), oy + 1);
  // code lines with a gutter
  const R = (k: number) => hash2(k, w * 31 + h, name.length);
  let y = oy + tb + 1, k = 0;
  while (y < oy + h - 1) {
    g.fillStyle = "#2c3142"; g.fillRect(ox + 1, y, 2, 1); // line number
    const ind = Math.floor(R(k) * 3) * 2;
    const len = Math.max(2, Math.floor(R(k + 50) * (w - 8 - ind)));
    const cols = ["#c792ea", "#82aaff", "#c3e88d", "#f78c6c", "#89ddff", accent];
    let x = ox + 5 + ind, rem = len;
    while (rem > 0) {
      const seg = Math.min(rem, 2 + Math.floor(R(k * 7 + rem) * 5));
      g.fillStyle = cols[Math.floor(R(k * 13 + rem) * cols.length)];
      g.fillRect(x, y, seg, 1);
      x += seg + 1; rem -= seg + 1;
    }
    y += 2; k++;
  }
  obsCache.set(key, cv);
  return cv;
}

export function drawObstacles(ctx: CanvasRenderingContext2D, obstacles: Obstacle[], time: number) {
  const seen = new Set<number>();
  for (const o of obstacles) {
    seen.add(o.id);
    let tr = obsTracks.get(o.id);
    if (!tr) obsTracks.set(o.id, (tr = { hp: o.hp, flash: -1, x: o.x, y: o.y, w: o.w, h: o.h, label: o.label, maxHp: o.maxHp }));
    if (o.hp < tr.hp) {
      tr.flash = time;
      burst(o.x + (Math.random() - 0.5) * o.w * 0.6, o.y + (Math.random() - 0.5) * o.h * 0.6, 3, { kind: "px", speed: 50, max: 0.35, colors: ["#c3c8d8", extColor(o.label)], grav: 120 });
    }
    tr.hp = o.hp; tr.x = o.x; tr.y = o.y;
    const s = obstacleSprite(o);
    const x0 = Math.round(o.x - o.w / 2) - 1, y0 = Math.round(o.y - o.h / 2) - 1;
    // shadow
    ctx.globalAlpha = 0.35; ctx.fillStyle = "#000"; ctx.fillRect(x0 + 2, y0 + s.height - 1, s.width - 1, 3); ctx.globalAlpha = 1;
    const shake = time - tr.flash < 0.1 ? Math.round((Math.random() - 0.5) * 2) : 0;
    ctx.drawImage(s, x0 + shake, y0);
    // screen glow
    drawGlow(ctx, o.x, o.y, extColor(o.label), Math.max(8, o.w * 0.45), 0.12);
    // filename tag under the block when the title bar is too narrow for it
    const nm = baseName(o.label);
    // small tag under the block (5px cap height, never upscaled: heroes and bullets must out-read it)
    if (textWidth(nm) > o.w - (o.w >= 22 ? 10 : 3)) {
      ctx.globalAlpha = 0.8;
      drawText(ctx, nm.length > 14 ? nm.slice(0, 13) + "~" : nm, Math.round(o.x), y0 + s.height + 1, extColor(o.label), { align: "center" });
      ctx.globalAlpha = 1;
    }
    // cracks grow as hp drops
    const dmg = 1 - Math.max(0, o.hp) / Math.max(1, o.maxHp);
    const cracks = Math.floor(dmg * 6);
    for (let k = 0; k < cracks; k++) {
      let cx = x0 + 1 + hash2(o.id, k) * o.w, cy = y0 + 1 + hash2(o.id, k + 20) * o.h;
      let a = hash2(o.id, k + 40) * TAU;
      for (let st = 0; st < 5; st++) {
        const nx = cx + Math.cos(a) * 2.5, ny = cy + Math.sin(a) * 2.5;
        if (nx < x0 + 1 || nx > x0 + o.w || ny < y0 + 1 || ny > y0 + o.h) break;
        ctx.fillStyle = "#e8ecf8"; line(ctx, cx + shake, cy + 1, nx + shake, ny + 1);
        ctx.fillStyle = "#000000"; line(ctx, cx + shake, cy, nx + shake, ny);
        cx = nx; cy = ny; a += (hash2(o.id, k * 9 + st) - 0.5) * 1.6;
      }
    }
    if (dmg > 0.6 && Math.floor(time * 6 + o.id) % 5 === 0) { ctx.fillStyle = "rgba(255,40,80,0.25)"; ctx.fillRect(x0 + 1 + shake, y0 + 1, Math.round(o.w), Math.round(o.h)); }
    if (time - tr.flash < 0.06) { ctx.globalAlpha = 0.6; ctx.fillStyle = "#ffffff"; ctx.fillRect(x0 + shake, y0, s.width, s.height); ctx.globalAlpha = 1; }
  }
  for (const [id, tr] of obsTracks) {
    if (seen.has(id)) continue;
    shatterObstacle(tr.x, tr.y, tr.w, tr.h, tr.label);
    obsTracks.delete(id);
  }
}

function shatterObstacle(x: number, y: number, w: number, h: number, label: string) {
  const c = extColor(label);
  addShake(4);
  burst(x, y, 18, { kind: "shard", speed: 110, max: 0.9, text: "{}();=<>/#*01", spin: 16, colors: ["#e8ecf8", c, "#c792ea"], color2: "#3a3f50", grav: 200, drag: 0.8 });
  burst(x, y, 8, { kind: "smoke", speed: 30, max: 0.8, size: 3, color: "#5a5f70", color2: "#2a2d38", drag: 2 });
  for (let k = 0; k < 6; k++) emit({ kind: "px", x: x + (Math.random() - 0.5) * w, y: y + (Math.random() - 0.5) * h, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 40, grav: 220, max: 0.7, size: 2, color: "#2b3040", color2: "#11131b" });
  emit({ kind: "glyph", x, y: y - h / 2 - 6, vy: -18, max: 1.1, text: "RM " + baseName(label), color: "#ff7a8a" });
}

// ---------------- pickups ----------------

interface PickTrack { x: number; y: number; vx: number; vy: number; kind: Pickup["kind"]; born: number }
const pickTracks = new Map<number, PickTrack>();
const pickSprites = new Map<string, HTMLCanvasElement>();

// Pickups are code items: heart = "+1 commit" green diff chip, energy = coffee (RAM for devs), armor = "tests passed" shield.
const PICK_ART: Record<Pickup["kind"], { rows: string[]; pal: Record<string, string>; glow: string }> = {
  heart: {
    rows: [".ooooooo.", "oGGGwGGGo", "oGgGwGgGo", "owwwwwwwo", "oGgGwGgGo", "oGGGwGGGo", ".ooooooo."],
    pal: { o: "#062a10", G: "#2ea043", g: "#3fb950", w: "#e6ffec" }, glow: "#3fb950",
  },
  energy: {
    rows: ["ooooooo..", "obbbbbooo", "owwwwwo.o", "owcccwo.o", "owwwwwooo", "owwwwwo..", ".ooooo..."],
    pal: { o: "#1a0e06", b: "#6a3a1a", w: "#f2ede4", c: "#2ee6ff" }, glow: "#2ee6ff",
  },
  armor: {
    rows: [".ooooooo.", "osssssWso", "osssssgso", "ossssgsso", "osgsgssso", ".osggsso.", "..ossso..", "...ooo..."],
    pal: { o: "#10141c", s: "#9aa6bc", W: "#e8eef8", g: "#3fb950" }, glow: "#9ab8ff",
  },
};

function pickupSprite(kind: Pickup["kind"]): HTMLCanvasElement {
  let c = pickSprites.get(kind);
  if (c) return c;
  const art = PICK_ART[kind];
  const [cv, g] = makeCanvas(art.rows[0].length, art.rows.length);
  art.rows.forEach((row, y) => row.split("").forEach((ch, x) => { if (art.pal[ch]) { g.fillStyle = art.pal[ch]; g.fillRect(x, y, 1, 1); } }));
  pickSprites.set(kind, (c = cv));
  return c;
}

export function drawPickups(ctx: CanvasRenderingContext2D, pickups: Pickup[], time: number) {
  const seen = new Set<number>();
  for (const p of pickups) {
    seen.add(p.id);
    let tr = pickTracks.get(p.id);
    if (!tr) {
      pickTracks.set(p.id, (tr = { x: p.x, y: p.y, vx: 0, vy: 0, kind: p.kind, born: time }));
      emit({ kind: "ring", x: p.x, y: p.y, size: 10, max: 0.3, color: PICK_ART[p.kind].glow });
    }
    tr.vx = p.x - tr.x; tr.vy = p.y - tr.y;
    tr.x = p.x; tr.y = p.y;
    const art = PICK_ART[p.kind];
    const age = time - tr.born;
    const pop = Math.min(1, age / 0.2);
    const bob = Math.round(Math.sin(time * 4 + p.id) * 1.5);
    const x = Math.round(p.x), y = Math.round(p.y);
    // shadow + glow
    ctx.globalAlpha = 0.35; ctx.fillStyle = "#000"; ctx.fillRect(x - 3, y + 4, 7, 1); ctx.globalAlpha = 1;
    drawGlow(ctx, x, y + bob - 2, art.glow, 8, 0.45 + 0.2 * Math.sin(time * 6 + p.id));
    // magnet streak toward the collector
    const sp = Math.hypot(tr.vx, tr.vy);
    if (sp > 0.25) {
      ctx.fillStyle = art.glow;
      for (let k = 1; k <= 6; k++) {
        ctx.globalAlpha = 1 - k / 7;
        ctx.fillRect(Math.round(x - (tr.vx / sp) * k * 2), Math.round(y - 2 - (tr.vy / sp) * k * 2), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    const s = pickupSprite(p.kind);
    const sx = x - (s.width >> 1), sy = y - 6 + bob - (pop < 1 ? Math.round((1 - pop) * 6) : 0);
    // blink before despawn (sim removes it at 15 s)
    if (!(age > 12 && Math.floor(time * 10) % 2)) ctx.drawImage(s, sx, sy);
    // coffee steam / sparkle
    if (p.kind === "energy") {
      ctx.fillStyle = "#e8e8f0";
      for (let k = 0; k < 2; k++) { const f = (time * 1.5 + k * 0.5 + p.id * 0.3) % 1; ctx.globalAlpha = 1 - f; ctx.fillRect(sx + 2 + k * 2 + Math.round(Math.sin(f * 6 + k) * 1), sy - 1 - Math.round(f * 5), 1, 1); }
      ctx.globalAlpha = 1;
    } else if (Math.floor(time * 3 + p.id) % 4 === 0) { ctx.fillStyle = "#ffffff"; ctx.fillRect(sx + s.width - 2, sy, 1, 1); }
  }
  for (const [id, tr] of pickTracks) {
    if (seen.has(id)) continue;
    burst(tr.x, tr.y - 2, 8, { kind: "px", speed: 40, max: 0.4, colors: [PICK_ART[tr.kind].glow, "#ffffff"], glow: true });
    pickTracks.delete(id);
  }
}

// ---------------- perk pads: "code review" ----------------

interface PadState { enter: Map<string, number>; }
const padState = new Map<string, PadState>();
let offerKey = "";
let offerSeenAt = 0;

const PLAYER_COLS = ["#5ad8ff", "#ffd23f", "#7dff9a", "#ff7ad8", "#ff9a3a", "#b48aff", "#ffffff", "#ff5a5a"];

let lastOffer: { offer: PerkOffer; players: PlayerState[]; best: Map<string, number>; at: number } | null = null;

export function drawPerkPads(ctx: CanvasRenderingContext2D, offer: PerkOffer | null, players: PlayerState[], time: number) {
  if (!offer || !offer.pads.length) { offerKey = ""; lastOffer = null; return; }
  const key = offer.pads.map((p) => p.id).join("|");
  if (key !== offerKey) { offerKey = key; offerSeenAt = time; padState.clear(); }
  const off = Math.floor(time * 20);
  const bestBy = new Map<string, number>();
  offer.pads.forEach((pad, i) => {
    let st = padState.get(pad.id);
    if (!st) padState.set(pad.id, (st = { enter: new Map() }));
    const pickers = players.filter((p) => offer.picked[p.id] === pad.id);
    let best = 0;
    for (const p of players) {
      if (!p.alive || offer.picked[p.id]) { st.enter.delete(p.id); continue; }
      const inside = Math.hypot(p.x - pad.x, p.y - pad.y) < pad.r;
      if (inside) {
        if (!st.enter.has(p.id)) st.enter.set(p.id, time);
        best = Math.max(best, Math.min(1, (time - st.enter.get(p.id)!) / 1));
      } else st.enter.delete(p.id);
    }
    bestBy.set(pad.id, best);
    const x = Math.round(pad.x), y = Math.round(pad.y);
    const glow = pickers.length ? "#3dff9a" : "#5ad8ff";
    drawGlow(ctx, x, y, glow, pad.r + 8, 0.35 + 0.15 * Math.sin(time * 3 + i));
    const n = Math.max(24, Math.round(pad.r * TAU));
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (k / n) * TAU;
      const filled = k / n < best || pickers.length > 0;
      ctx.fillStyle = filled ? "#3dff9a" : ((k + off) >> 2) % 2 ? "#5ad8ff" : "#16384a";
      ctx.fillRect(Math.round(x + Math.cos(a) * pad.r), Math.round(y + Math.sin(a) * pad.r * 0.7), 1, 1);
      if (filled) ctx.fillRect(Math.round(x + Math.cos(a) * (pad.r - 1)), Math.round(y + Math.sin(a) * (pad.r - 1) * 0.7), 1, 1);
    }
    if (pickers.length && Math.floor(time * 2) % 2) drawText(ctx, "LGTM", x, y - 3, "#3dff9a", { align: "center" });
    if (best > 0 && best < 1 && Math.random() < 0.4) emit({ kind: "px", x: x + (Math.random() - 0.5) * pad.r * 2, y: y + (Math.random() - 0.5) * pad.r, vy: -30, max: 0.5, color: "#3dff9a", color2: "#ffffff" });
  });
  lastOffer = { offer, players, best: bestBy, at: time };
}

/** Overlay part of the code review (header + PR cards), drawn on top of the boss/heroes by drawEvents. */
export function drawPerkCards(ctx: CanvasRenderingContext2D, time: number) {
  if (!lastOffer || time - lastOffer.at > 0.5) return;
  const { offer, players, best: bestBy } = lastOffer;
  const key = offerKey;
  const left = Math.max(0, 5 - (time - offerSeenAt));
  const pulse = 0.5 + 0.5 * Math.sin(time * 4);
  const off = Math.floor(time * 20);
  ctx.fillStyle = "#3dff9a";
  const v = fx.view;
  const fx0 = Math.max(12, v.x + 4), fx1 = Math.min(ARENA_W - 12, v.x + v.w - 4);
  const fy0 = Math.max(26, v.y + 4), fy1 = Math.min(278, v.y + v.h - 4);
  for (let x = fx0; x < fx1; x++) if (((x + off) >> 2) % 2 === 0) { ctx.fillRect(x, fy0, 1, 1); ctx.fillRect(x, fy1, 1, 1); }
  // the full CODE REVIEW banner + descriptions live in claude-ui's HUD; keep only a tiny in-world tag
  drawText(ctx, "CODE REVIEW T-" + left.toFixed(1) + "S", v.x + v.w / 2, fy0 + 3, pulse > 0.5 ? "#ffffff" : "#3dff9a", { align: "center", scale: fx.textScale });
  offer.pads.forEach((pad, i) => {
    const pickers = players.filter((p) => offer.picked[p.id] === pad.id);
    const best = bestBy.get(pad.id) ?? 0;
    const x = Math.round(pad.x), y = Math.round(pad.y);
    const glow = pickers.length ? "#3dff9a" : "#5ad8ff";
    const name = pad.name.toUpperCase();
    const cw = Math.max(textWidth(name) + 8, 40);
    const ch = 16;
    const bob = Math.round(Math.sin(time * 2 + i * 2) * 1.5);
    const cx = Math.max(Math.max(12, v.x + 2), Math.min(Math.min(ARENA_W - 12, v.x + v.w - 2) - cw, Math.round(x - cw / 2))), cy = Math.max(fy0 + 12, y - pad.r - ch - 2 + bob);
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "#07040c"; ctx.fillRect(cx - 1, cy - 1, cw + 2, ch + 2);
    ctx.fillStyle = "#0d1117"; ctx.fillRect(cx, cy, cw, ch);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#161b22"; ctx.fillRect(cx, cy, cw, 7);
    ctx.fillStyle = glow; ctx.fillRect(cx, cy, 2, ch);
    // progress bar along the bottom while someone is standing on it
    if (best > 0 && !pickers.length) { ctx.fillStyle = "#3dff9a"; ctx.fillRect(cx, cy + ch - 1, Math.round(cw * best), 1); }
    drawText(ctx, "#" + (100 + ((i * 37 + key.length * 7) % 899)), cx + 4, cy + 1, "#8b949e", { outline: null });
    const tag = pickers.length ? "MERGED" : "OPEN";
    const tagW = textWidth(tag) + 4;
    ctx.fillStyle = pickers.length ? "#8957e5" : "#238636"; ctx.fillRect(cx + cw - tagW - 2, cy + 1, tagW, 6);
    drawText(ctx, tag, cx + cw - tagW, cy + 1, "#ffffff", { outline: null });
    drawText(ctx, name, cx + 4, cy + 9, "#e6edf3", { outline: null });
    ctx.fillStyle = "#3fb950"; ctx.fillRect(cx + cw - 12, cy + ch - 3, 4, 1);
    ctx.fillStyle = "#f85149"; ctx.fillRect(cx + cw - 7, cy + ch - 3, 3, 1);
    pickers.forEach((p, k) => {
      const idx = Math.max(0, players.findIndex((q) => q.id === p.id));
      drawText(ctx, "@" + p.name.slice(0, 8).toUpperCase(), x, y + pad.r * 0.7 + 3 + k * 6, PLAYER_COLS[idx % PLAYER_COLS.length], { align: "center" });
    });
  });
}
