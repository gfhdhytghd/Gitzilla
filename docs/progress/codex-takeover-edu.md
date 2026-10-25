DONE — take-edu completed `client/edu/` takeover; runtime re-frozen after authorized teacher-export delta at 2026-10-24 21:26:01 UTC (17:26:01 local). No commits/push/deploy.

**UI ownership returned to Claude coordinator.** No further edits by this agent to `client/app/`, `client/edu/`, `client/render/`, or `client/genesis/`. Current `git status --short` for those directories is clean; **no remaining uncommitted UI work to hand off** (including no untracked files under `client/edu/`). Earlier delivered changes and verification are documented below; this agent made no commits itself.

Read `/tmp/herdr-codex-takeover-20261024/edu-TASK.md`, `edu-terminal.txt`, `edu-source.json`, BRIEF, edu/rubric cards, claude-edu and codex-rubric progress. Preserve the shared dirty workspace. No commit/push/deploy, shared service restarts, or edits to `client/app/`, `client/style.css`, server, sim, or shared contracts.

## Authorized freeze exception — teacher projector exports (latest stage B delta)
- Real end-to-end owner flow uses `?screen=1`; hiding export controls solely by screen variant blocked the teacher's normal export flow despite receiving class feedback.
- Runtime change **only `client/edu/feedback-view.ts`**: `createClassFeedback` accepts `canExport?: boolean`. Explicit true shows CSV/Markdown in any variant, explicit false hides them in any variant. Omitted preserves existing roomless/demo projector defaults (screen hidden, phone/desktop visible). Caller passes **`canExport: isOwner(app)`**; HTTP still enforces current-owner room-token authorization. Take-ui owns app wiring; no app/server edit here.
- Added `client/edu/export-browser-check.ts`: **9 render combinations PASS** (3 layouts × undefined/false/true), teacher screen CSV and Markdown actual browser downloads PASS with X-Room-Token, 403 denial is visible and produces no local fallback download, zero browser JS errors. HTTP responses are a protected Playwright fixture; this is focused component/render/download acceptance, not a new live-match server claim.
- `npx vitest run client/edu/rubric-equality.test.ts client/edu/transport.test.ts client/edu/rubric.test.ts`: **32 PASS / 3 files**. `npm run typecheck`: **PASS**. Whitespace check PASS.
- Visually verified 1920x1080 teacher-screen buttons. Artifacts: `/tmp/gitzilla-edu-takeover-20261024/teacher-export/export-report.json`, `teacher-screen-exports.png`, `teacher-screen-export-denied.png`.
- Re-frozen **21:26:01 UTC**. Runtime `feedback-view.ts` SHA256 `b570f72527234f1e6b95fb33429087002576abe6c600a8c747579463fbaadbe3`; focused checker SHA256 `9babd07b729b1cfcdfd05a9dfe809313bbf70bbe6267e30bf4aff06d3f221a56`. Earlier semantic-ACK fix stays intact; no unrelated runtime changes, server/app edits, commit or deployment.

