// UI-driver contract fixture using the real DEV input recorder + real trace endpoint.
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { playtestBaseURL } from './playtest';
const base = playtestBaseURL(process.env.MOTION_URL || process.env.PLAYTEST_URL);
const output = `docs/shots/${new Date().toISOString().replace(/[:.]/g, '-')}-calibration`;
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/chromium') });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await context.newPage(); page.setDefaultTimeout(12000);
const deadline = setTimeout(() => { void browser.close(); }, 45_000);
const errors: string[] = [], checks: string[] = [];
let pass = false, failure: string | undefined, profile: unknown, upload: unknown;
const check = (name: string) => { checks.push(name); console.log(`PASS ${name}`); };
try {
  const revision = Date.now();
  await page.routeWebSocket(url => url.pathname !== '/ws', socket => socket.send(JSON.stringify({ type: 'connected' })));
  await page.route('**/client/input/**', route => { const url = new URL(route.request().url()); url.searchParams.set('input-revision', String(revision)); return route.continue({ url: url.toString() }); });
  await page.route('**/__calibration-test', route => route.fulfill({ contentType: 'text/html', body: String.raw`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>body{background:#102331;color:#caff90;font:14px monospace}canvas{width:100%;height:400px;touch-action:none}button{padding:10px;margin:4px}pre{white-space:pre-wrap}</style><h2>CALIBRATION API TEST FIXTURE</h2><button id="enable">enable sensors</button><div id="steps"></div><button id="save">save + upload</button><pre id="meter"></pre><canvas width="390" height="400"></canvas><script type="module">
    import {createInput} from '/client/input/index.ts';
    window.__input=createInput({canvas:document.querySelector('canvas'),toArena:(x,y)=>[x,y],getSelf:()=>null});
    enable.onclick=()=>void __input.requestPermission();
    for(const step of ['neutral','tilt','swing','twist','spin']){ const b=document.createElement('button');b.textContent=step;b.dataset.testid='step-'+step;b.onclick=()=>__input.calibration.startStep(step);steps.append(b); }
    save.onclick=()=>{__input.setProfile(__input.calibration.result());__input.calibration.stop();};
    setInterval(()=>{meter.textContent=JSON.stringify(__input.calibration.meter(),null,2);__input.sample();},30);
  </script>` }));
  await context.addInitScript(String.raw`(()=>{
    for(const key of ['DeviceMotionEvent','DeviceOrientationEvent']) Object.defineProperty(window[key],'requestPermission',{configurable:true,value:()=>Promise.resolve('granted')});
    window.__motion={beta:45,gamma:0,x:0,y:0,z:0,rate:{alpha:0,beta:0,gamma:0}};
    setInterval(()=>{const m=__motion;dispatchEvent(new DeviceOrientationEvent('deviceorientation',{beta:m.beta,gamma:m.gamma}));dispatchEvent(new DeviceMotionEvent('devicemotion',{acceleration:{x:m.x,y:m.y,z:m.z},rotationRate:m.rate,interval:30}));},30);
  })();`);
  page.on('pageerror', e => errors.push(e.stack || e.message));
  await page.goto(`${base}/__calibration-test`);
  await page.locator('#enable').tap();
  const meter = () => page.evaluate(() => (window as any).__input.calibration.meter());
  const set = (values: Record<string, unknown>) => page.evaluate(v => Object.assign((window as any).__motion, v), values);
  const step = (name: string) => page.getByTestId(`step-${name}`).tap();
  await step('neutral'); await page.waitForTimeout(500);
  assert((await meter()).ready); check('neutral recorder captures comfortable portrait pose');
  await step('tilt');
  for (const [beta, gamma] of [[45, -12], [45, 12], [33, 0], [57, 0]]) { await set({ beta, gamma }); await page.waitForTimeout(100); }
  assert((await meter()).ready); await set({ beta: 45, gamma: 0 }); check('all four tilt ranges recognized');
  await step('swing');
  for (let i = 0; i < 3; i++) { await set({ x: 10 }); await page.waitForTimeout(70); await set({ x: 0 }); await page.waitForTimeout(260); }
  assert((await meter()).ready); check('three actual swing recognitions record user peaks');
  await step('twist');
  for (let i = 0; i < 3; i++) {
    await set({ rate: { alpha: 300, beta: 0, gamma: 0 } }); await page.waitForTimeout(100);
    await set({ rate: { alpha: -300, beta: 0, gamma: 0 } }); await page.waitForTimeout(100);
    await set({ rate: { alpha: 0, beta: 0, gamma: 0 } }); await page.waitForTimeout(550);
  }
  assert((await meter()).ready); check('three settled twist recognitions record gyro peaks');
  await step('spin');
  for (let i = 0; i < 2; i++) {
    await set({ rate: { alpha: 0, beta: 600, gamma: 0 } }); await page.waitForTimeout(500);
    await set({ rate: { alpha: 0, beta: 0, gamma: 0 } }); await page.waitForTimeout(850);
  }
  assert((await meter()).ready); check('two integrated spins mark skill training ready');
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/trace' && r.request().method() === 'POST');
  await page.locator('#save').tap();
  console.log('save clicked; waiting for trace HTTP response');
  const stored = await response; assert.equal(stored.status(), 201); upload = { status: stored.status() };
  console.log('trace HTTP response received');
  const payload = stored.request().postDataJSON();
  assert(payload.samples.some((s: any) => s.type === 'motion' && s.rotationRate));
  assert(payload.samples.some((s: any) => s.type === 'gesture' && s.via === 'spin'));
  profile = await page.evaluate(() => (window as any).__input.profile);
  assert.deepEqual((profile as any).neutral.map((n: number) => Math.round(n)), [0, 45]);
  assert.equal((profile as any).swingThreshold, 6); assert.equal((profile as any).twistThreshold, 180);
  await page.screenshot({ path: `${output}/trained.png` });
  await page.reload();
  assert.deepEqual(await page.evaluate(() => (window as any).__input.profile), profile);
  check('saved thresholds + transformed neutral survive reload, raw trace stored by server');
  assert.equal(errors.length, 0, errors.join('\n')); pass = true;
} catch (e) { failure = String(e); process.exitCode = 1; await page.screenshot({ path: `${output}/failure.png` }).catch(() => {}); }
finally {
  clearTimeout(deadline);
  writeFileSync(`${output}/summary.json`, JSON.stringify({ pass, failure, checks, errors, profile, upload,
    evidence: 'actual input calibration API + DEV trace upload in explicit UI-driver fixture; product lobby UI and physical-phone acceptance separate' }, null, 2));
  console.log(JSON.stringify({ output, pass, failure, checks, errors, profile, upload }, null, 2)); await browser.close();
}
