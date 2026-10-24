DONE

# codex-repo — repository analysis

Completed 2026-10-24, 14:28 local. The analysis task card is complete. No git commits, shared-contract edits, new dependencies, or edits to other agents' implementation directories.

## Delivered
- Public `analysis/index.ts`: `analyzeRepo(slugOrUrl): Promise<RepoProfile>` and `listFallbackRepos(): string[]`.
- Accept owner/name, GitHub URLs, `.git` clone URLs, and tree/file URLs; normalize case for stable identity and unsigned FNV-1a seeds. Garbage rejects; well-formed unavailable repos return a deterministic offline result.
- Optional `GITHUB_TOKEN` GitHub REST metadata/languages, and approximate contributor/commit counts using `per_page=1` + Link last-page index. Token is only sent to GitHub API, not codeload.
- Incremental in-memory gzip/tar extraction, including PAX and GNU long names, without archive writes to disk. Skip binary/vendor/dependency/build/generated/minified files; caps: 40 MiB compressed, 40 MiB expanded, 20k retained files, 1 MiB/file.
- Regex-based internal import graphs for JS/TS, Python, Go, Rust, Java/Kotlin, C/C++, Ruby, C#. Includes JS workspace/tsconfig aliases and Rust workspace-crate resolution.
- Components: top-level directories, dominant source tree split one level deeper, up to 8 including merged misc. File fan-in heart; component edges/degrees; Tarjan SCCs; longest condensed-DAG chain; language bytes, nonblank LOC, test ratio.
- 12-second network deadline; concurrent job de-duplication; independent returned objects; 24-hour `.cache/analysis/<owner>/<repo>.json` live cache. Stale real cache, famous snapshots, then clearly labeled synthetic fallback. Offline responses carry `fallback: true` and retry after 60 seconds.
- `analysis/precompute.ts`: regenerates real snapshots with two workers, 60s per repo, no synthetic replacements. Preserves previously known metadata if a regeneration API request is temporarily unavailable.
- **15 real, source-derived snapshots** under `data/fallback/`: React, Vue, Express, Flask, FastAPI, Django, rustlings, ripgrep, golang/example, Gin, Redis, Lodash, Spring Petclinic, jQuery, nanoGPT.
- `analysis/README.md`: usage, regeneration, exact graph/sampling/cache conventions, and limitations.
- 32 focused tests using tiny in-memory multi-language fixtures, tar/gzip streams, mocked GitHub/timeouts, cache/in-flight/offline flows, and all 15 snapshot invariants.

## Validation
- `npx vitest run analysis`: **32/32 PASS**, five test files.
- Latest `npm test`: **89/89 PASS**, 11 workspace test files.
- Owned-module strict TypeScript check (`analysis/*.ts` plus `shared/types.ts`, with workspace-equivalent compiler options): PASS.
- `npm run typecheck`: passed earlier; latest workspace run is temporarily blocked only by teammate-owned missing `client/app/{autopsy,game,lobby}.ts` imports while UI is being written. No analysis errors. Leave those files to UI owner.
- Live `GET http://127.0.0.1:5173/api/fallbacks`: returns all 15 slugs.
- `npx tsx server/smoke.ts` against the already-running teammate dev server: PASS, four clients, 100 snapshots each over five seconds, QR/fallback endpoints OK. Did not restart or stop that server.
- Direct public API run for golang/example: 44 source files / 8 components, `fallback: false`, first call 243 ms, same-process memory hit <1 ms, fresh-process disk hit 1 ms; stable seed.
- Source snapshots generated successfully with real GitHub codeload downloads. React: 8 components / 21 edges / 2 SCC cycles. Django: 8 / 40 / 1. Ripgrep: 8 components / 8 edges.

## Limits / handoff
- Large-repo totals and graphs can be **complete-file prefix samples** due to the 40 MiB expanded-archive limit; this is documented, not claimed to be full-repository analysis. Regex resolution is best effort; unresolved/dynamic/external imports are omitted.
- Metadata is best effort and can remain zero when REST is rate limited even if codeload source succeeds. nanoGPT's first snapshot had unavailable API metadata; its graph is real.
- Existing `.cache` gitignore is already present. Cache files are runtime artifacts and need not be committed.
- Shared additions `BossKit.heart` and `BossState.regions` do not change analysis's `RepoProfile`; analysis already returns the real heart path.

## Contract requests
- None.

## Remaining
- None for codex-repo. Coordinator can commit the owned deliverables and rerun full typecheck once UI files land.
