import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import type { LobbyState, MatchState, ServerMsg } from '../shared/types.ts';
import { devURL, sleep, until } from './common.ts';

const base = devURL();
const output = `qa/artifacts/browser-${new Date().toISOString().replace(/[:.]/g, '-')}`;
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
const results: { name: string; status: string; detail?: string }[] = [];
const pageErrors: string[] = [];
const consoleErrors: string[] = [];
const failedRequests: { url: string; error: string }[] = [];
const protocolErrors: string[] = [];
const shots: string[] = [];
let currentPage: Page | undefined;
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); }
  catch (error) {
    const interrupted = protocolErrors.some(error => /Server restarted/.test(error)) || failedRequests.some(request => new URL(request.url).origin === base.origin && /ERR_CONNECTION_REFUSED/.test(request.error));
    const status = interrupted ? 'INCONCLUSIVE' : 'FAIL';
    results.push({ name, status, detail: String(error) }); console.log(`${status} ${name}: ${error}`);
    if (currentPage) {
      await shot(currentPage, `failure-${results.length}`).catch(() => {});
      const visible = await currentPage.locator('[data-testid]:visible').evaluateAll(elements => elements.map(e => e.getAttribute('data-testid'))).catch(() => []);
      writeFileSync(`${output}/failure-${results.length}.json`, JSON.stringify({ visible, protocolErrors }, null, 2));
    }
  }
}
function observe(page: Page) {
  const seen: { id?: string; lobby?: LobbyState; state?: MatchState; welcomes: number; snapshots: number; autopsies: number; opened: number; closes: number; lastAck: number } = { welcomes: 0, snapshots: 0, autopsies: 0, opened: 0, closes: 0, lastAck: -1 };
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' }));
  page.on('websocket', socket => {
    if (new URL(socket.url()).pathname !== '/ws') return;
    seen.opened++;
    socket.on('close', () => seen.closes++);
    socket.on('framereceived', event => {
      const msg = JSON.parse(event.payload.toString()) as ServerMsg;
      if (msg.t === 'welcome') { seen.id = msg.you; seen.lobby = msg.lobby; seen.welcomes++; }
      if (msg.t === 'lobby') seen.lobby = msg.lobby;
      if (msg.t === 'snapshot') { seen.state = msg.state; seen.snapshots++; seen.lastAck = msg.ack; }
      if (msg.t === 'autopsy') seen.autopsies++;
      if (msg.t === 'error') protocolErrors.push(msg.message);
    });
  });
  return seen;
}
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${output}/${name}.png`, timeout: 10000 }); shots.push(`${name}.png`);
}
async function joinUI(page: Page) {
  const join = page.getByTestId('join-room');
  // Fresh isolated users see the name gate; reloads use their stored name.
  await Promise.race([join.waitFor({ state: 'visible' }), page.getByTestId('player-repo-input').waitFor({ state: 'visible' })]);
  if (await join.isVisible()) { await page.getByTestId('player-name').fill('QA browser'); await join.click(); }
  await page.getByTestId('player-repo-input').waitFor();
}
let room: string | undefined;
try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  // Browser layout + touch only, never claim real sensor coverage.
  await phone.addInitScript(() => {
    Object.defineProperty(window, 'DeviceMotionEvent', { value: undefined, configurable: true });
    Object.defineProperty(window, 'DeviceOrientationEvent', { value: undefined, configurable: true });
  });
  const page = await desktop.newPage(); const mobile = await phone.newPage();
  currentPage = page;
  const owner = observe(page); const teammate = observe(mobile);
  const cdp = await desktop.newCDPSession(page);
  await check('slow-network landing/create/join and repository selection', async () => {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 180, downloadThroughput: 180000, uploadThroughput: 90000 });
    await page.goto(base.href); await page.getByTestId('create-room').click();
    await page.waitForURL(/\/r\/[A-Z]{4}/); room = new URL(page.url()).pathname.split('/').pop();
    await joinUI(page); await until(() => !!owner.id, 'owner welcome');
    await mobile.goto(page.url()); await joinUI(mobile); await until(() => !!teammate.id, 'phone welcome');
    for (const p of [page, mobile]) {
      await p.getByTestId('player-repo-input').fill('pallets/flask'); await p.getByTestId('player-repo-submit').dblclick();
      await p.locator('[data-testid="player-ready"][data-status="ready"]').waitFor({ timeout: 30000 });
    }
    await page.getByTestId('boss-repo-input').fill('pallets/flask'); await page.getByTestId('boss-repo-submit').dblclick();
    await page.locator('[data-testid="boss-ready"][data-status="ready"]').waitFor({ timeout: 30000 });
    await shot(page, 'slow-lobby-desktop'); await shot(mobile, 'lobby-phone-portrait');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  });
  if (!room || !owner.id || !teammate.id) throw new Error('Cannot run dependent scenarios without joined clients');
  await check('lobby reload resumes kit and transfers owner to remaining player', async () => {
    const id = owner.id; const welcomes = owner.welcomes;
    await page.reload(); await until(() => owner.welcomes > welcomes, 'lobby resumed');
    assert.equal(owner.id, id);
    assert.equal(owner.lobby?.players.find(p => p.id === id)?.status, 'ready');
    assert.equal(owner.lobby?.ownerId, teammate.id);
  });
  await check('phone portrait/landscape flips retain room and controls', async () => {
    const id = teammate.id;
    await mobile.setViewportSize({ width: 844, height: 390 }); await sleep(250);
    await shot(mobile, 'lobby-phone-landscape-guard');
    await mobile.setViewportSize({ width: 390, height: 844 }); await sleep(250);
    assert.equal(teammate.id, id);
    await mobile.getByTestId('start-match').waitFor();
  });
  await check('owner double-click start enters one match in both browsers', async () => {
    // Following reload, the phone owns the room.
    await mobile.getByTestId('start-match').click({ clickCount: 2 });
    for (const p of [page, mobile]) await p.getByTestId('game-canvas').waitFor();
    await until(() => !!owner.state && !!teammate.state, 'match snapshots');
    await shot(page, 'match-desktop'); await shot(mobile, 'match-phone-portrait');
  });
  await check('frozen tab wakes and receives current authoritative snapshots', async () => {
    const before = owner.state!.t;
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' }); await sleep(1200);
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await until(() => !!owner.state && owner.state.t > before + 0.5, 'post-freeze simulation');
    assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
  });
  await check('mid-match reload restores same player and visible game', async () => {
    const id = owner.id; const welcomes = owner.welcomes;
    await page.reload(); await until(() => owner.welcomes > welcomes, 'match welcome');
    await page.getByTestId('game-canvas').waitFor();
    assert.equal(owner.id, id); assert.ok(owner.state?.players.some(p => p.id === id));
    await page.keyboard.down('d'); await page.keyboard.down('j'); await sleep(300);
    await page.keyboard.up('d'); await page.keyboard.up('j');
    await until(() => owner.lastAck > 0, 'browser input ack');
    await shot(page, 'resumed-match-desktop');
  });
  await check('mid-match phone landscape rotation shows portrait guard and recovers canvas', async () => {
    await mobile.setViewportSize({ width: 844, height: 390 }); await sleep(250);
    await shot(mobile, 'match-phone-landscape-guard');
    await mobile.getByText(/rotate to portrait/i).first().waitFor({ state: 'visible' });
    await mobile.setViewportSize({ width: 390, height: 844 }); await sleep(250);
    await mobile.getByText(/rotate to portrait/i).first().waitFor({ state: 'hidden' });
    await mobile.getByTestId('game-canvas').waitFor();
  });
  await check('natural autopsy renders and survives reload', async () => {
    console.log('Waiting up to 180s for a natural idle-squad defeat; no forced result.');
    const previousErrors = protocolErrors.length;
    await until(() => {
      const stopped = protocolErrors.slice(previousErrors).find(message => /Match stopped|Server restarted/.test(message));
      if (stopped) throw new Error(stopped);
      if (owner.lobby?.phase === 'lobby' && protocolErrors.some(message => /Server restarted/.test(message))) throw new Error('DEV restart restored the lobby before natural autopsy');
      return owner.autopsies > 0;
    }, 'natural autopsy', 180000);
    await page.getByTestId('autopsy').waitFor({ state: 'visible', timeout: 15000 });
    await shot(page, 'autopsy-desktop');
    const id = owner.id; const welcomes = owner.welcomes;
    await page.reload(); await until(() => owner.welcomes > welcomes, 'autopsy reconnect');
    assert.equal(owner.id, id);
    await page.getByTestId('autopsy').waitFor({ state: 'visible', timeout: 15000 });
    await shot(page, 'autopsy-reloaded-desktop');
  });
  await check('no uncaught browser exceptions across recovery scenarios', async () => { assert.deepEqual(pageErrors, []); });
  writeFileSync(`${output}/telemetry.json`, JSON.stringify({ owner: { ...owner, state: owner.state ? { t: owner.state.t, status: owner.state.status } : null, lobby: owner.lobby?.phase }, phone: { ...teammate, state: teammate.state ? { t: teammate.state.t, status: teammate.state.status } : null, lobby: teammate.lobby?.phase } }, null, 2));
} catch (error) {
  const interrupted = protocolErrors.some(message => /Server restarted/.test(message)) || failedRequests.some(request => new URL(request.url).origin === base.origin && /ERR_CONNECTION_REFUSED/.test(request.error));
  results.push({ name: 'browser harness', status: interrupted ? 'INCONCLUSIVE' : 'FAIL', detail: String(error) }); console.log(String(error));
} finally {
  await browser.close();
  writeFileSync(`${output}/summary.json`, JSON.stringify({ target: base.origin, room, results, pageErrors, consoleErrors, failedRequests, protocolErrors, shots, limits: 'Emulated phone; no real sensors, login, OS sleep or production traffic.' }, null, 2));
  console.log(`Evidence: ${output}/summary.json`);
}
if (results.some(result => result.status === 'FAIL')) process.exitCode = 1;
else if (results.some(result => result.status === 'INCONCLUSIVE')) process.exitCode = 2;
