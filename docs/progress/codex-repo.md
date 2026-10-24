DONE (round 2)

Round 2 summary: real-source CodeDNA is implemented and all 15 public snapshots are regenerated. Analysis/Hall tests 76/76 PASS; workspace typecheck PASS. The two current full-suite failures belong to design asset regeneration and input signed-zero handling; see the final handoff below. Privacy isolation and existing Hall/token behavior are preserved.

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


## Follow-up scope
- User assigned `hall/` in addition to existing analysis/fallback ownership.
- Filter markup/style/data/build languages from primary language; map notebooks to Python; use Shell only when no programming language is available. Correct cached results as well as live/snapshot profiles.
- Build synchronous `recordMatch` / `top` with atomic `.cache/hall.json` persistence, 20-entry boards, Vitest tests, and exact codex-net wiring handoff.
- No server/shared/root-config edits, commits, or new dependencies.

## Follow-up delivered
- `selectPrimaryLanguage` ignores style/markup/data/build languages, aggregates Notebook + Python bytes as Python, and only selects Shell if no other programming language exists. Raw language byte maps remain intact.
- Applies to live analysis, fresh/stale disk cache reads, and famous offline profiles. Old cached CSS profiles no longer need deleting.
- Regenerated the only affected famous snapshot: **spring-projects/spring-petclinic → Java** (CSS 278931 bytes, Java 141217 bytes). Other 14 snapshot primary languages already meet the new policy.
- Added `hall/index.ts`, `hall/index.test.ts`, `hall/README.md`; no deps or server/shared edits.
- Hall uses synchronous IO and same-directory unique-temp-file atomic rename to `.cache/hall.json`, loads across restarts, and returns all three boards capped at 20. Fastest kills are victories only; top damage is single-player/single-match damage across wins and losses; boss counts are team wins/losses, sorted by most encounters then wins/name.
- Hall retains lifetime counts for bosses outside the public top 20. Stored score entries retain the source room; the public `top()` output exactly omits room and uses ISO UTC timestamps.
- Rematches in the same room count independently. Call once per completed match; duplicate submission detection is not provided by the current Autopsy contract.
- Analysis + Hall focused suite: **46/46 PASS** (38 analysis + 8 Hall). Hall tests include restart persistence, rematches, ranking/caps, loss behavior, detached reads, and failed atomic rename preserving the previous file.

## Handoff to codex-net

The module is ready. No shared contract changes are needed. `top()` and `recordMatch()` are synchronous. The following snippets fit the current `server/main.ts` HTTP handler and `server/rooms.ts` completion branch.

### HTTP: GET and POST /api/hall

Add imports to `server/main.ts`:

```ts
import type { Autopsy } from '../shared/types.ts';
import { recordMatch, top } from '../hall/index.ts';
```

Insert these branches before the generic `url.pathname.startsWith('/api/')` 404:

```ts
if (url.pathname === '/api/hall' && req.method === 'GET') {
  json(res, 200, top());
  return;
}
if (url.pathname === '/api/hall' && req.method === 'POST') {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const { autopsy, room, bossRepo } = JSON.parse(
    Buffer.concat(chunks).toString('utf8'),
  ) as { autopsy: Autopsy; room: string; bossRepo: string };
  recordMatch(autopsy, room, bossRepo);
  json(res, 201, top());
  return;
}
```

The requested POST payload on match end is:

```ts
// At the single match-completion uploader; result: Autopsy, roomCode: string.
await fetch('/api/hall', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ autopsy: result, room: roomCode, bossRepo: result.boss.repo }),
});
```

Use that relative URL from browser code; a Node sender must use the actual absolute server URL. One uploader per completed match, rather than one POST from every client's autopsy receipt. Do not repost an autopsy on reconnect.

### Optional authoritative completion hook (alternative to uploading the same match)

For an authoritative server completion path without a loopback HTTP request, add to `GameServices` in `server/rooms.ts`:

```ts
recordMatch?(autopsy: Autopsy, room: string, bossRepo: string): void;
```

Pass the imported function in `server/main.ts`:

```ts
const rooms = new RoomServer(wss, {
  analyzeRepo, listFallbackRepos, playerKitFromProfile,
  bossKitFromProfile, createMatch, recordMatch,
});
```

Immediately after `room.result = match.autopsy()` and the heart-path correction in the existing `if (match.over)` branch:

```ts
try {
  this.services.recordMatch?.(room.result, room.code, room.result.boss.repo);
} catch (error) {
  console.error('Hall persistence failed:', error);
}
```

Choose **one** completion recording path: HTTP POST ingestion or the direct authoritative hook. The GET/POST endpoints can exist with either, but do not additionally POST an already-recorded match. The existing `stopMatch(room)` makes the authoritative completion branch run once per match. Keeping this hook optional preserves current test service fixtures. Catching persistence failure here lets the autopsy still reach players.

