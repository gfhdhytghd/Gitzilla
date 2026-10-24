DONE (autopsy wait)

Small harness follow-up: server autopsy can arrive at the end of the normal5s timed-fight grace while the UI is still in its2s defeat outro. Record message receive time and wait for visible autopsy for up to6s from that message before failing. Keep normal timed-fight behavior when no server ending arrives. Added a synthetic browser regression with a late server message +2.5s outro. No server lifecycle/live access or commits.

Verification:18PASS (14CLI +4browser fixtures), including the new regression:2s requested fight, server autopsy at6.2s, visible UI2.5s later. Harness waited through the delayed outro and captured desktop +phone autopsy with exit0. Artifact `docs/shots/2026-10-24T20-42-02-649Z-1910294/summary.json`. Whole-workspace typecheck and touched-file whitespace PASS. No live/server lifecycle changes or commits.

DONE (ios permission)

Urgent iPhone follow-up: preserving coordinator commit2bcc826 (auto permission only touchend/click). Initial staging failure diagnosed from20-27-33 artifact: stale harness assertion explicitly allowed pointerdown/click but rejected touchend; only9snapshots because assertion aborted immediately, not game failure. Tightening mock to reject pointerdown/touchstart/inactive/untrusted permission calls. Inspecting denial retry/state+sensor UI; DEV5175/staging5176 only, never live5173.

Primary-source verification: WebKit's User Activation API (https://webkit.org/blog/13862/the-user-activation-api/) lists touchend and non-mouse pointerup; touch pointerdown/start are not activating. Click handlers run after activation. W3C requestPermission requires transient activation when permission is prompt (https://www.w3.org/TR/orientation-event/). Therefore preserving touchend/click is correct; do not generalize that Safari will *always* return denied from pointerdown if some earlier gesture left activation active.

Found/fixed two additional input bugs: denial cleared needsPermission and cached pendingPermission forever (subsequent taps returned cached false); promise rejection/native throw now remain retryable, and settled attempts are cleared. Auto touchend+click is deduplicated for one tap; explicit button onclick owns its request. Native granted alone never sets sensorStatus=on: only a later valid sensor event does so.

Minimal app/game.ts integration authorized by this follow-up's UI-truthfulness requirement: enable pill stays visible until sensorStatus=on (including denied/no-events/lost sensors); status otherwise says tap to enable tilt; recalibrate only when live. Removed unconditional hide after request result. Fullscreen moved from touch pointerdown capture to click bubble so target button onclick permission runs before fullscreen. Lobby onclick already invokes native methods synchronously; preserved.

First corrected harness run DEV5175 PASS:23checks/482snapshots/718inputs/0errors, trusted touchend active=true for both requests; artifact docs/shots/2026-10-24T20-29-18-077Z-motion-v3/. This run was before extra retry/status edits; staging rebuild + final status cases next. Rebuilding ONLY staging5176 (explicitly authorized), copying input/index.ts and minimal app/game.ts, no live5173 access or restart.

Staging permission retry test exposed another REAL phone bug: `.deck` has `pointer-events:none`; enable-pill lacked the explicit pointer-events:auto that recalibrate already has. Browser saw the pill but all native taps hit the game container instead. Fixed the actual enable button to opt into hit testing (inline minimal app/game.ts integration). No forced clicks in harness; rebuilding staging and retesting with real touch.

## Final iOS permission verification / coordinator handoff
- **STAGING5176 GREEN**: `MOTION_URL=http://localhost:5176 npx tsx tools/motion-v3.ts` →26checks PASS,483authoritative snapshots,718input frames,0browser/WS errors. Artifact: `docs/shots/2026-10-24T20-31-44-023Z-motion-v3/{summary.json,inputs.json,permission-granted-awaiting-sensors.png,portrait-motion.png}`.
- Both first native requests ran from trusted active touchend; denial remained off + visible actual retry button. Both retry requests ran synchronously from trusted active click. Readings injected while native promises were pending were ignored. Native granted without subsequent data still displayed tap to enable tilt. Only later valid sensor events changed status to on. All movement/actions/trace checks passed after recovery; actual tap hit testing, no forced click/evaluate permission invocation.
- Focused input/audio/CLI suite:139PASS (91input,34audio,14CLI). New cases: no requests from touch pointerdown/start; touchend+click dedupe; both native grants plus later usable event; denied/rejected/thrown attempts retry; mixed native grant/deny stays off. Whole-workspace typecheck and touched-file whitespace PASS.
- Rebuilt coordinator-managed production staging5176 from worktree2bcc826 + only updated client/input/index.ts and minimal client/app/game.ts. No staging/server restart required; production static server serves the new dist. Stage index bundle `dist/assets/index-CZuQKtNU.js`. Root files/tests/tools/docs are ready for coordinator commit/deploy; I did not commit or touch live5173.
- Handoff to claude-ui: preserve enablePill.style.pointerEvents='auto' (portrait deck itself ignores pointer events), keep enable visible whenever a motion profile is selected but sensorStatus is not on, do not hide it merely because native permission resolved. Fullscreen listener is now click **bubble**, after target onclick and touchend-capture permission handlers. Lobby's existing synchronous onclick permission calls are preserved.
- Prior failures retained:20-27-33 was stale harness assertion rejecting valid touchend;20-30-59 exposed unclickable permission pill inherited from deck CSS. Both fixed.
- Evidence boundary: Chromium portrait touch emulation with strict native-permission mocks + real staging UI/simulation/trace endpoint; physical iPhone OS prompt still requires user confirmation. WebKit/W3C primary sources linked above verify the activation requirement.

