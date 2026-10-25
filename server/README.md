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

- `POST /api/room` → HTTP 201 `{ "room": "ABCD" }`; `?mode=edu` creates a classroom
- `GET /api/room/ABCD` → `{ "exists": true, "players": 4, "phase": "lobby" }`; missing rooms return false/0/null, invalid/digit codes return 400
- `GET /api/fallbacks` → JSON `string[]` of fallback slugs
- `GET /api/qr?text=<encoded-join-url>` → SVG QR (four-module white quiet zone)
- WebSocket at `/ws` → `ClientMsg` / `ServerMsg` from `shared/types.ts`

The first player (not spectator) becomes owner. A disconnect transfers ownership immediately to the next connected player. The `welcome` token can be sent in `hello.resume` to reclaim the same ID and repo kit, including during a match. Reclaiming an active session closes the previous socket. Student slots are capped at eight in battle and thirty in edu; screens do not count. Classroom teacher screens can own/control the room. At least one connected ready player and a ready boss are needed to start; unconfigured players remain outside that match. The boss kit is regenerated for the actual ready squad size.

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

The room owner can send `{t:'setBots',count:2}` in the lobby to add two AI teammates, or count 0 to remove them. Count is capped at 0..7 and the mode capacity (eight battle / thirty classroom fighters). Lobby bot entries have `bot:true` and `[BOT]` names. Kits come from random offline fallback repos without network analysis; `sim/bots.ts` drives their authoritative 30Hz inputs. Humans take priority over bots when joining a full lobby. Battle ownership belongs to a human and needs at least one ready human. Edu can be owned by the non-playing projector screen and needs at least two ready fighters, including bots. Boss scaling applies only to battle; bot slots survive rematch.

To test a two-judge squad on DEV:

```sh
SMOKE_URL=http://localhost:5175 SMOKE_PLAYERS=2 SMOKE_BOTS=2 npx tsx server/smoke.ts
```

Defaults remain four human clients and zero bots. Smoke checks also cover attached designs, authoritative heart/regions, bot movement when enabled, and the Hall endpoint shape.

## Connect GitHub / private repositories

`auth/` handles `/auth/*`, `/api/me`, and `/api/me/repos` before game/API/static routing. Auth0 configuration is loaded by that module; no new dependency or browser token flow is introduced here. Anonymous public-repo play continues to work. A blank player name defaults to the authenticated GitHub login; explicit names and resumed custom names take precedence.

Each WebSocket retains its own upgrade request server-side. On `setRepo` or owner-only `setBoss`, the server resolves that request's GitHub token and passes it only to `analyzeRepo(repo, {token})`. It never attaches the GitHub token to a lobby entry, kit, profile, snapshot, autopsy, Hall record, log, or Gemini request. Auth/credentialed-analysis errors return a generic retry message rather than upstream details.

The current analysis contract does not carry visibility, so **all credentialed analyses are treated as private** for external enrichment and public leaderboard export. Such heroes and bosses use local seeded art without Gemini enrichment, and matches involving either are not recorded in the public Hall. Raw profiles are not sent. Genesis deliberately shares filtered real paths/snippets and code-quality facts inside the room; those credentialed data never reach external Gemini or public Hall. Private source-derived code/Genesis/quality tips are omitted from the persistence file; only gameplay values, grades, seed and chosen slug survive. Authenticated analysis already scopes memory jobs per credential and avoids public disk cache. Anonymous lookups explicitly disable ambient server PAT credentials; authenticated player and boss lookups use only the current socket request’s GitHub token. Private boss source, kit, progress and Genesis are omitted from the room store; its selected slug and privacy flag survive, with a reconnect/reselect message after restart. Actual browser sign-in/consent and access to a real private repo still need the auth owner's real-login acceptance check; server integration tests use mocked sessions/tokens.

## Room restart recovery

The server debounces room configuration changes (100ms) to `.cache/rooms.json` and atomically replaces that file with mode 0600. It also flushes before shutdown and persists a match-start marker immediately. Stored state includes room code/owner, player IDs/names/resume tokens/selected slugs/kits/privacy flags, AI slots/seeds, and the public boss profile/kit. It excludes WebSockets, requests/cookies, live combat, GitHub/Auth0 credentials, and private raw profiles. HTTP/Vite access to `.cache` is denied.

On boot, players can reclaim IDs and kits with their existing resume tokens. Interrupted fights return to a lobby and joining clients receive a `Server restarted` notice through the existing error/notice UI. The first returning human takes ownership if the saved owner is offline. Pending analyses become retryable errors instead of staying stuck on analyzing. Bot controllers are recreated from their saved seeds. Rooms still expire after ten minutes without connected clients; a stale four-letter room URL self-heals only when hello carries a resume token. A fresh unknown-code join gets Room not found, and digit-containing codes get a clear four-letters-only error.

