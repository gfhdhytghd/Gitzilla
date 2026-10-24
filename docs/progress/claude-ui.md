DONE (edu pvp) · DONE (qa fixes) · DONE (ux p1) · DONE (ux p0) · DONE (code flavor) · DONE (portrait) · DONE (round 2)

## Edu = classroom PvP (claude-ui part) — done (real PvP sim pending codex-sim; verified with ?mock=edu|edu-match|edu-autopsy)
- Null boss everywhere (game/hud/autopsy/mock); arena theme falls back to "notebook" with a room-seeded layout.
- Landing: `[ 🎓 classroom: teacher on projector ]` → POST /api/room?mode=edu → /r/ROOM?screen=1. net.ts stores the teacher screen's resume token separately (`kaiju.screenToken.<room>`) and sends it on reconnect.
- Lobby: owner mode toggle `⚔ boss raid | 🎓 classroom` (setMode; others see a badge). Classroom: boss panel → "CLASSROOM BRAWL" rules + `$ make brawl` (needs ≥2 ready), next-step bar adapted ("waiting for classmates", "▶ START BRAWL"), squad cards show `code grade B · GPA 2.5`, your card shows claude-edu's report card (signal → stat → grade + tips). Projector roster compacts for up to 30 students.
- Game: PvP scoreboard replaces the boss bar (`$ ./brawl round 2/3 · 0:41 left`, leader, your rank/KOs/dmg); team list = live leaderboard (top 6 on phones / 12 on the projector, `N KO`); YOU ring after respawns; PvP intro ("CLASSROOM BRAWL · best of 3") and outro ("CLASS DISMISSED · ★ winner"). claude-edu LessonFeed (phone: in the deck replacing the log; desktop: left gutter; projector: lower third) + QuizOverlay (deck / arena top / projector) mounted on edu snapshots; my CODE REVIEW strip yields to the quiz overlay.
- Autopsy: `CLASS RESULTS` header + `$ make rematch` + your report card + claude-edu createClassReport (ranking, report cards, improvement tips, highlights, glossary).

## UX P1s (+ some P2s) — done
- P1-1 relative stat pips on the hero card (health/armor/energy/damage/speed) instead of ×1.00/85px/s; P1-2 min 10px pixel text, phone limb segments text-free; P1-3 compact deck; P1-4 pulsing ring + YOU under your hero (first 10s, after revive/respawn); P1-6 prefers-reduced-motion / `?calm=1`: ¼ shake, no full-screen glitch, faint tints, ≤3 flashes/s; P1-7 big-screen copy ("scan with your phone (hold it upright) · ★ first phone to join is the host"), bigger cards, late-join QR in the corner during matches; P1-8 inline repo/boss errors, inline rename (no prompt()), "X still cloning… press again to start anyway"; P1-9 taunt bubble min width + 2-line clamp.
- P2: touch targets ≥36–44px on coarse pointers, `join` labelled, footer/host-big hidden on phones, ✗/✓ on phone autopsy, `share ↗` (navigator.share with PNG, download fallback), padding under fixed pills, hall rows `5522 dmg · alice vs flask`.
- Not done: P1-5 (needs a fallback/stand-in flag on LobbyPlayer — contract request below), P2-4 phone landing hero/boss art, P2-5 title de-dup (design/sim owners).

## QA fixes (codex-qa) + coordinator portrait review — done
- QA-UI-01: net.ts keeps/cancels one retry timer; open() refuses while a socket is CONNECTING/OPEN. `QA_REPRO=1 npx vitest run qa/reconnect.test.ts` → 2/2 pass.
- QA-UI-02: close code 4001 → status `displaced`, no reconnect; full-screen "this room is open in another tab" with `[ use here ]` (`conn.reclaim()`).
- QA-PORTRAIT-01: viewport sizing = integer device scale unless it wastes >15% of the budget, then fractional; compact deck (<290px) on short phones; 360x640@2 now 360x288 CSS (geometry assertions pass; full qa/portrait.ts runs keep ending INCONCLUSIVE on dev-server restarts).
- Review: empty deck boxes collapse; boss bar sits in/under the real notch inset (no extra band); boss silhouette reveal plays once per repo, in-place swap for design updates (never stuck dark); after summon the red button becomes a small `⟲ change boss` link.

## UX audit P0s + top-5 quick wins — done (for claude-ux re-audit)
- P0-1 / QW1: phones choose controls in the LOBBY (`controls-card`: tilt phone · seated / small moves · touch only). iOS permission prompts run inside that tap; the choice is the client-local motion profile (`kaiju.motionProfile`, tap-only = touch). In-game there is no sheet: a small `tap to enable tilt` pill (`motion-enable`) appears in the deck only after the intro, only if still needed.
- P0-2 / QW2: hints match the live mode: touch = "drag on the arena to move · tap to attack · DASH / SKILL buttons" + a 5s MOVE | ATTACK ghost split over the viewport; motion = "tilt to move · tap or swing to attack". Sensor pill says `touch controls` (neutral grey) or `motion: on/waiting/off`; ⟲ recalibrate only in motion mode. Joystick zone = left half of the viewport.
- P0-3 / QW3: join box takes exactly 4 letters (0→O 1→I 5→S 8→B), `join` disabled until 4, checks `GET /api/room/<code>` → "room ZZZZ not found — check the code, or [create ZZZZ]". Router: bad codes get a full-screen error card with `$ cd ~ (back to start)`; digit typos in links are auto-corrected. Any server error before welcome → same fatal card, link pill `LINK ERR`.
- P0-4 / QW4: sticky phone next-step bar (`next-step`): pick repo → cloning… → ready/waiting for <host> (N in) → pick BOSS ↓ → ▶ START FIGHT (N heroes). Picker collapses to `✓ owner/repo · change` after a summon; summon button turns secondary.
- QW5: plain labels: `♥ hp`, `◆ armor`, `⚡ energy` (code words kept in values/tooltips), autopsy header `damage · best combo · limbs broken · revives · final blow`, sensor pill copy.

