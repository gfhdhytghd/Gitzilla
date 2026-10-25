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
