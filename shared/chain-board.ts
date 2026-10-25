import type { ChainBoardProof } from './types';
import { canonical } from './receipt';

/** Verifies membership only. The caller must independently trust/check the on-chain root. */
export async function verifyChainProof(proof: ChainBoardProof): Promise<boolean> {
  try {
    const hex = /^[a-f0-9]{64}$/;
    if (!hex.test(proof.root) || !hex.test(proof.leaf) || !Array.isArray(proof.path) || proof.path.length > 64) return false;
    const digest = async (bytes: Uint8Array) => new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
    const toHex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    let node = await digest(new TextEncoder().encode(canonical(proof.entry)));
    if (toHex(node) !== proof.leaf) return false;
    for (const sibling of proof.path) {
      if (!hex.test(sibling.hash) || !['left', 'right'].includes(sibling.side)) return false;
      const other = Uint8Array.from(sibling.hash.match(/../g)!, b => parseInt(b, 16));
      const pair = new Uint8Array(64);
      pair.set(sibling.side === 'left' ? other : node);
      pair.set(sibling.side === 'left' ? node : other, 32);
      node = await digest(pair);
    }
    return toHex(node) === proof.root;
  } catch { return false; }
}
