IN PROGRESS — HTTPS + terminal QR follow-up

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
