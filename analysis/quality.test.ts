import { describe, expect, it } from 'vitest';
import { profileFromFiles } from './graph.ts';
import { qualitySignalsFromProfile } from './quality.ts';

describe('classroom quality measurements', () => {
  it('measures mean function span rather than substituting the longest function', () => {
    const p = profileFromFiles('class/quality', [
      { path: 'README.md', text: '# Real project\nA small parser.' },
      { path: 'src/main.py', text: '# A real comment\ndef parse(value):\n    a = value + 1\n    b = a + 1\n    return b\n\ndef short():\n    return 1' },
      { path: 'tests/test_main.py', text: '# Test behavior\nassert True' },
    ]);
    expect(p.dna?.longestFunction?.lines).toBe(4);
    const q = qualitySignalsFromProfile(p);
    expect(q.avgFunctionLength).toBe(3); expect(q.functionsPerFile).toBe(1);
    expect(q.commentRatio).toBe(2 / p.totalLoc);
    expect(q.hasReadme).toBe(true); expect(q.readmeLength).toBe(p.readme!.length); expect(q.hasTestDir).toBe(true);
  });
  it('does not invent a test directory for a flat test filename and handles zero/no-DNA profiles', () => {
    const p = profileFromFiles('class/flat', [{ path: 'main.test.ts', text: 'export const x = 1' }]);
    expect(qualitySignalsFromProfile(p).hasTestDir).toBe(false);
    const old = { ...p, dna: undefined, readme: undefined, totalFiles: 0, totalLoc: 0 };
    expect(qualitySignalsFromProfile(old)).toMatchObject({ commentRatio: 0, functionsPerFile: 0, hasReadme: false, avgFunctionLength: undefined });
  });
  it('ignores blank lines inside documentation when calculating comment ratio', () => {
    const p = profileFromFiles('class/docs', [{ path: 'src/main.py', text: '"""Docs.\n\n\nStill docs.\n"""\nvalue = 1' }]);
    expect(qualitySignalsFromProfile(p).commentRatio).toBeLessThanOrEqual(1);
    expect(p.dna?.counts.comments).toBe(3);
  });
  it('recognizes nested tests/spec directories and keeps sensitive function names out of DNA while measuring spans', () => {
    const p = profileFromFiles('class/metrics', [{ path: 'src/__tests__/main.py', text: 'def getSecret():\n    a = 1\n    return a\n\ndef safe():\n    return 2' }]);
    expect(qualitySignalsFromProfile(p).hasTestDir).toBe(true);
    expect(qualitySignalsFromProfile(p).avgFunctionLength).toBe(2.5);
    expect(p.dna?.identifiers).not.toContain('getSecret');
  });
});
