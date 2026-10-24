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
- Only sim/ and this progress file changed by this agent. No shared edits, commits, pushes, dependency installs or live deployments. **5173/live untouched; all server checks used DEV http://localhost:5175.**

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

## Battle balance — FINAL current defaults
15 actual public fallback bosses ×5 trials ×1/4/6/8 players =300 matches. Aggregate squad targets all pass (55–70% wins, 150–210s mean fight and mean victory):

| Players | Wins | Win rate | Mean fight | Mean victory |
| --- | ---: | ---: | ---: | ---: |
| 1 | 69/75 | 92.0% | 260.1s | 261.7s |
| 4 | 51/75 | 68.0% | 181.9s | 197.9s |
| 6 | 44/75 | 58.7% | 173.0s | 186.0s |
| 8 | 50/75 | 66.7% | 190.0s | 198.2s |

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

## Final per-boss table (5 trials per cell)

| Boss | Players | Wins | Win rate | Mean fight | Mean victory |
| --- | ---: | ---: | ---: | ---: | ---: |
| burntsushi/ripgrep | 1 | 3/5 | 60% | 152.9s | 223.8s |
| burntsushi/ripgrep | 4 | 2/5 | 40% | 168.2s | 196.7s |
| burntsushi/ripgrep | 6 | 2/5 | 40% | 159.5s | 194.4s |
| burntsushi/ripgrep | 8 | 3/5 | 60% | 148.1s | 202.3s |
| django/django | 1 | 5/5 | 100% | 245.9s | 245.9s |
| django/django | 4 | 4/5 | 80% | 179.6s | 185.0s |
| django/django | 6 | 3/5 | 60% | 171.7s | 176.6s |
| django/django | 8 | 4/5 | 80% | 197.5s | 194.6s |
| expressjs/express | 1 | 5/5 | 100% | 294.7s | 294.7s |
| expressjs/express | 4 | 4/5 | 80% | 175.0s | 202.0s |
| expressjs/express | 6 | 4/5 | 80% | 184.3s | 182.3s |
| expressjs/express | 8 | 3/5 | 60% | 194.1s | 198.5s |
| facebook/react | 1 | 5/5 | 100% | 265.5s | 265.5s |
| facebook/react | 4 | 3/5 | 60% | 193.9s | 196.4s |
| facebook/react | 6 | 5/5 | 100% | 181.0s | 181.0s |
| facebook/react | 8 | 4/5 | 80% | 196.5s | 198.4s |
| fastapi/fastapi | 1 | 5/5 | 100% | 248.1s | 248.1s |
| fastapi/fastapi | 4 | 5/5 | 100% | 195.5s | 195.5s |
| fastapi/fastapi | 6 | 2/5 | 40% | 183.6s | 198.5s |
| fastapi/fastapi | 8 | 4/5 | 80% | 193.6s | 195.6s |
| gin-gonic/gin | 1 | 5/5 | 100% | 244.7s | 244.7s |
| gin-gonic/gin | 4 | 1/5 | 20% | 133.7s | 182.7s |
| gin-gonic/gin | 6 | 3/5 | 60% | 139.3s | 166.8s |
| gin-gonic/gin | 8 | 2/5 | 40% | 173.3s | 187.6s |
| golang/example | 1 | 5/5 | 100% | 242.5s | 242.5s |
| golang/example | 4 | 3/5 | 60% | 150.2s | 200.3s |
| golang/example | 6 | 2/5 | 40% | 153.3s | 194.3s |
| golang/example | 8 | 4/5 | 80% | 205.0s | 208.1s |
| jquery/jquery | 1 | 4/5 | 80% | 299.9s | 285.4s |
| jquery/jquery | 4 | 4/5 | 80% | 194.6s | 190.7s |
| jquery/jquery | 6 | 3/5 | 60% | 189.7s | 195.0s |
| jquery/jquery | 8 | 3/5 | 60% | 206.2s | 203.4s |
| karpathy/nanogpt | 1 | 5/5 | 100% | 245.3s | 245.3s |
| karpathy/nanogpt | 4 | 4/5 | 80% | 169.3s | 182.5s |
| karpathy/nanogpt | 6 | 1/5 | 20% | 182.2s | 187.7s |
| karpathy/nanogpt | 8 | 4/5 | 80% | 186.4s | 197.9s |
| lodash/lodash | 1 | 5/5 | 100% | 241.4s | 241.4s |
| lodash/lodash | 4 | 2/5 | 40% | 155.1s | 193.5s |
| lodash/lodash | 6 | 3/5 | 60% | 175.9s | 181.9s |
| lodash/lodash | 8 | 4/5 | 80% | 183.9s | 198.9s |
| pallets/flask | 1 | 5/5 | 100% | 263.6s | 263.6s |
| pallets/flask | 4 | 4/5 | 80% | 201.7s | 200.2s |
| pallets/flask | 6 | 3/5 | 60% | 172.1s | 186.7s |
| pallets/flask | 8 | 3/5 | 60% | 191.6s | 188.8s |
| redis/redis | 1 | 3/5 | 60% | 309.6s | 302.1s |
| redis/redis | 4 | 3/5 | 60% | 205.8s | 205.4s |
| redis/redis | 6 | 3/5 | 60% | 189.0s | 196.8s |
| redis/redis | 8 | 2/5 | 40% | 193.3s | 195.7s |
| rust-lang/rustlings | 1 | 5/5 | 100% | 299.7s | 299.7s |
| rust-lang/rustlings | 4 | 4/5 | 80% | 200.6s | 200.7s |
| rust-lang/rustlings | 6 | 3/5 | 60% | 176.2s | 194.2s |
| rust-lang/rustlings | 8 | 3/5 | 60% | 206.3s | 209.0s |
| spring-projects/spring-petclinic | 1 | 4/5 | 80% | 305.5s | 292.4s |
| spring-projects/spring-petclinic | 4 | 5/5 | 100% | 206.6s | 206.6s |
| spring-projects/spring-petclinic | 6 | 4/5 | 80% | 163.3s | 182.0s |
| spring-projects/spring-petclinic | 8 | 3/5 | 60% | 199.1s | 202.0s |
| vuejs/core | 1 | 5/5 | 100% | 242.5s | 242.5s |
| vuejs/core | 4 | 3/5 | 60% | 198.2s | 222.9s |
| vuejs/core | 6 | 3/5 | 60% | 173.7s | 188.1s |
| vuejs/core | 8 | 4/5 | 80% | 174.9s | 189.8s |

DONE
