# Classroom UX audit: the teacher's journey (claude-ux)

Persona: a CS teacher, not a gamer, running a 45-minute lesson for 20–30 students. They use a laptop mirrored to a
projector, and students use their phones.

Setup for this audit:
- Dev server :5175 with the real server, no mocks.
- Teacher: Chromium at 1440x900, and WebKit iPhone 15 for the teacher-on-a-phone case.
- Students: WebKit iPhone 15 and iPhone SE, with 3–5 real browser contexts.
- Preset "Python Basics · 01 · Output and Variables", run end to end: publish → join → code → submit → review → pause
  → class attack → feedback → next step → end → export.

Screenshots are in `docs/ux-shots/t-*.png`. claude-edu was editing `classroom.ts` while I ran this; the new join card
and controls hint are already in the shots.

> **Status: complete. P0 → top-5 quick wins → P1 → P2 → failure cases. A re-check section will be added after
> claude-edu's fixes land.**

---

## P0: things that can embarrass the teacher in front of the class

### P0-T1 · The teacher's console *is* the projector, so private data is projected
The page that creates the room (`?screen=1`, owner) is both the teacher's control panel and the class's big screen.
In most classrooms the laptop is mirrored to the projector, so every student sees all of this:
- **A ranked list of names and scores**, titled "Class ranking": `1 ana 100.0 · 2 ben 50.0 · chloe ·`. The weakest
  students are ranked in public, every round.
  - Shots: `t-14-submitted-1440.png`, `t-16-teacher-review-ana-1440.png`.
- **One student's full code and score.** Clicking a row opens "ANA · REVIEW 100.0/100", the code, "What to work on
  next" and the checks on the same screen.
  - Shot: `t-17-teacher-codeview-1440.png`.
- **The teacher typing a private review.** The note ("Works, nice f-string") and the score override (100 → 90) are
  typed live in front of the class. The note then shows publicly as "Teacher review: …".
  - Shot: `t-18-teacher-reviewed-1440.png`.
- **The lesson editor and controls**: Export CSV and End lesson are always visible on the projector.

There is no projector-only view and no "I'm projecting, hide private info" switch. The workarounds a teacher would
try both fail:
- **A second tab in the same browser** (`?screen=1`) opens the *full* console again: controls and editor are visible
  (`t-30-second-tab-projector-1920.png`).
  - It also **kicks out the first tab**: "this room is open in another tab. your player moved there. only one tab
    can drive it at a time. [ use here ]" (`t-30b-first-tab-displaced-1440.png`).
  - So console + projector windows on one laptop can't both stay live.
- **A separate projector device** shows a banner *to the class*: "This big screen is not the teacher's. The teacher
  controls the class from the screen that created the room. [Join as a student]". It also still shows the scored
  roster (`t-31-other-device-projector-1920.png`).

claude-edu has started an "Open projector window ↗" link (it appeared in my last run). For it to work:
- the projector window must connect as a **viewer** that doesn't displace the owner's socket;
- the "not the teacher's" banner must not show on it.

**Fix (claude-edu):**
1. **Split the two views.**
   - **Projector view**:
     - Join QR and code.
     - Step title, the student instructions in short form, and the timer.
     - The "N of M submitted" count as a bar.
     - The boss, the class attack, and aggregate impact.
     - Optional first names of the most improved, but no scores, no ranks and no low scores.
   - **Teacher console**:
     - Roster with scores.
     - Review and code viewer.
     - Controls, editor and export.
2. **Make the split one click.** On the teacher page, add a button **"Open projector window ↗"** that opens
   `?screen=1&view=projector` for the teacher to drag to the projector display.
   - Add a header toggle **"Projecting: hide names & scores"**, on by default while anything is mirrored.
   - With the toggle on, the review panel and roster scores blur until the teacher holds or clicks "show privately".
3. **Rename the board.** Change "Class ranking" to **"Submissions"** and sort it by name, or by status: stuck first,
   then not submitted, then submitted. Never sort by score where students can see it.

