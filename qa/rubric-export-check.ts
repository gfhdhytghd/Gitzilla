import assert from 'node:assert/strict';

export interface ExpectedStudent { id: string; name: string; repo: string; score: number }
export function assertFeedbackExport(format: 'csv' | 'md', text: string, expected: ExpectedStudent[]) {
  if (format === 'csv') {
    const rows: string[][] = []; let row: string[] = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted;
      } else if (!quoted && char === ',') { row.push(field); field = ''; }
      else if (!quoted && (char === '\n' || char === '\r')) {
        if (char === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += char;
    }
    assert.equal(quoted, false, 'CSV quotes balanced');
    if (field || row.length) { row.push(field); rows.push(row); }
    const header = rows.shift()!;
    const name = header.indexOf('Name'), repo = header.indexOf('Repository'), score = header.indexOf('Rubric score');
    assert.ok(name >= 0 && repo >= 0 && score >= 0);
    assert.equal(rows.length, expected.length);
    for (const student of expected) {
      const matches = rows.filter(r => r[name] === student.name);
      assert.equal(matches.length, 1); assert.equal(matches[0][repo], student.repo); assert.equal(Number(matches[0][score]), student.score);
    }
    return;
  }
  const headings = [...text.matchAll(/^## (.+?) — (.+)$/gm)];
  assert.equal(headings.length, expected.length);
  // CommonMark backslash escapes apply to ASCII punctuation only. Do not
  // rewrite the server's Markdown or relax the student/score binding.
  const unescape = (value: string) => value.replace(/\\(.)/g, (match, char: string) => {
    const n = char.charCodeAt(0);
    return (n >= 33 && n <= 47) || (n >= 58 && n <= 64) || (n >= 91 && n <= 96) || (n >= 123 && n <= 126) ? char : match;
  });
  for (const student of expected) {
    const indices = headings.flatMap((h, index) => unescape(h[1]) === student.name ? [index] : []);
    assert.equal(indices.length, 1);
    const i = indices[0], heading = headings[i];
    assert.equal(unescape(heading[2]), student.repo);
    const section = text.slice(heading.index! + heading[0].length, headings[i + 1]?.index ?? text.length);
    const scores = [...section.matchAll(/Rubric score:\s*\*\*(\d+(?:\.\d+)?)\/100\*\*/g)];
    assert.equal(scores.length, 1); assert.equal(Number(scores[0][1]), student.score);
  }
}
