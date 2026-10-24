import { describe, expect, it } from 'vitest';
import { cleanCommitSubjects, emptyDNA, extractCodeDNA, safeCodeText } from './dna.ts';
import { profileFromFiles } from './graph.ts';
import type { SourceFile } from './files.ts';

const sources = (files: Record<string, string>): SourceFile[] => Object.entries(files).map(([path, text]) => ({ path, text }));
const dna = (files: Record<string, string>, heart = Object.keys(files)[0]) => extractCodeDNA(sources(files), { heart });

describe('real-code DNA', () => {
  it('ranks actual definitions by reference use, resolves final component names, and preserves exact source excerpts', () => {
    const files = sources({
      'src/core/heart.ts': 'export function pulse(value: number) {\n  if (value > 0) {\n    return value * 2;\n  }\n  return 0;\n}\nexport class Heart {}',
      'src/api/main.ts': "import { pulse } from '../core/heart';\nexport const render = () => pulse(1) + pulse(2) + pulse(3);\nrender();",
      'tests/main.test.ts': "import { pulse } from '../src/core/heart';\npulse(4);",
    });
    const p = profileFromFiles('demo/dna', files);
    const d = p.dna!;
    expect(d.identifiers[0]).toBe('pulse'); expect(d.identifiers).toContain('render'); expect(d.identifiers).toContain('Heart');
    expect(d.counts.functions).toBe(2); expect(d.counts.classes).toBe(1);
    expect(d.componentSymbols['src/core']).toContain('pulse'); expect(d.componentSymbols['src/api']).toContain('render');
    expect(d.longestFunction).toEqual({ name: 'pulse', file: 'src/core/heart.ts', lines: 6 });
    expect(d.heartLines).toContain('return value * 2;'); expect(d.heartLines.every(line => !line.startsWith('import'))).toBe(true);
    for (const snippet of d.snippets) {
      const original = files.find(file => file.path === snippet.file)!.text.split('\n')[snippet.line - 1].trim();
      expect(original.startsWith(snippet.code)).toBe(true); expect(snippet.code.length).toBeLessThanOrEqual(48);
    }
    expect(d.maxNesting).toBe(2); expect(d.indent).toBe('spaces2'); expect(d.tokens).toContain('return');
  });
  it('extracts Python definitions, nested function spans, indent metrics, and real TODO comments', () => {
    const d = dna({ 'main.py': [
      '# TODO: simplify the matching logic',
      'class Matcher:',
      '    def match(self, value):',
      '        if value:',
      '            for item in value:',
      '                if item:',
      '                    return item',
      '        return None',
      '',
      'def short():',
      '    return Matcher()',
    ].join('\n') });
    expect(d.identifiers).toContain('Matcher'); expect(d.identifiers).toContain('match');
    expect(d.counts).toMatchObject({ functions: 2, classes: 1, todo: 1, comments: 1 });
    expect(d.todos).toEqual([{ file: 'main.py', text: 'TODO: simplify the matching logic' }]);
    expect(d.longestFunction).toEqual({ name: 'match', file: 'main.py', lines: 6 });
    expect(d.indent).toBe('spaces4'); expect(d.maxNesting).toBe(5);
    expect(d.snippets.some(s => s.code === 'return item')).toBe(true);
  });
  it.each([
    ['src/lib.rs', 'pub struct Parser {}\npub fn parse(input: &str) -> usize {\n    input.len()\n}\nfn main() { parse(""); parse(""); }', 'parse', 'Parser', 'fn'],
    ['main.go', 'package main\ntype Server struct {}\nfunc (s *Server) Serve() {\n\tfor {\n\t\tbreak\n\t}\n}', 'Serve', 'Server', 'func'],
    ['Main.java', 'public class Main {\n  public int calculate(int value) {\n    return value + 1;\n  }\n}', 'calculate', 'Main', 'public'],
    ['Main.kt', 'class Hero {\n  fun shoot(value: Int): Int {\n    return value + 1\n  }\n}', 'shoot', 'Hero', 'fun'],
    ['Main.cs', 'namespace Game;\npublic class Hero {\n  public int Shoot(int value) {\n    return value + 1;\n  }\n}', 'Shoot', 'Hero', 'public'],
    ['main.cpp', 'struct Engine {};\nint launch(int value) {\n  return value + 1;\n}', 'launch', 'Engine', 'return'],
    ['main.rb', 'class Hero\n  def shoot(value)\n    if value\n      value\n    end\n  end\nend', 'shoot', 'Hero', 'end'],
    ['main.js', 'export class Hero {}\nexport const shoot = (v) => {\n  return v + 1;\n};', 'shoot', 'Hero', 'export'],
  ])('supports real %s function/type names', (file, text, method, type, keyword) => {
    const d = dna({ [file]: text });
    expect(d.identifiers).toContain(method); expect(d.identifiers).toContain(type);
    expect(d.longestFunction?.name).toBe(method); expect(d.longestFunction!.lines).toBeGreaterThan(1);
    expect(d.tokens).toContain(keyword);
  });
  it('does not mistake imports, function calls, strings, or comments for definitions or brace nesting', () => {
    const d = dna({ 'main.ts': [
      "import { imaginary } from './other';",
      '// function fake() { {{{ TODO: make this real',
      'const message = "class NotReal { function forged() {";',
      'export function real() {',
      '  const literal = "}}}}";',
      '  return imaginary();',
      '}',
    ].join('\n') });
    expect(d.identifiers).toEqual(['real']); expect(d.counts.functions).toBe(1); expect(d.counts.classes).toBe(0);
    expect(d.maxNesting).toBe(1); expect(d.counts.todo).toBe(1);
    expect(d.heartLines.some(line => line.includes('imaginary } from'))).toBe(false);
    expect(d.heartLines.some(line => line.includes('function fake'))).toBe(false);
  });
  it('ignores callback calls as definitions and masks Rust raw strings / Java text blocks', () => {
    const js = dna({ 'main.js': 'describe("suite", function() {\n  it("case", () => { real(); });\n});\nfunction real() { return 1; }' });
    expect(js.identifiers).toEqual(['real']); expect(js.counts.functions).toBe(1);
    const rust = dna({ 'main.rs': 'const HELP: &str = r#"long "quoted" text\nfn invented() { {{{{{\n"#;\nfn actual() {\n    return;\n}' });
    expect(rust.identifiers).toEqual(['actual']); expect(rust.maxNesting).toBe(1);
    const java = dna({ 'Main.java': 'class Main {\nString text = """\nvoid invented() { {{{\n""";\npublic void actual() {}\n}' });
    expect(java.identifiers).not.toContain('invented'); expect(java.identifiers).toContain('actual');
  });
  it('measures multiline Python signatures without treating argument annotations as body boundaries', () => {
    const d = dna({ 'main.py': 'def parse(\n    value: int,\n    size: int,\n):\n    return value + size\n\ndef next_function():\n    pass' });
    expect(d.longestFunction).toEqual({ name: 'parse', file: 'main.py', lines: 5 });
  });
  it('recognizes next-line braces and scoped C++ methods without turning calls into definitions', () => {
    const c = dna({ 'main.c': 'int add(int a, int b)\n{\n    return a + b;\n}\nvoid main()\n{\n    add(1, 2);\n}' });
    expect(c.identifiers).toContain('add'); expect(c.counts.functions).toBe(2);
    expect(c.longestFunction).toEqual({ name: 'add', file: 'main.c', lines: 4 });
    const cpp = dna({ 'main.cpp': 'int Engine::run(int value)\n{\n    return value + 1;\n}' });
    expect(cpp.identifiers).toEqual(['run']); expect(cpp.counts.functions).toBe(1);
    const js = dna({ 'main.ts': 'const run = () =>\n{\n  return 1;\n};' });
    expect(js.longestFunction?.lines).toBe(4);
  });
  it('drops sensitive lines, TODOs, definitions, and credential-like base64/hex before truncation', () => {
    const d = dna({ 'main.ts': [
      'export function safe() {',
      '  // TODO: remove retry workaround',
      '  // FIXME: reduce reconnect retries',
      '  // HACK: old parser compatibility',
      '  // XXX: simplify this branch',
      "  const apiKey = 'credential-value';",
      "  const token = 'another-value';",
      "  const user_token = 'abc123';",
      "  const userToken = 'abc123';",
      "  const headers = { Authorization: 'Bearer abc123' };",
      "  const password = 'unavailable';",
      "  const harmless = '0123456789abcdef0123456789abcdef';",
      "  const encoded = 'QWxwaGFCZXRhR2FtbWFEZWx0YUVwc2lsb25aZXRhRXRhVGhldGE=';",
      '  // TODO: rotate clientSecret before launch',
      '  return 42;',
      '}',
      'export function getSecret() { return 3; }',
    ].join('\n') });
    const displayed = JSON.stringify({ identifiers: d.identifiers, symbols: d.componentSymbols, snippets: d.snippets, heartLines: d.heartLines, todos: d.todos, longestFunction: d.longestFunction });
    for (const forbidden of ['apiKey', 'token', 'userToken', 'Authorization', 'password', 'clientSecret', 'getSecret', 'credential-value', 'QWxwaG', '0123456789abcdef']) expect(displayed).not.toContain(forbidden);
    expect(d.counts).toMatchObject({ todo: 2, fixme: 1, hack: 2 }); expect(d.todos).toHaveLength(4);
    expect(d.heartLines).toContain('return 42;');
    expect(safeCodeText(`return 0; ${' '.repeat(50)}secret = 'later in the line'`)).toBe(false);
  });
  it('caps identifiers, symbols, excerpts, TODOs, commits, big files and tokens while keeping real paths/line numbers', () => {
    const files = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`src/group${i}/main.py`, `# TODO: ${'improve '.repeat(20)}\ndef function_${i}():\n    return ${i}\n${'\n# line'.repeat(i)}`]));
    const d = extractCodeDNA(sources(files), { heart: 'src/group1/main.py', componentForFile: () => 'misc', commits: Array.from({ length: 20 }, (_, i) => `Fix rendering ${i}\n\nbody`) });
    expect(d.identifiers).toHaveLength(24); expect(d.componentSymbols.misc).toHaveLength(4);
    expect(d.snippets.length).toBeLessThanOrEqual(12); expect(d.todos).toHaveLength(12); expect(d.commits).toHaveLength(10);
    expect(d.bigFiles).toHaveLength(8); expect(d.bigFiles[0].path).toBe('src/group39/main.py');
    expect(d.heartLines.every(line => line.length <= 40)).toBe(true);
    expect(d.todos.every(todo => todo.text.length <= 60)).toBe(true); expect(d.tokens.length).toBeLessThanOrEqual(12);
    expect(d.counts.functions).toBe(40); expect(d.counts.todo).toBe(40);
  });
  it('uses real central implementation lines for a barrel heart and pins their snippet provenance', () => {
    const implementation = 'export function pulse(value: number) {\n  const doubled = value * 2;\n  const shifted = doubled + 1;\n  if (shifted > 0) {\n    return shifted;\n  }\n  return 0;\n}';
    const files = sources({
      'src/index.ts': 'export * from "./core";',
      'src/core.ts': implementation,
      'src/larger.ts': 'export function unrelated() {\n' + '  return 1;\n'.repeat(50) + '}',
      ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => ['test/caller' + i + '.ts', 'import "../src/index";'])),
    });
    const p = profileFromFiles('demo/barrel', files);
    expect(p.heart).toBe('src/index.ts'); expect(p.heartFanIn).toBe(8);
    expect(p.dna!.heartLines.length).toBeGreaterThanOrEqual(6);
    expect(p.dna!.heartLines).toContain('export function pulse(value: number) {');
    expect(p.dna!.snippets[0].file).toBe('src/core.ts');
    const sourceLine = implementation.split('\n')[p.dna!.snippets[0].line - 1].trim();
    expect(sourceLine.startsWith(p.dna!.snippets[0].code)).toBe(true);
  });
  it('ignores multiline re-exports and selects the biggest implementation in the heart component when there are no import counts', () => {
    const input = sources({
      'src/index.py': 'from .model import (\n    A,\n    B,\n    C,\n    D,\n    E,\n    F,\n    G,\n)',
      'src/model.py': 'def model(value):\n    a = value + 1\n    b = a + 1\n    c = b + 1\n    d = c + 1\n    return d',
      'other/large.py': 'def other():\'Other component\'\n' + '    print(1)\n'.repeat(40),
    });
    const result = extractCodeDNA(input, { heart: 'src/index.py', componentForFile: file => file.split('/')[0] });
    expect(result.heartLines).toContain('def model(value):');
    expect(result.heartLines).not.toContain('A,'); expect(result.snippets[0].file).toBe('src/model.py');
    expect(extractCodeDNA(sources({ 'index.ts': 'export * from "./empty";' }), { heart: 'index.ts' }).heartLines).toEqual([]);
  });
  it('collects real NOTE-ish documentation/style comments after actionable tags without inventing TODO counts', () => {
    const result = dna({
      'a.py': '"""NOTE: preserve documented ordering.\n"""\ndescription = """NOTE: this assigned string is not a doc comment."""\n# NOTE: userToken = credential\n# BUG: retry ordering\n',
      'b.css': '/* NOTE: keep the pixel palette consistent. */\n.x { color: red; }',
      'c.html': '<!-- NOTE: phone landscape layout -->\n<main></main>',
      'z.py': '# TODO: remove compatibility branch\ndef run():\n    return 1',
    }, 'z.py');
    expect(result.todos[0].text).toBe('TODO: remove compatibility branch');
    expect(result.todos.some(todo => todo.text === 'NOTE: preserve documented ordering.')).toBe(true);
    expect(result.todos.some(todo => todo.file === 'b.css')).toBe(true);
    expect(result.todos.some(todo => todo.file === 'c.html')).toBe(true);
    expect(JSON.stringify(result.todos)).not.toContain('assigned string');
    expect(JSON.stringify(result.todos)).not.toContain('userToken');
    expect(result.counts).toMatchObject({ todo: 1, fixme: 0, hack: 0 });
  });
  it('handles tabs, mixed styles, empty sources, and commit filtering without invented code', () => {
    expect(dna({ 'main.go': 'func main() {\n\treturn\n}' }).indent).toBe('tabs');
    expect(dna({ 'a.py': 'def a():\n  return 1', 'b.py': 'def b():\n    return 2' }).indent).toBe('mixed');
    expect(extractCodeDNA([], { heart: 'README.md' })).toEqual(emptyDNA());
    expect(cleanCommitSubjects(['fix: preserve input\n\nLong body', 'rotate API_KEY=123', 'password leak', '  improve parser  '])).toEqual(['fix: preserve input', 'improve parser']);
  });
});
