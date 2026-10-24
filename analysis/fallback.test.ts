import { describe, expect, it } from 'vitest';
import { listFallbackRepos, offlineProfile } from './index.ts';
import { componentTopology, fnv1a } from './graph.ts';

describe('checked-in famous repository snapshots', () => {
  it('covers all fifteen requested repos with actual, consistent analyzed source profiles', () => {
    const repos = listFallbackRepos();
    expect(repos).toHaveLength(15);
    for (const slug of ['facebook/react', 'vuejs/core', 'expressjs/express', 'pallets/flask', 'fastapi/fastapi', 'django/django', 'rust-lang/rustlings', 'burntsushi/ripgrep', 'golang/example', 'gin-gonic/gin', 'redis/redis', 'lodash/lodash', 'spring-projects/spring-petclinic', 'jquery/jquery', 'karpathy/nanogpt']) {
      expect(repos).toContain(slug);
      const p = offlineProfile(slug);
      expect(p.slug).toBe(slug); expect(p.fallback).toBe(true);
      if (slug === 'spring-projects/spring-petclinic') expect(p.primaryLanguage).toBe('Java');
      expect(p.description).not.toContain('synthetic');
      expect(typeof p.readme).toBe('string'); expect(Buffer.byteLength(p.readme!)).toBeLessThanOrEqual(4096);
      expect(p.tree!.length).toBeGreaterThan(0); expect(p.tree!.length).toBeLessThanOrEqual(120);
      expect(new Set(p.tree).size).toBe(p.tree!.length); expect(p.tree).toContain(p.heart);
      expect(p.totalFiles).toBeGreaterThan(0); expect(p.totalLoc).toBeGreaterThan(0);
      expect(p.components.length).toBeGreaterThan(0); expect(p.components.length).toBeLessThanOrEqual(8);
      expect(new Set(p.components.map(c => c.name)).size).toBe(p.components.length);
      expect(p.components.map(c => c.loc)).toEqual(p.components.map(c => c.loc).sort((a, b) => b - a));
      expect(p.components.reduce((sum, c) => sum + c.files, 0)).toBe(p.totalFiles);
      expect(p.components.reduce((sum, c) => sum + c.loc, 0)).toBe(p.totalLoc);
      expect(p.seed).toBe(fnv1a(slug)); expect(p.heart.length).toBeGreaterThan(0);
      expect(p.testRatio).toBeGreaterThanOrEqual(0); expect(p.testRatio).toBeLessThanOrEqual(1);
      expect(Object.values(p.languages).every(bytes => bytes >= 0)).toBe(true);
      expect(p.edges.every(([a, b]) => a !== b && a >= 0 && b >= 0 && a < p.components.length && b < p.components.length)).toBe(true);
      for (const [i, c] of p.components.entries()) {
        expect(c.fanIn).toBe(p.edges.filter(([, to]) => to === i).length);
        expect(c.fanOut).toBe(p.edges.filter(([from]) => from === i).length);
      }
      expect(componentTopology(p.components.map(c => c.name), p.edges)).toEqual({ cycles: p.cycles, maxDepth: p.maxDepth });
    }
  });
});
