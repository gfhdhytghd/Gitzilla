DONE (rubric) — server frozen for take-lead isolated-copy verification; prior owner cards DONE

Current infrastructure: DEV/testing is `http://localhost:5175`. Port 5173 and `https://gitzilla.wilflin.me` are stable LIVE from `../gitzilla-live`; never start/stop/test them. Only the coordinator deploys live.

# codex-net — server

Implemented the complete server task card in `server/`. No shared files, package manifest, other implementation directories, or git commits changed. No npm dependencies added. Real analysis/ and sim/ imports are wired; no stubs remain.

## Delivered
- `server/main.ts`: HTTP on PORT/default 5173, host 0.0.0.0; same-port Vite middleware/HMR in dev; production `dist/` with SPA fallback; optional HTTPS_KEY/HTTPS_CERT; printed LAN URLs; clean signal shutdown.
- `server/rooms.ts`: 4-letter rooms, first-player ownership, immediate owner transfer on disconnect, eight-player cap, spectator support, token resume (same ID/kit, active tab takeover, match snapshot/autopsy restore).
- Repo/boss analysis broadcasts analyzing/ready/error; stale async requests cannot overwrite newer picks. Owner-only start/boss/rematch. Start requires >=1 ready connected player and ready boss; empty players stay outside the match. Boss kit regenerates for actual squad size.
- Authoritative 30Hz fixed steps and 20Hz snapshots; per-client input ack, consume dash/skill once, normalize movement, idle after 300ms input silence; events buffered between broadcasts so none are dropped.
- Final snapshot, autopsy phase/result, and rematch retaining repos. Autopsy includes the real analyzed heart file path (server retains profile even though BossKit has no heart field).
- POST `/api/room` -> 201 `{room}`; GET `/api/fallbacks` -> `string[]`; GET `/api/qr?text=...` -> SVG QR.
- Vendored qrcode-generator 1.4.4 with MIT notice/license and npm SHA-512 verification (`server/vendor/`), no runtime dependency.
- `server/smoke.ts`: real 4-client WS smoke, fallback analysis, boss/start, 30Hz random inputs for 5 seconds, >=50 snapshots per client, advancing ack/time, HTTP endpoint assertions.
- `server/rooms.test.ts`: five real-WS protocol tests including owner/spectator rules, owner transfer, token/kit resume, ready-player subset start, mid-match screens/resume, stale analysis/error, tick/snapshot events, one-shot inputs/input expiry, player-count scaling, actual heart autopsy/rematch, and QR markup.
- `server/README.md`: startup, HTTPS, API response shapes, protocol and smoke instructions.

## Validation — final at 14:24 local
- `npx vitest run server/rooms.test.ts`: **5/5 PASS**.
- `npm run typecheck`: **PASS**.
- `npm test`: **59/59 PASS**, six test files (merged workspace at that moment).
- `npx tsx server/smoke.ts` against the actual `server/main.ts` already running on 5173: **PASS**, 4 clients received **100,100,100,100** snapshots in 5s; HTTP room/fallback/QR, four-player state and input ack/time checks all pass.
- Isolated production HTTPS/WSS server on 5174 with temporary self-signed cert + `NODE_EXTRA_CA_CERTS` + `SMOKE_URL=https://localhost:5174`: **PASS**, same **100,100,100,100** snapshots; certificate trusted explicitly, TLS verification stayed enabled.
- QR SVG rendered with ImageMagick and scanned by `zbarimg`: **PASS**, exact original LAN join URL recovered.
- Production `/r/TEST` without a client build returns the intended **503** JSON prompting `npm run build`.
- `npm run build`: **PENDING UI owner**, fails because `client/app/main.ts` does not exist yet. Full production static SPA response / visual UI acceptance therefore **unverified**. Server implementation complete; rerun build when UI lands.
- Teammate-owned default server on 5173 left running. Stopped only my duplicate failed watcher and isolated 5174 HTTPS test server.

## Contract requests
None. Real autopsy heart is populated in server/ without a shared contract change.

## Coordinator follow-up
- Once UI entry point lands: run `npm run build`, `PORT=5174 npm start`, and confirm `/`, `/r/ABCD`, and built assets are served. The server smoke command can be repeated with `SMOKE_URL=http://localhost:5174`.
- Preserve API fallback response as a plain JSON string array (documented in server/README.md).

## Follow-up in progress
- Authorized scope now includes package.json scripts only in addition to server/ and this log.
- Added `dev:https`, cached openssl certificates with localhost + loopbacks + every detected LAN IP SAN, terminal half-block QR on boot and room creation, optional 5180 HTTP -> HTTPS redirect.
- Boot creates a joinable room so the terminal QR points directly at `/r/ROOM`.
- Coordinator contract change noted: BossKit.heart now required, BossState.regions now sim-owned; server forwards regions unchanged and retains actual analyzed heart in autopsy.
- Re-running integration checks now that client/app/main.ts exists. iOS device trust/motion acceptance remains unverified until tested on hardware.

## HTTPS follow-up validation (14:28 local)
- `PORT=5174 HTTP_REDIRECT_PORT=5181 npm run dev:https`: PASS; auto-generated `.cache/tls` certificate, printed all LAN addresses + boot room QR + screen URL, started HTTPS/WSS and redirect.
- Verified openssl SAN output includes localhost, IPv4/IPv6 loopbacks and every detected LAN IP.
- `NODE_EXTRA_CA_CERTS="$PWD/.cache/tls/cert.pem" SMOKE_URL=https://localhost:5174 npx tsx server/smoke.ts`: PASS, 100 snapshots per client over 5s; smoke now also asserts `BossKit.heart` and sim-owned `BossState.regions` core region.
- HTTP `http://localhost:5181/r/ABCD?screen=1`: 308 Location `https://localhost:5174/r/ABCD?screen=1` as expected.
- Terminal Unicode QR independently expanded to pixels and scanned with zbarimg: exact HTTPS LAN room URL recovered.
- Added a TLS test proving SAN coverage, cached-certificate reuse, regeneration for new LAN IP, and supplied-cert precedence. Focused server suite 6/6 PASS.
- Full `npm test`: 89 PASS / 2 SKIPPED. Typecheck/build pending `client/app/{autopsy,game,lobby}.ts` from UI owner; idle-waiting as requested, then will rerun build + smoke.
- iOS manual certificate trust documented with Apple Support source https://support.apple.com/en-us/102390; no physical iOS DeviceMotion acceptance claimed.
- Server-side UI integration fix: UI renames by reconnecting with `hello.resume` + a new name; resumed sessions now refresh the lobby name instead of silently retaining the old one. Covered by the real-WS resume test.

## Post-UI integration (14:32 local)
- After game/autopsy/lobby modules landed: `npm run build` PASS (UI stylesheet still not written; Vite warning), `npm run typecheck` PASS, HTTPS smoke PASS with 100 snapshots/client over five seconds.
- Latest full tests: 103 PASS / 2 SKIPPED / 1 sim test failing because bot runner now emits player counts [1,4,6,8] while test expects [1,4,8]. Not a server issue; leave sim owner files unchanged.
- Coordinator follow-up: integrate design/ using codex-gemini's forthcoming exact handoff; keep lobby immediately ready on deterministic seed kits, then apply/broadcast cosmetic-only updates asynchronously. Stats must not change. No implementation guess before handoff exists.

