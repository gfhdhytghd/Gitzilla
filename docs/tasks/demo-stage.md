# /demo: a live-demo "slide" page. Maximal visuals, animated, actually live.

User request: "build a webpage for the live demo. It will be used as a slide, but visual-maxxing and animated."

It will be projected at 16:9 (1920×1080, and it must also look right at 1280×720) from https://gitzilla.wilflin.me/demo
while the presenter talks. It is a **real page in the app** that uses our art, renderers and live server, not a static deck.

## Scenes
Navigation: → / Space next, ← back, F fullscreen, numbers jump to a scene. A clicker (PageDown/PageUp) works too. A thin progress bar runs along the bottom. Every scene has an entrance animation plus continuous ambient motion.

1. **Title.**
   - The hand-drawn GITZILLA wordmark (public/gitzilla-wordmark.*) drops in, followed by the animated pixel kaiju mark (logo.ts `createMarkAnim`).
   - CRT/glitch pass, glyph rain, a parallax arena backdrop (backdrop.ts).
   - Tagline: "Your GitHub repo is a living monster. Now make it fight."
2. **Code → creature (live).**
   - A famous public repo from data/fallback (rotate react / redis / flask) compiles on stage: the Genesis "compile" cinematic (client/genesis public API) turns files, imports and cycles into a boss.
   - Its real heart file and limb names appear in callouts.
   - Never use private repos or tokens.
3. **Your phone is the controller.**
   - A big animated phone silhouette demonstrates tilt, swing, twist and spin, each paired with the matching hero action. Use the real hero renderer (playerPortrait / drawPlayer) for the hero on the right.
   - Haptic "pulse" rings on each gesture.
4. **Three ways to play.** Animated cards, each a looping mini-scene from the real renderers in a headless/mock sim:
   - co-op raid vs the boss
   - PvP royale with the GC zone closing
   - classroom (a code-to-damage bar)
5. **Join NOW (live).**
   - The page creates a real room as owner, the same way the landing "create" flow does.
   - It shows a giant QR code and the room code, with the URL in big type.
   - As audience phones join, their heroes pop into a live roster wall with confetti and a pixel sound.
   - Shows the count of players joined and a "Start" button (the presenter clicks it). The match then opens on this screen as the spectator big screen. Prefer the 3D view, `?view=25d`, falling back to 2D.
6. **Under the hood.** Animated pipeline diagram:
   - GitHub tarball → import graph across 9 languages (Tarjan SCC) → Gemini structured art direction → authoritative 30 Hz sim → 20 Hz snapshots → phones.
   - Plus the stack logos-as-text: Gemini API · Auth0 · Vision Pro WebXR.
   - Live numbers from `/api/hall` (fastest kills, royale wins).
7. **Vision Pro.** A short looping 3D tabletop clip from the stage25d scene (canvas mode), with "Open on Vision Pro: gitzilla.wilflin.me/r/CODE?screen=1&view=xr".
8. **Close.** The wordmark returns, the boss "dies" in a pixel explosion, and the end card shows "Scan to keep playing" with the QR again.

## Rules
- **Visual maxxing:** bold type, neon terminal palette (match the game), pixel crispness, depth/parallax, particles, screen shake on beats, smooth 60 fps.
- **Smooth in Chrome and Safari.** Respect `prefers-reduced-motion` with a calm variant.
- **Robust for a live stage:**
  - Works offline except scenes 5 and 6, which fall back gracefully, e.g. "Wi-Fi down: here's the recorded match".
  - Every scene can be re-entered without leaking timers or sockets.
- **No secrets, no private repo content, nothing to Gemini at runtime.** The page reuses existing APIs only.
- **New server endpoints:** if you think one is needed, ask the coordinator; it would go to codex-net.
- **Files:**
  - New `client/demo/` (scenes, styles).
  - A `/demo` route in main.ts, minimal edit.
  - The page is `demo.html` or reuses index.html. Pick the simplest option that works with Vite build and the server's static handling.
- **Verify:**
  - WebKit + Chromium at 1920×1080 and 1280×720: screenshots of every scene, plus a short recorded run-through (Playwright video) to check the motion.
  - The live-join scene with 3 simulated phones joining.
  - Report fps per scene.

## Addendum (user): highlight what the HackPSU judges care about
- **Map scenes to tracks.** Tag each relevant scene with a small animated "track" badge. These are targets, not awards; never write "winner":
  - Phone motion → **Mystery Stack**: phone motion as the core control, direct rivalry in PvP royale, 4+ people, bragging rights with the royale wins board.
  - Classroom → **Nittany AI Challenge** (education).
  - Repo → kaiju → **Best Use of Gemini API**.
  - GitHub sign-in / phone controller → **Best Use of Auth0**.
  - Title and close → **Grand Prize**.
- **Expand the edu scene into a full scene of its own** (not just a card). Show the real teacher flow, with animated mock-ups built from the real classroom components or mock data:
  - the student task card (goal, to-dos, "done when" ✓/✗ live), the in-browser Python editor running code;
  - submitting and the class attack hitting the shared boss;
  - the teacher's round debrief ("what to reteach", "need help", shout-outs);
  - the projector view with no names.
  - Line: "Code quality becomes damage. Teachers see who needs help."
- **Expand the phone-motion scene.** Show the four gestures at large size with the real motion icons. Show 4 phones around one projector, with a "PvP royale · last one standing" kill feed. Mention it also works as a gamepad linked to a big screen or Vision Pro by your GitHub account.
- **Show repo → kaiju as explicit linked mappings.** For a real public fallback repo (e.g. redis/redis, facebook/react), draw animated connector lines from repo facts to monster parts, using the real analysis data in data/fallback:
  - top components → limbs, labelled with real names;
  - the most-imported file → heart;
  - import cycles → red glowing weak points;
  - language → hero class/weapon (Rust cannon, Go SMG, Python staff…);
  - stars/contributors/LOC → PvP POWER;
  - commits/TODOs → taunts / "recent sins".
  - Show the repo URL as a clickable link and the monster's generated name. Let the presenter press a key to cycle through 3 repos.