### P0-T2 · "100/100" means "the file contains `print(`", and the teacher can't tell
Ana added `print('hi from ana')`. The task requires the first line to be `Hello, Python!`, so her code is wrong. She
still scored **100.0/100** and is ranked #1.
- Ben submitted the untouched starter and got **50/100**.
- Step 1 is 100% evidence checks, which are "file exists" + "contains `print(`". Any print scores full marks.
- The teacher guide admits this ("passing checks does not indicate the program is correct"), but the guide is
  folded away in setup. The roster shows a big gold 100.0, which reads as *correct*.
- During class a teacher will praise or move on based on that number.
- Shots: `t-14-submitted-1440.png`, `t-16-teacher-review-ana-1440.png`; the export says `ana … 90` only after my
  manual override.

**Fix:**
1. **Label until reviewed.** Until the teacher reviews a submission, show it as **"Checks 2/2 ✓ · needs your
   review"**, not as a score out of 100. Keep the /100 for after the review, or when the step has CI checks.
2. **One-tap verdicts.** Give each roster row **✓ works / ✗ not yet / ? ask me** buttons on the teacher console.
   They set `teacherReview` without typing a number, so the 2-taps-in-class budget holds.
3. **Preset data (take-edu):** add the literal output from the task as a check, such as `contains: python/01_hello.py
   :: Hello, Python!`. That way at least "prints the right thing" is in the evidence. Better: run the student's
   Pyodide **Run** output against the expected first line and report it as unofficial evidence.
4. **Wording:** "The measured criteria look strong" (`t-18`) is the wrong message for code that misses the task.
   Change it to "Checks found the file and a print() call. Ask your teacher to check the output."

### P0-T3 · During the class attack the projector shows a wall of instructions, not the boss
The board is one long page, about 4,100 px tall at 1440x900. The order is:
1. header
2. step rail
3. the **full** step instructions (learning objectives, task, file and run, the whole starter code, self-test,
   record & submit, grading notes)
4. controls
5. roster + boss
6. review

When the teacher clicks **Launch class attack**, nothing scrolls, so the "classroom moment" plays **off-screen**.
- The raid at 1 s, 4 s and 8 s shows only instructions and the clock `0:06`; the boss is about 1,500 px below
  (`t-21-raid-1s/4s/8s-1440.png`).
- The feedback phase is the same (`t-24-feedback-1440.png`).
- The same layout means **controls are below the fold** during coding (`t-08-published-1440.png`): to pause or add
  2 minutes, the teacher scrolls past the starter code with the class watching.

**Fix:**
1. **Fit the projector view to one viewport** (1920x1080 and 1440x900, no page scroll):
   - Instructions become a 3-line summary plus "full task on your phone".
   - The starter code never shows on the projector.
2. **Raid = boss full screen** for its ~10 s: auto-scroll to it or take over the screen. After the raid, return to
   the summary board automatically.
3. **Teacher console:** keep the controls in a **sticky top bar**: Pause · +2 min · Launch class attack ·
   Next / Retry, plus a ⋯ menu for Export and End.

### P0-T4 · One click ends the lesson or wipes the room, with no confirm and no undo
- **End lesson** (`classroom-finish`) runs at once, with no confirm.
  - It sits between "Launch class attack" and "Export CSV" in a row of identical buttons (`t-11-coding-1440.png`).
  - It moves the room to "Lesson complete", and there is no way back to the step.
  - In my run it fired with no dialog, and the projector went to "Lesson complete · Well played"
    (`t-27-complete-1440.png`).
- **Raid pause sheet:** "end match · new room" sits next to RESUME (`t-23-raid-paused-1440.png`).
  - It calls `app.leave({ newRoom: true })` with **no confirm**.
  - It throws away the room, all its students and their scores.
  - A teacher who just wants to resume could hit it in front of 30 students.
  - This is the game's pause sheet reused; it doesn't belong in a lesson.
- **Remove** on a step in the editor deletes it with no confirm and no undo, including its edited instructions and
  rubric.