## Tunnel and production handoff (14:33 local)
- `PUBLIC_URL` now overrides printed join URLs, terminal QR payloads and printed big-screen URLs. `npm run dev` defaults it to `https://repokaiju.wilflin.me`; an exported PUBLIC_URL takes precedence. Restart an existing npm dev watcher to load the changed package script environment.
- `dev:https` remains secondary and uses LAN addresses unless PUBLIC_URL is explicitly exported.
- **Handoff to claude-ui:** build big-screen join/QR payloads from `location.origin + '/r/' + room`, so the public tunnel's HTTPS origin is preserved automatically. Existing `/api/qr?text=...` accepts the URL unchanged. No client/ edits by codex-net.
- Production HTTPS check PASS on isolated port 5174: `/`, `/r/ABCD`, `/r/ABCD?screen=1` return exact built index.html; built JS asset returns exact bytes + JavaScript MIME; HEAD returns no body. Production 4-client WSS smoke PASS, 100 snapshots/client over 5s.
- Awaiting codex-gemini's exact API handoff before adding async cosmetic design wiring.

## Gemini / Hall / AI-fill implementation (14:37 local)
- Read codex-gemini's now-ready exact handoff and actual typed exports. Main wires fallbackHero/fallbackBoss/apply helpers for immediate ready seed kits; background designHero/designBoss results update only appearance fields. Async revision checks protect newer repo selections, and match-start boss scaling reapplies the existing design. Late results update retained lobby kits for the next rematch while running simulation keeps its cloned kit. No stats cross the cosmetic boundary.
- Provider provenance: Gemini owner reports HTTP 402 on live generation and truthfully precomputed fallback designs. Integration works with bundled/cache/fallback data; successful live Gemini art remains externally blocked, not claimed here.
- Hall: imported `recordMatch`/`top` per codex-repo handoff. GET `/api/hall` returns the board; authoritative match-completion branch records once after autopsy/heart correction and catches persistence errors so players still get results. No duplicate browser upload / POST ingestion path.
- AI fill: shared `setBots` + LobbyPlayer.bot contract now supported; owner-only, lobby-only 0..7 bots with total squad <=8. Bots get random famous fallback repos via zero-network `offlineProfile`, ready seed design kits, `[BOT]` names, and 30Hz `sim/bots.ts` controllers. Humans displace a bot if a full lobby needs a human slot. Owner transfer only selects humans. Rematch retains bots; setBots 0 removes them. At least one ready human is required to start; boss HP scales for humans + bots.
- UI handoff: owner stepper sends `{t:'setBots',count}` and derives current count from lobby.players.filter(p=>p.bot). Bot cards use `bot:true`; names also contain `[BOT]`. GET `/api/hall` is available; do not POST completed results from clients, since server records them authoritatively.
- Expanded real-WS tests cover cosmetic readiness/stat isolation/stale jobs/start design preservation, bot authority/fill/controllers/removal/human-priority cap, and once-only Hall recording even on spectator reconnect.
- `npx vitest run server`: 10 PASS. Latest `npm run typecheck`: PASS; `npm run build`: PASS including stylesheet; `npm test`: 133 PASS / 2 skipped.
- Live final server checks underway on isolated HTTPS port 5174, including PUBLIC_URL tunnel QR payload and two humans + two bot movement.

## Final follow-up result (14:38 local)
- HTTPS/TLS certificates, Unicode terminal room QR, optional HTTP redirect, PUBLIC_URL tunnel default, async design integration, authoritative Hall recording/GET and AI-fill server work are complete.
- Final public-tunnel smoke: **PASS**, two humans + two bots, 107 snapshots per human over the five-second input window, moving bots, attached designs, heart/regions, input acks and Hall endpoint shape.
- Final isolated production HTTPS smoke: **PASS** for both four humans (100 snapshots/client) and two humans + two bots (100/client). TLS verification enabled via NODE_EXTRA_CA_CERTS.
- Final build **PASS** including generated stylesheet; typecheck **PASS**; full tests **133 PASS / 2 opt-in browser tests skipped**. Server-focused **10 PASS**.
- PUBLIC_URL override confirmed in actual boot output and new-room output: join/QR/big-screen links use `https://repokaiju.wilflin.me/r/<ROOM>`.
- UI big-screen helper already uses `location.origin` (`client/app/app.ts`), so tunnel-origin QR handoff is satisfied without server agent editing client/.
- Physical iOS motion/trust acceptance is not claimed. Public tunnel is the primary trusted HTTPS workflow; self-signed LAN TLS remains secondary.
- Gemini live generation is externally blocked by provider HTTP 402 per Gemini owner's evidence; bundled/cache/fallback behavior is implemented and tested. Server lobby readiness never waits for it.
- No commits or shared/client/design/hall/sim implementation edits by codex-net. Package changes are scripts only. Stopping only the isolated 5174/5181 test server; default teammate-owned 5173/tunnel server stays running.

## Final coordinator / UI handoff
- Default `npm run dev` now supplies PUBLIC_URL=https://repokaiju.wilflin.me unless the caller exports another URL; restart an existing npm watcher to pick up a package-script environment change.
- AI stepper sends `{t:'setBots', count}`; derive count from `lobby.players.filter(p=>p.bot).length`; `bot:true` is authoritative. Bot names already carry `[BOT]`.
- Hall uses GET `/api/hall`; no client match-result POST, because server records the authoritative autopsy once.
- No outstanding server contract requests or implementation tasks.

## Gitzilla rebrand (14:42 local) — DONE
- Updated server startup banner to Gitzilla, newly generated TLS certificate CN to `Gitzilla Local Development`, and server documentation/exported certificate filename to `gitzilla.cer`.
- Existing tunnel hostname and internal HTTPS environment flag remain operational identifiers. The only remaining `repo-kaiju` text under server/ is a test-only temporary-directory prefix.
- TLS certificate test PASS; owned diff whitespace check PASS. No secrets added and no commits/pushes performed.

## Public tunnel migration
- Updated package dev-script PUBLIC_URL default and all active server README examples to `https://gitzilla.wilflin.me`.
- Vite allowedHosts remains `.wilflin.me`; no Vite configuration edits.
- Earlier tunnel smoke records above are historical results from the former domain, not evidence of the new domain working.
- Initial new-domain probe resolves but TLS hostname verification fails: presented certificate does not cover `gitzilla.wilflin.me`. Keeping verification enabled; testing actual public smoke and local fallback next.
- Other-owner handoff: `docs/tasks/claude-auth.md` still mentions the old domain for OAuth callback/origins; auth owner/coordinator should update that configuration. Vite's comment also still names the old host, but its wildcard rule already permits the new one.

### Domain migration final validation
- Actual public command attempted: `SMOKE_URL=https://gitzilla.wilflin.me SMOKE_PLAYERS=2 SMOKE_BOTS=2 npx tsx server/smoke.ts`.
- Public result: **PENDING tunnel TLS**, `ERR_TLS_CERT_ALTNAME_INVALID`; new host resolves but peer certificate SAN is only `DNS:ai.wilflin.com`. The smoke cannot reach HTTPS/WSS with valid hostname verification yet. Did not bypass TLS verification.
- Local fallback command: `SMOKE_URL=http://localhost:5173 SMOKE_PLAYERS=2 SMOKE_BOTS=2 npx tsx server/smoke.ts`: **PASS**, room KXJE, 100 snapshots/client over five seconds, bot movement + designs/heart/regions/acks + QR/fallback/Hall checks.
- No old tunnel references remain in package scripts or server docs/tests. Historical evidence above retains its former-domain URLs intentionally; it is not a new-domain verification claim.
- Vite allowedHosts remains `.wilflin.me`, unchanged. Existing npm watcher must be restarted to inherit the new package-script PUBLIC_URL default (or launched with PUBLIC_URL explicitly).
- Owned diff whitespace check PASS. No secrets added, commits/pushes, or server restarts by codex-net.

