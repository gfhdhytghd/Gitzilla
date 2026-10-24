DONE

Current public origin: `https://gitzilla.wilflin.me`. Package default and active server docs migrated; new-domain public smoke is pending tunnel TLS hostname correction. Local 2-human + 2-bot smoke passes.

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
