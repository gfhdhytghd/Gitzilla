# Server

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

For iOS, install the public `.cache/tls/cert.pem` certificate on the phone and enable its SSL trust under **Settings → General → About → Certificate Trust Settings**. If necessary, copy it as `repo-kaiju.cer` for transfer; transfer only the public certificate. Apple documents this manual trust step at https://support.apple.com/en-us/102390. Then scan the HTTPS room QR and tap the game's motion-permission control. The generated certificate provides local TLS; actual iOS motion permission and sensor delivery need a real-phone check.

To smoke-test while keeping certificate verification enabled:

```sh
NODE_EXTRA_CA_CERTS="$PWD/.cache/tls/cert.pem" SMOKE_URL=https://localhost:5173 npx tsx server/smoke.ts
```
