DONE (brief validation) — take-edu validation/tests landed after claude-ux's four-locale text and preset wiring. No wording or UI edits, commits, deployment or service controls.

Read `docs/tasks/classroom-brief.md`, shared StepBrief contract and current preset tests. `claude-ux` owns `shared/classroom-presets.ts` text for this card; tests will land only after its text lands. Existing pending translations and parallel dirty files are preserved.

## Implemented validation / handoff to claude-ux
- Validate every 9 × 3 × 4 preset step: nonempty goal, 2–6 nonempty TODO items, nonempty Done when list, 1–3 hints and 1–4 concept chips as the copy card requests.
- Done when entries should map **one per actual step.checks entry in check order**, since the contract is a string array with no check IDs and UI needs to pair real results by index. Each should name the real check label or its required literal/file path (code tokens stay untranslated). This does not require a specific human-language sentence.
- A real Python `print()` call in starter source (AST detection, not a comment substring) requires nonempty example.output; print-containing static checks also require an example. Python source is parsed, never executed.
- Replace obsolete prose assertions (old generic section headers, exact GitHub-option phrases) with structured brief/actual-check checks; keep existing file paths, independence, static analysis, localization and grading tests.
- Will report any real content mismatch through this progress file / Herdr, without editing the wording or weakening checks merely to accept it.

## Delivered tests / timing
- Prepared the draft outside the checkout at `/tmp/gitzilla-brief-validation-20261025/classroom-brief.test.ts`; did not land tests while the wording was absent. Once all four locale modules and the preset factory landed, verified 27 brief-bearing steps in each locale and notified claude-ux before editing tests.
- New `shared/classroom-brief.test.ts`: six regression tests covering the full 108-case matrix, actual check order/literal-or-path anchors, Python AST print detection (including comment/string false-positive probes), output examples, distinct per-locale goals, unchanged check contracts, localization/independence and real server normalization + save/restore.
- Updated only `shared/classroom-presets.test.ts` alongside it: replaced the last course's title-word assertion with its stable `09-dict` identity; removed obsolete long-instruction heading assertions and the exact-GitHub-option-phrase test. Retained real starter/path/size/AST/static grading/localization tests. This allows the new shorter copy without prescribing old sentences.
- Codex-net confirms `server/classroom.ts` now preserves/validates brief metadata and maintains exact check/result order; zero-check custom steps use an empty Done when list. Its broader teacher-authored bounds do not relax this card's official preset TODO requirement of 2–6 items.
- Final server-owner evidence received: source window frozen; dedicated 22 brief tests, 51 server tests across 4 files, separate 1 real-WS persistence check and actual production-main PORT=0 brief delivery; combined snapshot 61 PASS / 5 files and root tsc PASS. These are codex-net's runs, separate from my completed independent 108-preset roundtrips below.

## Independent verification (2026-10-25 01:28 local)
- `npx vitest run shared/classroom-brief.test.ts shared/classroom-presets.test.ts`: **15 PASS / 2 files**, no skips. All 108 rewritten preset briefs survive actual `normalizeClassroomPlan` and `ClassroomSession` save/restore; Done when count/order and required code tokens/files match the actual checks in all locales.
- `npm run typecheck`: **PASS**.
- Full `npm test`: **998 PASS / 9 optional skips / zero failures**, 87 passing test files and 4 skipped files; 23.66 seconds. Snapshot includes concurrent owners' finished work; no full-game browser acceptance inferred from unit/integration tests.
- Production Vite build `write:false`: **PASS** without replacing shared dist output. Snapshot emitted Node/browser externalization warnings (`node:fs`, `node:url`, fallback URL from `sim/bots.ts`) and existing renderer dynamic-import warnings. These are outside this test-only change; surfaced to the coordinator rather than modifying sim/client code.
- Touched-file diff whitespace check PASS. No source code execution (Python AST parsing only), no UI/preset text edits, no service restarts or live actions. UI/visual acceptance remains with claude-edu/claude-ux.

## Final file handoff
- `shared/classroom-brief.test.ts` (new).
- `shared/classroom-presets.test.ts` (obsolete prose checks updated).
- `docs/progress/brief-validation.md` (this report).
- Runtime text stays owned by claude-ux in `shared/classroom-presets.ts` / `shared/classroom-preset-text/`; this agent did not alter it. No outstanding validation failures.
