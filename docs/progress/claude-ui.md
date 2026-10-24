# claude-ui progress

## Status
IN PROGRESS

## Plan
- [ ] index.html, client/style.css (pixel fonts via Google Fonts: Press Start 2P, VT323, Silkscreen)
- [ ] client/app/main.ts router (/ landing, /r/<ROOM> room; ?screen=1 big screen; ?mock=1 offline mock)
- [ ] client/app/net.ts ws client (resume token in localStorage, reconnect)
- [ ] landing (glitch logo, create/join)
- [ ] lobby (cards, portraits spin-up, boss reveal, owner panel, big-screen QR)
- [ ] game (canvas integer scale, interpolation buffer, render composition, shake/hit-stop, HUD, motion overlay, haptics)
- [ ] autopsy (dissection diff, stats, MVP, PNG card, rematch)
- [ ] renderer/input loading via import.meta.glob with placeholders fallback (client/app/placeholders.ts)
- [ ] screenshots desktop 1280x720 + phone 844x390; e2e with real server

## Notes
- Renderers/input are loaded with `import.meta.glob` so the app works before other agents land their modules; swaps automatically.

## Contract requests
(none yet)
