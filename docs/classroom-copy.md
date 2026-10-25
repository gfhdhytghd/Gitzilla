# Classroom copy: what changed, and proposed rewrites for strings other agents own (claude-ux)

## Changed (shared/, claude-ux owns the text)
All four locales are written by hand in `shared/classroom-preset-text/{en,zh,es,fr}.ts`, so none of this depends on the
generated catalog.
- **27 preset steps × 4 locales:**
  - Each step has a new title and a `brief` (goal, todo, doneWhen, example, hints, concepts).
  - `instructions` is now a short summary for the teacher plus one line saying where students edit the file.
  - The old "学习目标 / 本步任务 / 文件与运行 / 评分说明" header dump is gone.
- **Starter `.py`:**
  - Each step has its own `# TODO:` comment.
  - The lesson title and summary are no longer in the header. Titles like "05 · for and range" and
    "if / elif / else" used to satisfy the `for ` / `if ` checks from a comment alone.
  - No comment contains any check literal of its lesson.
- **Starter `README.md`:** the step title and goal, a "What to do" checklist, a "My tests" table, and a "What I
  improved" section.
- **Check labels (feedback list):**
  - Before: "Source code snippet: print( (not execution output)", "This lesson's Python file has been submitted".
  - After: "Code contains: print(", "Python file: python/01_hello.py", "Test notes: README.md".
  - The literal is still in the label, so the server advice text still names it.
- **Default (non-preset) lesson:** the 3 steps get new titles, and their instructions are a goal plus a numbered
  checklist, hand-written in 4 locales.
  - These steps have no `brief` on purpose. Teachers rewrite them in the plan editor, and "+ Add step" copies step
    0; a brief would hide the teacher's edited instructions.
  - Ids, rubric and checks are unchanged.
- **Teacher guide:** each step line now shows the localized step title, the summary and the expected output.

## Proposed rewrites (not applied: owned by claude-ui / claude-edu / server, and every key is in the i18n catalog)
Changing one of these English strings drops its zh/es/fr until `tools/generate-i18n.ts` runs again. Apply them in a
batch, then regenerate the catalog.

| Where | Now | Proposed |
|---|---|---|
| server/classroom.ts:145 advice (contains check) | `Review Code contains: print(: python/01_hello.py: required evidence not found in the analyzed archive.` | `Your code doesn't use {text} yet ({path}).` |
| server/classroom.ts:140 detail | `{path}: static evidence found` / `{path}: required evidence not found in the analyzed archive` | `found in {path}` / `not in {path} yet` |
| server/classroom.ts:146 | `The measured criteria look strong. Check the task instructions and explain your implementation to your teacher.` | `Looks good. Run it once more, then explain your code to your teacher.` |
| server/classroom.ts:182 notice | `Time is up. Submissions are closed; the teacher can extend or launch the raid.` | `Time's up! Submissions are closed.` (students can't extend; the teacher console says that) |
| server/classroom.ts:201 notice | `Lesson restored. Coding is paused after restart. Detailed feedback is memory-only; resubmit to retrieve it.` | `We're back. Your teacher will restart coding. Submit again to see your feedback.` |
| server/rooms.ts:1072 | `Could not grade these editor files. Check the files and retry. No code was executed.` | `Couldn't check your files. Try Submit again.` |
| client/app/classroom.ts:494 (+311) scored list | `${c.label} · ${c.text}`, which now repeats the literal | drop the ` · ${c.text}` suffix when `c.label` already contains `c.text` |
| client/app/classroom.ts:493 | `70% evidence checks · 30% measured rubric. Teacher reviews can override the score.` | `70% from the checks above, 30% from code quality. Your teacher can change your score after reviewing it.` |
| client/app/classroom.ts:562 | `Scored your code (abc123). Keep improving until the teacher closes submissions.` | `Submitted (abc123). You can keep improving and submit again until your teacher closes submissions.` ("Scored" contradicts the checks-only score) |
| client/app/classroom.ts:564 | `The class is attacking. Your scored version is locked for this round.` / `Wait for your teacher to open coding.` | `Class attack! Your submitted code is locked in for this round.` / `Waiting for your teacher to start this step.` |
| client/app/classroom.ts:330 | `Submit your code to receive measured feedback and a next step.` | `Submit your code to get feedback and a next step.` |
| client/app/classroom.ts:349 / :352 | `Your measured result for this task` / `See the measured rubric evidence` | `Your result for this step` / `How this was measured` |
| client/app/classroom.ts:473 fallback | `Work in your own editor, push to GitHub, and bring each new version back here. Your class will attack the Boss together.` | `Code in your own editor, push to GitHub, then submit here. Then the whole class attacks the boss together.` |
| client/app/classroom.ts:26 phase (coding) | `Build your next commit` | `Coding time` (it already says this on in-app steps; most students never commit) |
| client/edu/inapp-panel.ts:37 flow line | `Write → ▶ Run to try it (only in your browser, never scored) → Submit → read your feedback → improve and submit again.` | `▶ Run tries your code here (not scored). Submit when it works, then read your feedback.` |
| client/edu/inapp-panel.ts:36 / :63 | `reset to starter` / `Reset to the starter code? Your changes to this step will be lost.` | `Start over` / `Start over from the starter code? Your changes to this step will be deleted.` |
| client/edu/inapp-panel.ts:29/:33 | `input() lines` / `one line per input() call` | `Typed input` / `One line for each input()` |
| client/edu/inapp-panel.ts:34 | `▶ Run` is not in the catalog | add it (or translate it). The preset todos name it as "▶ Run" in every locale to match today's button |

Fine as they are: task-card copy ("Done when", "Need a hint?", "found in your files" / "not found yet"), "Your code
saves on this device as you type…", the raid pause overlay, and the py-run timeout message.
