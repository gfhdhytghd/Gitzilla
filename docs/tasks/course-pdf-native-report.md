STATUS: WORKING

# Native PDF course generation

## Scope

- Base HEAD: `c959bdd`. No commit, push, staging, or deployment.
- Own changes: `design/provider.ts`, `server/course-source.ts`, `server/course-generation.ts`, `server/course-http.ts`, `server/course-http.test.ts`, `tools/course-gen-eval.ts`, upload help copy in `client/app/course-upload.ts`, and the course section of `README.md`.
- Concurrent changes in `client/app/classroom.ts`, `server/rooms.ts`, `server/classroom.ts` and other unrelated files were not edited or reverted. The pre-existing README Auth0 wording was preserved.

## Implementation

- Gemini `generateContent` receives the complete PDF as `{inline_data:{mime_type:"application/pdf",data:<base64>}}` beside the prompt, including every repair attempt. Successful provider labels are `gemini:<model>:pdf`.
- Both HTTP uploads and direct generator calls validate the PDF with bounded `pdfinfo` execution. File limit remains 8 MiB. The page limit defaults to 100; `COURSE_PDF_MAX_PAGES` accepts 1..1000. Over-limit PDFs return HTTP 413 before a model request. Malformed/unreadable PDFs return 422. Client-supplied page counts are ignored.
- Native generation never runs `pdftotext` and has no extracted-text limit. The prompt marks all visible PDF content as untrusted reference data.
- Only the text-based sorting-availability heuristic is inapplicable to native PDF vision. The prompt requires actual visible teaching content. It does not infer coverage from headings. All other quality checks, syllabus-recall rejection, self-contained questions, count constraints, seeded diversity, preset normalization, teacher instructions, one repair round, Python key verification, and option shuffling remain shared.
- Gemini failure or missing configuration invokes `pdftotext`, then configured DeepSeek, using the original text prompt and source-aware sorting checks. Text fallback remains limited to 80,000 UTF-8 bytes (413); scans without selectable text retain the existing 422 message. `.md`/`.txt` behavior is unchanged.
- Native and fallback generation only return previews. No publish/apply action was added.
- `tools/course-gen-eval.ts --native-pdf` defaults to the six requested lesson/quiz/exam easy/extreme cases. `--cases` permits bounded manual reruns. `--real` is still mandatory; manifests, raw outputs, diagnostics, and final plans remain separate artifacts.

## Validation

- Baseline red: two new assertions failed before implementation (native PDF forwarding and page-limit error), with 47 existing HTTP tests passing. Evidence: `qa/artifacts/course-pdf-native-checks/baseline.log`.
- Existing generator/pedagogy/preset/quality/provider/recovery/evaluation and upload regression tests: 183 passed across 11 files. Evidence: `qa/artifacts/course-pdf-native-checks/regression.log`.
- `npx tsc --noEmit`: passed. Evidence: `qa/artifacts/course-pdf-native-checks/typecheck-final.log`.
- `npx vite build`: passed. Existing chunk-size, mixed import, and browser externalization warnings remain. Evidence: `qa/artifacts/course-pdf-native-checks/build.log`.
- Manual evaluator without `--real`: refused before provider access. Evidence: `qa/artifacts/course-pdf-native-checks/real-guard.log`.
- Native/fallback focused mocked-provider suite: 61 passed. Coverage includes inline request shape, no native extraction, attachment retention on repair, all five presets, execution-key rejection, source-aware fallback policy, real PDF text/page limits, and HTTP 422/413. Evidence: `qa/artifacts/course-pdf-native-checks/native-final.log`.
- A transient workspace-wide typecheck encountered errors in concurrent `tools/classroom-load.ts`. That concurrent work subsequently cleared them; the latest `npx tsc --noEmit` passed. Final evidence: `qa/artifacts/course-pdf-native-checks/typecheck-delivery.log` (passed again at delivery).

## Real-provider evaluation

Command:

```sh
npx tsx tools/course-gen-eval.ts --real --native-pdf --provider gemini --file '/home/wilf/Downloads/Module 7 Practice Exercises_ CMPSC 132 Fall 2026.pdf' --out qa/artifacts/course-pdf-native-real
```

- Model: `gemini-4-hydrogen`. DeepSeek was disabled to prove which path ran.
- Input: 723456 bytes; 6 pages. SHA-256: `2982cb51f1fece488bfec449f37004da9b649babf46077cea4a28370ea1e1a9f`.
- Inspected all six rendered source pages. Sorting is shown in handwritten images: bubble, insertion, selection, merge, quick, heap, and shell sort. The native prompt permits these visible explanations while retaining grounding requirements.
- Result: **6/6 PASS**, all via `gemini:gemini-4-hydrogen:pdf`. 52 questions were returned across the six drafts. Artifacts: `qa/artifacts/course-pdf-native-real/summary.json`, per-case `.json`, raw attempt `.txt`, metadata, manifest and `run.log`.

