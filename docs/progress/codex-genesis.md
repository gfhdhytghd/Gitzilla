DONE (pvp power trace) — codex-genesis

## PvP power trace (current)
- Data-only implementation in `genesis/index.ts`, `genesis/README.md`, and new `genesis/pvp-power.test.ts`; no client UI, shared, sim, or server edits and no commits.
- Powered heroes lead with real repo signals → authoritative supplied score → actual bonuses/final stats. Example: `412 stars · 38% tests → POWER 78`, then `POWER 78 → +2 HP · +58.5% damage`. Armor/speed/energy and all nine supplied part labels, strengths, and influences follow; captions stay ≤40 characters per side with human numbers and credential filtering.
- Uses sim's exported `PvpPower` metadata and `statsFromPower(0)` neutral baseline; never recomputes the score or treats power as bonuses added to battle allocation. Missing-analysis fallback stays explicitly neutral. Empty equal-budget payload for power heroes; existing battle/edu/boss behavior is preserved when power is absent.
- **Handoff to codex-net / claude-genesis / claude-ui:** existing `buildGenesis(profile, poweredKit, 'hero')` automatically emits the trace. Stable refs: `pvp-power`, `pvp-power:boost`, `pvp-power:stats`, `pvp-power:loadout`, and `pvp-power:part:<index>` (full labels remain in `kit.pvpPower.parts`). No new trace/network fields needed. Read-only UI finding: kit-only `client/genesis/local.ts:genesisFromKit` still claims `same 5-pt budget` when quality is absent; UI owner should handle powered kits there. Profile-based local replay already delegates to this builder.
- `npx vitest run genesis`: **80 PASS**, five files, including all 15 actual fallback profiles built with `playerKitFromProfile(profile, {mode:'pvp'})`; tests cover supplied score/parts, neutral-vs-battle baseline, close damage multipliers, zero power, privacy, payload limit, nonmutation, and unchanged other modes.
- Scoped Genesis TypeScript, root `npm run typecheck`, and production build to `/tmp/gitzilla-pvp-power-genesis-build`: **PASS**. Build retains existing fallback/node externalization/chunk-size warnings; no browser/hardware acceptance claimed for this data-only card.
- Full `npm test`: **937 PASS, 1 FAIL, 9 SKIP** (82 files passed / one failed / four skipped). Earlier obsolete PvP battle-equality assertions are resolved. The remaining external failure is `sim/depth.test.ts:44`: whole-kit equality now differs on new `powerSource.todoMeasured` (`true` with DNA vs `false` without DNA). Genesis's 80 tests pass in this full run. Notified codex-sim/coordinator; no cross-owner test edits or claim of a green root suite. Full output: `/tmp/gitzilla-genesis-pvp-power-root-tests.log`.
- `git diff --check -- genesis docs/progress/codex-genesis.md`: **PASS**.

## Takeover integration (latest)
- Server attack explanations now use the real source + archetype preset/kind after the deck remap; fixed four-deck/source-slot/ID assertions cover all eight attack kinds without claiming fan-out/file-count causality.
- Also completed the authorized `client/genesis/` takeover. Full local repair, final screenshot and frame-bound evidence: `docs/progress/codex-takeover-genesis.md` (**DONE**). Final focused client/server Genesis tests 59 PASS, workspace typecheck/build PASS. No commits or renderer edits by this agent.

Implemented the server-side pure TypeScript code → character story builder in `genesis/`.
No commits, new dependencies, shared-contract edits, or other owners' implementation edits.

