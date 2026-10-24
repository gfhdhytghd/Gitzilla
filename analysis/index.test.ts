import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { profileFromFiles } from './graph.ts';

const mocks = vi.hoisted(() => ({
  github: vi.fn(), readFile: vi.fn(), stat: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn(),
}));
vi.mock('./github.ts', () => ({ analyzeGitHubRepo: mocks.github }));
vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile, stat: mocks.stat, mkdir: mocks.mkdir, writeFile: mocks.writeFile }));
const profile = profileFromFiles('demo/project', [{ path: 'src/main.ts', text: 'export const main = 1;' }]);

beforeEach(() => {
  vi.stubEnv('GITHUB_TOKEN', '');
  vi.resetModules(); vi.resetAllMocks();
  mocks.readFile.mockRejectedValue(new Error('ENOENT'));
  mocks.stat.mockRejectedValue(new Error('ENOENT'));
  mocks.github.mockResolvedValue(profile);
});

afterEach(() => { vi.unstubAllEnvs(); });

describe('public repo analysis API', () => {
  it('normalizes owner/repo and GitHub URLs, including clone URLs and tree links', async () => {
    const { normalizeSlug } = await import('./index.ts');
    for (const input of ['Demo/Project', ' Demo/Project.git ', 'https://github.com/Demo/Project/', 'http://www.github.com/Demo/Project.git', 'github.com/Demo/Project/tree/main/src?tab=readme']) {
      expect(normalizeSlug(input)).toBe('demo/project');
    }
    for (const input of ['', 'demo', 'demo/project/extra', '../secret', 'https://evil.test/a/b', 'https://github.com/a', 'demo/..', 'demo/.', 'demo/proj?x']) {
      expect(() => normalizeSlug(input)).toThrow('GitHub repository');
    }
  });
  it('deduplicates concurrent normalized requests, persists live profiles, and returns independent copies', async () => {
    const { analyzeRepo } = await import('./index.ts');
    const [a, b] = await Promise.all([analyzeRepo('Demo/Project'), analyzeRepo('https://github.com/demo/project')]);
    expect(mocks.github).toHaveBeenCalledTimes(1); expect(a).toEqual(b); expect(a).not.toBe(b);
    expect(mocks.writeFile).toHaveBeenCalledWith(expect.stringContaining('/.cache/analysis/demo/project.json'), expect.any(String));
    a.components[0].name = 'mutated';
    expect((await analyzeRepo('demo/project')).components[0].name).not.toBe('mutated');
    expect(mocks.github).toHaveBeenCalledTimes(1);
  });
  it('uses fresh disk cache, and ignores an unavailable cache directory on successful analysis', async () => {
    const { analyzeRepo } = await import('./index.ts');
    mocks.readFile.mockResolvedValueOnce(JSON.stringify(profile)); mocks.stat.mockResolvedValueOnce({ mtimeMs: Date.now() });
    expect(await analyzeRepo('demo/project')).toEqual(profile); expect(mocks.github).not.toHaveBeenCalled();
    mocks.github.mockResolvedValueOnce({ ...profile, slug: 'demo/other' }); mocks.mkdir.mockRejectedValueOnce(new Error('EROFS'));
    expect((await analyzeRepo('demo/other')).slug).toBe('demo/other');
  });
  it('corrects primary language on pre-existing fresh cache entries without refetching', async () => {
    const { analyzeRepo } = await import('./index.ts');
    mocks.readFile.mockResolvedValue(JSON.stringify({ ...profile, primaryLanguage: 'CSS', languages: { CSS: 5000, Java: 100 } }));
    mocks.stat.mockResolvedValue({ mtimeMs: Date.now() });
    expect((await analyzeRepo('demo/project')).primaryLanguage).toBe('Java');
    expect(mocks.github).not.toHaveBeenCalled();
  });
  it('refreshes pre-context cache entries even if their modification time is fresh', async () => {
    const { analyzeRepo } = await import('./index.ts');
    const { readme: _readme, tree: _tree, ...old } = profile;
    mocks.readFile.mockResolvedValue(JSON.stringify(old)); mocks.stat.mockResolvedValue({ mtimeMs: Date.now() });
    expect((await analyzeRepo('demo/project')).tree).toContain('src/main.ts');
    expect(mocks.github).toHaveBeenCalledOnce();
  });
  it('refreshes pre-DNA disk cache entries and keeps source-free fallback DNA explicitly empty', async () => {
    const { analyzeRepo, syntheticProfile } = await import('./index.ts');
    const { dna: _dna, ...old } = profile;
    mocks.readFile.mockResolvedValue(JSON.stringify(old)); mocks.stat.mockResolvedValue({ mtimeMs: Date.now() });
    expect((await analyzeRepo('demo/project')).dna).toEqual(profile.dna);
    expect(mocks.github).toHaveBeenCalledOnce();
    expect(syntheticProfile('demo/offline').dna?.identifiers).toEqual([]);
    expect(syntheticProfile('demo/offline').dna?.longestFunction).toBeNull();
  });
  it('refreshes old advisory caches and strips unverified claims if the refresh fails', async () => {
    const { analyzeRepo } = await import('./index.ts');
    mocks.readFile.mockResolvedValue(JSON.stringify({ ...profile, vulns: [{ id: 'OLD', pkg: 'demo', ecosystem: 'npm', summary: 'Unverified' }] }));
    mocks.stat.mockResolvedValue({ mtimeMs: Date.now() });
    mocks.github.mockRejectedValue(new Error('offline'));
    const result = await analyzeRepo('demo/project');
    expect(mocks.github).toHaveBeenCalledOnce();
    expect(result.fallback).toBe(true); expect(result.vulns).toEqual([]);
  });
  it('uses stale real cache on network failure and marks that response as fallback', async () => {
    const { analyzeRepo } = await import('./index.ts');
    mocks.readFile.mockResolvedValue(JSON.stringify(profile)); mocks.stat.mockResolvedValue({ mtimeMs: Date.now() - 2 * 86_400_000 });
    mocks.github.mockRejectedValue(new Error('offline'));
    const result = await analyzeRepo('demo/project');
    expect(result.totalFiles).toBe(profile.totalFiles); expect(result.fallback).toBe(true);
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
  it('returns checked-in real profiles offline, or a deterministic labeled synthetic profile for unknown repos', async () => {
    const { analyzeRepo, listFallbackRepos, syntheticProfile } = await import('./index.ts');
    mocks.github.mockRejectedValue(new Error('offline'));
    const famous = await analyzeRepo('facebook/react');
    expect(famous.fallback).toBe(true); expect(famous.totalFiles).toBeGreaterThan(100);
    expect(listFallbackRepos().length).toBeGreaterThanOrEqual(12);
    const synthetic = await analyzeRepo('demo/unknown');
    expect(synthetic).toEqual(syntheticProfile('demo/unknown'));
    expect(synthetic.description).toContain('synthetic'); expect(synthetic.fallback).toBe(true);
    expect(synthetic.stars).toBe(0); expect(synthetic.contributors).toBe(0);
  });
  it('rejects garbage before calling GitHub', async () => {
    const { analyzeRepo } = await import('./index.ts');
    await expect(analyzeRepo('garbage')).rejects.toThrow('GitHub repository');
    expect(mocks.github).not.toHaveBeenCalled();
  });
});
