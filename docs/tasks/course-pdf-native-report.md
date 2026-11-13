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
