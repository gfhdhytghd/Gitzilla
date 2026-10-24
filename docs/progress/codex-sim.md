DONE — codex-sim

Implemented the complete authoritative gameplay card in `sim/`. Four-player balance target met in the final 135-match headless sweep: **30/45 wins (66.7%), mean successful fight 165.8 seconds**.

## Delivered
- `sim/index.ts`: required profile→kit / createMatch / Match exports, plus weapon tuning and pure boss-region geometry.
- `kits.ts`: equal five-point player stat budget redistributed by repo shape, all language weapon classes, shape-selected skills, language/seed palettes, themed named bosses, component limbs/weak points, eight graph-derived attack kinds, player-count HP scaling, actual `BossKit.heart`.
- `match.ts`: deterministic 30Hz-compatible substeps; countdown; walls; movement; auto-aim; all seven weapons; energy; dash/i-frames; five skills; armor damage/regen; proximity revives; limb/heart collision; combos; limb break interruption; phases; heart shield/last stand; projectiles; sweeping lasers; slams/cascades; charge; bugs; events; detached snapshots; autopsy/MVP.
- `bossAi.ts`: seeded utility decisions, threat/weak-player/cluster targeting, >=0.6s casting telegraphs, cooldowns, enrage pacing, broken-source exclusion and surviving heart patterns.
- `bots.ts`: deterministic ordinary-input bots that move, dodge, shoot, use skills and revive; 1/4/8-player runner loads every on-disk fallback profile, or ten synthetic fixtures if none exist.
- `match.test.ts`: 16 gameplay tests. `sim/README.md`: integration details, balance knobs, commands and evidence boundaries.

## Contract requests / coordinator changes
- **None outstanding.** Applied coordinator-required `BossKit.heart` directly from analyzed file path.
- `BossState.regions` contains absolute arena coordinates for every limb, including broken ones, plus id `heart`. Recomputed after boss movement each tick. Renderer must anchor anatomy to these snapshot regions.
- `bossRegions` returns the complete deterministic region layout; collision/auto-aim internally filter broken limbs through `activeBossRegions`.
- No edits to `shared/`; no edits to other implementation owners' directories; no git commits; no dependencies added.

## Verification
- Focused sim suite: **16/16 PASS**.
- Scoped strict TypeScript check including sim, bot runner and tests: **PASS** (`npx tsc --noEmit --target ES2023 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --allowImportingTsExtensions --types node sim/index.ts sim/bots.ts sim/match.test.ts`).
- Latest full `npm test`: **90 PASS, 2 SKIP**, 11 files passed / 1 skipped. Skipped tests are elsewhere in the shared workspace.
- Latest `npm run typecheck`: blocked only by teammate-owned `client/app/main.ts` imports `./autopsy` and `./game` not existing yet; no sim diagnostics. Earlier full check passed before UI work began.
- `npm run dev`: server started on 5173. Existing shared development server remains running for integration.
- Real-module `npx tsx server/smoke.ts`: **PASS**, 4 real WS clients, 99 snapshots each over five seconds on the latest run (100 each on earlier runs); fallback and QR endpoints pass.
- Phone/human playtest and full visual acceptance: **PENDING**; bot win rates do not prove human difficulty.

## Final balance
- Run: `npx tsx sim/bots.ts 3`, 15 real fallback bosses × 3 trials × 1/4/8 players = **135 matches**. Final sweep rerun after the last gameplay change.
- 1 player: **33/45 wins (73.3%)**, successful fights **229.1s** on average.
- 4 players: **30/45 wins (66.7%)**, successful fights **165.8s** on average — meets BRIEF 60–70% / 150–210s target.
- 8 players: **45/45 wins (100%)**, successful fights **127.3s** on average. Large groups are intentionally forgiving for the hackathon demo; the stated target is for four players.
- Solo assist: 1.65× weapon damage and boss hits of 2 instead of 5 compensate for absent combos/revives. All repos within a given team size retain the same stat budget.
- Boss base HP 13200; generated bullets 54–70 px/s; generated telegraphs >=0.85s; armor recovery after 3s without damage, one point each 1.5s; hotfix heals 2 within 76px every 22s.
- Initial synthetic sweep found 100% wins / 40–51s squad fights; HP, attack pressure, armor recovery and healing were tuned to the final result below. No bots receive artificial damage, health or victory overrides.

