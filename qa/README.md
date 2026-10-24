# Round 2 robustness QA

Owned by `codex-qa`. Findings, owners and final evidence: [`docs/progress/codex-qa.md`](../docs/progress/codex-qa.md).

No new dependencies. Scripts use installed `tsx`, `vitest`, `ws` and Playwright. No product source changes or commits. DEV entry points accept **only local HTTP port 5175** (`QA_URL` may select a loopback hostname); redirects are rejected by HTTP probes. They never start, stop or deploy a server.

```sh
# Normal regression checks; known failing reproductions remain opt-in.
npx vitest run qa/
npx tsc -p qa/tsconfig.json

# These intentionally fail until their product owners repair the bugs.
QA_REPRO=1 npx vitest run qa/reconnect.test.ts qa/robustness.test.ts
npx tsx qa/protocol.ts
npx tsx qa/takeover.ts

# Five-second 8-slot scheduling/ack probes on DEV.
npx tsx qa/snapshot-rate.ts
QA_BOTS=7 npx tsx qa/snapshot-rate.ts

# Real browsers against DEV, desktop + primary portrait phone (DPR 3).
npx tsx qa/browser.ts

# Focused natural-autopsy/same-player reload check (~20 seconds when DEV is stable).
npx tsx qa/autopsy.ts

# If DEV restarts keep interrupting fights: actual DEV UI with a real isolated
# RoomServer/sim socket, HMR suppressed. Supplemental UI acceptance only.
QA_ISOLATED=1 npx tsx qa/autopsy.ts

# Portrait-only phone pass after claude-ui lands the camera/deck.
# Exits 2 with WAITING_FOR_LAYOUT if only the old full-arena layout is present.
npx tsx qa/portrait.ts
QA_PORTRAIT_SIZES=360x640 npx tsx qa/portrait.ts
QA_PHONE_SIZE=360x640 npx tsx qa/autopsy.ts

# Offline, real RoomServer + real simulation, natural defeats and rematches.
node --expose-gc --import tsx qa/soak.ts

# Same 20 matches at real 30Hz/20Hz timing (~6 minutes).
QA_REALTIME=1 node --expose-gc --import tsx qa/soak.ts
```

`qa/artifacts/<kind>-<timestamp>/summary.json` is the evidence for each script. Browser checks save PNGs; failures include visible test IDs. Browser exit code 2 means a server restart made a failed stage inconclusive; exit code 1 means a failure. Protocol/repro failures exit nonzero. Credentials and resume tokens are never written to artifacts.

- `protocol.ts`: actual DEV WebSocket lobby/resume, spam, invalid/200KB repo values, 8 humans displacing bots, ninth human rejection, ownership, match resume, input expiry, malformed aim.
- `browser.ts`: real UI actions and traffic, slow loading, owner transfer after reload, freeze/wake, match reload, keyboard ack, phone rotation, natural defeat/autopsy reload. No fabricated result or direct input-frame injection.
- `portrait.ts`: 390x844 / 360x800 / 430x932 (DPR 3) and 360x640 (DPR 2), native CDP safe-area overrides, deck/control geometry, repeated rotate guards, foreground touch acknowledgements and natural portrait autopsies. Synthetic visibility/blur tests check held-control clearing because headless Chromium does not hide background tabs; CDP freeze/active is tested separately. A mock-game page is used only to gate layout readiness, and every acceptance case uses an actual DEV room. A match need not naturally end within its optional 30s end window; that is recorded separately and never forced. `QA_PORTRAIT_SIZES` selects a comma-separated subset for focused retries. `QA_PHONE_SIZE` adds a phone viewport + safe areas to the focused natural-autopsy/reload script.
- `takeover.ts`: two real tabs sharing localStorage demonstrate repeated session takeover. It creates a fresh room and closes both tabs after the short observation window.
- `reconnect.test.ts`: actual `net.ts` with deterministic timers/sockets reproduces the visibility/retry overlap and close-4001 retry.
- `upstream.test.ts`: actual analysis entry points with injected 403/404/429/503/offline/slow/oversized-archive failures; dummy credential only, disk writes mocked. This does not prove real private-repo access.
- `robustness.test.ts`: actual room/sim with offline profiles, 20 accelerated matches, autopsy resumes and interval cleanup; malformed-aim failing repro.
- `soak.ts`: actual room/sim and WebSockets on an isolated ephemeral port. Reuses one room for 20 naturally completed matches, resumes every fifth autopsy, records RSS and post-GC heap after every rematch, and counts outstanding match intervals. No Gemini/auth calls or persisted Hall records. Realtime mode establishes a short wall-clock server lifecycle soak, not production load endurance.

Phone emulation does not establish physical motion permission/sensor delivery or real OS sleep. Shared DEV hot reload/restarts can invalidate a browser run; those are recorded instead of attributed to a product owner. Old artifacts are retained and explicitly superseded in the progress log.