DONE

## Auth0 follow-up in progress
- Read `docs/progress/claude-auth.md` exact server handoff, auth/ API, and analysis token-cache behavior. Applying project Auth0 skill token-handling guidance; no tenant changes, dependency installs, or .env reads/edits.
- Added auth route dispatch before all game/API/Vite routes; retained each WS upgrade request server-side; setRepo resolves getGithubToken for that request and passes it only as analyzeRepo's token option.
- Added async session-based default names for blank-name players, preserving explicit and resumed custom names. Hello gating prevents a queued setRepo racing async session decoding.
- Privacy policy: RepoProfile does not expose visibility. Treat all credentialed analyses as private: no Gemini enrichment and no public Hall recording for that match. Raw profiles, README/tree/heart paths and access tokens are not broadcast for private player selections; only their chosen slug and derived gameplay kit are visible in the room. Authenticated analysis already avoids public disk cache and scopes memory jobs by credential hash.
- Mocked auth/privacy tests and local/new-domain public smoke next.

## Auth0 server card — DONE (14:55 local)
- Imported `handleAuthRoute/getSession/getGithubToken` from auth/ exactly per handoff. Auth HTTP dispatch runs before game/API/Vite routes, with generic handling of provider exceptions so raw upstream bodies never reach clients or logs.
- WebSocket connection retains its actual upgrade IncomingMessage in a WeakMap. `setRepo` resolves that client's GitHub token afresh and passes it only as analyzeRepo options; no token is stored in members/profiles/kits/results, broadcast, logged, cached publicly, or sent to Gemini.
- Blank-name players default to session.login. Explicit names and resumed user-chosen names win. Queued messages wait for async hello/session resolution, without serializing independent analysis jobs or breaking revision guards.
- Private-data boundary: analysis lacks a visibility flag, so all credentialed analyses conservatively skip Gemini enrichment and mark the match non-exportable to public Hall. The room receives only the chosen slug and derived hero gameplay kit, never raw profile/README/tree/internal paths. Anonymous/boss analyses explicitly pass an empty token at the main adapter to prevent ambient GITHUB_TOKEN credentials granting private access.
- Mocked real-WebSocket tests verify two distinct upgrade cookies use their own analysis tokens, GitHub default names/explicit-name resume/anonymous fallback, setRepo queued during async hello, no token or private-profile sentinel on the wire, no private Gemini/Hall calls, anonymous Hall still recording, and sanitized upstream failures. Only obvious dummy credentials occur in test fixtures.
- `npx vitest run server auth`: **26 PASS**. Final `npm run typecheck`: **PASS**. Final `npm test`: **176 PASS / 2 optional browser tests skipped**. `npm run build`: **PASS**.
- Final local smoke: room OFPA, **PASS**, 2 humans + 2 moving bots, **100 snapshots/client** in five seconds; auth/QR/fallback/Hall, kit designs, heart/regions and advancing input acks/time checks pass.
- Final public smoke via **https://gitzilla.wilflin.me** and its **wss://gitzilla.wilflin.me/ws**: room FYSD, **PASS**, 2 humans + 2 moving bots, **107 snapshots/client** over the five-second input window, same assertions pass. Domain TLS now validates normally; no bypass flags.
- Smoke runner now explicitly checks GET `/api/me` returns enabled/user JSON and anonymous GET `/api/me/repos` returns 401 before starting gameplay.
- Actual browser consent + a real private GitHub repo remain **UNVERIFIED**, owned by claude-auth's real-login USER ACTION. No auth tenant, auth/ implementation, shared/, client/, .env or other-owner files edited by codex-net. No dependencies, real secrets, commits or pushes added.

## Auth privacy contract request / future refinement
- Optional future visibility metadata from analysis would let authenticated **public** repos keep Gemini/public-Hall eligibility. Current conservative policy deliberately makes no guess about visibility and completes this card without changing shared/.

DONE

## Room resilience card / infrastructure boundary
- 5173 is stable LIVE from ../gitzilla-live; **never start/stop/test it or the public tunnel**. Shared DEV is http://localhost:5175. This supersedes all earlier smoke/deployment notes.
- Implementing .cache/rooms.json with atomic 0600 writes, debounce on every lobby change, boot restore of identities/resume tokens/kits/boss/bots/privacy flags, and interrupted-match -> lobby notice.
- Unknown four-letter hello codes now recreate that exact room; first player becomes owner. Default smoke origin changed to http://localhost:5175.
- Room persistence is local/private and contains only room resume tokens, never GitHub/Auth0 credentials or private raw profiles. Added HTTP and Vite fs deny coverage for .cache.
- Unit restart tests use temp files and ephemeral ports only. Dev smoke will use 5175; no live deployment by codex-net.

## Room resilience validation in progress
- `npx vitest run server`: **19 PASS**; restart/resume unit scenarios use isolated files and ephemeral servers.
- `ROOM_RESTART_TEST=1 npx vitest run server/restart.integration.test.ts`: **PASS** against three real main.ts Node processes on OS-assigned ports (asserted not 5173 or 5175). Confirms actual boot loading, same resume identity/token/kits/boss after process exit, match -> lobby restart notice, and stale-code self-healing. Test-only ROOMS_FILE override keeps its persistence outside the shared dev store; all children cleaned up.
- Shared DEV briefly refused connections during a watcher reload; an initial subsequent smoke received 39 snapshots while parallel work was landing. Retried once stable: default `npx tsx server/smoke.ts` **PASS** on 5175, room AFXG, four humans and **100 snapshots per client** over five seconds.
- DEV HTTP denial checks: `/.cache/rooms.json` **404**, `/@fs/.../.cache/rooms.json` **404**. `.cache/rooms.json` is gitignored and atomic store files use 0600.
- Latest workspace typecheck **PASS** after parallel required fields landed. Latest full tests: **206 PASS / 6 skipped / 2 unrelated failures** (design bundled boss provenance and sim phase-3 transition); left other owners' files untouched. Rechecking final workspace status next.
- No port-5173/live tunnel requests, process control, deployments, or live-worktree edits during this card.

