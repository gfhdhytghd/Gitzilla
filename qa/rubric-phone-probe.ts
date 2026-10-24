import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import type { MatchState, ServerMsg } from '../shared/types.ts';

// Short native-input comparison, never a replay/forced ending of the rubric class.
const base = 'http://localhost:45093';
const output = `qa/artifacts/rubric-phone-probe-${new Date().toISOString().replace(/[:.]/g, '-')}`;
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath(), args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
const page = await context.newPage(); page.setDefaultTimeout(15000);
let id: string | undefined; let state: MatchState | undefined; let ack = -1;
let phase: 'setup' | 'oldDrag' | 'newTap' = 'setup';
const counts = { oldDrag: { inputs: 0, moving: 0, firing: 0 }, newTap: { inputs: 0, moving: 0, firing: 0 } };
const ownBullets = new Set<number>(); const errors: string[] = [];
let success = false; let failure: string | undefined; let movement = 0;
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function until(get: () => boolean, label: string) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (get()) return; await sleep(30); }
  throw new Error(`Timeout: ${label}`);
}
page.on('pageerror', error => errors.push(error.message));
page.on('websocket', socket => {
  if (new URL(socket.url()).pathname !== '/ws') return;
  socket.on('framereceived', frame => {
    const msg = JSON.parse(frame.payload.toString()) as ServerMsg;
    if (msg.t === 'welcome') id = msg.you;
    if (msg.t === 'snapshot') {
      state = msg.state; ack = msg.ack;
      for (const b of state.bullets) if (b.owner === id) ownBullets.add(b.id);
    }
    if (msg.t === 'error') errors.push(msg.message);
  });
  socket.on('framesent', frame => {
    const msg = JSON.parse(frame.payload.toString());
    if (msg.t !== 'input' || phase === 'setup') return;
    const c = counts[phase]; c.inputs++;
    if (msg.frame.fire) c.firing++;
    if (Math.hypot(...msg.frame.move) > 0) c.moving++;
  });
});
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' }); await page.getByTestId('create-room').click();
  await page.getByTestId('player-name').fill('QA phone probe'); await page.getByTestId('join-room').click();
  await page.getByTestId('player-repo-input').fill('pallets/flask'); await page.getByTestId('player-repo-submit').click();
  await page.locator('[data-testid="player-ready"][data-status="ready"]').waitFor({ timeout: 45000 });
  await page.getByTestId('controls-touch').click();
  await page.getByTestId('boss-repo-input').fill('pallets/flask'); await page.getByTestId('boss-repo-submit').click();
  await page.locator('[data-testid="boss-ready"][data-status="ready"]').waitFor({ timeout: 45000 });
  await page.getByTestId('start-match').click(); await page.getByTestId('game-canvas').waitFor();
  await until(() => state?.status === 'fighting', 'real fighting snapshot');
  await page.getByTestId('boss-intro').waitFor({ state: 'hidden', timeout: 10000 });
  const cdp = await context.newCDPSession(page);
  const before = state!.players.find(p => p.id === id)!;
  const initialPosition = [before.x, before.y];
  const initialAck = ack;
  phase = 'oldDrag';
  for (let i = 0; i < 3; i++) {
    const r = (await page.getByTestId('game-canvas').boundingBox())!;
    const x = r.x + r.width * 0.42, y = r.y + r.height * 0.65;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 45, y: y + 25 }] });
    await sleep(140); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(350);
  }
  const moved = state!.players.find(p => p.id === id)!;
  movement = Math.hypot(moved.x - initialPosition[0], moved.y - initialPosition[1]);
  assert.ok(counts.oldDrag.moving > 0 && movement > 0 && ack > initialAck);
  assert.equal(counts.oldDrag.firing, 0, 'Old drag-only pattern is movement, not an attack tap');
  assert.equal(ownBullets.size, 0);
  phase = 'newTap';
  for (let i = 0; i < 3; i++) {
    const r = (await page.getByTestId('game-canvas').boundingBox())!;
    await page.touchscreen.tap(r.x + r.width * 0.42, r.y + r.height * 0.65);
    await sleep(700); // Distinct taps, outside the double-tap/dash window.
  }
  await until(() => ownBullets.size > 0 && counts.newTap.firing > 0, 'real tap attack frames and authoritative own bullets');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${output}/phone-native-input.png` });
  success = true; console.log(`PASS old drag: ${counts.oldDrag.moving} move / 0 fire; native tap: ${counts.newTap.firing} fire, ${ownBullets.size} authoritative own bullets; no long match replay`);
} catch (error) { failure = String(error); console.log(`FAIL ${error}`); await page.screenshot({ path: `${output}/failure.png` }).catch(() => {}); }
finally {
  await browser.close();
  writeFileSync(`${output}/summary.json`, JSON.stringify({ target: base, success, failure, counts, movement, ack, ownBullets: ownBullets.size, errors,
    ending: 'not requested; short native-input probe only', limits: 'Actual 45093 UI + native touch + read-only WS; no synthetic sensor or direct input-frame injection.' }, null, 2));
  console.log(`Evidence: ${output}/summary.json`);
}
if (!success) process.exitCode = 1;
