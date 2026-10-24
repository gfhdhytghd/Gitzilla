# claude-ux progress (independent UX audit)

## Status
- [ ] Pass 1: full journey audit (phone portrait 390x844 / 360x640, desktop 1280x720 / 1920x1080, big screen) → docs/ux-audit.md
- [ ] Pass 2: portrait re-audit after claude-ui writes DONE (portrait), plus edu mode (teacher projector + student phone, report cards) when it lands

## Log
- Started. Read BRIEF, portrait card, claude-ui progress. Shots go to docs/ux-shots/ (gitignored).
- Landing (all viewports), whoami, lobby (owner phone + teammate desktop), bad repo, nonexistent repo, wrong room code, digit room code audited. Shots 01–14.
- Env note: dev server full-reloads every client when data/fallback/*.json is rewritten (vite watcher) — seen during audit.
- Mock autopsy (p390/p360/d1280) and mock review (d1280 reached CODE REVIEW; phone portrait WIP captured) audited. Full 4-client live match (owner p390, alice d1280, bob p360, big screen d1920) running — earlier attempts died on dev-server restarts.
- Live 4-client run (j-*): lobby→intro→23s fight captured on p390/p360/d1280/big. Big finds: sensor prompt overlays intro + live fight; touch fallback left-half joystick vs "tap = attack" copy; deck overlaps at 360x640; wrong/digit room codes.
- Running full-match run (k-*) for downed/review/end/autopsy/rematch.
- Draft docs/ux-audit.md written (P0×4, P1×9, P2×9, E×2). Contract note: LobbyPlayer has no fallback/synthetic flag → needed for P1-5.
- Coordinator: new 'edu' mode (classroom PvP, report cards, teacher on projector). Re-audit must include teacher + student flow and report-card clarity for beginners once it lands.
