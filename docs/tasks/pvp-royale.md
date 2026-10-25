# PvP royale (user: "change how PvP works: up to eight players fight each other until only one is alive")
Contract (committed): PvpState.royale {alive, placements, zone, winner}, PlayerState.eliminated/killedBy. Mode stays "pvp".
- 2–8 players (bots allowed to fill), free-for-all, NO respawns: a knockout eliminates you (placement = players left + 1);
  the last hero alive wins. Spawns evenly around the arena edge, 2s spawn shield. Arena sized for the player count
  (pvpArenaSize) but must stay inside the renderer/camera bounds (the old duel bug: spawns outside the viewport).
- **GC sweep** (anti-stall): after ~45s a safe circle starts shrinking toward a random-but-fair center over ~60s; outside
  it you take escalating damage (dps). Telegraph the next circle. Max match ~2.5 min.
- Fairness: battle-mode equal stat budget (not code-quality stats — that's edu). Light comeback: eliminations drop a small
  heart + energy pickup.
- Eliminated players spectate: camera follows the killer / leader, can cycle with tap/arrow keys; their phone shows
  "segfault — you placed #5 · killed by @ana's `await fetch(add)`" plus who's left.
- Autopsy: placement ranking 1..N, KOs, damage, who eliminated whom (a little kill feed / git log of eliminations),
  winner card ("@ana survived the merge"). Hall of Monsters: royale wins board.
## Owners
- codex-sim: royale rules in sim/pvp.ts (generalize the duel; keep edu classroom-PvP behavior untouched), zone, placements,
  spectate-safe state, bots that fight each other sensibly; tests incl. 2/4/8 players and stall cases.
- codex-net: PvP rooms allow 2–8 (incl. bots), start rule, eliminated players stay connected as spectators, leave mid
  royale = eliminated, autopsy/Hall. Tests.
- claude-ui: lobby PvP tab copy + roster up to 8, in-game HUD (alive count "7/8 alive", kill feed, zone timer/arrow),
  spectator view on phone + desktop, placement autopsy. Verify WebKit iPhone + desktop.
- claude-boss: GC-sweep zone visuals (closing ring of `rm -rf` glyphs / garbage-collector sweep, dark outside), elimination
  FX (hero dissolves into a stack trace), readable at phone zoom.
