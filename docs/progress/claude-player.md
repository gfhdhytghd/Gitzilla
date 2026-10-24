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

## Contract requests (nice-to-have, not blocking)
- Optional `PlayerState.firing?: boolean`. The renderer already honors it if present. It would make muzzle flashes exact instead of inferring them from energy drops.

## Notes
- The coordinator's BossKit.heart and BossState.regions change doesn't affect the player renderer.
- No new deps. Screenshots were taken with system `/usr/bin/chromium --headless`.
- Gitzilla rebrand: the gallery headings now read `$ gitzilla --heroes` / `$ gitzilla --portraits`. The renderer draws no other product-name strings (in-game text is player names, repo names, `404`, `200 OK`, and skill callouts).
