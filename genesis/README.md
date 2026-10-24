# Genesis data

```ts
import { buildGenesis } from '../genesis/index.ts';
const genesis = buildGenesis(profile, finalKit, 'hero'); // or 'boss'
```

Pure synchronous TypeScript; no network, storage, credentials, logging, or dependencies.
Accepts a room's analyzed `RepoProfile` and its **current** kit, including any applied
design. Rebuild after a design update or boss player-count rescale. This module does
not emit progress events; analysis and server own that stream.

`trace` is cinematic copy: each `from`/`to` is at most 40 characters, with rounded
percentages and comma-separated counts. Long names get an ellipsis; numeric payoffs
such as `1,703 HP` keep their space. Formulas, seed numbers and hex palettes stay
out of captions. Stable limb/attack IDs remain in `ref`.

Weapon mappings reserve the complete code expression (up to 24 characters) on the
`to` side. The language caption shortens first, keeping the whole
`from → to` mapping within 40 characters. Neither caption handling nor payload
compaction cuts a weapon token or removes a closing delimiter.

Battle heroes lead with weapon, skill, glyphs and signature (or class without a signature).
Bosses lead with their largest component's limb, heart, a cycle weak point (or eyes),
and an attack. The remaining mappings follow, with the final name reveal last, so
the first few steps already tell a story on phones.

`sampleFiles`
uses only supplied paths (up to 40); absent DNA produces empty source samples and
zero extracted function/TODO counts. No placeholder source code or guessed paths.
Source excerpts are filtered for recognizable credentials before truncation; extra
fields on the profile/kit are never copied. Private source stays in the room:
do not persist Genesis or submit it to Gemini/Hall/analytics.

Battle hero `budget` values are actual decoded stat points, summing to **5**, in order
hp/armor/energy/speed/damage. Boss values are **percentages of the one normalized
anatomical attack budget**, grouped by component and summing to **100**. These are
different units; neither uses raw HP as stat points. Boss health still scales with
the squad, independently of repository size.

For classroom PvP, pass the final edu hero kit to the same builder:

```ts
const genesis = buildGenesis(profile, eduKit, 'hero'); // eduKit.quality is present
```

`PlayerKit.quality` selects the report-card trace automatically. It leads with
armor, speed, damage and weakness, then HP, energy and regen, followed by each
concrete improvement tip. Each row pairs the sim's real `signal` with its
`stat grade · value`; Genesis never recalculates grades or changes stats. Fractional
values retain up to three decimals. Cosmetics and the final hero name follow.

`qualityTrace(quality)` is also exported for report-card-only consumers. A grade
row's `ref` is `quality:<stat>` and its tip row is `quality-tip:<stat>`. Resolve these
against `kit.quality` for the full unabridged signal/tip in lobby/autopsy detail.
Short captions retain the 40-character limit and credential filtering.

Edu `budget` is **empty**: stats are earned independently rather than sharing a
five-point pool. Display `kit.quality` for bars/grades, not the battle budget.
An empty quality array never invents grades; absent quality retains battle behavior.
Rebuild the kit and Genesis when the room mode changes. Edu needs only a hero kit;
this builder never reads `MatchState.boss` or `Autopsy.boss` and needs no boss state.

Payloads target at most 12 KiB UTF-8 JSON: optional file/snippet samples are reduced
first, then trace captions shortened while retaining each mapping step. Current
15 fallback repos, base and fallback-designed hero/boss kits (60 payloads), range
from 2,567 to 7,211 bytes. Compact labels may be shortened; source samples never
contain fabricated content.

Current renderer defaults use seed-based eyes/scars; a supplied design sets its eye
target. Contributors/commits are shown without inventing a missing formula. TODOs
label bugs, while `summon.params.count` determines bugs per cast.

Verification: `npx vitest run genesis` and
`npx tsc -p genesis/tsconfig.json --noEmit`. A separate config is included because
the root config currently lists owned directories explicitly; server imports will
also bring this module into the root check once wired.
