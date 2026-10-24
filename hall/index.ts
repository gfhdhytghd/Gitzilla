import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Autopsy } from '../shared/types.ts';

export interface FastestKill { boss: string; squad: string[]; seconds: number; at: string }
export interface DamageRecord { name: string; repo: string; damage: number; boss: string; at: string }
export interface BossRecord { boss: string; wins: number; losses: number }
export interface Hall {
  fastestKills: FastestKill[];
  topDamage: DamageRecord[];
  bossRecords: BossRecord[];
}
interface StoredHall {
  fastestKills: (FastestKill & { room: string })[];
  topDamage: (DamageRecord & { room: string })[];
  // Keep counts for every encountered boss; the public board is capped at twenty.
  bossRecords: BossRecord[];
}

const LIMIT = 20;
const DEFAULT_FILE = fileURLToPath(new URL('../.cache/hall.json', import.meta.url));
const byBoss = (a: BossRecord, b: BossRecord) => (b.wins + b.losses) - (a.wins + a.losses) || b.wins - a.wins || a.boss.localeCompare(b.boss);

/** File-scoped instance also permits isolated tests without touching the event leaderboard. */
export function createHall(file = DEFAULT_FILE): { recordMatch(autopsy: Autopsy, room: string, bossRepo: string): void; top(): Hall } {
  function read(): StoredHall {
    try { return JSON.parse(readFileSync(file, 'utf8')) as StoredHall; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return { fastestKills: [], topDamage: [], bossRecords: [] };
    }
  }

  function recordMatch(autopsy: Autopsy, room: string, bossRepo: string): void {
    // Classroom PvP has no boss and never enters the battle Hall.
    if (autopsy.mode === 'edu' || !autopsy.boss) return;
    const data = read();
    const at = new Date().toISOString();
    const boss = bossRepo.trim().toLowerCase();
    if (autopsy.victory) data.fastestKills.push({ boss, squad: autopsy.players.map(player => player.name), seconds: autopsy.duration, at, room });
    data.fastestKills.sort((a, b) => a.seconds - b.seconds || b.at.localeCompare(a.at));
    data.fastestKills = data.fastestKills.slice(0, LIMIT);
    for (const player of autopsy.players) {
      data.topDamage.push({ name: player.name, repo: player.repo, damage: player.stats.damage, boss, at, room });
    }
    data.topDamage.sort((a, b) => b.damage - a.damage || b.at.localeCompare(a.at) || a.name.localeCompare(b.name));
    data.topDamage = data.topDamage.slice(0, LIMIT);
    let record = data.bossRecords.find(entry => entry.boss === boss);
    if (!record) { record = { boss, wins: 0, losses: 0 }; data.bossRecords.push(record); }
    if (autopsy.victory) record.wins++; else record.losses++;
    data.bossRecords.sort(byBoss);

    // Same-directory rename atomically replaces the previous complete JSON file.
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', 'utf8');
      renameSync(temporary, file);
    } finally { rmSync(temporary, { force: true }); }
  }

  function top(): Hall {
    const data = read();
    return {
      fastestKills: data.fastestKills.slice(0, LIMIT).map(({ boss, squad, seconds, at }) => ({ boss, squad, seconds, at })),
      topDamage: data.topDamage.slice(0, LIMIT).map(({ name, repo, damage, boss, at }) => ({ name, repo, damage, boss, at })),
      bossRecords: data.bossRecords.sort(byBoss).slice(0, LIMIT),
    };
  }
  return { recordMatch, top };
}

const hall = createHall();
export function recordMatch(autopsy: Autopsy, room: string, bossRepo: string): void { hall.recordMatch(autopsy, room, bossRepo); }
export function top(): Hall { return hall.top(); }
