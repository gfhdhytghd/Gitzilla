# Optional public PvP receipts

Claude audited the proposed Solana features. We adopted the smallest useful feature: a downloadable server-signed public PvP result, with optional sponsored Solana Devnet Memo anchoring. NFTs and classroom credentials were excluded. See [Claude's design audit](../reviews/solana-claude-design-audit.md) and [source audit](../reviews/solana-claude-code-audit.md).

## Player experience

After a new public PvP royale, each human player can open **Match receipt** on their results screen. No wallet is required to play or download the signed JSON. The wallet registry and receipt panel load only after clicking that button (about 3 KB gzip before translations). No RPC runs during a fight.

To anchor, choose a compatible Wallet Standard wallet, review the exact English signing message, and click **Sign message and anchor**. The wallet signs bytes, never a transaction. Gitzilla signs and pays for one Memo transaction using free Devnet SOL. Its signer is also explicitly listed as a Memo instruction signer. The UI explains that the wallet address and salted result digest become public. Devnet can reset; save the download. A server attestation does not independently prove fair gameplay.

No compatible wallet, rejected signatures, an unfunded sponsor or an RPC outage leave the signed download usable. Wallet addresses remain permanently bound after the first accepted publication. Pending anchors can be checked manually. No polling or wallet code runs during gameplay.

## Eligibility and privacy

RoomServer freezes eligibility and the SHA256 hashes of human reconnect tokens when a match starts. Only public-source PvP with at least two humans qualifies; boss raids, classrooms, spectators, bots and matches containing any private repository do not. Only the authoritative finished result issues a receipt. Client input cannot supply a result.

Each player gets a separate signed receipt containing their own public repository, outcome, placement, human and total entrant counts, damage and KOs. No player names, opponent repository names, source code, grades, auth credentials or fabricated commit hashes appear. Receipts use random IDs and independent 32-byte salts. The chain contains a salted result digest, random receipt ID, claimant wallet address, domain, nonce, expiry and wallet signature. The app attestor account links anchored wallets to Gitzilla; published history cannot be deleted by the app. It does not contain the result payload or salt.

Reading or changing a receipt requires that player's original reconnect token in `X-Room-Token`, independent of room lifetime. It is never put in URLs. Save the JSON before leaving if the browser clears the reconnect token. Public attestor keys are available at `/.well-known/gitzilla-attestor.json`; receipt contents are not publicly enumerated.

## Signature and transaction contract

The JSON uses recursively sorted object keys and UTF-8 encoding:

- `digest = SHA256(canonical(payload) + NUL + salt)`.
- The server signs UTF-8 `gitzilla-receipt-v1` + NUL + the hex digest with Ed25519.
- The claimant signs a message binding the exact application origin, `solana:devnet`, receipt ID, digest, wallet, attestor, random nonce and five-minute expiry. The signed bytes are never translated.
- The server pins Devnet genesis hash `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` before signing or sending. HTTP RPC URLs and other clusters are rejected.
- Before broadcast, SQLite durably stores `pending`, the exact Memo, original signing origin, transaction signature, wire bytes and last-valid block height. Match receipts commit in one atomic batch; SQLite enforces a single writer process. Mutations are serialized per receipt. Timeout, double-click and restart reuse these bytes.
- `finalized` requires a successful finalized transaction with exactly one matching Memo instruction and the expected app signer. No status-only success. Expiry requires a null status at a context slot at least as fresh as the previously sampled finalized epoch slot. A retry with a new blockhash requires definitive expiry/failure and a fresh wallet message/signature; unknown outcomes never rebuild automatically.

The transaction contains no transfers, token approvals or user transaction signatures. The server uses `@solana/kit`; the browser's tiny Wallet Standard registry sits in a separate lazy chunk.

## Operations

Requires Node with `node:sqlite` (validated on Node 26). The default private seed lives at `.cache/solana/attestor.seed`; SQLite and WAL live beside it. Parent directory is 0700, key/database 0600. These paths are ignored by Git and blocked by the HTTP static path guard and Vite file deny rules, including `/@fs/`. Key paths under served `dist`/`public` assets are refused. An existing database with a missing seed fails closed instead of silently rotating. Keep both the seed and DB in private persistent backups. Never publish the seed or commit it. `SOLANA_RECEIPTS_DIR` can place both files in a private persistent state directory outside the checkout. `SOLANA_ATTESTOR_KEY_FILE` may override the seed path; tracked or non-ignored in-repository key files are refused.

`SOLANA_DEVNET_RPC_URL` optionally overrides the HTTPS RPC, but cannot bypass the genesis check. `SOLANA_RECEIPTS_ENABLED=0` disables receipt creation/routes. Receipt failures never stop gameplay. Rotated-key receipts remain downloadable/verifiable, with old public keys retained in metadata; new anchors for old keys are unavailable.

The live sponsor must receive **free Devnet test SOL**, via a faucet, before anchoring works. Do not send mainnet SOL. An unfunded sponsor produces an explanatory unavailable response while retaining downloads. This implementation does not purchase funds or ask players for SOL.

Verify a downloaded receipt against a public key obtained separately from a trusted source:

```sh
npx tsx tools/verify-solana-receipt.ts receipt.json --attestor TRUSTED_PUBLIC_KEY
npx tsx tools/verify-solana-receipt.ts receipt.json --attestor TRUSTED_PUBLIC_KEY --transaction DEVNET_TXID
```

The second command independently checks finalized transaction contents and the claimant signature through the official Devnet RPC. An arbitrary key inside a downloaded file is not a trust anchor.

## Validation

- Full merged suite and final counts are recorded in the validation section of the source-audit report.
- Receipt tests cover tampering, salted privacy, public eligibility, ownership, domain/chain replay, expiry, wallet changes, sponsor outage, key rotation, duplicate clicks, durable restart, forced process death immediately before broadcast, timeout/expiry, stale RPC node races, origin changes, atomic rollback, exclusive writer lock and actual SDK transaction signatures.
- `npx tsx tools/receipt-browser-check.ts`: real Chromium at 390×844, EN/ZH/ES/FR, fake Wallet Standard provider, real Ed25519 message signatures and injected RPC. Covers no-wallet download, late registration, cancellation, timeout, same-wire retry, finalized UI and disposal. Screenshots and JSON evidence are local ignored `qa/artifacts/receipts/` artifacts. The finalized browser state is simulated, not Devnet proof.
- `npx tsx tools/receipt-main-check.ts`: actual production entry on an ephemeral port with isolated state; metadata and private-file path guards pass without any chain traffic.
- `npx tsx tools/audit-i18n.ts`: zero errors; 36 Python starter variants still parse. New bundled copy generated by Gemini via AGY, with DeepSeek handling timed-out batches.
- The official Devnet genesis check succeeded. The free airdrop was unavailable for the isolated smoke attestor, so an actual finalized on-chain transaction is **PENDING**. This is not substituted with simulated UI evidence.

Explicit opt-in network smoke test, with synthetic fixture data and a separate ignored test key:

```sh
npx tsx tools/solana-devnet-smoke.ts --send-devnet
```

## References

[Solana frontend SDK](https://solana.com/docs/frontend), [message signing](https://solana.com/docs/frontend/messages-and-auth), [Memo signer contract](https://www.solana-program.com/docs/memo), [finalized transaction lookup](https://solana.com/docs/rpc/http/gettransaction), [Wallet Standard discovery](https://github.com/wallet-standard/wallet-standard/blob/master/packages/core/app/src/wallets.ts).

## Mobile wallets

On a phone without an injected wallet, **Connect with a mobile wallet** prepares short-lived links for Phantom and Solflare. The user then taps a real HTTPS universal-link anchor, which opens the standalone `/receipt.html` page inside the selected wallet. Preparing the link and opening it are separate taps so iOS keeps the actual launch tied to a user gesture. Links follow the official [Phantom browse](https://docs.phantom.com/phantom-deeplinks/other-methods/browse) and [Solflare browse](https://docs.solflare.com/solflare/technical/deeplinks/other-methods/browse) formats.

The handoff ticket is random, stored only as a SHA256 hash, expires after two minutes and is redeemable once for this receipt. It travels in the target URL fragment, never as a room token or an HTTP query parameter. The wallet provider necessarily sees its own browse URL; treat that link as a short-lived bearer capability and do not share it. The receipt page removes the fragment immediately and exchanges it for a 30-minute receipt-only grant held in that tab's session storage. It does not open a game WebSocket, join a room, carry GitHub credentials, or impersonate the original player. The grant cannot create further handoff links. Creating a replacement link invalidates old tickets and grants for this receipt; the original game token remains valid.

The wallet browser still asks the user to connect and to sign the exact message. Because only a message is signed and the app submits the Devnet transaction, a Solana account need not switch its default network to Devnet. Returning to the original game tab reloads its receipt status without transferring its session to the wallet. Missing apps, expired links and used links have recovery text; the original tab can prepare a fresh link. Plain HTTP gets an HTTPS reminder instead of a broken app link.

The dedicated HTML entry loads only the receipt UI, shared text/styles and Wallet Standard code, not the fight controller or renderer. It uses `Referrer-Policy: no-referrer` and has no external font request. `tools/receipt-mobile-browser-check.ts` exercises the handoff over local HTTPS with separate browser storage, a simulated wallet provider and real Ed25519 message signatures. It checks ticket replay denial, reload, default-mainnet accounts, original-tab refresh, no room credentials in URLs, no game connections, and four-language layout. This is not proof of native iOS universal-link handling; actual Phantom/Solflare app launch remains a device check.
