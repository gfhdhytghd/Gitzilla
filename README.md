<p align="center"><img src="brand/gitzilla-lockup.png" alt="Gitzilla" width="720"></p>

# Gitzilla

> Your GitHub repository is a living monster. Now make it fight.

**Bring your repo. Tilt your phone. Survive the merge.** Gitzilla turns GitHub repositories into pixel-art fighters: bring four friends, use your phones as motion controllers, and compete until one hero remains.

Built for HackPSU Fall 2026. The judging demo targets **4–8 people playing PvP royale together**; the game also supports smaller practice matches, cooperative boss raids, and a separate classroom workflow. Four browser clients or bots are not proof of four people using phone motion together.

## The rivalry

1. Create a room and share its QR code. For PvP, each player connects GitHub through Auth0 and selects an eligible repository: their own non-fork repo, or a public repo they maintain/administer.
2. Enable motion on each phone. **Tilt to move, swing/flick to attack, twist to dash, and spin for a skill.** Touch alternatives and a seated profile are available; the mystery-track demonstration should visibly use motion throughout play.
3. Fight in a **2–8 player free-for-all** with equal stat budgets, no respawns, and a shrinking **GC sweep** zone. The last hero standing wins. Results show placements, KOs and damage; a royale wins board supplies the bragging rights.

For judging, use at least **four real participants with four phones**, no bot substitutes, and a shared spectator display. The current server permits smaller matches; it does not enforce the mystery track's four-person condition. Physical-phone acceptance remains a demo requirement, not a claim established by the automated suite.

## What makes it Gitzilla

- **Your repo is your hero.** The language decides your class and weapon (Rust cannon, Go SMG, Python staff…). The repo's shape decides your skill. Every repo gets the same stat budget, so a huge repo doesn't automatically win.
- **In co-op raids, the boss is the repo's architecture.** This is an additional mode, not the rivalry demo.
  - Its limbs are the top components, and you can break them off one at a time.
  - The heart is the most-imported file.
  - Circular dependencies glow red as weak points.
  - Its attacks (`rm -rf /`, Merge Conflict, Segfault Storm…) come from the component that sources each one. Break the limb and that attack is gone.
- **Play on anything.** On a desktop, use the keyboard and mouse. On a phone, tilt to move, swing or tap to attack, twist to dash, and spin or hold for your skill. Drag, tap, and hold are the touch fallback. Players join by scanning the QR code.
- **Source-grounded Gemini art direction.** The server can send public-repo structure, README excerpts and extracted code identifiers to the Gemini API for schema-constrained character design, names and taunts. Local code validates the result and renders the pixel art; Gemini does not decide combat stats or drive the real-time boss AI. Runtime generation can fall back to DeepSeek, then deterministic designs. Bundled designs currently declare `fallback` provenance; loading one is not evidence of a Gemini call. Private/credentialed analyses bypass generative design.
- **A game you can explain by playing.** Repo-derived weapons, terminal jokes, procedural pixel art and a chiptune soundtrack make code tangible. Raid autopsies show broken components; royale results show who survived. Bots support practice, but do not count toward the four-person judging demonstration.

## HackPSU targets and evidence

We are targeting **Grand Prize first place**, **General Track: The Mystery Stack**, and **Nittany AI**, with Gemini and Auth0 as integrations within the same project. SpaceXSI is a separate workflow raffle. These are entry targets, not awards or confirmed eligibility.

| Target | Project connection | Evidence still needed for submission |
| --- | --- | --- |
| Grand Prize — $2,000 first place | A complete multiplayer experience combining repo analysis, motion input and authoritative gameplay | A concise live demo, readable phone UI, real-user observations, and an honest account of what we learned |
| Mystery Stack — $1,500 | One session combining core phone motion, direct rivalry, bragging rights and at least four people | Record four humans playing the same royale with motion controls; the revealed requirements were supplied by our team and are not detailed on the public overview |
| Nittany AI Challenge | AI turns unfamiliar public code into personalized, playful characters; classroom tools provide a separate educational extension | Show a real AI output changing the experience and gather user feedback; improved learning outcomes have not been established |
| Best Use of Gemini API | Team confirms Gemini API usage; code implements source-grounded, structured character/flavor generation | Capture model/provider provenance and visible output for judges; distinguish live, cached, DeepSeek and deterministic output |
| Best Use of Auth0 | Team confirms Auth0 usage; GitHub sign-in supports server-side identity/repository eligibility for PvP | Demonstrate sign-in, four distinct GitHub users, and rejection of an ineligible repo; automated identity fixtures are not live OAuth proof |
| SpaceXSI A-Team raffle | Team confirms using Cursor and Grok Bot to code the project | Describe the concrete Cursor and Grok Bot workflow in Devpost, identify the bot automation used, and opt in to the raffle; the published requirement specifies Cursor as the core coding agent |

