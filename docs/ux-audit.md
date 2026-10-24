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
