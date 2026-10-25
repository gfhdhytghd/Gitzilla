import { describe, expect, it } from 'vitest';
import { bossKitFromProfile } from '../sim/kits.ts';
import { distance, entropy, score, syntheticProfiles, type Feature } from './variety-sheet.ts';

const feature = (id: string, dHash: string, histogram: number[], group = 'mage'): Feature => ({
  id, dHash: dHash.padStart(16, '0'), histogram, entropyBits: entropy(histogram), group, origin: 'synthetic',
  base: group, palette: [], foregroundPixels: 1, bounds: [0, 0, 1, 1], touchesEdge: false, pixelHash: id,
});
describe('variety measurement', () => {
  it('uses normalized Hamming and histogram total variation with known endpoints', () => {
    const a = feature('a', '0', [1, 0]), b = feature('b', 'ffffffffffffffff', [0, 1]);
    expect(distance(a, a)).toEqual({ dHash: 0, histogram: 0, combined: 0 });
    expect(distance(a, b)).toEqual({ dHash: 1, histogram: 1, combined: 1 });
    expect(distance(a, b)).toEqual(distance(b, a));
    expect(distance(a, feature('c', '1', [.5, .5]))).toEqual({ dHash: 1 / 64, histogram: .5, combined: (.5 + 1 / 64) / 2 });
  });
  it('separates within-image palette complexity from across-image diversity', () => {
    expect(entropy([1, 0])).toBe(0); expect(entropy([.5, .5])).toBe(1);
    const result = score([feature('a', '0', [1, 0]), feature('b', '0', [0, 1])]);
    expect(result.paletteEntropy).toMatchObject({ pooledBits: 1, meanImageBits: 0, betweenImageBits: 1 });
    expect(result.lookalikePairs).toBe(0); expect(result.shapeLookalikes.pairs).toBe(1);
    expect(score([]).combined).toBeNull();
  });
  it('clusters only within a class/archetype, using connected look-alike components', () => {
    const result = score([feature('a', '0', [1, 0]), feature('b', '1', [.85, .15]), feature('c', '2', [.7, .3]), feature('d', '0', [1, 0], 'heavy')]);
    expect(result.pairs).toBe(6); expect(result.lookalikePairs).toBe(2);
    expect(result.clusters).toEqual([['a', 'b', 'c']]); expect(result.clusteredSamples).toBe(3);
  });
  it('keeps the declared 8-bit and0.20 thresholds fixed', () => {
    const a = feature('a', '0', [1, 0]);
    expect(score([a, feature('b', 'ff', [.8, .2])]).lookalikePairs).toBe(1);
    expect(score([a, feature('b', '1ff', [.8, .2])]).lookalikePairs).toBe(0);
    expect(score([a, feature('b', 'ff', [.79, .21])]).lookalikePairs).toBe(0);
  });
  it('creates30 deterministic, explicitly synthetic profiles spanning all boss archetypes', () => {
    const profiles = syntheticProfiles(); expect(profiles).toEqual(syntheticProfiles()); expect(profiles).toHaveLength(30);
    expect(new Set(profiles.map(p => p.seed)).size).toBe(30);
    expect(new Set(profiles.map(p => p.primaryLanguage)).size).toBeGreaterThanOrEqual(12);
    expect([...new Set(profiles.map(p => bossKitFromProfile(p, 4).archetype))].sort()).toEqual(['abyssal', 'hydra', 'kaiju', 'mecha']);
    for (const p of profiles) {
      expect(p.slug).toMatch(/^synthetic\//); expect(p.dna?.identifiers.length).toBe(24);
      expect(p.edges.every(([a, b]) => a < p.components.length && b < p.components.length)).toBe(true);
    }
  });
});
