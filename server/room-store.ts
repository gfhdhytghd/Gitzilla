import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { GameMode, LobbyPlayer, LobbyState, RepoProfile, Role } from '../shared/types.ts';

export interface SavedPlayer {
  id: string;
  token: string; // Room resume token only. GitHub/Auth0 credentials are never persisted here.
  name: string;
  role?: Role;
  namedByUser?: boolean;
  privateRepo?: boolean;
  botSeed?: number;
  lobby: LobbyPlayer;
}
export interface SavedRoom {
  code: string;
  ownerId: string;
  mode?: GameMode;
  teacherId?: string;
  players: SavedPlayer[];
  boss: LobbyState['boss'];
  bossProfile?: RepoProfile; // Public-only. Credentialed boss source/kit is memory-only.
  privateBoss?: boolean;
  phase: LobbyState['phase'];
  restartNotice?: string;
}

export class RoomStore {
  revokedTokens: string[] = [];
  constructor(private file: string) {}

  load(): SavedRoom[] {
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as { version: number; rooms: SavedRoom[]; revokedTokens?: string[] };
      if (data.version !== 1 || !Array.isArray(data.rooms)) throw new Error('Unknown room store version');
      this.revokedTokens = Array.isArray(data.revokedTokens) ? data.revokedTokens.filter(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)) : [];
      return data.rooms.filter(room => /^[A-Z]{4}$/.test(room.code) && Array.isArray(room.players));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Room persistence could not be restored; stale room codes can still be recreated.');
      return [];
    }
  }

  save(rooms: SavedRoom[], revokedTokens: string[] = []): void {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify({ version: 1, rooms, revokedTokens }) + '\n', { mode: 0o600 });
      renameSync(temporary, this.file);
    } finally { rmSync(temporary, { force: true }); }
  }
}
