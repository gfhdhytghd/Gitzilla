# Gitzilla server

**Current infrastructure:** 5173 and `https://gitzilla.wilflin.me` are stable LIVE from `../gitzilla-live`. Only the coordinator deploys there. Use the existing shared DEV server at `http://localhost:5175` for every playtest/smoke; never start, stop or test live.

From the repository root:

```sh
# Shared dev is already running; smoke defaults to localhost:5175.
npx tsx server/smoke.ts
```

The shared development server binds `0.0.0.0:5175` (`PORT=5175`) and prints local/LAN URLs. Production retains its default port 5173 for the coordinator's live deployment. In development, Vite serves the client and its HMR socket on this same server. No separate Vite process is required.

Production (coordinator deployment only; do not run this against the existing live server):

```sh
npm run build
npm start
```

Production serves `dist/` and falls back to `dist/index.html` for client routes, including `/r/ABCD`. To enable HTTPS/WSS, set both `HTTPS_KEY` and `HTTPS_CERT` to PEM file paths before starting. TLS is needed for phone motion permissions on iOS.

The smoke runner defaults to `http://localhost:5175`; use `SMOKE_URL=http://localhost:5175` explicitly when needed. It creates one room, joins four players, chooses fallback repos and a boss, starts, sends 30Hz random inputs for five seconds, checks all clients receive snapshots/input acknowledgements, and disconnects. Run focused protocol tests with `npx vitest run server/rooms.test.ts`.

## HTTP routes

- `POST /api/room` → HTTP 201 `{ "room": "ABCD" }`
- `GET /api/fallbacks` → JSON `string[]` of fallback slugs
- `GET /api/qr?text=<encoded-join-url>` → SVG QR (four-module white quiet zone)
- WebSocket at `/ws` → `ClientMsg` / `ServerMsg` from `shared/types.ts`

The first player (not spectator) becomes owner. A disconnect transfers ownership immediately to the next connected player. The `welcome` token can be sent in `hello.resume` to reclaim the same ID and repo kit, including during a match. Reclaiming an active session closes the previous socket. New player slots are capped at eight; screens do not count. At least one connected ready player and a ready boss are needed to start; unconfigured players remain outside that match. The boss kit is regenerated for the actual ready squad size.

Matches step at 30Hz, consume dash/skill edges once, idle inputs after 300ms without fresh frames, and publish per-client input acknowledgements at 20Hz. Simulation events are drained every step, buffered, then sent exactly once per broadcast. A reconnect gets the latest snapshot without replaying old events. End-of-match publishes a final snapshot, lobby phase `autopsy`, then the autopsy payload; owner `rematch` restores the lobby with repo selections intact. Rooms without any connected clients expire after ten minutes.

No new npm dependencies. QR implementation and MIT notice are in `vendor/`.

## Phone HTTPS development

```sh
PORT=5175 PUBLIC_URL=https://localhost:5175 npm run dev:https
```

Use this only when the coordinator has freed the DEV port and wants direct LAN TLS; it starts HTTPS + WSS on 5175. Do not replace the running shared dev server yourself. If neither `HTTPS_KEY` nor `HTTPS_CERT` is set, openssl automatically creates `.cache/tls/key.pem` and `.cache/tls/cert.pem`. The cached certificate covers `localhost`, both loopback addresses, and all detected LAN IPv4/IPv6 addresses. It is reused until near expiry or a new LAN IP needs coverage. Explicit certificate environment variables still take precedence; openssl must be installed for automatic generation.

At boot, the server creates a room and prints its LAN join URL, big-screen URL and a compact terminal QR using Unicode half-blocks. Every `POST /api/room` prints the new room's QR too. Black/white ANSI colors preserve scan contrast on dark terminals.

When HTTPS is active, an optional HTTP listener on 5180 sends 308 redirects to the HTTPS port, preserving the hostname, path and query. Use `HTTP_REDIRECT_PORT=0` to disable it, or another port to override; a busy redirect port does not stop the game server. `PORT` still overrides the main server port.

For iOS, install the public `.cache/tls/cert.pem` certificate on the phone and enable its SSL trust under **Settings → General → About → Certificate Trust Settings**. If necessary, copy it as `gitzilla.cer` for transfer; transfer only the public certificate. Apple documents this manual trust step at https://support.apple.com/en-us/102390. Then scan the HTTPS room QR and tap the game's motion-permission control. The generated certificate provides local TLS; actual iOS motion permission and sensor delivery need a real-phone check.

To smoke-test while keeping certificate verification enabled:

```sh
NODE_EXTRA_CA_CERTS="$PWD/.cache/tls/cert.pem" SMOKE_URL=https://localhost:5175 npx tsx server/smoke.ts
```

## Public HTTPS tunnel (primary phone workflow)

