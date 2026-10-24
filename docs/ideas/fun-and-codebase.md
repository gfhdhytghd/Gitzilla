# Gitzilla: fun you can trace back to the repository

Owner: **codex-ideas**. Design/specification only, 2026-10-24. Nothing here is implemented or approved for another agent's files. Contract diffs are requests for the coordinator.

**Recommended hackathon cut:** make attack sources actionable (#1), give the victory a real git-log punchline (#2), then add a co-op import-chain challenge (#3) if four more hours remain. The first two are independent; do not hold the demo for the third. The catalog is a menu, not a 30-feature commitment.

## Grounding and constraints

Read: [original pitch](../../../repo-kaiju.md), [brief](../BRIEF.md), [social impact](../social-impact.md), [round 2](../tasks/round2.md), [code flavor](../tasks/code-flavor.md), [genesis](../tasks/genesis.md), [edu](../tasks/edu.md), [motion v3](../tasks/motion-v3.md), [shared contracts](../../shared/types.ts), and all 15 `data/fallback/*.json` profiles. Implementation checks included `sim/{kits,match,bossAi,code,regions,quality}.ts`, `analysis/{dna,quality}.ts`, and the Hall/tooling READMEs.

Latest cards win over the original pitch: DEV is **http://localhost:5175**, phones are portrait and have **no on-screen combat buttons**, skills are spin or long-press, and edu is **classroom PvP with no boss**. Older shaking, virtual-button, landscape, and boss-edu descriptions are superseded. Lobby configuration may use ordinary controls; combat additions use existing tilt/swing/twist/tap/double-tap/long-press/spin inputs. Small-motion and full-screen touch gestures get the same outcomes; gesture amplitude never sets damage.

Battle retains the existing five-point hero budget, normalized boss durability/threat, and squad scaling. Data can choose identities, targets, spatial patterns and flavor; it cannot award extra strength for stars, size, commit volume, issue count or popularity. Edu retains `PlayerKit.quality` and its explicit signals/tips; cosmetic badges and crowd choices never change grades. No GitHub writes, auto-created PRs, issue assignments, or claimed contribution completions.

### What data really exists

All field paths below refer to the checked-in contracts, unless explicitly marked **NEW**. `p` means `RepoProfile`; `s` means `MatchState`.

| Evidence available now | Useful fields and limits |
| --- | --- |
| Component anatomy | `p.components[].{name,loc,files,fanIn,fanOut}`, `p.edges`, `p.cycles`, `p.heart`, `p.heartFanIn`, `p.maxDepth`; max eight components, regex/sample graph. An edge `[a,b]` means **a imports b**, not necessarily execution order. SCC members are not an ordered cycle path. |
| Genuine source flavor | `p.dna.identifiers`, `.componentSymbols`, `.tokens`, `.snippets[].{file,line,code}`, `.heartLines`, `.bigFiles[].{path,loc}`, `.longestFunction.{name,file,lines}`, `.maxNesting`, `.indent`, `.counts`. Optional DNA may be absent. Truncated lines are excerpts, not runnable code. |
| Recent git flavor | `p.dna.commits`: up to ten subjects, API order newest first. All 15 snapshots currently have subjects; nanoGPT has nine. **No SHA, author, parent, timestamp, file list or diff is retained.** `p.commits` is a separate approximate total, not the length of this list. |
| Social/quality | `p.components[].{maintainers,topMaintainers,issues}`, `p.repoIssues`, `p.busFactor`, `p.vulns`, `p.testRatio`, `p.readme`, `.totalLoc`, `.totalFiles`, `.dna.counts`; `PlayerKit.quality[].{stat,value,grade,signal,tip}` is the existing edu presentation source. |
| Runtime mappings | `BossKit.limbs[].{id,component,weakPoint,fragile}`, `.attacks[].{id,source,kind,name,telegraph,params}`, `.code.{limbSymbols,commits,tokens}`; `s.boss.{casting,regions,limbs,phase}`, `s.events`, `s.players[].{perks,stats,reviveProgress}`. Raw profiles are server-side; carry a compact mapping instead of assuming renderers receive `p`. |
| Useful but locally extended | `dna.avgFunctionLength`, `dna.hasTestDir` exist in the fallback JSON and analysis's local `AnalyzedDNA`, but are not declared in current shared `CodeDNA`. `BossKit.code.bigFiles/attackSymbols/limbNames` and classroom facts also use local structural extensions. Coordinate their declarations before adding new consumers. Top-three specs below do not require these extensions. |
| Not collected today | Blame ownership, actual diffs, PR records, CI/check outcomes, fork count/network, release tags, snapshot SHA and capture time. Each idea using these identifies **NEW proposed fields**, with offline/absent behavior. A `(#123)` in a commit subject does not establish a PR's state. |

Evidence caveats that affect the jokes and lessons:

- Current `dna.todos` is backfilled with NOTE/BUG-like comments when literal TODOs run out. Flask has seven excerpts but `counts.todo/fixme/hack` are all zero. Say **source notes** unless a literal marker is verified; debt counts come from `.counts`, not list length.
- `dna.heartLines` may come from a richer related file if the actual heart is import-only; `analysis/dna.ts` makes that fallback without carrying its source path. Label them **repo excerpts**, never assert a displayed excerpt belongs to `p.heart`. For an exact file/line reveal, use `.snippets[]`.
- `testRatio` measures the share of test files, **not test coverage or CI health**. Quality heuristics are learning prompts, not proof of engineering quality.
- Maintainer counts can be based on a bounded commit sample. Say “one author observed in this sample,” not “this project has exactly one maintainer.” Issue/advisory snapshots may be stale; an empty list means none supplied, not no issues/vulnerabilities.
- Useful offline choices: Flask has 5 components / 2 edges / no cycles; React has 8 / 21 / two SCCs; Django has 8 / 40 / one SCC; nanoGPT has 3 / 0 / no cycles. Ripgrep supplies ten adoptable issues across repo/component lists. Test absent graphs with nanoGPT rather than inventing imports.
- Credentials/private DNA remain room-only: no Gemini, Hall, public badges, logs or persisted public replay payloads. Public weekend rewards contain only approved metadata and event counters; source excerpts stay transient.

### Play evidence

See the completed play record in [codex-ideas progress](../progress/codex-ideas.md). Playwright exercises a mock match and a real DEV room with two isolated player contexts plus two normal bots, using UI controls and observing authoritative WebSocket snapshots. Screenshots and JSON observations are recorded under `/tmp/gitzilla-codex-ideas/`, `/tmp/gitzilla-codex-ideas-rerun/` and `/tmp/gitzilla-codex-ideas-final/`; these are local, transient artifacts. Browser touch emulation does not prove physical sensor feel or a live crowd's response. The ideas' fun scores are design hypotheses, not user-study results.

Final playback record: 30s mock sessions twice, then a **140.069s real-room control window** in room `QAQA`, recovering through two observed lobby resets. Each of the two player contexts received **2,693 authoritative snapshots**; desktop/phone sent **4,051 / 3,848 input frames**, with acknowledgements observed. Cumulative events counted from one client across those attempts: **820 hits, 85 telegraphs, 25 skills, 11 cover breaks, 41 pickups, 12 downs, 12 revives, 4 limb breaks**. These are event counts, not unique limbs or one uninterrupted match. The final snapshot remained fighting, phase 1, at sim time **91.7s**, so victory, phase-two review and the proposed features have no live acceptance claim. Server-restart notices remain recorded; this was an ideation play session, not a clean product-regression pass.

### What the browser sessions suggest

The desktop captures show abundant code glyphs, hit flashes, combo text, file blocks and a warning stack trace that already names an attack source. The phone capture shows those same busy hits in a narrow arena, and a prominent downed/revive meter. These are observations from captured frames, not a frame-rate measurement. They argue for extending the existing warning with a target outline rather than adding another full-screen banner, giving co-op goals one short instruction, and keeping the git-log spectacle after combat. Browser-controlled players were downed quickly; this does not establish that human phone play is unfair. It does make rescue visibility a sensible fallback priority.

The first real session lost its canvas during a page navigation. A second session explicitly received the server message “Server restarted. Your fight was reset to the lobby; repos and kits were restored.” This is an active shared DEV environment. Test interruptions belong in the evidence record and should not be counted as gameplay defeats or proof of end-to-end completion.

## Idea catalog

Estimates are **total implementer-hours** including integration and focused verification with today's owners/helpers: **S ≤2h**, **M ≤5h**, **L >5h**. Demo impact is 1–5. “WHY” identifies moment-to-moment (M), social (S) and spectator (V) fun. Existing features are explicitly described as extensions.

### 01. Break the Stack — attack-source callouts

**Pitch:** Outline the real component currently charging an attack: “`src/flask` is casting — break this limb to cancel it.”\
When the squad succeeds, snap that attack out of a tiny stack trace and announce “`src/flask` interrupted.”

**WHY:** M: choose a concrete interrupt target instead of shooting a silhouette. S: “left limb, now!” V: the source-to-attack-to-cancellation relationship is visible in one second. Extends the sim's existing cancellation rule.

**Data:** `p.components[].name`, `p.dna.componentSymbols` → `BossKit.limbs[].{id,component}`, `.attacks[].{id,source,name}`, `.code.limbSymbols`; `s.boss.casting/regions/limbs`; `GameEvent.telegraph/limbBroken`. **Effort:** S, 2h. **Demo:** 5/5. **Risks:** auto-aim may favor another region; show positional guidance, never promise a cancellable heart/parallel-pressure attack. Spec A below.

### 02. Git Log Final Blow — history becomes the victory weapon

**Pitch:** At the actual winning hit, the last few real commit subjects fold into a ridiculous giant terminal blade and slice the already-defeated boss.\
A recent subject such as Flask's “fix typing” becomes the punchline: “Final blow powered by: fix typing.”

**WHY:** M: a satisfying release after surviving the raid. S: recognize your team's commit humor. V: a readable code-to-weapon money shot with an honest provenance label.

**Data:** `p.dna.commits` → `BossKit.code.commits`, `.tokens`; `s.status`, `s.events` victory/hit, `s.players[].stats.killingBlow`, `Autopsy.players[].stats`. This is a recent-subject montage, not a reconstructed history timeline. **Effort:** S, 2h. **Demo:** 5/5. **Risks:** source text may be inappropriate/private; use existing cleaned fields as text, restrict to room, omit when absent. No invented hash or date. Spec B below.

### 03. Dependency Duet — “you hit A, I hit B”

**Pitch:** A short co-op challenge draws an actual import edge between two living limbs and assigns opposite ends to different players.\
Hit the importer, then have a different teammate hit its dependency: the two names compile into a shared “MERGED” medal.

**WHY:** M: repositioning and target switching. S: a concrete two-person job among 4–8 friends. V: two hero-colored traces converge across named real modules. Rewards are cosmetic; existing damage/combo rules stay authoritative.

**Data:** `p.components[].name`, `p.edges`, `p.seed` → **NEW** `BossKit.repoLinks`; `s.boss.limbs/regions`, `GameEvent.hit.{limb,source}`, `s.players[].id` → **NEW** `s.repoDuet` and `repoDuet` events. **Effort:** M, 4h. **Demo:** 5/5. **Risks:** auto-aim/minions obscure targets; edgeless repos must say so and skip. No claimed runtime call chain or extra damage. Spec C below.

### 04. Pair Review Rescue — rebuild a friend's signature

**Pitch:** The existing revive ring becomes a tiny compile meter rebuilding the downed hero's real signature one token at a time.\
Name the helper, draw a small arrow toward a reachable ally, and award “pair programmer” alongside damage MVP.

**WHY:** M: rescue feels like an active clutch. S: support players get applause. V: the crowd can see who's saving whom.

**Data:** `PlayerKit.code.{signature,tokens}`, `PlayerState.{alive,reviveProgress,x,y,stats.revives}`, `GameEvent.revived.{player,by}`; `p.dna.identifiers`. **Effort:** M, 3h. **Demo:** 4/5. **Risks:** do not invent a bleed-out deadline; current revive has no elimination timer. Keep current 24px/2s and pair-perk rules; no shake requirement or extra healing.

### 05. Crowd Pull Request — spectators choose the next challenge

**Pitch:** The projector offers two next-raid repo cards; people without phones call out their choice and the host selects the winner in the lobby.\
Preview the winning repo's real anatomy as “crowd's next PR,” then play a normal balanced encounter.

**WHY:** M: anticipation between fights. S: bystanders recruit the next squad. V: the room has a stake without microphone permissions or accounts.

**Data:** `p.slug/primaryLanguage/components/heart`, `Genesis.trace`, existing owner `ClientMsg.setBoss`; selected from real fallback profiles. The “PR” is a game metaphor, no GitHub PR exists. **Effort:** M, 3h. **Demo:** 5/5. **Risks:** applause isn't a measured vote; label host's choice, offer a quiet pointing alternative. No in-fight spectator input or hidden stat modifier.

### 06. Long Function, Long Fuse

**Pitch:** The boss's existing laser draws a function ruler labeled with its real longest function and measured line count.\
The ruler fills during the normal warning, then resolves into the existing beam.

**WHY:** M: a legible anticipation beat. S: “that 141-line function is looking at you.” V: a concrete source measurement creates recognizable personality.

**Data:** `p.dna.longestFunction.{name,file,lines}`, `BossAttack.kind/telegraph/params`, `s.boss.casting`. Metadata forwarding needed. **Effort:** M, 3h. **Demo:** 4/5. **Risks:** line span is approximate; do not lengthen danger, shorten warning or claim long functions are inherently wrong. Preserve existing laser geometry/threat.

### 07. Untangle the Boss

**Pitch:** Outline one real SCC as a knot and unravel its surviving strands as those limbs break.\
The projector names the actual participating components; acyclic bosses proudly announce “no dependency knots.”

**WHY:** M: readable subgoal. S: assign limbs to teammates. V: architecture changes visibly during combat.

**Data:** `p.cycles`, `p.components[].name`, `p.edges`, `BossLimb.weakPoint`, `s.boss.limbs/regions`. **Effort:** M, 4h. **Demo:** 5/5. **Risks:** SCC member order is not a traversable cycle; draw verified intra-SCC edges. Existing weak-point normalization remains intact.

### 08. Fan-out Shot Caller

**Pitch:** Before a fan attack, show miniature branch lines from its component to the components it imports.\
Each label previews what “fan-out” means while the attack keeps its existing bullet pattern.

**WHY:** M: anticipation helps read attack shape. S: call out a safe gap. V: graph and bullet fan visually rhyme.

**Data:** `p.edges`, `p.components[].{name,fanOut}`, `BossAttack.{source,kind,params}`. **Effort:** M, 3h. **Demo:** 4/5. **Risks:** seven bullets do not mean seven imports. Label the graph count independently; no graph-density damage multiplier.

### 09. Import-chain Telegraph

**Pitch:** A real verified dependency path lights up before an existing beam, one named component per beat.\
Deep code gets an ominous countdown aesthetic while warning time and threat stay fixed.

**WHY:** M: a repeatable dodge rhythm. S: players count the beats together. V: code structure becomes choreography.

**Data:** `p.edges/components`, `p.maxDepth`, existing `BossAttack.telegraph`, `s.boss.casting`. **Effort:** M, 4h. **Demo:** 4/5. **Risks:** enumerate a real simple path, never fabricate one from `maxDepth` or march through SCC membership. Cap to three displayed beats within ≥0.95s.

### 10. Source-note Bug Hunt

**Pitch:** Give one already-spawned minion a real source-note callout and file label, so the squad can yell “get that bug!”\
On defeat, pop the original note into a tiny inspection card for the projector.

**WHY:** M: a memorable priority target. S: recognizable code comments become running jokes. V: read the note, then watch its bug get squashed.

**Data:** `p.dna.todos[].{file,text}`, `.counts.{todo,fixme,hack}`, `BossKit.code.todos`, `s.minions[].id`; forward file association if needed. **Effort:** M, 3h. **Demo:** 4/5. **Risks:** no extra minions/loot from more notes; never claim a code defect was fixed by killing one. Ordinary NOTE excerpts are labeled “source note.”

### 11. Chunky File, Cracking Cover

**Pitch:** Expand existing file cover with a two-step crack animation and a quick source-path reveal when it breaks.\
Show which real large file sheltered both the team and the boss.

**WHY:** M: readable cover durability and satisfying destruction. S: “stop shooting our cover.” V: the arena is visibly built from actual files.

**Data:** `p.dna.bigFiles[].{path,loc}`, existing local `BossKit.code.bigFiles`, `s.obstacles[].{id,label,hp,maxHp}`, `GameEvent.obstacleBroken`. **Effort:** S, 2h. **Demo:** 3/5. **Risks:** equal total cover HP remains 150; test files may be the biggest. Destruction does not mean dead-code deletion.

### 12. Review Huddle

**Pitch:** During the existing five-second perk pause, show projected hero trails toward the three pads and short plain-language outcomes.\
Friends can choose a rescuer, runner and damage dealer by talking, with no extra phone action.

**WHY:** M: a breathing-space decision. S: squad roles emerge naturally. V: everyone sees the plan form.

**Data:** `s.perkOffer.{pads,endsAt,picked}`, `s.players[].{kit.skill,perks,x,y}`, `PlayerKit.code.signature`. **Effort:** S, 2h. **Demo:** 3/5. **Risks:** perks already exist; this extends feedback only. Edu quiz answers stay hidden until reveal; no “best answer” trail.

### 13. Tiny Repo, Giant Entrance

**Pitch:** Each hero announces one distinctive source fact, then all five budget points land at once to say “same power budget.”\
The smallest and biggest repos get equally dramatic entrances.

**WHY:** M: fast identity recognition. S: underdog pride without a handicap. V: the fairness promise has a visual proof.

**Data:** `p.totalLoc/primaryLanguage`, `Genesis.trace/budget`, `PlayerKit.code.signature`. **Effort:** S, 2h. **Demo:** 3/5. **Risks:** max two seconds per squad, not per hero; edu uses quality cards and no five-point budget animation.

### 14. Clutch Build, No Mercy Tax

**Pitch:** When only one teammate is standing, replace the damage leaderboard's headline with nearby revival routes and “you can still bring them back.”\
Restore the normal HUD when another hero gets up.

**WHY:** M: actionable comeback focus. S: rescue becomes the squad's shared victory. V: a clear last-hero story.

**Data:** `s.players[].{alive,x,y,reviveProgress}`, `PlayerState.stats.revives`, `PlayerKit.code.signature`. **Effort:** S, 2h. **Demo:** 3/5. **Risks:** no automatic damage/HP boost, forced aggro switch or revive through cover. Route hints must respect cover and cannot promise safety.

### 15. Wrist-twist Near Miss

**Pitch:** A successful existing dash through danger leaves a brief `catch {}` bracket and a “clean dodge” chirp.\
The effect keys off server-confirmed dash invulnerability and a genuine near miss, not swing intensity.

**WHY:** M: mastery feedback rewards precision. S: friends celebrate a clutch. V: twisting the phone has a readable payoff.

**Data:** `InputFrame.dash/source`, `PlayerState.dashCd/invuln`, `s.bullets/hazards`, `p.dna.tokens` → `PlayerKit.code.tokens`; a new semantic near-miss event would need sim ownership. **Effort:** M, 3h. **Demo:** 4/5. **Risks:** avoid confusing normal hit immunity with dash; seated/double-tap gets identical credit. No extra i-frames or scoring for physical force.

### 16. Pair Skill, Shared Signature

**Pitch:** When two heroes naturally use compatible skills nearby, braid their real signature names in a “pair build” visual.\
A firewall plus hotfix looks like a tiny green team deployment.

**WHY:** M: deliberate timing. S: “I'll shield, you heal.” V: two distinct repos visibly cooperate.

**Data:** `GameEvent.skill.{player,skill}`, `s.players[].{x,y,buffs}`, `PlayerKit.code.signature`, `p.dna.identifiers`. **Effort:** M, 3h. **Demo:** 4/5. **Risks:** existing effects apply once; no new damage/heal multiplier or required spin. Long-press is equivalent.

### 17. Human Metronome

**Pitch:** Before an announced duet window, the projector pulses three quiet beats and invites the crowd to count along.\
Phones use the existing attack gesture; people without phones can coach timing or point at the target.

**WHY:** M: a timing ritual. S: the whole room shouts together. V: a recognizable “three, two, merge” moment.

**Data:** `s.t`, `GameEvent.hit.combo`, `BossKit.code.limbSymbols`, `PlayerKit.code.signature`; optional `s.repoDuet` from #3. **Effort:** S, 2h after #3, M 3h standalone. **Demo:** 4/5. **Risks:** no microphone, clap detection or extra reward; visual beat and silent participation work. Existing combo timing is 0.5s, not network-arrival time.

### 18. Repo Passport

**Pitch:** Collect a local cosmetic sticker for surviving a new repo anatomy or completing a duet during the weekend.\
Between raids, the projector flips through the squad's “met Python, untangled React, saved a friend” passport.

**WHY:** M: a next-match goal. S: trade stories and recruit a fresh squad. V: visible event continuity.

**Data:** `PlayerKit.repo`, `BossKit.repo/theme`, `Autopsy.{victory,players,boss}`, `PlayerState.stats.{revives,bestCombo}`; new local cosmetic passport records, not new GitHub data. **Effort:** M, 4h. **Demo:** 4/5. **Risks:** no permanent stats or claimed identity across devices; private repo names/source never enter a public passport. Shared phone localStorage is not a user account.

### 19. Rivalry Rubber Stamp

**Pitch:** Rematching the same public boss gives the squad a cosmetic “revenge attempt #N” stamp with its prior outcome.\
A wipe can still earn “best rescue” so the post-match screen has a reason to laugh and queue again.

**WHY:** M: an achievable improvement target. S: low-stakes rivalry persists. V: instantly understand the rematch stakes.

**Data:** `Autopsy.victory/duration/players[].stats`, `BossKit.repo`, existing `ClientMsg.rematch`; room-local attempt history. **Effort:** M, 3h. **Demo:** 3/5. **Risks:** Hall lacks match IDs/deduplication; use per-room completed-match sequence, no duplicate public submission. No hidden easier boss on a rematch.

### 20. Adopt the Broken Organ, Together

**Pitch:** Extend the existing Adopt an Organ ending with a squad pledge: “We want to look at this issue after the demo.”\
Show the exact real issue title and QR; the reward is a room-only “interested” sticker.

**WHY:** M: satisfying coda. S: channel shared victory into a small voluntary next step. V: the judges can scan something useful immediately.

**Data:** `BossLimb.{component,maintainers,issues}`, `Autopsy.boss.limbs[]`, `p.repoIssues`, `AdoptIssue.{number,title,url,labels}`. **Effort:** M, 3h. **Demo:** 4/5. **Risks:** sampled author count is not definitive bus factor; “interested” is not “adopted,” “assigned,” or “contributed.” No issue available → honest repo contributing/issues link.

### 21. Advisory Exorcism

**Pitch:** A supplied public advisory appears as a named cosmetic parasite; the autopsy pairs its ID with the supplied fixed version.\
The squad can “dispel” its visual during an ordinary limb break, then read what a real upgrade would involve.

**WHY:** M: a named target. S: teammates recognize dependencies they use. V: a clear link from dependency to maintenance action.

**Data:** `p.vulns[].{id,pkg,ecosystem,summary,fixed,component}`, `BossLimb.parasites`, `Autopsy.boss.limbs[].parasites`. **Effort:** M, 4h. **Demo:** 4/5. **Risks:** manifests/ranges are best effort, not a security scan; don't claim exploitation, that all findings are current, or that gameplay fixes them. No HP drain advantage.

### 22. Fork Family Parade

**Pitch:** Real forks become a noncombat family tree behind the summon screen; hero decoys wear authentic branch-family badges.\
A tiny independent fork gets the same combat budget as its famous parent.

**WHY:** M: decoys have identity. S: “we're cousins” repo banter. V: an immediately legible open-source family.

**Data now:** `p.slug/stars`, `PlayerKit.skill`, `GameEvent.skill`. **NEW:** `RepoProfile.forkFamily?: { parent: string | null; forkCount: number; sampledForks: string[] }`, read-only repo/forks metadata. **Effort:** L, 6h. **Demo:** 3/5. **Risks:** rate limits, shallow family samples, count doesn't imply health. Missing data → no tree; never infer a fork from a similar name or grant more clones.

### 23. Blame Without Blame

**Pitch:** A chosen source-file weapon carries a small “recently touched by” credit ribbon; a rescue adds “kept alive by” for the helper.\
Celebrate contributors rather than assigning a code defect to a person.

**WHY:** M: recognizable weapon ownership. S: personal pride and support credit. V: real people appear behind the code.

**Data now:** `p.components[].topMaintainers`, `.maintainers`, `p.dna.snippets[].file`; these do **not** establish line authorship. **NEW for true blame:** `CodeDNA.lineCredits?: { file: string; start: number; end: number; author: string; sha: string }[]`, bounded read-only blame/history acquisition. **Effort:** L, 8h. **Demo:** 3/5. **Risks:** costly API integration, author privacy, negative framing. MVP can show honest component-level credits only; omit true-blame claims.

### 24. Diff Dash

**Pitch:** A dash leaves authentic removed/added lines from a recent public commit as red/green afterimages.\
The victory card lets the room compare the change that supplied the trail.

**WHY:** M: a distinctive movement toy. S: identify a teammate's actual patch. V: code visibly transforms rather than serving as wallpaper.

**Data now:** `p.dna.commits` only supplies labels, not patches; `InputFrame.dash`, `PlayerState.dashCd`. **NEW:** `CodeDNA.patchSamples?: { sha: string; file: string; removed: string[]; added: string[] }[]`, one bounded commit-detail request with source filtering. **Effort:** L, 6h. **Demo:** 4/5. **Risks:** private/secret content, huge patches, no retained SHAs today. No patch → ordinary token trail, never fake a diff from unrelated snippets.

### 25. CI Boss Mood Ring

**Pitch:** A supplied checks result becomes a purely cosmetic status lamp: green build halo, red alert eyebrows, or gray “unknown.”\
The autopsy names the check and explains that the game never runs repository code.

**WHY:** M: recognizable boss mood. S: shared build jokes. V: familiar red/green language with a real source.

**Data now:** `p.slug`; `p.testRatio` cannot provide this signal. **NEW:** `RepoProfile.checks?: { sha: string; checkedAt: string; status: 'passing' | 'failing' | 'pending' | 'unknown'; names: string[] }`, read-only commit/status + checks as available. **Effort:** L, 6h. **Demo:** 3/5. **Risks:** no workflows is unknown, not failure; stale/permission-limited results; no stat change or execution of CI jobs.

### 26. PR Tag-team Theatre

**Pitch:** Two actual public PR titles face off as cosmetic banners during a phase transition, and the squad votes by standing on an existing perk pad.\
The banner wins the crowd's approval; GitHub receives no action.

**WHY:** M: an amusing pause choice. S: argue about which patch sounds cooler. V: “approve” has a clear physical staging.

**Data now:** `s.perkOffer.pads`, `p.slug`; commit `(#N)` text is insufficient. **NEW:** `RepoProfile.pullSamples?: { number: number; title: string; url: string; state: 'open' | 'closed'; merged: boolean }[]`, read-only pulls list. **Effort:** L, 6h. **Demo:** 3/5. **Risks:** distracts from perk effects; call the outcome “room pick,” never approved/merged on GitHub. No PR samples → skip; edu quizzes retain their actual answers.

### 27. Release Encore

**Pitch:** After a win, a real supplied release tag becomes the squad's encore banner: “we survived vX.Y.Z.”\
Weekend collectors earn cosmetic era stamps for different boss releases when exact revisions are available.

**WHY:** M: a memorable finish. S: compare release eras. V: recognizable version identity.

**Data now:** `p.slug/ageDays`, `Autopsy.victory`; age is not a release. **NEW:** `RepoProfile.releaseSample?: { tag: string; targetSha: string; publishedAt: string; url: string }` plus `RepoProfile.revision?: { sha: string; analyzedAt: string }`. **Effort:** L, 6h. **Demo:** 3/5. **Risks:** analyzed HEAD may differ from release target; only say “survived this version” if SHA matches. Otherwise “latest supplied release”; no fake tags.

### 28. Refactor Rematch Mirror

**Pitch:** Reanalyze the same consenting public classroom repo after a real edit, and place the two quality cards side by side before a rematch.\
Show exactly which measured signal and resulting stat changed, then let students try the new hero.

**WHY:** M: an improvement experiment. S: classmates suggest focused changes. V: the link from real code change to game behavior is testable.

**Data:** `p.cycles/testRatio/components/totalLoc/dna.counts`, `PlayerKit.quality[].{stat,value,grade,signal,tip}`; **NEW** `RepoProfile.revision?: {sha,analyzedAt}` and saved public quality-card pair; actual diff is optional and separately fetched. **Effort:** L, 7h. **Demo:** 4/5. **Risks:** cached analyses can hide edits, metrics are heuristics, classroom outcomes aren't student ability. Edu only for stat changes; battle rematches keep equal budgets. No claim of a causal improvement without the same measurement pipeline and verified revisions.

### 29. Starfall, Same Strength

**Pitch:** During the boss entrance, its actual star count appears as a tiny constellation counter while every hero gets the same fixed number of decorative sparks.\
The squad can brag about challenging a famous repo without popularity turning into HP or damage.

**WHY:** M: anticipation without a harder fight. S: “our little project versus that famous framework.” V: one recognizable real-world number establishes the stakes.

**Data:** `p.stars`, `p.slug`, `p.fallback`, existing `Genesis`/lobby kit presentation; forward the star count explicitly since `Genesis` currently omits it. **Effort:** S, 2h. **Demo:** 2/5. **Risks:** zero may mean unavailable metadata; snapshots can be old. Say “supplied star count,” omit unknown, keep spark count/collision/stat budgets fixed. Stars are popularity, not quality or vulnerability.

### 30. Issue Triage Bingo

**Pitch:** The autopsy lays out up to three genuine supplied help-wanted issues as a projector bingo strip; the crowd chooses one to read together.\
A separate snapshot counter can frame the maintenance backlog only when its scope and timestamp are known.

**WHY:** M: a simple post-fight choice. S: everyone can point at a title without a phone. V: real maintenance needs give the battle an actionable ending.

**Data now:** `p.repoIssues`, `p.components[].issues`, `AdoptIssue.{number,title,url,labels}`; display “N supplied help-wanted issues,” not total open issues. **NEW for totals:** `RepoProfile.issueCounts?: { openIssues: number; openPullRequests: number; checkedAt: string }`, separately counted with bounded read-only queries. **Effort:** M, 3h for supplied cards; L, 6h including reliable totals. **Demo:** 3/5. **Risks:** GitHub's repo-level `open_issues_count` includes PRs, so it cannot be labeled issue-only. Never equate more issues with worse quality or spawn/damage count. No assignment/comment/PR mutation; stale or absent totals are omitted.

## Ranked top five

Use `score = (fun × codebase link × demo impact) / total hours`, all three ratings 1–5. Fun includes moment-to-moment, social and spectator payoff; codebase link measures whether the actual repository matters. Estimates include integration and focused tests, assume current rendering helpers, and are uncertain by roughly 50%. Scores are planning judgments, not measured outcomes.

| Rank | Idea | Fun | Code link | Demo | Hours / class | Score | Why now |
| --- | --- | ---: | ---: | ---: | --- | ---: | --- |
| 1 | #01 Break the Stack | 5 | 5 | 5 | 2 / S | **62.50** | Exposes a real, already implemented tactic; no retune. |
| 2 | #02 Git Log Final Blow | 4 | 5 | 5 | 2 / S | **50.00** | Genuine subjects already reach boss kits; punchline after real victory. |
| 3 | #03 Dependency Duet | 5 | 5 | 5 | 4 / M | **31.25** | New shared objective grounded in actual imports; no new input gestures. |
| 4 | #04 Pair Review Rescue | 5 | 4 | 4 | 3 / M | **26.67** | Makes support play and comebacks visible. |
| 5 | #05 Crowd Pull Request | 5 | 3 | 5 | 3 / M | **25.00** | Recruits bystanders without microphones or extra controllers. |

Other catalog ideas either duplicate existing feedback, have less immediate payoff, or add metadata/integration cost. Example challengers: #07 at fun 4 × link 5 × demo 5 / 4h = 25; #11 at 3 × 4 × 3 / 2h = 18; #17 standalone at 4 × 3 × 4 / 3h = 16. If the demo's main failure is a confusing revive, prioritize #04 over the higher-scoring optional #03. Ratings should follow observed play needs.

## Spec A — Break the Stack (#01, 2h)

### Player-facing rules and initial numbers

1. Battle only, while `s.status === 'fighting'` and `s.boss !== null`. Resolve `boss.casting.attackId` to `boss.kit.attacks[]`, then map its `source` to `kit.limbs[].component`, and use that limb's ID to find `boss.regions[]`. Match IDs/components exactly, never parse a display name.
2. If that limb exists and is unbroken, draw a 2px amber outline at its authoritative region and one short leader line. Replace the existing stack-trace block's secondary text with **“From: <component> · break limb to cancel”**. Retain the attack name, countdown, target warning, hazard colors, and plain dodge guidance.
3. Do not imply one shot interrupts a full-health limb. Display the current source-limb health fraction (ten-segment bar); use “Finish this limb to cancel” under 25%. This is display logic, not a threshold bonus.
4. When the sim actually cancels a pending cast because its source broke, emit `attackStopped`. All clients play one 0.65s “<component> interrupted” tag anchored to that limb; projector can show “disabled this attack source” for 1.2s. Do not freeze the sim or add hit-stop beyond existing local settings.
5. A source of `heart`, an absent/unknown component, and parallel worker warnings get ordinary warnings with **no interrupt instruction**. A cast ending, phase pause, boss death or disappearing snapshot alone never proves a source interrupt. Once broken, the limb stays visibly crossed out; the sim already excludes its source attacks.
6. Budget: retain existing ~0.95s generated telegraph, minimum 0.6s handling, HP, attack schedule, cancellation semantics and nearest-target auto-aim. No target lock, free shot, force aim or new phone action. Players reach the desired side by tilting/dragging, then attack normally.
7. Keep text to a basename/short component suffix of ≤22 visible characters in combat; room lobby/autopsy can show full path. Never show invented source file/line numbers: this is a component mapping. Reduced motion uses a steady outline and text instead of pulse/shake. No added phone buttons.

### Ownership and sequence

| Module | Exact responsibility |
| --- | --- |
| `sim/` (codex-sim), ~0.5h | In `match.ts::hurtBoss`, inside the existing source-limb cancellation branch, capture the casting attack before nulling it, cancel as today, then emit the semantic event once. No AI selection/balance changes. |
| `server/` (codex-net) | Existing snapshot event transport only; preserve event accumulation across 30Hz steps / 20Hz snapshots. No profile refetch or new route. |
| `analysis/` (codex-repo) | No change; attack→component mappings already exist. |
| `client/render/` (claude-boss), ~0.75h | Consume current casting/regions; draw a restrained overlay and cancellation accent using existing cached/pool helpers. Keep bullets/warnings above decorative source text. |
| `client/app/` (claude-ui), ~0.5h | Reuse existing warning block, route `attackStopped`, omit in edu and handle `boss === null`. Deduplicate per snapshot; do not reset authoritative clocks for effects. |
| `client/input/` (codex-input) | No change. |
| Focused verification, ~0.25h | Sim fixture + DEV desktop/portrait screenshots; stop if hot reload invalidates the observation. |

The estimate assumes a small extension to existing warning rendering. If it requires moving another owner's HUD or renderer, cut the cancellation flourish first and ship the source outline/caption.

### Coordinator-only contract request A

Add one semantic event to the existing union. No changes to profiles, kits, inputs, timing, network messages or player stats:

```diff
 export type GameEvent =
   | { type: "hit"; /* existing fields unchanged */ }
+  | { type: "attackStopped"; attackId: string; limb: string; by: string }
   | { type: "telegraph"; attackId: string; name: string; targetPlayer: string | null }
```

`limb` is the real `BossLimb.id`, `by` is the existing damaging hero ID. Resolve the component through the kit; don't duplicate source excerpts in the event. This hunk is a sketch anchored on the union, not a replacement definition of `hit`. Until merged, implementers can show the live outline/caption using existing types and omit the success tag. Do not infer an interrupt from coincident events.

### Acceptance tests

- Deterministic sim fixture: force a source limb to 1 HP, begin its attack, hit it during wind-up. Exactly one matching `attackStopped`, broken limb, null casting, and removal of that cast's hazards. Later AI selections never use that source. Do not use production state overrides for the live acceptance run.
- Controls: nonlethal hit, break of a different limb, phase-review cancellation, natural cast completion and heart attack produce **no** `attackStopped`. A simultaneous kill must not double-announce cancellation/victory. Drain events once into one broadcast payload shared by clients.
- UI fixtures cover long component names, missing regions/attacks, reconnect during a cast, source already broken, reduced motion, and `boss === null`. No error/interrupt state guessed from a dropped event.
- DEV two-player + bots: source outline follows the named region; a naturally observed source break corresponds to the server event. If no natural cancellation happens during the timed run, mark live interruption evidence **not reached**. Capture portrait and 1440px projector views; no new touch controls or overlapping hazard text.
- Replay the same kit/input timeline before/after: HP, damage, bullets, phase timing and outcome identical; only event/visual output differs. This verifies battle fairness without claiming human difficulty is unchanged by clearer guidance.

## Spec B — Git Log Final Blow (#02, 2h)

### Player-facing rules and initial numbers

1. Trigger only on authoritative battle victory: a transition to `s.status === 'victory'` or the existing `victory` event, with a non-null boss. A locally estimated boss HP of zero is insufficient. The authoritative fight is already over; this animation cannot damage or finish the boss.
2. Read up to **three nonempty subjects** from `boss.kit.code.commits`, keeping supplied newest-first order. Label the source **“Recent commit subjects from <boss repo>”**. Choose the first subject for the final callout; do not select by claimed importance, touched file, date or killer authorship. Use actual supplied subjects, even when they are mundane.
3. Timing budget **1.6s total**, on the existing victory layer: 0–0.45s three small subject cards fold into a blade; 0.45–0.85s one slash; 0.85–1.6s one subject + “raid complete.” The blade uses ≤12 cached token sprites, with no extra full-screen flashes. Autopsy is delivered/rendered immediately underneath; dismiss on an ordinary tap/keystroke. No dedicated phone button or sensor gesture is needed.
4. Use the sole player whose `stats.killingBlow` is true as the credited finisher. `Autopsy.players[].stats` can fill this once available. If ambiguous/missing, say **“Squad final blow”**. Never attribute the displayed commit subject to that player or claim the subject caused real code changes.
5. Trim display to 60 characters per subject (ellipsis), single line, 28 on portrait with a second line for context; insert as text/canvas glyphs, never HTML. Do not send subjects to a new API, public Hall, share card or telemetry. Use only the existing source-text filtering path; if the client needs another exposure destination, omit subjects rather than broaden it.
6. No subjects → generic token-only victory, labeled “raid complete,” with no made-up log. No tokens → a plain terminal blade. Defeat → ordinary defeat/autopsy, no finisher. Edu → ordinary round/ranking feedback, no boss weapon or changed grades. Reduced motion → two static subject cards and a 0.5s caption, no slash/zoom/shake.
7. Play once per connected match lifetime. Track the victory latch in the existing game screen instance and dispose timers on leaving/rematch. On late reconnect to an already-ended game, show the result without replaying the slash. Repeated snapshots and a late autopsy do not trigger another animation.

### Ownership and sequence

| Module | Exact responsibility |
| --- | --- |
| `sim/` | No change: victory state/event and killing-blow stat already exist. `sim/code.ts` already forwards commit subjects into boss code. |
| `server/` | No change: existing snapshots/autopsy. No persisted replay or Hall fields. |
| `analysis/` | No change: existing cleaned recent subjects. Actual timeline chronology would require separate SHA/date metadata and is outside this cut. |
| `client/render/` (claude-boss), ~1h | A local victory effect using existing token/text drawing and at most three subject cards; no art service/dependency. |
| `client/app/` (claude-ui), ~0.5h | Victory latch, subject/killer selection, reduced-motion branch, skip/disposal; compose with existing exit-0 overlay and autopsy. |
| `client/input/` | No mapping change; ordinary page pointer/keyboard dismissal only. Never hijack long-press to make this a combat skill. |
| Focused verification, ~0.5h | Fixture victory/duplicate/absent/private cases and DEV flow observation. |

### Coordinator contract assessment B

**No shared/types.ts change is needed.** `BossKit.code.commits/tokens`, `MatchState.status/events`, `PlayerState.stats.killingBlow` and `Autopsy.players[].stats` already supply the data. The diff is empty. Do not add hashes, dates, authors, a fake “timeline,” an extra damage event, or a new input field to implement this spec.

If a future public replay needs exact-once matching across reloads, request a separate match ID first; the current local effect must not grow that feature.

### Acceptance tests

- Fixture sequence countdown → fighting → victory → repeated victory snapshots → autopsy: one effect, zero added damage/input/GitHub requests; autopsy remains usable within 1.6s and immediately after dismissal.
- Commit text with angle brackets, quotes, emoji, newlines, long strings or an empty array renders as bounded text, never markup. Generic fallback has no fabricated subject/hash/date. Verify latest-first ordering is not silently reversed into an invented historical sequence.
- Defeat, classroom round end and null boss never play it. Test missing/multiple killer flags, reduced motion, route leave during animation and rematch disposal/latch reset.
- Test with an in-memory private-kit fixture: the subject may render to room participants but does not enter Hall/log/share/localStorage/network payloads introduced by this feature. Inspect a public fixture's actual outgoing requests for accidental persistence; do not use real private credentials.
- DEV battle: record an actual authoritative victory if reached; otherwise report the victory-path browser check as fixture-only. A `?mock=autopsy` screenshot is not proof that a real raid was won.

## Spec C — Dependency Duet (#03, 4h)

### Rules: one small co-op objective, real imports

The overlay teaches **“A imports B — two heroes, two targets.”** It reuses actual hits; completion earns a shared cosmetic medal, never damage, healing, score affecting match victory, loot, skill recharge or altered grades. Tactics remain useful because ordinary limb damage already disables source attacks.

1. At kit build, map each verified `p.edges[a,b]` through `p.components[a/b].name` to the matching `BossLimb.id`. Retain only pairs with both mapped limbs, distinct IDs, unique directed pair, stable lexical order. Max 56 pairs for eight limbs. No edge is inferred from fan-in totals, shared identifiers or SCC member ordering.
2. Battle only; require ≥2 hero IDs and two unbroken linked limbs. Bots may participate as ordinary heroes; don't claim bot hits are human teamwork. `PlayerState` has no bot flag, and this cut does not need one. No new bot strategy is required.
3. First eligibility check at **match time 12s**; subsequent opportunities every **22s**. Never overlap an active duet. Select the next live verified edge by cycling a sorted list, with an index initially seeded from `BossKit.seed`. At most one objective on screen, with **8s total** to finish. If no live edge exists, skip this opportunity; no substitute edge, penalty, extra minions or compulsory pause.
4. Start in `awaitImporter`: show A and B anchored to their real hit regions. Any living hero's actual positive-damage boss hit on limb A starts `awaitDependency`, stores `firstPlayer`, and sets `secondBy = min(expiresAt, currentMatchTime + 3s)`. Show “<first hero> hit A; someone else hit B!”
5. A positive-damage hit on B by a **different living hero ID** at or before `secondBy` completes the duet. The same hero can't complete both ends, and minion/cover/core hits don't count. Boss/unknown sources never count. Process hits in authoritative resolution order; at most one completion per objective. Resolve each normal hit first: a hit that changes phase, queues review or ends the fight cancels the objective before duet evaluation, so no duet medal is awarded on that boundary hit.
6. The A hit may break A; keep the link highlight at A's broken region until the objective resolves. The B hit may break B and still count. If B breaks before A is hit, cancel the opportunity. A's subsequent hits, or the first hero's B hit, do not reset the three-second window. If the window expires, mark missed; no rapid retries or punishment.
7. If only one hero remains alive, a required hero leaves, the boss changes phase, a review starts, or the fight ends, clear the objective without a failure toast. Downing the first hitter cancels their pending sequence. Use the server's existing departure handling; don't prolong a match or wait for a disconnected player. A missed deadline gets only a quiet fade; health/damage are unchanged.
8. Completion shows “A → B · pair merged” for **1.2s**, one pair of hero-color ribbons, no additional hit-stop. Keep the completed snapshot state for **1.2s** so a client missing the event still sees the outcome; then clear. Add one completed pair to a bounded, room-only autopsy list (max **16**). Each hero gets shared cosmetic credit; it never competes with raw damage MVP or the edu ranking.
9. Edu: feature absent, no boss access. Graph empty: lobby detail may say “no cross-component imports detected in this sample.” Single-player battle: no duet. Fewer surviving edges naturally means fewer opportunities; **never compare raw duet totals across different repo graphs as a skill leaderboard**.
10. Inputs remain auto-aim + movement + normal attack; no targeting buttons/phone menu, no gesture ID, no raw sensor upload. Choose two heroes' positions socially. Because nearest-target auto-aim may prioritize minions, the instruction must name the targets and show directional arrows without forcing aim. Start at a three-second second-hit window; widen to four only if real phone tests show failures, equally for all profiles.

### Module ownership and implementation order

| Module | Exact responsibility |
| --- | --- |
| `sim/` (codex-sim), ~1.5h | `kits.ts` makes the small verified `repoLinks` mapping from the supplied profile. `match.ts` owns the deterministic schedule/state machine, hit acceptance, timeouts/cancellation and bounded autopsy records. Observe already-resolved hits; never recursively call `hurtBoss` or modify damage. Do not consume extra RNG from the existing encounter/loot streams. |
| `server/` (codex-net), ~0.25h | Forward new state/event/autopsy fields via existing snapshot cloning. Ensure departure removes stale participants using the existing sim path. No new message, vote endpoint, GitHub call or database. Keep room-only results out of Hall serialization. |
| `analysis/` (codex-repo) | No change; components/edges already provide evidence. No GitHub metadata extension. |
| `client/render/` (claude-boss), ~0.75h | Read snapshot objective + authoritative regions; two small outlines and one low-alpha dotted arrow under warnings/projectiles. Direction is importer→dependency, not a claimed function execution trace. Reduced motion is static. |
| `client/app/` (claude-ui), ~0.5h | Compact top/bottom instruction replacing secondary flavor text, ≤2 lines; show remaining seconds and first hero's name; room-only result medal. Must coexist with #01 (active danger warning always wins) and pause/dispose during review/route changes. |
| `client/input/` | No changes; input behavior and seated/touch equivalence stay owned by codex-input. |
| Focused verification, ~1h | State-machine/graph fixtures, invariant replay, two-context DEV browser exercise. Physical phone tuning is a separate acceptance step. |

Do the kit mapping and sim state machine first, then client rendering. This feature depends on the coordinator's contract merge, not on #01/#02. If the merge or four hours aren't available, ship #01/#02 and keep this specification as the next iteration.

### Coordinator-only contract request C

All additions optional for old cached kits/clients. IDs are existing limb/player IDs; no source excerpts are copied. Additions to existing interfaces are shown in context sketches:

```diff
 export interface BossKit {
   // existing fields unchanged
+  repoLinks?: { importer: string; dependency: string }[]; // BossLimb.id pairs, real p.edges only
 }

+export interface RepoDuet {
+  id: number;                        // monotonic within one match
+  importer: string; dependency: string; // BossLimb.id
+  stage: "awaitImporter" | "awaitDependency" | "complete";
+  startsAt: number; expiresAt: number; // authoritative match-time seconds
+  firstPlayer?: string;
+  secondBy?: number;                 // only after accepted importer hit
+  completedBy?: [string, string];    // importer hitter, dependency hitter
+  completedAt?: number;              // retain complete snapshot until +1.2s
+}

 export interface MatchState {
   // existing fields unchanged
+  repoDuet?: RepoDuet | null;          // absent/null in edu, solo or unsupported kits
 }

 export type GameEvent =
   // existing variants unchanged
+  | { type: "repoDuet"; id: number; importer: string; dependency: string;
+      players: [string, string] }     // completion only; state drives prompts/timeouts
   ;

 export interface Autopsy {
   // existing fields unchanged
+  repoDuets?: { importer: string; dependency: string; players: [string, string] }[];
 }
```

Autopsy records use IDs for joining to the retained room kit; persist neither them nor the private kit to Hall. If an app loses its retained kit on reconnect, omit the label rather than inventing one. The sim's internal deadline/schedule accumulator and selected edge index do not need shared fields. No changes to `InputFrame`, `ClientMsg`, `ServerMsg`, `CodeDNA`, hero stats or quality rows.

### Deterministic behavior and tests

- **Graph mapping:** known `[[0,1],[1,2]]` maps to the matching component-limb IDs in the same direction. Duplicate/invalid/self edges and absent limbs are omitted. React/Django SCC membership alone cannot generate a link. nanoGPT and golang/example snapshots yield no links. Missing `repoLinks` on older kits disables gracefully.
- **Hit sequence:** A/p1 then B/p2 at 2.9s completes once; B/p1, B-before-A, cover/minion/core hit, zero damage, boss source, or hit just after 3s cannot complete. Accept the exact boundary with the sim's normal tick epsilon. Breaking A on its starting hit and B on its completing hit still works. Test two hits in one tick and multi-projectile weapons; one pair credit only.
- **Lifecycle:** phase transition/review/death/departure cancels; pause never spends a hidden duet deadline. Complete state remains for exactly the specified display duration. Reconnect sees authoritative current state; lost one-shot events do not restart the timer. Repeated snapshot rendering cannot duplicate medals; deduplicate by objective ID within the game instance.
- **Authority:** clients send existing `InputFrame` only. A client cannot submit completion, picked edge or score. Drive accepted shots in a test through normal sim hit resolution rather than fabricating a browser success message.
- **Budget invariants:** replay identical kits/input sequences with objective tracking on/off; every hero/core/limb HP, armor, energy, bullets, hazards, pickups, phase, timer and terminal outcome must match. This is stronger than merely asserting no explicit “bonus” field. No extra RNG draw may perturb boss behavior, perk choices or loot. Broad existing sim balance tests are required only if implementers touch a balancing path despite this cut.
- **Browser:** two isolated player contexts + bots, graphful fallback boss; visibly establish the first hit and complete via different authoritative hero IDs. Capture desktop and 390×844 portrait with no new combat buttons and legible danger telegraphs. Also check an edgeless boss, reduced motion and edu null boss. If a natural completion isn't reached, record fixture state-machine proof separately and mark live completion pending.
- **Human acceptance:** four people around one projector should understand “you hit A, I'll hit B” within one prompt and succeed once within three offers. Ask a bystander what the arrow meant; the target answer is “A imports B,” not “A executes B.” These outcomes and physical phone feel remain unverified until such a session occurs.

## Demo run-of-show and stop line

For a 90-second judge segment: show a fallback repo's real anatomy during genesis (≤15s), let two judges plus two bots enter combat, point out a sourced telegraph, and have a teammate explain how breaking that limb changes the fight. Show #03 only when it's ready and readable; one optional pair objective is enough. If the real raid doesn't end during the segment, continue the live fight or use a **clearly labeled recorded real victory** for #02. Never force HP to zero and present it as a real win. End on the existing real issue QR/Adopt an Organ card when an issue is supplied.

No new GitHub metadata call is required for the top three. Fork/blame/diff/CI/PR/release ideas stay stretch work. Don't let new banners overwhelm hazards: during immediate danger, source outline + existing warning wins; duet instructions occupy at most two lines, and git-log theatrics happen only after victory. Accessibility, quiet crowd participation, source provenance and the battle/edu distinction are release criteria, not optional stat modifiers.
