# Authoritative combat

`sim/index.ts` exports `playerKitFromProfile`, `bossKitFromProfile`, `createMatch`, `Match`, `WEAPONS`, and `bossRegions`. No DOM, network, dependencies, or wall-clock randomness are used by the live sim. Give each match the same kit seeds and input timeline for deterministic replay.

Call `match.step(1 / 30, inputs)` at 30 Hz. `snapshot()` returns a detached copy and drains events accumulated since the previous snapshot; the server can broadcast at 20 Hz without losing events. Match time includes the two-second intro countdown; autopsy duration excludes it. Fights have a six-minute ceiling. `over` is true on either terminal result.

Snapshots publish `boss.regions` in absolute arena pixels, one entry per limb including broken limbs, followed by `heart`. Broken regions remain available for destruction art but cannot be targeted or hit. The renderer should anchor anatomy to these positions. `bossRegions` computes the same deterministic layout for debugging/portraits. `BossKit.heart` preserves the real analyzed file path for autopsy.

Balance knobs live in `kits.ts`, `bossAi.ts`, and the `WEAPONS` table in `match.ts`:

- Five equal player budget points redistribute health, armor, energy, speed, and damage. Repo size does not increase the budget.
- Boss HP is `13200 * (0.6 + 0.4 * playerCount)`. Bullet speeds are 54–70 px/s; telegraphs are at least 0.85s for generated kits.
- Armor starts recovering three seconds after damage, then restores one point each 1.5s. Energy restores 10/s. Dash has 0.24s invulnerability and a 1.7s cooldown.
- Standing within 24px of a downed teammate revives them after two seconds, at half HP with two seconds of invulnerability.
- Coordinated hits on the same region within 0.5s add 14% damage per teammate, capped at +56%. Heart and cyclic weak points take 1.5x damage. Limb hits also chip the core.
- Phase two starts at 50% HP; phase three at 15%, with surviving limbs shielding the heart. Broken sources cannot cast; breaking a casting source interrupts its hazards. The exposed heart retains ring, spiral, laser and slam patterns.
- Solo heroes get 1.65x weapon damage and boss hits deal 2 instead of 5, compensating for absent combos and revives.

Run focused gameplay checks with `npx vitest run sim/match.test.ts`. Run `npx tsx sim/bots.ts 3` for three deterministic trials of every on-disk fallback boss, each with 1/4/8 players. If the analysis snapshots are absent, ten synthetic fixtures are used. `runBalance(profiles, trials, counts)` and `balanceTable(rows)` support faster focused tuning. The bot harness reads snapshots and submits ordinary input frames; it never grants itself health or applies artificial damage. Bot results are tuning evidence, not phone/human acceptance.
