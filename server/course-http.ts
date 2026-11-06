import type { IncomingMessage, ServerResponse } from 'node:http';
import { extractRubricText, PdfTextLimitError } from '../rubric/pdf';
import type { RoomServer } from './rooms';
import { createCourseGenerator, MAX_COURSE_TEXT_BYTES, validateGeneratedCourse } from './course-generation';

export const MAX_COURSE_FILE_BYTES = 1024 * 1024;
const generateCourse = createCourseGenerator();
class CourseError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const reply = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body));
};
export async function handleCourseRoute(req: IncomingMessage, res: ServerResponse, url: URL,
  rooms: Pick<RoomServer, 'courseGenerationError'>, generate = generateCourse): Promise<boolean> {
  if (url.pathname !== '/api/course/generate') return false;
  const code = (url.searchParams.get('room') ?? '').toUpperCase();
  const header = req.headers['x-room-token'];
  const token = typeof header === 'string' ? header : req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const authorize = () => {
    const denial = rooms.courseGenerationError(code, token);
    if (denial) throw new CourseError(denial.status, denial.error);
  };
  try {
    authorize();
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw new CourseError(405, 'Method not allowed'); }
    const filename = url.searchParams.get('filename') ?? '';
    if (filename.length > 255 || !/\.(pdf|md|txt)$/i.test(filename)) throw new CourseError(415, 'Upload a .pdf, .md or .txt file');
    const mime = (req.headers['content-type'] ?? 'application/octet-stream').split(';')[0].trim().toLowerCase();
    if (!['application/pdf', 'text/plain', 'text/markdown', 'text/x-markdown', 'application/octet-stream'].includes(mime)) throw new CourseError(415, 'Unsupported course file type');
    if (Number(req.headers['content-length']) > MAX_COURSE_FILE_BYTES) throw new CourseError(413, 'Course file exceeds 1 MB');
    const body = await new Promise<Buffer>((resolve, reject) => {
      let bytes = 0, failed = false; const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => {
        if (failed) return;
        bytes += chunk.length;
        if (bytes > MAX_COURSE_FILE_BYTES) { failed = true; chunks.length = 0; reject(new CourseError(413, 'Course file exceeds 1 MB')); }
        else chunks.push(chunk);
      });
      req.once('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
      req.once('error', () => reject(new CourseError(400, 'Course upload failed')));
      req.once('aborted', () => reject(new CourseError(400, 'Incomplete course upload')));
    });
    if (!body.length) throw new CourseError(400, 'The course document is empty');
    let text: string;
    try {
      const pdf = /\.pdf$/i.test(filename) || mime === 'application/pdf' || body.subarray(0, 5).toString() === '%PDF-';
      text = pdf ? await extractRubricText(body, filename, 'application/pdf', MAX_COURSE_TEXT_BYTES) : new TextDecoder('utf-8', { fatal: true }).decode(body);
    } catch (error) {
      if (error instanceof PdfTextLimitError) throw new CourseError(413, 'Extracted course text exceeds 80000 UTF-8 bytes');
      throw new CourseError(422, 'Could not extract readable text. Use a PDF with selectable text, or a UTF-8 .md/.txt file.'); }
    if (!text.trim()) throw new CourseError(400, 'The course document is empty');
    if (Buffer.byteLength(text) > MAX_COURSE_TEXT_BYTES) throw new CourseError(413, 'Extracted course text exceeds 80000 UTF-8 bytes');
    authorize();
    let result;
    try { result = await generate(text); result = { ...result, plan: validateGeneratedCourse(result.plan) }; }
    catch { throw new CourseError(503, 'AI course generation failed. Retry or edit the lesson manually. No draft was applied.'); }
    authorize(); // Ownership or lesson phase can change while the provider runs.
    reply(res, 200, { ...result, preview: true });
  } catch (error) {
    req.resume();
    reply(res, error instanceof CourseError ? error.status : 400, { error: error instanceof CourseError ? error.message : 'Course upload failed. Retry the upload.' });
  }
  return true;
}
