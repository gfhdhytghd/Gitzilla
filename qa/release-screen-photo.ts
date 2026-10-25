/** Exact compositor pixels, including CSS blending/filters, captured through CDP. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createBattle, startBattle, observe, until, delay } from './release-common';

const output = resolve(process.env.RELEASE_SCREEN_OUTPUT ?? 'qa/artifacts/release-bdd177c-screen-photo');
mkdirSync(output, { recursive: true });
const results: any[] = [];
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
  args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
try {
  for (const view of ['2d', '25d'] as const) {
    const dir = join(output, view); mkdirSync(dir, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await context.newPage(), traffic = observe(page);
    const moments: any[] = [];
    page.on('websocket', socket => {
      if (new URL(socket.url()).pathname !== '/ws') return;
      socket.on('framereceived', frame => {
        const m = JSON.parse(frame.payload.toString());
        if (m.t === 'snapshot') for (const e of m.state.events) if (['limbBroken', 'phase', 'downed', 'revived', 'victory', 'defeat'].includes(e.type)) {
          moments.push({ received: Date.now() / 1000, t: m.state.t, event: e.type });
        }
      });
    });
    try {
      await createBattle(page, traffic, view, 7); await startBattle(page, traffic);
      await until(() => (traffic.snapshot?.t ?? 0) >= 8, 'intro completed');
      await page.keyboard.down('KeyD'); await page.keyboard.down('KeyJ'); await delay(2200); await page.keyboard.up('KeyD');
      const rect = await page.locator('.stage').boundingBox();
      if (!rect) throw new Error('Missing visible stage');
      const client = await context.newCDPSession(page);
      const frames: any[] = []; let accepting = true;
      client.on('Page.screencastFrame', event => {
        void client.send('Page.screencastFrameAck', { sessionId: event.sessionId });
        if (!accepting) return;
        const file = `${String(frames.length).padStart(4, '0')}.png`;
        writeFileSync(join(dir, file), Buffer.from(event.data, 'base64'));
        frames.push({ file, timestamp: event.metadata.timestamp, received: performance.now() });
      });
      const before = { hits: traffic.hits, crits: traffic.crits }, start = performance.now();
      await client.send('Page.startScreencast', { format: 'png', maxWidth: 480, maxHeight: 320, everyNthFrame: 2 });
      await delay(20_000); accepting = false;
      await client.send('Page.stopScreencast'); await page.keyboard.up('KeyJ');
      const elapsed = performance.now() - start;
      await page.screenshot({ path: join(dir, 'end-full.png') });
      writeFileSync(join(dir, 'capture.json'), JSON.stringify({ frames, elapsed, rect, moments, viewport: { width: 1200, height: 800 } }, null, 2));
      const decoded = spawnSync('python3', [resolve('qa/release-screen-metrics.py'), dir], { encoding: 'utf8' });
      if (decoded.status !== 0) throw new Error(decoded.stderr);
      const metrics = JSON.parse(decoded.stdout);
      const result = { view, frames: frames.length, elapsedMs: elapsed, fps: frames.length / (elapsed / 1000),
        hits: traffic.hits - before.hits, crits: traffic.crits - before.crits, endedDuringSample: !!traffic.autopsy,
        errors: traffic.errors, ...metrics };
      result.pass = frames.length >= 540 && result.crits >= 20 && !result.endedDuringSample && !result.errors.length
        && [result.full, result.stage].every(x => x.maxNearWhite <= .25 && x.maxSwing <= .10 && x.maxFlashEdgesPerSecond <= 3);
      results.push(result); console.log(JSON.stringify(result));
    } catch (error) { results.push({ view, pass: false, failure: String(error), errors: traffic.errors }); }
    finally { await context.close(); }
  }
} finally {
  await browser.close();
  writeFileSync(join(output, 'summary.json'), JSON.stringify({ sha: process.env.RELEASE_SHA, base: 'http://localhost:5191',
    method: 'Unmodified UI, real native inputs, CDP compositor PNGs every second rendered frame for20s. Includes all CSS filters/blending. Full viewport and stage crop independently checked. Linear sRGB luminance, white>=.9, max adjacent mean swing<=.10, <=3 edges>.10 per second. Minimum540 distinct captured frames.', results }, null, 2));
}
process.exitCode = results.every(r => r.pass) ? 0 : 1;
