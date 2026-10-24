# Motion v3 — pure motion on phones, NO on-screen buttons (user: "make the motion sensor stuff really work, I don't
# want any virtual button on phone to control stuff")
Phones in game: no joystick, no DASH/SKILL buttons, no control widgets at all. The whole screen is the game; the body
of the phone is the controller. (Touch fallback only if the device truly has no motion sensors — then a full-screen
gesture surface, still no drawn buttons.)

## Gesture vocabulary (UPDATED by the user: skill = long-press or spin the phone around)
| action | gesture | signal |
|---|---|---|
| move | tilt (roll → x, pitch → y) | DeviceOrientation vs calibrated neutral |
| attack | swing/flick the phone in any direction, OR a quick tap anywhere | linear accel peak (gravity removed); tap < 250ms |
| skill | LONG-PRESS anywhere (hold ≥ ~550ms, fires once with a charging ring under the finger), OR SPIN the phone around (integrated gyro rotation ≥ ~270° within ~1.2s, any axis) | touch duration; ∫|rotationRate| dt |
| dash | quick wrist TWIST (sharp rotation spike that snaps back, total angle < ~120°), OR double-tap anywhere | rotationRate peak with small net angle; two taps < 300ms |
Holding a finger no longer means continuous fire (it's the skill). Attacks are bursts (~600ms each) per tap/swing;
auto-aim stays on. A spin must never also count as twists/dashes (suppress dash while a spin is accumulating), and a
long-press must not also fire a tap attack. Shake is no longer a gesture (it would trigger swings anyway).
Movement freezes ~250ms during any gesture so it doesn't jerk the hero.

## "Really work": calibrate to the actual person and phone
- **Gesture training in the lobby** (after motion permission, ~20s, skippable, re-doable from settings): a big friendly
  pixel prompt per step with live feedback meters: 1) hold how you'll play → neutral pose; 2) tilt left/right/up/down →
  tilt range; 3) "swing to attack" ×3; 4) "twist to dash" ×3; 5) "spin the phone around for your skill" ×2 (and show "or long-press"). From the recorded peaks compute
  per-player thresholds (e.g. 60% of the user's median peak, clamped to sane ranges) and store them in localStorage.
  Each step shows ✓ when the recognizer fires on the user's own motion. This is also the tutorial.
- **Trace upload for tuning (dev aid):** with `?trace=1` or when training runs, POST the raw sensor stream
  (60Hz, ~20s, deviceorientation + devicemotion incl. rotationRate + recognized gestures + UA/platform) to
  `/api/trace` (server stores under .cache/traces/, gitignored, size-capped). Coordinator will tune defaults from real
  phone traces. No PII beyond UA.
- Recognizer must handle: iOS (rotationRate in deg/s, acceleration may be null → use accelerationIncludingGravity with a
  high-pass), Android Chrome (deg/s too; sampling 16–60ms), devices with no gyroscope (fallback: dash = double-tap),
  landscape/portrait orientation angle, the user walking around.
- In-game feedback: a tiny gesture toast ("⚡ dash", "✦ skill", "▸ attack") for 400ms so players learn what fired;
  a 1-line status pill only when sensors are lost (with "tap to re-enable").

## Owners
- **codex-input**: recognizer v3 (twist, shake-skill, swing/tap attack, double-tap/two-finger alternates), per-player
  thresholds API (`input.setProfile(thresholds)`, `input.calibration` recorder API that the training UI drives:
  `startStep(step)`, live `meter()` values, `result()`), trace capture + upload. Pure-function tests with synthetic
  traces for every gesture incl. iOS null-acceleration and no-gyro devices, and "no false dash while swinging"
  /"no false skill from one swing" checks. Playwright mobile e2e via synthetic events: no buttons in the DOM in motion
  mode; each gesture reaches the server.
- **codex-net**: POST /api/trace (≤ 2 MB, .cache/traces/<ts>-<rand>.json, keep last 200), GET /api/trace/list for the
  coordinator (localhost only).
- **claude-ui**: remove ALL control buttons/joystick from the phone game UI in motion mode (deck keeps only status:
  hp/armor/energy, skill-ready indicator that says "spin or hold ✦" and dash cooldown "twist ⚡"); build the gesture training
  screens (pixel art phone illustrations animating each gesture, live meters, ✓ checks) in the lobby flow; gesture
  toasts in game; settings entry "re-train gestures".