`npm run dev` defaults `PUBLIC_URL` to `https://gitzilla.wilflin.me`. That tunnel now points exclusively to the stable LIVE server on 5173, not the shared development server. The coordinator owns deployment; dev tests must use localhost:5175. Printed room links, big-screen links and terminal QRs use `PUBLIC_URL` when present. Override it with your own tunnel URL, for example `PUBLIC_URL=https://my-tunnel.example npm run dev`. To force LAN links for a normal HTTP dev run, bypass the npm default with `PORT=5175 npx tsx watch server/main.ts` and leave `PUBLIC_URL` unset.

The UI's big-screen QR should build the room URL from `location.origin`, so a big screen opened through the tunnel invites phones through that same HTTPS origin. `dev:https` remains available for direct LAN access and defaults to LAN URLs unless `PUBLIC_URL` is explicitly supplied. Restart an existing npm dev process to pick up the changed script default.

## Designs, Hall and AI fill

Player and boss kits become ready immediately with `design/`'s deterministic fallback appearance. Background Gemini/cache/bundled results update lobby appearance without changing combat stats or waiting to start. Boss appearance is reapplied after squad-size HP scaling; a running match keeps its original cloned appearance. Late results remain available in the retained lobby for rematch. Provider failures keep the seed design.

`GET /api/hall` returns `{fastestKills, topDamage, bossRecords}` from `hall/`. Each authoritative match completion records its autopsy once, before broadcasting it. Clients should not upload that same result. A Hall persistence error is logged and does not stop autopsy delivery.

The room owner can send `{t:'setBots',count:2}` in the lobby to add two AI teammates, or count 0 to remove them. Count is capped at 0..7 and eight total connected humans + bots. Lobby bot entries have `bot:true` and `[BOT]` names. Kits come from random offline fallback repos without network analysis; `sim/bots.ts` drives their authoritative 30Hz inputs. Humans take priority over bots when joining a full lobby. Ownership always belongs to a human, and a match needs at least one ready human. Boss scaling includes ready humans and bots; bot slots survive rematch.

To test a two-judge squad on DEV:

```sh
SMOKE_URL=http://localhost:5175 SMOKE_PLAYERS=2 SMOKE_BOTS=2 npx tsx server/smoke.ts
```

Defaults remain four human clients and zero bots. Smoke checks also cover attached designs, authoritative heart/regions, bot movement when enabled, and the Hall endpoint shape.

## Connect GitHub / private repositories

`auth/` handles `/auth/*`, `/api/me`, and `/api/me/repos` before game/API/static routing. Auth0 configuration is loaded by that module; no new dependency or browser token flow is introduced here. Anonymous public-repo play continues to work. A blank player name defaults to the authenticated GitHub login; explicit names and resumed custom names take precedence.

Each WebSocket retains its own upgrade request server-side. On `setRepo`, the server resolves that request's GitHub token and passes it only to `analyzeRepo(repo, {token})`. It never attaches the GitHub token to a lobby entry, kit, profile, snapshot, autopsy, Hall record, log, or Gemini request. Auth/credentialed-analysis errors return a generic retry message rather than upstream details.

The current analysis contract does not carry visibility, so **all credentialed analyses are treated as private** for external enrichment and public leaderboard export. Such heroes use local seeded art without Gemini enrichment, and matches involving them are not recorded in the public Hall. Raw profiles, README/tree text and internal file paths are never sent for those private player selections; the room receives their chosen repo slug and derived gameplay kit. Authenticated analysis already scopes memory jobs per credential and avoids public disk cache. Anonymous and boss lookups explicitly disable ambient server PAT credentials, so they remain public-only. Actual browser sign-in/consent and access to a real private repo still need the auth owner's real-login acceptance check; server integration tests use mocked sessions/tokens.

## Room restart recovery

The server debounces room configuration changes (100ms) to `.cache/rooms.json` and atomically replaces that file with mode 0600. It also flushes before shutdown and persists a match-start marker immediately. Stored state includes room code/owner, player IDs/names/resume tokens/selected slugs/kits/privacy flags, AI slots/seeds, and the public boss profile/kit. It excludes WebSockets, requests/cookies, live combat, GitHub/Auth0 credentials, and private raw profiles. HTTP/Vite access to `.cache` is denied.

On boot, players can reclaim IDs and kits with their existing resume tokens. Interrupted fights return to a lobby and joining clients receive a `Server restarted` notice through the existing error/notice UI. The first returning human takes ownership if the saved owner is offline. Pending analyses become retryable errors instead of staying stuck on analyzing. Bot controllers are recreated from their saved seeds. Rooms still expire after ten minutes without connected clients; a stale four-letter room URL self-heals by recreating the same code, with the first player as owner.

`ROOMS_FILE` can override the persistence file for isolated restart integration tests; the normal default remains `.cache/rooms.json`. Existing credentialed/private flags survive restart, so a restored private-repo match is still excluded from public Hall.

Run the isolated real-process restart test with:

```sh
ROOM_RESTART_TEST=1 npx vitest run server/restart.integration.test.ts
```

It starts only temporary server processes on OS-assigned ports, uses an isolated room-store file, and cleans up its own children. It never starts, stops or tests ports 5173/5175 or the live tunnel. Normal `npm test` skips this integration test; focused room tests exercise persistence with temp files and ephemeral WebSocket servers by default.
