# Gitzilla: HackPSU judging audit and execution plan

Audit date: October 24, 2026. Scope: the `repo-kaiju` working tree, including uncommitted royale work; source review, existing browser artifacts and fresh automated checks. This is a competitive assessment, not a prediction of awards. No physical-phone session, live OAuth flow or paid model request was performed for this audit. Other contributors' implementation files were left untouched.

## Recommendation

Follow-up: [UI simplification and Hack the North comparisons](ui-simplification.md) gives the screen-by-screen reduction plan, exact copy and implementation order.

**Lead with one experience: four friends bring their repos, tilt their phones, and fight for bragging rights.** Make the repository-to-character transformation obvious, then deliver a short, readable, funny rivalry match. Grand Prize and Mystery Stack are the primary targets. Explain Gemini and Auth0 as parts of that experience; use the same evidence for Nittany AI. Treat SpaceXSI as a workflow raffle, not a reason to expand the game.

Two-sentence pitch:

> Gitzilla turns your GitHub repository into a pixel-art fighter, and your phone into its controller. Four friends tilt, swing and battle until one survives the merge—then see the real code behind their characters.

The last clause should be demonstrated with the existing source/genesis information; do not imply a dedicated new results feature has been shipped. The boss raid remains an excellent supporting showcase for architecture-as-anatomy, but it is cooperative. Classroom mode is a substantial separate workflow with no live motion loop. Neither should replace the four-person rivalry demonstration.

## What is genuinely strong

- **A memorable physical interaction:** phones already supply the accelerometer and gyroscope. Four people visibly moving their controllers can communicate the concept before the pitch finishes. A custom hardware accessory is unnecessary.
- **More than an API wrapper:** repository analysis, import graphs, source-derived kits, a server-authoritative simulation, procedural rendering, synchronized rooms and motion classification exist independently of model-generated text.
- **A distinctive identity:** repo weapons, GC sweep, terminal styling and “survived the merge” are cohesive. The humor already belongs to the subject.
- **Auth0 has a meaningful job:** this is not just a login logo. PvP verifies distinct GitHub identities and repository eligibility, including another eligibility check at match start.
- **Real fallback engineering:** cached public profiles and deterministic art make supporting demonstrations resilient. Be precise: they do not remove the live GitHub requirement from PvP onboarding.

## What is weak, and what to do

| Weakness | Why a skeptical judge cares | Smallest useful fix |
| --- | --- | --- |
| Three competing stories: raid, royale, classroom | “Which thing did you actually build for me to use?” | Put royale first in the pitch and demo; keep raid as one optional technical example and classroom as a brief extension |
| Mystery compliance is possible, but not guaranteed by room rules | Two humans plus bots, a keyboard session, or a classroom roster does not establish the supplied requirements | Rehearse and record four humans on four motion-enabled phones in one royale; optionally add a clearly labeled judging preset requiring four connected human players |
| Motion vocabulary is ambitious | Tilt + flick + twist + spin can turn a quick demo into training and gesture misfires | Teach tilt and attack first; keep dash/skill as optional mastery. Measure real users before changing thresholds or removing gestures |
| Effects can obscure the game | A judge who cannot locate their hero will miss everything else | Prioritize self marker, silhouettes, opponent contrast and readable arena over scanlines, overlapping labels and particle volume |
| Public landing copy still emphasizes the boss | README alignment alone cannot make the running UI explain rivalry | Make the primary demo route visibly choose royale; proposed UI change, not implemented by this audit |
| Gemini contribution may be invisible | Seeing a polished cached character does not explain what the model contributed | Show one exact repo identifier/README clue, Gemini's validated output and its rendered effect. Preserve a redacted provider/model result |
| Impact is asserted more easily than demonstrated | “Educational” does not establish better learning; combat skill is not code quality | Position as a social way to explore code. Collect small, honest usability observations; separate architecture understanding from winning a match |
| Four accounts plus repo eligibility creates onboarding friction | Authentication can consume the exposition slot | Preflight four real users and eligible public repos; keep one short fresh-login demonstration ready |
| Documentation describes old duel behavior | No-respawn royale conflicts with best-of-three respawn rules | README corrected; older `docs/design/pvp-duel.md` remains historical and should not be used as current game rules |

Visual evidence boundary: inspected `docs/shots/2026-10-25T00-40-58-395Z-2837286/landing-phone.png` and `mid-fight-020s-phone.png`. The saved co-op phone capture has dense labels, pronounced CRT/glitch effects and a cropped boss. Its landing capture emphasizes creating a room over explaining PvP. These are earlier browser captures, not a fresh view of the latest royale build or evidence of physical-phone behavior. The playtest summary records keyboard/touch input and a timed fight; its notes say natural autopsy was not reached within that capture window. Do not turn an exit code of zero into a claim that every demo milestone was observed.

## Target-by-target strategy

### Grand Prize first place and Mystery Stack

