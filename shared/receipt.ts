/** Public, source-free receipt format. No opponent identity, code, grades or commit claims. */
export interface ReceiptPayload {
  version: 1; game: 'gitzilla'; mode: 'pvp'; id: string; match: string; issuedAt: string;
  outcome: 'win' | 'loss' | 'draw'; placement: number | null; entrants: number;
  repo: string; kos: number; damage: number;
}
export interface SignedReceipt {
  payload: ReceiptPayload; salt: string; digest: string; attestor: string; signature: string;
}
export type AnchorStatus = 'unclaimed' | 'pending' | 'finalized' | 'expired' | 'failed';
export interface ReceiptView {
  receipt: SignedReceipt;
  network: 'solana:devnet'; status: AnchorStatus; wallet: string | null;
  transaction: string | null; explorer: string | null;
  anchorAvailable: boolean;
}
export const RECEIPT_PREFIX = 'gitzilla-receipt-v1\0';
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, v]) => JSON.stringify(key) + ':' + canonical(v)).join(',') + '}';
}
export function claimMessage(input: { origin: string; id: string; digest: string; wallet: string; attestor: string; nonce: string; expires: number }) {
  return ['Gitzilla wallet binding v1', `Origin: ${input.origin}`, 'Network: solana:devnet', `Receipt: ${input.id}`,
    `Digest: ${input.digest}`, `Wallet: ${input.wallet}`, `Attestor: ${input.attestor}`, `Nonce: ${input.nonce}`,
    `Expires: ${new Date(input.expires).toISOString()}`, 'Bind this wallet to this server-attested result. No token transfer or mainnet transaction.'].join('\n');
}
