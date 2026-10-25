import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

it('analyzes 200 KiB blank-line submissions within a killable process deadline', async () => {
  // A Vitest timeout cannot interrupt a synchronous regexp. Kill only this dedicated child if it stalls.
  const script = `
    import assert from 'node:assert/strict';
    import { analyzeFiles } from ${JSON.stringify(new URL('./in-app.ts', import.meta.url).href)};
    import { declaredDependencies } from ${JSON.stringify(new URL('./dependencies.ts', import.meta.url).href)};
    const budget = 200 * 1024;
    const results = [];
    function analyze(label, files) {
      const bytes = files.reduce((sum, f) => sum + Buffer.byteLength(f.path) + Buffer.byteLength(f.content), 0);
      assert.ok(bytes <= budget);
      const start = performance.now();
      const profile = analyzeFiles(files, 'in-app');
      assert.equal(profile.fallback, undefined);
      results.push({ label, bytes, ms: performance.now() - start });
      return profile;
    }
    for (const [label, unit] of [['LF', '\\n'], ['CRLF', '\\r\\n'], ['indented LF', ' \\t\\n']]) {
      const content = unit.repeat(Math.floor((budget - 4) / unit.length));
      const profile = analyze(label, [{ path: 'a.py', content }]);
      assert.equal(profile.totalFiles, 1);
      assert.equal(profile.totalLoc, 0);
      assert.deepEqual(profile.edges, []);
      assert.equal(profile.dna.counts.functions, 0);
      assert.deepEqual(profile.dna.heartLines, []);
    }
    const padding = '\\n'.repeat(100000);
    const imports = analyze('padded imports', [
      { path: 'a.py', content: padding + '# import ghost\\nimport b\\nfrom b import (\\n    value,\\n)\\n' + padding },
      { path: 'b.py', content: 'value = 42\\n' },
      { path: 'ghost.py', content: 'phantom = 0\\n' },
    ]);
    assert.equal(imports.heart, 'b.py');
    assert.equal(imports.heartFanIn, 1);
    assert.equal(imports.totalLoc, 7);
    const readme = analyze('blank README', [{ path: 'README.md', content: '\\n'.repeat(budget - 9) }]);
    assert.equal(readme.totalFiles, 0);
    assert.equal(readme.readme, '');
    const module = analyze('blank Go manifest', [{ path: 'go.mod', content: '\\n'.repeat(budget - 6) }]);
    assert.equal(module.totalFiles, 0);
    assert.deepEqual(declaredDependencies([{ path: 'go.mod', text: '\\n'.repeat(budget - 6) }], module), []);
    const toml = analyze('padded Cargo manifest', [{ path: 'Cargo.toml', content: '[package]\\n' + '\\n'.repeat(budget - 20) }]);
    assert.equal(toml.totalFiles, 0);
    assert.deepEqual(declaredDependencies([{ path: 'Cargo.lock', text: '[[package]]\\n' + '\\n'.repeat(budget - 100) + 'source="registry+https://github.com/rust-lang/crates.io-index"' }], toml), []);
    console.log(JSON.stringify(results));
  `;
  const { stdout } = await execFileAsync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), timeout: 7500, killSignal: 'SIGKILL', maxBuffer: 16 * 1024,
  });
  const results = JSON.parse(stdout) as { label: string; bytes: number; ms: number }[];
  expect(results.map(result => result.label)).toEqual(['LF', 'CRLF', 'indented LF', 'padded imports', 'blank README', 'blank Go manifest', 'padded Cargo manifest']);
  expect(results[0].bytes).toBe(200 * 1024);
  expect(results.every(result => Number.isFinite(result.ms))).toBe(true);
}, 10000);