## Boss archetype trace (latest)
- Read `docs/tasks/boss-archetypes.md`, required `BossKit.archetype`, `BossState.pose` / `airborne`, and the reference brief. Genesis constructs no BossKit/BossState literals and reads no live boss pose; no local required-field fixes were needed.
- Added exported pure `bossArchetypeTrace(profile, kit)`. It consumes `sim/archetypes.ts` / `bossArchetypeFromProfile`'s exact winning reason. No copied thresholds or competing selector. Shortens wording, retains real human numbers, and stays ≤40 chars per side.
- The authoritative final `kit.archetype` controls the destination: `Kaiju · crystal-backed titan`, `Hydra · many-headed terror`, `Mecha · armored machine`, `Abyssal · crystalline serpent`. An explicitly overridden kit uses truthful repo context instead of claiming a different helper result selected it. No invented head count, pose, airborne window or animation behavior.
- Boss opening is now largest limb → heart → **why this archetype** → cycle weak point (or eyes) → attack. The archetype step is third, `part: 'class'`, `ref: 'archetype'`, so phones showing only ~8 steps include it. All other limb/attack traces remain; final name stays last. Edu hero report cards are unchanged.
- **Handoff to codex-net / claude-genesis / claude-ui:** no API/wiring change. Existing `buildGenesis(profile, finalBossKit, 'boss')` emits the new step automatically. Consumers may identify it by `ref === 'archetype'`; `bossArchetypeTrace` is available separately if needed. Keep `kit.archetype` through design decoration and squad rescaling. Rendering live poses and preset behaviors stays sim/renderer-owned.
- Initial request for sim's exact reason is **resolved**: the sim helper landed during this task and is now directly imported. Initial external missing-`archetype` kit error is also resolved by that owner; no sim edits from Genesis.
- All 15 fallback bosses audited: **Kaiju 4, Hydra 3, Mecha 3, Abyssal 5**. Example sources: ripgrep `Rust · import depth 3 · 50,796 LOC`; React `2 import cycles`; rustlings `150 debt marks`. Maximum audited base-boss Genesis JSON **7,285 bytes**.
- `npx vitest run genesis`: **56/56 PASS**, 4 files. Covers all silhouettes, every selector branch (cycles/fan-out/systems/LOC/age/debt/default), final-kit identity, caption limits, privacy, unchanged budgets, and no archetype row in edu hero traces.
- `npx tsc -p genesis/tsconfig.json --noEmit`: **PASS**. `git diff --check -- genesis docs/progress/codex-genesis.md`: **PASS**.
- Full `npm test`: **600 PASS, 8 SKIP**, 50 files passed / 3 skipped.
- Full `npm run typecheck`: **2 external diagnostics, zero Genesis diagnostics**: `client/render/boss/anatomy.ts:19` BossSlot/KaijuSlot mismatch; `server/rooms.test.ts:47` stub kit missing required archetype. Ownership preserved; no unrelated edits, dependencies, server activity or commits.

## Code-expression weapon caption correction
- Reproduced two stale assertions after code-expression weapon names landed: the phone-number test expected `unsafe{} Cannon`, and the design override used now-invalid prose `Actual Weapon`.
- Weapon targets preserve the complete expression. The source language caption shortens first, retaining the percentage and keeping `from → to` within 40 characters. Payload compaction also preserves complete weapon expressions.
- Updated the design fixture to valid `unsafe { blast() }`; the human-number test reads the actual final kit expression. Added explicit 24-character Go/Rust expression cases and a long-language case, asserting exact expression preservation and the whole-row limit.
- `npx vitest run genesis`: **48/48 PASS** (3 files, including coordinator-added quality integration tests). Scoped `npx tsc -p genesis/tsconfig.json --noEmit`: **PASS**. Scoped `git diff --check`: **PASS**.
- Full `npm test`: **573 PASS, 2 FAIL, 7 SKIP**. Both failures are teammate-owned `client/render/boss/layout.test.ts` (limb radius 15 vs 13; body kaiju vs blob), not Genesis.
- Full `npm run typecheck`: blocked by teammate-owned `sim/regions.ts:18` TS2769 (literal radius 19 incompatible with inferred 13), no Genesis diagnostics. No unrelated files edited or commits made.

