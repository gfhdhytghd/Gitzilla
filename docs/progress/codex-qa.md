DONE — custom-rubric natural classroom + final direct exports + phone driver probe

**Final result:** StageA real custom-rubric upload/apply → exact previews → **165.1s natural classroom end** → personal-feedback privacy and complete teacher class view PASS. StageB final frontend, **ordinary direct 45093 browser/context, no routes**, restores the same natural KXEN result and both real-button CSV/MD downloads PASS (200, owner header, no token query, exact student/repository/score bindings). Original failed records remain unchanged. No second 165s classroom was played.

| Evidence | Result / artifact |
| --- | --- |
| Original natural StageA room KXEN | `qa/artifacts/rubric-flow-2026-10-24T21-21-50-317Z/summary.json`: custom 60/25/15 rubric; exact previews **86.2 / 90.8**; natural duration **165.0999999999931s**; each student only own feedback, teacher both; per-criterion results and weighted scores identical before/after |
| Final **direct**, non-composed teacher recovery/exports | `qa/artifacts/rubric-stage-b-2026-10-24T21-30-46-030Z/summary.json`: **4 PASS**, `assetComposition=false`; real welcome/current owner, same natural duration/roster/scores, CSV + MD both HTTP **200**, `X-Room-Token` present, no token query, actual browser downloads; no JS/protocol errors |
| Real CSV / MD files | Same StageB directory: `teacher-feedback.csv` **2245 bytes**, `teacher-feedback.md` **2909 bytes**; both contain the exact original students, repositories and their bound **86.2 / 90.8** scores |
| Short phone driver comparison | `qa/artifacts/rubric-phone-probe-2026-10-24T21-31-31-141Z/summary.json`: **PASS**, old drag **17 moving / 0 fire**; native tap **54 fire frames / 4 authoritative own bullets**, movement **41.07px**, ack advances, no errors. This was a short real battle/input probe, not another classroom/end-result run |
| Export semantic regression checks | `qa/artifacts/rubric-export-check-tests.log`: **6 PASS**; CSV and Markdown positive bindings, rejection of swapped student scores and substituted repositories |

### Failures retained and resolved without rewriting history

- StageA's frozen teacher screen had no CSV/MD buttons; those two original FAIL entries remain. Local product condition was `variant === 'screen' ? null : ...exports`. Original edu/ui owner fixed explicit owner `canExport`; coordinator changed **only isolated 45093 generated dist** to the final 46099 build, preserving old dist, backend process and KXEN memory. QA did not edit runtime or restart either server; no live deployment is claimed.
- StageA's known JSON-property-order/in-use label bug remains a separate KNOWN_FAIL, despite authoritative applied-rubric ACK and correct student previews. It was not mistaken for a failed upload or score.
- StageA's final input-coverage assertion failed because its first driver **dragged on every phone step**: phone had **1505 movement frames / 0 fire**, desktop **5004 fire frames**. This is retained as a QA-driver coverage failure, **not** passed or attributed to the application. `qa/rubric-flow.ts` now alternates real CDP drags with `page.touchscreen.tap()` plus ≥330ms classification space; the fire assertion remains strict. Production gesture thresholds are unchanged. The independent short probe uses 700ms between native taps and proves actual authoritative bullets. Root generic harness phone fire/dash/skill evidence was supplied by lead separately and is not relabelled as this run's result.
- Old asset-composition attempts (`rubric-stage-b-2026-10-24T21-27-15-739Z`, `21-28-41-381Z`) remain **inconclusive / superseded test compositions**, not product failures. No completed composition acceptance is claimed. A later experimental composition downloaded CSV/MD but hit the harness's literal-name MD assertion (`21-29-19-466Z`); those files and failed status remain. Final ordinary direct validation supersedes these attempts.
- The MD name failure was test expectation: the real Markdown correctly contains `QA\\_Student\\_One`. `qa/rubric-export-check.ts` now unescapes only Markdown ASCII punctuation in headings, then binds each exact student + repository to the single rubric-score field in that student's section. CSV is parsed as quoted records and also binds exact name/repository/score. This does not alter server escaping or merely search for both scores somewhere in the file; negative swapped-score tests pass.

### Visual inspection, reproduction and cleanup

