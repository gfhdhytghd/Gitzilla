import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const worker = fileURLToPath(new URL('./py-worker.mjs', import.meta.url));
const unavailable = 'doctest runner unavailable on this server';
let available: boolean | undefined;
function args(): string[] {
  const dir = dirname(createRequire(import.meta.url).resolve('pyodide/package.json'));
  return ['--permission', `--allow-fs-read=${dir}`, `--allow-fs-read=${worker}`, '--max-old-space-size=256', worker];
}
export function doctestAvailable(): boolean {
  if (process.env.GITZILLA_DOCTEST === '0') return false;
  if (available !== undefined) return available;
  try {
    const probe = spawnSync(process.execPath, args(), { env: {}, input: JSON.stringify({ files: [], checks: [] }), encoding: 'utf8', timeout: 20000, killSignal: 'SIGKILL', maxBuffer: 8192 });
    return available = !probe.error && probe.status === 0 && probe.stdout.trim() === '{"ready":true}';
  } catch { return available = false; }
}
export interface DoctestResult { passed: boolean; detail: string; examples?: { passed: number; total: number } }
export async function runDoctests(files: { path: string; text: string }[], checks: { id: string; path: string; text?: string }[], options: { exampleCounts?: boolean; excludeConstantExamples?: boolean } = {}): Promise<Record<string, DoctestResult>> {
  const results: Record<string, DoctestResult> = Object.create(null);
  if (!checks.length) return results;
  if (!doctestAvailable()) { for (const c of checks) results[c.id] = { passed: false, detail: unavailable }; return results; }
  try { return await new Promise<Record<string, DoctestResult>>(resolve => {
    const child = spawn(process.execPath, args(), { env: {}, stdio: ['pipe', 'pipe', 'pipe'] });
    let pending = '', bytes = 0, stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 20000);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      // Only trusted protocol records belong here; Python output is bounded in the worker.
      if (bytes > checks.length * 2048 + 8192) { child.kill('SIGKILL'); return; }
      pending += chunk;
      let end: number;
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, end); pending = pending.slice(end + 1);
        try {
          const r = JSON.parse(line);
          if (checks.some(c => c.id === r.id) && typeof r.passed === 'boolean' && typeof r.detail === 'string') results[r.id] = { passed: r.passed, detail: r.detail.slice(0, 300),
            ...(options.exampleCounts && Number.isInteger(r.examples?.passed) && Number.isInteger(r.examples?.total) && (r.examples.total > 0 || (options.excludeConstantExamples && r.examples.total === 0)) && r.examples.passed >= 0 && r.examples.passed <= r.examples.total ? { examples: { passed: r.examples.passed, total: r.examples.total } } : {}) };
        } catch { /* Startup diagnostics are not check results. */ }
      }
    });
    child.stderr.on('data', (s: string) => { stderr = (stderr + s).slice(0, 8192); });
    const finish = () => {
      clearTimeout(timer);
      for (const c of checks) if (!results[c.id]) results[c.id] = { passed: false, detail: timedOut ? 'timed out (limit 20 s for all doctest checks)' : unavailable };
      resolve(results);
    };
    child.once('error', finish); child.once('close', finish);
    child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify({ files, checks, exampleCounts: options.exampleCounts === true, excludeConstantExamples: options.excludeConstantExamples === true }));
  }); } catch {
    for (const c of checks) if (!results[c.id]) results[c.id] = { passed: false, detail: unavailable };
    return results;
  }
}
