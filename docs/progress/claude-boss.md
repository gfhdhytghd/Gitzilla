DONE (round 2) — claude-boss

## Round 2: real code painted onto the monsters
- **Heart**: when `kit.code.heartLines` is present, the heart core scrolls the real lines (they climb upward, each row a slow marquee clipped to the core; the middle row is white). The core gets slightly bigger to fit them. In phase 3 the exposed heart also shows the line it is "executing" as `> line` above itself.
- **Carved code**: limb lobes carry their real `limbSymbols`, and the core carries up to 3 `snippets`. Text is placed by searching the body mask, so it never spills off the silhouette or covers the heart, eyes or mouth. It's carved in the material's ramp (dark groove, lit lower lip). Empty or missing code falls back to generic tokens. Sim currently sends empty arrays until DNA lands, and that case is handled.
- **Bug minions**: each is labeled with a real todo (`kit.code.todos[id % n]`), shown at spawn and as a short tag (tags hidden when more than 8 bugs are on screen). Each kind looks different: TODO = green beetle, FIXME = red ladybug, HACK = purple roach with long feelers, XXX = black mite.
- **Boss bullets**: glyphs come from `kit.code.tokens` (≤3 chars) on red capsule plates.
- **Player bullets**: glyphs come from each hero's `kit.code.tokens`. `trackPlayers` registers them automatically and re-registers when the token list changes. claude-player can also call `registerPlayerGlyphs(playerId, tokens)`. Cannon, laser and blade keep their own shapes.
- **New exports** in `client/render/arena/index.ts`:
  - `drawObstacles(ctx, obstacles, t)`: file blocks drawn as mini editor windows (title bar dots, a basename tab tinted by file extension, fake code lines, a 3D front face). The name goes in a tag below when the block is narrow. Cracks grow as hp drops, hits flash and chip, and a broken block shatters into glyph debris with an `RM <FILE>` popup.
  - `drawPickups(ctx, pickups, t)`: heart, energy and armor pixel sprites with bob, glow, sparkle, a spawn ring, a magnet streak while moving, a blink when old, and a burst when collected.
  - `drawPerkPads(ctx, offer, players, t)`: floor rings that fill as a player stands on a pad (tracked client-side, 1 s), plus `LGTM` once picked. The compact PR cards (#, OPEN/MERGED, perk name, `@picker`) and a small `CODE REVIEW T-x.xS` tag draw in the overlay through drawEvents, so they stay above the boss. The big banner and descriptions are claude-ui's HUD.
- **New events**: `pickup` → `+1 HP` / `+NRG` / `+ARMOR`; `perk` → `MERGED <perk>` with a ring; `obstacleBroken` → a small flash (the shatter is in drawObstacles).
- **Fixes requested by teammates**: the downed glyph is now a short `SEGFAULT` that rises off the hero and fades within 0.6 s. The red danger vignette is toned down.
- **Gallery**: the gallery fakes `kit.code` when DNA is missing, and staged scenes include obstacles, pickups and `&perks=1`.

(round 1) DONE — claude-boss (client/render/boss/ + client/render/arena/)

## Summary
Every renderer in my BRIEF interface is in and verified in headless Chromium screenshots: drawBoss, bossPortrait, drawArenaBackground, drawBullets, drawHazards, drawMinions, drawEvents and drawPostFx. A 4-player live fight in a single 1440×864 canvas holds 60 fps. `npm run typecheck` is clean and `npm test` passes in full (176 passed, 2 skipped). `client/render/boss/layout.test.ts` checks that my layout matches the sim's `bossRegions` and that sim anchors drive limb positions for all 9 body archetypes. No new dependencies.

### Boss (client/render/boss/)
- `layout.ts` is a pure `bossLayout(kit, anchors?)` with no DOM.
  - Body archetype comes from `kit.design.body`, otherwise from the seed: blob, serpent, spider, hydra, golem, swarm, eye, tree or machine.
  - Mouth (maw, brackets, beak, zipper, none), growths and eye count come from the design, otherwise from the seed.
  - Limb art is anchored to `BossState.regions`. Without regions (portraits, gallery) it falls back to the sim formula.
- `art.ts` builds the palette ramps.
  - Design palette = [body dark, body light, glow → heart/danger, accent → veins/iris, eye → bone/sclera].
  - Each material has its own ramp: flesh, scales, chitin, stone, metal, bark, foliage, sclera.
- `sprite.ts` builds the body sprite with per-pixel SDF smooth-union shading and ordered dithering.
  - Each material has its own texture (scales, faceted stone, metal panels, bark grain, leaf clumps, bloodshot sclera).
  - Static details: an appendage per attack kind (spines, coil, claw, lens-cannon, fist, horns, hive, antenna), plus veins, carved code, scars and knot loops on weak points.
  - Static growths: spikes, horns, crystals, moss, servers, pipes.
  - Broken limbs become charred stumps with exposed wires.
  - Sprites are cached per (layout, broken mask, tint, breath frame).
- `index.ts`: drawBoss, bossPortrait, plus the optional bossLookAt.
  - Moving parts: tentacles, necks, roots, nerves, cables, spider and piston legs, flapping wings, rotating gears, blinking server LEDs, pipe steam, swarm orbiters.
  - Eyes blink independently and track the target. Mouths are animated.
  - Heart styles: `{ ♥ }` braces with code scrolling inside, a giant iris (eye body), or a reactor (machine body).
  - Casting: charge-up glow with converging particles and an aim thread.
  - Hits flash the whole body (heavy hits) or just the struck limb.
  - Broken limbs throw sparks, smoke and error glyphs.
  - Phase 2: red tint and steam. Phase 3: heart exposed, glitch slices, RGB split. On victory the boss glitches and dies.
- `gallery.html` and `gallery.ts` run the real sim with bots.
  - Modes: `?mode=live|grid|portraits|bodies|fx`.
  - Params: `&boss=<slug|idx> &theme= &fast=1 &design=0 &body= &phase=`.

### Arena (client/render/arena/)
- `themes.ts`: 6 themes (terminal, kernel, web, notebook, enterprise, legacy).
  - The static layer is generated once per (theme, seed): floor tiles, walls, props, engraved code, a git-graph and circuit traces.
  - Ambient animation: LEDs, data pulses along traces, matrix rain, flickering monitors, neon signs, torches, fireflies, fan, glowing grates, a self-drawing plot, fluorescent light flicker.
- `bullets.ts`:
  - Boss bullets: red plates with a glyph (0/1, `*`, `!`, `~`).
  - Player bullets: glyphs per weapon (`=>`, `;`, `*`, `#`, `{}`, a beam, a crescent slash) with trails.
  - Both get additive glows.
- `hazards.ts`: slam (dithered zone, marching ants, countdown ring, crater), laser (lane, chevrons, then a jittering beam with wall sparks), the charge lane, cascade (crackling ring, chain lightning, sky strike), and the firewall hex bubble. Labels are compact: attack name plus seconds left.
- `minions.ts`: beetle "bugs" with walking legs. They spawn with a `NPM I` puff and die in a `FIXED` splat.
- `events.ts`:
  - Damage numbers roll up into one total per limb, drift away from the boss face, and are capped at 7 at once.
  - CRIT labels show only for heavy hits and are rate-limited. The combo tag is small (the big combo lives in the HUD).
  - Event handling: `-N ERR` with a glitch on player hits; glyph shrapnel, slow-mo and banner on limb break; downed/revived/skill effects; typed phase banners; a chain-explosion segfault on victory.
  - The `hit` event's crit, direction, impact and hitStop fields drive the effects.
- `postfx.ts` works at device resolution, reading the transform to find the 480×288 rect.
  - Scanlines and a dithered vignette (lighter on bright themes), chromatic aberration on shake, glitch slices on phase change or limb break, a red danger vignette and a white flash.
  - End screens: a BSOD reading "SEGMENTATION FAULT (CORE DUMPED)" on victory and a KERNEL PANIC on defeat.
- Shared modules: `fx.ts` (shared FX state and a pooled particle system), `font.ts` (3×5 pixel font) and `pix.ts` (helpers and glow sprites).

## Conventions (for claude-ui / codex-sim)
- The `time` argument is in seconds. claude-ui's `visTime` already matches.
- drawEvents: pass each snapshot's events. Duplicates are dropped by event object identity. Call it every frame; it also steps and draws the particles and banners.
- Optional exports (claude-ui already wires them):
  - `client/render/arena/index.ts`: `trackPlayers(players)` and `getFxCues()` → `{ shake, hitStop, slowmo, flash }`.
  - `client/render/boss/index.ts`: `bossLookAt(x, y)`, `bossLayout`, `bossHitRegions`.
- Full FATAL telegraph banner = claude-ui's HUD. My renderer only draws a compact label at the hazard.
- Dev screenshots: run a throwaway `npx vite --port 5199` and open `/client/render/boss/gallery.html`. Never use 5173 (that's the live server).

## Contract requests
- Hazard has no telegraph duration, so the renderer estimates it (slam/cascade active window 0.45 s, laser 0.75 s). An optional `Hazard.telegraph?: number` would make the countdowns exact.
