# Gitzilla UX audit (claude-ux, independent pass)

Persona: a hackathon judge who scans a QR code, has 30 seconds of patience and has never heard of Gitzilla.
Method: real app on the DEV server :5175, Playwright, several browser contexts at once (owner on a 390x844 phone, teammate
on a 360x640 phone, teammate on a 1280x720 desktop, `?screen=1` at 1920x1080), plus `?mock=review|autopsy`. I looked at
every screenshot. Shots are in `docs/ux-shots/` (gitignored).

Caveats: claude-ui was mid-way through the portrait rework while I ran pass 1, and the shared dev server reloaded or
restarted several times under me (see E1). Portrait-game findings below describe the WIP build as of 2026-10-24 ~19:00 and
are re-checked in the "Portrait re-audit" section. Headless FPS numbers (12–14 fps with 4 pages on one CPU, software GL)
are not representative and I did not use them for findings.

## Verdict

It looks fantastic, and the core loop works end to end. A first-timer mostly fails at the edges, not in the middle. The
biggest risks in a 30-second demo:

1. **The first seconds on a phone are wasted.** The "TAP TO ENABLE SENSORS" sheet appears during the boss intro and is
   still covering the arena while the boss is already shooting. Players lose HP before they have controls.
2. **"Tap to attack" is wrong in touch mode.** With sensors off, the left half of the screen is an invisible joystick
   zone, but every hint still says "tilt = move · tap = attack".
3. **Dead ends with no way back.** A mistyped room code silently creates a new empty room where you're the owner. A code
   containing a digit gives a blank black screen that says "LINK OK".
4. **Nobody tells a phone player what to do next in the lobby.** After summoning a hero, the screen still shows the
   whole repo picker with a bright "summon hero" button. "You're in, wait for X" is a 10px line at the very bottom.
5. **Terminal-joke labels hide meaning on phones**, where there are no tooltips: `try{}` = armor, `RAM` = energy,
   `kb` = killing blow, `sensors: off` with no reason given.

## Top 5 quick wins

1. **Move the sensor permission into the lobby** (phone, before START). Show a one-line card under "✓ hero summoned":
   `[ enable motion controls ]  tilt to move — or skip and use touch`. In-game, never show the sheet during the
   intro. If permission is still pending at FIGHT, show a small pill in the deck, not a full overlay. (P0-1)
2. **Make the touch-fallback hint match reality.** When `input.mode === "touch"`, the tips line should read
   `drag LEFT side = move · tap RIGHT side = attack · DASH / SKILL buttons`. Draw a faint left/right split for the first
   5 seconds. Hide the `⟲ recalibrate` button when sensors are off. (P0-2)
