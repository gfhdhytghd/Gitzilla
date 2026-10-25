DONE (dash swipe copy) — motion slide dash card:
- Label is "SWIPE or TILT HARD → dash" (two-line label sized to fit; note "swipe, or tip 50°+ any way").
- The 3.6 s loop is a hard tilt right, a hard tilt left, then a fingertip swiping across the flat screen with a soft
  trail and the direction arrow. The hero dashes on all three beats.
- WebKit video and dash-strip.png are in docs/ux-shots/demo/motion/.
- Overflow passes in Chromium + WebKit at 1920/1280; both flash checks pass. No commits.

DONE (body-plan count) — the stack slide's tile is "10 boss body plans · in 13 elements", counted from claude-boss's
renderer. Body plans: the renderer has no exported list, so the slide runs its own `bossVariety()` over every
archetype × limb count × component mix × 24 seeds and counts distinct forms. That matches the `BossForm` union's 10
today and follows new plans. Elements: `Object.keys(ELEMENTS)` from client/render/boss/variety.ts (13). Overflow check
passes in Chromium + WebKit at 1920/1280. No commits.

DONE (demo safety pass) — /demo:
- Vision Pro slide no longer runs live WebGL or <video>;
- both QRs are plain PNG images, verified by decoding;
- new spin (horizontal orbit) and dash (tilt hard) animations;
- swipe/tap navigation, verified on WebKit iPad landscape;
- copy tweaks.
Every check passes in Chromium + WebKit at 1920/1280. No commits.

## Demo safety pass (2026-10-25)
- **Vision Pro white flashes, root cause:** the live 3D slide called the game's `drawPostFx`, whose crit flash
  paints the whole overlay white with a dithered vignette. My capture caught 79 near-white frames (mean 0.92 vs
  0.06) in 8.5 s, in bursts every 0.5–2 s. My earlier Chromium check missed it: it sampled every other frame for
  only 3 s. **The same flash exists in the real game's big screen and needs an owner** (photosensitivity).
- **Fix:**
  - The slide is a pre-rendered loop: an 8 s flat tabletop captured from the real stage25d with post-FX off. Every
    frame checked: max frame mean 0.073, max jump 0.009, seamless 0.5 s crossfade loop.
  - Shipped as an animated WebP in an `<img>` (1.4 MB) over a black poster background, under the gentle CSS tilt.
  - **Not `<video>`:** in Playwright WebKit the H.264/VP9 `<video>` crashed the page twice in 12 s (a crashed page
    paints white); with the video blocked it never crashed.
  - No slide uses WebGL or post-FX any more (all canvases are 2D; `drawSim` lost its post-FX option). Canvases
    are transparent on a dark stage.
  - Reduced motion shows the still poster.
- **QR shown solid black:**
  - Both QRs are now a plain `<img>` of a 1036 px black-on-white PNG (37 modules × 28 px, quiet zone included),
    inlined by Vite as a data URI.
  - `isolation: isolate`, no filter or blend, no scan line, and the stage's CRT overlay is switched off while the
    QR slides show.
  - **Decoded with zbar from real screenshots:** WebKit + Chromium × 1920/1280, play + close slides, all
    "https://gitzilla.wilflin.me".
- **WebKit flash check** (`safety.mjs`): one fresh page per slide, screenshots for 5 s, paced to ~10 fps; WebKit
  managed 3–10 fps at 1920 and 5–10 at 1280. Every slide passes in both engines and both sizes: max frame-to-frame
  mean-luminance jump 2.4% (threshold 20%). The Chromium screencast check also passes on all slides at both sizes.
- **Motion slide:**
  - **Spin** is a horizontal orbit around the phone's long axis, seen in perspective: an ellipse, the phone upright
    and facing the viewer, bigger and in front when near, smaller and behind the ring when far, with a soft shadow,
    never rotating (`motion/spin-strip.png`).
  - **Dash** is "TILT HARD → dash · 50° or more, any direction": a steep tip right then left, with a direction arrow
    and a dash streak (`motion/dash-strip.png`). Forward/back hard tips turned the flat phone edge-on, so they're
    not shown. The haptic pulses are smaller round rings.
  - WebKit video: `motion/motion-slide-webkit.webm`.