DONE (motion v3)

Latest user gesture table supersedes earlier shake/two-finger notes: tap/swing = 600ms attack burst; long-press ≥550ms OR integrated gyro spin ≥270°/~1.2s = skill; twist-return (<120° net excursion) OR double-tap <300ms = dash. No held-fire and no phone control buttons/joystick. Calibration steps: neutral, tilt, swing×3, twist×3, spin×2 (long-press alternate shown). Owner recognizer/recorder/trace/tests complete. Scope input/tools and own progress only; UI training/toasts/layout owned by claude-ui, trace endpoint by codex-net.

## Contract requests (motion v3)
- **DEV stale-module cause found:** vite.config.ts ignores `**/data/**`, but the entire checkout lives under `/home/wilf/data/...`. Existing input/index.ts + debug.ts keep serving OLD cached transforms despite newer on-disk source (curl confirms missing gyro imports/lines); new gestures.ts was fresh. Please have coordinator fix ignore patterns to project-relative data only / restart DEV 5175 after changes. I will not touch the shared server lifecycle or this config. Playwright v3 will request fresh owned input modules with a query revision to prove current source without restarting. This cache issue can explain “it still doesn't work” when testing new phone code on DEV.
- **OPEN UI INTEGRATION:** Current UI trainer duplicates raw recognition and stores neutral as `[beta,gamma]`; input expects transformed `[roll,pitch]` = `screenTilt(beta,gamma,angle)`. Please use input.calibration recorder or explicitly transform neutral before save to avoid swapped movement axes. `toThresholds()` must not pass raw beta/gamma as neutral. `screenTilt` is now exported directly from `client/input/index.ts` for this conversion. Recorder result already uses screen-relative coordinates and is ready for UI.
- RESOLVED by UI owner: old placeholder InputHandle diagnostic no longer appears; current whole-workspace typecheck passes. I did not edit app/placeholders.ts.

## Handoff to claude-ui — motion v3 API ready
- Existing single `createInput(opts)` gains readonly `profile: GestureThresholds`, `setProfile(partialThresholds)` (sanitizes + saves local), `calibration` recorder, `trace`, `lastGesture`, and optional `opts.onGesture(notice)` for your 400ms toast. Notice: `{kind:'attack'|'dash'|'skill',via:'tap'|'swing'|'twist'|'double-tap'|'spin'|'long-press',at:performance.now()}`. No shared/network contract changes. Existing motionProfile accessibility preference remains separate.
- Drive recorder: `input.calibration.startStep('neutral'|'tilt'|'swing'|'twist'|'spin')`; poll `.meter()` via your animation loop; `.ready`, `.count/.goal` are ✓ feedback, `.acceleration/.gyro/.spinDegrees/.tilt/.ranges/.peak/.gyroAvailable` power live meters. Aliases attack/dash/skill also accepted for step names. Neutral ≥300ms; tilt checks all 4 directions; swing goal3 (tap alternate); twist goal3 (double-tap alternate); spin goal2 (long-press counts as accessible alternate). Show exact user vocabulary: **spin or long-press** for skill, **twist or double-tap** for dash. No shake step.
- Finish/save: `input.setProfile(input.calibration.result()); input.calibration.stop();` Stop uploads trace; result is a pure snapshot. Skips preserve defaults. Re-training starts from neutral and clears prior training samples. Storage `kaiju.motionCalibration.v3`, per browser/player and accessibility profile, no identity/room metadata.
- Create one controller for lobby preview/training and reuse or dispose on route exit; gameplay reloads the saved profile. Sensor permission must still be requested directly in a gesture, alongside sound unlock, before fullscreen/awaits. No extra sensor listeners needed in UI.
- Input already draws `[data-testid=input-charge]` for hold charge; please remove the duplicate app/game.ts ring to avoid doubled feedback. The recorder accepts tap/double-tap/long-press as accessible training alternates, preserving motion thresholds when the player uses touch.
- Generic tools/playtest.ts now drives phone fallback with invisible drag + tap/double-tap/hold (keyboard remains desktop); this resolves claude-ui’s report that the phone harness sent keyboard-only controls. Harness fixtures pass.
- Input module itself removes all old `.kj-touch-button`, `[data-testid=input-dash|input-skill]` and joystick nodes. Motion has only a non-interactive charging ring under the finger. Sensor fallback uses invisible full-screen drag + tap/double-tap/long-press (no drawn buttons). UI owns deck/control-label removal, training prompts, toasts and sensor-lost pill; use existing sensorStatus and requestPermission().
- `?trace=1` auto captures/uploads 20s; training starts trace automatically; `input.trace.upload():Promise<boolean>` explicitly flushes; `.status/.error` lets UI/dev report missing endpoint without crashing. Raw orientation + acceleration including gravity + rotationRate + recognized gestures + UA/platform only, capped60Hz/stream +20s. Endpoint owner codex-net.

