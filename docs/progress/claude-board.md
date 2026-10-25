DONE (chain board ui)

## ⛓ verified on Solana: UI (docs/tasks/chain-board.md)
- `client/app/chain-board.ts` (new): `createChainBoard(mock, { rows, highlight })`. `hall.ts` turns the panel title into two tabs, "☠ HALL OF MONSTERS" | "⛓ VERIFIED ON SOLANA" (the chain board is built on first open). Landing and both autopsies (raid + royale) get it without changes to those files.
- Header: "Last anchored: slot N · <local time> · Explorer ↗"; pending shows "anchoring on Solana devnet… waiting for confirmation", unavailable shows "not anchored: Solana anchoring is unavailable on this server." No snapshot or no entries shows "no qualifying PvP matches yet…"; a fetch failure shows "chain board offline."
- Players/Projects tabs with rank, name (+ repo for players), wins, played, best, avg, a ◆ when `anchoredReceipts > 0` (tooltip "N results with a wallet-anchored receipt"), and a verify button. Projects show the full owner/name slug. Order: wins desc, avgPlacement asc, then key (same as the server). Autopsy highlights this match's players.
- verify: GET `/api/chain-board/proof?snapshot&kind&key`, then **in the browser**: proof.snapshot/root must equal the displayed snapshot, `canonical(proof.entry)` must equal the displayed row (so a faked row can't borrow another row's proof), and `verifyChainProof` must pass. ✓ "this row is in snapshot <root…> anchored on Solana devnet · tx ↗" (pending: "; anchoring is pending"; unavailable: ", which is not anchored"); otherwise ✗ "proof failed: this row doesn't match snapshot <root…>" or ✗ "couldn't fetch the proof". Explorer links are rendered only for a base58 tx and an https explorer template.
- History: "<n> earlier roots" (collapsed) with time · root · status · tx ↗. Footer copy: "Tamper-evident history: we can't rewrite it after anchoring. Results are attested by the game server."
- `?mock=1`: the client builds a real Merkle tree over sample entries (WebCrypto), so the verifier runs for real in mock mode too.
- Style: terminal panel, no blink or flashes (photosensitivity-safe), 44px tabs / 40px verify on touch, "best" column hidden at ≤420px, long localized headers ellipsized (full label in title). `client/style.css`: one appended block.
- i18n: 36 hand-translated rows (en/zh/es/fr) appended to sources / gemini-translations / messages.generated. Copy says tamper-*evident*, not tamper-proof, in every language. Names, repos, roots and dates are `translate="no"`; dates use `toLocaleString(locale())`.

## Verified (WebKit, dev :5175)
- Desktop 1440: mock finalized ✓ (players + projects), history open. Routed fixture (tree built in Node with shared `canonical`, checked by `verifyChainProof`): forged row (wins 4→9) ✗; pending header + ✓ pending; unavailable header + ✓ not anchored. Real :5175 API (empty unavailable snapshot) shows "no qualifying PvP matches yet".
- iPhone 15: en/zh/es/fr ✓ verify, page and table horizontal overflow 0. Autopsy (mock battle) desktop + iPhone 15 ✓, overflow 0.
- tsc clean; vitest client/app + client/i18n + shared 102/102; audit-i18n 0 errors / 0 review.
- Not verified: a live finalized devnet snapshot (server smoke unfunded), so the real Explorer link has only been exercised with fixture tx ids.
