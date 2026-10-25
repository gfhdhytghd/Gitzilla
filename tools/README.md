# End-to-end playtest

```sh
npx tsx tools/playtest.ts --players 4 --boss pallets/flask --seconds 60
npx tsx tools/playtest.ts --players 4 --seconds 180 --headed
PLAYTEST_URL=http://localhost:5176 npx tsx tools/playtest.ts --mode edu --players 4 --seconds 30
```

Playwright is a devDependency. If Chromium is missing, run `npx playwright install chromium`. The harness also tries `/usr/bin/chromium`; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to override. The harness reuses the shared DEV server at **http://localhost:5175**; **`PLAYTEST_URL`** overrides that URL. It never starts or stops servers. Port 5173 and `gitzilla.wilflin.me` are stable live targets and are rejected before any request. Audio smoke uses the same DEV default and accepts `SMOKE_URL` or `PLAYTEST_URL`.

`--players` in battle is 1–8 (default 4), `--seconds` is the maximum fight-driving duration (default 60), `--boss` defaults to `pallets/flask`. Each player gets an isolated browser context. Player 1 is the desktop owner at 1280×720. With 2+ players the final player uses **portrait 390×844 CSS, DPR 3**, mobile viewport and touch emulation (1170×2532 PNG). A one-player run adds a phone **spectator**, preserving the requested player count. Desktop players use WASD wander, held J, periodic Space/E. The generic phone context disables sensor APIs to exercise the real touch fallback using CDP touch drags and action buttons; the keyboard driver is still present for synthetic harness fixtures. It tests phone layout and fallback touch controls; use the motion test below for sensor-to-server proof.

`--mode edu` drives the **cooperative classroom**, with 2–30 actual students plus a desktop teacher and the real projector popup. The teacher clicks `create-classroom`, loads the first Python preset, publishes it and opens step 1. Every student joins by name, edits the in-app Python file and clicks Submit my code. The teacher launches a class attack; the harness waits for its natural round-one debrief. `--seconds` bounds the post-attack wait (use at least 15; default 60), not a PvP fight. A PASS requires the teacher/projector debrief, all student submissions and attacks, boss HP decreasing **and remaining above zero**, no student names in projector visible text/accessibility labels during setup/attack/debrief, no page/protocol errors, and no legacy battle inputs/snapshots. It never selects GitHub repos or uses battle start controls in edu. Summary JSON records phase history, observed UI commands, in-app report sources/scores, boss HP and the frozen round. `--mode battle` remains the default (1–8 players).

Edu screenshots include `published-teacher.png`, submitted teacher/portrait student, class attack projector, round debrief teacher/projector and phone feedback. Any acceptance failure returns nonzero and keeps screenshots/summary; a killed round-one boss is never accepted as a successful timed run.

Artifacts go to `docs/shots/<timestamp>/`:

- `landing-{desktop,phone}.png`, `lobby-{desktop,phone}.png`, `boss-intro-{desktop,phone}.png`.
- `mid-fight-010s-{desktop,phone}.png`, then every 10 seconds while fighting.
- `autopsy-{desktop,phone}.png` if a natural match end occurs. A short run can legitimately end during a fight: it saves `end-fight-*` and explicitly records autopsy as not reached. It never forces a win or fabricates an autopsy.
- `playtest.log`: browser console, uncaught page errors, failed requests, WebSocket transport/protocol errors, and harness stages.
- `summary.json`: outcome, missing selectors/stages, screenshot paths, error counts, and observed WebSocket snapshot/input counts, including movement/fire/dash/skill evidence.

Exit codes: **0** = battle fight window/autopsy, or every edu round-debrief acceptance passed, **1** = uncaught page errors, WebSocket errors, or harness/runtime failure, **2** = missing/incomplete UI or required end-to-end evidence. Console errors are logged and counted; uncaught page errors always fail. A missing UI gets bounded waits, a failure screenshot, an inventory of visible test IDs, and a clear summary. Full game completion is separate from completing a timed playtest.

## Stable UI selectors (contract for claude-ui)

Use `data-testid` on the actual interactive/visible elements, unique within a page:

| Test ID | Contract |
| --- | --- |
| `create-room` | Landing create button; clicking navigates to `/r/<ROOM>`. |
| `create-classroom` | Landing classroom entry; navigates to the owning teacher screen `/r/<ROOM>?screen=1`. |
| `classroom-preset-select`, `classroom-preset-load`, `classroom-save-plan` | Teacher selects, loads and publishes a Python lesson. |
| `classroom-start`, `classroom-attack`, `classroom-open-projector` | Open step 1, launch the collective attack, open the real class-facing popup. |
| `code-editor-input`, `classroom-submit-code` | Student writes code and submits through the in-app editor. |
| `classroom-own-score`, `classroom-debrief` | Graded student feedback and teacher/projector round debrief. |
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

