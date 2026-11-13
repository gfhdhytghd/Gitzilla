# Question sets: UI report (Claude UI agent)

Scope: the card's "UI" part (`docs/tasks/question-sets.md`), the shared rules, and the two coordinator add-ons for the
course upload (difficulty slider; session preset + extra AI instructions). Contract: `shared/classroom.ts` and
`shared/types.ts` at 753fbe1 + da084be (integer points, `blankNumeric`, `questionAnswered`). Nothing outside `client/`
was edited except the i18n catalog files under `shared/i18n/` (new source strings and their translations).

## What changed

New files

- `client/edu/questions.ts`: pure helpers. Limits that mirror the server (`QUESTION_LIMITS`, `validateQuestions`),
  prompt parsing (`{{n}}` blanks, fenced code, inline code), answer comparison for the save echo, key/explanation
  lookup (server `result.key` first, then the plan), kind conversion, new-question defaults.
- `client/edu/question-view.ts`: read-only rendering. `renderPrompt` (blanks inline, also inside code blocks),
  `reviewCard` (student answer, key, ✓/✗/partial, explanation), `questionPreview` (answer-key list).
- `client/edu/question-set.ts`: the student panel (phone first).
  - One card per question. Progress strip: "3 of 8 answered", one dot per question (tap to scroll), save state.
  - Single choice: large tappable rows (≥ 54 px, letter badges). Multi: "Select all that apply" + checkbox rows.
    Blank: inline inputs that grow with the text; `inputmode="decimal"` from `blankNumeric` (or the full spec).
  - `after-close`: autosave 0.4–1.5 s after a change, on blur and on Enter; one save per ≥ 1.1 s (server allows 1 / s);
    only changed questions are sent (partial saves merge). "✓ Saved" per card and "✓ All saved" in the strip come
    from the server echo (`report.answers`), not from the send. No echo in 5 s → "Not saved yet. Trying again…" and a
    resend. A server error re-queues the answers and is shown. "Submit answers" saves immediately.
    A local draft (localStorage, per room/step/attempt) restores unsaved answers after a reload and saves them.
  - `immediate`: no autosave (each graded save costs an attempt). Per card "Check answer"; "Check all answers" in the
    footer. Shows ✓ Correct / Partly right (n %) / Not quite, attempts left, per-blank ✓/✗; a locked card shows the key
    and explanation, marks the right option and the wrong pick. Check is disabled when the answer is unchanged.
  - Paused: inputs and Submit disabled, strip shows "Paused", "Coding is paused. Your answers are kept." Raid: strip
    shows "Locked". More than 10 questions: the dots become one horizontally scrollable row (30 questions at 393 px).
  - Reveal (`feedback` / `complete`): questions score, "n of m correct", each card with answer, key, correctness and
    explanation. `never`: score only, with a sentence that the teacher keeps the answers private.
- `client/edu/question-stats.ts`
  - Teacher live bars from `questionLive`: answered / roster, % correct, per-option distribution with the key marked,
    weakest question first. While the console may be projected (the existing scores-hidden mode), only answered
    counts show, with a "Show details" button (per step + attempt).
  - Projector board: during coding/paused, per-question "N answered" from `ClassroomState.questionAnswered` (no
    distribution, no correctness); after the attack, the frozen `round.questionStats` with the correct option marked,
    or only answered counts when `revealAnswers` is `never`.
- `client/edu/question-editor.ts`: per-step editor. Step type (Code task / Questions only / Code task + questions),
  correctness timing (after close / immediately), reveal (after the attack / never), mixed weight. Choosing reveal
  "never" switches feedback to "after close", disables "immediately" and shows a one-line reason (coordinator
  decision 2); a stored `immediate` + `never` step is normalized the same way when the editor opens. Questions: add
  (3 kinds), edit, move up/down, duplicate, delete, change kind (keeps prompt and settings). Options: mark correct
  (radio / checkboxes), add (≤ 8), remove (≥ 2), partial / exact scoring. Blanks: "+ Insert blank" at the cursor;
  typing `{{3}}` adds a blank spec; accepted answers one per line; case sensitive; number ± tolerance (the number
  follows the first accepted answer). Points (integer 1..100), attempts (shown only for immediate), explanation.
  Live "Students see" preview with disabled blank inputs. Errors appear in a red line per step and block Publish.