**Fix:**
- **End lesson:**
  - Move it into a ⋯ menu, styled as danger.
  - Confirm with "End the lesson for everyone? Students' work is kept and you can still export."
  - Better: show a 5-second **Undo** toast.
- **Classroom pause sheet:** keep **Resume** and "Leave (lesson keeps running)" only, and drop "end match · new room".
- **Remove step:** add an Undo toast.

### P0-T5 · The pause sheet and the restart error use hacker jargon on the projector
- **Raid pause:** it reads `$ kill -STOP gitzilla · ^Z · [1]+ Stopped gitzilla (suspended by you)`
  (`t-23-raid-paused-1440.png`). Students see this on the projector, and the teacher can't explain it.
- **Server restart:** a red `ERR Server restarted. Your lobby has been restored.` toast appeared on the projector
  during the feedback phase (`t-24-feedback-1440.png`).
  - The restore did work, and the class kept its state.
  - But "ERR" in red on a projector reads as "it broke".

**Fix:**
- **Pause wording in classroom mode:** "⏸ Paused by your teacher · the clock is frozen". The button says
  "▶ Resume (P)".
- **Restore toast:** neutral or green: "Reconnected. Everything is saved."
- **Placement:** put both on the teacher console, not as a red banner on the projector.

---

## Top 5 quick wins (each is an hour or less, and together they remove most of the embarrassment risk)
1. **Privacy toggle** (stopgap for P0-T1):
   - A header switch **"Projecting: hide names & scores"**, on by default.
   - It hides roster scores and ranks, plus the review panel, code viewer and editor.
   - The teacher flips it off only on their own screen.
2. **Safe End lesson** (P0-T4):
   - **End lesson** moves into a ⋯ menu with a confirm, plus an Undo toast.
   - Remove "end match · new room" from the classroom pause sheet.
3. **Raid in view** (P0-T3): on `phase === 'raid'`, run `boss.scrollIntoView({ block: 'center' })`, or take the
   boss full screen for the attack. Also collapse the projector instructions to the first paragraph, plus "full task
   on students' phones".
4. **Honest scores** (P0-T2):
   - Show "Checks 2/2 · needs review" until `teacherReview` exists.
   - Rename "Class ranking" → "Submissions" and sort by name.
   - In preset 01, add `contains: python/01_hello.py :: Hello, Python!`.
5. **Plain copy** (P0-T5, P1-T4):
   - Pause: "⏸ Paused by your teacher".
   - Restore: "Reconnected. Everything is saved." (not a red ERR).
   - Student name prompt: "Your name (as your teacher knows you)" instead of `ssh kaiju@… login as:`.

---

## P1

### P1-T1 · The teacher entrance is hard to find, and missing on phones
- **On a 1440 laptop** (`t-01-landing-1440.png`):
  - The classroom entry is the 5th of six ghost buttons, and its copy is about the game: "[ 🎓 classroom: code
    together, raid together ]".
  - The Hall of Monsters panel overlaps and clips it ("…raid togethe").
  - The page reads as a game ("$ ./create-room", "tilt to move · swing to attack").
- **Wrong first screen:** a first-time visitor gets the "Before you play" sheet, about WASD, dash, skill and
  practising controls, before they can reach the classroom button.
- **On phones** the button is **hidden** by `.host-big { display: none !important; }` at `client/style.css:994`.
  A teacher who only has a phone can't create a classroom at all.
- **Fix:**
  - Add a separate line under the main actions: **"🎓 Teaching a class? Start a classroom →"**, kept clear of the
    Hall panel, and also on phones.
  - Skip the controls sheet for classroom rooms (language only).

### P1-T2 · Setup is one 4,100 px form; Load and Publish are two separate steps; no student preview
The preset card is good: in about 30 seconds a teacher sees the summary, the prerequisites, "3 steps · approx. 30
min" and the student file (`t-03`/`t-05`). Below it the page has problems (`t-07-setup-full-1440.png`):
- **Every step is expanded** with 7 fields and an inline rubric editor.
- **Load does not publish.** "Load this lesson" only fills the draft. Students get nothing until **Publish lesson**,
  about 3,000 px further down. The hint says so in small grey text, but a teacher in a hurry presses Load and waits.
