# DONE (ui review)

UI-8 (docs/ui-review-coordinator.md, classroom: "visually a different product" and "owner lands on the student view").
Not committed.

**Restyle** (`client/app/classroom.css` rewritten, small markup changes in `classroom.ts`): the classroom now uses the
lobby's visual language.
- Near-black background with a CSS pixel grid and CRT scanlines. The projector also gets the lobby's animated pixel
  backdrop (`createBackdrop`); student phones stay CSS-only, so there is still no render loop on phones.
- Pixel-bordered panels; the boss panel has a red border and its HP bar is segmented.
- The app's own pixel `.btn` buttons (the classroom no longer flattens them), at least 44px tall.
- Press Start 2P for short labels: brand, room code, clock, section headings as `$ CLASS RANKING`, scores. The body
  stays in the terminal font, whose Unifont covers the Chinese presets.
- Green/yellow tokens, step rail drawn like the lobby's mode tabs.
- Dark inputs with a dashed green underline. Selects use `appearance:none` with a pixel arrow, the same fix as UI-1.
- Compact phone header. Non-time clock text ("Ready when you are", "Teacher paced") is shown small. The empty step rail
  is hidden. Empty rank/score markers are a quiet "·" (the pixel font drew "-" like "_").
- All layout selectors and behaviour are kept: dense roster over 15 students, raid animation, reduced-motion,
  preset library, editor.

**Owner landing:**
- **Redirect:** a player-role owner of a classroom with no lesson yet is sent to the same room's `?screen=1` teacher
  screen with `location.replace`. This is the legacy player-owned edu room, or `?mock=edu`.
- **Banner for a non-teacher projector:** a `?screen=1` page that is not the owner shows "This big screen is not the
  teacher's" with a "Join as a student" link. This also covers a student who briefly inherits ownership while the
  teacher reconnects.
- **Mock:** in `client/app/mock.ts` (claude-ui's file, one line), `?mock=edu` with `screen=1` now owns the room like a
  real classroom; other mocks are unchanged. This is how the coordinator saw "Waiting for your teacher" as owner.

**Verified** with Playwright **WebKit** on DEV :5175 and looked at every screenshot. Script:
`/tmp/claude-1000/-home-wilf-data-HackPSU-repo-kaiju/df7be22c-36dc-409c-9e61-ef019d47acc6/scratchpad/classroom-shots.mjs`.
- **Flow:** teacher on desktop 1280x800 creates the classroom from the landing page, publishes the default lesson,
  and opens step 1. Students join on iPhone 15 and iPhone SE.
- **Screens shot:** teacher setup and coding, projector 1920x1080, students waiting and coding (viewport + full length),
  a second non-teacher projector, and the `?mock=edu` owner on iPhone 15.
- **Results:** 0 page errors and 0 horizontal overflow everywhere. The mock owner ends up on
  `…?mock=edu&screen=1` showing "Prepare the lesson" and the editor. The non-teacher banner is visible.
- **Not exercised:** the raid/feedback phases with real scored submissions, which need GitHub analysis. Their panels
  share the restyled panel CSS.
- **Tests:** `npm run typecheck` PASS; `npx vitest run` **788 passed / 8 skipped**.
- **i18n:** the two new strings (non-teacher banner, "Join as a student") are English until the out-of-band
  translation job runs.

---

# DONE (rubric) — code + unit tests done; demo views NOT yet screenshot-checked

Rubric UI in client/edu/ (all exported from `client/edu/index.ts`):
- `rubric.ts` `createRubricEditor({ current, onUse(r), room?, token?, parse? })`, the teacher panel. Teachers can:
  drag-drop a file, pick one, or paste text; edit each criterion (name, weight slider with a live normalized %,
  signal dropdown in plain labels, unit-aware target, description); add unparsed lines as criteria or ignore them;
  then "use this rubric" or "reset to default". `setCurrent(lobby.rubric)` marks the draft "✓ in use".
  Default `serverParse()`: `POST /api/rubric/parse?filename=…&room=…`, with the doc as the raw body and
  `content-type` text/markdown | text/plain | application/pdf, plus an optional `Authorization: Bearer <token>`.
  It expects Rubric JSON back. On a 404 it falls back to `rubric/index.ts` `parseRubric` in the browser (text only),
  if that module exists. **codex-net: please match this request shape, or tell me yours.**
- `createJudgedCard({ rubric, quality, preview? })` is the student lobby card "how you'll be judged". Without
  `preview` it estimates from the real report card. Criteria it can't measure (ci, license, typing, commits, custom
  checks) show "measured after the fight" and are never invented.
