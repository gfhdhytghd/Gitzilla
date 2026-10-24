// Arena renderer public API (see docs/BRIEF.md "Renderer interfaces"). All coords are logical arena px.
import type { ArenaTheme } from "../../../shared/types.ts";
import { fx } from "./fx.ts";
import { drawAmbient, getArena } from "./themes.ts";

export { drawBullets } from "./bullets.ts";
export { drawHazards } from "./hazards.ts";
export { drawMinions } from "./minions.ts";
export { drawEvents, trackPlayers, getFxCues } from "./events.ts";
export { drawPostFx } from "./postfx.ts";
export { drawObstacles, drawPickups, drawPerkPads } from "./props.ts";
export { registerPlayerGlyphs } from "./bullets.ts";
export { drawText, textWidth } from "./font.ts";

export function drawArenaBackground(ctx: CanvasRenderingContext2D, theme: ArenaTheme, seed: number, time: number): void {
  fx.now = time;
  // the floor prints the boss repo's real source once the boss (and its code) is known
  const kit = fx.boss?.kit;
  const code = kit && (kit.seed >>> 0) === (seed >>> 0) && kit.code ? [...(kit.code.heartLines ?? []), ...(kit.code.snippets ?? [])].filter((l) => l.trim()) : undefined;
  const layer = getArena(theme, seed >>> 0, code && code.length ? code : undefined);
  ctx.drawImage(layer.canvas, 0, 0);
  drawAmbient(ctx, layer, time);
}