The published event distinguishes **Grand Prize first place ($2,000)** from **General Track: The Mystery Stack ($1,500)**. Avoid calling both “general first place.” The revealed motion/rivalry/four-person requirements come from the team; the public overview still describes the mystery without those details. Confirm award stacking with organizers rather than assume it. [Event overview](https://hackpsu-fall-2026.devpost.com/)

Use one session to show all requirements together: four people, direct opposition, continuous motion steering/attacking, placements and an obvious winner. Bots are useful engineering, but do not substitute for people. Touch accessibility should stay available; demonstrate motion convincingly instead of removing fallback controls to manufacture compliance.

Suggested acceptance gate: all four users can identify themselves, move and attack; all stay connected; an elimination is final; eliminated users can follow the action; the zone resolves stalling; one winner reaches results with correct placements; rematch works. Aim for a 60–120 second judged match, then tune only if real play shows it is too long or immediately eliminates newcomers. A simulation result is not a human fun measurement.

### Nittany AI

The current challenge allows improving an experience, including creative applications. A game can qualify without inventing a humanitarian justification. The strongest honest claim is **making unfamiliar code personal and social**, with classroom functionality as an extension. [Nittany AI description on Devpost](https://hackpsu-fall-2026.devpost.com/)

Run a small session with four participants. Before playing, ask them to find a central file or describe one module. After a short source/genesis reveal, ask a comparable question and whether the character felt connected to their code. Record observed completion, confusion and quotes with permission. Report the sample size and task; this is exploratory usability feedback, not proof of long-term learning. If no benefit appears, pitch the entertainment/community result honestly.

Do not claim file counts, test-file ratio or comments establish functional correctness. `rubric/scoring.ts` itself distinguishes test presence from execution/coverage. Classroom checks are evidence checks and teacher review, not a universal AI grader.

### Gemini API

The team confirms using Gemini API. `design/index.ts` makes structured generation requests with real repo context and extracted source identifiers, validates designs and applies cosmetic changes. Pixel art is rendered locally; stats and real-time boss decisions are deterministic game code. Google's structured-output documentation also calls for validating semantic values, not merely accepting parseable JSON. [Google documentation](https://ai.google.dev/gemini-api/docs/structured-output)

**Competitive weakness:** optional naming/palette generation can look decorative. Make its personalization visible before adding any new AI feature. Show two contrasting public repos and point to exact source clues reflected in their characters. A redacted request/output plus visible result is stronger than a provider logo.

Bundled `data/design/manifest.json` entries are marked `fallback`. The runtime can use Gemini, DeepSeek, cache, precomputed assets or deterministic fallback. These paths are good availability engineering, but should be labeled honestly in the demonstration. `DesignResult` already defines provider/model reporting; production wiring does not currently supply an `onResult` observer. A small provenance display/log is a proposed follow-up, not an existing UI claim. Do not expose keys or send private source for this demonstration. Verify the configured model with the team's actual successful request rather than infer availability from a model string in source.

### Auth0

The team confirms Auth0 usage. Demonstrate the chain: **Auth0 GitHub sign-in → distinct identity → eligible repo → fight**. Then show that an unrelated public repo cannot be claimed. In `server/pvp-access.ts`, original owned repos qualify; otherwise a public repository requires maintain/admin permission. This gives authentication a visible purpose in a game about “your code.”

Do not describe Auth0 as verifying authorship of every line, preventing all cheating, or making a global leaderboard tamper-proof. The royale Hall currently aggregates by display name and repo; that is not a durable account-identity leaderboard. Four live sign-ins and permission checks still need rehearsal on the actual demo origin, even though auth code and test fixtures exist.

### SpaceXSI

The team confirms using Cursor and Grok Bot to code the project. That resolves the usage uncertainty. Document what they actually did, identify the Grok Bot automation, explain Cursor's core-agent role and opt in to the raffle. The published category is a raffle with workflow requirements, not a prize for adding Grok to the running game. Do not rewrite the development history to exclude Claude/Codex contributions. [Published qualification requirements](https://hackpsu-fall-2026.devpost.com/)

## What previous winners actually tell us

Award labels below come from each project's submission page. “Grand Prize” can cover multiple placements; these labels alone do not establish first overall. Project descriptions are the teams' claims, not independently reproduced implementations. This small sample cannot prove why judges voted as they did.

| Project | Verified award category | Relevant lesson, as our inference |
| --- | --- | --- |
| [NaVox, Fall 2025](https://devpost.com/software/novox) | Grand Prizes, UX/UI, Nittany AI | A phone-based experience can support several categories when its interaction and AI serve one clear user need. Its team describes local detection plus Gemini scene understanding, not simply a generic chat screen |
| [Macromate, Fall 2024](https://devpost.com/software/macromate-9cjduy) | Grand Prize | A specific campus frustration—tracking dining-hall nutrition—is easy to understand. Gitzilla needs an equally concrete explanation of who enjoys or benefits from it |
| [TinyTeach, Fall 2025](https://devpost.com/software/tinyteach) | Best Use of Gemini API | Gemini-generated stories and illustrations are visible in the main experience. Gitzilla should expose its source-to-character transformation just as clearly |
| [Street Fighter: Algorithm Annihilation, Spring 2025](https://devpost.com/software/street-fighter-algorithm-annihilation) | Machine Learning | Games are viable track entries. Explain the actual AI mechanism; do not relabel deterministic bots as Gemini agents |
| [LiDARcade, Spring 2025](https://devpost.com/software/lidarcade) | ICDS LiDAR challenge | ARKit/RealityKit fit because scanning and moving through a real room are central to its stated concept. Its reported provisioning/device challenges also illustrate the cost of a late native pivot |

Do not read these examples as “Apple apps win automatically.” For Gitzilla, the phone's existing sensors and a shared display already provide the physical spectacle. A Swift/ARKit port, RoomPlan arena, microcontroller or new headset integration adds deployment and testing work without solving today's largest gaps. Consider AR later only if real spatial movement becomes the actual game mechanic.

## Execution order

1. **Immediately: preserve submission eligibility.** The supplied and live overview says create the submission by midnight Sunday, have it in place by noon October 25, and finish edits by 1:45 PM. The page header separately shows 2 PM; use the earlier written requirements unless organizers explicitly clarify them. List every team member, link the code, prepare a video no longer than five minutes and check raffle/category selections. No submission was created or changed by this audit.
2. **Next 30 minutes: freeze the demo story.** Choose royale, four users, four eligible public repos and the actual HTTPS origin. Preflight Auth0 callbacks, QR destination and model output. Confirm prize stacking and the revealed mystery rubric. Do not launch new modes.
3. **Next 60–90 minutes: run real four-phone acceptance.** Include actual iOS and Android devices if available. Start from QR join, grant permission, verify sensor movement, play to results, rematch, and test one reconnect. Log observed join time, mistaken gestures, hero readability and connection failures. Fix blockers before adding polish. HTTPS and user activation are real browser requirements. [W3C specification](https://www.w3.org/TR/orientation-event/)
4. **Next 45 minutes: make the distinctive part legible.** Surface the repo/identifier-to-character connection and truthful Gemini provenance. Reduce effects only where actual screenshots/play reveal obstruction. Give the winner and results screen a clean moment; do not bury it in diagnostic text.
5. **Next 30 minutes: gather modest impact evidence.** Ask the four users what was fun/confusing and whether they recognized their code. Record exact observations, including failures. A short quote and observed task are more credible than an invented percentage improvement.
6. **Reserve at least 45 minutes for video and rehearsal.** Capture four human controllers and the shared screen in the same shot. Use real game footage, prepare a clearly labeled recording if networking fails, verify the published link, and rehearse the five-minute version twice. Keep remaining time as a recovery buffer.

Suggested five-minute video: 0:00–0:20 hook and who you are; 0:20–0:50 why a repo-based social game; 0:50–2:20 four-phone rivalry; 2:20–3:10 repo-to-character and Gemini evidence; 3:10–3:40 Auth0/eligibility; 3:40–4:20 actual user observations and engineering lessons; 4:20–4:50 limitations and next step. End early enough to stay under five minutes.

## Skeptical judge rehearsal

**“Why isn't this just a multiplayer shooter with AI names?”** Show the real import graph/source identifier, its kit mapping and rendered character. Then explain exactly which part Gemini contributes. If that link is not visible, this criticism is fair.

**“Where is the rivalry?”** Four humans compete in the same royale; eliminations, placements, winner and rematch are visible. Showing only a co-op boss does not answer this.

**“Does phone motion really matter?”** Have a judge steer and attack with the phone while the shared screen responds. Do not spend the slot explaining every gesture or substituting keyboard footage.

**“What problem does it solve?”** It gives coding clubs and hackathon friends a playful way to show and explore their code together. Say what actual users observed. Do not promise academic performance improvements or pitch a business model you have not tested.

**“What did you learn?”** Each team member should supply one real example: sensor permission/gesture separation, authoritative multiplayer state, bounded repo analysis, schema validation, or identity-to-repo eligibility. A list of AI tools is not a growth story by itself.

**“What is the joke?”** Use a visible moment: “Our garbage collector finally does something useful: it deletes the campers.” Let actual gameplay deliver the joke; avoid another feature or a long skit.

## Audit verification

- Fresh `npm run typecheck`: passed.
- Fresh full `npm test`: **879 passed, 9 skipped; 79 test files passed, 4 skipped**. Skips are not passes. This is a moving shared checkout, not a frozen release certification.
- Existing phone performance notes and browser artifacts were read; their hardware limitations remain in force. No real four-phone motion acceptance, live provider/OAuth acceptance or human impact study was performed here.
- Changes from this audit are documentation only: the main README and this plan. No implementation, deployment, commit, push or submission mutation was performed.
