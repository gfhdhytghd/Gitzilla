DONE (boss variety comparison)

## Boss-only AFTER measurement — complete
- Coordinator confirmed boss variety committed at6c089ac. Ran current-tree boss renderer against the same45 frozen baseline profiles/kits, Chromium154 and unchanged metric thresholds. No product/tool changes were needed and no commits were made.
- Exact command: `npx tsx tools/variety-sheet.ts --label after-bosses --kind bosses --fixtures docs/variety/baseline/fixtures.json --compare docs/variety/baseline/summary.json`.
- **Before→after (all45 inputs /990 pairs):**

| View | Min distance | Mean distance | Look-alike pairs / clusters | Shape-only pairs | Pooled palette entropy bits |
| --- | ---: | ---: | ---: | ---: | ---: |
| bosses-portraits | 0.01365→0.09819 | 0.41421→0.44229 | 68 / 8→6 / 4 | 144→74 | 4.9532→5.6244 |
| bosses-fight | 0.01554→0.11120 | 0.41145→0.44795 | 67 / 8→3 / 2 | 150→79 | 4.9722→5.6196 |

- Fallback-only15: portrait min0.07916→0.26279, look-alike pairs8→0 and clusters4→0; fight min0.07206→0.24193, pairs10→0 and clusters4→0. Aggregate residuals involve synthetic profiles; thresholds were not changed.
- Outputs: docs/variety/after-bosses/{bosses-portraits.png,bosses-fight.png,summary.json,fixtures.json}. Added the full numbers and command to docs/variety/README.md. No hero modules were imported; verified all baseline/after-hero files and latest full summary unchanged byte-for-byte from HEAD.
- **6/6 metric/selection tests PASS; workspace npx tsc --noEmit PASS; all90 boss pixel hashes reproduced exactly in a second fresh Chromium context; browser errors0; canvas-edge touches0.** Viewed both PNGs. Only docs/variety/ output/README and this progress log changed. No product edits, provider calls, server lifecycle actions, live5173 access or commits.

DONE (hero variety comparison)

## Hero-only AFTER measurement — complete
- Coordinator confirmed hero variety committed at4ba4f40. Captured current working-tree hero source (git HEAD62d5388, includes4ba4f40) using the exact45 baseline profiles/kits, same Chromium154 and unchanged protocol/thresholds. No product edits, provider calls, commits or shared service actions.
- Added --kind heroes|bosses|all: capture/import only the selected renderer and scope source fingerprints accordingly. Partial reports do not replace the full baseline/latest summary. Verified no boss source file was loaded; all baseline files and boss sheets are byte-for-byte unchanged from HEAD. Boss rerun remains pending claude-boss completion.
- **Before→after (all45 /990 pairs):**

| View | Min distance | Mean distance | Look-alike pairs / clusters | Shape-only pairs | Pooled palette entropy bits |
| --- | ---: | ---: | ---: | ---: | ---: |
| heroes-portraits | 0.01410→0.21770 | 0.44753→0.49137 | 10 / 10→0 / 0 | 43→1 | 5.4861→6.1825 |
| heroes-fight | 0.01917→0.18753 | 0.36255→0.39550 | 11 / 9→0 / 0 | 55→35 | 5.3256→5.8117 |

- Fallback-only15: portrait min0.17747→0.27344; fight min0.11084→0.21483. Combined look-alike pairs remain0 for that subset. All90 hero images reproduced pixel-for-pixel in a second fresh Chromium context, browser errors0. Viewed both sheets; pre-existing S16 portrait edge touch remains, no new edge touches.
- Output: docs/variety/after-heroes/{heroes-portraits.png,heroes-fight.png,summary.json,fixtures.json}; comparison/commands added to docs/variety/README.md. Original frozen source67cb5a9 and fixture SHA0c7618… remain unchanged.
- **6/6 metric/selection tests PASS; workspace npx tsc --noEmit PASS; owned diff check PASS.** No boss capture or product changes. Run `--label after-bosses --kind bosses --fixtures docs/variety/baseline/fixtures.json --compare docs/variety/baseline/summary.json` only after its owner is finished.

DONE (variety baseline)

## Variety measurement tooling — baseline complete
- Read docs/tasks/variety.md Measure first. Added tools/variety-sheet.ts plus5 meaningful metric/fixture tests. Scope stayed tooling/artifacts/this log; no product edits, provider calls, room creation, shared server actions or commits. Only existing DEV5175 browser origin is allowed;5173 is rejected.
-45 frozen inputs:15 public fallback repos with current bundled Gemini designs +30 deterministic explicitly synthetic profiles spanning languages, LOC, ages, cycles, component count, tests and contributors. Synthetic paths include15 seed-only and15 deterministic-design kits. All6 hero classes/all4 boss archetypes represented.
- Renderer owners began modifying files while this tool was built. Discarded the preliminary working-tree capture and pinned final BEFORE source to pre-variety task commit67cb5a9619e56be9c2018d134458e1d20b73b760. Read unchanged renderer/shared modules from git and compile them only inside the isolated browser fixture; no checkout/reset/product rewrites. Every renderer dependency is pinned; unknown render imports fail closed. Frozen profiles/kits/source hashes are saved for AFTER comparisons.
- Actual headless Chromium154.0.8037.97 executes playerPortrait/drawPlayer and bossPortrait/drawBoss at idle t=.35, phase1/frame0. Four PNG sheets each contain45 images. No product app/room/3D/animation/hardware acceptance is claimed. Visually inspected all sheets; S16 hero portrait touches its canvas edge (existing potential duck/prop crop), recorded rather than patched.
- Metric protocol: alpha≥128 foreground crop;64-bit9×8 dHash;512-bin RGB histogram total variation; combined distance=.5*dHash+.5*histogram. Same-class/archetype look-alike edges require≤8 bits AND≤.20 histogram distance; connected components≥2 define clusters. Also report shape-only matches at the same8-bit cutoff, pooled/per-image/between-image palette entropy, nearest pairs, origin subsets and all per-class/archetype groups. Scores exclude sheet labels/background.
- **Baseline numbers (all45 inputs,990 pairs/view):**

| View | Min combined | Mean combined | Look-alike pairs / clusters | Shape-only pairs | Pooled palette entropy bits |
| --- | ---: | ---: | ---: | ---: | ---: |
| heroes-portraits | 0.01410 | 0.44753 | 10 / 10 | 43 | 5.4861 |
| heroes-fight | 0.01917 | 0.36255 | 11 / 9 | 55 | 5.3256 |
| bosses-portraits | 0.01365 | 0.41421 | 68 / 8 | 144 | 4.9532 |
| bosses-fight | 0.01554 | 0.41145 | 67 / 8 | 150 | 4.9722 |

