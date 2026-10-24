import { spawn } from 'node:child_process';

const fallback = 'Please upload a .md or .txt file, or paste the rubric text.';

/** Node-only adapter; keep this import out of student browser bundles. */
export async function extractRubricText(data: Uint8Array, filename = '', contentType = ''): Promise<string> {
  const isPdf = /\.pdf$/i.test(filename) || /application\/pdf/i.test(contentType) || new TextDecoder().decode(data.subarray(0, 5)) === '%PDF-';
  if (!isPdf) return new TextDecoder().decode(data);
  return new Promise<string>((resolve, reject) => {
    const child = spawn('pdftotext', ['-layout', '-', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`PDF text extraction timed out. ${fallback}`)); }, 10_000);
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    // Consume diagnostics but do not echo arbitrary document content into server errors.
    child.stderr.resume();
    child.stdin.on('error', () => { /* A rejected PDF can close stdin before writing finishes. */ });
    child.once('error', () => { clearTimeout(timeout); reject(new Error(`PDF extraction needs pdftotext on the server. ${fallback}`)); });
    child.once('close', code => {
      clearTimeout(timeout);
      if (code !== 0) { reject(new Error(`Could not read this PDF. ${fallback}`)); return; }
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) { reject(new Error(`This PDF has no selectable text (it may be a scan). ${fallback}`)); return; }
      resolve(text);
    });
    child.stdin.end(data);
  });
}
