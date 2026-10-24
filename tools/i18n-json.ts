/** Remove only trailing commas outside strings; never rewrite translated text or code. */
export function parseGeneratedJSON(raw: string): unknown {
  const clean = raw.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  try { return JSON.parse(clean); } catch { /* Some providers return JSON with trailing commas. */ }
  let output = '', quoted = false, escaped = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      output += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    if (c === ',') {
      let next = i + 1; while (/\s/.test(clean[next] ?? '') && next < clean.length) next++;
      if (clean[next] === '}' || clean[next] === ']') continue;
    }
    output += c;
  }
  return JSON.parse(output);
}