No app-private functions or direct WebSocket input injection are used. The harness observes actual WebSocket traffic to verify the UI's actions reached the server. In battle, repositories are selected from `/api/fallbacks`, cycled for the requested player count. The specified boss is submitted exactly as given; use a listed fallback boss for a reliable demo.

Harness self-tests: `npx vitest run tools/playtest.test.ts` checks CLI options; `npx vitest run tools/playtest-edu.test.ts` checks strict first-round acceptance (including zero HP, unchanged HP, nonfinite HP and missing submissions). `PLAYTEST_SELF_TEST=1 npx vitest run tools/playtest.integration.test.ts` launches browsers against a clearly labeled synthetic UI/WebSocket fixture, checks both screenshot dimensions and control/ack evidence, then injects page/protocol errors to verify nonzero exit. Its separate cooperative classroom fixture exercises the preset/editor/debrief browser contract; these synthetic results are not staging product proof. Those summaries have `syntheticFixture: true`; they verify the harness and do not establish real-game acceptance. The browser self-tests are skipped during normal `npm test`.

`npx tsx tools/inclusive-motion.ts` checks persistent standard/seated/tap-only profiles in a browser component fixture using the actual DEV input module. It records the distinction from game/UI/hardware acceptance in its JSON artifact. `npx tsx tools/audio-smoke.ts` also auditions quiet lesson/quiz feedback and asserts that classroom music suppresses the boss modem sting.

## Motion v3 / portrait phone

`npx tsx tools/motion-v3.ts` uses the real DEV UI at localhost:5175,390×844/DPR3, synthetic sensor events and native touch input. It checks all movement directions from authoritative snapshots, tap + six-axis/gravity-only swing attacks from acknowledged input/new own bullets, twist-return on each gyro axis, double-tap dash, spin and long-press skills, no cross-action leaks, no held fire, charging feedback, zero button/joystick nodes, permissions/fallback/recovery, recalibration/debug and a20s trace stored by the real endpoint. Artifacts: `docs/shots/<timestamp>-motion-v3/{summary.json,inputs.json,portrait-motion.png}`. No physical-phone acceptance claim. Vite HMR is held inert in this tab and input modules requested with a revision query to bypass the DEV watch-ignore stale-cache issue. The old motion-v2 command forwards to v3. `MOTION_URL` / `PLAYTEST_URL` override DEV; no live targets or shared-server lifecycle changes.

By default, a tools-only loopback server proxies the chosen DEV/staging frontend unchanged and runs real RoomServer, WebSocket, simulation and trace services in isolation. Only the named `motion-v3` player receives simulation invulnerability; other actors and boss attacks remain real. All permission, fresh-reading, controlsReady and actual START gates still apply, and every swing must produce an authoritative projectile while alive. This separates input proof from combat survival; it does not establish unprotected combat balance. Protection has no production server flag/API/import and the fixture refuses `NODE_ENV=production`. It uses bundled public profiles, no `.env` or remote analysis, stores traces under the run artifact, and closes its own ephemeral listener afterward. `MOTION_COMBAT=1` opts into an unprotected direct-server diagnostic run.

`MOTION_URL=http://localhost:5176 npx tsx tools/motion-stability.ts` runs exactly five full protected harnesses sequentially, stops on the first failure, and writes aggregate results plus per-run logs under `docs/shots/<timestamp>-motion-stability/`. There are no hidden retries. `npx vitest run tools/motion-fixture.test.ts` verifies production refusal, real player protection with ordinary damage still active, and a loud failure if the real simulation seam changes.

The generic playtest phone driver uses invisible drag movement + tap/double-tap/long-press in fallback, while desktop contexts retain keyboard controls. No removed phone button selectors are required.

`npx tsx tools/phone-audio.ts` uses strict autoplay on the actual DEV landing with 390×844 touch emulation. It verifies first tap → running context + active music loop + nonzero DSP, silent inline media fallback, a mocked playback-session API branch, visibility/pageshow recovery without duplicate loops, and the input debug audio status. Artifacts: `docs/shots/<timestamp>-phone-audio/`. OS interruptions/silent-switch hardware behavior remain unverified.