## Authorized freeze exception — semantic server ACK equality (stage B delta)
- Take-ui's real UI validation found the earlier clone-based regression retained property order and missed the actual server normalizer's reconstruction. Stage A on 45093 retains that known cosmetic ACK-button issue; its long/QA acceptance can continue, but final stage B must include this delta.
- Runtime change **only `client/edu/rubric.ts`**: `same()` uses explicit canonical contract values. Compare title/source, ordered criteria with id/name/description/signal/normalized weight/check kind+value/target, and ordered unparsed lines. Object insertion order is irrelevant; criteria are never sorted. Server-trimmed title/name and missing/empty unparsed lists normalize consistently. Zero targets and real unsaved changes remain distinct.
- Regression changes: new `client/edu/rubric-equality.test.ts` imports the actual read-only `server/rubrics.ts::normalizeRubric`; asserts the rubric/criterion/check property orders genuinely differ, then tests semantic equality, relative weight scaling, optional fields, all contract-field edits, criterion order and unparsed order. `client/edu/browser-check.ts` now passes applied rubrics through the actual Node normalizer via a test-only Playwright route instead of cloning and scaling locally.
- Focused command `npx vitest run client/edu/rubric-equality.test.ts client/edu/transport.test.ts client/edu/rubric.test.ts`: **32 PASS / 3 files** (15 new equality cases). `npm run typecheck`: **PASS**. Diff whitespace check **PASS**.
- Browser regression **PASS** with real normalizer ACKs: weight/signal/target edits all remain source doc, alter actual sim stats, and mark the ACK disabled/in-use; reset stays default and preserves stats. Existing exact preview/feedback 90.8, table alignment, keyboard/sort/download checks also PASS with zero JS errors. New artifacts: `/tmp/gitzilla-edu-takeover-20261024/semantic-ack/browser-report.json` and 13 screenshots. This is actual normalizer + DOM regression, not a claim of a new whole-game WS production acceptance run.
- Runtime fingerprint `client/edu/rubric.ts`: `2ff3e14149a70bfd22aff7b835047d4cecca55fe26123cb94e292a8b73f74608`. Browser checker: `df9268d26ac1022260207968587933b8ec5381d0fa8a90f3121c008b6d3421c4`. Equality test: `2f677180813fbf7423453a17e868514f50c4bd6eabdb93f97ddf163642fe6ae1`.
- No server/app/style/shared/sim edits, no production or shared-server interaction. Re-frozen 21:21:59 UTC for lead's stage B snapshot.

## Delivered fixes
- Demo rubric parsing and feedback now use real `rubric/{parseRubric,scoreRepo,buildFeedback}` with bundled source profiles. Scripted combat/quiz numbers are explicitly labelled demo data. Removed the separate demo parser, invented "checked by teacher" evidence and grade-based final scoring.
- The client default is now the exact engine default. Editor expands normalized fractions to relative points; a 25% rule starts at 25, not zero. Equality normalizes both sides, so server ACK with fractional weights still shows "in use". Applying does not falsely claim ACK before `setCurrent` arrives.
- **Teacher edits to weight/signal/target/name/title/add/remove mark source `doc`**; reset restores source `default`. Actual DOM events were passed through scoreRepo + real qualityFromRubric: all three stat-affecting edits change game stats; reset preserves default stats exactly. This fixes the source-default early-return bug identified in review.
- `createJudgedCard` uses `rubricPreview` whenever present, with the engine's exact one-decimal weighted score. Absence is explicitly labelled `/100 est.`; partial/missing measured rows are not renormalized into inflated exact scores. Real preview and feedback both show **90.8** in the regression.
- New `transport.ts`: raw POST body + `?room=&filename=`, preferred `X-Room-Token` header, PDF MIME detection, readable server errors. Room upload/authorization failures never silently fall back to local parsing. Standalone demo text preview can still parse locally.
- Teacher server exports accept `token` and use fetch + header + blob download. 401/403/404 errors are visible and do not silently export a different local data set. No token query strings. Local CSV/MD remains available for the roomless demo.
- Actual screenshot fixes: mobile editor title/source wrapping and width bounds; decimal scores fit the segmented ring; class-table header and every row share a width, fixing incorrect-looking score columns; phone table has a swipe/sort hint; phone ranking headers no longer overlap. Class drill-down works with Enter/Space, and rows expose aria-expanded.

## Coordination
- Notified `take-lead`, `take-ui`, `codex-net` using Herdr explicit agent targets. No duplicate delegation.
- Coordinator approved `LobbyPlayer.rubricPreview?: CriterionResult[]`; codex-net now emits exact current-rubric/default results only for ready edu lobby profiles, omits pending/outside lobby, strips previews from persistence, and broadcasts no raw RepoProfile. Only a CriterionResult[] is needed by this UI.
- codex-net final evidence (received 17:17): dedicated preview/rubric/privacy **7 PASS**; server+rubric **80 PASS / 7 files**, including actual 5-process restore, raw/PDF uploads, current-owner export, private student-only feedback, profile/rubric invalidation, no source persistence, accelerated real PvP completion. This is server-owner evidence, separate from my browser/unit checks; see `docs/progress/codex-net.md`. Server frozen 21:16:55 UTC for lead's 43071 acceptance copy.