- `feedback-view.ts`:
  - `createFeedbackView(fb, rubric, { variant, you })` is the student screen: score ring, strengths, next steps with
    GitHub file links, per-criterion bars with evidence and tip, and how they played.
  - `createClassFeedback({ items, rubric, variant, room?, title? })` is the teacher view: class summary, sortable
    table, row drill-down, and CSV/Markdown export. Export uses `/api/room/<room>/feedback.csv|.md` and falls back to
    the same files generated in the browser.
- `rubric-data.ts`: pure helpers (weights, targets, estimate, class summary, sort, CSV/MD, GitHub links).
  Tests: `client/edu/rubric.test.ts` (9). The client/edu total is 34, all passing.
- Demo: `demo.html?view=rubric[&parsed]|feedback|feedback-class[&open=0]|feedback-screen`. It uses a demo-only parser
  and demo feedback built from real report cards until rubric/ lands. **Not yet looked at in screenshots:** the next
  step is a Playwright pass at phone, desktop and 1920 sizes.

### Handoff → claude-ui (rubric)
- Lobby, edu, owner:
  `const ed = createRubricEditor({ current: lobby.rubric, room: lobby.room, token: app.token, onUse: (r) => net.send({ t: "setRubric", rubric: r }) });`
  Call `ed.setCurrent(lobby.rubric)` on every lobby update.
- Lobby, edu, student:
  `createJudgedCard({ rubric: lobby.rubric ?? localDefaultRubric(), quality: me.kit?.quality })`.
- On ServerMsg `feedback`, edu autopsy:
  - Student: `createFeedbackView(items.find(f => f.playerId === app.you), lobby.rubric, { variant, you: true })`.
  - Owner or projector: `createClassFeedback({ items, rubric: lobby.rubric, variant, room: lobby.room })`.
### Contract request
- `LobbyPlayer.rubricPreview?: CriterionResult[]`: the server's real pre-fight `scoreRepo` result.
  `createJudgedCard({ preview })` already uses it; without it the card shows the report-card estimate.

---

# DONE (edu ux)

UX-audit fixes EDU-1, EDU-2, EDU-3 and EDU-7 (docs/ux-audit.md, "Edu mode (classroom PvP) audit"):
- **EDU-1, plain words with a scale:** new `client/edu/explain.ts` reads the numbers back out of the sim's `signal`
  strings. Every report-card row now has three plain lines:
  1. `C speed (alias) — how independent the parts of your code are`, with an F·D·C·B·A scale.
  2. `each part of your code uses 5 other parts (class median 1)`.
  3. `next: B needs each part to use ≤ 4.4 others. try: …`
  Every B-or-worse row gets a concrete tip that names a real file or loop when there is one. Tapping the word opens
  the concept's animated diagram inside the card. The code alias is shown small after the word, and `regen` is folded
  into `energy`: it has the same signals, so it is no longer shown or counted.
- **EDU-2:** weakness is now `tech-debt penalty — import loops and leftover TODOs make you take extra damage (A = no
  penalty)`, with the effect `→ you take +12% damage`.
