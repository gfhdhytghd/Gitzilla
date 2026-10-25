# Tamper-evident PvP leaderboard anchored on Solana devnet

The user asked for this as fast as possible. The contract is in `shared/types.ts` (ChainBoardEntry / ChainBoardSnapshot / ChainBoardResponse / ChainBoardProof), with the leaf and node hashing defined in the comment there.

## Server (codex-chain)
- **Data source:** finished royale results from **qualifying** matches only: the same rule as receipts (`room.receiptEligible`: ≥2 humans, no private repos).
  - Persist a compact per-match record: placements per human, their public repo, and whether that player anchored their receipt (join on the receipts store).
  - It must survive restarts and live under the existing state dir; follow the receipts/hall persistence patterns.
- **Boards:**
  - Players: wins, matches, best and average placement.
  - Projects, per public repo slug: same fields, **ranked by wins** with average placement as the tiebreak.
  - Entries are sorted deterministically: kind, then key.
- **Snapshot:**
  - Rebuild after each qualifying match, debounced to at most one anchor per 2 minutes, and on boot if there's no current snapshot.
  - Build the Merkle tree per the contract and anchor the root with the **existing Solana devnet signer/RPC**: same attestor/sponsor, genesis pin, durable-pending and finalize-check patterns as receipts.
  - The Memo payload is compact JSON: `{"app":"gitzilla","board":1,"root":"…","n":<entries>,"at":<ms>}`.
  - status: pending → finalized; unavailable if receipts are disabled or the sponsor is unfunded. Never block a match on it.
- **Routes:**
  - `GET /api/chain-board` returns the latest snapshot plus up to 20 history roots.
  - `GET /api/chain-board/proof?snapshot&kind&key` returns the proof path.
  - No secrets or tokens in any response.
- **Tests:**
  - Merkle known-answer tests covering an odd number of leaves and a single leaf.
  - Proof verification in both directions.
  - Persistence across restart.
  - Eligibility filter: bots-only, private and edu matches are excluded.
  - Debounce.
  - Memo construction, with the RPC mocked.
- **Gates:** typecheck, the full server tests, and a devnet smoke with an isolated key only if funded. Don't spend the production sponsor in tests.
- **Shared verifier:** a pure `verifyChainProof(proof)` in `shared/chain-board.ts` that works in both the browser (WebCrypto) and Node, so the client can verify without the server. Unit test it against the server's tree.

## UI (claude-board)
- A **"⛓ verified on Solana"** leaderboard. It's a new tab or panel next to the existing Hall of Monsters (landing and autopsy): `client/app/hall.ts` / a new `client/app/chain-board.ts`.
  - Two tabs, Players and Projects, with rank, name/repo, wins, matches, best and average placement, and a ◆ badge if receipts were anchored.
  - Each row has a **verify** button that fetches the proof, runs `verifyChainProof` locally in the browser, and shows ✓ "this row is in snapshot <root…> anchored on Solana devnet" plus an Explorer link to the tx. On failure it shows ✗.
  - A header shows "Last anchored: slot N · <time> · [Explorer]", or pending/unavailable states.
- Honest copy: "Tamper-evident history: we can't rewrite it after anchoring. Results are attested by the game server."
- Terminal/pixel style, photosensitivity-safe, phone and desktop friendly, localized en/zh/es/fr.
- Verify in WebKit (desktop + iPhone 15) against the dev server, using mocked data where needed.
