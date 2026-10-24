# claude-ux: independent UX audit (user request: "make the UI more user friendly")
You are a fresh pair of eyes. You did NOT build this UI. Audit it as a first-time player would — a hackathon judge who
gets a QR code, has 30 seconds of patience, and has never heard of Gitzilla — and report everything that's confusing,
slow, unreadable, or easy to get wrong. You don't edit client/app or style.css (claude-ui owns them and is in the middle
of a portrait-phone rework, docs/tasks/portrait.md). You write findings; the coordinator routes them to claude-ui.

How:
- Drive the real app on the DEV server http://localhost:5175 (never :5173) with Playwright (installed) — and LOOK at
  every screenshot yourself. Viewports: phone portrait 390x844 and 360x640 (isMobile, hasTouch, DPR 3), desktop
  1280x720 and 1920x1080, big screen ?screen=1 at 1920x1080. Use several browser contexts to be the owner + teammates.
  `?mock=1|match|review|autopsy` gives quick offline states (see docs/progress/claude-ui.md).
- Walk the full journey: landing → create/join → name → pick repo (paste link, quick-pick chips, Connect GitHub) →
  waiting for others → owner picks boss → bots → start → intro → first 30s of fight → getting downed/reviving → code
  review perks → victory/defeat → autopsy → share card → rematch. Also: wrong room code, bad repo, slow analysis,
  reconnect, motion permission prompt, sound.
- Judge against: clarity of the next action at each step (is it obvious what to do?), copy (terminal jokes are fun but
  must not hide meaning — every hacky label needs a plain-language hint), legibility (font sizes on phones, contrast,
  pixel fonts at small sizes), tap target sizes (≥44px), feedback for every action (loading, success, error),
  onboarding (do new players learn controls without reading?), information overload in the HUD, accessibility basics
  (contrast, reduced motion for the heavy glitch/shake, color-only signals), and performance on phone (jank).
Output `docs/ux-audit.md`: a short verdict, then findings ranked P0 (blocks or confuses most players) / P1 / P2, each
with the screen, viewport, a screenshot path (save under docs/ux-shots/, gitignored is fine), what's wrong, and a
concrete fix proposal (copy suggestion, layout change, sizes). Include a "top 5 quick wins" list at the top. Keep it
actionable; no generic advice. When claude-ui finishes the portrait card (its progress file says DONE (portrait)),
re-audit the phone portrait flow and append a "Portrait re-audit" section. Progress log at docs/progress/claude-ux.md,
no commits, DONE at the top when both passes are finished.
