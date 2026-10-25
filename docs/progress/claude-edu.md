# DONE (backspace dedent)

User request via the coordinator. `client/edu/code-editor.ts` + `code-editor.test.ts`. Not committed.
- **Backspace dedent:**
  - New pure helper `backspaceEdit(text, start, end)`. With no selection and only spaces between the line start and
    the caret, Backspace goes back to the previous 4-column stop: 8 → 4, 6 → 4, 3 → 0, 5 → 4.
  - A blank, all-space line works the same way, so one Backspace undoes the auto-indent after `:`.
  - Normal Backspace everywhere else: after code, with a selection, at the line start, with 1 space, with a tab in
    the indent, or with Ctrl / Alt / Meta held.
- **Desktop and soft keyboards:**
  - Desktop uses keydown `Backspace`.
  - Soft keyboards (Android reports "Unidentified", and iOS may skip keydown) use `beforeinput` with
    `deleteContentBackward`. The same helper runs there, and preventDefault stops a second run.
- **Undo, and a fix to the shared insert path (`apply`, also used by Tab and Enter):**
  - Before: the whole textarea value was replaced, so after Ctrl+Z all the code stayed selected and the next key
    wiped the file.
  - Now `changedRange(before, after)` (pure, tested) replaces only the changed range with execCommand
    insertText / delete. It's still one native undo step, and Ctrl+Z now selects just the restored spaces.
  - It falls back to setting the value if execCommand fails.

**Verified:**
- **WebKit:** desktop 1280 and iPhone 15, a real student editor on :5175. Script:
  /tmp/claude-1000/-home-wilf-data-HackPSU-repo-kaiju/df7be22c-36dc-409c-9e61-ef019d47acc6/scratchpad/backspace-shots.mts
  (output in backspace3/). Results on both devices:
  - Enter after `for …:` gives 4 spaces; one Backspace leaves the line empty;
  - Ctrl+Z brings the 4 spaces back, with only them selected and the code intact;
  - Tab then Backspace gives 8 → 4;
  - `ab` + Backspace gives `a` (normal);
  - a synthetic cancelable beforeinput deleteContentBackward on a 6-space line is prevented and leaves 4 spaces;
  - Tab + Ctrl+Z restores the text;
  - 0 page errors.
- **Checks:** tsc clean; `vitest client/edu` 79 passed.
- **Not caused by this change:** on iPhone 15 the editor is scrolled 25px sideways right after the first tap +
  Ctrl+End (`.ce-scroll`), before any Backspace or Tab, so the first characters of each line are hidden until you
  scroll back. Say if you want it fixed.

# DONE (feedback panel)

Coordinator follow-up to the task card: the student "Your feedback" panel. Only `client/app/classroom.ts` and `.css`
changed. Not committed.
- **Empty headings hidden:**
  - "Your measured result for this task" is gone; the ↑/↓ line shows only when the score changed.
  - "What to work on next" shows only when there is advice.
- **Check rows in plain words:** each row shows the step's own doneWhen line (doneWhen[i] ↔ checks[i] ↔
  report.checks[i]), with `code` styled. Steps without a brief get a plain generated line (`doneWhenFor`).
  - Status: "Found in your files" or, in amber, "Not found yet: add it and submit again".
  - Check rows now come before the advice.
  - The teacher's view of a student uses the same rows.
- **Raw evidence:** the grader's wording ("Literal code evidence…", "static evidence found", "…analyzed archive")
  appears only inside "See the measured rubric evidence", after the rubric rows.
- **No repeated note:** the "checks look at your files, not what it prints" note is hidden when the step has a
  brief, because the task card says it after a submission.
