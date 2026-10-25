import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface RoyaleWin { name: string; repo: string; wins: number; kos: number; damage: number; at: string }

/** The caller admits only matches whose source was analysed anonymously/publicly. */
export class RoyaleHall {
  constructor(private file: string) {}
  private read(): RoyaleWin[] {
    try { const rows = JSON.parse(readFileSync(this.file, 'utf8')); return Array.isArray(rows) ? rows : []; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  }
  top(): RoyaleWin[] { return this.read().slice(0, 20); }
  record(winner: { name: string; repo: string; kos: number; damage: number }) {
    const rows = this.read();
    let row = rows.find(r => r.name === winner.name && r.repo.toLowerCase() === winner.repo.toLowerCase());
    if (!row) { row = { name: winner.name, repo: winner.repo, wins: 0, kos: 0, damage: 0, at: '' }; rows.push(row); }
    row.wins++; row.kos += winner.kos; row.damage += winner.damage; row.at = new Date().toISOString();
    rows.sort((a, b) => b.wins - a.wins || b.kos - a.kos || b.damage - a.damage || b.at.localeCompare(a.at));
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, JSON.stringify(rows.slice(0, 200)) + '\n', { mode: 0o600 }); renameSync(temporary, this.file); }
    finally { rmSync(temporary, { force: true }); }
  }
}
