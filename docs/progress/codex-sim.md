DONE (boss easier)
DONE (royale balance)

## Final validation — both balance cards complete
- **879 tests PASS /79 files;9 optional skips. Full root typecheck PASS; independent sim typecheck PASS; production build PASS; owned diff check PASS.** Includes11 focused PvP balance tests (7 sustained-fire kinds, dash absorption/cooldown, escape+recharge, and complete battle/edu replay isolation) and7 boss reduction tests covering all3 phases, all4 archetypes,4/6/8, pressure streams, minion damage/cadence, unchanged health/telegraphs and complete PvP/edu replay isolation.
- Both requested reports are saved: `sim/royale-results.json` (30 normal-input matches +7 focused controls) and `sim/boss-easier-results.json` (225 prior +225 easier matches, identical current HP). No commits/pushes, shared edits, dependencies, credentials/provider calls, deployment or server lifecycle controls. Onlysim/ and this progress log changed. DEV/live not accessed for these headless balance cards.

## Boss easier final result / handoff
- Explicit `BATTLE_DIFFICULTY={damage:2/3,attackFrequency:2/3}`. Generated anatomical and heart damage plus parallel-pressure damage scale once; bug contact/projectiles also scale. Whole cast cycles (including the old minimum recovery floor) and source/heart cooldowns scale×1.5, preserving .95s warnings. Shared bossCastPeriod keeps motion recovery synchronized. Opening AI/pressure delay and minion shot intervals also scale. Primary/pressure measured rates are within0.035 of the requested2/3 ratio across all phases/archetypes/squad sizes.
- Existing one-third, linear-per-combatant HP is untouched:4p8507,6p12760,8p17013; limb HP/anatomy unchanged. No battle→PvP/edu crossover: mutation replay tests produce identical complete states for those modes. Royale remains at the independently verified target timing.
- Five trials per repo/cell across15 public fallbacks,4/6/8 players, paired bot seeds/skills. Baseline already used the current reduced HP; all differences below are only the requested damage/cadence changes. New wins are100% in this finite bot sample; the previous55–70%/150–210s archetype targets are historical and superseded by the user's explicit easier-boss requests. No compensating HP/difficulty increase was made to restore them.
- Full45-cell before/after data, budgets, configuration and input/source hashes: `sim/boss-easier-results.json`. Reproduce450 paired matches with `npx tsx sim/boss-easier-report.ts` (or combine3 baseline +3 easier row JSONs as argv). Existing balance-report.ts no longer asserts superseded archetype win/time bands against the newly reduced raid preset.

| Players | HP unchanged | Prior wins | New wins | Prior mean | New mean |
| --- | ---: | ---: | ---: | ---: | ---: |
| 4 | 8507 | 70/75 (93.3%) | 75/75 (100.0%) | 65.3s | 63.6s |
| 6 | 12760 | 75/75 (100.0%) | 75/75 (100.0%) | 58.4s | 56.6s |
| 8 | 17013 | 73/75 (97.3%) | 75/75 (100.0%) | 60.0s | 54.6s |

## Royale balance final result / handoff
- Saved fresh30-match normal-input sweep to sim/royale-results.json:10 matches each at2/4/8, mean67.76s /111.41s /138.71s (targets60–90 /90–130 /120–160 all PASS). Seven neutral equal-budget sustained-fire controls require13.0–14.53s from first damage to elimination, all8–15s PASS, with>8 damaging impacts each; no two-hit kills.
- PvP-only .03 weapon damage (was.14),1.5s disengage delay then1armor/.25s,1.1s dash cooldown/.38s shield,2.4s armor-break escape shield, weaker1.4 staff homing turn. PvP shields consume incoming shots; a blocked projectile resets recharge, so standing in fire behind i-frames cannot indefinitely recharge against a slow cannon. GC still ignores shields and suppresses recharge outside.
- Zone starts45/65/100s of active combat for2/4/8, closes its first stage at105/125/145s, with hard caps130/150/160s. Preview and5s warning remain; telegraph state carries actual roster-dependent times. Bots disengage on low armor and steer along walls; these branches cannot affect battle/edu.
- Closing-circle phase accounts for38.3% /41.7% /27.9% of aggregate match time; GC directly decides3/10,3/10,6/10 endings. Separately,7/10,22/30,24/70 eliminations occur after shrinking starts. These distinguish zone pressure from literal environmental kills. No victory/HP/source overrides in the sweep.
-30 focused royale/balance tests PASS; targeted edu/rubric regressions and standalone sim tsc PASS. Full merged879-test/typecheck/build checks PASS with the separate battle-only easier card. No battle/edu tuning changed for royale: a replay test mutates every royale knob and proves both other modes produce identical complete snapshots.

## Boss easier original request (fulfilled)
- New user instruction: battle boss damage×2/3 and attack frequency×2/3, keep current HP (already reduced to1/3 and linear per combatant) and .95s telegraphs. Taking a paired current-HP baseline, then applying explicit battle-only factors and sweeping4/6/8,5 trials per repo/cell. No royale/edu or shared/service changes for this card.


## Current PvP-only tuning
- .03 weapon multiplier (edu remains.14),2s armor recharge delay/.4s per armor,1.1s dash cooldown/.38s shield, armor-break escape window, staff turn1.4 vs edu4. Shield contacts consume PvP shots, preventing homing orbs from repeatedly circling through a dash shield. Bots disengage on low armor and steer along walls instead of retreating into corners; every branch is gated to ordinary pvp.
- Focused stationary neutral-budget weapon tests at the current damage rate give11.7–13.5s across all7 kinds before the final escape-window adjustment; preserves the8–15s requirement without multiplying health. Early tuning only reduced damage and produced25–40s bots, so that was insufficient.
- GC phase now scales to roster, preserving final-survivor pressure rather than compressing8 heroes as early as a duel:2/4/8 shrink starts45/65/100s active, finishes105/125/145s; hard caps130/150/160s. Existing state.zone carries those times to renderer; no new contract or duplicated client clock. Final collapse fits before each cap. Latest pre-final10-run sweep was53.0/94.0/112.5s; final shield/recharge calibration running.

## Balance follow-up
- Prior7–10s bot matches are too short; that initial implementation evidence is historical, not acceptable balance. Retuning PvP-only weapon damage/survivability; preserving battle and edu mechanics/controllers. Will measure focused-fire TTK and run10 normal-input matches per2/4/8 size, recording weapon/GC elimination shares and zone-decided endings. No shared/service changes.

DONE (royale)

