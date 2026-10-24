DONE (code weapon names)

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
