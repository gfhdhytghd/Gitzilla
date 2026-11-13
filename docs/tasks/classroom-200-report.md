STATUS: WORKING

# Classroom 200: server delivery

Coordinator follow-up: peer attack history is now removed from every non-teacher wire path. Optional negotiated deltas reuse unchanged plans/history and patch private reports. Bandwidth results below require the UI to enable this capability and merge frames first.

Base and final HEAD: `c959bdd43c633faede170677c967e9031378d5ae`.
No commit, push, deployment, production connection, `client/` edit, or `server/course-*.ts` edit was performed by this task. Other agents' edits remain in the shared checkout.

## Questions / authorized wire contract

The user authorized the compact contract directly. This section was recorded before changing the wire contract.

- Existing state fields keep their types. Add optional `summary: { roster, submitted, connected, queued, away }` with anonymous integer counts. `roster` counts retained rows, including offline students; `away` counts disconnected empty rows. The active denominator used by the existing UI is `roster - away`.
- Every wire path (`classroom`, `lobby.classroom`, `welcome.lobby.classroom`, controller sockets) retains all teacher rows. A student retains exactly their own row. A projector gets `rows: []`.
- The embedded legacy `lobby.players` list also omits other students after a classroom lesson is configured, to prevent that list from reintroducing the full roster. Teachers retain the full list. Unconfigured/battle/PvP lobbies retain their existing behavior.
- The coordinator's follow-up supersedes the original requirement to retain historical attack arrays: non-teacher rounds retain only `stepId`, `attempt`, `at`, `bossBefore`, `bossAfter`, `roster`, `checkStats`, `questionStats`, anonymous `totals`, and the viewer's own `attacks` entry. Projectors get `attacks: []`. This applies to classroom frames, welcome/lobby embeds and controller sockets, with or without delta support.
- `round.totals = { submitted, damage, score, improvement, average, median, bands: [below50, from50toBelow80, atLeast80] }`. Numbers are computed from the already-redacted student projection, so aggregates do not bypass question-grade reveal timing. `state.lessonTotals` has the same fields for the latest attempt per step, plus `participants` (distinct contributors across all attempts).
- Teacher history and exports retain every original attack. Current own reports/errors/email and existing controller report privacy are unchanged.

## Implementation

- `server/rooms.ts`: one exported `CLASSROOM_CAPACITY = 200`; every admission, seat-trimming and mode-switch limit references it. Battle/PvP limits stay eight. Existing offline-seat eviction and contribution retention are preserved.
- Classroom answer saves, email changes, code-queue state and code results send the student's own result immediately. Peers receive one batch within 250 ms. Teacher controls and phase transitions flush pending batches immediately.
- Classroom joins/disconnects coalesce their lobby and classroom broadcasts. Welcome/own state remains immediate. Timer disposal covers room deletion, inactivity cleanup and server shutdown.
- Public/teacher projections and anonymous aggregates are shared within each broadcast instead of rebuilding them for every recipient. Disconnected sockets are skipped before report construction.
- Opt-in delta capability: `hello.classroomDelta: true`. This is socket-scoped for all audiences. The first classroom packet on each new socket or replacement lesson is complete. Subsequent classroom packets can set `delta.planUnchanged` and/or `delta.roundsUnchanged`; the corresponding plan/round arrays are placeholders and MUST be reused from the previous decoded classroom packet. `delta.reports: true` means `reports` is a keyed patch; remove IDs in `delta.removedReports`. Ordinary rows, counts, time, phase, errors and emails remain complete.
- `shared/classroom-delta.ts` exports `mergeClassroomPacket(previous, packet)`, which returns a full UI-ready packet and never mutates its inputs. A missing initial full packet is rejected. Welcome/lobby snapshots remain complete. Clients that do not opt in keep receiving complete snapshots, with the privacy-safe compact non-teacher history.
- These deltas reduce both retained history and repeated multi-kilobyte lesson plans. Unchanged teacher reports are also skipped, and cleared reports are explicitly removed on retry. Snapshots reset on reconnect. Raw frame-byte metrics below count the actual transmitted delta payloads, not reconstructed UI objects.
- Existing persistence already had a 100 ms trailing debounce. Answer bursts now use a 1000 ms batching deadline. New activity cannot postpone an earlier pending write indefinitely. Controls can request an earlier write; clean shutdown flushes everything. Immediate own-result delivery acknowledges memory state, not disk durability; a crash can lose the pending interval.
- `server/classroom.ts` / `shared/classroom.ts`: compute and expose the optional anonymous summary. Storage/export and teacher rows remain complete.
- `tools/classroom-load.ts`: a separate local server process, real WebSocket clients, seeded open/close bursts, sustained jitter, mixed-skill code/answer saves, answer revisions, 10 reconnects, 5 refresh-style reconnects, attack, feedback, retry, next and finish. The local server uses the production static `analyzeFiles` implementation and an isolated temporary persistence file. No GitHub/AI provider traffic.
- An external URL is accepted only through explicit `--target=<URL> --room=<CODE>` flags. Optional `--cookie-env=NAME` supplies target authentication. External CPU/RSS/lag are explicitly unavailable without server-side collection; the tool exits nonzero if required metrics cannot be verified. No external-target run was performed.