`npx tsx tools/calibration-smoke.ts` drives the real input calibration API through an explicit portrait UI-driver fixture: neutral/4tilts/3swings/3twists/2spins, thresholds+neutral persistence and real trace upload. It verifies the recorder contract separately from the product lobby trainer, which must use screen-relative neutral coordinates. Artifacts: `docs/shots/<timestamp>-calibration/`.

Permission regression: motion-v3 mocks reject pointerdown/touchstart, inactive or untrusted calls. It starts with denied native results, retries using the actual enable-tilt button, holds a pending permission dialog while emitting sensors (must stay off), grants without subsequent data (still off), then resumes the sensor stream (on). Real touch hit testing is required; no forced clicks. `MOTION_URL=http://localhost:5176 npx tsx tools/motion-v3.ts` also supports coordinator-managed production staging. Only the coordinator deploys to live.

Autopsy timing: a timed smoke keeps its normal5s end-of-run grace. If the server sends an autopsy during that grace, the harness allows up to6s **from the server message** for the visible autopsy screen, including the defeat outro, before reporting missing UI.

Latest movement specification supersedes neutral-pose checks: flat screen-up=0; horizontal tilt maps linearly0–15° to0–100%, downhill direction;45ms filtering and a120ms rejection window for gesture-induced steering noise; the last clean tilt movement continues while attacking. Tap attacks do not hold steering. Sensitivity slow20°/normal15°/fast10°. `motion-v3.ts` now verifies this with an AUTOMATIC phone trace (no trace flag). `phone-trace.ts` is a WebKit/iPhone component fixture proving standalone training + phone fights upload automatically and sampled movement matches0/7.5/15/30° +directions. Traces identify automated/syntheticSensors; exclude those from human-phone tuning.

`permission-session.ts` proves page-local API readiness across WebKit/iPhone reloads in an explicit lobby component fixture. `permission-gate.ts` checks the REAL product lobby: remembered controls choice must still show a big enable-motion button on reload, invoke BOTH native APIs in onclick, and keep START blocked until fresh readings reach server controlsReady. A missing UI integration is a real failure, not a fixture pass.

Takeover integration: generic playtest explicitly selects the lobby's touch-only option on its sensorless phone context before START. Safari autopsy checks do the same for real battles and write screenshots/summary under `docs/shots/<timestamp>-safari-autopsy/`. Their layout/control evidence is separate from `permission-gate.ts` and `motion-v3.ts` synthetic-sensor acceptance and physical-phone validation.

## XR plumbing check

`npx tsx tools/xr-check.ts [--frames 180] [--headed] [--local-only] [--ar [--no-hit-test]] [--art]` runs an isolated Chromium/WebGL check with the pinned `iwer@2.5.0` emulator. It owns an ephemeral loopback Vite server, disables `.env` loading/HMR, uses a private dependency cache, and closes its server/browser afterward. No shared DEV/staging/live server is used. `--local-only` removes floor-space support to exercise the estimated-floor fallback. `--ar` installs an explicit synthetic0.75m table via IWER's public SEM interface, then exercises actual IWER hit-test/anchor APIs. `--no-hit-test` verifies an explicitly estimated0.9m plane fallback; it never reports a sensed surface.

The fixture imports the real stage25d projection/XR/pool modules and renders a simple textured plane plus128 instanced bullets/shadows in stereo. It verifies session entry from a real button click, native emulator controller select, an explicitly injected transient-pointer select, table/life-size placement, hidden/visible recovery, clean session end and restored screen loop, unchanged texture versions, and stable instance buffers. It reports rAF frame times and CPU submission times, screenshots and console/errors under `docs/shots/<timestamp>-xr-check/`. These are **plumbing/emulation results**, not the artwork/gallery, game performance, Vision Pro90fps, native permissions or physical headset acceptance. The transient-pointer branch uses explicit synthetic injection; the controller select uses the emulator's runtime.

The spatial extension also checks real hand-joint poses without synthetic selects, root scale changes, and a real textured `snapshot.usdz` archive. `--art` reads the owner's real gallery raid scene and exports the current boss/arena to `arena-boss.usdz`, downloading the blob directly to avoid a large JSON byte transfer. Custom voxel shaders are baked at export time into greedily merged colored columns, including limb depth; live art remains untouched. This verifies export structure/geometry, **not native USDZ rendering**. Chromium has no native `<model>` support; native-model mounting/URL lifecycle uses explicit unit doubles, and physical Vision Pro validation remains the user's.

