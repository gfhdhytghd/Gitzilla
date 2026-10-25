# Classroom UX refinement — focus on TEACHERS (user request)
Persona: a CS teacher (not a gamer, not a Gitzilla developer) running a 45-minute lesson for 20–30 students with a
projector + laptop, maybe glancing at their phone. They have 2 minutes before class to set up, and zero patience for
anything that could embarrass them in front of the class.

## claude-ux — audit first (DEV :5175 only; WebKit + Chromium; desktop 1440x900 teacher, projector 1920x1080,
## teacher on iPhone 15, students on iPhone SE/15 with 2–6 real browser contexts + bots where possible)
Walk the WHOLE teacher journey and write docs/ux-audit-teacher.md (P0/P1/P2, screenshot paths, concrete fixes, top-5
quick wins first). Write the P0 section FIRST and early (claude-edu starts fixing while you continue):
1. Landing → "teaching a class?" → create classroom. Is it obvious which button is for teachers?
2. Lesson setup: pick a Python preset vs. custom; language selection; rubric upload/edit (docs/tasks/edu-rubric.md);
   step durations; boss; what students will see. Can a teacher understand a preset in 30 seconds? Preview as student?
3. Getting students in: QR + room code on the projector, roster filling, late joiners, wrong names, kicking/renaming
   a student, students who can't use GitHub (in-app editor default for Python presets).
4. Running a step: start coding, timer, +2 min, pause (host pause), who has submitted / who is stuck, reading a
   student's code (read-only viewer) and report, overriding a score (teacherReview), retry, next step.
5. Class attack/raid on the projector: is it a good classroom moment? Too noisy? Does the teacher know what to say?
6. Feedback + end: class report, per-student feedback privacy, export CSV/Markdown, ending the class, starting again.
7. Failure cases: a student's repo fails analysis, network blips, teacher reloads the tab, teacher on a phone only,
   projector ≠ teacher laptop, two teachers.
Judge: clarity of the next action, terminology a teacher understands (no gamer/dev jargon without a plain hint), what's
shown on the projector vs. teacher-only (never project private feedback), density/legibility at projector distance,
time pressure (can every action be done in ≤2 taps during class?), undo/confirm for destructive actions, accessibility.
Don't edit client code. Append a "Re-check" section after claude-edu ships fixes.

## claude-edu — implement (client/edu + client/app/classroom.ts/css)
Start on P0s as soon as docs/ux-audit-teacher.md has them; then P1s. Server/sim needs → write requests into your
progress file (codex-net owns server; take-edu owns preset data). Verify with WebKit screenshots and LOOK.
DONE (teacher ux) when P0+P1 are done.
