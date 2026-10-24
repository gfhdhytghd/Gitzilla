DONE — codex-sim Gitzilla balance follow-up

## Result
Final default-config sweep: 15 fallback bosses × 5 trials × 1/4/6/8 players = **300 matches**. All requested squad sizes meet **55–70% wins** and **150–210s** average duration, both overall and on wins.

| Players | Wins | Win rate | Mean fight | Mean victory |
| --- | ---: | ---: | ---: | ---: |
| 1 | 53/75 | 70.7% | 261.9s | 265.2s |
| 4 | 46/75 | **61.3%** | **173.9s** | **186.6s** |
| 6 | 48/75 | **64.0%** | **168.4s** | **183.6s** |
| 8 | 44/75 | **58.7%** | **174.3s** | **190.3s** |

Raw results, run metadata, aggregates, and per-repo scheduled-budget audit: `sim/balance-results.json`. Reproduce with `npx tsx sim/bots.ts 5`; `npx tsx sim/bots.ts 5 4,6,8` runs only squads. Trials pair the same hero kits, skills, and reaction RNG across repos. No artificial health, damage or outcome overrides are used in the final runs.

## What changed
- Added `sim/balance.ts` as the single room-wide budget. HP now compensates for larger squads' combo/DPS advantage: `13200*(0.6+0.4*n)*(1+max(0,n-4)*0.085)`.
- 4/6/8 squads get **1/2/4 independently telegraphed streams**, aimed at distinct players, overlapping the primary anatomical attack. Base intervals **3.3/3.1/3.0s**, another 10% faster when enraged. Every stream warns for 0.95s; projectile speeds stay tilt-friendly at 58–65 px/s.
- Larger squads also shorten primary cast recovery/cooldowns. Small squads use hit strength 4.5, large squads 4; simultaneous lanes/cadence create the extra chaos rather than higher bullet speed or one-hit damage.
- **One normalized anatomical attack-share budget per boss** (shares sum to one), independent of component count and duplicated attack kinds. Weighted fair selection replaces random duplicate-count bias and the old strong charge preference.
- **One normalized effective limb-HP budget**: 36% of core HP after weak-point multipliers, redistributed by component share. Cycle weak points retain their direct-damage advantage; they do not grant extra free core DPS.
- Per-kind occupancy costs price the **entire cast cycle**, including wind-up. Cheap telegraphed styles cast more often; broad bullet patterns pay longer recovery. Source cooldowns fit within that cadence, so small repos cannot silently lose threat to idle time.
- Encounter RNG is separated from repo art seeds; heart-pattern RNG restarts consistently when awakened. Repo graph still determines attack styles, component sourcing, weak points and anatomy.
- Gemini design / README / tree context does not enter stats. Added neutrality regression. Public-facing sim documentation now says **Gitzilla**; no obsolete brand strings remain in owned files.

## Normalization evidence and limits
A 120-second scheduled-threat audit across every fallback repo is enforced at 4/6/8 players: max/min rate spread must stay under 8%, allowing fixed-step and finite-deck rounding. Four-player measured rates are 0.360–0.373 threat units/s, under 4% spread. Exact rates for all sizes are in the JSON artifact.

These are equal **scheduled threat budgets**, like the equal player stat budget; different attack styles and finite samples still produce different outcomes. Five-trial cells have 20-point win-rate steps and are reported without forcing uniform results. At 4p, the named ripgrep/express pair is now 40%/80% versus the previous 33%/100%; do not treat five-trial cells as precise human difficulty estimates. Physical phone/human acceptance remains PENDING.

## Hit-feedback contract request / renderer handoff
Please extend the `hit` GameEvent variant in `shared/types.ts` with optional:

```ts
crit?: boolean;
direction?: [number, number]; // unit impact/travel direction toward victim
impact?: number;              // 0..1 visual intensity
hitStop?: number;             // client-only MILLISECONDS (0, 30, 50)
source?: string;              // attacker player id or "boss"
```

**Already emitted** for boss, hero and minion hits as a local structural extension; snapshots and JSON retain these fields. `HitFeedback` is exported from `sim/index.ts`. Heart/weak-point or 3+ synchronized attackers mark a deterministic crit, not random crit RNG. Heavy hits suggest 50ms stop, lighter crits 30ms. Use direction for particles/recoil, impact for shake/squash/glow. Divide hitStop by 1000 for render clocks in seconds. The authoritative sim never freezes.

No shared edits by this agent. The renderer owner has already begun consuming the runtime extension; formal optional shared-field merge remains coordinator-owned.

## Verification
- `npx vitest run sim/match.test.ts`: **21/21 PASS**, including equal stat/limb/attack budgets, equal scheduled threat rate at 4/6/8, distinct simultaneous target warnings, deterministic feedback, cosmetic neutrality, every weapon/skill/pattern, revives, combos, limb interruption, phases and end states.
- `npm test`: **168 PASS, 2 SKIP**, 19 files passed / 1 opt-in browser file skipped.
- Scoped strict TypeScript check (sim, bots, tests): **PASS**.
- Latest full `npm run typecheck`: blocked by teammate-owned `client/render/arena/events.ts:93` TS2367 (redundant `crit === false` after `!critOk`) and `client/render/boss/index.ts:141` TS18047 (`L.mouth` possibly null); no sim diagnostics. Earlier full check passed during this follow-up. Do not edit the renderer from this ownership scope.
- `npx tsx server/smoke.ts`: **PASS**, 4 real clients, 100 snapshots/client over five seconds, QR/fallback/Hall endpoints pass. Existing shared dev server was reused and left running.
- `git diff --check -- sim docs/progress/codex-sim.md`: **PASS**.
- No commits/pushes, shared edits, other-owner implementation edits, new dependencies or tracked secrets.

