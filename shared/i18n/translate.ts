import { LOCALES, type Locale, type Message } from './locale';

export function createTranslator(messages: readonly Message[]) {
const cache = new Map<string, string>();
const exact = new Map<string, readonly string[]>();
const patterns: { re: RegExp; row: readonly string[] }[] = [];
for (const row of messages) {
  for (const source of row) if (source) exact.set(source, row);
  if (row[0].includes('{') && /[A-Za-z\u3400-\u9fff]{2}/.test(row[0].replace(/\{\d+\}/g, ''))) for (const source of row) {
    const names: number[] = [];
    const pieces = source.split(/(\{\d+\})/).map(part => {
      const m = /^\{(\d+)\}$/.exec(part); if (m) { names.push(Number(m[1])); return '([\\s\\S]*?)'; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    if (names.length) patterns.push({ re: new RegExp('^' + pieces.join('') + '$'), row: Object.assign([...row], { names }) });
  }
}
/** Catalog lookup only: unknown/user-authored content is returned verbatim. */
function translate(source: string, lang: Locale): string {
  const index = LOCALES.indexOf(lang), row = exact.get(source); if (row) return row[index];
  const key = lang + '\0' + source, cached = cache.get(key); if (cached !== undefined) return cached;
  if (!/[A-Za-z\u3400-\u9fff]/.test(source)) return source;
  for (const { re, row } of patterns) {
    const found = re.exec(source); if (!found) continue;
    const names = (row as unknown as { names: number[] }).names;
    const values = new Map(names.map((n, i) => [n, found[i + 1]]));
    const translated = row[index].replace(/\{(\d+)\}/g, (_, n) => values.get(Number(n)) ?? '');
    if (cache.size >= 5000) cache.clear(); cache.set(key, translated); return translated;
  }
  if (cache.size >= 5000) cache.clear(); cache.set(key, source);
  return source;
}

return translate;
}
