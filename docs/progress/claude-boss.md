DONE (XR HUD boss HP fix + table height buttons) — claude-boss

## Round 4 (urgent): XR HUD boss HP was frozen on Vision Pro
- **Root cause:** the HUD redraw was throttled on the caller's `time` (`time - hudAt < 0.25`). game.ts's `pull()` returns `visTime`, which only advances in the page rAF (game.ts:1444), and Vision Pro pauses that while immersive. So after the first draw, `time` never moved and the panel kept showing the HP from session start. The field and math were right (`boss.hp / boss.maxHp`, same as the 2D bar) and `needsUpdate` was set; the redraw just never ran.
- **Fixes:**
  - The panel redraws whenever what it shows changes (new pure `stage25d/hud.ts` → `hudInfo(state).key`), at most ~15×/s by the wall clock (`performance.now()`). It is never keyed on the caller's time.
  - XR clock in `index.ts`: if `pull().time` stalls, the stage advances its own monotonic time from the XR frames, so boss/hero animations no longer freeze in the headset either.
  - The panel now carries the same numbers as the 2D boss bar: `ceil(pct)%`, the phase label (PHASE 2 · ENRAGED / PHASE 3 · LAST STAND), limb pips in kit order (broken = grey with a red strike, weak points pink), alive count and timer.
  - It sits above the boss's standing height. At the fixed 150 px the boss stood in front of it and hid the bar's right half and the %.
- **▲ / ▼ table height:** two new XR buttons (row on top of the panel: SCALE FOLLOW EXIT ▲ ▼), shown in the VR tabletop only (not in life-size or AR). They call `stage.setTableHeightOffset(stage.getTableHeightOffset() ± TABLE_HEIGHT_STEP)`, which is codex-input's version (height.ts; absolute and persisted, so no stub was needed). Through the emulated controller-select path the table goes 1.428 → 1.528 → 1.628 → 1.528 m.
- Added `debugXR` to the `Stage25d` interface (codex-input's getter wasn't typed), `debugCanvases.hud`, and gallery `&xrmode=vr|ar`.
- **Checks:**
  - `stage25d/hud.test.ts` compares against the 2D bar's math verbatim at 100 / 73.2 / 60 (limb break) / 50.5 (phase 2) / 14.9 (phase 3) / 0.4 / overkill. It also checks that each change redraws (a distinct key) and that the key ignores the clock.
  - Gallery `?scene=raid&xr=emulate&xrmode=vr&hudcheck=1`: the pull time is frozen like game.ts, and the boss steps through full, 73%, a limb break, phase 2, phase 3 and 1%. The drawn bar px and broken pip are read back from the panel canvas into `window.__hudCheck`. All 6 levels OK for two bosses.
- **Results:** XR update 1.38 ms (unchanged); screen WebKit 1440 at 62.2 fps. tsc clean, vitest 1239 passed / 10 skipped, build OK.
- **For claude-ui (optional now):** in game.ts `pull()`, compute `time` fresh (e.g. from `performance.now()`) instead of `visTime`. The stage copes either way now.


## Round 3: volumetric sprites, lighting, boss depth, LOD + codex-input's spatial handoff wired
- **Voxel-extruded sprites (new `stage25d/voxel.ts`):** each sprite is one box, and a fragment shader walks its texel grid (2D DDA through a height field). Every opaque texel is a voxel column: the front face shows the exact pixel; side and top faces are lit.
  - No CPU meshing and no readbacks, so animated atlases (heroes and boss redrawn every frame) stay volumetric.
  - Depths: heroes/bugs/pickups 2 px, obstacles 6 px (short blocks), boss 5 px plus per-texel offsets, bullets 2 px (voxel glyphs, instanced).
  - Empty-space skip: the atlas carries mipmaps and mip level 2 = 4×4 occupancy, so empty blocks are crossed in one step (software-GL XR went 22 → 29 fps from this alone).
- **Lighting:**
  - Key light (upper left) shades side/top faces (front faces stay exact).
  - The boss heart is a point light: a pulsing color, stronger in phase 3, that tints nearby voxel sides (heroes, bullets, boss).
  - Planar silhouette shadows: each sprite plane is projected along the key light onto the floor (crisp pixel silhouettes; blob contact shadows kept).
  - Every shot puts an additive colored glint on the floor under its true 2D position.
- **Boss depth:** a depth atlas painted from the layout lobes, so the arms (+9…10), front leg (+6), head/jaw (+5), chest/heart (+4) stand forward, while the back leg (−6), tail (−6, tip −9), fins (−3) and hydra wing (−11) sit behind. Hydra heads are staggered; abyssal coils front/back. Repainted only when the boss changes.
- **LOD (`createStage25d({ voxels })`):** "auto" (default) = voxels on full-arena screens and in XR, flat billboards on the phone follow camera. In XR, "auto" adds an adaptive guard: if the moving-average frame time exceeds 12.5 ms after a 1 s warm-up, it drops to flat billboards for the rest of the session (one-way, no flapping). `voxels: true|false` forces it; `voxelBullets: false` keeps flat bullets.
- **Measurements:**

  | Scene | fps | Stage CPU per frame (update + draw submit) |
  |---|---|---|
  | WebKit raid 1440, voxels | 62.2 | 6.0 ms |
  | WebKit raid 1440, flat | 62.2 | 5.8 ms |
  | WebKit raid 1440, orbit views | 62.1–62.2 | 5.9–6.4 ms |
  | WebKit royale 1920 | 62.1 | 6.9 ms |
  | WebKit royale 1920, orbit | 62.1 | 6.5 ms |
  | WebKit iPhone 15, LOD flat | 62.2 | 6.1 ms |
  | WebKit iPhone 15, voxels forced | 62.1 | 5.9 ms |

  - XR (Chromium + IWER, software GL, two eyes): voxels 32–34 fps vs flat 48 fps; scene update 1.3–1.5 ms per frame. The CPU side has ample 90 Hz headroom; GPU cost on a real M2 is unmeasured here (software rasterizer), which is what the adaptive guard is for.
