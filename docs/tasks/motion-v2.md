# Phone motion v2 (user request, HIGH PRIORITY): it must actually work on a real phone
Scheme the user wants:
- **Tilt = move** in the direction the phone is tilted (relative to the screen as the player holds it: landscape either
  way and portrait). Auto-calibrate neutral from the first ~300ms of samples after the game starts (the existing
  "tap to calibrate" step can stay as a recalibrate). Deadzone ~4°, full speed at ~20°, smoothed. Freeze move updates
  for ~250ms after a swing peak so swinging to attack doesn't jerk the hero.
- **Tap the screen = attack**: every tap fires a burst (~400ms); holding a finger = continuous fire. Taps on the
  DASH/SKILL buttons don't fire.
- **Swing/flick the phone in ANY direction = attack**: use |acceleration| (gravity removed; fall back to a high-pass of
  accelerationIncludingGravity) peak above a threshold (~11–13 m/s², tune) → fire burst ~600ms; refractory ~200ms.
  Direction doesn't matter.
- **Dash and skill become on-screen buttons** in motion mode (right edge, big thumb targets, `.kj-touch-dash`,
  `.kj-touch-skill`); remove the swing→dash and shake→skill gestures (they collide with swing-to-attack).
- Always auto-aim in motion mode.
Robustness (likely why it fails today — find the real cause and fix it):
- iOS: DeviceMotionEvent.requestPermission AND DeviceOrientationEvent.requestPermission must be called synchronously
  inside the tap handler (no await before them). Android Chrome: no permission, but events only arrive in a secure
  context (we have https via the tunnel). Some browsers deliver null beta/gamma or only 'deviceorientationabsolute'.
- Make detection robust: treat a device as motion-capable if events actually arrive (listen first, decide after
  ~1.5s), not just from feature detection. If none arrive, fall back to the touch joystick — but tap-to-attack still
  works there too. Expose a live status ("sensors: on / waiting / off") the UI can show.
- Check client/app/game.ts + renderers.ts integration: the input module is late-loaded via import.meta.glob with a
  placeholder fallback — make sure phones never end up on the placeholder (log loudly if they do).
- `?debug=input` shows the debug panel (beta/gamma, move vector, |accel|, last gesture) on top of the game.
Verification (no real phone available to agents): Playwright with a mobile device profile (hasTouch, isMobile,
landscape) against the DEV server http://localhost:5175 — dispatch synthetic DeviceOrientationEvent /
DeviceMotionEvent sequences and taps, and assert via snapshots that the player moves in the tilted direction and that
fire=true goes to the server on tap and on swing (any axis). Unit-test the recognizer for all 6 axis directions.
Owner: codex-input (client/input/ + tools/). You may make the minimal necessary edits in client/app/game.ts and
client/app/renderers.ts for the integration fix (claude-ui owns them and is notified; keep edits small and list them in
your progress file). DONE when the Playwright motion test passes.
