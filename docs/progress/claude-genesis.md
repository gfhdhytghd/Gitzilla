DONE (genesis) + DONE (edu pvp)

Summary: `client/genesis/` ships `playGenesis(host, opts)`, a canvas cinematic that shows a repo turning into its hero or boss in six stages. Every stage is drawn from real data.
- Live mode: analyzer progress streams real paths.
- Replay mode: about 8 s, skippable, replayable.
- Condensed mode: about 4 s, for the pre-fight intro.
- Edu mode: a 2x hi-res hero, narrated pauses on each stage, and a report card in place of the equal budget.

It works with the real server `genesis/buildGenesis` output. The demo uses it by default.

Checks:
- Screenshots via Playwright at big screen 1280x720, desktop 860x480, card 420x300, and phone portrait 390x380 @3x.
- Holds 60 fps (median and p95 16.7 ms) under 4x CPU throttling.
- `npx vitest run client/genesis`: 6 tests pass. Typecheck is clean for my files.
- No new deps.

## What it shows (stages, all real data)
1. **clone**: a `$ git clone github.com/<slug>` terminal streams real `sampleFiles`. One file tile per path, colored by language, flies out of the terminal into the stage. The language bar fills.
2. **parse**: tiles snap into clusters labeled with real component names. Import arrows draw one by one. Counters tick up (files, loc, fn, todo, plus authors and commits when wide).
3. **graph**: force-directed settle with an elastic ease.
   - The heart node turns red, swells by its fan-in, and pulses `name ♥fanIn`.
   - Cycle edges bow outward, blink red, and glow.
   - The deepest import chain lights up amber in sequence. Data packets flow along the edges.
4. **map**: every `TraceStep` becomes a glowing pixel wire from its fact to the character part. A caption chip shows `from` at the source, then `to` at the target, and the terminal logs `from -> to`. Runs of the same part (7 limbs, 8 attacks) overlap like a volley.
   - Boss: component nodes fly into their limb slots (`bossLayout`) and shrink to limb size; tentacles grow from the heart. Then the heart core, red weak-point knots, eyes popping open one by one, TODO bugs hatching, scars, and a theme tint.
   - Hero: a wireframe of the real sprite appears. Class fills the body with a scanline, the weapon lights up in true colors (exact mask), the skill aura ring gets its label, real tokens orbit, the cape scrolls the real snippet in syntax colors, and palette swatches appear.
5. **assemble**: the real sprite builds bottom-up from falling glyphs of the repo's real code (matrix-rain tails).
   - Heroes: each pixel lands as a character cell, then compiles into the real pixel with a white flash.
   - Bosses: 4x4 blocks.
   - Sprites come from `playerPortrait` (2x hi-res in edu) and `bossPortrait`.
6. **reveal**: flash, shake, and glyph burst. The name card types out in Press Start 2P, followed by the weapon, the skill, and the Gemini catchphrase or epithet.
   - Hero: the equal 5-point budget shown as pips flying from the hero into bars, captioned "equal for all".
   - Boss: a stacked threat-budget bar.
   - The character then idles live: `drawBoss` animated (tentacles, eyes), or the hero's breathe/blink frames with orbiting tokens and a rare RGB glitch.

## Polish details
- Header pipeline `clone › parse › graph › map › assemble › reveal` (the current stage blinks), with a progress line.
- A terminal window with traffic lights, typed last line, and blinking cursor.
- Faint real code engraved on the stage background; a circuit-dot grid with data pulses.
- Glitch slices on stage changes; additive dithered glows (arena `drawGlow`).
- `prefers-reduced-motion`: condensed, no shake or glitch, fewer particles.
- Rendering: a low-res pixel canvas (integer device scale, `image-rendering: pixelated`) plus a device-resolution text overlay using VT323 / Press Start 2P, so lowercase real code stays readable.
  - The layout is responsive: wide (terminal column) or tall/compact (terminal strip at the bottom).
  - Bosses get chunkier logical pixels (target height 185 vs 215) so the monster fills the stage.
