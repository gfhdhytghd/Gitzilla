import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { WebSocket } from 'ws';
import { devURL, request, until } from './common.ts';
import { fixture } from './fixture.ts';

// Focused real-player autopsy reload acceptance, independent of the slower rotation run.
const base = devURL();
const phoneSize = process.env.QA_PHONE_SIZE;
if (phoneSize && !['390x844', '360x800', '430x932', '360x640'].includes(phoneSize)) throw new Error('Unknown QA_PHONE_SIZE');
const viewport = phoneSize ? { width: Number(phoneSize.split('x')[0]), height: Number(phoneSize.split('x')[1]) } : { width: 1280, height: 720 };
const output = `qa/artifacts/autopsy-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const isolated = process.env.QA_ISOLATED === '1' ? await fixture() : undefined;
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
const ids: string[] = []; const errors: string[] = []; const pageErrors: string[] = [];
let autopsies = 0; let duration: number | undefined; let failure: string | undefined;
function observeMessage(raw: string) {
  const msg = JSON.parse(raw);
  if (msg.t === 'welcome') ids.push(msg.you);
  if (msg.t === 'error') errors.push(msg.message);
  if (msg.t === 'autopsy') { autopsies++; duration = msg.result.duration; }
}
try {
  const { room } = isolated ?? await (await request('/api/room', 'POST')).json() as { room: string };
  const page = await browser.newPage({ viewport, isMobile: !!phoneSize, hasTouch: !!phoneSize, deviceScaleFactor: phoneSize ? (phoneSize === '360x640' ? 2 : 3) : 1 });
  if (phoneSize) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 24, bottom: 24, left: 0, right: 0 } });
  }
  if (isolated) {
    // Keep the actual DEV UI and real room/sim protocol, but isolate the socket
    // from DEV process restarts. No fabricated snapshots/results or inputs.
    await page.routeWebSocket('**/*', route => {
      if (new URL(route.url()).pathname !== '/ws') return; // Leave a quiet virtual HMR socket open.
      const backend = new WebSocket(isolated.url);
      const pending: (string | Buffer)[] = [];
      route.onMessage(message => backend.readyState === WebSocket.OPEN ? backend.send(message) : pending.push(message));
      backend.on('open', () => { for (const message of pending.splice(0)) backend.send(message); });
      backend.on('message', message => { observeMessage(message.toString()); route.send(message.toString()); });
      backend.on('close', () => route.close());
      backend.on('error', error => { errors.push(error.message); route.close(); });
      route.onClose(() => backend.close());
    });
  }
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('websocket', socket => {
    if (isolated || new URL(socket.url()).pathname !== '/ws') return;
    socket.on('framereceived', frame => observeMessage(frame.payload.toString()));
  });
  await page.goto(new URL(`/r/${room}`, base).href);
  await page.getByTestId('player-name').fill('QA autopsy'); await page.getByTestId('join-room').click();
  await page.getByTestId('player-repo-input').fill('pallets/flask'); await page.getByTestId('player-repo-submit').click();
  await page.locator('[data-testid="player-ready"][data-status="ready"]').waitFor({ timeout: 30000 });
  await page.getByTestId('boss-repo-input').fill('pallets/flask'); await page.getByTestId('boss-repo-submit').click();
  await page.locator('[data-testid="boss-ready"][data-status="ready"]').waitFor({ timeout: 30000 });
  await page.getByTestId('start-match').click();
  await page.getByTestId('game-canvas').waitFor();
  await until(() => {
    if (errors.some(message => /Match stopped|Server restarted/.test(message))) throw new Error(errors.join('; '));
    return autopsies > 0;
  }, 'natural defeat', 90000);
  await page.getByTestId('autopsy').waitFor({ timeout: 10000 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Autopsy must not overflow horizontally');
  await page.screenshot({ path: `${output}/autopsy.png` });
  const before = autopsies;
  await page.reload();
  await until(() => autopsies > before, 'resumed result');
  await page.getByTestId('autopsy').waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${output}/resumed-autopsy.png` });
  assert.ok(ids.length >= 2); assert.equal(new Set(ids).size, 1); assert.deepEqual(pageErrors, []);
  console.log(`PASS natural autopsy (${duration?.toFixed(2)}s) and same-player reload`);
} catch (error) { failure = String(error); console.log(failure); process.exitCode = errors.some(e => /Server restarted/.test(e)) ? 2 : 1; }
finally {
  await browser.close();
  await isolated?.close();
  writeFileSync(`${output}/summary.json`, JSON.stringify({ target: base.origin, viewport, phone: !!phoneSize, isolatedRealRoomSocket: !!isolated, success: !failure, ids, autopsies, duration, errors, pageErrors, failure }, null, 2));
  console.log(`Evidence: ${output}/summary.json`);
}
