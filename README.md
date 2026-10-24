<p align="center"><img src="brand/gitzilla-lockup.svg" alt="Gitzilla" width="720"></p>

# Gitzilla

> Your GitHub repository is a living monster. Now make it fight.

Gitzilla is a co-op pixel-art boss fight for 4+ players, built in 24 hours at HackPSU. Each player summons a hero from **their own GitHub repo**, and the room owner turns **another repo** into an AI-controlled boss Kaiju. The boss is a weird, tentacled code monster whose body is that repo's architecture. Squad up and take it down, Soul Knight boss-room style.

- **Your repo is your hero.** The language decides your class and weapon (Rust cannon, Go SMG, Python staff…). The repo's shape decides your skill. Every repo gets the same stat budget, so a huge repo doesn't automatically win.
- **The boss is the repo's architecture.**
  - Its limbs are the top components, and you can break them off one at a time.
  - The heart is the most-imported file.
  - Circular dependencies glow red as weak points.
  - Its attacks (`rm -rf /`, Merge Conflict, Segfault Storm…) come from the component that sources each one. Break the limb and that attack is gone.
- **Play on anything.** On a desktop, use the keyboard and mouse. On a phone, tilt to move, swing or tap to attack, twist to dash, and spin or hold for your skill. Drag, tap, and hold are the touch fallback. Players join by scanning the QR code.
- **Gemini art direction (optional).** Gemini designs each hero's and boss's look, names and taunts from the repo's README and structure. It never touches stats. Without a key, the designs fall back to deterministic ones.
- **Extras.** AI teammates fill out small squads. A chiptune soundtrack changes with the arena theme and the boss phase. An autopsy screen shows which real modules died, and a Hall of Monsters leaderboard tracks the best runs.

## Run it

```sh
npm install
npm run dev          # http://localhost:5173 (server + client + WebSocket on one port)
npm run dev:https    # self-signed HTTPS for phones on the LAN (iOS needs a secure context for motion)
```

Open `/`, create a room, and have friends join at `/r/<ROOM>`. Add `?screen=1` for a big-screen spectator view with a QR code.

Optional environment variables, set in `.env` (gitignored):

| Variable | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | Higher GitHub API rate limits for repo analysis |
| `GEMINI_API_KEY` | Gemini-designed heroes and bosses (`GEMINI_MODEL` overrides the model) |
| `PUBLIC_URL` | Public origin used in join links and QR codes |
| `HTTPS_KEY` / `HTTPS_CERT` | Use your own TLS certificate |

Fifteen famous repos (React, Vue, Flask, Django, ripgrep, Redis…) are pre-analyzed in `data/fallback/`, so a match can start even when the venue Wi-Fi is down.

## How it's built

| Directory | What it does |
| --- | --- |
| `shared/` | Typed contracts shared by every module |
| `server/` | Node HTTP + Vite middleware + WebSocket rooms; authoritative 30 Hz sim, 20 Hz snapshots |
| `analysis/` | Downloads a repo tarball and builds an import graph across 9 languages (heart, components, cycles via Tarjan SCC) |
| `sim/` | Repo → kit derivation, game rules, utility-AI boss, headless bot balance runner |
| `design/` | Gemini structured-output art direction, with cache and offline fallbacks |
| `hall/` | Hall of Monsters leaderboard |
| `auth/` | Optional "Connect GitHub" through Auth0, to pick your own repos instead of pasting a link |
| `client/` | Canvas renderer (procedural pixel art for heroes, bosses and arenas), input, WebAudio chiptune, UI |
| `tools/` | Playwright end-to-end playtest harness |

```sh
npm test             # vitest
npm run typecheck
npx tsx sim/bots.ts 3            # balance sweep: bots vs every fallback boss
npx tsx tools/playtest.ts --players 4   # end-to-end browser playtest with screenshots
```

Built with Claude Code coordinating a team of Claude and Codex agents.