## Classroom PvP revision
- Completed `buildGenesis(profile, eduKit, 'hero')`: when `quality` is present, the trace IS the report card. First seven steps show all supplied grades (armor, speed, damage, weakness, HP, energy, regen), followed by concrete improvement tips, then hero identity/cosmetics. All captions stay ≤40 chars; grades/values come directly from sim, including zero and fractional values.
- Exported `qualityTrace(quality)` for consumers needing only report-card rows. No `GameMode` API change or boss needed. Existing battle behavior remains when `quality` is absent; `quality: []` does not invent missing grades.
- Read the new top section of `docs/tasks/edu.md` and `QualityStat` / nullable-boss contracts. No `MatchState`/`Autopsy` boss dereferences exist in `genesis/`; initial scoped typecheck PASS with the nullable contract.
- Initial full workspace typecheck fails in teammate-owned client/app, audio, Hall, server and sim files during migration; no Genesis diagnostics. Ownership is preserved.
- Report-card traces use `PlayerKit.quality`: actual signal → actual stat/value/grade, then improvement tips. No independent quality grading or formulas in Genesis. Existing hero wiring auto-selects report-card behavior when quality is present.
- Edu budget is empty, because code-quality stats do not share the battle five-point pool. Full tips/signals stay on `kit.quality`, joined by trace refs `quality:<stat>` and `quality-tip:<stat>`.
- **Handoff to codex-net / claude-genesis / claude-edu:** build a sim-owned edu kit with quality, then use the existing `buildGenesis(profile, kit, 'hero')` call. Rebuild both kit and Genesis for every ready human/bot on mode changes and after optional design decoration. Edu has no boss Genesis call. Grade refs `quality:<stat>` and tip refs `quality-tip:<stat>` join the short trace to the unabridged `kit.quality` row in lobby/autopsy. Render `kit.quality` in edu instead of the empty `genesis.budget`.
- No shared/client/server/sim edits or commits. Tests use all 15 real fallback profiles with explicitly supplied report-card contract fixtures; actual sim grading/PvP runtime remains sim-owned and was not claimed as integrated proof here.
- Scoped validation: `npx vitest run genesis` **41/41 PASS**; `npx tsc -p genesis/tsconfig.json --noEmit` **PASS**; `git diff --check -- genesis docs/progress/codex-genesis.md` **PASS**.
- Full workspace typecheck currently reports **255 diagnostics, zero in Genesis**, while other owners migrate null-boss/state fixtures (client/app, Hall, server, sim). No unrelated files changed. This supersedes the pre-migration typecheck PASS recorded below.
- Initial full workspace suite: **359 PASS, 1 FAIL, 6 SKIP**; the failure was a 5s timeout in teammate-owned `qa/robustness.test.ts` / nonnumeric-aim lifecycle case. Immediate targeted rerun: **3 PASS, 1 SKIP**. Final full rerun: **375 PASS, 1 FAIL, 6 SKIP**, the same QA timeout; all **41 Genesis tests PASS**. Concurrent teammates added tests between runs. No further retries or unrelated QA edits; workspace suite is not claimed green.

## Cinematic caption revision
- Coordinator requested game-facing captions: `from` and `to` are now each **≤40 characters**, with human numbers (`Rust · 95% of code`, `12,485 LOC`, `1,703 HP`). Formulas, rule thresholds, seed numbers and hex colors are removed from display copy. Numeric payoffs retain space when long names are ellipsized.
- First four hero steps: weapon, skill, glyphs, signature (class if no signature). First four boss steps: largest component limb, heart, cycle weak point (eyes if acyclic), attack. Every other limb/attack mapping remains, with stable IDs in `ref`; final name reveal stays last.
- Actual budgets, metrics, graph, source data and credential filtering are unchanged. Detailed balance formulas stay in sim and the budget helpers rather than captions.
- Updated tests cover caption limits across base and designed fallback kits, mobile ordering, and exact readable examples. Latest 60-payload size audit: **2,567–7,211 bytes**.
- No server/client/shared edits or commits in this revision. Handoff wiring below remains the same.

## Delivered
- `genesis/index.ts`: synchronous `buildGenesis(profile: RepoProfile, kit: PlayerKit | BossKit, kind: 'hero' | 'boss'): Genesis`, plus small exported `heroBudget` / `bossBudget` explain helpers and `MAX_GENESIS_BYTES`.
- Detached real metrics, languages, components/edges/cycles, heart/fan-in, up to 40 supplied file paths and 12 real source snippets; no guessed paths/source. Absent DNA yields zero extracted counts and empty code samples.
- Ordered cinematic trace covers language/class/weapon/palette, skill, stat allocation, signature/glyphs/outfit, each component/limb, import-edge tentacles, heart, each cycle weak point, eyes/scars, TODO bug labels, every attack source/name/ID, theme/age, final design/body/name. Rule precedence and equal budgets are checked against the sim in tests.
- Reads final kit values; applied designs and squad rescaling are reflected without touching balance.
- Hero budget bars = five decoded stat points. Boss bars = component percentages of the one anatomical attack-share budget, total 100%; these are different units. Fixed squad health/threat and cycle-normalized 36% effective limb HP are explained separately.
- Filters recognizable credentials BEFORE truncation, whitelists output fields, never fetches/logs/persists, never accepts token/options. Private profiles work identically inside the room. Server remains responsible for keeping credentialed data away from Gemini/Hall/storage/analytics.
- Compaction sheds optional samples first, then shortens captions without dropping mappings. 60 measured base/fallback-designed payloads across 15 repos: **2,567–7,211 bytes**, comfortably below 12 KiB. UTF-8 stress case covered.
- `genesis/index.test.ts`, `genesis/tsconfig.json`, `genesis/README.md`.

