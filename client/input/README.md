# Repo Kaiju input

```ts
import { createInput, createInputDebugPanel, vibrate } from '../input';

const input = createInput({ canvas, toArena, getSelf });
// Keep one controller for a match; read these getters live because mode may change.
if (input.needsPermission) await input.requestPermission(); // in a tap handler
input.calibrate(); // neutral is the current pose, or the first orientation event
// Each network tick:
send({ t: 'input', frame: input.sample() });
// At match exit:
input.dispose();
```

The first touch also requests iOS permission automatically. The app may provide its own enable-motion button by calling `requestPermission()` directly from the tap. Motion and orientation requests start together in that handler. Phones need HTTPS (or localhost) for browser sensors. A permission denial, exception, or 1 second without a usable motion event mounts the touch overlay automatically. `mode` and `needsPermission` are live getters; motion and touch always return `aim: null` for auto-aim.

Desktop: WASD/arrows move; hold LMB/J to fire; Space/K/Shift dash; E/L/RMB skill. Aim uses the most recent mouse coordinates relative to self and returns to auto-aim after 2 seconds idle. Dash and skill are consumed by `sample()` exactly once per press. Blur/hidden-document clears held state.

Motion: hold the phone comfortably in landscape and calibrate. Tilt moves; thrust toward the screen fires for 600ms; swing sideways dashes; three alternating strong acceleration peaks inside 600ms trigger skill. The screen-relative horizontal axis follows both landscape directions. Holding a touch anywhere fires too. Rotation automatically resets neutral to the next orientation event. The pure recognizer and its thresholds live in `gestures.ts` for venue tuning.

Touch: drag on the left side to move; use right-side DASH / SKILL; hold elsewhere to fire. Multiple fingers are supported. The overlay mounts to `document.body` and is removed by `dispose()`. Override these classes in the app stylesheet (defaults use zero-specificity `:where`, so normal class rules win):

- `.kj-touch-overlay`
- `.kj-touch-joystick-zone`, `.kj-touch-joystick`, `.kj-touch-knob`
- `.kj-touch-button`, `.kj-touch-dash`, `.kj-touch-skill`

Optional helpers:

```ts
const debug = createInputDebugPanel(); // live mode, permissions, sensor values, gestures
document.body.append(debug);
// Later: debug.dispose(); // removes the panel and its update timer
vibrate([20, 30, 20]); // best effort; unsupported/blocked browsers simply return false
```

Verification: `npx vitest run client/input` uses pure synthetic traces and a small DOM/event fixture; no browser simulation dependency. Physical phone sensor feel, iOS prompts, and haptics still need device acceptance.