- Actually viewed teacher applied-rubric, teacher/phone mid-classroom, both personal-feedback screenshots, initial teacher class view, and final teacher feedback-with-export-buttons screenshot. Phone personal feedback visibly shows **90.8**, correct own repo/evidence/next steps; teacher table visibly shows **90.8 and 86.2**. Final `final-class-feedback-teacher.png` shows both real export buttons and the same two-student class.
- Scripts: `npx tsx qa/rubric-flow.ts` is the explicit long StageA flow; **do not rerun just for export**. `npx tsx qa/rubric-stage-b.ts` defaults to a new ordinary direct context, restores the existing natural room, clicks real buttons, validates/downloads, then closes. `RUBRIC_STAGE_A_SUMMARY` (and optional `RUBRIC_FLOW_ROOM`) select another naturally completed StageA artifact; `RUBRIC_TEACHER_STATE` optionally loads a privately saved **new QA teacher** session without printing it. `RUBRIC_STAGE_B_HOLD=1` explicitly opts into keep-alive until `release.json`. No old StageA teacher token was read.
- `npx tsx qa/rubric-phone-probe.ts` is the short native-input driver comparison. `npx vitest run qa/rubric-export-check.test.ts` checks strict format semantics without a browser/server. **Lead reports final root QA TypeScript PASS on all new files.** No additional tests or diagnosis launched after the final stop instruction.
- All HOLD contexts have been released via their ignored `release.json` controls, and the short probe closes itself. No QA rubric-flow/stage-b/phone-probe Node process remains. New teacher storage states remain mode **0600** inside ignored artifact directories; no token values were printed. No 5173/5175 requests, source/runtime edits, commits or service restarts by QA.

---

Historical run notes below; the final acceptance and retained-failure interpretation above supersede pending wording.

IN PROGRESS (historical) — isolated production custom-rubric UI acceptance (45093)

New explicit integration scope: actual teacher screen + two real UI students, teacher file upload/apply/start, exact student preview, natural classroom completion, personal/class feedback privacy and real-button CSV/MD exports. Only `qa/` and this progress file; no frozen runtime changes, service restart or commit. Requests are restricted to the authorized isolated production `http://localhost:45093`; no 5173/5175 requests in this run.

- Added `qa/rubric-flow.ts`, started immediately as a long-running browser test. All gameplay actions use real UI / native keyboard or touch; WS observation is read-only. No artificial ending or direct API export/upload bypass.
- Custom document: `QA custom rubric 60-25-15`, with tests 60%, README 25%, function length 15%. Teacher upload goes through the actual file input and apply button; authoritative ACK requires `lobby.rubric.title`, `source=doc`, normalized criteria and exact own-student previews. Known editor.same property-order/in-use label issue is recorded separately and does not substitute for ACK.
- Student 1 is desktop (WASD/J); student 2 is portrait phone (390x844/DPR3, explicitly selected touch-only, ordinary native touch drag/tap). No bots: complements lead's default four-player classroom coverage.
- Feedback checks inspect every actual `feedback` message: each student only their own item, teacher the full class; compare pre-fight measured weighted score/results to final feedback and the visible score ring. Export attempts must use real teacher buttons, assert 200, owner header and no token query, and save real browser downloads.
- **Running room KXEN**, artifact directory `qa/artifacts/rubric-flow-2026-10-24T21-21-50-317Z/`, launcher log `qa/artifacts/rubric-flow-run.log`. Match started 21:21:53 UTC. Upload returned **200**, owner header present, no token query; authoritative rubric title/source/three normalized weights confirmed. Exact pre-fight UI/WS weighted scores: **QA Student One 86.2**, **QA Student Two 90.8**. Actual known in-use label failure recorded separately as KNOWN_FAIL.
- Visually inspected teacher applied-rubric screen, phone lobby/preview capture and both mid-classroom phone/teacher screenshots. The phone preview viewport capture is scrolled to controls/source evidence, so the exact score itself is established by DOM read + observed WS rows; final personal feedback screenshots are still pending. Teacher remained a screen with zero inputs and no fighter slot; both students send acknowledged ordinary input.
- Potential export issue identified in local source (`createClassFeedback` hides export buttons for `variant=screen`); not yet promoted to a confirmed failure until the actual production end screen is examined. No direct endpoint fallback will be used.
- QA TypeScript check for the new script PASS after correcting a diagnostic-only optional PvP phase type; no runtime files changed. Natural end, feedback privacy, final visual inspection and export acceptance remain pending.

Previous follow-up: DONE — nonnumeric-aim fixture timeout diagnosed and fixed

