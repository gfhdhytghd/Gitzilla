# Repository analysis

```ts
import { analyzeRepo, listFallbackRepos } from './analysis/index.ts';
const profile = await analyzeRepo('https://github.com/facebook/react');
const demoRepos = listFallbackRepos();
```

`analyzeRepo` accepts `owner/name`, GitHub repository URLs, `.git` clone URLs, and GitHub tree/file links. Repo identity and seeds use lowercase `owner/name`. `primaryLanguage` chooses the largest programming-language byte count, ignores markup/styles/data/build files, combines Jupyter Notebook bytes with Python, and uses Shell only when no other programming language is available. The raw `languages` map is preserved. Fresh/stale cache and offline snapshot reads apply the same rule, so old CSS-dominated profiles are corrected immediately. Malformed inputs reject with a helpful error; any well-formed repo returns a profile, including offline or nonexistent repos.

The live path downloads `https://codeload.github.com/<slug>/tar.gz/HEAD`, incrementally decompresses/parses tar in memory, and requests GitHub REST repo metadata, language bytes, and approximate commit/contributor counts (`per_page=1` with the `Link` last-page number). `GITHUB_TOKEN` is optional and is sent only to `api.github.com`. API metadata failures do not discard a successful source analysis; unavailable metadata is zero/unknown and languages are measured from retained source.

Public requests have a 12-second network deadline. Concurrent requests for the same normalized repo share one job. Live results are cached for 24 hours in `.cache/analysis/<owner>/<repo>.json`; stale real cache is used if refresh fails. If neither source nor cache is available, famous repos use `data/fallback/*.json`. Unknown repos receive a deterministic synthetic creature with a clearly labeled description and zero GitHub metadata. All offline responses set `fallback: true`, are held in memory for only 60 seconds, and are not persisted over live results. Returned objects are independent copies.

## Graph and sampling conventions

- Limits: 40 MiB compressed download, 40 MiB expanded tar, 20,000 retained files, and 1 MiB per individual file. Expanded-byte/file-count limits stop extraction at complete files, so large-repo profiles are **prefix samples**, not whole-repo totals. Download, stream, gzip, and tar failures use the offline path. Archives never extract to disk.
- Dependency, vendored, generated/minified, binary, and build output files are skipped. `totalFiles` counts supported source files, not every tracked asset. LOC counts nonblank source lines, including comments. `testRatio` uses test directories and common test/spec filename conventions. Go/Rust/JS manifests are kept for resolution but not counted as source.
- Regex-based imports: JS/TS imports/requires/export-from/dynamic imports, workspace package names and simple tsconfig paths; Python absolute/relative imports; Go module paths and blocks; Rust mod/use, crate/self/super and workspace crate names; Java/Kotlin package imports; C/C++ quoted includes; Ruby requires; C# namespace usings. Unresolved external or dynamic imports are omitted. This is best-effort source inspection, without compilers or package installation.
- Components start as top-level directories (`root` for root files). A dominant production directory is split one level deeper. Tests/examples are included in totals but do not determine which production directory expands. Keep the seven largest components plus `misc` when there are more than eight. Components are sorted by LOC; edges are unique directed pairs, without self-edges.
- The heart is the file with the most distinct importing files, with path-based tie breaking. Component fan-in/out count distinct neighboring components. Cycles are component SCCs with more than one member. `maxDepth` is the longest chain **in edges** after SCC condensation. Seeds are unsigned 32-bit FNV-1a hashes of normalized slugs.

## Regenerate demo snapshots

```sh
npx tsx analysis/precompute.ts
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
