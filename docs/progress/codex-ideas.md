DONE (logo fetch)

Completed `docs/tasks/codex-ideas.md` as ideation/specification work only.

## Deliverables

- [Fun and codebase spec](../ideas/fun-and-codebase.md): **30 ideas**, each with a two-line pitch, why it is fun, exact existing/proposed repo fields, S/M/L effort with hour estimate, 1–5 demo impact and risks.
- Ranked top five with explicit `(fun × codebase link × demo impact) / hours` arithmetic: **Break the Stack**, **Git Log Final Blow**, **Dependency Duet**, **Pair Review Rescue**, **Crowd Pull Request**.
- Top three have implementable rules, initial numbers, ownership across all six requested module areas, coordinator-only contract sketches/assessment, deterministic tests, browser checks and human acceptance boundaries.
- Coverage includes combat, architecture-driven boss behavior, 4–8-player cooperation, comebacks, people without phones, weekend progression, motion accessibility, and git history/blame/diffs/PRs/CI/stars/forks/issues/releases/contributors. Expensive metadata additions are marked stretch work with explicit missing/offline behavior.

## Grounding

Read the original `../repo-kaiju.md`, `docs/BRIEF.md`, `docs/social-impact.md`, round2/code-flavor/genesis/edu/motion-v3 task cards, `shared/types.ts`, and all 15 fallback profiles. Checked relevant sim/analysis/genesis/Hall/tooling code and docs.

Latest constraints preserved: **DEV localhost:5175 only**, phone gestures with no combat buttons, battle equal-budget fairness, edu classroom PvP with explained code-quality stats, read-only GitHub access, room-only private DNA, 24h scope. Early pitch's port/landscape/shake/boss-edu instructions were treated as superseded.

The spec distinguishes real fields from proposed metadata: commit subjects have no retained SHA/date/author/diff; source-note excerpts are not necessarily TODOs; heart excerpts may come from another file; test-file ratio is not coverage; sampled authors are not definitive bus factor. Local quality/kit extensions not yet declared in shared types are identified.

## Playwright play record

- Used the running DEV server exclusively; never accessed port 5173, changed server lifecycle/configuration, or installed dependencies.
- Played `http://localhost:5175/r/IDEA?mock=match` for **30 seconds twice** with movement/fire/dash/skill controls. Mock gameplay is visual/interaction grounding, not authoritative production proof.
- Created real rooms through the UI with two isolated player browser contexts, one desktop 1440×900 and one portrait 390×844 touch fallback, plus two normal bots. Selected real fallback-backed repos and started through the UI. No app-private function or direct game WebSocket input injection.
- Initial PEDY run observed combat before a page navigation lost the canvas. SPAG explicitly received “Server restarted. Your fight was reset to the lobby; repos and kits were restored.” Held only non-game Vite HMR inert in subsequent test tabs; game `/ws` remained live.
- Final **QAQA** run: **140.069-second control window**, recovering via normal UI after **two observed returns to the lobby**. Each player received **2,693 snapshots**. Desktop/phone sent **4,051 / 3,848 input frames**, and acknowledgements were observed. Last acknowledged sequence numbers were **2,743 / 2,607** after resets; do not compare these directly to cumulative frame counts as a packet-loss metric.
- Cumulative authoritative event counts from one client across final-run attempts: **820 hits, 85 telegraphs, 25 skills, 11 cover breaks, 41 pickups, 12 downs, 12 revives, 4 limb breaks**. Both contexts saw matching counts. These are cumulative events across resets, not unique limbs or an uninterrupted encounter. The report's unused `observed.downs/revives` placeholders remain zero; `events.downed/revived` are the maintained counters used here.
- Final snapshot: **fighting, phase 1, sim time 91.7s**. Real victory/autopsy, phase-two review, physical-phone sensors, crowd response and acceptance of the proposed features remain **UNVERIFIED / not reached**. No clean regression-pass claim: restart notices are retained in the evidence.
- Viewed mock/real desktop/phone screenshots. Busy source glyphs and hit effects support reusing the existing warning panel, adding a restrained source-target outline, making rescue/co-op purpose readable, and placing git-log theatrics after combat.

Local transient artifacts (outside product source):

- `/tmp/gitzilla-codex-ideas/` — first mock + interrupted PEDY observations/screenshots.
- `/tmp/gitzilla-codex-ideas-rerun/` — second mock + SPAG restart report/screenshots.
- `/tmp/gitzilla-codex-ideas-final/report.json` and neighboring screenshots — completed QAQA timed observation, including reset notices and final authoritative snapshots.
- `/tmp/codex-ideas-playtest.mjs` — temporary Playwright driver; current version corresponds to the final observation.

## Validation

Passed a documentation checker for all 30 sequential ideas, all required fields, two-line pitches, local link targets, three specs/contract assessments, balanced code fences, ranking arithmetic and trailing whitespace. Rechecked fairness, classroom/phone constraints, spectator/weekend coverage, proposed metadata labels and evidence boundaries.

No product tests were run for these documentation-only additions. The implementation tests described in the spec are handoff requirements, not claims that unbuilt features passed.

