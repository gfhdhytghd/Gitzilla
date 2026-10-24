# Repository analysis

```ts
import { analyzeRepo, listFallbackRepos } from './analysis/index.ts';
const profile = await analyzeRepo('https://github.com/facebook/react');
// A request-scoped token can also analyze private repositories:
const privateProfile = await analyzeRepo('your-org/private-repo', { token: githubToken });
const demoRepos = listFallbackRepos();
```

`analyzeRepo` accepts `owner/name`, GitHub repository URLs, `.git` clone URLs, and GitHub tree/file links. Repo identity and seeds use lowercase `owner/name`. `primaryLanguage` chooses the largest programming-language byte count, ignores markup/styles/data/build files, combines Jupyter Notebook bytes with Python, and uses Shell only when no other programming language is available. The raw `languages` map is preserved. Fresh/stale cache and offline snapshot reads apply the same rule, so old CSS-dominated profiles are corrected immediately. Malformed inputs reject with a helpful error; any well-formed repo returns a profile, including offline or nonexistent repos.

The anonymous live path downloads `https://codeload.github.com/<slug>/tar.gz/HEAD`, incrementally decompresses/parses tar in memory, and requests GitHub REST repo metadata, language bytes, and approximate commit/contributor counts (`per_page=1` with the `Link` last-page number). Pass `analyzeRepo(slugOrUrl, { token })` for request-scoped authentication; it overrides the optional `GITHUB_TOKEN` environment default. Authenticated downloads use `https://api.github.com/repos/<slug>/tarball` with `Authorization: Bearer ...`, allowing GitHub to issue a private archive redirect. The token is attached only to GitHub API requests. An explicit empty token selects anonymous mode even when the env default exists. API metadata failures do not discard a successful source analysis; unavailable metadata is zero/unknown and languages are measured from retained source.

Requests have a 12-second network deadline. Concurrent requests share one job only when both the normalized repo and credential match. Anonymous live results are cached for 24 hours in `.cache/analysis/<owner>/<repo>.json`; stale real cache is used if refresh fails. Authenticated analyses **never read or write disk cache**, including when using the environment token. Their memory cache and in-flight jobs are keyed by slug plus SHA-256(token), separately from anonymous results and other tokens. Raw tokens are not persisted in profiles or cache keys. If neither source nor cache is available, famous repos use `data/fallback/*.json`. Unknown repos receive a deterministic synthetic creature with a clearly labeled description and zero GitHub metadata. All offline responses set `fallback: true`, are held in memory for only 60 seconds, and are not persisted over live results. Returned objects are independent copies.

## Graph and sampling conventions

- Limits: 40 MiB compressed download, 40 MiB expanded tar, 20,000 retained files, and 1 MiB per individual file. Expanded-byte/file-count limits stop extraction at complete files, so large-repo profiles are **prefix samples**, not whole-repo totals. Download, stream, gzip, and tar failures use the offline path. Archives never extract to disk.
- Dependency, vendored, generated/minified, binary, and build output files are skipped. `totalFiles` counts supported source files, not every tracked asset. LOC counts nonblank source lines, including comments. `testRatio` uses test directories and common test/spec filename conventions. Go/Rust/JS manifests are kept for resolution but not counted as source.
- Regex-based imports: JS/TS imports/requires/export-from/dynamic imports, workspace package names and simple tsconfig paths; Python absolute/relative imports; Go module paths and blocks; Rust mod/use, crate/self/super and workspace crate names; Java/Kotlin package imports; C/C++ quoted includes; Ruby requires; C# namespace usings. Unresolved external or dynamic imports are omitted. This is best-effort source inspection, without compilers or package installation.
- Components start as top-level directories (`root` for root files). A dominant production directory is split one level deeper. Tests/examples are included in totals but do not determine which production directory expands. Keep the seven largest components plus `misc` when there are more than eight. Components are sorted by LOC; edges are unique directed pairs, without self-edges.
- The heart is the file with the most distinct importing files, with path-based tie breaking. Component fan-in/out count distinct neighboring components. Cycles are component SCCs with more than one member. `maxDepth` is the longest chain **in edges** after SCC condensation. Seeds are unsigned 32-bit FNV-1a hashes of normalized slugs.

## Regenerate demo snapshots

```sh
GITHUB_TOKEN="$(gh auth token)" npx tsx analysis/precompute.ts
# Or selected repos:
npx tsx analysis/precompute.ts facebook/react pallets/flask
```

The generator downloads real source with two workers, allows 60 seconds per repo, and writes 15 famous snapshots covering JS/TS, Python, Rust, Go, C, and a JVM project. It never writes synthetic replacements. When metadata is temporarily unavailable, regeneration preserves any existing snapshot's metadata rather than erasing it. Source-derived fields are always recomputed. The committed snapshots were fetched on 2026-10-24; GitHub metadata and HEAD will change over time. Large repos including React, Django, and Redis can hit the archive sampling cap.

```sh
npx vitest run analysis
npm run typecheck
npm test
```

