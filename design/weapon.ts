import type { HeroDesign, PlayerKit, RepoProfile, WeaponKind } from '../shared/types.ts';
import { codeLines } from './code.ts';

export type HeroDesignWithWeapon = HeroDesign;
const construct: Record<WeaponKind, RegExp> = {
  blaster: /\b(?:await|fetch|printf|print|puts|echo|fire|shoot|shot|emit|send|resolve|blaster)\b/i,
  smg: /\b(?:for|while|loop|go|launch|repeat|burst|spawn|async|coroutine|smg)\b|<-|@spawn/i,
  shotgun: /\b(?:define|spray|spread|scatter|pellets|burst|apply|case|switch|shotgun)\b|\.\.\./i,
  cannon: /\b(?:unsafe|comptime|malloc|alloc|blast|explode|shell|cannon|u32)\b/i,
  staff: /\b(?:yield|lambda|fmap|cast|staff|fn|map|next|runes|lapply|mapcar|funcall)\b|=>|\|\|/i,
  laser: /\b(?:stream|map|select|join|match|grep|regex|beam|trace|filter|flowOf|asFlow|laser)\b/i,
  blade: /\b(?:rm|git|delete|drop|cut|del|slice|remove|erase|unset|exit|nil|rawset|defer|memset|slash|die|dd|reset|splice|truncate)\b|^:%s\//i,
};
const verb: Record<WeaponKind, string> = { blaster: 'fire', smg: 'loop', shotgun: 'spread', cannon: 'blast', staff: 'cast', laser: 'beam', blade: 'cut' };

/** Reject oversize/broken expressions; truncation could remove the closing delimiter. */
export function cleanWeaponName(value: unknown): string | undefined {
  if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value)) return undefined;
  const name = value.trim();
  if (!name || name.length > 24) return undefined;
  const stack: string[] = [];
  let quote = '', escaped = false;
  for (const char of name) {
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
    } else if ('"\'`'.includes(char) && !(char === "'" && /^\((?:mapcar|funcall)\b/.test(name))) quote = char;
    else if ('([{'.includes(char)) stack.push(char);
    else if (')]}'.includes(char) && stack.pop() !== ({ ')': '(', ']': '[', '}': '{' } as Record<string, string>)[char]) return undefined;
  }
  return quote || stack.length ? undefined : name;
}

export function weaponIdentifiers(profile: RepoProfile, kit: PlayerKit): string[] {
  const values = [kit.code?.signature?.replace(/\(.*$/, '') ?? '', ...(kit.code?.identifiers ?? []),
    ...(profile.dna?.identifiers ?? []), ...Object.values(profile.dna?.componentSymbols ?? {}).flat()];
  return [...new Set(codeLines(values, 100, 64).filter(name => /^[A-Za-z_$][\w$]*[!?]?$/.test(name)))];
}
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const withoutStrings = (value: string) => value.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, '""');

function callLike(value: string, language: string): boolean {
  const head = /^(?:[A-Za-z_$][\w$]*(?:(?:::|\.)[A-Za-z_$][\w$]*)*|\.[A-Za-z_]\w*)!?\(/.exec(value);
  if (!head) return false;
  if (!['rust', 'c++'].includes(language) && /^[\w$]+::/.test(value)) return false;
  if (head[0].endsWith('!(') && !['rust', 'ruby'].includes(language)) return false;
  let depth = 1, end = head[0].length, quote = '', escaped = false;
  for (; end < value.length && depth; end++) {
    const char = value[end];
    if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = ''; }
    else if ('"\'`'.includes(char)) quote = char;
    else if (char === '(') depth++;
    else if (char === ')') depth--;
  }
  if (depth) return false;
  const tail = value.slice(end);
  if (tail && (!tail.startsWith('.') || !callLike(`value${tail}`, language))) return false;
  const args = value.slice(head[0].length, end - 1);
  if (!args.trim()) return true;
  // Split only top-level arguments; recursively check complete nested calls.
  const parts: string[] = []; let start = 0; depth = 0; quote = ''; escaped = false;
  for (let i = 0; i <= args.length; i++) {
    const char = args[i];
    if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = ''; }
    else if ('"\'`'.includes(char ?? ' ') && char) quote = char;
    else if (char === '(') depth++;
    else if (char === ')') depth--;
    if (i === args.length || char === ',' && depth === 0 && !quote) { parts.push(args.slice(start, i).trim()); start = i + 1; }
  }
  return parts.every(arg => {
    if (/^&:|^:(?!:)/.test(arg) && language !== 'ruby') return false;
    if (/^::/.test(arg) && language !== 'kotlin') return false;
    if (/^[&*](?!:)/.test(arg) && !['rust', 'c', 'c++'].includes(language)) return false;
    if (/&mut\s/.test(arg) && language !== 'rust') return false;
    if (arg.includes('::') && !['rust', 'c++', 'java', 'kotlin', 'c#'].includes(language)) return false;
    return /^(?:&(?:mut\s+)?|\*|:|::|&:)?[A-Za-z_$][\w$]*(?:(?:::|\.)[A-Za-z_$][\w$]*)*[!?]?$/.test(arg)
      || /^\d+$/.test(arg) || /^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')$/.test(arg) || callLike(arg, language);
  });
}

