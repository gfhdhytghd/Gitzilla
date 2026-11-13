# Question sets — server report

Scope: the Server (Codex) section and shared rules in `docs/tasks/question-sets.md`, including coordinator decisions in contract commit `da084be`. Earlier command results below remain historical evidence; the coordinator follow-up section records the current validation.

## Changes

- `server/classroom-questions.ts`: question normalization, integer points (1..100), bounds and unique IDs, ordered blank markers, choice-key validation, weighted grading, plain-decimal numeric grading with exact decimal tolerance comparison, answer validation, mixed-score blending, and `studentPlan`. The redaction helper is also exported from `server/classroom.ts`.
- `server/classroom.ts`: question-only steps ignore code configuration; legacy code plans retain their behavior. Partial answer saves merge synchronously, enforce step/attempt identity, and allow one save per second with at most 200 saves per student per step attempt. Immediate feedback counts attempts per answered question and locks correct/exhausted questions. After-close feedback hides correctness, current grades, and score-based row ordering until reveal. Previously revealed overall grades survive advancement to the next step. `never` takes precedence over immediate disclosure and retains only the student's overall/part scores and saved answers, without correctness or keys.
- Mixed grading updates in either submission order. A mixed row stays submitted as soon as either part exists; a separate pending-code fence still blocks raids and finishing while code analysis runs. Question saves during queued code analysis preserve that fence, and both successful and failed code resubmissions preserve the latest question answers. Teacher reviews apply to the code part. Attacks, improvement, and retry credits use the blended score. The existing 75-average full-damage scaling remains unchanged.
- Teacher-only live question aggregates update on saves. Attacks freeze anonymous `questionStats`. Non-teacher state withholds distributions/correctness until feedback and keeps them withheld in exam mode.
- `server/rooms.ts`: routes `classroomAnswers`; redacts lesson plans separately for students, projector screens, controllers, lobbies, and welcome/reconnect payloads. Only the reserved teacher receives `questionLive`. Teacher and non-teacher states include `questionAnswered` as anonymous per-question counts only in coding/paused; counts derive from memory-only answers and never include correctness. `/api/room/<code>` remains a presence/count/phase/mode summary with no lesson plan. Existing teacher authorization protects CSV and Markdown exports.
- `server/course-generation.ts`: question-aware provider schema and prompt support non-programming lessons and mixed checkpoints. Generated output passes the same normalizer. All provider tests use mocks.
- `server/classroom-export.ts` and `shared/classroom-grades.ts`: retain overall scores, add `sN-code` / `sN-questions` part columns, and add `sN-<question id>` columns to detailed CSV/Markdown exports. Detailed question scores are 0..1; unanswered questions are blank. Missing parts of a recorded mixed submission are 0. Latest retry selection and roster-only students retain existing overall-grade semantics.
- Numeric part scores and per-question scores freeze as optional internal attack metadata (`QuestionAttack` in `shared/classroom-grades.ts`). This preserves teacher exports across retries, departures, and restarts without persisting submitted answers. Per-question numeric metadata is stripped from every non-teacher state. The coordinator changed `shared/classroom.ts` in `da084be`; this server implementation does not edit that contract or `shared/types.ts`. Unrevealed blanks include `blankNumeric` boolean hints without numeric values, tolerances, accept lists, or case-sensitivity settings.
- `tools/classroom-questions-smoke.ts`: isolated HTTP/WebSocket server with mocked local code analysis; parameterized `--bots` and `--profiles`. Profiles: `perfect`, `partial`, `wrong`, `code-only`, `questions-only`, `unanswered`. It checks mixed grades, teacher-only live stats, raid freezing, post-raid reveal, room-summary privacy, and teacher-only exports.
- `server/classroom-questions.test.ts`, `server/classroom-questions-protocol.test.ts`, and `server/course-generation.test.ts`: grading rules, validation limits, rate limits, attempts and locks, stale saves, mixed async interleavings, retry credits, exports, restart behavior, mocked generation, and serialized leakage checks across all six classroom phases.

## Commands and results

Evidence directory: `/tmp/question-sets-evidence/`. Intermediate failing logs were retained separately from final checks.

| Command | Result |
| --- | --- |
| `capmem 8G npx vitest run server/classroom-questions.test.ts` before implementation | Expected baseline failure: 2 tests failed. Existing normalization discarded questions and rejected ignored code fields. Evidence: `baseline-red.log`. |
| `capmem 8G npx vitest run server/classroom-questions.test.ts server/classroom.test.ts server/classroom-review.test.ts server/classroom-budget.test.ts server/classroom-export.test.ts shared/classroom-grades.test.ts server/course-generation.test.ts` | 9 files passed; 140 tests passed. Evidence: `focused-initial.log`. |
| `capmem 8G npx vitest run server/classroom-questions.test.ts` after the main implementation | 112 tests passed. Later export, numeric-boundary, mixed-status, and grade-history regressions are included in the final full run. Evidence: `questions-unit.log`. |
| `capmem 8G npx vitest run server/classroom-questions-protocol.test.ts` during development | Initially failed: the reconnect fixture retained its replaced socket, and a Markdown export separator referenced an out-of-scope variable. Both were corrected. Evidence: `questions-protocol.log`. |
| `capmem 8G npx vitest run server/classroom-questions-protocol.test.ts server/course-generation.test.ts` | 2 files passed; 11 tests passed. Evidence: `protocol-course.log`. |
| `npx tsc --noEmit -p .` during development | Intermediate fixture typing and Markdown separator errors were corrected. Final result below. Intermediate logs: `tsc-initial.log`, `tsc-progress.log`, `tsc-smoke.log`. |
| `capmem 8G npx tsx tools/classroom-questions-smoke.ts --bots=6 --profiles=perfect,partial,wrong,code-only,questions-only,unanswered` | Passed. Scores: 100, 75, 0, 50, 50, unanswered. Five submitted rows; answer reveal and export authorization passed. Evidence: `smoke-6.log`. |
| `capmem 8G npx tsx tools/classroom-questions-smoke.ts --bots=30 --profiles=perfect,partial,wrong,code-only,questions-only,unanswered` | Passed. Thirty bots, 25 submitted rows, 20 answers per question. Frozen statistics, post-raid reveal, and teacher-only exports passed. Evidence: `smoke-30.log`. |
| `capmem 8G npx vitest run` before the final export regression | 264 files passed; 9 files skipped. 3344 tests passed; 19 tests skipped. Evidence: `full-vitest.log`. |
| `capmem 8G npx vitest run` after the final grading and queue regressions | Passed, exit 0: 265 files passed and 9 skipped; 3355 tests passed and 19 skipped. The concurrent UI agent added a test file during this work; these counts describe this final full-suite snapshot. Evidence: `full-vitest-final.log`. |
| `npx tsc --noEmit -p .` after the final changes | Passed, exit 0. Evidence: `typecheck-final.log`. |
| `capmem 8G npx vitest run server/classroom-questions.test.ts` after numeric-boundary checks | 114 tests passed. Evidence: `questions-unit-final.log`. |
| `capmem 8G npx vitest run server/classroom-questions.test.ts` with the mixed-status regression before its fix | Expected regression failure: 1 failed, 114 passed. Evidence: `mixed-status-red.log`. |
| `capmem 8G npx vitest run server/classroom-questions.test.ts server/classroom-questions-protocol.test.ts server/classroom.test.ts server/classroom-review.test.ts server/classroom-budget.test.ts` after the mixed-status fix | 7 files passed; 248 tests passed. Evidence: `mixed-status-green.log`. |
| `capmem 8G npx tsx tools/classroom-questions-smoke.ts --bots=6 --profiles=perfect,partial,wrong,code-only,questions-only,unanswered` after the final logic changes | Passed, exit 0. All six profiles, grade blending, reveal, privacy, and export authorization passed. Evidence: `smoke-6-final.log`. |
| `capmem 8G npx tsx tools/classroom-questions-smoke.ts --bots=30 --profiles=perfect,partial,wrong,code-only,questions-only,unanswered` after the final logic changes | Passed, exit 0. Thirty bots, 25 submitted rows; mixed scores, reveal, and teacher-only exports passed. Evidence: `smoke-30-final.log`. |
| `git diff --check` | Passed. |
| `git diff 753fbe1 -- shared/classroom.ts shared/types.ts` | Empty; the committed contract files are unchanged. |

The serialized privacy tests inspect every non-teacher payload emitted in setup, coding, paused, raid, feedback, and complete. They include lobby and controller messages, reconnect welcome state, a second unrevealed step, exam mode, and isolated immediate feedback. They assert absence of answer keys, accepted-answer strings, explanations, and numeric grading specs before their permitted disclosure. Student/projector requests to all classroom/grades CSV/Markdown exports return 403.

Answers and detailed live reports remain memory-only. Plans, frozen anonymous stats, and frozen numeric export evidence restore after restart. No real provider, production server, or account was used by the new smoke harness. Browser/phone UI acceptance belongs to the parallel UI agent and was not run here. Skipped tests are not claimed as verified.

## Coordinator follow-up (`da084be`)

Implemented decisions (1)–(3):

