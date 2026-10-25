# Claude design audit: Solana receipts

2026-10-25. Actual Claude CLI review, tools disabled, architecture supplied in the prompt. This first review did not inspect source files. A separate source review follows.

I'm answering in text and not writing a plan file, because you asked for no edits or tool use. I haven't read the codebase, so this audit relies only on what you described.

## Verdict on scope

| Idea | Recommendation | Reason |
|---|---|---|
| (1) PvP result receipt | **Do it, Devnet only, much smaller than proposed** | This is the only idea that fits "server is authoritative, wallet optional, no private data." |
| (2) Commit-tied hero NFTs | **Reject** | Profiles have no commit SHA, so a "commit-tied" NFT would rest on an invented commit reference. It also mints collectibles from *other people's* repos without their consent, pulls in the Metaplex/token stack, and invites speculation. There's no honest MVP here. |
| (3) Classroom badges | **Reject. It contradicts your own constraint.** | Classroom data must never go on-chain. A "pseudonymous" badge still permanently links a wallet to a class and a cohort, likely involving minors, and you can't delete it. |

## The biggest correction: you probably don't need a transaction from the wallet at all

The authenticity of the receipt comes from **the attestor key's signature**. The chain adds only a public timestamp and proof that the receipt existed at that time. The proposed co-signed, wallet-fee-paid transaction has three practical problems:

1. **Users have no Devnet SOL. This is a blocker.** The faucet is rate-limited or gated, and most real wallets hold zero Devnet SOL. A wallet-paid design will fail for nearly every user at the moment of the demo.
2. **Wallets may modify transactions.** With `signAndSendTransaction`, some wallets (Phantom, for example) can add instructions such as guard or priority-fee instructions. Any change to the message invalidates the server's pre-signature.
3. **Your proposed flow allows duplicate publication. This is a correctness bug.** Suppose the client gets server-signed transaction T1, doesn't send it, and retries. It gets T2 with a fresh blockhash and can then submit both before T1 expires, putting two memos on-chain. To prevent this, the server would have to refuse to issue T2 until T1's `lastValidBlockHeight` has passed. With client-side submission you can't fully control this.

**Recommended MVP:**

1. **At match end, the server always creates a signed off-chain receipt**, whether or not anyone ever claims it. This is the primary artifact. It works with no wallet and no network access, and anyone can verify it against the published attestor public key.
2. **Wallet binding uses `solana:signMessage`, not a transaction.**
   - The server issues an exact ASCII claim message containing: domain, `solana:devnet`, receipt ID, digest, attestor key ID, nonce, and expiry.
   - The wallet signs it.
   - The server checks that the signed bytes match what it issued and verifies the Ed25519 signature with `node:crypto`.
3. **The server alone builds, signs (as fee payer), submits and confirms the memo transaction.** The server's Devnet key is funded from the faucet, with no purchases. Each memo costs about 5000 lamports, so one Devnet SOL covers far more receipts than you'll need.
4. **Memo content**, about 250 bytes, well under the size limit:
   `gz:r1:<attestorKeyId>:<receiptId>:<digest>:<walletPubkey>:<walletSig>`.
   Put the attestor public key in the memo instruction's accounts as a signer. Memo v2 enforces that every listed account signed, so "attestor signed" is checkable from the instruction itself.