- Shared code or reading (`ClassroomStep.questionContext`, contract 5705050, ≤ 4000 chars, Markdown-lite with fenced
  code): `questionContextView` in `question-view.ts` renders it once, above the question list, in a cyan-edged box
  labeled "Read this first · the questions below refer to it" (authored text is `data-i18n-skip`; `{{n}}` stays literal).
  Shown on the student panel (answering and reveal, also `never`), the projector board (coding and after the attack),
  the teacher's per-student answers, the lesson "Preview as a student" overlay and the course upload preview. Lesson
  editor: an optional "Shared code or reading for these questions" textarea per question step (monospace, live
  `n / 4000` counter, live "Students see" preview); empty text removes the field; `validateQuestions` rejects > 4000.
- Visual review fix (on top of b8c7864): question labels in the teacher live bars, the projector board and the editor's
  collapsed question summary no longer show a "[code]" placeholder. `excerpt` (now in `questions.ts`) drops fenced
  code when the prompt has other text; a prompt that is only code shows its first code line as inline code (≤ 60
  chars); blanks become ____. Example: the blank question now reads "`x` is ____ and its type is ____.".
  Tests: `questions.test.ts` (excerpt cases), `classroom.test.ts` (live bars contain no "[code]"); the browser check
  asserts no "[code]" in the live bars and the projector board (coding and after the attack).
- QS-E2E-01 fix (`docs/tasks/question-sets-e2e-report.md`, Confirmed defect): the blank-count fit ran as a separate
  `input` listener registered before `prompt.oninput`, so it read the old `q.prompt`; "+ Insert blank" or one input
  event with new markers (paste) left the new accepted-answer fields missing until the next input. Now
  `question-editor.ts` refits the blank specs inside `prompt.oninput`, right after `q.prompt = prompt.value` and before
  validation, so the button, typing and paste all show the fields on the same event.
  `client/edu/test-dom.ts` now runs `on<event>` properties in listener order from their first assignment (as browsers
  do); before, it ran them first, which hid this ordering bug from unit tests. Tests: `question-editor.test.ts` +3
  ("+ Insert blank", typing a marker and deleting it, a paste with two new markers in one input event); all three
  fail on the old editor and pass now. Browser check: a scratch blank question on the 1440 editor — "+ Insert blank"
  at the caret, `pressSequentially(' B {{2}}')`, and a real clipboard paste (Control+V) of three markers — the fields
  appear at once and no "in order" error shows. With the old editor restored temporarily, the browser check failed at
  "+ Insert blank: second answer field at once" (1 !== 2); with the fix it passes.
- `client/edu/questions.css`: all question styles, the mixed-step tabs, and the course settings block.
- `client/edu/questions.test.ts`: limits, prompt parsing, answer comparison, keys, kind conversion, verdicts, the
  `immediate` + `never` rule.
- `client/edu/question-editor.test.ts`: "never" forces after-close and disables immediate; normalization on open;
  the shared-context textarea (preview, counter, limit, empty removes it).
- `client/edu/question-browser-check.ts`: real-browser acceptance (see Verification).

Changed files

- `client/app/classroom.ts`
  - Student board: question panel; a questions-only step hides the GitHub / in-app code task and the "How this task
    is scored" fold; a mixed step shows two tabs, "Code (✓ submitted / not submitted yet)" and
    "Questions (n of m answered)". On a question step the Canvas email card moves below the answers.
  - Phase label "Answer the questions" / "Code and answer"; roster status "answering" / "answered"; the ✓ ✗ ? code
    verdict buttons are hidden for a questions-only step.
  - Feedback panel: a student never sees a correctness-based score before the reveal in `after-close` (questions-only
    shows "✓ saved"; mixed shows the code part only plus "Questions after the class attack"). Mixed shows a
    "Code x/100 (w%) · Questions y/100 (w%)" line. Answers-only reports (`repo`/`commit` = `questions`) do not show a
    commit link.
  - Teacher: live bars above the review panel; per-student answers ("Answers · n of m correct · k answered") in the
    review panel; a score override form for questions-only steps.
  - Lesson editor: the question editor in every step; summary line counts questions; Publish validates all question
    editors, opens the step with the first visible error and scrolls to it (hidden code-only errors of a
    questions-only step do not block). The "Preview as a student" overlay lists the questions with keys and the rules.
  - Answers flush on `pagehide`.
