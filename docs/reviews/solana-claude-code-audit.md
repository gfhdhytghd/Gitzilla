# Claude source audit and disposition

2026-10-25. Actual Claude CLI audit of the supplied source files, tools disabled. Claude did not run the application or inspect omitted files. Its conditional findings are not treated as demonstrated production vulnerabilities.

## Changes made following this review

- **B1:** finalized epoch height/slot is sampled before status. A null status may prove expiry only when its context slot is at least as fresh. Lagging node regression test added; processed failures stay pending.
- **B2:** persist challenge origin and exact Memo with the wire before send. No line-parsing reconstruction. A configuration-change regression test confirms that the old signed origin survives.
- **B3:** main.ts already denied `.cache` before routing and in its Vite configuration; the reviewer had not seen it. Standalone Vite now has the same denial, plus seed/SQLite file patterns. The key path must be Git-ignored and untracked. Browser harness verifies that ordinary and `/@fs/` private test paths are denied. Production uses a dist-only static root plus the cache path guard.
- **B4:** require at least two human participants, freeze that eligibility at start, and include both human and total entrant counts. One human with bots does not qualify. Private two-human matches remain excluded.
- **B5:** one SQLite transaction covers the entire receipt batch. RoomServer already caught receipt failures. Tests now cover disk-failure rollback and match completion despite a throwing receipt callback.
- Additional fixes: exclusive single-writer DB lock; small public-key table instead of request-time JSON scans; shorter HTTP completion by broadcasting durable transactions in the background; clear stale signing messages and re-read on publication errors; larger client request timeout and generic proxy failures; full public-wallet/time/history disclosure; fail closed if an existing DB loses its key; fsync new seed bytes; reject unsafe key files/directories; drop stored wire/message after terminal resolution; send each client only its own receipt ID; verify original-token reconnect behavior.
- Added hard process-exit-at-broadcast recovery test, exact SDK transaction signature checks, independent downloaded-receipt verification, and four-language mobile browser checks.

## Deliberate limits

Manual status checks and bounded identical-byte resends keep background activity low. No automatic wallet switching after publication. No promise of fair play or permanent Devnet storage. The application origin is exact; alternate LAN/tunnel origins need an explicit deployment configuration. Per-socket-IP rate limiting intentionally does not trust arbitrary forwarded headers; behind a single tunnel it acts as a conservative shared cap. Receipt retention remains tied to the privately managed SQLite database; download before leaving. Wallet/provider and hardware-wallet compatibility beyond the local Wallet Standard harness is unverified. Actual Devnet finalization is pending free test-SOL funding; no real funds were used.

## Validation after fixes

- Rebased onto the latest committed classroom/editor changes before validation.
- `npm run typecheck`: passed.
- `npm test`: 88 files passed, 4 skipped; 1,028 tests passed, 9 skipped.
- `npm run build`: passed; existing large-chunk/dynamic-import/browser-externalization warnings remain. Receipt panel is 2.97 KB gzip and stays lazy.
- `npm audit --omit=dev`: zero vulnerabilities.
- Eight-human durable batch benchmark on this host: 20 batches / 160 receipts, median 11.20 ms, worst 15.07 ms (SQLite FULL/WAL, one transaction per match). Host measurement only.
- Browser acceptance: 390×844, EN/ZH/ES/FR, no page errors; private-file denial, no-wallet download, independent signature verifier, late wallet registration, rejection, pending timeout, same-wire refresh, finalization UI, disposal.
- i18n audit: zero errors, all 36 Python starter variants parse. Gemini via AGY generated new copy; DeepSeek completed timed-out batches.
- Actual production main entry on OS-assigned port with private temporary state: attestor metadata matches its seed; ordinary, encoded, `/@fs/` and backslash private paths all return 404; public root 200 and unknown receipt 404. `tools/receipt-main-check.ts` makes no chain requests.
- Actual Devnet genesis verified; faucet funding unavailable, so finalized-chain proof and real wallet compatibility remain unverified. No real funds used.

## Original Claude output

# Gitzilla Solana receipt audit

This review is based only on the source you pasted. I used no tools and changed nothing. Some findings depend on code I couldn't see (`rooms.ts`, `main.ts`, Vite config, token lifecycle). Those are marked **conditional**.

## Blocking

**B1. False `expired` can cause a second anchor.** In `server/receipts/rpc.ts` `SolanaRpc.inspect`, the code calls `getSignatureStatuses` first and `getBlockHeight` second, as two separate requests. `api.devnet.solana.com` is load-balanced, so a lagging node can return `null` for the status and an up-to-date node can then report a height above `lastValidHeight`. The tx actually landed, but the row becomes `expired`. `refresh` then clears the nonce and the user re-signs, which creates a second on-chain memo for the same receipt. The DB then only knows the second one.
- **Fix:** get the height first, then the status, and require the status answer to be at least as fresh. For example:
  - Call `getEpochInfo({commitment:'finalized'})` to get `{blockHeight, absoluteSlot}`.
  - If `blockHeight <= lastValidHeight`, return `pending`.
  - Otherwise call `getSignatureStatuses`. Return `expired` only if `value[0]===null` **and** `context.slot >= absoluteSlot`. Anything else is `pending`.

