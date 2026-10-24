DONE (motion v2)

Portrait motion-v2 complete and verified against real DEV localhost:5175. Final browser run: 18 checks PASS, 293 authoritative snapshots, 438 transmitted input frames, zero browser/WebSocket errors. Human/physical-phone acceptance remains unverified; no live server touched and no commits.

High-priority motion-v2 card read. Scope: client/input/, tools/, plus explicitly authorized minimal integration edits in client/app/game.ts and renderers.ts. DEV only http://localhost:5175; never live 5173. No commits or unrelated edits.

Portrait update accepted (`docs/tasks/portrait.md`): primary phone pose is portrait, tilted back ~30–50°, roll -> x, pitch -> y, angle 0. Calibrate measured neutral (not a hard-coded flat pose); preserve full roll sensitivity upright. Tablet landscape transforms retained. Playtest/audio-smoke phone contexts now 390×844 CSS, DPR 3 (1170×2532 PNG). Portrait layout/camera/rotate-to-portrait guard remain claude-ui-owned.

Motion-v2 source changes: all-axis magnitude >=12 m/s² attacks for 600ms, 200ms refractory, 250ms movement freeze; tap is latched for 400ms and hold fires continuously; motion and fallback both have on-screen DASH/SKILL with no tap-to-fire leakage; sensor events are observed before deciding, 1.5s fallback can recover on late valid events; absolute orientation, null filtering and gravity-only tilt supported; 300ms automatic neutral average and explicit recalibrate. `sensorStatus` exposes on/waiting/off, `?debug=input` mounts the live debug panel with |a| and last gesture.