- `client/app/course-upload.ts`: generated questions shown read-only with keys under each step; one compact settings
  block above "Generate course preview": session type (Lesson, Quiz, Exercise, Warm-up, Exam: native radios with a
  one-line description), difficulty slider (native range, 5 stops Easy … Extreme, default Medium, both ends labeled,
  current level named, `aria-valuetext`), extra instructions for the AI (≤ 2000 chars, live counter). Sends
  `preset=` and `difficulty=` as query parameters and `X-Course-Prompt: encodeURIComponent(text)` only when not empty.
  Preset and difficulty are remembered per browser (`kaiju.course.preset`, `kaiju.course.difficulty`, try/catch).
- `client/app/app.ts`, `client/app/main.ts`: `AppCtx.classroomQuestionLive` from `ServerMsg classroom.questionLive`.
- `client/edu/test-dom.ts`: `prepend`, `firstElementChild`, `closest` for the classroom tests.
- Tests: `client/app/classroom.test.ts` (+4: question panel + autosave message, hidden score before the reveal,
  `never` reveal, live bars placement and projector-safe hiding), `client/app/course-upload.test.ts` (+2: difficulty,
  preset + prompt header).
- i18n: `shared/i18n/sources.json`, `gemini-translations.json`, `messages.generated.json`, `generation.json`,
  `review.json` regenerated with `tools/generate-i18n.ts`. Authored text (prompts, options, explanations, keys) is
  marked `data-i18n-skip` and is never translated.

## Commands and results

- `capmem 8G npx tsc --noEmit -p .` — exit 0.
- `capmem 8G npx vitest run client/` — 112 files, 1330 tests passed (1310 before this change). Covers `questionContext`
  (validation limit; editor textarea; the student panel shows it once with its code block).
- `capmem 8G npx vitest run` (full, final) — 282 files (273 passed, 9 skipped), 3562 tests passed, 19 skipped,
  0 failed.
- i18n: `capmem 8G npx tsx tools/generate-i18n.ts` — entries 3387, batches 0. No DeepSeek (coordinator decision 1):
  the generator ran with a preload that blocks `api.deepseek.com`, and no request reached it. The 81 earlier DeepSeek
  rows were removed: AGY (Gemini) retranslated 30; AGY timed out (180 s) on the rest, so Claude translated 48 of them
  plus the other new rows by hand (`provider: "Claude Opus"`); 3 are no longer in the sources. Code tokens and AI prompt
  templates are kept identical in every language. `generation.json` providers: Gemini via AGY 2984, Claude Opus 403;
  `grep -c '"DeepSeek"' shared/i18n/gemini-translations.json` → 0. The existing `client/app/pair-copy.ts` es row
  (French text with a stray "标志") was also fixed by hand to "📱 Usa tu teléfono como mando".
- i18n after `questionContext`: generator rerun with the DeepSeek block — entries 3434, 2 batches, both by Gemini via
  AGY; 0 DeepSeek rows.
