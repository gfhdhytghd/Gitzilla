# Question sets: end-to-end self test (fresh Codex)

User request: after the question-set work is done, an agent must test it by itself, like a real class: open a room,
bring in many students, answer, and check the results.

## Setup

- Start a local server on a free port from the current working tree (never port 5173, never production), with
  `GITZILLA_OPEN_PLAY=1` so students need no sign-in. Run heavy commands under `capmem` (8 GB cap).
- Teacher: one real browser (Playwright Chromium, 1440 px) that creates the classroom.
- Students: 6 real browser students (3 at 393 px, 3 at 1440 px, WebKit and Chromium mixed) plus WebSocket bots up to
  the room limit (30), using the existing harness `tools/classroom-questions-smoke.ts` as a base.
- Projector: one browser window with `?view=projector`.

## Lesson

1. Teacher uploads `/home/wilf/Downloads/Module 7 Practice Exercises_ CMPSC 132 Fall 2026.pdf` with preset `quiz`,
   difficulty `medium`, through the real UI. Use the real configured provider (DeepSeek locally). Apply the draft.
   Do not copy that PDF into the repository.
2. Teacher adds one hand-made mixed step in the editor: a small Python task plus 1 single, 1 multi and 1 blank
   question (one numeric blank), using the UI only.
3. Run the lesson: start, students answer at different skill levels (perfect, partial, wrong, blank, late, change
   answers, refresh mid-step, disconnect and reconnect), attack, reveal, retry one step, next, finish.
4. Repeat one step with `answerFeedback: immediate` (attempts and locks) and one with `revealAnswers: never`.

## Check and record

- Every student sees only what the rules allow at each phase (no keys, explanations or correctness before reveal;
  inspect the WebSocket frames, not only the screen).
- Scores, raid damage and the teacher's live bars match the answers that were given (compute the expected values).
- Projector shows answered counts during coding and distributions only after the raid.
- Grades CSV and detailed export contain the expected per-part and per-question values.
- No page errors, no overflow at 393 px, no stuck states.
- Screenshots of each phase for teacher, 2 students and the projector.

## Rules

- Fix nothing yourself. Write every defect with steps, expected and actual result, and evidence.
- Do not commit, push or deploy.
- Report: `docs/tasks/question-sets-e2e-report.md`, last line `STATUS: DONE` or `STATUS: BLOCKED <reason>`.
