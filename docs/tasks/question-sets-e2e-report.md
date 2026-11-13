# Question sets: real classroom end-to-end test

Execution complete. One confirmed P2 editor defect remains. `STATUS: DONE` means the requested test was executed, not that the product is defect-free. No application code was fixed by this tester.

## Environment and ownership

- Date: 2026-11-13, approximately 08:20–08:38 UTC.
- Repository: `/home/wilf/data/Hackathon/HackPSU/repo-kaiju`.
- Requested starting HEAD: `b8c7864dfaae0c9e7a79fd1b35bfdffef560a4b5`.
- Observed finishing HEAD: `ded9a6009611eb18de0b621031a8c582444fa4d3` (`Question stats: drop code placeholder from live labels`). Another agent committed during this test. This tester did not commit, stage, push, or deploy.
- Tested the shared working tree as requested. The initial tracked-file SHA-256 manifest and the finishing files had no application-source differences; the changed file in that comparison was the other agent's UI report. This is working-tree acceptance, not acceptance of pristine `b8c7864`.
- Preserved the existing edits in `README.md` and `auth/setup-email.ts`. The initial `client/edu/question-stats.ts` edit was present before testing; its final contents match the initial manifest.
- Actual development origin: `http://127.0.0.1:36843`. `PORT=0` selected a free port. Port 5173 and production were not used.
- Acceptance room: **WSRR**, created by the teacher through the real home-page Classroom button.
- Server, browser runner, browser installation, dependency-package extraction, and calculation-verification workloads used `capmem 8G`. The persistent browser runner and its browser children ran inside that scope.
- Room state, traces, and Solana state were isolated under `/tmp/qs-e2e-20261113/`; receipts were disabled for this local test.
- The tester closed its browser sessions and stopped its own local server after preserving the evidence.

Evidence directory: [`.codex-tmp/question-sets-e2e-20261113`](../../.codex-tmp/question-sets-e2e-20261113/). Files there are local test artifacts, not application changes. In particular, see [observations](../../.codex-tmp/question-sets-e2e-20261113/observations.json), [operation ledger](../../.codex-tmp/question-sets-e2e-20261113/commands.jsonl), [initial file hashes](../../.codex-tmp/question-sets-e2e-20261113/initial-sha256.txt), and [initial diff](../../.codex-tmp/question-sets-e2e-20261113/initial-tree.diff).

Actual server launch:

```sh
capmem 8G env PORT=0 GITZILLA_OPEN_PLAY=1 PUBLIC_URL=http://127.0.0.1 SOLANA_RECEIPTS_ENABLED=0 SOLANA_RECEIPTS_DIR=/tmp/qs-e2e-20261113/solana ROOMS_FILE=/tmp/qs-e2e-20261113/rooms.json TRACES_DIR=/tmp/qs-e2e-20261113/traces node --import ./.codex-tmp/question-sets-e2e-20261113/local-config.mjs --import tsx server/main.ts
capmem 8G node .codex-tmp/question-sets-e2e-20261113/browser-runner.mjs
```

All browser navigation used the actual origin including port 36843. The existing smoke harness supplied the bot protocol, answer profiles, audience checks, and export endpoints. Its fake analysis service was **not** used: these bots connected to the real `server/main.ts`, and Python files went through the real submission/grading pipeline.

## Real browsers and lesson

Teacher: Chromium 149.0.7827.55, 1440 px. Projector: a separate Chromium context at 1440 px, `?screen=1&view=projector`, without the teacher token.

| Student | Engine | Width | Behavior |
|---|---|---:|---|
| Student1 | Chromium | 393 | Correct answers; numeric tolerance boundary; wrong then correct in immediate mode |
| Student2 | WebKit 27.2 | 393 | Partial answers; two wrong attempts and lock in immediate mode |
| Student3 | Chromium | 393 | Wrong answers; improve on retry; actual disconnect and unsaved-draft recovery |
| Student4 | WebKit 27.2 | 1440 | Leave all answers blank |
| Student5 | Chromium | 1440 | Change wrong answers to correct; refresh during the step |
| Student6 | WebKit 27.2 | 1440 | Delayed correct submission |

