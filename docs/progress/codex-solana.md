# Solana receipts — audited implementation ready

User requested an actual Claude audit of Solana ideas and the best integration. Two real Claude CLI reviews are saved in `docs/reviews/solana-claude-{design,code}-audit.md` on branch **feat/solana-receipts** (isolated checkout `../gitzilla-solana`). The branch includes complete server, client, four-language UI, verification tools and tests.

Adopted scope: server-signed downloadable public-PvP results; optional app-sponsored Devnet Memo; wallet signs only a message. Requires at least two human players. No classroom/private/bot-only receipts; no NFTs or mainnet funds. Wallet panel loads only after opening a receipt, about 3 KB gzip. See `docs/design/solana-receipts.md` on the branch.

Claude source-review fixes include fresh slot-aware expiry checks, exact durable Memo/origin, atomic SQLite batches, exclusive writer, private key protections, per-player receipt IDs, stale-message recovery and complete wallet-privacy disclosure. All five blocking findings were addressed or verified against code omitted from the review.

Validation on latest committed main balance update 334a52e: **typecheck PASS; 1,038 tests PASS, 9 skipped; build PASS; i18n audit zero errors, 36 Python starters parse; npm production audit zero vulnerabilities**. Chromium 390x844 EN/ZH/ES/FR acceptance passes (real Ed25519 message signatures, fake Wallet Standard and RPC): no-wallet download, independent verifier, cancellation, late registration, timeout/idempotent retry, finalized UI, private Vite paths, disposal. Hard process-death recovery is tested. Actual production entry-point metadata and four private-path variants pass on an ephemeral port with isolated state (`tools/receipt-main-check.ts`).

Actual Devnet genesis verified. The free faucet was unavailable for the isolated test key; **actual finalized on-chain proof is PENDING**. No real funds used. Runtime wallet compatibility beyond the harness remains unverified. Live sponsor needs free Devnet SOL before anchoring; signed downloads work without funding.

## Integration boundary

A fast-forward into main was attempted, but Git refused because `server/rooms.ts` is currently modified by the active kick/transfer owner. No edits were stashed, reset, overwritten or committed on their behalf. Live5173 was not touched. The branch is clean and ready; it was rebased onto 334a52e. Once the kick/transfer work is committed, rebase `feat/solana-receipts` onto main, merge it, install its new packages, and run combined gates before the coordinator deploys. Its RoomServer edits touch eligibility/start/completion, autopsy personalisation and the optional service callback; preserve the kick/ban/owner logic when merging. Do not cherry-pick another owner's uncommitted source.

## Mobile follow-up completed

Phantom/Solflare HTTPS browse links now open a dedicated, lightweight receipt page. Two-minute single-use handoff tickets exchange for a 30-minute grant scoped to one receipt; the room token never crosses browsers. The fragment is removed immediately; grant storage survives reload, never authorizes room actions, and cannot create further links. New links revoke earlier tickets/grants. Original-tab visibility refreshes result status; the wallet page does not join the room. Phone controls, recovery copy and all four languages are implemented.

`npm test`: **1,083 passed / 9 skipped**, 91 passing files. Typecheck/build/i18n audit pass. The HTTPS mobile browser harness uses separate storage, a fake Wallet Standard provider and real Ed25519 signatures; handoff, replay rejection, default-mainnet account signing, single submission, reload and original-tab update pass. Native iPhone app launch remains unverified; no claim of real Phantom/Solflare device acceptance or finalized Devnet transaction. Real production entry-point test serves `receipt.html` successfully on an ephemeral port without touching live.

## Integration onto main 14d894b — IN PROGRESS (codex-net)
- Working only in this isolated feat/solana-receipts worktree. Merging main (rather than rewriting the six receipt commits), retaining main's controller/needsController, explicit screen host, kick/bans/transfer, classroom HP budget, input arbitration, updated art and UI.
- Resolved dependency union and regenerated package-lock via npm install. Preserved latest main translations for shared keys and all receipt-only strings; merged i18n audit:2768 source strings,2800 translation rows,0 errors/0 review warnings,36 Python starters parsed. No provider calls for translation.
- Cross-feature fix: receipt autopsies must still reach linked controllers, but with no receipt IDs; controller reconnect also gets sanitized autopsy. Display receives only its own ID, original display resume token remains the sole game credential for receipt access. Added actual WebSocket regression to the receipt ownership test.
- Initial build and dedicated receipt/controller test PASS. Full gates and one isolated free-Devnet funding attempt are in progress. No live service, main checkout, main branch or remote changed.
- First full run:1348PASS/1FAIL/7SKIP. The only failure exposed translation template ordering after JSON union: a generic `{0} from {1}` entry preceded main's classroom removal template. Preserved the entire main bundle order and appended only receipt-only translations; classroom + i18n focused10PASS. Re-running final full gates on the corrected catalog.
- Receipt production-entry test PASS at ephemeral36453 with isolated key/database and four denied private paths; desktop/mobile receipt browsers PASS (real Ed25519, simulated provider/RPC and native launch). Native wallet app launch remains explicitly unverified.
- Fresh isolated Devnet sponsor 4rG1wj6g5442HZzhf4Di6mhgmYJQjMQi842SVcHHKWAf: genesis check passed; one public requestAirdrop returned Internal error. No retry and no Memo was sent. Investigating official free alternatives without existing wallets or real funds.