## Royale final delivery
- Owner section complete in sim/ only:2–8 equal-budget fighters, one-life eliminations, sole-survivor win, bounded count-scaled edge spawns, two-second shield, live placements/killer/spectator state, per-elimination pickups, leave-as-elimination with archived ranking, shrinking GC anti-stall zone, seeded tie resolution and150s active ceiling. Edu quality/rounds/respawns/quizzes remain intact.
- **19 royale tests PASS;209 sim+rubric tests PASS /17 files; standalone `npx tsc --noEmit -p sim/tsconfig.json` PASS; production build PASS; owned diff check PASS.** Tests cover2/4/8, real movement/fire, mode-switch budget restoration, permanent KO/input/projectile cleanup, placement vs KO count, detached kill logs, pickups, leavers, circle preview/warning/shields, stationary/camping/huge-health stalls, bot zone steering and deterministic normal-input combat.
- `sim/royale-results.json` records15 normal-input public-kit matches (5 each at2/4/8):15 unique-survivor endings,55 weapon KOs,30 collected pickups; mean durations7.56/10.11/9.63s. Stationary/center-camping cases separately prove zone closure; normal bot matches did not require GC. No HP/outcome override in the sweep.
- Full workspace snapshot:826 PASS /2 external FAIL /8 optional skips (shared/classroom-presets metadata normalization and obsolete server2-player rejection). Root typecheck has only concurrent client/app/game spectator references and server/rooms.test array typing errors; zero sim diagnostics. No owner-boundary fixes applied. These integration gates remain with UI/net/lead, not represented as green.
- Net/UI/renderer handoff below is implemented and ready. Exact structural optional contract additions for the elimination log/autopsy are requested below; no shared file edits. No commits/pushes, dependencies, credentials/provider calls, shared service controls, DEV auth bypass, live5173 access or visual/human acceptance claim.


## Royale implementation handoff (complete)
- `createMatch(players,null,{mode:"pvp"})` now accepts2–8 and returns the generalized ClassroomMatch; ordinary PvP is one life / one round. Edu still uses its unchanged30-person quality/respawn/quiz rules. Visible royale arena uses `pvpArenaSize(count,"pvp")`:2p432×256,4p448×256,8p480×288; default one-argument helper remains edu-compatible. All spawn centers are≥40px from arena edges, with2s countdown +2s initial shield.
- Authoritative `state.pvp.royale`: alive IDs, placements, winner and zone are live; target.eliminated/killedBy carry permanent KO state, dead heroes stay in players for spectating; their bullets/input/skills never affect combat. `pvp.leader` always names a surviving target while active, then the winner. Left players are removed and archived with left:true; leaving is elimination, not a room-wide forfeit.
- **Optional contract request (implemented structurally; do not edit shared/ here):** `royale.eliminations: {player:string,by:string|null,at:number,placement:number,reason:"weapon"|"zone"|"left"|"timeout"}[]` chronological log; Autopsy.royale = `{winner:string|null,placements:Record<string,number>,eliminations:RoyaleElimination[]}`; ranking rows add `placement?:number,killedBy?:string|null,left?:boolean`. Exported RoyaleElimination/RoyaleReport/RoyaleRankingRow from sim/index.ts. Downed events additionally carry by/placement/at/reason with the same values. UI/net may consume structural exported types until coordinator adds optional shared fields.
- GC preview exists from countdown: bounded seeded center (within4% of arena center), targetR24; five-second warning at t42, shrink t47→107 (45s of active combat +60s shrink), then final circle collapses over30s. Outside damage ramps0.6→3→13.5+ DPS, bypasses dash shields and blocks armor regen. True simultaneous GC KOs use seeded tie order, with lowest effective health eliminated first; stop immediately at one survivor. Safety ceiling150s active combat (t152 including countdown) finishes even huge custom-health mocks. GC/leave have null killer and award no KO.
- Weapon/zone eliminations drop1heart (+1HP) +1energy (+20RAM), expire15s, living collectors only. Mode-switch metadata restores original equal-budget battle stats from edu/rubric kits; it never changes weapon/code/design identity. Bots target only live foes, steer inside the closing circle and seek nearby useful drops.
-19 new royale tests PASS;5 superseded duel-only best-of-three/draw assertions were replaced with royale semantics. Factory overload now returns ClassroomMatch for both edu/pvp. Final sim/rubric + owned typecheck passed; root external diagnostics are recorded above.

## Royale verification update
- Final headless normal-input sweep saved in sim/royale-results.json:5 matches each for2/4/8 players. Mean active durations7.56/10.11/9.63s (maximum18.93/13.27/10.87s),55 weapon KOs,0 GC KOs,30 pickups; all15 matches end with exactly one survivor. This compact-arena bot sample measures bot combat, not human match length. Separate tests exercise GC stalls through closure/deadline.
- Production build PASS; owned diff check PASS. Full workspace test snapshot826 PASS /2 external FAIL /8 optional skips: shared/classroom-presets normalization lost Python metadata; old server duel test still expects third player rejected. No owned tests fail; net/edu owners are actively updating these areas. Full tsc now has only concurrent client/app/game spectator variables and server/rooms.test people-array typing diagnostics; no sim diagnostics. Added sim/tsconfig.json for independent ownership check.
- Historical sim/balance-results.json is the frozen pre-royale archetype calibration. Battle attack/HP/pressure logic and battle bot input path are unchanged by royale; do not relabel the old runtime hash set as current. Royale has its own15-match artifact and tests.

## Royale plan / contract handoff
- Read docs/tasks/pvp-royale.md and committed PvpState.royale / PlayerState.eliminated+killedBy. Generalizing the former duel inside sim/pvp.ts for2–8 players, permanent elimination, placement order, heart+energy drops, visible bounded arena/spawns, deterministic telegraphed shrinking GC zone and normal-input bots. Classroom edu keeps quality, rounds/respawns/quizzes. No shared or server edits.
- Autopsy needs placement/killedBy and a chronological elimination feed beyond the current shared ranking shape. Will export structural RoyaleAutopsy/RoyaleRankingRow (place,killedBy,left) and royale.eliminations; coordinator may add optional shared fields for consumers. Exact names/types will be recorded as implemented.

DONE (archetypes)
DONE (rubric)

## Lead handoff
- take-lead requested direct notification. Sent codex-gemini a Herdr agent prompt after verifying its live identity/workspace and readiness: DONE marker is top, final300-match artifact saved, kit/cache inputs frozen, refresh offline designs now then run design tests and report to take-lead. Submission acknowledged; asset refresh remains that owner's task.
- Final owned verification after report landed:167 sim+rubric PASS, root tsc PASS, diff check PASS. take-lead's newer first full run reports689 PASS /3 external FAIL; my earlier full-run snapshot below had2 failures. Lead owns merged rerun and other-owner fixes. No shared service changes.

