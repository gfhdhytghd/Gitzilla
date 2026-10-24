/** Real DEV app + authoritative snapshots. Synthetic sensors are not physical-phone acceptance. */
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import type { InputFrame, MatchState, ServerMsg } from '../shared/types';
import { playtestBaseURL } from './playtest';

const base = playtestBaseURL(process.env.MOTION_URL || process.env.PLAYTEST_URL);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'docs/shots', `${new Date().toISOString().replace(/[:.]/g, '-')}-motion-v2`);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/chromium') });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await context.newPage();
page.setDefaultTimeout(20_000);
let selfId = '';
let state: MatchState | undefined;
let ack = -1;
let snapshots = 0;
const inputs: { at: number; frame: InputFrame }[] = [];
const bullets = new Set<number>();
const checks: { check: string; evidence: unknown }[] = [];
const errors: string[] = [];
const consoleLog: string[] = [];
let pass = false;
let failure: string | undefined;
const sleep = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
async function until<T>(fn: () => T | undefined | null | false, label: string, timeout = 8000): Promise<T> {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = fn(); if (value) return value; await sleep(40); }
  throw new Error(`Timed out: ${label}; last server status=${state?.status}, ack=${ack}`);
}
const check = (name: string, evidence: unknown) => { checks.push({ check: name, evidence }); console.log(`PASS ${name}: ${JSON.stringify(evidence)}`); };
const me = () => state?.players.find(player => player.id === selfId);
const lastSeq = () => inputs.at(-1)?.frame.seq ?? -1;
const pose = async (beta: number, gamma: number) => { await page.evaluate(([b, g]) => Object.assign((window as any).__motion, { beta: b, gamma: g }), [beta, gamma]); };
async function attackEvidence(label: string, trigger: () => Promise<unknown>) {
  await sleep(700); // expire any preceding tap/swing burst
  const seq = lastSeq();
  const oldBullets = new Set(bullets);
  await trigger();
  const packet = await until(() => inputs.find(input => input.frame.seq > seq && input.frame.fire)?.frame, `${label} fire frame`);
  await until(() => ack >= packet.seq, `${label} server acknowledgement`);
  await until(() => [...bullets].some(id => !oldBullets.has(id)), `${label} authoritative shot`);
  assert.equal(packet.source, 'motion'); assert.equal(packet.aim, null);
  assert(!packet.dash && !packet.skill, 'attacks must never trigger dash or skill');
  if (label.startsWith('any-axis swing')) assert(Math.hypot(...packet.move) < 0.1, 'swing orientation noise must be frozen');
  check(label, { seq: packet.seq, ack, newOwnBullets: [...bullets].filter(id => !oldBullets.has(id)).length });
}

