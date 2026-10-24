import { describe, expect, it } from 'vitest';
import { cleanReadme, isRootReadme, notableTree, readmeFromFiles } from './context.ts';
import { profileFromFiles } from './graph.ts';
import { extractTarGz } from './tar.ts';
import { archive, splitChunks } from './fixtures.ts';

describe('Gemini repository context', () => {
  it('keeps only root README variants and prefers README.md', async () => {
    expect(isRootReadme('README.md')).toBe(true); expect(isRootReadme('readme.rst')).toBe(true);
    expect(isRootReadme('docs/README.md')).toBe(false); expect(isRootReadme('README.logo.png')).toBe(false);
    const files = await extractTarGz(splitChunks(archive([
      { path: 'README.rst', text: 'Secondary' }, { path: 'README.md', text: '# Repo identity' },
      { path: 'docs/README.md', text: 'Not the root' }, { path: 'src/main.ts', text: 'export const a = 1' },
    ])));
    expect(files.map(file => file.path)).toEqual(['README.rst', 'README.md', 'src/main.ts']);
    expect(readmeFromFiles(files)).toBe('Repo identity');
  });
  it('strips linked/reference badges, images, HTML decoration, comments and keeps prose', () => {
    const text = cleanReadme(`# **Repo Kaiju**
[![CI](https://img.shields.io/build)](https://build.example)
[![Coverage][coverage-badge]][coverage-link]
![Screenshot](https://images.example/screen.png)
<picture><source srcset="image.png"><img src="image.png"></picture>
<a href="https://badge.example"><img src="badge.svg" alt="Badge"></a>
<!-- internal banner -->
A **cooperative** monster game using [real repos](https://github.com) &amp; code.
[coverage-badge]: https://badge.example/coverage.svg
[coverage-link]: https://coverage.example
`);
    expect(text).toContain('Repo Kaiju'); expect(text).toContain('A cooperative monster game using real repos & code.');
    for (const forbidden of ['![', '<img', '<picture', 'shields.io', 'coverage.example', 'internal banner', 'screen.png', '**']) expect(text).not.toContain(forbidden);
  });
  it('limits the cleaned excerpt to 4096 UTF-8 bytes without cutting Unicode', () => {
    const result = cleanReadme('🤖'.repeat(2000));
    expect(Buffer.byteLength(result)).toBe(4096); expect(result).not.toContain('\ufffd');
    expect(cleanReadme('a'.repeat(4095) + '🤖')).toBe('a'.repeat(4095));
    expect(readmeFromFiles([])).toBe('');
  });
  it('includes directories, root metadata, the heart, largest and most-imported files within 120 unique paths', () => {
    const files = [
      { path: 'README.md', text: 'Kaiju identity' }, { path: 'package.json', text: '{}' },
      { path: 'src/heart.ts', text: 'export const heart = 1' },
      { path: 'src/big.ts', text: 'x'.repeat(20000) },
      ...Array.from({ length: 200 }, (_, i) => ({ path: `src/group${i % 50}/file${i}.ts`, text: `import '../heart'\n${i}` })),
    ];
    const p = profileFromFiles('demo/context', files);
    expect(p.readme).toBe('Kaiju identity'); expect(p.totalFiles).toBe(202);
    expect(p.tree).toHaveLength(120); expect(new Set(p.tree).size).toBe(120);
    expect(p.tree).toContain('src/'); expect(p.tree).toContain('README.md'); expect(p.tree).toContain('package.json');
    expect(p.tree).toContain('src/heart.ts'); expect(p.tree).toContain('src/big.ts');
    expect(p.tree!.filter(file => file.endsWith('/')).length).toBeLessThanOrEqual(40);
  });
  it('returns a deterministic tree for small or empty repositories without injecting file contents', () => {
    const input = [{ path: 'src/a.ts', text: 'secret source body' }];
    const graph = new Map([['src/a.ts', new Set<string>()]]);
    expect(notableTree(input, graph, 'src/a.ts')).toEqual(['src/', 'src/a.ts']);
    expect(notableTree([], new Map())).toEqual([]);
    expect(notableTree(input, graph).join('\n')).not.toContain('secret');
  });
});