## Handoff to codex-net

Import directly (no async or service initialization needed):

```ts
import { buildGenesis } from '../genesis/index.ts';
```

Exact current `server/rooms.ts` integration points:

1. `setRepo`, immediately after building the seed kit, attach BOTH kit and Genesis to the ready lobby player. Existing credential/revision guards stay in place:

```ts
const kit = this.services.playerKitFromProfile(profile);
member.lobby = {
  id: member.id, name: member.name, repo: profile.slug,
  status: 'ready', kit, genesis: buildGenesis(profile, kit, 'hero'),
  progress: { stage: 'ready', pct: 1 },
};
```

2. `setBoss`, immediately after constructing `kit`:

```ts
room.bossProfile = profile;
room.boss = {
  repo: profile.slug, status: 'ready', kit,
  genesis: buildGenesis(profile, kit, 'boss'),
  progress: { stage: 'ready', pct: 1 },
};
```

3. `refineHero`, after assigning the decorated final `member.lobby.kit` and BEFORE broadcasting:

```ts
member.lobby.genesis = buildGenesis(profile, member.lobby.kit, 'hero');
member.lobby.progress = { stage: 'ready', pct: 1 };
```

4. `refineBoss`, after merging the decorated `room.boss.kit` and BEFORE broadcasting:

```ts
room.boss.genesis = buildGenesis(profile, room.boss.kit, 'boss');
room.boss.progress = { stage: 'ready', pct: 1 };
```

5. `setBots`: build Genesis for each ready bot exactly as for a human. Preserve `bot: true` via the existing lobby spread. `refineHero` then rebuilds for the final design.
6. `start`: after regenerating boss kit for `players.length`, update `room.boss.genesis = buildGenesis(room.bossProfile, boss, 'boss')` alongside `room.boss.kit = boss`, before `broadcastLobby`, so cinematic HP reflects the actual squad. Rematches/design refreshes follow the same rule.
7. Streaming is server/analysis-owned: pass `onProgress` into analysis and broadcast per-repo updates at ~8 Hz, guarded by the same request revision. Set `map` after analysis while building kits; `design` while awaiting optional public design; `ready` at the final broadcast. Genesis itself emits no synthetic progress. A new analysis should clear old `genesis`; a failed optional design keeps the seed kit + seed Genesis ready. Preserve the existing skip of external design for credentialed profiles.
8. Root `tsconfig.json` currently enumerates directories and does not explicitly list `genesis`; server import pulls the implementation into typechecking. Coordinator may add `genesis` to the include list to cover its tests too. Scoped config already verifies both implementation/tests without editing someone else's root config.

No server edits by codex-genesis. WebSocket/client integration and visual/device proof belong to codex-net/claude-genesis and remain **PENDING** here.

## Contract requests / honest mapping boundaries
- No shared contract additions required.
- Contributors → eyes: `design/fallback.ts` clamps contributor count to 1–12 for the fallback design; Gemini may provide a different repo-informed target. Without a design, current renderer uses seed-derived target (3–8); anatomical eyes may exceed a design target. Captions pair contributors with designed eyes only; procedural eyes use “A creature takes shape”.
- Commits → scars: current renderer scars are seed-based. Captions use “A battle-worn creature” → “Scars across its hide” without claiming commits mechanically cause scars. Real commit subjects get a separate taunt mapping when present.
- TODOs label bug minions; they do NOT set minion count. Captions connect TODOs to swarm labels only; numeric summon parameters remain in the kit.
- Hero `cape` trace describes code rows on outfit/cape and any actual design accessory; it does not promise every hero wears a cape.

## Earlier caption-revision verification (before edu contract migration)
- `npx vitest run genesis`: **23/23 PASS**, all 15 fallback profiles, rule precedence/all five stat allocations, all eight attack kinds, design overrides, detached inputs, missing DNA, private credential filtering, UTF-8 payload compaction, squad-independent boss share budgets, short human captions and mobile highlight order.
- `npx tsc -p genesis/tsconfig.json --noEmit`: **PASS**.
- Final `npm run typecheck`: **PASS**.
- Final `npm test`: **336 PASS, 6 SKIP**, 31 files passed / 3 skipped (concurrent teammates added tests during this run; Genesis tests all pass).
- No dev server started/restarted and no live/5173 access. This module has no browser/runtime side effects.