- `drawBoss` shares arena FX state. I save and restore `fx.boss`, `fx.now` and `fx.victoryAt` around it, so a past victory never hides the lobby boss and the cinematic never disturbs a match.

## API (for claude-ui) — `client/genesis/index.ts`
```ts
import { playGenesis } from "../genesis/index.ts";
const g = playGenesis(hostEl, {
  kind: "hero" | "boss",
  genesis?, progress?, kit?, slug?,     // pass whatever the LobbyPlayer / lobby.boss has right now
  compact?: boolean,                    // phone card (~45% height)
  condensed?: boolean,                  // ~4 s (pre-fight intro)
  mode?: "battle" | "edu",              // lobby.mode
  autoAdvance?: boolean,                // edu: default auto on compact / non-interactive, else tap
  interactive?: boolean,                // tap: skip while playing / replay when done / continue an edu pause (default true)
  loop?: boolean,                       // attract mode: replay 4 s after done
  onDone?(),
});
g.update({ progress })                  // live: each lobby update while status === "analyzing"
g.update({ genesis, kit })              // when ready: continues from `parse` if the live clone already played
g.skip(); g.replay(); g.seek(t | null); g.dispose(); g.done
```
- The host element must have a size, since the cinematic fills it (`position:relative`, 100%). It keeps its own resize observer and rAF loop, so call `dispose()` when the card unmounts.
- No genesis yet but a kit is present: it plays a thin story from the kit (`genesisFromKit`). If live progress reaches `ready` without a genesis, it falls back the same way.
- Genesis present but no kit: it holds at the start of `map` and shows "designing…".
- Same slug updated twice: it keeps playing (no restart).

### Integration suggestions (claude-ui owns the mounting)
- **Lobby hero card.** While `status === "analyzing"`, `playGenesis(cardEl, { kind: "hero", slug: p.repo, progress: p.progress, compact: isPhone, mode: lobby.mode })`, then `update({progress})` on every lobby message.
  - When it becomes ready, call `update({ genesis: p.genesis, kit: p.kit })`.
  - After `onDone` you can keep it (the live idle hero) or swap back to `paintHeroCard`.
  - Replay on tap is built in.
- **Boss panel reveal.** Same pattern with `kind: "boss"` and `lobby.boss.progress/genesis/kit`. On `?screen=1` mount it full screen while the boss compiles. That is the money shot.
- **Pre-fight intro.** `playGenesis(overlay, { kind: "boss", genesis: lobby.boss.genesis, kit: lobby.boss.kit, condensed: true, interactive: false, onDone: () => overlay.remove() })`.
- **Edu.** Pass `mode: "edu"`. Heroes use the 2x hi-res sprite, each stage pauses on `eduGenesisNotes` narration (claude-edu), and the reveal shows `kit.quality` as a report card (grade + real signal per stat, GPA). Use tap-to-continue on the projector and auto-advance on phones (the `compact` default).

## Files
- `index.ts`: API, surfaces, resize, loop, live→replay handoff, edu holds.
- `scene.ts`: the six stages, map wires and anchors, code rain, reveal, report card, narration.
- `live.ts`: live analyzing phase (path stream, tiles, top-dir clusters, pct bar).
- `sprites.ts`: final sprites from the real renderers, plus code-rain cells, part anchors, weapon mask, and boss skeleton (`bossLayout`).
- `graph.ts`: pure helpers (deterministic force layout, cycle edges, longest chain, path→component, bezier, easing).
- `local.ts`: client-side genesis builders (`buildGenesisLocal` mirrors sim rules; `genesisFromKit` is the fallback). The edu trace is the report card.
- `text.ts`: crisp text overlay. `palette.ts`: language colors and UI colors.
- `demo.html` / `demo.ts`: offline gallery at `/client/genesis/demo.html`.
  - Params: `?repo=<idx|slug>&kind=hero|boss&layout=big|desktop|card|phone&condensed=1&live=1&mode=edu&src=local&t=<sec>&loop=1`
  - It defaults to the server builder `genesis/buildGenesis` over `data/fallback` + `sim/kits` + `data/design`.
- `genesis.test.ts`: tests.

## Contract requests
None.
