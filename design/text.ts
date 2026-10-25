/** Keep whole whitespace-delimited words/code tokens, including balanced quoted calls. */
export function clampText(value: string, limit: number, prose = false): string {
  const clean = value.replace(/[\x00-\x1f\x7f]/g, ' ').trim();
  const ends: number[] = [], stack: string[] = [];
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const quotes: Record<string, string> = { '"': '"', "'": "'", '`': '`', '“': '”', '‘': '’' };
  let quote = '', invalid = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (quote) {
      if (char === '\\') { i++; continue; }
      if (char === quote) quote = '';
    } else if ((char === "'" || char === '’') && /[\p{L}\p{N}]/u.test(clean[i - 1] ?? '')) {
      // Apostrophes in contractions/possessives are prose, not an opening code quote.
    } else if (quotes[char]) quote = quotes[char];
    else if (pairs[char]) stack.push(pairs[char]);
    else if (')]}'.includes(char) && stack.pop() !== char) { invalid = true; break; }
    if (!quote && !stack.length && !/\s/u.test(char) && (i + 1 === clean.length || /\s/u.test(clean[i + 1]))) ends.push(i + 1);
  }
  // Cached prose at its old cap may already have lost the rest of its final word.
  const clipped = prose && clean.length === limit && !/[.!?…)\]}"'`”’]$/u.test(clean);
  if (clean.length <= limit && !(prose && (quote || stack.length || invalid || clipped))) return clean;
  const end = ends.filter(end => end <= limit - 1).at(-1) ?? 0;
  return clean.slice(0, end).replace(/[\s,;:—]+$/u, '') + '…';
}
