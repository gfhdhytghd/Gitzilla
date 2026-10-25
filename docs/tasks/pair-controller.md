# One player on two devices, linked by GitHub account: a display (computer / Vision Pro) and a phone controller

User decision: "use the GitHub account for forced identity creation; forget the QR things." No pairing QR codes or typed codes.
The **GitHub (Auth0) account is the identity**. Sign in on both devices, open the same room, and the phone becomes the controller of
your seat while the computer or Vision Pro shows the game.

## Contract (shared/types.ts, committed by coordinator)
- `Role` adds `"controller"`.
- `ClientMsg pairEnd` is new.
- `welcome.controller?: boolean` is new.
- `LobbyPlayer.paired?: boolean` is new.
- No pairing secrets or codes.

## Server (codex-net)
- The display device joins as normally: player seat, or screen + seat.
- To link a phone, the display seat must be signed in with GitHub. That GitHub user id is stored on the seat (server-side only).
- `hello role="controller"` with an Auth0 session binds the socket to the seat in `room` owned by the same GitHub user id.
  - Not signed in → error "Sign in with GitHub on both devices to use your phone as the controller."
  - No such seat → error "Open this room on your big screen or Vision Pro first, signed in as the same GitHub account."
- Refuse banned or kicked identities.
- One controller per seat. A newer phone replaces the older one; the older one gets error "Another phone took over the controls" and is closed.
- The controller receives `welcome { you: seatId, token: controllerToken, controller: true }`. Its token resumes only the controller binding.
- From a controller, accept only `input`, `controls`, `leave` (= unlink) and `pairEnd`. Anything else → "This phone is a controller".
- Inputs apply to the seat; the latest frame wins per tick, and display keyboard input also counts.
- `controls` from the controller sets the seat's `controlsReady`.
- Broadcast `LobbyPlayer.paired`. When the phone disconnects: paired=false, and controlsReady=false unless the display reported keyboard controls.
- Kicking a linked seat sends `kicked` to both sockets.
- Tests:
  - auto-link
  - not signed in
  - wrong user
  - no seat
  - controller restricted to input
  - replacement
  - disconnect / resume
  - kick of both sockets
  - restart (bindings resume via the token)

## UI (claude-auth: new `client/app/pair.ts` + css, minimal mounts)
- **Display side**, shown in the lobby you-card and the game/XR pre-entry overlay while the seat isn't `paired`: a "📱 Use your phone as the controller" panel.
  - Signed in: "Open gitzilla.wilflin.me/r/ROOM on your phone, signed in as @login." Add a big room code and a copy-link button. No QR.
  - Not signed in: a "Connect GitHub" button. It reuses the existing github.ts sign-in.
  - Once paired: "📱 Phone connected ✓" plus "disconnect".
  - Export `pairPanel(app)` for game.ts/XR (claude-ui mounts it). You may add the lobby mount yourself.
- **Phone side.** Opening the room while signed in as a user who already has a seat on another device offers "Use this phone as the controller for your seat on the big screen". It is one tap, then hello role=controller.
  - **Controller screen** (no arena canvas):
    - hero name + portrait, HP/energy
    - big DASH/SKILL with cooldown fill
    - motion permission/calibration (reuse client/input + the controls flow), touch joystick fallback
    - haptics on hits
    - "Look at your big screen 👀" and "disconnect"
  - Reuse the existing phone deck pieces.
- Localize en/zh/es/fr. Verify in WebKit with a desktop display and an iPhone 15 controller, using the mock/fixture Auth0 identity the server tests use.
