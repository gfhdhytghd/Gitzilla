# Headset mode: detect Vision Pro, require a phone controller, go 3D automatically

User request: "Vision Pro Safari has a special UA that can be used to identify it? When a Vision Pro is detected, force connecting the controller (no built-in motion required), then switch to 3D mode automatically."

## Detection (take-ui, logic)
Vision Pro Safari does **not** have its own UA. By default it requests desktop sites and sends a macOS Safari UA (`Macintosh; Intel Mac OS X 10_15_7 … Safari`). So use feature detection:
- `isVisionPro = /Macintosh/.test(UA) && navigator.maxTouchPoints > 0 && await navigator.xr?.isSessionSupported('immersive-vr')`.
  - macOS Safari has no WebXR.
  - iPad Safari also reports Macintosh + touch but doesn't support immersive-vr.
- Also treat other standalone headsets as headsets: `OculusBrowser` / `Quest` / `Pico` UA + immersive-vr.
- Never classify desktop Chrome as a headset just because a WebXR runtime exists. Require one of the patterns above.
- Override with `?device=headset|phone|desktop` for testing, and expose `globalThis.__kaijuDevice` for playtests.
- Code: new `client/app/device.ts` exporting `detectDevice(): Promise<'headset'|'phone'|'desktop'>` and a cached sync getter after the first resolve. Add unit tests with a UA/feature matrix.

## Behaviour on a headset (take-ui wiring, claude-auth visuals)
- **Never** show or require the built-in motion permission flow. The headset never reports itself as motion- or keyboard-ready.
  - Its seat becomes ready only when a phone controller is linked (`LobbyPlayer.paired` and the controller's `controls`).
  - The existing start-block then naturally shows "waiting for controls: <name>".
- The **phone-controller step becomes required and prominent.** The lobby you-card shows a big step card:
  - ① Sign in with GitHub here (if not already).
  - ② On your phone, open gitzilla.wilflin.me/r/CODE signed in as @login.
  - ③ Tap "Use this phone as the controller".
  - Live status: "Waiting for your phone…" → "📱 Phone connected ✓".
  - This is claude-auth's `pairPanel` in a new `required` variant.
- **3D on by default** (view25d) for headsets, unless `?view=2d`. In the game, show an "Enter Vision Pro" button prominently (immersive sessions need a user gesture, so we can't auto-enter). Once paired and the match starts, the spectator/XR panel offers follow = your own hero.
- Classroom (edu) on a headset: spectator only (projector-like). No controller requirement there.
- No server or shared changes expected. If you find you need one, ask the coordinator.

## Verify
- Unit tests for the detection matrix.
- WebKit/Chromium with `?device=headset` and a fake `navigator.xr`:
  - The lobby shows the required step card, and no motion prompt appears.
  - Start stays blocked until a phone links; after linking (simulated phone via controller-link) it becomes ready.
  - 3D is on automatically.
  - Desktop and phone behaviour are unchanged.
