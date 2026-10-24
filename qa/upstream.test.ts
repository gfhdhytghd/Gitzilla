import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeGitHubRepo } from '../analysis/github.ts';
import { ARCHIVE_LIMITS } from '../analysis/tar.ts';

const fs = vi.hoisted(() => ({ readFile: vi.fn(), stat: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn() }));
vi.mock('node:fs/promises', () => fs);
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.stubEnv('GITHUB_TOKEN', '');
  fs.readFile.mockRejectedValue(new Error('No public cache in QA fixture'));
  fs.stat.mockRejectedValue(new Error('No public cache in QA fixture'));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('upstream failure injection, no external network or real credentials', () => {
  for (const code of [403, 404, 429, 503]) {
    it(`HTTP ${code}: known fallback is real data, unknown/private repo is explicitly synthetic`, async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: code })));
      const { analyzeRepo } = await import('../analysis/index.ts');
      const known = await analyzeRepo('pallets/flask', { token: '' });
      expect(known.fallback).toBe(true); expect(known.totalFiles).toBeGreaterThan(1);
      const unknown = await analyzeRepo('qa/nonexistent-qa-round2', { token: '' });
      expect(unknown.fallback).toBe(true); expect(unknown.description).toContain('synthetic');
      const privateRepo = await analyzeRepo('qa/private-qa-round2', { token: 'QA-DUMMY-NOT-A-CREDENTIAL' });
      expect(privateRepo.fallback).toBe(true); expect(privateRepo.description).toContain('synthetic');
      expect(JSON.stringify(privateRepo)).not.toContain('QA-DUMMY');
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  }
  it('offline fetch rejection falls back without persisting invented metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    const { analyzeRepo } = await import('../analysis/index.ts');
    const profile = await analyzeRepo('qa/offline-round2', { token: '' });
    expect(profile.description).toContain('synthetic'); expect(profile.stars).toBe(0);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
  it('slow upstream aborts within bounded timeout', async () => {
    const fetcher = vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    }));
    const start = Date.now();
    await expect(analyzeGitHubRepo('qa/slow-round2', { timeoutMs: 80, token: '', fetcher: fetcher as typeof fetch })).rejects.toThrow();
    expect(Date.now() - start).toBeLessThan(1500);
  });
  it('oversized streamed archive cancels the body before unbounded buffering', async () => {
    let cancelled = false;
    const archive = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(ARCHIVE_LIMITS.maxBytes + 1)); },
      cancel() { cancelled = true; },
    });
    const fetcher = async (input: string | URL | Request) => String(input).includes('codeload')
      ? new Response(archive)
      : new Response('{}', { status: 200 });
    await expect(analyzeGitHubRepo('qa/huge-round2', { token: '', fetcher: fetcher as typeof fetch })).rejects.toThrow(/limit/i);
    expect(cancelled).toBe(true);
  });
});
