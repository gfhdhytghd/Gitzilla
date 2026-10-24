import { expect, it } from 'vitest';
import { squadBudget } from './balance';
import { bossKitFromProfile } from './kits';
import { profileFromFiles } from '../analysis/graph';

it('reduces the previous HP baseline to one third and scales per combatant', () => {
  expect(squadBudget(4).hp).toBe(Math.round(25520 / 3));
  for (let count = 1; count <= 8; count++) expect(squadBudget(count).hp).toBe(Math.round(6380 * count / 3));
  expect(squadBudget(0).hp).toBe(squadBudget(1).hp);
  expect(squadBudget(30).hp).toBe(squadBudget(8).hp);
});

it('scales breakable limbs with boss health without changing anatomy', () => {
  const profile = profileFromFiles('demo/repo', [{ path: 'main.py', text: 'print(42)' }]);
  const baseline = bossKitFromProfile(profile, 4);
  for (const count of [1, 2, 8]) {
    const kit = bossKitFromProfile(profile, count);
    expect(Math.abs(kit.maxHp - baseline.maxHp * count / 4)).toBeLessThanOrEqual(1);
    expect(kit.limbs.map(l => l.id)).toEqual(baseline.limbs.map(l => l.id));
    kit.limbs.forEach((limb, i) => expect(Math.abs(limb.maxHp - baseline.limbs[i].maxHp * count / 4)).toBeLessThanOrEqual(1));
  }
});