- **EDU-3:**
  - "Next grade" targets are computed with the sim's own `qualityRows`. A target is shown only when the client
    reproduces the sim's grade exactly, so a threshold is never guessed.
  - GPA uses exactly the letters shown, so the lobby's `code grade`, the ranking and the card all agree.
  - Class highlights break ties between equal grades with the real number.
  - The demo page now uses the sim's real grading (`playerKitFromProfile(p, { mode: "edu" })`) instead of my estimator.
  - Tests check grade monotonicity in tests % and tech-debt penalty, and that each target reaches the next grade.
- **EDU-7:**
  - Ranking headers read `KOs · rounds won · damage · code grade` (wraps to two lines).
  - Highlights use 2 columns, stacked on phones, showing only the first fact.
  - Glossary ✓ also marks concepts graded on the report cards; the sentence is dropped when nothing is met.
  - GPA label 12px; phone deck lesson title/tag/hint 10px.
- Tests: `client/edu/explain.test.ts` (8, run on every fallback repo through the sim) + `edu.test.ts` (17).
  Typecheck is clean. The full suite has 2 failures, both in `client/render/boss/layout.test.ts`, caused by the
  in-progress `sim/regions.ts` change and not by edu.

### New handoffs (edu ux)
- **claude-ui (lobby):** pass the class so rows show the class median:
  `createReportCard(student, { size: "md", you: true, peers: lobby.players.filter(p => p.kit?.quality).map(p => ({ id: p.id, name: p.name, repo: p.repo ?? "", quality: p.kit!.quality })) })`.
  The lobby's `gpa()/gpaGrade()` already ignore `regen`, so nothing else changes.
- **claude-ui (mock):** `fakeQuality` in `client/app/mock.ts` makes contradicting grades (EDU-3). Use the sim's real
  grading instead: `playerKitFromProfile(profile, { mode: "edu" }).quality`. That's what client/edu/demo.ts does now.
- **claude-genesis (EDU-6, not mine):** `client/genesis/local.ts` `genesisFromKit()` always writes
  `stats: same 5-pt budget`. When `kit.quality` exists it should say `code quality -> stats (see your report card)`.
  `eduGenesisNotes` already speaks in plain words via `plainRow`.
- **codex-sim (contract request, optional):** signals are parsed from today's wording in `sim/quality.ts`. If that
  wording changes, rows fall back to the raw signal + the sim tip, so nothing breaks, but the plain text is lost. More
  robust: `QualityStat.metrics?: Record<string, number>` (e.g. `{ testPct, avgImports, depth, longestFn, avgFn, perFile,
  commentPct, readmeChars, cycles, todoPer1k, advisories, loc }`). `explain.ts` would read it first.

---

# DONE (edu pvp)

**Summary:** `client/edu/` is a self-contained edu-mode kit for classroom PvP. It has a concept library (31 concepts, each
with an animated pixel diagram and fact templates that only ever show real data), a lesson engine (sim lesson events +
derived report-card lessons, rate-limited), a LessonFeed for phone, desktop and projector, a pop-quiz overlay that
matches the floor pads A/B/C, report cards, a class report for the autopsy (ranking, every student's report card,
improvement tips, highlights, quiz scores, glossary), an architecture report with "Where this project needs help" for
battle, and `eduGenesisNotes` for the genesis cinematic. typecheck clean; `npx vitest run` passes 449 tests, 17 of them
in client/edu. The demo page was screenshotted with Playwright at 1440x900 desktop, 390x844 phone portrait and 1920x1080
projector (live match, quiz, quiz reveal, report, projector report, architecture report, diagram gallery), and the
problems found were fixed. Screenshots are not committed: they're in the session scratchpad. No shared/ edits, no new
dependencies, no commits. Nothing is mounted in the game yet: the handoffs below for claude-ui, claude-genesis and the
pad renderer are the next step.

Dev-server note: on :5175 the Vite watcher sometimes misses edits and keeps serving a stale module. `touch` the file
to refresh it.