## Final delivery — archetypes + teacher rubric
- Four repo-grounded presets, shared anatomy, authoritative pose/head/airborne state, head-locked beams, warned flight/burrow, hittable jet hops, style-specific projectiles and2s death pose are complete. **Selection/decks/source IDs are frozen. codex-gemini can now regenerate the offline designs against final kits.** Genesis's stale old-rule fixture remains with its owner; no cross-owner edits.
- Final **300 matches**: all15 public profiles ×1/4/6/8 players ×5 trials. All12 archetype×squad cohorts meet55–70% wins,150–210s mean fights and150–210s mean victories. Same paired normal-input bot seeds/skills; no per-repo exception, bot stat change, HP injection or outcome override. Cohorts contain15–25 trials, so these are deterministic calibration observations, not population/human win-rate proof.
- Saved complete60-row table, aggregate/cohort metrics, exact selector reasons, contact-risk costs, cast decks, squad budgets, runtime/profile SHA256s and geometry provenance in `sim/balance-results.json`. Reproduce: `npx tsx sim/balance-report.ts`; optional row-file arguments combine parallel executions. Main HP and normalized limb durability/share/cast occupancy remain equal; contact-risk costs compensate different landing coverage once at impact, including shared pressure. Odd squads interpolate; solo keeps contact cost1.
- Exported `qualityFromRubric(kit,{rubric,results})` (also supports `(kit,results,rubric)`). Real criterion scores/weights map to bounded stats and carry evidence/tips; default source is identical to existing classroom stats on all15 profiles. Applied rows survive match conversion; reverting defaults removes custom weighting. Combined extreme vitality×damage×speed×max(resource pool,sustain)×incoming weakness remains<2.5. Net has wired the hook using real scoreRepo results and a frozen match rubric. No shared edits.
- Validation: **167 sim+rubric tests PASS /13 files** (includes13 archetype mechanics tests +6 rubric conversion tests), full workspace typecheck PASS, production build PASS (existing ineffective dynamic-import warnings), owned diff check PASS.
- Actual DEV5175 proof: standard4human+2bot smokeQDXQ PASS; all4 archetype WebSocket smoke PASS (219–220 snapshots/form over11s, shared centers, attack/recover, hydra fly+dive, mecha hops, abyssal burrow+emerge);30student classroom smokeCCNA PASS (teacher and30 students, boss=null, heroScale2, quality/report Genesis,99 snapshots each/5s, leave/deletion). Initial four-form attempt interrupted by shared watcher restart; final successful run supersedes it. No visual/human play acceptance claimed by protocol checks.
- Latest full workspace suite before final report: **689 PASS /2 external stale-fixture FAIL /8 optional skips**. Design bundled old attack maps await codex-gemini's requested final-kit refresh; Genesis test168 still asserts old2-summon-0/3-fan-0/1-laser-0 rules, superseded by preset decks. Owned167 pass; no test assertions/assets outside ownership changed. Do not deploy until those owners refresh and coordinator reruns merged checks.
- Onlysim/ and this log changed for these cards. No commits/pushes, dependencies, shared edits, credentials, provider calls, server lifecycle controls, or stable LIVE5173 access.

| Archetype | Players | Wins | Win rate | Mean fight | Mean victory |
| --- | ---: | ---: | ---: | ---: | ---: |
| kaiju | 4 | 14/20 | 70.0% | 186.7s | 193.5s |
| hydra | 4 | 9/15 | 60.0% | 175.2s | 188.0s |
| mecha | 4 | 9/15 | 60.0% | 186.4s | 193.0s |
| abyssal | 4 | 15/25 | 60.0% | 185.7s | 198.1s |
| kaiju | 6 | 12/20 | 60.0% | 174.3s | 171.7s |
| hydra | 6 | 9/15 | 60.0% | 163.5s | 174.0s |
| mecha | 6 | 10/15 | 66.7% | 174.0s | 179.9s |
| abyssal | 6 | 15/25 | 60.0% | 178.3s | 185.9s |
| kaiju | 8 | 11/20 | 55.0% | 178.0s | 187.3s |
| hydra | 8 | 9/15 | 60.0% | 189.3s | 199.5s |
| mecha | 8 | 9/15 | 60.0% | 189.2s | 192.9s |
| abyssal | 8 | 16/25 | 64.0% | 193.9s | 203.1s |

Squad aggregate (all15 repos): 1p 66/75=88.0%, mean241.7s; 4p 47/75=62.7%, mean184.0s; 6p 46/75=61.3%, mean173.4s; 8p 45/75=60.0%, mean187.8s.

Archived implementation notes — archetypes

## Rubric hook handoff (implemented; focused verification running)
- Exported `qualityFromRubric` from `sim/index.ts`: call `qualityFromRubric(kit, { rubric, results: scoreRepo(profile, rubric) })`, or `(kit, results, rubric)`. CriterionResult alone has no weights/signal/source metadata; an array without the rubric retains defaults.
- codex-net: apply this to human/bot kits when an edu match starts, using the match's frozen rubric and the actual profile. Reapplying default source restores the existing source-based classroom stats exactly. Server integration stays with net owner.
- Teacher weights affect half the overall score plus half the relevant signal group: tests/CI/typing→armor, modularity→speed, cohesion/function-length→damage, doc/README/license→energy+regen, size/commits→HP, cycles/debt→weakness; custom checks may affect all. No invented profile facts, no design/weapon changes.
- Custom rubric ranges are deliberately bounded; the combined ratio of vitality × damage × speed × max(energy,regen) × incoming weakness is <2.5 even at opposite extremes. Structural `rubricQuality` preserves the applied rows through `createMatch`'s classroom conversion; no shared edits.

## Archetype implementation plan / handoff
- Read docs/tasks/boss-archetypes.md and committed required BossKit.archetype / BossState.pose+airborne. Fix owned types first; no shared edits.
- Selection will use real cycles/fan-out, systems language+depth/infra scale, LOC/age/TODOs and export an exact trace reason for Genesis. No slug whitelist.
- Need renderer owner to extend shared helper to bossAnchors(kit) with head/wing slot tags and ideally per-head mouth offsets, so hydra airborne hit filtering and head lasers use the same source geometry. Until that lands, independent preset/pose work can proceed.
- New per-archetype bot sweeps required; prior upright-only report is historical once movement/decks change. DEV5175 only, no commits/deployments.

## Final checks in progress (archetype mechanics frozen)
- Final calibration has all12 archetype×squad cells in the requested band in the five-trial tuning runs:4p kaiju70%, hydra60%, mecha60%, abyssal60%;6p60/60/66.7/60%;8p55/60/60/64%. Fresh full300-match sweep is running against frozen production values, with original paired bots/inputs/seeds and no outcome/HP manipulation.
- DEV5175 four-form WebSocket smoke PASS:219/219/220/219 snapshots over11s; kaiju idle/walk/windup/attack/recover, hydra fly/dive +64 airborne snapshots, mecha hop +9 airborne, abyssal burrow/emerge +11 airborne. All snapshot region centers equal shared bossAnchors-derived geometry. Rooms explicitly left. Initial attempt was interrupted by shared watcher restart; second setup mistakenly assumed every disk cache wraps profile, fixed to support actual raw cache format; final run passed. No live access or server start/stop.
- Full typecheck PASS.167 sim+rubric tests PASS;19 focused archetype+rubric tests PASS. Prior ordinary DEV smokeQDXQ (4humans+2bots) PASS including controls/HMR/leave/owner/deletion/revocation.
- Net has now imported qualityFromRubric and wired applyRubric(profile,kit,rubric) using real scoreRepo results at match creation. Default stats remain exact; teacher document grades survive the PvP conversion.

## Current verification / frozen handoff
- Selection, source attack IDs/kinds, attack-name maps, limb layout and deck mapping are now frozen. Remaining balance tuning changes only contact-risk costs / shared pressure, not design cache inputs. codex-gemini owns the pending offline asset refresh; no design/data edits made by sim for this card.
- Rubric focused6 tests PASS across all15 profiles, including exact default identity, weight effects, grounded evidence, bounded combined advantage, and preserving applied grades through classroom match creation. Export is ready for net to wire.
- First five-trial archetype sweeps showed style-dependent landing risk despite equal HP/attack shares. Calibrating common threat units through per-style, squad-interpolated contact costs (applied exactly once, including pressure). This accounts for homing/ground-shot coverage without per-repo exceptions or changing bots/outcomes. Final report will replace the historical pre-archetype balance-results.json.
- Full tests currently have external stale fixtures: design bundled attack maps need the owner's refresh after the new decks; Genesis attack-rule fixture still expects old2-summon-0. Do not edit others' tests/assets to hide these. Owned tests/tsc recheck running.