## Motion v3 verification (owner code)
- Implemented pure all-axis gyro integration/classification, swing/touch vocabulary, per-player threshold persistence, calibration recorder, bounded raw trace capture/upload, gesture notices/debug and phone surface with zero virtual controls. Twist classification waits for snap-back + quiet; net excursion ≥120° or a spin blocks dash. Fast gyro candidates freeze movement before final recognition; every recognized action freezes250ms. Holds never continuously fire; tap/double-tap ambiguity is resolved before attack.
- `tools/motion-v3.ts`: 23 checks PASS, real DEV UI→/ws→authoritative snapshots/acks, all4 directions, tap + all6 swing axes + iOS null-acceleration shots, gyro twist all3 axes, spin and long-press skills, double-tap dash, no cross-action leaks, charging ring, zero button/joystick nodes, fallback/recovery, permissions/debug, 20s trace HTTP201. Artifact `docs/shots/2026-10-24T20-15-17-778Z-motion-v3/`:483 snapshots /719 inputs /0 errors,1192 trace samples including every gesture vocabulary kind. Earlier successful run at20-11-38 had483snapshots/721inputs.
- `tools/calibration-smoke.ts`: 6 checks PASS using actual input recorder via explicit UI-driver fixture (not product lobby UI): neutral + all4 tilt ranges +3swings +3twists +2spins, save/reload, raw gyro/gesture trace HTTP201. Artifact `docs/shots/2026-10-24T20-18-07-852Z-calibration/`. Learned swing6m/s², twist180°/s, spin220°, fullSpeed9.6°, neutral[0,45]. Earlier fixture hang reading Playwright response.json was fixed; failed artifacts retained.
- Inclusive component browser regression6PASS: `docs/shots/2026-10-24T20-12-10-819Z-inclusive-motion/`. Phone audio actual DEV regression PASS: `docs/shots/2026-10-24T20-17-50-897Z-phone-audio/`, both session branches, same-context/loop recovery, no page errors.
- Generic playtest: fixed removed-button driver and final CDP touch-end cleanup. Three synthetic harness fixtures PASS. Real later smokes interrupted by shared DEV restart/connection refusal, retained under20-16-52,20-17-49 and20-18-05 timestamps; not claimed as pass. No server lifecycle actions taken.
- Final focused run:133PASS (85input,34audio,14CLI). Whole-workspace typecheck PASS; owned diff whitespace PASS. Five new trace tests include failed-endpoint/network retries, upload size cap, pending-upload isolation, partial dispose flush and ~60Hz sampling at16ms. Fixed a synchronous upload rejection leaving a stale pending promise; retry now works.
- Later generic real DEV run20-18-55 reached232snapshots/player before server restart: phone331inputs/111moving/66firing/1dash/1skill/ack330 (touch295,motion36); desktop342inputs. Driver works end-to-end, but whole run remains FAIL due shared restart; no false pass. Later motion reruns20-18-06 and20-18-54 also interrupted by shared restarts.
- Latest full suite:533PASS /5FAIL /7SKIP. Failures outside owner scope:4design weapon-name/cache/schema expectations,1genesis weapon-name expectation during concurrent naming changes. Input/audio tests pass. Whole-workspace typecheck and owned whitespace checks PASS.
- Physical-phone feel/native iOS permission dialogs, actual silent-switch behavior and hardware listening remain UNVERIFIED. Lobby UI needs the neutral-coordinate/recorder handoff above; do not treat the standalone UI trainer’s ✓s as recognizer proof until aligned.

