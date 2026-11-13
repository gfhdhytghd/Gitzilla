# Question sets: single choice, multiple choice, fill in the blank

User request: classroom steps must support single-choice, multiple-choice and fill-in-the-blank questions, and a teacher
must be able to assign several questions at once (TopHat / Pearson style), not only code tasks.

## Contract (committed by coordinator; do not change without asking)

Types are in `shared/classroom.ts` and `shared/types.ts`. Read them first.

- A step has `mode`: `'code'` (default, every older plan), `'questions'` or `'mixed'`.
  - `code`: unchanged behavior.
  - `questions`: no code task. `rubric`, `checks` and `starter` are ignored and may be empty. The step score is the
    question score.
  - `mixed`: code task plus question set. Step score = `codeScore * (1 - w) + questionScore * w`, with
    `w = questionsWeight / 100` (default 50). A missing part counts as 0.
- `questions`: 1..30 per step. Kinds: `single`, `multi`, `blank`. Limits are in the type comments.
- Question score = sum(points × per-question score) / sum(points) × 100, rounded like other scores.
  - `single`: 1 or 0.
  - `multi`: `exact` = all and only the right options; `partial` (default) = max(0, (rightPicked − wrongPicked) / answer.length).
  - `blank`: each blank has an equal share. Compare after trim + collapse inner whitespace; case-insensitive unless
    `caseSensitive`. `numeric`: parse the answer as a plain decimal number (no thousands separators) and accept
    |x − value| ≤ tolerance.
- Answer feedback:
  - `after-close` (default): students may change and save answers as often as they like while the phase is `coding`.
    Every save regrades. Students see "saved", never correctness, until reveal.
  - `immediate`: every save grades the questions in it at once and returns correctness to that student. Each question
    allows `maxAttempts` graded saves (default 3). A question locks when correct or out of attempts; after lock the
    student sees the key and explanation for that question only. Saving a locked question is ignored, not an error.
    Unanswered questions in a save do not use an attempt.
- Reveal (`revealAnswers`, default `after-raid`): in phases `feedback` and `complete`, students get keys and
  explanations for the step they just did, and their own correctness. `never`: students only ever get their own
  score (exam mode). The teacher always sees everything.
- Secrecy: the `classroom` message state goes to every socket, including the projector. Before reveal, every
  non-teacher recipient must get a plan in which each question is a `StudentQuestion` (no `answer`, no `blanks`
  accept lists, no `explain`; blank questions carry `blankCount`). After reveal, only the revealed step's keys may
  appear. This also applies to `/api/room/<code>` and any export a student can fetch. Add a test that serializes every
  non-teacher payload in every phase and asserts no key or accept string leaks.
- Protocol: `{ t: "classroomAnswers", stepId, attempt, answers }`. Partial saves merge into the student's previous
  answers for this step attempt. Reject a stale `stepId`/`attempt` with a clear error. Rate limit: 1 save per second
  per student, max 200 saves per step attempt. No queue: grading is synchronous.
- Row status for a `questions` step: `submitted` after the first save that contains at least one answer. `mixed`:
  `submitted` when either part exists; the row score updates when either part changes.
- Raid damage, `previous`/`credited` farming protection and `improvement` work on the blended step score exactly as
  they do now.
- Teacher live view: the teacher's `classroom` message carries `questionLive` (one `QuestionStat` per question of the
  current step), updated on every save. It never goes to students or the projector.
- Round freeze: when the attack runs, `ClassroomRound.questionStats` stores the same aggregates. They are anonymous
  and safe for the projector.
- Restore after restart: answers are memory-only like reports (existing notice covers it). Plans with questions must
  persist and restore.

## Split

