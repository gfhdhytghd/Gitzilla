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
  const layer = getArena(theme, seed >>> 0);
  ctx.drawImage(layer.canvas, 0, 0);
  drawAmbient(ctx, layer, time);
}
