# Hall of Monsters

```ts
import { recordMatch, top } from './hall/index.ts';
recordMatch(autopsy, roomCode, bossRepo); // once per completed match
const boards = top();
```

Both functions are synchronous. State persists in `.cache/hall.json`, independent of the process working directory. Each record writes a unique sibling temporary file then atomically renames it over the complete JSON file. New instances/processes read the persisted state; no startup/flush hooks are required. `createHall(file)` creates an isolated instance for tests or a separate event.

`top()` returns exactly these fields; each array has at most 20 entries:

- `fastestKills`: `{ boss, squad: string[], seconds, at }`, victories only, ascending match duration. `squad` contains player names.
- `topDamage`: `{ name, repo, damage, boss, at }`, highest single-player **single-match** damage, descending; both victories and defeats qualify.
- `bossRecords`: `{ boss, wins, losses }`, team wins/losses per normalized lowercase boss repo, sorted by most encounters, then wins, then boss name. Lifetime counts are retained for every boss internally, including those outside the top 20.

`at` is an ISO UTC timestamp. Stored score entries retain `room` for provenance, omitted from `top()`. Rematches in the same room count separately. Call once per completed match: there is no duplicate-submission detection because the current Autopsy contract has no match ID.

Persistence failures throw; a match-end transport hook can catch/log that error while still delivering the autopsy. Missing storage starts empty. Malformed existing JSON reports an error rather than silently discarding previous records. No dependencies were added.

```sh
npx vitest run hall
```

Exact HTTP/match-end wiring is in `docs/progress/codex-repo.md` under `Handoff to codex-net`. Server wiring belongs to codex-net.

Classroom PvP (`autopsy.mode === 'edu'`) and any null-boss result are skipped before storage is read or created. They never affect battle damage, wins/losses, or kill records; classroom ranking remains with the classroom flow.
