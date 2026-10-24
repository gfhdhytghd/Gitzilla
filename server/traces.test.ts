import http from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { handleTraceRoute, MAX_TRACE_BYTES, TraceStore } from './traces.ts';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'gitzilla-traces-'));
  const store = new TraceStore(join(directory, 'traces'));
  const server = http.createServer((req, res) => {
    void handleTraceRoute(req, res, new URL(req.url!, 'http://localhost').pathname, store).then(handled => {
      if (!handled) { res.writeHead(404); res.end(); }
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  expect([5173, 5175]).not.toContain(port);
  cleanup.push(async () => {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  });
  return { base: `http://127.0.0.1:${port}`, directory: join(directory, 'traces'), store };
}

it('stores raw motion JSON without attaching request credentials or IP and lists local metadata', async () => {
  const { base, directory } = await fixture();
  const body = JSON.stringify({ ua: 'Synthetic phone', platform: 'iOS', samples: [{ t: 16, alpha: 20, rotationRate: { alpha: 88 }, acceleration: null }], gestures: ['attack'] });
  const response = await fetch(base + '/api/trace', { method: 'POST', body,
    headers: { 'Content-Type': 'application/json', Cookie: 'session=do-not-store', Authorization: 'Bearer do-not-store' } });
  expect(response.status).toBe(201);
  const { id } = await response.json() as { id: string };
  expect(id).toMatch(/^\d{13}-[a-f0-9]{12}\.json$/);
  expect(readFileSync(join(directory, id), 'utf8')).toBe(body);
  expect(statSync(join(directory, id)).mode & 0o777).toBe(0o600);
  const list = await fetch(base + '/api/trace/list');
  expect(list.status).toBe(200); expect(list.headers.get('cache-control')).toBe('no-store');
  expect(await list.json()).toEqual({ traces: [{ id, bytes: Buffer.byteLength(body), createdAt: new Date(Number(id.slice(0, 13))).toISOString() }] });
});

it('rejects advertised and chunked uploads over 2 MB, counts bytes, and accepts the exact limit', async () => {
  const { base, directory } = await fixture();
  const exact = '{"data":"' + 'x'.repeat(MAX_TRACE_BYTES - 11) + '"}';
  expect(Buffer.byteLength(exact)).toBe(MAX_TRACE_BYTES);
  expect((await fetch(base + '/api/trace', { method: 'POST', body: exact })).status).toBe(415);
  const headers = { 'Content-Type': 'application/json' };
  expect((await fetch(base + '/api/trace', { method: 'POST', headers, body: exact })).status).toBe(201);
  expect((await fetch(base + '/api/trace', { method: 'POST', headers, body: exact + ' ' })).status).toBe(413);
  const response = await new Promise<number>(resolve => {
    const request = http.request(base + '/api/trace', { method: 'POST', headers }, res => { res.resume(); resolve(res.statusCode!); });
    // No content-length: exercise the streaming byte counter with multi-byte data.
    request.write('{"samples":"');
    for (let i = 0; i < 40; i++) request.write('⚡'.repeat(20_000));
    request.end('"}');
  });
  expect(response).toBe(413);
  expect(readdirSync(directory)).toHaveLength(1);
});

it('rejects invalid bodies and methods without creating trace files', async () => {
  const { base, store } = await fixture();
  for (const body of ['', '{broken', 'null', '42', '"hello"']) {
    expect((await fetch(base + '/api/trace', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } })).status).toBe(400);
  }
  expect((await fetch(base + '/api/trace')).status).toBe(405);
  expect((await fetch(base + '/api/trace/list', { method: 'POST' })).status).toBe(405);
  expect((await fetch(base + '/api/other')).status).toBe(404);
  expect(store.list()).toEqual([]);
});

it('denies public-host and forwarded/tunnel listings even when the TCP peer is loopback', async () => {
  const { base } = await fixture();
  for (const headers of [
    { Host: 'gitzilla.wilflin.me' }, { 'X-Forwarded-For': '192.0.2.5' },
    { Forwarded: 'for=192.0.2.5' }, { 'CF-Connecting-IP': '192.0.2.5' },
    { 'X-Real-IP': '192.0.2.5' }, { 'X-Forwarded-Host': 'gitzilla.wilflin.me' },
  ]) {
    const status = await new Promise<number>(resolve => {
      http.get(base + '/api/trace/list', { headers }, res => { res.resume(); resolve(res.statusCode!); });
    });
    expect(status, JSON.stringify(headers)).toBe(403);
  }
});

it('keeps only the latest 200 traces and preserves unrelated files', async () => {
  const { store, directory } = await fixture();
  const ids: string[] = [];
  for (let i = 0; i < 201; i++) ids.push(store.save(JSON.stringify({ sample: i })));
  expect(store.list()).toHaveLength(200);
  expect(store.list().some(trace => trace.id === ids[0])).toBe(false);
  expect(store.list().some(trace => trace.id === ids.at(-1))).toBe(true);
  writeFileSync(join(directory, 'keep-me.txt'), 'unrelated'); store.save('{"last":true}');
  expect(store.list()).toHaveLength(200);
  expect(readFileSync(join(directory, 'keep-me.txt'), 'utf8')).toBe('unrelated');
});
