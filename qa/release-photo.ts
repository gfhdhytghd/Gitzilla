/** Real clean-build gameplay. No injected events or render-state changes. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import ts from 'typescript';
import { createBattle, startBattle, observe, delay, until } from './release-common';

const output = resolve(process.env.RELEASE_PHOTO_OUTPUT ?? 'qa/artifacts/release-bdd177c-photosensitivity');
const viewport = { width: Number(process.env.RELEASE_PHOTO_WIDTH ?? 1200), height: Number(process.env.RELEASE_PHOTO_HEIGHT ?? 800) };
const angle = process.env.RELEASE_ANGLE ?? 'swiftshader';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
  args: [`--use-angle=${angle}`, ...(angle === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : ['--enable-gpu', '--ignore-gpu-blocklist']), '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const results: unknown[] = [];
try {
  for (const view of ['2d', '25d'] as const) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript("globalThis.__name=(fn,name)=>Object.defineProperty(fn,'name',{value:name,configurable:true});");
    const page = await context.newPage(); const traffic = observe(page);
    let failure: string | undefined;
    try {
      // Sample after the real game frame finishes, while the WebGL drawing buffer still exists.
      await page.route('**/client/app/game.ts*', async route => {
        const response = await route.fetch(); let code = await response.text();
        const sf = ts.createSourceFile('game.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        let at = -1;
        const visit = (node: ts.Node) => {
          if (ts.isVariableDeclaration(node) && node.name.getText(sf) === 'frame' && node.initializer
            && ts.isArrowFunction(node.initializer) && ts.isBlock(node.initializer.body)) at = node.initializer.body.end - 1;
          ts.forEachChild(node, visit);
        }; visit(sf);
        if (at < 0) throw new Error('Cannot locate real frame callback for read-only pixel sampling');
        code = code.slice(0, at) + '\nglobalThis.__qaPhoto?.paint();\n' + code.slice(at);
        await route.fulfill({ response, body: code });
      });
      await createBattle(page, traffic, view, 7); await startBattle(page, traffic);
      await until(() => (traffic.snapshot?.t ?? 0) >= 8, 'intro completed');
      await page.keyboard.down('KeyD'); await page.keyboard.down('KeyJ'); await delay(2200); await page.keyboard.up('KeyD');
      await page.evaluate(() => {
        const w = window as any;
        const cv = document.createElement('canvas'); cv.width = 192; cv.height = 128;
        const g = cv.getContext('2d', { willReadFrequently: true })!;
        const rows: any[] = [], frames: any[] = []; let latest: any = null, rendered = 0, next = 0, timer: ReturnType<typeof setInterval>;
        const linear = new Float32Array(256);
        for (let i = 0; i < 256; i++) { const s = i / 255; linear[i] = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }
        let peak = 0, peakImage = '', started = performance.now();
        let previous: { mean: number; image: ImageData; at: number } | undefined;
        let transition: { delta: number; before: ImageData; after: ImageData; beforeAt: number; afterAt: number } | undefined;
        const paint = () => {
          const now = performance.now(); if (now < next) return; next = now + 29;
          const layers = [...document.querySelectorAll<HTMLCanvasElement>('.stage-3d, .ov-3d')];
          if (!layers.length) { const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="game-canvas"]'); if (canvas) layers.push(canvas); }
          if (!layers.length) return;
          g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
          for (const layer of layers) g.drawImage(layer, 0, 0, cv.width, cv.height);
          // Include the real DOM full-screen FX overlay, not just the canvas pass.
          const flash = document.querySelector<HTMLElement>('.fx-flash');
          if (flash) { const css = getComputedStyle(flash); if (css.display !== 'none' && css.visibility !== 'hidden') {
            g.globalAlpha = Number(css.opacity); g.fillStyle = css.backgroundColor; g.fillRect(0, 0, cv.width, cv.height); g.globalAlpha = 1;
          } }
          const raw = g.getImageData(0, 0, cv.width, cv.height), pixels = raw.data;
          let mean = 0, nearWhite = 0, max = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            const y = 0.2126 * linear[pixels[i]] + 0.7152 * linear[pixels[i + 1]] + 0.0722 * linear[pixels[i + 2]];
            mean += y; if (y >= 0.9) nearWhite++; max = Math.max(max, y);
          }
          latest = { at: now - started, render: ++rendered, mean: mean / (pixels.length / 4), nearWhite: nearWhite / (pixels.length / 4), max };
          frames.push(latest);
          if (previous) { const delta = Math.abs(latest.mean - previous.mean);
            if (!transition || delta > transition.delta) transition = { delta, before: previous.image, after: raw, beforeAt: previous.at, afterAt: latest.at };
          }
          previous = { mean: latest.mean, image: raw, at: latest.at };
          if (latest.nearWhite > peak) { peak = latest.nearWhite; peakImage = cv.toDataURL('image/png'); }
        };
        // Fixed-rate observation repeats the last displayed frame if the renderer runs below30fps.
        timer = setInterval(() => { if (latest) rows.push({ ...latest, sampledAt: performance.now() - started }); }, 1000 / 30);
        w.__qaPhoto = { paint, stop() { clearInterval(timer);
          const encode = (pixels: ImageData) => { g.putImageData(pixels, 0, 0); return cv.toDataURL('image/png'); };
          return { rows, frames, rendered, peakImage, elapsed: performance.now() - started, largestRenderTransition: transition && {
            delta: transition.delta, beforeAt: transition.beforeAt, afterAt: transition.afterAt,
            beforeImage: encode(transition.before), afterImage: encode(transition.after) } };
        } };
      });
      const before = { hits: traffic.hits, crits: traffic.crits };
      await page.screenshot({ path: join(output, `${view}-start.png`) }); await delay(10_000);
      await page.screenshot({ path: join(output, `${view}-middle.png`) }); await delay(10_000);
      const sampled = await page.evaluate(() => (window as any).__qaPhoto.stop());
      await page.keyboard.up('KeyJ'); await page.screenshot({ path: join(output, `${view}-end.png`) });
      const rows = sampled.rows as { sampledAt: number; render: number; mean: number; nearWhite: number }[];
      const frames = sampled.frames as { at: number; mean: number; nearWhite: number }[];
      const deltas = frames.slice(1).map((row, i) => ({ at: row.at, delta: row.mean - frames[i].mean }));
      const largeEdges = deltas.filter(x => Math.abs(x.delta) > 0.1);
      let maxEdges = 0;
      for (const edge of largeEdges) maxEdges = Math.max(maxEdges, largeEdges.filter(x => x.at >= edge.at && x.at < edge.at + 1000).length);
      const stats = { view, viewport, angle, elapsedMs: sampled.elapsed, samples: rows.length, sampleFps: rows.length / (sampled.elapsed / 1000), uniqueRenderedFrames: sampled.rendered,
        maxNearWhiteFraction: Math.max(...frames.map(x => x.nearWhite)), maxMeanLuminanceSwing: Math.max(...deltas.map(x => Math.abs(x.delta))),
        maxFlashEdgesPerSecond: maxEdges, hits: traffic.hits - before.hits, crits: traffic.crits - before.crits,
        minMean: Math.min(...rows.map(x => x.mean)), maxMean: Math.max(...rows.map(x => x.mean)), endedDuringSample: !!traffic.autopsy, errors: traffic.errors };
      const pass = rows.length >= 540 && sampled.rendered >= 540 && stats.crits >= 20 && stats.maxMean > 0.005 && stats.maxNearWhiteFraction <= 0.25
        && stats.maxMeanLuminanceSwing <= 0.1 && maxEdges <= 3 && !traffic.errors.length && !stats.endedDuringSample;
      writeFileSync(join(output, `${view}-frames.json`), JSON.stringify(sampled, null, 2));
      if (sampled.peakImage) writeFileSync(join(output, `${view}-peak-composite.png`), Buffer.from(sampled.peakImage.split(',')[1], 'base64'));
      if (sampled.largestRenderTransition) for (const phase of ['before', 'after']) writeFileSync(join(output, `${view}-largest-swing-${phase}.png`), Buffer.from(sampled.largestRenderTransition[`${phase}Image`].split(',')[1], 'base64'));
      results.push({ ...stats, pass }); console.log(JSON.stringify({ ...stats, pass }));
    } catch (error) { failure = String(error); results.push({ view, pass: false, failure, errors: traffic.errors }); }
    finally { await context.close(); }
  }
} finally {
  await browser.close();
  writeFileSync(join(output, 'summary.json'), JSON.stringify({ sha: process.env.RELEASE_SHA, base: 'http://localhost:5191',
    method: '20s fixed30Hz observations of actual post-frame canvas composition including DOM .fx-flash. WCAG linear relative luminance; near-white>=0.9; swings/flash edges>0.10 of full luminance range. Last visible render repeats between slower renders; render count reported. Real WS hits/crits, no injected gameplay.', results }, null, 2));
}
process.exitCode = results.every((x: any) => x.pass) ? 0 : 1;
