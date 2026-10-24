# Genesis data

```ts
import { buildGenesis } from '../genesis/index.ts';
const genesis = buildGenesis(profile, finalKit, 'hero'); // or 'boss'
```

Pure synchronous TypeScript; no network, storage, credentials, logging, or dependencies.
Accepts a room's analyzed `RepoProfile` and its **current** kit, including any applied
design. Rebuild after a design update or boss player-count rescale. This module does
not emit progress events; analysis and server own that stream.

`trace` follows kit rules and uses stable limb/attack IDs as `ref`. `sampleFiles`
uses only supplied paths (up to 40); absent DNA produces empty source samples and
zero extracted function/TODO counts. No placeholder source code or guessed paths.
Source excerpts are filtered for recognizable credentials before truncation; extra
fields on the profile/kit are never copied. Private source stays in the room:
do not persist Genesis or submit it to Gemini/Hall/analytics.

Hero `budget` values are actual decoded stat points, summing to **5**, in order
hp/armor/energy/speed/damage. Boss values are **percentages of the one normalized
anatomical attack budget**, grouped by component and summing to **100**. These are
different units; neither uses raw HP as stat points. Boss health still scales with
the squad, independently of repository size.

Payloads target at most 12 KiB UTF-8 JSON: optional file/snippet samples are reduced
first, then trace captions shortened while retaining each mapping step. Current
15 fallback repos, base and fallback-designed hero/boss kits (60 payloads), range
from 2,944 to 9,154 bytes. Compact labels may be shortened; source samples never
contain fabricated content.

Current renderer defaults use seed-based eyes/scars; a supplied design sets its eye
target. Contributors/commits are shown without inventing a missing formula. TODOs
label bugs, while `summon.params.count` determines bugs per cast.

Verification: `npx vitest run genesis` and
`npx tsc -p genesis/tsconfig.json --noEmit`. A separate config is included because
the root config currently lists owned directories explicitly; server imports will
also bring this module into the root check once wired.
