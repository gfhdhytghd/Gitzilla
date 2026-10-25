import type { SignedReceipt } from '../../shared/receipt';
import { verifyReceipt } from '../receipts/crypto';
import type { BoardMatch } from './store';

/** Only complete, internally consistent signed human-result groups establish historical matches. */
export function receiptBackfillMatches(rows: { receipt: SignedReceipt }[]): BoardMatch[] {
  const groups = new Map<string, Map<string, SignedReceipt>>();
  for (const { receipt } of rows) {
    try {
      const p = receipt.payload;
      if (!verifyReceipt(receipt) || p.version !== 1 || p.game !== 'gitzilla' || p.mode !== 'pvp'
        || typeof p.id !== 'string' || !p.id || typeof p.match !== 'string' || !p.match
        || !Number.isSafeInteger(p.humans) || p.humans < 2 || !Number.isSafeInteger(p.entrants) || p.entrants < p.humans
        || !Number.isSafeInteger(p.placement) || p.placement! < 1 || p.placement! > p.entrants
        || !['win', 'loss', 'draw'].includes(p.outcome) || !Number.isFinite(Date.parse(p.issuedAt))
        || !/^[\w.-]+\/[\w.-]+$/.test(p.repo)) continue;
      const group = groups.get(p.match) ?? new Map<string, SignedReceipt>();
      group.set(p.id, receipt); groups.set(p.match, group);
    } catch { /* Invalid signatures or incomplete payloads are not backfilled. */ }
  }
  const matches: BoardMatch[] = [];
  for (const [match, group] of groups) {
    const receipts = [...group.values()].sort((a, b) => a.payload.id.localeCompare(b.payload.id));
    const first = receipts[0];
    if (receipts.length !== first.payload.humans || receipts.filter(r => r.payload.outcome === 'win').length > 1
      || receipts.some(r => r.payload.humans !== first.payload.humans || r.payload.entrants !== first.payload.entrants
        || r.payload.issuedAt !== first.payload.issuedAt || r.attestor !== first.attestor)) continue;
    matches.push({ id: `receipt-match:${match}`, at: Date.parse(first.payload.issuedAt), players: receipts.map(({ payload: p }) => ({
      repo: p.repo.toLowerCase(), placement: p.placement!, win: p.outcome === 'win', receipt: p.id,
    })) });
  }
  return matches.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}