## Archetype implementation update
- Owned required fields now supplied; last tsc error was server/rooms.test.ts missing archetype in its mock (net owner), then owned nested code.archetypeReason excess-property diagnostic fixed by using typed BossCode.
- Selection/decks: kaiju laser/slam/fan/charge/ring; hydra laser/fan/dive-charge/spiral; mecha fan/rocket-charge/missile-ring/laser/missile-summon; abyssal cascade/ring/slam/fan/emerge-charge. Component attack shares, effective limb HP, per-kind occupancy costs and squad pressure remain normalized.
- Shared bossAnchors is live, including tag/aloft/mouths. Regions now archetype-aware, hydra flight filters to living heads/wings, burrow filters all hits; staff survives an empty target set. Head laser origins are pinned per cast so another head starting a beam cannot move an existing beam.
- BossMotion drives idle/walk/fly/windup/attack/recover/dive/burrow/emerge/stagger/roar/enrage/death; .dir is a finite world unit vector, .head rotates over unbroken hydra heads, .airborne is authoritative. Hydra takeoff has a .85s notice; abyssal emergence point has a harmless .85s floor warning. Mecha hops remain hittable. All anchor bounds stay inside the arena.
- Hydra charge is one prewarned dive area instead of extra contact+slam double damage. Mecha charge is one rocket fist, ring/summon are slow-turning missiles. Hydra fans add a small6px push without extra HP damage. Abyssal burrows fit in primary recovery windows rather than add simultaneous attacks.
- Death gets a2s pose window before terminal/autopsy transport; recorded fight duration ends at the killing hit. No combat continues during death. Existing owned tests are being migrated from immediate-terminal/old-silhouette assumptions; new archetype tests and a normal-input pilot sweep are running.
- Genesis handoff: exported bossArchetypeFromProfile(profile) returns {archetype,reason}; structural BossKit.code.archetypeReason carries the same exact real-signal explanation. No shared edits.

DONE (attack flavor)

## Expanded attack flavor pools — complete
- Expanded every kind to6 distinct phrases; cascades have8, covering the analyzer's full8-component cap. The deterministic picker uses every phrase before reuse, then repeats a balanced cycle. Heart attacks continue the same kind count, and first laser remains `</> Breath` from the mouth.
- React's7 cascades now have7 different disaster suffixes. Source identifiers/full names remain distinct, and numeric combat fields/gameplay RNG are unchanged. Existing balance evidence remains valid; no tuning or resimulation needed for label-only changes.
- Updated only attackNames in15 existing public boss assets, preserving other fields and the design owner's concurrent kaiju work. No shared/server/client edits, provider calls, commits/pushes or live5173 activity.
- **118 sim tests PASS; full workspace tsc PASS; diff check PASS.** Flavor29 PASS. Tests require≥6 distinct entries per kind, uniqueness within each of3 complete cycles, balanced reuse,7 distinct React cascades, all fallback/heart identifiers and full names, cache repair and idempotence.
- **Actual DEV5175 decorated React lobby PASS:** after design refinement all7 cascade phrases are distinct (list below). The test room was explicitly left/deleted.
- Focused design suite currently has2 unrelated failures from codex-gemini's active kaiju-prompts card: changed body selection vs old seed fixture and body/lore asset regeneration. Its progress log explicitly preserves these concurrent attack-pool changes; sim did not edit/revert those fields. All sim tests and typecheck pass independently.

| Kind | Expanded phrase pool |
| --- | --- |
| ring | while(true) Loop · Infinite Scroll · Busy Wait · Event Loop · Spin Lock · Retry Storm |
| spiral | Recursion · Callback Hell · Deep Clone · Stack Trace · Recursive Descent · Nested Promises |
| fan | throw · Exception Spray · Panic! · Unhandled Error · Throw Storm · Null Pointer |
| laser | </> Breath · Race Condition · grep Beam · Atomic Fault · Hot Path · Null Ray |
| slam | Stack Overflow · Segfault · Kernel Panic · Core Dump · Stack Smash · OOM Crash |
| charge | git push --force · rm -rf · Hard Reset · Force Push · Branch Crash · History Rewrite |
| summon | npm install Swarm · Dependency Hell · Package Flood · Transitive Swarm · Lockfile Storm · Version Drift |
| cascade | Merge Conflict · Memory Leak · Rebase Hell · Circular Import · Cache Stampede · Dangling Pointer · Deadlock · Split Brain |

Verified React lobby cascades: `App() Dangling Pointer`, `fn() Deadlock`, `Foo() Split Brain`, `Child() Merge Conflict`, `get() Memory Leak`, `callback() Rebase Hell`, `create() Circular Import`.

DONE (code weapon names)
DONE (anatomy wiring + mouth laser)
DONE (boss attack identifiers — authorized design exception)

## Previous validation — weapon names + anatomy + authorized lobby repair
- **584 tests PASS,7 optional skips;49 passing files /3 skipped. Full tsc PASS; diff check PASS.** Includes114 sim tests and55 design tests. No required checks remain.
- **DEV5175 Flask lobby after final design refinement:** app() while(true) Loop; get() Stack Overflow; index() npm install Swarm; client() while(true) Loop; github_link() Recursion; create_app() while(true) Loop. All6 real source identifiers are distinct. Both cache/model validation and direct apply boundaries repair stale repeated prefixes; custom art suffixes remain when bounded. The oneoff WS test left/deleted its test room afterwards.
- DEV5175 standard smokeZSQO PASS (4 humans+2 bots,99 snapshots/client/5s, leave/owner/deletion/revocation). Live5173 untouched. No commits/pushes or provider/API generation.
- All15 weapon expressions and lengths are printed below; all15 saved hero names remain unique/valid and unchanged by this authorized boss-name fix. Updated only attackNames/limbNames in15 public boss assets, preserving art/title/palette and combat stats.
- Upright anatomy uses shared offsets, chest heart and mouth laser; original13/19 combat radii and all threat knobs preserved. Full300-match report refreshed:4/6/8 wins58.7%/61.3%/61.3%; mean179.3/172.0/185.8s, mean victories198.5/184.0/200.6s. Shared-helper SHA matches the sweep input. No retuning needed.
- Coordinator's explicit **"Authorize the design/ fix"** is the narrow ownership exception for design implementation/tests and required boss asset name-map updates. All other implementation changes remain in sim/. No shared/server/client edits by this agent.

