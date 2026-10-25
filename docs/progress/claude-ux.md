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