`ROOMS_FILE` can override the persistence file for isolated restart integration tests; the normal default remains `.cache/rooms.json`. Existing credentialed/private flags survive restart. Private heroes retain their redacted gameplay values; a private boss must be reselected with fresh owner authentication before starting. Credentialed matches remain excluded from public Hall.

Run the isolated real-process restart test with:

```sh
npm run build
ROOM_RESTART_TEST=1 npx vitest run server/restart.integration.test.ts
```

It starts only temporary server processes on OS-assigned ports, uses an isolated room-store file, and cleans up its own children. It never starts, stops or tests ports 5173/5175 or the live tunnel. Normal `npm test` skips this integration test; focused room tests exercise persistence with temp files and ephemeral WebSocket servers by default.

## Genesis pipeline

Analysis `onProgress` flows into each lobby player's or boss's `progress`. Progress-only broadcasts are coalesced across the room at about 8Hz, with at most eight real paths per update and revision guards against old requests. Mapping/design/ready lifecycle changes are immediate. Ready human/bot/boss entries carry `genesis` built from the actual profile and kit; optional art updates rebuild it, and battle start rebuilds the boss trace for the real squad size. Fast cached stages can finish inside one throttle window, in which case the final Genesis supplies the complete replay without delaying analysis.

Credentialed Genesis is room-only and ephemeral: no model/Hall export or source persistence. Public Genesis is saved for replay. A restored card without Genesis re-analyzes on resume; private repos require the signed-in cookie again. Optional design failure preserves the ready seed kit/Genesis and ends the design progress state.

## Classroom PvP (edu)

Create via `POST /api/room?mode=edu`, then open `/r/ROOM?screen=1` as the teacher. The first projector claims teacher ownership even if students already arrived, consumes no student slot, and can start/manage without selecting a player repo. Clients should remember the screen's welcome token separately and send it as screen `hello.resume`; the server persists teacher identity and restores its control on resume/restart.

Owner-only lobby `{t:'setMode',mode:'battle'|'edu'}` is persisted and regenerates ready kits/report cards from real profiles while keeping appearance. Edu has thirty student slots, needs at least two ready fighters (bots allowed), uses quality-graded kits and passes `boss:null,{mode:'edu'}` to the simulation. The teacher is absent from match players. Snapshots/autopsies preserve null boss, PvP scores, scale-2 heroes and class ranking; edu results are skipped by the battle Hall. Switching a class of more than eight humans into battle is rejected rather than kicking students out.

```sh
SMOKE_URL=http://localhost:5175 CLASSROOM_PLAYERS=2 npx tsx server/classroom-smoke.ts
SMOKE_URL=http://localhost:5175 CLASSROOM_PLAYERS=30 npx tsx server/classroom-smoke.ts
```

This runner stores only the latest snapshot/lobby per client. It checks a non-playing teacher, quality/Genesis report cards, no selected boss, mode/scale/PvP state, and five seconds of inputs/snapshots. Real simulation, renderer and UI implementations must have landed for this end-to-end acceptance. Battle social-impact autopsy fields (fragility, maintainers, issues, public advisory parasites) are forwarded intact; inclusive MotionProfile remains strictly client-side.

## Invalid input containment

Incoming human/bot InputFrames are whitelisted: safe integer sequence; finite clamped movement; finite normalized aim or auto-aim; boolean action flags; known source. Malformed input cannot smuggle object-shaped aim or unknown fields into the sim. A thrown simulation step drops that tick and idles held frames without replaying a partly applied step or stopping everyone's match. Only a bounded tick-drop message is logged, never raw inputs or upstream/private error text.

## Leaving a room

`{t:'leave'}` permanently removes a player or projector in any phase. Ownership passes to the next connected human player, or a remaining projector. The socket closes with **4002**, reason **left**; clients must forget that role's room resume token and stop automatic reconnects. A fresh join without that token may enter again with a new identity.

Explicit last-human leave stops and deletes the room even if bots or dormant player slots remain. The deletion and SHA-256 hashes of revoked room resume tokens are flushed atomically before the socket closes. Those hashes prevent old tabs from restoring the identity or recreating a deleted room across a server restart. Ordinary connection drops keep the existing resume behavior. The simulation's `removePlayer(id)` hook removes active heroes while teammates continue; the server also excludes departed IDs from snapshots and results.

## Motion trace tuning

Opt-in training/`?trace=1` clients can `POST /api/trace` with `Content-Type: application/json` and the raw sensor trace object or sample array. The server accepts at most 2 MiB, including chunked bodies, returning `201 {id}`. Invalid JSON/primitives return 400; unsupported content types return 415; oversized bodies return 413.

Files are stored as `.cache/traces/<milliseconds>-<random>.json`, mode 0600; the newest 200 are retained. Only the submitted JSON is saved: no cookies, auth/session tokens, or client IP metadata are attached. `GET /api/trace/list` returns `{traces:[{id,bytes,createdAt}]}` newest first, with no caching. Listing requires a direct localhost/loopback request and rejects forwarded/public tunnel requests. Trace contents remain inaccessible through HTTP; the coordinator can inspect files locally. `TRACES_DIR` optionally isolates the directory for tests.