- Fallback-only15: hero portraits min.17747 /0 look-alike pairs; hero fight.11084 /0; boss portraits.07916 /8 pairs in4 clusters; boss fight.07206 /10 pairs in4 clusters. Full per-group and nearest-pair data are in JSON.
- Artifacts: docs/variety/summary.json (latest), docs/variety/baseline/summary.json, baseline/fixtures.json, baseline/{heroes-portraits,heroes-fight,bosses-portraits,bosses-fight}.png, baseline/repeat-check.json, docs/variety/README.md. Fixture SHA256:0c7618bfd91a29f2821beb2b6ddea24076c3ca42354ea94f36de007dbc7f55f2.
- **Validation:**5/5 tool tests PASS; each capture's second fresh Chromium context reproduces all180 pixel hashes. Independent source-pinned --compare selfcheck also reproduces all180 pixels and all metric deltas are exactly0. Owned diff check PASS. Global tsc during active boss art edits had5 external diagnostics about PlateLayout.style / kaiju.fins / kaiju.mat in client/render/boss/index.ts; those files were left to their owner. Final workspace `npx tsc --noEmit` recheck PASS after the art owner’s concurrent updates. No product fixes were made by this tooling task.
- AFTER handoff: `npx tsx tools/variety-sheet.ts --label after --fixtures docs/variety/baseline/fixtures.json --compare docs/variety/baseline/summary.json`. Uses a frozen snapshot of the current working-tree renderer source; baseline remains intact. Do not recapture new art with --label baseline. See README for exact before-source replay.

DONE (flavor polish)

## Flavor line polish
- Prompt explicitly requests complete taunts≤60 chars and catchphrases≤40 chars (shared hero limit); taunt JSON schema/validator now share the60-char limit. Added clampText: reserves an ellipsis, backs up to a complete whitespace-delimited word/code token with balanced quotes/calls/brackets, handles escapes/contractions/possessives, and repairs clipped cached prose. Complete source excerpts and complete code weapon names keep their own behavior.
- Revalidated all30 designs across15 repos without provider calls.28 files changed, exclusively catchphrase/taunts; artwork, names, code weapons, stats and Gemini source/model/API manifest unchanged. Flask now says `Running on 127.0.0.1:5000…` and `raise AttributeError(name): your session context was lost…`; Ripgrep ends `amortize your…`.
- **Focused design suite98 PASS; workspace npm run typecheck PASS; owned diff check PASS.** Includes6 truncation regression cases (whole words, nested/quoted calls, previously clipped prose, contractions/possessives, escaped/smart quotes, idempotence/source excerpts), prompt/schema limits and all15 bundled repos.
- Extra full merged suite at21:44 local:929 PASS /9 skipped /3 FAIL, all outside design: auth/index.test.ts:38 tampered-cookie assertion; sim/royale.test.ts:47 equal-budget/mode-switch expectations; server/rooms.test.ts:1626 PvP lobby stat expectations. No edits to those files. No claim of current global green while these other-owner checks fail.
- Only design/, data/design/ and this required progress log changed. No provider calls, shared/sim/server/client edits, new dependencies, commits/pushes, deployment, service actions or live5173 access.

DONE (gemini live)