| Boss | Players | Wins | Win rate | Mean duration | Mean win |
| --- | ---: | ---: | ---: | ---: | ---: |
| burntsushi/ripgrep | 1 | 0/3 | 0% | 99.7s | 0.0s |
| burntsushi/ripgrep | 4 | 1/3 | 33% | 98.4s | 184.9s |
| burntsushi/ripgrep | 8 | 3/3 | 100% | 139.3s | 139.3s |
| django/django | 1 | 2/3 | 67% | 205.0s | 202.4s |
| django/django | 4 | 2/3 | 67% | 153.6s | 151.4s |
| django/django | 8 | 3/3 | 100% | 121.6s | 121.6s |
| expressjs/express | 1 | 3/3 | 100% | 243.8s | 243.8s |
| expressjs/express | 4 | 3/3 | 100% | 169.7s | 169.7s |
| expressjs/express | 8 | 3/3 | 100% | 125.9s | 125.9s |
| facebook/react | 1 | 2/3 | 67% | 202.7s | 208.3s |
| facebook/react | 4 | 3/3 | 100% | 158.5s | 158.5s |
| facebook/react | 8 | 3/3 | 100% | 121.9s | 121.9s |
| fastapi/fastapi | 1 | 3/3 | 100% | 229.0s | 229.0s |
| fastapi/fastapi | 4 | 3/3 | 100% | 172.9s | 172.9s |
| fastapi/fastapi | 8 | 3/3 | 100% | 129.7s | 129.7s |
| gin-gonic/gin | 1 | 3/3 | 100% | 230.3s | 230.3s |
| gin-gonic/gin | 4 | 1/3 | 33% | 111.1s | 170.0s |
| gin-gonic/gin | 8 | 3/3 | 100% | 128.8s | 128.8s |
| golang/example | 1 | 2/3 | 67% | 221.9s | 235.9s |
| golang/example | 4 | 1/3 | 33% | 112.1s | 175.6s |
| golang/example | 8 | 3/3 | 100% | 136.8s | 136.8s |
| jquery/jquery | 1 | 2/3 | 67% | 222.8s | 227.3s |
| jquery/jquery | 4 | 1/3 | 33% | 169.7s | 165.6s |
| jquery/jquery | 8 | 3/3 | 100% | 127.9s | 127.9s |
| karpathy/nanogpt | 1 | 3/3 | 100% | 218.8s | 218.8s |
| karpathy/nanogpt | 4 | 2/3 | 67% | 158.6s | 162.5s |
| karpathy/nanogpt | 8 | 3/3 | 100% | 119.9s | 119.9s |
| lodash/lodash | 1 | 1/3 | 33% | 163.5s | 240.0s |
| lodash/lodash | 4 | 2/3 | 67% | 121.2s | 166.0s |
| lodash/lodash | 8 | 3/3 | 100% | 126.3s | 126.3s |
| pallets/flask | 1 | 3/3 | 100% | 231.5s | 231.5s |
| pallets/flask | 4 | 3/3 | 100% | 172.2s | 172.2s |
| pallets/flask | 8 | 3/3 | 100% | 127.5s | 127.5s |
| redis/redis | 1 | 3/3 | 100% | 268.8s | 268.8s |
| redis/redis | 4 | 1/3 | 33% | 171.5s | 183.0s |
| redis/redis | 8 | 3/3 | 100% | 139.1s | 139.1s |
| rust-lang/rustlings | 1 | 2/3 | 67% | 231.7s | 230.8s |
| rust-lang/rustlings | 4 | 2/3 | 67% | 171.7s | 176.4s |
| rust-lang/rustlings | 8 | 3/3 | 100% | 128.5s | 128.5s |
| spring-projects/spring-petclinic | 1 | 2/3 | 67% | 201.9s | 220.1s |
| spring-projects/spring-petclinic | 4 | 3/3 | 100% | 155.4s | 155.4s |
| spring-projects/spring-petclinic | 8 | 3/3 | 100% | 117.7s | 117.7s |
| vuejs/core | 1 | 2/3 | 67% | 185.0s | 202.0s |
| vuejs/core | 4 | 2/3 | 67% | 135.2s | 148.1s |
| vuejs/core | 8 | 3/3 | 100% | 118.9s | 118.9s |
1 players: 33/45 wins (73.3%), mean successful fight 229.1s
4 players: 30/45 wins (66.7%), mean successful fight 165.8s
8 players: 45/45 wins (100.0%), mean successful fight 127.3s
