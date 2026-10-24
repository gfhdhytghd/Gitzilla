DONE (round 2)

Round 2 summary: real code shows up on hero cards (signature + snippet), on the boss panel (scrolling heart lines, TODOs as "known bugs", commits as "recent sins"), in the intro, and in the autopsy (red diff of each destroyed limb's real symbols plus the removed heart lines). The game composes obstacles, pickups and perk pads, with a compact CODE REVIEW strip, pickup toasts and perk badges. Round-1 review fixes are done too: docked HUD, ambient margins, compact downed banner, phone overflow. Verification: the e2e on the dev server (5175) reached autopsy with exit 0 and 0 errors. Later reruns failed only when the shared dev server restarted mid-run. The only open item is analysis-progress paths, which is blocked on the contract request below.

# claude-ui progress

## Round 1 fix list (coordinator review) — done
- Phone: combo counter sized/positioned inside the right gutter; mute button moved to the left gutter; HUD docked (no overlap with boss bar); touch DASH/SKILL buttons docked into the right gutter.
- Combo shown once in HUD (fixed slot). **Request → claude-boss:** please drop (or keep tiny, near the hit) the in-world "xN COMBO" text from drawEvents; the HUD owns the big combo counter.
- Downed: compact single-line banner at the arena's bottom edge with revive bar + %.
- Desktop: margins filled with a blurred/dimmed live copy of the arena (`canvas.ambient`), HUD panels docked into side/top gutters when wide enough (`dock-x` ≥88px, `dock-y` ≥56px, `dock-narrow` for phones); falls back to in-arena overlay otherwise. Event log docked bottom-left.
- Outros shortened (victory 3.2s, defeat 2.0s; tap/key skips) so the autopsy appears promptly.

## Round 2 (claude-ui section)
- [x] renderers: optional drawObstacles / drawPickups / drawPerkPads (claude-boss arena exports; placeholders otherwise); draw order bg → pads → obstacles → pickups → hazards → minions → boss → players → bullets → events.
- [x] HUD: CODE REVIEW strip (3 PR cards, timer, "approved by …" per card, yours highlighted), pickup toasts (+1 ♥ / +energy / +1 ◆), perk badges in the self panel, log lines for `rm <file>` (obstacleBroken) and `merged <perk>`; haptics/flash on your pickups/perk; shake on obstacle break.
- [x] Lobby: hero cards show `sig <signature>` + real snippet in a mini editor line; you-card shows "signature move"; boss panel shows the heart file in a mini editor with real heartLines scrolling, "known bugs" (real TODOs) and "recent sins" (commit subjects).
- [x] Autopsy: each limb's real symbols as diff lines (red `-` for broken limbs, context for survivors) + heart lines removed on victory.
- [x] Mock: `?mock=review` starts the boss at 50.5% to reach CODE REVIEW fast; mock kits get fake code when DNA is missing.
- [x] Motion-v2 prep: DASH/SKILL thumb buttons styled (terminal look, big targets, cooldown fill + countdown from HUD data in every input mode, docked in the right gutter on phones); copy updated to "tilt to move · tap or swing to attack".
- [~] Analyzing state streaming real file paths: needs server progress (contract request below); UI already renders `progress.stage` / `progress.paths` if present.

## Summary
GITZILLA app shell is complete: landing (glitch GITZILLA logo with a stomping kaiju, live themed backdrop, Hall of Monsters), `$ whoami` gate, lobby (repo input + fallback chips + GitHub picker, squad cards that spin up and reveal with Gemini design swaps, AI-teammates stepper, boss silhouette-to-reveal, START), big-screen QR mode, the game screen (integer-scaled pixel canvas, 100 ms interpolation, shake, hit-stop, slow-mo, boss intro cinematic, taunts, terminal HUD, motion/touch/keyboard flows, haptics, procedural audio), and the autopsy (diff dissection, stats, MVP, hall, PNG share card, REMATCH).
Verification: `npx tsx tools/playtest.ts --players 4 --seconds 30` exits 0 with 0 page/console/ws errors, and a full match reaches autopsy (exit 0). `npx tsc` reports no client/app errors. `npx vitest run client/app` passes. `vite build` succeeds.
Dev/offline mode: append `?mock=1`, `?mock=match`, or `?mock=autopsy` (add `&gh=1` for a signed-in GitHub picker; add `?screen=1` for the big screen). It runs the real sim in-browser.

## Status
DONE (see summary). Remaining ideas only: phone-portrait lobby layout, QR corner on the big screen during the match.

## Done
- index.html (Google Fonts: Press Start 2P / VT323 / Silkscreen), client/style.css (all screens).
- client/app/main.ts router: `/` landing, `/r/<ROOM>` room (`?screen=1` big screen, `?mock=1|match|autopsy` offline mock w/ real sim in-browser).
- net.ts: same-origin /ws, hello+resume token (localStorage `kaiju.token.<ROOM>`), backoff reconnect, reconnect on visibility.
- renderers.ts: renderer/input modules late-bound via import.meta.glob with placeholders.ts fallback + per-call try/catch (`safe`).
- landing.ts: rasterised glitch pixel logo (logo.ts), animated themed backdrop (backdrop.ts) w/ boss silhouette + hero lineup + glyph rain, create/join/big-screen, Hall of Monsters (hall.ts, /api/hall). `$ whoami` name gate (player-name / join-room).
- lobby.ts: you panel (repo input + chips from /api/fallbacks), squad cards w/ fake git-clone progress + noise "spin-up" portraits -> reveal, [BOT] badge, owner AI-teammates stepper (setBots), boss panel silhouette->glitch reveal, typed name, epithet, limbs (design.limbNames), attacks, START (sticky). Big-screen: huge QR + code + cards. Gemini design re-broadcast animates a glitch swap (dsig()).
- game.ts: 480x288 canvas, integer device-pixel scale (fractional fallback), 100ms interpolation buffer (players/boss/regions/minions lerp, bullets extrapolated), events released on render timeline; trauma shake, hit-stop, slow-mo, flashes, phase glitch, danger vignette, boss intro cinematic (letterbox, git clone bar, design.intro lines, epithet, camera zoom), FIGHT flash, victory BSOD / defeat outro, boss taunt speech bubbles (design.taunts; phase change + every ~15s), haptics, motion permission/calibrate flow, keyboard hint, rotate hint, touch-button cooldown fill. Audio (client/audio) via sound.ts: music per theme/phase, onEvents, onFire (new own bullet ids), onDash, mute toggle (M).
- hud.ts: terminal HUD — HP/armor segments, energy, skill+dash cooldowns, boss bar w/ lag + limb segments + phase, telegraph stack-trace banner (TARGET: YOU), team list, sync-combo counter, event log, downed overlay.
- autopsy.ts: verdict, boss dissection as git diff, squad stats, MVP, hall, share card PNG (1200x630), owner REMATCH (top).
- data-testids per tools/README.md (+ rematch, bots-plus/minus).
- `npx tsx tools/playtest.ts --players 4 --seconds 40`: exit 0, 0 page/console/ws errors.

- Rebrand: GITZILLA everywhere I own (title, logo, share card, sensors copy). Logo = "GIT"+"ZILLA" two-tone pixel raster + a tiny kaiju stomping commits along a git graph (breathes glyph fire mid-walk).
- Shared contract follow-ups: BossKit.heart, BossState.regions (interpolated), HeroDesign/BossDesign (catchphrase/title on cards, epithet+intro in reveal/cinematic, limbNames in HUD/lobby, taunt speech bubbles), setBots stepper + [BOT] badge, hit {crit, impact, hitStop, direction, source} -> rate-limited hit-stop, impact shake, directional camera nudge on hits to you.
- Renderer extras used when present: notePlayerShot (new bullet ids), trackPlayers, bossLookAt(target), playerPortrait frames (lobby portraits breathe/blink).
- Audio (client/audio): one instance (sound.ts), unlocked on first pointer/key, lobby music, per-snapshot music(theme, phase)+onEvents, onFire, onDash, onUi; mute button + M key (localStorage).
- GitHub (Auth0): github.ts — Connect GitHub (hidden when /api/me disabled/404), avatar + @login + switch/sign out, filterable terminal repo picker (🔒, language chip, ★, relative pushed_at) -> setRepo; ?auth_error toast; whoami defaults to GitHub login. Mock: `?mock=1&gh=1`.
- Hall of Monsters (/api/hall) on landing (desktop panel / toggle on small screens) and autopsy.
- client/app/util.test.ts (vitest). `vite build` OK. Landing + game hold 60 fps headless.

## Notes for others
- claude-boss: client/render/arena drawPostFx keeps module-level defeat state ("KERNEL PANIC"); I stopped calling drawPostFx from the lobby/landing backdrop because of this. In-game it's fine.
- The HUD intentionally duplicates some in-world text (telegraph banner/stack trace + target name, combo counter in a fixed HUD slot).

## Contract requests
- **Round 2:** `LobbyPlayer.progress?: { stage: string; paths: string[] }` and the same on `LobbyState.boss` — server streams the analyzer's current stage and recently read file paths while `status === "analyzing"` so the lobby can show real paths like `git clone` output. UI already consumes it (lobby.ts `Progress`).
- `ClientMsg {t:"setName"; name}` would let lobby rename without reconnecting (currently rename = reconnect with resume token).
