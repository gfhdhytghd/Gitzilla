import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import type { ChainBoardEntry, ChainBoardProof, ChainBoardSnapshot } from '../../shared/types';
import { verifyChainProof } from '../../shared/chain-board';
import { buildTree, makeProof } from './tree';
import { ChainBoardStore } from './store';
import { ChainBoardService, boardMemo, type BoardAnchor } from './service';
import { handleChainBoardRoute } from './http';
import { ReceiptStore } from '../receipts/store';
import { ReceiptService, type FinishedReceiptMatch } from '../receipts/service';
import { hash, publicBytes, base58 } from '../receipts/crypto';
import { SolanaRpc, DEVNET_GENESIS } from '../receipts/rpc';
const services: ChainBoardService[] = [], receipts: ReceiptStore[] = [], dirs: string[] = [];
afterEach(async () => { for (const service of services.splice(0)) await service.close(); for (const store of receipts.splice(0)) store.close(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function entry(key: string): ChainBoardEntry { return { kind: 'player', key, name: key, wins: 1, matches: 2, bestPlacement: 1, avgPlacement: 1.5, anchoredReceipts: 0 }; }
function snap(entries: ChainBoardEntry[]): ChainBoardSnapshot { const tree = buildTree(entries); return { id: 'test', at: 1, root: tree.root, entries: tree.entries, status: 'pending' }; }
function input(): FinishedReceiptMatch {
  return { eligible: true, winner: 'a', placements: { a: 1, b: 2 }, participants: [{ id: 'a', tokenHash: hash('secret-a'), publicKey: 'github:1' }, { id: 'b', tokenHash: hash('secret-b'), publicKey: 'github:2' }], result: { mode: 'pvp', boss: null, victory: false, duration: 30, mvp: 'a', players: ['a', 'b'].map((id, i) => ({ id, name: ['Alice', 'Bob'][i], repo: id + '/public', stats: { damage: 10, bestCombo: 0, limbsBroken: 0, revives: 0, killingBlow: false } })) } };
}
function fixture(path = ':memory:', anchorEnabled = true, receiptStore?: ReceiptStore) {
  let now = 1_800_000_000_000;
  const store = new ChainBoardStore(path);
  const anchor: BoardAnchor = { attestor: 'public-attestor', balance: vi.fn(async () => 1e9), prepare: vi.fn(async () => ({ wire: 'private-wire', signature: 'public-tx', lastValidHeight: 90 })), send: vi.fn(async () => { expect(store.snapshots()[0].wire).toBe('private-wire'); return 'public-tx'; }), inspect: vi.fn(async () => 'pending' as const), slot: vi.fn(async () => 123) };
  const service = new ChainBoardService(store, receiptStore, anchorEnabled ? anchor : undefined, () => now, false); services.push(service);
  return { store, service, anchor, setNow: (value: number) => { now = value; } };
}
function temp() { const dir = mkdtempSync(join(tmpdir(), 'gitzilla-board-')); dirs.push(dir); return join(dir, 'board.sqlite'); }

describe('chain board Merkle contract', () => {
  it('matches independent SHA-256 known answers for single and odd leaves', async () => {
    expect(buildTree([entry('a')]).root).toBe('f20541370eb5084b94e3fc39dc742e23ffb313f5a5202c4a3688441e9edb9f10');
    const snapshot = snap([entry('c'), entry('a'), entry('b')]);
    expect(snapshot.root).toBe('3ecf9854215d705a5f7cf504ed1d46fc607f3ae364a00f490d1bccadeb521b8f');
    for (const key of ['a', 'b', 'c']) expect(await verifyChainProof(makeProof(snapshot, 'player', key)!)).toBe(true);
    expect(makeProof(snapshot, 'player', 'b')!.path[0].side).toBe('left');
    expect(makeProof(snapshot, 'player', 'a')!.path[0].side).toBe('right');
    expect(makeProof(snapshot, 'player', 'c')!.path).toHaveLength(1);
    expect(await verifyChainProof(makeProof(snap([entry('a')]), 'player', 'a')!)).toBe(true);
    expect(buildTree([]).root).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('rejects modified entry, leaf, root, sibling and direction', async () => {
    const proof = makeProof(snap([entry('a'), entry('b'), entry('c')]), 'player', 'a')!;
    const cases = [ { ...proof, entry: { ...proof.entry, wins: 100 } }, { ...proof, leaf: '0'.repeat(64) }, { ...proof, root: '0'.repeat(64) }, { ...proof, path: [{ ...proof.path[0], hash: 'f'.repeat(64) }, ...proof.path.slice(1)] }, { ...proof, path: [{ ...proof.path[0], side: 'left' as const }, ...proof.path.slice(1)] }, { ...proof, path: [{ hash: 'bad', side: 'left' as const }] }, null ];
    for (const bad of cases) expect(await verifyChainProof(bad as ChainBoardProof)).toBe(false);
  });
});
describe('durable qualifying boards', () => {
  it('excludes nonqualifying, private, bots-only and classroom results', async () => {
    const f = fixture(':memory:', false), match = input();
    f.service.record({ ...match, eligible: false }, {});
    f.service.record({ ...match, participants: [] }, {});
    f.service.record({ ...match, participants: match.participants.slice(0, 1) }, {});
    f.service.record({ ...match, result: { ...match.result, mode: 'edu' } }, {});
    f.service.record({ ...match, result: { ...match.result, boss: {} as never } }, {});
    expect(f.store.matches()).toEqual([]);
    f.service.record(match, {}); await f.service.tick();
    expect(f.service.response().latest!.entries).toHaveLength(4);
    expect(f.service.response().latest!.status).toBe('unavailable');
    expect(f.anchor.balance).not.toHaveBeenCalled();
  });
  it('aggregates stable players, projects and joins finalized receipt badges across restart', async () => {
    const path = temp(), receiptStore = new ReceiptStore(':memory:'); receipts.push(receiptStore);
    const receiptService = new ReceiptService(receiptStore, randomBytes(32), 'https://example.test');
    const match = input(), ids = receiptService.record(match), row = receiptStore.get(ids.a)!;
    row.status = 'finalized'; receiptStore.put(row);
    const f = fixture(path, false, receiptStore); f.service.record(match, ids); await f.service.tick();
    await f.service.close(); services.splice(services.indexOf(f.service), 1);
    const next = fixture(path, false, receiptStore); next.setNow(1_800_000_120_000);
    const second = input(); second.result.players[0].name = 'New Name'; second.winner = 'b'; second.placements = { a: 2, b: 1 };
    next.service.record(second, {}); await next.service.tick();
    const entries = next.service.response().latest!.entries;
    expect(entries.find(e => e.key === 'github:1')).toMatchObject({ name: 'New Name', matches: 2, wins: 1, bestPlacement: 1, avgPlacement: 1.5, anchoredReceipts: 1 });
    expect(entries.find(e => e.key === 'a/public')).toMatchObject({ kind: 'project', matches: 2, wins: 1, avgPlacement: 1.5, anchoredReceipts: 1 });
    expect(entries.map(e => e.kind + ':' + e.key)).toEqual(['player:github:1', 'player:github:2', 'project:a/public', 'project:b/public']);
    expect(await verifyChainProof(next.service.proof(next.service.response().latest!.id, 'project', 'a/public')!)).toBe(true);
  });
  it('persists before broadcast, recovers identical pending bytes and finalizes only after inspection', async () => {
    const path = temp(), f = fixture(path); f.service.record(input(), {}); await f.service.tick();
    expect(f.service.response().latest!.status).toBe('pending'); expect(f.anchor.prepare).toHaveBeenCalledTimes(1);
    await f.service.close(); services.splice(services.indexOf(f.service), 1);
    const next = fixture(path); await next.service.tick(); expect(next.anchor.prepare).not.toHaveBeenCalled(); expect(next.anchor.send).toHaveBeenCalledWith('private-wire');
    vi.mocked(next.anchor.inspect).mockRejectedValueOnce(new Error('offline')); await next.service.tick(); expect(next.service.response().latest!.status).toBe('pending');
    vi.mocked(next.anchor.inspect).mockResolvedValue('finalized'); await next.service.tick();
    expect(next.service.response().latest).toMatchObject({ status: 'finalized', slot: 123, tx: 'public-tx' });
    expect(next.anchor.inspect).toHaveBeenLastCalledWith('public-tx', 'public-attestor', next.store.snapshots()[0].memo, 90);
  });
  it('debounces new results and receipt changes to one anchor every two minutes', async () => {
    const f = fixture(); f.service.record(input(), {}); await f.service.tick();
    vi.mocked(f.anchor.inspect).mockResolvedValue('finalized'); await f.service.tick();
    f.service.record(input(), {}); await f.service.tick(); expect(f.anchor.prepare).toHaveBeenCalledTimes(1);
    f.setNow(1_800_000_119_999); await f.service.tick(); expect(f.anchor.prepare).toHaveBeenCalledTimes(1);
    f.setNow(1_800_000_120_000); await f.service.tick(); expect(f.anchor.prepare).toHaveBeenCalledTimes(2);
    expect(f.service.response().latest!.entries[0].matches).toBe(2);
  });
  it('keeps unresolved transactions pending and safely marks unfunded or expired anchors unavailable', async () => {
    const f = fixture(); vi.mocked(f.anchor.balance).mockResolvedValue(0); await f.service.tick();
    expect(f.service.response().latest!.status).toBe('unavailable'); expect(f.anchor.prepare).not.toHaveBeenCalled();
    f.setNow(1_800_000_120_000); vi.mocked(f.anchor.balance).mockResolvedValue(1e9); await f.service.tick();
    f.setNow(1_800_000_240_000); vi.mocked(f.anchor.inspect).mockRejectedValueOnce(new Error('unknown')); await f.service.tick(); expect(f.anchor.prepare).toHaveBeenCalledTimes(1);
    vi.mocked(f.anchor.inspect).mockResolvedValue('expired'); await f.service.tick();
    expect(f.service.response().history[0].status).toBe('unavailable'); expect(f.anchor.prepare).toHaveBeenCalledTimes(2);
  });
  it('publishes only snapshots/proofs and at most twenty history roots', async () => {
    const f = fixture(':memory:', false);
    for (let i = 0; i < 23; i++) { f.setNow(1_800_000_000_000 + i * 120000); f.service.record(input(), {}); await f.service.tick(); }
    const server = http.createServer((req, res) => { if (!handleChainBoardRoute(req, res, new URL(req.url!, 'http://localhost'), f.service)) { res.writeHead(404); res.end(); } });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      const response = await fetch(base + '/api/chain-board'), body = await response.json(); expect(response.status).toBe(200); expect(body.history).toHaveLength(20);
      const proof = await (await fetch(base + `/api/chain-board/proof?snapshot=${body.latest.id}&kind=player&key=github%3A1`)).json(); expect(await verifyChainProof(proof)).toBe(true);
      expect((await fetch(base + '/api/chain-board/proof?kind=bad')).status).toBe(400);
      expect((await fetch(base + '/api/chain-board', { method: 'POST' })).status).toBe(405);
      for (const secret of ['tokenHash', 'secret-a', 'private-wire', 'lastValidHeight', 'memo', 'seed']) expect(JSON.stringify(body) + JSON.stringify(proof)).not.toContain(secret);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it('builds the exact compact board Memo in a genuine transaction using a mocked RPC', async () => {
    const snapshot = snap([entry('a')]), memo = boardMemo(snapshot), seed = randomBytes(32), attestor = base58(publicBytes(seed));
    const fetcher = vi.fn(async (_url: unknown, init: any) => { const { method } = JSON.parse(init.body); const result = method === 'getGenesisHash' ? DEVNET_GENESIS : { value: { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 90 } }; return Response.json({ result }); }) as unknown as typeof fetch;
    const tx = await new SolanaRpc('https://devnet.example', fetcher).prepare(seed, attestor, memo);
    expect(memo).toBe(`{"app":"gitzilla","board":1,"root":"${snapshot.root}","n":1,"at":1}`);
    expect(Buffer.from(tx.wire, 'base64').includes(Buffer.from(memo))).toBe(true);
    expect(tx.lastValidHeight).toBe(90);
  });
});
