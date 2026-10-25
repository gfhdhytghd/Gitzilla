# One player, two devices: the display (computer / Vision Pro) plus a phone controller

User request: a phone and a VR headset or computer act as one account. The display shows a QR code. The phone scans it and becomes the controller, while the display shows the game. Also: "or just use the GitHub account?"

Decision: support both. Neither path needs typing on the Vision Pro.
1. **GitHub auto-link (zero steps).** If the same GitHub (Auth0) user is signed in on both devices in the same room, the phone automatically attaches as the controller for that user's seat.
2. **QR / short code (works for everyone, including anonymous raid and classroom players).** The display shows a QR code for `https://gitzilla.wilflin.me/pair#<secret>` plus a 6-character code. Scanning or typing the code on the phone attaches it.
   - A Vision Pro wearer can't scan their own headset view with the phone camera. So the headset shows the short code, and the phone types it at `/pair`. GitHub auto-link is the smoother path there.

## Contract (shared/types.ts, committed by the coordinator)
- `Role` gains `"controller"`.
- `hello` gains `pair?: string` (the QR secret or a typed short code). `room` may be `""` when pairing by code.
- `ClientMsg pairStart` / `pairEnd`.
- `ServerMsg pairing {code, secret, expiresAt}`.
- `welcome.controller?: boolean`.
- `LobbyPlayer.paired?: boolean`.

## Server (codex-net)
- **pairStart.** Allowed for a player-seat member, or for a screen that owns a seat in the room. Mint a single-use pairing:
  - `secret`: 128-bit base64url.
  - `code`: 6 characters from the alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.
  - Lifetime: 5 minutes. A new pairStart replaces any older pairing for that seat.
- **hello role=controller.**
  - With `pair` (secret or code, case-insensitive): resolve it globally and bind this socket as the seat's controller.
  - Without `pair`, but with an Auth0 session: bind to the seat in `room` owned by the same GitHub identity. If there is none, return the error "Open the room on your big screen first, or scan its pairing code."
  - Refuse kicked or banned identities and seats.
  - One controller per seat; a newer one replaces the older (send it `kicked`-style close? No, use `error` with "Another phone took over the controls"), then close.
  - The controller gets `welcome {you: seatId, token: controllerToken, controller: true}`. Its resume token resumes only the controller binding.
- **Messages.**
  - Accept only `input`, `controls`, `leave` and `pairEnd` from a controller. Everything else returns "This phone is a controller".
  - Inputs apply to the seat. The display may also send input (keyboard); the latest frame wins per tick.
  - `controls` from the controller defines the seat's `controlsReady`.
- **Broadcast `LobbyPlayer.paired`.** On controller disconnect, set paired=false and controlsReady=false (unless the display itself reports keyboard controls). The display shows the QR again.
- **Abuse limits.** Rate-limit code guesses to 10 per minute per IP and per socket. Codes are single-use. Never log secrets or codes.
- **Tests.** Cover pair by secret, pair by code, expiry, reuse refused, GitHub auto-link, a wrong user refused, a controller restricted to input, replacement, disconnect, restart (pairings are ephemeral; bound controllers resume via the token) and kick of a paired seat (both sockets get `kicked`).

## UI (claude-auth: new `client/app/pair.ts` + css, plus minimal mounts)
- **Display side.** A "📱 Use your phone as the controller" panel, shown in the lobby you-card and in the game/XR pre-entry overlay when the seat isn't `paired`:
  - The QR code, the big short code, a countdown and "new code".
  - The line "Signed in with GitHub on your phone? Just open this room there."
  - Once paired: "📱 Phone connected ✓" with a small "disconnect".
  - claude-ui owns game.ts/XR: export a `pairPanel(app)` component and tell me where it should mount, rather than editing game.ts while claude-ui is in it. You may add the lobby mount yourself, keeping it minimal.
- **Phone side.**
  - `/pair` (a code entry with big input, auto-uppercase and paste support) and `/pair#secret` (auto-connect).
  - After the welcome, show a **controller screen** with no arena canvas:
    - The hero name and portrait, HP/energy, and big DASH and SKILL buttons with cooldown fill.
    - Motion permission and calibration, reusing client/input and the existing controls flow.
    - A touch fallback joystick, haptics on hits, and "Look at your big screen 👀".
    - A disconnect option.
  - Reuse the existing phone deck pieces where possible.
- Localize en/zh/es/fr.
- **Verify in WebKit:** desktop display + iPhone 15 controller by secret and by code, GitHub auto-link with mock auth if available, a raid played from the phone while the display moves, disconnect/reconnect, and an expired code.
