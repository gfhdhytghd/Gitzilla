<p align="center"><img src="brand/gitzilla-lockup.png" alt="Gitzilla" width="720"></p>

# GITZILLA

> Your GitHub repository is a living monster. Now make it fight.

**Bring your repo. Tilt your phone. Survive the merge.** Gitzilla turns GitHub repositories into pixel-art fighters and bosses. A heavily imported file becomes a monster's heart, a component becomes a breakable limb, and a dependency cycle becomes a weak point. Everyone joins from their phone and uses it as a motion controller.

- **Play:** https://gitzilla.wilflin.me (the live server runs on Vultr)
- **Guided demo slides:** https://gitzilla.wilflin.me/demo
- Built at HackPSU Fall 2026.

## Three modes

### PvP royale (the rivalry)
- **Players and rules:** 2–8 repository-powered fighters, no respawns, and a shrinking **GC sweep** zone. The last hero standing wins.
- **Sign-in and eligibility:** each human signs in with GitHub through **Auth0**. The server verifies repository ownership through the GitHub API (own non-fork repo, or a public repo you maintain) and rechecks it at match start.
- **Repo Power** turns measured repository signals into bounded combat stats:
  - 60% code-quality heuristics: tests, modularity, cohesion, docs, cycle/debt hygiene;
  - 40% log-scaled reach: stars, contributors, analyzed source size, commits.

  It's an explainable game mechanic, not a universal quality grade.