What this design gives you:
- The user needs zero SOL.
- There's no network mismatch problem in the wallet.
- No transaction mutation can break signatures.
- The txid (the fee payer's signature) is known *before* broadcast, which makes idempotency straightforward.
- The client bundle contains no `@solana/*` code at all. Wallet Standard discovery is about 40 lines of hand-written code (the `wallet-standard:app-ready` / `register-wallet` event handshake).

If you still want the wallet as an on-chain co-signer later, use `solana:signTransaction` (sign only, never send) with **the server as fee payer**. The client returns the signed transaction, the server checks that the message bytes are identical to what it built, adds its signature, and submits. Keep this as a stretch goal, not the MVP.

## Misleading claims to remove

- **"Proof of fair gameplay."** It isn't one. The honest wording is: *"Gitzilla's server attested this result at time T. This does not prove the match was fair or that the server was honest."* Put this in the viewer in all four UI languages.
- **"Immutable, persistent" on Devnet.** Devnet has been reset before, and public RPC history retention is limited. Say "anchored on Solana Devnet (test network)."
- **Commit pinning.** Agreed, never fabricate it. Leave the field out entirely; don't use a placeholder.
- **"NFT" or "on-chain collectible"** wording anywhere in the UI.

## Privacy

- **Salt the digest.** A digest computed as `sha256(JCS(payload) || 32-byte random salt)` is necessary because outcomes like "A beat B" have very little entropy. Without a salt, anyone can brute-force the digest. The salt stays off-chain with the receipt holder.
- **Use per-match random participant IDs, not GitHub logins.** When one participant publishes, the other participants haven't consented, so nothing that identifies them should be on-chain.
- **The public viewer shows only what the claimant chooses to reveal.** By default it shows the receipt ID, the outcome for the claimant, and the time. Revealing opponents' repo names would link your wallet to their GitHub identity.
- **Make eligibility deny-by-default and fix it when the match is *created*:** `mode === publicPvP && !classroom && !anyCredentialed && !anyPrivateRepo`. Store that flag on the match. The claim endpoint must never re-derive eligibility from mutable state.
- **The signed claim message is fixed ASCII English.** Explain it in the UI in EN/ZH/ES/FR, but never localize the bytes that get signed.

## Persistence, replay and idempotency

- **Room tokens may not outlive their room.** At receipt creation, store `hash(resumeToken)` (or a dedicated claim secret) in the receipt record, so a claim still works after the room is garbage-collected.
- **Storage:** use `node:sqlite` if your Node version supports it. Otherwise use append-only JSONL with fsync. Avoid `better-sqlite3`, which adds a native build.
- **Per-receipt, per-participant state machine:**
  - `unclaimed → pending{wallet, txSig, lastValidBlockHeight} → confirmed`
  - `pending → expired → (rebuild allowed)`
  - Persist `pending` *before* calling `sendTransaction`.
  - On timeout or restart, poll `getSignatureStatuses(txSig, {searchTransactionHistory: true})`. Allow a rebuild only when the current block height is past `lastValidBlockHeight` and the status is still null.
  - Show "confirmed" in the UI and mark the receipt "published" only at `finalized`.
- **One wallet per participant receipt, and immutable once published.** A claim attempt with a different wallet is rejected.
- **Claim-message replay:** bind the message to domain, network, receipt ID, single-use nonce and a roughly 5-minute expiry. Delete the nonce when it's used.
- **Domain separation:** sign off-chain receipts over `"gitzilla-receipt-v1\0" || bytes`, so an attestor signature can never also be a valid Solana message. Include a key ID so the key can be rotated. Publish the public key(s) at `/.well-known/gitzilla-attestor.json`.
- **Key handling:** load the attestor key from a path outside the repo (gitignored). Add a startup check that refuses to run if the key file is tracked by git. Add a check for low balance.
- **Rate limits:** per token and per IP on the claim and nonce endpoints. The server pays the fees, so spam is the main way to drain its balance.

## Wallet support and optionality

- **Desktop:** Phantom, Solflare and Backpack all support `solana:signMessage`.
- **Mobile:** Wallet Standard generally works only inside a wallet's in-app browser. Android's Mobile Wallet Adapter is extra scope. On mobile, show "Copy receipt / open in wallet browser." Never show a broken button.
- **Wallet code must stay out of the fight and main bundles.** The Results button runs a dynamic `import()` of the receipts chunk.
- **Missing wallet, RPC down or rejected signature:** the result is unaffected and the off-chain receipt still downloads.

## Isolation, given the other agents

- New, self-contained directories: `server/receipts/*` and `client/receipts/*`.
- Server: one call in the public-PvP completion path.
- Client: one button in PvP Results.
- **Don't touch any classroom file.**
- Server dependency: `@solana/kit` plus the memo program helper, or hand-roll it. A legacy memo transaction is roughly 120 lines on top of `node:crypto` and JSON-RPC `fetch`. Client runtime dependencies stay at `ws` only.

## Tests

**Vitest:**
- Canonical digest is stable across key order, and the salt changes the digest.
- Eligibility matrix: classroom, credentialed and private-repo matches create no receipt and the claim returns 404 or 403. This is the most important negative test.
- Memo encode/decode round-trip and size limit.
- Wallet signature verification using generated Ed25519 keys.
- Replay rejection: wrong receipt, wrong domain, expired nonce, reused nonce.
- Fake RPC scenarios:
  - Timeout after send leads to status polling and no second transaction.
  - Expiry allows exactly one rebuild.
  - A restart while `pending` reconciles correctly.
- Wrong or missing room token is rejected; rate limits apply.

**Build test:**
- `vite build`, then assert that the main and fight chunks contain no `solana` or wallet strings.
- A size budget on the receipts chunk.

**Playwright:**
- An `addInitScript` registers a fake Wallet Standard wallet that implements `solana:signMessage` with a test key. Run the happy path against a mocked server RPC.
- A no-wallet path.
- Mobile viewport.
- All four locales.

**Proof on the real chain** (an env-gated script, kept out of the default suite):
1. Run a real public match, claim it with a real Devnet wallet, and record the txid and the `explorer.solana.com/tx/<sig>?cluster=devnet` link in the PR.
2. Run an **independent verifier** that uses only a public RPC endpoint and the published attestor public key:
   - `getTransaction`
   - check that the memo program and attestor appear as signer
   - parse the memo
   - verify the wallet signature over the reconstructed claim message
   - recompute the digest from the revealed receipt and salt

That verifier is the real deliverable. Without it, "attestation" is only a claim.

## Bottom line

Choosing (1) only on Devnet was right. Make it smaller:
- A signed off-chain receipt is the core artifact.
- Optional wallet binding uses `signMessage`.
- The server submits and pays for one memo per claim.
- No Solana SDK in the client.
- The independent verifier script serves as proof.

There are two blockers in the original proposal. A wallet-paid Devnet fee will fail for most users, and handing the client a server-pre-signed transaction allows duplicate publication.
