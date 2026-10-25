DONE (debrief model) — pure logic in `client/edu/debrief.ts` / `debrief.test.ts` plus this progress report. No DOM or other client edits; no commits, services or deployment.

## API handoff
- `buildRoundDebrief(state: ClassroomState, reports: Readonly<Record<string, ClassroomReport>>, round: ClassroomRound): Debrief`.
- `buildLessonDebrief(state, reports): LessonDebrief`, extending Debrief with `steps: {stepId,title,attempt,attempts,avg,median,submitted,roster,weakestCheck: {text,passed,total}|null}[]` and optional `nextPresetId` navigation target.
- Lesson rows use the latest settled round per reviewed step in plan order. Overall scores weight each latest submitted student-step equally; retries do not double count a step. Lesson participation counts distinct students across all recorded attempts, so missing a retry never erases earlier participation; roster uses the largest known class size, at least known submitters.
- i18n choice documented in module header: plain English generated from exported `DEBRIEF_TEXT` templates with numbered placeholders; UI can pass sentences through t() and add those templates to its catalog. Existing brief/check text is already localized. Next Python lesson number is language-neutral; `nextPresetId` is the selection target.

## Evidence boundaries
- Frozen attacks own scores/improvements; frozen roster includes disconnected enrolled rows and excludes kicked rows as codex-net specified. Frozen checkStats wins over live reports.
- Old rounds without metadata do not get invented zeros. Check fallback uses only attack participants' exact step+attempt reports, with known denominators; partial coverage is explicitly described and recommends reviewing work. With no reports, checks is empty and wording says details unavailable. Deliberately checkless steps ask for a demonstration instead of claiming missing data. Unknown historical roster is labelled unavailable in the headline; numeric fallback is current class size, at least participants.
- Names only in participation.missing, needHelp and shoutouts; projector must omit the private name fields. The model never reads report.files or sends code anywhere.
- No individual check history exists across attempts. Do not invent repeated individual failures or later first-ever full passes. Repeated difficulties can be class-wide from earlier frozen checkStats. First-round all-check shout-outs require a real matching report, never a score of 100 alone.
- Current missing-submission names are only listed for the current step/attempt when frozen/current roster sizes agree; historical membership IDs are not recorded. Frozen numeric counts survive later membership changes.

## Final verification
- 22 focused fixture tests PASS: real English preset briefs, 3/5/30 students, disconnected enrolled students, missing submissions, fractional scores/bands/medians, frozen counts vs live changes, legacy/partial/missing reports, retry/report isolation, class-wide difficulty, one-check-away advice, first-round evidence-backed shoutouts, late arrivals/kicks, latest-step lesson scoring, earlier participation on missed retries, next presets, checkless tasks, privacy and detached output.
- `npx vitest run client/edu/debrief.test.ts`: **22 PASS / 1 file**, no skips.
- Final `npm run typecheck`: **PASS**.
- Full `npm test` snapshot (2026-10-25 02:38 local): **1056 PASS / 9 optional skips / zero failures**, 90 passing files and 4 skipped; 25.17 seconds. Other owners' concurrent work is included; this is not browser or real-classroom acceptance.
- Standalone Vite browser library build of `client/edu/debrief.ts`, configFile:false/write:false: **PASS**, one ES output, no Node/browser-compatibility warnings and no files written. No DOM, student-source inspection, network, clock, storage or service changes in the model.
- Touched-file whitespace check PASS. No commits, npm install, server changes, live actions or UI mounting edits.

## Damage-budget follow-up (2026-10-25 03:34 local)
- Production `debrief.ts` already reads frozen `round.bossBefore/bossAfter` for the boss-loss headline and frozen attack scores for grades; no runtime change was required for the new damage budget.
- Removed the old score/4 formula from synthetic model fixtures. Their nominal damage is intentionally independent of server balancing; a new actual `ClassroomSession` regression verifies the real server's capped proportional damage sums to the boss loss, later steps retain health, an unchanged retry shows zero loss despite score 100, and the first round stays immutable. Submitted Python is only statically analyzed, never executed.
- Updated focused `npx vitest run client/edu/debrief.test.ts`: **23 PASS / 1 file**. Latest root `npm run typecheck`: **PASS**. No repeat full-suite claim; the 1056-test snapshot above predates this additional regression.
- Received codex-net's final independent server evidence: **204 PASS / 14 files**, root tsc PASS, DEV5175 three-step LLUH smoke HP40→20→0, enrolled-roster normalization/K1.85, equal weak-score improvement credit within budget, unchanged retry zero, protected future step HP and restart/legacy curves. Those server/live results are its evidence, separate from this module's direct-session test. No contract or frozen aggregate fields changed.
- Follow-up changes only `client/edu/debrief.test.ts` and this progress report; no server/other client edits or service controls.

## UI integration notes
- Import functions and types directly from `./debrief.ts`; this owner did not change `index.ts` or other client files.
- Feed the exact frozen round plus teacher reports. Round scores never read mutable report.score, and a report from another step/attempt or a non-attacking participant never contributes check results.
- `checks` is weakest-first and uses brief Done when text, falling back to actual check labels. Lesson check bars include their step title; per-step `weakestCheck` is null when details are unavailable or the task has no checks.
- Need-help lists include no submission, low current score, a currently failed check, or a low completed step hidden by a higher lesson average. The model does **not** attribute repeated class-wide difficulties to a named individual.
- Reteach and next recommendations use concrete measured counts, exact task wording and short teacher actions. The English template catalog is the exported `DEBRIEF_TEXT`; add its strings to the localization catalog and pass rendered sentences through t(). `nextPresetId` is optional navigation metadata, with a language-neutral lesson number in its recommendation.
- Keep `participation.missing`, `needHelp`, and `shoutouts` private unless the projector's explicit shoutout policy allows names. Headline/scores/check bars/reteach/next contain no report source or student-name interpolation. Unit fixtures confirm source files never appear in any output.
