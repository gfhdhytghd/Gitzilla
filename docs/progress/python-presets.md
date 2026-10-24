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
