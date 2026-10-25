# 2.5D view: a tilted floor, standing heroes, shots in the air. The game logic stays 2D.

User request: "go 2.5D: a flat map, standing avatars, 3D bullets flying at a height. Fight logic stays fully 2D."

## Rules
- **Presentation only.** No changes to sim/, server/ or shared/. The sim, snapshots, hitboxes and balance are untouched. Every 2.5D position is a projection of the existing 2D world x/y.
- **Same art.** Reuse the existing renderers (`R.drawArenaBackground`, `drawHazards`, `drawObstacles`, `drawPickups`, `drawPerkPads`, `X.drawRoyaleZone`, `drawPlayer`, `drawBoss`, `drawMinions`, `drawBullets` style, `drawEvents`). Keep it crisp pixel art (`imageSmoothingEnabled = false`). No new 3D models.
- **Safari first.** It must hold 60 fps on desktop Safari/WebKit and stay smooth on iPhone 15. No WebXR.

## Look
- **Floor.** The ground layers (background, hazards, obstacles footprint, pads, pickups, GC zone, telegraph areas) are drawn into an offscreen world canvas as today. That canvas is then shown as a tilted floor in perspective: near rows larger, far rows smaller, with a camera pitch of about 35–50°.
  - Suggested technique: SNES "Mode 7" scanline projection in Canvas2D, slicing each screen row from the world canvas. It's cheap, pixel-perfect and on-brand.
  - three.js with a textured plane is acceptable if it's clearly better. Justify it if used.
- **Standing sprites.** Heroes, the boss, minions and pickups stand up as billboards. Each one is anchored at its feet on its projected world x/y, scaled by depth and drawn back-to-front (y-sorted). Each gets a soft pixel shadow ellipse on the floor.
  - The boss stands at the back as a towering kaiju.
  - Limb regions and weak points must still line up with where hits land. Anchor them carefully.
- **Shots at height.** Bullets fly at chest height (about 10–14 logical px above the floor), each with a small shadow on the ground under its true 2D position, so players can read where it will hit. Boss attacks get the same treatment.
  - Lobbed or AoE attacks may arc (height = parabola over their lifetime) if their data allows it. The ground telegraph always stays on the floor.
- **FX and events.** Damage numbers, taunts and hit sparks are drawn at the projected position, at sprite height. Screen shake and postfx are applied to the final composite.
- **Camera.**
  - Desktop/projector: the whole arena fits on screen.
  - Phone portrait: follows the hero, as today (reuse the existing View/camera smoothing).
  - Royale on 8-player maps must still fit.

## Input
- Mouse/touch aim goes through `screenToWorld(x, y)`, the inverse of the floor projection, so a click hits the floor point under the cursor.
- Tilt/joystick directions stay world-aligned. The camera looks "north", so screen-up = world-up.

## Ownership
- **claude-boss (lead):** new module `client/render/stage25d/`. It exports:
  ```ts
  createStage25d(opts?) => {
    render(ctx, state: MatchState, time, view?: View, extras?): void;
    screenToWorld(sx, sy): { x, y };
    worldToScreen(x, y, z?): { x, y, scale };
    destroy(): void;
  }
  ```
  - It may need small, backward-compatible additions to the arena/boss/player renderers, e.g. "draw one sprite at the origin" helpers.
  - Gallery/debug page: `client/render/stage25d/gallery.html` with a mock match.
- **claude-ui:**
  - Mount the stage in `client/app/game.ts` behind a view toggle: `?view=25d` and a settings switch, remembered in localStorage.
  - Route aim through `screenToWorld`.
  - The HUD and minimap stay 2D overlays.
  - Default: off until the coordinator reviews it; then it may become the default for the projector/desktop.
- Verify everything in WebKit: desktop 1440, projector 1920, iPhone 15 portrait. Cover a raid with a boss, a royale with 8 bots and the zone closing, and classroom mode is unaffected. Report fps (rAF timing) for each.
