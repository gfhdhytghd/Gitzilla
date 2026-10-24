# Gitzilla authoritative combat

`sim/index.ts` exports the required profile→kit / match API, weapon tuning, `bossRegions`, `squadBudget`, `ATTACK_COST`, and the `HitFeedback` type. The live sim has no DOM, network, dependencies, or wall-clock randomness. The same kits and input timeline replay deterministically.

Call `match.step(1 / 30, inputs)` at 30 Hz. `snapshot()` returns a detached copy and drains events accumulated since the previous snapshot, so broadcasting at 20 Hz preserves intervening events. Match time includes the two-second countdown; autopsy duration excludes it. `over` is true on either terminal result, with a six-minute ceiling.

Snapshots publish `boss.regions` in absolute arena pixels, one per limb including broken limbs, followed by `heart`. Broken regions remain for destruction art but cannot be targeted or hit. Render anatomy at these positions. `BossKit.heart` preserves the analyzed file path. Optional Gemini designs and README/tree art context do not enter stat or threat calculations.

## Equal budgets and squad scaling

- Players redistribute five normalized stat points across health, armor, energy, speed and damage.
- `balance.ts` owns the room budget: HP, simultaneous warning lanes, volley interval, and cast recovery scaling. Repo identity never adds another budget.
- Boss HP is `13200 * (0.6 + 0.4*n) * (1 + max(0,n-4)*0.085)`.
- Total limb durability, after weak-point multipliers, is 36% of core HP for every repo. Allocation follows component LOC plus a flat component share. Cycles keep their tactical weak-point damage without granting free extra core DPS.
- Anatomical attack shares sum to one. Weighted fair selection prevents duplicate component attacks from increasing their type's frequency. Per-kind occupancy costs price the **whole** cast cycle (telegraph plus recovery). Cheap telegraphed styles cast more often; room-wide bullet patterns recover longer. The headless scheduled-budget audit allows at most 8% spread across repo styles and squad sizes, including tick/deck rounding.
- Repo seeds direct art/anatomy. Encounter AI uses a common deterministic seed and restarts its heart-pattern stream when the heart wakes, avoiding seed-dependent difficulty bias.
- Four/six/eight-player rooms add one/two/four independently warned projectile streams aimed at distinct heroes, overlapping the primary anatomical cast. Their base intervals are 3.3/3.1/3.0 seconds; enrage shortens these by 10%. Primary recovery also shortens with squad size. Hit strength is 4.5 for four players and 4 for six/eight; the extra lanes and their cadence increase total pressure as squads grow. Every added stream has a 0.95s visible warning.
- Generated bullets travel 58–65 px/s (parallel streams 60 px/s). Generated main telegraphs are 0.95s. Shared `params.threatShare` and `params.threatCost` are numeric hints, not new contract fields.

Armor recovers after three seconds without damage, then restores one point each 1.5s. Energy restores 10/s. Dash grants 0.24s invulnerability on a 1.7s cooldown. Standing within 24px of a downed teammate for two seconds revives them at half HP with two seconds of invulnerability. Hotfix restores two HP within 76px every 22s.

Hits on the same region by teammates within 0.5s add 14% damage per additional attacker, capped at +56%. Heart/cyclic regions take 1.5x direct damage. Limb hits chip the core. Phase two starts at 50% HP, phase three at 15%; surviving limbs shield the heart. Breaking a casting limb cancels its pending hazard and disables future source attacks. The exposed heart retains ring, spiral, laser and slam patterns. Solo heroes retain the 1.65x damage assist and boss hits of two.

## Hit feedback handoff

Every hit event carries these optional structural fields today; the shared-contract request is in `docs/progress/codex-sim.md`:

| Field | Meaning |
| --- | --- |
| `source` | Attacker id or `boss` |
| `direction` | Unit `[x,y]` travel/impact direction toward victim; use for shards and visual recoil |
| `crit` | Heart/weak-point or 3+ synchronized attackers; no random crit RNG |
| `impact` | 0..1 intensity, normalized for heavy weapon hits versus hero damage |
| `hitStop` | Suggested **client-only milliseconds**: 0, 30, or 50; divide by 1000 for render clocks in seconds |

Existing hit, phase, limb-break, down, revive, skill and end events remain compatible. The authoritative simulation never pauses for hit-stop. Until the coordinator merges optional shared fields, consumers can locally narrow to `GameEvent & Partial<HitFeedback>`; the runtime fields already survive snapshots/JSON.

## Headless verification

`npx vitest run sim/match.test.ts` checks gameplay, art-context neutrality, hit feedback, multi-target warning lanes, equal limb/attack budgets and equal scheduled threat per second.

`npx tsx sim/bots.ts 5` runs five deterministic trials of every on-disk fallback boss with 1/4/6/8 players. `npx tsx sim/bots.ts 5 4,6,8` focuses on squads. If snapshots are absent, ten synthetic profiles are used. `runBalance(profiles,trials,counts,onRow?)` and `balanceTable(rows)` support focused tuning and progress output.

Trials pair the same squad, skill level and reaction RNG across repos, retaining each boss's actual anatomy/style. Bots submit normal input frames, never artificial health/damage/victory. Five trials yield 20-point win-rate steps per cell; the equal-budget invariant and aggregates are stronger evidence than a single small cell. Bot results are not phone/human acceptance. Final tables and evidence are in the progress log.