## DONE (phone audio) / Handoff to claude-ui
Phone audio DONE: playback session API with inline silent PCM media fallback; gesture-synchronous native resume (non-async unlock), lifecycle/interruption recovery and re-armed activating listeners; debug audio state/music/session/retry visibility. Existing app/sound.ts listeners preserved. Lobby enable-motion **must double as sound unlock**: call `void audio.unlock()` directly in the same gesture before awaiting native permission or fullscreen; existing app-wide pointerup/touchend/click capture listeners already cover it. Do not defer unlock through a promise/timer. Engine now exposes readonly `state`, `musicPlaying`; `readAudioDebugStatus()` is side-effect-free.
- `npx vitest run client/audio client/input tools/playtest.test.ts`: 103 PASS. Lifecycle file: 8 PASS; public unlock invokes resume and media.play before microtasks; interrupted/suspended/blocked/pending-resume retries and disposal verified.
- Whole workspace `npm run typecheck`: PASS after fixing test fixture typing.
- `tools/phone-audio.ts`: PASS, actual DEV landing, strict autoplay, portrait touch 390×844/DPR3. Both native silent-media fallback and mocked audioSession playback branches: first tap → one running context, one music loop, nonzero analyser output; visibilitychange/pageshow → same loop/context recovered; debug panel reflects suspended/running + music. Zero page errors. `docs/shots/2026-10-24T20-06-56-562Z-phone-audio/`. Earlier harness failures (tsx serialization name helper / gesture probe instrumentation) corrected and retained as failed artifacts.
- Broader audio DSP/demo regression PASS: `docs/shots/2026-10-24T20-05-57-581Z-audio/`, desktop + phone, peak .4139, mute/volume/cleanup.
- Physical iOS silent switch, OS-call interruption, phone speaker output and human listening UNVERIFIED; these results are Chromium emulation + lifecycle unit proof. No 5173/live access, server lifecycle, new dependencies, assets or commits.

DONE (phone audio)

Phone-audio follow-up accepted. Coordinator's committed app/sound.ts gesture listeners are preserved. Scope: client/audio/, client/input/debug.ts, tools/, tests and this log. Plan: synchronous playback-session unlock (audioSession or silent inline media fallback), recover after interruptions/visibility/pageshow with re-armed gesture handlers, visible debug audio state, lifecycle/gesture invariant tests and DEV-only mobile browser verification. No 5173/live access, no commits/new dependencies.

Owner parts complete: persistent inclusive controls in all modes; lesson/quiz/PvP audio; null-boss-safe examples; classroom playtest for 2–30 students with no boss, quality/PvP/ranking evidence; required-mode fixture updates. No commits, shared edits, new dependencies or live-server access. Full live classroom acceptance awaits other owners' UI/sim integration.

Education/social-impact card read (`docs/tasks/edu.md`, `docs/social-impact.md`, committed shared types). Owner work: persistent standard/seated/tap-only MotionProfile and accessible thresholds; audio support for lesson and quiz verdict events; education-aware tools/fixtures and owned contract type fixes. Onboarding/settings UI remains claude-ui-owned; handoff will specify exact APIs. DEV only localhost:5175, no commits/shared edits/new dependencies.

Latest user update accepted: edu is CLASSROOM PvP (no boss, quality-derived heroes, up to 30 students). Earlier boss-edu assumptions are superseded. Null-boss audit first: owned input/audio have no boss dereferences; tools' `.boss` references are lobby configuration/options, not nullable MatchState boss. Audio's new lesson event requires mapping. Playtest edu path will skip boss setup and inspect mode/heroScale/PvP snapshots. Outside-owner null-boss compile errors are left to their owners.