## Code-expression weapon names — implementation complete
- `kits.ts` fills code.weapon using code.signature, actual top identifiers and component symbols. `expressions.ts` chooses complete ≤24-char language/kind templates by seed; `flavor.ts` retains glyph rotation + genuine tokens. Never clips an identifier, closing parenthesis or brace. No WeaponKind/stat/cadence/projectile-count changes.
- 3–4 templates for main language/kind pairs and ≥3 valid-looking forms per kind across20 supported languages; JS await/then, TS casts/await, Rust unsafe/macros/alloc, Go goroutines, C preprocessor/spread, Python yield/lambda, Java streams, C# LINQ, Ruby cuts, etc. FX follows the selected construct and includes a short actual repo identifier where it fits.
- No usable source identifier (absent DNA/only oversized symbols) uses an honest seed-literal code call; never presents an invented name as real source. All15 analyzed fallback repos use genuine whole identifiers and have unique names.
- Final25 focused flavor tests PASS; full sim suite114 PASS after anatomy tests. Deterministic variation covers every kind across20 languages; tests assert3+ forms, ≤24 chars, whole-source symbol use, 15-way uniqueness, no English noun suffix, JS/TS parse diagnostics, reserved/oversized/missing-symbol cases. All four Python fallback labels also parse with Python ast without execution.
- **Client handoffs:** client/genesis/demo.ts:28 still slices weapon names to20 (can cut syntax); client/render/player/index.ts:1482 uppercases the label (changes real identifier case). Preserve all≤24 chars and original code case. No client edits made.
- Anatomy helper landed at20:21 UTC poll. Sim imports shared/kaiju-anatomy.ts kaijuAnchors for every limb/chest center and mouth laser origin. **Combat radii remain13px limbs /19px heart as explicitly requested**; shared art anchors currently provide11–15px visual radii, so sim does not let that lower hit-area budget. Live renderer should honor state.regions.r for combat overlays. No copied coordinate offsets or shared edits. Mouth laser follows shared mouth while firing, retaining0.95s warning and all original damage/width/armed duration/cost/cooldowns. Anatomy tests PASS.
- Current design validator accepts **all15** sim expressions unchanged. Design owner completed the24-char schema/prompts/hero assets/tests. Earlier external legacy-name fixture failures are resolved; final full suite584 PASS /7 skipped and full tsc PASS. Coordinator later authorized the boss-name design exception recorded above.
- `sim/balance-results.json` display-name coverage refreshed only; combat balance metrics remain valid because this change is cosmetic. Upright-kaiju anatomy/mouth-laser wiring and the300-match current-layout replay are complete.

### Cross-owner root causes and fixes (resolved / historical handoff)
- Coordinator explicitly answered **"Authorize the design/ fix"**. Applied the narrow exception in design/fallback.ts, validate.ts, index.ts, schema.ts and focused tests. Updated only attackNames/limbNames fields of15 existing public boss assets; no art/title/palette/stats/model/provider regeneration. No server/client/shared edits or commits.
- **Fixed lobby repeated identifiers root cause:** design/fallback.ts:63–67 selects componentSymbols[source][0] repeatedly; design/validate.ts accepts the overwritten names and truncates to22; server/rooms.ts:396–397 copies these decorative names back over sim's unique ones. The authorized design-boundary repair now prevents that overwrite. Generated names + code.attackSymbols are already correct; exported `reconcileCodeNames(kit)` now enforces each assigned source prefix on ALL attacks (including generic names without an identifier) and is used at match start. New regressions cover repeated app() AND Exception Orbit.
- **Applied authorized fix:** fallback attackNames should be `Object.fromEntries(kit.attacks.map(a => [a.id,a.name]))`; cached/model attack names should pass through `reconcileCodeNames({...kit, attacks:kit.attacks.map(a=>({...a,name:validatedNames[a.id]}))})`, then map repaired names back into design.attackNames. Normalized existing data/design name fields offline. Source prefixes are repaired for fallback, cached/model validation, and direct applyBossDesign (including persisted lobby designs). Custom art suffixes remain when they fit; duplicate limb suffixes are repaired individually so noncolliding custom names survive. Server untouched.
- **Anatomy radii decision:** new shared anchors currently have chest15 and limbs11–15; prior combat is heart19 and limb13. Sim currently pins combat radii13/19 to satisfy the user's unchanged-hitbox-budget instruction while importing ALL centers. Renderer owner should set shared combat radii to13/19 (keep visual lobe radii separate) so sim can consume the entire anchor as a single source of truth. Renderer owner resolved the layout acceptance; final full suite passes. Sim combat radii remain unchanged.
- **Historical renderer anchor issue (resolved by owner):** layout.ts kaiju switch overwrites injected state-region positions/radii with local an.limbs. Preserve provided state anchors; local anatomy defaults only apply to portraits/galleries without state. Other current renderer test expects old9 body categories but the new directive forces kaiju; owner should update that fixture. No renderer edits by sim.

Actual Flask proof: generated = app()/get()/index()/client()/github_link()/create_app(); lobby design currently overwrites them with app()/app()/app()/app()/github_link()/Exception Orbit. Exported repair now restores all6 real assigned symbols, with no repeats. Now called before publishing the lobby decorated kit, in design validation and direct application. Actual DEV5175 WS lobby after final design refinement verified6 unique identifiers.

### Anatomy/mouth-laser validation (current)
- Shared centers/chest/mouth wiring complete; sim keeps13px limb /19px heart combat radii (original per-region and total-area budget). Mouth laser follows the moving kaiju; .95s warning, .75s armed interval, width7, damage, cadence and attack cost unchanged. Dorsal-plate charging is rendered from existing casting progress; no new threat/event budget.
- 25 targeted match/anatomy tests PASS; then29 targeted flavor/anatomy tests PASS after strengthening attack-name repair. Full tsc now PASS after fixing radius-literal inference in owned regions.ts.
- 225 current-geometry matches (15 repos ×5 ×4/6/8):44/75,46/75,46/75 wins =58.7%,61.3%,61.3%; mean179.3s,172.0s,185.8s. **No tuning changes** to preserve budgets. Solo68/75; full300-match artifact refreshed. DEV5175 smokeZSQO PASS:4 humans+2 bots,99 snapshots/client/5s plus leave/ownership/deletion/revocation checks. Live5173 untouched.
- Latest owned validation: **114 sim tests PASS; full repository tsc PASS; diff check PASS.** All300 current-anatomy balance matches and DEV smoke complete.
- Historical full run during shared anatomy migration:573 PASS /2 FAIL /7 skipped; both renderer layout failures are now resolved, final584 PASS /7 skipped. Sim fix to concat typing is complete. Weapon design owner has now finished its24-char schema/validation and regenerated15 unique hero assets; all15 sim expressions preserve exact names.

### All15 public fallback weapon names

| Repo | Language / kind | Code name | Chars |
| --- | --- | --- | ---: |
| burntsushi/ripgrep | Rust / cannon | `alloc(name_long())` | 18 |
| django/django | Python / staff | `yield from value()` | 18 |
| expressjs/express | JavaScript / blaster | `accept().then(fire)` | 19 |
| facebook/react | JavaScript / blaster | `emit(create())` | 14 |
| fastapi/fastapi | Python / staff | `yield from alias()` | 18 |
| gin-gonic/gin | Go / smg | `go burst(Data)` | 14 |
| golang/example | Go / smg | `go repeat(groupOrAttrs)` | 23 |
| jquery/jquery | JavaScript / blaster | `await setup()` | 13 |
| karpathy/nanogpt | Python / staff | `yield process()` | 15 |
| lodash/lodash | JavaScript / blaster | `await fetch(add)` | 16 |
| pallets/flask | Python / staff | `yield from create_app()` | 23 |
| redis/redis | C / shotgun | `#define SPRAY(list)` | 19 |
| rust-lang/rustlings | Rust / cannon | `alloc(stdout())` | 15 |
| spring-projects/spring-petclinic | Java / laser | `addVisit.stream()` | 17 |
| vuejs/core | TypeScript / blaster | `await fire(data)` | 16 |

