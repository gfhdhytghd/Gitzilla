import { spawn } from 'node:child_process';
import { extractRubricText, PdfTextLimitError } from '../rubric/pdf';

export const MAX_COURSE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_COURSE_TEXT_BYTES = 80_000;
export type CourseSource = string | { kind: 'pdf'; data: Uint8Array };
export class CourseSourceError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export const COURSE_TEXT_ERROR = 'Could not extract readable text. Use a PDF with selectable text, or a UTF-8 .md/.txt file.';
export function coursePdfPageLimit(): number {
  const limit = Number(process.env.COURSE_PDF_MAX_PAGES ?? 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('COURSE_PDF_MAX_PAGES must be an integer from 1 through 1000');
  return limit;
}
/** Read the PDF with Poppler; never trust filename, client metadata or a /Count regex. */
export async function validateCoursePdf(data: Uint8Array): Promise<number> {
  if (!data.byteLength || data.byteLength > MAX_COURSE_FILE_BYTES) throw new CourseSourceError(413, 'Course file exceeds 8 MB');
  const limit = coursePdfPageLimit();
  const pages = await new Promise<number>((resolve, reject) => {
    const child = spawn('pdfinfo', ['-'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, LC_ALL: 'C' } });
    let output = '', settled = false;
    const finish = (error?: Error, count?: number) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) reject(error); else resolve(count!);
    };
    const timer = setTimeout(() => { child.kill(); finish(new CourseSourceError(422, 'Could not read PDF pages. Upload a valid PDF.')); }, 10_000);
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (output.length > 64 * 1024) { child.kill(); finish(new CourseSourceError(422, 'Could not read PDF pages. Upload a valid PDF.')); }
    });
    child.stderr.resume();
    child.stdin.on('error', () => { /* Invalid PDFs can close stdin early. */ });
    child.once('error', () => finish(new CourseSourceError(422, 'Could not read PDF pages. PDF uploads require pdfinfo on the server.')));
    child.once('close', code => {
      const count = Number(/^Pages:\s+(\d+)\s*$/m.exec(output)?.[1]);
      if (code !== 0 || !Number.isInteger(count) || count < 1) finish(new CourseSourceError(422, 'Could not read PDF pages. Upload a valid PDF.'));
      else finish(undefined, count);
    });
    child.stdin.end(data);
  });
  if (pages > limit) throw new CourseSourceError(413, `Course PDF exceeds ${limit} pages`);
  return pages;
}
export async function coursePdfFallbackText(data: Uint8Array): Promise<string> {
  try { return await extractRubricText(data, 'course.pdf', 'application/pdf', MAX_COURSE_TEXT_BYTES); }
  catch (error) {
    if (error instanceof PdfTextLimitError) throw new CourseSourceError(413, 'Extracted course text exceeds 80000 UTF-8 bytes');
    throw new CourseSourceError(422, COURSE_TEXT_ERROR);
  }
}
