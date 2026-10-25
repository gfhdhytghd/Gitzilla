import { afterEach, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReceiptStore } from '../receipts/store';
import { ReceiptService, type FinishedReceiptMatch } from '../receipts/service';
import { hash, signReceipt } from '../receipts/crypto';
import { ChainBoardStore } from './store';
import { ChainBoardService, boardMemo } from './service';
import { receiptBackfillMatches } from './backfill';
import { buildTree } from './tree';
import { verifyChainProof } from '../../shared/chain-board';
import type { ChainBoardSnapshot } from '../../shared/types';
const stores: {close(): void}[] = [], services: ChainBoardService[] = [], dirs: string[] = [];
afterEach(async () => { for (const service of services.splice(0)) await service.close(); for (const store of stores.splice(0)) store.close(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); });
function source() {
  const store = new ReceiptStore(':memory:'); stores.push(store);
  const seed = randomBytes(32), service = new ReceiptService(store, seed, 'https://example.test', undefined, () => 1_800_000_000_000);
  const input = { eligible: true, winner: 'a', placements: {a:1,b:2}, participants: [{id:'a',tokenHash:hash('do-not-publish-a')},{id:'b',tokenHash:hash('do-not-publish-b')}], result: {mode:'pvp',boss:null,victory:false,duration:1,mvp:'a',players:['a','b'].map(id => ({id,name:'Secret display '+id,repo:id+'/public',stats:{damage:0,bestCombo:0,limbsBroken:0,revives:0,killingBlow:false}}))} } as FinishedReceiptMatch;
  const ids = service.record(input), anchored = store.get(ids.a)!; anchored.status = 'finalized'; store.put(anchored);
  return {store,seed,service,input,rows:store.boardBackfillReceipts()};
}
function board(path = ':memory:') { return new ChainBoardStore(path); }
function start(store: ChainBoardStore, receipts: ReceiptStore) { const service = new ChainBoardService(store, receipts, undefined, () => 1_800_000_240_000, false); services.push(service); return service; }

it('backfills projects before boot snapshot even with a previously anchored empty snapshot, preserving history and badges', async () => {
  const f=source(), store=board();
  const empty: ChainBoardSnapshot = {id:'original-empty',at:1_800_000_000_000,root:buildTree([]).root,entries:[],status:'finalized',tx:'original-anchor',slot:42};
  store.save({snapshot:empty,memo:boardMemo(empty)});
  const service=start(store,f.store); await service.tick();
  expect(store.matches()).toHaveLength(1);
  expect(store.matches()[0].id).toBe('receipt-match:'+f.rows[0].receipt.payload.match);
  const result=service.response();
  expect(result.latest!.entries).toEqual([
    {kind:'project',key:'a/public',name:'a/public',wins:1,matches:1,bestPlacement:1,avgPlacement:1,anchoredReceipts:1},
    {kind:'project',key:'b/public',name:'b/public',wins:0,matches:1,bestPlacement:2,avgPlacement:2,anchoredReceipts:0},
  ]);
  expect(result.history[0]).toMatchObject({id:'original-empty',tx:'original-anchor',status:'finalized'});
  expect(store.snapshots().find(row=>row.snapshot.id==='original-empty')!.snapshot).toEqual(empty);
  expect(await verifyChainProof(service.proof(result.latest!.id,'project','a/public')!)).toBe(true);
  const output=JSON.stringify(result)+JSON.stringify(store.matches());
  for(const secret of ['ownerHash','tokenHash','do-not-publish','Secret display','wallet','github:'])expect(output).not.toContain(secret);
});

it('deduplicates receipt IDs per match and excludes incomplete, invalid, inconsistent, non-PvP and null-placement groups', () => {
  const f=source();
  expect(receiptBackfillMatches([...f.rows,...f.rows])).toHaveLength(1);
  expect(receiptBackfillMatches(f.rows.slice(0,1))).toEqual([]);
  const mutate=(change: object) => [{receipt:signReceipt({...f.rows[0].receipt.payload,...change},f.seed)},f.rows[1]];
  for(const change of [{mode:'edu'},{humans:1},{humans:3},{placement:null},{placement:0},{repo:'bad'},{entrants:1},{issuedAt:'invalid'},{issuedAt:'2020-01-01T00:00:00.000Z'},{outcome:'other'}])
    expect(receiptBackfillMatches(mutate(change))).toEqual([]);
  expect(receiptBackfillMatches([{receipt:{...f.rows[0].receipt,payload:{...f.rows[0].receipt.payload,repo:'tampered/repo'}}},f.rows[1]])).toEqual([]);
  const winner=f.rows.find(r=>r.receipt.payload.outcome==='win')!;
  const loser=f.rows.find(r=>r.receipt.payload.outcome==='loss')!;
  expect(receiptBackfillMatches([winner,{receipt:signReceipt({...loser.receipt.payload,outcome:'win'},f.seed)}])).toEqual([]);
});

it('persists the one-time marker across restart, including a migration with no eligible rows', async () => {
  const dir=mkdtempSync(join(tmpdir(),'board-backfill-'));dirs.push(dir);const path=join(dir,'board.sqlite');
  const receiptStore=new ReceiptStore(':memory:');stores.push(receiptStore);
  const first=start(board(path),receiptStore); expect(first.store.needsReceiptBackfill()).toBe(false);
  await first.close();services.splice(services.indexOf(first),1);
  const f=source(); for(const row of f.rows) receiptStore.put(f.store.get(row.receipt.payload.id)!);
  const reopened=start(board(path),receiptStore);await reopened.tick();
  expect(reopened.store.matches()).toEqual([]);expect(reopened.response().latest!.entries).toEqual([]);
});

it('does not enumerate or backfill receipts when live board match records already exist', () => {
  const f=source(),store=board();store.record({id:'live',at:1,players:[]});
  const read=vi.spyOn(f.store,'boardBackfillReceipts');start(store,f.store);
  expect(read).not.toHaveBeenCalled();expect(store.matches().map(m=>m.id)).toEqual(['live']);
});

it('commits matches and migration marker together, rolling back an interrupted import', () => {
  const f=source();f.service.record(f.input);const matches=receiptBackfillMatches(f.store.boardBackfillReceipts());expect(matches).toHaveLength(2);
  const store=board();stores.push(store);const put=store.record.bind(store);let writes=0;
  const failure=vi.spyOn(store,'record').mockImplementation(match=>{put(match);if(++writes===2)throw new Error('disk failure');});
  expect(()=>store.backfillIfEmpty(matches)).toThrow('disk failure');
  expect(store.matches()).toEqual([]);expect(store.needsReceiptBackfill()).toBe(true);
  failure.mockRestore();store.backfillIfEmpty(matches);store.backfillIfEmpty(matches);
  expect(store.matches()).toHaveLength(2);expect(store.needsReceiptBackfill()).toBe(false);
});


it('does not duplicate a successful import after reopening the board database', async () => {
  const dir=mkdtempSync(join(tmpdir(),'board-import-restart-'));dirs.push(dir);const path=join(dir,'board.sqlite');
  const f=source(),first=start(board(path),f.store);await first.tick();
  const imported=first.store.matches();expect(imported).toHaveLength(1);
  await first.close();services.splice(services.indexOf(first),1);
  f.service.record(f.input);
  const next=start(board(path),f.store);await next.tick();
  expect(next.store.matches()).toEqual(imported);
  expect(next.response().latest!.entries.every(row=>row.matches===1)).toBe(true);
});
