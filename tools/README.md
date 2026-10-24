# End-to-end playtest

```sh
npx tsx tools/playtest.ts --players 4 --boss pallets/flask --seconds 60
npx tsx tools/playtest.ts --players 4 --seconds 180 --headed
```

Playwright is a devDependency. If Chromium is missing, run `npx playwright install chromium`. The harness also tries `/usr/bin/chromium`; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to override. A running Repo Kaiju server on 5173 is reused. Otherwise the harness starts `node --import tsx server/main.ts`, waits for `/api/fallbacks`, and stops only that child on exit. `PLAYTEST_BASE_URL` overrides the default `http://127.0.0.1:5173` for an existing server.

`--players` is 1–8 (default 4), `--seconds` is the maximum fight-driving duration (default 60), `--boss` defaults to `pallets/flask`. Each player gets an isolated browser context. Player 1 is the desktop owner at 1280×720. With 2+ players the final player uses phone-landscape 844×390, mobile viewport and touch emulation. A one-player run adds a phone **spectator**, preserving the requested player count. All players are driven with real browser keyboard events (WASD wander, held J, periodic Space/E). The phone context disables sensor APIs so the game's keyboard input mode handles those events; this tests phone layout/touch capability, not physical sensors or gestures.

Artifacts go to `docs/shots/<timestamp>/`:

- `landing-{desktop,phone}.png`, `lobby-{desktop,phone}.png`, `boss-intro-{desktop,phone}.png`.
- `mid-fight-010s-{desktop,phone}.png`, then every 10 seconds while fighting.
- `autopsy-{desktop,phone}.png` if a natural match end occurs. A short run can legitimately end during a fight: it saves `end-fight-*` and explicitly records autopsy as not reached. It never forces a win or fabricates an autopsy.
- `playtest.log`: browser console, uncaught page errors, failed requests, WebSocket transport/protocol errors, and harness stages. Server output is in `server.log` when the harness starts it.
- `summary.json`: outcome, missing selectors/stages, screenshot paths, error counts, and observed WebSocket snapshot/input counts, including movement/fire/dash/skill evidence.

Exit codes: **0** = the requested fight window ran (or a natural autopsy appeared), **1** = uncaught page errors, WebSocket errors, or harness/runtime failure, **2** = missing/incomplete UI or required end-to-end evidence. Console errors are logged and counted; uncaught page errors always fail. A missing UI gets bounded waits, a failure screenshot, an inventory of visible test IDs, and a clear summary. Full game completion is separate from completing a timed playtest.

## Stable UI selectors (contract for claude-ui)

Use `data-testid` on the actual interactive/visible elements, unique within a page:

| Test ID | Contract |
| --- | --- |
| `create-room` | Landing create button; clicking navigates to `/r/<ROOM>`. |
| `player-name` | Optional display-name input, on landing or join screen. |
| `join-room` | Optional confirmation button if joining isn't automatic. |
| `player-repo-input` | Current player's editable GitHub repo field. |
| `player-repo-submit` | Current player's analyze/summon button. |
| `player-ready` | Current player's status marker; `data-status="ready"` / `"error"` / `"analyzing"`. |
| `boss-repo-input` | Owner's editable boss repo field. |
| `boss-repo-submit` | Owner's boss analyze/summon button. |
| `boss-ready` | Boss status marker; same `data-status` values. |
| `start-match` | Owner's start button; enabled when the match can start. |
| `game-canvas` | Visible game canvas during the fight. |
| `boss-intro` | Optional visible boss intro overlay; screenshot falls back to game canvas if absent. |
| `autopsy` | Visible real end-of-match screen. |

No app-private functions or direct WebSocket input injection are used. The harness observes actual WebSocket traffic to verify the UI's actions reached the server. Repositories are selected from `/api/fallbacks`, cycled for the requested player count. The specified boss is submitted exactly as given; use a listed fallback boss for a reliable demo.

Harness self-tests: `npx vitest run tools/playtest.test.ts` checks CLI options. `PLAYTEST_SELF_TEST=1 npx vitest run tools/playtest.integration.test.ts` launches browsers against a clearly labeled synthetic UI/WebSocket fixture, checks both screenshot dimensions and control/ack evidence, then injects page/protocol errors to verify nonzero exit. Those summaries have `syntheticFixture: true`; they verify the harness and do not establish real-game acceptance. The browser self-tests are skipped during normal `npm test`.