- **Server all-clear advice:** reworded on the client ("Everything the checks look for is in your files. Run it,
  compare with the expected output, and be ready to explain it to your teacher."). It's an exact-string map,
  `PLAIN_ADVICE`, so the server text is untouched.

**Verified:** WebKit on :5175 with the real server and the real preset briefs. Script:
/tmp/claude-1000/-home-wilf-data-HackPSU-repo-kaiju/df7be22c-36dc-409c-9e61-ef019d47acc6/scratchpad/feedback-shots.mts
- **Results for all three students:** no jargon outside the fold, no empty headings, the note isn't repeated,
  0 overflow, 0 errors. The fold still has the raw evidence.
- **Screenshots:** in
  /tmp/claude-1000/-home-wilf-data-HackPSU-repo-kaiju/df7be22c-36dc-409c-9e61-ef019d47acc6/scratchpad/feedback2/
  - ben-feedback.png (iPhone SE, ✓✗)
  - ana-feedback.png (iPhone 15, ✓✓ + advice)
  - chloe-feedback.png (desktop 1280)
  - chloe-evidence-fold.png
- **Checks:** tsc clean; `vitest client/edu` 75 passed; `tools/classroom-smoke.ts` passed.

# DONE (task card)

docs/tasks/classroom-brief.md, claude-edu section. Not committed. Built on the StepBrief contract with
doneWhen[i] ↔ step.checks[i] ↔ report.checks[i]. Verified against claude-ux's real (uncommitted) preset briefs through
the real server on :5175; mock briefs are only a fallback in the e2e.

## What changed
- **New `client/edu/task-brief.ts` (pure) + `task-brief.test.ts`:**
  - `codeSpans`: renders `code` in backticks;
  - `doneWhenStatus`: pass / fail / self per row from report.checks[i];
  - `alignDoneWhen` / `doneWhenFor`: see the bug fix below;
  - storage keys `kaiju.todo.<room>.<step>` and `kaiju.hints.<room>.<step>`.
- **New `client/edu/task-card.ts` + `task-card.css`:** `createTaskCard()` with four modes.
  - **student:**
    - goal at 18px/1.5 in system sans (not the pixel font), max 60ch;
    - concept chips (≤6);
    - a numbered TODO checklist: tap the whole row (≥44px) to tick; ticks are saved per room + step, survive a
      reload, and reset on the next step;
    - "Done when" rows: ○ before a submission, then ✓ "found in your files" / ✗ "not found yet" / ○ "check this
      yourself", with a note ("1 still missing. Fix it and submit again.");
    - an "Expected output" code block (whitespace kept);
    - "💡 Need a hint? (3)", which reveals one hint at a time and remembers how many.
  - **preview:** the teacher's "Preview as a student" modal; same as student, nothing saved.
  - **projector:** goal, chips and example, large and sized by vw/vh. Fits 1920×1080 and 1280×720 with no scroll.
  - **teacher console:** goal + chips, with "Student task card · 3 to-dos · 2 done-when · 3 hints" folded under the
    console controls (all hints shown, no checkboxes). The free-text `instructions` stay visible as the teacher's
    summary.
- **`client/app/classroom.ts` / `.css`:**
  - **Sticky student step bar:** "Step 1/3 · title · 9:58", which turns red under 1 min. It stays at the very top:
    sticky offsets cancel the scroller's 68px settings-button padding (the console bar is fixed the same way).
  - **Student phones during a step:** the header drops its clock and room code, and the title shrinks.
  - **Instructions fallback:** students and the class see the card when the step has a brief; without one, the
    free-text instructions show as before.
  - **"Your next commit 1-2-3" box removed:** it's now one line under Submit (in-app: in inapp-panel.ts; GitHub: under
    the GitHub submit button). The heading is "Your code" or "Your GitHub version".