Tests use tiny in-memory archives and source fixtures, mocked HTTP, and the checked-in snapshots; no network is needed for the test suite.

## Art-director context

Every new analysis also includes `readme` and `tree` for the optional Gemini design step. A root `README.md` (or README/rst/txt variant) is retained separately from source counting. Badges, Markdown/HTML images, HTML decoration, comments, and link destinations are removed; the cleaned excerpt is at most 4 KiB UTF-8 and never splits a multibyte character. Missing/unavailable README text is an empty string.

`tree` contains at most 120 unique notable retained paths: up to 40 directories, root README/manifests, the graph heart, then a mixture of the largest and most-imported source files. Directory paths end with `/`. This is design context from the same bounded archive sample, rather than an exhaustive repository file listing. README text and path context do not change source totals, gameplay stats, or seeds.

Pre-context disk cache entries are refreshed on the next request even inside the normal 24-hour TTL; if the network is unavailable, their real cached stats remain usable with empty README and the known heart path. Famous offline snapshots include the complete context excerpt/list from regeneration. Synthetic offline profiles have empty README and explicitly synthetic paths.

## Real-code DNA (round 2)

Every analyzed profile includes a complete `dna` object. It is cosmetic input for kits, renderers, and optional art direction; analysis never changes stat budgets.

- Up to 24 actual function/type identifiers ranked by definition count × reference uses. String/comment contents are masked before reference counting. `componentSymbols` maps each final component name (including `misc`) to up to four preferred exported/defined symbols.
- Up to 12 characteristic nonblank, non-import heart lines (40 characters each), and 12 source snippets (48 characters) mixing function signatures, the longest eligible line, and a deepest-nesting line. Snippets retain their source path and **1-based** line number. All excerpts are verbatim trimmed prefixes, without generated ellipses or rewritten code. When the structural heart has fewer than six meaningful lines (often a barrel/re-export), text instead comes from the most-imported non-barrel implementation, or the biggest suitable file in the heart component. The structural heart is unchanged, and a snippet pins the alternate source path and line. Multiline import/export continuations are excluded. Tiny/source-free repos may still have fewer lines.
- Up to 12 real comment excerpts (60 characters): TODO/FIXME/HACK/XXX first, then NOTE/BUG/OPTIMIZE/TBD comments to fill unused slots. Python docstrings and CSS/HTML comments also participate. Assigned string literals do not. The todo/fixme/hack counters still count their literal markers only, up to 10 commit subjects (100 characters), and 12 most-frequent actual language keywords/operators. Commit count and subjects share **one** `/commits?per_page=10` request; Link last-page × page-size estimates the total (up to nine above the exact count). Failed commit requests produce an empty subject list.
- The eight largest retained files by nonblank LOC; longest recognized function's name/path/source-line span; function/type/comment/TODO counts; maximum brace/indent nesting; average nonblank programming-source line length (one decimal); tabs/2-space/4-space/mixed indentation. Structs, interfaces, traits and enums count as class-like types; `hack` counts both HACK and XXX markers. These are fast regex/lexical estimates, without compiler-grade scope resolution.
- Excerpts and displayed identifiers drop complete original lines matching credential/key/token/password/secret patterns, known credential prefixes, or long hex/base64 sequences **before** truncation. Multiline strings and comments are masked for definitions/nesting, including Rust raw strings and Java/Kotlin text blocks. Source-free synthetic profiles have an explicitly empty DNA object, not invented code.

Pre-DNA public disk caches trigger refresh. If source is unavailable, stale structural stats still work with empty DNA. Famous offline snapshots include their real sampled-source DNA. Authenticated source/DNA stays in credential-isolated memory, with no disk cache, logging, Gemini or Hall writes in this module. The caller/server must preserve its private-repo provenance when deciding whether to invoke Gemini or expose/persist data outside the room. Hall's narrow result projection never serializes DNA/code even if extra properties are passed in.

`analysis/precompute.ts` uses `GITHUB_TOKEN` when supplied so public snapshot metadata does not hit the anonymous GitHub limit. Load it into the command environment with `GITHUB_TOKEN="$(gh auth token)"`; never save the credential. Authenticated precompute requires GitHub metadata explicitly confirming `private: false` before downloading/writing an archive. Private or unknown visibility fails closed. Without a token, anonymous codeload still works best effort. Runtime metadata continues to be best effort, and runtime authenticated analyses never write disk cache. The generator never writes synthetic or private-source profiles into public snapshots. The fifteen round-2b snapshots total roughly 223 KiB, each below 20 KiB (pretty JSON including README/tree/DNA).

## Genesis progress callbacks

```ts
import type { GenesisProgress } from './shared/types.ts';
await analyzeRepo('owner/repo', {
  token: githubToken, // optional, same credential/cache rules as above
  onProgress(progress: GenesisProgress) {
    // Forward this request's progress to its room.
  },
});
```

Analysis emits `clone → parse → graph → dna`. Percentages refer to the **whole** Genesis pipeline: clone 0–0.35, parse 0.40, graph 0.55, DNA 0.60–0.70. The kit/design/server owners emit map/design/ready afterward. Clone percentages before completion estimate progress against the bounded archive budget; file counts and paths are actual retained source/metadata members.