- **Spatial handoff (codex-input, 4f727e6) wired in index.ts:**
  - `stage.enterXR(mode = "auto")` picks AR only where the runtime supports it (cached `detectSpatialSupport()`, no awaits before requestSession), else VR. Vision Pro stays VR.
  - AR: `scene.background = null` and the void grid hidden; `createSurfacePlacement` is fed from onFrame, and onSelect runs the placement first. The arena shows only at status "placed" (root matrix = placement.matrix); a reticle shows while "candidate". The SCALE button calls `setTableWidth(1.2 | W*1.7/28)`.
  - `stage.exportUSDZ()` = `exportSpatialUSDZ(look.root, { metersPerPixel: 1.2 / W })`; `xrMode` getter. Re-exports: `detectSpatialSupport`, `chooseSpatialMode`, `createModelPreview`.
  - Emulator check: AR mode negotiated, status manual → controller pinch at the floor → placed on the estimated plane (0.9 m, 0.0025 m/px), passthrough background, arena visible. USDZ export: `model/vnd.usdz+zip`, 26.8 MB, 655 ms.
  - **Note for codex-input:** the USDZ is heavy for a `<model>` preview; one baked voxel geometry is 14 MB. Probably cap `maxVoxelPixels` or skip the void grid.
- **Gallery:** `&orbit=<deg>&zoom=<k>` (debug orbit camera to inspect volume), `&vox=0|1`, `&voxbul=0`. `window.__stats.stageCpuMs`.
- **Tests:** `voxel.test.ts` (box extents/attributes); full suite 1221 passed.
- **Dev note:** codex-input edits files in stage25d concurrently, so Vite HMR reloads invalidated XR runs. Measurements use a no-HMR, no-watch scratch config (restart the server after every edit: it caches modules).

DONE (3d stage v2) — claude-boss

## 3D stage fixes + finishes (coordinator review of the first shots)
- **White heroes (bug):** this was claude-player's normal hit flash (a solid white body for 0.07 s per hit, plus additive RGB-split ghosts). Under royale fire that covered ~8% of hero frames, and on an alpha-tested billboard it reads as a white cut-out.
  - Fix: a new backward-compatible `DrawPlayerOpts.softFlash` (client/render/player/index.ts, the default path is unchanged) draws the body plus a 45% white tint and skips the additive ghosts. The stage passes `{ softFlash: true }`.
  - Measured on the sprite atlas: white-silhouette frames 8% → 0% in royale, 0% in raid.
- **XR tabletop:** the arena is 1.2 m wide, centred 0.7 m in front of the viewer's head, top 0.15 m below eye height. It's anchored to the head pose at session start / scale change and waits for a tracked pose. Emulator readout: head (0, 1.6, 0.4) → table centre (-0.03, 1.43, -0.30), top 1.45 m, 1.28 × 0.8 m incl. rim. Life-size unchanged.
- **Lasers:** armed laser hazards are elevated beams at chest height (additive glow tube in the archetype's beam color plus a white core, width from hazard.r, jittering), from the lifted origin (the boss's mouth on its plane) to the arena edge. The telegraph lane stays on the floor. Zero allocations (preallocated vectors/quaternion).
- **Pickups and obstacles stand up:** standing billboards from new optional `each` callbacks on `drawObstacles` / `drawPickups` (same pattern as `drawMinions`), with floor shadows. Obstacles are anchored at their front edge; pickups get a 1.3× boost.
- **XR damage numbers / sparks / taunts:** billboards at sprite height (`particleHeight` per kind: texts 14–20 px, sparks 10) lifted onto the boss plane, no longer floor decals. New fx exports: `drawParticle`, `forEachParticle`, `particleHeight`, `isTextParticle`; `drawEvents(..., view, { draw: false })` ingests/steps without drawing. They are instanced camera-facing quads from a 512×192 cell atlas, texts first.
- **Postfx overlay mode (for claude-ui):** `drawPostFx(ctx, t, shake, view, { overlay: true })` skips the chromatic-aberration and glitch-slice passes (they copy/multiply the frame and paint a transparent overlay solid). Flash, danger vignette, scanlines, vignette and the end screens still draw. `glitchAmount()` / `caAmount()` are exported if claude-ui wants a CSS equivalent on the WebGL canvas. The gallery uses the overlay mode.
- `onXRFrame(dtMs, updateMs)` now also reports the per-frame scene update time.
- **fps** (Playwright, real sim, 0 page errors):
  - WebKit raid + laser 1440: 62.2 fps, stage 5.9 ms.
  - WebKit raid hydra 1440: 62.2, 7.8 ms.
  - WebKit royale 8 bots 1920: 62.2, 6.0 ms.
  - WebKit iPhone 15 raid / royale: 62.1 / 62.1, 6.2 / 6.3 ms.
  - Chromium + IWER XR raid / royale: 48 / 40 fps in the software-GL headless emulator (two eye views; scene update 1.7 / 1.4 ms per frame, so the CPU side fits 90 Hz with room; GPU/90 Hz to confirm on device).
