import { afterEach, expect, it, vi } from 'vitest';
import { createMatch, playerKitFromProfile, bossKitFromProfile } from '../sim';
import { offlineProfile } from '../analysis';
import { protectMotionProofPlayer, requireMotionFixtureEnvironment, startMotionFixture } from './motion-fixture';
import type { MatchState } from '../shared/types';
afterEach(() => vi.unstubAllEnvs());
it('refuses to start or apply test protection under NODE_ENV=production', async () => {
  expect(() => requireMotionFixtureEnvironment('production')).toThrow('test-only');
  vi.stubEnv('NODE_ENV', 'production');
  await expect(startMotionFixture('http://localhost:5176', '/unused')).rejects.toThrow('test-only');
});
it('protects only the named player inside the real simulation, while ordinary damage remains active', () => {
  vi.stubEnv('NODE_ENV', 'test');
  const kit = playerKitFromProfile(offlineProfile('lodash/lodash'));
  const match = createMatch([{ id: 'proof', name: 'motion-v3', kit }, { id: 'normal', name: 'normal', kit }], bossKitFromProfile(offlineProfile('pallets/flask'), 2));
  const engine = match as unknown as { state: MatchState };
  const wrapped = protectMotionProofPlayer(match, 'proof');
  for (let i = 0; i < 1800; i++) wrapped.step(1 / 30, new Map());
  const protectedPlayer = engine.state.players.find(p => p.id === 'proof')!;
  expect(protectedPlayer.alive).toBe(true);
  expect(protectedPlayer.hp).toBe(kit.maxHp);
  expect(protectedPlayer.armor).toBe(kit.maxArmor);
  expect(protectedPlayer.invuln).toBeGreaterThan(0);
  expect(engine.state.players.find(p => p.id === 'normal')!.hp).toBeLessThan(kit.maxHp);
  expect(wrapped.snapshot().t).toBeGreaterThan(59);
});
it('fails rather than pretending to protect a snapshot copy or an unknown engine', () => {
  vi.stubEnv('NODE_ENV', 'test');
  expect(() => protectMotionProofPlayer({} as any, 'proof')).toThrow('Real simulation state missing');
});