## Code flavor card (claude-ui section) — done
- HUD vocabulary with plain hints (tooltips + hint copy): `hp` (health), `try{}` (armor), `RAM …MB` (energy), dash = `--force`, skill button shows `$ <skill>`, downed = SEGFAULT with "systemctl restart (revive)" hint, teammate rows `restart N%` / `segfault`, pickups toast `+1 commit ♥ (heal)` / `test passed ✓ (+armor)` / `☕ +RAM (energy)`, victory `exit 0 (boss deleted)`, defeat `exit 1 (squad wiped)`.
- Weapon as code: `kit.code.weapon.name` on lobby cards (kind in tooltip), you-card line "a blaster · fires "…" · hits go <impact>", HUD weapon line `⌐ <name> "proj" "proj"`.
- Minimap = editor minimap: faint syntax-coloured "code rows" shaped by the boss's real heart lines + a file tab `▾ <heart file> · map`.
- Thumb buttons: code word above the plain one (`--force` / DASH, `$ firewall` / SKILL).
- Pending (not started, waiting on handoff): mount claude-genesis' compile cinematic (client/genesis/) in the lobby hero card, boss reveal and pre-fight intro once docs/progress/claude-genesis.md exists.

## Portrait card (phones = portrait only) — done
- isPhone() = coarse pointer && short side < 600. Phone portrait game layout (`.phone-portrait`):
  boss bar (+timer) under the safe-area inset → camera viewport (full arena height at the largest integer DEVICE-pixel scale that leaves ≥300px for the deck; shows ~200–260 logical px of width; follows the hero horizontally with smoothing + move-direction lead, clamped; intro looks at the boss) → control deck.
- Camera: canvas is resized to the view; the world transform composes camera + intro zoom + shake; toArena() maps through the view. drawEvents/drawPostFx get an optional `view {x,y,w,h}` (claude-boss to honour; ignored otherwise).
- Edge indicators (pixel arrows drawn on the canvas): off-screen boss (heart + BOSS), a cast aimed at you (pulsing red/yellow + attack name), downed teammates (name + revive %).
- Minimap top-right of the viewport (120×72 CSS, ¼ scale canvas): obstacles, perk pads, hazards (lasers dotted), pickups, boss regions/body, teammates, you (blinking), and the camera window.
- Deck: self HP/ARM/NRG (+ perk badges), sensor pill + recalibrate + mute, team list + combo counter, event log; CODE REVIEW becomes a 3-card strip in the deck (cards tappable → hint toast) while pads are on the floor; toasts above the deck; downed banner at the bottom of the viewport. DASH/SKILL = two half-width 92px thumb buttons at the bottom (SKILL left, DASH right) with cooldown fill. Joystick zone (touch fallback) limited to the viewport.
- Rotate guard: full-screen pixel "ROTATE TO PORTRAIT ↻" overlay for coarse-pointer phones in landscape (CSS, game keeps running); first tap tries fullscreen + screen.orientation.lock("portrait").
- Landing / lobby / autopsy: single-column portrait layouts (≤600px wide): bigger tap targets (46–56px buttons, larger chips/GitHub rows), you → boss → squad order, no horizontal overflow (min-width:0 on grid items), host-on-big-screen hidden on phones, hall toggle, autopsy diff/table compacted; share card unchanged (1200×630).
- Verified with Playwright on the dev server at 390×844 and 360×800 (isMobile, hasTouch, DPR 3): intro, fight, code review, lobby, autopsy, rotate guard (844×390), plus desktop 1280×720 unchanged. Harness (now portrait phone) reached autopsy; a second run died to a dev-server restart.

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
- UX P1-5: `LobbyPlayer.standIn?: boolean` (or `kit.fallback`) when the analyzer served a synthetic/offline profile, so the lobby can show "⚠ couldn't read that repo — using a stand-in hero · [try again]" instead of a green ✓.
- **Round 2:** `LobbyPlayer.progress?: { stage: string; paths: string[] }` and the same on `LobbyState.boss` — server streams the analyzer's current stage and recently read file paths while `status === "analyzing"` so the lobby can show real paths like `git clone` output. UI already consumes it (lobby.ts `Progress`).
- `ClientMsg {t:"setName"; name}` would let lobby rename without reconnecting (currently rename = reconnect with resume token).