- **Touch navigation** (pointer events, touch/pen): swipe left/right (≥ 50 px, mostly horizontal, < 600 ms) and taps
  on the outer fifths. A second finger cancels; links/buttons keep their taps; 300 ms lockout.
  `touchtest.mjs` (WebKit, iPad Pro 11 landscape) passes all 12 cases:
  - real taps, swipes, vertical drag, slow, short and two-finger swipes;
  - swipe on beats, and a rapid double swipe gives exactly 2 steps;
  - scale-to-fit 1194×672 in 1194×834.
- **Copy:** the Vision title is now "Put the fight on a table in front of you.". "boss body plans" is counted from
  `sim/archetypes.ts` `ARCHETYPE_DECKS` (a `Record<BossArchetype>`, so new body plans are counted automatically).
- **Checks:**
  - network/overflow: 0 `/api`, 0 `/ws`, no overflow, no page errors, in all 4 configs;
  - root tsc: 0 errors;
  - prod build: OK;
  - vitest: one failing file, `qa/artifacts/rematch-boss-fix-server-2026-10-25/.../receipts.test.ts`. That's someone's
    QA artifact copy, which vitest now picks up; it's not mine.

DONE (demo deck pass) — /demo is now a pure presentation:
- no rooms, sockets or API calls;
- "Play it yourself" slide with a bundled homepage QR;
- motion slide gestures redrawn to the real semantics (incl. the new circle spin);
- photosensitive-safe deck (WCAG 2.3.1);
- labels fit their boxes.
Checked in Chromium + WebKit at 1920/1280. Artifacts in docs/ux-shots/demo/. No commits.

## Demo deck pass (coordinator corrections, 2026-10-25)
- **No hands-on part.**
  - Removed `client/demo/live.ts`, the join wall, START, the room creation and the big-screen handoff.
  - Slide 7 is now "Play it yourself": a big QR to https://gitzilla.wilflin.me (bundled `client/demo/qr-home.svg`,
    generated from server/qr.ts and verified by decoding), the typed URL, 3 steps, and real heroes.
  - The close slide uses the same QR: "Scan to start playing".
  - Vision Pro's bottom line is just "Open on Vision Pro".
  - "Under the hood" no longer calls /api/hall. It shows static facts from code/data: 15 pre-analyzed repos (counted
    from data/fallback), 4 archetypes, 8 players per raid, 4 UI languages.
- **Network assertion** (`docs/ux-shots/demo/deckcheck.mjs`, whole deck by keyboard): 0 `/api/*` requests and 0 `/ws`
  sockets in Chromium and WebKit at 1920 and 1280. The only socket is Vite's dev HMR (`/?token=`), which doesn't
  exist in prod. The built demo chunk contains no `/api/`, `/ws` or `new WebSocket`.
- **Motion slide**, each gesture per input/README and docs/tasks/spin-circle.md:
  - **tilt:** a flat phone tips right / top-down / left / bottom-down, a level ball rolls downhill, and the hero
    walks that way.
  - **swing:** one sharp flick with a ghost trail and speed lines → attack.
  - **twist:** a wrist turn around the long axis, out to ~80° and back → dash.
  - **spin:** the phone travels a circle by translation only, upright every frame (`motion/spin-strip.png`), with a
    lagging trail → skill on each completed circle.
  - Hero inputs fire on the same beats as the animation.
  - WebKit video: `motion/motion-slide-webkit.webm`.
- **Overflow:**
  - "authoritative sim" became "game server" (sub: "authoritative sim · 30 Hz"). The pixel-font word can't fit a
    pipeline box at any wrap.
  - The task card's expected output wraps on the slide (it was a scroll box).
  - Automated check: every text element's scrollWidth ≤ clientWidth and its box stays inside its parent (2 px).
    Elements still running an entrance animation are skipped. All 13 slides/beats pass in both engines at both sizes.
- **Photosensitive safety** (always on, not only reduced motion):
  - Removed screen shake (now a 0.6% smooth swell), glitch transitions (now fade/slide), CRT flicker (static
    overlay), the title glitch (gentle float) and the close slide's white flash (the boss fades out). The cursor
    blink is a soft fade.
  - `flashcheck.mjs`: Chromium screencast ~30 fps for 3 s from each slide's entry (close: 7 s, through the
    explosion), 64×36 luminance grid. A swing = >10% of the screen changing by >0.2.
  - Result: every slide 0 swings, max 0 per 1 s, largest change 0–4.4% of the screen.
  - Positive control (6 Hz full-screen white toggle): FAIL, 13 swings/s. The detector works.