Take-lead assigned the intermittent default-5000ms timeout at `qa/robustness.test.ts:71`. Only `qa/fixture.ts`, `qa/robustness.test.ts`, and this progress file changed in this follow-up; no shared-service restart or commit.

### Diagnosis

- Initial isolated suite: 3 PASS / 1 opt-in SKIP; target took 2241ms. The 20-match fixture also completed and released its match intervals.
- Added opt-in `QA_TRACE_FIXTURE=1` stage timing. Before the fix, both 5-execution and 8-execution independent repeat runs reproduced the default 5000ms timeout.
- The decisive 8-execution trace shows the failing iteration reached **fighting at 2077ms**, **ack at 2118ms**, and **the original finite-facing assertion passed at 2218ms**. Peers, RoomServer and WebSocket server closed by **2239ms**; the **HTTP server close callback did not return until 8363ms** (6124ms later). Evidence: `qa/artifacts/fixture-timeout-2026-10-24/fixture-diagnosis-close-trace.log`.
- Therefore the captured reproduction stalls in HTTP teardown, after the gameplay assertion; it is not a demonstrated CPU-delayed countdown or malformed-aim simulation failure. The exact origin/type of the lingering HTTP connection was not captured, so no claim is made about a particular external probe or keep-alive peer.

### Fix and validation

- After draining the fixture's WebSockets, initiate `httpServer.close()` and call `httpServer.closeAllConnections()` to close remaining HTTP connections owned by that isolated ephemeral fixture instead of waiting for their timeout. Shared DEV/live services are never involved.
- Preserve the **original finite-facing assertion**, bad-aim packet, real 60-tick countdown, ack wait, 100ms post-ack observation and **default 5000ms test timeout**. No retries were added to the test. Add an explicit final assertion that the fixture HTTP listener is stopped and its WebSocket client set is empty.
- Already-in-flight post-fix independent repeats: **20/20 executions PASS**, max total **2270ms**, HTTP teardown **0–1ms**. Logs and parsed timing summary: `qa/artifacts/fixture-timeout-2026-10-24/fixture-diagnosis-close-after.log` and `summary.json`.
- QA's already-in-flight full run at 17:15:59: **703 PASS / 8 SKIP**, and QA TypeScript check PASS (`fixture-diagnosis-full-after.log`, `fixture-diagnosis-typecheck.log` in the same artifact directory). No further full runs started after lead requested avoiding duplicate load.
- Lead's `ROOM_RESTART_TEST=1 npm test` at 17:16:17: **704 PASS / 7 SKIP**, verified by reading `/tmp/gitzilla-takeover-full.log`. Lead also reports build / QA tsc PASS. These are identified as coordinator validation, not newly launched QA runs.
- All new `fixture-diagnosis-*.log` files were moved into **gitignored** `qa/artifacts/fixture-timeout-2026-10-24/`; `git check-ignore` confirms the evidence is retained without adding large logs to the review diff.

Focused future diagnosis command (no shared service required): `QA_TRACE_FIXTURE=1 npx vitest run qa/robustness.test.ts -t 'nonnumeric aim' --reporter=verbose`. The trace is silent by default.

Previous handoff: DONE — Round 2 + portrait robustness QA (`codex-qa`)

The following is the historical Round 2 handoff, not a fresh audit of the takeover workspace's overall open-defect list.

QA work is complete; product fixes are routed below. **Open: 4 robustness bugs + 1 design integration gate.** Added reproducible scripts/tests and screenshots under `qa/`; no product source fixes, commits, dependency installs, server restarts or live-demo requests by QA.

| Owner | Finding | Severity |
| --- | --- | --- |
| codex-net | QA-NET-01: malformed aim stops the room's match | high |
| claude-ui | QA-UI-01: wake opens an extra reconnect socket | high |
| claude-ui | QA-UI-02: duplicate tabs repeatedly steal the session | high |
| claude-ui | QA-PORTRAIT-01: 360x640/DPR-2 arena shrinks to 240x144 | medium |
| codex-gemini (with codex-repo) | QA-DESIGN-02: bundled design assets disagree with current fallback contract | medium |

Handoff gates: `npm run typecheck` **PASS**; `npx tsc -p qa/tsconfig.json` **PASS**. Latest full suite: **279 passed / 1 failed / 6 skipped**, offline design-assets test (`qa/full-test-handoff.log`). Opt-in known-bug repros still produce **3 failures / 3 passing controls** (`qa/repro-handoff.log`). Twenty realtime matches completed in 379.594s, with zero outstanding match intervals and ~361KiB mean retained-heap growth after fixing QA-client history retention.