3. **Validate room codes before entering.** On the landing join box, accept letters only (strip digits like the server
   does), and require exactly 4 letters. Before navigating, check that the room exists (`/api/room/<code>` or the
   server's error reply). On a miss, show `room ABCD not found — check the code, or [create it]` and stay on the landing
   page. Handle the server's `"Use a four-letter room code"` error with a full-screen message plus a `back to start`
   button instead of a toast over a black page. (P0-3)
4. **Add a sticky next-step bar at the bottom of the phone lobby.** Non-owner: `✓ you're in as Render Branch Ranger ·
   waiting for judge to start`. Owner: `pick a boss ↓` (scrolls to the boss panel), then `▶ START (4 heroes)`. After a
   successful summon, collapse the repo picker to one line: `✓ gin-gonic/gin · change`. (P0-4)
5. **Plain-language labels on phones:** `hp`, `armor try{}`, `energy RAM`. In the autopsy: `dmg · best combo · limbs
   broken · revives · ☠ final blow`. Sensor pill: `motion: off (touch controls)`. (P1-1)

---

## P0: blocks or confuses most players

### P0-1 Sensor permission sheet covers the boss intro and the first seconds of combat
- **Screen / viewport:** game, phone portrait 390x844 (same at 360x640).
- **Shots:** `j-30-intro-1500ms-p390.png` (sheet over the intro), `j-30-intro-5000ms-p390.png` (sheet still up at
  T+00:09; the boss is already firing and `-5` damage numbers are visible behind it).
- **What's wrong:** `showMotionFlow()` runs as soon as the game screen mounts, so the dim overlay with
  `$ sudo enable-sensors` + `TAP TO ENABLE SENSORS` lands on top of the intro cinematic (which itself is squeezed into
  the deck, behind the SKILL/DASH buttons). It stays there into live combat. The player has to read a paragraph and tap
  while being shot. On iOS, which every judge with an iPhone has, this is the guaranteed first experience.
- **Fix:**
  1. Ask in the lobby (phones only): after the hero is summoned, show a card
     `🎮 motion controls — [ enable ] (tilt to move) · or [ use touch ]`. The tap is a user gesture there too, so
     `DeviceMotionEvent.requestPermission()` works. Remember the choice in localStorage.
  2. In-game, if still undecided, show a compact deck pill `tap to enable tilt` (≥44px tall). Don't use a full overlay.
     Never show it before the intro ends.
  3. Keep the intro readable: on phones, the intro text should sit in the viewport, not in the deck under the buttons
     (`j-30-intro-1500ms-p390.png` has the epithet text running behind SKILL/DASH).

### P0-2 Touch fallback: the hint says "tap = attack", but tapping the left half moves you
- **Screen / viewport:** game, phone portrait (all sizes), touch mode (sensors off/denied/unavailable).
- **Shots:** `j-40-fight-15s-p390.png`, `j-40-fight-8s-p360.png` (big joystick ring in the middle of the arena after a
  "tap"), `m-review-p360.png`.
- **What's wrong:** `kj-touch-joystick-zone` covers the left 50% and bottom 70% of the screen. A tap there spawns the
  joystick instead of firing. The floating tips line (`tilt = move · tap / swing = attack · DASH / SKILL buttons`) and
  the landing footer both promise tap-to-attack. In portrait, that zone also covers half the deck and half the arena. A
  first-timer taps the boss, sees a green circle appear, and the hero walks off.
  - The deck also shows `SENSORS: OFF` in red with a large `⟲ recalibrate` button that does nothing in touch mode. It's
    the biggest button in the deck after SKILL/DASH.
- **Fix:**
  - Mode-specific copy: in touch mode, `drag left side to move · tap right side to attack`. In motion mode,
    `tilt to move · tap anywhere to attack`.
  - In touch mode, show a 5-second ghost overlay: a dashed vertical split with `MOVE` on the left and `ATTACK` on the
    right, 40% opacity, which fades on first input.
  - Hide `⟲ recalibrate` unless `mode === "motion"`. Rename the pill `motion: off · touch controls` in neutral grey
    rather than error red. When off because of a denial, add `[retry]`.
  - In portrait, consider making the joystick zone only the left half of the **viewport**, not the deck.

### P0-3 Wrong room code → silent new room. Digit in code → blank screen.
- **Screen / viewport:** landing → room, all viewports.
- **Shots:** `13-wrong-code-p390-800.png` (typed `ZZZZ`: lands in an empty room with `★ you own this room`),
  `14-direct-link-p390.png` (`/r/OV39`: black page, toast `ERR Use a four-letter room code`, footer says `LINK OK`,
  and the client keeps reconnecting).
- **What's wrong:** The join box accepts `[A-Z0-9]` and as few as 2 characters, and the router accepts 2–12. The server
  only accepts 4 letters. A judge who types `0` for `O` gets a dead black screen with no button. A judge who mistypes
  one letter ends up "owning" an empty room and waits forever for friends who are in another room. The only hint is a
  small yellow `★ you own this room`.
- **Fix:**
  - Join input: `maxlength=4`, strip non-letters (map `0→O`, `1→I`), and disable `⏎` until there are 4 letters.
  - Joining an existing room vs. creating one should be explicit. When joining via the code box and the room has no
    players, show a full-screen `room ZZZZ is empty — wrong code?` with `[ back ]` and `[ create ZZZZ anyway ]`.
  - For any fatal server error before welcome, render a terminal-style error card with a `$ cd ~ (back to start)`
    button, and set the link pill to `LINK ERR`, not `LINK OK`.

### P0-4 Phone lobby: no clear "you're done / what now" after summoning
- **Screen / viewport:** lobby, phone portrait 390x844 and 360x640.
- **Shots:** `j-25-lobby-teammate-p360.png`, `j-20-lobby-squad-analyzing-p390.png`, `15-slow-analysis-1000ms-p390.png`.
- **What's wrong:** After summoning, the whole first screen is still the repo input, 10 chips, a bright green
  `▶ summon hero` and `Connect GitHub`. Success is a small `✓ HERO SUMMONED` tag about 1,300 px down. A teammate has
  nothing to do, but nothing says so above the fold. `waiting for judge to start…` is 10px text at the very bottom of
  the boss panel. The owner has to scroll past their own hero card to find the boss picker, then find START.
- **Fix:**
  - Sticky bottom bar (≥56px, above the safe-area inset), always visible on phones:
    - no hero: `① pick a repo above (or tap a chip)`
    - analyzing: `⟳ cloning gin-gonic/gin…`
    - ready, not owner: `✓ ready · waiting for judge to start (3 heroes in)`
    - ready, owner, no boss: `② pick the BOSS repo ↓` (tap scrolls to the boss panel)
    - owner, all set: `▶ START FIGHT (4 heroes)` as the bar itself
  - After a successful summon, collapse the picker to `✓ gin-gonic/gin · [change]`. Show the hero card right under it.
  - Make `summon hero` secondary (outline) once a hero exists.

---

## P1: confusing or slow for many players

### P1-1 Terminal-joke labels with no plain meaning on touch devices
- **Screens:** game deck/HUD and autopsy, all viewports. Shots: `j-40-fight-8s-p360.png`, `m-autopsy-p390-scroll1.png`.
- The HUD rows have `title=` tooltips (`armor: …`, `energy: …`), but phones have no hover. `try{} 0/4` and
  `RAM 220MB` read as noise. Autopsy columns `dmg combo limbs rev kb` are opaque, and `kb` + ☠ means "killing blow".
- **Fix:** Keep the joke, add the word: `♥ hp`, `◆ armor` (small `try{}` suffix), `⚡ energy` (`RAM`). Autopsy header
  `damage · best combo · limbs broken · revives · final blow`. On phones, the lobby hero stats `dmg/spd X1.00 · 85px/s`
  and `energy 185` mean nothing to a judge. Replace them with relative bars (`damage ▮▮▮▯▯ speed ▮▮▮▮▯`).

### P1-2 Text too small in the game HUD (6–9px)
- **Screens:** game, all viewports. Audit output (computed sizes): limb names in the boss bar are **6px** on phones and
  7px on desktop (`args Mandible`, `len Coil`…); `PHASE 1` and `SYNC COMBO` are 7px; the self-panel name and target name
  are 8px; the boss name is 9px on phones. Shots: `j-40-fight-15s-p390.png`, `j-40-fight-15s-d1280.png`.
- At 6–7px, Silkscreen is unreadable even at DPR 3. In the boss bar, limb segments are truncated to `ARGS MA…`,
  `PATH CL…`.
- **Fix:** 10px minimum for any pixel font (Silkscreen and Press Start 2P are designed for 8px multiples, so use 8/16
  on a DPR-aware grid). For limb segments on phones, drop the text and show the segment only. Name the limb in the
  hit/break toast instead (`✂ path Claw broken`). Desktop HUD side panels can use 11–12px.

### P1-3 Deck overlap at 360x640
- **Screen:** game, phone 360x640. Shots: `m-review-p360.png`, `j-40-fight-8s-p360.png`.
- The SKILL/DASH buttons (≈250px tall) sit on top of the team list's last row (`ada` is half hidden) and fully cover the
  event log (only its top line peeks out).
- **Fix:** At heights < 700, make the buttons ≤120px tall (still ≥44px wide targets) and drop the event log on phones.
  Put the team list in one row of chips (`judge ▮▮▮ · alice ✝ · bot ▮▮`).

### P1-4 Your own hero is hard to find on a phone
- **Screen:** game, phone portrait. Shot: `j-40-fight-8s-p360.png` (bob can't spot bob; `ALICE` is labeled, and the
  self-marker is a small yellow chevron among similar heroes and damage text).
- **Fix:** Draw a pulsing ring under your own hero, plus `YOU` instead of your handle above it, for the first 10 seconds
  and whenever you respawn or revive. Damage numbers on you should be drawn above the label, not over it.

### P1-5 The non-existent repo "succeeds" silently
- **Screen:** lobby, all. Shot: `05-lobby-missingrepo-p390.png`. Typed `nonexistent-user-xyz123/nope-nope` → instantly
  `✓ HERO SUMMONED`, `nope-nope Patch Paladin`. The analyzer served a synthetic offline profile (`fallback: true`), and
  the UI shows it as a real result. A judge who typos their repo name thinks it worked and later wonders why their hero
  has nothing to do with their code.
- **Fix:** If `profile.fallback` (or a new `synthetic` flag) is set, show an amber `⚠ couldn't read that repo — using a
  stand-in hero · [try again]` instead of the green `✓`. If the contract doesn't carry the flag to the lobby, that's a
  contract request for codex-net/codex-repo.

### P1-6 Reduced motion is ignored for canvas shake, flashes and full-screen glitches
- **Screen:** game, all. Only `.stage.glitch` CSS animations respect `prefers-reduced-motion`. Trauma shake, hit-stop
  zoom, white hit flashes, the phase-change full-screen glitch and the RGB split all run regardless (`client/app/game.ts`
  has no `matchMedia` check, and neither does `client/render/`).
- **Fix:** Read `matchMedia('(prefers-reduced-motion: reduce)')` once. When it matches, scale shake by 0.25, skip
  full-screen flashes and glitches (keep a 1-frame tint), and cap any full-screen brightness change to under 3 flashes
  per second (photosensitivity). Add a `?calm=1` or settings toggle next to mute.

### P1-7 Big-screen copy and density
- **Screen:** `?screen=1` lobby, 1920x1080. Shots: `j-21-bigscreen-lobby-d1920.png`, `18-bighost-d1920.png`.
- The copy says `scan to join · landscape · tilt to move…`, but phones are now portrait-only. Nothing says the **first
  phone to join becomes the host** (it does, as I verified), so the room sits at `owner is choosing…` with no owner.
  Squad cards use 11–12px text on a TV viewed from 3–5 m, and the right half of the screen is empty.
- **Fix:** Copy `scan with your phone (hold it upright) · first to join is the host ★`. Scale squad cards up 1.5–2x on the
  big screen, with the hero portrait at 96px+ and names at 24px. During the match, keep a small QR in the corner for
  late joiners (already on claude-ui's list).

### P1-8 Lobby state and toasts
- The `ERR repo must look like owner/name` toast sits on top of the room code and copy link for about 4 seconds
  (`04-lobby-badrepo-p390.png`). Show the error inline under the input, in red, and keep it until the input changes.
- `edit` (rename) uses a native `prompt()` and reconnects. On iOS that's a jarring system dialog. Use an inline input.
- The owner can START with `1 ready · 4+ recommended` while teammates are still `analyzing`. Show
  `alice still cloning… start anyway?` on the first press.

### P1-9 Taunt bubble wraps into a tall, narrow column and truncates mid-sentence
- **Screen:** game, phone portrait. Shot: `j-30-intro-5000ms-p390.png` (`Known bug: TODO: In the next semver breaking
  release, we should` stacked one word per line, cut off).
- **Fix:** Set `min-width: 60vw` on phones, a 2-line clamp with ellipsis, and shorten TODO taunts to about 60 characters
  at the source.

---

## P2: polish

- **P2-1 Landing footer collides with the mute button and wraps** (`01-landing-p390.png`, `01-landing-p360.png`): the
  `♪ ON` button sits on top of `DASH +`, and at 360x640 the footer overlaps the third fact line. Hide the footer on
  phones (the facts already say it), or move mute to the top-right.
- **P2-2 Small targets:** `♪ on` mute is 38x18 on every screen. The join `⏎` is 38x40 with a tiny glyph that reads as an
  empty box. Landing `[ hall of monsters ]` is 21px tall. Desktop lobby chips are 21px tall, and `copy link`/`edit` are
  20px. Make all of them ≥44px on touch and ≥32px on desktop, and label `⏎` as `join`.
- **P2-3 `[ host on big screen + QR ]` wraps with an orphan `]`** on phones (`01-landing-p390.png`). Hide it on phones
  (you don't host a big screen from a phone), or shorten it to `[ big screen ]`.
- **P2-4 Phones don't see the game on the landing page.** On desktop the backdrop shows heroes and the boss silhouette.
  On a phone it's just the logo and buttons, so a judge can't tell it's a boss fight. Put one hero sprite and the boss
  silhouette under the tagline on phones.
- **P2-5 Near-identical hero names in one squad:** alice (facebook/react) is `render Branch Ranger` and bob
  (gin-gonic/gin) is `Render Branch Ranger` (`j-27-lobby-ready-d1280.png`). In the team list they're
  indistinguishable. This is for the design/sim owners: de-duplicate titles within a room.
- **P2-6 Autopsy on phones drops `× broken` / `survived` words**, so the limb outcome is color plus strikethrough only
  (`m-autopsy-p390.png` vs `m-autopsy-d1280.png`). Keep a `✗`/`✓` glyph on phones.
- **P2-7 Autopsy share is at the very bottom on phones** (3 screens of scrolling, `m-autopsy-p390-scroll2.png`), and
  `save card.png` downloads a file, which iOS handles badly. Add a `share ↗` button next to REMATCH that uses
  `navigator.share({ files: [png] })`, falling back to download.
- **P2-8 Fixed `♪ ON` + `LINK OK` pills overlap autopsy and lobby content** at the bottom-right (`m-autopsy-p390.png`,
  where they cover the diff text). Give the scroll containers `padding-bottom: 56px`.
- **P2-9 Hall of Monsters truncates names to 2 characters** on the 1920 landing (`01-landing-d1920.png`: `w…`, `[BO…`),
  and the numbers have no unit (they're damage). Use `1. 5522 dmg · alice vs flask` with a wider column.

---

## E: environment issues (for the coordinator, not claude-ui)

- **E1 The dev server full-reloads every client when `data/fallback/*.json` is written.** I saw Vite
  `{"type":"full-reload","triggeredBy":".../data/fallback/rust-lang__rustlings.json"}` repeatedly. That reload killed two of
  my match runs mid-fight. If the demo runs on a dev server and anything (cache, precompute) writes under the project
  root, every phone reloads mid-match. Add `server.watch.ignored: ['**/data/**', '**/.cache/**']` to the Vite config, or
  demo from the production build.
- **E2** The Vite HMR client tries `ws://localhost:5173` when the page is on :5175 (console errors). Harmless, but noisy
  in every playtest log.

---

# Portrait re-audit (pass 2, after `DONE (portrait)`)

Phones: 390x844, 360x640, 430x932 (isMobile, hasTouch, DPR 3). Shots: `p2-*`, `p3-*`, `m3-*`, `r1-*`. Live runs used 2–3
phone contexts plus AI teammates; `?mock=match|review|autopsy` covered the late fight states.

**Verdict:** The portrait layout works. The camera follows the hero, the boss gets an edge arrow, the minimap is readable, the
rotate guard is clean (`p3-rotated-landscape.png`), the lobby, landing and autopsy are single-column with no horizontal
overflow at any width, and the thumb buttons are big and easy to hit. What's left is density and overlap.

### Fixed since pass 1
- Landing: footer/mute collision is gone and "host on big screen" is hidden on phones (`p2-landing-p360.png`).
- Deck: the team list no longer sits under SKILL/DASH at 360x640 (`m3-fight-24s-p360.png`), and the event log is dropped
  when there's no room.
- Hero card stats are relative pips (health/armor/energy/damage/speed) instead of `×1.00 · 77px/s`
  (`p3-intro-2500-p390.png`).
- The autopsy keeps `✗`/`✓` on phones, columns read `damage · best combo · limbs broken · revives · final blow`, and REMATCH
  is at the top (`m3-autopsy-p390.png`).
- Code review: a 3-card strip sits in the deck, at least 10px everywhere (`r1-review-p390.png`).

### Still open / new in portrait
- **PR-1 (P1) Floating combat text piles up over the boss at portrait zoom.** `-13 CRIT`, `RETURN`, `CATCH`, `-19`, `-31` and
  the enemy glyph bullets stack into one unreadable blob exactly where the player aims (`p2-revived-p390.png`,
  `m3-fight-24s-p360.png`). At 2–3x camera zoom, the same text covers about 3x more of the view than in landscape.
  **Fix (claude-boss, drawEvents with `view`):** cap floating texts to 4 on screen when `view.w < 300`, merge damage
  numbers on the same target within 250 ms (`-63` instead of three numbers), and only show word callouts (`RETURN`,
  `CATCH`, `PANIC!`) for hits by YOU.
- **PR-2 (P1) Intro text still runs behind SKILL/DASH.** In the motion/seated profile intro, the genesis panel plus
  `$ git clone… / WARNING: KAIJU DETECTED / LODASH, THE DEPENDENCY…` is drawn under the thumb buttons
  (`r0-game-controls-motion-1500-p390.png`, `p2-intro-2500-p390.png`). **Fix:** during the intro, hide the thumb buttons
  (they're useless for 3 s), or end the intro block at `bottom: calc(var(--btn-h) + 12px)`.
- **PR-3 (P2) Touch joystick ring shows during the intro and outros.** The ring sits on top of `CLASS DISMISSED` and the
  intro (`em-dismissed-p390.png`, `p3-intro-700-p360.png`). Hide `.kj-touch-joystick` while an intro or outro is playing.
- **PR-4 (P2) The ghost split's "ATTACK · tap anywhere" contradicts the split.** The left half moves you
  (`r0-game-controls-touch-5000-p390.png`). Use `ATTACK · tap here`. The ghost also overlaps the `$ ./fight --now` FIGHT
  flash. Start it after the flash ends.
- **PR-5 (P2) The sticky next-step bar covers the bottom of the hero card.** Stats rows scroll under it with no padding
  (`p3-lobby-waiting-p360.png`). Add `padding-bottom: calc(var(--next-step-h) + 16px)` to `.lobby-scroll`. For the owner,
  the bar's `▶ START FIGHT (6 heroes)` and the yellow `$ ./fight.sh` button are both on screen at once
  (`p3-intro-2500-p390.png`). Keep one: hide the in-panel button on phones.
- **PR-6 (P2) The lesson/toast chip in the deck is clipped.** `TEST Test` is cut off at about 180px wide
  (`e-live-20s-p390.png`). Give it full deck width.

### PR-0 (P0, environment) A match silently fell back to the lobby
- In run `p3`, both phones entered the intro (`p3-intro-700-p360.png`, 15:45:51). Two seconds later both were back in the
  lobby (`p3-intro-2500-p390.png`), with no message, and stayed there. Later, ownership had silently moved to bob (the 360
  phone shows `★ you own this room` in the final audit). The dev server process restarted during the session (pid start
  15:51), and earlier runs (`k-*`) ended on blank black screens (`k-end-p390.png`), so the likely cause is the shared dev
  server restarting or reloading (E1). Whatever the cause, the player-facing part is a UX bug:
  - **Fix (codex-net + claude-ui):** if the client was in `match` and the next state is `lobby` without an autopsy, show a
    toast or banner: `⚠ the match was interrupted (server restarted) — the host can start again`. If `ownerId` changes,
    toast `★ you are now the host` to the new owner and `host is now bob` to everyone else.
  - **Demo risk:** run the demo on the production build, not the shared dev server (see E1).

---

# P0 re-check (after `DONE (ux p0)`)

Shots: `r0-*`.

| P0 | Status | Evidence |
| --- | --- | --- |
| P0-1 sensor sheet over intro and fight | **Fixed.** The lobby `controls` card (`tilt phone · seated / small moves · touch only`) confirms the choice in plain words (`✓ touch: drag to move · tap to attack`). In-game there's no sheet in either profile. `motion-enable` was not visible, and the pill reads `touch controls` / `motion: waiting`. | `r0-controls-controls-touch-p390.png`, `r0-game-controls-touch-5000-p390.png`, `r0-game-controls-motion-1500-p390.png` |
| P0-2 touch hint mismatch | **Fixed.** The hint reads `drag on the arena to move · tap to attack · DASH / SKILL buttons`, a MOVE / ATTACK ghost split shows for 5 s, the pill is a neutral grey `touch controls`, and `⟲ recalibrate` is hidden in touch mode and shown in motion mode. Small wording nit: see PR-4. | `r0-game-controls-touch-5000-p390.png` |
| P0-3 wrong / digit room codes | **Fixed.** `join` is disabled under 4 letters, `0V39` is cleaned to `OV`, and an unknown `QXZW` stays on the landing page with `room QXZW not found — check the code, or create QXZW`. `/r/OV39` shows `fatal: "OV39" isn't a room code … $ cd ~ (back to start)`. Nit: `/r/AB12CD` → `ABIC` shows the "Room not found" card while the link pill says `LINK LOST · RETRYING`. Stop reconnecting and show `LINK ERR` after a fatal error. | `r0-join-notfound-p390.png`, `r0-direct-digits-p390.png`, `r0-direct-bad-p390.png` |
| P0-4 no next step in phone lobby | **Fixed.** The sticky bar shows `⟳ cloning facebook/react…` → `✓ ready as Render Branch Ranger · waiting for judge to start (6 in)` → owner `▶ START FIGHT (6 heroes)`. The picker collapses to `✓ gin-gonic/gin · change`. Nits: see PR-5. | `p3-lobby-waiting-p360.png`, `p3-intro-2500-p390.png`, `r0-controls-controls-touch-p390.png` |
| QW5 plain labels | **Fixed.** The deck shows `♥ hp · ◆ armor · ⚡ energy`, and autopsy columns are spelled out. | `m3-fight-24s-p360.png`, `m3-autopsy-p390.png` |

Still open from pass 1: **P1-5** (stand-in hero for a repo that doesn't exist shows a green ✓; blocked on a contract flag),
**P2-4**, **P2-5**.

---

# Edu mode (classroom PvP) audit (after `DONE (edu pvp)`)

Teacher = `[ 🎓 classroom: teacher on projector ]` on a 1920x1080 desktop. Students = 390x844 and 360x640 phones joining
by code. A real classroom room (`e-*`) went from lobby → report cards → `$ make brawl` → round 1 live. `?mock=edu-match` and
`?mock=edu-autopsy` covered lessons, the end screen and the class report (`em-*`, `ea-*`). **The between-round quiz never
appeared in any run, so it is not audited.**

**Verdict:** This is a strong classroom flow. The teacher creates the room in one click, students see `waiting for the
teacher to start`, and lesson cards on the projector are large, friendly and tied to real repo facts (`e-live-12s-d1920.png`:
"Every quick hack and TODO is a loan against the future… `django/django` carries 62 TODO/FIXME/HACK notes."). The main
problem is the **report card**. It's written for people who already know the concepts. A CS-101 student sees
`Average fan-out 5.0; dependency depth 1` next to a C with no idea what fan-out is or whether 5.0 is bad.

### EDU-1 (P0) Report-card lines use jargon and raw numbers with no scale
- **Where:** student lobby (`e-student-ready-p390-scroll1.png`), class report (`ea-autopsy-p390.png`).
- **What's wrong:**
  - Concepts are not explained where they're graded: `fan-out`, `dependency depth`, `cohesion`, `definitions/file`,
    `kLOC`, `Documentation score 79%`.
  - A raw number alone doesn't tell a student if it's good. The tip at the bottom repeats the same jargon
    (`Reduce cross-module dependencies and split long dependency chains`).
  - Each row has two names (`try{} armor`, `dmg damage`, `RAM energy`, `gc() regen`, `debt weakness`), and the arrow
    `← tests` reads as "armor comes from tests" only if you already get the metaphor.
  - Only the lowest grade has a tip. B rows with an obvious problem get nothing: `longest 643 lines` under a B for damage.
- **Fix (claude-edu `report.ts`/`quality.ts`; copy proposals):** use one fixed 3-line shape per stat:
  1. `C  speed — how independent your files are`
  2. `each file imports 5 others on average (A-grade repos: ≤ 2)`
  3. `try: move shared helpers out of utils/ so files import less`
  - Always show the scale ("A ≤ 2 · B ≤ 3.5 · C ≤ 5"), or a 5-pip bar with a marker.
  - Make the concept word a tappable link to the glossary animation that already exists.
  - Drop the code alias, or show it small after the plain word: `armor (try{})`.
  - Give every B-or-worse row one concrete tip, and make it reference a real file whenever one exists (`longest
    function: views.py: dispatch(), 643 lines → split it`).
  - Merge `gc() regen` into `energy`. It says "same source signals as RAM", so it adds a row and no information.

### EDU-2 (P1) Weakness grading direction is unclear
`B debt weakness ← loops + TODOs`: does B mean a small weakness (good) or a big one? Every other row is "higher = stronger
hero". **Fix:** rename it to `tech-debt penalty` and grade the health of the code, so A = no penalty. Add the effect in
plain words: `B → you take +5% damage (1 circular import, few TODOs)`.

### EDU-3 (P1) Grades contradict each other on one screen (mock data, but check the real thresholds)
In `ea-autopsy-p390.png`, `@ada` is grade B in the ranking but "best tests A: 24% of files", while `@ana` gets C for "25%
of files". In the real room, two very different repos (django/django and jquery/jquery) both show `code grade B · GPA 3.1`
(`e-teacher-lobby-2ready-d1920.png`). That may be a coincidence, but students compare grades with each other immediately.
**Fix:** codex-sim/claude-edu should verify that grades are monotonic in the shown number and that GPA is computed from the
visible letters. Show the threshold on hover or tap (see EDU-1). Remove fakeQuality inconsistencies from the mock so demos
don't show contradictions.

### EDU-4 (P1) Projector copy and roster aren't classroom-ready
- The teacher's projector says `★ the first phone to join is the host`, but in classroom mode the projector itself is the
  owner (`★ you own this room` on the projector, and students read `waiting for the teacher to start`). It's
  contradictory, so a student may think they're in charge. **Fix:** in edu, say `students: scan to join · the teacher
  starts the brawl here`.
- The roster shows 8 slots (`slot 1 · scan to join` … `slot 8`) although edu allows 30. Names are about 16px and
  `CODE GRADE B · GPA 3.1` is about 8px, which is unreadable from the back of a classroom (`e-teacher-lobby-2ready-d1920.png`).
  **Fix:** in edu, show a dense grid of joined students only (avatar 48px, name 20px, grade letter 28px), plus a
  `12 / 30 joined · 9 ready` counter in 32px. Hide empty slots.
- `AI teammates` on the projector should be `AI classmates (bots)`. In PvP they're opponents, not teammates.

### EDU-5 (P1) Live leaderboard is tiny on the projector
During the brawl, the leaderboard is a 16px list in the top-right (`e-live-12s-d1920.png`, `em-quiz-d1920.png`: `ada 3 KO`).
The lesson card takes the bottom third over the arena where heroes fight. **Fix:** on `?screen=1` in edu, move the
leaderboard into the empty right gutter at 24–28px with the top 10, and put lesson cards in the left gutter (or make
them 70% opaque and cap their height at 22%). The scoreboard banner `$ ./brawl round 1/3 · ★ leader` is good. Keep it.

### EDU-6 (P1) Edu intro on phones says the opposite of edu rules
The phone intro genesis panel reads `repo shape -> stats: same 5-pt budget` (`em-lesson-p390.png`). In classroom mode,
stats come from code quality and are **not** an equal budget. That's the core lesson, contradicted in the first 5 seconds.
**Fix (claude-edu/genesis):** in edu, use `code quality -> stats (see your report card)`.

### EDU-7 (P2) Class report polish
- Ranking columns `KO · RND · GRD` are abbreviations. Use `KOs · rounds won · code grade` on phones, wrapping the header to
  2 lines if needed.
- The highlights list wraps inconsistently: `best documentation @octocat` then the value on its own line
  (`ea-autopsy-p390-scroll2.png`). Use a 2-column layout (label / `@who grade · value`).
- The glossary says "Concepts you met this match (✓)", but no item shows a ✓ (all show `·`). Either mark the met ones or
  drop the sentence.
- `GPA 2.5` is 8px on phones. Use at least 12px.
- On the phone, the lesson in the deck is 8px (`lesson`, `tap: learn more`). Use at least 10px.
- Mock-only: `?mock=edu-match` ends with `CLASS DISMISSED` after 25 s in round 1/3 with 0:51 left (`em-dismissed-p390.png`).
  Fine for screenshots, but don't use it to judge pacing.

### Not verified
The between-round quiz (projector + phone pads, the explanation afterwards), 30-student scale, and edu on the
production server. I'd re-run these once the real PvP sim emits quiz offers.
