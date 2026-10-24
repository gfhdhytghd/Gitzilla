IN PROGRESS — codex-sim

Owns `sim/`; no shared contracts, dependencies, or other agents' files changed.

## Plan / current status
- Read BRIEF, shared/types.ts, design doc, and sim task card.
- Implement deterministic repo kits, authoritative combat, utility boss AI, and bot balance runner.
- Validate focused gameplay tests, full typecheck/test, and server startup when available.

## Contract requests
- Renderer needs deterministic limb hit regions to agree with simulation. Will export `bossRegions(boss)` from sim/index.ts, with offsets/radii in logical pixels. Preferred coordinator addition: optional `BossState.regions: { id: string; x: number; y: number; r: number }[]`; until then renderer can use the exported pure helper. No shared edits by this agent.
- Autopsy contract has `heart` but BossKit carries no analyzed heart path. Will store the highest-priority component locally as a meaningful fallback unless coordinator adds optional `BossKit.heart`.

## Verification
Pending implementation. No new dependencies.

## Implementation / first verification
- Added deterministic kits, all seven weapons, five skills, 30Hz-compatible fixed substeps, auto-aim, dash, armor/energy regen, revive, weak-point/core hit regions, combos, limb disabling, phases, boss utility selection, hazards/minions, events and autopsy.
- Exported the required interface from `sim/index.ts`, plus `bossRegions` and `WEAPONS`.
- `npx vitest run sim/match.test.ts`: 11/11 PASS. Workspace typecheck now PASS as analysis landed.
- Initial 90 synthetic bot matches: every team won; 4-player duration 40–51s. This is too short/easy. Tuning HP/patterns and rerunning against real fallback profiles (now arriving).

## Integration / tuning update
- Real fallback sweep (15 bosses, 1/4/8 players, 3 trials) completed. Raised HP to place 4-player fights in 152–185s; initial squads still all won, so tuning pressure/recovery without speeding bullets beyond phone controls.
- Current damage/attack pacing yields 67% on ripgrep, 100% on jquery/vue in a 9-match check; full squad sweep running.
- `bossRegions` geometry matches the renderer owner's new `client/render/boss/layout.ts` exactly (37x32 offsets, r13 limbs, r19 core). No region contract change needed for demo.
- Actual analyzed heart path retained via local WeakMap on generated kit, captured by createMatch before cloning; same-process server wiring verified. Autopsy heart request no longer blocks.
- `npm test`: 73/73 PASS (8 files). Latest full typecheck temporarily blocked by UI files not written yet; no sim errors.
- `npm run dev`: server started on 5173. `npx tsx server/smoke.ts`: PASS, 4 real WS clients, 100 snapshots each over 5s, fallback/QR endpoints pass. Frontend modules still landing.

## Coordinator contract update applied
- `BossKit.heart` now populated directly from RepoProfile; removed the temporary WeakMap workaround.
- `BossState.regions` populated at construction and on every fighting tick: absolute arena coords for **every** limb (including broken) plus `heart`.
- `bossRegions(boss)` now returns all regions; internal `activeBossRegions(boss)` filters broken limbs for aiming/collision. Renderer must use snapshot regions.
- Added regression checks for exact heart provenance and complete absolute region publication.
