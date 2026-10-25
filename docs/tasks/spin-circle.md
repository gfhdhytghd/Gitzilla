# Spin = move the phone in a circle (orbit), not rotating it

User definition: "Spin isn't really rotating the phone around an axis. It's like moving the phone in a circle around its long axis: it travels around a circle, but the phone itself doesn't rotate."

## New gesture semantics
- **Spin (skill).** The phone *translates* along a circular path, like stirring or drawing a circle in the air. Its orientation stays roughly constant.
  - Physics: gravity-removed linear acceleration (`DeviceMotionEvent.acceleration`, or `accelerationIncludingGravity` minus the low-pass gravity estimate) points at the circle's centre and **rotates continuously in one direction**.
  - Primary plane: perpendicular to the device's long (y) axis, i.e. the x–z plane. Also accept the plane that best fits the motion (PCA over a short window), so it works however the phone is held.
  - Detection:
    - The acceleration vector's angle in the fitted plane sweeps ≥ ~300° monotonically within ~1.5 s.
    - The magnitude stays above a floor, so there are no tiny jitters.
    - Gyro rotation stays small, e.g. total rotated < 60° over the window. That's what makes it "circle without rotating", and it keeps it distinct from wrist roll.
  - One skill per completed circle, with a cooldown of ~1.2 s.
- **Twist (dash).** Unchanged: a fast gyro flick out and back (gestures.ts).
- **Swing (attack).** A sharp acceleration peak. Circular motion produces sustained centripetal acceleration that must **not** count as a stream of swings.
  - Once a circle is in progress (≥ ~90° monotonic sweep), suppress swing fires until it ends or fails.
  - Then decide: either refund nothing, or fire one attack if the circle is aborted early. Keep it simple and explain the choice.
- **Remove the old "integrated rotation ≥ 270°" spin.** Rotating the phone like a steering wheel should no longer cast the skill.
- **Calibration/training.** The spin step now asks the player to "draw circles with your phone". Record the sweep and magnitude, and clamp the thresholds like the others.
- **Touch fallback unchanged:** long-press = skill, double-tap = dash.

## Owners
- **codex-input** (logic): `client/input/gestures.ts`, `thresholds.ts`, `calibration.ts`, `index.ts` wiring, README gesture table, and tests.
  - Synthetic traces: a circle in the x–z plane, a circle in a tilted plane, a steering-wheel rotation (must NOT spin), a fast wrist twist (dash only), a single flick (attack only), and walking jitter (nothing).
  - Update tools/motion-v3 if it relies on the old spin.
- **claude-ui** (look): training/onboarding copy and animation for the spin step. claude-ui owns `client/app/training.ts`.
- **claude-ux** (look): the /demo phone-motion scene must show all four gestures correctly:
  - tilt: the phone tips and the hero walks;
  - swing: a sharp flick and a shot;
  - twist: a quick wrist rotation out and back, and a dash;
  - spin: the phone moves around a circle while staying upright and not rotating, and a skill fires.
