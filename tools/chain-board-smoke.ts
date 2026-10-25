/** Opt-in synthetic devnet board smoke. Never requests funds or uses the production sponsor. */
import { resolve, relative } from 'node:path';
import { realpathSync } from 'node:fs';
import { loadSeed, hash } from '../server/receipts/crypto';
import { ReceiptService, type FinishedReceiptMatch } from '../server/receipts/service';
import { ReceiptStore } from '../server/receipts/store';
import { SolanaRpc } from '../server/receipts/rpc';
import { ChainBoardStore } from '../server/chain-board/store';
import { ChainBoardService } from '../server/chain-board/service';
import { verifyChainProof } from '../shared/chain-board';
if (!process.argv.includes('--send-devnet')) throw new Error('Pass --send-devnet for an isolated synthetic devnet smoke.');
const dir = resolve(process.env.CHAIN_BOARD_SMOKE_DIR || '.cache/chain-board-smoke');
const actual = (path: string) => { try { return realpathSync(path); } catch { return resolve(path); } };
const productionDir = actual(process.env.SOLANA_RECEIPTS_DIR || '.cache/solana');
const key = resolve(dir, 'attestor.seed');
const rel = relative(productionDir, actual(dir));
if (!rel || !rel.startsWith('..') || actual(key) === actual(process.env.SOLANA_ATTESTOR_KEY_FILE || '.cache/solana/attestor.seed')) throw new Error('Use a separate isolated smoke directory and key.');
const seed = loadSeed(key), rpc = new SolanaRpc();
const receipts = new ReceiptStore(resolve(dir, 'receipts.sqlite'));
const signer = new ReceiptService(receipts, seed, 'https://smoke.invalid', rpc);
let board: ChainBoardService | undefined;
try {
  let balance: number;
  try { balance = await rpc.balance(signer.attestor); }
  catch { console.log(JSON.stringify({ status: 'SKIP', reason: 'Devnet RPC unavailable', synthetic: true })); process.exitCode = 2; }
  if (balance! < 10000) { console.log(JSON.stringify({ status: 'SKIP', reason: 'Isolated devnet key is unfunded; no airdrop or production sponsor used', attestor: signer.attestor, synthetic: true })); process.exitCode = 2; }
  else if (balance! >= 10000) {
    board = new ChainBoardService(new ChainBoardStore(resolve(dir, 'chain-board.sqlite')), receipts, signer.boardAnchor(), Date.now, false);
    const input = { eligible: true, winner: 'a', placements: { a: 1, b: 2 }, participants: [{ id: 'a', tokenHash: hash('synthetic-a'), publicKey: 'smoke:a' }, { id: 'b', tokenHash: hash('synthetic-b'), publicKey: 'smoke:b' }], result: { mode: 'pvp', victory: false, boss: null, duration: 1, mvp: 'a', players: ['a', 'b'].map(id => ({ id, name: `Synthetic ${id}`, repo: `synthetic/${id}`, stats: { damage: 0, bestCombo: 0, limbsBroken: 0, revives: 0, killingBlow: false } })) } } as FinishedReceiptMatch;
    board.record(input, {}); await board.tick();
    for (let i = 0; i < 30 && board.response().latest?.status === 'pending'; i++) { await new Promise(r => setTimeout(r, 2000)); await board.tick(); }
    const snapshot = board.response().latest!;
    const verified = await verifyChainProof(board.proof(snapshot.id, 'player', 'smoke:a')!);
    console.log(JSON.stringify({ status: snapshot.status === 'finalized' && verified ? 'PASS' : 'PENDING', synthetic: true, root: snapshot.root, tx: snapshot.tx, slot: snapshot.slot, verified }));
    if (snapshot.status !== 'finalized' || !verified) process.exitCode = 2;
  }
} finally { await board?.close(); receipts.close(); }