## ROOM RESILIENCE — DONE (15:04 local)
- Added `server/room-store.ts`: atomic, versioned local room store with 0600 file permissions; main defaults to `.cache/rooms.json`, with ROOMS_FILE override for isolated tests. Every lobby/configuration broadcast schedules a debounced write, room creation/expiry are persisted, match start flushes its marker immediately, and graceful close flushes before dropping sockets.
- Stored state preserves room code/owner, player IDs/resume tokens/names/selected slugs/kits/privacy flags, bot slots/seeds, and public boss state/profile. No requests, cookies, GitHub/Auth0 credentials, private raw profiles, combat snapshots or input history are saved.
- Boot restores rooms to lobby, recreates bot controllers, lets returning tabs reclaim the same IDs/kits with their existing tokens, turns interrupted analyses into retryable errors, and sends a clear Server restarted notice. Interrupted matches restart from lobby with retained repo choices. First returning human takes over if the saved owner is offline; spectators never become owners.
- Unknown valid four-letter hello codes recreate that exact room instead of returning Room not found. First player becomes owner, allowing stale tabs/URLs to recover.
- `server/smoke.ts` now defaults to **http://localhost:5175**. README clearly separates DEV 5175 from stable LIVE 5173/public tunnel and documents restart recovery/testing.
- Added HTTP/Vite `.cache` denial while retaining Vite's existing secret-file deny patterns. Actual DEV direct-cache and @fs requests returned 404; rooms.json is gitignored and actual permissions are 600.
- **Focused server tests: 19 PASS**. New cases cover debounced persistence, shutdown flush, owner/token/kit/boss/bot restore, interrupted match notice/restart, privacy retention without credential/profile persistence, owner-offline recovery and stale room self-heal.
- **Real-process restart integration: PASS**, `ROOM_RESTART_TEST=1 npx vitest run server/restart.integration.test.ts`: three actual main.ts processes, isolated temp persistence and OS-assigned ports (explicitly not 5173/5175), proper cleanup. Normal full test suite skips it by design.
- **Final workspace typecheck: PASS**. **Final build: PASS**. **Final npm test: 208 PASS / 6 optional tests skipped**; earlier parallel sim/design failures are resolved in the merged workspace.
- **DEV 5175 default smoke: PASS**, room AFXG, 4 humans, 100 snapshots/client in 5s. **DEV 5175 bot smoke: PASS**, room UTEQ, 2 humans + 2 moving bots, 100 snapshots/client, auth/QR/fallback/Hall + kit design/heart/regions + input ack/time checks pass.
- No starts/stops/tests against stable LIVE port 5173 or gitzilla.wilflin.me, no ../gitzilla-live edits, no deployment, no commits/pushes. All interactive smoke verification used DEV 5175; restart integration controlled only its own isolated children.
- No outstanding server contract requests for this card. Notice uses the existing ServerMsg error/toast channel; shared/ unchanged.

DONE

## QA-NET-01 priority fix / Genesis queue
- Coordinator assigned Genesis wiring, then reprioritized the malformed-aim match-stopper ahead of it. Genesis task/handoff inspected; analysis onProgress and genesis/buildGenesis were not landed at initial read. Will return to Genesis after QA reproductions pass.
- Added full InputFrame sanitization: safe nonnegative integer seq, finite/clamped/normalized move, null-or-finite normalized aim, boolean coercion, source enum fallback, unknown fields discarded. Bot output passes the same boundary.
- Isolated a thrown sim step: log only the room/tick-drop message, replace held inputs with idle while retaining sequence, skip the failed tick without replaying it, keep match/snapshot timers and lobby phase running. Raw error/input/private data are not logged.
- Regression tests cover malformed/nonfinite/overflow inputs and recovery after an injected throwing sim frame. Running coordinator QA repros next; DEV 5175 only.

## QA-NET-01 — fixed before Genesis
- `npx vitest run server/input.test.ts server/rooms.test.ts`: **22 PASS**.
- `QA_REPRO=1 npx vitest run qa/robustness.test.ts`: **4 PASS**, including the malformed-aim repro and 20 completed accelerated real-sim matches with interval cleanup.
- `npx tsx qa/protocol.ts` on DEV 5175: **9/9 PASS**. Evidence: `qa/artifacts/protocol-2026-10-24T19-27-45-842Z/summary.json`; malformed aim no longer stops the live DEV match.
- `npm run typecheck`: PASS. No live/5173/tunnel access.
- Returning to Genesis wiring now: codex-genesis builder and codex-repo onProgress APIs have landed and their exact handoffs were read.

## Genesis implementation in progress
- Read codex-genesis's completed handoff and actual buildGenesis, plus codex-repo's onProgress API. Main now wires the pure builder and forwards onProgress alongside the token option.
- Room broadcasts coalesce progress across repo jobs at <=8 Hz (125ms), retaining only each job's latest event and max eight paths. Revision/status guards discard superseded/finished-job callbacks. Terminal map/design/ready state transitions remain immediate; streaming telemetry does not trigger repeated disk writes.
- Seed-ready human/bot/boss entries receive Genesis. Gemini-pending entries expose design progress; completion or failure returns ready, rebuilding the trace for the actual final kit. Boss Genesis is rebuilt after squad-size scaling at start.
- Credentialed Genesis is permitted inside the room per the new card, while external Gemini/Hall remains disabled. Private Genesis/progress/source-derived kit code/design/title are excluded from the persistence file; resume still preserves gameplay stats/seed/slug. Public Genesis persists for replay. Recognizable credentials are filtered by the builder (no auth options enter it).
- Adding transport/throttle/stale-job/design/bot/private-room/persistence tests and DEV-only smoke assertions next. Live 5173/tunnel remains untouched.

## DONE (genesis) — server transport + replay wiring
- Pure builder is wired in main. Human/bot/boss ready entries receive Genesis, final optional art refreshes it, and boss squad scaling rebuilds it. Live progress is coalesced per room at ~8Hz with request-revision guards and <=8 paths/event; map/design/ready state transitions are immediate.
- Fast cached stages can coalesce inside one 125ms window; the complete real Genesis payload supplies the replay (explicit cached-websocket regression added). No artificial analysis delays or invented file paths.
- Credentialed Genesis is ephemeral inside its room per the new card; private source-derived Genesis/progress/code/design/title are not persisted. Private Gemini/Hall exclusion remains intact. Builder credential filtering is exercised by a private in-room test.
- Focused server input/room + Genesis tests: **70 PASS** across four files at latest run. Tests cover real helper output, bot/boss/human attachment, public replay across restart, progress throttling, stale callbacks, design success/failure and credentialed ephemeral data.
- Actual DEV 5175 lobby wire check **PASS**: Flask Genesis has real sample paths and nonempty trace. Full five-second fight smoke was interrupted at 20 snapshots during active source reloads; do not claim throughput acceptance for that attempt.

## DONE — UX audit P0-3 (mistyped room codes)
- Unknown hello now self-heals ONLY with a nonempty string resume token. Fresh unknown hello returns Room not found without creating anything. Codes require four letters A–Z; digit-containing codes get a clear error.
- Added GET `/api/room/<CODE>` -> `{exists,players,phase}`. Missing rooms return `{exists:false,players:0,phase:null}` without creating a room; invalid codes return HTTP 400.
- Unit tests and actual DEV 5175 checks **PASS** for existence/player counts, digit rejection, fresh unknown rejection and resume-only self-heal. Updated isolated restart integration test to supply a stale token.
- UI handoff: use GET lookup before a fresh join; do not send a resume field for a first-time/mistyped-code join. Existing remembered-token tabs retain self-heal.

## Current queue — latest EDU PvP overrides all earlier boss-based edu notes
- Read the new top of docs/tasks/edu.md plus docs/social-impact.md. Nullable boss assumptions fixed in server completion/Hall and battle smoke checks; no server diagnostics remain in the current global typecheck, while many other-owner null-boss updates are still landing.
- Next: persisted owner setMode, 30-student capacity, no-boss >=2-player start, code-quality kits/report-card regeneration on mode changes, teacher projector ownership/control, separate/skipped edu Hall, PvP bots/real sim integration once the new factory lands. Social-impact battle fields will pass through unchanged; MotionProfile remains client-only.
- Main API safety boundary remains DEV 5175 only. Smoke now rejects live/non-loopback/non-5175 targets and tolerates a brief initial DEV watcher restart without falling back to live.

