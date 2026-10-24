# End-to-end playtest

```sh
npx tsx tools/playtest.ts --players 4 --boss pallets/flask --seconds 60
npx tsx tools/playtest.ts --players 4 --seconds 180 --headed
npx tsx tools/playtest.ts --mode edu --players 4 --seconds 30
```

Playwright is a devDependency. If Chromium is missing, run `npx playwright install chromium`. The harness also tries `/usr/bin/chromium`; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to override. The harness reuses the shared DEV server at **http://localhost:5175**; **`PLAYTEST_URL`** overrides that URL. It never starts or stops servers. Port 5173 and `gitzilla.wilflin.me` are stable live targets and are rejected before any request. Audio smoke uses the same DEV default and accepts `SMOKE_URL` or `PLAYTEST_URL`.

`--players` in battle is 1–8 (default 4), `--seconds` is the maximum fight-driving duration (default 60), `--boss` defaults to `pallets/flask`. Each player gets an isolated browser context. Player 1 is the desktop owner at 1280×720. With 2+ players the final player uses **portrait 390×844 CSS, DPR 3**, mobile viewport and touch emulation (1170×2532 PNG). A one-player run adds a phone **spectator**, preserving the requested player count. Desktop players use WASD wander, held J, periodic Space/E. The generic phone context disables sensor APIs to exercise the real touch fallback using CDP touch drags and action buttons; the keyboard driver is still present for synthetic harness fixtures. It tests phone layout and fallback touch controls; use the motion test below for sensor-to-server proof.

`--mode edu` selects **classroom PvP**, supports 2–30 students, and never selects/submits a boss. It clicks the owner's `mode-edu` control before others join, confirms authoritative `LobbyState.mode`, and checks `boss === null`, `heroScale === 2`, PvP rounds/scoring and per-student quality cards in snapshots. Start screenshots are `classroom-start-*`, with no boss intro. If the match naturally ends, the autopsy must contain every student's ranking and no boss. Summary JSON includes quality cards, PvP state, rankings, lesson and quiz-event counts. `--mode battle` remains the default (1–8 players). A timed run does not prove all three rounds or inter-round quizzes completed; use a sufficiently long `--seconds` for that acceptance test.

Artifacts go to `docs/shots/<timestamp>/`:

- `landing-{desktop,phone}.png`, `lobby-{desktop,phone}.png`, `boss-intro-{desktop,phone}.png`.
- `mid-fight-010s-{desktop,phone}.png`, then every 10 seconds while fighting.
- `autopsy-{desktop,phone}.png` if a natural match end occurs. A short run can legitimately end during a fight: it saves `end-fight-*` and explicitly records autopsy as not reached. It never forces a win or fabricates an autopsy.
- `playtest.log`: browser console, uncaught page errors, failed requests, WebSocket transport/protocol errors, and harness stages.
- `summary.json`: outcome, missing selectors/stages, screenshot paths, error counts, and observed WebSocket snapshot/input counts, including movement/fire/dash/skill evidence.

Exit codes: **0** = the requested fight window ran (or a natural autopsy appeared), **1** = uncaught page errors, WebSocket errors, or harness/runtime failure, **2** = missing/incomplete UI or required end-to-end evidence. Console errors are logged and counted; uncaught page errors always fail. A missing UI gets bounded waits, a failure screenshot, an inventory of visible test IDs, and a clear summary. Full game completion is separate from completing a timed playtest.

## Stable UI selectors (contract for claude-ui)

Use `data-testid` on the actual interactive/visible elements, unique within a page:

| Test ID | Contract |
| --- | --- |
| `create-room` | Landing create button; clicking navigates to `/r/<ROOM>`. |
| `mode-battle`, `mode-edu` | Owner's mode buttons; select before student joins, synchronized to server lobby mode. |
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

`npx tsx tools/inclusive-motion.ts` checks persistent standard/seated/tap-only profiles in a browser component fixture using the actual DEV input module. It records the distinction from game/UI/hardware acceptance in its JSON artifact. `npx tsx tools/audio-smoke.ts` also auditions quiet lesson/quiz feedback and asserts that classroom music suppresses the boss modem sting.

## Motion v3 / portrait phone

`npx tsx tools/motion-v3.ts` uses the real DEV UI at localhost:5175,390×844/DPR3, synthetic sensor events and native touch input. It checks all movement directions from authoritative snapshots, tap + six-axis/gravity-only swing attacks from acknowledged input/new own bullets, twist-return on each gyro axis, double-tap dash, spin and long-press skills, no cross-action leaks, no held fire, charging feedback, zero button/joystick nodes, permissions/fallback/recovery, recalibration/debug and a20s trace stored by the real endpoint. Artifacts: `docs/shots/<timestamp>-motion-v3/{summary.json,inputs.json,portrait-motion.png}`. No physical-phone acceptance claim. Vite HMR is held inert in this tab and input modules requested with a revision query to bypass the DEV watch-ignore stale-cache issue. `/ws` and `/api/trace` are real. The old motion-v2 command forwards to v3. `MOTION_URL` / `PLAYTEST_URL` override DEV; no live targets/server lifecycle.

The generic playtest phone driver uses invisible drag movement + tap/double-tap/long-press in fallback, while desktop contexts retain keyboard controls. No removed phone button selectors are required.

`npx tsx tools/phone-audio.ts` uses strict autoplay on the actual DEV landing with 390×844 touch emulation. It verifies first tap → running context + active music loop + nonzero DSP, silent inline media fallback, a mocked playback-session API branch, visibility/pageshow recovery without duplicate loops, and the input debug audio status. Artifacts: `docs/shots/<timestamp>-phone-audio/`. OS interruptions/silent-switch hardware behavior remain unverified.

`npx tsx tools/calibration-smoke.ts` drives the real input calibration API through an explicit portrait UI-driver fixture: neutral/4tilts/3swings/3twists/2spins, thresholds+neutral persistence and real trace upload. It verifies the recorder contract separately from the product lobby trainer, which must use screen-relative neutral coordinates. Artifacts: `docs/shots/<timestamp>-calibration/`.

Permission regression: motion-v3 mocks reject pointerdown/touchstart, inactive or untrusted calls. It starts with denied native results, retries using the actual enable-tilt button, holds a pending permission dialog while emitting sensors (must stay off), grants without subsequent data (still off), then resumes the sensor stream (on). Real touch hit testing is required; no forced clicks. `MOTION_URL=http://localhost:5176 npx tsx tools/motion-v3.ts` also supports coordinator-managed production staging. Only the coordinator deploys to live.
