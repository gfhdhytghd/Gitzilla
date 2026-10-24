/** Real input module in a browser component fixture. Does not claim game/UI onboarding or hardware proof. */
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { playtestBaseURL } from './playtest';

const base = playtestBaseURL(process.env.MOTION_URL || process.env.PLAYTEST_URL);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'docs/shots', `${new Date().toISOString().replace(/[:.]/g, '-')}-inclusive-motion`);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/chromium') });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
const page = await context.newPage();
const errors: string[] = [];
const checks: string[] = [];
let pass = false;
let failure: string | undefined;
const check = (label: string) => { checks.push(label); console.log(`PASS ${label}`); };
const latest = () => page.evaluate(() => (window as any).__input.sample());
const permissionCount = () => page.evaluate(() => (window as any).__requests.length);
const pose = async (gamma: number) => { await page.evaluate(g => { (window as any).__gamma = g; }, gamma); };
try {
  await context.addInitScript(`(() => {
    window.__requests=[];
    for(const key of ['DeviceMotionEvent','DeviceOrientationEvent']) Object.defineProperty(window[key],'requestPermission',{configurable:true,value:()=>{window.__requests.push(key);return Promise.resolve('granted');}});
    Object.defineProperty(screen.orientation,'angle',{configurable:true,get:()=>0});
  })();`);
  await page.route('**/__input-profile-test', route => route.fulfill({ contentType: 'text/html', body: String.raw`<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Inclusive input component test</title>
<style>body{background:#081724;color:#bcf7df;font:14px monospace;padding:12px}button{padding:12px;margin:4px;background:#123d37;color:#d4ffeb;border:1px solid #3c9}canvas{display:block;background:#152839;width:100%;height:280px;margin-top:14px}pre{white-space:pre-wrap}</style>
<h2>INCLUSIVE INPUT TEST BENCH</h2><p>Component fixture — real DEV input module</p><div id="profiles"></div><button id="enable">Enable sensors</button><pre id="status"></pre><canvas width="480" height="288"></canvas>
<script type="module">
import {createInput,loadMotionProfile,saveMotionProfile,MOTION_PROFILES,MOTION_PROFILE_LABELS} from '/client/input/index.ts';
const canvas=document.querySelector('canvas');window.__gamma=0;window.__input=null;window.__frames=[];
const boot=()=>window.__input=createInput({canvas,toArena:(x,y)=>[x,y],getSelf:()=>({x:64,y:70})});
for(const profile of MOTION_PROFILES){const b=document.createElement('button');b.textContent=MOTION_PROFILE_LABELS[profile];b.dataset.testid='profile-'+profile;b.onclick=()=>{saveMotionProfile(profile);if(window.__input)window.__input.setMotionProfile(profile);else boot();};document.querySelector('#profiles').append(b);}
document.querySelector('#enable').onclick=()=>window.__input?.requestPermission();
if(localStorage.getItem('kaiju.motionProfile'))boot();
setInterval(()=>{if(!window.__input)return;window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{beta:45,gamma:window.__gamma}));window.dispatchEvent(new DeviceMotionEvent('devicemotion',{acceleration:{x:0,y:0,z:0}}));const f=window.__input.sample();window.__frames.push(f);document.querySelector('#status').textContent=window.__input.motionProfile+' / '+window.__input.mode+' / sensors '+window.__input.sensorStatus+'\n'+JSON.stringify(f);},33);
</script>` }));
  page.on('pageerror', error => errors.push(error.stack || error.message));
  const revision = Date.now();
  await page.route('**/client/input/**', route => {
    const url = new URL(route.request().url()); url.searchParams.set('input-revision', String(revision));
    return route.continue({ url: url.toString() });
  });
  await page.goto(`${base}/__input-profile-test`, { waitUntil: 'networkidle' });
  await page.getByTestId('profile-seated').tap();
  assert.equal(await permissionCount(), 0, 'choosing a profile before controller creation must not prompt');
  await page.locator('#enable').tap();
  assert.equal(await permissionCount(), 2);
  await page.waitForTimeout(450);
  await pose(4.8); await page.waitForTimeout(450);
  assert(Math.abs((await latest()).move[0]) < 0.001);
  await pose(8); await page.waitForTimeout(650);
  assert((await latest()).move[0] > 0.95);
  check('seated ignores tremor-range tilt, reaches full speed at 8 degrees');
  await pose(0); await page.waitForTimeout(700);
  await page.evaluate(() => window.dispatchEvent(new DeviceMotionEvent('devicemotion', { acceleration: { x: 7, y: 0, z: 0 } })));
  assert((await latest()).fire);
  await page.waitForTimeout(650);
  await page.evaluate(() => window.dispatchEvent(new DeviceMotionEvent('devicemotion', { acceleration: { x: 2, y: -2, z: 1 } })));
  assert(!(await latest()).fire);
  check('small seated flick attacks; tremor does not');
  await page.screenshot({ path: join(output, 'seated.png') });
  await page.getByTestId('profile-tap-only').tap();
  await pose(70);
  await page.evaluate(() => window.dispatchEvent(new DeviceMotionEvent('devicemotion', { acceleration: { x: 50, y: -50, z: 50 } })));
  await page.waitForTimeout(200);
  assert.deepEqual((await latest()).move, [0, 0]); assert(!(await latest()).fire);
  assert.equal(await page.evaluate(() => (window as any).__input.mode), 'touch');
  assert.equal(await permissionCount(), 2);
  assert.equal(await page.locator('.kj-touch-joystick-zone,.kj-touch-button').count(), 0);
  check('tap-only ignores every sensor and uses invisible full-screen gestures');
  await page.touchscreen.tap(120, 380);
  await page.waitForTimeout(350);
  assert((await latest()).fire);
  await page.waitForTimeout(650);
  assert(!(await latest()).fire);
  check('tap-only tap attacks without sensor input');
  await page.screenshot({ path: join(output, 'tap-only.png') });
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => (window as any).__input.motionProfile), 'tap-only');
  assert.equal(await permissionCount(), 0);
  await page.waitForTimeout(400);
  assert.equal((await latest()).source, 'touch');
  check('profile persists across page reload; tap-only never requests permission');
  await page.getByTestId('profile-standard').tap();
  await page.locator('#enable').tap();
  await page.waitForTimeout(450); await pose(8); await page.waitForTimeout(450);
  const standard = await latest();
  assert(standard.move[0] > 0.2 && standard.move[0] < 0.3);
  await page.evaluate(() => window.dispatchEvent(new DeviceMotionEvent('devicemotion', { acceleration: { x: 7, y: 0, z: 0 } })));
  assert(!(await latest()).fire);
  check('switching back restores standard sensitivity and swing threshold');
  assert.equal(errors.length, 0, errors.join('\n'));
  pass = true;
} catch (error) {
  failure = String(error); process.exitCode = 1;
  await page.screenshot({ path: join(output, 'failure.png'), timeout: 4000 }).catch(() => {});
} finally {
  writeFileSync(join(output, 'summary.json'), `${JSON.stringify({ pass, failure, base, checks, errors,
    proof: 'real input module served from DEV, synthetic sensors in isolated browser fixture; no game/network/onboarding/hardware acceptance claimed' }, null, 2)}\n`);
  console.log(JSON.stringify({ output, pass, failure, checks: checks.length, errors }, null, 2));
  await browser.close();
}
