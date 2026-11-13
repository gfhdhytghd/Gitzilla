# Starter-file authoring, compact classroom state and classroom deltas: UI report (Claude UI agent)

Three queued items, in order: (1) starter-file authoring in the lesson editor (urgent card), (2) the client side of
the 200-student compact non-teacher state (`summary.roster`, own-attack-only rounds), (3) the opt-in classroom deltas
(`docs/tasks/classroom-200-report.md`, "Delta integration required"). Nothing outside `client/` was edited except the
i18n catalog files under `shared/i18n/`. No commit, push or deploy. Port 5173 and production were not touched.

## 1. Starter files in the lesson editor

New files

- `client/edu/starter-editor.ts`: `createStarterEditor(step, index, { onChange })` → `{ el, validate }`.
  - Shown in every step with a code task (mode `code` or `mixed`): it sits inside the step's code-only block, so a
    questions-only step hides it (the server drops `starter` for those steps anyway).
  - Files: path input (rename in place) + size + Remove (asks before removing a non-empty file), a monospace code
    textarea per file (`wrap=off`, `tab-size: 4`, `spellcheck=false`, `translate=no`, `data-i18n-skip`).
    "+ Add file" adds `main.py`, then `file2.py`, `file3.py` …; the first file gets `# Write your code here.` and turns
    Python on.
  - Language: checkbox "Python: syntax highlighting and ▶ Run in the browser" → `step.language = 'python'` or removed
    (the in-app panel still infers Python from `.py` files, as before).
  - Keys in the code box: Tab indents (4 spaces, or every selected line), Shift+Tab outdents, Enter keeps the line's
    indent (+4 after a `:`). Esc, then Tab leaves the box (keyboard trap avoided; the hint under the list says so).
  - Limits mirror `server/in-app.ts` `normalizeEditorFiles`: ≤ 20 files, ≤ 200 KB of UTF-8 paths + contents, path
    ≤ 240 chars, no `\`, `:` or control characters, no empty / `.` / `..` segments (so no leading `/`), unique paths.
    Live "n / 20 files · x KB / 200 KB"; a per-file path error; a step error line (`.cr-form-error`) that blocks
    Publish (toast "Fix the errors marked in red before publishing.") and opens/scrolls to the step. An empty list
    removes `step.starter` (students then get the GitHub flow, and the block says so).
- `client/edu/starter-editor.css`: phone-first styles in the question editor's look (44 px targets; at ≤ 520 px the
  path takes its own row).
- `client/edu/starter-editor.test.ts`: limits (paths, count, UTF-8 size edge at exactly 200 KB), add/rename/edit/remove,
  duplicate and `..` errors that clear, AI starter editable, language toggle, 20-file cap, Tab/Shift+Tab/Enter/Esc keys.
- `client/edu/starter-browser-check.ts`: real-browser acceptance (below).

Changed: `client/app/classroom.ts` (`buildPlanEditor`): the starter editor at the top of each step's code-only block;
its validator joins the Publish check (skipped for questions-only steps); the step summary keeps "· in-app editor".
AI-generated starters (`mergeCourseDraft` copies `starter`/`language`) and preset starters load into the same editor,
so they stay editable. "Preview as a student" already rendered `createCodeEditor` for steps with `starter`; it now
shows the authored files (verified in the browser).

## 2. Compact non-teacher state (200 students)

- `client/edu/class-counts.ts` (new): `classCounts(state)` reads `state.summary` (`roster` → `total`, `connected`,
  `submitted`, `queued`, `away`) and falls back to rows (older servers). `isCompact(state, teacherView)` = a
  non-teacher state with a summary. `roundSubmitted(state, round, teacherView)`: teacher → `round.attacks.length`;
  compact → frozen `round.totals.submitted`, else the current summary for the current round, else unknown (`null`).
- `client/app/classroom.ts`, every place in the server report's rows inventory:
  - progress line, offline / checking counts and the phase-render signature: `classCounts` (+ counts in the signature);
  - join card: `classCounts(state).connected`;
  - question board submitted / total: the same counts;
  - roster on a non-teacher big screen with compact rows: an anonymous line "28 of 30 students connected · 12
    submitted" (`classroom-roster-summary`) instead of "Students: open … and join" (the projector gets `rows: []`);
  - after an attack (`renderBoss`): compact → no peer names ("Big improvements" is teacher-only), the count from
    `roundSubmitted`; damage and animation still use `bossBefore/After`;
  - debrief: `currentDebrief` passes the audience (`teacher` / `public`).
  - Teacher-only consumers (control hint, teacher controls, review names, row render) are unchanged.
- `client/edu/debrief.ts`: `buildRoundDebrief(…, audience)` / `buildLessonDebrief(…, audience)`. A compact public
  state uses anonymous aggregates only: `round.totals` (submitted, average, median, bands), frozen `round.roster`,
  `checkStats`, boss HP; `state.lessonTotals` (`participants`, `average`) for the lesson. With totals, the headline,
  score bands and check bars equal the teacher's; without totals: "n of m submitted · boss −x%" (current round from the
  summary) or "Class attack · boss −x%" (older round). No names, need-help, shout-outs or per-person advice in public
  models; the lesson "review step X" hint is not derived from one attack. `rosterFor`/stable-roster/lesson roster use
  `classCounts` instead of `rows.length`. `myRound` (class-raid.ts) is unchanged: the viewer's own attack remains.

## 3. Classroom deltas

- `client/app/net.ts`: per socket, a `ClassroomPacket` cache created with the socket (reset on every reconnect). Every
  `classroom` frame goes through `mergeClassroomPacket` (shared/classroom-delta.ts) and the merged packet replaces the
  message **before** any listener (so `main.ts` and the classroom view only ever see full state). `hello` carries
  `classroomDelta: true` (the decoder is installed in the same `open()`). A delta without a base packet (never
  expected) is not shown: the socket closes and reconnects for a full snapshot. The controller socket
  (`controller-link.ts`) does not opt in and keeps full packets.
- `client/app/net.test.ts` (new): hello opt-in; plan/rounds placeholders and report patch/removal merged before the
  listener; unflagged empty rounds replace; reconnect resets the cache (a delta before the first full packet is
  dropped and closes the socket; the next socket starts clean).
- Both browser checks merge frames the same way in their recorders, and `QS_DELTA=0` makes a page leave the flag out of
  `hello`, so the same run can be done with and without deltas.

## Commands and results

- `capmem 8G npx tsc --noEmit -p .` — 0 errors.
- `capmem 8G npx vitest run client/` — 115 files, 1357 tests passed. New: `starter-editor.test.ts` (9),
  `class-counts.test.ts` (3), `net.test.ts` (3), `debrief.test.ts` (+8: full vs compact, with and without totals,
  lesson totals), `classroom.test.ts` (+4: projector progress / join card / roster summary, projector after an attack
  with a compact round, student own-row progress, teacher full roster with a summary).
- `capmem 8G npx vitest run` (full) — 290 files (281 passed, 9 skipped), 3670 tests passed, 19 skipped, 0 failed.
- i18n: `tools/generate-i18n.ts` with the DeepSeek block — all new rows by Gemini via AGY; 0 DeepSeek rows.
  `tools/audit-i18n.ts` — `errors: 0`, `needsReview: 0`.
- Real browser, local server on port 5291 (isolated state in the session scratchpad, the current server code with the
  compact summary, totals and deltas):
  - `QS_DELTA=1|0 QS_BASE_URL=http://127.0.0.1:5291 QS_SHOTS=<dir> capmem 8G npx tsx client/edu/starter-browser-check.ts`
    — passed in both modes, 0 page errors, 0 px horizontal overflow (1440 and 393). Checks: the AI-generated starter
    shows and is edited; a teacher-written mixed step gets `src/app.py` typed with Enter / Tab / Shift+Tab, Esc + Tab
    leaves the box; `../secret.py` shows a path error and Publish sends nothing; rename to `lib/util.py` clears it;
    "Preview as a student" shows the in-app editor with both files (and the edited AI starter on step 2); Publish keeps
    paths, contents, `language: 'python'` and `mode: 'mixed'`; a phone student (393) gets the in-app editor with the
    starter code next to the Questions tab; the projector gets `rows: []` + summary and shows "1 of 1 students
    connected · 0 submitted"; the student holds only their own row; the teacher keeps the roster. With deltas: 3 delta
    frames reached the teacher.
  - `QS_DELTA=1|0 … client/edu/question-browser-check.ts` (the full question-set acceptance: attack, reveal, retry /
    next, pause, reconnect, `never`, 30 questions) — passed in both modes, 31 screenshots each, 0 page errors, 0 px
    overflow. With deltas: 23 delta frames reached the teacher.
  - Same render with and without deltas: each run stores the visible text of every view at the end (clock digits and
    room code removed). Starter check: teacher, student, projector identical. Question check: teacher, Ana, Ben,
    projector identical. The projector's debrief and boss lines read "2 of 2 submitted · class average 8.4 · boss −5%"
    and "2 students attacked …", the same as the teacher's, from the anonymous totals.
- Screenshots: `.cache/starter-editor-shots/` (`starter-editor-1440.png`, `starter-editor-393.png`,
  `starter-editor-error-1440.png`, `starter-preview-1440.png`, `starter-student-inapp-393.png`,
  `starter-projector-compact-1440.png`, `starter-result.json`) and `.cache/question-sets-ui-shots/` (refreshed).

## Not done / limits

- WebKit cannot start on this machine (`libicudata.so.74` missing); all browser runs used Chromium.
- One earlier question-check run (before the delta client was in place) timed out clicking "Show details"
  ("element is not stable"); the four later runs (with and without deltas) passed that step. Cause not confirmed;
  watch for it on slower machines.
- The in-app editor's file tabs show the file name only (`app.py` for `src/app.py`), as before; not changed here.
- A step added with "+ Add step" keeps the default instructions, which still say "Commit, push to GitHub"; with starter
  files the in-app editor is offered first and GitHub is the fold below. Teachers edit the text; not changed here.
- No physical-device check; no 200-browser UI check (the server's 200-bot load run covers the wire, not rendering).

STATUS: DONE
