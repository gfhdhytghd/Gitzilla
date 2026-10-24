// Glyph projectiles. Boss bullets: red plates with a glyph (always read as "danger").
// Player bullets: bright cool/yellow glyphs with trails (read as "ours").
import type { Bullet } from "../../../shared/types.ts";
import { disc, drawGlow, makeCanvas } from "./pix.ts";
import { textSprite } from "./font.ts";
import { emit, every, fx } from "./fx.ts";

const PLAYER: Record<string, { glyph: string; color: string; glow: string; scale?: number }> = {
  blaster: { glyph: "=>", color: "#fff27a", glow: "#ffd23f" },
  smg: { glyph: ";", color: "#9ffcff", glow: "#2ee6ff" },
  shotgun: { glyph: "*", color: "#ffd08a", glow: "#ff9a2a" },
  cannon: { glyph: "#", color: "#ffb36b", glow: "#ff6a1a", scale: 2 },
  staff: { glyph: "{}", color: "#f0c8ff", glow: "#b46bff" },
  laser: { glyph: "|", color: "#c8ffd0", glow: "#3dff7a" },
  blade: { glyph: ")", color: "#ffffff", glow: "#7ad8ff" },
};

const plateCache = new Map<string, HTMLCanvasElement>();

/** Boss bullet: dark outline, colored plate (a capsule for multi-char tokens), bright rim, white glyph. */
function bossPlate(glyph: string, r: number, fill: string, rim: string): HTMLCanvasElement {
  const key = glyph + "|" + r + fill + rim;
  let c = plateCache.get(key);
  if (c) return c;
  if (plateCache.size > 300) plateCache.clear();
  const tw = glyph.length * 4 - 1;
  const span = Math.max(0, tw - (r * 2 - 3)); // extra width for long tokens
  const h = r * 2 + 5, w = h + span;
  const [cv, g] = makeCanvas(w, h);
  const m = Math.floor(h / 2);
  const capsule = (rr: number, dy = 0) => { disc(g, m, m + dy, rr); disc(g, m + span, m + dy, rr); g.fillRect(m, Math.round(m + dy - rr), span + 1, Math.round(rr * 2) + 1); };
  g.fillStyle = "#12020a"; capsule(r + 1.5);
  g.fillStyle = rim; capsule(r + 0.5);
  g.fillStyle = fill; capsule(r - 0.5, 0.5);
  const t = textSprite(glyph, "#ffffff", null);
  g.drawImage(t, Math.floor(w / 2 - t.width / 2), m - 2);
  plateCache.set(key, (c = cv));
  return c;
}

const DEFAULT_BOSS_GLYPHS: Record<string, string[]> = { ring: ["0", "1"], spiral: ["*"], fan: ["!"], cascade: ["&"] };

function usable(tokens: string[] | undefined, max: number): string[] {
  return (tokens ?? []).map((t) => t.trim().toUpperCase()).filter((t) => t.length > 0 && t.length <= max && /^[ -~]+$/.test(t));
}

let bossTokensFor: { kit: unknown; short: string[] } = { kit: null, short: [] };
function bossGlyph(kind: string, id: number): string {
  const kit = fx.boss?.kit;
  if (kit && bossTokensFor.kit !== kit) bossTokensFor = { kit, short: usable(kit.code?.tokens, 3) };
  const toks = bossTokensFor.short;
  if (toks.length) return toks[(id * 7 + (kind === "spiral" ? 3 : kind === "fan" ? 5 : 0)) % toks.length];
  const d = DEFAULT_BOSS_GLYPHS[kind] ?? ["!"];
  return d[id % d.length];
}

/** Player projectile glyphs from the hero's real language tokens (claude-player may call this; trackPlayers does it too). */
export const playerGlyphs = new Map<string, string[]>();
export function registerPlayerGlyphs(playerId: string, tokens: string[]) {
  const t = usable(tokens, 3);
  if (t.length) playerGlyphs.set(playerId, t);
  else playerGlyphs.delete(playerId);
}

