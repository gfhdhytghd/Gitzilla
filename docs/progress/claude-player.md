DONE (duelyst heroes)

Duelyst-style generals (user design refs docs/design-refs/hero-1.png, hero-2.png):
- **New body** (`client/render/player/general.ts`). A parametric rig per archetype: polygons, tapered limbs, and ellipses in a 100-unit figure space with ~7-head proportions. It's rasterized natively at the target height:
  - 32 px in-game (was ~20)
  - 64 px edu heroScale 2
  - 96 px full-detail portraits (res 3)
  Pixel-art passes on top: dark seams where armor plates meet, per-plate bevels lit from the top-left, a strong accent rim light on the back edge, a 1px outline, glows with a 1px bloom halo, and a dithered cape.
- **Archetypes as distinct generals.**
  - knight: horned great helm + angular spiked pauldrons + cape
  - heavy: hulking, huge pauldrons with double spikes, small helm sunk in the gorget
  - ranger: hooded cowl + mask + glowing eyes
  - mage: robe to the ground + tall wizard hat / hood, glowing eyes, staff raised
  - engineer: visor helm + backpack, mech-bulky
  - rogue: wide crouched stance, horned hood, tattered cape
  All have angular layered pauldrons with gilded lips, diamond knee guards, tassets, gauntlets, a chest core gem, and a belt gem. Palette: dark armor tinted by the repo's primary, gilded trim (primary mixed with gold), and glows in the accent color (cyan/gold/magenta per palette).
- **Code identity kept.**
  - Cursor-glow visor/eyes (red on hurt/KO); the in-game code weapons (v2), now held at the rig's real front hand.
  - Glowing syntax-colored code lines etched across the chest plate and a glowing greave seam (res >= 2).
  - The repo token/emblem glowing on the chest (res >= 2).
  - The cape shows **real code**: scrolling syntax-colored minimap lines in-game, and the actual `kit.code.snippet` written as readable 3x5 text on res-3 portrait capes.
  - Orbiting tokens, tags, perks, and all FX remain.
- **In-game sizing.** Feet are at p.y+14 and the head top at ~p.y-18 (~32 px tall + horns). Every hero-relative FX offset was rescaled (tags, pips, rings, shadow, callouts, orbit, perk badges, firewall bubble, revive ring, lying body, keyboard, duck). The boss stays far bigger (96–160 px).
- **Portraits.** `playerPortrait(kit, size, frame, hires)` now renders the general natively at r = floor(size/46) (1–4), drawn 1:1. The code weapon is drawn at scale r-1 (EPX at 2x), with guns held flat and the blade/staff raised, plus an accent glow. `portraitWeaponLayer` matches it exactly. `paintHeroCard`, `paintHeroTerminal`, and `weaponShowcase` all work with it.
- **Gallery.** There's a new `--generals` row (168 px cards, res 3) and bigger cells for the in-game grid and `?compare=1` (1x vs edu 2x). Checked in screenshots: portraits, the in-game grid, the filmstrip (hurt/dash/downed/revive), the edu comparison, and the 480x288 arena at phone-camera scale.
- **Tests.** Player tests: 12 pass. The full suite fails only in design/index.test.ts (not mine).

### For other agents
- **codex-sim (hitbox).** The visual chest center stays at (p.x, p.y); the body spans about y-18..y+14 and x±11. The current bullet hit radius of 6 still sits on the torso and stays forgiving, so **no change needed**. If you want hits to match the bigger silhouette, use 7 (×heroScale in edu). Melee/AoE ranges are unaffected.
- **claude-genesis.** `HERO_SIZE = 32` is now too small for a 32 px-tall general (tiny slots clip the weapon). Use 64 (or 64/128 hires); 144+ gives the full-detail res-3 general with code on the cape. Keep using `portraitWeaponLayer(kit, size, hires)` for the weapon layer.
- **claude-ui.** Portrait size → figure height: 64 gives ~32 px, 96 gives ~64 px, 144+ gives ~96 px with the readable code cape. The share card / MVP card should use >= 144. The 32 px backdrop lineup still works; the figure fits with feet on the edge.

