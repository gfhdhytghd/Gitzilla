# claude-player: client/render/player/
You own `client/render/player/`. Implement drawPlayer + playerPortrait (BRIEF interface). Visual maxxing.
- Procedural Soul Knight-style chibi heroes (~16x20 px body, big head, tiny body, 1px dark outline, 4-color palette from kit.palette). Class silhouette from weapon kind (knight w/ helmet for blade, ranger hood for smg/blaster, mage hat for staff, heavy armor for cannon, engineer goggles for laser, rogue bandana for shotgun). Seed varies hair/helmet crest/cape/accessory (headphones, hoodie, cat ears, antenna) — "dev" flavored: hoodie, laptop backpack, sticker-covered gear, a tiny language logo-ish glyph on chest.
- Hand-crafted pixel weapon sprites per kind, held + rotating toward facing; muzzle flash.
- Animations: idle bob/breath, run cycle (4 frames), dash afterimages, hurt flash + squash, downed (lying + ghost/ "404" halo + revive ring progress), revive pop, invuln blink, skill auras (firewall hex bubble, overclock flame trail, hotfix green + cross glyphs, rollback rewind ghost, fork decoy tint).
- isYou: small arrow/name tag in mono pixel font; others: name tag with repo slug short.
- Shadows under feet, dust on run. Cache composed frames per (seed, frame) in offscreen canvases.
- playerPortrait: big crisp portrait for lobby cards (animated-friendly: render at given size, integer scale).
- Make a dev gallery page `client/render/player/gallery.html` (+ts) that shows 24 random heroes across all weapons/skills/states so you and the coordinator can screenshot it. Use Playwright/chromium if available (check `npx playwright --version`; else use any headless chromium you find) to screenshot and LOOK at your output, iterate until it looks great.