- **Results:** placements, KOs and damage, a git-log kill feed, a royale wins board, and optional **signed match receipts** (see [Solana](#solana-signed-receipts-and-a-tamper-evident-leaderboard)).
- **Bots:** they fill seats for practice and are tagged "AI −20%".

### Co-op raid (dismantle the architecture)
- **The boss is another repo's architecture:**
  - its limbs are the top components;
  - its heart is the most-imported file;
  - circular dependencies (Tarjan SCC) glow as weak points.
- **Attacks come from specific components**, so breaking a limb removes its attack.
- **Bosses:** four archetypes, rendered across nine body plans and seven element themes.
- **Heroes:** they keep an equal 5-point stat budget.
- **Autopsy:** shows the dead boss as a git diff of its broken components, and "Adopt an Organ" links to maintainers and open issues.

### Classroom (code together, improve together)
- **The lesson:**
  - a teacher hosts up to 30 students and publishes ordered coding tasks with timers, rubrics and evidence checks;
  - **nine Python presets** (variables → conditions → loops → lists → functions → dict) come with starter code and self-checks;
  - students code in an **in-browser Python editor** with no setup, or submit a GitHub revision.
- **Task cards:** each task shows a goal, to-dos, "done when" checks that tick ✓/✗, the expected output, and staged hints.
- **Class attack:** submissions attack one shared boss. **Only improvement deals new damage**, so unchanged code can't farm points. The boss's HP is budgeted across the whole lesson.
- **Teacher debriefs** after each round and each lesson show participation, the hardest checks, what to reteach, who needs help, and shout-outs.
  - The projector shows class aggregates only, never struggling students' names.
  - Exports are CSV and Markdown.
- **What checks inspect:** file and literal checks read the bounded source archive; they never execute student code on the server. CI checks require a successful GitHub check run for that exact commit.

## Controls

- **Phone motion:**
  - tilt to move (follows the screen in any orientation, iPhone and iPad);
  - tap or flick to attack;
  - swipe, or tilt ≥ 50°, to dash;
  - move the phone in a circle (keeping it upright) or hold for your skill.

  A training flow teaches each gesture.
- **Fallbacks:** touch-only (drag / tap / double-tap / hold), a seated profile, and keyboard + mouse on desktop.
- **Phone as gamepad:** sign in with the same GitHub account on your phone and on a big screen or Vision Pro. The phone becomes the controller for that seat.
- **Big screen:** `?screen=1` gives a spectator display with a join QR code.

## 2D, 3D and Apple Vision Pro

- **Settings → View → 2D | 3D.** The 3D view is a Three.js/WebGL diorama:
  - pixel-art heroes and bosses become **voxel-extruded** sprites with real depth and lighting;
  - shots fly at chest height with shadows;
  - the zone is a glowing wall.
- **In Safari on Apple Vision Pro,** WebXR immersive VR places the live arena on a world-pinned virtual tabletop. A linked phone is the controller, and the headset is detected automatically.
  - A floating HUD shows boss HP and phase.
  - On victory, the boss dissolves into voxels, the table turns into a blue screen, and a pinch continues to the autopsy.
- **Testing and limits:** the team played it on a real Vision Pro. Vision Pro Safari offers VR only (no passthrough). AR placement is enabled only on runtimes that support it.

## Solana: signed receipts and a tamper-evident leaderboard

- **Signed match receipts.** Eligible PvP royales (at least two signed-in humans, public repos only) give each player a downloadable **Ed25519-signed receipt** of their result. No wallet is needed to play or to download it.
- **Optional on-chain anchor.** The player signs a message with Phantom or Solflare. Gitzilla sponsors one **Solana devnet Memo** transaction carrying the receipt ID and a **salted SHA-256 digest**: no names, repos or code go on-chain.
  - **Verified live:** our first anchor is [finalized on devnet at slot 514,986,981](https://explorer.solana.com/tx/3878L2WVAYBM5qUndpuKxaDn1YW4G5HRJC2FZU1FMVK1VUxg2tXY1CBb3z8xhCuheUUnAr2pdM8SLidc2P9dz4Qz?cluster=devnet), from a real two-player royale.
- **"⛓ Verified on Solana" board.** The Hall of Monsters has player and project standings from qualifying royales.
  - Every snapshot is hashed into a **Merkle tree**, and its root is anchored in one devnet Memo.
  - Each row has a **verify** button that checks its inclusion proof in the browser against that root.
  - **Verified live:** the board's first populated snapshot is [finalized at slot 514,999,427](https://explorer.solana.com/tx/5dU8wxmXmbJnk2kTZbfhgUi3mMHGdU8Xb3aZBTX61B7HvZH1Pui9VVjBtRMTBhX7HQC3iEx2kFZJ1eSKdxf3xAVx?cluster=devnet).
  - Rows backfilled from earlier receipts are project rows only, because historical receipts carry no player identity. Player rows are recorded for matches from launch onward.
- **What it proves.** Receipts and roots attest to the game server's recorded results and make that history tamper-evident: it can't be quietly rewritten after anchoring. They don't independently prove fair gameplay.
- Design notes: [docs/design/solana-receipts.md](docs/design/solana-receipts.md).

## How it's built

- **Authoritative multiplayer.** Node.js simulates at 30 Hz and sends WebSocket snapshots at 20 Hz.
  - The server validates inputs, acknowledges sequences, and releases stale controls after 300 ms.
  - It arbitrates linked phone/display input and recovers from reconnects and restarts.
  - Clients play back on an adaptive clock that absorbs network jitter.
- **Real code analysis.** Bounded repository tarballs are parsed in memory. Import graphs are built across 9 languages, and Tarjan SCC finds cycles.
- **Gemini with guardrails.** For public repos, Gemini returns schema-constrained names, epithets, taunts and art direction, which local code validates and renders.
  - Gemini never sets combat stats or drives the boss AI.
  - If Gemini is unavailable, the game falls back to DeepSeek, then to deterministic designs.
  - Private/credentialed analyses skip generative art.
- **Hosting on Vultr.** The live game server, WebSockets, classroom engine and receipt/leaderboard storage (SQLite) run on our Vultr instance as a dedicated systemd service.
  - Deploys are immutable git revisions with state backups, a fresh-process health check, and automatic rollback.
- **Safety and access:**
  - no full-screen flashes (WCAG 2.3.1, checked by an automated frame sampler);
  - four UI languages: English, Simplified Chinese, Spanish and French;
  - host kick and ownership transfer.

| Directory | What it does |
| --- | --- |
| `shared/` | Typed contracts shared by every module |
| `server/` | HTTP + WebSocket rooms, authoritative sim loop, classroom engine, receipts and chain board |
| `analysis/` | Repo tarball → import graph (9 languages), heart, components, cycles; repo suggestions |
| `sim/` | Repo → kit derivation, game rules, boss AI, headless bot balance runner |
| `design/` | Gemini structured art direction, cache and fallbacks |
| `auth/` | Auth0 GitHub sign-in; tokens stay server-side |
| `client/` | Canvas + Three.js renderers, WebXR, phone motion input, WebAudio, UI, `/demo` deck |
| `tools/` | Playwright playtests, motion/XR/flash checks, deploy scripts |

## Run it

```sh
npm install
npm run dev          # http://localhost:5173 (server + client + WebSocket on one port)
npm run dev:https    # self-signed HTTPS for phones on the LAN (iOS needs a secure context for motion)
npm test             # vitest
npm run typecheck
npx tsx tools/playtest.ts --players 4   # end-to-end browser playtest
```

Open `/`, create a room, and have friends join at `/r/<ROOM>`. For a local session, set `PUBLIC_URL` to an origin the phones can reach. Phone motion needs trusted HTTPS.

Optional environment variables (`.env`, gitignored):

| Variable | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | Higher GitHub API limits; also used for live "rising repos" suggestions |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Gemini-designed heroes and bosses |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | Fallback design provider |
| `PUBLIC_URL` | Public origin for join links and QR codes |
| `AUTH0_DOMAIN` / `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` / `AUTH0_COOKIE_SECRET` | Auth0 application with a GitHub social connection |
| `AUTH0_MGMT_CLIENT_ID` / `AUTH0_MGMT_CLIENT_SECRET` / `AUTH0_CONNECTION` | Server-side Management API access for GitHub identity tokens |
| `SOLANA_RECEIPTS_ENABLED` / `SOLANA_RECEIPTS_DIR` | Signed receipts + devnet anchoring; a private, backed-up state directory |
| `HTTPS_KEY` / `HTTPS_CERT` | Your own TLS certificate |

Fifteen famous repos are pre-analyzed in `data/fallback/` for offline raids and practice. PvP always needs live GitHub sign-in and eligibility checks.

## HackPSU entries

**HackPSU main competition, General Track: The Mystery Stack, Nittany AI Challenge, MLH Best Use of Gemini API, Auth0, Vultr, Solana, DEV Writing, and the SpaceXSI A-Team raffle.** These are entry targets, not awards.

- **Mystery Stack:** our demonstration has at least four real people with their own phones, using motion controls in the same royale.
- **Development workflow:** the team used Cursor and Grok Bot, alongside Claude Code and Codex, with Vitest and Playwright for verification.
