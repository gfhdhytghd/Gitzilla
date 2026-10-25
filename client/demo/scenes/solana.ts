// 9 · Match receipts: the optional Solana anchor as an animated flow. A PvP result becomes a server-signed receipt
// (JSON typing in), its salted SHA-256 digest resolves, a wallet signs a plain message (never a transaction), and
// Gitzilla's sponsored Memo carries the digest to Solana devnet. Then "verify anywhere" and the first real anchor:
// a finalized devnet Memo from a 2-human PvP royale on live (Explorer screenshot + a QR to its tx page, decoded to
// verify; getTransaction checked: finalized, fee payer = attestor, Memo = receipt ID + digest + wallet). Static: no
// RPC, no API. The flow's receipt is a labelled sample; its digest is the real receiptDigest() of SAMPLE (pinned by
// solana.test.ts). Devnet only, never mainnet.
import { h } from "../../app/util.ts";
import type { Scene } from "../core.ts";
import { clearOverQr, typeLines } from "./fx.ts";
import qrPng from "../assets/qr-anchor-tx.png";
import explorerShot from "../assets/anchor-explorer.jpg";
import type { ReceiptPayload } from "../../../shared/receipt.ts";

export const ATTESTOR = "7qT6auzXr8EWbLXSkcFTksbFudi7i9sdfw4qRcUfngAu";
/** The first real anchor (devnet, finalized at slot 514,986,981); the QR's target is its Explorer tx page. */
export const ANCHOR_TX = "3878L2WVAYBM5qUndpuKxaDn1YW4G5HRJC2FZU1FMVK1VUxg2tXY1CBb3z8xhCuheUUnAr2pdM8SLidc2P9dz4Qz";
export const ANCHOR_URL = `https://explorer.solana.com/tx/${ANCHOR_TX}?cluster=devnet`;
export const SAMPLE: ReceiptPayload = {
  version: 1, game: "gitzilla", mode: "pvp", id: "8f3c2a91-5d4e-4b7a-9c10-2e6f8d4b1a07", match: "c41d9e02-7a3b-4f58-8e6d-91b0a2c7f354",
  issuedAt: "2026-10-25T14:32:08.000Z", outcome: "win", placement: 1, entrants: 4, humans: 3, repo: "redis/redis", kos: 3, damage: 412.5,
};
export const SAMPLE_SALT = "8ff3453171d1777bf7d1d1fcc2879a5fde88957c1a72123783b4e12feb80c210";
export const SAMPLE_DIGEST = "4cafef89b462205b66168c225315d7fa27295edb425e918fcf6508c0e4302fb1";

const JSON_LINES = ["{", `  "outcome": "${SAMPLE.outcome}",`, `  "placement": ${SAMPLE.placement},`, `  "damage": ${SAMPLE.damage},`, `  "kos": ${SAMPLE.kos},`, `  "repo": "${SAMPLE.repo}"`, "}"];
const HEX = "0123456789abcdef";

