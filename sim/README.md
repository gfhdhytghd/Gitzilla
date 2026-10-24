# Gitzilla authoritative combat

`sim/index.ts` exports the required profile→kit / match API, weapon tuning, `bossRegions`, `squadBudget`, `ATTACK_COST`, and the `HitFeedback` type, plus `weaponCode`, `CodeWeapon`, `SKILL_FLAVOR` and `ATTACK_FLAVOR`. The live sim has no DOM, network, dependencies, or wall-clock randomness. The same kits and input timeline replay deterministically.

Call `match.step(1 / 30, inputs)` at 30 Hz. `snapshot()` returns a detached copy and drains events accumulated since the previous snapshot, so broadcasting at 20 Hz preserves intervening events. Match time includes the two-second countdown; autopsy duration excludes it. `over` is true on either terminal result, with a six-minute ceiling.

Snapshots publish `boss.regions` in absolute arena pixels, one per limb including broken limbs, followed by `heart`. Broken regions remain for destruction art but cannot be targeted or hit. Render anatomy at these positions. `BossKit.heart` preserves the analyzed file path. Optional Gemini designs do not enter stat or threat calculations. README/tree context is stat-neutral in battle; edu uses documentation evidence in its report cards.

## Equal budgets and squad scaling

- Players redistribute five normalized stat points across health, armor, energy, speed and damage.
- `balance.ts` owns the room budget: HP, simultaneous warning lanes, volley interval, and cast recovery scaling. Repo identity never adds another budget.
- Boss HP is `11600 * (0.6 + 0.4*n) * (1 + max(0,n-4)*0.085)`.
- Total limb durability, after weak-point multipliers, is 36% of core HP for every repo. Allocation follows component LOC plus a flat component share. Cycles keep their tactical weak-point damage without granting free extra core DPS.
- Anatomical attack shares sum to one. Weighted fair selection prevents duplicate component attacks from increasing their type's frequency. Per-kind occupancy costs price the **whole** cast cycle (telegraph plus recovery). Cheap telegraphed styles cast more often; room-wide bullet patterns recover longer. The headless scheduled-budget audit allows at most 8% spread across repo styles and squad sizes, including tick/deck rounding.
- Repo seeds direct art/anatomy. Encounter AI uses a common deterministic seed and restarts its heart-pattern stream when the heart wakes, avoiding seed-dependent difficulty bias.
- Four/six/eight-player rooms add one/two/four independently warned projectile streams aimed at distinct heroes, overlapping the primary anatomical cast. Their base intervals are 3.3/3.1/3.0 seconds; enrage shortens these by 10%. Primary recovery also shortens with squad size. Hit strength is 5 / 4.3 / 4 for four/six/eight players; the extra lanes and their cadence increase total pressure as squads grow. Every added stream has a 0.95s visible warning.
- Generated bullets travel 58–65 px/s (parallel streams 60 px/s). Generated main telegraphs are 0.95s. Shared `params.threatShare` and `params.threatCost` are numeric hints, not new contract fields.

Armor recovers after three seconds without damage, then restores one point each 1.5s. Energy restores 10/s. Dash grants 0.24s invulnerability on a 1.7s cooldown. Standing within 24px of a downed teammate for two seconds revives them at half HP with two seconds of invulnerability. Hotfix restores two HP within 76px every 22s.

Hits on the same region by teammates within 0.5s add 14% damage per additional attacker, capped at +56%. Heart/cyclic regions take 1.5x direct damage. Limb hits chip the core. Phase two starts at 50% HP, phase three at 15%; surviving limbs shield the heart. Breaking a casting limb cancels its pending hazard and disables future source attacks. The exposed heart retains ring, spiral, laser and slam patterns. Solo heroes retain the 1.65x damage assist and boss hits of two.

## Round 2: real code and room depth

`code.ts` copies actual CodeDNA into hero/boss kits. Heroes carry real tokens, identifiers, a signature move and a source snippet; bosses carry heart lines, carved snippets, TODOs, commit subjects and per-limb symbols. Default attack names use their source component's real identifiers, or TODO text for swarms, before any Gemini override. Initial and heart attack identifiers never repeat: source symbols are allocated first, then unused global identifiers. Structural code.attackSymbols/code.limbNames hints survive design merging; the match repairs repeated first-symbol design overrides. Missing DNA produces empty source excerpts rather than fabricated quotes; import-only heart files can legitimately have an empty heart-lines array. DNA does not increase starting battle stats or threat budgets. Live kit code has no logging/persistence path in sim; private DNA stays in the room and must not be passed to Gemini/Hall by callers.

`arena.ts` creates 3–6 destructible 20×20 cover blocks using the boss repo's largest files. Exactly 150 total HP is distributed proportional to LOC, with a 1 HP minimum and deterministic integer rounding. Layouts avoid spawn, boss body and perk pads. Players collide/slide against cover; swept segment/AABB tests stop fast shots from either side. Cover-hit targets are `obstacle:<id>`; destruction emits `obstacleBroken` and drops energy.