See the [research, harsh review and prioritized demo plan](docs/hackathon-strategy.md) for gaps, previous winners, acceptance criteria and pitch rehearsal. Prize details and submission requirements: [official Devpost overview](https://hackpsu-fall-2026.devpost.com/) and [rules](https://hackpsu-fall-2026.devpost.com/rules). Whether these awards can all stack still needs organizer confirmation.

## Run it

```sh
npm install
npm run dev          # http://localhost:5173 (server + client + WebSocket on one port)
npm run dev:https    # self-signed HTTPS for phones on the LAN (iOS needs a secure context for motion)
```

Open `/`, create a room, and have friends join at `/r/<ROOM>`. Add `?screen=1` for a big-screen spectator view with a QR code.

`npm run dev` currently defaults `PUBLIC_URL` to the hosted demo. For a local session, explicitly set `PUBLIC_URL` to the origin participants can actually reach, so QR codes join the intended server. For phone motion, use trusted HTTPS; a self-signed certificate needs device trust setup. Browser permission must be granted from a user gesture and followed by actual sensor readings.

Optional environment variables, set in `.env` (gitignored):

| Variable | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | Higher GitHub API rate limits for repo analysis |
| `GEMINI_API_KEY` | Gemini-designed heroes and bosses (`GEMINI_MODEL` overrides the model) |
| `PUBLIC_URL` | Public origin used in join links and QR codes |
| `HTTPS_KEY` / `HTTPS_CERT` | Use your own TLS certificate |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | Optional alternative design provider; not Gemini evidence |
| `AUTH0_DOMAIN` / `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` | Auth0 application with GitHub social connection |
| `AUTH0_COOKIE_SECRET` | Dedicated session-cookie encryption secret |
| `AUTH0_MGMT_CLIENT_ID` / `AUTH0_MGMT_CLIENT_SECRET` | Server-side Management API application for GitHub identity tokens |
| `AUTH0_CONNECTION` | Social connection name, default `github` |

Auth0 callback/logout origins must match the demo origin; see the [Auth0 implementation notes](docs/progress/claude-auth.md). Keep credentials server-side and out of recordings.

Fifteen famous repos (React, Vue, Flask, Django, ripgrep, Redis…) are pre-analyzed in `data/fallback/` for offline raid/practice data. **PvP still needs live GitHub authentication and eligibility verification**; those fallback profiles do not make the full PvP join flow offline-capable.

## How it's built

| Directory | What it does |
| --- | --- |
| `shared/` | Typed contracts shared by every module |
| `server/` | Node HTTP + Vite middleware + WebSocket rooms; authoritative 30 Hz sim, 20 Hz snapshots |
| `analysis/` | Downloads a repo tarball and builds an import graph across 9 languages (heart, components, cycles via Tarjan SCC) |
| `sim/` | Repo → kit derivation, game rules, utility-AI boss, headless bot balance runner |
| `design/` | Gemini structured-output art direction, with cache and offline fallbacks |
| `hall/` | Hall of Monsters leaderboard |
| `auth/` | Auth0/GitHub sign-in and server-side tokens; required by PvP repository verification |
| `client/` | Canvas renderer (procedural pixel art for heroes, bosses and arenas), input, WebAudio chiptune, UI |
| `tools/` | Playwright end-to-end playtest harness |

```sh
npm test             # vitest
npm run typecheck
npx tsx sim/bots.ts 3            # balance sweep: bots vs every fallback boss
npx tsx tools/playtest.ts --players 4   # end-to-end browser playtest with screenshots
```

The team uses **Cursor and Grok Bot** to code the project (team-confirmed), alongside Claude Code and Codex agent workflows. The Devpost workflow description should explain each tool's actual contribution, including Grok Bot automation, for the SpaceXSI raffle.

## Classroom mode

Choose **classroom: code together, raid together** on the landing page. The teacher publishes 1–12 ordered coding tasks, each with instructions, a timer, its own rubric and optional evidence checks. Students join the four-letter room, work in their own editor, push to GitHub and submit a branch/tag/commit. Each grade pins the resolved commit; detailed feedback goes to that student and the teacher.

The teacher pauses/extends coding, reviews functionality, then launches a 10-second automatic class attack. The projector shows a ranked roster and one shared Boss. Retry the task to improve the score or open the next task; unchanged scores cannot farm damage. Export frozen attack-round results as CSV or Markdown. New classrooms support 30 students and run no arena or motion-control loop. This workflow does not demonstrate the mystery track's motion requirement.

Evidence checks use `file: README.md`, `contains: src/main.py :: def calculate`, or `ci: unit-tests`. File/literal checks inspect the bounded source archive; they do not execute code. CI checks require a successful GitHub check run for that exact commit. Connect GitHub for private repositories and higher provider quotas. After a server restart, aggregate results are restored and coding is paused; detailed feedback requires resubmission. See [design and acceptance](docs/design/classroom-raid.md).

The teacher editor includes [nine Python preset lessons](docs/curriculum/python-basics.md): output/variables, numbers/input, strings, conditions, `for`, `while`, lists/tuples, functions, and `dict`. Each has three editable tasks, runnable starter-file downloads, self-check cases and teacher guidance. Selecting a preset previews it; **Load lesson** replaces only the unpublished draft.

## PvP implementation status

Choose **PvP royale** for a 2–8 player elimination match. Every human connects a different GitHub account and selects an eligible repository; the server rechecks eligibility at match start. Royale uses direct controls and balanced hero kits, with no Boss or classroom quiz. Bots are permitted for practice. See the [current royale specification](docs/tasks/pvp-royale.md). The [older duel design](docs/design/pvp-duel.md) describes the superseded two-player format, not current royale rules.

## Languages and AI providers

The interface and Python presets support English, Simplified Chinese, Spanish and French. Only the classroom Host can change the room language; students follow it automatically. Official lesson templates translate while teacher edits and executable starter code are preserved.

Translations are generated through Gemini via AGY, with DeepSeek as the configured fallback. Runtime appearance generation also falls back from Gemini to DeepSeek, then to deterministic artwork if both fail. See [localization and provider configuration](docs/design/i18n.md).