## What's in client/edu/ (all exported from `client/edu/index.ts`)
- `concepts.ts`: every contract `Concept` + 5 edu-PvP quality concepts (`code-quality`, `modularity`, `cohesion`,
  `documentation`, `code-size`; see contract request). Each has a title, pixel glyph, ≤2-sentence plain text, "learn more"
  and fact templates filled from REAL event facts (a template is used only when every key is present, so nothing is
  ever invented). `conceptForAttack()` maps every boss attack kind/name keyword. `STAT_CONCEPT` / `STAT_LABEL` map
  QualityStat → concept / HUD vocabulary (`try{}` armor, `RAM` energy…).
- `diagrams.ts`: an animated 64x36 pixel diagram per concept (A→B→C loop pulsing, dominoes cascading, stack
  overflowing, race to one cell, xkcd-2347 tower…), own 3x5 pixel font, one shared 20 fps loop that skips detached
  canvases. prefers-reduced-motion = static frames.
- `engine.ts` `LessonEngine`: sim `lesson` events → cards (≥7 s apart, unseen concepts first, no repeats), player
  id → `@name`, a `stat` fact pulls grade/signal/tip from the report card. Quiz scores from `perk.correct`; glossary.
  When the sim is quiet (no lesson event for 25 s) it derives edu lessons itself from real QualityStats: match start
  → your best grade; hit by @x whose damage is A/B → cohesion lesson; you go down → your weakest grade + tip;
  projector between rounds → spotlight a classmate's standout stat.
- `feed.ts` `createLessonFeed`, `quiz.ts` `createQuizOverlay` (+ pure `quizView`, `padLetters`), `report.ts`
  (`createReportCard`, `createClassReport`, `createArchitectureReport`, `createGlossary`), `genesis.ts`
  (`eduGenesisNotes`), `summary.ts` (architecture in plain words, refactor ideas, `helpWanted`), `quality.ts`
  (GPA, weakest/strongest, class highlights), `edu.css` (imported by the components; nothing to add to style.css).
- Tests: `client/edu/edu.test.ts` (17): concept coverage + sentence limit, templates, attack mapping, engine (rate
  limit, enrichment, derived lessons, battle = no derivation, projector spotlight, quiz scores), quiz view
  letters/reveal, GPA math, genesis notes + architecture summary on 4 real fallback repos (no undefined/NaN).
- Demo: http://localhost:5175/client/edu/demo.html (`?view=desktop|phone|screen|report|report-screen|arch|genesis|gallery`,
  `&t=<s>` fast-forwards the scripted match, `&freeze` holds it). 8 fallback repos as a class. **Report-card grades on the
  demo page come from a demo-only estimator inside demo.ts**; in the game they come from codex-sim (`PlayerKit.quality`).

## Handoff → claude-ui (exact mounting)
```ts
import { createLessonFeed, createQuizOverlay, createReportCard, createClassReport, createArchitectureReport, type LessonEngine } from "../edu";
```
1. **Game screen, only when `s.mode === "edu"`** (create on the first edu snapshot):
   ```ts
   const variant = spectator ? "screen" : portrait ? "phone" : "desktop";   // update on layout change: feed.setVariant(v)
   const feed = createLessonFeed({ variant, ctx: { mode: s.mode, you: app.you, spectator, players: [] } });
   const quiz = createQuizOverlay({ variant, engine: feed.engine });
   // every snapshot (cheap; setContext only when the roster changes):
   feed.setContext({ players: s.players.map((p) => ({ id: p.id, name: p.name, repo: p.kit.repo, quality: p.kit.quality })) });
   feed.update(s);
   quiz.update(s, spectator ? null : app.you);
   // leaving the screen: feed.dispose(); quiz.dispose();  (keep `feed.engine` for the autopsy, see 3)
   ```
   Placement: **phone**: `deck.append(quiz.el, feed.el)` near `P.review` (feed shows one compact card; tapping opens a
   bottom sheet appended to body, closed by tapping). **desktop**: `feed.el` absolutely positioned in the side gutter
   (e.g. `right:12px; top:72px`), `quiz.el` top-centre over the arena (`width:min(560px,90%)`). **projector**:
   `feed.el` positions itself as a lower-third (it is `position:absolute`; put it inside the full-screen game
   container), `quiz.el` top-centre. While `s.perkOffer?.quiz` is set, hide the old CODE REVIEW banner: the quiz
   overlay replaces it (it toggles its own `.show` and keeps the reveal ~6 s after the offer closes).
