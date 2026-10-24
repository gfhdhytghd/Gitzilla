DONE — teacher rubric parsing, repo scoring, PDF extraction, default rubric, and grounded student feedback implemented in `rubric/`; 21 rubric tests PASS. No commits.

## Public handoff (implemented)
- Browser-safe `rubric/index.ts`: `parseRubric(text, filename?)`, `defaultRubric()`, `scoreRepo(profile, rubric)`, `weightedScore(rubric, results)`, `buildFeedback(profile, rubric, results, matchStats, quiz?)`.
- `FeedbackMatchStats` = `{ playerId: string; name: string; rank: number; kos: number; damage: number; roundWins: number; quiz?: string }`; optional fifth argument `quiz` is the human-readable quiz summary string, defaulting to `matchStats.quiz`. Output follows shared `StudentFeedback` exactly.
- Server-only `rubric/pdf.ts`: `extractRubricText(data: Uint8Array, filename?: string, contentType?: string): Promise<string>`; `.pdf`/PDF MIME/magic uses system `pdftotext`; text/Markdown decodes UTF-8. Helpful error asks for `.md`/`.txt` if PDF extraction is unavailable or has no text. `pdftotext` is installed on this host. No new npm dependencies.

## Exact integration handoffs (codex-net / claude-edu)
- codex-net: import pure functions from `../rubric/index.ts`, extraction separately from `../rubric/pdf.ts`. Parse preview: `parseRubric(await extractRubricText(bytes, filename, contentType), filename)`. After edu match call `buildFeedback(profile, rubric ?? defaultRubric(), scoreRepo(profile, rubric ?? defaultRubric()), { playerId: player.id, name: player.name, rank, kos, damage, roundWins }, quizSummary)`. Room authorization, recipient filtering, persistence and exports stay in `server/`.
- claude-edu: import from `../../rubric/index.ts` for default preview and pre-fight scoring; `weightedScore(rubric, scoreRepo(profile, rubric))` returns 0..100. No Node imports in that entry point. Unparsed lines are never silently turned into checks; retain and display `rubric.unparsed` for teacher review.
- codex-net: this API now exists; replace any temporary injected fallback service with the functions above. Your documented `stats.quiz` is supported directly. Keep `parseRubric`'s empty-criteria preview visible for teacher correction; `setRubric` can reject it. `extractRubricText` is available if you want to share PDF extraction rather than maintain two adapters.
- claude-edu: **weights are normalized fractions (0..1)** from both parser and default. Your current range `value: Math.round(c.weight)` rounds these to zero; display normalized percentages and keep all criterion weights in the same units when editing (e.g. normalize the whole vector into percentages first). Student lobby profiles are not currently in the shared lobby contract; `scoreRepo` needs a full RepoProfile, so pass server-computed `CriterionResult[]` to `createJudgedCard({preview})` for exact scores; label QualityStat-derived estimates as estimates.
- claude-edu / codex-net: current upload header mismatch observed: client sends `Authorization: Bearer <token>`, server handoff documents `X-Room-Token`. Agree on one or have the server accept both. Integration belongs to those owners; no edits made here.

## Contract requests / evidence boundaries
- No shared contract edits needed. Derive CI/license/custom paths from the sampled `tree`, file LOC from `dna.bigFiles`, function spans from the existing optional structural `dna.avgFunctionLength` extension. Missing measurements receive explicitly labelled neutral scores, never fabricated test runs or type coverage.
- codex-repo (optional follow-up): exact `typingRatio` (0..1 checked annotations), `hasCi`, `licenseFile`, complete tree provenance would improve certainty. No blocking dependency; current scope will label partial-tree evidence and unmeasured typing.

## Validation
- `npx vitest run rubric/rubric.test.ts rubric/pdf.test.ts`: **21 PASS / 2 files** (final), including 3 realistic rubric documents against **all 15 bundled fallback profiles**, hand-calculated score checks, custom checks, average vs maximum spans, missing-signal labelling, feedback identity/quiz separation, and actual Poppler PDF extraction. No PDF skips on this host. The earlier substring run `npx vitest run rubric` also passed 9 newly added claude-edu rubric tests (29 total at that point).
- `npx tsc --noEmit -p rubric/tsconfig.json`: **PASS** (root tsconfig does not directly include the new directory before consumers import it).
- Standalone Vite browser build of `rubric/index.ts`, `write:false`: **PASS**, produces `rubric.js` without Node adapters.
- `npm run build`: **PASS**; existing ineffective-dynamic-import warnings for player/boss renderers.
- Full `npm test` at 17:03 local: **667 PASS / 2 FAIL / 8 skipped**. External failures: `design/index.test.ts:225` bundled boss attack IDs differ from generated archetype attack IDs; `genesis/index.test.ts:168` expects old `2-summon-0` trace. No rubric failures; no ownership-crossing fixes.
- Root `npm run typecheck` at 17:03 local: external errors `client/edu/rubric.ts:139` nullable node passed to replaceChildren and `server/rooms.ts:328` impossible `setBots` union comparison. Owned standalone rubric check passes. Other owners are editing these files concurrently; this snapshot is not final integration proof.
- `git diff --check -- rubric docs/progress/codex-rubric.md`: PASS. New files are untracked for the coordinator to stage.
- No commits. Preserve all parallel-agent changes outside `rubric/` and this log.

## Delivered files / limits
- `rubric/{index,parser,scoring,feedback,pdf}.ts`, standalone `tsconfig.json`, `README.md`, 3 `.md` fixtures, 2 test files. No dependencies installed; no shared/server/client edits.
- Runtime end-to-end owner upload / private student delivery / export / UI visual acceptance belongs to codex-net and claude-edu; not claimed by these pure-module and PDF tests.
