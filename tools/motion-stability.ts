/** Exactly five sequential runs, fail-fast; no hidden retries or lucky-pass selection. */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
import { playtestBaseURL } from './playtest';
import { requireMotionFixtureEnvironment } from './motion-fixture';
requireMotionFixtureEnvironment();
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'docs/shots', `${new Date().toISOString().replace(/[:.]/g, '-')}-motion-stability`);
mkdirSync(output, { recursive: true });
const appBase = playtestBaseURL(process.env.MOTION_URL || process.env.PLAYTEST_URL);
const runs: Record<string, unknown>[] = [];
let pass = false, failure: string | undefined;
try {
  for (let run = 1; run <= 5; run++) {
    const child = spawn(process.execPath, ['--import', 'tsx', 'tools/motion-v3.ts'], { cwd: root,
      env: { ...process.env, NODE_ENV: 'test', MOTION_URL: appBase, MOTION_COMBAT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += String(data); }); child.stderr.on('data', data => { stderr += String(data); });
    const code = await new Promise<number | null>((done, reject) => { child.once('error', reject); child.once('close', done); });
    writeFileSync(join(output, `run-${run}.log`), stdout + '\nSTDERR\n' + stderr);
    const marker = stdout.lastIndexOf('\n{\n  "output":');
    const result = marker >= 0 ? JSON.parse(stdout.slice(marker + 1)) : null;
    runs.push({ run, code, ...result });
    assert.equal(code, 0, `run${run} failed; see run-${run}.log`);
    assert(result?.pass && result?.output, `run${run}: missing PASS artifact`);
    const summary = JSON.parse(readFileSync(join(result.output, 'summary.json'), 'utf8'));
    assert(summary.deterministicFixture && summary.deterministicFixture.productionEnabled === false);
    assert.equal(summary.starts.length, 1); assert(summary.player.alive);
    assert(summary.checks.filter((c: any) => c.check.startsWith('any-axis swing') || c.check.startsWith('iOS null acceleration'))
      .every((c: any) => c.evidence.alive && c.evidence.newOwnBullets > 0));
    assert.equal(summary.errors.length, 0);
    console.log(`PASS ${run}/5: ${result.checks} checks, ${result.snapshots} snapshots, ${result.inputs} inputs; ${result.output}`);
  }
  pass = true;
} catch (error) { failure = String(error); process.exitCode = 1; }
finally {
  writeFileSync(join(output, 'summary.json'), JSON.stringify({ pass, failure, appBase, requiredConsecutivePasses: 5, consecutivePasses: pass ? 5 : runs.filter(r => r.pass).length,
    backend: 'real isolated RoomServer/simulation with tools-only invulnerability, staging frontend proxied unchanged', runs }, null, 2));
  console.log(JSON.stringify({ output, pass, failure, consecutivePasses: pass ? 5 : runs.filter(r => r.pass).length }, null, 2));
}
