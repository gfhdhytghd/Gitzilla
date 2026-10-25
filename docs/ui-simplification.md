# Gitzilla UI: fewer words, clearer play

October 24, 2026. Research and design proposal; no production UI files changed. The shared checkout has active changes by other contributors. Observations combine current source, a fresh local desktop landing/mock-lobby inspection and the previously saved phone captures. Mock views are visual fixtures, not multiplayer or sensor acceptance.

## Closest Hack the North references

- [bingbong](https://devpost.com/software/bing-bong-z7rsny): four-player competitive rhythm game controlled with hacked badges; its page lists **Hack the North 2026: Finalists**. This is the closest reference for a physical, social, four-person game. Its submitted title/character images and video thumbnail communicate playful characters and people gathered around one display. Do not infer an entire onboarding flow from those images.
- [Aircade](https://devpost.com/software/aircade-m4n6zv): AirPod/iPhone motion-controlled arcade; its page lists **OpenAI: API Prizes**. The inspected menu uses large icons and short labels; its description separates motion calibration and AI decision inspection from gameplay. This is the closest motion-interaction reference. Its white/blue skin is not the part to copy.

Neither award label proves first overall. These are design references, not controlled evidence that a particular UI caused a win. The transferable principle is **a simple immediate action with technical depth available separately**.

## Verdict

The interface is trying to prove the implementation while the player is trying to start a game. That makes useful information feel like clutter. Text volume is one problem; equally bright panels, repeated labels, animated flavor text, abbreviations and tiny fonts increase the effort further.

Preserve the pixel characters, code-derived weapons, mint/pink identity and the big match moments. Put most explanatory text outside the immediate play path. Do not shrink the font to make everything fit.

## Screen-by-screen edit list

| Screen | Keep visible | Collapse / move | Suggested primary copy |
| --- | --- | --- | --- |
| Landing | Logo, one sentence, animated preview, two clear entry actions | Classroom, leaderboard, host-screen option and full control vocabulary | “Your repo. Your fighter.” / “Tilt your phone. Outlast your friends.” / **Start a battle**, **Join with code** |
| Name entry | Name field and Continue | SSH transcript, connection theatrics and boss warning in a PvP room | “What should we call you?” |
| GitHub / repo | One action appropriate to current state, three recent eligible repos, search | All-repo grid, raw eligibility paragraphs, detailed stats | **Connect GitHub** → “Choose your fighter’s repo” → **Use this repo** |
| Phone lobby | Your hero, repo name, four compact participant portraits, readiness, one next action | Five stat bars, weapon internals, source excerpts, permanent permission/tutorial explanation | “You’re ready. Waiting for 1 friend.” / **Try motion** |
| Motion practice | One visual movement task, then one attack task, success feedback | All gestures taught simultaneously, sensitivity settings and long permission explanation | “Tilt to move” → “Swing to attack” → **Ready** |
| Shared lobby | Large QR/code, people joining, ready count, start state | Personal weapon/source details and repo-permission instructions | “3 of 4 ready” / “Waiting for Maya to enable motion” |
| Phone fight | Arena, unmistakable YOU marker, health/armor/energy, alive count, situational zone warning, compact action cooldowns | Full standings, cumulative damage, event transcript, source names, permanent instruction sentences | “4 alive” / “Move inside the ring” only when relevant |
| Shared fight | Arena, recognizable player colors/names, alive count; one short elimination event | Individual controller instructions and dense personal stats | “Maya eliminated Leo” |
| Results | Winner, four placements, rematch | Full damage tables, source analysis, educational commentary and share options until requested | “Maya survived the merge.” / **Rematch** / **See your code DNA** |

“Code DNA” is proposed packaging for the existing source/genesis material, not a claim that this exact results action already exists. Authentication, permissions, error explanations and accessibility controls must remain reachable and clear.

## Specific findings in the current source / inspection

- `client/app/landing.ts` gives `$ ./create-room` primary emphasis while PvP is a smaller separate action. The default create call chooses `battle`, so this is also a routing decision. For the agreed rivalry demo, **Start a battle must explicitly create `pvp`**; renaming the button alone is insufficient.
- The rotating tagline teaches boss anatomy at the same time the landing offers PvP. A stable one-sentence rivalry explanation is easier to understand than waiting for the appropriate tagline.
- The current local desktop landing exposes a Hall with several score rows in a corner while the user has not started. Move the Hall behind a secondary action. Some landing facts were absent in that live capture although they remain in source: the running page and active checkout can diverge during shared edits.
- `client/app/lobby.ts` can show weapon expressions, projectile/impact wording, skill explanation, code bits and five stat bars in the same ready-hero panel. Keep the character and a plain weapon/skill label; put the rest behind “About this fighter.” Preserve the visual source-to-character reveal as a short moment rather than a permanent wall of copy.
- The inspected mock PvP spectator lobby displayed an “End class” control and a mode-group description referring to classroom/Boss behavior. These are mode-specific wording defects to check against the final runtime; screenshot mocks do not establish real room permissions.
- `client/app/hud.ts` includes alive count, zone text, most-KOs leader, personal KOs/damage, health/armor/energy, team rows, skills, toasts and log. A phone player does not need all of these continuously. Most-KOs and damage are especially secondary in a last-survivor game.
- Earlier phone captures have strong scanlines/glitch overlays and overlapping code labels. Fresh phone checks are needed after active edits; do not assume old screenshot defects remain unchanged.

## Design direction

Use the existing game’s identity with stronger hierarchy:

- Palette: ink `#101714`, panel `#1b2821`, bone text `#f3f4df`, mint action `#8df6b5`, pink rival `#ef9dcc`, orange warning `#ffb36b`. Color identifies player/status; green should not make every control primary.
- Type: existing Unifont/pixel face for short display moments and character names; a readable system sans for forms, instructions and errors. Aim for 16px phone instructions and 44px minimum interactive targets. These are proposal targets, not measured current values.
- Layout: center the hero and immediate next action on personal screens. Keep information in a calm frame around the arena. Align forms and longer text left. One primary action per state, with secondary actions visibly quieter.
- Motion: one repo-to-character reveal, immediate input feedback and emphatic elimination/victory. Quiet the backdrop while reading or choosing a repo. Respect reduced-motion settings.

Review against the brief: generic pale cards or a clinical Apple imitation would lose Gitzilla’s personality. Keep the arcade identity, but let the arena and characters carry it. The proposed mint is an existing brand choice; decorative terminal syntax should not obscure what a button does.

## Proposed sequence

Start / Join → Connect GitHub → Choose repo → Tilt / swing practice → Ready lobby → Fight → Winner / rematch.

Skip completed steps for returning players, but never mistake a stored preference for current sensor permission. Settings remain accessible; permission denial/unavailable sensors show a concise recovery action and touch option. Show actual player counts, not a fixed “4 ready” decoration. Require four humans for the planned judging session without changing the game's general practice rules by accident.

## Implementation order and acceptance

1. Simplify landing and route its primary action correctly. Keep existing test selectors or update the relevant harnesses deliberately.
2. Collapse ready-state repo/stat details and make the next action obvious without scrolling.
3. Reduce phone HUD to survival information; move rich data into results/details. Preserve meaningful source identity in the reveal and results so the project does not become visually generic.
4. Clean results: winner → placements → rematch, then optional code details.
5. Check phone widths 360/390/430, short-height phones and projector. Rehearse with one new user who receives no spoken explanation.

Proposed design budgets: no paragraph on the default landing or in a fight; roughly 25–35 words of static explanatory copy per phone setup state (excluding names, repository identifiers, necessary errors and expanded help); a phone lobby fits its next action in the first viewport; gameplay gives the arena approximately 70% or more of usable phone height where practical. Validate the arena target against current camera framing and touch accessibility rather than crop blindly.

Success means a new person can identify the next action immediately, recognize their hero without searching, steer and attack after a short visual practice, and name the winner at results. Word count alone is not the acceptance test.
