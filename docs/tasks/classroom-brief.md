# Classroom task readability (user: "the display of the job students need to do is hard to read" + "the text itself
# needs changes since Codex wrote it")
Contract (committed): ClassroomStep.brief?: StepBrief {goal, todo[], doneWhen[], example?, hints?, concepts?}.
Audience: beginners (high school / CS1), many reading on a phone, some non-native English speakers.

## claude-ux — rewrite the words (owner of preset TEXT for this card; edit shared/classroom-presets.ts content only)
- For all 9 lessons × 3 steps × 4 locales (en/zh/es/fr): write a StepBrief per step and clean up the step title +
  free-text `instructions` (keep it as a 1–2 sentence teacher-facing summary). Voice: friendly, concrete, short
  sentences, second person, no jargon without a 3-word explanation, no filler ("Learning Objectives", "Current Step
  Task" headers go away). Each todo starts with a verb and names the exact thing (`name`, `print()`, file
  `python/01_hello.py`). doneWhen mirrors the step's real checks (read them) so students can self-verify before
  submitting. Give an `example` output for every step that prints something. Hints: 1–3, progressively more specific,
  never the full solution. Concepts: 1–4 chips.
- Rewrite the starter-file TODO comments to match the brief (the README in starters too), keeping the code skeleton.
- Also rewrite the default (non-preset) lesson's three steps (currently "Implement the feature your teacher assigns…")
  and any student-facing classroom copy that reads awkwardly (submit/feedback/waiting messages) — list what you changed.
- zh/es/fr: natural, not literal; zh simplified Chinese with Chinese punctuation; keep code tokens untranslated.
- Run take-edu's preset tests after editing; ask take-edu (via your progress file) if a test needs updating.
## claude-edu — the task card UI (client/edu + client/app/classroom.ts/css)
Student view (phone first, then desktop): sticky step header (step n/3 · title · timer); a TASK card: goal in large
readable type (not pixel font; 17–18px, line-height 1.5, max ~60ch), concept chips, a numbered TODO checklist with
`code` styled inline (tap to tick locally, saved per step), a "Done when" list that turns into ✓/✗ after a submission
using the real check results, an "Expected output" code block, collapsed "Need a hint?" (reveal one at a time), and
the GitHub/in-app submit area BELOW the task. Remove the generic "YOUR NEXT COMMIT 1-2-3" box (fold it into one line
under Submit). Fall back to free-text instructions when no brief. Projector: show goal + concept chips + example
large; teacher console: brief collapsed with the existing controls. Verify WebKit iPhone SE/15 + desktop + projector.
## take-edu — validation only (no wording edits): every preset step must have a brief (all locales), todo 2–6 items,
doneWhen aligned with checks, examples present when the starter prints; update tests to enforce this.