These were six independent browser pages and storage contexts, not WebSocket substitutes. Another 24 WebSocket students filled the room to 30. Their six profiles were cycled four times: perfect, partial, wrong, code-only, questions-only, unanswered. Both engines actually ran; there was no Chromium substitution for WebKit. Missing WebKit runtime libraries were extracted into `/tmp/qs-e2e-deps`, without changing application code.

The teacher uploaded `/home/wilf/Downloads/Module 7 Practice Exercises_ CMPSC 132 Fall 2026.pdf` through `course-file`, selected `quiz`, kept `medium`, generated a preview, and pressed Apply draft. The PDF was not copied into the repository. Generation was real: HTTP 200, provider `deepseek`, model `deepseek-flash`, nine questions across three steps, zero repair rounds. The local app called the configured DeepSeek API; this was not a local-model substitute or a mocked response.

Gemini credentials existed in the parent configuration. The test-only process preloader filtered those Gemini settings from configuration reads and rejected any Gemini request. It did not edit either `.env` file. [Server log](../../.codex-tmp/question-sets-e2e-20261113/server.log) records real DeepSeek calls; [generation result](../../.codex-tmp/question-sets-e2e-20261113/generation.json) contains the successful provider diagnostics. The generator response observer only cloned the real response. No route returned fabricated generation data.

The teacher then used only the editor UI to add a mixed step:

- Python: create `main.py`, implement `inc(x)` returning `x + 1`; real doctest `inc(4) => 5`, checks weight 100%.
- Single choice: `len([2, 4, 6])`, key `3`, one point.
- Multi choice: select even values from `2, 3, 4`, keys `2` and `4`, partial credit, two points.
- Blank: `7 // 2` and its type, accepted numeric value `3 ± 0.1` and text `int`, one point.
- Code/questions split: 50%/50%.

Two further UI-authored copies repeated these questions and Python task: immediate feedback with two attempts for the single-choice question, then `revealAnswers: never`. The final plan had six steps and 18 questions. [Published plan](../../.codex-tmp/question-sets-e2e-20261113/published-plan.json) records the exact IDs, weights, keys, and policies.

The new hand-made step exposes the existing GitHub submission flow and has no starter editor. Real-browser students answered its question part; their code part was intentionally zero. Sixteen bots submitted real Python files in each mixed step. No GitHub repository/account was written or pushed to supply browser code submissions. In-app Python editing/Run was not exercised by these newly authored steps.

## Confirmed defect

### QS-E2E-01 — P2: adding a blank marker leaves its answer field missing

**Steps (normal UI button; independently reproduced in room AKEM on finishing HEAD):**

1. Create a classroom through the home-page Classroom button.
2. Set step 1 to Questions only and change its first question to Fill in the blank.
3. Enter `First {{1}}.` and an accepted answer for blank 1.
4. Put the caret at the end of the question.
5. Click **+ Insert blank** once.

**Expected:** the question becomes `First {{1}}.{{2}}`, and the editor immediately creates the second accepted-answer field. The teacher can enter the second answer without editing the question again.

**Actual:** the question contains both markers, but the editor still has only one blank field. Validation reports:

```text
Question 1: the blanks in the question must be {{1}}, {{2}} … in order, one per answer box.
```

The same defect interrupted the main lesson when a complete two-blank question was entered in one input event. There was no `blank-accept-3-2-1` control. This blocks entering that answer and publishing the valid-looking question until another question-text input event occurs.

**Evidence:** [button reproduction JSON](../../.codex-tmp/question-sets-e2e-20261113/defect-insert-blank-button.json), [button screenshot](../../.codex-tmp/question-sets-e2e-20261113/defect-insert-blank-button.png), [main-run screenshot](../../.codex-tmp/question-sets-e2e-20261113/defect-blank-marker-first-input.png), and both failed assertions in [observations](../../.codex-tmp/question-sets-e2e-20261113/observations.json).

