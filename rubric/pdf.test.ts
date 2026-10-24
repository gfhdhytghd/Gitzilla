import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parseRubric } from './index.ts';
import { extractRubricText } from './pdf.ts';

// A real, minimal PDF with selectable text, no additional npm tooling or assets.
function tinyPdf(text?: string): Uint8Array {
  const content = text ? `BT /F1 12 Tf 40 200 Td (${text}) Tj ET` : '';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
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

const hasPdfToText = !spawnSync('pdftotext', ['-v']).error;
describe('server-only rubric document extraction', () => {
  it('decodes Markdown/text without an external process', async () => {
    const text = '# Class rubric\n- Testing (30%): add unit tests';
    expect(await extractRubricText(Buffer.from(text), 'class.md', 'text/markdown')).toBe(text);
    expect(await extractRubricText(Buffer.from('éducation'), 'class.txt')).toBe('éducation');
  });
  it.skipIf(!hasPdfToText)('extracts actual PDF text by magic, filename, or MIME, then parses it', async () => {
    const pdf = tinyPdf('Testing: at least 20% test files');
    for (const [name, mime] of [['class.pdf', ''], ['', 'application/pdf'], ['', '']]) {
      const text = await extractRubricText(pdf, name, mime);
      expect(parseRubric(text).criteria[0]).toMatchObject({ signal: 'tests', target: 0.2 });
    }
  });
  it.skipIf(!hasPdfToText)('asks for text when a PDF is malformed or has no selectable text', async () => {
    await expect(extractRubricText(Buffer.from('not a PDF'), 'class.pdf')).rejects.toThrow('paste the rubric text');
    await expect(extractRubricText(tinyPdf(), 'scan.pdf')).rejects.toThrow('no selectable text');
  });
  it('asks for Markdown/text if pdftotext is unavailable', async () => {
    const originalPath = process.env.PATH;
    try {
      process.env.PATH = '/nonexistent-gitzilla-pdf-tool';
      await expect(extractRubricText(tinyPdf('Testing'), 'class.pdf')).rejects.toThrow('needs pdftotext');
    } finally {
      if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    }
  });
});
