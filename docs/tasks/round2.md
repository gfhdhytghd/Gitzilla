# Round 2 — real code inside the monsters, Soul Knight depth, robustness

Contract additions (already in shared/types.ts): `RepoProfile.dna: CodeDNA`, `PlayerKit.code`, `BossKit.code`,
`PlayerState.perks`, `MatchState.obstacles / pickups / perkOffer`, GameEvents `pickup | obstacleBroken | perk`.
Rule unchanged: real code drives LOOK, NAMES and FLAVOR; stats stay equal-budget. Private repos (analyzed with a user
token): DNA may be shown to the room, but never sent to Gemini, Hall, logs, or anything persisted publicly.

## codex-repo — analysis/: extract CodeDNA
Fill every CodeDNA field from the downloaded source, per language, regex-level (fast, best effort):
identifiers ranked by reference count (definitions × uses); componentSymbols (top exported/defined per component);
heartLines (most characteristic non-blank, non-import lines of the heart file, trimmed ≤40); snippets (function
signatures, the longest/gnarliest line, a line with deepest nesting — ≤48 chars, no secrets: drop lines matching
key/token/password/secret patterns or long base64/hex); todos (real TODO/FIXME/HACK/XXX comment text); commits (1 REST call
`/repos/{slug}/commits?per_page=10`, best effort); tokens (keyword/operator frequency for the language); bigFiles;
longestFunction; counts; maxNesting; avgLineLength; indent. Regenerate data/fallback (keep sizes small). Tests.

## codex-sim — sim/: kits from DNA + Soul Knight depth
Kits: fill PlayerKit.code (tokens, signature = top identifier formatted per language e.g. `parse_args()`, snippet) and
BossKit.code (heartLines, snippets, todos, commits, tokens, limbSymbols from componentSymbols). Attack names default
to real identifiers of their source component (e.g. "`render()` Barrage", "`TODO: fix` Swarm") when no Gemini name.
DNA may shape attack STYLE within the equal threat budget (e.g. maxNesting → spiral arms; todo count → minion-heavy
deck; longestFunction → long laser; indent tabs vs spaces → bullet spacing), never total difficulty.
Game depth (Soul Knight boss room):
- Obstacles: 3–6 destructible cover blocks per arena from the boss repo's bigFiles (label = file basename, hp ∝ loc,
  normalized), placed symmetric-ish, not in spawn or boss body; block player AND boss bullets; break → pickups + event.
- Pickups: broken limb drops 1 heart + energy; minions/blocks drop energy (sometimes armor); walk over to collect; magnet
  radius 14px; despawn 15s.
- Code review: on entering phase 2, freeze boss attacks 5s (clear bullets), spawn 3 PerkPads (left/center/right) with
  perks e.g. `--force` (+25% dmg), `--no-verify` (dash cd -40%), `pair-programming` (revive 2x faster, revive aura),
  `lint --fix` (armor regen faster), `cache hit` (energy cost -30%), `hotfix++` (skill cd -30%), randomly 3 of ~8 seeded.
  Player picks by standing on a pad 1s (or nearest pad at timeout). Record in PlayerState.perks + event. Rebalance the bot
  sweep (bots pick randomly) — keep the 55–70% / 150–210s targets for 4/6/8.
Tests for all of it.

## codex-gemini — design/: feed DNA to Gemini
Add DNA (identifiers, componentSymbols, todos, commits, heartLines — never for private/credentialed analyses) to the
prompts so names/taunts quote the real code ("Your `useEffect` has no deps array." / "TODO: remove this hack"). Fallback
designs (no Gemini) must also use DNA deterministically: limbNames from limbSymbols, taunts from real todos/commits,
emblem from tokens. Regenerate data/design.

## claude-boss — boss + arena renderers: paint real code
Heart core scrolls the real heartLines; body/limb lobes carry carved snippets & limbSymbols (tiny pixel font, low
contrast, readable on the big screen); minions = bugs labeled with real todos (`TODO`, `FIXME`, `HACK` variants look
different); boss bullets use kit.code.tokens glyphs. Draw obstacles (file blocks: a mini editor window/file icon with the
basename, cracks as hp drops, shatter into glyph debris), pickups (heart/energy/armor, bob + glow + magnet streak), perk
pads (glowing PR cards on the floor with name, ring fills as a player stands on it; "CODE REVIEW" overlay during the
freeze). Export drawObstacles(ctx, obstacles, t), drawPickups(ctx, pickups, t), drawPerkPads(ctx, offer, players, t).

## claude-player — heroes from real code
Use PlayerKit.code: hero projectiles glyphs come from tokens (coordinate with claude-boss's drawBullets — pass via bullet
owner→kit lookup or ask claude-boss to expose a registerPlayerGlyphs(playerId, tokens) hook), chest emblem / weapon skin
etched with a token, signature move name shown as a floating callout when the skill fires. Perk badges as tiny icons
orbiting/under the hero (PlayerState.perks).

## claude-ui — show the code
Lobby hero card: real snippet line in a mini code block + signature move; boss panel: scrolling heart lines, real TODOs
listed as "known bugs", commit subjects as "recent sins"; analyzing state shows the actual file paths (bigFiles/tree)
streaming like `git clone` output. Game: compose new draws (obstacles/pickups/perk pads), CODE REVIEW banner with the 3
perk cards + who picked what, pickup toasts; autopsy: show the real code lines of each destroyed limb as a red diff.

## codex-qa (new) — robustness
Break it on the DEV server (http://localhost:5175 — never 5173): reconnects mid-lobby/mid-match/autopsy, tab sleep,
owner leaving, 8 humans + bots, double-clicks/spam (start/setRepo/setBoss), invalid/huge/private/nonexistent repos,
GitHub rate-limit/offline, slow network (Playwright throttling), phone landscape/portrait flips, ws message fuzzing,
long-running server (memory/timers leak after 20 matches). Write failing repro tests/scripts under qa/, triage each
finding to its owner in docs/progress/codex-qa.md (owner, repro, suspected cause). You may fix bugs directly ONLY in
qa/ and tools/; for others, the coordinator routes your findings.
