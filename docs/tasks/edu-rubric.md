# Edu: teacher rubric doc + post-fight feedback for students (user request)
Contract (committed): RubricSignal, RubricCriterion, Rubric, CriterionResult, StudentFeedback, LobbyState.rubric,
ClientMsg setRubric, ServerMsg feedback.

Flow: teacher (room owner, edu mode) uploads a grading doc in the lobby (.md / .txt / .pdf / pasted text) → server parses
it into a Rubric → teacher previews/edits criteria (weights, which signal each maps to, unparsed lines highlighted) →
setRubric → students see the rubric on their lobby report card ("how you'll be judged") → fight → after the match every
student's phone gets THEIR feedback; the teacher/projector gets everyone's + export.
No LLM required (Gemini has no credits): deterministic parsing + templates grounded in real data. If Gemini works
later, it may polish summaries (never for private repos).

## codex-rubric (NEW, owns rubric/ — server-side pure TS)
- `parseRubric(text: string, filename?: string): Rubric` — headings/bullets/tables like "Testing (30%): has unit tests…",
  "Documentation — 20 pts", "Code style: no file over 300 lines". Map each criterion to a RubricSignal by keywords (test →
  tests, doc/readme/comment → documentation/readme, modular/coupling/architecture → modularity, function/method length →
  function-length, CI/pipeline → ci, license → license, type hints/typescript/types → typing, commits/history → commits,
  circular/cycle → cycles, TODO/debt → tech-debt), weights from %/points (normalize), targets from numbers in the text,
  custom checks ("must contain a tests/ folder" → path-exists, "no file over N lines" → max-file-loc, "at least N commits"
  → min-commits, "written in Python" → language). Unmappable lines → `unparsed`. PDF: extract text with a tiny
  dependency-free approach or `pdftotext` if present on the server; otherwise ask for .md/.txt.
- `defaultRubric(): Rubric` (balanced, mirrors the current QualityStat philosophy).
- `scoreRepo(profile: RepoProfile, rubric: Rubric): CriterionResult[]` (0..1 per criterion with real evidence strings:
  "tests: 6 of 48 files (13%) — target 20%").
- `buildFeedback(profile, rubric, results, matchStats, quiz?): StudentFeedback` — friendly teacher tone, 1–3 strengths
  and 1–3 improvements naming real files/numbers, never shaming; 2–3 sentence summary.
- Tests with sample rubric docs (write 3 realistic ones under rubric/fixtures/: intro CS project, web app course, data
  science notebook course) against data/fallback profiles.
- Needs signals not yet in RepoProfile (ci config present, license file, typing ratio, max file LOC, README length)? Add
  them via codex-repo (ask in your progress file) or derive from profile.tree/dna where possible.

## codex-net (server/)
- `POST /api/rubric/parse` (owner of an edu room; ≤1 MB; text/markdown/pdf) → Rubric JSON preview.
- `setRubric` (owner, edu, lobby) → LobbyState.rubric; persisted with the room.
- After an edu match: compute StudentFeedback per human player (scoreRepo + buildFeedback with their pvp stats + quiz),
  send each student ONLY their own via ServerMsg feedback; owner + ?screen=1 get all. `GET /api/room/<CODE>/feedback.csv`
  and `.md` (owner only) for the teacher to keep. Private repos: feedback stays in the room, never in Hall.

## codex-sim (sim/)
- In edu, the rubric may re-weight which quality signals drive which stats (still capped: best/worst ≤ 2.5×). Expose
  `qualityFromRubric(kit, results)`; keep defaults identical when rubric.source === "default".

## claude-edu (client/edu/)
- Teacher: rubric upload panel (drag-drop / file picker / paste), parsed criteria editor (weights sliders, signal
  dropdown, target, unparsed lines to fix), "use this rubric" → setRubric. Default rubric preview if none uploaded.
- Student: lobby "how you'll be judged" card (criteria + their live pre-fight score from their repo) — so students can
  even push fixes before the fight and re-summon.
- After the match: student feedback screen (rubric score ring, per-criterion bars with evidence + tips, strengths,
  next steps with file links to GitHub, how they played), and the teacher's class view (sortable table, per-student
  drill-down, export CSV/Markdown buttons, projector-friendly class summary).
## claude-ui: mount these in lobby/autopsy for edu mode (after current tasks).
