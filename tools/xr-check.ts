/** npx tsx tools/xr-check.ts [--frames 180] [--headed] [--local-only] [--ar [--no-hit-test]] [--art]
 * Owned ephemeral Vite only; no shared/dev/live server or gameplay mutation. */
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { unzipSync } from 'three/addons/libs/fflate.module.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), frameArg = args.indexOf('--frames');
const frames = frameArg < 0 ? 180 : Number(args[frameArg + 1]);
assert(Number.isInteger(frames) && frames >= 30 && frames <= 10000, '--frames must be30–10000');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
assert.equal(pkg.devDependencies.iwer, '2.5.0', 'XR check requires exact pinned iwer2.5.0');
const output = join(root, 'docs/shots', `${new Date().toISOString().replace(/[:.]/g, '-')}-xr-check`);
mkdirSync(output, { recursive: true });
const server = await createServer({ root, configFile: false, envDir: false, cacheDir: join(output, '.vite'), appType: 'custom', mode: 'test',
  optimizeDeps: { noDiscovery: true, include: ['three', 'iwer', 'three/addons/exporters/USDZExporter.js'] },
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
  plugins: [{ name: 'xr-check-fixture', configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      if (req.url === '/favicon.ico') { res.statusCode = 204; res.end(); return; }
      if (req.url?.split('?')[0] === '/client/render/stage25d/gallery.html') {
        res.setHeader('Content-Type', 'text/html');
        res.end(readFileSync(join(root, 'client/render/stage25d/gallery.html'), 'utf8')); return;
      }
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
  const query = new URLSearchParams();
  for (const flag of ['local-only', 'ar', 'no-hit-test']) if (args.includes(`--${flag}`)) query.set(flag, '1');
  await page.goto(`http://127.0.0.1:${address.port}/__xr-check?${query}`);
  await page.waitForFunction(() => (window as any).__xrCheck?.state.supported);
  await page.click('#enter');
  await page.waitForFunction(() => { const s = (window as any).__xrCheck.state; return s.presenting || s.error; });
  assert.equal(await page.evaluate(() => (window as any).__xrCheck.state.error), '');
  await page.waitForFunction(n => (window as any).__xrCheck.state.frames >= n, frames, { timeout: 90000 });
  await page.evaluate(() => (window as any).__xrCheck.hands());
  await page.waitForFunction(() => (window as any).__xrCheck.state.handJointPoses > 2);
  assert.equal(await page.evaluate(() => (window as any).__xrCheck.state.selects), 0, 'hand joint poses must not synthesize selects');
  await page.evaluate(() => (window as any).__xrCheck.controllers());
  await page.evaluate(() => (window as any).__xrCheck.select());
  await page.waitForFunction(() => (window as any).__xrCheck.state.selects > 0);
  if (args.includes('--ar')) {
    await page.waitForFunction(() => (window as any).__xrCheck.state.surfaceStatus === 'placed');
    if (!args.includes('--no-hit-test')) await page.waitForFunction(() => (window as any).__xrCheck.state.anchored);
  }
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
  await page.waitForFunction(() => Math.abs((window as any).__xrCheck.state.rootScale - 1.7 / 28) < 0.0001);
  await page.evaluate(() => (window as any).__xrCheck.setScale('table'));
  await page.waitForFunction(() => Math.abs((window as any).__xrCheck.state.rootScale - 1.2 / 480) < 0.0001);
  await page.screenshot({ path: join(output, 'emulated-xr.png') });
  const usdz = await page.evaluate(() => (window as any).__xrCheck.exportUSDZ()) as number[];
  const archive = unzipSync(new Uint8Array(usdz));
  assert(Object.keys(archive).some(name => name.startsWith('geometries/')));
  assert(Object.keys(archive).some(name => name.startsWith('textures/')), 'textured floor must be present in the actual export');
  writeFileSync(join(output, 'snapshot.usdz'), new Uint8Array(usdz));
  const screenBeforeExit = await page.evaluate(() => (window as any).__xrCheck.state.screenFrames);
  await page.evaluate(() => (window as any).__xrCheck.stop());
  await page.waitForFunction(n => (window as any).__xrCheck.state.ended === 1 && (window as any).__xrCheck.state.screenFrames > n + 2, screenBeforeExit);
  evidence = await page.evaluate(() => (window as any).__xrCheck.state);
  assert(evidence.frames >= frames); assert.equal(evidence.views, 2);
  assert.equal(evidence.reference, args.includes('--local-only') ? 'local' : 'local-floor');
  assert(evidence.textureStable && evidence.poolBuffersStable);
  assert(evidence.viewerHeight > 1.4 && evidence.viewerHeight < 1.8, 'local fallback must preserve an estimated floor below the viewer');
  assert(evidence.selects >= 2 && evidence.transientSelects >= 1);
  assert(evidence.handFrames > 2 && evidence.handJointPoses > 2);
  assert.equal(evidence.mode, args.includes('--ar') ? 'immersive-ar' : 'immersive-vr');
  if (args.includes('--ar')) {
    assert.equal(evidence.surfaceSource, args.includes('--no-hit-test') ? 'estimated-plane' : 'hit-test');
    assert(Math.abs(evidence.surfaceY - (args.includes('--no-hit-test') ? 0.9 : 0.75)) < 0.005);
  }
  await page.evaluate(() => (window as any).__xrCheck.destroy());
  if (args.includes('--art')) {
    // Read the real owner's gallery through this owned listener; never edit its
    // scene or drive gameplay/server inputs. Export the current populated root.
    await page.goto(`http://127.0.0.1:${address.port}/client/render/stage25d/gallery.html?scene=raid&vox=1&scale=2`);
    await page.waitForFunction(() => (window as any).__stage?.debugScene?.children.length > 0);
    await page.waitForTimeout(500);
    const art = await page.evaluate(async () => {
      const path = '/client/render/stage25d/spatial.ts';
      const { prepareSpatialSnapshot, exportSpatialUSDZ } = await import(path);
      const stage = (window as any).__stage;
      const root = stage.debugScene.children.find((object: any) => object.isGroup);
      const snapshot = prepareSpatialSnapshot(root, { metersPerPixel: 1.2 / 480 });
      const meshes = snapshot.root.children.length;
      const coloredMeshes = snapshot.root.children.filter((mesh: any) => mesh.geometry.getAttribute('color')).length;
      snapshot.dispose();
      const blob = await exportSpatialUSDZ(root, { metersPerPixel: 1.2 / 480 });
      return { meshes, coloredMeshes, bytes: blob.size, url: URL.createObjectURL(blob) };
    });
    assert(art.meshes > 4 && art.coloredMeshes >= 5, 'current boss and four heroes must bake as colored geometry');
    const downloadPending = page.waitForEvent('download');
    await page.evaluate(url => {
      const a = document.createElement('a'); a.href = url; a.download = 'arena-boss.usdz'; a.click();
    }, art.url);
    const download = await downloadPending; await download.saveAs(join(output, 'arena-boss.usdz'));
    await page.evaluate(url => URL.revokeObjectURL(url), art.url);
    evidence.art = { meshes: art.meshes, coloredMeshes: art.coloredMeshes, bytes: art.bytes,
      source: 'actual gallery raid scene/root, current boss + heroes; export snapshot only' };
    await page.screenshot({ path: join(output, 'arena-export-source.png') });
    await page.evaluate(() => (window as any).__stage.destroy());
  }
  assert.equal(errors.length, 0, errors.join('\n')); pass = true;
} catch (error) { failure = String(error); process.exitCode = 1; }
finally {
  const sorted = evidence?.times?.slice().sort((a: number, b: number) => a - b) ?? [];
  const mean = sorted.reduce((sum: number, n: number) => sum + n, 0) / (sorted.length || 1);
  const renderTimes = evidence?.renderTimes?.slice().sort((a: number, b: number) => a - b) ?? [];
  const timing = { samples: sorted.length, meanMs: mean, medianMs: sorted[Math.floor(sorted.length * 0.5)], p95Ms: sorted[Math.floor(sorted.length * 0.95)], emulatedFps: mean ? 1000 / mean : 0,
    renderCpuMedianMs: renderTimes[Math.floor(renderTimes.length * 0.5)], renderCpuP95Ms: renderTimes[Math.floor(renderTimes.length * 0.95)] };
  writeFileSync(join(output, 'summary.json'), JSON.stringify({ pass, failure, emulator: 'iwer2.5.0', three: pkg.dependencies.three, frames, timing, errors, evidence,
    proof: 'Real three WebGLRenderer + owned projection/XR/spatial/pool modules + IWER stereo session. AR uses an explicit synthetic0.75m table via public SEM interface and real IWER hit-test/anchor APIs; no physical passthrough/surface sensing. Native model rendering unavailable in Chromium; USDZ archive export is verified. Tools geometry, not game/gallery/performance or Vision Pro acceptance.' }, null, 2));
  writeFileSync(join(output, 'console.log'), logs.join('\n'));
  await browser?.close(); await server.close();
  console.log(JSON.stringify({ output, pass, failure, frames: evidence?.frames, timing, errors }, null, 2));
}