DONE (weapon v2)

Weapon v2 (user: "the weapon is still regular, I want code elements there"). Every weapon is now BUILT from code:
- **New pixel art** (`client/render/player/weapons.ts`). Big bold 7px glyphs in the hero's syntax colors with a 1px outline, plus an "editor plate" that shows the repo's real token as readable letters. Plates prefer a word (`FN`, `GO`, `IMPL`), then an operator (`=>`, `&MUT`), then a per-kind default.
  - blaster: `{TK}=>` pistol (brace frame, token plate, arrow barrel)
  - smg: `<` stock + `FOR`/token plate + `=` barrel + `;;;` magazine
  - shotgun: `[ ]` stock + `CASE`/token plate (the pellets) + double barrel
  - cannon: breech + token plate (e.g. Rust `&MUT`) + `[*]` pointer bore
  - staff: shaft with a token plate + a big bold upright glowing `λ` head
  - laser: token plate + `/.*/` regex lens emitter
  - blade: a `//` comment guard + a "selected text" blade carrying the token, with a blinking caret past the tip
  Weapons are about 17–31px long (Soul Knight chunky). EPX 2x applies for edu heroes.
- **Readable at any aim.** The angle snaps to 16 directions, and near-horizontal aims hold perfectly flat. Aiming left uses a mirrored variant whose words are re-stamped unmirrored, so the code never reads upside-down or backwards.
- **Firing.** The muzzle word (`kit.code.weapon.muzzle`, else per-kind) flashes right at the code-shaped barrel: 2x and white for you on every shot; 1x, dimmer, and occasionally for others. The muzzle star/glow is unchanged and impact words are unchanged.
- **Portraits as showcase.**
  - `playerPortrait` now fits hero + weapon. The hero stands left of center, guns are held flat (or raised 22.5° in small cards), the blade/staff are raised 45°, and the weapon gets an accent glow.
  - `paintHeroCard` adds a syntax-highlight shimmer sweeping across the weapon every ~3s.
  - New `weaponShowcase(canvas, kit, time, { label?, hires? })`: the weapon alone, horizontal, at the largest integer scale, with a pulsing glow, sparkles, the shimmer, and an optional weapon name. Call it per frame.
- **Gallery.** `?weapons=1` shows all 7 weapons × 5 aim angles at 1x plus 2x edu. There's a new "legendary weapons" row. `?benchsync=N` remains.
- **Tests.** code.test.ts adds plate-word preference tests. Player tests: 12 pass.

### API notes for claude-genesis / claude-ui (please read)
- **claude-genesis:** `client/genesis/sprites.ts` re-derives the portrait weapon transform (`translate(size/2, ...)`, `rotate(-0.9/-1.2/-0.25)`). The portrait geometry changed (the hero is left of center, new poses, scale fitted to hero+weapon), so that layer will no longer line up.
  Replace that block with `const { canvas: wc } = portraitWeaponLayer(kit, size, hires)` (exported from `client/render/player/index.ts`). It is exactly the weapon as `playerPortrait(kit, size, *, hires)` draws it, plus `.glow`. For a weapon close-up beat, `weaponShowcase(canvas, kit, t, { label: true })` is ready to use.
- `weaponSprite(L, kind, res, left?)`: the signature is backward compatible (`left` is optional), and the pivot/tip semantics are unchanged.
- **claude-ui:** no required changes. Optional: `weaponShowcase` on the hero card or report card ("your weapon").
- **codex-sim (optional):** weapons are now longer. Spawning player bullets ~14–18px from the hero center along the aim (the barrel tip) would make projectiles visibly leave the code barrel.

DONE (edu pvp)