**B2. The memo is rebuilt instead of stored, so a real anchor can be marked `failed`.** There are two places where the memo comes from different sources:
- `service.ts` `publish` builds the binding with `o:this.origin`, which is the config value at publish time.
- `ReceiptService.memo()` later rebuilds it by parsing `Origin:` out of `row.message`, which was set at challenge time.

If the origin config changes during the 5-minute window (for example, a restart with a different port or host), two things break:
- The on-chain `o` won't match the message the wallet signed, so the verifier rejects the wallet signature.
- `inspect` compares against a different string and marks a finalized, successful tx as `failed`. That re-opens publishing and leads to a duplicate anchor.

The line-splitting reconstruction is also fragile in general.
- **Fix:**
  - At challenge, store the `origin` used in the message.
  - At publish, build the binding from the stored values and persist the exact memo string (`row.memo`) together with `wire` before sending.
  - `inspect`/`refresh` should compare against `row.memo` only, and `memo()` should be deleted.
  - Add a test that pins `claimMessage` in `shared/receipt.ts` against the verifier's copy in `tools/verify-solana-receipt.ts`.

**B3. (conditional) The attestor seed and DB live under the repo's `.cache/`.** In `createReceiptService`, the defaults are `.cache/solana/attestor.seed` and `receipts.sqlite`.
- Vite's default `server.fs.deny` only covers `.env*`, `*.{crt,pem}`, and `.git`. With the workspace root in `fs.allow`, a network-reachable dev server (your 5175) can serve `/@fs/<abs>/.cache/solana/attestor.seed`. Anyone who gets the seed can forge receipts.
- The `git ls-files` check also only catches files that are already tracked. It does not catch an untracked file that a later `git add -A` would commit.
- **Fix:**
  - Default the key and DB to a path outside the repo (`$XDG_STATE_HOME/gitzilla/`).
  - Or add `'**/.cache/**'` to `server.fs.deny`.
  - Also require `git check-ignore` to pass.
  - Verify that the production static root cannot reach `.cache`.

**B4. (conditional on bots being allowed in PvP rooms) One human plus bots gets a "PvP win."** `record` only rejects `participants.length === 0`. Also, `entrants: players.length` counts the bots.
- **Fix:**
  - Return `{}` unless there are at least 2 human participants.
  - Set `entrants` to the human count, or add a `humans` field (still v1, nothing has shipped).

**B5. (conditional) `record` must not be able to break match end.** It does N synchronous `synchronous=FULL` writes on the game loop. They are not wrapped in a transaction, so a crash mid-loop leaves partial receipts, and a throw (disk full, `SQLITE_BUSY`) propagates into RoomServer.
- **Fix:**
  - Wrap the loop in `BEGIN IMMEDIATE…COMMIT`, which also means a single fsync.
  - The caller in `rooms.ts` should `try/catch` the call and send no receipt ids on failure.

## Nonblocking, high priority

**Wallet UX: an expired message causes a re-sign loop.** In `panel.ts` `Sign message and anchor`: if the user takes more than 5 minutes in the wallet, `publish` returns 409 "signing message expired". But `message` is still set, so the next click re-signs the same stale message and gets 409 again.
- **Fix:** on any `/publish` error, clear `message` and re-fetch the view.
- Optionally show the expiry countdown.

**Client timeout is shorter than the server's worst case.** The client aborts after 15 s. On the server:
- `publish` can take up to about 24 s (genesis check, then `getLatestBlockhash`, then `send`, each with an 8 s limit).
- `refresh` can take up to about 40 s.

The server still persists the pending row correctly, but the client shows a raw `TimeoutError` with a stale "Sign" button.
- **Fix:** have `publish` return right after the durable `put(pending)` and do the `send` in the background.
- Also: re-GET the view on any client error, and raise the client timeout to about 30 s.

**Anchors can be dropped and nothing rebroadcasts them.** Only one send is made, with `maxRetries:2`. After that, rebroadcast only happens when the user clicks "Check anchor status". On devnet, dropped transactions are common, and the result is `expired` plus a re-sign.
- **Fix:** add a bounded server-side rebroadcast loop per pending row: resend every 2 s until it's confirmed or past `lastValidHeight`.
- On startup, run one `refresh`-style reconcile over pending rows.
- In the client, auto-poll with backoff for about 2 minutes after publish.

**Enforce single-process at the DB level.** Two things are only safe with one process:
- The in-memory `lock` stops working if dev and live (5173/5175) run from the same checkout and share `receipts.sqlite`.
- The DB has no `busy_timeout`.

**Fix:** after opening, set `PRAGMA locking_mode=EXCLUSIVE` and do a write, so a second process fails fast. Or make status transitions compare-and-set in SQL.