- **No preview.** There is no "Preview as a student" button, so the teacher can't see what students will see.
- **Fix:**
  - Make the primary action **"Use this lesson"** (load + publish), with "Customize first" as the secondary.
  - Collapse step editors into one-line summaries (title · minutes · N checks) that expand on click.
  - Add a **Preview as student** toggle that renders the student board inline.

### P1-T3 · The setup labels are developer jargon
- **Unexplained labels:**
  - "Evidence-check weight %".
  - The `file: / contains: path :: text / ci:` mini-language.
  - "Minutes · 0 = manual".
  - "Boss name".
  - "measures a yes/no rule from the teacher".
- **Rubric panel contradictions** (`t-06-rubric-1440.png`):
  - It's titled "HOW REPOS ARE JUDGED · DEFAULT RUBRIC", but it shows the preset's custom rule.
  - It says "Students see this on their lobby card", but classroom mode has no lobby card.
  - Its signal list (Modularity, Tech debt, Commit history, License…) is about whole GitHub repos, not a 10-line
    Python file.
- **Fix:**
  - Use plain labels: "How much the automatic checks count (the rest is the rubric)".
  - Replace the check syntax with a row builder: [File exists ▾] [python/01_hello.py] [contains text: ___].
  - "Minutes (leave empty: you decide when to stop)".
  - "Name of the class monster".
  - Make the rubric title and hint mode-aware.

### P1-T4 · No roster management, and joining uses game copy
- **Missing teacher actions:** there is no kick, rename, merge or remove-offline command (`ClassroomCommand` is only
  `start|pause|resume|attack|next|retry|finish|extend`). Wrong or rude names, and students who joined twice, stay on
  the board for the whole lesson.
- **Name prompt:** a late joiner gets `$ ssh kaiju@localhost:5175 -p JNBC · WARNING: a boss kaiju has been sighted
  · login as: your-handle · $ join --room JNBC` (`t-36-late-joiner-noname-ipse.png`).
- **Offline students:** they show as "offline" (good, `t-37`), but they still count in "N / M submitted".
- **Fix:**
  - Roster row ⋯ menu with Rename · Remove · Merge with…. This needs a codex-net contract.
  - In classroom rooms, the name prompt says "Your name", with a placeholder like "First name + last initial".
  - Leave offline students out of the denominator, or show them separately.

### P1-T5 · The teacher can't see who is stuck
- **No progress signal:** everyone who hasn't submitted shows "writing code" (`t-11`). Nothing separates "hasn't
  opened the editor", "editing", "Run raised an error 3 times" and "idle for 4 min".