Clone path batches are produced during tar extraction, contain at most 8 paths, and stream at most once per 125 ms, with a final flush even for tiny/fast archives. There is no background interval, artificial delay, or unbounded path queue. Parsing, component graph assembly, and DNA emit at the corresponding real work boundaries.

Fresh memory/disk cache and famous offline snapshots replay a quick sequence using their real profile paths/metrics. Unknown synthetic fallbacks emit empty path batches and explicitly say source/code is unavailable. Replay does not invent file evidence. Network transports should preserve stage changes or use the ready Genesis data to replay the full cinematic when cached stages arrive in one turn.

Coalesced requests share work only within the same credential scope. Each caller has its own progress observer, late joiners immediately get the latest update, and observer arguments are detached. Observer throws/async rejections cannot change the analysis result or other observers; subscriptions are removed when calls settle. Progress is not persisted in profile/cache data and includes no token, source bodies, commit contents or DNA snippets. Real paths from private repos are only delivered to that request's callback; the server still owns room/privacy filtering and broadcast throttling.

## Classroom PvP quality signals

Education mode is classroom PvP with no boss; the simulation owns grades/stat ranges. Analysis provides measurements, not grades. `qualitySignalsFromProfile(profile)` from `analysis/quality.ts` exposes comment ratio, cleaned README length/presence, functions per retained file, actual mean recognized function span, test-directory presence, and literal tech-debt count/density. The denominator for debt density is LOC (multiply by 1000 for per-kLOC). NOTE/BUG documentation is not counted as TODO/FIXME/HACK debt.

DNA includes `avgFunctionLength` and `hasTestDir` through the local typed `AnalyzedDNA` extension while the coordinator merges their optional shared declarations. Mean span includes every recognized function's source-line span, including nested functions and functions whose sensitive names are not displayed. Test-directory presence means supported source under test/tests/spec/specs/__tests__, not just a filename containing `.test`. Existing testRatio still captures flat test files. README length is the cleaned, bounded excerpt's character length. Comment counts exclude blank documentation lines. Older missing function-length measurements remain unknown, not substituted with longestFunction; pre-quality disk caches trigger refresh.

Hall's battle leaderboard ignores `mode: "edu"` and null-boss autopsies before any disk IO. Classroom ranking/report cards stay with the classroom flow.

## Real maintenance and contribution issues

GitHub enrichment runs best effort after source analysis, within the same deadline. Up to eight real component histories request `commits?path=...&per_page=100`; root uses repository-root history and virtual merged `misc` is omitted. `maintainers` is the number of distinct observed human authors in this **recent path sample**, not proof of lifetime/current staffing. `topMaintainers` contains at most three real GitHub logins. Automation is excluded; unlinked authors count through their commit identity, but emails/names are not published.

Repo `busFactor` is distinct from maintainer count: it is the fewest human contributors accounting for strictly more than half of GitHub's contribution totals. It is published only when a complete contributor list is available. Runtime checks one 100-row page and omits busFactor if further pages exist; public precompute can read the complete list up to 50 pages, five requests at a time. Missing pages/rate limits produce no bus-factor claim.

Two open-issue queries cover the actual `good first issue` and `help wanted` labels. Pull requests/closed issues are excluded. Titles, bodies and labels route exact component paths or clear component names; the body is used transiently and is not retained. Each component has at most 3 real issues; up to 10 unmatched issues go into repoIssues. Only actual GitHub issue URLs are returned. Missing/rate-limited data stays absent; there are no synthetic authors, issue numbers, or adoption links.

## Public dependency advisories (stretch)

Dependency declarations are read from package.json, requirements files, pyproject.toml, Cargo.toml/Cargo.lock, go.mod and pom.xml. Only exact/pinned versions are queried; ranges, local/git replacements and unresolved managed versions are skipped. Cargo bare semver requirements are ranges, so exact Cargo manifest constraints require `=`; registry lockfile versions also qualify. No packages/scripts are executed or installed.

The read-only [OSV batch API](https://google.github.io/osv.dev/post-v1-querybatch/) checks at most 100 declarations. Matching public IDs are enriched via the [advisory API](https://google.github.io/osv.dev/get-v1-vulns/) and capped at 12 records with actual summaries/fixed versions when available. Manifest path maps to a known component; root/global manifests may remain repo-wide. These are advisory matches for **declared pinned versions**, including development dependencies; this does not prove an installed artifact or exploitability, and it does not audit unpinned/transitive dependencies beyond retained lockfile entries.

OSV receives package/ecosystem/version only, never GitHub Authorization, source bodies, paths, README, or DNA. Private/unknown-visibility credentialed source is never queried. Anonymous public source or authenticated metadata explicitly confirming public visibility can use OSV. `vulns: []` means the checked declarations returned no matches; absence means unavailable/no exact declarations/not checked, not a clean security bill. No active scanning or attacks occur.