- `points` must be an integer from 1 through 100, with default 1. Both the shared server normalizer and generated-course validation reject fractional points. The mocked-provider schema and prompt also specify integer points.
- Unrevealed blank questions include `blankNumeric`, one boolean per blank in prompt order. Only the numeric-input hint crosses the redaction boundary; values, tolerances, accepted answers, case sensitivity, and explanations remain hidden.
- `ClassroomState.questionAnswered` contains only anonymous integer counts in current question order. Both teacher and non-teacher state include it in coding/paused. Setup, raid, feedback, and complete omit the property. Counts recompute from live answers, reset on retries/advancement, and do not replay saved counts after restart.
- The phase-by-phase serialization tests now create one correct and one incorrect submission. They assert counts of `[2, 0]` even though the correct count is 1. They inspect student, projector, controller, lobby, and reconnect/welcome payloads and retain the secret-string/key checks.
- The 30-bot harness now includes both text and numeric blanks. It checks `[false, true]` hints, absence of numeric specs before reveal, identical public/teacher counts, coding/paused lifecycle, and absence of the live count property during raid/feedback.

Evidence directory: `/tmp/question-sets-evidence/`.

| Command | Result |
| --- | --- |
| `capmem 8G npx vitest run server/classroom-questions.test.ts server/classroom-questions-protocol.test.ts` before implementing `da084be` | Expected baseline failure: 6 tests failed, 119 passed. Evidence: `da084be-baseline-red.log`. |
| `capmem 8G npx vitest run server/classroom-questions.test.ts server/classroom-questions-protocol.test.ts server/course-generation.test.ts` | Passed: 3 files, 132 tests. Evidence: `da084be-focused-green.log`. |
| `capmem 8G npx tsc --noEmit -p .` | Passed, exit 0. Evidence: `da084be-tsc.log`. |
| `capmem 8G npx vitest run` | Passed, exit 0: 265 files passed, 9 skipped; 3360 tests passed, 19 skipped. Evidence: `da084be-full-vitest.log`. |
| `capmem 8G npx tsx tools/classroom-questions-smoke.ts --bots=30 --profiles=perfect,partial,wrong,code-only,questions-only,unanswered` | Passed, exit 0: 30 bots, 25 submitted rows; public answer counts `[20,20,20]` while correct counts were `[15,10,10]`. Numeric hints, phase lifecycle, reveal, and teacher-only exports passed. Evidence: `da084be-smoke-30.log`. |

Additional checks: `git diff --check` passed; `git diff da084be -- shared/classroom.ts shared/types.ts` was empty.

## Review fix: explicit state audience

- `ClassroomSession.publicState(audience: 'teacher' | 'student')` requires an audience and has no default. A runtime guard rejects omitted, boolean, or unknown audiences before cloning or returning state.
- Private persistence and authorized exports explicitly request `'teacher'`. Broadcast student/projector/controller state explicitly requests `'student'`. Lobby and welcome state choose the audience from the reserved-teacher authorization check.
- All server/shared test callers specify their audience. The regression intentionally includes invalid calls with `@ts-expect-error`, so type checking verifies the required signature while runtime assertions verify rejection.
- The initial type check found the independent client test at `client/edu/debrief.test.ts:118` still calling `session.publicState()` without an audience. The coordinator separately updated the client-owned call to explicitly request `'teacher'`. The server agent did not edit this file.

Evidence directory: `/tmp/question-sets-evidence/`.

| Command | Result |
| --- | --- |
| `capmem 8G npx vitest run server/classroom-questions.test.ts` before the review fix | Expected baseline failure: 1 failed, 120 passed. The omitted audience returned teacher state rather than throwing. Evidence: `audience-baseline-red.log`. |
| `capmem 8G npx vitest run server/classroom-questions.test.ts server/classroom-questions-protocol.test.ts server/classroom.test.ts server/classroom-review.test.ts server/classroom-brief.test.ts shared/classroom-guide.test.ts` | Passed: 8 files, 246 tests. Evidence: `audience-focused.log`. |
| `capmem 8G npx tsc --noEmit -p .` | Failed: `client/edu/debrief.test.ts(118,29): error TS2554: Expected 1 arguments, but got 0.` Evidence: `audience-tsc.log`. |
| `capmem 8G npx tsc --noEmit -p .` after the client-owned caller update | Passed, exit 0. Evidence: `audience-tsc-final.log`. |
| `capmem 8G npx vitest run` | Passed, exit 0: 265 files passed, 9 skipped; 3361 tests passed, 19 skipped. Evidence: `audience-full-vitest.log`. |
| `capmem 8G npx tsx tools/classroom-questions-smoke.ts --bots=30 --profiles=perfect,partial,wrong,code-only,questions-only,unanswered` | Passed, exit 0: 30 bots, 25 submitted rows; numeric hints, public counts, grade blending, reveal, and teacher-only exports passed. Evidence: `audience-smoke-30.log`. |

## Course generation follow-ups: difficulty, presets, teacher instructions

Implemented both follow-ups without editing `client/`:

- `POST /api/course/generate` accepts `difficulty=easy|medium|hard|very-hard|extreme` (default `medium`) and `preset=lesson|quiz|exercise|warmup|exam` (default `lesson`). Unsupported values, including empty or differently cased values, return 400 before generation. The preview response echoes both selected values.
- The generator accepts `(text, difficulty = 'medium', preset = 'lesson', teacherPrompt = '')`. The same difficulty and preset guidance reaches Gemini and the DeepSeek fallback. Every difficulty has separate concrete guidance for code tasks and question sets, from recall/direct application to competition/exam-challenge reasoning. All prompts require correct, material-grounded tasks, keys, and explanations.
- `X-Course-Prompt` uses `encodeURIComponent(text)`. The server decodes once and accepts 0..2000 decoded characters; malformed percent/UTF-8 encodings and oversized text return 400. Teacher instructions occupy their own labeled JSON-string section and may steer topics, count, style, language, and difficulty. JSON format, preset structure, safety rules, and material-grounded correctness remain mandatory. Uploaded documents remain explicitly untrusted reference data.
- `server/course-presets.ts` centralizes preset validation and structural normalization. The normalizer runs both on provider output and at the HTTP boundary, so a stub or provider cannot bypass the preset by returning contrary fields. Lesson retains existing lesson normalization and non-coding question-set support.
- Quiz forces questions-only steps, after-close feedback, after-raid reveal, and timers capped at 180 seconds (manual/zero timers become 120 seconds). Warmup forces questions-only steps, after-close/after-raid, 1 point per question, timers capped at 60 seconds and a total timer budget of 120 seconds (manual/zero timers default to 30 seconds within that budget). Warmup uses easy code/question guidance even when the requested difficulty is higher; only an explicit teacher difficulty instruction may override this baseline.
- Exercise forces mixed code-plus-questions steps, immediate feedback, three attempts per question, and after-raid reveal. It requires a valid brief containing at least one material-grounded hint. The provider schema now supports briefs and the prompt specifies their check alignment. Missing questions or missing exercise hints fail validation rather than generating synthetic content.
- Exam forces after-close feedback and never reveals answers. Normalization removes structured hints, worked examples, and starter scaffolding, while preserving teacher-only question explanations. Prompt instructions also forbid hints embedded in generated prose; semantic quality remains a provider responsibility, not a claim of mocked tests.
- `server/main.ts` sets a 32 KiB request-header limit for HTTP and HTTPS, because a valid 2000-character URI-encoded Chinese prompt exceeds Node's default 16 KiB. Local HTTP tests cover the real 2000-character Chinese boundary and reject 2001 decoded characters.
- New/extended mocked tests cover allowed/default/invalid difficulty and preset values, route-to-provider propagation, teacher instructions and trust boundaries, warmup difficulty precedence, preset enforcement despite contrary model fields, fallback normalization, input immutability, required exercise hints, and rejection of incomplete drafts. No live provider calls were made.

Evidence directory: `/tmp/question-sets-evidence/`.

| Command | Result |
| --- | --- |
| `capmem 8G npx vitest run server/course-http.test.ts` before the difficulty implementation | Expected baseline failure: 18 failed, 5 passed. Evidence: `difficulty-baseline-red.log`. |
| `capmem 8G npx vitest run server/course-http.test.ts server/course-generation.test.ts` after difficulty | Passed: 2 files, 45 tests. Evidence: `difficulty-focused.log`. |
| `capmem 8G npx tsc --noEmit -p .` after difficulty | Passed, exit 0. Evidence: `difficulty-tsc.log`. |
| `capmem 8G npx vitest run server/course-http.test.ts` before presets | Expected baseline failure: 18 failed, 25 passed. Evidence: `preset-baseline-red.log`. |
| `capmem 8G npx vitest run server/course-http.test.ts server/course-generation.test.ts server/course-presets.test.ts` during development | An extra fallback-call parenthesis caused a parse failure; after correction a test incorrectly read `responseSchema` instead of the provider's `responseJsonSchema`. Both were corrected. Evidence: `preset-focused.log`, `preset-focused-green.log`. |
| `capmem 8G npx vitest run server/course-http.test.ts server/course-generation.test.ts server/course-presets.test.ts` after corrections | Passed: 3 files, 87 tests. Evidence: `preset-focused-final.log`. |
| `capmem 8G npx tsc --noEmit -p .` after presets | Failed, exit 2, only in the parallel client's `client/app/course-upload.test.ts(39,52): error TS2339: Property 'checked' does not exist on type 'TestNode'.` The coordinator explicitly directed the server agent to ignore and report client type errors while the UI agent is mid-change. Evidence: `preset-tsc.log`. |
| `capmem 8G npx tsc --noEmit -p /tmp/question-sets-evidence/tsconfig-server-scope.json` | Passed, exit 0. Evidence: `preset-tsc-server-scope.log`. |
| `capmem 8G npx vitest run` | Passed, exit 0: 266 files passed, 9 skipped; 3439 tests passed, 19 skipped. Evidence: `preset-full-vitest.log`. |
| `git diff --check` | Passed. |