**Source evidence:** `client/edu/question-editor.ts:133–145` registers `fit`, which reads the previous `q.prompt`; `client/edu/question-editor.ts:218` updates `q.prompt` in the later input handler. The inserted marker reaches the model after the blank-count calculation.

**Continuation used:** press Space once in the question field, then enter the now-visible second accepted answer. This was a UI workaround, not a code fix. The defect remains in the tested finishing tree.

## Numerical and phase results

Expected values were calculated from the recorded outgoing answers and known Python inputs, not copied from the server scores. [Audit code](../../.codex-tmp/question-sets-e2e-20261113/audit.mjs) and the seven `*-expected.json` files retain the calculation inputs.

- Question scores: weighted fraction, rounded to one decimal; multi partial credit subtracts wrong picks from right picks; blank credit is per slot.
- Mixed score: 50% code plus 50% questions, rounded to one decimal. For example, correct single + one correct multi pick + one correct blank gives `(1 + 2×0.5 + 0.5)/4 = 62.5%`; a browser with no code earns 31.3 overall.
- Boss maximum: `6 × 20 × 30 / 4 = 900 HP`. One step unlocks 150 HP. Raw damage is `150 / 30 × max(score − previous credited score, 0) / 75`; class damage rounds to tenths and respects the unlocked budget. Each individual allocation was checked with cumulative proportional rounding.

| Attack | Submitted | Expected damage | Actual damage | Boss after |
|---|---:|---:|---:|---:|
| Generated step 1 | 21 | 95.6 | 95.6 | 804.4 |
| Retry step 1 | 21 | 44.4 | 44.4 | 760.0 |
| Generated step 2 | 21 | 95.6 | 95.6 | 664.4 |
| Generated step 3 | 21 | 101.1 | 101.1 | 563.3 |
| Hand-made mixed | 25 | 87.9 | 87.9 | 475.4 |
| Immediate repeat | 25 | 86.3 | 86.3 | 389.1 |
| Never-reveal repeat | 25 | 87.1 | 87.1 | 302.0 |

All recorded scores, per-student damage allocations, teacher live counts, rendered correct-rate bars, and rendered option counts matched expectations. The first coding step, for example, had answered counts `[21,21,21]` and correct counts `[16,11,16]`; both teacher frames and projector public counts matched. The retry granted damage only for gains over prior credit.

| Real student | Latest step scores, steps 1–6 | Total / 600 | Average |
|---|---|---:|---:|
| Student1 | 100, 100, 100, 50, 50, 50 | 450 | 75 |
| Student2 | 100, 66.7, 83.3, 31.3, 18.8, 31.3 | 331.4 | 55.2 |
| Student3 | 100, 0, 0, 12.5, 0, 0 | 112.5 | 18.8 |
| Student4 | No submissions | 0 | 0 |
| Student5 | 100, 100, 100, 50, 50, 50 | 450 | 75 |
| Student6 | 100, 100, 100, 50, 50, 50 | 450 | 75 |

Other executed checks:

- Actual pause/resume: answer controls disabled while paused and enabled on resume.
- Refresh: Student5 kept the same identity and saved answers.
- Actual disconnect: Student3 navigated away before the pending changed answer could autosave; teacher observed `connected:false` and score 0. Returning restored the same identity and unsaved answer, which reached the server and produced the expected mixed score 12.5.
- Delayed student submission accepted while coding. A bot save after closure returned `Answers are open only during coding` and did not change the frozen round.
- Numeric boundary `3.1` at tolerance `0.1` and case-insensitive `Int` accepted.
- Immediate mode: first wrong answer had one attempt left and no key; correct second answer locked; wrong second answer exhausted attempts and locked. Both locked cases disclosed the key as configured and disabled inputs. Tested on Chromium and WebKit phones.
- Never reveal: students had their score but no review cards; projector had counts without correct markers or option distributions. Keys, explanations, and per-question correctness stayed absent after raid and completion.
- All six browser students, all 24 bots, and the projector reached `complete`. No stuck classroom phase remained.

