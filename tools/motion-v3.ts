/** Real DEV app + authoritative snapshots. Synthetic sensors are not physical-phone acceptance. */
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import type { InputFrame, LobbyState, MatchState, ServerMsg } from '../shared/types';
import { playtestBaseURL } from './playtest';
import { startMotionFixture } from './motion-fixture';
import { completeLandingOnboarding, openControlSettings, closeControlSettings } from './onboarding';

const appBase = playtestBaseURL(process.env.MOTION_URL || process.env.PLAYTEST_URL);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'docs/shots', `${new Date().toISOString().replace(/[:.]/g, '-')}-motion-v3`);
mkdirSync(output, { recursive: true });
// Default isolates input proofs from combat damage. Opt-in combat mode remains diagnostic.
const fixture = process.env.MOTION_COMBAT === '1' ? null : await startMotionFixture(appBase, join(output, 'traces'));
const base = fixture?.url ?? appBase;
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/chromium') });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await context.newPage();
page.setDefaultTimeout(20_000);
let selfId = '';
let state: MatchState | undefined;
let lobby: LobbyState | undefined;
const starts: { at: number }[] = [];
const controls: { at: number; ready: boolean; mode: string }[] = [];
let ack = -1;
let snapshots = 0;
const inputs: { at: number; frame: InputFrame }[] = [];
const bullets = new Set<number>();
const checks: { check: string; evidence: unknown }[] = [];
const errors: string[] = [];
const consoleLog: string[] = [];
const traceUploads: { source?: string; status: number; response: unknown; samples: number; gyro: boolean; gestures: string[] }[] = [];
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
  assert(me()?.alive, `${label}: authoritative proof requires the protected player alive`);
  await until(() => [...bullets].some(id => !oldBullets.has(id)), `${label} authoritative shot`);
  assert.equal(packet.source, 'motion'); assert.equal(packet.aim, null);
  assert(!packet.dash && !packet.skill, 'attacks must never trigger dash or skill');
  if (label.startsWith('any-axis swing')) assert(Math.hypot(...packet.move) < 0.1, 'swing orientation noise must be frozen');
  check(label, { seq: packet.seq, ack, newOwnBullets: [...bullets].filter(id => !oldBullets.has(id)).length,
    alive: me()?.alive, shotProof: 'authoritative projectile' });
}

