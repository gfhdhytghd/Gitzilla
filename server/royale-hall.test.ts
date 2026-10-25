import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { RoyaleHall } from './royale-hall';

it('persists a separate bounded royale wins board and totals repeat public wins', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gitzilla-royale-hall-'));
  try {
    const file = join(dir, 'wins.json'), hall = new RoyaleHall(file);
    expect(hall.top()).toEqual([]);
    hall.record({ name: 'Alice', repo: 'alice/code', kos: 2, damage: 40 });
    hall.record({ name: 'Alice', repo: 'Alice/Code', kos: 3, damage: 60 });
    for (let i = 0; i < 220; i++) hall.record({ name: 'Demo ' + i, repo: 'demo/' + i, kos: 0, damage: 1 });
    expect(new RoyaleHall(file).top()).toHaveLength(20);
    expect(hall.top()[0]).toMatchObject({ name: 'Alice', wins: 2, kos: 5, damage: 100 });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(200);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