Edu classroom PvP summary (claude-player part: 2x high-detail heroes for heroScale 2, same identity as 1x):
- **Null boss.** The player renderer never reads `MatchState.boss`, so it's null-safe. Typecheck is clean.
- **2x sprites (`client/render/player/hires.ts`).** The same 1x color grid of each frame is upscaled with EPX/Scale2x (smooth diagonals and curves, never loses a pixel), then gets a 2x-only detail pass:
  - anime catchlights, hair strands, dithered cloth shading on the shadow side, a helmet glint
  - a 1px top-light/bottom-shade pass on every shape
  - a crisp 1px outline at 2x
  The result is a 52x56 sprite. The weapon, rim, lying (downed) frame, and RGB-split slices use the same pipeline. Capes and laptop screens show real code at 2x line density.
  `?compare=1` in the gallery shows 1x (pixel-doubled) next to 2x for 12 heroes: same heroes, finer detail.
- **API (backward compatible).** `drawPlayer(ctx, p, time, isYou, { scale: state.heroScale, pvp: state.mode === "edu" })`.
  - At scale 2 every hero-local layer (rings, tags, auras, badges, callouts) draws inside a 2x transform around the hero. World-space layers (particles, trails, ghosts, fork decoy, duck) stay in world space.
  - Text scales 2x too, so it stays readable when the edu camera zooms out.
- **PvP look** (`pvp: true`):
  - Rivals get a ground ring in their own color (`playerColor(kit)`), not the friendly mint.
  - Every hero shows a one-line full name in their color, because students need to know whose hero is whose. No truncation.
  - No revive ring (KO = respawn). You keep the yellow ring, arrow, and name.
- **New exports.**
  - `playerColor(kit)`: a vivid per-hero identity color for PvP bullets, leaderboard rows, and minimap dots.
  - `playerPortrait(kit, size, frame, hires = true)`: a 2x high-detail lobby portrait (needs size >= 52, drawn at an even integer scale).
- **Performance** (`?benchsync=N`, headless software rendering):
  - 30 heroes at 2x: about 3.7 ms/frame of JS at canvas scale 1. At scale 3 (1440x864, software fill) it's about 10 ms, which is pixel fill and cheap on a GPU.
  - 8 heroes at 2x: about 3 ms at scale 3.
  - Per-hero caches: the code overlay is rebuilt only when the frame or scroll changes, ground rings are pre-rasterized, and a `WeakMap` sits in front of `lookFor`.
- **Tests.** `hires.test.ts` checks that the upscale keeps identity, smooths diagonals, and outlines and shades. Player tests: 11 pass.

### Requests
- **claude-ui:**
  - Pass `{ scale: state.heroScale, pvp: state.mode === "edu" }` as the 5th arg of `R.drawPlayer`.
  - In the edu lobby use `R.playerPortrait(kit, size, frame, true)`.
  - Use `R.playerColor(kit)` for leaderboard rows and minimap dots so colors match the heroes' rings.
- **claude-boss:** PvP bullets "readable per player color": `playerColor(kit)` from `client/render/player/index.ts` gives the same color as that hero's ring.
- **coordinator (infra):** the shared dev server on :5175 (and any Vite here) is serving **stale module transforms**. File edits under `client/render/player/` were not picked up even after `touch`; a `?v=` query returned fresh code, and only restarting Vite helped. The file watcher seems not to fire on this machine, so playtests on :5175 may run old client code until it's restarted. I used a short-lived private Vite on :5291 for gallery screenshots and benchmarks, and it's stopped now.

DONE (code flavor)

Code-flavor summary (docs/tasks/code-flavor.md, claude-player section). Heroes stay cute chibis; code is the material.
- **Weapons as code objects (new pixel art):** a `{ }`-braced pistol (blaster), a `;`-magazine SMG, a mechanical-switch shotgun, a keycap cannon, a USB-stick staff with an upright glowing `λ` at the tip, a regex-ring emitter (laser), and a cursor-bar katana (blade). The real-token etch from round 2 still applies.
- **Muzzle and impact text:** firing pops `kit.code.weapon.muzzle`, with per-kind defaults from the table (`printf`, `loop`, `switch`, `alloc`, `=>`, `match`, `cut`). Your shots spark `weapon.impact` (`\n`, `++`, `break;`, `free()`, `return`, `$1`, `rm`) where they land.
  - Rate-limited so fights stay readable: your muzzle words every 1.6s, teammates' every 3.2s at half alpha. Impact words: yours every 1s (crits 0.35s); teammates' only on crits.
  - Impact text needs `notePlayerEvents` wired (see the claude-ui request below).
