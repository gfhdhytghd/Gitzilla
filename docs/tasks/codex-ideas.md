# codex-ideas: make Gitzilla more FUN and more tied to the real codebase (ideation only — no product code)
Read first: ../repo-kaiju.md (original pitch), docs/BRIEF.md, docs/social-impact.md, docs/tasks/round2.md,
docs/tasks/code-flavor.md, docs/tasks/genesis.md, docs/tasks/edu.md, docs/tasks/motion-v3.md, shared/types.ts
(especially RepoProfile, CodeDNA, kits, MatchState), and skim data/fallback/*.json to see what real data we actually have
per repo (components, edges, cycles, heart, DNA: identifiers/heartLines/todos/commits/tokens/longestFunction/nesting,
maintainers/issues/vulns, quality signals). Then play the game on the DEV server http://localhost:5175 (never :5173) with
Playwright for a few minutes (`?mock=match`, a real 2-player room + bots) so ideas are grounded in how it feels now.

What exists: co-op boss raid (Soul Knight style) where each player's repo becomes a hero and the owner's chosen repo
becomes an AI boss; code-made weapons/bullets; cover blocks from real files; pickups; phase-2 "code review" perk pads;
genesis cinematic (code → creature); classroom PvP edu mode with code-quality stats + report cards + quiz; Adopt an Organ;
phone portrait with pure motion controls (tilt/swing/twist/spin/long-press).

Deliver docs/ideas/fun-and-codebase.md:
1. 20+ ideas, each: name, 2-line pitch, WHY it's fun (moment-to-moment / social / spectator), the exact real-repo data it
   uses (field names), effort (S ≤2h / M ≤5h / L) for our codebase, demo impact for hackathon judges (1–5), risks.
   Cover: moment-to-moment combat, boss behaviors driven by code structure, co-op/social mechanics (4–8 people around one
   projector), comeback/fairness, spectator/crowd interaction (people without phones), progression across matches during
   the weekend, phone-motion-specific fun, things only possible because it's a real codebase (e.g. git history as a
   timeline weapon, blame, diffs, PRs, CI status, stars, forks, issue counts, release tags, contributors).
2. Rank the top 5 by (fun × codebase link × demo impact) / effort.
3. For the top 3, write implementable specs: rules, numbers to start balancing from, which module owns what (sim/,
   server/, analysis/, client/render, client/app, client/input), contract changes needed (as a diff sketch for
   shared/types.ts — the coordinator applies it), and how to test.
Keep ideas compatible with: equal-budget fairness in battle mode, the code-quality stat philosophy in edu mode, no
on-screen buttons on phones, read-only GitHub access, and a 24h hackathon. Progress at docs/progress/codex-ideas.md; no
commits; DONE at the top when finished.
