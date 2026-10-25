import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AnchorStatus, SignedReceipt } from '../../shared/receipt';
export interface ReceiptRecord {
  id: string; ownerHash: string; receipt: SignedReceipt; status: AnchorStatus;
  wallet: string | null; nonce: string | null; expires: number | null;
  message: string | null; challengeOrigin: string | null; memo: string | null; walletSignature: string | null;
  transaction: string | null; wire: string | null; lastValidHeight: number | null;
}
/** Small, synchronous durable writes. Pending bytes/signature commit before any RPC send. */
export class ReceiptStore {
  private db: DatabaseSync;
  constructor(path: string) {
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(path);
    try{
    if(path!==':memory:')chmodSync(path,0o600);
    this.db.exec(`PRAGMA busy_timeout=1000; PRAGMA locking_mode=EXCLUSIVE; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, owner TEXT NOT NULL, value TEXT NOT NULL); CREATE INDEX IF NOT EXISTS receipt_owner ON receipts(owner); CREATE TABLE IF NOT EXISTS attestors (key TEXT PRIMARY KEY); INSERT OR IGNORE INTO attestors SELECT DISTINCT json_extract(value, '$.receipt.attestor') FROM receipts; CREATE TABLE IF NOT EXISTS receipt_handoffs (hash TEXT PRIMARY KEY, receipt TEXT NOT NULL, expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS receipt_access (hash TEXT PRIMARY KEY, receipt TEXT NOT NULL, expires INTEGER NOT NULL);`);
    }catch(error){this.db.close();throw error;}
  }
  get(id: string): ReceiptRecord | undefined {
    const row=this.db.prepare('SELECT value FROM receipts WHERE id=?').get(id) as {value:string}|undefined;
    return row ? JSON.parse(row.value) as ReceiptRecord : undefined;
  }
  /** Server-only migration projection. Never includes owner hashes, wallets or claim credentials. */
  boardBackfillReceipts(): { receipt: SignedReceipt; status: AnchorStatus }[] {
    const result: { receipt: SignedReceipt; status: AnchorStatus }[] = [];
    for (const row of this.db.prepare('SELECT id,value FROM receipts ORDER BY id').all() as { id: string; value: string }[]) {
      try {
        const record = JSON.parse(row.value) as ReceiptRecord;
        if (record.receipt?.payload?.id === row.id) result.push({ receipt: record.receipt, status: record.status });
      } catch { /* A malformed row cannot establish a historical result. */ }
    }
    return result;
  }
  put(record: ReceiptRecord) {
    this.db.prepare('INSERT OR IGNORE INTO attestors(key) VALUES(?)').run(record.receipt.attestor);
    this.db.prepare('INSERT INTO receipts(id,owner,value) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(record.id,record.ownerHash,JSON.stringify(record));
  }
  keys(): string[] {
    return (this.db.prepare('SELECT key FROM attestors').all() as {key:string}[]).map(row=>row.key);
  }
  issueHandoff(id:string,hash:string,expires:number,now:number) {
    this.transaction(()=>{
      this.db.prepare('DELETE FROM receipt_handoffs WHERE expires<=? OR receipt=?').run(now,id);
      this.db.prepare('DELETE FROM receipt_access WHERE expires<=? OR receipt=?').run(now,id);
      this.db.prepare('INSERT INTO receipt_handoffs(hash,receipt,expires) VALUES(?,?,?)').run(hash,id,expires);
    });
  }
  redeemHandoff(id:string,ticketHash:string,grantHash:string,expires:number,now:number):boolean {
    return this.transaction(()=>{
      const row=this.db.prepare('SELECT receipt,expires FROM receipt_handoffs WHERE hash=?').get(ticketHash) as {receipt:string;expires:number}|undefined;
      if(!row||row.receipt!==id||row.expires<=now)return false;
      this.db.prepare('DELETE FROM receipt_handoffs WHERE hash=?').run(ticketHash);
      this.db.prepare('INSERT INTO receipt_access(hash,receipt,expires) VALUES(?,?,?)').run(grantHash,id,expires);
      return true;
    });
  }
  allows(id:string,tokenHash:string,now:number):boolean {
    return !!this.db.prepare('SELECT 1 FROM receipt_access WHERE hash=? AND receipt=? AND expires>?').get(tokenHash,id,now);
  }
  transaction<T>(fn:()=>T):T {
    this.db.exec('BEGIN IMMEDIATE');
    try{const value=fn();this.db.exec('COMMIT');return value;}
    catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  close() { this.db.close(); }
}
