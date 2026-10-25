/** Isolated headset wiring acceptance: sealed synthetic identity, real rooms/controller-link, fake XR stage. */
import http from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { createServer } from 'vite';
import { WebSocketServer } from 'ws';
import { RoomServer } from '../server/rooms';
import { handleControllerRoute } from '../server/controller-http';
import { handleEduRoute } from '../server/edu-http';
import { getSession, handleAuthRoute, seal } from '../auth';
import { profileFromFiles } from '../analysis/graph';
import { createMatch, playerKitFromProfile, bossKitFromProfile } from '../sim';
import { defaultRubric } from '../rubric';

Object.assign(process.env, { AUTH0_DOMAIN: 'headset-fixture.auth0.invalid', AUTH0_CLIENT_ID: 'fixture', AUTH0_CLIENT_SECRET: 'fixture',
  AUTH0_COOKIE_SECRET: 'headset-fixture', AUTH0_MGMT_CLIENT_ID: 'fixture', AUTH0_MGMT_CLIENT_SECRET: 'fixture', AUTH0_CONNECTION: 'github' });
const output = `/tmp/gitzilla-headset-${new Date().toISOString().replace(/[:.]/g, '-')}`;
mkdirSync(output, { recursive: true });
const results: string[] = [], errors: string[] = [];
let checkpoint = "boot";
const server = http.createServer(), wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => { if (req.url === '/ws') wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req)); });
const rooms = new RoomServer(wss, { getSession, getGithubToken: async () => null,
  analyzeRepo: async slug => profileFromFiles(slug, [{ path: 'src/main.ts', text: 'export const hello = 42;' }]),
  listFallbackRepos: () => ['fixture/hero', 'fixture/boss'], playerKitFromProfile, bossKitFromProfile, createMatch, defaultRubric });
