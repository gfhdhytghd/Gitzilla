import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ChainBoardSnapshot } from '../../shared/types';
// Historical receipts lack public player identities; those results contribute to projects only.
export interface BoardMatch { id: string; at: number; players: { key?: string; name?: string; repo: string; placement: number; win: boolean; receipt?: string }[] }
export interface StoredSnapshot { snapshot: ChainBoardSnapshot; memo: string; attestor?: string; wire?: string; lastValidHeight?: number }
export class ChainBoardStore {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    try {
      if (path !== ':memory:') chmodSync(path, 0o600);
      this.db.exec('PRAGMA busy_timeout=1000; PRAGMA locking_mode=EXCLUSIVE; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS board_matches (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS board_snapshots (id TEXT PRIMARY KEY, at INTEGER NOT NULL, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS board_metadata (key TEXT PRIMARY KEY);');
    } catch (error) { this.db.close(); throw error; }
  }
  record(match: BoardMatch) { this.db.prepare('INSERT OR IGNORE INTO board_matches VALUES (?,?)').run(match.id, JSON.stringify(match)); }
  needsReceiptBackfill(): boolean {
    return !this.db.prepare('SELECT 1 FROM board_matches LIMIT 1').get()
      && !this.db.prepare("SELECT 1 FROM board_metadata WHERE key='receipt-backfill-v1'").get();
  }
  backfillIfEmpty(matches: BoardMatch[]) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.needsReceiptBackfill()) {
        for (const match of matches) this.record(match);
        this.db.prepare("INSERT INTO board_metadata(key) VALUES('receipt-backfill-v1')").run();
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  matches(): BoardMatch[] { return (this.db.prepare('SELECT value FROM board_matches ORDER BY rowid').all() as { value: string }[]).map(row => JSON.parse(row.value)); }
  save(row: StoredSnapshot) { this.db.prepare('INSERT INTO board_snapshots VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(row.snapshot.id, row.snapshot.at, JSON.stringify(row)); }
  snapshots(): StoredSnapshot[] { return (this.db.prepare('SELECT value FROM board_snapshots ORDER BY at DESC, rowid DESC').all() as { value: string }[]).map(row => JSON.parse(row.value)); }
  close() { this.db.close(); }
}