- **Checks:** root tsc clean; vitest 1285 passed; prod build OK (demo chunk 70 KB / 27.5 KB gzip).

DONE (demo stage) — /demo live-demo slide page: client/demo/ (10 scenes, 13 beats) + one route line in client/app/main.ts. Verified in Chromium + WebKit at 1920 and 1280, Playwright run-through video, fps per scene, live join with 3 simulated phones on :5175. Artifacts in docs/ux-shots/demo/. root tsc clean; vitest 1218 pass. No commits.

## Demo stage (docs/tasks/demo-stage.md)
- **Open:** `https://gitzilla.wilflin.me/demo` (deep link `?scene=N&beat=B`). Keys: → Space PageDown Enter next ·
  ← PageUp Backspace back · 1–9, 0 jump · F fullscreen · R next repo (redis → react → flask). Fixed 1920×1080 stage,
  scaled to the window, so 1280×720 is the same picture.
- **Scenes** (track badges = targets, never "winner"):
  1. Title [Grand Prize] · 2. Genesis compile, rotating repos [Gemini] · 3. Repo → kaiju wiring [Gemini]
  4. Phone motion: 4 gestures driving a real hero / 4 phones + projector royale with kill feed [Mystery Stack, Auth0]
  5. Three ways to play (real sims) · 6. Classroom: task card + editor / class attack / debrief [Nittany AI]
  7. Join now (live room, QR, hero wall, START) [Mystery Stack] · 8. Under the hood + live /api/hall [Gemini, Auth0]
  9. Vision Pro tabletop (stage25d) · 10. Close: boss explodes, "Scan to keep playing" [Grand Prize]
- **Real parts:** real sim + renderers, data/fallback analyses + data/design Gemini designs, createTaskCard,
  highlight(), createDebriefCard, playGenesis, createStage25d, POST /api/room + net.ts, /api/qr, /api/hall.
  Classroom slide uses a labelled sample class. Nothing calls Gemini at runtime; no tokens or private repos.
- **Robustness:**
  - Every scene's timers, listeners and frame callbacks go through a Life and die on exit. A probe over 3 full
    keyboard cycles showed flat intervals (2), timeouts (1), sockets (2: live room + Vite HMR), DOM (98 nodes) and heap.
  - Wi-Fi down: join shows a local recorded match; hall says "offline", never invented numbers. A dropped socket
    shows "reconnecting…" and keeps the QR.
  - The stage is pinned to English (session-only `setClassroomLanguage("en")` + `translate="no"`). The projector
    laptop's locale can't translate the slides.
  - Reduced motion: no shake, confetti, glitch or typing; entrances land instantly.
- **fps** (Chromium headless on the real GPU, 1920): 60 on every scene except Genesis 46–53 (the existing cinematic)
  and a one-off 110–160 ms hitch entering Vision Pro (3D shader compile). WebKit headless (software): 49–62.
