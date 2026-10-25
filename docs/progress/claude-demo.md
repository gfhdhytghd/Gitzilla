DONE (Solana slide) — /demo slide 9 "Match receipts", right after "Under the hood"; the deck now has 11 slides.

## Solana match receipts slide (2026-10-25)
- **What it shows.** A one-pass animated flow over about 6 s:
  - **Signed receipt:** JSON types in, marked "sample". Card text: "PvP · 2+ signed-in humans · public repos",
    "Ed25519 by the server", "JSON download · no wallet".
  - **Salted digest:** the hex resolves from left to right.
  - **Wallet signs:** a Phantom · Solflare message dialog with the real `claimMessage` header lines; its "Sign
    message" button turns to "Signed". Card text: "a message, never a transaction".
  - **Memo on devnet:** receipt ID, salted digest, wallet + its signature. Card text: "Gitzilla signs and pays · the
    player never pays".
  - **Bottom row:** "Verify anywhere" (offline Ed25519 check against `/.well-known/gitzilla-attestor.json`; on-chain
    only a salted digest, with no names, repos or code); a crop of the coordinator's phone screenshot of the Explorer
    tx (Success, Finalized, fee payer = attestor); and a "Real anchor" QR card (finalized on devnet, slot
    514,986,981, `3878L2…dz4Qz`).
- **Track badge:** "HackPSU track · Solana" (new `solana` entry in `TRACKS`). It names a target, never a winner.
- **Facts checked:**
  - Against `shared/receipt.ts`, `server/receipts/{crypto,service,rpc,http}.ts` and `client/receipts/mobile.ts`.
  - The sample digest is the real `receiptDigest(SAMPLE, SAMPLE_SALT)`, pinned by `client/demo/solana.test.ts`.
  - I checked the real tx with `getTransaction` on devnet RPC (finalized commitment): slot 514986981, no error, the
    attestor `7qT6…ngAu` is the only signer and fee payer, and the Memo carries v, id, d, w, o, n, e and s.
  - Everything is devnet; there are no mainnet claims.
- **Assets:**
  - `client/demo/assets/qr-anchor-tx.png`: 912 px, 1-bit, 49 modules × 16 px, encoded the same way as `server/qr.ts`.
    It points to the Explorer tx URL.
  - `client/demo/assets/anchor-explorer.jpg`: 1000×626, cropped from IMG_3496 with no status bar.
  - The QR slide switches off the CRT overlay, like the other QR slides.
- **No network:** the deck makes no requests to `/api/*` or `/ws`. The built demo chunk contains no `/api/` and no
  `new WebSocket`.
- **Checks** (copies of the deck QA scripts with the new slide added, run against :5175):
  - Overflow: the whole deck passes in Chromium and WebKit at 1920 and 1280.
  - Flash, Chromium screencast: every slide passes at both sizes. The Solana slide was captured for 9 s; its largest
    change was 0.1% of the screen.
  - Luminance jump: every slide passes in WebKit and Chromium at both sizes. Solana's max jump was 0.5%.
  - QR, decoded with zbar from real screenshots: the Explorer tx URL decodes in all 4 engine/size runs; the play and
    close QRs still decode.
  - Touch, WebKit iPad: 16 of 16 pass, including swipe, tap and keys into and out of slide 9.
  - Reduced motion shows the final state.
  - Root `tsc` clean; `vitest client/demo` 2 of 2; `npm run build` OK.
- **Notes:**
  - Number keys still jump to slides 1–10 (0 is now Vision). The Thanks slide (11) is reached with →, a swipe or the
    progress bar.
  - The checked-in QA scripts under `docs/ux-shots/demo/` still list 10 slides. Updated copies are in this session's
    scratchpad.
  - No commits.