export function drawBullets(ctx: CanvasRenderingContext2D, bullets: Bullet[], time: number) {
  const kit = fx.boss?.kit;
  const danger = kit ? (kit.design ? kit.palette[2] : kit.palette[3]) ?? "#ff3a5c" : "#ff3a5c";
  // pass 1: additive glows (lights the floor around projectiles)
  for (const b of bullets) {
    if (b.owner === "boss") drawGlow(ctx, b.x, b.y, b.kind === "bug" ? "#9dff3a" : danger, 9, 0.55);
    else { const s = PLAYER[b.kind] ?? PLAYER.blaster; drawGlow(ctx, b.x, b.y, s.glow, b.kind === "cannon" ? 11 : 7, 0.5); }
  }
  // pass 2: trails + sprites
  for (const b of bullets) {
    const x = Math.round(b.x), y = Math.round(b.y);
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const ux = b.vx / sp, uy = b.vy / sp;
    if (b.owner === "boss") {
      if (b.kind === "bug") {
        const s = bossPlate("~", 2, "#3a7a12", "#b6ff3a");
        ctx.drawImage(s, x - (s.width >> 1), y - (s.height >> 1));
        continue;
      }
      // little trail
      ctx.fillStyle = danger;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(Math.round(x - ux * 5), Math.round(y - uy * 5), 1, 1);
      ctx.globalAlpha = 0.25;
      ctx.fillRect(Math.round(x - ux * 8), Math.round(y - uy * 8), 1, 1);
      ctx.globalAlpha = 1;
      const glyph = bossGlyph(b.kind, b.id);
      const r = Math.max(3, Math.round(b.r));
      const pulse = Math.floor(time * 10 + b.id) % 4 === 0;
      const s = bossPlate(glyph, r, pulse ? "#ff7a9a" : "#c0103a", pulse ? "#ffffff" : danger);
      ctx.drawImage(s, x - (s.width >> 1), y - (s.height >> 1));
    } else {
      const st = PLAYER[b.kind] ?? PLAYER.blaster;
      // trail
      ctx.fillStyle = st.glow;
      const tl = b.kind === "laser" ? 9 : b.kind === "cannon" ? 6 : 4;
      for (let k = 1; k <= tl; k++) {
        ctx.globalAlpha = 1 - k / (tl + 1);
        ctx.fillRect(Math.round(x - ux * k * 1.5), Math.round(y - uy * k * 1.5), 1, 1);
      }
      ctx.globalAlpha = 1;
      if (b.kind === "laser") {
        ctx.fillStyle = "#ffffff";
        for (let k = -3; k <= 3; k++) ctx.fillRect(Math.round(x + ux * k), Math.round(y + uy * k), 1, 1);
        continue;
      }
      if (b.kind === "blade") {
        // crescent slash perpendicular to travel
        const px = -uy, py = ux;
        for (let k = -6; k <= 6; k++) {
          const bend = (1 - (k * k) / 36) * 3;
          ctx.fillStyle = Math.abs(k) < 4 ? "#ffffff" : st.glow;
          ctx.fillRect(Math.round(x + px * k + ux * bend), Math.round(y + py * k + uy * bend), 1, 1);
          ctx.fillStyle = st.glow;
          ctx.fillRect(Math.round(x + px * k + ux * (bend - 1)), Math.round(y + py * k + uy * (bend - 1)), 1, 1);
        }
        continue;
      }
      const own = playerGlyphs.get(b.owner);
      const glyph = own && b.kind !== "cannon" ? own[b.id % own.length] : b.kind === "blaster" ? (b.vx < 0 ? "<=" : "=>") : st.glyph;
      const s = textSprite(glyph, st.color, "#0a0618", st.scale ?? 1);
      ctx.drawImage(s, x - (s.width >> 1), y - (s.height >> 1));
      if (b.kind === "cannon" && every("cs" + b.id, 0.05, time)) emit({ kind: "smoke", x: b.x - ux * 4, y: b.y - uy * 4, vx: -ux * 6, vy: -uy * 6 - 4, max: 0.5, size: 2, color: "#8a7a70", color2: "#3a3438" });
      if (b.kind === "staff" && every("ss" + b.id, 0.06, time)) emit({ kind: "px", x: b.x + (Math.random() - 0.5) * 4, y: b.y + (Math.random() - 0.5) * 4, vy: -8, max: 0.4, color: "#ffffff", color2: st.glow });
    }
  }
}
