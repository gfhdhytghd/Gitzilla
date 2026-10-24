import { expect, it } from 'vitest';
import { squadBudget } from './balance';
import { bossKitFromProfile } from './kits';
import { profileFromFiles } from '../analysis/graph';

it('keeps the four-player HP baseline and scales equally per combatant', () => {
  expect(squadBudget(4).hp).toBe(25520);
  for (let count = 1; count <= 8; count++) expect(squadBudget(count).hp).toBe(6380 * count);
  expect(squadBudget(0).hp).toBe(squadBudget(1).hp);
  expect(squadBudget(30).hp).toBe(squadBudget(8).hp);
});

it('scales breakable limbs with boss health without changing anatomy', () => {
  const profile = profileFromFiles('demo/repo', [{ path: 'main.py', text: 'print(42)' }]);
  const baseline = bossKitFromProfile(profile, 4);
  for (const count of [1, 2, 8]) {
    const kit = bossKitFromProfile(profile, count);
    expect(kit.maxHp).toBe(baseline.maxHp * count / 4);
    expect(kit.limbs.map(l => l.id)).toEqual(baseline.limbs.map(l => l.id));
    kit.limbs.forEach((limb, i) => expect(Math.abs(limb.maxHp - baseline.limbs[i].maxHp * count / 4)).toBeLessThanOrEqual(1));
  }
});