- **Shots:** scratchpad `shots/v2/` (desk.png, xr.png, phones.png, raid_hydra.png, plus the singles).

DONE (3d stage) — claude-boss

## 3D stage: three.js 2.5D screens + Vision Pro WebXR (docs/tasks/view-25d.md, claude-boss = look + index.ts)
- **Deps (exact pins):** `three@0.186.1` (dependency); `@types/three@0.186.0`, `iwer@2.5.0` (dev only; the gallery's emulated headset). The stage is a lazy chunk (552 kB / 140 kB gzip), loaded only when 3D is on.
- **Files (mine):**
  - `client/render/stage25d/index.ts`: wiring, `createStage25d`.
  - `scene.ts`: the look.
  - `staging.ts`: boss-plane lift, pure, with `staging.test.ts`.
  - `gallery.html` / `gallery.ts`.
- **Files (codex-input, used as-is):** `types.ts`, `projection.ts` (camera rig, XR placement), `xr.ts` (session), `pool.ts` (not used yet).
- **Look:**
  - Floor: a NearestFilter texture of the existing ground renderers (arena, royale zone, perk pads, hazards incl. telegraphs, obstacles, pickups).
  - Standing billboards for heroes (1.35× visual boost around the feet; hitboxes unchanged), the boss and bug minions. All are drawn by the existing 2D renderers into one sprite atlas (1024×512, glows off, alphaTest cutout) and anchored at their feet, with blob shadows.
  - Boss: a vertical plane at its feet line. `staging.lift()` maps 2D points inside its footprint onto that plane, so limb hits, sparks, damage numbers and shots line up with the drawn limbs (unit-tested; continuous, no jumps).
  - Bullets: their own glyph sprites (drawBullets per cell into a 512×384 atlas) as instanced camera-facing quads at chest height (12 px), plus additive glow quads and floor shadows under the true 2D position.
  - GC zone: a translucent red wall cylinder plus a ring line (the `RM -RF` ring stays on the floor).
  - Void room: dark background with a faint grid.
  - XR: a table under the diorama and a floating HUD panel (boss HP, alive/heroes up, timer) with SCALE / FOLLOW / EXIT buttons (transient-pointer select via xr.ts → raycast; UI only).
- **Screen FX:** particles, damage numbers, banners and perk cards are drawn on the caller's overlay ctx through the new `fx.project` hook (projected and lifted). In XR they become floor decals.
- **Small backward-compatible hooks:** `fx.project` (arena/fx.ts), `glowState.off` (pix.ts), `drawMinions(ctx, m, t, each?)`, perk-card anchoring under `fx.project`. Hits with amount ≤ 0 (spawn shield) no longer show "-0".
- **API (index.ts):** `createStage25d(opts?)` → `{ canvas, resize(cssW, cssH, dpr), render(ctx, state, time, view?, extras?), screenToWorld, worldToScreen, setFollow, setScale, xrSupported, enterXR, exitXR, xrActive, destroy }`. The module also exports `xrSupported`.
  - opts: `{ xr?, spectator?, pull?, scale?, onXRChange?, onXRFrame? }`.
  - extras: `{ you, focusId, events, theme, seed, variant, world, shake: number | {x,y} }`.
  - Screen coords = logical view px (0..view.w × 0..view.h).
  - With `canvas` mounted (resize called) the world renders there and `ctx` only gets the FX overlay; otherwise it blits into ctx. The stage does NOT draw postfx (the caller does).
- **For claude-ui:**
  - (a) Pass `opts.pull` (latest interpolated state/time/events/extras). While a Vision Pro session presents, window rAF can stop, and the XR loop pulls from it.
  - (b) In 3D, call drawPostFx with `{ x: 0, y: 0, w: view.w, h: view.h }`: the overlay is in logical view px, and the phone `view.x` offset would shift it.
- **Verified (Playwright, scratch scripts):**
  - WebKit raid desktop 1440: 62.1 fps, stage 5.5–8 ms/frame.
  - WebKit royale 8 bots projector 1920: 62.2 fps, 5.6–6.2 ms.
  - WebKit iPhone 15 portrait raid/royale follow: 61.6 / 62.2 fps, 6.5 ms.
  - 0 page errors.
  - Chromium + IWER emulated headset: Enter → immersive-vr session, 317–319 XR frames in 5 s (~62–63 fps; the emulator runs on headless 60 Hz rAF, so 90 Hz is only verifiable on device); tabletop and life-size both render; exit returns to the screen loop.
- **Not verified / limits:**
  - Real Vision Pro (90 Hz, transient-pointer pinch on the buttons; the select→raycast path isn't exercised by the emulator test).
  - Lasers stay on the floor (no elevated beam).
  - Pickups and obstacles are floor decals, not billboards.

DONE (royale) — claude-boss

## PvP royale (docs/tasks/pvp-royale.md, my section)
- **GC-sweep zone:** `drawRoyaleZone(ctx, pvp, matchT, time, world?)`, exported from `client/render/arena/index.ts`. Draw it in world space after the arena background and before the heroes. `matchT` = MatchState.t (zone timing is in match seconds); `world` = the arena size (`pvpArenaSize`).
  - Outside the circle: darkened and dithered "freed memory", a red radar sweep wedge passing over it, and drifting `0X0` / `FREE()` garbage glyphs.
  - Edge: a marching ring of bold `RM -RF` glyphs with glow (brighter red while shrinking).
  - Next circle: dashed white telegraph while pending or shrinking.
  - Label: "GC SWEEP IN Ns" / "GC SWEEP!", clamped into the camera view so phones always see it.
- **Elimination FX:** call `trackPlayers(players, pvp)` (the new optional 2nd arg gives placements). The moment `PlayerState.eliminated` turns true, the hero dissolves into a stack trace of its own code: `SEGFAULT #<place>`, `AT <identifier>()` ×≤3, `BY @<killer>`. Lines peel off upward and glitch out over 1.6 s, clamped into the view, plus code shards, a glitch flash and a small shake. The trace is a single particle, outside the 4-text budget.
- **Arena size:** `drawArenaBackground(ctx, theme, seed, t, variant?, size?)` takes the real arena size (e.g. `{ w: 720, h: 432 }` from `pvpArenaSize`), so the floor, walls and props cover the whole royale arena instead of 480×288. The new `variant: "royale"` keeps the boss theme look but turns on per-player bullet colors and boss-free FX. `"classroom"` is unchanged.
- **For claude-ui:**
  - pass `size` and `"royale"` to drawArenaBackground in mode "pvp";
  - call `drawRoyaleZone` after it;
  - pass `s.pvp` as the 2nd arg of `trackPlayers`;
  - don't draw eliminated heroes (or let claude-player hide them);
  - the camera/minimap need the royale world size (still 480×288 constants in game.ts).
- **Gallery:** `?mode=royale` (8 heroes in 720×432, zone pending → shrinking, eliminations every 1.6 s), plus `&portrait=1&res1=1` for the phone camera. Checked big screen and phone.

DONE (ui review) — claude-boss

## For take-genesis: `portraitFrame(kit)`
- `client/render/boss/index.ts` exports a pure `portraitFrame(kit): { logical, bx, by }` (no DOM: it only reads `bossLayout(kit)`), and `bossPortrait` uses it for its own frame. `client/genesis/sprites.ts` already imports it, so genesis and portraits share one frame formula. No change was needed in this pass.

## UI review row UI-5 (docs/ui-review-coordinator.md): less floating text over the arena
- **Central text budget** in `arena/fx.ts emit()`: at most 4 floating texts alive at once, each ≤ 14 chars (longer ones are cut with "~"), each ≤ 1.0 s.
  - Every text has a priority: 0 ambient (boss ERR glyphs, CLANK, --FORCE, weapon impact words, bug labels, combo tags), 1 normal (damage numbers, pickups, RM file, STACK OVERFLOW), 2 important (skills, SEGFAULT, 200 OK, perks, CRIT).
  - When the budget is full, a higher-priority text replaces the oldest lowest-priority one; otherwise the new text is dropped.
- Damage numbers merge per target within 300 ms on every view. The number budget is 4 on desktop and 3 on the phone camera.
- **Advisory IDs** (GHSA/CVE) are no longer shown in the arena; the crawling parasites are the in-fight icon (IDs belong in the autopsy).
- **Maintainer counts** ("2 MAINTAINERS") are no longer shown in the arena; fragile organs keep their cracked amber glow.
- **Skill callouts** are ≤ 14 chars: FIREWALL UP / GIT FORK / HOTFIX! / SUDO -O3 / GIT REVERT. Pickups read +HP COMMIT / +ARMOR TESTS✓ / +ENERGY COFFEE.
- **ERR/EXC stacks on the boss:** fan bullets are single-char `!`/`?` plates, and broken-limb error glyphs come every 4–6.6 s at ambient priority.
- **Hazard labels:** one label per attack name per frame (no more duplicated "BUILD() RACE CONDITION"), names ≤ 9 chars, always 1×. On the phone camera only the countdown is drawn, because the HUD FATAL banner already names the attack.
- **Verified** with Playwright WebKit on dev :5175 (`/r/QABS?mock=match`) on iPhone 15, iPhone SE and desktop 1280×800: 0 page errors; the arena shows ≤ 4 short floating texts from my renderers. The large "$ ./fight --now" and MOVE/ATTACK hint overlays come from claude-ui's intro, not the renderers.
- **For claude-player:** hero signature callouts (e.g. "LINUX_MAIN() GIT FORK --DECOY") come from the player renderer and are not covered by my budget. Please cap them at 14 chars too.

DONE (archetypes) — claude-boss   (also DONE (kaiju refs))

## Boss archetypes v1 (docs/tasks/boss-archetypes.md, refs docs/design-refs/boss-1..5 + BOSS-README.md)
- The body follows `kit.archetype` from the sim (bundled repos spread over all four: kaiju lodash/golang-example/nanogpt/petclinic, hydra django/react/fastapi, mecha ripgrep/gin/redis, abyssal express/jquery/flask/rustlings/vue).
  - **kaiju** (refs 1+4): dark-teal scaly saurian, heavier hips/legs, pale belly + throat, ground-dragging tail with a curled tip, and tall jagged crystalline dorsal fins. The fins are rasterized faceted spike clusters with forked side jags, each etched with a bracket from the repo's tokens. They're mint at rest; charging turns them white-hot cyan tail→head; red in phase 2, alternating red/cyan in phase 3, cracked grey when broken.
  - **hydra** (ref 2): golden dragon with 2–3 heads on S-necks (one per `mouths[]` entry) with horns and neck spines, one big ribbed flapping wing, thick thighs and a long tail. The acting head (`pose.head`) glows and opens its jaw; a severed head disappears.
  - **mecha** (ref 3): steel-armored kaiju frame with boxy segments and panel grid, a red scanning visor, steel fin modules, a shoulder cannon barrel, a rocket fist, vents that glow while charging and steam on recover, and jets on a hop.
  - **abyssal** (ref 5): a low coiled black-crystal serpent-dragon running through all the anchors, with a horned crystal crest, cyan crescent veins (red when enraged), crystal ridges, and a burrow mound while underground.
- **Poses from BossState.pose** (`poseMotion` in boss/index.ts, no logic of its own beyond interpreting t/total/dir/head/airborne):
  - walk (2-step stomp with shake and dust; CLANK for mecha; slither for abyssal)
  - windup (lean back, charge glow on fins/vents/veins/head, jaw opens) → attack (lunge along dir) → recover
  - roar (shockwave rings), stagger (knockback jitter), enrage (pulsing charge)
  - death (topple onto the tail and fade, then the victory segfault)
  - fly (hydra hover with fast wing beats; mecha jet hop), dive
  - burrow/emerge (the body sinks below a ground clip line with crystal shards; hidden while airborne)
  - Hydra stays hovering while `airborne`.
- **Attack FX per archetype:** beams are kaiju `</>` cyan breath, hydra gold λ beams, mecha red `01` eye laser, abyssal cyan/red void ray. Mecha ring/spiral bullets are drawn as rockets with exhaust (missile barrage). Abyssal slams/cascades erupt black crystals with cyan edges from the floor. Hydra and abyssal bullets get gold / black-crystal plates.
- **Phase 3 (all archetypes):** the hide goes near-black and crescent veins glow red/cyan (ref 5), plus the existing glitch.
- **shared/kaiju-anatomy.ts:** `bossAnchors(kit)` per archetype (`kaijuAnchors` alias). Every limb has `slot` + `tag` (head | neck | wing | arm | leg | tail | plate | coil | jet) + `aloft`; `chest.tag = "core"`; `mouths[]` has one entry per head (hydra 3 if ≥6 limbs, else 2). codex-sim already uses it (sim/regions.ts `bossMouth(boss, head)`, airborne filtering by tag).
- **Gallery:** `?mode=film&pose=<name>` (4 archetypes × 6 frames, `&phase=` too), `&arch=` to force an archetype in any mode, `?pose=` in grid mode.
- Hit flash on the big bodies dropped to 40% white (a full-body flash on a 150 px boss washed out the screen).

DONE (kaiju default) — claude-boss

## Kaiju is THE boss design
- **Every boss renders as the kaiju**, whatever `design.body` a saved or Gemini design carries. The old silhouettes are reachable only through the dev override `kit.forceBody` (gallery `&body=` / `?mode=bodies`).
  - Choice: 100% kaiju rather than ~95%. A 5% seed bucket would have turned lodash (a showcase repo) into a non-kaiju silhouette.
- **`design.body` is now a detail hint on the kaiju:**
  - hydra: at least 2 heads (3 if any cycle).
  - spider: a second pair of little arms with claws.
  - machine: mech plating (metal thighs, upper arms, banded tail).
  - golem: rocky stone thighs and shoulders.
  - tree: bark tail plus moss.
  - serpent: the tail sweeps in a deeper S-curve (same tip, so the tail-tip anchor still matches the sim).
  - eye: a row of small eyes along the neck and back.
  - swarm: bugs orbit the kaiju.
  - blob: bulbous back and hips.
- Gallery labels now read e.g. "ripgrep :: kaiju (hint: serpent)".
- Re-screenshotted ripgrep, react, flask and redis (big screen, live sim) and the phone camera (ripgrep): all render as the kaiju.

DONE (kaiju boss) — claude-boss

## Kaiju boss (Godzilla-inspired, generic; related to brand/gitzilla-mark.svg)
- **Primary archetype = "kaiju"**, a renderer-side BodyKind.
  - About 85% of bosses by seed. The old archetypes (or `design.body`) show up only as rare variants (~15%).
  - Dev override: `kit.forceBody` (gallery `&body=`).
- **Anatomy** (facing left, toward the heroes):
  - Upright obsidian-scaled saurian with an ash-grey banded belly, a big head with brow ridge and snout, small clawed arms, heavy legs with feet and toe claws, and a long tapering tail.
  - Tail length comes from the kit: a laser means a deep dependency chain, which means a longer tail.
  - Very cyclic repos (≥3 weak-point limbs) grow 2–3 heads.
  - Material is "obsidian": dense scales with a glossy rim. The repo hue tints the charcoal, and the hide stays dark when enraged.
- **Dorsal plates:** rows of brand-colored bracket glyphs (`}` `>` `]` `)` from the repo's tokens) in pink/cyan/green plus the language accent.
  - 7–10 plates (count from tokens) sit on the actual back edge, half buried in the hide.
  - Tail plates point up (clean 90° rotation).
  - A broken plate row turns cracked grey and loses every other plate, with sparks.
- **Signature move:** before a laser, the plates light up one by one from tail to head (white-hot with cyan glow and rising particles). The jaw opens with a cyan charge glow at the mouth and stays open ~0.9 s for the breath.
  - The beam is the **atomic breath**: cyan/white with bold `</>` glyphs crawling along it and code-glyph sparks.
  - The sim fires it from `bossMouth()` (shared anatomy), so it really leaves the jaw.
- **Code stays:**
  - The chest heart core scrolls the real heartLines inside `{ }`.
  - Real symbols and snippets are carved into the hide (placed by searching the body mask).
  - TODO bugs, weak-point knots, fragile organs ("1 MAINTAINER") and parasites all sit on the anatomy anchors.
- **Damage:**
  - The tail tip (and, if the tail limb breaks, the outer half of the tail) is severed: cut face, raw flesh, bone, dangling wires.
  - Broken arms lose the forearm.
  - Broken legs and jaw stay but are charred with glowing cracks; a broken jaw hangs open with missing teeth.
- **Eyes:** red with a cyan slit pupil that tracks the target, plus blinks.
- **Shared anatomy:** `shared/kaiju-anatomy.ts` (owned by me) exports `kaijuAnchors(kit)` (chest, mouth, one anchor per limb id) and `KAIJU_SLOTS`.
  - Limb i → slot i: plates, tail, jaw, arms, leg, neck-plates, leg-back, tail-tip.
  - codex-sim already builds regions and the laser origin from it (keeping its 13/19 combat radii).
  - My renderer places art from the same function, and portraits/variants fall back to it, so art and hitboxes can't drift. Covered by `layout.test.ts`.
- **Portrait text clutter (UX audit PR-1):** when view.w < 300:
  - at most 4 floating texts;
  - damage numbers merge per target within 300 ms (crits too);
  - impact words are smaller and shorter (≤5 chars), pushed sideways off the shot's line, and rate-limited (also globally in every view);
  - CRIT stays at 1×.
- **Gallery:** `?mode=grid&one=1&atk=laser&boss=flask&theme=web` (breath sequence), `&phase=3&broken=0,1,2,7` (damage), `&portrait=1&res1=1&follow=boss` (phone camera on the boss), `?mode=portraits` / `?mode=bodies`.

DONE (glyph bullets) — claude-boss

## Glyph bullets (player projectiles + impact sparks as readable code)
- **Every player projectile is bold pixel code**, from `kit.code.weapon.projectiles`, else the hero's tokens, else my `WEAPON_CODE` table.
  - Font: new `boldSprite()` in `arena/font.ts`. It's 4×5 with a 5 px cap height and a 1 px dark outline. The 3×5 glyph's middle column is doubled, so stems get heavier while 1 px gaps stay open (Y, H, U, V, W read correctly).
  - Each shot is colored with the hero's identity color, i.e. **claude-player's `playerColor(kit)`** (the same color as their ring). It falls back to my per-id `playerColor(id)` in all modes.
  - Trail: short glyphs (≤3 chars) leave 2 fading echoes of the same text, spaced so they never overlap. Longer words get a thin colored streak instead (no smeared "DEADEAD").
  - Laser: the regex crawls in bold letters behind a white head, in reading order.
  - Blade: a hero-colored crescent with a bold `//` riding it.
  - Staff: a dark orb behind a bold `λ`.
  - Cannon: a bold `0XDEAD` with smoke. It no longer uses a plate, so it can't be mistaken for a boss bullet (boss bullets keep red plates).
- **Impact sparks:** a new particle kind `bold` shows the attacker's `weapon.impact` (e.g. `FREE()`, `$1`), white for a frame, then the hero's color, fading out by 0.4 s and rate-limited per player. Off in edu PvP, where the bullets are already words.
- Verified at portrait phone zoom (claude-ui-style CSS-upscaled canvas, DPR 3) with the gallery's `?mode=bullets&portrait=1&res1=1&real=1`: all seven weapon kinds with real sim weapons (`YIELD`, `DEF`, `.THEN`, `=>`, `CASE`, `I++`).
- **Coordination with claude-player:** I import their `playerColor(kit)` for bullet colors. Muzzle text stays theirs. Projectile glyphs come from my registry, fed by `trackPlayers` from `kit.code.weapon`. If their weapon redesign changes `kit.code.weapon.projectiles` semantics, the bullets follow automatically.

DONE (edu pvp) — claude-boss
(also: DONE (edu) for the earlier boss-based edu + social-impact parts below)

## Edu = classroom PvP (docs/tasks/edu.md, top section)
- **Null-boss safe.** `drawBoss(ctx, null, t)` is a no-op that clears the boss. drawArenaBackground drops a stale boss (not drawn for >0.5 s, or any time in PvP), so FX never use a previous match's boss. Boss end screens (BSOD/KERNEL PANIC), the boss death sequence and the defeat glitch are skipped in PvP.
- **Classroom arena.** `drawArenaBackground(ctx, theme, seed, t, "classroom")` is the edu variant:
  - Floor: a calm, low-contrast parquet.
  - Top wall: a chalkboard covered in chalk code ("CLASS HERO:", "# TODO: WRITE TESTS!", "QUIZ: WHAT IS COUPLING?"), with a chalk tray and a ticking wall clock.
  - Props: a teacher's desk with a laptop and an apple, a CS101 bookshelf, a bin of paper balls, and floating chalk dust.
  - Passing the variant also switches the renderers into PvP mode (`fx.pvp`).
- **PvP bullets are readable per player.** `playerColor(id)` is exported from `client/render/arena/index.ts`: 8 base colors, then golden-angle hues, always hex, stable per id, so 30 students get distinct colors. claude-ui and claude-player can use it for name tags. Player projectiles (glyph, trail, glow, cannon-shell rim) wear the shooter's color in PvP.
- **PvP hits.**
  - Damage numbers wear the attacker's color: at most one per target every 0.25 s, and at most 7 on screen.
  - Impact words are off in PvP, since the bullets are already code words.
  - Only heavy hits (impact ≥ 0.6) shake the screen or hit-stop, and there's no red danger vignette, which with 30 students would flash the projector constantly.
- **Gallery:** `?mode=pvp&n=24` stages a 24-student classroom FFA. Verified 24 heroes at 60 fps with readable per-player bullets.

## Edu (boss quiz) + social impact parts (still valid for battle)
- **Fragile organs** (`BossLimb.fragile`, bus factor 1): glowing amber fissures baked into the organ sprite, a pulsing amber glow, a tiny "1 MAINTAINER" tag (or "N MAINTAINERS"), and amber crack sparks plus `/\|` shards on hits.
- **Parasites** (`BossLimb.parasites`, OSV advisories): up to 3 tick-like parasites crawl on the organ, and the advisory ID (e.g. `GHSA-…`) occasionally rises as a glyph.
- **Quiz pads** (`PerkOffer.quiz`, `PerkPad.answer/correct`): cards read "ANSWER A: <real name>". After the reveal they show ✓ RIGHT / ✗ WRONG with green/red edges, and the in-world tag reads "QUIZ: PICK AN ANSWER T-x.xS". Perk event `correct` → "CORRECT! <perk>" / "NOT QUITE: <perk>".
- **Gallery:** `&fragile=1` marks every third limb fragile and puts 2 fake advisories on limb 1.

## Contract requests
- If the sim scales the edu arena with player count (>8 students), add `MatchState.arena?: { w: number; h: number }`. My renderers currently assume 480×288 (ARENA_W/H); with the size available I'd tile the classroom floor and walls to fit.

## Dev note
- My scratch Vite on 5199 stopped picking up file changes once during this card, which showed stale code. Restart it with `--force` before trusting screenshots.


## Portrait review fix (qa/artifacts/portrait-2026-10-24T19-23-11-618Z)
- **Root cause:** `fx.textScale` estimated zoom as `transform scale / devicePixelRatio`. claude-ui renders at 1 canvas px per logical px (RES = 1) and upscales with CSS (~3.3 CSS px per logical px), so texts were wrongly doubled.
- **Fix:** zoom is now measured from the canvas's on-screen size (`clientWidth / width × transform scale`). It falls back to the DPR estimate when the canvas is offscreen.
- Obstacle filename tags are always 1× (5 px cap height), at 80% alpha, and only shown when the name doesn't fit the title bar.
- Floor source code alpha is 12% (13% on notebook).
- Scanlines are light (8%) when the canvas is ≤2 px per logical px, so they don't turn into thick CSS-upscaled bands.
- Gallery `&portrait=1&res1=1` reproduces claude-ui's setup.

## Code flavor pass (docs/tasks/code-flavor.md, my section)
- **Player projectiles = the weapon construct.** I use `kit.code.weapon.projectiles` when present, and fall back to my per-kind table `WEAPON_CODE` in `client/render/arena/bullets.ts`:
  - blaster `"S"`/`"%D"`/`"OK"`, smg `I++`, shotgun `CASE`, cannon `0XDEAD` hex shell on an orange capsule, staff a `λ` orb, laser a `/.*/` regex text crawling along the shot, blade a crescent of `//` marks.
  - `trackPlayers` registers each hero's weapon and re-registers when the kit/weapon changes. Explicit hooks are available too: `registerPlayerWeapon(id, kind, weapon)` (internal) and `registerPlayerGlyphs`.
- **Impact text.** A `hit` with `source` = a player pops that weapon's `impact` text (e.g. `FREE()`, `BREAK;`, `$1`, `RETURN`) at the hit point. It's tiny, fades in 0.35 s, and is rate-limited per player. **Muzzle text stays with claude-player.**
- **Boss attacks as code disasters:**
  - ring = `WHILE(TRUE){` source text circling each expanding ring
  - spiral = recursion `F(` / `))` bullets
  - fan = thrown `ERR` / `EXC` / `!`
  - laser = race condition (two thin beams converge onto the lane during wind-up; the attack name crawls along the beam's white core)
  - slam = Stack Overflow (stack frames `AT <real limb symbol>` rain and pile into a column on the target, then a `STACK OVERFLOW` pop)
  - charge = `GIT PUSH --FORCE` label on the lane, plus a red force-push spark trail and `--FORCE` glyphs while the boss rushes
  - summon = an `$ NPM INSTALL` floor progress bar with the hint `(BUGS INCOMING)`
  - cascade = `<<<<<<< HEAD` / `=======` / `>>>>>>> MAIN` merge-conflict markers in the zone, plus a `MERGE CONFLICT` label
- **Pickups as code items:** heart = green `+` diff chip ("+1 COMMIT (HP)"), energy = coffee mug with steam ("+COFFEE (ENERGY)"), armor = shield with a green ✓ ("TESTS PASSED (ARMOR)"). Every popup carries a plain-language hint.
- **Arena = a source file of the boss repo.**
  - Once the boss kit's code is known, the floor prints the real `heartLines` + `snippets` as giant (2×), faint, syntax-highlighted source with per-theme colors (keywords, strings, numbers, comments, identifiers, punctuation). Line numbers run down the left wall; the walls are built from `{ } ;` brackets.
  - The git graph now runs along the floor seams with commit dots and glowing pulses.
  - Without code, the old generic engravings are used. The layer is cached per (theme, seed, code).
- **Font:** added `λ`, `Λ`, `✓`, `→`, `←`, `·`, `☕`.
- **Fix:** web neon signs are now picked by position hash. The PRNG returned correlated values at a 4-call stride from one state, making every sign "NPM".

DONE (portrait) — claude-boss

## Portrait camera support (docs/tasks/portrait.md)
- `drawPostFx(ctx, time, shake, view?)` and `drawEvents(ctx, events, time, view?)` take an optional `view = { x, y, w, h }`: the visible logical window under the camera. Omit it and you get the landscape full-arena default, unchanged.
  - **Contract**: call both with the same transform used for the world draws (camera translate/scale still applied). drawPostFx maps `view` through that transform to find the device rect, and clamps to the canvas. If the rect doesn't line up at all, it covers the whole canvas.
  - Screen-space parts follow the view: scanlines, vignette, danger vignette, flash, chromatic aberration, glitch slices, BSOD (wrapped to the width, title split over two lines when narrow), KERNEL PANIC, phase and limb-break banners (centered, shrunk to fit), the CODE REVIEW tag and frame, PR-card clamping, and hazard labels (clamped to the view).
- **Readable texts**: `fx.textScale` = 2 when the effective zoom is below 2.2 CSS px per logical px (`transform scale / devicePixelRatio`; ≈1.7 on portrait phones), else 1. It upscales floating glyph texts (damage numbers, ERR, SEGFAULT, pickups, perks, skills), hazard labels, obstacle filename tags, BSOD/panic body text and the CODE REVIEW tag. Landscape desktop and the big screen stay at 1×.
- **Gallery**: `&portrait=1` simulates the phone camera (390×490 CSS viewport at the page DPR, height-fit integer scale, follows p0, passes `view`). Verified at DPR 3 with live, fx and BSOD shots.

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

## Kaiju anatomy handoff (for codex-sim) — shared/kaiju-anatomy.ts
- `kaijuAnchors(kit)` → `{ chest: {dx,dy,r}, mouth: {dx,dy}, limbs: [{id, slot, dx, dy, r}] }`, offsets relative to BossState.x/y, one entry per kit.limbs id. Limb i → slot i:
  plates, tail, jaw, arms, leg, neck-plates, leg-back, tail-tip.
- Sim: `regions = limbs.map(l => ({ id: l.id, x: b.x + l.dx, y: b.y + l.dy, r: l.r })).concat({ id: "heart", x: b.x + chest.dx, y: b.y + chest.dy, r: chest.r })`.
- Laser / atomic breath: please originate the laser hazard at `b + mouth` (dx -48, dy -39). The renderer draws the breath from the hazard origin.
- The kaiju is ~150 px wide: head at dx ≈ -56, tail tip at dx ≈ +tailLen (94–112). Suggested clamp for the boss center: x ∈ [70, 370], y ∈ [70, 222].

## Archetype anchors handoff (for codex-sim) — shared/kaiju-anatomy.ts
- `bossAnchors(kit)` → `{ archetype, chest, mouth, mouths[], limbs: [{ id, slot, dx, dy, r, aloft }] }`, per `kit.archetype` (kaiju | hydra | mecha | abyssal). `kaijuAnchors` is an alias, so sim/regions.ts keeps working.
- Slots (limb i → slot i):
  - kaiju: plates, tail, jaw, arms, leg, neck-plates, leg-back, tail-tip
  - hydra: wing, tail, head-0, head-1, leg, head-2, neck, tail-tip
  - mecha: back-armor, tail, head, rocket-fist, leg, shoulder-cannon, leg-back, tail-tip
  - abyssal: coil, tail, head, crest, coil-front, neck, coil-back, tail-tip
- `mouths[]`: hydra has one per head (use `pose.head` / the attack's head index for the beam origin); mecha's mouth is the visor eye; abyssal's is the jaw.
- `aloft: true` marks the limbs that stay hittable while the hydra is airborne (heads, neck, wing). Abyssal burrowed: nothing is hittable (sim decides).
- Every limb has a `tag`: head | neck | wing | arm | leg | tail | plate | coil | jet. `chest.tag` = "core".
- `mouths.length` = drawn heads: hydra 3 if the kit has ≥6 limbs (head-2 slot exists), else 2; others 1.
