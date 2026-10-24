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
