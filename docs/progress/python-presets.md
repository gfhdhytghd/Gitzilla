DONE (in-app editor) — take-edu Python preset data complete; no client UI edits, commits or deployment.

Added `language: python` and `starter: InAppFile[]` to all 27 steps in the 9 presets. Main files retain `python/<lesson>.py`; README.md covers the existing self-check-record path. No dummy test files or changed grading criteria. New direct-submit instructions/README scaffolds support all four locales. Coordinated with claude-edu and codex-net; real server plan normalization now preserves starter/language and the regression passes.

Data implementation complete: all 27 steps expose two fresh files (`python/<lesson>.py`, `README.md`) plus `language: python`; four-locale direct-submit/optional-GitHub instructions, task-specific README cases and unfinished TODOs. All original grading/check paths and check weights remain unchanged. Avoided dummy tests that could suggest code had been tested; the provided README satisfies the actual record-file checks.

Final verification (21:09 local):
- `npx vitest run shared/classroom-presets.test.ts shared/i18n/catalog.test.ts shared/i18n/translate.test.ts analysis/in-app.test.ts server/classroom.test.ts`: **35 PASS / 5 files, no exclusions**. The preset file itself has 10 passing tests. Initial normalizer-retention failure is resolved by codex-net's owner change, not skipped.
- `npm test`: **843 PASS / 8 optional skips / zero failures** (75 passing test files, 3 skipped).
- All **108 localized Python starters** parse with Python ast.parse; no submitted code is executed. Every starter set passes the actual `analyzeFiles` API with Python detection, README content, source paths and no fallback. All static evidence paths exist; at least one required syntax check remains unfinished in every starter. Byte/file limits, independent step copies and localization preserving custom Python/README edits are checked.
- Production Vite build with `write:false`: **PASS**, so no shared dist output was replaced. Existing dynamic-import warnings only. Whitespace diff check PASS.
- Initial root typecheck passed; the latest merged check has only external in-flight server diagnostics: `server/in-app.ts:16` implicit-any path callback and `server/rooms.test.ts:1503/1557` implicit-any people arrays/callbacks. Reported to codex-net; no preset diagnostics or ownership-crossing fixes. The earlier sim/royale-bots diagnostics are gone.
- No npm install, client UI edits, service restart, commits/pushes, or deployment. Browser editor, Pyodide, real submit transport and teacher source viewer acceptance belong to claude-edu/codex-net and are not claimed by these data tests.

Handoffs sent to claude-edu/codex-net/coordinator: UI must honor arbitrary starter paths rather than assume main.py, retain useful student code across same-file steps where possible, and reset to these intentionally unfinished templates. GitHub remains an alternative. Exact files in this owner change: `shared/classroom-presets.ts`, `shared/classroom-presets.test.ts`, `docs/curriculum/python-basics.md`, and this progress file. `docs/tasks/inapp-editor.md` explicitly assigns this preset data section to take-edu; no shared contract files were edited.

Earlier preset rollout below is historical and does not describe deployment of the new in-app editor.

# Python classroom presets · 2026-10-24

Nine Chinese-language preset lessons cover output/variables, numbers/input/conversion, strings, conditions, for/range, while/termination, lists/tuples, functions/assertions, and dictionaries. Each has three 10-minute stages, concrete self-check cases, an editable task/rubric, a downloadable Python 3 starter and teacher guidance. The dictionary lesson covers lookup, update, get defaults, stock addition, items iteration, empty dictionaries and assertions.

Preset selection previews without replacing work; Load replaces only the local draft. Publishing uses the existing authenticated teacher protocol. Students receive the task text and work in their own editor, then submit via GitHub. The rubric/check labels explicitly describe static submission evidence; no arbitrary Python code execution or automatic functional-correctness claim was introduced. Self-check records use root README.md so the existing archive extractor retains them.

Validation:
- 746 tests passed, 8 skipped; typecheck and production build passed.
- All nine plans pass server validation, are independent editable copies and use extractable evidence paths.
- Python ast.parse accepts all nine downloadable starters.
- Browser smoke: select/load all nine lessons, edit a dictionary task, preview another preset without overwriting it, download 09_dict.py, publish and inspect student instructions. No horizontal overflow at 390px; desktop/mobile screenshots reviewed.
- Existing 30-student cooperative flow, retry, exports, reconnect and entry migration passed in the same smoke run.

This change needs only a static asset update; server routes and message formats are unchanged.

## Deployment

Feature commit `49803f946e7adbb019ede814f073b0a3e686389f` was deployed on 2026-10-24 at 22:24 UTC to https://gitzilla.wilflin.me. Static assets were published before the HTML, retaining old hashed files for existing tabs. Server PID 2391694 remained running; there was no server restart or classroom-state reset. Rollback artifacts: `/home/wilf/data/HackPSU/.deploy-backups/python-presets-20261024T222437Z/`.

Public browser acceptance passed: all nine courses load, the dictionary starter downloads as `09_dict.py`, and a published dictionary lesson reaches the student's phone page with the correct instructions. Zero page errors; the temporary validation room was removed. Public JS/CSS hashes matched the deployed artifacts. Evidence: `docs/shots/python-presets-live/result.json` and `dict-library.png`.
