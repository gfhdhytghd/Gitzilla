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
