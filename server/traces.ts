import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MAX_TRACE_BYTES = 2 * 1024 * 1024;
const traceName = /^\d{13}-[a-f0-9]{12}\.json$/;

export class TraceStore {
  constructor(private directory: string) {}

  list() {
    try {
      return readdirSync(this.directory).filter(id => traceName.test(id)).map(id => {
        const info = statSync(join(this.directory, id));
        return { id, bytes: info.size, createdAt: new Date(Number(id.slice(0, 13))).toISOString(), modifiedAt: info.mtimeMs };
      }).sort((a, b) => b.modifiedAt - a.modifiedAt || b.id.localeCompare(a.id))
        .map(({ modifiedAt: _modifiedAt, ...trace }) => trace);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  save(body: string) {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const id = `${Date.now()}-${randomBytes(6).toString('hex')}.json`;
    writeFileSync(join(this.directory, id), body, { mode: 0o600, flag: 'wx' });
    // Keep the new upload even when multiple traces arrive in the same millisecond.
    const previous = this.list().filter(trace => trace.id !== id);
    for (const trace of previous.slice(199)) unlinkSync(join(this.directory, trace.id));
    return id;
  }
}

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

// A tunnel also connects from loopback: require a local Host and reject forwarded traffic.
export function localTraceRequest(req: IncomingMessage) {
  const remote = req.socket.remoteAddress;
  if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') return false;
  if (['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'cf-connecting-ip'].some(h => req.headers[h])) return false;
  try {
    const host = new URL(`http://${req.headers.host}`).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch { return false; }
}

class TraceBodyError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0, failed = false;
    let chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      if (failed) return;
      size += chunk.length;
      if (size > MAX_TRACE_BYTES) {
        failed = true; chunks = [];
        reject(new TraceBodyError(413, 'Trace exceeds 2 MB'));
      } else chunks.push(chunk);
    });
    req.once('end', () => { if (!failed) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.once('aborted', () => reject(new TraceBodyError(400, 'Incomplete trace upload')));
    req.once('error', () => reject(new TraceBodyError(400, 'Trace upload failed')));
  });
}

export async function handleTraceRoute(req: IncomingMessage, res: ServerResponse, pathname: string, store: TraceStore): Promise<boolean> {
  if (pathname !== '/api/trace' && pathname !== '/api/trace/list') return false;
  const listing = pathname === '/api/trace/list';
  if (listing && !localTraceRequest(req)) { req.resume(); json(res, 403, { error: 'Trace listing is localhost only' }); return true; }
  if (req.method !== (listing ? 'GET' : 'POST')) {
    req.resume(); res.setHeader('Allow', listing ? 'GET' : 'POST'); json(res, 405, { error: 'Method not allowed' }); return true;
  }
  try {
    if (listing) { json(res, 200, { traces: store.list() }); return true; }
    if (Number(req.headers['content-length']) > MAX_TRACE_BYTES) {
      req.resume(); json(res, 413, { error: 'Trace exceeds 2 MB' }); return true;
    }
    const type = req.headers['content-type'];
    if (type && !/^application\/json(?:\s*;|$)/i.test(type)) {
      req.resume(); json(res, 415, { error: 'Send trace as application/json' }); return true;
    }
    const body = await readBody(req);
    let data: unknown;
    try { data = JSON.parse(body); } catch { throw new TraceBodyError(400, 'Invalid trace JSON'); }
    if (data === null || typeof data !== 'object') throw new TraceBodyError(400, 'Send a trace object or sample array');
    json(res, 201, { id: store.save(body) });
  } catch (error) {
    if (error instanceof TraceBodyError) json(res, error.status, { error: error.message });
    else { console.error('Trace storage failed.'); json(res, 503, { error: 'Trace storage unavailable' }); }
  }
  return true;
}
