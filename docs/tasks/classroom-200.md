# Classroom at 200 students, with stress tests

User decision (2026-11-13): a classroom must hold 200 students, proven by stress tests.
Dispatch after the question-set work (`question-sets.md`) is merged: both touch `server/rooms.ts`.

## Current limits and hot spots (coordinator notes, verify yourself)

- `server/rooms.ts:144,149,770,1318,1357`: classroom capacity is hard-coded to 30 (battle/PvP stays 8).
- `server/rooms.ts:1329`: every classroom publish sends the full state, with every roster row, to every member.
  With 200 students and frequent answer saves this is O(students²) bytes per second.
- `server/classroom.ts:23`: boss HP scales with students (`REFERENCE_STUDENTS = 4`). Check the numbers at 200.

## Requirements (server; Codex)

1. One named constant for the classroom capacity, 200. Battle/PvP limits unchanged. Update every message and test.
2. Publishing must scale:
   - Coalesce classroom publishes per room (for example at most one every 250 ms, with an immediate flush for phase
     changes and the sender's own result).
   - Students and the projector must not receive the full per-student roster. Define a compact non-teacher state:
     own row, counts, aggregates, and what the projector really shows. Write the proposed shape under "Questions" in
     the report before changing the wire contract; the coordinator decides the contract.
   - The teacher still gets the full roster, coalesced.
3. Persistence (`persist()`) must not write the whole room on every answer save; debounce it.
4. Check boss HP, damage rounding and per-step budgets at 1, 30, 200 students (unit tests).
5. Load harness `tools/classroom-load.ts`: N WebSocket bots (default 200) join one room, answer a mixed step at mixed
   skill levels with realistic jitter (bursts at open and close, reconnects, a few refreshes), the teacher runs
   attack, retry, next and finish. Measure and print: join time, save → own-result latency (p50/p95/p99),
   teacher-console update latency, messages and bytes per second per client, server CPU and RSS, event-loop lag.
   It must run against a local server, and against a given URL only with an explicit `--target` flag.
6. Budgets to meet locally at 200 students (report the numbers either way): own-result p95 < 300 ms, teacher update
   p95 < 1 s, event-loop lag p99 < 100 ms, no dropped sockets, no errors.
7. Tests for capacity edges (200 joins, 201st refused, reconnect at full), coalescing, and the compact state.

## Rules

- Do not touch production. The coordinator decides on any run against production after asking the user.
- Run heavy commands under `capmem` (8 GB cap). 200 bots are WebSocket clients, not browsers.
- Do not commit, push or deploy. Report to `docs/tasks/classroom-200-report.md`, last line `STATUS: DONE` or
  `STATUS: BLOCKED <reason>`.

## UI follow-up (Claude, separate card after the server lands)

Teacher console and projector at 200: roster search, filters (not submitted / low score / needs review), sorting, a
virtualized list, and aggregate views that stay readable at 200.
