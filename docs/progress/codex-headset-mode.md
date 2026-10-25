# Headset logic — DONE / runtime frozen

Uncommitted owned work: NEW client/app/device.ts, device.test.ts, tools/headset-check.ts; logic deltas in main.ts, lobby.ts, settings.ts, util.ts, view25d.ts. No commits, CSS/visual edits, or game.ts edits by Codex. main.ts also contains another owner's /demo route; preserved. game.ts changes belong to claude-ui.

## Exported API and wiring
- `detectDevice(): Promise<DeviceKind>`, `getDevice(): DeviceKind|null`, `isHeadset()`, `usesLocalControls()`, `requiresPhoneController(mode?)`. Cached result exposed as `globalThis.__kaijuDevice`; `?device=headset|phone|desktop` overrides.
- Headset requires Macintosh+touch+immersive-vr, or OculusBrowser/Quest/Pico+immersive-vr. Desktop Chrome with an XR runtime is still desktop; iPad without immersive-vr stays tablet/desktop layout.
- Main waits for detection before settings/routing. Every headset display welcome/reconnect sends `{t:'controls',ready:false,mode:'standard',needsController:true}`. No positive local readiness or motion subscription. codex-net implemented server policy; controller-link readiness is authoritative.
- Headset 3D defaults on even with saved 2D preference; explicit `?view=2d` wins. Other device preferences unchanged.
- Settings/onboarding/lobby suppress local motion flow. Headset layout avoids phone controller-offer routing. claude-ui independently added game helper callsites: input setup skipped, permission callbacks guarded, XR panel for headset, default follow own hero.
- Edu headset automatically becomes `screen=1&view=projector`. Room mode arrives at welcome. A projector first joins and stores its separate resume token, then the temporary player leaves. Wait for the server lobby removal acknowledgement before navigating: prevents deleting an edu room when the headset is its first visitor. No retained fighter slot/controller requirement.

## Exact lobby.ts edits
Only lines 22 (device import), 296 (pairPanel required option), 452 (local gate), 1097 (motion CTA guard), 1149 (permission subscription guard). Zero game.ts lines edited by Codex.

## Verification
- `npx vitest run client/app`: 78 PASS / 5 files, including 27 device/view matrix tests and 45 controller-link regressions. Log `/tmp/headset-app-tests-final.log`.
- `npm run typecheck`: PASS; `npm run build`: PASS (existing chunk/dynamic-import warnings). Final projector ACK guard included in the passing tsc/build and repeated browser run.
- `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npx tsx tools/headset-check.ts`: WebKit + Chromium PASS, zero page errors. Evidence `/tmp/gitzilla-headset-2026-10-25T08-27-38-303Z/summary.json`, both browsers' unpaired/game PNGs.
- Browser checks use real RoomServer/controller HTTP/auth handlers, sealed synthetic GitHub identity, actual controller-link in separate browser context. Verify required card/no motion prompt, unpaired START disabled, linked phone readiness enables START, display reload preserves phone readiness and resends only negative declarations, default3D despite saved2D, follow exactly own seat, click invokes XR entry, no display inputs/sensor permission requests, explicit2D, edu first-visitor projector/no fighter slot, desktop/phone local controls unchanged.
- XR/stage are injected fakes: these checks prove routing/control/3D adapter wiring, not physical headset or GPU rendering. Visual note for claude-auth: the required card within the XR panel can extend below a 900px viewport; see game PNGs. No CSS edits by Codex.
- Earlier fixture iterations: esbuild `__name` serialization fixed in test init; missing XR button resolved after claude-ui callsites landed; browser found first-visitor edu room deletion and main now uses projector-first handoff.

## Final freeze
- Final dual-browser repeat PASS after projector removal ACK guard: `/tmp/gitzilla-headset-2026-10-25T08-28-12-718Z/summary.json`, zero page errors, screenshots `webkit-unpaired.png`, `webkit-game.png`, `chromium-unpaired.png`, `chromium-game.png` in the same directory. Log `/tmp/headset-browser-final.log`.
- Runtime frozen for coordinator snapshot. No game.ts changes by Codex; lobby line list above remains exact. Server contract handoff confirmed by codex-net (dedicated WS + actual process restart tests are its evidence, not claimed as my own run).
