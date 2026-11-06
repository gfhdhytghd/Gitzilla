import { describe, expect, it } from 'vitest';
import { doctestAvailable, runDoctests } from './py-sandbox';
const available = doctestAvailable();
if (!available) console.warn('SKIP real Pyodide checks: doctest runner unavailable on this server (package/permission startup probe failed or GITZILLA_DOCTEST=0)');
const run = (text: string, examples?: string) => runDoctests([{ path: 'main.py', text }], [{ id: 'a', path: 'main.py', text: examples }]);
describe('real isolated Pyodide doctests', () => {
  it.skipIf(!available)('passes provided examples and module docstrings, fails zero examples', async () => {
    expect((await run('answer = 42', '>>> answer\n42')).a).toEqual({ passed: true, detail: '1/1 examples passed' });
    expect((await run('"""\n>>> 2 + 2\n4\n"""')).a.passed).toBe(true);
    expect((await run('answer = 42')).a).toEqual({ passed: false, detail: 'no doctest examples found' });
  }, 60000);
  it.skipIf(!available)('reports the first failing source, expected output and actual output', async () => {
    const r = (await run('answer = 41', '>>> answer\n42')).a;
    expect(r.passed).toBe(false); expect(r.detail).toContain('answer'); expect(r.detail).toContain('42'); expect(r.detail).toContain('41');
    expect(r.detail.length).toBeLessThanOrEqual(300); expect(r.detail).not.toMatch(/[\r\n]/);
    const doc = (await run('"""\n>>> 1\n2\n"""')).a; expect(doc.passed).toBe(false); expect(doc.detail).toContain('source:');
  }, 60000);
  it.skipIf(!available)('reports module import errors and blocks all JS bridge names', async () => {
    expect((await run('raise ValueError("bad import")', '>>> 1\n1')).a).toEqual({ passed: false, detail: 'ValueError: bad import' });
    for (const name of ['js', 'pyodide_js', '_pyodide', 'pyodide']) {
      const r = (await run(`import ${name}`, '>>> 1\n1')).a;
      expect(r.passed).toBe(false); expect(r.detail).toMatch(/ImportError|ModuleNotFoundError/);
    }
  }, 120000);
  it.skipIf(!available)('cannot read host files or list the real root and gives stdin EOF', async () => {
    const r = await run('import os\n', ">>> open('/etc/passwd').read()\nsecret\n");
    expect(r.a.passed).toBe(false); expect(r.a.detail).toContain('FileNotFoundError');
    // Emscripten's memory FS has its own /proc, /dev and /home; host directories must not be reachable.
    expect((await run('import os', ">>> os.path.exists('/usr'), os.path.exists('/etc'), os.path.exists('/home/wilf'), os.getcwd()\n(False, False, False, '/student')")).a.passed).toBe(true);
    expect((await run('import sys', ">>> sys.stdin.read()\n''")).a.passed).toBe(true);
  }, 90000);
  it.skipIf(!available)('uses fresh modules, preserves earlier results and kills an infinite loop', async () => {
    const results = await runDoctests([{ path: 'ok.py', text: 'x = 1' }, { path: 'loop.py', text: 'while True: pass' }], [
      { id: 'first', path: 'ok.py', text: '>>> x\n1\n>>> x = 99' },
      { id: 'fresh', path: 'ok.py', text: '>>> x\n1' }, { id: 'loop', path: 'loop.py' }, { id: 'later', path: 'ok.py' },
    ]);
    expect(results.first.passed).toBe(true); expect(results.fresh.passed).toBe(true);
    for (const id of ['loop', 'later']) expect(results[id]).toEqual({ passed: false, detail: 'timed out (limit 20 s for all doctest checks)' });
  }, 30000);
});
it('fails closed when disabled', async () => {
  const old = process.env.GITZILLA_DOCTEST; process.env.GITZILLA_DOCTEST = '0';
  try {
    expect(doctestAvailable()).toBe(false);
    expect((await run('', '>>> 1\n1')).a).toEqual({ passed: false, detail: 'doctest runner unavailable on this server' });
  } finally { if (old === undefined) delete process.env.GITZILLA_DOCTEST; else process.env.GITZILLA_DOCTEST = old; }
});
