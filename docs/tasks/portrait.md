# Phone = PORTRAIT ONLY (user request, HIGH PRIORITY) — optimize everything for a phone held upright
Scope: phones (coarse pointer and the short side < 600 CSS px). Desktop, tablets and the big screen (?screen=1) keep the
landscape full-arena layout. Target devices: 390x844, 360x800, 430x932 (CSS px), DPR 2–3, safe-area insets.

## Layout (game screen, top → bottom)
1. **Boss bar** (~40px, under the safe-area inset): name, HP bar with limb segments, phase, timer. Compact.
2. **Game viewport** (full width, ~58% of height): a CAMERA view of the arena, not the whole arena.
   - Fit the arena's full HEIGHT (288 logical px) into the viewport with the largest integer scale in DEVICE pixels
     (devicePixelRatio aware), which shows roughly 200–260 logical px of width. The camera follows the player
     horizontally (smoothed, slight lead in the move direction, clamped to the arena edges). If the viewport is tall
     enough, a vertical follow is fine too. Shake/hit-stop still apply.
   - Edge indicators for anything important that is off-screen: the boss (arrow + heart icon), downed teammates
     (arrow + revive %), a telegraph aimed at YOU (red pulsing arrow + attack name).
   - Minimap (top-right corner of the viewport, ~110x66 CSS px, semi-transparent): whole arena, with dots for you (bright),
     teammates, boss body/regions, active hazards, obstacles, pickups, perk pads.
3. **Control deck** (rest of the screen, above the safe-area inset): self HP/armor/energy bars + perk badges, a sensor
   status pill ("tilt: on / waiting / off" + recalibrate), and two BIG thumb buttons DASH and SKILL (cooldown fill).
   The whole deck except the buttons, plus the viewport, counts as the **tap-to-attack** area. Combo counter, toasts and
   the event log move into the deck or become small overlays; nothing covers the hero.
- During CODE REVIEW the 3 perk cards show in the deck (big, tappable as a hint) while the pads are on the arena floor.
- **Rotate guard:** a phone in landscape gets a full-screen pixel-art "rotate to portrait ↻" overlay (the game keeps
  running underneath); try `screen.orientation.lock('portrait')` when entering fullscreen, and ignore failures.
- Landing, lobby and autopsy: single-column portrait layouts on phones (big tap targets, the boss panel and squad stack
  vertically, the share card still renders at 1200x630).

## Owners
- **claude-ui:** everything above in client/app + style.css: camera transform, viewport sizing, indicators, minimap,
  deck, rotate guard, portrait lobby/landing/autopsy. Verify with Playwright at 390x844 and 360x800 (isMobile, hasTouch,
  DPR 3) and look at the screenshots.
- **claude-boss:** renderers must work under a camera: world-space draws stay as they are (the caller applies
  translate/scale), but drawPostFx and any screen-space parts of drawEvents (full-screen glitch, vignette, BSOD) need the
  real viewport size. Add an optional `view: { x, y, w, h }` (logical px of the visible window) param to drawPostFx and
  drawEvents, and keep the landscape defaults when it's omitted. Make floating texts stay readable at portrait zoom.
- **codex-input:** in motion v2, PORTRAIT is the primary pose: the phone is held upright, tilted back ~30–50°; calibrate
  to that. Left/right roll → x, forward/back pitch → y, using screen.orientation angle 0. Keep the landscape math for
  tablets. Playtest harness: switch its phone context to portrait 390x844 (isMobile, hasTouch, DPR 3).
- **codex-qa:** add portrait-phone robustness passes (rotation flips, background/foreground, notch safe areas, tiny
  360x640 phones).
