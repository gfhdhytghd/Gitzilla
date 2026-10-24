// Usage: node tools/phone-performance.mjs http://localhost:<isolated-port>/r/PERF?mock=match /tmp/report.json
// 390x844 @3x, Chromium 4x CPU throttle. Synthetic local mock match (includes sim CPU).
// Compare sequential runs with no concurrent browser jobs. This cannot measure phone temperature or GPU power.
import {chromium} from 'playwright';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true,executablePath:"/usr/bin/chromium"});
try {
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Performance.enable');
await page.addInitScript(()=>{localStorage.setItem('kaiju.name','Perf');window.__long=[];new PerformanceObserver(l=>window.__long.push(...l.getEntries().map(x=>x.duration))).observe({entryTypes:['longtask']});});
const url=process.argv[2];
if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
  await browser.close(); throw new Error('Pass an isolated local production /r/PERF?mock=match URL.');
}
await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url, {waitUntil:'domcontentloaded'});await page.waitForSelector(".game-canvas");
const touchOnly = page.getByRole('button', {name:'touch only', exact:true});
if (await touchOnly.isVisible()) await touchOnly.click();
await page.waitForTimeout(12000);
await page.evaluate(()=>{window.__frames=[];window.__drawTimes=[];window.__calls={};window.__mut=0;let last=performance.now();function tick(n){window.__frames.push(n-last);last=n;window.__raf=requestAnimationFrame(tick)}window.__raf=requestAnimationFrame(tick);new MutationObserver(m=>window.__mut+=m.length).observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true});for(const k of ['fillRect','drawImage','fillText','getImageData','putImageData','measureText','createLinearGradient','stroke']){const old=CanvasRenderingContext2D.prototype[k];CanvasRenderingContext2D.prototype[k]=function(...a){if(k==='fillRect'&&this.canvas.classList.contains('game-canvas')&&a[0]===0&&a[1]===0&&a[2]===this.canvas.width&&a[3]===this.canvas.height&&this.fillStyle==='#000000')window.__drawTimes.push(performance.now());let c=window.__calls[k]??={n:0};c.n++;return old.apply(this,a)}}});
await cdp.send('Profiler.enable');await cdp.send('Profiler.start');const before=await cdp.send('Performance.getMetrics');await page.waitForTimeout(10000);const after=await cdp.send('Performance.getMetrics');const {profile}=await cdp.send('Profiler.stop');
const data=await page.evaluate(()=>({frames:window.__frames,drawTimes:window.__drawTimes,calls:window.__calls,mutations:window.__mut,long:window.__long,game:!!document.querySelector('.game-canvas'),canvases:[...document.querySelectorAll('canvas')].map(c=>({class:c.className,w:c.width,h:c.height}))}));
if (!data.game) throw new Error('Fight ended before measurement completed; repeat with a fresh mock match.');
const renderIntervals=data.drawTimes.slice(1).map((t,i)=>t-data.drawTimes[i]).sort((a,b)=>a-b);
const times=data.frames.sort((a,b)=>a-b);const metric=Object.fromEntries(after.metrics.map(m=>[m.name,m.value-(before.metrics.find(b=>b.name===m.name)?.value??0)]));const hits=new Map;for(let i=0;i<(profile.samples?.length??0);i++){const id=profile.samples[i];hits.set(id,(hits.get(id)??0)+(profile.timeDeltas[i]??0))}const top=profile.nodes.map(n=>({fn:n.callFrame.functionName,url:n.callFrame.url,line:n.callFrame.lineNumber,ms:(hits.get(n.id)??0)/1000})).sort((a,b)=>b.ms-a.ms).slice(0,30);
const summary={url,errors,gameDrawCount:data.drawTimes.length,renderMedian:renderIntervals[Math.floor(renderIntervals.length*.5)],renderP95:renderIntervals[Math.floor(renderIntervals.length*.95)],frames:times.length,median:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],over33:times.filter(x=>x>34).length,metrics:Object.fromEntries(Object.entries(metric).filter(([k])=>/Duration|Count/.test(k))),...data,top};delete summary.frames;delete summary.drawTimes;summary.frameCount=times.length;fs.writeFileSync(process.argv[3]||'/tmp/gitzilla-phone-performance.json',JSON.stringify(summary,null,2));fs.writeFileSync((process.argv[3]||'/tmp/gitzilla-phone-performance.json')+'.cpuprofile',JSON.stringify(profile));console.log(JSON.stringify(summary,null,2));await page.screenshot({timeout:5000,animations:'disabled',path:(process.argv[3]||'/tmp/gitzilla-phone-performance.json')+'.png'}).catch(()=>{});
} finally { await browser.close(); }