## Client follow-up: complete rows inventory

The UI agent is editing these files concurrently; line numbers below are from the initial inventory at task start, before those edits. Every production consumer of classroom `state.rows` was inspected. Generic art/chain-board table rows are unrelated.

### Required aggregate/count changes

| Initial location | Use | Adaptation |
| --- | --- | --- |
| `client/app/classroom.ts:644-645` | `controlHint` connected/total/submitted/queued | Use summary for any non-teacher rendering; teacher-only use remains valid. |
| `client/app/classroom.ts:839` | Hide the join card when someone is connected | Use `summary.connected`, not projector rows. |
| `client/app/classroom.ts:950-956` | Submission progress, queued count, offline count, denominator, phase-render signature | Use all five summary counts and include summary in the signature. |
| `client/app/classroom.ts:968,1017` | Dense-roster and empty-roster display | Empty compact rows do not mean empty class; distinguish teacher rows from projector aggregate view. |
| `client/app/classroom.ts:1022` | Question board submitted/total | Use summary submitted and class denominator. |
| `client/edu/debrief.ts:95` | Legacy round roster fallback | Use summary roster before rows; frozen `round.roster` remains preferred. |
| `client/edu/debrief.ts:142-143` | Stable-roster check and missing-student names | Compare against summary roster; full missing-name lists are teacher-only. |
| `client/edu/debrief.ts:211-212` | Lesson roster/missing-student aggregation | Use summary roster for counts; row-derived missing-name lists remain teacher-only. |

Integration note: the parallel UI helper now maps `summary.roster` to its local `total`. It still must use `round.totals.submitted` for frozen historical counts, rather than deriving a historical count from current `state.summary`. This task did not edit that helper.

### Own-row and teacher-only consumers: preserved

- `client/app/classroom.ts:522,529,537,555`: review names. Teacher has the full roster; the student retains their own row/name.
- `client/app/classroom.ts:674,677,688`: teacher control enable/disable predicates. Teacher retains full rows.
- `client/app/classroom.ts:803,1030`: own-row status/score/submission lookup. The own row is preserved even when question scores are temporarily hidden.
- `client/app/classroom.ts:963-966`: removal/selection cleanup and row-render signature. Teacher retains all rows; non-teacher controls must not imply access to omitted peers.
- `client/app/classroom.ts:971`: teacher row sort/render. Full teacher rows remain available.
- `client/edu/debrief.test.ts:26,43,111,205,210` and `client/app/classroom.test.ts:77,175,224,362`: fixture builders/manipulations. Retain the old full-row fixtures and add compact-summary UI fixtures in the UI task.

The parallel UI now routes several count consumers through `classCounts`; this is not UI acceptance by this server task. Browser, physical device, layout and deployed-client integration remain unverified.

## Verification

### Regression and unit checks

- Follow-up baseline: the two new history privacy/delta tests failed on the original delivery. [Preserved red log](classroom-200-evidence/history-baseline-red.log).
- Follow-up focused suite: `capmem 8G npx vitest run shared/classroom-delta.test.ts server/classroom-200.test.ts` — **12 passed** (9 server transport tests + 3 shared decoder tests). [Log](classroom-200-evidence/history-focused-tests.log). Covers full initial snapshot, delta opt-in vs legacy fallback, reconnect reset, report patches and deletions, plan replacement at reveal/retry, hidden grade aggregates, own attack and projector privacy, and immutable merge behavior.