Broken limbs drop one heart and one energy pickup. Dead bugs drop energy once. Bugs/blocks may also drop armor, sharing a fixed `ceil(players/2)` armor-drop budget per encounter so summoner styles cannot farm unlimited health. Pickups last 15 seconds, collect within 14px, and restore +1 HP / +2 armor / +30 energy up to caps. Full-resource heroes leave the pickup for teammates. Resource gains emit `pickup` events.

At phase two, code review clears projectiles, hazards, queued streams and charges and pauses hostile actions and player firing for five seconds. Heroes can still move, dash, use skills, collect drops, regenerate and revive. Three seeded perk pads appear at x=100/240/380, y=144. Stand in a pad for one continuous second; leaving resets progress. Timeout assigns the nearest pad to every remaining unpicked hero, including downed heroes. Picks emit `perk` events and persist in `PlayerState.perks`; all modifiers apply without mutating the original kit. Seeded offers derive from player identities rather than repo art/DNA, so changing a boss does not change the squad's perk budget.

| Perk id | Label | Effect |
| --- | --- | --- |
| `force` | `--force` | +25% weapon damage |
| `no-verify` | `--no-verify` | Dash cooldown −40% |
| `pair-programming` | `pair-programming` | 40px revive aura, twice as fast |
| `lint-fix` | `lint --fix` | Armor recovery starts in 2s; 1 point/s |
| `cache-hit` | `cache hit` | Weapon energy cost −30% |
| `hotfix-plus` | `hotfix++` | Skill cooldown −30% |
| `tail-call` | `tail call` | Movement speed +12% |
| `safe-mode` | `safe mode` | Incoming damage −20% |

Two optional extensions are carried structurally pending coordinator shared-contract merge: `BossKit.code.bigFiles` retains `{path,loc}` for cover generation through cloning/design; `PerkOffer.progress[playerId] = {pad,t}` exposes normalized 0..1 hold progress. Renderers can also derive hold progress locally from hero positions. `PERKS` and `createPerkOffer` are exported for galleries/tests.

Bots choose pads using a separate seeded random stream, steer around cover, and collect useful loot. Balance JSON rows include reviews, broken blocks, perk counts and pickup counts so actual exercise of the new systems is inspectable.

## Code constructs as weapons

Every hero kit also fills `code.weapon = {name,projectiles,muzzle,impact}`. `flavor.ts` supplies seven base constructs and language variants: `printf()` / Promise / `as any` pistols, goroutine SMGs, `switch` / `#define` / `template<>` shotguns, `malloc()` / `unsafe{}` cannons, lambda / yield staves, regex / Stream / LINQ beams, and cursor / `die()` blades. Names are at most 20 characters; 1–4 short projectile glyphs are mixed with a genuine short DNA token and ordered deterministically by seed. Muzzle/impact strings are ready for pooled text particles. Gemini may rename the weapon while retaining its glyphs/effects.

This is display metadata: it never changes the hero's existing WeaponKind, fire interval, projectile count/speed, damage, energy or cooldown. Boss default display names combine real source identifiers with `while(true)`, Recursion, `throw`, `grep`, Stack Overflow, `git push --force`, `npm install` and Merge Conflict vocabulary. `SKILL_FLAVOR` supplies `try { } catch`, `git fork`, `+patch`, `sudo !!`, and `git revert` without replacing real signature identifiers.

Round 2 also fixes stored weapon cooldown debt: idling, being downed, or the code-review pause cannot bank free shots and burst at 30Hz on resume. Sub-tick fractional cadence is retained, with at most one simulation slice of debt. The encounter HP budget was retuned for this corrected firing behavior; the code-flavor metadata itself is stat-neutral.

## Hit feedback handoff

Every hit event carries these optional fields, now present in the shared contract:

| Field | Meaning |
| --- | --- |
| `source` | Attacker id or `boss` |
| `direction` | Unit `[x,y]` travel/impact direction toward victim; use for shards and visual recoil |
| `crit` | Heart/weak-point or 3+ synchronized attackers; no random crit RNG |
| `impact` | 0..1 intensity, normalized for heavy weapon hits versus hero damage |
| `hitStop` | Suggested **client-only milliseconds**: 0, 30, or 50; divide by 1000 for render clocks in seconds |

Existing hit, phase, limb-break, down, revive, skill and end events remain compatible. The authoritative simulation never pauses for hit-stop. The shared `GameEvent` hit variant and exported `HitFeedback` type describe these cues. Cover-hit targets use `obstacle:<id>` and are not hero hits even when `source` is `boss`.

## Headless verification

Development smokes/playtests must use **http://localhost:5175** (for example `SMOKE_URL=http://localhost:5175 npx tsx server/smoke.ts`). Port **5173 is stable production/live** from `../gitzilla-live`; never start, stop or test against it. Only the coordinator deploys live.

