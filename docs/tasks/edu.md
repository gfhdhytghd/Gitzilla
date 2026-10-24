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