The temporary server-scope type-check config extends the repository config and retains every original non-client include. It excludes direct `client/` discovery; any client modules imported by the remaining files still participate in type checking. The repository's TypeScript configuration was not modified. Full-repository type checking is not claimed to pass.

## Real-provider recovery review and score privacy follow-ups

Implemented the coordinator's six generation fixes and subsequent privacy items A/B. The coordinator's existing `/tmp/claude-1000/gen-test/` scripts and three saved successful JSON outputs were inspected without running their real-provider scripts. The four reported failure classes were reproduced with mocked data; the saved successful outputs were replayed offline.

### Generated draft recovery

- `server/course-output.ts` is specific to generated drafts. The ordinary classroom plan/question normalizers remain strict for teacher-authored plans. Each generated question is repaired and validated independently. Invalid items are dropped with their paths/reasons; good questions survive. If any required question set becomes empty, the draft still fails and enters the bounded provider-repair path. Invalid checks are dropped independently. Missing/duplicate question and step IDs receive unique metadata IDs. Invalid rubric criteria are dropped independently while valid zero-weight criteria remain. Excess questions/steps are dropped after the 30-question/12-step bounds.
- Single and multi keys can map exact option text or unambiguous letter labels to option IDs. Valid explicit IDs remain authoritative. Ambiguous text, conflicting letter interpretations, and multi answers containing an unresolved key are dropped rather than guessed. Multi keys are deduplicated only after every answer resolves.
- Invalid optional briefs, including positional `doneWhen` length mismatches, are dropped in full. The original task instructions remain. This latest recovery rule supersedes the earlier all-or-nothing exercise-hint check: a valid exercise can survive a missing/dropped brief. The model prompt continues to request practice hints, but the server does not fabricate them or reject otherwise valid content solely because optional hints are missing.
- Course JSON parsing selects the first complete object, accounting for nested objects, escaped quotes, and braces in strings. It ignores Markdown/prose wrappers and trailing extra output. The 22 KB DeepSeek case is covered by a mocked complete object followed by extra text. A malformed or incomplete first object is not replaced by an arbitrary later object.
- `design/provider.ts` adds an optional parser callback. Default parsing for all other consumers remains strict. Only course generation opts into first-object extraction. Existing provider finish/safety checks remain in place.
- Each provider gets its initial request and at most one repair request when JSON/validation still fails. The repair request goes to the same provider/model with the original constraints, actionable validation errors, and the prior output labeled as untrusted data. Only after that repair fails does the configured fallback run, with the same one-repair limit. Transport/auth failures fall back without spending a repair request. Local evaluator-output failures never trigger a paid repair request.
- Successful results include `diagnostics`: shuffle seed, repair-round count, local repairs, dropped items, and provider-attempt errors. Failed generations expose these diagnostics to the manual evaluator via `CourseGenerationError`; the existing HTTP route still returns its generic failure message. Repair/drop totals cover all attempted drafts, including drafts superseded by a provider repair.

### Presentation and prompt quality

- Generated options use seeded Fisher–Yates shuffling after successful validation. Option texts and grading semantics stay intact. After shuffling, option IDs and answer keys are remapped together to fresh positional IDs so a formerly always-`a` key cannot remain an ID-based shortcut. This happens before classroom publication or student answers exist. `seed` is configurable for reproducibility and recorded in diagnostics. Tests sweep 4000 fixed seeds for each of 2, 3, 4, and 8 options and check that correct-key positions spread across all bins. The seed sweep also verifies that answer-ID letters agree with the shuffled keyed text. Uniformity is statistical, not a promise of perfectly equal bins within a tiny lesson.
- Prompts require similarly sized/detailed options, self-contained questions with needed code quoted inline, and no references to unseen source exercise numbers, page numbers, or sample solutions. They also forbid position-dependent options/letter-only explanations because presentation order is shuffled.
- Warmup guidance now asks for genuinely playful, energizing items: objectively keyed bug-choice follow-ups, guess-the-output races, and true/false lightning rounds. Opinion-only preferences are not graded as objectively correct answers. The warmup question guidance explicitly avoids a definition-recall worksheet.
- Offline replay with seed 42 succeeded for the coordinator's `quiz-easy`, `exam-hard`, and `warmup-medium` saved plans. Histograms changed from the biased source order while the keyed answer meanings remained stable. This is offline structural evidence, not a new real-provider pedagogical-quality result.

### Manual evaluation tool

`tools/course-gen-eval.ts` runs all five presets at easy and extreme plus a medium quiz with teacher instructions, sequentially against the configured real provider/fallback. It prints per-case PASS/FAIL, provider, elapsed time, model repair rounds, local repairs, dropped items, and key-position histograms grouped by option count. It writes a manifest with input hash/seed, raw output for each attempt, per-case normalized output/diagnostics, and `summary.json` to a new empty output directory. A failed case does not prevent the remaining cases from running. PASS means a valid recovered plan, not independently verified factual or pedagogical quality.

The CLI refuses provider calls without `--real`. It has no test imports or automated-suite invocation. Only `--help` and the deliberate missing-`--real` refusal were run here; no paid evaluation was executed.

Manual command (run by hand only):

```sh
capmem 8G npx tsx tools/course-gen-eval.ts --real --file '/path/to/material.pdf' --out '/path/to/new-eval-directory' --seed 20261113
```

### Score privacy and never-reveal normalization

- Before feedback/complete, after-close student reports omit `questionScore`. Mixed reports and rows carry only the code grade in their existing `score` field plus the report's `codeScore`; if code is absent, the student grade is omitted. Question-only reports and rows carry no grade before closure. Blended improvement and score-based ordering are also withheld. Teacher reports/state retain the full question and blended grades.
- Current-round score projections also use only code grades before closure. Internal attacks, damage, grade exports, retry credits, and teacher views continue to use blended grades. Earlier recorded grades remain intact. Exam mode releases the student's final own grade in feedback/complete while never releasing keys or per-question correctness.
- Plan normalization forces `revealAnswers: 'never'` to `answerFeedback: 'after-close'`, including generated plans and code-only steps. Saving a correct exam answer no longer creates an immediate lock or feedback side channel.
- Serialized leak tests now cover both question-only and mixed reports, rows, lobbies, controllers/projectors, all phases, and never-reveal settings. Mixed fixtures distinguish code 80 from question 50 and blended 65 so an accidental blended value is detected.

### Commands and evidence

Evidence directory: `/tmp/question-sets-evidence/`.

| Command | Result |
| --- | --- |
| `capmem 8G npx vitest run server/course-recovery.test.ts` before recovery | Expected baseline failure: 3 failed. Evidence: `recovery-baseline-red.log`. |
| `capmem 8G npx vitest run server/course-recovery.test.ts server/course-generation.test.ts server/course-presets.test.ts server/course-http.test.ts` during recovery | Initial legacy expectations failed because retries now precede fallback, options shuffle, and optional briefs no longer invalidate drafts. Updated those expectations while retaining strict manual-plan checks. Evidence: `recovery-focused.log`. |
| `capmem 8G npx vitest run server/course-recovery.test.ts server/course-generation.test.ts server/course-presets.test.ts server/course-http.test.ts design/provider.test.ts` | Passed: 6 files, 149 tests. Evidence: `recovery-focused-green.log`. |
| `capmem 8G npx vitest run server/classroom-questions.test.ts` before A/B | Expected baseline failure: 3 failed, 121 passed. Evidence: `score-privacy-baseline-red.log`. |
| `capmem 8G npx vitest run server/classroom-questions.test.ts server/classroom-questions-protocol.test.ts server/course-recovery.test.ts server/course-http.test.ts server/course-generation.test.ts server/course-presets.test.ts design/provider.test.ts` | Passed: 8 files, 281 tests. Evidence: `recovery-and-privacy-focused.log`. |
| `capmem 8G npx vitest run server/course-recovery.test.ts server/classroom-questions.test.ts server/classroom-questions-protocol.test.ts` after the final local-output regression | Passed: 3 files, 167 tests. Evidence: `recovery-privacy-final-focused.log`. |
| `capmem 8G npx vitest run server/course-recovery.test.ts server/course-generation.test.ts server/course-presets.test.ts server/course-http.test.ts server/classroom-questions.test.ts server/classroom-questions-protocol.test.ts design/provider.test.ts` after final ID-remapping and rubric regressions | Passed: 8 files, 283 tests. Evidence: `recovery-and-privacy-focused-final.log`. |
| `capmem 8G npx tsc --noEmit -p .` after final changes | Passed, exit 0. Evidence: `recovery-privacy-tsc-final.log`. |
| `capmem 8G npx vitest run` | 3465 passed, 19 skipped, 15 failed; all 15 failures are in `client/app/classroom.test.ts`, caused by `client/edu/question-editor.ts:49` throwing `Cannot set properties of null (setting 'disabled')`. The coordinator explicitly chose `排除这些客户端失败` for this server acceptance. Evidence: `recovery-privacy-vitest.log`. |
| `capmem 8G npx vitest run --config /tmp/question-sets-evidence/vitest-server-scope.config.ts` | Passed, exit 0: all non-client suites, 209 files passed and 9 skipped; 2789 tests passed and 19 skipped. The temporary config preserves the repository config and adds only `client/**` to excludes. Evidence: `recovery-privacy-server-suite-final.log`. |
| `capmem 8G npx tsx tools/classroom-questions-smoke.ts --bots=30 --profiles=perfect,partial,wrong,code-only,questions-only,unanswered` initial run | Failed because the harness compared public counts before every socket had received the latest broadcast. This was a harness delivery-barrier race. Evidence: `recovery-privacy-smoke.log`. |
| Same 30-bot smoke after waiting for every viewer's broadcasts and phase transitions | Passed, exit 0: 30 bots, 25 submitted rows; correct final grades, anonymous counts, reveal and teacher-only exports. Evidence: `recovery-privacy-smoke-final.log`. |
| `capmem 8G npx tsx tools/course-gen-eval.ts --help` | Passed, exit 0; usage printed without reading provider settings or making requests. Evidence: `eval-help.log`. |
| `capmem 8G npx tsx tools/course-gen-eval.ts` | Expected refusal, exit 1: `Refusing provider calls: run by hand with --real.` Evidence: `eval-without-real.log`. |
| `capmem 8G npx tsx /tmp/question-sets-evidence/replay-coordinator-fixtures.ts` | Passed, exit 0; offline replay of the three saved coordinator plans, without provider calls. Evidence: `coordinator-fixtures-offline-final.log`. An earlier inline replay command lost its template variable in the command wrapper; the file-based replay corrected it. |
| `git diff --check` | Passed. |