DONE (removePlayer)

## removePlayer implementation / handoff
- Required `Match.removePlayer(id):void` is implemented by both concrete matches (server's optional transport adapter remains compatible). Unknown/repeated IDs are no-ops. Remaining heroes, bots, world clock, boss HP and round scores continue without a match reset. Zero players immediately ends the sim; server owns last-human/screen room deletion because sim receives fighter IDs, not spectator occupancy. Bot-only classrooms with a teacher must remain supported.
- Battle: delete hero/runtime, owned bullets+shot metadata, forks, firewall hazards/protection, current aggro/cast, targeted pressure/cascade hazards, queued charge/spiral effects for the departing target, combo participation, revive helper/recipient links, review holds/picks/progress, and unsent events referencing the hero. Already-fired boss projectiles and other players' effects continue.
- Classroom: delete live hero/runtime/target lookup, owned bullets, respawn history, active scores/quiz scores, quiz holds/picks/rewards and pending lessons/cues. Archive the exact score + quality rows only in detached autopsy ranking with `left:true`; left players never become live leader/MVP or win future rounds. If the quiz's subject leaves, replace that question from a remaining student's real evidence and reopen its 15s window (undo old provisional quiz rewards); combat HP/time/round scores stay intact.
- **Coordinator contract request:** optional `Autopsy.ranking[].left?:boolean`; local `ClassroomRankingRow`/`ClassroomAutopsy` exports already carry it structurally. No shared edits.
- **Net handoff:** active PvP scores intentionally drop departed IDs, satisfying the real WS gate. `server/rooms.ts activeResult` currently filters ALL departed ranking entries, so it should retain rows marked left:true if the user should see historical leavers in the delivered ranking. Sim retains them as requested; server can filter legacy unmarked entries and live players as before. No server edits made.
- New `sim/departure.test.ts`: **11 PASS** covering live continuation with bots, own-projectile removal, targeted cast/pressure/cascade cleanup, fork/firewall/combo cleanup, interrupted revives, review cleanup, KO removal, quizzes, archived ranking and idempotent empty termination.
- Net real-factory gates PASS: `npx vitest run server/rooms.test.ts -t 'real .* sim'` →3 PASS /34 filtered skips. **Full merged suite497 PASS /7 optional skips.** Full tsc currently fails only other-owner `client/input/touch.ts:49–50` PointerEvent listener overloads introduced during parallel input work; **Owned strict sim/API/removal-test typecheck PASS** (`tsc --noEmit --target ES2023 --module ESNext --moduleResolution bundler --allowImportingTsExtensions --strict --skipLibCheck sim/index.ts sim/departure.test.ts`). All11 removal regressions pass (98 sim tests total). Fixed the local ClassroomAutopsy ranking type to preserve the optional left field in array lookups; the initial other-owner audio type error also no longer appears.
- **DEV5175 smoke PASS WDFL:**4 humans+2 bots,99 snapshots/client/5s, physical leave/ownership transfer/teammate continuation/last-human deletion/revoked-token rejection. Command used `SMOKE_URL=http://localhost:5175 SMOKE_BOTS=2 npx tsx server/smoke.ts` (the script uses4 humans by default). Live5173 untouched; no commits or other-owner edits.
- Existing balance and classroom quality artifacts remain valid: no-leave combat behavior is unchanged (new target/owner bookkeeping only).

DONE (edu pvp)
DONE (code flavor)
DONE (round 2)

## Latest coordinator follow-up — complete
- Fragility now uses measured maintainers≤2 OR (busFactor=1 and least-maintained measured component). Stable component-order tie break; absent counts stay unknown. Effective limb HP and core-chip threat remain budget-neutral. Cycle-only weakPoint stays distinct from fragile; both receive crit multipliers, so architecture narration never labels a maintenance weakness as a dependency loop.
- Ripgrep now has a fragile organ (`crates/regex`,8 measured maintainers, repo busFactor1). Regression verifies the real profile across4/6/8 squads and normalized36% effective limb HP.
- RepoIssues already flows through cloned kit.social into detached battle autopsy. Regression proves adoption fallback works without any component issue.
- Reran all five paired trials at1/4/6/8 for seven repos whose weak-point/HP shape changed. Other eight repos retain identical numerical combat kits, so their existing five-trial cells remain valid. Final artifact/table below includes this follow-up.

## Current result
- Latest scope is **classroom PvP**, superseding earlier boss-based edu. Owned sim implementation is complete: null boss, code-quality stats/report cards, 2–30-student FFA, larger hitboxes, scaled arena, 75s rounds, respawns, quizzes, lessons, ranking.
- Battle keeps equal-budget heroes/bosses and scaling pressure. Round 2 cover/loot/perks, source-code payloads, code weapons, unique attack names, malformed input defense, and Adopt-an-Organ metadata/fragility are complete.
- Initial scope was sim/ and this progress file; coordinator explicitly authorized the design-boundary naming fix and required public asset name-field normalization above. No shared/server/client edits, commits, pushes, dependency installs or live deployments. **5173/live untouched; all server checks used DEV http://localhost:5175.**

## Classroom implementation
- `playerKitFromProfile(profile,{mode:'edu'})` derives seven QualityStat rows with grade, real signal and concrete tip. Tests→armor; capped log LOC/README→HP; fan-out/depth→speed; functions/file and function length→damage; comments/README→energy/regen; cycles/TODO density→weakness and short periodic slow. Public advisory IDs/fixes appear in the report card. Missing measurements stay labelled unavailable; LOC/definition estimates are explicitly approximate.
- Kits carry actual `classroom` evidence even in battle, so an already-analyzed roster can change mode. `createMatch(players,null,{mode:'edu'})` converts the kits, keeps design/weapon identity, and constructs ClassroomMatch without a boss. Unknown/custom evidence gets labelled neutral C values. README/code quality never changes battle's five-point player budget.
- 2–30 students, heroScale=2, 12px hero hit radius, scaled projectiles, 1200 projectile cap. Arena 720×432 at ≤8, sqrt(n/8) scaling rounded to 16px; 30 students use 1408×848. Spawns are distinct grid points; KOs respawn after 2.5s at a distant spawn with 2s invulnerability.
- Initial countdown 2s; combat rounds 75s. Most KOs wins each round, damage breaks ties. First two round wins or three rounds played ends the match. Inactive rounds invent no winner. Ranking: round wins, KOs, damage, fewer downs, stable ID.
- Armor recovers after 3s; energy regeneration follows documentation quality. Individual hits are capped below half base HP. Shotgun pellets can all land; a generic hit-grace window no longer suppresses later pellets from one volley. Skills are self-focused in FFA.
- Between rounds: 15s real-classmate quiz, three distinct answers, exactly one correct answer, one-second pad hold. Answers lock at 12s (nearest-pad fallback), answer/explanation reveal for final 3s. Correct answers give +10% damage/energy regen next round only. Quiz scores and pad progress are published.
- Non-blocking real-data lessons: damage/cohesion, tests/armor, cycles, heart, tech debt, public dependency advisories. At most one card/8s; unseen concepts first. Detached autopsy has `mode:'edu',victory:false,boss:null,ranking` plus every student's quality rows. Terminal status/victory event is used only for the existing end transport, never raid scoring.

## Evidence
- **Full merged suite: 452 PASS, 7 skipped, 41 passing files /3 skipped.** Includes87 sim tests. `npx tsc --noEmit`: PASS.
- A prior full run under four concurrent balance workers hit one QA real-time fixture's 5s timeout; final full run after workers completed passed without modifying QA files or timeouts.
- **DEV 5175 classroom WS smoke PASS:** teacher +30 students, no boss selected, quality + report-card Genesis on every kit, heroScale=2, teacher consumes no student slot, about 100 snapshots/student in 5s. Command: `SMOKE_URL=http://localhost:5175 CLASSROOM_PLAYERS=30 npx tsx server/classroom-smoke.ts`.
- **DEV 5175 battle smoke PASS:** 4 humans, 99 snapshots/client in 5s; Genesis/auth/QR/fallback/Hall endpoints pass. Command: `SMOKE_URL=http://localhost:5175 npx tsx server/smoke.ts`.
- Quality sanity: `npx tsx sim/classroom-bots.ts 12` → one strong-quality vs three C-range students, same TypeScript blaster/firewall skill/controller skill, rotating strong identity. Strong hero wins **5/12 =41.7%** (equal-chance reference 25%); strong hero **115 KOs =9.58/student-match**, C-range heroes **267 KOs =7.42/student-match**. No health/outcome manipulation. Synthetic quality fixtures, not claims about actual repos.
- Complete 30-bot class: **340 KOs, max185 projectiles, all state finite**; 255.2 simulated seconds in 5.0 wall seconds, max measured step 4.82ms on this host. Raw aggregate artifact: `sim/classroom-results.json`. Timings are host-dependent; no human/phone visual acceptance claimed.

## Battle balance — FINAL current upright-anatomy defaults
15 actual public fallback bosses ×5 trials ×1/4/6/8 players =300 matches. Aggregate squad targets all pass (55–70% wins, 150–210s mean fight and mean victory):

| Players | Wins | Win rate | Mean fight | Mean victory |
| --- | ---: | ---: | ---: | ---: |
| 1 | 68/75 | 90.7% | 259.9s | 265.7s |
| 4 | 44/75 | 58.7% | 179.3s | 198.5s |
| 6 | 46/75 | 61.3% | 172.0s | 184.0s |
| 8 | 46/75 | 61.3% | 185.8s | 200.6s |

- Base HP11600; core HP `11600*(.6+.4*n)*(1+max(0,n-4)*.085)`. 4/6/8 squads have 1/2/4 independently warned streams aimed at different players, cadence3.3/3.1/3.0s, damage5/4.3/4. Primary cooldowns also shorten with larger squads.
- Fixed total anatomical attack shares and 36% effective core-HP limb budget after crit multipliers. Cyclic/fragile critical damage is cancelled from core-chip DPS. Repo seed directs anatomy, encounter seed directs common AI pressure. Per-kind costs price the whole cast period including wind-up.
- Final fairness correction: cascade places up to four independently targeted warning circles; it now costs1.2 occupancy units rather than a one-circle slam's .6. React improved from0/5 at4p and8p before this correction to3/5 and4/5; aggregate targets pass with real maintainer data enabled. No per-repo outcome/HP cheats.
- Scheduled threat-rate spread remains <8% across all repo styles at4/6/8 in tests. Five trials per cell have20-point win-rate increments; budget equality is an invariant, not a claim that every small cell lands exactly60%.
- Fixed stored-shot cooldown debt: idle/downed/review time cannot bank30Hz free shots. This report supersedes ALL older balance artifacts/tables from before that correction.
- Artifact: `sim/balance-results.json` contains final rows, summaries, knobs, attack costs, DNA coverage, public-profile hashes and actual review/cover/perk/loot exercise counts. No source excerpts are persisted there. Reproduce with `npx tsx sim/bots.ts 5` (or `5 4,6,8`).

## Round 2 / code flavor / robustness
- Real DNA in hero/boss kits: tokens, unique signatures, snippets, heart lines, TODOs, commits, per-limb symbols and genuine big files. Import-only hearts may have0 usable lines; no fabricated quotes. Private source has no logging/persistence path in sim.
- Cover:3–6 real file blocks, exactly150HP distributed by LOC, solid movement/sliding, swept projectile blocking for both teams, obstacle events and energy drops.
- Loot: broken limbs→heart+energy, defeated minions→energy, occasional armor capped atceil(players/2) per encounter. Collection only when useful; TTL15s; heart+1HP, armor+2, energy+30.
- Phase-two review: clears bullets/hazards/queued pressure/charges, pauses combat firing5s, three seeded pads, one-second hold/nearest fallback incl downed heroes, eight real perks. Movement/skills/regen/loot/revives continue. Perks persist and do not mutate original kit stats.
- All seven weapons get deterministic language-aware code metadata: short name,1–4 glyphs, muzzle and impact text. Actual WeaponKind/fire rates/DPS are unchanged. Skill and disaster-attack flavor maps exported.
- Distinct attack identifiers: unused source-component symbols, then unused global identifiers; heart patterns reserve additional unique real identifiers. Eight varied limb suffixes plus unused symbols avoid repeated limb patterns. If a later design override repeats a leading call like `app()` on every attack, the match repairs it from the unique code hints without changing stats or mutating the supplied kit. Regression covers the reported Flask case.
- Sim sanitizes malformed InputFrames even without server sanitation: bad aim→null, bad move→[0,0], zero aim→null, strict boolean flags, safe huge-finite-vector normalization, sparse/NaN/Infinity/string/object defenses. Valid movement arithmetic stays deterministic.
- Hit events publish `crit`, unit `direction`, `impact`, client-only `hitStop` milliseconds and `source`. Sim never pauses for visual hit stop.

## Social impact (BATTLE)
- Latest rule: measured maintainers≤2 OR the least-maintained measured component when repo busFactor=1→fragile organ and1.5x crits/weak point; same effective HP/attack budget. Actual maintainers, adoptable issues and known advisory IDs/fixes flow into cloned kits/autopsy. Repo bus factor/unassigned issues/top maintainers survive via structural kit.social. Missing data produces no fabricated people/issues/findings.
- Public-advisory parasites slowly wear optional visible `displayHp` by up to10% over60s. Authoritative hp/break timing remains unchanged: presentation changes, combat budget stays fair. Renderer must use displayHp for the wear bar. No API/scanning in sim.
- Old boss-edu bus-factor/organ-break lesson requirements are superseded by boss-free PvP. Advisory lessons/report-card tips work for students; Adopt-an-Organ stays in battle. Inclusive motion belongs to input/UI owners.

## Coordinator contract requests / integration handoffs — no shared edits made
- **CRITICAL client handoff:** arena/camera must consume `pvp.arenaW/arenaH` (or exported `pvpArenaSize(count)`); client/app/game.ts still used480×288 clamps when last inspected. Actual30-player sim spans1408×848. WS/headless acceptance passed; full classroom visual acceptance belongs to client owners.
- Optional `PlayerKit.classroom?: ClassroomFacts` (exported) holds real heart/components/cycles/tests/docs/functions/TODO/advisory evidence for mode switching, lessons and classmate quizzes. Repo owner's structural dna.avgFunctionLength/hasTestDir are consumed.
- Optional `PvpState.arenaW/arenaH:number`, `phase:'countdown'|'round'|'quiz'|'reveal'|'finished'`, `quizEndsAt:number|null`, `quizScores:Record<string,number>` are already sent structurally; exported `ClassroomPvpState` describes them. Combat deadline isroundEndsAt; intermission deadline isquizEndsAt.
- Optional `BossKit.code.bigFiles:{path,loc}[]`, `attackSymbols:Record<attackId,string>`, `limbNames:Record<limbId,string>` retain cover/naming evidence through design/WS; exported BossCode describes them.
- Optional `PerkOffer.progress:Record<playerId,{pad:string,t:number}>` gives normalized0..1 hold progress in battle reviews and classroom quizzes.
- Optional `BossKit.social:{busFactor?,repoIssues?,topMaintainers:Record<component,string[]>}` and `BossState.limbs[].displayHp?:number` carry social context/cosmetic wear.
- **Design owner handoff:** sim repairs repeated names at match start, but lobby/gallery designs should preserve kit.attack.name / code.attackSymbols and code.limbNames. design/fallback.ts still selectedcomponentSymbols[source][0] for each attack when last inspected. No design/ edits made.
- No port5173/live activity, no commits/pushes. Only coordinator deploys.

## Final per-boss table (5 trials per cell, current upright anatomy)

| Boss | Players | Wins | Win rate | Mean fight | Mean victory |
| --- | ---: | ---: | ---: | ---: | ---: |
| burntsushi/ripgrep | 1 | 4/5 | 80% | 188.5s | 232.6s |
| burntsushi/ripgrep | 4 | 2/5 | 40% | 132.4s | 214.2s |
| burntsushi/ripgrep | 6 | 2/5 | 40% | 144.2s | 176.6s |
| burntsushi/ripgrep | 8 | 2/5 | 40% | 140.0s | 205.8s |
| django/django | 1 | 4/5 | 80% | 231.6s | 239.9s |
| django/django | 4 | 5/5 | 100% | 191.5s | 191.5s |
| django/django | 6 | 2/5 | 40% | 162.1s | 169.4s |
| django/django | 8 | 3/5 | 60% | 197.2s | 205.8s |
| expressjs/express | 1 | 5/5 | 100% | 296.0s | 296.0s |
| expressjs/express | 4 | 4/5 | 80% | 201.0s | 201.9s |
| expressjs/express | 6 | 3/5 | 60% | 175.7s | 173.7s |
| expressjs/express | 8 | 4/5 | 80% | 198.4s | 208.5s |
| facebook/react | 1 | 5/5 | 100% | 260.1s | 260.1s |
| facebook/react | 4 | 3/5 | 60% | 185.2s | 192.2s |
| facebook/react | 6 | 4/5 | 80% | 181.8s | 184.4s |
| facebook/react | 8 | 3/5 | 60% | 182.1s | 212.2s |
| fastapi/fastapi | 1 | 5/5 | 100% | 248.6s | 248.6s |
| fastapi/fastapi | 4 | 3/5 | 60% | 175.1s | 188.3s |
| fastapi/fastapi | 6 | 4/5 | 80% | 171.6s | 177.4s |
| fastapi/fastapi | 8 | 2/5 | 40% | 195.7s | 194.2s |
| gin-gonic/gin | 1 | 5/5 | 100% | 246.9s | 246.9s |
| gin-gonic/gin | 4 | 3/5 | 60% | 179.0s | 177.4s |
| gin-gonic/gin | 6 | 4/5 | 80% | 179.9s | 183.7s |
| gin-gonic/gin | 8 | 4/5 | 80% | 195.1s | 195.5s |
| golang/example | 1 | 5/5 | 100% | 243.5s | 243.5s |
| golang/example | 4 | 5/5 | 100% | 198.6s | 198.6s |
| golang/example | 6 | 3/5 | 60% | 154.7s | 185.0s |
| golang/example | 8 | 3/5 | 60% | 156.6s | 199.2s |
| jquery/jquery | 1 | 5/5 | 100% | 311.2s | 311.2s |
| jquery/jquery | 4 | 3/5 | 60% | 203.2s | 186.6s |
| jquery/jquery | 6 | 3/5 | 60% | 178.4s | 184.7s |
| jquery/jquery | 8 | 3/5 | 60% | 186.4s | 197.6s |
| karpathy/nanogpt | 1 | 5/5 | 100% | 245.1s | 245.1s |
| karpathy/nanogpt | 4 | 3/5 | 60% | 154.4s | 187.7s |
| karpathy/nanogpt | 6 | 3/5 | 60% | 174.8s | 180.1s |
| karpathy/nanogpt | 8 | 4/5 | 80% | 188.3s | 189.2s |
| lodash/lodash | 1 | 4/5 | 80% | 234.2s | 245.5s |
| lodash/lodash | 4 | 0/5 | 0% | 153.0s | 0.0s |
| lodash/lodash | 6 | 3/5 | 60% | 154.5s | 178.6s |
| lodash/lodash | 8 | 0/5 | 0% | 154.1s | 0.0s |
| pallets/flask | 1 | 4/5 | 80% | 283.3s | 265.9s |
| pallets/flask | 4 | 1/5 | 20% | 181.6s | 197.7s |
| pallets/flask | 6 | 4/5 | 80% | 183.7s | 186.7s |
| pallets/flask | 8 | 5/5 | 100% | 194.4s | 194.4s |
| redis/redis | 1 | 5/5 | 100% | 317.3s | 317.3s |
| redis/redis | 4 | 3/5 | 60% | 202.9s | 230.3s |
| redis/redis | 6 | 5/5 | 100% | 201.8s | 201.8s |
| redis/redis | 8 | 4/5 | 80% | 218.6s | 214.9s |
| rust-lang/rustlings | 1 | 4/5 | 80% | 276.4s | 288.0s |
| rust-lang/rustlings | 4 | 4/5 | 80% | 202.3s | 212.9s |
| rust-lang/rustlings | 6 | 3/5 | 60% | 180.7s | 197.3s |
| rust-lang/rustlings | 8 | 3/5 | 60% | 196.9s | 202.5s |
| spring-projects/spring-petclinic | 1 | 3/5 | 60% | 273.1s | 306.2s |
| spring-projects/spring-petclinic | 4 | 2/5 | 40% | 138.4s | 199.0s |
| spring-projects/spring-petclinic | 6 | 2/5 | 40% | 164.4s | 185.5s |
| spring-projects/spring-petclinic | 8 | 3/5 | 60% | 200.8s | 204.3s |
| vuejs/core | 1 | 5/5 | 100% | 242.9s | 242.9s |
| vuejs/core | 4 | 3/5 | 60% | 190.7s | 204.7s |
| vuejs/core | 6 | 1/5 | 20% | 172.2s | 166.1s |
| vuejs/core | 8 | 3/5 | 60% | 181.8s | 186.1s |

DONE