Vite’s configured server port follows `PORT` (DEV 5175), including its direct HMR fallback target. The HMR browser port and protocol stay inferred from `/@vite/client`, so a localhost page uses ws:5175 and an HTTPS tunnel page uses its own public WSS address. The DEV battle smoke verifies the injected target and an actual HMR handshake without contacting stable live.

## Controls readiness per page

Players report `{t:'controls',ready:boolean,mode:'standard'|'seated'|'tap-only'}` after **every welcome** and whenever sensor/permission readiness changes. Lobby cards expose `controlsReady` separately from repo status. Bots are always ready; desktop keyboard connections default ready. Mobile User-Agent / client-hint connections start false on every hello, even with a resume token and ready repo. UA is only an initial hint: clients must explicitly report missing sensor readiness on iPad desktop-style UAs too.

Sensor readiness and profile reports are memory-only. A new connection/page cannot restore readiness from room persistence. A same-page network resume can immediately report true again if the current page's permission and live-sensor checks still pass. START rejects participating ready-repo players whose controlsReady is false with a count and names; spectators and unconfigured repo slots do not block. Reports during combat update the lobby without pausing teammates; the permission prompt/recovery overlay belongs to the client.

## Teacher rubric and student feedback

New edu rooms expose a default `lobby.rubric`. Preview a teacher document with `POST /api/rubric/parse?room=ABCD&filename=assignment.md`: send raw text/Markdown/PDF, or JSON `{text,filename?}`, capped at 1 MiB. PDF extraction uses the rubric module's async `pdftotext` adapter; unreadable/scanned PDFs return a helpful text-upload error. Preview preserves `unparsed` lines without applying the rubric.

Uploads and `GET /api/room/ABCD/feedback.csv|.md` require the **current owner's room welcome.token** in `X-Room-Token` or `Authorization: Bearer`. This is the player/projector resume token, not a GitHub token. Use fetch plus a download blob; tokens never belong in URLs. Missing credentials return 401, other/old owner tokens 403, non-edu rooms 409, and exports before feedback is ready 404. Downloads use `Cache-Control: no-store`.

Owner-only lobby `{t:'setRubric',rubric}` validates criteria and normalizes relative weights, broadcasts and persists the selected rubric. Ready edu lobby entries get exact `rubricPreview: CriterionResult[]` from their actual profile and current rubric. Previews invalidate on repo/rubric/mode changes, are cached only in memory, and never serialize the raw profile or enter `rooms.json`. Private evidence remains within its room.

At start, the server freezes the rubric and applies the sim's bounded `qualityFromRubric` hook to humans and bots. The same rubric drives post-fight scoring. `{t:'feedback',items}` sends each human student only their own feedback; the current owner and projector screens receive the class list. Combat/quiz context comes from the real PvP state/autopsy. Feedback replays on same-server reconnect, clears on rematch/permanent leave, and is never persisted or published to Hall. Restored classrooms rehydrate real repository evidence before starting; private repos need their current authenticated session.

Focused coverage includes real HTTP/WS authorization, raw and PDF uploads, exact/over-limit bodies, rubric restoration, preview cache invalidation/private isolation, student recipient boundaries, current-owner CSV/Markdown exports, and an accelerated actual classroom match through natural rounds and feedback generation.

## Host pause

During an active match, the current owner may send `{t:'pause',paused:true}`. Battle/duel snapshots carry `paused:{by,since,resumeAt:null}` and continue while the server skips every simulation and bot step. Classroom raids use the same field on `ClassroomState`; their raid clock and timer transitions freeze too. Coding's existing classroom pause control remains separate.

`{t:'pause',paused:false}` sets `resumeAt` to server wall time plus 3000ms. Inputs remain ignored and all clocks remain frozen until that deadline. Repeating resume does not restart the countdown; pause cancels a pending resume. Held movement/fire/dash/skill are cleared at both boundaries, retaining sequence acknowledgement. Normal snapshots carry `paused:null` again after resuming; there is no simulation catch-up for elapsed wall time.

A paused owner disconnect with ownership transfer starts the three-second resume countdown automatically; the new owner may pause again. If no new owner exists (including the reserved classroom teacher), a 60-second absence limit applies, with the final three seconds advertised as the resume countdown. Returning before that countdown cancels the absence deadline. Explicit classroom teacher departure still ends the lesson immediately. Pause is memory-only; restart recovery keeps its existing lobby/lesson restoration behavior.

`since` and `resumeAt` are epoch milliseconds. A classroom's gameplay `serverTime` is deliberately frozen while paused; use wall time for the resume overlay countdown. Keep render interpolation/extrapolation frozen while paused rather than advancing from the last velocity.
