# Chain board server handoff — codex-chain

Implemented the Server section of `docs/tasks/chain-board.md`. No commit or push was made.

- Published `shared/chain-board.ts` early and notified `claude-board` through herdr. `verifyChainProof` uses WebCrypto in browsers and Node, hashes the canonical entry, and verifies ordered sibling paths. It proves membership against the supplied root; it does not independently fetch or verify the on-chain transaction.
- Added `server/chain-board/{tree,store,service,http}.ts`: durable compact qualifying match records and snapshots under the receipts state directory (`chain-board.sqlite`), player/project aggregates, canonical kind/key ordering, proof generation, and both read-only routes.
- Room completion freezes each human's verified public GitHub account ID as the stable player key. The existing receipt eligibility gate excludes classroom, private-repo and fewer-than-two-human matches. Only public player/result fields and receipt IDs enter the board store; auth tokens and token hashes do not.
- Reuses the existing receipts attestor/sponsor and genesis-pinned RPC. Snapshot Memo is exactly `{app:"gitzilla",board:1,root,n,at}`. Saves signed wire bytes and signature before sending, reconciles exact transactions after restart, preserves unresolved transactions, and limits new anchors to one per two minutes. Unfunded/disabled anchoring is reported as unavailable. Receipt badges join finalized receipt records and enter subsequent snapshots.
- UI owns ranking presentation: snapshot leaves are ordered by kind/key; rank each tab by wins descending, average placement ascending, then key. Both routes return only public snapshot/proof fields.

## Gates (2026-10-25)

- `npm run typecheck`: PASS.
- Full server gate with `ROOM_RESTART_TEST=1 EDITOR_SERVER_TEST=1`, receipts disabled and a temporary `SOLANA_RECEIPTS_DIR`: PASS — all 18 files and 275 tests passed, zero skips. This includes the real-process restart, controller and editor checks on OS-assigned ports. The standard run also passed (272 tests, 3 opt-in skips).
- New chain board tests: 9 PASS, covering independent known-answer odd/single trees, both proof directions and tampering, persistence/restart, aggregate/receipt joins, eligibility, debounce, durable broadcast/reconciliation, unavailable/expired states, history/public HTTP responses, and real Memo wire construction with mocked RPC.
- `git diff --check`: PASS.
- Read-only `http://localhost:5175/api/chain-board`: HTTP 200, empty unavailable snapshot (no fabricated anchored result).
- `npx tsx tools/chain-board-smoke.ts --send-devnet`: SKIP (exit 2), isolated `.cache/chain-board-smoke` key unfunded. No airdrop requested and no production sponsor used. Real devnet transaction/finalization remains PENDING. To rerun with an explicitly funded isolated test directory, set `CHAIN_BOARD_SMOKE_DIR` and run the same command; the script rejects the production receipt directory/key.

The first full server run caught a display-name ordering defect caused by sorting match UUIDs; this was fixed by replaying durable insertion order. The final full server run above passed after the fix (38.99 seconds).

## One-time historical receipt backfill

On boot, when `board_matches` is empty and migration `receipt-backfill-v1` has not run, the service reads a server-only receipt projection, verifies signatures and imports complete qualifying receipt groups keyed by their signed match ID. Existing empty snapshots do not suppress the migration and remain unchanged in history. Records and the one-time marker commit in a single transaction; a failed write rolls back both. An existing match store is never supplemented by this migration. No production server or production receipt database was accessed for this change.

Historical receipts contain no GitHub account ID or display name. Backfilled records therefore contribute **project rows only**; no player identity is guessed from repository ownership, wallet address, token hash or receipt ID. Their project stats use the signed repo/outcome/placement, and their anchored count joins the receipt's existing finalized status. Later live matches still record verified player IDs normally. Historical and future results cannot be linked to a common player from the existing receipts alone.

A group is omitted if any human receipt is missing or invalid, placements are absent, or the signed human count, entrant count, issue timestamp, signer or outcomes conflict. No missing opponent, bot result or placement is synthesized. This is a conservative, one-time migration; skipped groups are not retried on later boots once the marker commits.

Validation adds six regression tests for importing behind an existing empty finalized snapshot, project-only output and receipt badges, signature/schema/complete-group validation, deduplication, successful and empty migration restarts, nonempty-store exclusion, and transactional rollback. Backfill gate: `ROOM_RESTART_TEST=1 EDITOR_SERVER_TEST=1` with receipts disabled and temporary state passed all **281 tests across 19 files**, zero skips (38.04 seconds). `npm run typecheck` and `git diff --check` also passed. Production backfill and anchoring are left to the coordinator deployment.