`hall/` is not yet named explicitly in tsconfig include, but the server import includes it transitively. I ran an additional explicit strict check of `hall/*.ts` alongside analysis/shared while server wiring is pending. No API wiring or end-to-end Hall HTTP proof is claimed by codex-repo; this handoff is for the server owner.


## Follow-up final validation (14:32 local)
- `npx vitest run analysis hall`: **46/46 PASS**, seven test files.
- Explicit strict typecheck of `analysis/*.ts hall/*.ts shared/types.ts`: PASS after final changes.
- Initial full workspace follow-up test run: 103 PASS / 2 skipped. Latest run after parallel sim changes: 103 PASS / 1 FAIL / 2 skipped. The unrelated failure is `sim/match.test.ts:193`: expected player counts `[1,4,8]`, actual `[1,4,6,8]`. No sim edits made by codex-repo.
- Latest `npm run typecheck`: blocked only by missing teammate-owned `client/app/autopsy.ts`; owned modules pass. No UI/server/sim edits made by codex-repo.
- Snapshot verification: `spring-projects/spring-petclinic` is Java with original raw CSS/Java/HTML/SCSS/Dockerfile byte map preserved.
- No new dependencies, commits, or shared-contract edits. No open contract requests.
- No codex-repo work remains; HTTP ingestion and completion/GET wiring handed to codex-net above.


## Gemini context follow-up
- Coordinator added optional RepoProfile.readme/tree. Read the current shared contract.
- Add a cleaned root README excerpt (up to 4 KiB UTF-8) and up to 120 notable directory/file paths from the retained source graph.
- Regenerate all 15 fallback snapshots, test context extraction/ranking, preserve the completed Hall/language work and existing server handoff.

## Gemini context delivered (14:34 local)
- Added `analysis/context.ts` and fixture tests for root README retention, badge/image cleanup, UTF-8-safe 4 KiB truncation, path ranking/deduplication, and the 120-path cap.
- `RepoProfile.readme`: cleaned root README prose, prefers README.md; supports README/rst/txt variants. No README source available → empty string. README/manifests do not inflate source totals.
- `RepoProfile.tree`: up to 120 notable retained paths including directories (up to 40), root README/manifests, the actual heart, and an interleaved selection of biggest/most-imported source files. Directory paths end in `/`.
- Source-derived gameplay stats and seeds are unchanged by the context fields. Large-repo context has the same bounded-archive sampling limit already documented.
- Old disk caches without context now trigger refresh. Offline stale stats still work; missing README remains empty rather than invented. Synthetic profiles provide empty README and explicitly synthetic component paths.
- Regenerated **all 15** famous snapshots successfully from codeload. Every JSON has nonempty cleaned README (246–4096 UTF-8 bytes) and 21–120 paths. Spring Petclinic still selects Java.
- Gemini consumer: `profile.readme` and `profile.tree` are ready in normal, cached-after-refresh, and precomputed-famous offline results; no further contract requests.
- Analysis + Hall focused tests: **52/52 PASS**, 8 files. Latest full workspace suite: **113 PASS / 2 skipped**, 15 files.
- Explicit strict owned-module typecheck: PASS. Latest global typecheck is blocked only by teammate-owned `client/render/player/sprite.ts:429` (`HeroLook.accessory` missing) during design integration; the earlier UI-import and sim-test issues are resolved. No renderer edits made by codex-repo.
- Hall code and the exact `Handoff to codex-net` above remain ready. No server/shared/design/client changes, dependencies, or commits by codex-repo.
- All assigned work complete.


## Token follow-up scope
- Add `analyzeRepo(slugOrUrl, opts?: { token?: string })`.
- Use the explicit token (over env token) for REST and authenticated API tarball downloads.
- Skip disk cache for all token-authenticated analyses, and partition memory/in-flight jobs by slug + SHA-256 token hash; never persist token strings.
- Keep anonymous codeload + shared public disk caching; add mocked-fetch and isolation tests.


