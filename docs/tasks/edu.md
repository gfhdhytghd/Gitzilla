# EDUCATION MODE = CLASSROOM PvP  (user, latest — SUPERSEDES the boss-based edu design below where they conflict)
User: "for education mode, I want everyone a hero with larger pixel range and fight with each other, weaker balance
here, just depend on the repo for how strong each is. For use in CS classrooms."

The lesson IS the balance: better-engineered code makes a stronger hero, and every stat says why.
- **No boss.** All students' heroes fight each other in a free-for-all arena, best of 3 rounds (~75s each). The teacher
  (room owner) runs it from the projector (?screen=1) and doesn't have to play. 2–30 players (class size!): arena and
  spawns scale; >8 players → bigger arena or a camera on the big screen; keep 30 heroes performant.
- **Bigger, higher-detail heroes** (`heroScale: 2`): edu heroes use a 2x-resolution sprite (~32x40) with room for
  readable code details (cape snippet legible, emblem, weapon etching). Hitboxes scale; the camera zooms out.
- **Stats from code quality, not equal budget** (`PlayerKit.quality: QualityStat[]`, each with grade A–F, the real
  signal, and a concrete tip). Mapping (tune ranges so best/worst differ ~2–2.5x, never one-shot):
  - armor (`try/catch`) ← test ratio / presence of a test dir
  - hp ← project size (log LOC, capped so a huge repo isn't a tank) + has README
  - speed ← modularity (low coupling: avg fan-out, max dependency depth)
  - damage ← cohesion (functions per file in a healthy range, avg function length; giant functions hurt)
  - energy/regen ← documentation (comment ratio, README length)
  - weakness ← circular dependencies (take +X% damage) and TODO/FIXME/HACK density ("tech debt": periodic slow)
  Students see this as a REPORT CARD in the lobby and the autopsy: "armor C — tests are 6% of files. Tip: add tests for
  utils/parser.py to raise it."
- **Rounds & quiz:** between rounds a 15s quiz on the projector + phones about a classmate's repo (e.g. "Whose project has
  a circular dependency?", "Which file is the heart of @ana's repo?"); right answers → a small buff next round.
- **Lessons:** lesson cards fire on PvP events with real data ("@ben's hit you for 18 — his `parser` module has 0 cycles:
  damage grade A"). The autopsy is a class ranking + per-student report card + "biggest improvement tips" + glossary.
- **Social impact:** "Adopt an Organ" stays in BATTLE mode (real OSS repos). Inclusive motion (#4) applies everywhere.
  OSV parasites stretch: in edu, show known-vuln dependencies as a report-card line ("dependency X has a known advisory,
  upgrade to ≥ Y").

## Owners (edu PvP)
- codex-sim: `playerKitFromProfile(p, { mode: "edu" })` → quality stats + QualityStat[]; PvP match (no boss, FFA,
  friendly fire = the point, respawn after KO within a round with 2s invuln, rounds/scoring/leader, weakness effects);
  heroScale 2 hitboxes; arena size scales with player count; quiz between rounds about players' repos; lesson events.
  Bot sweep sanity: strong-quality repos win more but a C-grade repo still lands KOs. Autopsy ranking.
- codex-net: edu needs no boss; start allowed with ≥2 ready players (bots allowed); up to 30 players in edu rooms
  (8 in battle); setMode; pass mode through; Hall separate.
- codex-repo: the extra quality signals (comment ratio, README length, avg function length, functions/file, test dir
  presence) into RepoProfile/DNA if not already derivable — add fields via a contract request if needed.
- codex-genesis: in edu the trace is the report card (signal → stat → grade).
- claude-player: 2x high-detail hero sprites for heroScale 2 (keep the same identity as the 1x hero).
- claude-boss: edu arena (no boss): a "classroom/lab" theme variant or the notebook theme, scaled to the player count;
  PvP bullets readable per player color; null-boss safe everywhere.
- claude-ui: mode toggle, teacher flow (projector view: QR, roster, live leaderboard, round timer, quiz),
  student phone view (report card in the lobby, PvP HUD: your KOs/rank/round), autopsy ranking + report cards; handle
  boss === null everywhere.
- claude-edu: quality lessons + report card component + quiz overlay for PvP + glossary.

---
(Earlier boss-based edu design follows; keep the reusable parts: concepts library, lesson feed, quiz overlay,
social-impact sections.)

# Education mode (user request) — the fight teaches you what you're fighting, with REAL repo data
Contract (shared/types.ts): GameMode "battle"|"edu", LobbyState.mode, ClientMsg setMode, GameEvent "lesson"
{concept, ref, facts}, PerkOffer.quiz + PerkPad.answer/correct, perk event `correct`.
Tone: friendly CS-101 teacher with hacker humor; every lesson ≤ 2 short sentences + 1 real fact from THIS repo.
Never block the fight for everyone (cards are non-blocking; big screen shows the lesson large).

## codex-net (server/)
- setMode (owner, lobby only), persisted with the room, shown in lobby, passed to createMatch(…, { mode }).
- Edu matches are recorded in the Hall under a separate "class" board (or skipped) — don't mix with battle records.

## codex-sim (sim/)
- createMatch(players, boss, { mode }): edu = gentler — boss damage ×0.6, bullet speed ×0.8, telegraphs +0.4s, revive 2×
  faster; keep it winnable by 2–4 new players (bot sweep: edu 4p ≥ 85% wins).
- Emit "lesson" events (edu only, rate-limited ~1 per 8s, first occurrence of each concept prioritized) with REAL facts:
  limb broken → cascade/component (component, fanIn, dependents count); weak point hit → circular-dependency (the cycle
  members); heart exposed/hit → heart-module (file, fan-in); attack telegraph → its concept (stack-overflow,
  infinite-loop, race-condition, merge-conflict, memory-leak, force-push, dependency-hell, null-pointer, recursion);
  minions → tech-debt (real TODO count); obstacle broken → dead-code/refactor (file, LOC).
- Code review in edu = QUIZ: generate a question from the boss profile with exactly one correct pad:
  "Which module would break the most if deleted?" (highest fan-in), "Which files form a circular dependency?",
  "Which component is the largest?", "Which component depends on the most others?" (fan-out), "Where's the heart?"
  Pads' answer = real names (1 correct + 2 plausible distractors). Correct → strong perk, wrong → weak perk; quiz.explain
  says why, with numbers. Tests.

## claude-edu (NEW, client/edu/)
Lesson engine + content + UI components that claude-ui mounts:
- `concepts.ts`: for every Concept: title, 1–2 sentence plain explanation, a tiny pixel icon/diagram (drawn with canvas or
  inline SVG), and a template that fills in the event facts ("`crates/printer` was imported by 3 components — that's why
  the hit cascaded."). Also for every boss attack kind/name keyword.
- `LessonFeed`: non-blocking lesson cards (phone: in the control deck; desktop: side gutter; big screen: large lower-third
  with the diagram). Tap to expand ("learn more" with an animated mini-diagram, e.g. A→B→A loop animating).
- `QuizOverlay`: the code-review question + the 3 answers matching the floor pads, then the reveal with explain.
- `LessonReport` for the autopsy: the boss repo's architecture in plain words (heart, top fan-in modules, cycles, biggest
  component, coupling summary, "if you refactored X, this boss would lose Y"), every concept met this match as a glossary
  with checkmarks, quiz score per player, and "your repo vs the boss" comparison (from lobby genesis/kits).
- `eduGenesisNotes(genesis)`: narration for each genesis stage that claude-genesis shows when mode === "edu".
- Demo page client/edu/demo.html with fake events; Playwright screenshots at phone portrait + desktop + big screen.

## claude-genesis
When mode === "edu": slow the cinematic, pause on each stage with the eduGenesisNotes narration (tap to continue on the
host/big screen; auto-advance on phones).

## claude-ui
Lobby: owner mode toggle `[ battle | edu ]` with a one-line explanation; edu badge on the room; mount LessonFeed,
QuizOverlay and LessonReport (handoffs in docs/progress/claude-edu.md). Landing: "teaching a class? → edu mode" hint.

# Social impact (user: "see social-impact for that education mode" — docs/social-impact.md)
Edu mode IS the "Classroom mode" (#5). It ships with the doc's MVP picks #1 and #4, plus #2 as a stretch.
Contract: RepoComponent.maintainers/topMaintainers/issues, AdoptIssue, RepoProfile.busFactor/repoIssues/vulns,
KnownVuln, BossLimb.fragile/maintainers/issues/parasites, Autopsy limb fields, MotionProfile, new Concepts.

## #1 Fragile organs → "Adopt an Organ" (battle AND edu; the demo ending)
- codex-repo: per component, distinct commit authors via GitHub REST `commits?path=<component>&per_page=100`
  (best effort, ≤ 8 calls, token if present) → maintainers + topMaintainers; repo busFactor; open issues labeled
  `good first issue` / `help wanted` (`issues?labels=…&state=open&per_page=30`), mapped to a component by paths/component
  names mentioned in the title/body/labels, the rest into repoIssues. Precompute for data/fallback with `gh auth token`.
  Offline/rate-limited → fields absent (never invent issues).
- codex-sim: maintainers === 1 → limb.fragile (cracked, glowing) and takes critical hits (×1.5, counts as a weak
  point). Normalize so the boss's total threat/HP budget is unchanged (fragility moves where it's weak, not how weak).
  Copy limb issues/maintainers into the kit and autopsy. Edu lesson events: "bus-factor" when a fragile organ is first hit
  (facts: component, maintainers, top maintainer), "good-first-issue" when it breaks.
- claude-boss: fragile organs drawn cracked with a pulsing amber glow + tiny "1 maintainer" tag; crit sparks.
- claude-ui (autopsy, both modes) — the demo finish: each fragile organ gets a card: "`crates/printer` has only 1
  maintainer (@burntsushi). Adopt this organ →" with its issues and a big QR (/api/qr) to the issue URL; the big screen
  (?screen=1) shows the top one huge: "This organ has only one maintainer. Scan to adopt it." No issues →
  link to the repo's contributing guide / issues page.
- claude-edu: concepts bus-factor, good-first-issue, open-source-maintenance (xz / Log4Shell context, one sentence,
  no fearmongering); LessonReport section "Where this project needs help".

## #4 Inclusive motion mode (all modes)
- codex-input: MotionProfile per player (stored locally): "seated" = calibrated range shrinks (full speed at ~8° and a
  small nod/flick attacks — lower swing threshold, larger deadzone filtering for tremor), "tap-only" = no motion; touch
  joystick + tap to attack. Calibration step asks: "How do you want to play? standard · seated / low-motion · tap only".
- claude-ui: that choice in the motion onboarding + settings gear; plus prefers-reduced-motion respect (no shake/glitch).

## #2 Stretch: vulnerabilities as parasites (read-only, public advisories only)
- codex-repo: parse declared deps (package.json, requirements*.txt/pyproject, Cargo.toml/lock, go.mod, pom.xml) →
  OSV.dev `/v1/querybatch` (public read-only API) → vulns (cap 12) mapped to components by manifest path.
- codex-sim: parasite organs slowly lose HP over time (cosmetic-fair: budget-neutral). claude-boss: parasites crawling on
  those organs. Autopsy lists ID + fixed version ("upgrade X to ≥ Y"). Pitch line: we only read public advisory data.

## #3 Raid boss for the whole event — Vision only (pitch), not built.
