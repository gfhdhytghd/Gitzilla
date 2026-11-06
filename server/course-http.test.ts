import http from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { handleCourseRoute, MAX_COURSE_FILE_BYTES } from './course-http';
const servers: http.Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise<void>(r => { s.closeAllConnections(); s.close(() => r()); }))); });
async function fixture() {
  const guard = vi.fn((_code: string, token?: string): { status: number; error: string } | undefined => token === 'owner' ? undefined : { status: token ? 403 : 401, error: 'Owner only' });
  const generate = vi.fn(async (_text: string) => ({ plan: defaultClassroomPlan(), provider: 'mock' }));
  const server = http.createServer((req, res) => { void handleCourseRoute(req, res, new URL(req.url!, 'http://localhost'), { courseGenerationError: guard }, generate).then(handled => { if (!handled) { res.writeHead(404); res.end(); } }); });
  servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const upload = (body: BodyInit = '# Teach Python', filename = 'lesson.md', headers: Record<string, string> = {}, method = 'POST') => fetch(`${base}/api/course/generate?room=abcd&filename=${encodeURIComponent(filename)}`, { method, headers: { 'X-Room-Token': 'owner', ...headers }, ...(method !== 'GET' ? { body } : {}) });
  return { guard, generate, upload, base };
}
function tinyPdf(text?: string, pages = 1): Uint8Array {
  const content = text ? `BT /F1 12 Tf 40 200 Td (${text}) Tj ET` : '';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${i ? i + 5 : 3} 0 R`).join(' ')}] /Count ${pages} >>`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    ...Array.from({ length: pages - 1 }, () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>'),
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

describe('course upload HTTP route', () => {
  it('extracts selectable text from a real PDF before AI generation', async () => {
    const f = await fixture();
    const response = await f.upload(new Uint8Array(tinyPdf('Teach Python variables')), 'lesson.pdf');
    expect(response.status).toBe(200);
    expect(f.generate).toHaveBeenCalledWith('Teach Python variables');
  });
  it('returns 413 when real PDF extraction exceeds the course limit', async () => {
    const f = await fixture();
    const pdf = new Uint8Array(tinyPdf('Teach Python variables and print student names', 2000));
    expect(pdf.byteLength).toBeLessThan(MAX_COURSE_FILE_BYTES);
    const response = await f.upload(pdf, 'large-text.pdf');
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'Extracted course text exceeds 80000 UTF-8 bytes' });
    expect(f.generate).not.toHaveBeenCalled();
  });
  it('extracts real Markdown and UTF-8 text and returns only a preview', async () => {
    const f = await fixture();
    for (const name of ['lesson.md', 'lesson.txt']) {
      const response = await f.upload('éducation\n# Python', name);
      expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ preview: true, provider: 'mock', plan: { steps: expect.any(Array) } });
      expect(f.generate).toHaveBeenLastCalledWith('éducation\n# Python');
    }
    expect(f.guard).toHaveBeenCalledWith('ABCD', 'owner');
  });
  it('denies unauthorized owners and non-setup phases before generation', async () => {
    const f = await fixture();
    expect((await f.upload('x', 'a.txt', { 'X-Room-Token': '' })).status).toBe(401);
    expect((await f.upload('x', 'a.txt', { 'X-Room-Token': 'student' })).status).toBe(403);
    f.guard.mockReturnValue({ status: 409, error: 'Lesson is running' });
    expect((await f.upload()).status).toBe(409); expect(f.generate).not.toHaveBeenCalled();
  });
  it('rejects wrong method, extension, MIME, empty, oversized and invalid UTF-8 input', async () => {
    const f = await fixture();
    expect((await f.upload('', 'a.md', {}, 'GET')).status).toBe(405);
    expect((await f.upload('x', 'a.exe')).status).toBe(415);
    expect((await f.upload('x', 'a.md', { 'Content-Type': 'application/json' })).status).toBe(415);
    expect((await f.upload(' ')).status).toBe(400);
    expect((await f.upload('x'.repeat(MAX_COURSE_FILE_BYTES + 1))).status).toBe(413);
    expect((await f.upload('é'.repeat(40001))).status).toBe(413);
    expect((await f.upload(new Uint8Array([255]), 'bad.txt')).status).toBe(422);
    expect((await f.upload('not a PDF', 'a.pdf')).status).toBe(422);
    expect(f.generate).not.toHaveBeenCalled();
  });
  it('bounds chunked uploads without breaking the HTTP error response', async () => {
    const f = await fixture();
    const status = await new Promise<number>(resolve => {
      const req = http.request(`${f.base}/api/course/generate?room=ABCD&filename=a.txt`, { method: 'POST', headers: { 'X-Room-Token': 'owner' } }, res => { res.resume(); resolve(res.statusCode!); });
      req.write(Buffer.alloc(MAX_COURSE_FILE_BYTES)); req.end('extra');
    });
    expect(status).toBe(413); expect(f.generate).not.toHaveBeenCalled();
  });
  it('rechecks phase/ownership after AI and hides provider errors and invalid output', async () => {
    const f = await fixture();
    f.generate.mockImplementation(async () => { f.guard.mockReturnValue({ status: 409, error: 'Lesson is running' }); return { plan: defaultClassroomPlan(), provider: 'mock' }; });
    expect((await f.upload()).status).toBe(409);
    f.guard.mockReturnValue(undefined); f.generate.mockRejectedValue(new Error('secret payload'));
    const response = await f.upload(); expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain('secret');
    f.generate.mockResolvedValue({ plan: { ...defaultClassroomPlan(), steps: [] }, provider: 'mock' });
    expect((await f.upload()).status).toBe(503);
  });
});