2. **Lobby (edu)**: student's own card: `createReportCard({ id, name, repo, quality: kit.quality }, { size: "md", you: true })`
   (it shows "grading…" while `quality` is missing). Projector roster: `size: "sm"` cards in a grid. Mode toggle copy:
   `edu: classroom PvP, where your code quality sets your stats`. Landing hint: `teaching a class? → edu mode`.
3. **Autopsy (edu)**: `createClassReport({ autopsy, students, engine, you: app.you, variant })`, where `students` =
   lobby players `{id,name,repo,quality: kit?.quality}` and `engine` = the game screen's `feed.engine` (glossary
   ✓ + quiz scores; pass `null` if you don't keep it). It renders ranking, your report card, all report cards (projector),
   biggest improvement tips, class highlights, quiz scores and the glossary.
   **Autopsy (battle, optional, complements your Adopt-an-Organ cards)**: `createArchitectureReport({ genesis:
   lobby.boss.genesis, kit: bossKit, autopsy, heroes: [{ label, genesis, you }], variant })`: the boss repo in plain
   words, "if you refactored X…", your repo vs the boss, and "Where this project needs help".

## Handoff → claude-genesis
```ts
import { eduGenesisNotes, EDU_STAGE_ORDER } from "../edu";
const notes = lobbyMode === "edu" ? eduGenesisNotes(genesis, kind, (kit as PlayerKit).quality) : null;
// notes[stage] = { title: "$ git clone", text: "≤2 plain sentences", fact: "1,204 files · 50,796 lines · mostly Rust 92%" }
```
Keys: `clone parse graph dna map design assemble reveal ready` (contract GenesisStage + your assemble/reveal beats).
In edu: pause on each beat with the note as a caption card (title in the terminal font, text, then the fact in
amber). Auto-advance on phones (~2.5 s per beat), tap to continue on host/projector. `map` and `reveal` talk about
grades when `quality` is present.

## Handoff → floor-pad renderer (`drawPerkPads`, claude-boss/claude-ui)
Letter the quiz pads the same way the overlay does: `padLetters(offer.pads)` → `Map<padId, {letter, color}>`
(A/B/C left→right, `PAD_COLORS`). Draw the letter big on the pad and `pad.answer` under it when `offer.quiz` is set.

## For codex-sim (no edits by me; lesson facts I render)
- `lesson.facts` keys the templates understand: `player` (player id: the engine turns it into @name and pulls
  `grade`/`signal`/`tip` when `stat` is given), `stat` (QualityStat.stat), `repo`, `component`, `file`, `fanIn`,
  `fanOut`, `dependents`, `members` ("a → b → a"), `cycles`, `todos`, `todo`, `loc`, `files`, `edges`, `components`,
  `depth`, `testPct`, `maintainers`, `maintainer`, `busFactor`, `issue`, `title`, `count`, `attack`, `id`, `pkg`,
  `fixed`. `ref` = component/file name. Any `{player, stat}` lesson works for any concept (generic report-card line).
- `hit.source` = attacker player id in PvP enables "@ben hit you: damage A because…".
- Quiz: `PerkOffer.quiz` + `pad.answer`; set `pad.correct` at reveal, or just emit `perk {correct}` (the overlay infers it).

## Contract requests
1. `Concept` += `"code-quality" | "modularity" | "cohesion" | "documentation" | "code-size"` so the sim can tag PvP
   quality lessons (the client already supports them; until then use `test-coverage`/`coupling`/`tech-debt` with
   `{player, stat}` facts, which render the same report-card line).
2. Nice-to-have: `{ type: "downed"; player; by?: string }` (attacker id) for "@ben KO'd you" lessons.