The real-provider evaluator was not run with `--real`. Browser/device acceptance and the excluded parallel client failures remain outside this server result. No client edits or commits were made.

## Questions

No open server decisions. The latest full-repository type check passed. The 15 parallel client test failures in `client/app/classroom.test.ts` remain outside this agent's ownership and are explicitly excluded from server acceptance by coordinator instruction. The earlier client-owned audience test caller was updated separately to request `'teacher'`; the server agent made no edits under `client/`. The coordinator resolved the earlier projector-count, numeric-input-hint, and points questions in `da084be`.

- The existing admission limit stays at 30 students. The separate future card will raise it to 200; this change does not alter admission limits.
- Current behavior: `revealAnswers: 'never'` forces `answerFeedback: 'after-close'`; grades stay hidden until feedback/complete and keys/per-question correctness never appear. Empty controls consume no per-question attempt. In after-close mode an explicit empty answer clears that saved question, while omitted questions retain their previous answers. Immediate mode ignores empty controls and locked-question changes.

## Ownership

No edits under `client/`. No edits to `README.md` or `auth/setup-email.ts`; their pre-existing modifications remain. No staging, commit, push, deployment, production changes, or memory updates.

## Current real-evaluation and independent quality review follow-up

This section supersedes the historical optional-exercise-brief recovery rule and earlier statements that no paid evaluation was run. The coordinator explicitly requested real DeepSeek evaluations. `REVIEW.md` in `/tmp/claude-1000/gen-eval1/` was read in full.

### Diagnosis of the coordinator artifacts

- `lesson-easy`: the raw initial and repair drafts repeatedly omitted the sole blank marker in mixed steps. Both required question sets became empty. A generated-only repair now inserts a sole missing marker, or replaces exactly matching `___`, `{1}`, `{{blank}}` / `{{answer}}` shapes in order. Accepted answers and numeric specifications do not change. Ambiguous multiple missing markers still drop. Manual classroom-plan validation remains strict.
- `exercise-extreme`: the initial 26 KB draft omitted every single-choice `answer` field even though explanations described answers. Missing keys remain invalid and are never guessed from explanations. The revised prompt requires explicit keys, compact tasks, nested code-step fields, short rubrics, and a literal complete code-question example. DeepSeek course output allowance increased from 8192 to 16384 tokens; the course timeout initially increased from 20 to 90 seconds; the final course/evaluator default is 180 seconds, configurable as documented below.
- `lesson-extreme`: eval1 saved no raw response and no specific provider error. Its original cause remains unconfirmed. It cannot honestly be labeled a JSON, timeout, or token-limit defect from those artifacts. Provider errors now distinguish safe HTTP status, timeout, and finish reason; raw content and finish metadata are saved before incomplete-output rejection.
- The exam-easy / exercise-easy blank drops in eval1 largely have the same missing singleton marker. The new literal blank examples and repairs preserve blanks rather than silently eliminating that question kind.
- The independent review's wrong trace keys and multiple-correct single questions are now regression fixtures. Actual Python execution rejects the wrong binary-search midpoint sequence, wrong strict-merge source pointer, two successful sorted-guard inputs, and wrong tuple-comparison assumption. Image-only heap/partition conventions remain outside this text-path card.

### Quality checks and recovery

- `server/course-quality.ts` runs code-dependent question verification through the existing isolated `server/py-sandbox.ts`. No generated Python runs in the server process or host Python. The existing permission boundary, cleared environment, 256 MiB worker heap, blocked JS bridges, bounded output, and 20-second sandbox limit remain unchanged. Unavailable/failed verification fails closed.
- The generated-only `verification:{code,expression}` field is consumed before publication and removed by the ordinary question normalizer. The schema and prompt place `explain` before `answer`. Quoted functions/statements must match verification syntax trees; formatting changes do not change semantics. Quoted calls can be executed by the verification expression. Function redefinitions and constant key predicates are rejected.
- Preferred verification returns a computed Python value. The server compares it with every literal option using exact Python types, including distinguishing `False` from `0`; zero/multiple correct options invalidate a single key. For per-option claims, a dict must compute every option's boolean predicate from quoted code; all and only keyed options must be true. Blanks compute values in blank order and use the actual accept/numeric rules. Failed keys are dropped, never inferred from explanations.
- Every code question must contain its own complete fenced implementation. A missing fence can be repaired using that item's own verification code within the existing 2000-character prompt bound, followed by the same sandbox check. References to modified/improved/above implementations without complete code, elided implementations, source question numbers and page references are rejected. A sibling question cannot supply context.
- Exact numeric teacher question counts are checked against the total across all steps. Exercise requires a valid per-step hint brief, Python language and nonempty starter files. A malformed brief is still dropped locally, but a missing mandatory exercise brief now triggers the one bounded provider-repair round rather than publishing an incomplete exercise. `doneWhen` must describe code checks only, with exactly one row per check.
- Warmup timers receive at least 15 seconds per conceptual item and 30 per code item. This minimum takes precedence over the earlier 120-second total budget. Recognized true/false keys must be balanced within one; claims must be regenerated rather than flipping valid keys. Contains-check identifiers must occur in the instructions/brief. Conceptual hints, scaffolding, feedback and reveal settings retain preset normalization.
- Prompts require playful warmups, equal-format choices, self-contained code, and extreme questions combining concepts through invariants, counterexamples or boundary conditions rather than long routine traces. The untrusted extracted reference is placed before the authoritative generation rules. This reduces imitation of malformed source indentation and source exercise structure.
- `server/course-evaluation.ts` formats the same failure reason and every raw dropped item/error for both stdout and saved JSON. The CLI saves raw responses, finish metadata, per-attempt diagnostics, repair/drop totals, final/all-attempt verification counts, published question/blank totals and key-position histograms. Automated tests never invoke the real CLI.

### Live evaluation progress

The original eval1 directory is unchanged. `/tmp/claude-1000/gen-eval2/` retains the first stricter run (8/11 PASS), including its failures; `iteration-2/` and later iterations retain each new run rather than overwriting evidence. Early strict runs exposed missing verification, ambiguous multiple-correct claims, mismatched code copies and malformed hint briefs. Subsequent changes repair only unambiguous context/format and improve the prompt; correctness checks are not weakened.

Final paid run: `/tmp/claude-1000/gen-eval2/iteration-4/summary.json`. All 11 cases passed. Published plans contain 40 questions, including 12 blanks. No item was dropped. All 40 published code-dependent keys passed Python sandbox execution; none bypassed verification as conceptual. Local repairs were zero. Two cases used one same-provider repair round each:

- `exam-extreme`: initial `finish_reason=length` was captured and rejected; a compact complete replacement passed. The truncated draft was never published.
- `quiz-medium-teacher`: both initial true/false keys were False. The teacher requested exactly five Chinese questions; all five initial keys passed execution, but the truth-pattern constraint rejected that draft. A replacement with balanced truth keys retained exactly five questions. Correct keys were not flipped to manufacture balance.

The configured request model was `deepseek-flash`, with thinking enabled (low for easy/warmup, high for other cases). The paid run started before the later explicit model-name logging landed; its historical stdout/JSON retain the original provider-only format. The current CLI records model names and environment overrides, as verified by mocked Hydrogen handoff tests. No historical raw output/metadata was rewritten.