Authorized app integration edits (preserving claude-ui's concurrent cooldown changes): `renderers.ts` eagerly imports real input and removes its late-bound placeholder path; `game.ts` starts input without waiting for optional art, logs real input, publishes sensor status, removes the old mandatory calibrate/landscape-only flow, keeps recalibrate + a gesture permission button. For claude-ui portrait deck: use `input.sensorStatus`; existing input-created `.kj-touch-dash` / `.kj-touch-skill` / `[data-testid=input-dash|input-skill]` are the real action buttons. No need to make duplicate buttons. My portrait blocker removal was only the OLD rotate-to-landscape guard; your new phone-only rotate-to-portrait guard should replace it.

Motion-v2 verification:
- `npx vitest run client/input`: 40 PASS (all six swing directions, upright portrait roll/pitch, calibration, deferred sensor recovery, permission branches, tap/hold/buttons, gravity-only devices).
- Final `npx tsx tools/motion-v2.ts`: 18 PASS, 293 real snapshots / 438 input frames, zero errors. At 390×844 CSS/DPR 3, server positions moved ~+35px/-37px in x and +33px/-34px in y with tilt; taps/held fingers and every ±X/±Y/±Z swing emitted acknowledged fire plus new authoritative own projectiles. Swing noise kept move frozen; button taps sent exactly one dash/skill edge without fire. Absolute orientation, recalibrate, debug panel, no-event fallback and late recovery passed.
- Final artifact: `docs/shots/2026-10-24T19-21-22-896Z-motion-v2/{summary.json,inputs.json,portrait-motion.png}`. Earlier unrestricted-HMR run also passed all 18 at `2026-10-24T19-18-19-621Z-motion-v2/` (294 snapshots / 440 input frames).
- The final test holds only the Vite HMR socket inert within its test tab, so concurrent client-file edits cannot reload/reset synthetic sensors during a check. Game `/ws`, UI input code, authoritative simulation and snapshots are real and unmodified. An intervening rerun and the generic playtest were disrupted by shared DEV reloads/restarts; those failed artifacts are retained and are not counted as acceptance.
- `npm run typecheck`: PASS at merged-workspace check; `npm test`: 257 PASS / 6 opt-in tests skipped. Tools/input strict typecheck PASS. Final focused input + CLI run: 53 PASS. Opt-in harness fixtures + CLI: 15 PASS, including new 390×844/DPR 3 screenshot dimensions.
- Generic playtest now drives the phone's real touch fallback with CDP touch drags/buttons (keyboard remains for desktop and synthetic fixtures). Audio smoke phone context is portrait/DPR 3 too.
- No physical phone was available: real iOS native permission dialogs, sensor feel/sign on hardware, OS resume and haptics remain UNVERIFIED.

Motion-v2 confirmed causes/fixes: old code attacked only on positive Z and used lateral swings/shakes for dash/skill; short taps had no latch and could disappear between 30Hz samples; fallback was one-way after only acceleration, ignored absolute/orientation-only readings, and used one-sample neutral. Those paths are replaced above. Crucially, the new portrait fullscreen handler consumed transient user activation BEFORE the sensor handler: browser instrumentation recorded BOTH permission calls with `active:false` inside pointerdown. Registering the fullscreen handler AFTER `setupInput()` changed both to `active:true` in the same pointerdown, then the complete sensor-to-server test passed. This minimal game.ts ordering fix must be preserved when UI code moves.

Round 2 audio DONE: added distinct energy/heart/armor pickup blips, obstacle shatter crunch, and a major-key perk "merge approved" jingle. New events map through existing playback/throttle/compression paths; pickups/perks retain self gain/pitch emphasis. Added audition buttons, smoke coverage, and five pure mapping cases plus PCM generation coverage. No shared/UI edits and no live server access.

Round 2 validation: 23 audio tests PASS, audio-only strict TypeScript PASS, owned whitespace check PASS. Repository typecheck no longer reports audio errors; remaining failures at check time were missing new perks/obstacles/pickups/perkOffer fields in parallel-owned app mocks, renderer galleries, and sim initialization. No unrelated files changed. Handoff: existing `audio.onEvents(events, selfId)` now handles all three event kinds automatically; no new UI calls required.

Infra follow-up complete: playtest defaults to `http://localhost:5175`, overridden by `PLAYTEST_URL`. Removed all server spawning/stopping. Live port 5173 and `gitzilla.wilflin.me` are rejected before requests. Audio smoke also defaults to DEV 5175 (`SMOKE_URL` / `PLAYTEST_URL`), fixture tests use the new env, and tools README is updated. Earlier 5173/startup notes below are historical and superseded by this infra rule. No live server touched.

Infra validation: 13 CLI/targeting tests PASS, tools strict TypeScript PASS, owned diff whitespace check PASS. Verification was offline; no server was started, stopped, or contacted.

Third card complete: procedural WebAudio engine, theme/phase chiptunes, full SFX mapping, audition page, 18 pure tests, browser/DSP smoke, and exact claude-ui handoff below. Zero added audio dependencies/assets; no commits or edits outside owned areas.

Follow-up complete: `tools/playtest.ts` is ready, Playwright installed, stable selector contract documented, CLI and real-browser harness self-tests pass. Live-app diagnostics correctly report unfinished UI; full live-game acceptance remains pending those screens.

Completed keyboard/mouse, calibrated motion gestures, permission-driven touch fallback, haptics, debug panel, and 25 input tests. Ready for claude-ui integration.

Owner: codex-input. Scope: `client/input/`, `tools/`, newly assigned `client/audio/`, this progress file, and requested playtest artifacts in `docs/shots/`. No commits or shared edits. Playwright was previously installed with user authorization; audio adds zero assets/dependencies.

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

Audio contract request: optionally type `source?: string` and `crit?: boolean` on the shared `hit` event when convenient. `sim/match.ts` already emits both via its structural HitFeedback extension. Audio consumes them through a local compatible intersection, so this request does not block integration and requires no immediate shared edit. Without them, normal hits/combo/self-hurt still work; outgoing self damage attribution and explicit crit accents rely on the fields being transmitted.

## Follow-up: end-to-end playtest harness
- Added `playwright@^1.64.1` as an authorized devDependency (package.json/package-lock.json only). No browser download needed here: harness falls back to installed `/usr/bin/chromium`; document `npx playwright install chromium` for other hosts.
- `tools/playtest.ts`: requested CLI, server reuse/spawn/owned-child cleanup, isolated contexts, fallback repo selection, owner boss/start, deterministic keyboard wander/J/Space/E, desktop plus phone-landscape captures, WS telemetry and error logs, JSON summary, bounded missing-UI diagnostics.
- Phone is the last requested player; with --players 1 an extra phone spectator preserves the requested player count. Phone retains touch emulation but disables motion APIs to drive the requested keyboard input path.
- Timed runs capture real autopsy if reached; otherwise record autopsy-not-reached and capture end-fight. No fabricated match completion.
- `tools/README.md` contains command examples, selector contract, artifact format, exit codes and browser setup.
- Added CLI option tests and opt-in browser fixture integration tests (explicitly synthetic; never claimed as real-game validation).

### Follow-up validation
- Tools-only strict TypeScript check: PASS.
- CLI option tests: 11 PASS.
- Real application run `--players 4 --seconds 10` reused the server and emitted exit 2 with missing `create-room` selector while UI main/screens were incomplete. Artifact: `docs/shots/2026-10-24T18-26-23-520Z-1186888/`. Landing desktop/phone screenshots captured; logs include missing UI/test-ID inventories and failed diagnostic screenshots.
- Second real-app run `--players 4 --boss pallets/flask --seconds 12`: expected exit 2 while imported UI game/autopsy/lobby modules were still being written; reports missing visible create-room, Vite/resource console errors, and screenshot availability. Artifact: `docs/shots/2026-10-24T18-28-46-710Z-1199422/`. This is an incomplete-UI diagnostic, not a successful fight.
- Final `PLAYTEST_SELF_TEST=1 npx vitest run tools/playtest.integration.test.ts tools/playtest.test.ts`: 13 PASS (11 CLI + 2 real-browser fixture tests). Successful synthetic run verifies room creation/join, all repo/boss/start controls, per-player movement/J/Space/E input frames and acknowledgements, 10-second mid-fight shots, natural fixture autopsy, PNG dimensions 1280×720 and 844×390. Error fixture verifies exit 1 with uncaught page errors, console errors and WS protocol errors. Summaries label fixture runs `syntheticFixture: true`.
- Final fixture artifacts: `docs/shots/2026-10-24T18-30-08-889Z-1207035/` (success, 10 screenshots, 219 fighting snapshots per player) and `docs/shots/2026-10-24T18-30-22-178Z-1207035/` (injected errors, expected exit 1). These prove the harness only; real-game status is recorded separately above.
- Latest whole-repository `npm test`: 89 PASS, 2 opt-in browser tests skipped by design.
- Latest whole-repository `npm run typecheck`: blocked only by parallel-owned UI's missing `client/app/{autopsy,game,lobby}.ts` at check time; tools-only strict TypeScript check PASS (including test files). No UI/shared edits by input agent.
- Server reuse and browser execution verified live. Owned server spawning/cleanup implemented; startup branch was not exercised against port 5173 because another agent's server is already using it.
- Final tools-only strict TypeScript check and `--help`: PASS. Direct `node --import tsx` loader smoke PASS. Screenshots retain live animations to avoid fast-forwarding the UI while capturing. Final `git diff --check`: PASS for owned changes.

## Original input-card verification (earlier snapshot)
- `npm run typecheck`: PASS at original input-card completion.
- `npm test`: PASS, 41 tests across 4 files; 25 tests belong to input (10 pure recognizer/tilt/gravity tests, 15 input lifecycle/permission/touch integration tests).
- `npm run dev`: server/input smoke PASS: server started on 5173; HTTP GET of `/client/input/index.ts` and `/client/input/gestures.ts` returned 200 with Vite-transformed JavaScript. Stopped this smoke server afterward. Full-app smoke was unavailable at that moment because claude-ui's `/client/app/main.ts` was still missing (Vite reported it); no end-to-end game claim.
- Real phone sensors, iOS permission UI, haptics, and landscape feel: UNVERIFIED, require venue/device testing. Synthetic tests do not claim physical sensor or visual proof.

## Remaining
None for the assigned cards. Physical-device listening/audio routing and original sensor acceptance remain venue handoffs. Full app audio wiring belongs to claude-ui; the exact integration calls are below.

## Audio card plan
- Lazy AudioContext unlocked from first tap/click; separate music/SFX buses, master compressor, mute/volume, limited concurrent SFX.
- Pure GameEvent -> sound-cue mapping with self emphasis; current shared hit event has no attacker/crit field, so document interpretation without editing shared/.
- Seven distinct weapon voices, dash, bitcrushed hits, error telegraphs, modem boss sting and keyboard UI ticks.
- Six theme-specific generated chiptune loops plus lobby/victory/defeat; phase 2 drums + faster tempo, phase 3 distortion + glitch stutters.
- `client/audio/demo.html` for auditioning all public calls; optional helpers for explicit intro/UI/lifecycle.

## Audio implemented
- `client/audio/index.ts`: lazy gesture-unlocked AudioContext; music/SFX buses -> master compressor -> bounded peak shaper -> user gain; mute/volume; 12-priority-voice SFX cap and per-category throttles; crossfading cached music; dispose.
- `client/audio/synth.ts`: zero-assets PCM synthesis; all seven weapons, dash, crushed hit/hurt/crit, combos, error telegraphs, limb bursts, down/revive, five skills, phase/end SFX, modem handshake and keyboard clack.
- All six arena themes have distinct scales/tempos/instruments; lobby/victory/defeat loops included. Phase 2: drums and +12% BPM; phase 3: +24% BPM, bitcrush, packet stutter, music-only distortion. Music uses sample-accurate looping buffers, no timers.
- `client/audio/events.ts` + `events.test.ts`: pure mapping, self emphasis and 18 passing mapping/PCM tests. Runtime has zero new dependencies.
- `client/audio/demo.html` / `demo.ts`: audition buttons for every theme/phase/weapon/event/skill, self toggle, intro/UI ticks, eight-player burst, mute and volume.
- `tools/audio-smoke.ts`: repeatable browser/DSP smoke using the already-installed Playwright devDependency; audio runtime still adds zero dependencies.

## Audio validation
- `npx vitest run client/audio`: 18 PASS (pure mapping and deterministic synthesis).
- `npm run typecheck`: PASS across the current repository.
- `npm test`: 168 PASS, 2 prior opt-in harness browser tests skipped by design.
- Tools-only strict typecheck of `tools/audio-smoke.ts`: PASS; owned `git diff --check`: PASS.
- `npx tsx tools/audio-smoke.ts`: PASS in Chromium, desktop 1280×720 and touch-emulated phone 844×390. Verified no context before gesture, one running context after click/tap, every demo SFX/weapon/skill/theme/phase control, finite non-silent output, master compressor/shaper, mute stopping all sources with measured RMS 0, retained music on unmute, volume .25, and context closed on teardown. Zero browser/page/HTTP errors in the passing run.
- Terminal loop durations: phase 1 8.5714s, phase 2 7.6531s, phase 3 6.9124s. Eight-player burst sampled output peak .4257 (below 1), finite PCM. Active SFX cap is 12 plus 12ms fade tails when stealing; output probe's max 15 total live sources includes music/crossfade/tails, not 15 steady SFX voices.
- Passing artifact: `docs/shots/2026-10-24T18-40-06-709Z-audio/audio-smoke.json` with desktop/phone screenshots alongside it. Earlier run had correct audio checks but failed for the demo's missing favicon; fixed with an inline empty favicon and reran cleanly.
- Browser/DSP checks do NOT establish human-perceived sound quality, physical iOS unlock/routing, phone speaker audibility, or OS background/resume behavior. Those remain UNVERIFIED until device listening.

## Handoff to claude-ui
Import `createAudio` from `../audio` and create **one instance per app**, retained across lobby/game/autopsy.

```ts
const audio = createAudio();
audio.music('lobby'); // safe before unlock: selection remembered, no autoplay
// Register at app entry. Keep this listener for later OS-suspended audio resumes.
const unlockAudio = () => { void audio.unlock().catch(console.warn); };
document.addEventListener('pointerdown', unlockAudio, { capture: true });

// Once for each NEW server snapshot; do not repeat events in the render loop.
audio.music(state.status === 'victory' || state.status === 'defeat'
  ? state.status : state.boss.kit.theme, state.boss.phase);
audio.onEvents(state.events, app.you ?? '');

// Detect new OWN bullet IDs in a snapshot, then call once per local shot.
// Group shotgun pellets from one snapshot into one call; helper also throttles.
audio.onFire(self.kit.weapon);
// On local dash starting (input edge or dashCd jumping from 0 to positive):
audio.onDash();
// Optional explicit UI action feedback:
audio.onUi();
// Mute toggle / settings range:
audio.setMuted(muted);
audio.setVolume(volume); // 0..1; default .6
```

- First transition into an arena in phase 1 automatically plays the modem boss-intro sting. `audio.onBossIntro()` is available for custom intro timing; don't call it every frame. Same-intro repeats are suppressed for 2.5s.
- Phase events update the active arena arrangement; victory/defeat events select the corresponding loop. Repeated `music(sameTheme, samePhase)` calls are idempotent.
- Transient SFX before unlock are dropped rather than replayed later. Music selection is retained. Mute stops active sources and retains the selected track for unmute.
- Only on permanent app teardown: remove the pointerdown listener and call `audio.dispose()`; don't dispose between ordinary screens.
- Audition page: `/client/audio/demo.html`. Full details: `client/audio/README.md`. Human listening and physical iOS speaker/resume proof remain unverified.
