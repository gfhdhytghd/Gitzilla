# Solana receipts — audited implementation ready

User requested an actual Claude audit of Solana ideas and the best integration. Two real Claude CLI reviews are saved in `docs/reviews/solana-claude-{design,code}-audit.md` on branch **feat/solana-receipts** (isolated checkout `../gitzilla-solana`). The branch includes complete server, client, four-language UI, verification tools and tests.

Adopted scope: server-signed downloadable public-PvP results; optional app-sponsored Devnet Memo; wallet signs only a message. Requires at least two human players. No classroom/private/bot-only receipts; no NFTs or mainnet funds. Wallet panel loads only after opening a receipt, about 3 KB gzip. See `docs/design/solana-receipts.md` on the branch.

Claude source-review fixes include fresh slot-aware expiry checks, exact durable Memo/origin, atomic SQLite batches, exclusive writer, private key protections, per-player receipt IDs, stale-message recovery and complete wallet-privacy disclosure. All five blocking findings were addressed or verified against code omitted from the review.

Validation on latest committed main contract ca2facc: **typecheck PASS; 1,028 tests PASS, 9 skipped; build PASS; i18n audit zero errors, 36 Python starters parse; npm production audit zero vulnerabilities**. Chromium 390x844 EN/ZH/ES/FR acceptance passes (real Ed25519 message signatures, fake Wallet Standard and RPC): no-wallet download, independent verifier, cancellation, late registration, timeout/idempotent retry, finalized UI, private Vite paths, disposal. Hard process-death recovery is tested.

Actual Devnet genesis verified. The free faucet was unavailable for the isolated test key; **actual finalized on-chain proof is PENDING**. No real funds used. Runtime wallet compatibility beyond the harness remains unverified. Live sponsor needs free Devnet SOL before anchoring; signed downloads work without funding.

## Integration boundary

A fast-forward into main was attempted, but Git refused because `server/rooms.ts` is currently modified by the active kick/transfer owner. No edits were stashed, reset, overwritten or committed on their behalf. Live5173 was not touched. The branch is clean and ready; it was rebased onto ca2facc. Once the kick/transfer work is committed, rebase `feat/solana-receipts` onto main, merge it, install its new packages, and run combined gates before the coordinator deploys. Its RoomServer edits touch eligibility/start/completion, autopsy personalisation and the optional service callback; preserve the kick/ban/owner logic when merging. Do not cherry-pick another owner's uncommitted source.
