import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RepoProfile, Rubric, RubricCriterion } from '../shared/types.ts';
import { buildFeedback, defaultRubric, parseRubric, scoreRepo, weightedScore } from './index.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.md`, import.meta.url), 'utf8');
const profiles = readdirSync(new URL('../data/fallback/', import.meta.url)).filter(name => name.endsWith('.json')).map(name => JSON.parse(readFileSync(new URL(`../data/fallback/${name}`, import.meta.url), 'utf8')) as RepoProfile);
const flask = profiles.find(p => p.slug === 'pallets/flask')!;
const rubricFor = (criteria: Partial<RubricCriterion>[]): Rubric => ({ title: 'Test rubric', source: 'doc', criteria: criteria.map((c, i) => ({ id: `${i}`, name: 'Test criterion', weight: 1, signal: 'tests', description: '', ...c })) });

describe('teacher rubric document parsing', () => {
  it('parses the intro-CS document, normalizes weights, and preserves human-only criteria', () => {
    const r = parseRubric(fixture('intro-cs'), 'intro.md');
    expect(r.title).toBe('Intro CS Project Rubric'); expect(r.source).toBe('doc');
    expect(r.criteria).toHaveLength(6);
    expect(r.criteria.map(c => c.signal)).toEqual(['tests', 'documentation', 'check', 'check', 'check', 'check']);
    expect(r.criteria[0]).toMatchObject({ name: 'Testing', weight: 0.3, target: 0.2 });
    expect(r.criteria[1].weight).toBe(0.2);
    expect(r.criteria.slice(2).map(c => c.check)).toEqual([
      { kind: 'max-file-loc', value: 300 }, { kind: 'path-exists', value: 'tests/' },
      { kind: 'min-commits', value: 10 }, { kind: 'language', value: 'Python' },
    ]);
    expect(r.unparsed).toEqual(['- Demo clarity: explain one design decision to the class.']);
  });
  it('handles Markdown tables, keeps table weights distinct from measured targets', () => {
    const r = parseRubric(fixture('web-app'));
    expect(r.criteria).toHaveLength(7);
    expect(r.criteria.map(c => c.signal)).toEqual(['tests', 'modularity', 'function-length', 'ci', 'readme', 'license', 'typing']);
    expect(r.criteria.map(c => c.target)).toEqual([0.25, 3, 40, undefined, 1200, undefined, 0.8]);
    expect(r.criteria[0].weight).toBe(0.25);
    expect(r.unparsed).toEqual(['Accessibility: demonstrate keyboard navigation for the live app.']);
  });
  it('reads label percentages as weights while preserving explicit percentage targets', () => {
    const r = parseRubric('Testing 60%\nDocumentation — 40%: comments\nREADME: target 1000 characters');
    expect(r.criteria.map(c => c.weight)).toEqual([60 / 101, 40 / 101, 1 / 101]);
    expect(r.criteria.map(c => c.target)).toEqual([undefined, undefined, 1000]);
    expect(parseRubric('Testing: target 20%').criteria[0].target).toBe(0.2);
  });
  it('parses notebook percentages, zero targets, density and language', () => {
    const r = parseRubric(fixture('data-science'));
    expect(r.criteria).toHaveLength(6);
    expect(r.criteria.map(c => c.target)).toEqual([0.15, 1000, 0.1, 0, 2, undefined]);
    expect(r.criteria.map(c => c.weight)).toEqual([0.3, 0.2, 0.2, 0.1, 0.1, 0.1]);
    expect(r.unparsed).toHaveLength(1);
  });
  it('maps all supported signals without claiming arbitrary prose is measurable', () => {
    const r = parseRubric('Unit tests\nModular architecture\nCohesion\nComments\nProject size\nCircular imports\nTODO density\nMethod length\nREADME\nCI pipeline\nLicense\nType hints\nGit history\nOriginality');
    expect(r.criteria.map(c => c.signal)).toEqual(['tests', 'modularity', 'cohesion', 'documentation', 'size', 'cycles', 'tech-debt', 'function-length', 'readme', 'ci', 'license', 'typing', 'commits']);
    expect(r.unparsed).toEqual(['Originality']);
    expect(r.criteria.reduce((n, c) => n + c.weight, 0)).toBeCloseTo(1);
  });
  it('keeps real underscored paths, negative path checks, C++ and C#', () => {
    const r = parseRubric('- Tests: must contain a `__tests__/` folder\n- Clean tree: must not contain a node_modules/ folder\n- Language: written in C++\n- Language: written in C#');
    expect(r.criteria.map(c => c.check)).toEqual([{ kind: 'path-exists', value: '__tests__/' }, { kind: 'path-absent', value: 'node_modules/' }, { kind: 'language', value: 'C++' }, { kind: 'language', value: 'C#' }]);
  });
  it('does not silently replace an unsupported or empty document with the default rubric', () => {
    expect(parseRubric('Be kind to your classmates.', 'grading.txt')).toEqual({ title: 'grading', source: 'doc', criteria: [], unparsed: ['Be kind to your classmates.'] });
    expect(parseRubric('').criteria).toEqual([]);
    expect(defaultRubric().source).toBe('default');
    const a = defaultRubric(); a.criteria[0].weight = 500; expect(defaultRubric().criteria[0].weight).toBe(0.25);
  });
  it('combines weighted criterion headings with their requirement paragraphs', () => {
    const r = parseRubric('# Course rubric\n\n## Testing (60%)\n\nAt least 20% test files.\n\n## Code style (40%)\nNo file over 300 lines.');
    expect(r.criteria).toHaveLength(2);
    expect(r.criteria[0]).toMatchObject({ name: 'Testing', signal: 'tests', target: 0.2, weight: 0.6 });
    expect(r.criteria[1]).toMatchObject({ name: 'Code style', signal: 'check', check: { kind: 'max-file-loc', value: 300 }, weight: 0.4 });
    expect(r.unparsed).toBeUndefined();
  });
});

