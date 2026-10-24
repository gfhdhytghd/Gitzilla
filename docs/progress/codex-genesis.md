DONE — codex-genesis

Implemented the server-side pure TypeScript code → character story builder in `genesis/`.
No commits, new dependencies, shared-contract edits, or other owners' implementation edits.

## Delivered
- `genesis/index.ts`: synchronous `buildGenesis(profile: RepoProfile, kit: PlayerKit | BossKit, kind: 'hero' | 'boss'): Genesis`, plus small exported `heroBudget` / `bossBudget` explain helpers and `MAX_GENESIS_BYTES`.
- Detached real metrics, languages, components/edges/cycles, heart/fan-in, up to 40 supplied file paths and 12 real source snippets; no guessed paths/source. Absent DNA yields zero extracted counts and empty code samples.
- Ordered trace covers language/class/weapon/palette, exact skill-rule precedence, shape and every stat allocation, signature/glyphs/outfit, each component/limb, import-edge tentacles, heart, each cycle weak point, eyes/scars, TODO bug labels, EVERY attack source/kind/reason/ID and its current parameters, theme/age, final design/body/name.
- Reads final kit values; applied designs and squad rescaling are reflected without touching balance.
- Hero budget bars = five decoded stat points. Boss bars = component percentages of the one anatomical attack-share budget, total 100%; these are different units. Fixed squad health/threat and cycle-normalized 36% effective limb HP are explained separately.
- Filters recognizable credentials BEFORE truncation, whitelists output fields, never fetches/logs/persists, never accepts token/options. Private profiles work identically inside the room. Server remains responsible for keeping credentialed data away from Gemini/Hall/storage/analytics.
- Compaction sheds optional samples first, then shortens captions without dropping mappings. 60 measured base/fallback-designed payloads across 15 repos: **2,944–9,154 bytes**, comfortably below 12 KiB. UTF-8 stress case covered.
- `genesis/index.test.ts`, `genesis/tsconfig.json`, `genesis/README.md`.

## Handoff to codex-net

Import directly (no async or service initialization needed):

```ts
import { buildGenesis } from '../genesis/index.ts';
```

Exact current `server/rooms.ts` integration points:

1. `setRepo`, immediately after building the seed kit, attach BOTH kit and Genesis to the ready lobby player. Existing credential/revision guards stay in place:

```ts
const kit = this.services.playerKitFromProfile(profile);
member.lobby = {
  id: member.id, name: member.name, repo: profile.slug,
  status: 'ready', kit, genesis: buildGenesis(profile, kit, 'hero'),
  progress: { stage: 'ready', pct: 1 },
};
```

2. `setBoss`, immediately after constructing `kit`:

```ts
room.bossProfile = profile;
room.boss = {
  repo: profile.slug, status: 'ready', kit,
  genesis: buildGenesis(profile, kit, 'boss'),
  progress: { stage: 'ready', pct: 1 },
};
```

3. `refineHero`, after assigning the decorated final `member.lobby.kit` and BEFORE broadcasting:

```ts
member.lobby.genesis = buildGenesis(profile, member.lobby.kit, 'hero');
member.lobby.progress = { stage: 'ready', pct: 1 };
```

4. `refineBoss`, after merging the decorated `room.boss.kit` and BEFORE broadcasting:

```ts
room.boss.genesis = buildGenesis(profile, room.boss.kit, 'boss');
room.boss.progress = { stage: 'ready', pct: 1 };
```

5. `setBots`: build Genesis for each ready bot exactly as for a human. Preserve `bot: true` via the existing lobby spread. `refineHero` then rebuilds for the final design.
6. `start`: after regenerating boss kit for `players.length`, update `room.boss.genesis = buildGenesis(room.bossProfile, boss, 'boss')` alongside `room.boss.kit = boss`, before `broadcastLobby`, so cinematic HP reflects the actual squad. Rematches/design refreshes follow the same rule.
7. Streaming is server/analysis-owned: pass `onProgress` into analysis and broadcast per-repo updates at ~8 Hz, guarded by the same request revision. Set `map` after analysis while building kits; `design` while awaiting optional public design; `ready` at the final broadcast. Genesis itself emits no synthetic progress. A new analysis should clear old `genesis`; a failed optional design keeps the seed kit + seed Genesis ready. Preserve the existing skip of external design for credentialed profiles.
8. Root `tsconfig.json` currently enumerates directories and does not explicitly list `genesis`; server import pulls the implementation into typechecking. Coordinator may add `genesis` to the include list to cover its tests too. Scoped config already verifies both implementation/tests without editing someone else's root config.

No server edits by codex-genesis. WebSocket/client integration and visual/device proof belong to codex-net/claude-genesis and remain **PENDING** here.

## Contract requests / honest mapping boundaries
- No shared contract additions required.
- Contributors → eyes: `design/fallback.ts` clamps contributor count to 1–12 for the fallback design; Gemini may provide a different repo-informed target. Without a design, current renderer uses seed-derived target (3–8); anatomical eyes may exceed a design target. Trace explicitly reports the actual mode instead of asserting contributors mechanically set every rendered eye.
- Commits → scars: current renderer scars are seed-based. Trace reports commits as context and correctly labels scars seed-based; commit subjects supply taunt material. Renderer owner can implement literal commit-driven scars later, then update the explain text.
- TODOs label bug minions; they do NOT set minion count. Each summon trace reports `attack.params.count` (currently 3 bugs/cast).
- Hero `cape` trace describes code rows on outfit/cape and any actual design accessory; it does not promise every hero wears a cape.

## Verification
- `npx vitest run genesis`: **22/22 PASS**, all 15 fallback profiles, rule precedence/all five stat allocations, all eight attack kinds, design overrides, detached inputs, missing DNA, private credential filtering, UTF-8 payload compaction, squad-independent boss share budgets.
- `npx tsc -p genesis/tsconfig.json --noEmit`: **PASS**.
- Final `npm run typecheck`: **PASS**.
- Final `npm test`: **318 PASS, 6 SKIP**, 29 files passed / 3 skipped (concurrent teammates added tests during this run; Genesis tests all pass).
- No dev server started/restarted and no live/5173 access. This module has no browser/runtime side effects.
