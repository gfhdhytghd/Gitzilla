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