- Baseline, before implementation: `capmem 8G npx vitest run server/classroom-200.test.ts` — **4 failed**, covering admission, compact own state, coalescing, and persistence. [Preserved red log](classroom-200-evidence/baseline-red.log); synthetic resume tokens are redacted.
- Final owned/relevant server sweep: `capmem 8G npx vitest run server --exclude 'server/course-*.test.ts'` — **797 passed, 6 skipped; 40 test files passed, 6 skipped**. [Log](classroom-200-evidence/history-server-tests.log).
- Capacity coverage includes 200 admissions, 201st refusal, full-room resume, explicit leave, ungraded offline eviction, contributed offline retention, and legacy over-capacity contribution preservation.
- Compact-state tests cover own row, teacher rows, projector rows, welcome/lobby paths, hidden scores and privacy. Existing question protocol tests retain grading/reveal assertions; they explicitly drain the queued batch before inspecting it. Coalescing timing is tested separately with a 249/250 ms boundary, immediate own result, teacher aggregate, immediate attack and no stale extra timer flush.
- Persistence tests verify no write after 250 ms of an answer burst, one write at 1000 ms, bounded writes under continuous activity and shutdown persistence.
- HP tests cover 1, 30 and 200 students: a three-step lesson starts at **15 / 450 / 3000 HP**, with **5 / 150 / 1000 HP** slices. Average 60 spends 80% of the slice; an unchanged retry spends zero; improvement can finish only the available slice. Full participation, rounding, partial participation and per-step floors also remain covered.
- Initial whole-server sweep also exercised concurrent `course-*` work and observed two native-PDF failures there. This task did not change those files. The final server sweep excludes that separately owned work; it is not a claim that the entire repository test suite passed.
- Full-repository `capmem 8G npm run typecheck` — **PASS (exit 0)**, including the shared optional field and new load harness. [Log](classroom-200-evidence/history-typecheck.log).
- `git diff --check` — **PASS**. Final HEAD remains `c959bdd43c633faede170677c967e9031378d5ae`.

### Coordinator follow-up: attack consumers and delta integration

The initial grep found these production consumers of classroom `round.attacks`; unrelated boss-kit attack lists are excluded. The UI agent is editing concurrently, so function names are also provided.

| File / initially inspected lines | Consumer | Required non-teacher behavior |
| --- | --- | --- |
| `client/app/classroom.ts:663` | `controlHint`, best improvement/name | Teacher-only: full attacks remain available. Do not reuse for public named highlights. |
| `client/app/classroom.ts:778-779` | `renderBoss`, top improvements and attack count | No peer named highlights. Use `round.totals.submitted` for the count; `bossBefore/After` still drive damage/animation. |
| `client/edu/class-raid.ts:91` | `myRound`, find viewer ID | No semantic change: the viewer's own attack remains. Must consume merged delta state. |
| `client/edu/debrief.ts:92,97` | `matchingReports`, `rosterFor` | Teacher-only per-person details; public count fallback comes from totals, not compact attack length. |
| `client/edu/debrief.ts:128,136` | `roundReteach` coverage/partial counts | Compare check coverage against `round.totals.submitted`. |
| `client/edu/debrief.ts:142,148` | `helpersFor`, missing people/low scores | Names and per-person advice are teacher-only; public views use anonymous check/score totals. |
| `client/edu/debrief.ts:159,162` | `shoutoutsFor` | Do not construct public peer named shoutouts. |
| `client/edu/debrief.ts:173-178` | `nextFor`, submitted/majority/one-away checks | Use totals submitted/average and check aggregates. Per-person report majority is unavailable publicly. |
| `client/edu/debrief.ts:186` | `buildRoundDebrief` score distribution/headline | Use `round.totals.average`, `.median`, `.bands`, `.submitted`; preserve frozen `roster` and check/question stats. |
| `client/edu/debrief.ts:211-212,220` | `buildLessonDebrief`, score/participant counts | Use `state.lessonTotals` and each round's totals. `participants` is the distinct contributor count; `submitted` counts latest-attempt student-step submissions. |
| `client/edu/debrief.ts:228,236` | Lesson low-score/name and improvement highlights | Teacher-only. No public peer names or scores. |
| New parallel `client/edu/class-counts.ts:roundSubmitted` | Current-summary fallback | Prefer frozen `round.totals.submitted`, including after retry, next, leave or kick. Current `state.summary` is not historical evidence. |

The parallel UI has started public/teacher debrief routing and anonymous highlights. This task did not modify `client/` and does not claim UI acceptance.

**Delta integration required before enabling the low-bandwidth path:**

1. `client/app/net.ts:68` (hello send): set `classroomDelta: true` only after the decoder is installed.
2. `client/app/net.ts:72-82` (socket `onmessage`): keep a `ClassroomPacket | undefined` cache scoped to the newly opened socket. For `m.t === 'classroom'`, call `m = mergeClassroomPacket(previous, m)` and update `previous = m` **before notifying any message listener**. Reset the cache on every new socket. The helper is in `shared/classroom-delta.ts`.
3. This decoder must run before both `client/app/main.ts:331-333` (which currently replaces `app.lobby.classroom`/`app.classroomReports`) and the classroom view's own `onMsg` listener. Central decoding in `net.ts` avoids inconsistent listeners and keeps the existing UI assignment path valid.
4. The plan placeholder is `{title:'', bossName:'', steps:[]}`; unchanged rounds use `[]`. Those are meaningful ONLY with their respective delta flags. They are not a real empty lesson/history. Unflagged empty data replaces prior data normally. Report patches delete only `removedReports` IDs.

