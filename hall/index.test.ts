import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Autopsy } from '../shared/types.ts';
import { createHall } from './index.ts';

let directory: string;
let file: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'repo-kaiju-hall-')); file = join(directory, 'cache/hall.json'); });
afterEach(() => { vi.restoreAllMocks(); rmSync(directory, { recursive: true, force: true }); });
const match = (victory = true, duration = 120, damage = 300): Autopsy => ({
  victory, duration, boss: { repo: 'ignored/old-boss', limbs: [], heart: 'src/heart.ts' }, mvp: 'one',
  players: [
    { id: 'one', name: 'Ada', repo: 'ada/compiler', stats: { damage, bestCombo: 4, limbsBroken: 2, revives: 1, killingBlow: victory } },
    { id: 'two', name: 'Grace', repo: 'grace/runtime', stats: { damage: damage / 2, bestCombo: 2, limbsBroken: 1, revives: 0, killingBlow: false } },
  ],
});

describe('Hall of Monsters', () => {
  it('starts empty without creating or requiring a cache directory', () => {
    expect(createHall(file).top()).toEqual({ fastestKills: [], topDamage: [], bossRecords: [] });
    expect(readdirSync(directory)).toEqual([]);
  });
  it('records a victory with squad names, per-match damage, boss counts, and ISO timestamps', () => {
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-10-24T20:00:00.000Z');
    const hall = createHall(file);
    const source = match();
    const before = structuredClone(source);
    expect(hall.recordMatch(source, 'RAID', ' Facebook/React ')).toBeUndefined();
    expect(source).toEqual(before);
    expect(hall.top()).toEqual({
      fastestKills: [{ boss: 'facebook/react', squad: ['Ada', 'Grace'], seconds: 120, at: '2026-10-24T20:00:00.000Z' }],
      topDamage: [
        { name: 'Ada', repo: 'ada/compiler', damage: 300, boss: 'facebook/react', at: '2026-10-24T20:00:00.000Z' },
        { name: 'Grace', repo: 'grace/runtime', damage: 150, boss: 'facebook/react', at: '2026-10-24T20:00:00.000Z' },
      ],
      bossRecords: [{ boss: 'facebook/react', wins: 1, losses: 0 }],
    });
    expect(JSON.parse(readFileSync(file, 'utf8')).fastestKills[0].room).toBe('RAID');
  });
  it('records losses in damage and boss records without adding a fastest kill', () => {
    const hall = createHall(file);
    hall.recordMatch(match(false, 40, 900), 'LOSE', 'django/django');
    expect(hall.top().fastestKills).toEqual([]);
    expect(hall.top().topDamage[0].damage).toBe(900);
    expect(hall.top().bossRecords).toEqual([{ boss: 'django/django', wins: 0, losses: 1 }]);
  });
  it('persists across instances and counts rematches in the same room', () => {
    createHall(file).recordMatch(match(), 'SAME', 'vuejs/core');
    createHall(file).recordMatch(match(false), 'SAME', 'VUEJS/CORE');
    createHall(file).recordMatch(match(true, 60), 'SAME', 'vuejs/core');
    const result = createHall(file).top();
    expect(result.fastestKills.map(row => row.seconds)).toEqual([60, 120]);
    expect(result.bossRecords).toEqual([{ boss: 'vuejs/core', wins: 2, losses: 1 }]);
    expect(result.topDamage).toHaveLength(6);
    expect(readdirSync(join(directory, 'cache'))).toEqual(['hall.json']);
  });
  it('sorts and caps all three public boards at twenty without losing lifetime boss counts', () => {
    const hall = createHall(file);
    for (let i = 0; i < 25; i++) hall.recordMatch(match(true, 100 - i, 100 + i), `R${i}`, `boss/repo${i}`);
    let result = hall.top();
    expect(result.fastestKills).toHaveLength(20); expect(result.topDamage).toHaveLength(20); expect(result.bossRecords).toHaveLength(20);
    expect(result.fastestKills.map(row => row.seconds)).toEqual(Array.from({ length: 20 }, (_, i) => 76 + i));
    expect(result.topDamage.map(row => row.damage)).toEqual(Array.from({ length: 20 }, (_, i) => 124 - i));
    hall.recordMatch(match(false), 'REMATCH', 'boss/repo9');
    result = hall.top();
    expect(result.bossRecords[0]).toEqual({ boss: 'boss/repo9', wins: 1, losses: 1 });
    expect(JSON.parse(readFileSync(file, 'utf8')).fastestKills).toHaveLength(20);
    expect(JSON.parse(readFileSync(file, 'utf8')).topDamage).toHaveLength(20);
  });
  it('returns independent data so readers cannot mutate persisted results', () => {
    const hall = createHall(file); hall.recordMatch(match(), 'COPY', 'gin-gonic/gin');
    const result = hall.top(); result.fastestKills[0].squad[0] = 'changed'; result.bossRecords[0].wins = 999;
    expect(hall.top().fastestKills[0].squad[0]).toBe('Ada'); expect(hall.top().bossRecords[0].wins).toBe(1);
  });
  it('keeps the old file intact and cleans temporary files when the atomic rename fails', async () => {
    const hall = createHall(file); hall.recordMatch(match(), 'GOOD', 'redis/redis');
    const previous = readFileSync(file, 'utf8');
    // Use a module mock only for the failing writer; all other IO still uses the actual temp filesystem.
    vi.doMock('node:fs', async () => ({ ...await vi.importActual<typeof import('node:fs')>('node:fs'), renameSync: () => { throw new Error('rename failed'); } }));
    try {
      vi.resetModules();
      const { createHall: failingHall } = await import('./index.ts');
      expect(() => failingHall(file).recordMatch(match(false), 'FAIL', 'redis/redis')).toThrow('rename failed');
      expect(readFileSync(file, 'utf8')).toBe(previous);
      expect(readdirSync(join(directory, 'cache'))).toEqual(['hall.json']);
    } finally { vi.doUnmock('node:fs'); vi.resetModules(); }
  });
  it('reports malformed persisted data instead of silently overwriting it', () => {
    const hall = createHall(file); hall.recordMatch(match(), 'GOOD', 'redis/redis');
    writeFileSync(file, 'broken JSON');
    expect(() => hall.top()).toThrow();
    expect(() => hall.recordMatch(match(), 'FAIL', 'redis/redis')).toThrow();
    expect(readFileSync(file, 'utf8')).toBe('broken JSON');
  });
});
