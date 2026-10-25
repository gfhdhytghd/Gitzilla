import { randomUUID } from 'node:crypto';
import type { ChainBoardEntry, ChainBoardResponse, ChainBoardSnapshot } from '../../shared/types';
import type { FinishedReceiptMatch } from '../receipts/service';
import type { ReceiptStore } from '../receipts/store';
import { ChainBoardStore, type StoredSnapshot } from './store';
import { buildTree, makeProof } from './tree';
import { receiptBackfillMatches } from './backfill';
export interface BoardAnchor {
  attestor: string;
  balance(): Promise<number>;
  prepare(memo: string): Promise<{ wire: string; signature: string; lastValidHeight: number }>;
  send(wire: string): Promise<string>;
  inspect(signature: string, attestor: string, memo: string, height: number): Promise<'pending' | 'finalized' | 'expired' | 'failed'>;
  slot?(signature: string): Promise<number | undefined>;
}
export const boardMemo = (snapshot: ChainBoardSnapshot) => JSON.stringify({ app: 'gitzilla', board: 1, root: snapshot.root, n: snapshot.entries.length, at: snapshot.at });
export class ChainBoardService {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  constructor(readonly store: ChainBoardStore, private receipts?: ReceiptStore, private anchor?: BoardAnchor, private now: () => number = Date.now, autoStart = true) {
    if (receipts && store.needsReceiptBackfill()) store.backfillIfEmpty(receiptBackfillMatches(receipts.boardBackfillReceipts()));
    if (autoStart) {
      void this.tick().catch(() => {});
      this.timer = setInterval(() => { void this.tick().catch(() => {}); }, 10000);
      this.timer.unref();
    }
  }
  record(input: FinishedReceiptMatch, ids: Record<string, string>) {
    if (!input.eligible || input.result.mode !== 'pvp' || input.result.boss || input.participants.length < 2) return;
    const players = input.participants.map(owner => {
      const player = input.result.players.find(p => p.id === owner.id), placement = input.placements[owner.id];
      if (!player || !Number.isSafeInteger(placement) || placement < 1 || !/^[\w.-]+\/[\w.-]+$/.test(player.repo)) return undefined;
      return { key: owner.publicKey ?? player.name, name: player.name, repo: player.repo.toLowerCase(), placement, win: input.winner === owner.id, ...(ids[owner.id] ? { receipt: ids[owner.id] } : {}) };
    });
    if (players.some(p => !p) || new Set(players.map(p => p!.key)).size !== players.length) return;
    this.store.record({ id: randomUUID(), at: this.now(), players: players as NonNullable<typeof players[number]>[] });
    void this.tick().catch(() => {});
  }
  private entries(): ChainBoardEntry[] {
    const entries = new Map<string, ChainBoardEntry & { total: number }>();
    for (const match of this.store.matches()) for (const p of match.players) {
      const anchored = p.receipt && this.receipts?.get(p.receipt)?.status === 'finalized' ? 1 : 0;
      for (const kind of ['player', 'project'] as const) {
        if (kind === 'player' && !p.key) continue;
        const key = kind === 'player' ? p.key! : p.repo, mapKey = kind + ':' + key;
        const entry = entries.get(mapKey) ?? { kind, key, name: kind === 'player' ? p.name ?? key : p.repo, ...(kind === 'player' ? { repo: p.repo } : {}), wins: 0, matches: 0, bestPlacement: p.placement, avgPlacement: 0, anchoredReceipts: 0, total: 0 };
        entry.name = kind === 'player' ? p.name ?? key : p.repo;
        if (kind === 'player') entry.repo = p.repo;
        entry.wins += Number(p.win); entry.matches++; entry.total += p.placement;
        entry.bestPlacement = Math.min(entry.bestPlacement, p.placement); entry.anchoredReceipts += anchored;
        entries.set(mapKey, entry);
      }
    }
    return [...entries.values()].map(({ total, ...entry }) => ({ ...entry, avgPlacement: Math.round(total / entry.matches * 100) / 100 }));
  }
  response(): ChainBoardResponse {
    const rows = this.store.snapshots();
    return { latest: rows[0]?.snapshot ?? null, history: rows.slice(1, 21).map(({ snapshot: s }) => ({ id: s.id, at: s.at, root: s.root, status: s.status, ...(s.tx ? { tx: s.tx } : {}) })), explorer: 'https://explorer.solana.com/tx/{tx}?cluster=devnet' };
  }
  proof(id: string, kind: string, key: string) {
    const row = this.store.snapshots().find(row => row.snapshot.id === id);
    return row && makeProof(row.snapshot, kind, key);
  }
  tick(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.update().finally(() => { this.running = undefined; });
    return this.running;
  }
  private async reconcile(row: StoredSnapshot) {
    if (!this.anchor || !row.wire || !row.snapshot.tx || row.lastValidHeight === undefined || !row.attestor) return;
    try {
      const status = await this.anchor.inspect(row.snapshot.tx, row.attestor, row.memo, row.lastValidHeight);
      if (status === 'pending') { await this.anchor.send(row.wire).catch(() => {}); return; }
      row.snapshot.status = status === 'finalized' ? 'finalized' : 'unavailable';
      if (status === 'finalized') {
        const slot = await this.anchor.slot?.(row.snapshot.tx).catch(() => undefined);
        if (slot !== undefined) row.snapshot.slot = slot;
      }
      delete row.wire; this.store.save(row);
    } catch { /* Unknown stays pending; never rebuild an unknown transaction. */ }
  }
  private async update() {
    const rows = this.store.snapshots();
    for (const row of rows) if (row.snapshot.status === 'pending') await this.reconcile(row);
    // Do not create another transaction while any previous broadcast is unresolved.
    if (rows.some(row => row.snapshot.status === 'pending')) return;
    const tree = buildTree(this.entries()), previous = rows[0];
    if (previous && this.now() - previous.snapshot.at < 120000) return;
    if (previous?.snapshot.root === tree.root && previous.snapshot.status === 'finalized') return;
    const snapshot: ChainBoardSnapshot = { id: randomUUID(), at: this.now(), root: tree.root, entries: tree.entries, status: 'unavailable' };
    const row: StoredSnapshot = { snapshot, memo: boardMemo(snapshot) };
    this.store.save(row);
    if (!this.anchor) return;
    try {
      if (await this.anchor.balance() < 10000) return;
      const prepared = await this.anchor.prepare(row.memo);
      row.attestor = this.anchor.attestor; row.wire = prepared.wire; row.lastValidHeight = prepared.lastValidHeight;
      snapshot.tx = prepared.signature; snapshot.status = 'pending';
      this.store.save(row); // Durable exact bytes and txid before the first network broadcast.
      await this.anchor.send(prepared.wire).catch(() => {});
    } catch { /* Unavailable snapshot remains readable. Gameplay never waits. */ }
  }
  async close() { if (this.timer) clearInterval(this.timer); await this.running; this.store.close(); }
}