## Optional GitHub token delivered (14:38 local)
- Public signature is now `analyzeRepo(slugOrUrl: string, opts?: { token?: string }): Promise<RepoProfile>`. Existing one-argument callers continue to work.
- Explicit request token overrides `GITHUB_TOKEN`; an explicit empty string opts out of the env default. Normalized effective token is used consistently for request authorization and cache partitioning.
- With a token (explicit or env), both REST and archive requests go to GitHub API with Bearer authorization. Archive URL: `https://api.github.com/repos/<slug>/tarball`; fetch handles GitHub's authorized archive redirect. Anonymous archives retain public codeload.
- Authenticated analyses **skip all disk cache reads/writes**, including shared slug-cache lookup. Memory/in-flight jobs are partitioned by slug + SHA-256(token), so same-token requests deduplicate but anonymous callers/different credentials never reuse private source, README, tree, metadata, or stale results. No raw token is persisted or placed in URLs.
- Added five mocked-fetch integration tests through the real `analyzeRepo` → GitHub → tar/graph path: explicit-vs-env token, API archive/header behavior, identical-token job de-duplication, separate-token/anonymous isolation, public disk-cache bypass, invalid-token fallback isolation, and env/empty-token behavior. No real private-repo credentials used; live private-repo acceptance is not claimed.
- Updated anonymous tests to stub the environment token so test behavior does not depend on the developer's credentials. README documents the new API and cache rules.
- `npx vitest run analysis hall`: **57/57 PASS**, 9 files.
- `npm run typecheck`: **PASS** across the complete current workspace. Explicit strict analysis/Hall/shared check: **PASS**.
- `npm test`: **156 PASS / 2 skipped**, 18 files. Earlier parallel-owner typecheck blockers are resolved in this run.
- No dependencies, shared/server/client/design edits, snapshot changes, or commits for this card. No open contract requests.

### Token handoff to codex-net

```ts
// Existing anonymous/default-token integration remains valid:
await analyzeRepo(slugOrUrl);
// Server-owned per-request GitHub credential:
await analyzeRepo(slugOrUrl, { token: githubToken });
// Explicit anonymous call when the server has a GITHUB_TOKEN default:
await analyzeRepo(slugOrUrl, { token: '' });
```

Server service wrappers can expose the same optional second argument. No changes to shared gameplay/profile contracts are required. The existing Hall HTTP handoff above is unchanged.


## Infrastructure constraint — coordinator update
- Port 5173 is the stable production/live server from `../gitzilla-live`, serving `https://gitzilla.wilflin.me`. Never start, stop, or test against 5173.
- Shared development server: `http://localhost:5175`, tsx watch + Vite HMR, herdr pane `wQ:pT`. Use only this server for development smokes/playtests/screenshots.
- Smoke command: `SMOKE_URL=http://localhost:5175 npx tsx server/smoke.ts`. Playtests: `--base http://localhost:5175` or the corresponding environment setting.
- Only the coordinator deploys to live. Earlier port-5173 evidence in this log predates this infrastructure change and does not authorize future access.
- Recorded this update without contacting, starting, or stopping either server.


## Round 2 — CodeDNA scope
- Read `docs/tasks/round2.md` and current `shared/types.ts`. RepoProfile.dna is currently optional in the shared file; analysis will always produce every CodeDNA field.
- Own analysis/, data/fallback/, hall/ and this progress file; no edits to other agents' code or shared contracts.
- Extract real per-language symbols, safe source excerpts, comment TODOs, keyword/operator frequencies, big files, function/nesting/indent metrics, and recent commit subjects.
- Preserve credential-isolated memory caching and zero authenticated disk writes. Private DNA can return to its caller/room but is never logged, sent to Gemini/Hall, or persisted by analysis.
- Regenerate all 15 public famous snapshots with bounded DNA; tests and current-workspace checks next. Dev only 5175; never access 5173/live.

## Round 2 implementation / validation update
- Added `analysis/dna.ts` with per-language definitions/reference ranking, comment/string masking (including Rust raw strings and Java/Kotlin text blocks), bounded exact source excerpts, TODO labels, lexical tokens/operators, function spans, nesting, indent and file metrics.
- Integrated DNA into `profileFromFiles`; componentSymbols use the final merged component names. Source-free synthetic fallbacks get empty DNA, never invented identifiers/excerpts. Pre-DNA disk caches trigger refresh.
- Replaced the one-item commit request with **one** `/commits?per_page=10` request: up to ten safe first-line subjects plus approximate total from Link page × page size. Contributors still use one-item pagination.
- Source excerpt filtering inspects the full original line before truncation and drops credential/key/token/password/secret patterns, long hex/base64 and known credential prefixes. Sources retain exact file/1-based line; no ellipses or rewritten code.
- Focused analysis + Hall tests: **75/75 PASS**, including eight language fixture variants, nested/multiline functions, false callback-definition prevention, raw strings/comments, bounded excerpts, credential filtering and cached/private DNA isolation. Hall additionally proves extra code/DNA properties never enter its persisted projection.
- All 15 public snapshots were generated once; final regeneration is running after parser-quality fixes found by fixtures. No port 5173 access, live deployment, or cross-owner code edits.