`npx vitest run sim` checks combat, DNA-backed payloads, equal budgets, cover collision, loot, perk selection/effects, and deterministic replay.

`npx tsx sim/bots.ts 5` runs five deterministic trials of every on-disk fallback boss with 1/4/6/8 players. `npx tsx sim/bots.ts 5 4,6,8` focuses on squads. If snapshots are absent, ten synthetic profiles are used. `runBalance(profiles,trials,counts,onRow?)` and `balanceTable(rows)` support focused tuning and progress output.

Trials pair the same squad, skill level and reaction RNG across repos, retaining each boss's actual anatomy/style. Bots submit normal input frames, never artificial health/damage/victory. Five trials yield 20-point win-rate steps per cell; the equal-budget invariant and aggregates are stronger evidence than a single small cell. Bot results are not phone/human acceptance. Final tables and evidence are in the progress log.

## Classroom PvP (edu)

`playerKitFromProfile(profile, {mode: 'edu'})` returns seven quality rows (`hp`, `armor`, `speed`, `damage`, `energy`, `regen`, `weakness`) with A–F grades, actual measured signals and actionable tips. Tests raise armor; capped log LOC and README presence raise HP; low fan-out/depth raises speed; focused functions raise damage; comments and README raise energy/regen. Cycles increase incoming damage (capped +20%); TODO density creates a short periodic slow (capped 25%). Missing function measurements are either explicitly labelled LOC/definition estimates or unavailable; custom kits get labelled neutral C values. Public advisory fixes appear in the weakness report-card tip.

`createMatch(students, null, {mode: 'edu'})` converts source-bearing kits to quality stats and starts a deterministic 2–30-student FFA with `boss:null`, `heroScale:2`, no boss hazards, and authoritative PvP scores/leader. Battle keeps its equal starting budget. The source evidence is carried in optional structural `PlayerKit.classroom` (`ClassroomFacts` exported), so mode switching never depends on a second analysis request and does not alter weapon/design identity.

Rounds last 75 seconds after an initial two-second countdown. Most KOs wins the round, with damage breaking ties; two round wins or three played rounds ends the match. KO heroes respawn after 2.5 seconds at a distant grid spawn with two seconds invulnerability. Individual impacts are capped below half base HP; full shotgun volleys can land without the later pellets being suppressed by generic hit grace. Dash retains its brief invulnerability, and skills are self-focused in FFA.

Between rounds, a 15-second quiz asks about an actual classmate's heart, uniquely largest/highest fan-in/fan-out component, cycle, or testing report card. Three distinct answers have exactly one correct pad. Hold one second to choose; after 12 seconds unpicked students receive their nearest answer. The final three seconds reveal the answer and explanation. Correct answers give +10% weapon damage and energy regen for the next round only. Source lessons are non-blocking, limited to one every eight seconds, and unseen concepts take priority. Quiz scores, explanations, round state and class rankings are included in snapshots/autopsy.

`pvpArenaSize(count)` is 720×432 at ≤8 students and scales by sqrt(count/8), rounded to 16px (1408×848 at 30). `ClassroomPvpState` exports the pending structural fields `arenaW`, `arenaH`, `phase`, `quizEndsAt` and `quizScores`. **Arena renderers and cameras must use these dimensions rather than battle's 480×288 constants.** `roundEndsAt` is the combat deadline; `quizEndsAt` is the intermission deadline. A classroom ends through the existing terminal transport (`status:'victory'`, victory event), but its autopsy has `mode:'edu', victory:false, boss:null, ranking`; it must never count as a battle victory.

`npx tsx sim/classroom-bots.ts 12` runs a controlled one-strong/three-C-range quality sweep (same weapon, skill and bot skill; rotating strong identity), followed by a complete 30-student stress match. `sim/classroom-results.json` stores aggregate scores and timing only. These synthetic fixtures test quality effects, not claims about real repositories or human play.

## Battle social impact

Source components with at most two measured maintainers become `fragile:true`; when repo busFactor is 1, its least-maintained measured component also becomes fragile (stable component-order tie break). Fragile organs take 1.5× critical hits. The cycle-only weakPoint flag stays separate from fragile so architecture narration remains truthful. Their effective limb durability is normalized together with cyclic weak points, and the extra limb damage is cancelled out of core-chip DPS. Total HP and attack pressure remain equal-budget. Actual maintainers/issues/public advisories flow into the kit and detached autopsy; absent analysis does not create fake authors, issues or findings. `SocialBossKit.social` preserves repo bus factor, unassigned adoptable issues, and top maintainer names pending the shared optional declaration.

Parasite organs carry actual public advisory IDs/packages/fixed versions for the renderer and autopsy. Optional snapshot limb `displayHp` slowly loses up to 10% of its visual shell over 60 seconds; bars can use it for decay art. Authoritative `hp` and break timing stay unchanged, so advisory data changes the presentation without creating free combat budget. Sim makes no advisory/API requests.
