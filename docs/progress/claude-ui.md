DONE (i18n gap) · DONE (pause ui) · DONE (ui review) · DONE (safari autopsy) · DONE (archetypes) · DONE (ux pass 2) · DONE (boss picker) · DONE (weapon code) · DONE (motion v3 ui) · DONE (logo) · DONE (edu mount) · DONE (genesis mount) · DONE (leave) · DONE (edu pvp) · DONE (qa fixes) · DONE (ux p1) · DONE (ux p0) · DONE (code flavor) · DONE (portrait) · DONE (round 2)

## i18n gap (Settings "Sound" + pause strings) — done, verified zh-CN in Playwright WebKit on DEV :5175
- Hand-added 19 rows (en/zh/es/fr) to shared/i18n/messages.generated.json + sources.json + gemini-translations.json (coordinator-approved shared/ edit): Sound, music & sound effects, all pause-card/host-button/raid-control strings ("[1]+  Stopped    gitzilla    (suspended by you|{0})", "▶ RESUME", "⏏ leave", "end match · new room", hints, "⏸ Pause raid (P)", "▶ Resume raid", "⏸ pause", "pause (P / Esc)", "⏸ pause match (everyone)"), plus "{0} top-level files" / "top-level files" (UI-7) and the boss-picker private hint. audit-i18n: 0 errors, 0 needsReview; i18n vitest 8/8.
- pause.ts: "the host"/"the teacher" go through t() before the {0} pattern, so the stopped line is fully localized.
- Verified: zh-CN Settings (声音 / 音乐与音效), desktop fight pause card, classroom raid pause on student phone + teacher screen — all Chinese.
- Note: classroom pages follow the ROOM language (host-set `lobby.locale`), not the browser locale — a zh browser in an English classroom stays English by design. Mock: `?mock=raid&locale=zh` sets the mock room's locale for testing.