## Final per-boss table (5 trials per cell)

| Boss | Players | Wins | Win rate | Mean duration | Mean win |
| --- | ---: | ---: | ---: | ---: | ---: |
| burntsushi/ripgrep | 1 | 3/5 | 60% | 238.5s | 257.5s |
| burntsushi/ripgrep | 4 | 2/5 | 40% | 124.0s | 168.9s |
| burntsushi/ripgrep | 6 | 2/5 | 40% | 156.3s | 181.0s |
| burntsushi/ripgrep | 8 | 1/5 | 20% | 167.0s | 190.4s |
| django/django | 1 | 3/5 | 60% | 241.3s | 245.8s |
| django/django | 4 | 3/5 | 60% | 186.6s | 187.7s |
| django/django | 6 | 4/5 | 80% | 179.0s | 179.1s |
| django/django | 8 | 3/5 | 60% | 151.8s | 186.6s |
| expressjs/express | 1 | 4/5 | 80% | 297.6s | 299.8s |
| expressjs/express | 4 | 4/5 | 80% | 194.4s | 192.9s |
| expressjs/express | 6 | 4/5 | 80% | 187.7s | 183.7s |
| expressjs/express | 8 | 4/5 | 80% | 192.8s | 197.8s |
| facebook/react | 1 | 4/5 | 80% | 246.6s | 283.8s |
| facebook/react | 4 | 2/5 | 40% | 158.2s | 178.3s |
| facebook/react | 6 | 3/5 | 60% | 173.8s | 183.7s |
| facebook/react | 8 | 2/5 | 40% | 161.1s | 197.1s |
| fastapi/fastapi | 1 | 5/5 | 100% | 253.0s | 253.0s |
| fastapi/fastapi | 4 | 3/5 | 60% | 175.9s | 182.6s |
| fastapi/fastapi | 6 | 2/5 | 40% | 174.7s | 184.5s |
| fastapi/fastapi | 8 | 3/5 | 60% | 186.3s | 189.6s |
| gin-gonic/gin | 1 | 3/5 | 60% | 218.6s | 248.1s |
| gin-gonic/gin | 4 | 5/5 | 100% | 183.0s | 183.0s |
| gin-gonic/gin | 6 | 4/5 | 80% | 174.7s | 176.2s |
| gin-gonic/gin | 8 | 2/5 | 40% | 164.4s | 184.7s |
| golang/example | 1 | 5/5 | 100% | 244.8s | 244.8s |
| golang/example | 4 | 4/5 | 80% | 163.9s | 179.4s |
| golang/example | 6 | 2/5 | 40% | 107.6s | 178.6s |
| golang/example | 8 | 4/5 | 80% | 184.1s | 187.2s |
| jquery/jquery | 1 | 3/5 | 60% | 303.1s | 282.9s |
| jquery/jquery | 4 | 4/5 | 80% | 198.5s | 209.9s |
| jquery/jquery | 6 | 4/5 | 80% | 192.2s | 192.7s |
| jquery/jquery | 8 | 3/5 | 60% | 194.0s | 194.4s |
| karpathy/nanogpt | 1 | 4/5 | 80% | 235.4s | 249.3s |
| karpathy/nanogpt | 4 | 1/5 | 20% | 147.1s | 173.5s |
| karpathy/nanogpt | 6 | 4/5 | 80% | 166.4s | 174.3s |
| karpathy/nanogpt | 8 | 4/5 | 80% | 178.6s | 183.4s |
| lodash/lodash | 1 | 4/5 | 80% | 234.8s | 247.4s |
| lodash/lodash | 4 | 2/5 | 40% | 158.6s | 175.9s |
| lodash/lodash | 6 | 2/5 | 40% | 156.9s | 172.2s |
| lodash/lodash | 8 | 3/5 | 60% | 174.3s | 179.4s |
| pallets/flask | 1 | 4/5 | 80% | 265.2s | 266.9s |
| pallets/flask | 4 | 4/5 | 80% | 185.1s | 185.7s |
| pallets/flask | 6 | 4/5 | 80% | 175.1s | 185.0s |
| pallets/flask | 8 | 4/5 | 80% | 186.1s | 186.4s |
| redis/redis | 1 | 3/5 | 60% | 313.7s | 315.8s |
| redis/redis | 4 | 2/5 | 40% | 186.1s | 213.3s |
| redis/redis | 6 | 3/5 | 60% | 169.5s | 191.4s |
| redis/redis | 8 | 3/5 | 60% | 189.9s | 192.2s |
| rust-lang/rustlings | 1 | 2/5 | 40% | 285.7s | 267.3s |
| rust-lang/rustlings | 4 | 2/5 | 40% | 184.8s | 178.6s |
| rust-lang/rustlings | 6 | 3/5 | 60% | 170.6s | 199.5s |
| rust-lang/rustlings | 8 | 2/5 | 40% | 164.0s | 193.8s |
| spring-projects/spring-petclinic | 1 | 3/5 | 60% | 314.2s | 285.0s |
| spring-projects/spring-petclinic | 4 | 4/5 | 80% | 191.4s | 190.1s |
| spring-projects/spring-petclinic | 6 | 3/5 | 60% | 178.1s | 189.1s |
| spring-projects/spring-petclinic | 8 | 4/5 | 80% | 184.6s | 196.0s |
| vuejs/core | 1 | 3/5 | 60% | 236.1s | 245.4s |
| vuejs/core | 4 | 4/5 | 80% | 171.3s | 181.2s |
| vuejs/core | 6 | 4/5 | 80% | 163.5s | 181.5s |
| vuejs/core | 8 | 2/5 | 40% | 134.9s | 200.8s |

DONE
