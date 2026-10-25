/** npx tsx tools/usdz-size.ts --baseline .cache/usdz-size-before [--measure-only] */
import { strict as assert } from 'node:assert';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { unzipSync } from 'three/addons/libs/fflate.module.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), baselineArg = args.indexOf('--baseline');
assert(baselineArg >= 0 && args[baselineArg + 1], 'pass --baseline <captured before-source directory>');
const baseline = resolve(root, args[baselineArg + 1]);
assert(!relative(root, baseline).startsWith('..') && existsSync(join(baseline, 'spatial.ts')), 'baseline must be a captured directory inside this checkout');
const output = join(root, 'docs/shots', `${new Date().toISOString().replace(/[:.]/g, '-')}-usdz-size`);
mkdirSync(output, { recursive: true });
mkdirSync(join(output, 'baseline-code'));
for (const file of ['spatial.ts', 'spatial-voxel.ts']) writeFileSync(join(output, 'baseline-code', file), readFileSync(join(baseline, file)));
const vite = await createServer({ root, configFile: false, envDir: false, appType: 'custom', cacheDir: join(output, '.vite'),
  optimizeDeps: { noDiscovery: true, include: ['three', 'iwer', 'three/addons/exporters/USDZExporter.js'] },
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }, plugins: [{ name: 'usdz-bench', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/favicon.ico') { res.statusCode = 204; res.end(); return; }
      if (req.url?.split('?')[0] !== '/client/render/stage25d/gallery.html') return next();
      res.setHeader('Content-Type', 'text/html'); res.end(readFileSync(join(root, 'client/render/stage25d/gallery.html'), 'utf8'));
    });
  } }] });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let results: any, pass = false, failure: string | undefined;
const errors: string[] = [];
try {
  await vite.listen(); const address = vite.httpServer!.address(); assert(address && typeof address !== 'string');
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/chromium'), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/client/render/stage25d/gallery.html?scene=raid&vox=1&scale=2&boss=pallets/flask`);
  await page.waitForFunction(() => (window as any).__stats?.frames >= 10);
  results = await page.evaluate(async path => {
    const modulePath = '/tools/usdz-fixture.ts'; const { benchmark } = await import(modulePath);
    return benchmark(path);
  }, `/@fs/${join(baseline, 'spatial.ts')}`);
  for (const name of ['before', 'after']) {
    const result = results[name];
    writeFileSync(join(output, `${name}.png`), Buffer.from(result.image.split(',')[1], 'base64')); delete result.image;
    const pending = page.waitForEvent('download');
    await page.evaluate(({ url, name }) => { const a = document.createElement('a'); a.href = url; a.download = `${name}.usdz`; a.click(); }, { url: result.url, name });
    await (await pending).saveAs(join(output, `${name}.usdz`));
    await page.evaluate(url => URL.revokeObjectURL(url), result.url); delete result.url;
    const entries = unzipSync(new Uint8Array(readFileSync(join(output, `${name}.usdz`))));
    for (const [file, bytes] of Object.entries(entries)) if (file.endsWith('.usda')) {
      assert(new TextDecoder().decode(bytes.subarray(0, 10)).startsWith('#usda 1.0'), 'USD magic/version must remain valid');
    }
    result.largestEntries = Object.entries(entries).map(([file, bytes]) => ({ file, bytes: bytes.length })).sort((a, b) => b.bytes - a.bytes).slice(0, 5);
    result.medianMs = result.timesMs.slice().sort((a: number, b: number) => a - b)[1];
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  assert(results.after.coloredMeshes >= 5, 'boss and four heroes must remain colored 3D geometry');
  assert.equal(results.after.coloredMeshes, results.before.coloredMeshes, 'retain every colored actor');
  if (!args.includes('--measure-only')) assert(results.after.bytes < 5_000_000, 'typical raid preview must stay under5MB');
  pass = true;
} catch (error) { process.exitCode = 1; failure = String(error); }
finally {
  writeFileSync(join(output, 'summary.json'), JSON.stringify({ pass, failure, baseline, sameFrozenScene: true, warmRuns: 3, results, errors,
    proof: 'Real gallery raid exported twice from identical frozen source; rendered before/after mesh comparison. Software Chromium timing, not native Vision Pro validation.' }, null, 2));
  await browser?.close(); await vite.close(); console.log(JSON.stringify({ output, pass, failure, results, errors }, null, 2));
}