## Exact mount handoff → take-ui
All exported from `client/edu/index.ts`:
```ts
const ed = createRubricEditor({
  current: lobby.rubric, room: lobby.room, token: app.token,
  onUse: rubric => net.send({ t: 'setRubric', rubric }),
});
// Every lobby update; only server-confirmed state is marked in use:
ed.setCurrent(lobby.rubric);
// Student lobby (ready/pending handled by the existing component):
createJudgedCard({
  rubric: lobby.rubric ?? localDefaultRubric(),
  quality: me.kit?.quality, preview: me.rubricPreview,
});
// Student autopsy: only their own item from the server-filtered payload:
createFeedbackView(items.find(f => f.playerId === app.you)!, rubric, { variant, you: true });
// Teacher/projector autopsy; room token is required for owner-only HTTP exports:
createClassFeedback({ items, rubric, variant, room: lobby.room, token: app.token, canExport: isOwner(app) });
```
Keep the match's rubric with its feedback if the lobby later resets/changes. `createClassFeedback` must only receive the server-delivered authorized list; it does not fetch other students. Screens receive class feedback but HTTP exports remain owner-only. Existing lesson/quiz/report APIs stay compatible; report cards accept `peers` to show class medians. Take-ui owns all app mounting/message storage; no edits to app/style by me.

## Verification / reproducible evidence
- `npm run typecheck` **PASS** after final code changes, including root inclusion of rubric/genesis and browser regression script.
- `npx vitest run client/edu rubric`: **69 PASS / 7 files** (17:17 local). Existing report-card plain wording, grade monotonicity, exact next-grade thresholds, GPA, folded regen and class highlights tests still pass against the real sim. Eight new transport/editor contract tests cover real request shapes, normalized weights, errors and shared default.
- My full merged `npm test` at 17:15: **701 PASS / 8 optional skips / zero failures**. Later lead reports **704 PASS / 7 skips including restart**, plus build/QA tsc PASS; that is lead evidence rather than my own rerun.
- `npm run build` **PASS** at 17:15; final post-layout production build `write:false` also PASS, preserving the production snapshot window. Existing dynamic-import/chunk-size warnings only.
- `npx tsx client/edu/browser-check.ts` **PASS** on isolated 5187, system `/usr/bin/chromium`: **13 final screenshots**, 390x844 / 1440x900 / 1920x1080 rubric/student/class feedback, projector feedback, report phone/projector, quiz phone. No browser JS errors. Main matrix asserts no document horizontal overflow and exact table header/data alignment. Real DOM edit→engine→sim, reset, normalized ACK, precise preview, keyboard drill-down, sorting and a CSV browser download all pass.
- Browser report: `/tmp/gitzilla-edu-takeover-20261024/browser-report.json`; screenshots alongside it. Visually inspected final phone rubric/feedback/class drill-down, desktop rubric and 1920 class summary/table. Additional report/quiz screenshots captured; no physical-phone, native sensor or production-browser acceptance claimed.
- `git diff --check -- client/edu rubric docs/progress/codex-takeover-edu.md` **PASS**. Existing dirty files outside ownership preserved. No dependencies installed.

## Test-server note / remaining acceptance
- Initially 5187 served stale modules despite disk edits. Root `vite.config.ts` ignores `**/data/**`, which matches this checkout's absolute `/home/wilf/data/...` path. Polling with that ignore also stayed stale. Switched only the owned test server to `/tmp/gitzilla-edu-vite.config.mjs` (root set to this checkout, polling, no broad ignore); confirmed served modules match the actual engine and reran all final screenshots. **No root Vite config edit or shared 5175/5173 restart.** Informed lead of the dev-watch issue.
- Production full-game integration/long acceptance belongs to lead/take-ui/net. Runtime files are frozen; any further runtime change must be coordinated with lead's snapshot window first.