try {
  // Keep this tab on the tested client revision while parallel UI edits trigger Vite
  // reloads. Only HMR is held inert; the authoritative game /ws is never intercepted.
  // DEV watcher currently ignores the checkout's /data/ ancestor. Fetch current owned
  // app/input/style source by revision query; only native permission responses and
  // sensor signals are mocked. App readiness/state and game /ws remain real.
  const revision = Date.now();
  await page.route(url => /^\/client\/(?:app\/|input\/|style\.css$)/.test(url.pathname), route => {
    const url = new URL(route.request().url()); url.searchParams.set('input-revision', String(revision));
    return route.continue({ url: url.toString() });
  });
  await page.routeWebSocket(url => url.pathname !== '/ws', socket => {
    socket.send(JSON.stringify({ type: 'connected' }));
  });
  await context.addInitScript('window.__kaijuSyntheticSensors = true;');
  await context.addInitScript(`(() => {
    if (location.protocol.startsWith('http')) localStorage.setItem('kaiju.name', 'motion-v3');
    const w = window;
    w.__permissionStates = [];
    window.addEventListener('kaiju:motion-permission', event => w.__permissionStates.push(event.detail));
    w.__permissionCalls = []; w.__permissionDecision = 'denied'; w.__holdPermission = false; w.__permissionResolvers = [];
    for (const key of ['DeviceMotionEvent', 'DeviceOrientationEvent']) {
      Object.defineProperty(w[key], 'requestPermission', { configurable: true, value: () => {
        const event = w.event;
        const active = navigator.userActivation.isActive;
        const accepted = active && event?.isTrusted && ['touchend', 'click'].includes(event.type);
        w.__permissionCalls.push({ api: key, event: event?.type, trusted: event?.isTrusted, active, accepted, decision: w.__holdPermission ? 'pending' : w.__permissionDecision });
        if (!accepted) return Promise.resolve('denied');
        if (w.__holdPermission) return new Promise(resolve => w.__permissionResolvers.push(resolve));
        return Promise.resolve(w.__permissionDecision);
      } });
    }
    Object.defineProperty(screen.orientation, 'angle', { configurable: true, get: () => 0 });
    w.__motion = { enabled: false, beta: 0, gamma: 0, absolute: false, rate: { alpha: 0, beta: 0, gamma: 0 }, nullAcceleration: false, gravityZ: 9.81, circleStart: null, circleTilted: false };
    window.setInterval(() => {
      const m = w.__motion;
      if (!m.enabled) return;
      window.dispatchEvent(new DeviceOrientationEvent(m.absolute ? 'deviceorientationabsolute' : 'deviceorientation', { beta: m.beta, gamma: m.gamma, alpha: 0, absolute: m.absolute }));
      const a = (performance.now() - m.circleStart) / 1000 * Math.PI * 2;
      const c = 15 * Math.cos(a), s = 15 * Math.sin(a);
      const acceleration = m.circleStart === null ? {x:0,y:0,z:0} : m.circleTilted
        ? {x:c*Math.SQRT1_2-s/Math.sqrt(6),y:c*Math.SQRT1_2+s/Math.sqrt(6),z:s*2/Math.sqrt(6)} : {x:c,y:0,z:s};
      window.dispatchEvent(new DeviceMotionEvent('devicemotion', { acceleration: m.nullAcceleration ? null : acceleration, accelerationIncludingGravity: { x: 0, y: 0, z: m.gravityZ }, rotationRate: m.rate, interval: 30 }));
    }, 30);
  })();`);
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('response', async response => {
    if (new URL(response.url()).pathname !== '/api/trace' || response.request().method() !== 'POST') return;
    const body = response.request().postDataJSON();
    traceUploads.push({ source: body.source, status: response.status(), response: '201 confirms server stored payload; body inspected via trace listing separately', samples: body.samples?.length ?? 0,
      gyro: body.samples?.some((s: any) => s.rotationRate && Object.values(s.rotationRate).some(v => typeof v === 'number' && Math.abs(v) > 0)),
      gestures: body.samples?.filter((s: any) => s.type === 'gesture' && s.via).map((s: any) => `${s.via}:${s.kind}`) ?? [] });
  });
  page.on('console', message => {
    consoleLog.push(`${message.type()}: ${message.text()}`);
    if (/placeholder|PHONE INPUT FAILURE/.test(message.text()) && message.type() === 'error') errors.push(message.text());
  });
  page.on('websocket', socket => {
    if (new URL(socket.url()).pathname !== '/ws') return;
    socket.on('socketerror', error => errors.push(`WS: ${error}`));
    socket.on('framesent', frame => {
      const msg = JSON.parse(frame.payload.toString());
      if (msg.t === 'start') starts.push({ at: Date.now() });
      if (msg.t === 'controls') controls.push({ at: Date.now(), ready: msg.ready, mode: msg.mode });
      if (msg.t === 'input') inputs.push({ at: Date.now(), frame: msg.frame });
    });
    socket.on('framereceived', frame => {
      const msg = JSON.parse(frame.payload.toString()) as ServerMsg;
      if (msg.t === 'welcome') { selfId = msg.you; lobby = msg.lobby; }
      if (msg.t === 'lobby') lobby = msg.lobby;
      if (msg.t === 'snapshot') {
        state = msg.state; ack = msg.ack; snapshots++;
        for (const bullet of state.bullets) if (bullet.owner === selfId) bullets.add(bullet.id);
      }
      if (msg.t === 'error') errors.push(`protocol: ${msg.message}`);
    });
  });
  await page.goto(`${base}/?debug=input`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('create-room').waitFor({ state: 'visible' });
  const onboarding = await completeLandingOnboarding(page, { controls: 'motion', touch: true });
  const permissionBase = await page.evaluate(() => (window as any).__permissionCalls.length);
  const expectedNativeCalls = permissionBase + 4;
  check('first-run onboarding selects motion and uses real Continue', { ...onboarding, nativeCalls: permissionBase });
  await page.getByTestId('create-room').click();
  await page.waitForURL(/\/r\/[A-Z]{4}/);
  await page.getByTestId('player-repo-input').fill('lodash/lodash');
  await page.getByTestId('player-repo-submit').tap();
  await page.locator('[data-testid="player-ready"][data-status="ready"]').waitFor({ timeout: 45_000 });
  await page.getByTestId('boss-repo-input').fill('pallets/flask');
  await page.getByTestId('boss-repo-submit').tap();
  await page.locator('[data-testid="boss-ready"][data-status="ready"]').waitFor({ timeout: 45_000 });
  // Three normal AI teammates draw aggro so this control test can run without a human dodging.
  for (let i = 0; i < 3; i++) { await page.getByTestId('bots-plus').tap(); await sleep(120); }
  const start = page.locator('[data-testid="start-match"]:visible');
  const enable = page.getByTestId('controls-motion');
  const mine = () => lobby?.players.find(player => player.id === selfId);
  const assertLobbyBlocked = async (label: string) => {
    await until(() => mine()?.controlsReady === false, `${label}: server controlsReady=false`);
    await start.waitFor({ state: 'visible' });
    assert(await start.isDisabled(), `${label}: real START must be disabled`);
    assert.equal(lobby?.phase, 'lobby');
    assert.equal(starts.length, 0, 'no start message may precede actual readiness');
    assert.equal(snapshots, 0, 'permission cases must run before the match/countdown');
    check(label, { phase: lobby?.phase, controlsReady: mine()?.controlsReady, startDisabled: true, startMessages: starts.length });
  };
  assert.equal(await page.evaluate(() => (window as any).__permissionCalls.length), permissionBase);
  await assertLobbyBlocked('lobby initially blocks START until motion is enabled');

  // Consent denial is tested in the real pre-fight controls card, never in-game.
  await openControlSettings(page);
  await enable.click();
  await closeControlSettings(page);
  let permissions = await page.evaluate(() => (window as any).__permissionCalls);
  assert.equal(permissions.length, permissionBase + 2);
  assert(permissions.slice(permissionBase).every((p: any) => p.event === 'click' && p.active && p.trusted && p.accepted && p.decision === 'denied'));
  await until(() => controls.some(control => !control.ready), 'unready controls report');
  await assertLobbyBlocked('denied lobby permission keeps native controls unready and START blocked');
  check('both lobby native permission APIs run synchronously in trusted active click', permissions.slice(permissionBase));

  await page.evaluate(() => { const w = window as any; w.__permissionDecision = 'granted'; w.__holdPermission = true; });
  await openControlSettings(page);
  await enable.click();
  await closeControlSettings(page);
  permissions = await page.evaluate(() => (window as any).__permissionCalls);
  assert.equal(permissions.length, expectedNativeCalls, 'real retry must call both APIs again');
  assert(permissions.slice(permissionBase + 2).every((p: any) => p.event === 'click' && p.active && p.trusted && p.accepted && p.decision === 'pending'));
  await page.evaluate(() => { (window as any).__motion.enabled = true; }); await sleep(150);
  assert(!(await page.evaluate(() => (window as any).__permissionStates.some((snapshot: any) => snapshot.ready))), 'pre-grant readings must not ready the phone');
  await assertLobbyBlocked('pending native prompt ignores sensor samples and keeps START blocked');

  await page.evaluate(() => {
    const w = window as any; w.__motion.enabled = false; w.__holdPermission = false;
    for (const resolve of w.__permissionResolvers.splice(0)) resolve('granted');
  });
  await sleep(150);
  // Skipping training is a normal UI action. It must not bypass permission/readiness.
  if (await page.getByTestId('training-skip').isVisible()) await page.getByTestId('training-skip').click();
  await assertLobbyBlocked('native granted without fresh readings still blocks START');
  await page.screenshot({ path: join(output, 'lobby-granted-awaiting-sensors.png') });
  await sleep(1600);
  await assertLobbyBlocked('no sensor events after grant remain unready in the lobby');

  await page.evaluate(() => { (window as any).__motion.enabled = true; });
  await until(() => mine()?.controlsReady === true, 'fresh sensor readings -> real server controlsReady');
  const readyDeadline = Date.now() + 5000;
  while (!await start.isEnabled() && Date.now() < readyDeadline) await sleep(40);
  assert(await start.isEnabled(), 'START enabled only after native grant AND fresh sensor readings');
  assert(controls.some(control => control.ready && control.mode === 'standard'), 'real controls ready message must reach server');
  check('fresh lobby readings set controlsReady and enable real START', { controlsReady: mine()?.controlsReady, reports: controls, nativeCalls: permissions.length });
  await page.screenshot({ path: join(output, 'lobby-ready.png') });
  await start.click();
  await page.getByTestId('game-canvas').waitFor();
  await page.locator('[data-testid="input-sensors"][data-status="on"]').waitFor();
  await until(() => state?.status === 'fighting', 'real fighting snapshots');
  assert.equal(starts.length, 1);
  if (fixture) {
    assert(fixture.protectedPlayers.includes(selfId));
    assert(me()?.alive && me()!.invuln > 0, 'test-only protection must be active in real authoritative simulation');
    check('isolated test-only player protection is active', { appBase, backend: base, protected: selfId });
  }
  assert.equal(await page.evaluate(() => (window as any).__permissionCalls.length), expectedNativeCalls, 'lobby grant must carry into game without a new native request');
  assert(!(await page.getByTestId('motion-gate').isVisible()), 'ready lobby entry must not show countdown permission overlay');
  check('only ready lobby entry starts match and carries native grant into game', { starts: starts.length, source: inputs.at(-1)?.frame.source, nativeCalls: expectedNativeCalls });

  // Preserve in-game loss/recovery coverage after the legitimate pre-fight gate.
  const lostSeq = lastSeq();
  await page.evaluate(() => { (window as any).__motion.enabled = false; });
  await page.locator('[data-testid="input-sensors"][data-mode="touch"]').waitFor();
  const fallbackPacket = await until(() => inputs.find(input => input.frame.seq > lostSeq && input.frame.source === 'touch')?.frame, 'in-game sensor loss fallback frame');
  await until(() => ack >= fallbackPacket.seq, 'server ack for sensor-loss fallback');
  assert.equal(await page.locator('.kj-touch-button,.kj-touch-joystick-zone,[data-testid=input-dash],[data-testid=input-skill]').count(), 0);
  check('in-game lost sensors fall back to touch without virtual controls', { seq: fallbackPacket.seq, ack, mode: 'touch' });
  await page.screenshot({ path: join(output, 'game-sensors-lost.png') });
  await page.evaluate(() => { (window as any).__motion.enabled = true; });
  await page.locator('[data-testid="input-sensors"][data-status="on"]').waitFor();
  await page.getByTestId('motion-gate').waitFor({ state: 'hidden' });
  const recovered = await until(() => inputs.find(input => input.frame.seq > fallbackPacket.seq && input.frame.source === 'motion')?.frame, 'recovered motion input');
  await until(() => ack >= recovered.seq, 'server ack for recovered motion');
  await sleep(250);
  assert.equal(await page.evaluate(() => (window as any).__permissionCalls.length), expectedNativeCalls);
  check('fresh in-game readings recover motion and dismiss gate without re-request', { seq: recovered.seq, ack, horizontalReference: [0, 0] });
  for (const direction of [
    { name: 'right roll', beta: 0, gamma: 15, axis: 'x', sign: 1 },
    { name: 'left roll', beta: 0, gamma: -15, axis: 'x', sign: -1 },
    { name: 'down pitch', beta: 15, gamma: 0, axis: 'y', sign: 1 },
    { name: 'up pitch', beta: -15, gamma: 0, axis: 'y', sign: -1 },
  ] as const) {
    await pose(0, 0); await sleep(200);
    const before = { x: me()!.x, y: me()!.y };
    const seq = lastSeq();
    await pose(direction.beta, direction.gamma); await sleep(550);
    const after = { x: me()!.x, y: me()!.y };
    const delta = after[direction.axis] - before[direction.axis];
    assert(delta * direction.sign > 5, `${direction.name}: expected snapshot movement, got ${delta}`);
    assert(inputs.some(i => i.frame.seq > seq && i.frame.move[direction.axis === 'x' ? 0 : 1] * direction.sign > 0.5));
    check(`snapshot movement: ${direction.name}`, { before, after, delta });
  }
  await pose(0, 0); await sleep(250);
  await attackEvidence('short tap reaches server + shoots', () => page.touchscreen.tap(120, 350));
  const cdp = await context.newCDPSession(page);
  async function actionEvidence(action: 'dash' | 'skill', label: string, trigger: () => Promise<unknown>) {
    await sleep(750);
    const seq = lastSeq();
    await trigger();
    const packet = await until(() => inputs.find(i => i.frame.seq > seq && i.frame[action])?.frame, label);
    await until(() => ack >= packet.seq, `${label} ack`);
    await sleep(400);
    const frames = inputs.filter(i => i.frame.seq > seq).map(i => i.frame);
    assert.equal(frames.filter(f => f[action]).length, 1, 'exactly one gesture edge');
    assert(frames.every(f => !f.fire && !(action === 'skill' ? f.dash : f.skill)), 'gesture cannot leak attack or other action');
    check(label, { seq: packet.seq, ack, frames: frames.length, move: packet.move });
    return packet;
  }
  await actionEvidence('skill', 'long-press skills once; no held fire or release attack', async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 350 }] });
    await sleep(350);
    assert(await page.getByTestId('input-charge').isVisible(), 'charging feedback');
    assert(!inputs.at(-1)!.frame.fire);
    await sleep(450);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  });
  await actionEvidence('dash', 'double-tap dash (no gyro required)', async () => {
    await page.touchscreen.tap(120, 350); await sleep(90); await page.touchscreen.tap(120, 350);
  });
  const setRate = async (alpha: number, beta = 0, gamma = 0) => page.evaluate(([alpha, beta, gamma]) => {
    (window as any).__motion.rate = { alpha, beta, gamma };
  }, [alpha, beta, gamma]);
  async function circleEvidence(tilted: boolean) {
    await actionEvidence('skill', `translation circle ${tilted ? 'tilted plane' : 'x-z plane'} skills once, no swing/dash leak`, async () => {
      await page.evaluate(tilted => Object.assign((window as any).__motion, {circleStart:performance.now(),circleTilted:tilted,rate:{alpha:2,beta:0,gamma:0}}), tilted);
      await sleep(1080);
      await page.evaluate(() => { Object.assign((window as any).__motion,{circleStart:null,rate:{alpha:0,beta:0,gamma:0}}); });
      await sleep(150);
    });
  }
  // Keep one circle and one tilt dash inside the automatic first20s trace.
  await circleEvidence(false);
  for (const direction of [
    {beta:0,gamma:-50,axis:0,sign:-1}, {beta:-50,gamma:0,axis:1,sign:-1},
    {beta:0,gamma:50,axis:0,sign:1}, {beta:50,gamma:0,axis:1,sign:1},
  ]) {
    await pose(0,0); await sleep(300);
    await until(()=>me()!.dashCd<=0,'server dash cooldown settled');
    const before={x:me()!.x,y:me()!.y};
    const packet=await actionEvidence('dash', `hard tilt directional dash ${direction.beta},${direction.gamma}`,async()=>{
      await pose(direction.beta,direction.gamma);await sleep(direction.gamma<0?900:350);
      await pose(0,0);await sleep(200);
    });
    assert(packet.move[direction.axis]*direction.sign>.99,'dash edge uses captured downhill direction');
    const delta=direction.axis===0?me()!.x-before.x:me()!.y-before.y;
    assert(delta*direction.sign>3,'authoritative player moved in dash direction');
  }
  await circleEvidence(true);
  await sleep(750);
  const wheelSeq = inputs.at(-1)?.frame.seq ?? -1;
  await setRate(0, 600); await sleep(650); await setRate(0); await sleep(250);
  assert(inputs.some(i => i.frame.seq > wheelSeq), 'wheel negative test received real input frames');
  assert(inputs.filter(i => i.frame.seq > wheelSeq).every(i => !i.frame.skill && !i.frame.dash && !i.frame.fire));
  check('steering-wheel rotation no longer casts skill or another action', { wheelSeq, ack });
  for (const axis of [0,1,2]) {
    const seq=lastSeq(),vector=[0,0,0];vector[axis]=300;
    await setRate(...vector as [number,number,number]);await sleep(100);
    await setRate(...vector.map(v=>-v) as [number,number,number]);await sleep(100);
    await setRate(0);await sleep(200);
    assert(inputs.filter(i=>i.frame.seq>seq).every(i=>!i.frame.dash&&!i.frame.skill&&!i.frame.fire));
  }
  check('removed gyro twist on all three axes cannot trigger actions',{ack});
  // Directional dashes can leave the player next to the boss, where a bullet
  // hits before the next20Hz snapshot. Retreat using normal tilt controls so
  // each subsequent swing has an observable authoritative projectile in flight.
  await pose(0, -15);
  await until(() => me()!.x < 95, 'retreat after tilt dashes for projectile visibility', 4000);
  await pose(0, 0); await sleep(300);
  for (const a of [[1.6, 0, 0], [-1.6, 0, 0], [0, 1.6, 0], [0, -1.6, 0], [0, 0, 1.6], [0, 0, -1.6]]) {
    await attackEvidence(`any-axis swing ${a.join(',')}`, () => page.evaluate(([x, y, z]) => {
      window.dispatchEvent(new DeviceMotionEvent('devicemotion', { acceleration: { x, y, z }, interval: 30 }));
      // Orientation noise immediately following a swing must not move the hero.
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 80, gamma: 60 }));
    }, a));
  }
  await sleep(700);
  await attackEvidence('iOS null acceleration: gravity high-pass swing', async () => {
    await page.evaluate(() => { (window as any).__motion.nullAcceleration = true; });
    await sleep(100);
    await page.evaluate(() => {
      window.dispatchEvent(new DeviceMotionEvent('devicemotion', {
        accelerationIncludingGravity: { x: 0, y: 0, z: 28 }, rotationRate: { alpha: 0, beta: 0, gamma: 0 }, interval: 30 }));
    });
    await page.evaluate(() => { (window as any).__motion.nullAcceleration = false; });
  });
  // Regression: attack gestures must not zero an already tilted phone's movement.
  for (const via of ['tap', 'swing'] as const) {
    await pose(0, 0); await sleep(700);
    await pose(0, 15); await sleep(200);
    assert(me()?.alive, 'movement + attack needs a living player for authoritative proof');
    const before = { x: me()!.x, y: me()!.y };
    const oldBullets = new Set(bullets), seq = lastSeq();
    if (via === 'tap') await page.touchscreen.tap(120, 350);
    else await page.evaluate(() => {
      window.dispatchEvent(new DeviceMotionEvent('devicemotion', { acceleration: { x: 15, y: 0, z: 0 }, interval: 30 }));
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 80, gamma: -60 }));
    });
    const packet = await until(() => inputs.find(i => i.frame.seq > seq && i.frame.fire && i.frame.move[0] > 0.8)?.frame, `${via} fires while moving`);
    await until(() => ack >= packet.seq && me()!.x - before.x > 5 && [...bullets].some(id => !oldBullets.has(id)), `${via} authoritative movement and own projectile`);
    check(`tilt + ${via}: moving and attacking together`, { seq: packet.seq, ack, move: packet.move, deltaX: me()!.x - before.x, newOwnBullets: [...bullets].filter(id => !oldBullets.has(id)).length });
  }
  await page.evaluate(() => { (window as any).__motion.absolute = true; });
  if (await page.getByTestId('motion-recalibrate').isVisible()) await page.getByTestId('motion-recalibrate').tap();
  await sleep(450);
  await pose(0, 15); await sleep(300);
  assert(inputs.at(-1)!.frame.move[0] > 0.5);
  check('deviceorientationabsolute + recalibrate', { move: inputs.at(-1)!.frame.move });
  await pose(0, 0);
  await page.getByTestId('input-debug').waitFor();
  assert((await page.getByTestId('input-debug').innerText()).includes('|a|'));
  await page.screenshot({ path: join(output, 'portrait-motion.png') });
  const uploaded = await until(() => traceUploads.find(trace => trace.source === 'fight'), '20s sensor trace uploaded to real DEV endpoint');
  assert.equal(uploaded.status, 201); assert(uploaded.samples > 100 && uploaded.gyro);
  for (const gesture of ['tap:attack', 'long-press:skill', 'double-tap:dash', 'tilt-dash:dash', 'spin:skill']) assert(uploaded.gestures.includes(gesture), gesture);
  check('automatic20s phone trace without trace flag stored by server', uploaded);
  assert.equal(errors.length, 0, errors.join('\n'));
  pass = true;
} catch (error) {
  failure = String(error); process.exitCode = 1;
  await page.screenshot({ path: join(output, 'failure.png'), timeout: 4000 }).catch(() => {});
} finally {
  const result = { pass, failure, base, viewport: { width: 390, height: 844, dpr: 3 },
    appBase, deterministicFixture: fixture ? { protection: fixture.protection, protectedPlayers: fixture.protectedPlayers, productionEnabled: false } : null,
    proof: 'staging UI + real isolated RoomServer/simulation with explicit test-only player protection (unless MOTION_COMBAT=1); real lobby native permission -> controlsReady -> enabled START -> game input -> WebSocket -> authoritative simulation snapshots; no ready bypass; strict trusted touchend/click permission mocks + synthetic sensors, no physical phone; Vite HMR held inert in this tab only',
    checks, errors, snapshots, inputs: inputs.length, ack, lobby, starts, controls, player: me(), consoleLog, traceUploads };
  writeFileSync(join(output, 'summary.json'), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(output, 'inputs.json'), `${JSON.stringify(inputs, null, 2)}\n`);
  console.log(JSON.stringify({ output, pass, failure, checks: checks.length, snapshots, inputs: inputs.length, errors }, null, 2));
  await browser.close();
  await fixture?.close();
}