| Case | Seconds | Questions returned | Repair rounds | Dropped candidates (all attempts) | Final-attempt verification records: passed / failed / missing |
|---|---:|---:|---:|---:|---|
| lesson-easy | 45.6 | 6 | 0 | 0 | 3 / 0 / 0 |
| lesson-extreme | 166.8 | 5 | 1 | 2 | 3 / 0 / 0 |
| quiz-easy | 46.4 | 10 | 0 | 0 | 4 / 0 / 0 |
| quiz-extreme | 120.6 | 8 | 0 | 1 | 2 / 0 / 1 |
| exam-easy | 93.9 | 11 | 0 | 1 | 6 / 0 / 1 |
| exam-extreme | 133.8 | 12 | 0 | 0 | 5 / 0 / 0 |

- `lesson-extreme` also dropped a checkpoint that revealed the code-task solution in both attempts, preserving the existing answer-leak check.
- `lesson-extreme` retained the existing starter-quality gate: its first draft failed because a starter passed 1/6 doctest examples unchanged. One normal repair produced an accepted draft.
- `quiz-extreme` and `exam-easy` each removed one candidate missing executable verification before returning the remaining valid question set. The missing counts above are diagnostics for removed candidates, not published questions with unchecked keys. Conceptual questions still use the existing not-required policy. No final-attempt execution verification failed.
- Visual/source spot check: drafts include behavior derived from the image-only sorting explanations (bubble early-stop, insertion/selection pass invariants, merge splitting, first-element-pivot quicksort, min-heap deletion, and Shell gaps). This demonstrates the native path can use those images; it is not a claim of exhaustive source-grounding verification for every generated sentence.
- Both exam drafts retain `after-close` feedback and `revealAnswers: never`, without starter files, hints, or worked examples.
- The paid run used the existing 180,000 ms per-provider timeout, seed 20261113, and default preset question targets. Its manifest records each case. No successful result came from DeepSeek.
- Credentials were read through the existing server-only environment reader. No key was printed or saved in evaluation artifacts.

## Boundaries

No live upload, browser interaction, room application, or deployment was performed. Local HTTP tests exercise authentication/phase guards, request routing, provider mocks and output normalization. Paid evaluation exercises actual Gemini generation and the same server quality pipeline. Passing these checks does not establish live classroom acceptance or exhaustive factual correctness of all generated prose.