## EDU classroom PvP implementation in progress
- Following only the NEW top of docs/tasks/edu.md: boss-free FFA, code-quality report cards, <=30 students, >=2 ready fighters (bots allowed), teacher projector can own/control without playing. Earlier boss-based edu behavior is superseded.
- Added persisted mode/teacher identity and owner-only lobby setMode, mode-specific capacity, no-boss edu start, mode-aware kit derivation/regeneration, optional profile re-fetch after restore, and nullable-safe autopsy/Hall handling. Edu is skipped by the battle Hall. Player profiles remain memory-only; private quality tips are redacted in persisted kits.
- Teacher API proposal implemented: POST `/api/room?mode=edu` creates an edu room; first screen to join becomes teacher/owner, occupies zero student slots, can setMode/setBots/start/rematch, and can resume its screen token. UI should remember that screen resume token separately and enter `?screen=1`; teacher resume reclaims projector ownership.
- Snapshots/lobby common JSON is encoded once per broadcast (per-client ack wrapper only), avoiding 30 repeated serializations for a classroom.
- Sim factory signature now accepts null boss/options but real PvP implementation and quality mapping were still being written at last read. Server refuses edu start until quality arrays exist; real-game acceptance awaits those owner modules. Adding mocked-protocol + full-class capacity tests meanwhile.

## Handoff → claude-ui / coordinator (EDU PvP + teacher flow)
- `POST /api/room?mode=edu` creates a classroom immediately; response remains `{room}`. Enter `/r/ROOM?screen=1`. First projector screen claims teacher ownership (even if students arrived first), occupies zero student slots, and can setMode/setBots/start/rematch.
- **Remember and send that screen's welcome.token on screen reload/reconnect**, separately from the player's resume token. Server persists the teacher screen identity/role and lets its token reclaim teacher ownership after a disconnect or restart. Current client net.ts only remembers player tokens; this needs the UI owner.
- Student capacity is 30 in edu / 8 in battle. Bots retain the current contract's 0..7 count and get displaced by arriving humans at capacity. Classroom start needs >=2 ready fighters (bots allowed), no boss; all kits must carry quality rows. Teacher need not pick a repo or participate.
- Owner-only setMode is lobby-only, persisted, and regenerates students' kits/report cards for the selected mode (keeping appearance). A battle switch is rejected while >8 humans are connected; no students are kicked out. Room info endpoint still returns exactly exists/players/phase.
- Edu autopsy/null boss/ranking is broadcast intact and never enters the public battle Hall. Battle social-impact metadata is passed intact; MotionProfile stays client-only and isn't added to network inputs.
- Common lobby/snapshot JSON is encoded once per broadcast to reduce 30-student CPU work; acknowledgements remain per-client.
- Protocol tests now cover all these paths, including 30 actual WebSocket student connections, teacher reclaim and mode persistence. Real classroom physics acceptance is pending codex-sim's in-progress PvP factory.

## EDU PvP protocol validation (15:43 local)
- Focused server input/room tests: **33 PASS** after adding teacher/30-student/mode/quality/null-boss/ranking/Hall and social-impact metadata coverage.
- Mode switch regenerates kits from memory-only source profiles or fresh request-scoped analysis, preserving appearance. Restored mismatched kits refresh when a player resumes; private source remains unpersisted. Bulk mode mapping batches lobby broadcasts.
- Added `server/classroom-smoke.ts`, DEV-loopback-5175-only, bounded snapshot history, teacher + 2..30 student connections, optional bots, quality/Genesis assertions, null-boss/heroScale/PvP state and 5s input/snapshot checks. Actual classroom run next once codex-sim's real factory is ready; no fake combat acceptance claim.
- Battle autopsy/Hall hook test confirms fragile/maintainers/issues/parasites, repoIssues and busFactor are passed intact, with no fabricated issues/advisories. Accessibility MotionProfile remains client-only.
- Repeated file-watch reloads interrupted earlier fight smoke attempts; Genesis/P0 actual lobby/HTTP wire checks passed separately, and QA-NET-01 repro passed on actual DEV. No live interactions.

## High-priority explicit LEAVE — before edu closeout
- New user card preempts final edu handoff. Implement `{t:'leave'}` in every phase: remove membership, revoke resume token durably, transfer ownership to a remaining human, close with code **4002** / reason **left**, and delete/flush the room when no connected human/screen remains (bots do not keep it alive).
- UI handoff: clear the room/player-or-screen resume token, stop reconnecting on 4002, navigate to landing/create flow. A revoked token must not auto-recreate an unknown room via the stale-tab self-heal rule.
- **URGENT sim handoff / contract request:** please add optional `Match.removePlayer?(id: string): void` to battle AND ClassroomMatch. The server will call it on explicit leave so simulation targets/bullets/player/score/revive/quiz state truly lose the hero while others continue. Current public Match API has no removal method; no server reflection into private sim fields or match reset will be used. Server-side membership/snapshot/result filtering can land immediately, but full physical removal acceptance needs this hook.
- Teacher screens count as human occupants; ordinary socket drops retain resumability. An explicit last-human leave closes the abandoned room and revokes all remaining dormant room tokens, rather than allowing bots/ghost slots to resurrect it.
- Edu real acceptance already passed before this card: XATY teacher+2 students, GAAI teacher+30 students (99–100 snapshots each/5s), EFED teacher+2 bots, JAEA battle regression. Full tests 449 PASS / 7 optional skips, final typecheck/build PASS; actual four-process restart test now also restores edu teacher + quality cards and restarts null-boss PvP. These results remain distinct from pending explicit-leave acceptance.

## LEAVE server implementation / handoff (16:02 local)
- Implemented explicit leave before phase/role guards (players + projector screens). Code **4002**, reason **left**. Membership, held inputs, ephemeral profile, queued analysis/progress and resume identity are removed; ownership passes to a connected human player, then screen. Bots never receive ownership.
- Last connected human's explicit leave stops timers and deletes the room, also revoking dormant room identities. Atomically flushes rooms.json before socket close. Revoked tokens are stored only as SHA-256 tombstones, backwards-compatible with existing room files, and checked before stale-code self-heal and after async hello auth.
- Hook `Match.removePlayer?(id)` is called; departed IDs are excluded from ongoing wire snapshots/autopsy. **Physical sim removal still awaits codex-sim hook**, requested in the section above and coordinator question. Do not claim that piece complete until real sim tests pass.
- UI owner: handle 4002 as terminal, remove `kaiju.token.ROOM` / `kaiju.screenToken.ROOM`, clear reconnect and navigate to landing/create. The server rejects the revoked token even after restart.
- Focused input/room tests: **38 PASS** including leave in all three phases, human/screen owner transfer, bots continuing, no-human deletion, durable revocation, fresh rejoin and stale-analysis suppression. Fixing one test-only type-narrowing diagnostic before global checks.

## LEAVE real-sim gate (16:02)
- Added mandatory real battle + edu transport regressions in `server/rooms.test.ts`, using actual offline profiles/kits/factory/bots. **Currently 2 FAIL as expected at the missing removePlayer hook assertion**, before attempting leave. These are acceptance gates, not a known net regression; codex-sim must land the hook. Run `npx vitest run server/rooms.test.ts -t 'real .* sim'` after that handoff.
- Actual main.ts **five-process** restart test PASS: edu participants leave mid-fight, teacher leaves last, HTTP lookup confirms deletion, fifth fresh process rejects all three revoked tokens with 4002 and does not self-heal the deleted room.
- Latest build PASS, typecheck PASS; pre-gate full regression 471 PASS / 7 optional skips. DEV battle smoke WKZN passed 99 snapshots/client/5s; now extending it to assert explicit leave/owner/deletion/revocation too.
- Expanded actual DEV battle smoke AKEH PASS: 2 humans + 2 real bots, 100 snapshots/client/5s, explicit owner leave, live teammate stream/owner transfer, last-human deletion with bots, revoked-token rejection after deletion. This proves transport/lifecycle; physical sim removal remains the explicit missing-hook gate above.