try {
  // Keep this tab on the tested client revision while parallel UI edits trigger Vite
  // reloads. Only HMR is held inert; the authoritative game /ws is never intercepted.
  await page.routeWebSocket(url => url.pathname !== '/ws', socket => {
    socket.send(JSON.stringify({ type: 'connected' }));
  });
  await context.addInitScript(`(() => {
    if (location.protocol.startsWith('http')) localStorage.setItem('kaiju.name', 'motion-v2');
    const w = window;
    w.__permissionCalls = [];
    for (const key of ['DeviceMotionEvent', 'DeviceOrientationEvent']) {
      Object.defineProperty(w[key], 'requestPermission', { configurable: true, value: () => {
        w.__permissionCalls.push({ api: key, event: w.event?.type, active: navigator.userActivation.isActive });
        return Promise.resolve('granted');
      } });
    }
    Object.defineProperty(screen.orientation, 'angle', { configurable: true, get: () => 0 });
    w.__motion = { enabled: false, beta: 45, gamma: 0, absolute: false };
    window.setInterval(() => {
      const m = w.__motion;
      if (!m.enabled) return;
      window.dispatchEvent(new DeviceOrientationEvent(m.absolute ? 'deviceorientationabsolute' : 'deviceorientation', { beta: m.beta, gamma: m.gamma, alpha: 0, absolute: m.absolute }));
      window.dispatchEvent(new DeviceMotionEvent('devicemotion', { acceleration: { x: 0, y: 0, z: 0 }, interval: 30 }));
    }, 30);
  })();`);
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('console', message => {
    consoleLog.push(`${message.type()}: ${message.text()}`);
    if (/placeholder|PHONE INPUT FAILURE/.test(message.text()) && message.type() === 'error') errors.push(message.text());
  });
  page.on('websocket', socket => {
    if (new URL(socket.url()).pathname !== '/ws') return;
    socket.on('socketerror', error => errors.push(`WS: ${error}`));
    socket.on('framesent', frame => {
      const msg = JSON.parse(frame.payload.toString());
      if (msg.t === 'input') inputs.push({ at: Date.now(), frame: msg.frame });
    });
    socket.on('framereceived', frame => {
      const msg = JSON.parse(frame.payload.toString()) as ServerMsg;
      if (msg.t === 'welcome') selfId = msg.you;
      if (msg.t === 'snapshot') {
        state = msg.state; ack = msg.ack; snapshots++;
        for (const bullet of state.bullets) if (bullet.owner === selfId) bullets.add(bullet.id);
      }
      if (msg.t === 'error') errors.push(`protocol: ${msg.message}`);
    });
  });
  await page.goto(`${base}/?debug=input`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('create-room').tap();
  await page.getByTestId('player-repo-input').fill('lodash/lodash');
  await page.getByTestId('player-repo-submit').tap();
  await page.locator('[data-testid="player-ready"][data-status="ready"]').waitFor({ timeout: 45_000 });
  await page.getByTestId('boss-repo-input').fill('pallets/flask');
  await page.getByTestId('boss-repo-submit').tap();
  await page.locator('[data-testid="boss-ready"][data-status="ready"]').waitFor({ timeout: 45_000 });
  // Three normal AI teammates draw aggro so this control test can run without a human dodging.
  for (let i = 0; i < 3; i++) { await page.getByTestId('bots-plus').tap(); await sleep(120); }
  await page.getByTestId('start-match').tap();
  await page.getByTestId('game-canvas').waitFor();
  await page.getByTestId('motion-enable').tap();
  const permissions = await page.evaluate(() => (window as any).__permissionCalls);
  assert.equal(permissions.length, 2);
  assert(permissions.every((p: any) => p.active && (p.event === 'pointerdown' || p.event === 'click')));
  check('both iOS permissions in original user gesture', permissions);
  await page.locator('[data-testid="input-sensors"][data-status="off"]').waitFor();
  assert(await page.locator('.kj-touch-joystick-zone').isVisible());
  check('no events -> touch fallback after 1.5s', { mode: await page.getByTestId('input-sensors').getAttribute('data-mode') });
  await page.evaluate(() => { (window as any).__motion.enabled = true; });
  await page.locator('[data-testid="input-sensors"][data-status="on"]').waitFor();
  await sleep(450);
  assert(!(await page.locator('.kj-touch-joystick-zone').isVisible()));
  assert(await page.getByTestId('input-dash').isVisible()); assert(await page.getByTestId('input-skill').isVisible());
  await until(() => state?.status === 'fighting', 'real fighting snapshots');
  check('late sensors recover real motion input with buttons', { source: inputs.at(-1)?.frame.source, uprightNeutral: [45, 0] });
  for (const direction of [
    { name: 'right roll', beta: 45, gamma: 20, axis: 'x', sign: 1 },
    { name: 'left roll', beta: 45, gamma: -20, axis: 'x', sign: -1 },
    { name: 'down pitch', beta: 65, gamma: 0, axis: 'y', sign: 1 },
    { name: 'up pitch', beta: 25, gamma: 0, axis: 'y', sign: -1 },
  ] as const) {
    await pose(45, 0); await sleep(200);
    const before = { x: me()!.x, y: me()!.y };
    const seq = lastSeq();
    await pose(direction.beta, direction.gamma); await sleep(550);
    const after = { x: me()!.x, y: me()!.y };
    const delta = after[direction.axis] - before[direction.axis];
    assert(delta * direction.sign > 5, `${direction.name}: expected snapshot movement, got ${delta}`);
    assert(inputs.some(i => i.frame.seq > seq && i.frame.move[direction.axis === 'x' ? 0 : 1] * direction.sign > 0.5));
    check(`snapshot movement: ${direction.name}`, { before, after, delta });
  }
  await pose(45, 0); await sleep(250);
  await attackEvidence('short tap reaches server + shoots', () => page.touchscreen.tap(120, 350));
  const cdp = await context.newCDPSession(page);
  await attackEvidence('held finger attacks beyond 400ms', async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 350 }] });
    await sleep(650);
    assert(inputs.at(-1)!.frame.fire);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  });
  for (const a of [[15, 0, 0], [-15, 0, 0], [0, 15, 0], [0, -15, 0], [0, 0, 15], [0, 0, -15]]) {
    await attackEvidence(`any-axis swing ${a.join(',')}`, () => page.evaluate(([x, y, z]) => {
      window.dispatchEvent(new DeviceMotionEvent('devicemotion', { acceleration: { x, y, z }, interval: 30 }));
      // Orientation noise immediately following a swing must not move the hero.
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 80, gamma: 60 }));
    }, a));
  }
  await sleep(700);
  for (const action of ['dash', 'skill'] as const) {
    const seq = lastSeq();
    await page.getByTestId(`input-${action}`).tap();
    const packet = await until(() => inputs.find(i => i.frame.seq > seq && i.frame[action])?.frame, `${action} button frame`);
    await until(() => ack >= packet.seq, `${action} button ack`);
    assert(!packet.fire, 'button taps must not attack');
    await sleep(150);
    assert.equal(inputs.filter(i => i.frame.seq > seq && i.frame[action]).length, 1, 'button action must be edge-triggered');
    check(`${action} button: one edge, no attack`, { seq: packet.seq, ack });
  }
  await page.evaluate(() => { (window as any).__motion.absolute = true; });
  await page.getByTestId('motion-recalibrate').tap(); await sleep(450);
  await pose(45, 20); await sleep(300);
  assert(inputs.at(-1)!.frame.move[0] > 0.5);
  check('deviceorientationabsolute + recalibrate', { move: inputs.at(-1)!.frame.move });
  await pose(45, 0);
  await page.getByTestId('input-debug').waitFor();
  assert((await page.getByTestId('input-debug').innerText()).includes('|a|'));
  await page.screenshot({ path: join(output, 'portrait-motion.png') });
  assert(consoleLog.some(line => line.includes('motion-v2 real input active')));
  assert.equal(errors.length, 0, errors.join('\n'));
  pass = true;
} catch (error) {
  failure = String(error); process.exitCode = 1;
  await page.screenshot({ path: join(output, 'failure.png'), timeout: 4000 }).catch(() => {});
} finally {
  const result = { pass, failure, base, viewport: { width: 390, height: 844, dpr: 3 },
    proof: 'real DEV UI input -> WebSocket -> authoritative simulation snapshots; synthetic sensors, no physical phone; Vite HMR held inert in this tab only',
    checks, errors, snapshots, inputs: inputs.length, ack, player: me(), consoleLog };
  writeFileSync(join(output, 'summary.json'), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(output, 'inputs.json'), `${JSON.stringify(inputs, null, 2)}\n`);
  console.log(JSON.stringify({ output, pass, failure, checks: checks.length, snapshots, inputs: inputs.length, errors }, null, 2));
  await browser.close();
}