- **Faces:** helmet visors are a `>_` prompt with a blinking cursor (`><` hurt, `x_x` KO, `^_^` victory). Mages get glowing `{ }` eyes. Everyone else gets an `x_x` KO face and `^_^` on victory.
- **Syntax crests from real tokens:** `{` brace, `</>` horns, `#` mohawk, `~` curl, `*` pointer spikes. They go on helmets (accent color) or hair (when there's no topper).
- **Syntax-highlighted armor:** the knight's brow band is a highlighted code line, and knight/heavy plates and pauldrons get 1px keyword/function/string stripes.
- **Cape and laptop show code:** the cape interior and the laptop lid are dark editor panels where the hero's real `kit.code.snippet` and identifiers scroll as 1px syntax-colored minimap lines (faster when running). Hoodies get a token sticker on the pocket.
- **Footsteps and trail:** `;` / `.` footprints, a faint git-branch commit line along your recent path, and a `--force` streak on dash.
- **Orbiting tokens:** up to 2 compact symbol tokens (`=>`, `:=`, `{}`...) orbit the head at low alpha and brighten while the skill is ready. Word tokens are excluded on purpose (clutter).
- **Idle:** after 3s idle a tiny keyboard floats up and the hero types (clacks); after 8s, `sleep(1)` drifts up.
- **Version tag:** your name shows `v1.N` for N picked perks.
- **Hurt, downed, revive:** hurt flicks red `-` diff lines. Going down types a short stack trace (`SEGFAULT` / `AT parse_args()` from real identifiers) beside the body, fading after 2s. Reviving re-materializes the hero line by line like `git checkout`, with a green `+` scan.
- **Skill vocabulary:**
  - firewall: `try { } catch` braces hug the bubble
  - fork: the decoy carries a `#a3f9c1e` commit hash
  - hotfix: green `+ ----` patch lines
  - overclock: a `SUDO` aura plus `!!` afterimages
  - rollback: `HEAD~1` at the origin

  Fallback callouts when there's no usable signature: `$ TRY{}CATCH`, `$ GIT FORK`, `$ +PATCH`, `$ SUDO !!`, `$ GIT REVERT`.
- **Lobby terminal card:** new `paintHeroTerminal(canvas, kit, time, readyAge?)`. The hero stands on a mini terminal window titled `~/repo (main)` that shows their real snippet and identifiers with line numbers, syntax-colored, and a blinking cursor. Code types in during spin-up. Best at >= 160x120 px; drawn at an integer scale.
- **Victory mood:** new `setPlayerMood("victory" | "defeat" | "fight")`. On victory every standing hero hops with `^_^`.
- **Gallery:** kits carry `code.weapon`. The arena scene feeds impacts, `?mood=victory` works, the strip has an `idle-type` row, and there's a new terminal-cards row.
- **Tests:** `code.test.ts` gained crest, face, and code-rows tests. Player tests: 8 pass. Typecheck for my files is clean.

### Requests: claude-ui (all optional, one line each in renderers.ts + game.ts / lobby.ts)
- `R.notePlayerEvents?.(events)` once per released snapshot event batch. It enables weapon impact words, crit flashes, and knockback.
- `R.setPlayerMood?.(status === "victory" ? "victory" : status === "defeat" ? "defeat" : "fight")` when the match status changes. Reset to `"fight"` on rematch.
- Lobby card: `R.paintHeroTerminal?.(canvas, kit, now/1000, (now - readyAt)/1000)` per animation tick, for the terminal card (or keep `paintHeroCard` for small slots).

DONE (round 2)

Round 2 summary (heroes from real code):
- **Chest emblem from code.** When there's no Gemini emblem, the repo's most frequent short real token (≤2 chars, e.g. `=>`, `::`, `fn`, `:=`) goes on the chest as 3x5 glyphs. Precedence: design emblem → code token → language glyph.
- **Code-etched weapon.** The top token (`kit.code.tokens[0]`) is hashed into a rune pattern engraved along the weapon's main metal or wood row, plus one glowing accent pixel. Each repo gets a stable weapon skin.
- **Signature move callout.** When a hero's *own* skill fires, it shows `$ <signature>` using the real identifier (e.g. `$ parse_args()`).
  - Long dotted names shorten only at a member boundary (`SpringApplication.run()` → `run()`). If the result is still over 16 chars, it falls back to the skill text.
  - Callouts no longer fire on teammates who are only standing in someone else's firewall.
- **Perk badges.** `PlayerState.perks` render as 5x5 outlined icons orbiting the waist (the back half is drawn behind the hero).
  - Icons are matched by keyword: force/dmg = up arrow, verify/dash = bolt, pair/revive = heart, lint/armor = shield, cache/energy = gem, hotfix/skill = plus. Anything else gets a hash-colored ring.
  - A newly picked perk triggers a burst and a rising `+ <perk>` callout.
- **Projectile glyphs.** claude-boss already ships a registry (`registerPlayerGlyphs` in `arena/bullets.ts`, fed by `trackPlayers`, which game.ts calls), so there's one source of truth and I don't keep a second one.
  - Small suggestion for claude-boss: `trackPlayers` registers only when `!playerGlyphs.has(id)`, so a player who swaps repos between rematches keeps the old glyphs. Re-registering when the token list changes would fix that.
- **Fixes.** The gallery now supplies the required `perks` field, and the typecheck for my files is clean. The gallery kits carry realistic `kit.code` per language, the strip has a new `perk` row, and skill cells set `kit.skill` so the callouts show.
- **Tests.** `client/render/player/code.test.ts` covers the token emblem, the etch, and the fallback. Together with `look.test.ts`, the player tests all pass.
- Screenshots were taken against the shared dev server on 5175, never 5173.

DONE

Summary: `client/render/player/` ships `drawPlayer` and `playerPortrait`. They generate procedural Soul Knight-style chibi heroes:
- 6 class silhouettes and 7 hand-pixeled weapons.
- Seeded or Gemini-designed (`kit.design`) headgear, accessories, emblems, and palettes.
- Full juice: hurt flash, RGB split, dash ghosts, sword slashes, muzzle flashes, downed 404 ghost with a revive ring, `200 OK` pop, all 5 skill auras, and name tags.

I verified it with headless-chromium screenshots of the gallery (grid, `?strip=1` filmstrips, and `?arena=1` composited on the real arena renderer). Typecheck is clean and the full vitest suite passes, including `look.test.ts`.

# claude-player progress

## Status
DONE. Further work would only be polish.

## Done
- `color.ts`: hex/hsl helpers, hue-shifted shade/light, mulberry32 rng.
- `font.ts`: 3x5 pixel font with an outline and a cached canvas per (text, color). Exports `glyphBits`.
- `look.ts`: `lookFor(kit)` → HeroLook.
  - When `kit.design` (HeroDesign) is present, the design drives the look: archetype → class silhouette, headgear, accessory, emblem (1–2 chars rendered as 3x5 glyphs on the chest), and palette (primary, secondary, skin/visor, accent; colors are clamped to readable ranges, and a non-skin [2] becomes the visor glow).
  - Without a design, everything derives from the seed and weapon class.
- `sprite.ts`: paints each hero into a 26x28 color grid, then a 4-neighbour 1px auto-outline pass, rasterized once and cached per (look, frame, tint).
  - Frames: idle0/1 (breathe), blink, run0-3, hurt (`><`), ko (`xx`).
  - Headgear: helmet (knight, or the heavy faceplate), hood, wizard-hat, goggles, bandana (+ mask for rogues), beanie, bare hair.
  - Toppers: headphones, cat ears, antenna (blinking LED), crown.
  - Back items: cape, scarf, laptop backpack (stickers + glowing logo), jetpack (flicker), sticker shield, tail. Also an off-hand coffee mug.
  - 5 hair styles, helmet crests (plume, horns, fin), and a chest emblem.
- `weapons.ts`: hand-authored pixel weapons for all 7 kinds, each with the hand drawn in. The weapon rotates to `facing`, flips when aiming left, and goes behind the body when aiming up. Muzzle flash, recoil, and a sword swing with a slash arc.
- `index.ts`: `drawPlayer`, `playerPortrait`, plus extras.
  - Ground: shadow plus a friendly ground ring. When isYou, the ring is a yellow marching ring with a bouncing arrow and the name in yellow. Other players get name + short repo.
  - Movement and hits: dust on run, dash afterimages (from dashCd jumps or high speed), and squash and stretch. Hurt gives a white flash, then an RGB split with a slice glitch and either cyan armor shards or red pixels.
  - States: invuln blink. Downed: lying sprite, a cute ghost with a halo, `NAME 404`, and a revive ring with `REVIVE n%`. Revive pop: ring, `200 OK`, and sparkles.
  - Skill auras:
    - firewall: hex bubble with 0/1 bits.
    - overclock: glow outline, flame particles, orange afterimages.
    - hotfix: green pulse rings and `+` glyphs.
    - rollback: blue rewind trail plus a ghost of where you were 2s ago.
    - fork: glitchy purple decoy at the cast spot, `FORK()` and `!`.
  - Skill casts show a `$ GIT FORK`-style callout. A rubber-duck companion follows when the design asks for one.
- `gallery.html` + `gallery.ts`: 32 heroes (24 seeded across every weapon, skill, and state, plus 8 hand-written HeroDesign examples) and 22 lobby portraits.
  - Params: `?scale=N`, `?only=i,j`, `?strip=1` (deterministic filmstrips of every transient effect at +20ms through +1000ms), and `?arena=1&theme=kernel` (an in-context 480x288 scene on the real arena renderer plus postfx).
  - Open it via vite: `/client/render/player/gallery.html`.
- `look.test.ts`: vitest for design mapping, determinism, and junk palettes.

## API (for claude-ui)
- `drawPlayer(ctx, p, time, isYou)`. `time` is in **seconds** (values > 1e4 are treated as ms). (p.x, p.y) is the hero's chest/collision center. Feet sit at y+8. The sprite reaches about 19px up (hats up to about 27), and tags reach up to about y-33.
  - The renderer keeps per-player FX memory keyed by `p.id`. It auto-detects hurt (hp + armor drop), shots (energy drop), dash (dashCd jump), downed/revived, and new buffs.
  - Call `drawPlayer` every frame, including during hit-stop. A slowed `visTime` is fine.
- `playerPortrait(kit, size, frame = 0)` returns a cached canvas. Scale is an integer `floor(size / 26)`.
  - For an animated lobby card, use `playerPortrait(kit, size, playerPortraitFrame(time, kit.seed))`: frames 0/1 breathe, 2 blinks, and all are cached.
  - **claude-ui:** your `heroPortrait` cache key is `repo|seed|size`. Please add `kit.design?.title`, or skip your cache entirely (mine is already cached), or portraits stay stale after the Gemini design arrives.
- Optional: `notePlayerShot(playerId)` forces a muzzle flash or sword swing, e.g. when a new bullet owned by that player appears.
- `lookFor(kit)` is exported in case UI wants the hero's colors (e.g. `lookFor(kit).c.primary` for card accents).

## Follow-up round (coordinator request): done
1. **Name tags.**
   - Teammates now get a 1-line short name (≤7 chars, `~` when cut).
   - Their repo line slides in when the local player is within about 64px (fading from 64px to 48px) or when they're downed (`NAME 404` plus repo).
   - Your own tag stays 2 lines (bouncing arrow, yellow name, repo).
   - Proximity uses the last `drawPlayer(..., isYou=true)` position, so nothing new is needed from callers.
2. **Pop-off rim.** A cached 1px dilated light rim (mint-white, alpha 0.45, or 0.6 for you) sits outside the dark outline. When a buff is active the same layer becomes the buff glow (overclock, hotfix, rollback). It costs one extra `drawImage` per hero.
3. **Lobby spin-up.** New `paintHeroCard(canvas, kit, time, readyAge?)` export (details below).

4. **Rich hit events.** New optional `notePlayerEvents(events: GameEvent[])`. Call it once per released event batch, e.g. next to `drawEvents`.
   - For `hit` events targeting a player, it uses `direction` and `impact` for a directional knockback lean (1.5–4.5px, snapping back over 150ms).
   - `crit` gives a longer white flash and a 1.6x squash.
   - Without the call, hurt FX still fire from hp/armor drops. `hitStop` and screen shake stay claude-ui's job: the renderer just follows the `time` it's given.

## Tag round 2 (playtest feedback): done
- Supersedes item 1 above. Alive teammates now show only a 9x9 pip in their hero color with a white initial, just above the head. There's no text and no repo line, and the proximity reveal is gone.
- Downed heroes (you or teammates) show their **full name** on one line, blinking red. No `404` suffix and no repo line; the ghost and halo carry the "down" read.
- You: bouncing arrow plus your full name in yellow on one line.
- There is no truncation anywhere anymore.
- **claude-boss:** `client/render/arena/events.ts:141` emits a `404 NOT FOUND` glyph at the downed player's head, which stacks with the downed tag and ghost. Please drop it or move it well off the hero, e.g. a short `SEGFAULT` burst that rises and fades within 0.6s.

## Handoff to claude-ui: lobby spin-up (optional, drop-in)
`paintHeroCard(c, kit, time, readyAge)` repaints a square canvas every tick:
- For the first 0.9s after the kit arrives, the hero materializes bottom-up behind a white scanline: an accent wireframe above the line, glitch slices, and data bits, finished by a white flash.
- After that the hero idles (breathe and blink) with a rare RGB-split flicker.
- Everything is cached, so per-tick cost is a few `drawImage`s.

Also in game.ts: `R.notePlayerEvents?.(released)` wherever you release snapshot events to `drawEvents`.

Suggested wiring in `client/app/lobby.ts`:
```ts
// renderers.ts: add "paintHeroCard" to the pulled player exports (keep playerPortrait as fallback)
// playerCard(), ready branch, instead of heroPortrait(p.kit, 64):
const c = document.createElement("canvas"); c.width = c.height = 64; c.className = "portrait";
heroCards.add({ c, kit: p.kit, readyAt: justBecameReady ? performance.now() : -1e9 });
portrait.append(c);
// animation tick (rAF preferred; the 80ms interval also works and looks steppy-pixel):
for (const hc of heroCards) {
  if (!hc.c.isConnected) { heroCards.delete(hc); continue; }
  R.paintHeroCard(hc.c, hc.kit, performance.now() / 1000, (performance.now() - hc.readyAt) / 1000);
}
```
`justBecameReady` = the card's previous status was `analyzing` (your noise portrait → spin-up handoff). For the Gemini redesign swap, pass `readyAge` around 0.6 to replay only the last part of the build plus the flash. You can preview it in the gallery's portrait section (it cycles every 4s; `?age=0.3` freezes the frame).

## Contract requests (nice-to-have, not blocking)
- Optional `PlayerState.firing?: boolean`. The renderer already honors it if present. It would make muzzle flashes exact instead of inferring them from energy drops.

## Notes
- The coordinator's BossKit.heart and BossState.regions change doesn't affect the player renderer.
- No new deps. Screenshots were taken with system `/usr/bin/chromium --headless`.
- Infra: port 5173 is the live production server, and I never touch it. Earlier screenshots used a private, throwaway vite on 5291 that is now stopped. From now on the gallery is served by the shared dev server: `http://localhost:5175/client/render/player/gallery.html` (plus `?strip=1`, `?arena=1&theme=…`, and `?only=…&scale=…`).
- Peer sessions aren't labelled by agent role in ListAgents, so this handoff lives here and not in a direct message.
- Gitzilla rebrand: the gallery headings now read `$ gitzilla --heroes` / `$ gitzilla --portraits`. The renderer draws no other product-name strings (in-game text is player names, repo names, `404`, `200 OK`, and skill callouts).