| Case | Result | Seconds | Questions / blanks | Local repairs / model rounds | Dropped | Final code keys verified |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| lesson-easy | PASS | 24.7 | 2 / 1 | 0 / 0 | 0 | 2 / 2 |
| lesson-extreme | PASS | 84.7 | 2 / 1 | 0 / 0 | 0 | 2 / 2 |
| quiz-easy | PASS | 16.3 | 5 / 1 | 0 / 0 | 0 | 5 / 5 |
| quiz-extreme | PASS | 53.1 | 4 / 1 | 0 / 0 | 0 | 4 / 4 |
| exercise-easy | PASS | 30.6 | 2 / 1 | 0 / 0 | 0 | 2 / 2 |
| exercise-extreme | PASS | 73.7 | 2 / 1 | 0 / 0 | 0 | 2 / 2 |
| warmup-easy | PASS | 20.9 | 4 / 1 | 0 / 0 | 0 | 4 / 4 |
| warmup-extreme | PASS | 22.1 | 4 / 1 | 0 / 0 | 0 | 4 / 4 |
| exam-easy | PASS | 37.6 | 5 / 1 | 0 / 0 | 0 | 5 / 5 |
| exam-extreme | PASS | 130.2 | 5 / 2 | 0 / 1 | 0 | 5 / 5 |
| quiz-medium-teacher | PASS | 67.5 | 5 / 1 | 0 / 1 | 0 | 5 / 5 |

The exact paid command was:

```sh
capmem 8G npx tsx tools/course-gen-eval.ts --real --provider deepseek --file '/home/wilf/Downloads/Module 7 Practice Exercises_ CMPSC 132 Fall 2026.pdf' --out /tmp/claude-1000/gen-eval2/iteration-4 --teacher-prompt 'Exactly 5 questions. Write everything in Simplified Chinese.'
```

The final run used the configured local DeepSeek key; no key value was printed. The extracted PDF text, not image-only diagrams, was the reference. See `/tmp/claude-1000/gen-eval2/FINAL.md` for the unambiguous final-run pointer. The original eval1 artifacts are unchanged.

