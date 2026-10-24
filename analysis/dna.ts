import type { CodeDNA } from '../shared/types.ts';
import { countLoc, isSourcePath, languageOf, selectPrimaryLanguage, type SourceFile } from './files.ts';

const LIMITS = { identifiers: 24, symbols: 4, heart: 12, snippets: 12, todos: 12, commits: 10 };
const SECRET = /\b[\w$]*(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|secret|credential|private[_-]?key|client[_-]?secret)[\w$]*\b|\b(?:key|token|authorization|bearer)\b|\b[\w$]*[_-](?:key|token)\b|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\b(?:gh[pousr]_|github_pat_|sk-)[\w-]{16,}/i;
const CAMEL_CREDENTIAL = /\b[A-Za-z_$][\w$]*(?:Key|Token)(?:[A-Z][\w$]*)?\b/;
const ENCODED = /\b[\da-f]{32,}\b|[a-z\d+/_-]{48,}={0,2}/i;
export const safeCodeText = (text: string): boolean => !SECRET.test(text) && !CAMEL_CREDENTIAL.test(text) && !ENCODED.test(text);
const excerpt = (text: string, length: number): string => {
  const trimmed = text.trim();
  let end = Math.min(trimmed.length, length);
  if (end < trimmed.length && trimmed.charCodeAt(end - 1) >= 0xd800 && trimmed.charCodeAt(end - 1) <= 0xdbff) end--;
  return trimmed.slice(0, end);
};

export function cleanCommitSubjects(messages: string[]): string[] {
  return messages.map(message => message.split(/\r?\n/, 1)[0].trim()).filter(subject => subject && safeCodeText(subject)).slice(0, LIMITS.commits).map(subject => excerpt(subject, 100));
}

// Local extension while the coordinator merges the optional quality-signal fields.
export interface AnalyzedDNA extends CodeDNA { avgFunctionLength: number; hasTestDir: boolean }

export function emptyDNA(): AnalyzedDNA {
  return {
    identifiers: [], componentSymbols: {}, heartLines: [], snippets: [], todos: [], commits: [], tokens: [], bigFiles: [],
    longestFunction: null, counts: { functions: 0, classes: 0, todo: 0, fixme: 0, hack: 0, comments: 0 },
    maxNesting: 0, avgLineLength: 0, indent: 'mixed', avgFunctionLength: 0, hasTestDir: false,
  };
}