### Local 200-client load after coordinator follow-up

`capmem 8G npx tsx tools/classroom-load.ts --bots=200 --output=/tmp/classroom-200-history-load2.json` — **PASS**. [Final raw results](classroom-200-evidence/load-200-history.json). All 202 clients explicitly negotiate delta support; the harness uses the same shared merge helper required by the UI, while measuring raw received bytes before merging.

The unchanged workload has 200 students + teacher + projector, 10 reconnects, 5 refresh-style reconnects, three mixed submission waves, two attacks, retry, next and finish. Each latency distribution has 1260 observations. Duration 31.46 s; 200-student join time 310.67 ms. Every received non-teacher classroom/welcome/lobby frame is audited for peer roster and attack identity leakage.

| Metric | Original delivery | Final follow-up | Result |
| --- | ---: | ---: | --- |
| Student average bytes/s, p50 across clients | 49,075.43 | 3,339.95 | PASS |
| Student average bytes/s, p95 across clients | 52,887.57 | 3,757.85 | PASS |
| Student average bytes/s, maximum client | 53,280.00 | 4,058.07 | Every student < 5,000 B/s |
| Projector average bytes/s | 37,930.19 | 2,320.20 | < 5,000 B/s |
| Teacher average bytes/s | 442,629.10 | 110,734.36 | 74.98% lower |
| Total server egress bytes/s | 10,359,986.95 | 786,930.64 | 92.40% lower |

| Latency | p50 (ms) | p95 (ms) | p99 (ms) | Result |
| --- | ---: | ---: | ---: | --- |
| Save to own result | 2.87 | 68.95 | 89.67 | p95 < 300: PASS |
| Save to teacher | 178.16 | 255.64 | 268.38 | p95 < 1,000: PASS |
| Server event-loop lag | 10.07 | 10.67 | 16.44 | p99 < 100: PASS |

Unexpected dropped sockets: **0**. Errors: **0**. Server-only CPU: **2,897.78 ms / 9.21% of one core**. Final/peak RSS: **188.43 / 188.43 MiB**. Maximum event-loop lag: **78.32 ms**. Per-client inbound/outbound averages and one-second peaks are retained in the JSON.

The first follow-up attempt removed peer history and enabled teacher deltas but retained repeated plans for students/projector; it **failed** the 5,000 B/s guards ([result](classroom-200-evidence/load-200-history-first-attempt.json)). That evidence is preserved separately. The final run additionally negotiates unchanged-plan/history reuse for all clients. Old clients still get correct privacy-safe full snapshots, but are **not claimed to meet the 5 KB/s target** until delta decoding is integrated. No deployment was performed.

## Delivery boundaries

No production or deployed-session acceptance. No physical/browser UI acceptance. GitHub analysis, AI review latency and provider quotas are outside the local static-analysis load run. Compact history grows with the number of rounds, not peer count; full teacher history is transmitted only when changed on the negotiated path. The bandwidth target depends on UI delta integration as described above. The report and its evidence are local artifacts; no commit/push/deploy was performed.

STATUS: DONE

## Final acceptance

STATUS: WORKING

### Scope and verdict

**No product defects found in the requested final-acceptance scope.** No fixes, implementation edits, commits, pushes or deployments were performed.

Revision: `62760c734a8cc1a55b5347938e6eaac8d1df8564`. Both tests ran from an isolated `git archive` of that revision at `/tmp/classroom-final-ii48wwik/repo`, sharing only the installed dependencies. This avoids incorporating the active, uncommitted `course-*` and Python-worker edits in the main checkout. The requested report append and evidence are the only changes from this acceptance task.

### 200-client load table

Command: `GITZILLA_OPEN_PLAY=1 capmem 8G node --import tsx tools/classroom-load.ts --bots=200 --output=/tmp/classroom-final-ii48wwik/load-200.json`.

**PASS, exit 0.** The unmodified tool creates its own server on a free ephemeral localhost port. No 5173 or production target was used. [Raw per-client measurements](classroom-200-evidence/final-62760c7/load-200.json), [command output](classroom-200-evidence/final-62760c7/load-200.log).