DeepSeek thinking is enabled only for course requests; other `deepseekJson` consumers retain their disabled-thinking default. Configuration follows the [official thinking-mode reference](https://api-docs.deepseek.com/guides/thinking_mode/). Final replay of the saved successful drafts uses the current server code and does not call a provider. It checks identical shuffled plans, zero drops, all preset/teacher constraints, and all 40 keys. This is execution/structural evidence, not a proof of arbitrary natural-language claims, explanation quality, or image-only source facts.


### Gemini Hydrogen handoff — READY for coordinator run

The course-generation code is ready for a coordinator-owned Gemini evaluation. No local Gemini key was used; local paid evaluations use DeepSeek. The coordinator's model-list check is the source for this key's Hydrogen entitlement.

- Course default: `gemini-4-hydrogen`. `GEMINI_MODEL` still overrides it; the programmatic `model` option takes precedence. Optional `models/` prefixes are normalized.
- The request remains Developer API `v1beta/models/<model>:generateContent` with `x-goog-api-key`, `contents`, `generationConfig.responseMimeType: application/json`, and `responseJsonSchema`. Course requests set `maxOutputTokens: 32768` and Hydrogen `thinkingConfig.thinkingLevel: HIGH`. No `thinkingBudget`, `MINIMAL`, sampling, penalty, multi-candidate, cache, tool or continuation parameters are sent. This compact course task does not request long decodes. Other Gemini consumers retain their defaults.
- Provider timeout: 180000 ms per request, including each bounded repair attempt. Configure with `COURSE_GENERATION_TIMEOUT_MS`, the generator's `timeoutMs` option, or evaluator `--timeout-ms` (CLI takes precedence). The course setting does not change other provider consumers' shorter timeouts.
- `readProviderSetting` checks `process.env.GEMINI_API_KEY` before optional local files. The evaluator uses that factory path. `--provider gemini` explicitly disables DeepSeek fallback, so a Gemini failure cannot appear as a fallback PASS. Startup stdout/manifest identify configured models, while every result/failure and raw-response metadata identify the model actually requested. Credentials are never printed or saved.
- Mocked tests verify the Hydrogen URL, allowed request keys, environment credential use, default/override model precedence, timeout configuration, diagnostics/model printing, and absence of credential strings from saved result data. `hydrogen-focused.log`: 6 files and 75 tests passed. `hydrogen-tsc.log`: type check passed. This proves request construction, not successful authentication/generation against Hydrogen.

Google documentation checked on 2026-11-13: [Hydrogen developer guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-4-hydrogen) documents `HIGH` and rejects `thinkingBudget`/`MINIMAL`; the [GenerationConfig reference](https://firebase.google.com/docs/reference/js/ai.generationconfig) documents the JSON MIME/schema pairing. This project uses direct REST and needs no SDK upgrade.

Coordinator command, with the production key already supplied through `GEMINI_API_KEY` in the process environment (do not put its value in this report):

```sh
GEMINI_MODEL=gemini-4-hydrogen capmem 8G npx tsx tools/course-gen-eval.ts --real --provider gemini --timeout-ms 180000 --file '/home/wilf/Downloads/Module 7 Practice Exercises_ CMPSC 132 Fall 2026.pdf' --out /tmp/claude-1000/gen-eval-hydrogen --teacher-prompt 'Exactly 5 questions. Write everything in Simplified Chinese.'
```

The output directory must be new and empty. Gemini live validation is pending the coordinator's run; the server implementation and mocked handoff checks are ready. The local DeepSeek evaluation is complete. Final local command gates are recorded below; the server report is DONE.

### Final command gates

Evidence directory: `/tmp/question-sets-evidence/`. All resource-intensive commands use the 8 GiB `capmem` scope. No automated test calls a real provider.

| Command | Final result / evidence |
| --- | --- |
| `capmem 8G npx tsc --noEmit -p .` | Passed, exit 0. `server-final-tsc.log`. |
| `capmem 8G npx vitest run` | Passed, exit 0: 271 files passed, 9 skipped; **3513 tests passed, 19 skipped**. `server-final-vitest.log`. No client failures in this final snapshot; the historical exclusions above were not needed for this run. |
| `capmem 8G npx tsx tools/classroom-questions-smoke.ts --bots=30 --profiles=perfect,partial,wrong,code-only,questions-only,unanswered` | Passed, exit 0: 30 bots, 25 submitted rows, expected mixed grades, counts `[20,20,20]`, numeric hints, reveal, teacher-only exports. `hydrogen-smoke30-final.log`. |
| `capmem 8G npx tsx tools/course-gen-eval.ts --real --provider deepseek --file '/home/wilf/Downloads/Module 7 Practice Exercises_ CMPSC 132 Fall 2026.pdf' --out /tmp/claude-1000/gen-eval2/iteration-4 --teacher-prompt 'Exactly 5 questions. Write everything in Simplified Chinese.'` | Passed, exit 0: **11/11**, **0 drops**, 40 verified questions / 12 blanks. Per-case table above. `eval2-iteration4.log`; immutable outputs in `iteration-4/`. |
| `capmem 8G npx tsx /tmp/question-sets-evidence/audit-eval4.ts` | Passed, exit 0: final-code offline replay of all 11 accepted raw drafts; identical normalized/shuffled plans, zero drops, 40 keys reverified, zero provider calls. `eval4-final-code-audit2.log` / `eval4-final-code-audit.json`. |
| `capmem 8G npx vitest run server/course-provider-config.test.ts server/course-generation.test.ts server/course-evaluation.test.ts server/course-quality.test.ts design/provider.test.ts` | Passed: 6 files, 75 tests before the final additional boundary cases; all later tests are included in the full-suite result. `hydrogen-focused.log`. |
| `capmem 8G npx vitest run server/course-quality.test.ts -t 'numeric option IDs'` before the ordering fix | Expected regression failure: a valid computed key used IDs `1`, `2`, `10`; JS integer-key ordering differed from Python lexical ordering. `verification-numeric-ids-red.log`. Expected JSON keys now serialize lexically; the regression passes in the final full suite without changing grading semantics. |
| `capmem 8G npx tsx tools/course-gen-eval.ts --help` | Passed without provider calls. `hydrogen-eval-help.log`. |
| `capmem 8G npx tsx tools/course-gen-eval.ts` | Expected refusal, exit 1 without provider calls. `hydrogen-eval-gate.log`. |
| `git diff --check` | Passed. |
| `git diff da084be -- shared/classroom.ts shared/types.ts` | Empty; committed protocol contract remains unchanged. |

Current acceptance: server implementation, mocked provider coverage, full local tests, 30-bot smoke and the requested DeepSeek real evaluation are complete. The Gemini Hydrogen integration is READY for the coordinator command above. Live Gemini authentication/generation is not verified locally because the production Gemini key belongs to the coordinator. Browser/device acceptance and image-only PDF extraction are outside this server work.

No edits under `client/`, `README.md`, or `auth/setup-email.ts`. No staging, commit, push, deployment, production mutation or memory update.

## Gemini HTTP 400 follow-up — READY for coordinator rerun

Source: the coordinator reports all 11 Hydrogen cases failing in 1–3 seconds, and a real-request bisect in `/tmp/claude-1000/gen-test/bisect.mts` isolates `minItems` / `maxItems` in `responseJsonSchema`. The coordinator found that removing the whole schema or just those two keywords succeeds; removing other keywords does not. This supersedes the earlier request-construction readiness claim: no successful local Gemini run is claimed.

- `server/course-generation.ts` now creates a separate Gemini wire schema by recursively removing only `minItems` and `maxItems`, including nested arrays under `anyOf`. The complete source schema remains intact. The adapter preserves `pattern`, `maxLength`, `minimum`, `maximum`, `anyOf`, required fields, enum values and field order. Only course requests use this adapter; other Gemini schema consumers are unchanged.
- The server's strict classroom/question/brief/rubric validators and generated-item recovery are unchanged. Array count limits remain server-enforced. The prompt retains the step, question, option, answer, blank, accepted-answer, brief and rubric count guidance; optional brief concepts (0–6) and multi-answer keys (1–8) are now explicit too. `thinkingConfig`, `maxOutputTokens`, model selection and timeout settings are unchanged.
- `design/provider.ts` reads the structured Gemini `error.message` on non-success HTTP responses. `GeminiHttpError.message` now includes status plus that message, so course attempt diagnostics and evaluator stdout/saved failure reasons retain the actionable provider explanation. Only this message is included; raw bodies and additional error details are omitted. Messages normalize whitespace, redact the request API key (including URI encoding), and are bounded to 2000 characters. Missing/malformed/non-string messages retain status-only errors. HTTP upload failures retain their existing generic response.
- Mocked tests recursively assert that the transmitted full course schema contains no `minItems` or `maxItems`, while other schema constraints survive and prompt count limits remain. They cover propagation of `Request contains an invalid argument: minItems is unsupported.` into course/evaluator diagnostics, credential redaction, message bounds, and status-only fallback. A rejected HTTP request still makes no model-repair call.

Evidence directory: `/tmp/question-sets-evidence/`.

| Command | Result |
| --- | --- |
| `capmem 8G npx vitest run server/course-provider-config.test.ts design/provider.test.ts` before implementation | Expected baseline failure: 3 failed, 34 passed. `hydrogen-schema-red.log`. |
| `capmem 8G npx vitest run server/course-provider-config.test.ts design/provider.test.ts server/course-generation.test.ts server/course-evaluation.test.ts server/course-recovery.test.ts` | Passed: 6 files, 100 tests. `hydrogen-schema-focused.log`. |
| `capmem 8G npx vitest run` | Passed, exit 0: 271 files passed / 9 skipped; **3519 tests passed / 19 skipped**. `hydrogen-schema-full-vitest.log`. |
| `capmem 8G npx tsc --noEmit -p .` | Passed, exit 0. `hydrogen-schema-tsc-final.log`. The initial type check found `TS18046` in the new error test; an explicit `instanceof GeminiHttpError` guard fixed it. The initial log is retained as `hydrogen-schema-tsc.log`. |
| `capmem 8G npx vitest run server/course-provider-config.test.ts design/provider.test.ts` after the test typing correction | Passed, exit 0: 3 files, 37 tests. `hydrogen-schema-focused-final.log`. |
| `capmem 8G npx tsx tools/classroom-questions-smoke.ts --bots=30 --profiles=perfect,partial,wrong,code-only,questions-only,unanswered` | Passed, exit 0: 30 bots, 25 submitted rows; grades, counts, numeric hints, reveal and teacher-only exports. `hydrogen-schema-smoke30.log`. |
| `git diff --check` | Passed. |

**READY:** the coordinator can rerun the existing `--provider gemini` command above with `GEMINI_API_KEY` supplied through the environment and a fresh empty output directory. No real provider call or real evaluation was run for this follow-up. Live acceptance of the adjusted Gemini request remains for the coordinator; the historical DeepSeek results are not Gemini evidence.

No edits under `client/`, `README.md`, or `auth/setup-email.ts`. No staging, commit, push, deployment or production mutation.

## Gemini omitted-question follow-up — READY for coordinator rerun

The coordinator's post-400-fix Gemini run has 10/11 failed cases with missing question arrays. Read-only inspection confirms `quiz-easy.attempt-1-gemini_gemini-4-hydrogen.txt` contains a questions-mode step but no `questions` property. The earlier wire schema permitted this omission, as well as missing choice keys and explanations. Whether Hydrogen systematically drops optional fields remains a hypothesis; this change makes required content explicit in its schema.

`server/course-generation.ts` now builds a fresh Gemini schema for each preset. The ordinary lesson validators, shared protocol and DeepSeek schema-independent recovery remain intact. All generated schemas still remove `minItems` / `maxItems` recursively after the preset requirements are applied.

| Preset | Required Gemini step content |
| --- | --- |
| `quiz` | `mode` narrowed to `questions`; `questions`, feedback and reveal fields required. No code checks/rubric/starter/brief properties. |
| `warmup` | Same question-only requirements; question points fixed to 1. Server timer minimums and key balancing remain enforced. |
| `exam` | Question-only requirements; after-close / never; no hint brief or starter properties. |
| `exercise` | `mode` narrowed to `mixed`; questions, rubric, checks, checksWeight, brief, language and starter required. Brief requires goal/todo/doneWhen/**hints**. Starter files require path/content; language is Python; question maxAttempts is 3. |
| `lesson` | Explicit mode branches: code/mixed require rubric, checks and checksWeight. Questions remain optional and allowed on code steps; mixed steps require them. The questions-only branch requires questions, preserving non-programming lessons from the original card. An optional lesson brief, when supplied, requires hints too. |

Every question now requires `id`, `kind`, `prompt`, `explain`, points, maxAttempts and **verification** on the Gemini wire. Kind-specific branches require options plus a string answer for single choice; options plus an answer array for multi choice; blanks with required accept arrays for blanks. `explain` remains before `answer` and must contain non-whitespace text. This prevents the next omission from simply moving inside each question.

Verification is an explicit nullable field: **only conceptual questions without executable claims use `verification: null`**. A non-null verification object requires nonempty `code` and `expression`. Prompts state this distinction. The existing sandbox gate rejects missing/null verification on a trace or any code-dependent question, so null cannot bypass execution checks. New runtime tests cover conceptual null acceptance, code-null rejection, and removal of verification metadata from the published plan. This keeps history/non-coding questions possible without inventing Python verification for prose facts.

Generated literal/doctest checks now require nonempty `text`; file/CI checks do not. The prompt asks for inline doctest examples rather than depending on omitted/unseen docstrings. Required arrays still need to be nonempty according to the prompt and server validation; the unsupported Gemini array-count keywords are not reintroduced. Preset schemas are cloned independently, and tests check that building exercise requirements cannot mutate later lesson/exam requests.

Offline wire-schema snapshots, captured through a mocked fetch with **zero real provider calls**, are available for coordinator inspection:

- `/tmp/question-sets-evidence/gemini-schema-lesson.json`
- `/tmp/question-sets-evidence/gemini-schema-quiz.json`
- `/tmp/question-sets-evidence/gemini-schema-exercise.json`
- `/tmp/question-sets-evidence/gemini-schema-warmup.json`
- `/tmp/question-sets-evidence/gemini-schema-exam.json`

Capture command: `capmem 8G npx tsx /tmp/question-sets-evidence/capture-preset-schemas.ts`; summary in `hydrogen-required-schemas.log`. These are actual serialized request schemas, not evidence of real Gemini acceptance.

| Command | Result |
| --- | --- |
| `capmem 8G npx vitest run server/course-provider-config.test.ts` before the preset builder | Expected baseline failure: 11 failed, 5 passed. `hydrogen-required-red.log`. |
| `capmem 8G npx vitest run server/course-provider-config.test.ts server/course-generation.test.ts server/course-presets.test.ts server/course-evaluation.test.ts` | Passed: 4 files, 61 tests. `hydrogen-required-focused.log`. |
| `capmem 8G npx vitest run server/course-provider-config.test.ts server/course-quality.test.ts server/course-generation.test.ts server/course-presets.test.ts server/course-recovery.test.ts server/course-http.test.ts` | Passed: 6 files, 163 tests, including the final check-text and nullable-verification cases. `hydrogen-required-focused-final.log`. |
| `capmem 8G npx vitest run` after final schema changes | Passed, exit 0: 271 files passed / 9 skipped; **3533 tests passed / 19 skipped**. `hydrogen-required-full-vitest-final.log`. |
| `capmem 8G npx tsc --noEmit -p .` | Passed, exit 0. `hydrogen-required-tsc-complete.log`. |
| `capmem 8G npx tsx tools/classroom-questions-smoke.ts --bots=30 --profiles=perfect,partial,wrong,code-only,questions-only,unanswered` | Passed, exit 0: 30 bots, 25 submitted rows; grades, counts, numeric hints, reveal and teacher-only exports. `hydrogen-required-smoke30.log`. |
| `git diff --check` | Passed. |

**READY:** the coordinator can run the new preset schemas against Hydrogen. Use the existing environment-supplied Gemini key and a fresh output directory, for example:

```sh
GEMINI_MODEL=gemini-4-hydrogen capmem 8G npx tsx tools/course-gen-eval.ts --real --provider gemini --timeout-ms 180000 --file '/home/wilf/Downloads/Module 7 Practice Exercises_ CMPSC 132 Fall 2026.pdf' --out /tmp/claude-1000/gen-eval-hydrogen-required --teacher-prompt 'Exactly 5 questions. Write everything in Simplified Chinese.'
```

No real provider call or real evaluation was run for this follow-up. Live model compliance with the revised schema is pending the coordinator's run. The prior DeepSeek results are historical, not evidence for these new Gemini requests.

No edits under `client/`, `README.md`, or `auth/setup-email.ts`. No staging, commit, push, deployment or production mutation.

## Hydrogen rerun 3 and independent round-2 review — READY for coordinator rerun

Read the complete `/tmp/claude-1000/gen-eval-hydrogen/REVIEW.md`. Its independent result is 0 wrong keys / 0 ambiguous items among 38 published questions. This follow-up addresses the lesson failures, low counts, checkpoint solution leakage, shared listings, conceptual-item false positive, stale count wording, repeated inputs, per-plan key positions, and exam attempts. No real provider call was made for this follow-up.

### Schema, recovery and question counts

- The Gemini lesson schema now uses complete, standalone discriminated step objects, rather than conditional requirements layered over one shared object. Code and mixed branches require rubric/checks/checksWeight; mixed and questions branches require questions. Non-programming question-only lessons remain supported. Every serialized preset schema still recursively excludes `minItems` / `maxItems`; server count limits remain intact.
- Generated lesson steps marked questions/mixed with missing, null or empty questions become code only when their original code-task fields validate. Other presets do not downgrade. No weights, rubric or checks are invented. The two old lesson raw drafts also lack `checksWeight`, so they are **not** valid code tasks and still fail closed. The new full schema requires that field. Offline replay records this distinction in `hydrogen-lesson-count-balance-offline-final.log`.
- Default prompt targets: quiz 8–12 total; warmup 6–10 total; exam 10–15 total; exercise 2–4 per step plus code. Generated plans enforce minima of 8 / 6 / 10 / 2 per step respectively. A shortfall enters the existing single same-provider repair round with the exact number to add. An explicit supported teacher exact count takes priority; exact total validation still runs. Lesson checkpoints remain optional. These generation policies do not impose new minima on teacher-authored plans.
- The HTTP boundary also checks generated minima, including injected generator results. Model output guidance allows up to 60000 characters to fit these counts, while existing hard response bounds and provider token limits remain enforced. Shared listings reduce repeated code and verification helpers.
- After item recovery and sandbox filtering, explicit numeric or English number-word question counts in step instructions are reconciled with the published count. Fenced code is preserved. The reviewed “four quick challenges” case now retains all four valid concepts; its old raw draft correctly requests two additional warmup questions instead of publishing below the new minimum.

### Shared context and executable correctness

- The coordinator committed `ClassroomStep.questionContext?: string`. The server validates string type and the 4000-character limit, preserves it through normalization/persistence, and sends it unchanged in student/projector plans. It is public Markdown-lite, not answer metadata. This work does not edit the committed shared contract or `client/`; the UI agent owns rendering.
- Gemini requires a nullable `questionContext` slot on every generated step, with null normalized to absence. The prompt asks for a complete fenced Python listing once per step; questions may reference “the code above” in that step. It prohibits keys, explanations and task solutions in public context. Helpers in private verification can use `pass`; the sandbox preloads shared code and validates the same quoted syntax/semantics. Published question prompts do not duplicate that shared listing.
- Mixed-step checkpoint questions are rejected when their publicly quoted code or shared context passes **all** of that step's doctests in the existing Python sandbox. A simple one-function rename is checked too. Private verification helper code is not treated as student-visible code. Bug variants failing a task test remain eligible. Missing/timed-out sandbox checks fail closed. Dropped questions retain raw evidence and reason; an empty step or count shortfall enters repair. This guard uses actual doctests; it does not claim solution detection for tasks without doctests or arbitrary semantic equivalents.
- Code dependence no longer follows from a function identifier such as `merge(lst1, lst2)` alone. Concrete executions, results and iteration/comparison counts still require code and executable verification. Pure concept and keyword/statement-definition questions remain supported. Tests execute comparison-count, counterexample and fix-selection predicates against shared code, as well as ordinary return-value keys.

### Variety, keys and preset normalization

- Quiz/exam prompts request at least one non-trace item per four questions: concepts, loop/comparison counts, counterexamples or verified changes that make tests pass. Extreme guidance requires combined concepts and reasoning, rather than simply longer traces. Removed conflicting prose that discouraged these verifiable forms and repetitive “Combines X with Y” explanation boilerplate.
- Each request injects a deterministic input pool salted by request seed and preset: varied integer lists, present/absent targets and a permutation of blank-index suggestions. Default request seeds are random; explicit seeds reproduce results. The prompt directs the model to use suitable varied inputs and avoid canonical textbook lists. Actual compliance and cross-run content variety still require the coordinator's real model review; the pool is not a duplicate-content guarantee.
- Option positions now balance within each plan, separately for each option count, including single and multi keys. Seeded tie breaks and content shuffles remap option IDs and keys together. The same factory path runs for Gemini and DeepSeek. It does not balance unrelated evaluation cases together. Replaying the old exam-extreme four-option histogram changes `[4,1,0,0]` to `[2,1,1,1]`; quiz-extreme changes `[0,0,1,3]` to `[1,1,1,1]`. Grading semantics remain identical.
- Exam normalization forces `maxAttempts: 1`; the Gemini exam schema also fixes it to 1. The existing after-close / never rules remain enforced.

### Final local verification for this follow-up

All logs below are in `/tmp/question-sets-evidence/`. All listed TypeScript, test, smoke and offline scripts ran under `capmem 8G`. Tests use mocked providers; sandbox checks run locally.

| Command | Result / evidence |
| --- | --- |
| `capmem 8G npx vitest run server/course-lesson-balance.test.ts` before implementation | Expected regression failures: 11 failed / 1 passed. `hydrogen-lesson-count-balance-red.log`. |
| `capmem 8G npx vitest run server/course-pedagogy.test.ts server/course-lesson-balance.test.ts server/course-provider-config.test.ts server/course-quality.test.ts server/course-recovery.test.ts server/course-presets.test.ts server/course-http.test.ts server/course-generation.test.ts server/course-evaluation.test.ts` | Focused compatibility gate: 9 files / 195 tests passed before the final additional boundary cases; the final full suite includes all later cases. `hydrogen-review2-focused-final.log`. Earlier concept and singleton-fixture failures are retained in `hydrogen-review2-focused.log` and `hydrogen-review2-compat.log`. Intentional singleton tests now explicitly request exactly one question; generation minima are not bypassed. |
| `capmem 8G npx vitest run` | Passed, exit 0: **273 files passed / 9 skipped; 3562 tests passed / 19 skipped**. `hydrogen-review2-complete-vitest.log`. No client test exclusions were needed for this snapshot. |
| `capmem 8G npx tsc --noEmit -p .` | Passed, exit 0. `hydrogen-review2-tsc-complete.log`. |
| `capmem 8G npx tsx tools/classroom-questions-smoke.ts --bots=30 --profiles=perfect,partial,wrong,code-only,questions-only,unanswered` | Passed, exit 0: 30 bots / 25 submitted rows; expected mixed grades, public counts `[20,20,20]`, numeric hints, **public shared context**, answer secrecy, reveal and teacher-only exports. `hydrogen-review2-smoke30.log`. |
| `capmem 8G npx tsx /tmp/question-sets-evidence/capture-preset-schemas.ts` | Passed: five serialized preset schemas saved as `gemini-schema-{lesson,quiz,exercise,warmup,exam}.json`; full mode branches and required nullable context recorded in `hydrogen-review2-schemas.log`; zero real calls. |
| `capmem 8G npx tsx /tmp/question-sets-evidence/replay-hydrogen-review2.ts` | Reviewed raw warmup-extreme retains 4 / drops 0 and reports the 2-item shortfall. Reviewed exercise-easy rejects the task-solution checkpoint. `hydrogen-review2-offline.log`; zero real calls. |
| `git diff --check` | Passed. |
| `git diff -- shared/classroom.ts shared/types.ts` | Empty against the current committed contract, including coordinator-owned `questionContext`. The older `da084be` comparison above is historical and is not the current contract gate. |

Open questions: none. The implementation is **READY** for the coordinator's fresh Gemini evaluation. No new per-case live PASS table is claimed. For example, with `GEMINI_API_KEY` already supplied through the environment:

```sh
GEMINI_MODEL=gemini-4-hydrogen capmem 8G npx tsx tools/course-gen-eval.ts --real --provider gemini --timeout-ms 180000 --file '/home/wilf/Downloads/Module 7 Practice Exercises_ CMPSC 132 Fall 2026.pdf' --out /tmp/claude-1000/gen-eval-hydrogen-review2 --teacher-prompt 'Exactly 5 questions. Write everything in Simplified Chinese.'
```

The output directory must be new and empty. The coordinator owns this run; it was not executed here. Image-only PDF content remains outside this card. No edits under `client/`, `README.md`, or `auth/setup-email.ts`; their concurrent changes were left intact. No staging, commit, push, deployment, production mutation or memory update.

## Hydrogen round 4 lesson failure and round-3 quality review

This section supersedes the earlier lesson schema, all-doctests-only leak threshold, universal code-verification heuristic, seed pool, and short quiz timer claims. Read all four `lesson-*.attempt-*.txt` files in `/tmp/claude-1000/gen-eval-h3/` and the complete `REVIEW.md` there. The review independently found 0 wrong keys in 38 questions; its uncovered cases failed before review because of Gemini prepaid credits. No real Gemini or other real provider call was made for these changes.

### Lesson root cause and required code shape

Every lesson raw attempt, including both repair attempts, contains `mode:"questions"`, `questions:[]`, valid duration 900, and **no rubric, checks or checksWeight**. Instructions describe programming work, but do not supply a gradeable code task. The old lesson schema explicitly offered a question-only branch without those three fields. Removing Gemini's unsupported array cardinality keywords also made an empty array schema-valid. Thus these outputs could satisfy that cheap branch of the wire schema while failing the server's nonempty-question validator. Repeating the same schema during repair preserved this escape route. This is a schema/prompt mismatch, not a reason to invent task weights or accept an empty question set.

- Gemini lesson steps now have **one flat object shape** with unconditionally required rubric/checks/checksWeight, and mode limited to code/mixed. No question-only union branch remains. Questions are an optional checkpoint field; mixed steps still require nonempty questions at server validation. An empty mixed step can become code only when its original code task validates. The wire still omits unsupported minItems/maxItems; strict server limits remain enforced.
- The lesson prompt explicitly requires these fields on every step and includes a complete code-step format example. It removes the competing non-coding/question-only lesson guidance. The latest coordinator decision makes the **lesson generation preset a coding lesson**; quiz/warmup/exam provide question-only generation. Teacher-authored question-only plans remain supported by the ordinary classroom normalizer.
- Both factory and HTTP generation validation reject a question-only lesson even if it contains valid questions. Actual non-coding generation tests now use the quiz preset with an explicit fixture count. A model must supply missing task fields during repair; recovery does not synthesize them. The bounded repair prompt also permits adding a reported question-count shortfall, removing an older contradictory instruction not to add any questions during repair.

### HTTP 402/429 fallback diagnostics

- Gemini HTTP errors exit that provider immediately: no second Gemini request, model-repair request, backoff or delay for a billing/rate error. If DeepSeek is configured, the factory starts it next. Each attempt records `httpStatus` and `failureKind` (`billing` for 402, `rate-limit` for 429), plus the existing bounded/redacted provider message.
- `diagnostics.fallbacks` explicitly records source, destination, status and reason. `courseEvaluationSummary` includes it in stdout and saved results even when DeepSeek succeeds, so a fallback PASS retains the Gemini failure instead of hiding it. If both fail, the existing failure chain includes both providers.
- Explicit provider pinning remains explicit: evaluator `--provider gemini` disables DeepSeek, reports the quota failure, and makes one Gemini request. Server/default factory behavior and evaluator `--provider auto` use configured fallback. Tests cover 402/429 on both the initial request and the one permitted repair request, as well as fallback explicitly disabled. No live quota probe was run.

### Review-3 generation policies

- **Near-solution leaks:** count individual doctest examples rather than check rows. Public question/shared/hint code is rejected when it passes **strictly more than half** of the step's examples, including renamed functions among multi-function contexts. Exactly half remains allowed according to the user's explicit threshold. Alias candidates run in separate modules within one existing isolated sandbox job; repeated shared listings are cached per step. Missing counts, unavailable sandbox or timeout fail closed. Tasks without doctests cannot receive this execution-based proof.
- **Hints and immediate answers:** hints cannot provide executable replacement code or exact assignment/comparison/return fixes; prompts ask for conceptual direction. Immediate-feedback checkpoint keys cannot supply a missing code-task line. These checks do not flip keys or invent replacement distractors; invalid content enters the bounded repair path. The deterministic text checks cover explicit code fixes, not arbitrary semantic paraphrases, which remain part of independent content review.
- **Starters:** an unchanged starter must pass zero doctest examples. Generated unfinished functions are instructed to raise NotImplementedError, since `return -1`, `return []` and even `pass`/None can pass examples accidentally. New optional sandbox example counts are requested only by generation checks. Ordinary student sandbox result payloads remain unchanged. Existing isolation, environment clearing, 256 MiB worker heap and 20-second sandbox limit remain intact.
- **Timing:** generated timers have a deterministic per-question floor based on type, concrete execution/counterexample form, candidate/function count, loop structure, list size in prompt/options/shared code and listing length. Shared code reading is budgeted once. Base budgets are 15 seconds for short concepts, 25 for multi, 20 for conceptual blanks, 45 for value traces, and at least 90 for multi-option counterexamples/fixes, plus size costs. Quiz's old 180-second clamp cannot override the workload floor. Plans exceeding the ordinary 7200-second step limit must split work during repair. These are conservative static estimates, not measurements of human solve time.
- **Material coverage:** syllabus-recall items about which topics a module covers are rejected. Generation prompts and source-aware checks reject named sorting algorithms with only headings/images or no teaching text. The taught merge of two sorted lists remains distinct from merge sort. English and Chinese teaching explanations are recognized in tests; no sorting behavior is invented from missing PDF figures. Material availability uses text heuristics and remains subject to review of the source.
- **Inputs:** easy/medium pools and warmup pools contain 4–5 small positive integers in 1..20, with small present/absent targets and five blank-index suggestions. Larger signed lists and eight index suggestions are reserved for hard+. Preset/seed reproducibility remains intact. Pools are generation suggestions; teacher steering and material correctness still take priority.
- **Verification scope:** only concrete execution-value requests require executable verification. Pure concepts, invariants, purpose/definition/why items remain accepted with null or missing verification even beside shared/own code. Naming merge(lst1,lst2), outputs or loop termination does not itself force execution. Concrete call-value true/false claims still require verification. Accepted concepts are marked `not-required`, not reported as missing/failed keys. This follows the latest user decision; conceptual fix/counterexample claims do not receive a general semantic proof from the sandbox.
- **Published wording:** after recovery and sandbox/content/leak drops, explicit question counts are reconciled in instructions, questionContext and brief.todo. Fenced code and prose input-list sizes are preserved.
- **Multi-selects:** generated multi items require at least two wrong options and no more than half the options correct. Invalid items retain raw evidence; the model must rewrite them during repair. Prompts require plausible taught misconceptions and reject the three-true/one-absurd pattern. Plausibility itself remains a semantic review criterion; the structural gate does not claim to prove it.

### Offline evidence and local gates

Evidence directory: `/tmp/question-sets-evidence/`. All TypeScript/test/smoke/offline commands below ran under `capmem 8G`. No tests or replay scripts call a real provider.

| Check | Result / evidence |
| --- | --- |
| Lesson/schema/quota baseline: `capmem 8G npx vitest run server/course-lesson-required.test.ts server/course-lesson-balance.test.ts server/course-provider-config.test.ts` | Expected regression failures: 9 failed / 27 passed. `hydrogen-h3-lesson-quota-red.log`. Immediate transport fallback already existed; the new failing assertions require the flat schema, generation boundary and explicit status/fallback diagnostics. |
| Lesson/schema/quota focused compatibility gate | Passed: 6 files / 101 tests. `hydrogen-h3-lesson-quota-focused-final.log`. |
| Review-3 baseline: `capmem 8G npx vitest run server/course-review3.test.ts` | Expected failures: 13 failed / 1 passed. `hydrogen-h3-review3-red.log`. |
| Review-3 focused gate: `capmem 8G npx vitest run server/course-review3.test.ts server/course-quality.test.ts server/course-pedagogy.test.ts server/course-recovery.test.ts server/course-generation.test.ts` | Passed: 5 files / 108 tests before final additional boundary tests; all later cases are in the final full suite. `hydrogen-h3-review3-focused3.log`. Earlier compatibility failures remain in focused/focused2 logs. |
| Offline replay: `capmem 8G npx tsx /tmp/question-sets-evidence/replay-h3-lesson-and-review3.ts` | All 4 original lesson raw files remain correctly rejected without inventing code fields. All 4 are excluded by the new wire shape; one mocked repair supplying a valid code task succeeds for each. The two actual previously dropped concepts (`q9-merge-remaining-true`, `s2-q3`) are retained, zero drops, verification not required. Mocked 402 and 429 each make 1 Gemini + 1 DeepSeek request, zero repair rounds, and save explicit fallback details. `hydrogen-h3-offline-final.log` / `hydrogen-h3-offline-results.json`; **zero real calls**. |
| Wire capture: `capmem 8G npx tsx /tmp/question-sets-evidence/capture-preset-schemas.ts` | Five serialized schemas refreshed in `gemini-schema-{lesson,quiz,exercise,warmup,exam}.json`. Lesson has one flat code/mixed shape, required code fields and optional questions. `hydrogen-h3-schemas-final.log`; zero real calls. |
| `capmem 8G npx vitest run` | Passed, exit 0: **275 files passed / 9 skipped; 3590 tests passed / 19 skipped**. `hydrogen-h3-review3-full-final.log`. No client exclusions were needed. |
| `capmem 8G npx tsc --noEmit -p .` | Passed, exit 0. `hydrogen-h3-review3-tsc-complete.log`. |
| `capmem 8G npx tsx tools/classroom-questions-smoke.ts --bots=30 --profiles=perfect,partial,wrong,code-only,questions-only,unanswered` | Passed, exit 0: 30 bots / 25 submitted rows, expected mixed grades, counts `[20,20,20]`, numeric hints, shared context, reveal and teacher-only exports. `hydrogen-h3-review3-smoke30.log`. |
| `git diff --check` | Passed. |
| `git diff -- shared/classroom.ts shared/types.ts` | Empty against the current committed contract. |

Open questions: none. Live Gemini compliance remains unverified for the revised schema. **Do not run a real Gemini evaluation while the prepaid credits are depleted.** No real-provider run is authorized by this report. No edits under `client/`, `README.md`, or `auth/setup-email.ts`; concurrent changes were left intact. No shared contract changes, staging, commit, push, deployment, production mutation or memory update.

STATUS: DONE