const vite = await createServer({ envDir: false, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
server.on('request', (req, res) => { void (async () => {
  const url = new URL(req.url!, 'http://localhost');
  if (url.pathname === '/api/me/repos' || url.pathname === '/api/fallbacks') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(url.pathname.endsWith('repos') ? [] : ['fixture/hero', 'fixture/boss'])); return; }
  if (await handleControllerRoute(req, res, url, rooms)) return;
  if (await handleEduRoute(req, res, url, rooms)) return;
  if (await handleAuthRoute(req, res)) return;
  vite.middlewares(req, res);
})().catch(error => { res.statusCode = 500; res.end(String(error)); }); });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const value = seal({ userId: 'github|42', login: 'headset-fixture', avatar: '' }, createHash('sha256').update('gitzilla:headset-fixture').digest(), 600);
function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
async function check(page: Page, predicate: () => boolean, message: string) { await page.waitForFunction(predicate, null, { timeout: 15000 }); results.push(message); }
async function setup(browser: Browser, headset = true) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: headset });
  await context.addCookies([{ name: 'rk_session', value, url: base, httpOnly: true }]);
  await context.addInitScript("globalThis.__name = (value) => value");
  await context.addInitScript(() => {
    localStorage.setItem('kaiju.name', 'Headset Player'); localStorage.setItem('kaiju.view25d', '0');
    (window as any).__traffic = []; (window as any).__motionCalls = 0; (window as any).__stageRenders = 0;
    const Native = WebSocket;
    window.WebSocket = class extends Native {
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args);
        this.addEventListener('message', event => { try { const message = JSON.parse(String(event.data)); if (message.t === 'welcome') (window as any).__seat = message.you; } catch {} });
      }
      send(data: any) { try { (window as any).__traffic.push(JSON.parse(data)); } catch {} super.send(data); } };
    Object.defineProperty(navigator, 'xr', { configurable: true, value: { isSessionSupported: async () => true } });
    for (const sensor of [window.DeviceMotionEvent, window.DeviceOrientationEvent]) if (sensor) Object.defineProperty(sensor, 'requestPermission', { configurable: true, value: async () => { (window as any).__motionCalls++; return 'granted'; } });
    (window as any).__kaijuStage25d = { xrSupported: async () => true, createStage25d: () => ({
      canvas: document.createElement('canvas'), render() { (window as any).__stageRenders++; }, resize() {}, destroy() {},
      screenToWorld: (x: number, y: number) => ({ x, y }), worldToScreen: (x: number, y: number) => ({ x, y, scale: 1 }),
      setFollow(id: string) { (window as any).__follow = id; }, enterXR: async () => { (window as any).__entered = true; },
    }) };
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  return { context, page };
}
try {
  for (const [label, launcher] of [['webkit', webkit], ['chromium', chromium]] as const) {
    const browser = await launcher.launch(label === 'chromium' ? { executablePath: '/usr/bin/chromium' } : {});
    try {
      const { context, page } = await setup(browser);
      const room = rooms.createRoom();
      await page.goto(`${base}/r/${room}?device=headset`);
      await check(page, () => (globalThis as any).__kaijuDevice === 'headset', `${label}: headset override resolved`);
      await page.getByTestId('pair-panel').locator('.pr-steps').waitFor();
      assert(await page.getByTestId('pair-panel').evaluate(el => el.classList.contains('required')), 'missing required pair variant');
      assert(await page.getByTestId('settings-dialog').isVisible() === false, 'headset onboarding prompt shown');
      await page.getByTestId('settings-open').click();
      assert(await page.getByTestId('controls-card').count() === 0, 'headset settings motion card shown');
      await page.getByTestId('settings-close').click();
      await page.getByTestId('player-repo-input').fill('fixture/hero'); await page.getByTestId('player-repo-submit').click();
      await page.getByTestId('boss-repo-input').fill('fixture/boss'); await page.getByTestId('boss-repo-submit').click();
      await page.locator('[data-testid="player-ready"][data-status="ready"]').waitFor();
      await page.locator('[data-testid="boss-ready"][data-status="ready"]').waitFor();
      await check(page, () => (window as any).__traffic.some((m: any) => m.t === 'controls' && m.needsController && m.ready === false), `${label}: negative needsController declaration`);
      assert(await page.getByTestId('start-match').isDisabled(), 'unpaired headset START enabled');
      results.push(`${label}: required pair card, no motion flow, unpaired START blocked`);
      await page.screenshot({ path: `${output}/${label}-unpaired.png` });
      const phoneContext = await browser.newContext(); await phoneContext.addCookies([{ name: 'rk_session', value, url: base, httpOnly: true }]);
      const phone = await phoneContext.newPage(); await phone.goto(base);
      await phone.evaluate(async code => {
        const modulePath = '/client/app/controller-link.ts';
        const { createControllerLink } = await import(/* @vite-ignore */ modulePath);
        const link = (window as any).__controller = createControllerLink({ room: code });
        link.send({ t: 'controls', ready: true, mode: 'tap-only' });
      }, room);
      await page.waitForFunction(() => !(document.querySelector('[data-testid="start-match"]') as HTMLButtonElement)?.disabled);
      results.push(`${label}: real controller-link readiness enables headset START`);
      checkpoint = `${label}: display reconnect`;
      await page.reload(); await page.getByTestId('pair-connected').waitFor();
      await page.waitForFunction(() => !(document.querySelector('[data-testid="start-match"]') as HTMLButtonElement)?.disabled);
      assert(await page.evaluate(() => (window as any).__traffic.filter((m: any) => m.t === 'controls').every((m: any) => m.needsController === true && m.ready === false)), 'headset self-reported positive readiness');
      checkpoint = `${label}: game 3D and local controls policy`;
      await page.getByTestId('start-match').click();
      await page.waitForFunction(() => (window as any).__stageRenders > 0);
      await page.getByTestId('xr-enter').waitFor();
      await page.waitForFunction(() => { const self = (window as any).__traffic.find((m: any) => m.t === 'hello'); return !!self && (document.querySelector('[data-testid="xr-follow"]') as HTMLSelectElement)?.value === (window as any).__seat && (window as any).__follow === (window as any).__seat; });
      assert(await page.getByTestId('motion-gate').count() === 0, 'headset match permission gate');
      assert(await page.evaluate(() => (window as any).__traffic.every((m: any) => m.t !== 'input') && (window as any).__motionCalls === 0), 'headset sends local input or requests sensors');
      await page.getByTestId('xr-enter').click(); assert(await page.evaluate(() => (window as any).__entered === true), 'XR button did not invoke stage');
      await page.screenshot({ path: `${output}/${label}-game.png` });
      results.push(`${label}: default3D despite saved2D, own-hero follow, gesture XR entry, zero local inputs/sensor requests after reconnect`);
      const forced = await context.newPage(); await forced.goto(`${base}/?device=headset&view=2d`);
      assert(await forced.evaluate(async () => { const path = '/client/app/view25d.ts'; return !(await import(/* @vite-ignore */ path)).view25dWanted(); }), 'view2d override lost');
      checkpoint = `${label}: classroom projector routing`;
      const edu = rooms.createRoom(undefined, 'edu'); const classroom = await context.newPage(); await classroom.goto(`${base}/r/${edu}?device=headset`);
      await classroom.waitForURL(/screen=1.*view=projector/); await classroom.locator('.classroom-screen').waitFor();
      assert(await classroom.getByTestId('pair-panel').count() === 0, 'edu headset requires pairing');
      assert(rooms.roomInfo(edu).players === 0, 'edu headset retained a student slot');
      results.push(`${label}: explicit2D override; edu headset projector-only with no fighter slot`);
      for (const kind of ['desktop', 'phone']) {
        const other = await setup(browser, false); await other.page.goto(`${base}/?device=${kind}`);
        assert(await other.page.evaluate(expected => (window as any).__kaijuDevice === expected, kind), `override ${kind}`);
        const checkLocal = await other.page.evaluate(async () => { const path = '/client/app/device.ts'; return (await import(/* @vite-ignore */ path)).usesLocalControls(); });
        assert(checkLocal, `${kind} local input disabled`); await other.context.close();
      }
      results.push(`${label}: desktop/phone overrides retain local controls`);
      await phoneContext.close(); await context.close();
    } finally { await browser.close(); }
  }
  assert(errors.length === 0, errors.join('\n'));
  writeFileSync(`${output}/summary.json`, JSON.stringify({ pass: true, results, errors, evidence: 'WebKit+Chromium, real rooms + controller-link + sealed synthetic Auth0 cookie; fake navigator.xr/stage, no physical device or GPU rendering claim' }, null, 2));
  console.log(JSON.stringify({ output, pass: true, results, errors }));
} catch (error) {
  writeFileSync(`${output}/summary.json`, JSON.stringify({ pass: false, results, errors, checkpoint, failure: String(error) }, null, 2));
  console.error(JSON.stringify({ output, pass: false, results, errors, checkpoint, failure: String(error) })); process.exitCode = 1;
} finally {
  rooms.close(); for (const socket of wss.clients) socket.terminate();
  await vite.close(); await new Promise<void>(resolve => wss.close(() => resolve()));
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
}
