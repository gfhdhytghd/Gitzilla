DONE

Implemented the Gemini appearance/flavor service, deterministic fallback, count-independent disk cache, validated offline assets for all 15 repos, 16 tests, and exact server handoff. **External limitation:** both configured Gemini models return HTTP 402; all 30 bundled designs are explicitly marked seed fallback, and successful live Gemini generation is unverified.

Scope: `design/`, `data/design/`, and this progress file only. No shared edits, dependencies, or commits.

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