## EDU PvP handoff to claude-ui — APIs ready now
- Input exports `loadMotionProfile()`, `saveMotionProfile(profile)`, `MOTION_PROFILES`, `MOTION_PROFILE_LABELS` from `client/input/index.ts`. Storage key: `kaiju.motionProfile`; values are shared `MotionProfile` (`standard`, `seated`, `tap-only`). No server/network data added.
- Choose/save profile BEFORE creating the input controller, so tapping **Tap only** cannot accidentally open a sensor-permission prompt from an already-active standard controller. `createInput({canvas,toArena,getSelf,motionProfile: choice})` also accepts an explicit initial value; omitting it loads saved preference.
- For the settings gear during play, use `input.motionProfile` and `input.setMotionProfile(choice)`: it persists, resets neutral/old actions, changes joystick visibility immediately, and safely ignores stale in-flight native permission results. Seated: full speed 8°, deadzone 5° vs standard 4°, smoothing 150ms vs 65ms, swing 6m/s² vs 12m/s², refractory 350ms vs 200ms. Tap-only: no permission or sensor processing, joystick + existing tap/hold attack and action buttons.
- Labels: “Standard”, “Seated / low-motion”, “Tap only”. Your calibration/onboarding/settings choice UI remains yours; do not duplicate a second input controller. Input/profile code has 55 passing tests. Settings/profile UI taps cannot auto-open sensor prompts; the dedicated enable button and attack-area taps still request before fullscreen.
- Audio now accepts `lesson` and `perk.correct` (`true` -> positive quiz chime, `false` -> gentle retry cue, absent -> ordinary perk jingle). Existing `onEvents` is sufficient.
- For no-boss PvP music: `audio.music('notebook', Math.min(3, state.pvp?.round ?? 1) as 1|2|3, {intro:false})`; third options arg is new and suppresses boss-modem summon. Use `state.boss?.kit.theme` / `state.boss?.phase` for optional battle values; never dereference null.
- Playtest contract request: owner mode buttons `[data-testid="mode-battle"]` / `[data-testid="mode-edu"]`, synchronized with server `LobbyState.mode`. Implemented `--mode edu` skips every boss control, validates null-boss/heroScale/PvP/quality snapshots and checks complete ranking if a natural match end is reached.
- Minimal integration-only edit: `client/app/renderers.ts` aliases InputHandle/CreateInput to the real InputController/InputOptions so profile methods/options are typed. No functional UI edits for this card.

## EDU PvP verification and limitations
- Final whole-workspace `npm run typecheck`: PASS. No owned mode/null-boss diagnostics; lesson event mapping fixes audio exhaustiveness.
- Final input/audio/CLI tests: 95 PASS (55 input/profile, 26 audio, 14 CLI). Strict tools/input/audio TypeScript and owned whitespace checks PASS.
- Opt-in Playwright harness fixtures: 3 PASS (battle, error exit, classroom PvP), plus 14 CLI tests. Classroom fixture verifies mode control, no boss configuration, 2x/null-boss/PvP/quality snapshots and ranking autopsy. Synthetic fixture proof only; not real-classroom acceptance.
- `tools/inclusive-motion.ts`: 6 browser component checks PASS, actual DEV input module at 390×844/DPR 3. Verified seated 8° full speed, tremor filtering, small flick; tap-only sensor/permission isolation + tap attacks; storage persistence after reload; live restoration of standard thresholds. Artifact: `docs/shots/2026-10-24T19-38-54-685Z-inclusive-motion/`. No product-onboarding/network/hardware claim from this component fixture.
- `tools/audio-smoke.ts`: PASS, zero browser errors. New lesson/quiz voices and classroom boss-sting suppression checked; desktop + portrait phone mute/volume/cleanup/finite DSP. Artifact: `docs/shots/2026-10-24T19-39-31-167Z-audio/`, sampled stress peak .4352.
- Final `tools/motion-v2.ts`: 18 real DEV checks PASS, 298 snapshots / 442 input frames, zero errors. Artifact: `docs/shots/2026-10-24T19-43-00-909Z-motion-v2/`. Updated the test to tap the actual attack area for permissions after UI moved the enable control to a compact intro-hidden pill; original six-axis/snapshot/action/permission proof preserved.
- Live `--mode edu --players 2 --seconds 10` reported missing mode-edu while its UI was not yet implemented and a shared DEV restart. Artifact: `docs/shots/2026-10-24T19-39-29-798Z-1575218/`. Real classroom rounds, teacher board, full ranking/quiz flow and 30-student performance remain PENDING. No outside-owner simulation/UI edits to fabricate a pass.
- Latest full suite during concurrent work: 377 passed / 7 failed / 7 skipped. Six failures are analysis fetch-count expectations after new metadata calls (5→9 / 15→27); one is qa/robustness.test.ts 5s timeout. These outside-owner files were left untouched; scoped tests pass.
- Physical-phone accessibility feel, native iOS prompts and human listening remain UNVERIFIED. Motion profiles stay local and do not alter quality stats or network contracts.

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