## Gemini Interactions API migration — complete
- Checked current official [structured output guide](https://ai.google.dev/gemini-api/docs/structured-output) and [Interactions REST reference](https://ai.google.dev/api/interactions-api). Primary POST /v1beta/interactions uses model/input, store:false and response_format:{type:text,mime_type:application/json,schema}. Parse only completed model_output text steps, plus earlier outputs[] compatibility; ignore thought/input/tool blocks and reject partial/malformed results.
- Retained lite model retry, legacy generateContent compatibility, auth/quota cooldown, existing DeepSeek JSON fallback and deterministic fallback. Requests retain abort deadlines, no response/key logging, and actual source/model/API provenance in cache/manifest. Private/credentialed flags still bypass shared jobs, caches, credentials, both providers and observers before any work.
- Precompute --offline now disables BOTH providers. Added --require-gemini to require fresh Gemini hero+boss results before publishing each repo; fallback results cannot overwrite bundles under that flag. Explicit precomputation allows60s per request; interactive requests retain8s.
- Initial live verification:6/6 hero+boss results across Flask, React and Ripgrep were gemini-3.8-flash. One validated hero and boss JSON plus the3-repo verification table are below. Ran all-repo force generation; a temporary403 made Django boss fall through to DeepSeek, and the gate correctly preserved its old bundles. Exact parent-key match confirmed without exposing values. Minimal Interactions and all4 field-format probes subsequently completed, confirming intermittent permission failure. Django retry succeeded; remaining repos were force-generated individually with bounded retry. No fallback output was relabeled.
- **Final manifest audit:15 repos /30 designs, ALL source=gemini, model=gemini-3.8-flash, api=interactions.** All keys match the frozen current kits. No DeepSeek/deterministic bundles remain. Archetype distribution:4 kaiju /3 hydra /3 mecha /5 abyssal.
- **All30 artifacts equal their validated form.15 distinct complete code-expression weapon names, each≤24 chars;15 distinct boss epithets; all attack/limb maps contain every required ID with distinct names.** Boss body hints stay within kit.archetype; canonical real attack-source prefixes are preserved. Gin model title Engine-Prime collided with the existing no-repo-substring rule; validation now repairs only that title with its source-DNA fallback while retaining Gemini's remaining art, covered by a regression test.
- **92 design tests PASS; focused design tsc PASS; workspace npm run typecheck PASS; owned diff check PASS.** Transport tests cover current/earlier response shapes, reasoning exclusion, completion status, malformed output, legacy compatibility, timeouts, quota/DeepSeek fallback and actual API provenance. Existing cache/private/credentialed/code-name and all15 bundled checks remain active.
- Full npm test at21:31 local: **894 PASS /9 skipped /1 FAIL** (79 passing files /4 skipped), solely server/traces.test.ts:94 oldest-trace retention. Read-only inspection suggests an mtime-tie/random-ID ordering issue; exact failed-file timestamps were not captured. This is outside design ownership and was not edited. Focused rerun of design/ plus server/traces.test.ts passed97/97. Final full-suite rerun at21:32 local **895 PASS /9 skipped** (80 passed files /4 skipped); keep the initial intermittent retention failure visible for the server owner. Final workspace typecheck and owned diff check PASS.
- Credential-value audit scanned46 owned source/data/progress files:0 matches. No credential values printed or tracked. Only design/, data/design/ and this required progress log changed; no private content sent, shared/sim/server/client edits, new dependencies, external messages, commits/pushes, service start/stop, deployment or live5173 access.

### Initial live verification — three public repos
| Repo | Hero title | Validated code weapon (chars) | Boss / body | Provenance |
| --- | --- | --- | --- | --- |
| pallets/flask | Micro Route Mage | `yield from create_app()` (23) | LocalProxy / serpent (abyssal) | hero+boss gemini-3.8-flash |
| facebook/react | Root Renderer | `emit(create())` (14) | Reconcilokai / hydra | hero+boss gemini-3.8-flash |
| burntsushi/ripgrep | Ripgrep Ranger | `unsafe { matcher() }` (20) | BURNT-AUTOMATON Ω / machine (mecha) | hero+boss gemini-3.8-flash |
These describe the initial6/6 successful live requests. Subsequent full-bundle generation may choose new art labels; final manifest records the actual model/API for every result.

### Live verification sample — pallets/flask
Both returned live gemini-3.8-flash output in the initial6/6 verification batch and passed design validation. JSON below is the bounded/validated output, including canonical source-name repairs and any invalid weapon-name fallback.

Hero:
```json
{
  "title": "Micro Route Mage",
  "archetype": "mage",
  "headgear": "wizard-hat",
  "accessory": "cape",
  "emblem": "->",
  "palette": [
    "#1e293b",
    "#06b6d4",
    "#fde68a",
    "#ffffff"
  ],
  "catchphrase": "Note we do this without checking if stat",
  "weaponName": "yield from create_app()"
}
```

Boss:
```json
{
  "name": "LocalProxy",
  "epithet": "Abyssal WSGI Devourer",
  "body": "serpent",
  "eyes": 8,
  "mouth": "maw",
  "growths": [
    "crystals",
    "spikes",
    "cables"
  ],
  "palette": [
    "#0d1117",
    "#21262d",
    "#00e5ff",
    "#ff1744",
    "#39ff14"
  ],
  "theme": "web",
  "intro": [
    ">> WSGI_SUBTERRANEAN: Tunneling beneath http://127.0.0.1:5000...",
    ">> Thread-local context severed; crystalline serpent coils in the fault line.",
    ">> ProxyMixin awakens with glowing red and cyan veins. Press CTRL+C to flee!"
  ],
  "taunts": [
    "Note this is a duplicate of the same method in the Flask!",
    "drop support for Python 3.10 (#6168) — and all mortal runtimes!",
    "def _get_current_object(self) -> T: You cannot resolve this refe",
    "raise AttributeError(name): No registered route survives my maw!"
  ],
  "attackNames": {
    "0-cascade-0": "app() ProxyMixin Crystal Spire Cascade",
    "0-ring-1": "get() LocalProxy Vein Pulse Ring",
    "1-slam-0": "index() assert client.get Segment Slam",
    "2-fan-0": "client() create_app Route Shard Fan",
    "3-charge-0": "github_link() github_link Abyssal Burrow Charge",
    "4-cascade-0": "create_app() devcontainer Void Rupture Cascade"
  },
  "limbNames": {
    "limb-0": "ProxyMixin Crystalline Carapace",
    "limb-1": "TestClient Barbed Segments",
    "limb-2": "create_app Dorsal Spines",
    "limb-3": "github_link Prowling Crest",
    "limb-4": "Devcontainer Abyssal Claws"
  }
}
```

DONE (archetypes)
DONE (offline bundle refresh)

## Final archetype bundle refresh — complete
- Waited for codex-sim's literal DONE (archetypes) marker, polling at20:56 /20:59 /21:02 /21:05 /21:08 /21:11 UTC on2026-10-24. Take-lead and codex-sim then confirmed the final300-match sweep and frozen selection/decks/source IDs. Read progress again: first line DONE (archetypes), second DONE (rubric).
- Executed `npx tsx design/precompute.ts --force --offline --require-dna` against those final kits. Regenerated30 public bundles for15 repos with truthful fallback provenance and no provider/network calls. Structural diff audit: exactly15 boss JSONs changed, **attackNames is the only changed field**. Hero designs, names, body/lore/palettes, limb names and manifest remain unchanged. No design implementation or test assertions changed for this refresh.
- Fixed the reproduced stale-asset failure at design/index.test.ts:225: e.g. Ripgrep now carries its final mecha fan/ring/laser/summon/charge attack IDs and current source-derived names rather than old ring/spiral mappings.
- **Entire design suite70/70 PASS** at17:12 local, including bundled offline loading for all fallback repos/squad sizes. **Focused design tsc PASS; owned diff check PASS.**
- Extra merged checks at17:12 local: root npm test **691 PASS /8 skipped /1 FAIL**, solely genesis/index.test.ts:168 hardcodes obsolete2-summon-0 (new decks have different IDs). Root npm run typecheck has one external diagnostic at client/edu/feedback-view.ts:134: `(event: KeyboardEvent) => void` is not assignable to EventListener. Neither file was edited; hand these to the Genesis/edu owners. Design checks are green; no claim of global green until those separate issues are fixed.
- Preserved all other shared-workspace edits. Changed only data/design/ and this required progress log; no shared/sim/server/client edits, commits/pushes, messages, service actions, new dependencies or live5173 access. Ready for take-lead review/commit.

DONE (archetypes)

## Four boss archetypes — complete
- Read docs/tasks/boss-archetypes.md and the committed BossKit.archetype / BossState.pose+airborne contract. No owned required-field errors. Simulation owns selection, movement, attacks and pose; designs follow BossKit.archetype without changing it or combat fields. Earlier always-upright/any-cycle guidance below is superseded.
- Viewed all five original boss references. Added design/archetypes.ts in place of old design/kaiju.ts: four original material/silhouette/preset directions,12 source-noun title templates per form, distinct palettes/growths, core lore and actual TODO/commit taunts. Kaiju: teal/cyan saurian, bracket fins, stomp/roar/breath. Hydra: golden wings, branching necks, alternating head beams/dive. Mecha: silver panels, red visor, rocket fists/missiles/vents. Abyssal: black crystal coils, red/cyan veins, burrow/eruption/shatter.
- Gemini receives explicit archetype identity, selected preset animation vocabulary and shared phase3 corruption direction. It must follow sim pose/head/airborne state and preserve supplied attack kinds; no copied film character names/sprites. Names/epithets/intros/taunts match the chosen form and retain exact code evidence.
- Schema and runtime validation constrain body hints: hydra→hydra, mecha→machine, abyssal→serpent; kaiju has local armor variants. Source/cycle traits cannot override the sim's selection. Boss-only cache recipe now includes archetype, so former upright-only designs and other presets cannot collide. Hero fingerprints/code weapon names remain unchanged.
- Regenerated30 public designs against current fallback profiles/kits using `npx tsx design/precompute.ts --force --offline --require-dna`: **4 kaiju /3 hydra /3 mecha /5 abyssal**. All15 boss names/epithets remain distinct; repo names never repeat in the title suffix. Actual examples: `LODASH, DORSAL KING OF RUN IN CONTEXT`; `REACT, MANY MAWS OF SHARED RUNTIME`; `RIPGREP, THE DIRS OVERCLOCK`; `FLASK, BURROWER OF MAKE RESPONSE`. Hero JSONs unchanged. Manifest truthfully records fallback provenance; no provider calls.
- Preserved codex-sim's attackFlavorPicker, canonical source symbol allocation and reconcileCodeNames paths. Tests check source identifiers, all four body/prompt/schema/lore directions, authority over conflicting source traits, immutable combat fields, per-archetype memory/disk cache separation, unique names and offline bundled loading at every squad size.
- **70/70 design tests PASS; focused design tsc PASS; full npm test611 PASS /8 optional skips** (50 passed files /3 skipped); owned git diff --check PASS. Workspace `npm run typecheck` has one remaining error outside this ownership: **server/rooms.test.ts:47** fake makeBoss return is missing required BossKit.archetype. That file was left to its owner. No design errors remain.
- Only design/, data/design/ and this required progress log changed for this card. No shared/sim/render/server edits, commits/pushes, messages, dependencies, server start/stop or live5173 access. Actual behavior/pose implementation and visual acceptance belong to sim/renderer owners; this card supplies art/flavor and does not claim runtime animation proof.
- Handoff: if subsequent sim work changes preset attack kinds/decks, rerun the offline precompute command with the final kits before deployment; bundled acceptance tests cover the saved name maps and identities. The current kit inputs and full suite are green.

DONE (kaiju prompts)

## Kaiju prompts follow-up
- Completed the remaining fallback gap: body selection is now repo-driven, and taunts use kaiju actions grounded in real source evidence. The renderer retains its common upright Godzilla-inspired silhouette for every body enum.
- Any real dependency cycle, including a single cycle, yields hydra extra-head flavor. Real root/tree symbols yield rooted bark/spines; systems languages, allocator/compiler symbols or kernel/enterprise themes yield mech plating; remaining old/legacy code yields mossy tree variants. Neutral repos choose another kaiju variant by seed. Matching moss/spikes or cable/gear growths reinforce those hints.
- Prompt explicitly asks for stomping, roaring, charging dorsal plates and `</>` breath tied to exact identifiers/TODOs/commit subjects. Offline taunts now include `Tail stomp: <real TODO>`, `Dorsal scars: <real commit>`, `ROAR! <symbol>() shakes beneath my feet.`, `Dorsal plates charging: <symbol>()`, and `</> breath burns <symbol>().` Epithets name the real symbol fueling the chest reactor; intros retain the actual heart file and code line.
- Boss-only art cache recipe bumped and includes language/theme variant inputs. DNA-derived unique boss names and hero code names are stable; no gameplay stats, attacks, cooldowns, HP, hitboxes or budgets changed.
- Preserved codex-sim's `attackFlavorPicker`, canonical symbol allocation and reconcileCodeNames paths during its concurrent expanded-pool work. Its progress now says DONE (attack flavor), and all source-prefix/name-repair tests remain green.
- Regenerated **30 bundles /15 repos** offline against the current inputs. Actual variant distribution: **6 hydra /5 machine /3 tree /1 golem**. All remain kaiju hints. Saved example: Flask is `tree`, lore `A bark-armored, root-spined kaiju; app() fuels the chest reactor.`, with `ROAR! app()...` and `</> breath burns app().`; Redis is mech-plated with `sdslen()`; Django is a many-headed hydra with `__init__()`.
- **Final checks at16:47 local: 59/59 design tests PASS; full npm test592 PASS /8 skipped** (49 passed files /3 skipped); **npm run typecheck PASS; git diff --check PASS**. Coverage includes all9 supported variant hints, single-cycle priority, actual root/allocator symbols, systems/age selection, kaiju taunts in every saved bundle, cache inputs, immutable kits, unique names and existing code-weapon/source-name constraints.
- Feishu references/brief are complete and unchanged. Only design/, data/design/, and this required progress log changed. No commits/pushes, shared/render/sim/server edits, external messages/provider calls, server start/stop or live5173 access.

DONE (feishu refs)
DONE (earlier kaiju flavor)

## Feishu hero-reference retrieval
- Read lark-shared and lark-im skills. Use ~/.local/bin/lark-cli with both notifier-suppression env flags.
- Find the user's two recent image messages, prefer bot-readable chats/p2p before requiring user auth, download originals to docs/design-refs/, inspect both, and write a concrete style/proportions/palette brief for claude-player.
- User explicitly authorized docs/design-refs/ for this card. No Feishu messages, commits/pushes, or live server actions.
- Retrieved both original PNGs as bot through the existing codex bot p2p conversation. Native read-only lookup `POST /open-apis/im/v1/chat_p2p/batch_query` works with bot identity even though the CLI's `--user-id` shortcut rejects it; its documented CLI-source parameters are `chatter_id_type=open_id` and `chatter_ids`.
- Confirmed actual sender 林海阔 is `ou_3db23cf05c03b4942c355797cc88e8f9`; the initially suggested ID had no messages in the last-hour window. Correct p2p chat: `oc_e0decba894219dffa8d4868c05aad646`. Latest two image messages at16:27 are positions373/372, IDs `om_x100b62e5045ed0a0b07dc523cfcb3cf` / `om_x100b62e504446ca0ce429232c8d7f5b`.
- Saved `docs/design-refs/hero-1.png` (600×667,353970 bytes) and `hero-2.png` (1100×700,723585 bytes), newest first. Viewed both and verified both PNGs; original bytes preserved. No login/USER ACTION required and no messages sent.
- Wrote `docs/design-refs/README.md` with image links, message provenance, exact dimensions/checksums, observed Duelyst-style armor/proportions/palettes, concrete details for claude-player, and a6-point Gitzilla translation brief. Visual observations are separated from implementation proposals.
- Honored coordinator's design/ index freeze while codex-sim applies reconcileCodeNames. Feishu implementation touched only docs/design-refs/ and this required progress log.

## Kaiju flavor completed
- Started only after completing the Feishu reference download/brief. Confirmed codex-sim's progress explicitly marks its authorized design exception DONE and documents reconcileCodeNames in validation/direct apply. Preserved its imports, attack/limb normalization and tests while editing the prompt/cache boundary.
- Boss prompt/schema now treat all9 body enums as variants on one Godzilla-inspired upright reptilian anatomy: massive chest, powerful legs, clawed arms, distinct jaws, dorsal plates and a heavy tail. Hydra means multiple heads; machine means mech plating/reactors; tree means bark/root spines; the other variants retain the same kaiju outline.
- Offline epithets/intros now describe kaiju chest reactors, charging dorsal plates and atomic code breath, retaining actual heart/code evidence and existing unique repo-derived names. Example Flask lore: `A long-necked, whip-tailed kaiju; 5 code-limbs guard the chest reactor.`
- Added boss-only prompt/art cache versioning separate from the DNA name seed: old monster-prompt caches are invalidated, while hero art and distinctive boss names stay stable.
- Regenerated **30 bundles /15 repos** via `npx tsx design/precompute.ts --force --offline --require-dna`, with truthful fallback provenance. No live Gemini calls or new dependencies.
- **58/58 design tests PASS**, including all9 variant lore cases, model prompt anatomy/variant guidance, independent art-cache versioning, saved bundles, code weapon names, distinct source attack/limb repair, and stats preservation.
- Final merged workspace at16:39 local: **npm test587 PASS /7 skipped** (49 passed files /3 skipped), **npm run typecheck PASS**, owned `git diff --check PASS`. Earlier other-owner weapon-fixture/layout/typecheck failures are resolved in this merged run.
- No renderer/sim/shared/server changes, commits/pushes, Feishu messages, server start/stop, or live5173 access. Hero reference files remain original and verified; no visual runtime rendering proof is claimed for the prompt-only kaiju change.

## Code-expression weapon names
- Implemented coordinator's max-24-character code-expression rule in Gemini instructions, optional JSON schema and runtime validation. Shared HeroDesign.weaponName is now used directly through a compatibility alias; the earlier contract request is resolved.
- Public prompts include the exact signature/identifier pool and code-construct examples for the actual language/kind. The validator requires a whole real identifier from signature/top identifiers/component symbols, a recognized weapon construct, complete delimiters and a language-appropriate expression form. Identifiers cannot be substituted, substring-matched, or supplied only inside a string literal.
- Rejects old labels (`Promise Blaster`, `yield Staff`, `printf() Pistol`), wrong-language forms, malformed calls/macros, pointer/macro syntax borrowed into JS, incomplete/overlength expressions, and invented identifiers. Oversize expressions are rejected whole rather than cut to24. Nothing is executed and no dependencies were added.
- Invalid/omitted Gemini names preserve sim's deterministic code name. The validator accepts **all15 current sim names unchanged**. Old/incomplete kits have small expression compatibility fallbacks; absent/oversized source can preserve honest sim seed-literal expressions instead of inventing an identifier.
- `applyHeroDesign` also rejects prose at its name-only boundary and still preserves projectiles, muzzle/impact, WeaponKind, every stat and private request isolation. Source-aware validation remains in `validateHero`, which has the complete profile/language context.
- Bumped only the hero cache recipe to invalidate old English weapon-name bundles without rerolling boss DNA/names. Regenerated all30 assets with `--force --offline --require-dna`; only hero JSONs and hero manifest keys changed for this card.
- Saved names are **15/15 unique**, all use real whole repo symbols and all are valid under the language/kind gate; longest is **23 characters**. Examples: Flask `yield from create_app()`, ripgrep `alloc(name_long())`, Express `accept().then(fire)`, Gin `go burst(Data)`, Redis `#define SPRAY(list)`, Spring Petclinic `addVisit.stream()`.
- **54/54 design tests PASS**, including18 coordinator example language/kind forms, invalid-model mocked REST fallback, no truncation, actual source matching, immutable name-only application, legacy compatibility, cache stability, and real saved-bundle uniqueness/sim-name preservation. Focused strict typecheck and owned-file `git diff --check` PASS. Workspace typecheck passed at16:22; the latest16:23 run is blocked by a parallel anatomy change in other-owner `sim/regions.ts:18` (concat infers limb radius literal13 and rejects core radius19).
- Full workspace suite at16:22 local: **558 PASS /4 FAIL /7 skipped**,45 passed files /2 failed /3 skipped. All design tests pass; the four other-owner failures are triaged below. No other-owner files, shared contracts, credentials, commits/pushes, server start/stop, or live5173 access.

### Current integration/test handoffs
- **Genesis owner/coordinator:** `genesis/index.test.ts:64` still supplies/expects `Actual Weapon`, which is now intentionally rejected. Use a real code override, e.g. `blast(name_long())`, and assert that full code string. `genesis/index.test.ts:82` hardcodes `unsafe{} Cannon`; derive the expected value from the kit's new deterministic `code.weapon.name` instead. Implementation is correctly surfacing `alloc(name_long())`.
- **claude-boss / codex-sim:** `client/render/boss/layout.test.ts:28` fallback x differs from sim regions by11.13px; line41 expects old `blob` while current layout reports `kaiju`. These are the active upright-kaiju anchor/anatomy transition, outside design ownership.
- **codex-sim:** latest root typecheck fails at `sim/regions.ts:18` because concat's inferred limb element type has `r:13` and the heart element has `r:19`; widen the region element's radius type (or assemble the typed regions array). No design-module errors; focused design tsc passes.
- **Client owners:** preserve all24 characters and original identifier case when presenting weapon names; slicing at20 or uppercasing code changes its syntax/source identity. Sim's log identified `client/genesis/demo.ts:28` and `client/render/player/index.ts:1482` as places to check.
- Existing server name-forwarding handoff below still applies if its refinement boundary has not yet been updated. No server/client/genesis edits made by this owner.

## Earlier code flavor delivery / QA-DESIGN-02 (historical 20-character labels)
- Read `docs/tasks/code-flavor.md` and the current shared contract. Own section: optional Gemini weapon renaming and deterministic fallback weapon names, mapped only into `kit.code.weapon.name`.
- **Contract request to coordinator:** add `weaponName?: string` (max 20 chars) to `HeroDesign`. The current shared file has `PlayerKit.code.weapon` but not this HeroDesign field. Using a local structural extension until that lands; no shared edits.
- Implemented optional schema/prompt field, bounded validation/fallback name, and cosmetic-only apply mapping. Gemini sees the existing code weapon vocabulary and may return a name of at most 20 characters. Missing/invalid names use sim's existing language-aware name; seven construct-name defaults support old kits.
- Preserved sim-owned projectile glyphs, muzzle/impact labels, weapon kind, and every stat. Old designs remain accepted and old kits never get incomplete weapon objects. Private/credentialed request guards remain unchanged. No portrait/motion work was owned here or interrupted.
- Hero-only cache recipe accounts for weapon kind/language/glyphs/FX; a rename alone does not reroll art. Boss DNA/epithet generation is independent of this hero-only addition.
- Sim's language-aware vocabulary is in all regenerated hero JSONs: e.g. `unsafe{} Cannon`, `goroutine SMG`, `Promise Blaster`, `as any Blaster`, `yield Staff`, `#define Shotgun`, `Stream Beam`.
- **QA-DESIGN-02 resolved:** the two-minute watcher observed the exact `DONE (round 2b)` marker at **19:25:49 UTC**, then regenerated all **30 designs / 15 repos** against those final source snapshots with `--force --offline --require-dna`. The analysis owner subsequently moved to Genesis progress-events work; round-2b completion remains recorded in its file. Both temporary watchers are stopped/exited; none remain running.
- Included coordinator's further naming correction: title suffixes must never contain the repo name, even embedded in source identifiers. Generic/repo-name heart paths now fall through to the real longest function, identifiers, TODO words or tokens. Longest-function data participates in the bumped cache recipe, invalidating stale names.
- Regenerated once more after this naming correction. Saved examples: **`FLASK, THE MAKE RESPONSE TYRANT`** (real `make_response`), `LODASH, GUARDIAN OF LOST RUN IN CONTEXT` (real `runInContext`), `RIPGREP, THE DIRS COLOSSUS`, `FASTAPI, THE TEST OPENAPI LEVIATHAN`. All **15 saved epithets are distinct** and contain no repeated repo name.
- **Final checks at 15:27 local:** design suite **34/34 PASS** including the previously failing bundled-asset test; full `npm test` **323 PASS / 6 skipped** (30 passed files / 3 skipped); `npm run typecheck` **PASS**; owned-file `git diff --check` **PASS**. Tests cover weapon-name bounds/optionality, fallback vocabulary, name-only application, legacy compatibility, actual prompt payload, cache behavior, saved-bundle uniqueness/no-repo-name assertions, and longest-function-derived titles.
- Stayed within design/, data/design/, and this log. No commits/pushes, dependencies, shared/server/sim/render edits, server start/stop, live/5173 access, or new live Gemini requests. Asset provenance remains truthful `fallback`.

### Code flavor handoff to codex-net / coordinator
- Public `designHero` now returns `HeroDesignWithWeapon` (`HeroDesign & { weaponName?: string }`); `applyHeroDesign` accepts both this extension and legacy HeroDesign objects.
- Please add `weaponName?: string` to shared HeroDesign when merging contracts. The local extension already works at runtime; I did not edit shared/.
- **Server boundary update needed:** current `RoomServer.refineHero` copies only `design/title/palette` from the decorated kit, discarding the renamed `code.weapon.name`. Copy only that extra name while retaining the current weapon's glyphs/FX and all gameplay values:

```ts
const current = member.lobby.kit;
member.lobby.kit = {
  ...current, design: decorated.design, title: decorated.title, palette: decorated.palette,
  ...(current.code?.weapon && decorated.code?.weapon ? {
    code: { ...current.code, weapon: { ...current.code.weapon, name: decorated.code.weapon.name } },
  } : {}),
};
```

- Sim owns complete language-aware weapons. Fallback designs retain `kit.code.weapon.name` when available, otherwise use a 7-kind construct-name compatibility table. No projectile/muzzle/impact generation is duplicated in design/.
- Bundles are regenerated for the current sim vocabulary and final round-2b profiles. If those inputs change again, regenerate using `npx tsx design/precompute.ts --force --offline --require-dna` so saved hero names and fingerprints match.

## Earlier round-2 follow-up (historical names and validation)
- Polled `docs/progress/codex-repo.md` at two-minute intervals: 19:11:31 UTC and 19:13:31 UTC showed IN PROGRESS; **19:15:31 UTC showed DONE (round 2)**. Only then regenerated every asset with `npx tsx design/precompute.ts --force --offline --require-dna`. Poller completed and exited.
- Regenerated **30 designs / 15 repos** against codex-repo's final parser-quality snapshots. The previously failing `ships valid hero/boss assets for every fallback repo` test now passes, including actual bundled cache-key/provenance checks.
- Implemented `design/names.ts`: 16 base title phrases plus traversal/model/web/database/reactive/cycle/legacy/TODO/commit motifs, using real heart-path words or source identifiers as the subject. **All 15 saved boss epithets are distinct**, independently of repo prefixes. No global registry or player-count dependence.
- Actual saved examples: `RIPGREP, GUARDIAN OF LOST DIRS`; `FLASK, GATEKEEPER OF FLASK`; `REACT, THE SHARED RUNTIME WRAITH`; `DJANGO, THE UNFINISHED DB`; `REDIS, BREAKER OF SDSLEN`; `SPRING-PETCLINIC, ORACLE OF NAMED ENTITY`.
- Fingerprint recipe now includes the title recipe, heart path, age, cycles and bounded DNA, so old public caches/bundles cannot retain repeated names after the update.
- Regression checks cover distinct computed AND saved suffixes, exact saved fallback names, squad-size stability, heart-derived subjects, and age/cycle cache invalidation.
- Final checks at 15:15 local: **27/27 design tests PASS**, **npm test: 256 PASS / 6 skipped** (26 passed files / 3 skipped), **npm run typecheck PASS**, and owned-file `git diff --check` PASS.
- No commits/pushes, shared/analysis/sim/server edits, server start/stop, or live/5173 access. Generation stayed offline; all asset provenance remains `fallback`.

## Round 2 delivered
- Read `docs/tasks/round2.md` and the new CodeDNA/kit contracts. Scope remained `design/`, `data/design/`, and this log; no commits, new dependencies, or edits to shared/analysis/server/sim/renderers.
- Both public Gemini prompts now include bounded real identifiers, component symbols, heart lines, snippets, TODOs, commits, tokens, and limb symbols. Prompt instructions ask for exact source quotes in names/taunts/emblems while preserving cute heroes and monstrous bosses. Balance values and squad size are absent.
- Deterministic fallbacks use real identifiers for hero identity, tokens for emblems, component/limb symbols for limb and attack names, TODOs and commit subjects for taunts, and available heart lines for intros. `kit.code` works when profile DNA is absent. When profile DNA is present, it takes precedence over stale kit symbols, including empty/missing symbol groups.
- Optional third argument `{ private: true }` or `{ credentialed: true }` to `designHero`/`designBoss` returns local fallback before shared memory/pending jobs, assets, disk, credential lookup, fetch, or observer callbacks. No token parameters. Existing server-side exclusion of credentialed refinements remains necessary because RepoProfile has no visibility field.
- Public cache is now `v2` plus a SHA-256 source fingerprint, independent of squad size. Bundled manifest v2 stores per-kind keys; legacy v1 and changed-source entries are ignored. Cache/art application preserves kit.code and all gameplay stats.
- Added robustness fixes for control-only text, empty JSON objects incorrectly recorded as successful Gemini designs, and observer callbacks causing duplicate requests/failures. Source text gets a small secret-shaped-line filter at the public prompt/fallback boundary in addition to the extractor's filtering.
- Waited for codex-repo's actual CodeDNA snapshots, then regenerated **all 30 assets for all 15 repos** with `npx tsx design/precompute.ts --force --offline --require-dna`. The readiness watcher completed and exited. `--require-dna` fails when identifiers/tokens are absent. Every profile now has 12 source tokens and 21–24 real identifiers.
- All regenerated assets have `source: "fallback"` in manifest v2: real-code-derived deterministic art, **not successful Gemini generation**. No live Gemini requests were made in round 2; earlier provider HTTP 402 evidence remains historical, and successful live Gemini generation is still unverified.

### Round 2 verification
- `npx tsc --noEmit -p design/tsconfig.json`: **PASS**.
- `npx vitest run design/index.test.ts`: **25/25 PASS**. Coverage includes public DNA prompts, seeded real-code fallback, kit.code-only inputs, private isolation, source-change/legacy cache invalidation, malformed model output, request timeout/retry, stats preservation, and actual `precomputed` loading for all 30 source-backed bundles at 8-player boss scale.
- `npm test`: **232 passed / 7 skipped**, 26 passed files / 3 skipped files, on the merged workspace at 15:06 local.
- `npm run typecheck`: passed after other owners completed the required state-field updates. No typecheck fixes were needed outside this owner's files.
- Shared DEV smoke: `GET http://localhost:5175/` = 200 HTML, `/api/fallbacks` = 200 with 15 repos. Did not start/stop a server or access port 5173. `git diff --check` passes for owned files.

### Round 2 actual source examples
- Flask hero: `"title": "app Byte Mage"`, `"emblem": "="`, `"catchphrase": "app() saves the party."` — `app` and `=` come from Flask's source fingerprint.
- Ripgrep boss: limb `"build Mandible"`, attack `"new() charge"`, heart intro `"fn strip<'a, P: 'a + AsRef<Path> + ?Size"`, taunts `"Known bug: TODO: In the next semver breaking release, we should"` and ``"Recent sin: cargo: remove the `homepage` field"`` — bounded real symbols, heart code, TODO, and commit subject from its fingerprint.

### Round 2 handoff to codex-net / coordinator
- Existing public `designHero(profile, kit)` / `designBoss(profile, kit)` calls remain compatible and now include DNA automatically. Keep the existing `if (!credentialed) refineHero(...)` boundary.
- If any future path calls design for private/credentialed profiles, pass the third argument `{ credentialed: true }` (or `{ private: true }`); do not pass credentials. Only return this local result to its room. Never export it to Hall or public persistence.
- `applyHeroDesign`/`applyBossDesign` preserve `kit.code` and all gameplay stats. No server/shared changes needed from this owner.
- All 30 source-derived bundles are ready now. If source snapshots or kit.code derivation change again, rerun `npx tsx design/precompute.ts --force --offline --require-dna` before final gates so their fingerprints match. Use `--force --require-dna` without `--offline` only when Gemini access is available and live art direction is desired.

## Round 1 historical progress and evidence

Implemented the Gemini appearance/flavor service, deterministic fallback, count-independent disk cache, validated offline assets for all 15 repos, 16 tests, and exact server handoff. **External limitation:** both configured Gemini models return HTTP 402; all 30 bundled designs are explicitly marked seed fallback, and successful live Gemini generation is unverified.

Scope: `design/`, `data/design/`, and this progress file only. No shared edits, dependencies, or commits.

## Current infrastructure rule
- Port **5173** is the stable live production server from `../gitzilla-live`, serving `https://gitzilla.wilflin.me`. Never start, stop, or test against it.
- All future playtests, smokes, and screenshots use the shared development server at **http://localhost:5175** (herdr pane `wQ:pT`), including `SMOKE_URL` / playtest `--base` overrides.
- Only the coordinator deploys to live. Earlier ephemeral-port smoke results below are historical, before this infrastructure change.

## Coordinator follow-up: Gitzilla rebrand
- Updated the art-director prompt and design README title to **Gitzilla**.
- Verified no old product-name strings remain in `design/`, `data/design/`, or this progress file. Creature terminology remains Kaiju where appropriate.
- No commits, pushes, credentials, or new tracked secret files.

Read `docs/BRIEF.md`, `shared/types.ts`, and `docs/tasks/codex-gemini.md`.

## Done
- Checked existing kit derivation, server lobby flow, and all 15 fallback profile filenames.
- Confirmed Gemini REST structured-output fields against https://ai.google.dev/api/generate-content.
- Implemented REST design service, schemas, sanitization, deterministic fallback, count-independent cache, bundled asset loading, and immutable appearance application.
- Added `design/precompute.ts` and mocked-fetch/offline/cache/credential/stat-preservation tests.
- First focused typecheck found JSON fixture inference (`number[][]` versus tuple edges); corrected the test fixture type.
- Precomputed 30 valid JSON designs for all 15 offline repos; `data/design/manifest.json` truthfully records fallback provenance.
- Live hero and boss generation attempted for `burntsushi/ripgrep`, `facebook/react`, and `pallets/flask`; all returned deterministic fallback. Key lookup succeeded. Separate minimal REST probes to both `gemini-3.8-flash` and `gemini-3.1-flash-lite` returned HTTP **402**. Successful Gemini art generation remains externally blocked; no keys or provider bodies were logged.
- Final full test run passed: **129 passed, 2 skipped**, across **15 passed test files and 1 skipped file**; includes all **16 design tests**. Bundled-asset verification covers all 15 repos, hero/boss schema normalization, complete attack/limb IDs, and offline retrieval with eight-player boss kits.
- `npx tsc --noEmit -p design/tsconfig.json` passes. `npm run typecheck` passes on the final workspace. An earlier UI nullable-node error was fixed by its owner; I did not edit it.
- `PORT=0 npm run dev` starts successfully without taking the team's 5173 port. HTTP smoke on its selected port 41411 returned `/` = 200 HTML and `/api/fallbacks` = 200 with 15 repos. Watcher restarts during other-agent server edits changed the initial ephemeral port; retried against the active port. Temporary dev process stopped after the check.
- Bundled-asset normalization caught a trailing space on a truncated fallback title; fixed fallback/validator trimming, regenerated all assets, and reran checks successfully.

## Remaining external/integration work
- codex-net owns applying the ready-to-use handoff below in `server/rooms.ts`.
- Restore Gemini provider access after HTTP 402, then run `npx tsx design/precompute.ts --force` to replace fallback assets with actual Gemini art direction. No secrets were logged, and no successful generation is claimed.

## Contract requests
None. Optional `RepoProfile.readme` and `tree` already exist in the shared contract.

## Handoff to codex-net
Ready to integrate now. This module does not edit server/sim/renderers. Import in `server/rooms.ts`:

```ts
import { designHero, designBoss, fallbackHero, fallbackBoss, applyHeroDesign, applyBossDesign } from '../design/index.ts';
```

Keep the lobby immediately ready as requested in codex-net's coordinator follow-up. In `setRepo`, after `analyzeRepo` resolves and the existing revision check succeeds, create the immediate seed appearance and schedule the cosmetic update:

```ts
const base = this.services.playerKitFromProfile(profile);
const kit = applyHeroDesign(base, fallbackHero(profile, base));
member.lobby = { id: member.id, name: member.name, repo: profile.slug, status: 'ready', kit };
void designHero(profile, base).then(design => {
  if (revision !== member.revision || room.phase !== 'lobby' || !member.lobby.kit) return;
  member.lobby.kit = applyHeroDesign(member.lobby.kit, design);
  this.broadcastLobby(room);
});
```

Leave the existing `broadcastLobby(room)` at the end of `setRepo` so the ready state is sent immediately. Gemini is **not** awaited before ready. Requests default to <=16 seconds total across primary+retry, and cache/bundled lookups are fast. A fight started before generation finishes keeps its immediate fallback art.

In `setBoss`, after `analyzeRepo` and the existing boss revision check, replace the kit construction/ready assignment with:

```ts
const base = this.services.bossKitFromProfile(profile, Math.max(1, connectedPlayers(room).length));
const kit = applyBossDesign(base, fallbackBoss(profile, base));
room.bossProfile = profile;
room.boss = { repo: profile.slug, status: 'ready', kit };
void designBoss(profile, base).then(design => {
  if (revision !== room.bossRevision || room.phase !== 'lobby' || !room.boss.kit) return;
  room.boss.kit = applyBossDesign(room.boss.kit, design);
  this.broadcastLobby(room);
});
```

Keep the existing final lobby broadcast here too. In synchronous `start(room)`, rebuild squad-scaled gameplay stats as usual, then reapply the lobby design **before** `createMatch`:

```ts
const base = this.services.bossKitFromProfile(room.bossProfile, players.length);
const appearance = room.boss.kit?.design ?? fallbackBoss(room.bossProfile, base);
const boss = applyBossDesign(base, appearance);
// existing createMatch(..., boss); room.boss.kit = boss; ...
```

No network or await in `start`; cached/bundled appearance stays identical across 1/4/8 players. Attack and limb IDs stay unchanged; only `attacks[].name` changes. Players retain their already-designed lobby kits. No `GameServices` changes required with these direct imports.

Renderer consumers: `PlayerKit.design` includes archetype/headgear/accessory/emblem/catchphrase; `BossKit.design` includes body/eyes/mouth/growths/epithet/intro/taunts/limbNames. Kit title/name/palette/theme/attack names have already been merged by the apply helpers. Both preserve the existing seed.

After provider HTTP 402 is resolved, regenerate real Gemini assets with:

```sh
npx tsx design/precompute.ts --force
```

## Live verification evidence

Command executed:

```sh
npx tsx design/precompute.ts --force pallets/flask facebook/react burntsushi/ripgrep
```

Each of the three repos was exercised once for each design kind (hero + boss), with the built-in one lite retry on request failure. Observed output:

```text
burntsushi/ripgrep: hero=fallback, boss=fallback
facebook/react: hero=fallback, boss=fallback
pallets/flask: hero=fallback, boss=fallback
Wrote 6 designs for 3 repos.
```

Separate minimal `generateContent` diagnostic requests, using the same credential lookup without printing the key, returned:

```json
{"keyAvailable":true}
{"model":"gemini-3.8-flash","status":402}
{"model":"gemini-3.1-flash-lite","status":402}
```

All-repo offline generation: `npx tsx design/precompute.ts --force --offline` wrote 30 designs across 15 repos. The manifest contains the exact seed and `source: "fallback"` per kind. Actual successful Gemini generation remains PENDING because of the provider response above.

## Sample hero JSON

`data/design/pallets__flask.hero.json` — deterministic seed fallback, **not Gemini-generated**:

```json
{
  "title": "flask Byte Mage",
  "archetype": "mage",
  "headgear": "bandana",
  "accessory": "rubber-duck",
  "emblem": "R",
  "palette": ["#355b99", "#65b8ed", "#ffdda1", "#ffe36c"],
  "catchphrase": "I brought a rollback."
}
```

## Sample boss JSON

`data/design/pallets__flask.boss.json` — deterministic seed fallback, **not Gemini-generated**:

```json
{
  "name": "FLASK, THE UNMERGED",
  "epithet": "Its 5 limbs feed the sleepless heart of src/flask/__init__.py.",
  "body": "serpent",
  "eyes": 12,
  "mouth": "maw",
  "growths": ["moss", "gears"],
  "palette": ["#211329", "#465b72", "#ff547b", "#bb83ef", "#fff4bd"],
  "theme": "notebook",
  "intro": [
    "$ git clone pallets/flask",
    "[##########] architecture awakened",
    "FATAL: src/flask/__init__.py"
  ],
  "taunts": ["Your PR has conflicts.", "There is no base case.", "Works on my machine."],
  "attackNames": {
    "0-ring-0": "Segfault Halo",
    "0-slam-1": "Core Dump",
    "1-summon-0": "Bug Factory",
    "2-ring-0": "Exception Orbit",
    "3-spiral-0": "Stack Overflow",
    "4-ring-0": "Exception Orbit"
  },
  "limbNames": {
    "limb-0": "flask Claw",
    "limb-1": "tests Tendril",
    "limb-2": "examples Mandible",
    "limb-3": "docs Coil",
    "limb-4": ".devcontainer Claw"
  }
}
```