const COMMON = 'if else for while return break continue try catch throw new class const static public private protected import export async await yield switch case default null true false';
const KEYWORDS: Record<string, string> = {
  TypeScript: `${COMMON} function let var extends implements interface type enum readonly keyof typeof void this super from instanceof declare abstract`,
  JavaScript: `${COMMON} function let var extends typeof void this super from instanceof delete finally of in`,
  Python: 'def class return if elif else for while try except finally with as yield async await from import in not and or is lambda raise pass assert global nonlocal True False None',
  Rust: 'fn let mut pub impl trait struct enum match return if else for while loop use mod crate Self self async await move where const type ref unsafe dyn static in as break continue',
  Go: 'func type struct interface package import return if else for switch case const var range defer go chan select map break continue default nil true false fallthrough',
  Java: `${COMMON} interface enum record final void extends implements throws this super instanceof abstract synchronized package transient volatile boolean int long`,
  Kotlin: `${COMMON} fun object val var when is suspend override companion data sealed internal as in null this super inline reified open`,
  'C#': `${COMMON} namespace using interface enum struct readonly void override virtual sealed internal partial get set event delegate lock var this base int bool string`,
  C: 'void int char long short unsigned signed struct enum union typedef return const static if else for switch case while do break continue sizeof include define extern volatile restrict',
  'C++': `${COMMON} void int char long struct enum union typedef namespace virtual template auto typename using include constexpr noexcept override this sizeof nullptr`,
  Ruby: 'def class module end do if elsif else unless yield return require require_relative begin rescue ensure case when while until for in self nil true false super attr_reader attr_accessor',
  Shell: 'function if then else elif fi for do done while case esac in return export local readonly echo set',
  Lua: 'function local if then else elseif end for while do return in nil true false repeat until',
  PHP: `${COMMON} function namespace use extends implements static echo public private protected`,
  Swift: `${COMMON} func struct enum protocol extension let var guard defer throws inout self init`,
  Scala: `${COMMON} def val var object trait extends with match case implicit given using`,
};
const ALL_KEYWORDS = new Set(`${COMMON} ${Object.values(KEYWORDS).join(' ')}`.split(/\s+/));
const OPERATORS = /=>|::|->|:=|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\?\.|\*\*|\+=|-=|\+\+|--|<<|>>|\|>|[{};=+*/%&|!<>-]/g;
const CONTROL = new Set('if else for while switch catch with match when foreach using lock synchronized return new throw typeof sizeof delete function'.split(' '));
const IMPORT_LINE = /^\s*(?:import\b|from\s+\S+\s+import\b|(?:pub\s+)?use\b|(?:pub\s+)?mod\s+\w+\s*;|package\b|using\b|#\s*(?:include|define)\b|require(?:_relative)?\b)|\b(?:import|export)\b.*\bfrom\s*["']|\brequire\s*\(/;

type Definition = { name: string; line: number; column: number; kind: 'function' | 'class'; exported: boolean; file: string; component: string; safe: boolean };
type Candidate = { file: string; line: number; raw: string; score: number; signature: boolean; depth: number; length: number };
interface LexState { block: boolean; quote: string; raw?: boolean; doc?: boolean }

/** Lightweight string/comment masking preserves columns for brace matching and exact excerpts. */
function codeLine(raw: string, language: string, state: LexState): { code: string; comments: string[] } {
  const chars = raw.split('');
  const comments: string[] = [];
  const hash = ['Python', 'Ruby', 'Shell', 'R', 'Julia', 'Perl'].includes(language);
  const dash = ['Lua', 'SQL'].includes(language);
  let i = 0;
  while (i < raw.length) {
    if (state.block) {
      const end = raw.indexOf('*/', i);
      const until = end < 0 ? raw.length : end + 2;
      comments.push(raw.slice(i, end < 0 ? undefined : end));
      chars.fill(' ', i, until); i = until;
      if (end >= 0) state.block = false;
    } else if (state.quote) {
      const quote = state.quote;
      let end = i;
      let contentEnd: number | undefined;
      while (end < raw.length) {
        if (raw[end] === '\\') { end += 2; continue; }
        if (raw.startsWith(quote, end)) { contentEnd = end; end += quote.length; state.quote = ''; state.raw = false; break; }
        end++;
      }
      if (state.doc) comments.push(raw.slice(i, contentEnd));
      if (!state.quote) state.doc = false;
      chars.fill(' ', i, Math.min(end, raw.length)); i = end;
      // Single-line quotes don't continue unless explicitly escaped (backticks/triples do).
      if (state.quote.length === 1 && state.quote !== '`' && !state.raw && !raw.endsWith('\\')) state.quote = '';
    } else if (raw.startsWith('/*', i) && !hash) {
      chars.fill(' ', i, i + 2); state.block = true; i += 2;
    } else if ((!hash && raw.startsWith('//', i)) || (hash && raw[i] === '#') || (dash && raw.startsWith('--', i))) {
      comments.push(raw.slice(i + (hash ? 1 : 2))); chars.fill(' ', i); break;
    } else if (language === 'Rust' && /^r(#{0,16})"/.test(raw.slice(i))) {
      const marker = raw.slice(i).match(/^r(#{0,16})"/)![0];
      chars.fill(' ', i, i + marker.length); state.quote = '"' + marker.slice(1, -1); state.raw = true; i += marker.length;
    } else if (language === 'C++' && /^R"([^ ()\\\t]{0,16})\(/.test(raw.slice(i))) {
      const marker = raw.slice(i).match(/^R"([^ ()\\\t]{0,16})\(/)!;
      chars.fill(' ', i, i + marker[0].length); state.quote = ')' + marker[1] + '"'; state.raw = true; i += marker[0].length;
    } else if (raw[i] === '"' || raw[i] === "'" || raw[i] === '`') {
      // Rust lifetimes and char syntax differ; preserve 'a lifetimes as identifiers.
      if (language === 'Rust' && raw[i] === "'" && /^'[a-zA-Z_]\w*(?!')/.test(raw.slice(i)) && !/^'[^']'/.test(raw.slice(i))) { i++; continue; }
      const triple = (['Python', 'Java', 'Kotlin', 'Scala', 'Swift'].includes(language) && raw.startsWith('"""', i)) || (language === 'Python' && raw.startsWith("'''", i));
      const quote = triple ? raw.slice(i, i + 3) : raw[i];
      state.doc = language === 'Python' && triple && !raw.slice(0, i).trim();
      chars.fill(' ', i, i + quote.length); state.quote = quote; state.raw = language === 'Rust'; i += quote.length;
    } else i++;
  }
  return { code: chars.join(''), comments };
}

function definitions(code: string, language: string): { name: string; column: number; kind: 'function' | 'class' }[] {
  const result: { name: string; column: number; kind: 'function' | 'class' }[] = [];
  const seen = new Set<string>();
  const reserved = new Set((KEYWORDS[language] ?? COMMON).split(/\s+/));
  const add = (regex: RegExp, kind: 'function' | 'class', allowControl = true) => {
    for (const match of code.matchAll(regex)) {
      const name = match[1];
      if (reserved.has(name) || (!allowControl && CONTROL.has(name)) || seen.has(`${kind}:${name}`)) continue;
      seen.add(`${kind}:${name}`);
      result.push({ name, column: match.index! + match[0].indexOf(name), kind });
    }
  };
  // Limit regex work on generated single-line payloads while still counting their length/nesting.
  code = code.slice(0, 4096);
  if (language === 'Python') {
    add(/\b(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/g, 'function');
    add(/\bclass\s+([A-Za-z_]\w*)/g, 'class');
  } else if (language === 'Rust') {
    add(/\bfn\s+([A-Za-z_]\w*)/g, 'function');
    add(/\b(?:struct|enum|trait)\s+([A-Za-z_]\w*)/g, 'class');
  } else if (language === 'Go') {
    add(/\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)?\(/g, 'function');
    add(/\btype\s+([A-Za-z_]\w*)\s+(?:struct|interface)\b/g, 'class');
  } else if (language === 'Ruby') {
    add(/^\s*def\s+(?:(?:self|[A-Z]\w*)[.:]+)?([A-Za-z_]\w*[!?=]?)/g, 'function');
    add(/\b(?:class|module)\s+([A-Za-z_]\w*)/g, 'class');
  } else if (language === 'Shell') {
    add(/^\s*(?:function\s+)?([A-Za-z_]\w*)\s*(?:\(\s*\))?\s*\{/g, 'function');
  } else {
    add(/\bfunction\s*\*?\s+([A-Za-z_$][\w$]*)/g, 'function');
    add(/\b(?:fun|func|def)\s+(?:<[^>]+>\s*)?([A-Za-z_$][\w$]*)\s*(?:<[^>]+>\s*)?\(/g, 'function');
    if (['C', 'C++'].includes(language)) add(/\b(?:class|struct|enum|union)\s+([A-Za-z_]\w*)\s*(?::[^{;]+)?\s*(?=\{|$)/g, 'class');
    else add(/\b(?:class|interface|struct|enum|trait|protocol|object)\s+([A-Za-z_$][\w$]*)/g, 'class');
    if (['TypeScript', 'JavaScript', 'Vue', 'Svelte'].includes(language)) {
      add(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*(?:async\s+)?(?:function\b|(?:\([^;]*?\)|[A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=>)/g, 'function');
      add(/(?:^|[,{;])\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s+)?(?:function\b|\([^;]*?\)\s*=>)/g, 'function');
    }
    if (language === 'C++') add(/\b(?:[A-Za-z_]\w*::)+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*(?:const\s*)?(?:noexcept\s*)?\{/g, 'function');
    // Methods / constructors / C-family definitions; no call-expression or control-line prefix.
    const header = code.slice(0, code.indexOf('{') < 0 ? undefined : code.indexOf('{'));
    if (!/^\s*(?:return|throw|new|if|for|while|switch|catch)\b/.test(code) && !/=/.test(code.split('(', 1)[0]) && !/=>|\bfunction\b/.test(header)) {
      add(/^\s*(?:(?:[\w$.[\]<>?,*&~]+|::)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>\s*)?\([^;{}]*\)\s*(?::[^;{]+|throws\s+[^;{]+)?\s*\{/g, 'function', false);
    }
  }
  return result;
}

function eligible(raw: string, code: string, file: string): boolean {
  if (/\.(?:vue|svelte|tsx|jsx)$/.test(file) && (/^\s*</.test(raw) || /^\s*[\w:-]+\s*=\s*["']/.test(raw))) return false;
  return code.trim().length > 0 && !IMPORT_LINE.test(raw) && !/^[\s{}()[\];,]+$/.test(code) && safeCodeText(raw);
}

function spanOfFunction(def: Definition, raw: string[], code: string[], braceEnds: Map<string, number>, rubyEnds: Map<number, number>): number {
  if (rubyEnds.has(def.line)) return rubyEnds.get(def.line)! - def.line + 1;
  const language = languageOf(def.file);
  if (language === 'Python') {
    const leading = code[def.line].match(/^\s*/)?.[0].length ?? 0;
    let signatureEnd = def.line;
    let parentheses = 0;
    signature: for (; signatureEnd < code.length; signatureEnd++) {
      for (const character of code[signatureEnd].slice(signatureEnd === def.line ? def.column : 0)) {
        if (character === '(') parentheses++;
        else if (character === ')') parentheses--;
        else if (character === ':' && parentheses === 0) break signature;
      }
    }
    signatureEnd = Math.min(signatureEnd, code.length - 1);
    let end = signatureEnd + 1;
    while (end < code.length) {
      if (code[end].trim() && (code[end].match(/^\s*/)?.[0].length ?? 0) <= leading) break;
      end++;
    }
    while (end > def.line + 1 && !raw[end - 1].trim()) end--;
    return Math.max(1, end - def.line);
  }
  for (let i = def.line; i < Math.min(code.length, def.line + 12); i++) {
    const start = i === def.line ? def.column : 0;
    const brace = code[i].indexOf('{', start);
    const semicolon = code[i].indexOf(';', start);
    if (semicolon >= 0 && (brace < 0 || semicolon < brace)) break;
    if (brace >= 0) return (braceEnds.get(`${i}:${brace}`) ?? i) - def.line + 1;
    if (i === def.line && /=>\s*\S/.test(code[i])) break;
  }
  return 1;
}

export function extractCodeDNA(
  input: SourceFile[], options: { heart: string; componentForFile?: (file: string) => string; components?: string[]; commits?: string[]; fileFanIn?: ReadonlyMap<string, number> },
): AnalyzedDNA {
  const dna = emptyDNA();
  const files = input.filter(file => isSourcePath(file.path)).sort((a, b) => a.path.localeCompare(b.path));
  dna.bigFiles = files.map(file => ({ path: file.path, loc: countLoc(file.text) })).sort((a, b) => b.loc - a.loc || a.path.localeCompare(b.path)).slice(0, 8);
  dna.commits = cleanCommitSubjects(options.commits ?? []);
  const refs = new Map<string, number>();
  const tokenCounts = new Map<string, number>();
  const allDefinitions: Definition[] = [];
  const candidates: Candidate[] = [];
  const styles = new Set<CodeDNA['indent']>();
  const notes: CodeDNA['todos'] = [];
  const highlights = new Map<string, Candidate[]>();
  const locs = new Map(files.map(file => [file.path, countLoc(file.text)]));
  let lineLength = 0, lineCount = 0, functionLines = 0;
  dna.hasTestDir = files.some(file => file.path.split('/').slice(0, -1).some(part => /^(?:__tests__|tests?|specs?)$/i.test(part)));
  const increment = (map: Map<string, number>, name: string) => map.set(name, (map.get(name) ?? 0) + 1);
  const collectComments = (file: string, original: string, comments: string[]) => {
    if (comments.length && original.trim()) dna.counts.comments++;
    for (const comment of comments) {
      for (const tag of comment.matchAll(/\b(TODO|FIXME|HACK|XXX|NOTE|BUG|OPTIMIZE|TBD)\b/gi)) {
        const label = tag[1].toUpperCase();
        if (label === 'TODO') dna.counts.todo++;
        else if (label === 'FIXME') dna.counts.fixme++;
        else if (label === 'HACK' || label === 'XXX') dna.counts.hack++;
        const target = ['TODO', 'FIXME', 'HACK', 'XXX'].includes(label) ? dna.todos : notes;
        const text = comment.slice(tag.index!).trim();
        if (target.length < LIMITS.todos && safeCodeText(original) && safeCodeText(text)) target.push({ file, text: excerpt(text, 60) });
      }
    }
  };

  for (const file of files) {
    const language = languageOf(file.path)!;
    if (selectPrimaryLanguage({ [language]: 1 }) === 'Unknown') {
      if (['CSS', 'SCSS', 'Sass', 'Less'].includes(language)) {
        const state: LexState = { block: false, quote: '' };
        for (const line of file.text.split(/\r?\n/)) collectComments(file.path, line, codeLine(line, language, state).comments);
      } else if (language === 'HTML') {
        for (const match of file.text.matchAll(/<!--([\s\S]*?)-->/g)) {
          for (const line of match[1].split(/\r?\n/)) collectComments(file.path, line, [line]);
        }
      }
      continue;
    }
    const keywords = KEYWORDS[language] ? new Set(KEYWORDS[language].split(/\s+/)) : ALL_KEYWORDS;
    const raw = file.text.split(/\r?\n/);
    const code: string[] = [];
    const state: LexState = { block: false, quote: '' };
    const fileDefinitions: Definition[] = [];
    const fileCandidates: Candidate[] = [];
    const braces: { line: number; column: number }[] = [];
    const braceEnds = new Map<string, number>();
    const rubyStack: number[] = [];
    const rubyEnds = new Map<number, number>();
    let tabs = 0, minSpaces = Infinity, deepestIndent = 0, mixedPrefix = false, importDepth = 0;
    for (let i = 0; i < raw.length; i++) {
      const original = raw[i];
      const parsed = codeLine(original, language, state);
      const clean = parsed.code;
      code.push(clean);
      if (original.trim()) { lineLength += original.length; lineCount++; }
      collectComments(file.path, original, parsed.comments);
      const isImport = importDepth > 0 || /^\s*(?:import\b|from\s+\S+\s+import\b|export\s+(?:type\s+)?[{*])/.test(clean);
      if (isImport) importDepth = Math.max(0, importDepth + (clean.match(/[({[]/g)?.length ?? 0) - (clean.match(/[)}\]]/g)?.length ?? 0));
      const indent = original.match(/^[ \t]+/)?.[0];
      if (clean.trim() && indent) {
        const spaces = indent.replace(/\t/g, '').length;
        if (indent.includes('\t')) tabs++;
        if (spaces) minSpaces = Math.min(minSpaces, spaces);
        if (indent.includes('\t') && spaces) mixedPrefix = true;
        deepestIndent = Math.max(deepestIndent, indent.replace(/\t/g, '    ').length);
      }
      for (const word of clean.matchAll(/[A-Za-z_$][\w$]*/g)) {
        increment(refs, word[0]);
        if (keywords.has(word[0])) increment(tokenCounts, word[0]);
      }
      for (const operator of clean.matchAll(OPERATORS)) increment(tokenCounts, operator[0]);
      let depth = language === 'Python' && clean.trim() ? Math.floor((indent?.replace(/\t/g, '    ').length ?? 0) / (minSpaces < Infinity ? minSpaces : 4)) : braces.length;
      for (let column = 0; column < clean.length; column++) {
        if (clean[column] === '{') { braces.push({ line: i, column }); depth = Math.max(depth, braces.length); }
        else if (clean[column] === '}') {
          const open = braces.pop(); if (open) braceEnds.set(`${open.line}:${open.column}`, i);
        }
      }
      if (language === 'Ruby') {
        if (/^\s*(?:def|class|module|if|unless|case|begin|for|while|until)\b/.test(clean) || /\bdo\s*(?:\|[^|]*\|\s*)?$/.test(clean)) rubyStack.push(i);
        depth = Math.max(depth, rubyStack.length);
        for (const _end of clean.matchAll(/\bend\b/g)) { const start = rubyStack.pop(); if (start !== undefined) rubyEnds.set(start, i); }
      }
      dna.maxNesting = Math.max(dna.maxNesting, depth);
      // Allman-style C/C++/Java/C# declarations put their opening brace on the next line.
      const nextBrace = /\)\s*(?::[^;{]+)?$/.test(clean) && /^\s*\{/.test(raw[i + 1] ?? '');
      const found = definitions(clean + (nextBrace ? ' {' : ''), language);
      for (const def of found) {
        const defined: Definition = { ...def, line: i, file: file.path, component: options.componentForFile?.(file.path) ?? (file.path.includes('/') ? file.path.split('/')[0] : 'root'), exported: /\b(?:export|pub|public|def|class|func|fun)\b/.test(clean), safe: safeCodeText(original) && safeCodeText(def.name) };
        fileDefinitions.push(defined);
        if (def.kind === 'function') dna.counts.functions++; else dna.counts.classes++;
      }
      if (!isImport && eligible(original, clean, file.path)) {
        const score = found.length * 100 + (/\b(?:return|yield|match|raise|throw)\b/.test(clean) ? 30 : 0) + (clean.match(OPERATORS)?.length ?? 0) + Math.min(original.trim().length, 120) / 10;
        fileCandidates.push({ file: file.path, line: i + 1, raw: original.trim(), score, signature: found.some(def => def.kind === 'function'), depth, length: original.trim().length });
      }
    }
    if (tabs || minSpaces < Infinity) {
      const style = mixedPrefix || (tabs && minSpaces < Infinity) ? 'mixed' : tabs ? 'tabs' : minSpaces % 4 === 0 ? 'spaces4' : minSpaces % 2 === 0 ? 'spaces2' : 'mixed';
      styles.add(style);
    }
    if (language === 'Python') dna.maxNesting = Math.max(dna.maxNesting, Math.floor(deepestIndent / (minSpaces < Infinity ? minSpaces : 4)));
    for (const def of fileDefinitions) {
      if (def.kind === 'function') {
        const lines = spanOfFunction(def, raw, code, braceEnds, rubyEnds);
        functionLines += lines;
        if (def.safe && (!dna.longestFunction || lines > dna.longestFunction.lines)) dna.longestFunction = { name: def.name, file: file.path, lines };
      }
      allDefinitions.push(def);
    }
    // Keep at most four per file for the global showcase; scanning still includes every line.
    const byScore = fileCandidates.slice().sort((a, b) => b.score - a.score || a.line - b.line);
    const longest = fileCandidates.slice().sort((a, b) => b.length - a.length || a.line - b.line)[0];
    const deepest = fileCandidates.slice().sort((a, b) => b.depth - a.depth || b.score - a.score || a.line - b.line)[0];
    const signature = byScore.find(candidate => candidate.signature);
    for (const candidate of [signature, longest, deepest, byScore[0]]) if (candidate) candidates.push(candidate);
    highlights.set(file.path, byScore.slice(0, LIMITS.heart).sort((a, b) => a.line - b.line));
  }

  let heartSource = options.heart;
  let heartHighlights = highlights.get(heartSource) ?? [];
  if (heartHighlights.length < 6) {
    const rich = [...highlights.keys()].filter(file => highlights.get(file)!.length >= 6);
    const bySize = (a: string, b: string) => (locs.get(b) ?? 0) - (locs.get(a) ?? 0) || a.localeCompare(b);
    const imported = rich.filter(file => (options.fileFanIn?.get(file) ?? 0) > 0)
      .sort((a, b) => (options.fileFanIn!.get(b) ?? 0) - (options.fileFanIn!.get(a) ?? 0) || bySize(a, b));
    const sameComponent = rich.filter(file => options.componentForFile?.(file) === options.componentForFile?.(options.heart)).sort(bySize);
    const fallback = imported[0] ?? sameComponent[0] ?? rich.sort(bySize)[0]
      ?? [...highlights.keys()].sort((a, b) => highlights.get(b)!.length - highlights.get(a)!.length || bySize(a, b))[0];
    if (fallback && highlights.get(fallback)!.length > heartHighlights.length) {
      heartSource = fallback; heartHighlights = highlights.get(fallback)!;
    }
  }
  dna.heartLines = heartHighlights.map(candidate => excerpt(candidate.raw, 40));
  dna.todos.push(...notes.slice(0, LIMITS.todos - dna.todos.length));
  const named = new Map<string, { definitions: number; exported: boolean; components: Set<string> }>();
  for (const def of allDefinitions.filter(def => def.safe)) {
    const entry = named.get(def.name) ?? { definitions: 0, exported: false, components: new Set<string>() };
    entry.definitions++; entry.exported ||= def.exported; entry.components.add(def.component); named.set(def.name, entry);
  }
  const score = (name: string) => named.get(name)!.definitions * Math.max(1, (refs.get(name.replace(/[!?=]$/, '')) ?? 0) - named.get(name)!.definitions);
  const ranked = [...named.keys()].sort((a, b) => score(b) - score(a) || a.localeCompare(b));
  dna.identifiers = ranked.slice(0, LIMITS.identifiers);
  const components = new Set([...(options.components ?? []), ...allDefinitions.map(def => def.component)]);
  for (const component of components) {
    dna.componentSymbols[component] = ranked.filter(name => named.get(name)!.components.has(component)).sort((a, b) => Number(named.get(b)!.exported) - Number(named.get(a)!.exported) || score(b) - score(a) || a.localeCompare(b)).slice(0, LIMITS.symbols);
  }
  const unique = new Map(candidates.map(candidate => [`${candidate.file}:${candidate.line}`, candidate]));
  const showcase = [...unique.values()];
  const selected = new Map<string, Candidate>();
  const add = (candidate: Candidate | undefined) => { if (candidate && selected.size < LIMITS.snippets) selected.set(`${candidate.file}:${candidate.line}`, candidate); };
  if (heartSource !== options.heart) add(heartHighlights.find(candidate => candidate.signature) ?? heartHighlights[0]);
  add(showcase.slice().sort((a, b) => b.length - a.length || a.file.localeCompare(b.file) || a.line - b.line)[0]);
  add(showcase.slice().sort((a, b) => b.depth - a.depth || b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line)[0]);
  for (const candidate of showcase.sort((a, b) => Number(b.signature) - Number(a.signature) || b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line)) add(candidate);
  dna.snippets = [...selected.values()].map(candidate => ({ file: candidate.file, line: candidate.line, code: excerpt(candidate.raw, 48) }));
  dna.tokens = [...tokenCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([token]) => token);
  dna.avgLineLength = lineCount ? Math.round(lineLength / lineCount * 10) / 10 : 0;
  dna.indent = styles.size === 1 ? [...styles][0] : 'mixed';
  dna.avgFunctionLength = dna.counts.functions ? Math.round(functionLines / dna.counts.functions * 10) / 10 : 0;
  return dna;
}
