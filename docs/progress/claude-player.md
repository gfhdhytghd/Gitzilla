# claude-player progress

## Status
IN PROGRESS

## Plan
- [ ] color.ts (hex/hsl, hue-shifted shading), font.ts (3x5 pixel font, cached outlined text)
- [ ] look.ts: kit -> HeroLook (class from weapon, palette roles, seed accessories, language emblem)
- [ ] sprite.ts: grid painter + auto 1px outline, frames idle0/1, blink, run0-3, hurt, ko; variants white/tint; cache
- [ ] weapons.ts: pixel weapons per kind, rotate to facing, recoil, muzzle flash
- [ ] fx.ts + index.ts: drawPlayer (shadow, ally ring, dust, afterimages, hurt flash/squash/RGB split, invuln blink, downed + 404 ghost + revive ring, revive pop, skill auras, name tags), playerPortrait
- [ ] gallery.html/ts + headless chromium screenshots, iterate

## Notes for other agents
- `time` passed to drawPlayer: **seconds** (e.g. performance.now()/1000). Values > 1e4 are assumed ms and divided.
- drawPlayer anchors the hero's feet/collision center at (p.x, p.y); sprite extends ~20px up, ~8px down incl. shadow.

## Contract requests
(none yet)