`--height [--vision-pro] [--local-only]` additionally checks the actual stage's VR table placement,10cm user adjustment, persistence across reload and `?xrdebug=1` readout. `--vision-pro` explicitly simulates a Safari UA inside IWER; normal emulation must retain its old height. Both local-floor and local must pass. `tools/iwer-compat.ts` adapts IWER2.5's nonstandard mat4 offset argument to the native XRRigidTransform interface at the emulator boundary only; actual poses still come from IWER. No production or node_modules patches.

Stage API: `setTableHeightOffset(meters)`, `getTableHeightOffset()`, and `debugXR`. Offsets persist under `kaiju.xr.tableHeightOffset`. `?xrdebug=1` shows the actual granted reference type, raw/effective headY, offset-space translation, tableY and user offset in both an in-session panel and a DOM readout retained after exit. Vision Pro's previous eye-relative placement is lowered1m; normal emulator placement is preserved. Physical headset values must be read on that device.

`npx vitest run client/render/stage25d/{projection,pool,xr,spatial}.test.ts` covers inverse floor projection at desktop/projector/portrait sizes, logical-view coordinates, phone follow, depth/height, XR placement, texture invalidation/LRU/disposal, pooled transforms/overflow/resource ownership, session lifecycle/AR fallback, surface/anchor races, frozen voxel-aware USDZ export and native-model resource cleanup. Research and owner wiring details are in `docs/progress/codex-input.md`. Reference APIs: [IWER setup](https://meta-quest.github.io/immersive-web-emulation-runtime/getting-started.html), [three WebXRManager](https://threejs.org/docs/pages/WebXRManager), [WebKit model API](https://webkit.org/blog/17118/a-step-into-the-spatial-web-the-html-model-element-in-apple-vision-pro/).

## Native USDZ preview size

Native USDZ previews default to a shared12000-cell voxel budget with adaptive LOD (every actor retained),4-bit/channel color quantization, half-pixel depth bands, indexed exposed quads, merged rectangles and a plain floor. Decorative FX, projected shadows and the void grid are omitted. `includeDecorations:true` restores decorative meshes/textures for diagnostics. The archive stays uncompressed and every entry64-byte aligned; numeric formatting preserves USD magic/comments, quoted labels and asset references.

`npx tsx tools/usdz-size.ts --baseline <before-code-directory>` compares old/new exporters on the **same frozen real four-player Flask raid**, measures three warm export runs, asserts the new preview is under5MB, and saves before/after USDZ + geometry screenshots and per-entry sizes under `docs/shots/<timestamp>-usdz-size/`. The baseline directory contains captured `spatial.ts` and `spatial-voxel.ts` modules (imports for types/projection/xr must point at `/client/render/stage25d/*.ts`); each result includes a `baseline-code/` copy for reruns. Capture these before changing export code, or use a previous result's baseline-code directory. This tool owns its loopback Vite/browser and never contacts shared/live servers. Timing is desktop Chromium, not Vision Pro performance.

## Phone fight performance

`node tools/phone-performance.mjs http://localhost:<isolated-port>/r/PERF?mock=match /tmp/phone-perf.json` measures a production build at390×844/DPR3 with4× Chromium CPU throttling,12s warmup and10s capture. It selects the real touch-only option in the mock fight. Reports CPU/task/layout work, DOM mutations, actual game draw intervals, canvas calls, a CPU profile and screenshot. Run baseline/candidate sequentially with other browser workloads stopped. The mock also runs simulation in the browser; this is a rendering comparison, not physical iPhone FPS, GPU power or temperature acceptance.

Phone fight rendering is capped at30Hz; HUD15Hz. The independent30Hz input sender and server snapshot stream are unchanged. The motion harness additionally proves both tap and swing attacks transmit simultaneous tilt movement and produce authoritative displacement/projectiles.

## Staged cooperative classroom (current edu UI)

```sh
npx tsx tools/classroom-smoke.ts
```

This self-contained harness starts an ephemeral local server and injects synthetic grading through `GameServices`; production has no fixture route. It drives the teacher and two browser students plus28 WebSocket students through task configuration,30submissions, teacher review, pause, automatic raid, CSV export, improved commit, reload/reconnect and the next task. Artifacts: `docs/shots/classroom-raid/`. It asserts no battle input/snapshot traffic, no uncaught browser errors and no horizontal overflow at390/360px. Two real10second raid timers are included. `/usr/bin/chromium` must be available.

`playtest.ts --mode edu` now targets the current cooperative classroom on an existing DEV/staging server, with real in-app grading and the first-round survival/privacy assertions described above. `classroom-smoke.ts` remains a separate isolated broader regression with injected grading; it does not replace real staging acceptance.