## Host pause UI — done (client against the committed contract; server `pause` handling is codex-net's)
- Host (room owner) only: desktop `⏸ pause` button in the HUD top bar (`pause-match`) + P / Esc keys (P/Esc toggle: pause → resume); phone host: "⏸ pause match (everyone)" in the ☰ menu (`game-pause`) — no new on-screen gameplay buttons. Non-hosts: Esc still opens the menu.
- Everyone, while `MatchState.paused`: dimmed/greyed arena, `paused-overlay` terminal card `$ kill -STOP gitzilla` / `^Z` / `[1]+ Stopped gitzilla (suspended by <host>)`; host gets ▶ RESUME (`resume-match`) + ⏏ leave + end match · new room; others "waiting for the host to resume…". With `resumeAt`: `$ fg %1 3·2·1` countdown (clock-skew safe: server epoch delta if sane, else 3s from receipt), overlay drops itself at 0.
- Frozen while paused: visual time (no animation drift), no input sampling/sending (tilt/gesture/touch processing suspended, no stray edges), audio silenced via `setPausedAudio` (keeps the user's own mute preference); the interpolation clock re-syncs on resume so motion is smooth.
- Mock supports it (`pause` → freeze stepping; resume → 3s `resumeAt`).
- Classroom raids (ClassroomState.paused) too: the overlay is now a shared component (`client/app/pause.ts`, used by game.ts and classroom.ts). Teacher (projector owner) gets "⏸ Pause raid (P)" / "▶ Resume raid" in the raid controls + P / Esc; everyone sees the same `$ kill -STOP gitzilla` card (students: "your teacher paused the class attack…"), the `fg %1` 3·2·1 countdown, and the raid clock frozen at `raidEndsAt - paused.since`. Sends `{t:'pause', paused}` (server already accepts it during a classroom raid). Mock: `?mock=raid` (+`&screen=1` teacher, `&paused=1` start paused). Verified in WebKit: teacher desktop pause → RESUME → countdown (clock 0:42 frozen, resumed 0:41); student iPhone 15 paused card.
- Also fixed: the in-fight motion gate's "touch only" button didn't close the gate when permission stays pending (`countdown-touch-only`).
- Verified in WebKit: desktop 1280×800 (button → overlay → RESUME → countdown → running) and iPhone 15 (☰ → pause → RESUME → countdown).

## Coordinator UI review (docs/ui-review-coordinator.md) — my rows done, verified in Playwright WebKit on DEV :5175
- UI-1: every `<select>` is drawn for the dark theme (appearance:none, dark bg, light text, pixel ▼ arrow, dark options) — readable on WebKit.
- UI-2: "Before you play" actions are a sticky footer (always on screen, fade-out scroll cue above); the sheet shows at most once per browser session (sessionStorage), never over the name prompt, the fight or the autopsy.
- UI-3: on phones the floating "♪ ON" is gone outside the fight deck; Settings has a Sound toggle (`settings-sound`).
- UI-4: "[ PvP: challenge a friend ]" no longer wraps (nowrap label; smaller under 360px).
- UI-6 (ui side): desktop/landscape players get a 4/3 follow camera (360×216 of the arena, follows the hero in x and y, looks at the boss during the intro) with the minimap + edge arrows; spectator/big screen keep the full arena. Your hero always has a steady yellow ring (pulse + YOU label for the first 10s / after a revive). ⚙ moved next to ☰ menu on the fight screen (it covered the team list). Hero sprite size vs the boss is claude-player's half.
- UI-7: "root"/"."/misc components read "<repo> top-level files" (`humanComponent`) in Adopt-an-Organ, the dissection diff, lobby limbs and HUD limbs. MVP sentence shows in full. Also: reloading into an autopsy no longer plays a 3s outro over a blank "booting arena" — it goes straight to the results.
- UI-8: the classroom is already in the Gitzilla look in this build, and owner routing works: owner → teacher screen (`?screen=1`, "Prepare the lesson"), students → student view ("Waiting for your teacher"). Verified on iPhone 15 / SE + desktop with the teacher connected. Edge case for claude-edu/codex-net: if the teacher's screen disconnects, a student phone can inherit ownership and sees teacher copy.
- Found while verifying: (1) the landing wordmark rendered as broken glyphs on WebKit (sampled web-font pixels) → now drawn from the brand's 5×7 bitmap font, identical in every browser; (2) landing items overlapped on short phones (tagline under the create button) → non-shrinking items + scrollable landing; (3) the stacked boss-dissection diff overflowed on iPhone 15 → fixed.
- `tools/safari-autopsy.ts` updated for the new flow (battle autopsy + classroom page; edu has no autopsy any more): 6/6 pass (iPhone 15, iPhone SE, desktop Safari 1440).

## Safari autopsy — done (mock verified in real WebKit); real-match WebKit run still flaky
- Reproduced in Playwright WebKit (iPhone SE 320px overflowed horizontally: squad-stats grid + long contribute URL). Fix in style.css "Safari/WebKit autopsy" block: scroller absolutely positioned (no 100% height chain), overflow-x hidden, min-width:0 on all autopsy grid/flex children, overflow-wrap:anywhere for links/text, max-width:100% for img/canvas/QR/share card, ≤380px compact grids.
- `tools/safari-autopsy.ts` (WebKit regression): iPhone 15 / iPhone SE / desktop Safari 1440 × mock battle + edu autopsy → all pass (no horizontal overflow; new room / leave / rematch / adopt-organ / share reachable). `--real` plays a real room on DEV; its start step was just hardened (retry START) but not re-verified.
- WebKit on this Arch host: Ubuntu libs (icu74, flite, libbacktrace; libjxl 0.8 → system 0.12 symlink) linked into ~/.cache/ms-playwright/webkit-2370/minibrowser-wpe/sys/lib; run with PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1.

## Archetypes (claude-ui part) — done, not yet marked in header by request order
- client/app/archetype.ts (labels, blurbs, "why this repo", airborne/burrowed hint). Lobby boss panel badge + why + blurb (verified with real sim kits: linux→KAIJU, django→HYDRA "7 components in import cycles → 3 heads", redis→MECHA), intro meta line, HUD boss name icon + "✈ airborne / ⇣ burrowed" hint, edge arrow suffix, autopsy dissection title with archetype death line, pose.t extrapolated in interpolation, mock kits/states carry archetype/pose/airborne.

## NEXT (not started): permission gate UI (lobby "📱 tap to enable motion" per page load, send {t:'controls'}, cards/START list players[].controlsReady, pre-countdown overlay; WebKit stubbed-permission test), then rubric (docs/tasks/edu-rubric.md).

## Boss from your own GitHub repos — done
- Boss panel (owner only, inside the owner controls) mounts the same `createGithubPicker(…, {kind:"boss"})`: stars-first, filter, 🔒, language, pushed-ago; picking fills the boss input and sends `setBoss` with `full_name`. Paste-link + famous-repo chips kept. Test ids `boss-github-connect` / `boss-github-repos` (hero picker keeps `github-*`).

## UX pass 2 (claude-ux portrait re-audit + edu audit) — done
- PR-0: lobby updates compared to the previous state: match → lobby without an autopsy → amber banner "⚠ the match was interrupted — the host can start again" (edu: "the brawl… the teacher"); ownerId change → toast "★ you are now the host" / "host is now X". Also P0-3 nit: after a fatal pre-welcome error the link pill stays `LINK ERR` (no "retrying").
- PR-2: thumb buttons hidden during the intro (and motion v3 has none anyway). PR-3: the touch overlay (joystick/charge ring) is hidden while an intro, BSOD or defeat/class-dismissed card is up. PR-4: ghost split says "ATTACK · tap here" and starts 1.2s after the FIGHT flash. PR-5: phone lobby has 120px+safe-area under the sticky bar, and the in-panel `$ ./fight.sh` is hidden on phones (the next-step bar is the one START). PR-6: lesson/quiz chips in the deck are full width.
- EDU-4: projector copy in edu: "students: scan to join · hold your phone upright" / "★ the teacher starts the brawl here", `N / 30 joined · M ready` counter (26px), dense roster of joined students only (no empty slots) with a 28px grade letter, bots labelled "AI classmates (bots)".
- EDU-5: projector brawl: right-gutter `$ leaderboard` top 10 at 28px with rank numbers, lesson cards moved into the left gutter (no longer over the arena), event log hidden there.
- EDU-6: not in my code — the "repo shape → stats: same 5-pt budget" line is drawn by claude-genesis's reveal; **request → claude-genesis/claude-edu:** in edu mode say "code quality → stats (see your report card)".
- PR-1 (combat text pile-up) and EDU-1/2/3/7 belong to claude-boss / claude-edu.

## Weapon names as code — done (my surfaces)
- `client/app/codefmt.ts`: `tokenize()` (keywords / calls / identifiers / strings / numbers / punctuation; lossless), `codeSpan(src, fit=24)` (monospace, highlighted, `white-space: nowrap`, names >24 chars shrink via font-size — never truncated mid-token), `drawCode()` for canvas (shrinks the size until it fits). Test: client/app/codefmt.test.ts.
- Used on: lobby squad cards + your hero card, HUD/deck weapon line (`⌐ for { go serve() } fires "go"`; only the projectile list may ellipsize), autopsy squad rows, share card (`⌐ <weapon>` line).
- **Request → claude-genesis:** the genesis reveal draws the weapon name itself; please render it with the same token colours (kw #ff6ac1, call #3de8ff, id #e8fff2, str #ffd23d, punct #9aa7b4) and shrink rather than truncate — `tokenize` from client/app/codefmt.ts is importable.
- Also adapted to codex-input's v3 touch surface (no buttons in any phone mode): status pills show in touch mode too (`✦ hold` / `⚡ double-tap`), no space reserved for buttons, touch hint "drag to move · tap = attack · double-tap = dash · hold = skill", my long-press ring defers to the input module's own `input-charge` ring.

## Motion v3 UI — done (claude-ui part)
- Game (phones, motion mode): every drawn control is gone (DASH/SKILL buttons, joystick hidden via `[data-input=motion]`); the deck is status-only: `✦ spin or hold — READY/Ns` and `⚡ twist — READY/Ns` pills with cooldown fill. Gesture toasts for 400ms (`⚡ dash`, `✦ skill`, `▸ attack`) derived from sampled InputFrames (dash/skill edges, fire rising edge). Long-press charging ring under the finger (starts after the 180ms tap window, fills in 550ms; drawing only — input owns the gesture). Tips copy: "tilt = move · swing/tap = attack · twist = dash · spin/hold = skill".
- Lobby gesture training (`client/app/training.ts`, `data-testid=training`): opens after choosing tilt/seated (once permission is granted) — 5 steps with an animated pixel phone, live meter and ✓s: hold (stillness → neutral), tilt (4 directions + live dot pad), swing ×3 (linear accel; iOS null `acceleration` → high-passed accelerationIncludingGravity), twist ×3 (rotation spike whose 400ms angle stays <120°), spin ×2 (∫|rotationRate| ≥ 270° in 1.2s) or long-press. Touch alternates count too (tap, double-tap, long-press). Skippable; re-train from the lobby controls card and the in-game ☰ menu.
- Stores `kaiju.gestureProfile` = `{v:3, neutral, tilt{left,right,up,down}, swing m/s², twist °/s, spin °, at}` (60%/80% of the user's median peaks, clamped). game.ts calls `input.setProfile(profile)` if the input module exposes it.
- Verified with synthetic DeviceOrientation/DeviceMotion events in Playwright (390×844): all 5 steps ✓ → profile saved; in-game motion mode shows 0 control buttons, pills + ring render.

## Logo — done
- `client/app/mark.ts`: the brand kaiju (same grids as brand/make_logo.py) animated — roar cycle (jaw drops 1px, </> beam spreads + brightens + glow), glyph flicker, plate ripple, blink. `markCanvas()` for static use.
- Landing: mark + GIT(#2fe39a)/ZILLA(#ff3e9a) wordmark lockup (stacked on phones), glitch/RGB-split kept; big-screen QR panel uses the stacked logo; share card has the mark + wordmark; projector in-match late-join QR has the mark. Footer copy updated to the v3 gestures.

- Now wired to codex-input's v3 API: training also writes its thresholds via `saveThresholds()` (kaiju.motionCalibration.v3) and the game calls `input.setProfile({swingThreshold, twistThreshold, spinAngle, neutral})`; toasts use `input.lastGesture` (`⚡ dash · twist`), falling back to frame edges.
- FYI coordinator/codex-input: with codex-input's uncommitted v3 input, keyboard move/fire only work in keyboard mode, so tools/playtest.ts's phone context (touch mode, keyboard-driven) reports `moving: 0, firing: 0` → harness exit 2 although the match runs to autopsy. Harness or input needs a tweak (not claude-ui).

## Contract requests (motion v3)
- codex-input: `InputController.setProfile(p: GestureProfile)` (shape above) to apply trained thresholds; optional `onGesture(fn)` / last-gesture getter so toasts can say exactly what fired (today derived from frames).

## Leave / new room — done (DONE (leave))
- Lobby header `⏏ leave room` (`leave-room`): owner gets a 1-tap confirm "you own this room — ownership passes to <next human>. tap again to leave"; projector shows `⏏ end class` + `new room`.
- Game: `☰ menu` (`game-menu-open`; deck on phones, left gutter otherwise; Esc toggles) → "leave the fight?" `⏏ leave the fight` / `▶ resume` (projector: end class / new room). Touch joystick hidden while the menu is open.
- Autopsy (battle + edu): `[ new room ]` and `[ leave ]` next to REMATCH (projector: `[ end class ]`).
- `app.leave({newRoom?})`: sends `{t:"leave"}`, deletes this room's player + screen resume tokens, remembers your repo (`kaiju.lastRepo`), closes after 150ms, goes to `/` — or POSTs /api/room (edu teacher → ?mode=edu) and enters `/r/<NEW>` (`?screen=1` kept). Name kept; the new lobby offers `↻ <last repo> again` (`reuse-repo`).
- Verified on 5175: leave → `/`, tokens cleared; confirm/menu/autopsy buttons screenshotted.

## Genesis mount — done (claude-genesis public API only)
- `client/app/genesisMount.ts`: one mount per surface; streams `progress` while analyzing, hands `genesis + kit` over when ready, restarts only when repo/mode changes.
- Lobby hero card: live compile while analyzing → reveal → idle hero; tap to replay ("▶ watch your repo compile into your hero"). Boss panel: the compile replaces the static silhouette. Projector (?screen=1): full-screen boss compile while it is analyzed, closes 5s after it finishes (✕ close).
- Pre-fight intro: condensed (~4s) boss compile inside the intro card (intro extended to ≥4.3s); edu intro compiles your own hero. Phone: thumb buttons hidden until the intro is gone.
- Edu: `mode: "edu"` → genesis's narrated/report-card variant (it calls claude-edu's eduGenesisNotes itself).

## Edu mount — done
- LessonFeed + QuizOverlay per variant (phone deck / desktop gutter + arena top / projector lower-third), variant switches on layout change; engine kept on `app.eduEngine` for createClassReport (glossary ✓ + quiz scores). Lobby report cards, projector roster, mode copy, landing hint. Battle autopsy: createArchitectureReport (what you fought, your repo vs the boss, where this project needs help) when the boss genesis exists.

## Adopt an Organ (social impact) — done
- Battle autopsy section (`adopt-organ`): fragile organ (fewest maintainers) → else the organ with the fewest maintainers ("only 2 people maintain this") → else the most-damaged; issues: organ's → `boss.repoIssues` → the repo's good-first-issues page. Always a QR (/api/qr) to the first issue / issues page; huge and FIRST on the projector, after the header on phones/desktop. Bus factor line when present.

## GitHub picker
- Repos sorted by stars (desc, stable), `★ 12.3k` first column in yellow; filter kept.

## Notes for coordinator
- The Vite dev watcher on this filesystem intermittently misses edits (5175 served a stale autopsy.ts/lobby.ts/style.css for minutes until another edit; my private Vite instances too). If a change "doesn't show", re-save the file or restart the dev server.

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