describe('grounded repo scoring and feedback', () => {
  it.each(['intro-cs', 'web-app', 'data-science'])('scores %s against every real bundled profile', name => {
    const r = parseRubric(fixture(name));
    for (const p of profiles) {
      const before = JSON.stringify(p), results = scoreRepo(p, r);
      expect(results).toHaveLength(r.criteria.length);
      expect(results.every(row => Number.isFinite(row.score) && row.score >= 0 && row.score <= 1 && row.evidence.length > 20 && row.tip!.length > 15)).toBe(true);
      expect(weightedScore(r, results)).toBeGreaterThanOrEqual(0); expect(weightedScore(r, results)).toBeLessThanOrEqual(100);
      expect(JSON.stringify(p)).toBe(before);
    }
  });
  it('tests file ratio and binary checks use actual profile measurements', () => {
    const p = { ...flask, testRatio: 0.125, totalFiles: 48, commits: 9, tree: ['src/tests/test_parser.py', 'src/parser.py'], dna: { ...flask.dna!, bigFiles: [{ path: 'src/parser.py', loc: 301 }] } };
    const r = rubricFor([
      { signal: 'tests', target: 0.2 }, { signal: 'check', check: { kind: 'path-exists', value: 'tests/' } },
      { signal: 'check', check: { kind: 'path-absent', value: 'node_modules/' } },
      { signal: 'check', check: { kind: 'max-file-loc', value: 300 } },
      { signal: 'check', check: { kind: 'min-commits', value: 10 } },
      { signal: 'check', check: { kind: 'language', value: 'python' } },
    ]);
    const rows = scoreRepo(p, r);
    expect(rows.map(row => row.score)).toEqual([0.625, 1, 1, 0, 0, 1]);
    expect(rows[0].evidence).toContain('6 of 48'); expect(rows[0].evidence).toContain('12.5%');
    expect(rows[3].evidence).toContain('src/parser.py: 301 LOC');
  });
  it('reports actual CI/license paths and does not confuse TypeScript with type coverage', () => {
    const p = { ...flask, tree: ['.github/workflows/test.yml', 'LICENSE', 'src/parser.ts'], primaryLanguage: 'TypeScript' };
    const rows = scoreRepo(p, rubricFor([{ signal: 'ci' }, { signal: 'license' }, { signal: 'typing', target: 0.8 }]));
    expect(rows.map(row => row.score)).toEqual([1, 1, 0.5]);
    expect(rows[0].evidence).toContain('.github/workflows/test.yml'); expect(rows[1].evidence).toContain('LICENSE');
    expect(rows[2].evidence).toContain('not measured');
  });
  it('missing DNA/paths/history are explicit unknowns, never invented failing tests', () => {
    const p = { ...flask, tree: undefined, readme: undefined, dna: undefined, commits: 0 };
    const r = rubricFor([{ signal: 'function-length' }, { signal: 'cohesion' }, { signal: 'documentation' }, { signal: 'typing' }, { signal: 'ci' }, { signal: 'license' }, { signal: 'commits' }, { signal: 'check', check: { kind: 'max-file-loc', value: 300 } }]);
    expect(scoreRepo(p, r).every(row => row.score === 0.5 && row.evidence.includes('not measured'))).toBe(true);
  });
  it('distinguishes average function length from a maximum requirement', () => {
    const p = { ...flask, dna: { ...flask.dna!, avgFunctionLength: 20, longestFunction: { name: 'parse', file: 'src/parser.py', lines: 100 } } };
    const rows = scoreRepo(p, parseRubric('Average function length: under 40 lines\nNo function over 40 lines'));
    expect(rows.map(row => row.score)).toEqual([1, 0.4]);
    expect(rows[1].evidence).toContain('src/parser.py');
  });
  it('weights by criterion ID, normalizes edited weights, and handles all-zero weights', () => {
    const r = rubricFor([{ weight: 3 }, { weight: 1 }]);
    const results = [{ criterionId: '1', score: 0, evidence: 'actual' }, { criterionId: '0', score: 1, evidence: 'actual' }];
    expect(weightedScore(r, results)).toBe(75);
    r.criteria.forEach(c => { c.weight = 0; }); expect(weightedScore(r, results)).toBe(50);
    expect(weightedScore({ ...r, criteria: [] }, [])).toBe(0);
  });
  it('feedback names measured files and separates score from fighting and quiz performance', () => {
    const r = parseRubric(fixture('intro-cs')), rows = scoreRepo(flask, r);
    const stats = { playerId: 'p-ana', name: 'Ana', rank: 2, kos: 3, damage: 123.5, roundWins: 1 };
    const f = buildFeedback(flask, r, rows, stats, '2 of 3 quiz answers correct');
    expect(f).toMatchObject({ playerId: 'p-ana', name: 'Ana', repo: 'pallets/flask', match: { rank: 2, kos: 3, damage: 123.5, roundWins: 1 } });
    expect(f.match.quiz).toBe('2 of 3 quiz answers correct');
    expect(f.strengths.length).toBeGreaterThanOrEqual(1); expect(f.strengths.length).toBeLessThanOrEqual(3);
    expect(f.improvements.length).toBeGreaterThanOrEqual(1); expect(f.improvements.length).toBeLessThanOrEqual(3);
    expect(f.improvements.some(i => i.file === flask.dna!.bigFiles[0].path)).toBe(true);
    expect(f.summary).toContain('teacher review');
    expect(buildFeedback(flask, r, rows, { ...stats, rank: 1, kos: 50, damage: 9999 }, 'all correct').rubricScore).toBe(f.rubricScore);
    expect(buildFeedback(flask, r, rows, { ...stats, quiz: '1 correct' }).match.quiz).toBe('1 correct');
    f.results[0].evidence = 'changed'; expect(rows[0].evidence).not.toBe('changed');
  });
});