- **Bug fix the smoke caught:** the server requires one doneWhen row per check. A teacher who edited a preset's
  checks made Publish fail silently, and students never got the lesson. The plan editor now re-aligns
  `brief.doneWhen` on every check edit:
  - checks that stayed keep their written line;
  - new checks get a plain line ("`README.md` is in your submission", "`x.py` contains `inventory`", "The GitHub
    check `unit-tests` passes").

## Verified
- **WebKit e2e:** iPhone SE, iPhone 15 and desktop students, a 1440 console, and a 1920 / 1280×720 projector popup.
  The script is at /tmp/claude-1000/-home-wilf-data-HackPSU-repo-kaiju/df7be22c-36dc-409c-9e61-ef019d47acc6/scratchpad/brief-shots.mts.
  - ticks and hints survive a reload;
  - the sticky bar is at top 0;
  - ana (adds print) gets ✓✓; chloe (starter as-is) gets ✓✗ "1 still missing";
  - the projector shows no to-do list, no names and no scroll;
  - the teacher fold starts collapsed;
  - step 2 shows the new goal with fresh ticks;
  - 0 overflow and 0 page errors.
- **Suite:** typecheck clean; vitest 998 passed / 9 skipped; `tools/classroom-smoke.ts` passed (30 students).
- **Note for the smoke owner:** the smoke still reads `.cr-instructions` on the student page. That element is now
  hidden when the step has a brief; its innerText still works.

## Open
- **claude-ux:** the Done-when rows render under the word "Done when", so they read best as short statements
  ("`python/01_hello.py` is in your submission"); yours already do. A row whose check is a `contains` on `print(`
  shows ✓ for any print. That's the known weak-check issue (take-edu).
- **No teacher UI to edit the brief text yet** (goal, todo, hints). Presets and generated doneWhen only. Ask if
  wanted.

# DONE (teacher ux)

docs/ux-audit-teacher.md: P0-T1…T5 and the top-5 quick wins done. P1s done where they're client work; the rest are
requests below. Not committed.

## What changed (client/app/classroom.ts + .css, client/edu)
- **P0-T1 privacy / split views:**
  - **Projector window:** "Open projector window ↗" on the console opens `?screen=1&view=projector`, a separate
    spectator screen with its own token key in net.ts, so it doesn't kick the console. It fits one screen:
    - join QR/link/code;
    - step title + a 2-line summary (`stepSummary`, headings skipped) + "the full task is on your phone";
    - a big "N of M submitted" + bar;
    - the boss and the class attack;
    - no names with scores, no roster, no feedback.
    Any non-owner big screen is "class-facing" with the same rules.
  - **Console:** a sticky control bar with Pause / +2 min / Launch class attack / Next / Retry, a ⋯ menu
    (Export CSV, Export Markdown, End lesson…), "Projecting: hide scores & feedback" (default on, remembered per
    device: blurs scores and hides feedback/code/notes until "Show details") and the hint line.
  - **"Class ranking" → "Submissions":** sorted stuck → not submitted → checking → submitted, then by name. Never
    ranked by score.
- **P0-T2:** until the teacher reviews, rows show "checks 2/2 · submitted · needs your review", not /100. One-tap
  verdicts per row: ✓ works (100), ✗ not yet (≤40), ? ask me (unchanged), each with a note. Students see "These
  checks look at your files, not at what your program prints. Your teacher will confirm…".
- **P0-T3:** during the class attack the boss takes over the screen (fixed, full screen) on the console and the
  projector, with the console bar still on top. Long instructions are clamped on the console ("show all instructions")
  and summarized on class-facing screens.
- **P0-T4:**
  - End lesson is in the ⋯ menu, danger-styled, with a confirm ("Students' work is kept and you can still export").
  - The classroom pause sheet has Resume only (no "end match · new room").
  - Remove step asks first.
  - The teacher's header Leave closes the screen and the lesson keeps running.
- **P0-T5:**
  - The pause reads "⏸ Paused by your teacher · The clock is frozen for the whole class" and "Resuming in 3…"
    (`createPauseOverlay({ classroom: true })` in pause.ts).
  - Server-restart notice in classrooms: a green "Reconnected. Everything is saved." (main.ts); nothing on the
    projector window. This was seen live: DEV restarted during my run.
- **P1:**
  - **T2:** "Use this lesson" (load + publish) primary, "Customize first" secondary. Step editors are collapsed to
    "Step 1 · title · 10 min · 2 checks · in-app editor" (step 1 open). "👁 Preview as a student" opens a modal with
    each step's instructions, read-only starter code and scoring.
  - **T3:** plain labels ("Minutes (0: you decide when to stop)", "How much the automatic checks count (%) · the
    rest is the rubric", "Name of the class monster"). "+ File exists / + File contains text / + GitHub CI check" insert
    correct lines using the step's real file, and an example legend explains each kind. **Partial:** the text format
    stays, because the smoke checks raw-text and identity preservation across a language switch. The rubric editor has
    `context: 'classroom'`: "HOW THIS STEP IS SCORED", step-appropriate signals only, and no lobby-card wording.
  - **T4 (client part):** offline students who never submitted leave "N of M submitted" ("· 1 offline").
  - **T6:** students' instructions are clamped with "Read the full task", so the editor starts at ~930px on an iPhone
    SE (was ~2,670).
  - **T7:** whole numbers everywhere (scores, HP, damage). Advice lines that only repeat a failed check are dropped.
  - **T9:** class-facing text at least 18px: the clock is 34–64px and "N of M submitted" is 22–44px.
  - **P2:** "Coding time" for in-app steps; "Only improvements add extra damage"; after the attack the console
    suggests a line to say ("Say: 2 of 3 of you submitted, … Next: …").
- **Join card + hint line** (pre-audit) as before.

## Files outside client/edu + classroom.* (small, noted for their owners)
- `client/app/pause.ts` (claude-ui): optional `classroom` flag (wording, Resume only). Battle/duel unchanged.
- `client/app/main.ts` (claude-ui): the edu restart notice is a green toast, hidden in the projector window.
- `client/app/net.ts` (claude-ui): `?view=projector` uses `kaiju.projectorToken.<room>`.
- `tools/classroom-smoke.ts`:
  - reveal before review, open the ⋯ menu before export;
  - the owner redirect replaces the "open teacher" click;
  - integer scores; "30 of 30".
  - **PASS**: 30 students, full flow.
- `client/edu/summary.ts` `stepSummary` (+ test); `client/edu/rubric.ts` classroom context.

## Requests (not client work)
- **codex-net:**
  - **P1-T4:** roster commands Rename · Remove · Merge with… (new `ClassroomCommand`s or a `classroomRoster` msg).
  - **P1-T5:** light student status (`typing · ran ✓ · ran ✗ NameError · idle 3m`) plus "✋ I need help"; the
    client already knows edits and Run results. Needs a contract (e.g. `classroomStatus`) and `ClassroomRow.activity`.
  - **P1-T7:** advice wording, e.g. "Checks found the file and a print() call. Ask your teacher to check the output"
    instead of "The measured criteria look strong", and plain check details instead of "static evidence found",
    "(not execution output)", "in the analyzed archive".
  - **P1-T8:** export with one row per student × step including "not submitted", columns name · step title ·
    final · auto · teacher score · teacher note · submitted at (local) · attempts, with UUID/damage last.
  - **P0-T4:** an "undo End lesson" window (e.g. 10 s), if you want an Undo toast.
- **take-edu:** preset 01 needs `contains: python/01_hello.py :: Hello, Python!` (any `print(` scores 100 today), and
  similar expected-output literals in every step. Don't paste the starter code into the instructions, because the
  editor already shows it.
- **claude-ui:**
  - **P1-T1:** a "🎓 Teaching a class? Start a classroom →" line on the landing page, visible on phones too
    (`.host-big` hides it today) and clear of the Hall panel.
  - Let a teacher skip the controls sheet.
  - **P1-T4:** the name prompt in classroom rooms should say "Your name" (placeholder "First name + last initial")
    instead of the ssh/kaiju shell.
  - I didn't edit landing.ts: it has someone else's uncommitted changes.

## Verified (Playwright WebKit on DEV :5175, real server; I looked at every shot)
Script: `/tmp/claude-1000/-home-wilf-data-HackPSU-repo-kaiju/df7be22c-36dc-409c-9e61-ef019d47acc6/scratchpad/teacher-shots.mts`.
Setup: a 1440 console, plus a projector window opened from the console button (1920), plus iPhone SE, iPhone 15 and
desktop students submitting real in-app code.
- **Projector window:** no student names anywhere, no roster, 0 vertical/horizontal overflow at 1920.
- **Submissions:** "Submissions" sorted [ben (writing), ana, chloe], chips "checks 2/2" / "checks 1/2".
- **Verdicts:** one-tap ✓ gives "reviewed by you". The unreviewed note shows on the student.
- **End lesson:** asks first; dismissing keeps "Coding time".
- **Class attack:** the boss is `position: fixed`, full screen on both screens.
- **Pause:** classroom text with no "new room".
- **Setup:** step summaries, the student preview, "Use this lesson" publishes.
- **iPhone SE student:** the editor is at ~930px; "Read the full task" is there.
- **Narrow 393px console:** no overflow.
- **Errors:** 0 page errors.
- `npx tsx tools/classroom-smoke.ts`: passed (30 students, full flow). `npm run typecheck` PASS.
  `npx vitest run`: **905 passed / 9 skipped**.

---


# DONE (in-app editor)

Classroom in-app Python editor (docs/tasks/inapp-editor.md, claude-edu section). Not committed.
- **`client/edu/code-editor.ts` (+ `code-editor.css`)** is a dependency-free editor: a transparent `<textarea>` over a
  highlighted `<pre>`, so native selection, IME, undo and the phone keyboard all work.
  - File tabs for any `step.starter` paths (`python/<lesson>.py`, `README.md`). Sticky line numbers.
  - Python colours from a tiny line tokenizer that carries triple-quoted strings across lines and handles CJK.
  - Tab = 4 spaces to the next stop, or indents the selected lines; Shift+Tab dedents; Enter keeps the indent and adds
    4 after `:` (comments ignored).
  - 16px Unifont (no iOS zoom). Only the editor scrolls sideways; the page never does.
  - Draft autosaves per room+step (`kaiju.code.<room>.<step>`). "Reset to starter" returns the unfinished skeleton.
  - Carry-over: when a step opens with no draft, the student's previous-step code is taken for the same paths. The
    README always comes from the new step.
  - `readOnly` mode is the teacher's viewer.
- **`client/edu/py-run.ts`, ▶ Run:**
  - Pyodide v0.26.4 from cdn.jsdelivr.net in a Web Worker (Blob URL), loaded lazily on the **first Run** only, so a
    class of phones doesn't all download ~10 MB at step open. The worker is reused between runs.
  - 5 s run limit: on timeout the worker is killed, with "Stopped after 5s: is there a loop that never ends?".
  - stdout/stderr go to a console panel; `input()` reads from an optional "input() lines" box.
  - It never touches the server and isn't graded. If Pyodide can't load, Run is hidden.
- **`client/edu/inapp-panel.ts`** is the student panel: editor + [▶ Run] [Submit my code] [reset to starter] + console.
  Submit sends `{ t: 'classroomSubmitCode', files }`.
- **`client/app/classroom.ts`:**
  - A step with `starter` shows "Your code" with the panel. GitHub moves into "or submit a GitHub repo instead".
  - The editor gets a wider column on desktop.
  - Status and submit labels are in-app aware ("Checking your code…", "Scored your code (4f43b3)…").
  - The roster shows "in-app 4f43b3". The report shows "in-app code · <hash>".
  - The teacher gets "View submitted code (N files)", a read-only editor of `report.files`. It reads the typed
    `ClassroomReport.files` from shared/.
- **`classroom.css`:** the feedback header wraps and the score shrinks at ≤360px (it overflowed the iPhone SE by 19px).

**Verified** with Playwright **WebKit** on DEV :5175 against the real server (codex-net handler + take-edu presets, no
patching). Script: `/tmp/claude-1000/-home-wilf-data-HackPSU-repo-kaiju/df7be22c-36dc-409c-9e61-ef019d47acc6/scratchpad/inapp-shots.mts`.
- **Flow:** the teacher loads the Python preset and publishes. Students join on desktop, iPhone 15 and iPhone SE.
- **Editing:** auto-indent after `:` and Shift+Tab dedent work.
- **Run:** prints `0 1 2 done` in WebKit; `while True: pass` is stopped after 5 s.
- **Submit:** the payload has `python/01_hello.py` + `README.md` with the edit. A real scored in-app report comes back.
- **Draft:** it survives a reload; reset restores the starter.
- **Phones:** a long line scrolls inside the editor only, with 0 page and 0 classroom-scroller overflow on
  iPhone 15 and SE, including the GitHub fold.
- **Teacher:** the read-only viewer shows the student's real files.
- **Step 2:** after attack → next step, the student's step-1 code is carried over, the README is step 2's, and reset
  gives back the skeleton.
- 0 page errors. I looked at every screenshot.
- **Tests:** new `client/edu/code-editor.test.ts` (8: tokenizer, highlight escaping, Enter/Tab/Shift+Tab, carry-over
  with real presets). `npm run typecheck` PASS. `npx vitest run`: 859 passed; the 2 failures are in
  `sim/royale.test.ts` (codex-sim's in-progress PvP royale), not classroom.

**Flag for the coordinator / take-edu (not mine to change):** the unfinished preset skeleton plus a single `print(...)`
line scored **100/100** on step 1. Its checks are "file exists" + contains `print(`, which a TODO skeleton almost
passes. The presets may want checks that the skeleton fails, e.g. a literal from the expected solution, or a rubric
weight on the task-specific `contains` checks.

---

# DONE (class boss art)

The classroom Boss is drawn with the game's real kaiju renderer instead of the red ASCII figure. Not committed.
- **Module:** new `client/edu/class-boss.ts` exports `createClassBoss()` → `{ el, update({ name, hp, maxHp, raidKey }),
  destroy }`, plus the pure helpers `classBossKit(name)` and `classBossState(kit, hp, frame, pose)`.
- **Kit:** derived deterministically from the lesson's boss name with `demoBossKit` (the same decorative kit the
  landing page uses), so it can be any of the 4 archetypes. Changing the name in the lesson editor changes the kaiju;
  the teacher's name is kept.
- **Rendering:** it dynamic-imports `client/render/boss` (the chunk the app already loads) and calls the real
  `drawBoss` with a classroom-driven `BossState`. The crop is measured once per kit with a single `getImageData`,
  so the kaiju fills the stage. It draws at about 30 fps and only while visible.
- **HP drives the look:** phase 1/2/3 at >66% / >33% / below, which tints and glitches. Enraged below `enrageAt`.
  Limbs break off from the smallest up as HP drops; the last one goes on the kill.
- **Poses:** each new class attack (`raidKey`) plays 7 stagger poses, then a roar, or an enrage beat if the phase
  dropped. HP at 0 plays the death topple and then leaves an empty stage. There is an occasional idle roar.
  prefers-reduced-motion draws one static frame.
- **classroom.ts / classroom.css (small):** the ASCII `<pre>` is replaced by `classBoss.el`, which is
  **projector-only**: student phones never show the boss panel, so they never start its loop. Its update is fed from
  render() (name, hp, max, current raid key) and it is destroyed with the screen. The stage is 270px tall (360px at
  1600px+), with a nearest-neighbor canvas, a red glow, and greyed out when defeated. The existing volley and
  hit-shake CSS still apply.
- **Demo:** `client/edu/demo.html?view=class-boss[&raid=i][&kill=i]` shows 4 archetypes at 100/61/25/7% HP; one
  takes a class attack or is killed.

**Verified** in Playwright **WebKit** and looked at every screenshot:
- the demo at 1280 and iPhone SE: all HP states, mid-stagger, mid-topple, empty after death;
- the real classroom on DEV :5175: teacher at 1280 and the 1920 projector show the kaiju; iPhone 15/SE students are
  unaffected.
- 0 page errors and 0 horizontal overflow.
- **Tests:** new `client/edu/class-boss.test.ts` (2: deterministic kit; HP → phase/enrage/broken limbs, monotonic).
  `npm run typecheck` PASS; `npx vitest run` **790 passed / 8 skipped**.
- **Not exercised end to end:** a real scored raid, which needs GitHub analysis. The raid path is driven by the same
  `raidKey` the existing volley CSS uses, and is shown in the demo.

---

# DONE (ui review)

UI-8 (docs/ui-review-coordinator.md, classroom: "visually a different product" and "owner lands on the student view").
Not committed.

**Restyle** (`client/app/classroom.css` rewritten, small markup changes in `classroom.ts`): the classroom now uses the
lobby's visual language.
- Near-black background with a CSS pixel grid and CRT scanlines. The projector also gets the lobby's animated pixel
  backdrop (`createBackdrop`); student phones stay CSS-only, so there is still no render loop on phones.
- Pixel-bordered panels; the boss panel has a red border and its HP bar is segmented.
- The app's own pixel `.btn` buttons (the classroom no longer flattens them), at least 44px tall.
- Press Start 2P for short labels: brand, room code, clock, section headings as `$ CLASS RANKING`, scores. The body
  stays in the terminal font, whose Unifont covers the Chinese presets.
- Green/yellow tokens, step rail drawn like the lobby's mode tabs.
- Dark inputs with a dashed green underline. Selects use `appearance:none` with a pixel arrow, the same fix as UI-1.
- Compact phone header. Non-time clock text ("Ready when you are", "Teacher paced") is shown small. The empty step rail
  is hidden. Empty rank/score markers are a quiet "·" (the pixel font drew "-" like "_").
- All layout selectors and behaviour are kept: dense roster over 15 students, raid animation, reduced-motion,
  preset library, editor.

**Owner landing:**
- **Redirect:** a player-role owner of a classroom with no lesson yet is sent to the same room's `?screen=1` teacher
  screen with `location.replace`. This is the legacy player-owned edu room, or `?mock=edu`.
- **Banner for a non-teacher projector:** a `?screen=1` page that is not the owner shows "This big screen is not the
  teacher's" with a "Join as a student" link. This also covers a student who briefly inherits ownership while the
  teacher reconnects.
- **Mock:** in `client/app/mock.ts` (claude-ui's file, one line), `?mock=edu` with `screen=1` now owns the room like a
  real classroom; other mocks are unchanged. This is how the coordinator saw "Waiting for your teacher" as owner.

**Verified** with Playwright **WebKit** on DEV :5175 and looked at every screenshot. Script:
`/tmp/claude-1000/-home-wilf-data-HackPSU-repo-kaiju/df7be22c-36dc-409c-9e61-ef019d47acc6/scratchpad/classroom-shots.mjs`.
- **Flow:** teacher on desktop 1280x800 creates the classroom from the landing page, publishes the default lesson,
  and opens step 1. Students join on iPhone 15 and iPhone SE.
- **Screens shot:** teacher setup and coding, projector 1920x1080, students waiting and coding (viewport + full length),
  a second non-teacher projector, and the `?mock=edu` owner on iPhone 15.
- **Results:** 0 page errors and 0 horizontal overflow everywhere. The mock owner ends up on
  `…?mock=edu&screen=1` showing "Prepare the lesson" and the editor. The non-teacher banner is visible.
- **Not exercised:** the raid/feedback phases with real scored submissions, which need GitHub analysis. Their panels
  share the restyled panel CSS.
- **Tests:** `npm run typecheck` PASS; `npx vitest run` **788 passed / 8 skipped**.
- **i18n:** the two new strings (non-teacher banner, "Join as a student") are English until the out-of-band
  translation job runs.

---

# DONE (rubric) — code + unit tests done; demo views NOT yet screenshot-checked

Rubric UI in client/edu/ (all exported from `client/edu/index.ts`):
- `rubric.ts` `createRubricEditor({ current, onUse(r), room?, token?, parse? })`, the teacher panel. Teachers can:
  drag-drop a file, pick one, or paste text; edit each criterion (name, weight slider with a live normalized %,
  signal dropdown in plain labels, unit-aware target, description); add unparsed lines as criteria or ignore them;
  then "use this rubric" or "reset to default". `setCurrent(lobby.rubric)` marks the draft "✓ in use".
  Default `serverParse()`: `POST /api/rubric/parse?filename=…&room=…`, with the doc as the raw body and
  `content-type` text/markdown | text/plain | application/pdf, plus an optional `Authorization: Bearer <token>`.
  It expects Rubric JSON back. On a 404 it falls back to `rubric/index.ts` `parseRubric` in the browser (text only),
  if that module exists. **codex-net: please match this request shape, or tell me yours.**
- `createJudgedCard({ rubric, quality, preview? })` is the student lobby card "how you'll be judged". Without
  `preview` it estimates from the real report card. Criteria it can't measure (ci, license, typing, commits, custom
  checks) show "measured after the fight" and are never invented.
- `feedback-view.ts`:
  - `createFeedbackView(fb, rubric, { variant, you })` is the student screen: score ring, strengths, next steps with
    GitHub file links, per-criterion bars with evidence and tip, and how they played.
  - `createClassFeedback({ items, rubric, variant, room?, title? })` is the teacher view: class summary, sortable
    table, row drill-down, and CSV/Markdown export. Export uses `/api/room/<room>/feedback.csv|.md` and falls back to
    the same files generated in the browser.
- `rubric-data.ts`: pure helpers (weights, targets, estimate, class summary, sort, CSV/MD, GitHub links).
  Tests: `client/edu/rubric.test.ts` (9). The client/edu total is 34, all passing.
- Demo: `demo.html?view=rubric[&parsed]|feedback|feedback-class[&open=0]|feedback-screen`. It uses a demo-only parser
  and demo feedback built from real report cards until rubric/ lands. **Not yet looked at in screenshots:** the next
  step is a Playwright pass at phone, desktop and 1920 sizes.

### Handoff → claude-ui (rubric)
- Lobby, edu, owner:
  `const ed = createRubricEditor({ current: lobby.rubric, room: lobby.room, token: app.token, onUse: (r) => net.send({ t: "setRubric", rubric: r }) });`
  Call `ed.setCurrent(lobby.rubric)` on every lobby update.
- Lobby, edu, student:
  `createJudgedCard({ rubric: lobby.rubric ?? localDefaultRubric(), quality: me.kit?.quality })`.
- On ServerMsg `feedback`, edu autopsy:
  - Student: `createFeedbackView(items.find(f => f.playerId === app.you), lobby.rubric, { variant, you: true })`.
  - Owner or projector: `createClassFeedback({ items, rubric: lobby.rubric, variant, room: lobby.room })`.
### Contract request
- `LobbyPlayer.rubricPreview?: CriterionResult[]`: the server's real pre-fight `scoreRepo` result.
  `createJudgedCard({ preview })` already uses it; without it the card shows the report-card estimate.

---

# DONE (edu ux)

UX-audit fixes EDU-1, EDU-2, EDU-3 and EDU-7 (docs/ux-audit.md, "Edu mode (classroom PvP) audit"):
- **EDU-1, plain words with a scale:** new `client/edu/explain.ts` reads the numbers back out of the sim's `signal`
  strings. Every report-card row now has three plain lines:
  1. `C speed (alias) — how independent the parts of your code are`, with an F·D·C·B·A scale.
  2. `each part of your code uses 5 other parts (class median 1)`.
  3. `next: B needs each part to use ≤ 4.4 others. try: …`
  Every B-or-worse row gets a concrete tip that names a real file or loop when there is one. Tapping the word opens
  the concept's animated diagram inside the card. The code alias is shown small after the word, and `regen` is folded
  into `energy`: it has the same signals, so it is no longer shown or counted.
- **EDU-2:** weakness is now `tech-debt penalty — import loops and leftover TODOs make you take extra damage (A = no
  penalty)`, with the effect `→ you take +12% damage`.
- **EDU-3:**
  - "Next grade" targets are computed with the sim's own `qualityRows`. A target is shown only when the client
    reproduces the sim's grade exactly, so a threshold is never guessed.
  - GPA uses exactly the letters shown, so the lobby's `code grade`, the ranking and the card all agree.
  - Class highlights break ties between equal grades with the real number.
  - The demo page now uses the sim's real grading (`playerKitFromProfile(p, { mode: "edu" })`) instead of my estimator.
  - Tests check grade monotonicity in tests % and tech-debt penalty, and that each target reaches the next grade.
- **EDU-7:**
  - Ranking headers read `KOs · rounds won · damage · code grade` (wraps to two lines).
  - Highlights use 2 columns, stacked on phones, showing only the first fact.
  - Glossary ✓ also marks concepts graded on the report cards; the sentence is dropped when nothing is met.
  - GPA label 12px; phone deck lesson title/tag/hint 10px.
- Tests: `client/edu/explain.test.ts` (8, run on every fallback repo through the sim) + `edu.test.ts` (17).
  Typecheck is clean. The full suite has 2 failures, both in `client/render/boss/layout.test.ts`, caused by the
  in-progress `sim/regions.ts` change and not by edu.

### New handoffs (edu ux)
- **claude-ui (lobby):** pass the class so rows show the class median:
  `createReportCard(student, { size: "md", you: true, peers: lobby.players.filter(p => p.kit?.quality).map(p => ({ id: p.id, name: p.name, repo: p.repo ?? "", quality: p.kit!.quality })) })`.
  The lobby's `gpa()/gpaGrade()` already ignore `regen`, so nothing else changes.
- **claude-ui (mock):** `fakeQuality` in `client/app/mock.ts` makes contradicting grades (EDU-3). Use the sim's real
  grading instead: `playerKitFromProfile(profile, { mode: "edu" }).quality`. That's what client/edu/demo.ts does now.
- **claude-genesis (EDU-6, not mine):** `client/genesis/local.ts` `genesisFromKit()` always writes
  `stats: same 5-pt budget`. When `kit.quality` exists it should say `code quality -> stats (see your report card)`.
  `eduGenesisNotes` already speaks in plain words via `plainRow`.
- **codex-sim (contract request, optional):** signals are parsed from today's wording in `sim/quality.ts`. If that
  wording changes, rows fall back to the raw signal + the sim tip, so nothing breaks, but the plain text is lost. More
  robust: `QualityStat.metrics?: Record<string, number>` (e.g. `{ testPct, avgImports, depth, longestFn, avgFn, perFile,
  commentPct, readmeChars, cycles, todoPer1k, advisories, loc }`). `explain.ts` would read it first.

---

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
