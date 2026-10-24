import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSensorTrace, createTraceBuffer, startAutomaticTrace } from './trace';
let trace: ReturnType<typeof createSensorTrace>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { setTimeout, clearTimeout }));
  vi.stubGlobal('navigator', { userAgent: 'test-UA', platform: 'test-platform' });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 201 })));
  trace = createSensorTrace();
});
afterEach(() => { trace.dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('uploads bounded raw samples automatically after 20s with only UA/platform metadata', async () => {
  trace.start(); trace.add({ type: 'motion', at: performance.now(), rotationRate: { alpha: 300, beta: 0, gamma: 0 }, acceleration: null });
  await vi.advanceTimersByTimeAsync(20_000);
  expect(trace.status).toBe('uploaded');
  const [url, request] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe('/api/trace'); expect(request?.method).toBe('POST');
  const body = JSON.parse(String(request?.body));
  expect(body).toMatchObject({ version: 3, userAgent: 'test-UA', platform: 'test-platform' });
  expect(body.samples[0]).toMatchObject({ type: 'motion', acceleration: null });
  expect(Object.keys(body).sort()).toEqual(['automated', 'durationMs', 'platform', 'samples', 'source', 'syntheticSensors', 'userAgent', 'version']);
});
it('reports unavailable endpoint and allows explicit retry without disrupting capture callers', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);
  trace.start(); expect(await trace.upload()).toBe(false);
  expect(trace.status).toBe('failed'); expect(trace.error).toContain('404');
  expect(await trace.upload()).toBe(true); expect(trace.error).toBeNull();
});
it('does not overwrite a pending upload, and flushes partial training on dispose', async () => {
  let resolve!: (response: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(new Promise(r => { resolve = r; }));
  trace.start(); const uploaded = trace.upload(); trace.start();
  expect(trace.status).toBe('uploading'); expect(trace.active).toBe(false);
  resolve({ ok: true } as Response); await uploaded;
  trace.start(); trace.add({ type: 'gesture', at: performance.now(), kind: 'skill', via: 'long-press' });
  trace.dispose(); await Promise.resolve(); await Promise.resolve();
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('rejects oversized payload locally and represents network errors without unhandled rejection', async () => {
  trace.start(); trace.add({ type: 'motion', at: performance.now(), raw: 'x'.repeat(2_000_000) });
  expect(await trace.upload()).toBe(false); expect(trace.error).toContain('size cap'); expect(fetch).not.toHaveBeenCalled();
  trace.start(); vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
  expect(await trace.upload()).toBe(false); expect(trace.error).toContain('offline');
});
it('keeps ~60Hz input sampled at 16ms without accidentally discarding half the stream', () => {
  let now = 0; const buffer = createTraceBuffer(() => now); buffer.start();
  for (; now < 20_000; now += 16) buffer.add({ type: 'motion', at: now, rotationRate: null });
  const samples = buffer.data({ userAgent: '', platform: '' }).samples;
  expect(samples.length).toBeGreaterThanOrEqual(1190); expect(samples.length).toBeLessThanOrEqual(1201);
});

it('rate-limits automatic starts per source per page and tags fight uploads', async () => {
  trace = createSensorTrace('fight');
  expect(startAutomaticTrace(trace, 'fight')).toBe(true);
  expect(startAutomaticTrace(trace, 'fight')).toBe(false);
  await trace.upload();
  const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
  expect(body.source).toBe('fight');
});
it('flushes a compact JSON beacon on pagehide even when the raw trace exceeds Safari unload limits', async () => {
  const sendBeacon = vi.fn((_url: string, _body: Blob) => true); vi.stubGlobal('navigator', { userAgent: 'iPhone-test', platform: 'iPhone', sendBeacon });
  trace.start();
  const now = performance.now();
  for (let i = 0; i < 1000; i++) trace.add({ type: 'motion', at: now + i * 17, acceleration: { x: 0, y: 0, z: 0 }, accelerationIncludingGravity: { x: 1, y: 0, z: -9.7 }, rotationRate: null });
  window.dispatchEvent(new Event('pagehide'));
  expect(sendBeacon).toHaveBeenCalledOnce();
  const blob = sendBeacon.mock.calls[0][1] as Blob;
  expect(blob.type).toBe('application/json'); expect(blob.size).toBeLessThan(60000);
  const body = JSON.parse(await blob.text()); expect(body.samples.length).toBeGreaterThan(0);
  expect(body.userAgent).toBe('iPhone-test'); expect(trace.status).toBe('queued');
});