- `capmem 8G npx tsx tools/audit-i18n.ts` — `errors: 0`, `needsReview: 0`.
- Real browser (final run after the server report reached STATUS: DONE; the server was restarted on the final server
  code): local server on port 5291 with isolated state (`ROOMS_FILE`, `TRACES_DIR`, … in the session
  scratchpad), `GITZILLA_OPEN_PLAY=1`, receipts off. Port 5173 and production were not touched.
  `QS_BASE_URL=http://127.0.0.1:5291 QS_SHOTS=<dir> capmem 8G npx tsx client/edu/question-browser-check.ts`
  — passed, 0 page errors, maximum horizontal overflow 0 px over all 31 screenshots. Checks:
  1. Course upload: preset Quiz, keyboard step Medium → Hard, extra instructions; the request carries `preset=quiz`,
     `difficulty=hard` and the encoded `X-Course-Prompt`; both choices are remembered; the generated questions show
     read-only with keys (the generate route is replaced in the browser; no AI provider is called).
  2. Lesson editor (1440 and 393): builds a questions step (single with explanation, multi with an added option and
     2 points, blank with a code block, a numeric blank and a two-answer blank), a mixed `immediate` step (weight 40,
     2 attempts) and a 30-question exam step with reveal "never" (immediate disabled, feedback forced to after close,
     reason shown); an empty option shows an error and clears; Publish; the server echo keeps mode, questions, weight.
  3. Students on phones (393): autosave reaches the server and shows ✓ All saved; the numeric blank has
     `inputmode="decimal"`; "Submit answers" saves; a missing echo shows "Not saved yet. Trying again…".
  4. Projector window during coding: per-question "N answered", no correctness.
  5. Teacher console: live bars hidden-by-default while projecting, "Show details" shows % correct and option counts,
     weakest question first; per-student answers in the review panel.
  6. Secrecy: no explanation, accept list or key reached either student or the projector before the reveal
     (all received `classroom`/`lobby`/`welcome` messages checked).
  7. After the attack: students see answer, key, correctness, explanation; "3" and "3.0" (numeric) and "int"/"Int"
     are graded correct; the projector shows frozen distributions with the key marked.
  8. Mixed `immediate` step: tabs; wrong pick → "1 attempt left"; right pick → locked ✓; two wrong picks → locked with
     the key and the wrong pick marked red.
  9. 30-question set: renders and saves on a 393 px phone; dots in one scrollable row.
  10. Paused phase: answers kept, inputs and Submit disabled, "Paused" in the strip; enabled again on resume.
  11. Reconnect: answers sent while saves were blocked come back from the local draft after reopening the page and
      are saved to the server.
  12. Reveal "never": students see only their score; no key or correctness reaches students or the projector.
  13. `questionContext`: the course preview shows it once; the editor fills it for step 1 with a live preview; the
      published plan keeps it; both phones show it once above the questions and in the reveal; the projector shows it
      during coding and after the attack (`student-questions-empty-393.png`, `projector-coding-1440.png`).
  Final run: after the server report ended with STATUS: DONE and the server code handled `questionContext`; the 5291
  server was restarted on that code. All 13 items passed. (An earlier run against the server before it kept the field
  failed at "the server keeps questionContext", as expected.)
- Screenshots (31): `.cache/question-sets-ui-shots/` (gitignored, copied from the run; `result.json` lists checks and
  notes), e.g. `student-questions-saved-393.png`, `student-30-questions-393.png`, `student-paused-393.png`,
  `student-draft-restored-393.png`, `student-never-reveal-393.png`, `student-reveal-webkit-393.png`,
  `student-immediate-locked-webkit-393.png`, `teacher-live-1440.png`, `teacher-editor-never-1440.png`,
  `projector-coding-1440.png`, `projector-after-raid-1440.png`, `projector-never-1440.png`,
  `teacher-course-settings-393.png`, `teacher-course-difficulty-393.png`, `teacher-course-preview-1440.png`.

## Not done / limits

- Gap (not built, per instructions): the lesson editor cannot author starter files (`ClassroomStep.starter`). The
  step editor (`client/app/classroom.ts`, `buildPlanEditor`) has title, instructions, minutes, the question editor,
  checks and rubric, but no starter field; `starter` reaches a step only from a preset lesson or an AI-generated course,
  and it is kept when such a step is edited. A step that a teacher adds or writes by hand (also a mixed step) therefore
  has no in-app editor, and students get only the GitHub flow — this matches the tester's report. The "Preview as a
  student" overlay already says so ("This step has no starter files: students submit a GitHub repository.").

- WebKit: Playwright's WebKit (`webkit-2370`) cannot start on this machine: `MiniBrowser: error while loading shared
  libraries: libicudata.so.74` (the system has ICU 76/78). The script falls back to Chromium for that phone and says
  so in `result.json` (`notes`). Files named `*-webkit-*` were therefore rendered by Chromium. WebKit behaviour is not
  verified. To verify: install ICU 74 for Playwright (`npx playwright install-deps webkit` on a supported distro) and
  rerun the same command.

## Questions (resolved by the coordinator)

1. Mixed steps before the reveal: the UI keeps hiding the student's blended total and shows the code part only; the
   server will stop sending it (decision 3).
2. `immediate` + `revealAnswers: 'never'`: not allowed. The editor blocks it as described above, and
   `validateQuestions` rejects it ("Instant feedback cannot be used when answers stay private.") (decision 2).

STATUS: DONE