- **Live join on :5175** (with codex-net's screen host, `POST /api/room?mode=battle&host=screen` → `{room, hostToken}`;
  the token goes only into the local screen-token slot, never into a URL):
  - 3 phones joined *before* any action and the stage still hosts ("this screen hosts · ▶ START picks the boss and
    starts the fight"). The wall showed the real heroes.
  - START from the stage → setBoss (featured repo) → start → the stage becomes `/r/CODE?screen=1&view=25d`, running
    the 3D fight (desktop players; `join/5-bigscreen-fight.png`, about 4 s from click to fight).
  - Simulated iPhones (no sensors): the server refuses start. The stage stays on the wall and shows the reason
    ("3 phones need to tap enable motion: maya, leo, sam · press START again"); START retries.
  - Ownership moves to the first player if the stage's socket closes, so the stage only leaves /demo after the
    match has started. Reloading /demo with phones in the room gives the host to the first phone.
- **For claude-ui:** the big-screen lobby still says the first phone is host ("waiting for MAYA to start") even when
  the screen owns the room.
- **Note:** after START the big-screen page uses the laptop's own language (the English pin is per page).
- **Checks:** root tsc passes; vitest 1218 passed.

DONE (task text) — 27 preset steps × en/zh/es/fr have a StepBrief, a new title and summary instructions, per-step starter TODO comments and a README; the default lesson is rewritten; check labels are cleaned up. Proposed rewrites for student copy owned by other agents are in docs/classroom-copy.md. Full suite 998 pass, tsc clean, take-edu's 108-case brief validation passes. No commits.

## Task text: content mapping (for take-edu)
- Checks/paths/evidence stay exactly as they are; only text changes.
- `brief.doneWhen` = one entry per `step.checks`, same order:
  `[file python/NN_x.py] + [one per evidence literal] + [README.md for steps 2–3]`. Each entry contains the
  literal check text or path verbatim (e.g. "`elif ...:`" contains `elif `), so a substring test works.
- Per-locale text is written by hand in `shared/classroom-preset-text/{en,zh,es,fr}.ts`, not the Gemini catalog,
  so new wording never falls back to English.
- Starter `.py` TODO comments avoid every evidence literal of the lesson (so a comment can't satisfy a check).
- Default lesson: same 3 step ids/checks/rubric; title + instructions (goal + numbered checklist) hand-written in 4
  locales. **No brief** on purpose: teachers edit these steps' instructions in the plan editor and "+ Add step" copies
  step 0, so a brief would hide their edits.
- Starter `.py` header no longer carries the lesson title/summary ("for and range", "if / elif / else" satisfied the
  `for `/`if ` checks from a comment). Check labels are hand-written per locale (`ui.checkFile/checkCode/checkRecord`)
  and still contain the literal, so server advice still names it.
- For claude-ui / claude-edu / server owners: docs/classroom-copy.md has the proposed student-copy rewrites, plus one UI
  nit: the scored list repeats the literal (`label · text`). These strings are catalog keys, so apply them as a batch and
  regenerate i18n.
- Not verified in a browser: how the task card renders this text on a phone (claude-edu owns that check).

DONE (pitch video v2) — video/out/gitzilla-pitch.mp4 re-rendered (2:16): every join link/QR now says gitzilla.wilflin.me, and the class attack shows the boss taking a hit. Watched and re-sampled.

DONE (pitch video) — video/out/gitzilla-pitch.mp4 (2:16, 1080p30, -14 LUFS) rendered and watched end to end; review frames in video/out/frames/; storyboard + rebuild steps in video/STORYBOARD.md.

DONE (teacher audit) — docs/ux-audit-teacher.md: quick wins, P0-T1..T5, P1-T1..T9, P2, failure cases. Re-check after claude-edu ships fixes.

DONE — pass 1 audit, portrait re-audit, P0 re-check and edu-mode audit are all in docs/ux-audit.md.

# claude-ux progress (independent UX audit)

## Status
- [x] Pass 1: full journey audit (phone portrait 390x844 / 360x640, desktop 1280x720 / 1920x1080, big screen) → docs/ux-audit.md
- [x] Pass 2: portrait re-audit after claude-ui writes DONE (portrait), plus edu mode (teacher projector + student phone, report cards) when it lands

## Status (teacher audit, docs/tasks/teacher-ux.md)
- [x] Full teacher journey run live (t-* shots): 1440 Chromium teacher + 3 WebKit iPhone students
- [x] P0 section written in docs/ux-audit-teacher.md
- [x] P1/P2, quick wins, failure cases (second tab, reload, late joiner, teacher on phone)
- [ ] Re-check after claude-edu fixes

## Log
- Started. Read BRIEF, portrait card, claude-ui progress. Shots go to docs/ux-shots/ (gitignored).
- Landing (all viewports), whoami, lobby (owner phone + teammate desktop), bad repo, nonexistent repo, wrong room code, digit room code audited. Shots 01–14.
- Env note: dev server full-reloads every client when data/fallback/*.json is rewritten (vite watcher) — seen during audit.
- Mock autopsy (p390/p360/d1280) and mock review (d1280 reached CODE REVIEW; phone portrait WIP captured) audited. Full 4-client live match (owner p390, alice d1280, bob p360, big screen d1920) running — earlier attempts died on dev-server restarts.
- Live 4-client run (j-*): lobby→intro→23s fight captured on p390/p360/d1280/big. Big finds: sensor prompt overlays intro + live fight; touch fallback left-half joystick vs "tap = attack" copy; deck overlaps at 360x640; wrong/digit room codes.
- Running full-match run (k-*) for downed/review/end/autopsy/rematch.
- Draft docs/ux-audit.md written (P0×4, P1×9, P2×9, E×2). Contract note: LobbyPlayer has no fallback/synthetic flag → needed for P1-5.
- Coordinator: new 'edu' mode (classroom PvP, report cards, teacher on projector). Re-audit must include teacher + student flow and report-card clarity for beginners once it lands.
- Pass 1 complete (docs/ux-audit.md). Full-match runs k-* were killed by dev-server restarts (match never started) — recorded under E1.
- Pass 2 (portrait re-audit) started: claude-ui shows DONE (portrait). Landing p360/p390/p430 + mock autopsy re-shot; live 3-phone + 3-bot match (p2-*) running.
- Queue: re-check P0s after 'DONE (ux p0)'; edu audit after 'DONE (edu pvp)'.
- Pass 2 notes so far (p2-*): owner lobby improved (change-boss link, single column); teammate lobby unchanged (P0-4 open); sensor sheet still over intro+fight and even over victory BSOD (P0-1 open); touch hint still "tilt = move · tap" in touch mode (P0-2 open); team list behind thumb buttons at 390/430 with 5+ teammates (P1-3 open); damage-text pile-up over boss at portrait zoom (new). Camera/edge indicators/minimap good. One run hit transient `pvpPanel is not defined` during claude-ui's edu HMR edit.
- P0 re-check after claude-ui DONE (ux p0): P0-1..P0-4 + QW5 all fixed (r0-* shots); nits PR-4/PR-5 + LINK pill after fatal error.
- Portrait re-audit appended: PR-0 (match silently back to lobby / owner silently changed, likely dev-server restart) + PR-1..PR-6.
- Edu audit appended (teacher projector + 2 student phones live, plus edu mocks): EDU-1 report-card jargon/no scale (P0), EDU-2..EDU-7. Quiz never appeared in any run, so it was not verified.
- Transient page errors seen while claude-ui was hot-editing: `pvpPanel is not defined`, `Cannot access 'menuSheet' before initialization` (both gone on the next reload).
- Teacher audit (docs/tasks/teacher-ux.md): live run room NMIL (teacher 1440 Chromium + 3 WebKit iPhones) and JNBC (second tab, other-device projector, reload, late joiner, phone teacher). P0s: console=projector privacy, 100/100 for any print(, raid off-screen, one-click End lesson / new room, kill -STOP + red ERR copy. Not verified: GitHub path, rubric upload, 30 students, two teachers.
- Pitch video (docs/tasks/pitch-video.md): recorder video/capture/rec.mjs (CDP screencast, forced DSF → 1920x1080 / 780x1688 @60fps). Scouted all mock modes (video/raw/scout). STORYBOARD.md written (2:16, 68 bars @120 BPM). Coordinator HOLD: no final footage/title cards until 'logo is live'.
- Pitch video done after 'logo is live': captured headless (stepped mock takes + real :5175 rooms with synthetic motion sensors), Gemini TTS VO (transcription-verified), original 120 BPM chiptune, Remotion edit in video/src. Two watch/fix passes. No teaser cut. Nothing uploaded, no commits.
- Pitch video v2 (coordinator fixes):
  - (1) Dev URL: the capture browser now maps gitzilla.wilflin.me to the local dev server with Chromium
    --host-rules (video/capture/rec.mjs). The page origin, join text and QR all read gitzilla.wilflin.me, and the
    live site was never touched. Re-shot the classroom and the raid split; the mock takes show no room origin.
  - (2) The "no boss" class attack was not a render bug. All 4 students submitted, and their 60 damage equalled the
    preset boss's 60 HP, so the first attack one-shot it. The projector then correctly played the defeat dissolve,
    leaving an empty arena with dots.
  - Re-shot with 2 of 4 submissions (38 damage, boss at 23/60), so the boss stays on screen.
  - Note for claude-edu/take-edu: with a full class, the preset boss (60 HP) dies on the very first class attack of
    step 1. Consider scaling boss HP so it lasts across steps.
