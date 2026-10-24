# Gitzilla server

From the repository root:

```sh
npm run dev
npx tsx server/smoke.ts
```

The single HTTP/WebSocket server binds `0.0.0.0:5173` and prints local/LAN URLs. Set `PORT` to override. In development, Vite serves the client and its HMR socket on this same server. No separate Vite process is required.

Production:

```sh
npm run build
npm start
```

Production serves `dist/` and falls back to `dist/index.html` for client routes, including `/r/ABCD`. To enable HTTPS/WSS, set both `HTTPS_KEY` and `HTTPS_CERT` to PEM file paths before starting. TLS is needed for phone motion permissions on iOS.

The smoke runner defaults to `http://localhost:5173`; use `SMOKE_URL=https://your-host:5173` to test another instance. It creates one room, joins four players, chooses fallback repos and a boss, starts, sends 30Hz random inputs for five seconds, checks all clients receive snapshots/input acknowledgements, and disconnects. Run focused protocol tests with `npx vitest run server/rooms.test.ts`.

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
npm run dev:https
```

This starts HTTPS + WSS on 5173. If neither `HTTPS_KEY` nor `HTTPS_CERT` is set, openssl automatically creates `.cache/tls/key.pem` and `.cache/tls/cert.pem`. The cached certificate covers `localhost`, both loopback addresses, and all detected LAN IPv4/IPv6 addresses. It is reused until near expiry or a new LAN IP needs coverage. Explicit certificate environment variables still take precedence; openssl must be installed for automatic generation.

At boot, the server creates a room and prints its LAN join URL, big-screen URL and a compact terminal QR using Unicode half-blocks. Every `POST /api/room` prints the new room's QR too. Black/white ANSI colors preserve scan contrast on dark terminals.

When HTTPS is active, an optional HTTP listener on 5180 sends 308 redirects to the HTTPS port, preserving the hostname, path and query. Use `HTTP_REDIRECT_PORT=0` to disable it, or another port to override; a busy redirect port does not stop the game server. `PORT` still overrides the main server port.

For iOS, install the public `.cache/tls/cert.pem` certificate on the phone and enable its SSL trust under **Settings → General → About → Certificate Trust Settings**. If necessary, copy it as `gitzilla.cer` for transfer; transfer only the public certificate. Apple documents this manual trust step at https://support.apple.com/en-us/102390. Then scan the HTTPS room QR and tap the game's motion-permission control. The generated certificate provides local TLS; actual iOS motion permission and sensor delivery need a real-phone check.

To smoke-test while keeping certificate verification enabled:

```sh
NODE_EXTRA_CA_CERTS="$PWD/.cache/tls/cert.pem" SMOKE_URL=https://localhost:5173 npx tsx server/smoke.ts
```

## Public HTTPS tunnel (primary phone workflow)

`npm run dev` defaults `PUBLIC_URL` to `https://gitzilla.wilflin.me`. The server continues to serve HTTP locally on 5173; the public tunnel provides HTTPS/WSS to phones. Printed room links, big-screen links and terminal QRs use `PUBLIC_URL` when present. Override it with your own tunnel URL, for example `PUBLIC_URL=https://my-tunnel.example npm run dev`. To force LAN links for a normal HTTP dev run, bypass the npm default with `npx tsx watch server/main.ts` and leave `PUBLIC_URL` unset.

The UI's big-screen QR should build the room URL from `location.origin`, so a big screen opened through the tunnel invites phones through that same HTTPS origin. `dev:https` remains available for direct LAN access and defaults to LAN URLs unless `PUBLIC_URL` is explicitly supplied. Restart an existing npm dev process to pick up the changed script default.

## Designs, Hall and AI fill

Player and boss kits become ready immediately with `design/`'s deterministic fallback appearance. Background Gemini/cache/bundled results update lobby appearance without changing combat stats or waiting to start. Boss appearance is reapplied after squad-size HP scaling; a running match keeps its original cloned appearance. Late results remain available in the retained lobby for rematch. Provider failures keep the seed design.

`GET /api/hall` returns `{fastestKills, topDamage, bossRecords}` from `hall/`. Each authoritative match completion records its autopsy once, before broadcasting it. Clients should not upload that same result. A Hall persistence error is logged and does not stop autopsy delivery.

The room owner can send `{t:'setBots',count:2}` in the lobby to add two AI teammates, or count 0 to remove them. Count is capped at 0..7 and eight total connected humans + bots. Lobby bot entries have `bot:true` and `[BOT]` names. Kits come from random offline fallback repos without network analysis; `sim/bots.ts` drives their authoritative 30Hz inputs. Humans take priority over bots when joining a full lobby. Ownership always belongs to a human, and a match needs at least one ready human. Boss scaling includes ready humans and bots; bot slots survive rematch.

To test a two-judge squad through the public tunnel:

```sh
SMOKE_URL=https://gitzilla.wilflin.me SMOKE_PLAYERS=2 SMOKE_BOTS=2 npx tsx server/smoke.ts
```

Defaults remain four human clients and zero bots. Smoke checks also cover attached designs, authoritative heart/regions, bot movement when enabled, and the Hall endpoint shape.