## Disclosure, layout, screenshots, and exports

The full received-frame audit covered **9,370 frames across all 30 students and the projector**, with zero disclosure violations. It checked all plan steps, private reports, question totals, pre-lock immediate results, teacher-only live statistics, and distributions before reveal. [Disclosure audit](../../.codex-tmp/question-sets-e2e-20261113/disclosure.mjs), [browser frames](../../.codex-tmp/question-sets-e2e-20261113/browser-frames.json), and [bot frames](../../.codex-tmp/question-sets-e2e-20261113/bot-frames.json) retain the evidence; token fields are redacted.

Projector coding/paused views showed per-question answered counts. Raid frames lacked distributions; ordinary feedback displayed the frozen distributions after the ten-second raid. The never-reveal repeat withheld those details. These were actual rendered pages plus frame checks, not screen-only secrecy checks.

There are **112 phase screenshots**: teacher, Chromium phone Student1, WebKit phone Student2, and projector for each of 28 captured phases, including setup, coding, pause, raid, feedback, retry, immediate attempts/locks, private feedback, and completion. The screenshot list is in `observations.json`. Examples: [teacher feedback](../../.codex-tmp/question-sets-e2e-20261113/mixed-feedback-Teacher.png), [locked WebKit student](../../.codex-tmp/question-sets-e2e-20261113/immediate-locked-Student2.png), [private Chromium student](../../.codex-tmp/question-sets-e2e-20261113/never-feedback-Student1.png), [projector feedback](../../.codex-tmp/question-sets-e2e-20261113/step1-feedback-Projector.png), and [completed teacher](../../.codex-tmp/question-sets-e2e-20261113/complete-Teacher.png). There are additional authoring and defect screenshots.

All 144 layout assertions passed, covering all six browser students across the later phase captures, plus the 393 px screenshot measurements. No horizontal overflow was measured. Screenshot capture temporarily enlarged height to include scrollable content, then restored the original width/height.

No application page error was recorded. One **harness** page error occurred on the deliberately opened `about:blank`: the injected preference initializer tried to read `localStorage` on an opaque origin. That document had no application code. The raw error and explicit classification remain in `observations.json`; it is not silently discarded or counted as a product pass.

The teacher downloaded grades CSV and detailed Markdown through the real UI. The authenticated local export endpoints also supplied detailed CSV and grades Markdown. Student and projector tokens each received HTTP 403 for grades and detailed CSV.

- [Grades CSV](../../.codex-tmp/question-sets-e2e-20261113/grades.csv): 30 students, blended step scores, code/question parts, latest retry, totals and averages.
- [Detailed CSV](../../.codex-tmp/question-sets-e2e-20261113/classroom.csv): 159 attack rows, 30 summary rows, individual question fractions, and damage.
- [Detailed Markdown](../../.codex-tmp/question-sets-e2e-20261113/classroom.md) and [grades Markdown](../../.codex-tmp/question-sets-e2e-20261113/grades.md): table values match their CSV counterparts.
- Independent [export verifier](../../.codex-tmp/question-sets-e2e-20261113/export-check.py): **8,927 checks, zero errors**, including all numeric parts/questions, unanswered fields, retry replacement, damage, and Markdown parity. [Result](../../.codex-tmp/question-sets-e2e-20261113/export-verification.json).
- Additional independent Python execution checked the generated answer values and comparison counts; merge behavior and its concatenation counterexample also passed. [Generated-key verification](../../.codex-tmp/question-sets-e2e-20261113/generated-key-verification.json).

Browser/classroom assertions: **547 passed, two failed**. The two failures reproduce the same QS-E2E-01 defect. The initial warm-up room GZZQ was abandoned after a harness response-body observer failed; the completed acceptance room WSRR used a page-side response clone. Two further automation waits were corrected to respect immediate-mode save text and disabled locked controls. These harness interruptions are not reported as product defects. No application fix was made, and no task remains blocked on Gemini.

STATUS: DONE