## Motion-v3 trace upload — implemented / handoff → codex-input (16:06)
- Coordinator dispatched sim.removePlayer to codex-sim; proceeding with queued motion-v3 per instruction, then will rerun the real removal gates once `DONE (removePlayer)` lands.
- `POST /api/trace`: send `Content-Type: application/json`, body = your raw trace object (or sample array). No rigid sensor schema, so your UA/platform/orientation/motion/rotationRate/gesture/training fields survive unchanged. Success **201 `{id: "<milliseconds>-<random>.json"}`**. Invalid JSON/primitives 400, wrong content-type 415, >2 MiB actual bytes (including chunked uploads) 413.
- Stores only that JSON body at `.cache/traces/<id>`, file mode 0600; no cookies, auth token, IP, session or server-side personal metadata added. Keeps latest 200 trace files; other filenames untouched. `.cache` remains denied through HTTP/Vite.
- `GET /api/trace/list`: **200 `{traces:[{id,bytes,createdAt}, ...]}`**, newest first, metadata only. Local TCP peer + localhost/loopback Host required; forwarded/public tunnel requests get 403 even if their proxy TCP peer is loopback. Use `curl http://localhost:5175/api/trace/list` locally. No public read endpoint was added.
- Added isolated `TRACES_DIR` override for process tests. Endpoint unit tests **5 PASS**: exact 2MiB, oversized advertised/chunked byte counts, JSON/method errors, retention, file privacy and tunnel-list denial. Actual main.ts process test next.
- Added requested `.webmanifest: application/manifest+json` production MIME mapping; existing SVG MIME unchanged.
- Motion-v3 actual entrypoint acceptance PASS: isolated production main.ts upload/list, public-proxy-list 403 and .cache raw-file 404; production manifest returns application/manifest+json and valid JSON. Five-process leave/revocation/restart test still PASS.
- Build PASS after the manifest copy. Latest root typecheck saw other-owner transient audio/tools and mid-edit sim.removePlayer diagnostics; no server diagnostics. Will recheck after removePlayer DONE rather than editing their files.
- DONE (motion-v3 server): actual DEV 5175 upload/list PASS, forwarded list denied and raw .cache path 404. Uploaded probe is explicitly labeled SYNTHETIC (ua/platform), not a phone measurement; no real-phone gesture/tuning acceptance claimed. README + input-owner handoff above specify the exact endpoint contract. Manifest MIME actual production response verified too.
- Root typecheck now PASS (16:08), after other-owner edits settled. Sim hook implementation is present; waiting for the requested DONE (removePlayer) marker before final validation. Server keeps filtering departed ranking rows per the user's latest explicit "autopsy: just remove" instruction; no historical-left row exposure unless coordinator requests that behavior.

## Final merged validation after DONE (removePlayer) (16:09)
- Sim handoff landed and marked DONE (removePlayer). Real battle + classroom removal gates now passed inside the full suite; no server test failures. Actual classroom smoke DJQY PASS: 2 students + 1 bot + teacher, 100 snapshots each/5s, student removal, teacher leave and deletion. Actual battle GYVQ PASS: 2 humans + 2 bots, 99 snapshots each/5s, owner transfer, deletion, revoked-token denial.
- Latest build PASS (only existing player/boss chunk warnings). `ROOM_RESTART_TEST=1 npm test` → **475 PASS, 23 FAIL, 6 optional skips**. The 23 failures are all `client/input/index.test.ts`, current motion-v3 edits, TypeError reading window.location.search in createInput ~448. This is an input-owner handoff, not a server failure; do not edit their files.
- Latest typecheck during motion-v3 edit failed only in `client/input/touch.ts:49,50`: string event-name overload with a PointerEvent listener vs EventListener. Previously passed before the new input edit. No server diagnostics. Input owner/coordinator: please resolve these two current merged gates in your scope; server focused suite is being recorded independently.
- Server activeResult continues removing departed ranking rows per the user's explicit autopsy removal requirement; sim may retain detached historical left rows internally. No shared changes needed by net.
- Final owned suite: `ROOM_RESTART_TEST=1 npx vitest run server` → **47 PASS** across 5 files, including actual battle/classroom physical removal, trace caps/retention/access, TLS helper and five-process persistence/revocation/manifest checks.
- Input owner's mid-edit location issue has since been fixed: focused input/index suite now **25 PASS**. Re-running full suite once against that change. Latest typecheck still has external motion-v3 typing in input profile tuple/touch listeners and app/placeholders' new InputController fields; no server errors.

## DONE — codex-net final handoff (16:11 local)
- All queued server owner parts complete: explicit leave in every phase (physical sim removal, durable resume revocation, human/projector ownership transfer, no-human deletion), classroom PvP/teacher/capacity/quality wiring, Genesis/progress, motion-v3 trace upload/local listing, and production webmanifest MIME.
- `ROOM_RESTART_TEST=1 npm test`: **519 PASS / 6 optional skips**, 46 files passed. Server-only suite: **47 PASS** across 5 files, including real battle/classroom factory removals and five actual main.ts processes.
- Final `npm run build`: **PASS** after latest modules landed; only existing static/dynamic player/boss import warnings.
- DEV battle GYVQ: 2 humans + 2 bots, 99 snapshots/client/5s; leave/owner/deletion/revocation PASS. DEV classroom DJQY: teacher + 2 students + 1 bot, 100 snapshots each/5s; student/teacher leave + deletion PASS. Earlier full-class GAAI had 30 actual students (99–100 snapshots/5s); no render/device claims implied.
- Latest root typecheck is down to **one external error**: `tools/motion-v3.ts:197` TS2322 (null acceleration not assignable to DeviceMotionEventAccelerationInit | undefined). Input owner: fix the synthetic nullable-acceleration typing in your tool; server has no diagnostics. Earlier input/location/tuple/touch/placeholder issues are superseded by this latest result.
- Trace acceptance: 5 unit tests, actual DEV upload/list, isolated production entrypoint and raw-cache denial all PASS. Exactly 2MiB accepted, over-limit chunked/advertised bodies 413, last 200 retained, forwarded/public-host lists 403. Probe was explicitly SYNTHETIC; real-phone motion evidence belongs to input owner.
- **No commits/pushes, no shared/ edits, no changes outside authorized server/progress paths, no stable-live/5173/tunnel interactions.** Only coordinator deploys. Continue idle integration checks when requested/new modules need a server adapter change.

## Private boss + DEV HMR follow-ups (16:20)
- Applying repository Auth0 skill's token/security guidance; existing request-scoped auth resolver reused, no SDK/tenant/credential changes. Owner-only setBoss resolves the caller's own ws upgrade cookie token before analyzeRepo; stale token lookups are revision/socket/ownership guarded. No token stored or broadcast.
- Credentialed boss analyses use seed art, skip Gemini and exclude the entire match from Hall, even if all heroes are public. Analysis/auth errors redact upstream credential details. Anonymous replacement bosses clear the privacy flag and can publish public matches again.
- Private boss source/kit/Genesis/progress stay memory-only. Persist only the chosen slug + privateBoss flag + retryable reconnect/reselect notice; fresh authentication/reselection is required after restart. Public bosses retain existing full persistence. No changes to shared/.
- 39 room tests PASS, including private-boss-only Hall/Gemini exclusion, owner vs teammate token scope, public replacement, restart redaction/reauth and generic auth/analysis errors. Typecheck PASS.
- HMR E2: local installed Vite source shows server.port drives the bad direct fallback; setting it to PORT fixes localhost:5173. Browser clientPort/protocol stay inferred from its own URL, preserving localhost 5175 AND HTTPS-tunnel 443 without forcing either onto the other. Actual DEV injected HMR config + vite-hmr WS handshake PASS at 5175; no live/tunnel request made. Added regression assertions/handshake to existing server/smoke.ts.

