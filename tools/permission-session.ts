/** WebKit/iPhone proof for the page-state API in an explicit lobby component fixture. */
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync } from 'node:fs';
import { devices, webkit } from 'playwright';
import { playtestBaseURL } from './playtest';
const base = playtestBaseURL(process.env.MOTION_URL || process.env.PLAYTEST_URL);
const output = `docs/shots/${new Date().toISOString().replace(/[:.]/g, '-')}-permission-session`;
mkdirSync(output, { recursive: true });
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage(); page.setDefaultTimeout(10000);
const checks: string[] = [], errors: string[] = []; let pass = false, failure: string | undefined;
try {
  const revision = Date.now();
  await page.routeWebSocket(url => url.pathname !== '/ws', socket => socket.send(JSON.stringify({ type: 'connected' })));
  await page.route('**/client/input/**', route => { const url = new URL(route.request().url()); url.searchParams.set('input-revision', String(revision)); return route.continue({ url: url.toString() }); });
  await page.route('**/__permission-session', route => route.fulfill({ contentType: 'text/html', body: String.raw`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>body{background:#123;color:#bfa;font:16px monospace}button{padding:20px}pre{white-space:pre-wrap}</style><h2>PERMISSION LOBBY COMPONENT FIXTURE</h2><button id="enable">📱 tap to enable motion</button><button id="start" disabled>START</button><pre id="state"></pre><script type="module">
  import {getMotionPermissionState,requestMotionPermission,subscribeMotionPermission,saveMotionProfile} from '/client/input/index.ts';
  const enable=document.querySelector('#enable'), start=document.querySelector('#start'), label=document.querySelector('#state');
  subscribeMotionPermission(state=>{window.__state=state;label.textContent=JSON.stringify(state,null,2);start.disabled=!state.ready;enable.hidden=!state.required||state.ready;});
  enable.onclick=()=>{saveMotionProfile('standard');localStorage.setItem('kaiju.controlsChosen','1');void requestMotionPermission('standard');};
  </script>` }));
  await context.addInitScript(String.raw`(()=>{
    window.__kaijuSyntheticSensors=true;window.__calls=[];window.__enabled=false;
    for(const key of ['DeviceMotionEvent','DeviceOrientationEvent']){
      const api=window[key]||function(){};if(!window[key])Object.defineProperty(window,key,{configurable:true,value:api});
      Object.defineProperty(api,'requestPermission',{configurable:true,value:()=>{const e=window.event;const accepted=e?.type==='click'&&e.isTrusted&&navigator.userActivation.isActive;__calls.push({api:key,event:e?.type,trusted:e?.isTrusted,active:navigator.userActivation.isActive,accepted});return Promise.resolve(accepted?'granted':'denied');}});
    }
    setInterval(()=>{if(!__enabled)return;const e=new Event('deviceorientation');Object.defineProperty(e,'beta',{value:0});Object.defineProperty(e,'gamma',{value:0});dispatchEvent(e);},30);
  })();`);
  page.on('pageerror', e => errors.push(e.stack || e.message));
  await page.goto(`${base}/__permission-session`);
  for (const load of [1, 2]) {
    if (load === 2) {
      await page.reload();
      assert.equal(await page.evaluate(() => localStorage.getItem('kaiju.controlsChosen')), '1');
      assert.equal(await page.evaluate(() => localStorage.getItem('kaiju.motionProfile')), 'standard');
    }
    await page.locator('#enable').waitFor();
    await page.waitForFunction(() => !!(window as any).__state);
    assert.equal(await page.evaluate(() => (window as any).__calls.length), 0);
    assert(await page.locator('#start').isDisabled());
    assert.deepEqual(await page.evaluate(() => ({ ready: (window as any).__state.ready, needsPermission: (window as any).__state.needsPermission })), { ready: false, needsPermission: true });
    await page.evaluate(() => { (window as any).__enabled = true; }); await page.waitForTimeout(100);
    assert(await page.locator('#start').isDisabled(), 'pre-grant samples cannot bypass this-page permission');
    await page.locator('#enable').click();
    await page.waitForFunction(() => (window as any).__state.ready === true);
    const calls = await page.evaluate(() => (window as any).__calls);
    assert.equal(calls.length, 2); assert(calls.every((c: any) => c.accepted && c.event === 'click'));
    assert(await page.locator('#start').isEnabled());
    checks.push(`page${load}: fresh trusted click requests BOTH native APIs; only grant+readings enables START`);
    await page.screenshot({ path: `${output}/load-${load}.png` });
  }
  assert.equal(errors.length, 0, errors.join('\n')); pass = true;
} catch (e) { failure = String(e); process.exitCode = 1; await page.screenshot({ path: `${output}/failure.png` }).catch(() => {}); }
finally {
  writeFileSync(`${output}/summary.json`, JSON.stringify({ pass, failure, checks, errors,
    evidence: 'actual page-local permission API in WebKit/iPhone lobby component fixture across reload; product lobby/network gate separately tested by permission-gate.ts' }, null, 2));
  console.log(JSON.stringify({ output, pass, failure, checks, errors }, null, 2)); await browser.close();
}
