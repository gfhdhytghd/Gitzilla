# Phone input: horizontal gravity + page-local permission

Movement follows the latest user specification: screen-up horizontal = zero; tilt angle0–15° maps **linearly** to0–100% speed, clamped above15°. Top edge downhill moves up; right edge downhill moves right. A0.6° noise floor suppresses sensor noise, without rescaling the rest of the curve. Gravity is low-passed at45ms, with immediate direction reversal. Portrait-only phones use upright screen coordinates even if WebKit exposes a stale screen angle; tablets/landscape rotate the vector into screen coordinates. No calibrated movement zero, recenter or drift correction. Stored legacy neutral/full-speed values do not affect movement.

The gravity vector comes from beta/gamma converted into device coordinates (avoiding scalar pitch/gimbal discontinuities), or low-passed accelerationIncludingGravity if orientation is absent. Platform gravity polarity is normalized. Gesture motion freezes movement for120ms. Motion/touch always auto-aim.

```ts
import { createInput } from '../input';
const input = createInput({ canvas, toArena, getSelf,
  onGesture: ({kind,via}) => showToast(`${kind} · ${via}`) });
send({t:'input',frame:input.sample()}); //30Hz
input.dispose(); //route exit
```

## Permission gate: preference is not permission

```ts
import { getMotionPermissionState, requestMotionPermission,
  subscribeMotionPermission, saveMotionProfile } from '../input';
const unsubscribe = subscribeMotionPermission(state => {
  enableStep.hidden = !state.required || state.ready;
  conn.send({t:'controls',ready:state.ready,mode:state.profile});
});
enableButton.onclick = () => {
  saveMotionProfile('standard'); //or seated; touch-only bypasses motion
  void audio.unlock();
  void requestMotionPermission(); //BOTH native methods invoked synchronously here
};
//Unsubscribe when lobby unmounts; the session itself persists into game.
```

Snapshot: `{mobile,profile,required,permission,needsPermission,sensorStatus,ready}`. Permission is prompt/requesting/granted/denied/not-required. `ready` requires a native grant **in this page** and a later valid sensor event. Android has no request API: actual readings make it ready. Desktop and explicitly selected tap-only bypass the gate. Window event `kaiju:motion-permission` carries the same snapshot in `detail`; subscriptions immediately receive current state and then changes only.

No permission state is stored. `kaiju.controlsChosen` and motion profile remember only a preference. A reload starts unready even if these exist. One page session shares state between lobby/training/game, so a lobby grant does not need re-asking at match start. `InputController.needsPermission/sensorStatus/requestPermission()` use this same session. A missing stream goes off after1.5s initially/1.8s after loss; valid late events recover. Visibility return needs fresh readings. Denials/rejections remain retryable.

Native requests must run in touchend/click, never touch pointerdown/start. Invoke both before awaits, fullscreen or notifying subscribers that might consume activation. The enable pill must have pointer-events:auto inside the non-interactive portrait deck. Do not hide it just because native grant resolved: require readings too. [WebKit activation rules](https://webkit.org/blog/13862/the-user-activation-api/) and [W3C motion permissions](https://www.w3.org/TR/orientation-event/).

## Gesture vocabulary and settings

| Action | Phone gesture |
| --- | --- |
| Move | Horizontal-plane tilt; invisible full-screen drag for fallback/tap-only |
| Attack | Any-axis swing/flick or quick tap (<250ms),600ms burst |
| Dash | Quick twist that returns/settles, net excursion<120°; or double-tap<300ms |
| Skill | Integrated spin≥270°/1.2s or long-press≥550ms |

No drawn phone buttons/joystick. Holding skills once, never continuous fire or a release attack. A non-interactive ring displays charge. Single taps wait300ms to rule out double-tap; movement>24px cancels touch gestures. Gyro uses deg/s, actual timestamps and low-rate filtering. Twist classification waits for reversal, return and100ms quiet: spins cannot dash. Swings block twist dashes. Blur/touch cancel clears pending actions. UI buttons/inputs/links and `[data-input-ignore]` are excluded.

Lobby-only sensitivity: `loadTiltSensitivity()`, `saveTiltSensitivity(value)`, `TILT_SENSITIVITIES` = slow/normal/fast; full speed at20°/15°/10°. Stored under kaiju.tiltSensitivity; normal is default. `input.tiltSensitivity/setTiltSensitivity()` supports live preference changes without in-game buttons. Accessibility `MotionProfile` remains standard/seated/tap-only: seated uses6m/s² swing vs standard12 and a350ms refractory; movement follows the same gravity spec. Tap-only requests/processes no sensors.

Training can still drive `input.calibration.startStep('neutral'|'tilt'|'swing'|'twist'|'spin')`, poll `.meter()` and save `input.setProfile(input.calibration.result())`, then `.stop()`. Historical neutral/tilt steps provide tutorial feedback only; **result.neutral=null**, movement is never calibrated to that pose/range. Swing/twist goals3, spin2; tap/double-tap/long-press alternatives preserve motion thresholds. Gesture thresholds use clamped60% median peaks. `lastGesture`/onGesture contains `{kind,via,at}` for400ms toasts.

## Automatic tuning traces

Every phone fight automatically captures its first20s; no trace flag required. The standalone lobby trainer is observed by its stable `[data-testid=training]` root, covering its legacy independent sensor listeners. Capture is limited to one per source/minute/page; routing/dispose flushes partial traces. Pagehide sends a representative JSON beacon below58KB for Safari's unload queue cap. Normal POST uses application/json at same-origin `/api/trace`, bounded1.9MB, with ≤60Hz per raw stream and sampled input vectors. Server stores under.cache/traces; net owner controls retention.

Payload contains raw orientation, acceleration/includingGravity, gyro, gesture edges, sensitivity/settings, sampled movement, UA/platform and source. **automated/syntheticSensors flags distinguish Playwright traces from real phone data.** No player/room/repo identifiers. `input.trace.status/error` and `?debug=input` expose upload state. Beacon accepted means queued, not physical-device acceptance. Explicit `input.trace.upload()` retries a failure. `?trace=1` remains available for desktop debugging.

Desktop stays WASD/arrows, LMB/J fire, Space/K/Shift dash, E/L/RMB skill. Mouse aim expires after2s. `vibrate()` is best effort.

Verification (DEV5175 or coordinator staging5176; no live5173):

```sh
npx vitest run client/input client/audio tools/playtest.test.ts
MOTION_URL=http://localhost:5176 npx tsx tools/motion-v3.ts
npx tsx tools/phone-trace.ts
npx tsx tools/permission-gate.ts
```

Motion E2E uses real UI/network/simulation with synthetic sensors. Phone-trace is an explicit WebKit component fixture using the real input module and trace endpoint. Permission-gate tests real WebKit/iPhone lobby across a second page load with saved choices, strict click-origin native mocks and fresh readings. OS dialog/device feel/hardware listening require a real phone. HMR/cache bypass in tooling prevents shared DEV edits or its broad watch ignore from serving mixed revisions; only test tabs are affected.