**The rate limit and Origin check are tied to deployment.** In `http.ts`:
- `remoteAddress` behind a proxy or tunnel turns the 120/min limit into a global limit for everyone.
- POSTs always send `Origin`, so access via a LAN IP, `127.0.0.1` vs `localhost`, or a tunnel hostname gets 403 for every action.
- Handle trusted forwarded-for headers explicitly, and document the exact origin.

**`.well-known` does a full table scan.** `store.keys()` JSON-parses every row on an unauthenticated endpoint.
- **Fix:** add an `attestor` column (`SELECT DISTINCT`), or cache the key list in memory, which only changes when the key does.

**The privacy disclosure is incomplete.** The `explain` text should also say:
- The receipt id and approximate time (`e`) become public.
- The fee payer is Gitzilla's attestor, so anyone can list every anchored wallet as a Gitzilla player by reading that account's history.
- It cannot be deleted.

**Data minimization in the DB.** There is no retention policy.
- Once a row is `finalized`, `expired`, or `failed`, null out `wire` and `nonce`, and also `message` once the memo is stored.
- Prune unclaimed rows after N days, and tell users to download.
- `ownerHash` links a player's receipts across matches if room tokens are long-lived.

## Nonblocking, smaller

- **`service.ts` `challenge`:** once any wallet signature exists, the wallet can never change, even after `expired`/`failed` when nothing landed on chain. Once B1 is fixed, allow changing the wallet in those terminal states. The client already hides "Change wallet" there.
- **`refresh` on expired/failed:** the response keeps `transaction`/`explorer` pointing at a tx that doesn't exist. Clear them or label them.
- **`inspect`:** it returns `failed` on `status.err` even at `processed`. Wait for `confirmed` first.
- **Panel account filter:** `a.chains.includes('solana:devnet')` isn't needed for `signMessage` and may hide valid accounts. Require only the `solana:signMessage` feature.
- **Ledger-backed wallets:** they may return off-chain-message-formatted signatures, which the exact-bytes check correctly rejects. Document that hardware wallets are unsupported, or support the format.
- **Panel `api()`:** `res.json()` on a proxy HTML 502 shows "Unexpected token <". Catch it and show the generic message.
- **i18n:** the literal strings (`'Open match receipt'`, `'Connect wallet'`, etc.) aren't wrapped in `t()`. Check whether `h()` auto-translates them, and add them to `sources.json`.
- **Download contents:** the download has no txid, so third parties can't run `--transaction` without asking. Add an "anchor proof" download, `{receipt, transaction}`, once finalized.
- **Verifier:**
  - Print `binding.o` and `binding.w`.
  - Allow an `--rpc` override.
  - Optionally check `blockTime <= e/1000 + slack`, or document that `e` is only the signing window.
- **`loadSeed`:**
  - It silently generates a new key if the file disappears, which is an unannounced rotation. In production, require an explicit env flag to generate one.
  - Write to a temp file, fsync, then link.
  - Check the parent directory's mode.
- **`body()`:** on a 413/408, set `Connection: close` or `req.destroy()` instead of draining forever.
- **Key reuse:** the attestor key is also the fee payer. I found no cross-protocol collision (the receipt prefix can't parse as a transaction message). Separate keys would still let you rotate the hot fee wallet without archiving receipts.
- **Product honesty:** a "win" by forfeit or disconnect is farmable with two tabs. Either skip receipts for abandoned matches or add an `end` reason field. This is consistent with "no fair-play claim," but cheap to make explicit.
- **Scope to keep minimal:** current key plus a static archived-key list (no DB scan), no auto wallet-change paths, no NFTs or badges. The current scope is otherwise right-sized.

## Needs runtime proof

1. **Devnet end-to-end:** publish through to finalized, and `verify-solana-receipt.ts --transaction` passes. Check the memo size with a 100-character origin.
2. **Crash safety:**
   - Kill the process between `put(pending)` and `send`, restart, and confirm `refresh` resends the same bytes and finalizes.
   - Kill it during `prepare` and confirm the same signature can still be republished.
3. **RPC black-hole:** with the RPC unreachable, the row stays `pending`. After restore and the height passes, it becomes `expired`, and a re-sign works. Run the B1 race test with a stubbed lagging node.
4. **Concurrency:** two tabs publishing at the same time produce exactly one tx.
5. **Wallets:** Phantom, Solflare, and Backpack (account `chains`/features, raw `signMessage` bytes, cancel paths), plus a Ledger-backed account.
6. **`encode58`:** test vectors with leading-zero signatures (about 1 in 256 signatures). Also a parity test between `canonical` and the verifier's `sorted`.
7. **Access control:**
   - Each client receives only its own receipt id.
   - The token stays stable across reconnect and reload. If it rotates, the hash captured at start locks the owner out.
   - The receipt can be reopened after leaving the results screen.
8. **Infrastructure:**
   - A request for the seed via dev and prod URLs (including `/@fs/`) returns 403/404.
   - Origin and IP behavior behind the real proxy.
   - `record` latency on the game loop with 8 players, and match end still works when the disk is full.
9. **Scope check:** private-match freezing actually excludes matches where a repo was public at start but becomes private, and bots never count as PvP entrants.