API reference checked: [Google Gemini document processing](https://aistudio.google.com/docs/document-processing?generate-content=true), native inline PDF `generateContent` contract.

Final `git diff --check`: passed. Base HEAD remains `c959bdd`. All work remains uncommitted; no push or deployment.

STATUS: DONE


## Round-4 review follow-up

STATUS: WORKING

Scope: five requested review fixes; no client/, rooms.ts or classroom.ts edits. Mocked-provider regression tests precede one real native run containing quiz-easy and lesson-extreme.

### Changes

- Review source: `/tmp/claude-1000/gen-eval-native/REVIEW.md`. Its historical finding is 0 wrong keys and 15 sorting questions consistent with the images. This follow-up does not re-label those earlier outputs as failures.
- Name-recall blanks: prompt prefers single choice. If used, generated name blanks need at least four distinct accepted aliases after the same whitespace/lowercase normalization as grading; case-only duplicates do not count and case-sensitive name grading is rejected. The prompt requests space/underscore/parenthesis variants where meaningful. Teacher-authored grading code is unchanged.
- Leak rule: the existing isolated worker now optionally measures informative examples. For each candidate, it runs bounded constant-return baselines (common empty/missing sentinel values and literal return values in the candidate), picks ONE best baseline, excludes the examples it passes, and applies the original strict >half threshold to the remainder. It does not union all possible constants, which would erase evidence for real lookup-table solutions. Zero remaining examples mean no evidence of a solution leak. Direct expression checks without a replaceable function retain their evidence. The starter-must-fail-all rule and key execution checks use ordinary counts, unchanged.
- Concept detection: a function mention, a stated return contract, or unrelated shared code no longer makes a concept an execution question. Both exact dropped review items (merge/search invariant and Shell gap sequence) survive without executable verification. Concrete call values and concrete true/false claims still require execution.
- Prompt: image/lecture conventions must appear in the stem or displayed shared context, not only the answer/explanation. Explicit examples are first-element pivot, min-heap with deleteMin, and source-specific gaps 4, 2, 1; these are not imposed as universal definitions.
- Generated options are limited to 120 characters in both the Gemini schema and server constraint validation. Overlong options trigger normal repair; no option or key is silently truncated. Timers account for all stem/option prose, own code, and shared code once, preserving existing execution floors.

### Mocked-provider and local verification

- Baseline red: 7 failures / 1 pass before implementation, including the exact dropped concept items and false-positive binary-search checkpoint. Preserved at `qa/artifacts/course-pdf-native-review4-checks/baseline.log`.
- Shared course regression: 246 passed across 12 files. Final focused review suite: 10 passed (one additional boundary test plus final refinements). Existing Pyodide isolation suite: 6 passed. Provider calls in all automated suites are mocked; real sandbox execution is local.
- The old >half regression still rejects an actual renamed solution. Its diagnostic is now 2/3 informative examples instead of 3/4 total examples because Python doctest accepts constant True for expected 1; the test now asserts the refined denominator.
- The exact wrongly dropped `q1-bsearch-boundary` survives, and a complete renamed solution is still rejected. Name aliases are tested through the actual `gradeQuestion`; narrow/case-duplicate lists and 121-character options are rejected. Long conceptual rounds receive a larger timer.
- `npx tsc --noEmit`: passed. `git diff --check`: passed. Evidence lives in `qa/artifacts/course-pdf-native-review4-checks/`.
- No `client/`, `server/rooms.ts`, or `server/classroom.ts` file was edited in this follow-up. Concurrent changes in those paths remain untouched.

### Single authorized real native rerun

```sh
npx tsx tools/course-gen-eval.ts --real --native-pdf --provider gemini --seed 20261114 --cases quiz-easy,lesson-extreme --file '/home/wilf/Downloads/Module 7 Practice Exercises_ CMPSC 132 Fall 2026.pdf' --out qa/artifacts/course-pdf-native-review4-rerun
```

Exactly one evaluator invocation was started, containing only the two requested cases. The seed offset preserves their original per-case seeds (lesson-extreme 20261114, quiz-easy 20261115). Normal in-pipeline repair remains enabled. Results pending.

Result: **2/2 PASS**, both `gemini:gemini-4-hydrogen:pdf`, no repair requests. Only this one paid evaluator invocation ran.

| Case | Result | Seconds | Repairs | Questions | Dropped | Max option chars | Final-attempt verification: passed / failed / missing |
|---|---|---:|---:|---:|---:|---:|---|
| lesson-extreme | PASS | 138.5 | 0 | 7 | 1 | 104 | 2 / 0 / 0 |
| quiz-easy | PASS | 51.2 | 0 | 10 | 0 | 54 | 3 / 0 / 0 |

- `lesson-extreme`: 7 returned questions; a new `q3-recursive-invariants` checkpoint was removed for passing 2/3 informative code-task examples, not for missing executable verification. The old review's `q1-bsearch-boundary` is separately covered by the exact frozen regression and is retained. This does not disable the real solution-leak gate.
- `quiz-easy`: 10 returned questions, no drops. Step timers are 206, 120 and 235 seconds. Its Shell-gap blank is numeric and self-contained; all blanks in both new outputs are numeric, so name-variant behavior is established by the mocked tests and actual grading checks, not by a generated naming blank in this paid run.
- Both outputs stay below the 120-character option cap. No final-attempt verification record failed or was missing. The diagnostics include not-required concepts and removed candidates; these are not an independent exhaustive correctness proof for every generated claim.
- **Remaining model compliance issue observed:** quiz-easy `q7-sorting-multi` still states the min-heap/deleteMin convention only in a correct option/explanation, not the stem, despite the new explicit prompt instruction. Its key matches the source, but the convention-explicitness issue is not fully eliminated in stochastic output. The Quick-sort and Shell-gap stems, and lesson-extreme's sorting stem, do state their conventions. No second paid rerun was performed because the user authorized exactly one. The requested prompt change is implemented; this remaining output limitation is retained for review.
- Per-case plans, raw attempts, manifest, summary and run log: `qa/artifacts/course-pdf-native-review4-rerun/`. No classroom draft was applied, and no commit, push or deploy command was run.

STATUS: DONE


### Post-rerun convention repair gate

STATUS: WORKING

The single authorized real run exposed the residual convention issue above. A narrow server constraint is being added so keyed heap, pivot and explicit Shell-gap conventions missing from the stem/context request normal provider repair instead of silently publishing. This final gate will receive mocked coverage only; no further paid run is authorized.

Final follow-up result:

- Added a generated-course constraint for keyed variant-dependent statements: min-/max-heap deletion conventions, first-/last-element pivot conventions, and explicit Shell gap sequences must appear in the question stem or displayed context. Only keyed claims are checked, so an incorrect distractor cannot impose its convention on a question. Missing conventions raise a repair error rather than silently rewriting a key or deleting the item.
- The exact pattern exposed by quiz-easy `q7-sorting-multi` is rejected by the new constraint. A mocked native-PDF provider test proves the same pipeline requests repair and accepts a corrected stem. Separate tests cover visible pivot and Shell-gap conventions and wrong distractors.
- Final regression run: **249 passed across 12 files**. Final focused review run: **14 passed** (including two additional convention cases). Existing isolation suite: **6 passed**. `npx tsc --noEmit` and `git diff --check`: passed. Final evidence files: `final-gate-tests.log`, `final-gate-focused.log`, `final-gate-types.log` under `qa/artifacts/course-pdf-native-review4-checks/`.
- Validation boundary: the **one** real native evaluation above passed both requested cases before this final convention guard was added. Its raw and final artifacts remain unchanged for honest review. The final guard is verified with mocks only. No second real run was made.
- The requested five code changes are complete. No client files, `server/rooms.ts` or `server/classroom.ts` were edited by this follow-up. No commit, push or deployment command was run.

STATUS: DONE
