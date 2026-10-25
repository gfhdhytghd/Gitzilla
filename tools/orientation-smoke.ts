/** Actual WebKit input component + synthetic sensors; no physical-device claim. */
import { strict as assert } from 'node:assert';
import { mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { webkit } from 'playwright';
import { playtestBaseURL } from './playtest';
const base=playtestBaseURL(process.env.MOTION_URL||process.env.PLAYTEST_URL);
const output=`docs/shots/${new Date().toISOString().replace(/[:.]/g,'-')}-orientation`;
mkdirSync(output,{recursive:true});
const browser=await webkit.launch({headless:true});
const checks:any[]=[], errors:string[]=[];
let pass=false,failure:string|undefined;
const poses=[{angle:0,b:[15,0],r:[0,15]},{angle:90,b:[0,-15],r:[15,0]},
 {angle:180,b:[-15,0],r:[0,-15]},{angle:270,b:[0,15],r:[-15,0]}];
try{
 for(const device of ['iPhone','iPad']){
  const ipad=device==='iPad';
  const context=await browser.newContext({viewport:{width:500,height:900},hasTouch:true,isMobile:true,
   userAgent:ipad?'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/27.2 Safari/605.1.15':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/27.2 Mobile/15E148 Safari/604.1'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.stack||String(e)));
  await page.routeWebSocket(u=>u.pathname!=='/ws',s=>s.send(JSON.stringify({type:'connected'})));
  await page.route('**/api/trace',r=>r.fulfill({status:201,contentType:'application/json',body:'{}'}));
  await page.route('**/client/input/**',route=>{const u=new URL(route.request().url());u.searchParams.set('orientation-revision',String(Date.now()));return route.continue({url:u.toString()});});
  await page.route('**/__orientation',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>body{background:#112237;color:#bff;font:16px monospace}button{padding:20px}pre{white-space:pre-wrap}</style><h2>${device} ORIENTATION COMPONENT</h2><button id="enable">Enable sensors</button><pre id="readout"></pre><script type="module">
   import{createInput,getMotionPermissionState}from'/client/input/index.ts';import{screenOrientation}from'/client/input/orientation.ts';
   enable.onclick=()=>{window.__input=createInput({canvas:document.createElement('canvas'),toArena:()=>[0,0],getSelf:()=>null});void __input.requestPermission();};
   setInterval(()=>{if(!window.__input)return;const f=__input.sample();window.__frame=f;window.__frames.push(f);document.getElementById('readout').textContent=JSON.stringify({frame:f,orientation:screenOrientation(window,navigator),permission:getMotionPermissionState()},null,2);},30);
  </script>`}));
  await context.addInitScript(String.raw`(()=>{
   const ipad=${JSON.stringify(ipad)},w=window;w.__kaijuSyntheticSensors=true;w.__frames=[];w.__angle=0;w.__pose={beta:0,gamma:0};w.__calls=[];
   Object.defineProperty(navigator,'platform',{configurable:true,get:()=>ipad?'MacIntel':'iPhone'});
   Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,get:()=>5});
   Object.defineProperty(window,'orientation',{configurable:true,get:()=>w.__angle===270?-90:w.__angle});
   Object.defineProperty(screen.orientation,'angle',{configurable:true,get:()=>0});
   Object.defineProperty(screen.orientation,'type',{configurable:true,get:()=>'portrait-primary'});
   for(const key of ['DeviceMotionEvent','DeviceOrientationEvent']){
    const api=w[key]||function(){};if(!w[key])Object.defineProperty(w,key,{configurable:true,value:api});
    Object.defineProperty(api,'requestPermission',{configurable:true,value:()=>{
     const e=w.event;const ok=e?.type==='click'&&e.isTrusted&&navigator.userActivation.isActive;
     w.__calls.push({api:key,ok});return Promise.resolve(ok?'granted':'denied');
    }});
   }
   setInterval(()=>{if(!w.__input)return;const e=new Event('deviceorientation');for(const[k,v]of Object.entries({...w.__pose,alpha:0}))Object.defineProperty(e,k,{value:v});dispatchEvent(e);},30);
  })();`);
  await page.goto(`${base}/__orientation`);await page.locator('#enable').click();
  await page.waitForFunction(()=>(window as any).__frame?.source==='motion');
  assert((await page.evaluate(()=>(window as any).__calls)).every((c:any)=>c.ok));
  const pose=async(beta:number,gamma:number)=>{await page.evaluate(([beta,gamma])=>{(window as any).__pose={beta,gamma};},[beta,gamma]);await page.waitForTimeout(260);};
  for(const p of poses){
   await page.evaluate(angle=>{(window as any).__angle=angle;dispatchEvent(new Event('orientationchange'));},p.angle);
   // Keep a narrow portrait window even for landscape, reproducing Stage Manager.
   for(const [pair,target] of [[p.b,[0,1]],[p.r,[1,0]]] as const)for(const sign of [-1,1]){
    await pose(pair[0]*sign,pair[1]*sign);const f=await page.evaluate(()=>(window as any).__frame);
    assert(Math.abs(f.move[0]-target[0]*sign)<.03&&Math.abs(f.move[1]-target[1]*sign)<.03,`${device}/${p.angle}: ${f.move}`);
   }
   await pose(0,0);await page.waitForTimeout(650);
   await page.evaluate(()=>{(window as any).__frames=[];});
   await pose(p.b[0]*50/15,p.b[1]*50/15);
   const dashes=await page.evaluate(()=>(window as any).__frames.filter((f:any)=>f.dash));
   assert.equal(dashes.length,1);assert(dashes[0].move[1]>.99&&Math.abs(dashes[0].move[0])<.01);
   checks.push({device,angle:p.angle,directions:4,bottomDash:dashes[0].move});
  }
  if(ipad){
   await page.evaluate(()=>{(window as any).__angle=90;dispatchEvent(new Event('orientationchange'));});
   for(const file of ['1792923795749-667177e6f403.json','1792923876689-1d9d1d62a6a5.json']){
    const trace=JSON.parse(readFileSync('client/input/fixtures/real-ipad-orientation.json','utf8')).find((t:any)=>t.file===file);
    const s=trace.samples.find((s:number[])=>s[2]< -12&&Math.abs(s[1])<3);
    await pose(s[1],s[2]);const f=await page.evaluate(()=>(window as any).__frame);
    assert(f.move[1]>.6&&Math.abs(f.move[0])<.3);checks.push({device,realTrace:file,move:f.move});
   }
  }
  await page.screenshot({path:`${output}/${device}.png`});await context.close();
 }
 assert.equal(errors.length,0,errors.join('\n'));pass=true;
}catch(e){failure=String(e);process.exitCode=1;}finally{
 writeFileSync(`${output}/summary.json`,JSON.stringify({pass,failure,checks,errors,proof:'WebKit actual input controller, trusted-click native permission mocks, synthetic sensor poses and original real-iPad sample values; Stage Manager-sized viewport; no hardware claim'},null,2));
 console.log(JSON.stringify({output,pass,failure,checks,errors},null,2));await browser.close();
}
