# Genesis: watch code become a character (user: "more connection from code to character, show the middle process,
# visual maxxing the generation process")
Contract: shared/types.ts `GenesisProgress`, `TraceStep`, `Genesis`, `LobbyPlayer.progress/genesis`,
`LobbyState.boss.progress/genesis`.

## The cinematic (claude-genesis, new dir client/genesis/) — the money shot, visual maxxing
`playGenesis(host: HTMLElement, opts: { kind: "hero" | "boss"; genesis?: Genesis; progress?: GenesisProgress;
kit?: PlayerKit | BossKit; compact?: boolean; onDone?(): void }): { update(next): void; skip(): void; dispose(): void }`
Live mode (status analyzing: progress arrives, genesis later) and replay mode (genesis known; plays ~8s, skippable,
replayable by tapping a card). Stages, each visibly derived from REAL data, with terminal-style captions:
1. `$ git clone <slug>` — real file paths stream like terminal output; file tiles (colored by language) pour in.
2. `parse` — tiles snap into component clusters (real component names as labels); import arrows draw between them
   (real edges), counters tick: files, LOC, functions, TODOs.
3. `graph` — force-directed settle of the real component graph; the heart file node swells and pulses with its fan-in
   number; cycles light up red and the arrows loop around; depth chain highlighted.
4. `map` — the trace plays as connecting lines: each TraceStep draws a glowing wire from the graph feature (`from`) to
   the character part it becomes (`to`), with a caption ("language: Rust 78% → weapon: unsafe{} Cannon").
   For a boss: components morph into limbs (the actual cluster flies into the limb position), the heart node becomes the
   core, cycle edges knot into red weak points, contributors become eyes popping open, TODOs hatch into bug minions.
   For a hero: language → class silhouette + weapon, shape → skill, tokens → orbiting glyphs + crest, snippet → cape.
5. `assemble` — the sprite builds up layer by layer from falling code characters (real snippets) that settle into
   pixels; use the real renderers (drawBoss/bossPortrait, drawPlayer/playerPortrait) for the final frames.
6. `reveal` — name card typed out, the equal stat budget animates as points flowing into bars
   (genesis.budget), Gemini catchphrase/epithet if present.
Must look stunning on the big screen (?screen=1, full screen while the boss compiles), on phone portrait (compact card
version, ~45% height), and desktop. 60fps, canvas-based, cached; respect prefers-reduced-motion (shorter, no shake).
Provide a gallery/dev page client/genesis/demo.html that replays fallback repos offline (genesis can be built locally
from data/fallback + the sim kit functions for the demo). Screenshot + record a few frames with Playwright, look at them.
Integration hook for claude-ui: lobby hero card (live while analyzing, replay on tap), boss panel reveal, and the
pre-fight intro (boss genesis condensed to ~4s). Write the handoff in your progress file.

## Data (codex-genesis, new dir genesis/ — server-side, pure TS)
`buildGenesis(profile: RepoProfile, kit: PlayerKit | BossKit, kind): Genesis`: compact (≤ ~12 KB JSON), real data only;
`trace` explains EVERY kit choice in order (read sim/kits.ts to mirror the actual rules: language→weapon/class/palette,
shape metrics→skill, budget split, component→limb, heart→core, cycles→weak points, contributors→eyes, todos→minions,
attack sources/kinds and why, theme from language/age, glyph tokens, name). If a rule is unclear, ask codex-sim via
your progress file, or export small explain helpers from genesis/ that read kit+profile. `budget` = the equal stat
budget breakdown. Private repos (credentialed): still allowed for the room, but no tokens/secrets ever.
Handoff to codex-net: exact wiring.

## Progress events (codex-repo + codex-net)
- codex-repo: `analyzeRepo(slug, { token?, onProgress?(p: GenesisProgress) })` emitting clone (real paths as the tar
  streams, throttled), parse, graph, dna stages with pct; cached/fallback results emit a quick synthetic sequence with
  real paths from the profile so the cinematic still has data.
- codex-net: broadcast progress to the room throttled (~8 Hz per repo), attach `genesis` (from buildGenesis) to the
  lobby player / boss when ready; stages `design` while Gemini runs.