- **Codex (logic, this card's "Server" part):** everything outside `client/`.
- **Claude UI agent ("UI" part):** everything in `client/`, plus new i18n source strings.
- Both work in the same tree at the same time. Do not edit the other side's files. If you need something from the
  other side, write it under "Questions" in your report file instead of editing.

## Server (Codex)

1. `server/classroom.ts`: plan normalization and validation for all new fields (defaults, limits, unique ids,
   `{{n}}` markers match `blanks.length`, single `answer` is an option id, multi `answer` non-empty subset); grading;
   answer saving; `immediate` attempts and locks; reveal; live and frozen stats; redaction helper
   `studentPlan(plan, revealStepIndex | null)`; mixed-score blending on code submissions too.
2. `server/rooms.ts`: route `classroomAnswers`; send redacted state to non-teachers; `questionLive` to the teacher.
   Check `/api/room/<code>` and any other place that serializes the plan.
3. `server/course-generation.ts`: schema and prompt can produce `mode`, `questions` and the other new fields. Use
   question sets when the source material is not about coding, or as checkpoint questions next to code steps. Validate
   with the same normalizer. Keep tests on mocked providers only.
4. Exports (`server/classroom-export.ts`, `shared/classroom-grades.ts`): grades CSV keeps the overall score column and
   adds, per step, `code` and `questions` part scores when the step has them. The detailed classroom export adds one
   column per question (`s<step>-<question id>`: score 0..1, blank when unanswered). Teacher only.
5. `tools/classroom-smoke.ts` (or a new `tools/classroom-questions-smoke.ts`): headless bots join, answer a mixed step
   at different skill levels, the teacher attacks, and reveal is checked. This is the base for the later 35-student
   load test, so make the bot count and answer profiles parameters.
6. Tests: unit tests for every grading rule and limit, the leak test above, protocol tests, persistence/restore,
   course-generation validation. Run `npx tsc --noEmit -p .` and the full `npx vitest run`.

## UI (Claude UI agent)

Design goals: phone first (students answer on phones), TopHat-like speed, Pearson-like clarity for feedback.

1. **Student, coding phase:** a question list for the current step. One card per question, with a progress strip
   ("3 of 8 answered"). Single choice = large tappable rows; multi = checkboxes with "Select all that apply"; blanks
   rendered inline in the prompt as inputs (numeric blanks get `inputmode="decimal"`). Autosave after a short pause
   and on blur, with a visible saved state; an explicit "Submit answers" button also saves. Mixed steps show the code
   editor and the question set as two tabs or sections; the student must be able to tell which parts are done.
2. **`immediate` feedback:** per-question correct / incorrect state, attempts left, locked state with key and
   explanation.
3. **Reveal (feedback / complete):** each question shows the student's answer, the key, correctness and explanation.
   `never`: only the score.
4. **Teacher lesson editor:** choose the step mode; add, edit, reorder and delete questions of each kind; mark correct
   options; edit blanks (with a preview of the prompt and blank inputs); points, explanation, attempts; step-level
   feedback mode, reveal mode and mixed weight. Client-side validation mirrors the server limits.
5. **Teacher console:** live per-question bars from `questionLive` (answered count, per-option distribution, correct
   rate), weakest question first. Per-student answers in the existing student review panel.
6. **Projector:** during coding, only "N answered" per question (no distribution, no correctness). After the raid,
   frozen distributions from `questionStats` with the correct option marked, unless `revealAnswers` is `never`.
7. **Course upload preview:** show the generated questions read-only.
8. Every new user-facing string goes through the i18n catalog the way existing classroom strings do. Run the i18n
   audit. Translations are produced with the project's Gemini route (`agy`), not by hand.
9. Verify in a real browser (Playwright, WebKit and Chromium, 393 and 1440 widths): screenshots of each state above,
   0 overflow, 0 page errors.

## Rules for both agents

- Do not commit or push. The coordinator reviews and commits.
- Do not deploy and do not touch production.
- Leave `README.md` and `auth/setup-email.ts` alone: they have the user's uncommitted edits.
- Report in your report file (`docs/tasks/question-sets-<server|ui>-report.md`): what changed, the commands you ran
  and their results, and open questions. The last line of the report file must be `STATUS: DONE` or
  `STATUS: BLOCKED <reason>`.