/** Bounded display-fragment syntax checks; nothing is evaluated or executed. */
function languageExpression(name: string, language: string, kind: WeaponKind): boolean {
  if (kind === 'blade' && /^(?:rm -rf \.\/[\w.-]+|git (?:reset --hard|cherry-pick|revert) [\w./-]+|:%s\/[\w]+\/\/g)$/.test(name)) return true;
  const call = (value: string) => callLike(value.trim(), language);
  if (['python', 'jupyter notebook'].includes(language)) {
    if (/^(?:lambda:\s*|yield(?: from)?\s+)/.test(name)) return call(name.replace(/^(?:lambda:\s*|yield(?: from)?\s+)/, ''));
    return call(name) || /^del [A-Za-z_]\w*\[:\]$/.test(name);
  }
  if (language === 'rust') {
    const block = /^(?:unsafe|loop)\s*\{\s*(.+?);?\s*\}$/.exec(name);
    return block ? call(block[1]) : call(name) || /^\|\|\s*/.test(name) && call(name.replace(/^\|\|\s*/, ''));
  }
  if (language === 'go') {
    const loop = /^for\s*\{\s*go (.+?)\s*\}$/.exec(name);
    return loop ? call(loop[1]) : call(name) || /^go /.test(name) && call(name.slice(3)) || /^<-[A-Za-z_]\w*$/.test(name);
  }
  if (language === 'kotlin') {
    const launch = /^(?:launch|flow|repeat\(\d+\))\s*\{\s*(.+?)\s*\}$/.exec(name);
    return launch ? call(launch[1]) : call(name);
  }
  if (['c', 'c++'].includes(language)) return /^#define [A-Za-z_]\w*\([A-Za-z_]\w*\)$/.test(name) || call(name) || language === 'c++' && /^[A-Za-z_]\w*<[A-Za-z_]\w*>\(\)$/.test(name);
  if (language === 'zig') return call(name.replace(/^(?:comptime|defer)\s+/, '').replace(/^@/, ''));
  if (language === 'ruby') return /^(?:puts|print) [A-Za-z_]\w*(?:[!?]|\(\))?$/.test(name) || call(name) || /^[A-Za-z_]\w*\.(?:slice|delete|cut)!?$/.test(name);
  if (language === 'haskell') return /^(?:fmap|map|cast|fire|loop|repeat|spread|blast|beam|cut)\s+[A-Za-z_]\w*(?:\s+[A-Za-z_]\w*)?$/.test(name) || /^[A-Za-z_]\w*\s*(?:>>=|<\$>)\s*[A-Za-z_]\w*$/.test(name);
  if (['lisp', 'clojure'].includes(language)) return /^\([A-Za-z_+*!-][\w+*!-]*\s+(?:#')?[A-Za-z_]\w*(?:\s+'?[A-Za-z_]\w*)?\)$/.test(name);
  if (language === 'sql') return /^(?:JOIN [A-Za-z_]\w* ON [A-Za-z_]\w*|(?:DELETE FROM|DROP TABLE|TRUNCATE) [A-Za-z_]\w*|SELECT [A-Za-z_]\w* FROM [A-Za-z_]\w*)$/i.test(name) || /^SELECT /i.test(name) && call(name.slice(7));
  if (language === 'php' && /\?\? die\(\)$/.test(name)) return call(name.replace(/\s*\?\? die\(\)$/, ''));
  if (language === 'lua' && /^[A-Za-z_]\w*=nil$/.test(name)) return true;
  if (language === 'julia') return call(name.replace(/^@\.\s*/, '').replace(/\.\(/, '('));
  if (language === 'c#' && /^from x in [A-Za-z_]\w* select x$/.test(name)) return true;
  if (['javascript', 'typescript'].includes(language)) {
    if (language === 'typescript') {
      name = name.replace(/^<[A-Za-z_]\w*>/, '').replace(/\s+satisfies\s+[A-Za-z_]\w*$/, '').replace(/\s+as\s+[A-Za-z_]\w*/g, '');
      if (/^[A-Za-z_$][\w$]*<[A-Za-z_$][\w$]*>\(\)$/.test(name)) return true;
    }
    if (/^(?:await|new) /.test(name)) return call(name.replace(/^(?:await|new) /, ''));
    if (/^\(\)\s*=>\s*/.test(name)) return call(name.replace(/^\(\)\s*=>\s*/, ''));
    const loop = /^for\(;;\)\{(.+?)\}$/.exec(name);
    return call(name) || !!loop && call(loop[1]) || /^\[\.\.\.[A-Za-z_$][\w$]*\]$/.test(name) || /^delete [A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(name);
  }
  return call(name);
}

export function validWeaponName(value: unknown, profile: RepoProfile, kit: PlayerKit): string | undefined {
  const name = cleanWeaponName(value);
  if (!name || !construct[kit.weapon].test(name)) return undefined;
  const symbols = weaponIdentifiers(profile, kit);
  const code = withoutStrings(name);
  if (symbols.length && !symbols.some(symbol => new RegExp(`(^|[^\\w$])${escaped(symbol)}(?=$|[^\\w$])`).test(code))) return undefined;
  return languageExpression(name, profile.primaryLanguage.toLowerCase(), kit.weapon) ? name : undefined;
}

/** applyHeroDesign has no profile; still exclude prose and broken syntax at that boundary. */
export function applicableWeaponName(value: unknown, kind: WeaponKind): string | undefined {
  const name = cleanWeaponName(value);
  if (!name || !construct[kind].test(name)) return undefined;
  return ['javascript', 'typescript', 'python', 'rust', 'go', 'kotlin', 'c', 'c++', 'zig', 'ruby', 'haskell', 'lisp', 'sql', 'php', 'lua', 'julia', 'c#', 'java']
    .some(language => languageExpression(name, language, kind)) ? name : undefined;
}

/** Prefer sim's seeded code name; the small expression fallback supports old/incomplete kits. */
export function fallbackWeaponName(profile: RepoProfile, kit: PlayerKit): string {
  const simulated = validWeaponName(kit.code?.weapon?.name, profile, kit);
  if (simulated) return simulated;
  const symbols = weaponIdentifiers(profile, kit), language = profile.primaryLanguage.toLowerCase();
  if (!symbols.some(symbol => symbol.length <= 22)) {
    const literal = cleanWeaponName(kit.code?.weapon?.name);
    if (literal && /\d/.test(literal) && construct[kit.weapon].test(literal) && languageExpression(literal, language, kit.weapon)) return literal;
  }
  for (const symbol of symbols.length ? symbols : ['fire']) {
    const candidates = [`${verb[kit.weapon]}(${symbol})`];
    if (language === 'python' && kit.weapon === 'staff') candidates.unshift(`yield from ${symbol}()`, `lambda: ${symbol}()`);
    if (language === 'rust' && kit.weapon === 'cannon') candidates.unshift(`unsafe { ${symbol}() }`);
    if (language === 'go' && kit.weapon === 'smg') candidates.unshift(`for { go ${symbol}() }`, `go ${symbol}()`);
    if (language === 'kotlin' && kit.weapon === 'smg') candidates.unshift(`launch { ${symbol}() }`);
    if (language === 'ruby' && kit.weapon === 'blaster') candidates.unshift(`puts ${symbol}`);
    if (language === 'haskell') candidates.unshift(`${verb[kit.weapon]} ${symbol}`);
    if (['lisp', 'clojure'].includes(language)) candidates.unshift(`(${verb[kit.weapon]} ${symbol})`);
    if (language === 'sql') candidates.unshift(kit.weapon === 'blade' ? `DELETE FROM ${symbol}` : kit.weapon === 'laser' ? `JOIN ${symbol} ON fire` : `SELECT ${verb[kit.weapon]}(${symbol})`);
    const result = candidates.map(name => validWeaponName(name, profile, kit)).find(Boolean);
    if (result) return result;
  }
  const literal = String((kit.seed >>> 0) % 1_000_000);
  return language === 'haskell' ? `${verb[kit.weapon]} ${literal}` : ['lisp', 'clojure'].includes(language) ? `(${verb[kit.weapon]} ${literal})`
    : language === 'sql' ? `SELECT ${verb[kit.weapon]}(${literal})` : `${verb[kit.weapon]}(${literal})`;
}
