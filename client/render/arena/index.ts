// Arena renderer public API (see docs/BRIEF.md "Renderer interfaces"). All coords are logical arena px.
import type { ArenaTheme } from "../../../shared/types.ts";
import { fx, fxClock } from "./fx.ts";
import { drawAmbient, getArena, type Theme } from "./themes.ts";

export { drawBullets } from "./bullets.ts";
export { drawHazards } from "./hazards.ts";
export { drawMinions } from "./minions.ts";
export { drawEvents, trackPlayers, getFxCues } from "./events.ts";
export { drawPostFx, glitchAmount, caAmount } from "./postfx.ts";
export { drawObstacles, drawPickups, drawPerkPads } from "./props.ts";
export { registerPlayerGlyphs } from "./bullets.ts";
export { drawText, textWidth } from "./font.ts";
export { playerColor, resetFx, fxMatchTime } from "./fx.ts";
export { drawRoyaleZone } from "./royale.ts";

/**
 * variant "classroom" = edu PvP (no boss): a chalkboard classroom floor, and bullets switch to per-player colors.
 * Omit it for the battle arena of the boss theme.
 */
export function drawArenaBackground(ctx: CanvasRenderingContext2D, theme: ArenaTheme, seed: number, time: number, variant?: "classroom" | "royale", size?: { w: number; h: number }): void {
  fxClock(time);
  fx.pvp = variant === "classroom" || variant === "royale"; // per-player bullet colors, no boss FX
  // a boss that hasn't been drawn recently is gone (edu has none): don't let stale state drive FX
  if (fx.boss && (fx.pvp || time - fx.bossSeenAt > 0.5 || time < fx.bossSeenAt)) fx.boss = null;
  // the floor prints the boss repo's real source once the boss (and its code) is known
  const kit = fx.boss?.kit;
  const code = kit && (kit.seed >>> 0) === (seed >>> 0) && kit.code ? [...(kit.code.heartLines ?? []), ...(kit.code.snippets ?? [])].filter((l) => l.trim()) : undefined;
  const t: Theme = variant === "classroom" ? "classroom" : theme;
  // size: the arena's logical size when it isn't battle's 480x288 (PvP royale/classroom: sim pvpArenaSize)
  const layer = getArena(t, seed >>> 0, !fx.pvp && code && code.length ? code : undefined, size);
  ctx.drawImage(layer.canvas, 0, 0);
  drawAmbient(ctx, layer, time);
}