Portrait acceptance (actual DEV rooms, not mock acceptance):

| Phone | Result | Evidence under `qa/artifacts/` |
| --- | --- | --- |
| 390x844, DPR 3, insets 47/34 | PASS: geometry, native safe areas, 3 rotation cycles, held-control clearing, wake/input ack, natural autopsy | `portrait-2026-10-24T19-18-36-110Z` |
| 360x800, DPR 3, insets 32/24 | PASS after restart-interrupted attempt; same checks + natural autopsy | `portrait-2026-10-24T19-20-55-686Z` |
| 430x932, DPR 3, insets 59/34 | PASS after restart-interrupted attempts; same checks + natural autopsy | `portrait-2026-10-24T19-23-11-618Z` |
| 360x640, DPR 2, insets 24/24 | FAIL viewport sizing, reproduced twice with no errors/restarts; safe-area buttons fit. Natural autopsy + same-player reload separately PASS | `portrait-2026-10-24T19-23-11-587Z`, `autopsy-2026-10-24T19-20-55-633Z` |

Headless Chromium kept switched tabs `visibilityState=visible`; background handler checks therefore explicitly synthesize visibility/blur events, clear a held native CDP touch, then verify foreground fire/dash/skill over actual WebSocket traffic. CDP frozen/active suspension is tested separately. This does not prove real-phone OS backgrounding, Safari or physical sensors.

Scope: `qa/` plus this progress log; no commits, dependencies, server restarts, or requests to port 5173/public demo. Existing dirty files belong to their owners and are preserved.

Read: `docs/BRIEF.md`, `shared/types.ts`, `server/README.md`, `tools/README.md`, `docs/tasks/round2.md`, and coordinator-added `docs/tasks/portrait.md`.

Completed DEV protocol probes, browser recovery/slow network/rotation checks, deterministic reconnect/upstream-failure/malformed-input tests, 20-match lifecycle and realtime heap/timer runs, and the coordinator's portrait extension. Findings below are routed to owners; product fixes remain with them.

## Findings by owner

### codex-net — QA-NET-01, high: malformed aim stops the entire room

- **Confirmed on DEV 5175**, not just a fixture. In a fighting match send `{"t":"input","frame":{"seq":102,"move":[0,0],"aim":{},"fire":true,"dash":false,"skill":false,"source":"keyboard"}}`.
- Result: `Match stopped: Spread syntax requires ...iterable[Symbol.iterator] to be a function`; room returns to lobby and all players lose the running match.
- Suspected cause: `server/rooms.ts` validates `seq` and `move`, but passes unchecked `aim` through to `sim/match.ts`'s `unit(...input.aim)`.
- Repro: `npx tsx qa/protocol.ts` (last check fails); isolated real-room/sim repro: `QA_REPRO=1 npx vitest run qa/robustness.test.ts`.
- Evidence: `qa/artifacts/protocol-2026-10-24T19-01-57-075Z/summary.json` (8 checks pass, malformed-aim check fails).

### claude-ui — QA-UI-01, high: wake races pending reconnect

- Deterministic reproduction against actual `client/app/net.ts`: open → close → visibility becomes visible before the 500ms retry → visibility opens replacement → queued retry opens an extra third socket.
- Suspected cause: reconnect timeout is not retained/cancelled; `open()` does not guard an existing connecting/open socket. Resume takeover can then cause socket churn.
- Repro: `QA_REPRO=1 npx vitest run qa/reconnect.test.ts -t QA-UI-01`; assertion expected 2 sockets, got 3.
- Evidence boundary: actual client module with controlled sockets/timers. DEV frozen-tab recovery without a socket loss passed; an OS sleep race is not established by that pass.

### claude-ui — QA-UI-02, high: displaced tab immediately steals the session back

- Deterministic reproduction against actual client: server closes a tab with code `4001` ("Resumed in another tab"); old tab schedules another resume 500ms later.
- Suspected cause: `sock.onclose` ignores the close code, and both tabs share `kaiju.token.<room>` in localStorage. Both can repeatedly displace one another.
- Repro: `QA_REPRO=1 npx vitest run qa/reconnect.test.ts -t QA-UI-02`; expected 1 socket after takeover, got 2.
- **Also confirmed in actual DEV browsers**: `npx tsx qa/takeover.ts`. Two same-context tabs each open/resume three sockets within 2.2s, repeatedly displacing each other. `qa/artifacts/takeover-2026-10-24T19-03-11-484Z/summary.json` and original/duplicate PNGs preserve the repro.