## Private boss / HMR validation and cross-owner handoff (16:21)
- Actual DEV DWEQ smoke PASS: 2 humans + 1 bot, 99 snapshots/client/5s; HMR injected fallback = 5175, browser port/protocol inferred, real vite-hmr handshake connected on 5175; battle/leave/owner/deletion/revocation checks PASS.
- Build PASS after changes; no stable live, 5173 or public-tunnel request was made. Keeping HMR's browser clientPort inferred is necessary to support BOTH localhost:5175 and HTTPS tunnel port 443; setting a global clientPort:5175 would break the latter. server.port now drives the correct direct fallback.
- `ROOM_RESTART_TEST=1 npm test`: **560 PASS / 2 FAIL / 6 optional skips**, all server tests passed. Failures are external weapon-name expectations: design/index.test.ts:190 bundled hero weaponName alloc(name_long()) vs validation unsafe{} Cannon; genesis/index.test.ts:82 expects unsafe{} Cannon but actual alloc(name_long()). Design/Genesis owners: reconcile the new source-derived weapon labels/fixtures in your scope.
- Latest typecheck only has external client/edu/report.ts:192,203 missing STAT_LABEL. Edu owner: resolve the missing label reference; no server errors.

## DONE — private boss auth + HMR E2 (16:22)
- `ROOM_RESTART_TEST=1 npx vitest run server`: **49 PASS** / 5 files; private boss token/privacy/persistence/reauth tests included. Private bosses intentionally require owner re-auth/reselection after restart to keep source data off disk.
- DEV 5175 HMR handshake + full battle/leave smoke DWEQ PASS. Vite fallback uses 5175; browser scheme/port stay same-origin for tunnel compatibility. No live/tunnel access.
- Build PASS. Latest full-suite/typecheck cross-owner failures are documented above (design/Genesis weapon-name fixtures and edu STAT_LABEL), with no server diagnostics/failures. No shared edits, commits, pushes or live-server controls.

## Controls readiness — implementing / handoff → claude-ui (16:54)
- Coordinator explicitly authorized now; shared controls/controlsReady contract is present. Server stores ready + MotionProfile per player, broadcasts controlsReady on every lobby/welcome, accepts controls messages in lobby/match/autopsy, and leaves repo analysis status separate. Screens are ignored; bots are always ready.
- Initial mobile User-Agent / Sec-CH-UA-Mobile joins are false; desktop keyboard joins are true. UA is only the initial hint: UI must explicitly send `{t:'controls',ready:false,mode}` whenever sensor permission/events are missing (including iPad desktop-style UA), and ready:true for keyboard/touch choice or granted+live sensors.
- **Send a controls report after EVERY welcome, even when the cached local boolean has not changed.** Server resets mobile readiness on every WS hello (new page and network resume are indistinguishable in hello). Same-page network resumes may immediately re-report true without re-prompting if permission/sensors are still valid. Saved choice/room persistence never restores readiness.
- START now rejects ready-roster fighters whose controlsReady is false, naming/counting them: `2 phones need to tap enable motion: Alice, Bob`. No kick/pause mid-fight; in-game overlay recovery remains UI/input owned. Unconfigured repo clients remain outside the ready squad as before.
- Controls reports are ephemeral (not persisted), duplicate values are coalesced, malformed booleans/modes rejected. Adding mobile-UA real-WS reconnection/start/persistence tests now; DEV only, no live interaction.

- Controls protocol tests **42 PASS**; actual DEV phone-UA welcome reports false, then accepts explicit controls true. Root typecheck PASS after adding newly-required BossKit.archetype to our test mock. Build PASS.
- First full smoke interrupted by a DEV server restart (own runner predates current DEV main PID); no throughput acceptance for that attempt. Added immediate closed-socket detection to avoid misleading 90s readiness timeouts during shared reloads; retrying DEV only.
- Latest full suite: **620 PASS / 4 FAIL / 7 optional skips**. Failures are external archetype-transition fixtures: design/index.test.ts:225 old attack IDs; genesis/index.test.ts:168 old trace attack IDs; sim/flavor.test.ts:176 seven React cascades now absent; sim/match.test.ts:42 expects 8 kinds, gets 7. Server suite has no failures; archetype owners/coordinator should reconcile their fixtures/modules.

## DONE — controls readiness server support
- Shared controls reports now update ephemeral per-player readiness/motion profile and broadcast controlsReady in welcome/lobby. Mobile UA/client-hint connections reset false on EVERY hello; bots/desktop keyboard default true. Explicit client reports override initial UA hint (essential for iPad desktop UA). Screens ignored, invalid payloads rejected, repeated values coalesced; reports accepted in every phase.
- START blocks participating ready-repo humans while any controlsReady is false, with count + names. Report false during a fight does not stop teammates; UI handles pre-countdown/recovery overlay. Readiness never persists and never comes from saved repo/choice. UI MUST report after every welcome, including same-page network resumes, and on actual permission/sensor changes.
- `ROOM_RESTART_TEST=1 npx vitest run server`: **52 PASS / 5 files**. Added real-WS iPhone/Android/iPad second-page/reset/restart tests, bots/desktop readiness, named START gating, tap-only bypass, malformed reports, duplicate suppression and screen handling. Newly required BossKit.archetype added to our mock.
- Actual DEV QSBM smoke PASS: 2 humans + 1 bot, synthetic phone starts false, explicit tap-only controls report enables it, 99 snapshots/client/5s; HMR/leave/owner/deletion/revocation all PASS. First interrupted run is superseded; smoke now reports unexpected socket closure immediately during shared restarts.
- Build PASS. Typecheck passed after mock fix, but latest root check now has **one external error**: sim/kits.ts:93 archetypeReason absent from the current BossCode shape. Latest full suite **620 PASS / 4 external archetype-transition failures / 7 optional skips**, described above. No server diagnostics/failures.
- UI/input handoff is transport-ready. Their WebKit/iPhone second-page click-origin permission test and pre-countdown overlay are separate acceptance work; server tests/synthetic UA reports do not claim real iOS permission delivery.
- No commits/pushes, shared edits, live/5173/tunnel access or server lifecycle controls.