## Round 2 source snapshot / integration update (15:10 local)
- Final source regeneration completed for all 15 public repos using explicitly anonymous downloads. Snapshots total **211,203 bytes** (about 206 KiB), largest 19,585 bytes; every repo has 12 bounded snippets, real identifiers/component symbols, complete metrics and safe excerpt fields.
- Recent-subject requests were rate limited during the final public generation, so these snapshots currently have empty `dna.commits`. This is the required best-effort offline behavior, not invented history; the runtime/mock integration verifies the one-call ten-subject path and approximate count. Existing numeric metadata can still use the previous known snapshot values.
- Current `npm run typecheck`: **PASS**. Explicit strict analysis/Hall/shared check: **PASS**.
- Current full `npm test`: **237 PASS / 1 FAIL / 6 skipped**. The one failure is `design/index.test.ts:183`: checked-in offline art still quotes a recent-commit taunt from an earlier snapshot while the new public DNA commit list is empty. This requires the design owner's asset regeneration after DNA settles. No design files were edited or regenerated by codex-repo.
- Own analysis/Hall focused suite: **75/75 PASS** before the final snapshot consistency expansion; final focused verification next.

## Handoff round 2 — codex-sim / codex-gemini / codex-net
- `profile.dna` is ready on all live analyses and on all 15 fallback profiles. All CodeDNA fields exist even when no source/symbols/heart lines/recent commits are available; those source fields are empty, not fabricated. Consumers still tolerate optional dna on older hand-authored mocks per the shared contract.
- `componentSymbols` keys are the final component names, including the actual merged `misc` component; use them to populate limbSymbols. `snippets[].line` is 1-based; strings are verbatim trimmed prefixes. Import-only hearts legitimately have `heartLines: []`.
- Rebuild `data/design` from the final new `data/fallback` DNA before asserting offline art equality. The current mismatch is the old ripgrep recent-sin commit taunt; generation must tolerate empty recent commits when API rate limited.
- Private/credentialed profiles may feed the room's kits but **must not feed Gemini, public Hall payloads/logs or persistence**. Analysis already skips all authenticated disk cache IO and partitions memory/in-flight jobs by token hash. It does not invoke Gemini/Hall or log source. The server must carry request credential/privacy provenance through the art-direction branch; do not infer public safety from slug alone.
- Public snapshot regeneration is anonymous-only; no credentialed source is written by the generator. No shared contract requests.

## Round 2 final result (15:15 local)
- All analysis-owned round-2 requirements are complete. Final parser includes next-line C/C++/Java/C# braces, scoped C++ methods, multiline Python signatures, callback false-positive prevention, raw/text-block string masking, and full-line credential filtering including snake_case/camelCase key/token fields and Authorization/Bearer headers.
- Regenerated all 15 public fallback profiles after the final parser/filter changes. Total **211,211 bytes**; largest **19,585 bytes**. All have complete CodeDNA and 12 real snippets. Public GitHub commit API currently returns **403 / x-ratelimit-remaining: 0** (verified), so their recent-subject arrays are empty as specified for unavailable metadata.
- Compared all 15 snapshots to HEAD: **no changes** in totalFiles, totalLoc, components, heart/fan-in, edges, cycles, maxDepth, testRatio, seed, or primaryLanguage. DNA additions do not alter the structural/balance inputs.
- Direct uncached `analyzeGitHubRepo('facebook/react', { token: '' })`: **8,426 ms**, 4,227 retained source files, 24 identifiers, 12 snippets, 23,394 recognized function definitions. This downloaded and analyzed public source rather than reading cache. A separate public cache smoke also returned complete DNA.
- Final `npx vitest run analysis hall`: **76/76 PASS**, 10 files (67 analysis / 9 Hall).
- Final `npm run typecheck`: **PASS** across the workspace. Owned strict typecheck also passed.
- Latest `npm test`: **253 PASS / 2 FAIL / 6 skipped**, 29 files. Both failures are outside ownership:
  - `design/index.test.ts:184`: offline boss name/manifest source mismatch (`RIPGREP, THE UNMERGED` vs `RIPGREP, GUARDIAN OF LOST DIRS`) while the design owner updates/regenerates assets. Regenerate art against the now-final DNA snapshots.
  - `client/input/gestures.test.ts:79`: platform gravity-sign equality compares positive zero with negative zero. Input owner should normalize the zero or adjust the numeric assertion.
- `git diff --check` on owned tracked paths: PASS. No git commits, dependency changes, shared/server/sim/client/design edits, live deployments, or port-5173 access by codex-repo.
- `analysis/README.md` documents DNA extraction/safety/limits, one-call recent commits, empty source-free DNA, privacy boundaries, and anonymous-only public snapshot generation. No open contract requests or remaining codex-repo implementation work.

DONE (round 2)
