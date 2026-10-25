// The Solana slide's sample receipt digest must be what the server would really compute for that payload and salt.
import { describe, expect, it } from "vitest";
import { receiptDigest } from "../../server/receipts/crypto.ts";
import { ANCHOR_URL, SAMPLE, SAMPLE_DIGEST, SAMPLE_SALT } from "./scenes/solana.ts";

describe("demo Solana slide", () => {
  it("shows the real salted digest of its sample receipt", () => {
    expect(receiptDigest(SAMPLE, SAMPLE_SALT)).toBe(SAMPLE_DIGEST);
  });
  it("links the QR to a devnet Explorer transaction, never mainnet", () => {
    expect(ANCHOR_URL).toMatch(/^https:\/\/explorer\.solana\.com\/tx\/[1-9A-HJ-NP-Za-km-z]{87,88}\?cluster=devnet$/);
  });
});