## Rubric server — implementation / handoff → codex-rubric, claude-edu, claude-ui
- Read docs/tasks/edu-rubric.md + shared contracts. rubric/ and codex-rubric handoff were not present at initial read; implementing HTTP/auth/persistence/transport against injected pure-service adapters until they land.
- HTTP contract: `POST /api/rubric/parse?room=ABCD&filename=assignment.md`, header **X-Room-Token: <current owner's welcome.token>**. Send raw UTF-8 text/markdown, raw PDF, or JSON `{text,filename?}`. ≤1MiB request. Returns the Rubric directly (preview only); use WS `{t:'setRubric',rubric}` to apply. Owner + edu + lobby required. PDF extraction is async pdftotext (installed), bounded; fallback asks for .md/.txt when extraction unavailable. No public document storage.
- Exports: `GET /api/room/ABCD/feedback.csv` or `.md`, same X-Room-Token header. Use fetch + blob download (do not put tokens in query strings). Teacher token lives under kaiju.screenToken.ROOM, owner player under kaiju.token.ROOM. Current owner only; old owners/student tokens denied. Caches disabled.
- Feedback is room-only, memory-only. Each student receives `{t:'feedback',items:[their own]}`; current owner and screen roles receive the class list, replayed on reconnect. Bots do not get student feedback; ordinary disconnected humans can resume theirs. No Hall/model/public persistence export of private evidence.
- Codex-rubric: please document exact buildFeedback matchStats/quiz signature and defaults/parse exports. Server adapter will supply actual `{rank,kos,damage,roundWins,quiz?}` and override playerId/name/repo with authoritative room identity. Missing quiz evidence is omitted. scoreRepo + buildFeedback remain pure/deterministic.
- Codex-sim: qualityFromRubric hook may be wired when exported; rubric card makes stat reweighting optional. Public restored classroom profiles need rehydration to score real evidence (never synthesize private profiles).
- Contract request for live pre-fight scores (if claude-edu needs them): existing LobbyPlayer has no criterion-results field. Server can add `rubricResults?: CriterionResult[]` once coordinator approves; current committed card only requires rubric broadcast + post-fight feedback.
- Codex-rubric's exact completed handoff read and wired: defaultRubric/parseRubric/scoreRepo/buildFeedback from rubric/index.ts; PDF extraction from rubric/pdf.ts (no duplicate extractor). Empty-criteria previews retain unparsed requirements; applying an empty rubric is rejected.
- **Compatibility update for claude-edu:** accepts BOTH X-Room-Token and `Authorization: Bearer <room welcome.token>` for uploads/exports, matching your editor's request shape. Raw upload/query filename/room already match. Authorization is against the current room owner token, never a GitHub token.
- **claude-edu export handoff:** your current createClassFeedback fetch sends no token and will receive 401 before its local export fallback. Add a token option/header to that fetch (or inject download callback) for authenticated server export. Screens may see class feedback per contract, but HTTP exports remain current-owner-only. No token query strings/public download links.
- Sim rubric hook has now landed; main wires qualityFromRubric(kit,{rubric,results:scoreRepo(profile,rubric)}). At start, freeze the teacher rubric, apply it to human + bot kits from real profiles, refresh their Genesis and use that same frozen rubric for feedback/exports. Defaults preserve existing source-based classroom stats. Restored bot profiles are rebuilt from public bundled sources; restored human classroom evidence rehydrates before start.
- Focused rubric transport tests cover normalized edit/apply/restart, owner/token checks, both auth header forms, exact 1MiB and oversized/chunked uploads, valid actual Poppler PDF + malformed PDFs, unparsed previews, per-student vs teacher/screen delivery, current-owner export transfer, private feedback exclusion from other students/persistence/Hall and permanent leave cleanup.
- Accelerated real classroom test now exercises actual sim + rubric scoring + feedback + HTTP Markdown export (not a mocked ending). It reached a natural best-of-three result in two winning rounds (~165 game seconds); test no longer assumes all three rounds must play. Combat stats in feedback are compared to the actual autopsy ranking.
- sttake-edu now owns client/edu and is fixing raw-body auth, normalized weights and teacher export token; accepted both auth headers to keep that handoff compatible. Preferred pending pre-fight contract name is **LobbyPlayer.rubricPreview?: CriterionResult[]** (supersedes earlier generic rubricResults request). Not in shared yet and not emitted; client should keep estimate/measured-after-fight wording until approved. No raw RepoProfile broadcast workaround.
- Actual DEV classroom SWSC PASS: teacher +2 students +1 bot, protected rubric upload + set/broadcast + rubric-driven kits, 99 snapshots each/5s, leave/deletion. Battle KRNL regression PASS: 98 snapshots each/5s, controls/HMR/auth/Hall/leave intact.
- Full merged run (17:10): 690 PASS / 3 FAIL / 7 optional skips. Known external design/index.test.ts:225 and genesis/index.test.ts:168 archetype attack-ID expectations still fail. qa/robustness.test.ts nonnumeric-aim case hit its 5s timeout under the merged workload; auditing in isolation before declaring a net regression. No rubric transport failures.

## Rubric preview approved + dedicated final checks
- take-lead committed LobbyPlayer.rubricPreview; server now emits exact scoreRepo CriterionResult[] only for ready real profiles in the edu lobby, using current/default rubric. Cache keys are profile + rubric references; repo/rubric/mode transitions clear/recompute. Arrays are explicitly whitelisted; no raw profile, no persisted preview. Private evidence stays within its room.
- Dedicated tests: **7 PASS** (`npx vitest run server/rooms.test.ts -t 'previews exact|private preview|rubric|feedback'`, 17:15 local). Covers exact default/doc scores, same-context cache reuse, changes/remapping, analyzing/pending absence, private-vs-other-room isolation, no raw profile/credential fields, no preview/source persistence, fresh evidence after restart, recipient/export/private-feedback tests and accelerated actual PvP.
- Root typecheck PASS after take-edu fixed its listener. QA nonnumeric-aim timeout from the prior merged workload passed in isolation (2.38s); not an established net regression.
- Coordinated explicitly through Herdr with take-edu, take-ui and take-lead; all prompt submissions accepted. Take-edu confirmed X-Room-Token uploads/export token props, real HTTP denial display, normalized weights, and consuming only CriterionResult[]. No shared service lifecycle controls.
- Lead owns the current full run `/tmp/gitzilla-takeover-full.log` and reports build PASS. No duplicate full/build runs; only final focused server/rubric check remains before the server freeze.

## SERVER FREEZE — 2026-10-24 21:16:55 UTC
- **server/ is frozen now for take-lead's independent no-.env copy / dynamic 43071 UI+WS run. No further server edits until take-lead opens the next edit window.** No shared service controls or commits were performed.
- Final dedicated preview/rubric privacy tests: **7 PASS**. Final focused command `ROOM_RESTART_TEST=1 npx vitest run server rubric/rubric.test.ts rubric/pdf.test.ts`: **80 PASS / 7 files** (17:15:52 local, 11.01s), including actual five-process main.ts restart/rubric restoration, real HTTP/PDF uploads and current-owner export access, private recipient/cache boundaries, and accelerated actual classroom completion/feedback.
- Root typecheck PASS at the final dedicated check; touched-file whitespace PASS. Lead reports build PASS and owns the in-progress full suite/log; no duplicate full/build runs.
- Reproducible server-tree fingerprint command (run from repo root): `rg --files -0 server | sort -z | xargs -0 sha256sum | sha256sum`.
- Frozen fingerprint: **d8c0497544524fb75460fec4faceb55feec6d00a61a1e675c3cd184b02430cc5**. Includes server source/tests/vendor/README, with repo-relative filenames; excludes .env/cache. Later progress-file updates do not change this fingerprint.
- Take-edu/take-ui integration: exact LobbyPlayer.rubricPreview is now live for ready edu profiles and omitted while pending/outside lobby; profile/rubric cache invalidates and private evidence never leaves its room or enters persistence. Teacher upload/export accepts X-Room-Token (or Bearer room token), current-owner only. Feedback is per-student; owner/projector sees class list; no raw RepoProfile/Hall/model export. All final transport/privacy/export evidence is above.
