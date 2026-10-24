import type { IncomingMessage, ServerResponse } from 'node:http';
import { extractRubricText } from '../rubric/pdf.ts';
import type { RoomServer } from './rooms.ts';

export const MAX_RUBRIC_BYTES = 1024 * 1024;
const json = (res: ServerResponse, status: number, value: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};
class UploadError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function readUpload(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let bytes = 0, failed = false; let chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      if (failed) return;
      bytes += chunk.length;
      if (bytes > MAX_RUBRIC_BYTES) { failed = true; chunks = []; reject(new UploadError(413, 'Rubric upload exceeds 1 MB')); }
      else chunks.push(chunk);
    });
    req.once('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.once('error', () => reject(new UploadError(400, 'Rubric upload failed')));
    req.once('aborted', () => reject(new UploadError(400, 'Incomplete rubric upload')));
  });
}

export async function handleEduRoute(req: IncomingMessage, res: ServerResponse, url: URL, rooms: RoomServer): Promise<boolean> {
  const parse = url.pathname === '/api/rubric/parse';
  const download = url.pathname.match(/^\/api\/room\/([^/]+)\/feedback\.(csv|md)$/);
  if (!parse && !download) return false;
  const code = (parse ? url.searchParams.get('room') ?? '' : download![1]).toUpperCase();
  const tokenHeader = req.headers['x-room-token'];
  const token = typeof tokenHeader === 'string' ? tokenHeader : req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const denial = rooms.eduOwnerError(code, token, parse);
  if (denial) { req.resume(); json(res, denial.status, { error: denial.error }); return true; }
  if (req.method !== (parse ? 'POST' : 'GET')) {
    req.resume(); res.setHeader('Allow', parse ? 'POST' : 'GET'); json(res, 405, { error: 'Method not allowed' }); return true;
  }
  if (download) {
    const format = download[2] as 'csv' | 'md', body = rooms.exportFeedback(code, format);
    if (body === undefined) { json(res, 404, { error: 'Feedback is available after this classroom match finishes' }); return true; }
    res.writeHead(200, { 'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="gitzilla-${code}-feedback.${format}"`, 'Cache-Control': 'no-store' });
    res.end(body); return true;
  }
  try {
    if (Number(req.headers['content-length']) > MAX_RUBRIC_BYTES) {
      req.resume(); throw new UploadError(413, 'Rubric upload exceeds 1 MB');
    }
    const type = (req.headers['content-type'] ?? 'text/plain').split(';')[0].trim().toLowerCase();
    if (!['text/plain', 'text/markdown', 'text/x-markdown', 'application/pdf', 'application/octet-stream', 'application/json'].includes(type)) {
      req.resume(); throw new UploadError(415, 'Upload .md, .txt or .pdf, or paste plain text');
    }
    let filename = (url.searchParams.get('filename') ?? '').slice(0, 255);
    let body = await readUpload(req);
    if (type === 'application/json') {
      let value: { text?: unknown; filename?: unknown };
      try { value = JSON.parse(body.toString('utf8')); } catch { throw new UploadError(400, 'Invalid rubric JSON'); }
      if (!value || typeof value.text !== 'string') throw new UploadError(400, 'Provide rubric text in the text field');
      if (typeof value.filename === 'string') filename = value.filename.slice(0, 255);
      body = Buffer.from(value.text);
    }
    let text: string;
    try { text = await extractRubricText(body, filename, type); }
    catch { throw new UploadError(422, 'Could not extract PDF text. Upload .md/.txt or paste the rubric text.'); }
    if (!text.trim()) throw new UploadError(400, 'The rubric document is empty');
    if (Buffer.byteLength(text) > MAX_RUBRIC_BYTES) throw new UploadError(413, 'Extracted rubric text exceeds 1 MB');
    const current = rooms.eduOwnerError(code, token, true);
    if (current) { json(res, current.status, { error: current.error }); return true; }
    const rubric = rooms.previewRubric(text, filename);
    if (!rubric) throw new UploadError(503, 'Rubric parsing is unavailable');
    json(res, 200, rubric); // Preview retains unmapped lines; setRubric validates the edited criteria.
  } catch (error) {
    if (error instanceof UploadError) json(res, error.status, { error: error.message });
    else { console.warn('Rubric preview failed.'); json(res, 422, { error: 'Could not parse this rubric. Try Markdown or plain text.' }); }
  }
  return true;
}
