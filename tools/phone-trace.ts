// Explicit component fixture: actual input module + real trace endpoint, no trace flag/recorder calls.
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync } from 'node:fs';
import { devices, webkit } from 'playwright';
import { playtestBaseURL } from './playtest';
const base = playtestBaseURL(process.env.MOTION_URL || process.env.PLAYTEST_URL);
const output = `docs/shots/${new Date().toISOString().replace(/[:.]/g, '-')}-phone-trace`;
mkdirSync(output, { recursive: true });
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage(); page.setDefaultTimeout(10000);
const checks: string[] = [], errors: string[] = [], uploads: any[] = [];
let pass = false, failure: string | undefined;
try {
  const revision = Date.now();
  await page.routeWebSocket(url => url.pathname !== '/ws', socket => socket.send(JSON.stringify({ type: 'connected' })));
  await page.route('**/client/input/**', route => { const url = new URL(route.request().url()); url.searchParams.set('input-revision', String(revision)); return route.continue({ url: url.toString() }); });
  await page.route('**/__phone-trace', route => route.fulfill({ contentType: 'text/html', body: String.raw`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>body{background:#123;color:#bfa;font:16px monospace}canvas{width:100%;height:400px}button{padding:14px}</style><h2>PHONE TRACE COMPONENT FIXTURE</h2><button id="training">standalone training</button><button id="stop">stop training</button><button id="fight">start input</button><pre id="state"></pre><canvas></canvas><script type="module">
  import {createInput} from '/client/input/index.ts';
  document.querySelector('#training').onclick=()=>{const el=document.createElement('div');el.dataset.testid='training';el.innerHTML='<div class="tr-title">tilt horizontally</div>';document.body.append(el);window.__stream=true;};
  document.querySelector('#stop').onclick=()=>document.querySelector('[data-testid=training]')?.remove();
  document.querySelector('#fight').onclick=()=>{window.__input=createInput({canvas:document.querySelector('canvas'),toArena:(x,y)=>[x,y],getSelf:()=>null});window.__stream=true;};
  setInterval(()=>{if(window.__input){window.__frame=__input.sample();state.textContent=JSON.stringify(__frame);}},30);
  </script>` }));
  await context.addInitScript('window.__kaijuSyntheticSensors = true;');
  await context.addInitScript(String.raw`(()=>{
    window.__stream=false;window.__pose={beta:0,gamma:0};
    for(const key of ['DeviceMotionEvent','DeviceOrientationEvent'])if(window[key])Object.defineProperty(window[key],'requestPermission',{configurable:true,value:undefined});
    setInterval(()=>{if(!__stream)return;const e=new Event('deviceorientation');for(const [key,value] of Object.entries({...__pose,alpha:0}))Object.defineProperty(e,key,{value});dispatchEvent(e);},30);
  })();`);
  page.on('pageerror', e => errors.push(e.stack || e.message));
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/api/trace' && response.request().method() === 'POST') {
      const data = response.request().postDataJSON(); uploads.push({ status: response.status(), source: data.source, samples: data.samples.length,
        types: [...new Set(data.samples.map((s: any) => s.type))] });
    }
  });
  await page.goto(`${base}/__phone-trace`);
  await page.locator('#training').click(); await page.waitForTimeout(300);
  const trainingUpload = page.waitForResponse(r => new URL(r.url()).pathname === '/api/trace');
  await page.locator('#stop').click(); assert.equal((await trainingUpload).status(), 201);
  assert(uploads.some(u => u.source === 'training' && u.samples > 3));
  checks.push('standalone training with no input controller/recorder/trace flag uploads automatically');
  await page.locator('#fight').click();
  for (const [beta, gamma, x, y] of [[0, 0, 0, 0], [0, 7.5, 0.5, 0], [0, 15, 1, 0], [0, 30, 1, 0], [0, -15, -1, 0], [-15, 0, 0, -1], [15, 0, 0, 1]]) {
    await page.evaluate(([beta, gamma]) => { (window as any).__pose = { beta, gamma }; }, [beta, gamma]);
    await page.waitForTimeout(350);
    const frame = await page.evaluate(() => (window as any).__frame);
    assert(Math.abs(frame.move[0] - x) < 0.025 && Math.abs(frame.move[1] - y) < 0.025, `${beta}/${gamma}: ${frame.move}`);
  }
  checks.push('horizontal0/7.5/15/30degrees and each downhill direction match real sampled frames');
  const fightUpload = page.waitForResponse(r => new URL(r.url()).pathname === '/api/trace');
  await page.evaluate(() => (window as any).__input.dispose()); assert.equal((await fightUpload).status(), 201);
  assert(uploads.some(u => u.source === 'fight' && u.types.includes('input')));
  checks.push('phone fight partial trace uploads automatically with sampled movement/settings');
  await page.screenshot({ path: `${output}/horizontal-gravity.png` });
  assert.equal(errors.length, 0, errors.join('\n')); pass = true;
} catch (e) { failure = String(e); process.exitCode = 1; await page.screenshot({ path: `${output}/failure.png` }).catch(() => {}); }
finally {
  writeFileSync(`${output}/summary.json`, JSON.stringify({ pass, failure, checks, uploads, errors,
    evidence: 'WebKit iPhone component fixture, actual input + real DEV endpoint; product lobby gate and physical hardware separate' }, null, 2));
  console.log(JSON.stringify({ output, pass, failure, checks, uploads, errors }, null, 2)); await browser.close();
}