### claude-ui — QA-PORTRAIT-01, medium: tiny DPR-2 phone regressed to a 240x144 arena

- **Confirmed actual DEV room, zero restart/errors:** 360x640 CSS viewport, DPR 2, native safe-area top/bottom 24px. Stage is **240x144 CSS px**, centered with 60px side margins; only 22.5% of screen height. The minimap occupies half the already-small arena width. The portrait contract asks for a full-width viewport using the arena height, roughly 58% of screen height.
- Repro: `QA_PORTRAIT_SIZES=360x640 npx tsx qa/portrait.ts` (geometry check fails). Evidence `qa/artifacts/portrait-2026-10-24T19-18-36-110Z/summary.json`, `360x640-dpr2-game.png` / `360x640-dpr2-failure.png`.
- Repeated on the completed portrait layout with identical 240x144 geometry, no errors and no restarts: `qa/artifacts/portrait-2026-10-24T19-23-11-587Z/summary.json` and corresponding PNGs.
- Suspected cause: `client/app/game.ts` now reserves a fixed `>=300px` control deck using `Math.min(avail * .66, avail - 300)` before integer scaling. With 542px available, this floors the DPR-2 scale to 1 device pixel (0.5 CSS); view width caps at 480 logical px, so the canvas becomes 240px wide instead of filling the 360px screen. Earlier layout produced a 360x288 arena with reachable buttons on this same device (`portrait-2026-10-24T19-16-42-836Z`). Consider a compact tiny-phone deck / adapting optional panels rather than halving the arena.
- Tap controls and safe-area placement pass in the earlier tiny-phone run. Focused tiny-phone natural autopsy + same-player reload also PASS (`qa/artifacts/autopsy-2026-10-24T19-20-55-633Z/summary.json`); this finding is specifically the new gameplay viewport sizing.

### codex-gemini — QA-DESIGN-01/02, medium: design integration gates changed during owner work

- Full suite at 15:05 local: 231 passed, 1 failed, 7 skipped. `design/index.test.ts` → `grounds fallback hero identity, emblem, limbs, attacks, intro and taunts in real source`.
- Focused repro: `npx vitest run design/index.test.ts -t 'grounds fallback hero'`; see `qa/design-repro.log`. First suite failed `app Claw` versus `/renderForest|meshReady/`; after a concurrent design edit, focused repro fails the same test's final equality at line 210, with different labels/attack names for components missing from the replacement DNA.
- Suspected cause: the test constructs `p` with replacement DNA but passes `bossKit` created earlier from the original Flask profile; comparison kit is regenerated from `p`. `artDNA` combines profile DNA and kit limbSymbols, so the fixture mixes source versions. Owner should reconcile the test's kit inputs and desired precedence; QA did not change design code/tests.
- **Latest at 15:08:** original DNA fixture failure resolved by concurrent owner work. Full suite now has 236 passed / 1 failed / 6 skipped; failure is `ships valid hero/boss assets for every fallback repo, loadable offline at any squad size`, `burntsushi/ripgrep` reports `source: fallback` instead of `precomputed`. Repro `npm test`, log `qa/full-test-latest.log`. Suspected manifest/cache-key mismatch while fallback DNA/assets are being regenerated (`design/index.ts` checks manifest v2 seed and key). Route this remaining asset integration gate to codex-gemini, coordinating with codex-repo.
- Final regression at 15:11: **237 passed / 1 failed / 6 skipped** (`qa/full-test-final.log`). Same offline-assets test remains red at line 183: runtime boss name `RIPGREP, GUARDIAN OF LOST DIRS` versus bundled `RIPGREP, THE UNMERGED`, plus taunt differences. QA did not change owner files. Latest known-bug repro run: exactly 3 expected failures and 3 passing controls (`qa/repro-final.log`).
- **Handoff at 15:22:** **279 passed / 1 failed / 6 skipped** (`qa/full-test-handoff.log`); still the offline-assets test, now line 184: manifest marks Ripgrep's boss `fallback`, bundled `RIPGREP, GUARDIAN OF LOST DIRS` differs from current fallback `RIPGREP, THE DIRS PARADOX`. Earlier 15:19 validation failure also dropped new `weaponName` (`qa/full-test-portrait.log`), since changed by owner work. Current action is to regenerate/reconcile bundled assets + manifest with the final design contract, then rerun the full gate.