export const solana: Scene = {
  id: "solana", title: "Match receipts", tracks: ["solana"],
  mount(el, life, ctx) {
    clearOverQr(el, life);
    const json = h("div.sol-json");
    const digest = h("div.sol-hex");
    const sign = h("div.sol-btn", null, "Sign message");
    const memo = h("div.sol-memo", null, ...["receipt ID", "salted digest", "wallet + its signature"].map((s, i) => h("div.sol-field", { style: `--i:${i}` }, s)));
    const cards = [
      h("div.sol-card.c1", null, h("b.sol-k", null, "Signed receipt"), h("div.sol-sub", null, "PvP · 2+ signed-in humans · public repos"), json,
        h("div.sol-foot", null, "Ed25519 by the server", h("br"), "JSON download · no wallet"), h("span.sol-sample", null, "sample")),
      h("div.sol-card.c2", null, h("b.sol-k", null, "Salted digest"), h("div.sol-sub", null, "SHA-256(result + salt)"), digest,
        h("div.sol-foot", null, "fresh salt per receipt,", h("br"), "kept in your JSON")),
      h("div.sol-card.c3", null, h("b.sol-k", null, "Wallet signs"),
        h("div.sol-wallet", null, h("div.sol-wh", null, "Phantom · Solflare"),
          h("div.sol-msg", null, "Gitzilla wallet binding v1", h("br"), "Network: solana:devnet", h("br"), `Receipt: ${SAMPLE.id.slice(0, 8)}…`, h("br"), `Digest: ${SAMPLE_DIGEST.slice(0, 8)}…`), sign),
        h("div.sol-foot", null, "a message, never a transaction")),
      h("div.sol-card.c4", null, h("b.sol-k", null, "Memo on devnet"), h("div.sol-chain", null, "Solana devnet"), memo,
        h("div.sol-foot", null, "Gitzilla signs and pays", h("br"), "the player never pays")),
    ];
    const links = [0, 1, 2].map(() => h("div.sol-link", null, h("i"), h("i"), h("i")));
    const flow = h("div.sol-flow", null, cards[0], links[0], cards[1], links[1], cards[2], links[2], cards[3]);
    const verify = h("div.sol-verify", null,
      h("b.sol-vk", null, "Verify anywhere"),
      h("div.sol-vrow", null, h("em", null, "offline"), " check the Ed25519 signature against the key at", h("code", null, "/.well-known/gitzilla-attestor.json")),
      h("div.sol-vrow", null, h("em", null, "on-chain"), " only a salted digest. No names, repos or code."));
    const shot = h("figure.sol-shot", null, h("img", { src: explorerShot, alt: "Solana Explorer, devnet: Success, Finalized, fee payer = Gitzilla attestor", width: 1000, height: 626, draggable: "false" }),
      h("figcaption", null, "Solana Explorer · devnet"));
    const qr = h("div.sol-qr", null,
      h("div.qr-box.sol-qrimg", null, h("img.qr-img", { src: qrPng, alt: `QR code for ${ANCHOR_URL}`, width: 912, height: 912, draggable: "false" })),
      h("div.sol-qrcap", null, h("b", null, "Real anchor"), h("span", null, "finalized on devnet"), h("span", null, "slot 514,986,981"), h("code", null, `${ANCHOR_TX.slice(0, 6)}…${ANCHOR_TX.slice(-5)}`)));
    el.append(h("h2.slide-h", null, "Match receipts: ", h("em", null, "proof you keep")), flow, verify, shot, qr);

    const show = (n: HTMLElement) => n.classList.add("on");
    const signed = () => { sign.classList.add("done"); sign.replaceChildren("Signed ", h("span.sol-tick", null, "✓")); };
    const hexRows = (s: string) => [0, 1, 2, 3].map((r) => s.slice(r * 16, r * 16 + 16)).join("\n");
    if (ctx.calm) {
      for (const n of [...cards, ...links, verify, shot, qr]) show(n);
      void typeLines(json, JSON_LINES, life, 0);
      digest.textContent = hexRows(SAMPLE_DIGEST);
      signed();
      return;
    }
    // one pass, left to right: each card lights up when the previous step's packets reach it
    void (async () => {
      show(cards[0]);
      await life.sleep(300);
      await typeLines(json, JSON_LINES, life, 10);
      show(links[0]); show(cards[1]);
      // the digest resolves left to right out of drifting hex (glyph changes only: no luminance swing)
      const t0 = performance.now();
      life.frame(() => {
        const k = Math.min(1, (performance.now() - t0) / 900), locked = Math.floor(k * 64);
        let s = SAMPLE_DIGEST.slice(0, locked);
        for (let i = locked; i < 64; i++) s += HEX[(Math.random() * 16) | 0];
        digest.textContent = hexRows(s);
      });
      await life.sleep(1000);
      show(links[1]); show(cards[2]);
      await life.sleep(1000);
      sign.classList.add("press");
      await life.sleep(350);
      sign.classList.remove("press"); signed();
      ctx.blip();
      await life.sleep(400);
      show(links[2]); show(cards[3]);
      await life.sleep(1000);
      show(verify); show(shot); show(qr);
    })();
  },
};
