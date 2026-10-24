# Motion v3 input

```ts
import { createInput } from '../input';
const input = createInput({ canvas, toArena, getSelf,
  onGesture: ({kind, via}) => showToast(`${kind} · ${via}`) });
// Same trusted tap, before await/fullscreen:
void audio.unlock();
void input.requestPermission();
// Every network tick:
send({ t: 'input', frame: input.sample() });
// Route exit:
input.dispose();
```

Portrait phones: comfortable upright pose tilted back 30–50°. Roll moves x; pitch moves y relative to measured neutral. Screen rotation supports tablet/landscape coordinates too. Default neutral averages the first 300ms; `calibrate()` redoes it. Default tilt deadzone4°, full speed20°, smoothing65ms. Motion/touch always auto-aim.

| Action | Gesture |
| --- | --- |
| Move | Tilt; invisible full-screen drag when sensors unavailable or tap-only selected |
| Attack | Any-axis swing/flick, or quick tap (<250ms): 600ms burst |
| Dash | Quick wrist twist + return/settle, net excursion <120°; or double-tap (<300ms) |
| Skill | Spin (integrated gyro ≥270° in1.2s), or long-press ≥550ms |

**No phone buttons or drawn joystick.** Holding does not fire. Single taps wait300ms to rule out double-tap; long-press emits one skill and no release attack. A non-interactive ring shows hold charge. Dragging >24px cancels tap/hold recognition. Native touch cancel, blur and hidden document clear pending actions. Touch gestures exclude settings/buttons/inputs/links and `[data-input-ignore]`.

Gyro is deg/s on both platforms; integration uses actual timestamps, tolerates16–60ms sampling, ignores low-rate drift/walking and resets across gaps>200ms. Dash waits for reversal + a return near the starting angle +100ms quiet, so a spin cannot dash at its start or finish. A ≥120° net excursion, a recognized spin or concurrent swing blocks the twist episode. No shake gesture. Movement freezes250ms per recognized action. Acceleration uses `acceleration` or high-pass-filtered `accelerationIncludingGravity` when null; gyro-only and orientation-only devices work. No gyro means use double-tap to dash and long-press to skill.

Both iOS permission requests run synchronously in the original gesture, before fullscreen consumes activation. Sensor presence is determined by events, not constructors. Denial/no valid events after1.5s → invisible touch fallback; lost event delivery after1.8s → fallback; late events recover motion. `sensorStatus` is waiting/on/off. Call `requestPermission()` from the sensor-lost pill to retry. Event listeners remain active. Never suspend a separate sensor controller from the UI while this one is running.

## Calibration UI contract

```ts
input.calibration.startStep('neutral'); // then tilt, swing, twist, spin
const m = input.calibration.meter(); // poll in UI animation loop
// m.step, elapsed, ready, count, goal; acceleration, gyro, spinDegrees, tilt,
// ranges [left,right,up,down], peak, gyroAvailable, lastGesture
if (m.ready) showCheckmark();
// When all desired steps complete (skip is allowed):
input.setProfile(input.calibration.result()); // sanitizes + saves local thresholds
input.calibration.stop(); // uploads the training trace
```

Neutral requires≥300ms/eight samples; tilt reaches four directions; swing/twist need3 recognized gestures (tap/double-tap accepted); spin needs2 (long-press accepted). Touch alternates preserve motion thresholds. Training temporarily relaxes thresholds to sensible floors so smaller movements can be recorded. Defaults survive skipped steps. Thresholds use60% of recorded median peaks, clamped; tilt uses the smallest trained directional range. `result()` is a pure snapshot. A new neutral step resets previous samples. Use this recorder for the UI checkmarks so the tutorial and game recognize the same signals.

`input.profile` is a defensive snapshot; `input.setProfile(partial)` persists under `kaiju.motionCalibration.v3`. **neutral is screen-relative `[roll,pitch]`, NOT raw `[beta,gamma]`.** The recorder transforms it already; manual raw sensor integrations must use `screenTilt(beta,gamma,screenAngle)` before saving neutral. `lastGesture` and optional `onGesture` contain `{kind:'attack'|'dash'|'skill',via,at}`; use them for400ms toasts. Calibration/trace types are exported from `client/input/index.ts`.

`MotionProfile` remains separate: `loadMotionProfile()/saveMotionProfile()`, standard/seated/tap-only. Seated has8° full speed,5° deadzone,150ms smoothing,6m/s² swing threshold and350ms refractory. Tap-only never requests or processes sensors; invisible drag + tap/double-tap/hold still work. A pending native permission result cannot override a profile switch. Preferences are local and unrelated to code-quality stats or game mode.

## Traces and debug

`?trace=1` or training records raw orientation, acceleration, accelerationIncludingGravity, rotationRate, screen angle, timing and gesture edges for20s, ≤60Hz per stream. It uploads JSON to `/api/trace`; no names, repos, player IDs or room codes. UA/platform only. Capture cap2600records and upload cap1.9MB. `input.trace.start()`, `.upload():Promise<boolean>`, `.status/.error` support explicit retries and missing-endpoint reporting; failed upload never breaks controls. Training stop/dispose flushes the partial trace. Server storage/listing belongs to codex-net.

`?debug=input` mounts beta/gamma, screen angle, acceleration, gyro/spin integral, move, gesture history and audio state/session/music/retry status. `createInputDebugPanel()` also supports manual mounting; `.dispose()` releases its timer. `vibrate(pattern)` is best-effort.

Desktop stays WASD/arrows, LMB/J fire, Space/K/Shift dash, E/L/RMB skill; mouse aim expires after2s. Input is eagerly loaded before optional art; native permission handler must precede fullscreen.

```sh
npx vitest run client/input client/audio tools/playtest.test.ts
npx tsx tools/motion-v3.ts
npx tsx tools/inclusive-motion.ts
npx tsx tools/phone-audio.ts
```

DEV only localhost:5175; PLAYTEST_URL/MOTION_URL override (live targets rejected). Browser motion proof uses real UI→WebSocket→server snapshots with synthetic sensors at390×844/DPR3; it checks directions, each gesture, no drawn controls and raw trace upload. The older motion-v2 command forwards to v3. HMR is held inert in that test tab; current input modules are requested with revision queries because DEV's broad `**/data/**` ignore matches this checkout's ancestor and can serve stale cached transforms. No server is started/stopped. Real iOS permission dialogs, device feel, speakers/haptics and OS interruption behavior require physical-phone acceptance.
