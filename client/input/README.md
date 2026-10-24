# Motion v2 input

```ts
import { createInput } from '../input';
const input = createInput({ canvas, toArena, getSelf });
// No mandatory calibration tap: the first 300ms of valid tilt samples establish neutral.
// On a user gesture, before any fullscreen request consumes user activation:
if (input.needsPermission) void input.requestPermission();
// Each network tick (30Hz):
send({ t: 'input', frame: input.sample() });
// Read live getters: input.mode, input.needsPermission, input.sensorStatus.
// Optional reset of the 300ms neutral average:
input.calibrate();
// On match exit:
input.dispose();
```

Phones are **portrait first**, held upright and tilted back about 30–50°. Neutral is measured from the player's comfortable pose. Relative left/right roll moves x, forward/back pitch moves y. There is a 4° deadzone, full speed at 20°, and smoothing. Screen-relative landscape math remains for tablets. Rotation resets the neutral average. Browser sensor coordinates stay in the device's natural orientation, so the module applies the screen rotation ([W3C orientation model](https://www.w3.org/TR/orientation-event/#device-orientation-model)).

## Inclusive profiles (battle and classroom PvP)

`MotionProfile` is stored locally under `kaiju.motionProfile`; it is never sent to the server or used to change code-quality stats. Choose in onboarding before constructing input:

```ts
import { loadMotionProfile, saveMotionProfile, MOTION_PROFILES, MOTION_PROFILE_LABELS } from '../input';
const saved = loadMotionProfile(); // standard if no preference exists
// Ask: Standard · Seated / low-motion · Tap only
saveMotionProfile(choice);
const input = createInput({ canvas, toArena, getSelf, motionProfile: choice });
input.setMotionProfile(choice); // settings gear: live switch, save, reset neutral
console.log(input.motionProfile);
```

| Profile | Full speed / deadzone | Swing threshold | Filtering |
| --- | --- | --- | --- |
| standard | 20° / 4° | 12m/s² | 65ms smoothing, 200ms refractory |
| seated | 8° / 5° | 6m/s² | 150ms smoothing, 350ms refractory; larger tremor deadzone |
| tap-only | joystick | disabled | no sensor permission or event processing |

Tap-only stays on touch controls even when sensor events arrive. Pending native permission results cannot override a profile switch. Settings/profile UI taps do not auto-request sensors; `[data-testid="motion-enable"]` and taps in the attack area still request both native permissions before fullscreen. Attacks and DASH/SKILL work in both game modes. Onboarding/settings UI belongs to claude-ui; `renderers.ts` aliases the real `InputController`/`InputOptions` types to expose this API.

A tap anywhere except UI buttons/inputs fires a **400ms burst**; holding a finger fires continuously. This includes the fallback joystick region, so one finger can move and attack. Swings in **any of the six axis directions or diagonally** attack for 600ms once gravity-free acceleration magnitude reaches 12m/s² (200ms refractory, peak hysteresis). A swing freezes movement updates for 250ms so attack motion doesn't jerk the hero. Swing and shake never dash or use skills. Big on-screen DASH/SKILL buttons produce one edge per press and don't attack. Motion and touch always auto-aim (`aim: null`).

Mobile detection starts listening even when sensor constructors are absent. iOS motion **and** orientation permission APIs, when present, are both invoked synchronously within the first touch gesture. Request them **before fullscreen**: fullscreen consumes user activation. Denial/error, or 1.5 seconds without usable sensor events, selects the touch joystick. Listeners stay active and late events recover motion mode. `sensorStatus` is `waiting` / `on` / `off`. Both `deviceorientation` and `deviceorientationabsolute` work; null/nonfinite readings are ignored. If orientation is unavailable, low-pass gravity gives tilt; gravity-free motion uses `acceleration` or a high-pass of `accelerationIncludingGravity`.

Desktop controls are unchanged: WASD/arrows move; hold LMB/J to fire; Space/K/Shift dash; E/L/RMB skill. Mouse aim returns to auto-aim after two seconds idle. Blur/hidden-document clears held actions.

Controls mount in `document.body` and clean up on `dispose()`. The joystick is hidden in motion mode. App styles override zero-specificity defaults:

- `.kj-touch-overlay`, `.kj-touch-joystick-zone`, `.kj-touch-joystick`, `.kj-touch-knob`
- `.kj-touch-button`, `.kj-touch-dash`, `.kj-touch-skill`
- Action selectors: `[data-testid="input-dash"]`, `[data-testid="input-skill"]`

Open the room with **`?debug=input`** to automatically mount a live sensor panel (`[data-testid="input-debug"]`) showing beta/gamma, screen angle, move, acceleration magnitude and recent tap/swing/button gestures. `createInputDebugPanel()` can still be mounted manually; call its `.dispose()` to clear the timer. `vibrate(pattern)` remains a best-effort haptics helper.

`client/app/renderers.ts` now imports input eagerly; optional renderer loading cannot silently substitute the old placeholder. `game.ts` sets up input immediately, publishes `[data-testid="input-sensors"]`, offers a permission gesture and recalibrate, and registers fullscreen after the input handler. Portrait camera/deck layout and rotate-to-portrait guard are owned by claude-ui.

Verification:

```sh
npx vitest run client/input
npx tsx tools/motion-v2.ts
npx tsx tools/inclusive-motion.ts
```

The browser test uses the real DEV app at **http://localhost:5175**, portrait 390×844 CSS/DPR 3, actual taps and synthetic orientation/motion events. It verifies all movement directions from authoritative server snapshots, tap/hold and all-axis attacks from transmitted input plus acknowledged real shots, action-button isolation, late-sensor recovery, permissions and debug. Artifacts go to `docs/shots/<timestamp>-motion-v2/`. `MOTION_URL` or `PLAYTEST_URL` can override DEV; stable live targets are rejected. No servers are started/stopped. Real-phone feel, iOS native prompts and hardware/haptics acceptance remain unverified.

`inclusive-motion.ts` loads the actual input module from DEV in an isolated browser component fixture, checks seated sensitivity/tremor/flicks, tap-only permission isolation and attacks, persistence across reload and live switching, and saves screenshots/JSON under `docs/shots/<timestamp>-inclusive-motion/`. It does not claim product onboarding, game networking or physical-device acceptance.
