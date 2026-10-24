/** Real lobby, WebKit/iPhone, saved choices across a genuine page reload. DEV/staging only. */
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync } from 'node:fs';
import { devices, webkit } from 'playwright';
import type { LobbyState, ServerMsg } from '../shared/types';
import { playtestBaseURL } from './playtest';
const base = playtestBaseURL(process.env.MOTION_URL || process.env.PLAYTEST_URL);
const output = `docs/shots/${new Date().toISOString().replace(/[:.]/g, '-')}-permission-gate`;
mkdirSync(output, { recursive: true });
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage(); page.setDefaultTimeout(12000);
const checks: { check: string; evidence?: unknown }[] = [], errors: string[] = [];
let lobby: LobbyState | undefined, you = '', pass = false, failure: string | undefined;
const check = (name: string, evidence?: unknown) => { checks.push({ check: name, evidence }); console.log(`PASS ${name}`); };
try {
  const revision = Date.now();
  await page.route('**/client/input/**', route => { const url = new URL(route.request().url()); url.searchParams.set('input-revision', String(revision)); return route.continue({ url: url.toString() }); });
  await page.routeWebSocket(url => url.pathname !== '/ws', socket => socket.send(JSON.stringify({ type: 'connected' })));
  await context.addInitScript('window.__kaijuSyntheticSensors = true;');
  await context.addInitScript(String.raw`(()=>{
    localStorage.setItem('kaiju.name','permission-gate');
    window.__permissionCalls=[]; window.__sensorsEnabled=false; window.__pagePermissionEvents=[];
    window.addEventListener('kaiju:motion-permission',e=>window.__pagePermissionEvents.push(e.detail));
    for(const key of ['DeviceMotionEvent','DeviceOrientationEvent']) {
      const api=window[key] || function(){};
      if(!window[key]) Object.defineProperty(window,key,{configurable:true,value:api});
      Object.defineProperty(api,'requestPermission',{configurable:true,value:()=>{
        const event=window.event;
        const accepted=event?.type==='click' && event.isTrusted && navigator.userActivation.isActive;
        window.__permissionCalls.push({api:key,event:event?.type,trusted:event?.isTrusted,active:navigator.userActivation.isActive,accepted});
        return Promise.resolve(accepted?'granted':'denied');
      }});
    }
    setInterval(()=>{
      if(!window.__sensorsEnabled)return;
      const e=new Event('deviceorientation');
      for(const [key,value] of Object.entries({beta:0,gamma:0,alpha:0}))Object.defineProperty(e,key,{value});
      dispatchEvent(e);
    },30);
  })();`);
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('websocket', socket => {
    if (new URL(socket.url()).pathname !== '/ws') return;
    socket.on('socketerror', e => errors.push(String(e)));
    socket.on('framereceived', frame => {
      const message = JSON.parse(frame.payload.toString()) as ServerMsg;
      if (message.t === 'welcome') { you = message.you; lobby = message.lobby; }
      if (message.t === 'lobby') lobby = message.lobby;
      if (message.t === 'error') errors.push(message.message);
    });
  });
  await page.goto(`${base}/?debug=input`);
  await page.getByTestId('create-room').click(); await page.waitForURL(/\/r\/[A-Z]{4}/);
  await page.getByTestId('player-repo-input').fill('lodash/lodash'); await page.getByTestId('player-repo-submit').click();
  await page.locator('[data-testid="player-ready"][data-status="ready"]').waitFor({ timeout: 45000 });
  await page.getByTestId('boss-repo-input').fill('pallets/flask'); await page.getByTestId('boss-repo-submit').click();
  await page.locator('[data-testid="boss-ready"][data-status="ready"]').waitFor({ timeout: 45000 });
  const enable = page.getByRole('button', { name: /tap to enable motion/i });
  await enable.waitFor();
  assert.equal(await page.evaluate(() => (window as any).__permissionCalls.length), 0, 'saved preferences cannot auto-request/auto-grant');
  await enable.click();
  if (await page.getByTestId('training-skip').isVisible()) await page.getByTestId('training-skip').click();
  const calls = await page.evaluate(() => (window as any).__permissionCalls);
  assert.equal(calls.length, 2); assert(calls.every((c: any) => c.accepted && c.event === 'click'));
  assert.notEqual(lobby?.players.find(player => player.id === you)?.controlsReady, true, 'native grants without events cannot ready the phone');
  await page.evaluate(() => { (window as any).__sensorsEnabled = true; });
  await page.waitForFunction(() => (window as any).__pagePermissionEvents.some((state: any) => state.ready));
  assert.equal(await page.evaluate(() => localStorage.getItem('kaiju.controlsChosen')), '1');
  const saved = await page.evaluate(() => localStorage.getItem('kaiju.motionProfile'));
  assert(saved === 'standard' || saved === 'seated');
  check('first-page lobby click requests both native permissions, then readings enable motion', calls);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('player-repo-input').waitFor({ state: 'attached' }); // a ready repo collapses its editor on resume
  await enable.waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('kaiju.controlsChosen')), '1');
  assert.equal(await page.evaluate(() => localStorage.getItem('kaiju.motionProfile')), saved);
  assert.equal(await page.evaluate(() => (window as any).__permissionCalls.length), 0);
  await page.evaluate(() => { (window as any).__sensorsEnabled = true; }); await page.waitForTimeout(150);
  assert(!(await page.evaluate(() => (window as any).__pagePermissionEvents.some((state: any) => state.ready))), 'pre-grant readings on second page must not bypass native request');
  const start = page.locator('[data-testid="start-match"]:visible');
  assert(await start.isDisabled(), 'START must wait for fresh page permission');
  await page.screenshot({ path: `${output}/second-load-needs-permission.png` });
  check('second load preserves choices but still blocks START and displays big enable-motion step');
  await enable.click();
  if (await page.getByTestId('training-skip').isVisible()) await page.getByTestId('training-skip').click();
  const second = await page.evaluate(() => (window as any).__permissionCalls);
  assert.equal(second.length, 2); assert(second.every((c: any) => c.accepted && c.event === 'click'));
  await page.waitForFunction(() => (window as any).__pagePermissionEvents.some((state: any) => state.ready));
  await start.waitFor();
  const end = Date.now() + 5000;
  while (!lobby?.players.find(player => player.id === you)?.controlsReady && Date.now() < end) await page.waitForTimeout(40);
  assert(lobby?.players.find(player => player.id === you)?.controlsReady);
  assert(await start.isEnabled(), 'START becomes enabled only after page-local grant + fresh readings');
  check('second-page native calls originate synchronously in trusted click; readiness reaches server', second);
  await page.screenshot({ path: `${output}/second-load-ready.png` });
  assert.equal(errors.length, 0, errors.join('\n')); pass = true;
} catch (e) { failure = String(e); process.exitCode = 1; await page.screenshot({ path: `${output}/failure.png` }).catch(() => {}); }
finally {
  writeFileSync(`${output}/summary.json`, JSON.stringify({ pass, failure, checks, errors, base,
    evidence: 'WebKit iPhone13 real lobby + server; strict click-origin native mocks + synthetic readings; OS dialog on hardware unverified' }, null, 2));
  console.log(JSON.stringify({ output, pass, failure, checks, errors }, null, 2)); await browser.close();
}
