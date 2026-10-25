import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AnchorStatus, SignedReceipt } from '../../shared/receipt';
export interface ReceiptRecord {
  id: string; ownerHash: string; receipt: SignedReceipt; status: AnchorStatus;
  wallet: string | null; nonce: string | null; expires: number | null;
  message: string | null; walletSignature: string | null;
  transaction: string | null; wire: string | null; lastValidHeight: number | null;
}
/** Small, synchronous durable writes. Pending bytes/signature commit before any RPC send. */
export class ReceiptStore {
  private db: DatabaseSync;
  constructor(path: string) {
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(path);
    if(path!==':memory:')chmodSync(path,0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, owner TEXT NOT NULL, value TEXT NOT NULL); CREATE INDEX IF NOT EXISTS receipt_owner ON receipts(owner); CREATE TABLE IF NOT EXISTS attestors (key TEXT PRIMARY KEY); INSERT OR IGNORE INTO attestors SELECT DISTINCT json_extract(value, '$.receipt.attestor') FROM receipts;`);
  }
  get(id: string): ReceiptRecord | undefined {
    const row=this.db.prepare('SELECT value FROM receipts WHERE id=?').get(id) as {value:string}|undefined;
    return row ? JSON.parse(row.value) as ReceiptRecord : undefined;
  }
  put(record: ReceiptRecord) {
    this.db.prepare('INSERT OR IGNORE INTO attestors(key) VALUES(?)').run(record.receipt.attestor);
    this.db.prepare('INSERT INTO receipts(id,owner,value) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(record.id,record.ownerHash,JSON.stringify(record));
  }
  keys(): string[] {
    return (this.db.prepare('SELECT key FROM attestors').all() as {key:string}[]).map(row=>row.key);
  }
  close() { this.db.close(); }
}