### claude-boss / claude-player / codex-sim — initial typecheck integration, resolved by owners

- `npm run typecheck` fails on new Round 2 required fields: boss gallery `MatchState` missing obstacles/pickups/perkOffer and player missing perks; player gallery has three missing-perks cases; sim constructor players missing perks.
- These files are in active owner work; QA has not edited them. See `qa/typecheck-run.log`; recheck after owners merge their implementations.
- Follow-up `npm run typecheck` at 15:05 and `npx tsc -p qa/tsconfig.json` both PASS (`qa/typecheck-final.log`, `qa/qa-typecheck-final.log`). Initial missing-fields errors are no longer open findings.

## Evidence and limits

- **Corrected realtime soak PASS:** 20 naturally completed real-room/sim matches in **379.594s wall time**, four autopsy resumes, zero remaining match intervals after every match. Post-GC mean heap growth (last five minus first five): **369,589 bytes (~361KiB)**. Artifact: `qa/artifacts/soak-2026-10-24T19-07-32-320Z/summary.json`. No evidence of match-interval accumulation or a large retained-heap slope in this short isolated run. The `snapshots` field in this run counted the bounded retained history (198 snapshot messages), not total throughput; exact rates were measured independently on DEV. Service excludes auth/Gemini/Hall persistence, and its loaded sim snapshot is isolated from concurrent source edits.
- DEV `/api/fallbacks` responded with 15 repos.
- Initial `npm test`: 204 passed, 5 skipped, before the concurrently landing Round 2 tests. Final full-suite gate is listed above; do not use the initial green run as current integration acceptance. Known failing robustness reproductions are opt-in with `QA_REPRO=1`, clearly separated from normal regression results.
- DEV protocol pass: lobby resume/kit retention, superseding repo/boss spam and 200KB invalid slug recovery, seven-bot displacement by eight humans, ninth-human rejection, owner transfer/resume, basic JSON/message fuzz recovery, start spam, match resume/ack, 300ms stale-input expiry.
- Browser passes: 180ms latency with bandwidth throttling; repo submit double-clicks; lobby reload and owner transfer; phone landscape/portrait; start double-click; CDP frozen/active tab lifecycle; match reload/input ack; portrait hint recovery. Long browser runs' autopsy stages were interrupted by explicit server restart notices: **inconclusive**, not UI bugs (`browser-2026-10-24T19-01-19-289Z` and `browser-2026-10-24T19-02-57-732Z`). The focused real-DEV autopsy check subsequently passed; see below.
- Offline upstream injection: 7 tests passed for HTTP 403/404/429/503, offline failures, timeout cancellation, and oversized archive cancellation. Unknown/credential-denied repos return explicitly synthetic profiles; no real login was attempted.
- Twenty accelerated real-sim defeats completed in an isolated RoomServer fixture; no active match intervals after each autopsy; kits retained across rematches and autopsy resumes. This proves lifecycle/timer cleanup under acceleration, not a production heap soak.
- Second accelerated standalone soak completed 20 natural 15.73s-sim defeats with zero remaining match intervals and ~430KB mean post-GC heap growth (last five minus first five), artifact `qa/artifacts/soak-2026-10-24T19-03-39-253Z/summary.json`. The corrected realtime soak result is above. The first standalone soak (`19-02-57`) loaded a partial in-progress sim edit and completed zero matches; it is not acceptance evidence.
- Focused DEV natural-autopsy attempts at `19-05-06` and `19-05-48` both observed the explicit message `Server restarted. Your fight was reset to the lobby; repos and kits were restored.` They are INCONCLUSIVE. This independently confirms restarts are invalidating the long browser scenario, rather than establishing an autopsy UI failure.
- **Natural autopsy + real-player reload now PASS on DEV**: `qa/artifacts/autopsy-2026-10-24T19-08-15-915Z/summary.json`, `autopsy.png`, `resumed-autopsy.png`; natural defeat at 17.07s, identical player ID after reload, two authoritative autopsy payloads, zero errors/page exceptions. Supplemental same-UI/isolated-real-room socket run also passes (`autopsy-2026-10-24T19-08-14-728Z`), clearly marked isolated.
- Full eight-human DEV smoke PASS (`qa/smoke-eight.log`): 100 snapshots/client/5s, ack/time/auth/QR/fallback/Hall checks pass. Additional instrumented eight-human probe PASS: 5.033s sim / 5.000s wall, 100 snapshots each, ack 150, no errors (`qa/artifacts/snapshot-rate-2026-10-24T19-09-23-172Z/summary.json`).
- First 1-human/7-bot smoke missed its simulation-time threshold (`qa/smoke-bots.log`); repeat **PASS**, 100 actual snapshots/5s with bot movement and ack/time checks (`qa/smoke-bots-retry.log`). An independent instrumented bot probe also advanced 5.033s/5.000s without errors. The initial timing miss is not reproducible and is not an open product finding.
- Latest eight-human instrumented probe uses a dedicated snapshot counter and PASSes 100 snapshots/client, ack 150, 5.033s simulation / 5.001s wall (`qa/artifacts/snapshot-rate-2026-10-24T19-11-01-331Z/summary.json`). Older custom probes counted all received messages (the bot probe's 107 included cosmetic lobby updates); corrected the counter. The original smoke's snapshot-only counters independently confirm both 8-human and 1-human/7-bot throughput.
- Initial realtime soak completed 20 real matches and released all intervals (`qa/artifacts/soak-2026-10-24T19-03-39-267Z/summary.json`), but its ~5.6MB apparent retained-heap growth included a QA harness retention bug: the fixture kept closed peers' 200-snapshot histories at every fifth autopsy resume. Fixed `Peer.close()` to clear that history, then restarted the full realtime soak. Do not attribute the earlier heap slope to the game server.
- The first isolated browser-autopsy attempt (`autopsy-2026-10-24T19-07-32-688Z`) used interception without directly observing forwarded frames and timed out; corrected proxy telemetry and quiet HMR socket handling in the passing supplemental run. This was a QA harness issue, not a product failure.
- The first protocol artifact (`19-00-43`) was superseded: QA initially checked an old ready state before its fuzz batch had been processed. That harness race is fixed; its downstream failures and malformed-aim apparent pass are invalid evidence.
- Actual private-repo access requires a signed-in human; use synthetic credential tests without reading or printing real credentials.
- Phone browser emulation cannot prove physical sensor delivery or OS sleep recovery.
- Latest expanded generic-browser rerun (`browser-2026-10-24T19-22-42-848Z`) loaded a blank page with two `ERR_CONNECTION_REFUSED` console errors before any UI/WS handshake, so its missing-create-button failure is not evidence of a UI selector regression. Earlier slow-network acceptance is retained; no current uninterrupted portrait slow-network rerun is claimed. Updated the harness to record failed-request URLs and classify local connection refusals as environment-interrupted in future runs.

## Contract requests

For portrait UI QA, stable test IDs for the viewport/deck/minimap/rotate guard would help but are not required; existing canvas/HUD/button classes can be measured.

## Coordinator scope addition: portrait-only phones (DONE)

- Read `docs/tasks/portrait.md`. Earlier landscape-phone screenshots and rotate-to-landscape checks are historical and **do not establish acceptance of the new portrait contract**.
- Added and ran `qa/portrait.ts` for 390x844, 360x800, 430x932 and tiny 360x640; coarse pointer/touch, DPR 2–3, real Chromium safe-area overrides (not CSS substitutes), repeated landscape↔portrait flips, held-input clearing, frozen/active lifecycle and foreground input recovery. Landing/lobby overflow, native safe areas, deck/minimap/buttons, and natural autopsies are checked. Focused retries are selected with `QA_PORTRAIT_SIZES`; tiny natural-autopsy/reload with `QA_PHONE_SIZE=360x640 npx tsx qa/autopsy.ts`.
- Readiness uses a mock-game page only to detect the new viewport/deck; all acceptance cases use real DEV rooms and observed WebSocket frames. Initial readiness attempt hit a QA serialization issue (`__name` in a nested browser-evaluated function); fixed the helper and reran. No mock result is presented as real-game acceptance.
- Phone camera/deck/minimap have landed. Three primary phone sizes PASS; tiny DPR-2 viewport regression is routed to claude-ui above. Updated `qa/browser.ts` to primary portrait 390x844/DPR 3 and rotate-to-portrait guards; historical landscape screenshots remain explicitly historical.