## Contract requests — coordinator only; not applied

1. **Spec A:** add `GameEvent { type: "attackStopped"; attackId; limb; by }` at the existing source-limb cancellation. Live outlines/captions can use current types without the optional success flourish.
2. **Spec B:** **no shared contract change**; existing commit subjects, victory state/event and killing-blow stats suffice.
3. **Spec C:** optional verified limb-ID `BossKit.repoLinks`, `RepoDuet`, optional `MatchState.repoDuet`, one completion event and a bounded room-only `Autopsy.repoDuets` list. No `InputFrame`/network message/stat/quality change. Full diff sketches are in the spec.

Recommended cut: implement #01 and #02 independently; add #03 only if four implementer-hours and the shared-contract merge remain available. #04 is the fallback priority if human play shows revive comprehension is the bigger problem.

## Scope and remaining work

Only `docs/ideas/fun-and-codebase.md` and this progress file were authored in the repository. Preserved other agents' pre-existing/parallel changes. **No product code, shared types, commits, pushes or memory changes.** No remaining work on this ideation card; implementation and physical/human acceptance belong to the coordinator and module owners.


## Follow-up completed: Godzilla / kaiju references

- Read and used `/home/wilf/.agents/skills/lark-shared/SKILL.md` and `/home/wilf/.agents/skills/lark-im/SKILL.md`, plus list/download-enrichment references. Used `lark-cli` with both notifier environment variables disabled and explicit **`--as bot`**. No user login/authentication flow was needed.
- Read `docs/design-refs/README.md`; used exact p2p chat `oc_e0decba894219dffa8d4868c05aad646` and sender `ou_3db23cf05c03b4942c355797cc88e8f9`.
- Listed the entire New York day `2026-10-24T00:00:00-04:00` through `2026-10-25T00:00:00-04:00` with ascending order, automatic pagination and `--download-resources`. CLI confirmed **bot**, **complete pagination**, **one page / 15 messages**. Found and visually inspected **all seven user image messages**: five kaiju images at positions **362–366**, and the existing hero sheets at **372–373**.
- Saved original, unchanged PNGs as `docs/design-refs/boss-1.png` through `boss-5.png`, in ascending message order. Verified valid PNG data, dimensions/byte counts and matching SHA-256 hashes. Re-downloaded hero image hashes match `hero-1.png`/`hero-2.png`; neither file nor the existing reference README was changed.
- Wrote [BOSS-README.md](../design-refs/BOSS-README.md) for claude-boss: full seven-image provenance inventory, exact message links and read-only reproduction route; per-image silhouette, proportions, dorsal plates, pose, palette, lighting and details to copy; proposed renderer brief and original-file hashes.
- Direction: compact boss-4 Godzilla blockout + boss-1 charged dorsal ridge; optional boss-2 multi-head/wing, boss-3 mechanical and boss-5 segmented-dragon variants. Clearly distinguishes screenshot/UI artifacts and observed still-image details from proposed animations.
- Temporary downloads and image-only manifests: `/tmp/gitzilla-boss-refs-codex-ideas/`; no raw chat history or unrelated attachments added to the repo.
- Follow-up scope: five reference assets, `BOSS-README.md`, and this progress update only. **No messages/reactions sent, no external writes, no product code changes, no commits.** Final checks passed for all seven source/file mappings, image integrity, each requested visual attribute, local links, formatting and the DONE marker. No remaining work on this follow-up.


## DONE (logo fetch)

- Downloaded the newest image message from the specified user in the same codex bot p2p chat using `lark-cli` with explicit **`--as bot`** and both notifier environment variables disabled. Read-only listing/download only; no messages or reactions sent.
- Source: [message position 377](https://applink.feishu.cn/client/chat/open?openChatId=oc_e0decba894219dffa8d4868c05aad646&position=377), message `om_x100b62e2133c4cacc0ef02b19f9a101`, sender `ou_3db23cf05c03b4942c355797cc88e8f9`, CLI creation time **2026-10-24 22:13** (New York local time). It was **1.76 minutes old** when selected from descending message history, within the requested last ~30 minutes.
- Saved the original image-resource bytes to [brand/gitzilla-logo.png](../../brand/gitzilla-logo.png). **PNG, 833 × 299 pixels, RGBA, 328,855 bytes.** Viewed the saved image and confirmed the GITZILLA wordmark. No resizing, re-encoding, cropping or recoloring; source and saved bytes match exactly. The resource is already PNG, so no additional original-extension file is needed.
- **Transparency: yes.** Alpha range **0–255**; **69,173 fully transparent pixels**, **9,264 partially transparent pixels**, **170,630 opaque pixels**. This is actual transparent image content, not merely an unused alpha channel.
- SHA-256: `7167dfcc4c1b05b3a8ee7a82b97394fad02fb96715278695ce5f3cc502e3267d`.
- Verification passed: PNG decoding/integrity, original dimensions, byte-for-byte equality, SHA-256 and alpha histogram. Changes for this fetch are the logo asset and this progress entry only; no product code or commits.
