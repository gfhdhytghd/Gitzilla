# Teacher rubrics

No LLM, credentials, network calls, or new npm dependencies. `index.ts` is browser-safe so the teacher preview, student lobby, and server feedback use the same scoring functions. `pdf.ts` is a separate Node-only adapter.

```ts
import { parseRubric, defaultRubric, scoreRepo, weightedScore, buildFeedback } from '../rubric/index.ts';
import { extractRubricText } from '../rubric/pdf.ts'; // server only

const rubric = parseRubric(await extractRubricText(bytes, filename, contentType), filename);
// Keep rubric.unparsed visible for teacher review; do not silently use the default
// when a document has no measurable criteria. A room without a document can use:
const effectiveRubric = selectedRubric ?? defaultRubric();
const results = scoreRepo(profile, effectiveRubric);
const previewScore = weightedScore(effectiveRubric, results); // 0..100, one decimal
const feedback = buildFeedback(profile, effectiveRubric, results, {
  playerId: student.id, name: student.name, rank, kos, damage, roundWins,
}, '2 of 3 quiz answers correct'); // optional string; never affects rubric score
```

`parseRubric(text, filename?)` supports plain text, Markdown bullets/numbered lists, headings with requirement paragraphs, and tables with Criterion / Weight / optional Target / Requirement columns. Weights in parentheses or labelled `pts`/`points` are normalized; table weights can be bare numbers. A percentage inside a requirement is its target, such as `Testing (30%): at least 20% test files`. Criteria without weights get relative weight 1. IDs are stable for the same document (`criterion-1`, etc.); the client should preserve them when editing.

Measured targets: tests/typing/comment ratio use 0..1; README uses analyzed characters; size uses LOC; function length uses lines; modularity uses mean fan-out (or dependency depth if explicitly requested); cohesion uses definitions/file; cycles use count; debt uses count or markers/kLOC when the document says density/per kLOC. Zero upper targets are valid. Minimum signals scale up to their target, upper-bound signals scale down above their target. Zero upper bounds use `1 / (1 + measuredValue)` when not met. Custom checks are binary: `must contain a tests/ folder`, `must not contain a node_modules/ folder`, `no file over 300 lines`, `at least 10 commits`, `written in Python`. Paths can include simple `*` globs and are checked within sampled paths.

`scoreRepo` returns one `CriterionResult` per criterion. `weightedScore` normalizes edited weights too; zero total weight means equal weights. Missing results count as zero. `buildFeedback` takes the exported `FeedbackMatchStats` (`playerId`, `name`, `rank`, `kos`, `damage`, `roundWins`, optional `quiz`) and returns exactly shared `StudentFeedback`. The optional fifth `quiz` string overrides `matchStats.quiz`. It returns 1–3 strengths and 1–3 concrete next steps, with repo-relative `file` paths suitable for GitHub links. A score is based only on source measurements; fights and quizzes are reported separately.

Evidence limits are explicit in the UI strings: test-file ratio is not execution or coverage, CI presence is not a passing pipeline, README length is a bounded excerpt, paths are sampled, commits are approximate, TODOs are not proven defects. Missing measurements receive a labelled neutral 0.5 with a review tip. In particular, TypeScript bytes do not prove type-hint coverage, zero commits means unknown in the analyzer contract, and total LOC / definitions is not substituted for measured function spans. The optional structural analyzer fields `dna.avgFunctionLength` and `dna.hasTestDir` are used where present. `dna.typingRatio` (0..1) can be supplied by a future analyzer; current profiles explicitly report it unavailable.

PDF extraction streams bytes to system `pdftotext -layout - -`. This host has `/usr/bin/pdftotext`; other deployments need Poppler. PDFs without selectable text, invalid PDFs, or missing tools return actionable `.md`/`.txt`/paste guidance. The adapter does not write uploads to disk. HTTP limits, room-owner authorization, privacy/recipient filtering, persistence, and CSV/Markdown exports belong to `server/`.

Validation: `npx vitest run rubric` and `npx tsc --noEmit -p rubric/tsconfig.json`. The root tsconfig discovers this module when consumers import it; its standalone config also checks tests before integration. Three realistic fixtures run against every bundled `data/fallback` profile. PDF tests use real small PDFs and skip extraction cases only if Poppler is absent.