| Traffic metric | Final acceptance |
| --- | ---: |
| Student average bytes/s, p50 across 200 clients | 3,339.52 |
| Student average bytes/s, p95 across 200 clients | 3,757.32 |
| Student average bytes/s, maximum client | 4,057.51 |
| Projector average bytes/s | 2,319.88 |
| Teacher average bytes/s | 110,641.87 |
| Total server egress bytes/s | 786,756.83 |

Every student and the projector remain below **5,000 bytes/s average**. The teacher remains below the harness's 150,000 bytes/s guard. These are raw transmitted application-frame bytes, measured before delta merging. The table therefore confirms the wire savings with the merged client/delta implementation present at the accepted revision.

| Latency | p50 (ms) | p95 (ms) | p99 (ms) | Budget |
| --- | ---: | ---: | ---: | --- |
| Save to own result | 2.69 | 68.10 | 103.78 | p95 < 300: PASS |
| Save to teacher | 181.78 | 259.81 | 304.18 | p95 < 1,000: PASS |
| Server event-loop lag | 10.07 | 10.66 | 17.99 | p99 < 100: PASS |

200-student join time: **310.76 ms**. Duration: **31.46 s**. Own/teacher latency samples: **1260 each**. Reconnects: **10**; refresh-style reconnects: **5**. Unexpected drops: **0**; errors: **0**. Server-only CPU: **2,886.92 ms**, **9.18% of one core**. Final/peak RSS: **190.86 / 191.19 MiB**. Maximum event-loop lag: **91.88 ms**.

### Real-browser pass

**PASS: 51 checks; no product defects.** [Result and audits](classroom-200-evidence/final-62760c7/result.json), [browser log](classroom-200-evidence/final-62760c7/browser-run2.log), [read-only acceptance script](classroom-200-evidence/final-62760c7/browser-acceptance.ts).

- Real `server/main.ts` + Vite on **http://127.0.0.1:60815**, with `GITZILLA_OPEN_PLAY=1`, `capmem 8G`, `PUBLIC_URL` set to that localhost origin, and isolated temporary room/storage files. Receipt publication was disabled. [Local server log](classroom-200-evidence/final-62760c7/server.log).
- Chromium, separate browser contexts: teacher **1440×1000**, three students **393×852**, projector **1440×1000**. The browser runner also used `capmem 8G`. No physical-device or Safari claim.
- Room **KZLI** contained exactly **200 students: 3 real browser students + 197 WebSocket students**, plus teacher and projector.
- The teacher used the actual lesson editor to author a mixed step, a question with the answer 42, an evidence check, and `main.py` starter code. Enter preserved the function-body indentation. No course-generation route mock, direct room-state mutation, or plan injection was used.
- Each browser student received the authored starter, edited it through the in-app editor, submitted the code and answered the question through the UI. Bots submitted corresponding code and answers. All 200 received a mixed score of 100.
- Teacher actions through the UI: **start → attack → reveal → next → finish**. The three student views and projector each displayed correct **0/200**, **200/200**, and next-step **0/200** counts at the relevant stages. The projector's revealed question board and debrief also displayed 200 students and anonymous aggregate scores.
- The real client sent `classroomDelta: true` in all five browser contexts and rendered updates after receiving deltas. The passive WebSocket audit observer did not alter incoming frames or the application's decoder.
- **0 browser `pageerror` events; 0 protocol/socket errors; 0 privacy violations.** Raw non-teacher welcome/lobby/classroom frames contain only the viewer's roster/attack/report entries. An additional raw-text scan of all four browser non-teacher captures found no other student's test name. The projector's visible text contained no peer names. All 197 WebSocket students also passed the own-identity frame audit.
- External HTTP requests were deliberately blocked by the browser harness to keep the pass local. This produced one font-resource `net::ERR_FAILED` console entry per page, corresponding to the external font stylesheet in `index.html`; these are test isolation effects, not JavaScript page errors. The full console entries are retained in the result file.

Visual evidence inspected: [authored starter, teacher 1440](classroom-200-evidence/final-62760c7/teacher-authored-1440.png), [student 393 after submission](classroom-200-evidence/final-62760c7/student-submitted-393.png), [anonymous projector reveal](classroom-200-evidence/final-62760c7/projector-reveal-200.png), [teacher reveal](classroom-200-evidence/final-62760c7/teacher-reveal-1440.png), [projector completion](classroom-200-evidence/final-62760c7/projector-complete-200.png). Raw browser frames are stored alongside these images; welcome tokens are redacted.

### Defects

**None found within this acceptance scope.** No implementation fixes were made. The task-owned local server is shut down after evidence collection.

STATUS: DONE
