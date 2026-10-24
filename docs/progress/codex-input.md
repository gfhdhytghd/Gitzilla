IN PROGRESS — follow-up: tools/playtest.ts

Completed keyboard/mouse, calibrated motion gestures, permission-driven touch fallback, haptics, debug panel, and 25 input tests. Ready for claude-ui integration.

Owner: codex-input. Scope: `client/input/`, newly assigned `tools/`, this progress file, and requested playtest artifacts in `docs/shots/`. No commits or shared edits. User explicitly authorized Playwright devDependency installation for the follow-up; package.json/package-lock.json will change only for that install.

## Read
- `docs/BRIEF.md`, `shared/types.ts`, `../repo-kaiju.md`, `docs/tasks/codex-input.md`.
- No applicable AGENTS.md found in repository or parent paths.

## Implemented
- Exact `createInput` contract in `client/input/index.ts`; browser-only TypeScript, zero dependencies.
- Keyboard/mouse controls and normalized movement; mouse aim expires after 2 seconds; dash/skill are consumed once per press; blur/visibility/dispose clear held actions.
- Mobile sensor detection, first-tap iOS motion+orientation permission requests, denial/error/no-events fallback after 1 second; live `mode` / `needsPermission` getters.
- Calibrated, smoothed tilt with 5° deadzone / 25° saturation, both landscape rotations, automatic recalibration on orientation change, gravity-inclusive acceleration fallback.
- Pure thrust/swing/shake recognizer with peak hysteresis and refractory periods; 600ms thrust fire; touch-hold firing in motion mode.
- Multi-touch joystick / DASH / SKILL overlay, mounted only in fallback; zero-specificity `.kj-touch-*` default styling lets claude-ui restyle normally.
- `vibrate(pattern)` export and `createInputDebugPanel()` export. Debug panel returns a div: append where desired, call `.dispose()` to remove and clear its update timer.
- Integration notes in `client/input/README.md`.

## Integration handoff
- claude-ui can import `createInput`, `vibrate`, and `createInputDebugPanel` from `client/input/index.ts` now.
- Read `input.mode` / `input.needsPermission` live. Call `requestPermission()` from a tap if exposing a dedicated enable button; first touch also handles it automatically.
- Call `calibrate()` at start and `dispose()` on exit; sample once per client tick.
- Touch overlay owns its own DOM and cleanup; style `.kj-touch-*` classes in your stylesheet. No shared changes needed.

## Contract requests
Playtest selector contract for claude-ui (also documented in `tools/README.md`; no shared/types change):
- `create-room`: landing room-create button, navigates to `/r/<ROOM>`.
- `player-name`: optional display-name input; `join-room`: optional join confirmation button if the room doesn't auto-join.
- `player-repo-input`, `player-repo-submit`: current player's repo field and analyze/summon button.
- `player-ready`: current player's status marker; `data-status="ready"` when ready, `data-status="error"` on analysis error.
- `boss-repo-input`, `boss-repo-submit`: owner boss selection field/button.
- `boss-ready`: boss status marker; same `data-status` values.
- `start-match`: owner start button, enabled when ready.
- `game-canvas`: fight canvas, visible for match.
- `boss-intro`: intro overlay, visible during summon (optional; captures canvas if absent).
- `autopsy`: visible end-of-match screen.

Selector request is ready for the coordinator to relay to claude-ui. Missing selectors/UI get bounded waits and timestamped diagnostics instead of hanging.

## Follow-up: end-to-end playtest harness
- Added `playwright@^1.64.1` as an authorized devDependency (package.json/package-lock.json only). No browser download needed here: harness falls back to installed `/usr/bin/chromium`; document `npx playwright install chromium` for other hosts.
- `tools/playtest.ts`: requested CLI, server reuse/spawn/owned-child cleanup, isolated contexts, fallback repo selection, owner boss/start, deterministic keyboard wander/J/Space/E, desktop plus phone-landscape captures, WS telemetry and error logs, JSON summary, bounded missing-UI diagnostics.
- Phone is the last requested player; with --players 1 an extra phone spectator preserves the requested player count. Phone retains touch emulation but disables motion APIs to drive the requested keyboard input path.
- Timed runs capture real autopsy if reached; otherwise record autopsy-not-reached and capture end-fight. No fabricated match completion.
- `tools/README.md` contains command examples, selector contract, artifact format, exit codes and browser setup.
- Added CLI option tests and opt-in browser fixture integration tests (explicitly synthetic; never claimed as real-game validation).

### Follow-up validation so far
- Tools-only strict TypeScript check: PASS.
- CLI option tests: 11 PASS.
- Real application run `--players 4 --seconds 10` reused the server and emitted exit 2 with missing `create-room` selector while UI main/screens were incomplete. Artifact: `docs/shots/2026-10-24T18-26-23-520Z-1186888/`. Landing desktop/phone screenshots captured; logs include missing UI/test-ID inventories and failed diagnostic screenshots.
- Latest whole-repository `npm test`: 73 PASS (before tools tests added). Whole-repository typecheck temporarily fails in parallel-owned UI/sim code due missing screen modules and newly added shared heart/region fields; not edited by input agent.
- Browser fixture integration tests running next, then final current-workspace gates.

## Verification
- `npm run typecheck`: PASS (whole repository at current snapshot).
- `npm test`: PASS, 41 tests across 4 files; 25 tests belong to input (10 pure recognizer/tilt/gravity tests, 15 input lifecycle/permission/touch integration tests).
- `npm run dev`: server/input smoke PASS: server started on 5173; HTTP GET of `/client/input/index.ts` and `/client/input/gestures.ts` returned 200 with Vite-transformed JavaScript. Stopped this smoke server afterward. Full-app smoke was unavailable at that moment because claude-ui's `/client/app/main.ts` was still missing (Vite reported it); no end-to-end game claim.
- Real phone sensors, iOS permission UI, haptics, and landscape feel: UNVERIFIED, require venue/device testing. Synthetic tests do not claim physical sensor or visual proof.

## Remaining
Finish follow-up harness validation and mark DONE. Physical-device acceptance for the original input card remains a venue handoff.
