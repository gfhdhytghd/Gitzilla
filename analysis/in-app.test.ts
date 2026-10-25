import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InAppFile } from '../shared/classroom.ts';
import { fnv1a } from './graph.ts';
import { analyzeFiles } from './in-app.ts';
import { qualitySignalsFromProfile } from './quality.ts';

const files: InAppFile[] = [
  { path: 'main.py', content: 'from helpers.maths import double\n\ndef greet(name):\n    """Build a greeting."""\n    return "Hello, " + name\n\nprint(double(3))\n' },
  { path: 'helpers/maths.py', content: '# Keep the arithmetic reusable.\ndef double(value):\n    return value * 2\n' },
  { path: 'tests/test_main.py', content: 'from main import greet\nfrom helpers.maths import double\n\ndef test_greeting():\n    assert greet("Ada") == "Hello, Ada"\n    assert double(3) == 6\n' },
  { path: 'README.md', content: '# My Python class\n\nSmall reusable functions with tests.' },
];
afterEach(() => vi.unstubAllGlobals());

describe('in-app file analysis', () => {
  it('builds the same real Python graph, DNA, README and quality measurements without GitHub metadata', () => {
    const profile = analyzeFiles(files, 'Ada’s Python class');
    expect(profile).not.toBeInstanceOf(Promise);
    expect(profile.slug).toBe('Ada’s Python class');
    expect(profile.primaryLanguage).toBe('Python');
    expect(profile.totalFiles).toBe(3); expect(profile.totalLoc).toBe(13);
    expect(profile.components.map(c => c.name).sort()).toEqual(['helpers', 'root', 'tests']);
    expect(profile.edges.map(([a, b]) => [profile.components[a].name, profile.components[b].name])).toEqual(expect.arrayContaining([['root', 'helpers'], ['tests', 'helpers'], ['tests', 'root']]));
    expect(profile.heart).toBe('helpers/maths.py'); expect(profile.heartFanIn).toBe(2);
    expect(profile.maxDepth).toBe(2); expect(profile.testRatio).toBeCloseTo(1 / 3);
    expect(profile.dna?.identifiers).toEqual(expect.arrayContaining(['greet', 'double', 'test_greeting']));
    expect(profile.dna?.counts.functions).toBe(3);
    expect(profile.dna?.snippets.some(snippet => snippet.file === 'main.py')).toBe(true);
    expect(profile.readme).toContain('Small reusable functions with tests.');
    expect(profile.tree).toEqual(expect.arrayContaining(['main.py', 'helpers/', 'tests/', 'README.md']));
    const quality = qualitySignalsFromProfile(profile);
    expect(quality.hasTestDir).toBe(true); expect(quality.hasReadme).toBe(true);
    expect(quality.avgFunctionLength).toBeGreaterThan(0); expect(quality.commentRatio).toBeGreaterThan(0);
    expect([profile.stars, profile.commits, profile.contributors, profile.ageDays]).toEqual([0, 0, 0, 0]);
    expect(profile.fallback).toBeUndefined(); expect(profile.vulns).toBeUndefined(); expect(profile.busFactor).toBeUndefined();
  });
  it('does not make requests or execute submitted source and reads fresh edits instead of a name cache', () => {
    const fetcher = vi.fn(() => { throw new Error('In-app analysis must stay offline'); });
    vi.stubGlobal('fetch', fetcher);
    const starter = [{ path: 'main.py', content: '# TODO: add a greeting\npass\n' }];
    const initial = analyzeFiles(starter, 'in-app');
    const submitted = [{ path: 'main.py', content: 'import os\nos.system("this code must never execute")\ndef greet(name):\n    return "Hello, " + name\n' }];
    const edited = analyzeFiles(submitted, 'in-app');
    expect(fetcher).not.toHaveBeenCalled();
    expect(initial.dna?.counts.todo).toBe(1); expect(initial.dna?.counts.functions).toBe(0);
    expect(edited.dna?.counts.todo).toBe(0); expect(edited.dna?.counts.functions).toBe(1);
    expect(edited.seed).toBe(initial.seed); expect(edited.totalLoc).toBeGreaterThan(initial.totalLoc);
    expect(starter[0].content).toBe('# TODO: add a greeting\npass\n');
  });
  it('keeps manifests as graph context and applies the repository pipeline exclusions', () => {
    const profile = analyzeFiles([
      { path: 'package.json', content: '{"name":"local-lesson","dependencies":{"unsafe":"1.0.0"}}' },
      { path: 'main.py', content: 'print("你好 🌋")' },
      { path: 'node_modules/foreign/main.py', content: 'def ignored(): pass' },
      { path: 'vendor/foreign.py', content: 'def ignored(): pass' },
      { path: 'dist/main.py', content: 'def ignored(): pass' },
      { path: 'image.png', content: 'not source code' },
    ], 'in-app');
    expect(profile.totalFiles).toBe(1);
    expect(profile.languages.Python).toBe(Buffer.byteLength('print("你好 🌋")', 'utf8'));
    expect(profile.tree).toEqual(['package.json', 'main.py']);
    expect(profile.dna?.counts.functions).toBe(0);
    expect(profile.vulns).toBeUndefined();
  });
  it('handles empty starter files and readme-only drafts without inventing code or a fallback', () => {
    const empty = analyzeFiles([], '');
    expect(empty.slug).toBe('in-app'); expect(empty.totalFiles).toBe(0); expect(empty.totalLoc).toBe(0);
    expect(empty.components).toEqual([]); expect(empty.edges).toEqual([]);
    expect(empty.dna?.identifiers).toEqual([]); expect(empty.fallback).toBeUndefined();
    const starter = analyzeFiles([{ path: 'main.py', content: '' }], 'in-app');
    expect(starter.primaryLanguage).toBe('Unknown'); expect(starter.heart).toBe('main.py');
    expect(starter.totalFiles).toBe(1); expect(starter.totalLoc).toBe(0);
    const docs = analyzeFiles([{ path: 'README.md', content: '# Lesson\nOnly documentation so far.' }], 'in-app');
    expect(docs.readme).toContain('Only documentation'); expect(docs.totalFiles).toBe(0);
  });
  it('produces detached deterministic profiles across file order and is exported from the public entrypoint', async () => {
    const a = analyzeFiles(files, 'in-app');
    const b = analyzeFiles([...files].reverse(), 'in-app');
    expect(a).toEqual(b); expect(a.seed).toBe(fnv1a('in-app'));
    a.components[0].name = 'changed'; a.dna!.identifiers.length = 0;
    expect(analyzeFiles(files, 'in-app')).toEqual(b);
    const publicApi = await import('./index.ts');
    expect(publicApi.analyzeFiles).toBe(analyzeFiles);
  });
});
