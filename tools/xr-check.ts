/** npx tsx tools/xr-check.ts [--frames 180] [--headed] [--local-only]
 * Owned ephemeral Vite only; no shared/dev/live server or gameplay mutation. */
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), frameArg = args.indexOf('--frames');
const frames = frameArg < 0 ? 180 : Number(args[frameArg + 1]);
assert(Number.isInteger(frames) && frames >= 30 && frames <= 10000, '--frames must be30–10000');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
assert.equal(pkg.devDependencies.iwer, '2.5.0', 'XR check requires exact pinned iwer2.5.0');
const output = join(root, 'docs/shots', `${new Date().toISOString().replace(/[:.]/g, '-')}-xr-check`);
mkdirSync(output, { recursive: true });
const server = await createServer({ root, configFile: false, envDir: false, cacheDir: join(output, '.vite'), appType: 'custom', mode: 'test',
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
  plugins: [{ name: 'xr-check-fixture', configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/__xr-check')) return next();
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body style="margin:0;background:#071015;color:white"><button id="enter">Enter emulated XR</button><script type="module" src="/tools/xr-fixture.ts"></script></body></html>');
    });
  } }],
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const errors: string[] = [], logs: string[] = [];
let pass = false, failure: string | undefined, evidence: any;
try {
  await server.listen();
  const address = server.httpServer!.address(); assert(address && typeof address !== 'string');
  browser = await chromium.launch({ headless: !args.includes('--headed'),
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/chromium'),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { logs.push(`${message.type()}: ${message.text()}`); if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${address.port}/__xr-check${args.includes('--local-only') ? '?local-only' : ''}`);
  await page.waitForFunction(() => (window as any).__xrCheck?.state.supported);
  await page.click('#enter');
  await page.waitForFunction(() => { const s = (window as any).__xrCheck.state; return s.presenting || s.error; });
  assert.equal(await page.evaluate(() => (window as any).__xrCheck.state.error), '');
  await page.waitForFunction(n => (window as any).__xrCheck.state.frames >= n, frames, { timeout: 90000 });
  await page.evaluate(() => (window as any).__xrCheck.select());
  await page.waitForFunction(() => (window as any).__xrCheck.state.selects > 0);
  await page.evaluate(() => (window as any).__xrCheck.transientSelect());
  await page.waitForFunction(() => (window as any).__xrCheck.state.transientSelects > 0);
  await page.evaluate(() => (window as any).__xrCheck.hide());
  await page.waitForFunction(() => (window as any).__xrCheck.state.visibility.includes('hidden'));
  const hiddenFrame = await page.evaluate(() => (window as any).__xrCheck.state.frames);
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => (window as any).__xrCheck.state.frames), hiddenFrame, 'hidden session must pause rendering');
  await page.evaluate(() => (window as any).__xrCheck.show());
  await page.waitForFunction(n => (window as any).__xrCheck.state.frames > n, hiddenFrame);
  await page.evaluate(() => (window as any).__xrCheck.setScale('life'));
  assert.equal(await page.evaluate(() => (window as any).__xrCheck.state.placement.position.y), 0);
  await page.evaluate(() => (window as any).__xrCheck.setScale('table'));
  await page.screenshot({ path: join(output, 'emulated-xr.png') });
  const screenBeforeExit = await page.evaluate(() => (window as any).__xrCheck.state.screenFrames);
  await page.evaluate(() => (window as any).__xrCheck.stop());
  await page.waitForFunction(n => (window as any).__xrCheck.state.ended === 1 && (window as any).__xrCheck.state.screenFrames > n + 2, screenBeforeExit);
  evidence = await page.evaluate(() => (window as any).__xrCheck.state);
  assert(evidence.frames >= frames); assert.equal(evidence.views, 2);
  assert.equal(evidence.reference, args.includes('--local-only') ? 'local' : 'local-floor');
  assert(evidence.textureStable && evidence.poolBuffersStable);
  assert(evidence.viewerHeight > 1.4 && evidence.viewerHeight < 1.8, 'local fallback must preserve an estimated floor below the viewer');
  assert(evidence.selects >= 2 && evidence.transientSelects >= 1);
  await page.evaluate(() => (window as any).__xrCheck.destroy());
  assert.equal(errors.length, 0, errors.join('\n')); pass = true;
} catch (error) { failure = String(error); process.exitCode = 1; }
finally {
  const sorted = evidence?.times?.slice().sort((a: number, b: number) => a - b) ?? [];
  const mean = sorted.reduce((sum: number, n: number) => sum + n, 0) / (sorted.length || 1);
  const renderTimes = evidence?.renderTimes?.slice().sort((a: number, b: number) => a - b) ?? [];
  const timing = { samples: sorted.length, meanMs: mean, medianMs: sorted[Math.floor(sorted.length * 0.5)], p95Ms: sorted[Math.floor(sorted.length * 0.95)], emulatedFps: mean ? 1000 / mean : 0,
    renderCpuMedianMs: renderTimes[Math.floor(renderTimes.length * 0.5)], renderCpuP95Ms: renderTimes[Math.floor(renderTimes.length * 0.95)] };
  writeFileSync(join(output, 'summary.json'), JSON.stringify({ pass, failure, emulator: 'iwer2.5.0', three: pkg.dependencies.three, frames, timing, errors, evidence,
    proof: 'Real three WebGLRenderer + owned projection/XR/pool modules + IWER stereo session; tools fixture geometry, not game/gallery/performance or physical Vision Pro acceptance' }, null, 2));
  writeFileSync(join(output, 'console.log'), logs.join('\n'));
  await browser?.close(); await server.close();
  console.log(JSON.stringify({ output, pass, failure, frames: evidence?.frames, timing, errors }, null, 2));
}