- **Fix:**
  - The client already knows draft edits and Run results (they don't need to be graded). Send a light status, e.g.
    `typing · ran ✓ · ran ✗ NameError · idle 3m`, and show it in the roster.
  - Sort stuck students first on the console.
  - Add a student **"✋ I need help"** button that flags the row.

### P1-T6 · On phones, the student's editor starts 2,672 px down
- **The scroll:** on iPhone 15, students scroll past the step rail, the whole instructions and **the starter code
  printed a second time** in the instructions before reaching the editor (`t-12-student-coding-ipse.png`;
  `t-32-student-editor-ip15.png`).
- **Why it's the teacher's problem:** this turns into 30 "where do I type?" questions.
- **Fix:**
  - On phones, show the task as a 2-line summary with "read the full task ▾", and put the editor right below.
  - Don't repeat the starter code in the instructions when the editor already holds it.

### P1-T7 · Feedback and review copy is tool jargon, and the numbers have stray decimals
- **Jargon** (`t-33-student-feedback-ip15.png`):
  - "Review Source code snippet: print( (not execution output): python/01_hello.py: required evidence not found in
    the analyzed archive."
  - The same line appears again as a check.
  - "static evidence found".
- **Stray decimals:** `100.0`, `50.0`, `45.0 / 45`, and damage `22.5` in the export.
- **Fix:**
  - Write it for students: "We couldn't find a `print(` in python/01_hello.py yet. Add one, then submit again."
  - Don't repeat the advice as a check line.
  - Show integers.

### P1-T8 · The export leaves out what a teacher needs
From `t-export.md` / `t-export.csv`:
- **Missing students:** students who never submitted (chloe) are **absent**. The teacher can't see who did nothing.
- **Missing notes:** teacher review notes aren't exported; only the overridden number is.
- **Hard to read:** the step is an id (`01-hello-1`), not its title. The time is UTC ISO. There is a UUID column,
  plus game columns (Damage, Improvement).
- **Fix:**
  - One row per student × step, including "not submitted".
  - Columns: name · step title · final score · auto score · teacher score · teacher note · submitted at (local
    time) · attempts.
  - Move UUID and damage to the end, or drop them.

### P1-T9 · Projector text is too small to read
- **Sizes at 1440:**
  - The phase label ("PREPARE THE LESSON", "CLASS ATTACK") is 9–10 px Silkscreen.
  - The step rail, "Join room" and "0 / 3 submitted · attempt 1" are 9–10 px.
  - "Leave" is 11 px.
  - The clock shows "TEACHER PACED" in 10 px.
- **Why it matters:** these are the parts the class needs to read from the back row (`t-11`, `t-21`).
- **Fix:** on the projector view, use a minimum of 18 px for status and 48 px+ for the clock and "N of M submitted".

---

## P2
- **Header "Leave"** for the teacher confirms "End this lesson and leave?". Closing the teacher tab should not end
  the lesson: offer "Close (lesson keeps running)" vs "End lesson".
- **Phase name:** "Build your next commit" in in-app steps, where there are no commits. Use "Coding time".
- **Two pauses:** "Pause coding" and "Pause raid (P)" work differently, and P only works during the raid. Use one
  pause with one shortcut.
- **Before publish** the boss shows `180.0 / 180` and "THE RELEASE BLOCKER". After publish it shows `45 / 45`
  "Silent Behemoth". Show the preset's boss in the draft.
- **Gamer jargon** on the projector: "Retrying unchanged scores does not farm extra damage". Use "Only improvements
  add extra damage".
- **Score override:** it has no "clear review / back to automatic score" option, and no confirm on large changes.
- **No talking point for the raid.** The class attack (about 10 s, `t-21`) is a good moment, but the teacher gets no
  line to say. Show one on the console after the raid, e.g. "Say: 2 of 3 submitted, Ana improved most. Next:
  step 2 adds variables."

---

## Failure cases checked

| Case | Result | Shot |
|---|---|---|
| Teacher reloads tab mid-coding | ✓ console, phase and timer restored | `t-35-teacher-after-reload-1440.png` |
| Server restart mid-lesson | ✓ state restored · ✗ red "ERR Server restarted" toast on projector (P0-T5) | `t-24` |
| Student closes tab | ✓ shows "offline" · ✗ still counted in N/M (P1-T4) | `t-37` |
| Late joiner during coding | ✓ can join · ✗ ssh/kaiju name prompt (P1-T4) | `t-36` |
| Second tab in same browser as projector | ✗ displaces the console tab, shows full console (P0-T1) | `t-30`, `t-30b` |
| Separate projector device | ✗ "This big screen is not the teacher's" banner and scored roster (P0-T1) | `t-31` |
| Teacher on phone only | ✗ classroom button hidden on phones (P1-T1) | `t-38a` |
| Student didn't submit at raid | ✓ attack allowed, hint explains · ✗ missing from export (P1-T8) | `t-25` |

**Not verified:**
- GitHub-repo submissions and a repo that fails analysis.
- Rubric upload (.md/.pdf parse).
- Two teachers in one room.
- 20–30 students. Only up to 3 at once; `cr-dense` triggers at >15 and was not exercised.
- The es/fr locales.
- A WebKit desktop teacher.

---

*Re-check section to be appended after claude-edu ships fixes.*
