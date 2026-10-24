# codex-net: server/
You own `server/`. Build `server/main.ts` (entry for `npm run dev`).
- Node http server on PORT (default 5173, host 0.0.0.0). Dev: Vite in middleware mode (`createServer({ server: { middlewareMode: true, hmr: { server: httpServer } }, appType: "spa" })`). Production: serve `dist/` with SPA fallback. Optional HTTPS if HTTPS_KEY/HTTPS_CERT env set. Print LAN URLs on boot.
- `ws` WebSocket on path `/ws`, same port, implementing ClientMsg/ServerMsg from shared/types.ts.
- Rooms: 4-letter codes, `POST /api/room` -> {room}. First player in = owner; owner transfers if they leave. `resume` token lets a reloaded tab reclaim its player slot.
- setRepo/setBoss -> call `analyzeRepo` (analysis/index.ts) then `playerKitFromProfile` / `bossKitFromProfile` (sim/index.ts); broadcast lobby status analyzing/ready/error. Recompute boss kit at start with the real player count.
- `start` (owner): create Match, run 30 Hz fixed step with latest InputFrame per player (missing input = idle), broadcast snapshot 20 Hz (events accumulated between snapshots). When match.over, send autopsy and set phase "autopsy"; `rematch` returns to lobby keeping repos.
- `GET /api/fallbacks` -> listFallbackRepos(). `GET /api/qr?text=...` -> SVG QR code (write a tiny QR encoder or vendor a small MIT one into server/vendor; no runtime npm dep needed if you can avoid it).
- Until analysis/ and sim/ exist, other agents are writing them in parallel: code against the interfaces in docs/BRIEF.md; create temporary stubs ONLY in server/stubs/ if you need to run, and switch to the real modules once they appear.
- Test: a node script `server/smoke.ts` that opens 4 ws clients, sets repos (use fallback slugs), owner sets boss, starts, sends random inputs for 5 s, asserts snapshots arrive.
