# Phone and tablet input: horizontal gravity + page-local permission

Movement follows the latest user specification: screen-up horizontal = zero; tilt angle0–15° maps **linearly** to0–100% speed, clamped above15°. Top edge downhill moves up; right edge downhill moves right. A0.6° noise floor suppresses sensor noise, without rescaling the rest of the curve. Gravity is low-passed at45ms, with immediate direction reversal. All screen orientations use the same resolved angle for movement and dash. Safari uses its portrait-relative window.orientation (including MacIntel+touch iPadOS); modern-only Safari falls back to the orientation type, while other browsers use screen.orientation.angle. No viewport-width/height guess: a portrait-shaped iPad Stage Manager window can still be on a landscape display. -90 is normalized to270. No calibrated movement zero, recenter or drift correction. Stored legacy neutral/full-speed values do not affect movement.

The screen rotation convention follows [Apple’s orientation API](https://developer.apple.com/documentation/webkitjs/domwindow/1632568-orientation) and the [device coordinate frame](https://w3c.github.io/deviceorientation/): at90° sensor-left is screen-bottom; at270° sensor-right is screen-bottom. `screenOrientation(window,navigator)` is exported for the product trainer to share. Motion-capable detection uses touch points or a coarse pointer, so a MacIntel iPad with a fine pointer remains a mobile input device. `?debug=input` and traces record resolved/source/raw window/modern angles; old traces only recorded the resolved value.

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
| Dash | Motion: straight swipe≥55CSS px in≤300ms, or tilt≥50°; drag fallback: double-tap<300ms |
| Skill | Translate the phone in a circle (keep orientation steady),≥300°/1.5s or long-press≥550ms |

No drawn phone buttons/joystick. Holding skills once, never continuous fire or a release attack. A non-interactive ring displays charge. Motion taps attack immediately on release (<250ms); two taps are two attacks. Drag fallback taps wait300ms to rule out double-tap. Movement>24px cancels tap and long-press. Motion swipes require≥55CSS px within≤300ms, endpoint/path ratio≥.85 and limited lateral deviation. They emit once on release, never a tap attack; a second finger cancels the gesture. Swipe and tilt share a650ms cooldown. Pointer coordinates already use the display frame, so normalized swipe direction goes straight into frame.move without an extra orientation rotation. Tilt dash uses the same gravity/downhill screen vector as movement and captures that direction on the dash frame. Its50° threshold is independent of lobby sensitivity and has35° hysteresis. A crossing during cooldown consumes that excursion; holding beyond50° never repeats. Gyro twist dashes are removed. Steering-wheel rotation never skills. Gyro is used only to reject rotating “circles”. Circle detection fits gravity-removed acceleration in any plane and requires a monotonic≥300° sweep/1.5s, acceleration≥0.6m/s² (seated0.4), and integrated gyro<60°. Circle skills have a1.2s cooldown. Swings wait until release/120ms: a coherent early circle can defer a peak; only confirmed≥90° sweep claims it. Failed short fragments release one pending attack, while confirmed aborted circles have no refund until rest. Projected gyro rotation prevents fast wrist flicks from claiming circle arbitration. This fixes real iPhone swings previously swallowed by the20° candidate latch. Blur/touch cancel clears pending actions. UI buttons/inputs/links and `[data-input-ignore]` are excluded.

Lobby-only sensitivity: `loadTiltSensitivity()`, `saveTiltSensitivity(value)`, `TILT_SENSITIVITIES` = slow/normal/fast; full speed at20°/15°/10°. Stored under kaiju.tiltSensitivity; normal is default. `input.tiltSensitivity/setTiltSensitivity()` supports live preference changes without in-game buttons. Accessibility `MotionProfile` remains standard/seated/tap-only: seated uses0.8m/s² swing vs standard1.2 and a350ms refractory; movement follows the same gravity spec. Tap-only requests/processes no sensors.

Training drives `input.calibration.startStep('neutral'|'tilt'|'swing'|'dash'|'spin')`, polls `.meter()`, saves `input.setProfile(input.calibration.result())`, then `.stop()`. Legacy 'twist' aliases 'dash' and teaches **tilt hard to dash**, not rotation. `via:'tilt-dash'` or `via:'swipe'`, meter.dashTiltDegrees and instruction text expose the fixed50°/35° rule (gyro thresholds are no longer learned). Historical neutral/tilt steps are tutorials: **result.neutral=null**, with no movement-zero calibration. Swing/dash goals3, circle2. Swipe/double-tap/long-press alternatives count training repetitions without learning physical thresholds. Healthy sensor mode (standard or seated) uses swipe; drag-enabled fallback (including seated sensor loss and tap-only) keeps double-tap because quick drags are movement. Swing learns60% median peak, clamped0.6–8m/s²; circle learns90% median sweep (280–340°) and60% magnitude (0.3–3m/s²). The meter includes spinDegrees/spinMagnitude/spinGyroDegrees/instruction. v5 storage discards v3/v4 force-scale profiles; old app-trainer partial overrides containing twist + high swing are also normalized so game.ts cannot resurrect dead thresholds. `lastGesture`/onGesture supplies `{kind,via,at}`.

Real-phone diagnosis: eight original recordings (six iPhone, two nearly stationary MacIntel) contain8572 valid non-null motion samples. Ordinary iPhone peaks0.95–6.22m/s² never crossed the old12m/s² default. The strongest100.58m/s² trace still fired zero because tiny curving fragments cancelled every pending swing. New replay restores27 attack edges across five above-threshold iPhone recordings; quiet/tap noise stays quiet. No trace contains a qualifying quiet-gyro300° circle; synthetic tilted/low-magnitude circles still verify skill. Derived six-decimal fixtures retain original names/SHA256 hashes in fixtures/real-phone-1025.json. Real-trace tests replay the pure recognizer AND actual controller event/sample path, including a detached pair-style surface.


## Automatic tuning traces

Every phone fight automatically captures its first20s; no trace flag required. The standalone lobby trainer is observed by its stable `[data-testid=training]` root, covering its legacy independent sensor listeners. Capture is limited to one per source/minute/page; routing/dispose flushes partial traces. Pagehide sends a representative JSON beacon below58KB for Safari's unload queue cap. Normal POST uses application/json at same-origin `/api/trace`, bounded1.9MB, with ≤60Hz per raw stream and sampled input vectors/action bits plus effective thresholds. Server stores under.cache/traces; net owner controls retention.

Payload contains raw orientation, acceleration/includingGravity, gyro, gesture edges, sensitivity/effective thresholds, sampled movement/fire/dash/skill, UA/platform and source. **automated/syntheticSensors flags distinguish Playwright traces from real phone data.** No player/room/repo identifiers. `input.trace.status/error` and `?debug=input` expose upload state. Beacon accepted means queued, not physical-device acceptance. Explicit `input.trace.upload()` retries a failure. `?trace=1` remains available for desktop debugging.

Desktop stays WASD/arrows, LMB/J fire, Space/K/Shift dash, E/L/RMB skill. Mouse aim expires after2s. `vibrate()` is best effort.

Verification (DEV5175 or coordinator staging5176; no live5173):

```sh
npx vitest run client/input client/audio tools/playtest.test.ts
MOTION_URL=http://localhost:5176 npx tsx tools/motion-v3.ts
npx tsx tools/phone-trace.ts
npx tsx tools/permission-gate.ts
```

Motion E2E uses real UI/network/simulation with synthetic sensors. Phone-trace is an explicit WebKit component fixture using the real input module and trace endpoint. Permission-gate tests real WebKit/iPhone lobby across a second page load with saved choices, strict click-origin native mocks and fresh readings. OS dialog/device feel/hardware listening require a real phone. HMR/cache bypass in tooling prevents shared DEV edits or its broad watch ignore from serving mixed revisions; only test tabs are affected.
