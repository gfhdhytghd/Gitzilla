/** Isolated browser acceptance. Synthetic grading is injected only into this local test server. */
import http from 'node:http';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { RoomServer } from '../server/rooms';
import { handleEduRoute } from '../server/edu-http';
import { profileFromFiles } from '../analysis/graph';
import { playerKitFromProfile, bossKitFromProfile, createMatch } from '../sim';
import { defaultRubric, parseRubric } from '../rubric';
const out=resolve('docs/shots/classroom-raid'); mkdirSync(out,{recursive:true});
const files=[{path:'src/main.ts',text:'export const answer = 42'}];
const server=http.createServer();const wss=new WebSocketServer({noServer:true});
server.on('upgrade',(req,sock,head)=>{if(req.url==='/ws')wss.handleUpgrade(req,sock,head,ws=>wss.emit('connection',ws,req));});
const rooms=new RoomServer(wss,{
  analyzeRepo:async slug=>profileFromFiles(slug,files),listFallbackRepos:()=>[],playerKitFromProfile,bossKitFromProfile,createMatch,recordMatch:()=>{},defaultRubric,parseRubric,
  analyzeClassroomSubmission:async(repo,ref)=>{await new Promise(r=>setTimeout(r,80));const list=ref==='improved'?[...files,{path:'README.md',text:'# A tested answer'}]:files;return {profile:profileFromFiles(repo,list),files:list,commit:(ref==='improved'?'b':'a').repeat(40),checks:[]};},
});
const vite=await createServer({server:{middlewareMode:true,hmr:{server}},appType:'spa'});
server.on('request',(req,res)=>{void (async()=>{
  if(req.method==='POST' && req.url==='/api/room?mode=edu'){res.writeHead(201,{'Content-Type':'application/json'});res.end(JSON.stringify({room:rooms.createRoom(undefined,'edu')}));return;}
  if(await handleEduRoute(req,res,new URL(req.url!,'http://localhost'),rooms))return;
  if(req.url?.startsWith('/auth/')){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({authenticated:false}));return;}
  vite.middlewares(req,res);
})();});
server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
const room=rooms.createRoom(undefined,'edu');
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});
const errors:string[]=[];const sockets:WebSocket[]=[];
try {
  const host=await browser.newContext({viewport:{width:1920,height:1080}});
  const phone=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const desktop=await browser.newContext({viewport:{width:1440,height:900}});
  for(const c of [host,phone,desktop]){
    await c.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/,route=>route.abort());
    await c.addInitScript(()=>{try{localStorage.setItem('gitzilla.onboarding.v1','1');localStorage.setItem('kaiju.name','Ada');}catch{}(window as any).traffic={sent:[],received:[]};const Original=window.WebSocket;window.WebSocket=class extends Original{constructor(url:string,protocols?:string|string[]){super(url,protocols);this.addEventListener('message',e=>{try{(window as any).traffic.received.push(JSON.parse(e.data));}catch{}});}send(data:any){try{(window as any).traffic.sent.push(JSON.parse(data));}catch{}super.send(data);}} as any;});
    c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  }
  const teacher=await host.newPage(), a=await phone.newPage(), b=await desktop.newPage();
  await teacher.goto(`${base}/r/${room}?screen=1`);await teacher.getByTestId('classroom-plan-editor').waitFor();
  await teacher.getByTestId('step-checks-0').fill('file: README.md');await teacher.getByTestId('step-check-weight-0').fill('100');
  await teacher.getByTestId('lesson-title').fill('Ship the answer · classroom raid');
  await teacher.getByTestId('classroom-save-plan').click();
  await a.goto(`${base}/r/${room}`);await b.goto(`${base}/r/${room}`);
  for(let i=0;i<28;i++){
    const ws=new WebSocket(`${base.replace('http','ws')}/ws`);sockets.push(ws);await once(ws,'open');const welcome=once(ws,'message');ws.send(JSON.stringify({t:'hello',room,role:'player',name:`Student ${i+3}`}));await welcome;
  }
  await teacher.waitForFunction(()=>document.querySelectorAll('.cr-student').length===30);
  await teacher.getByTestId('classroom-start').click();
  for(const p of [a,b]){await p.getByTestId('classroom-repo').fill('demo/repo');await p.getByTestId('classroom-submit').click();await p.getByTestId('classroom-own-score').waitFor();}
  for(const ws of sockets)ws.send(JSON.stringify({t:'classroomSubmit',repo:'demo/repo',ref:'improved'}));
  await teacher.waitForFunction(()=>document.querySelector('[data-testid="classroom-progress"]')?.textContent?.startsWith('30 / 30'));
  await teacher.screenshot({path:`${out}/projector-30.png`,fullPage:true});
  if(await a.getByTestId('classroom-own-score').innerText()!=='0.0 /100')throw new Error('Expected unmet file check score');
  await a.getByTestId('classroom-feedback').scrollIntoViewIfNeeded(); await a.screenshot({path:`${out}/phone-feedback.png`});
  await teacher.locator('.cr-student').filter({hasText:'Ada'}).first().click();
  await teacher.getByTestId('classroom-review-score').fill('60');await teacher.getByTestId('classroom-review-note').fill('Verified the answer, documentation still needed.');await teacher.getByTestId('classroom-review-submit').click();
  await teacher.getByTestId('classroom-pause').click();await a.waitForFunction(()=>document.querySelector('.cr-phase')?.textContent==='Coding paused');
  await teacher.getByTestId('classroom-attack').click();await teacher.waitForFunction(()=>document.querySelector('.cr-phase')?.textContent==='Class attack');
  await teacher.screenshot({path:`${out}/projector-attack.png`,fullPage:true});
  await teacher.getByTestId('classroom-retry').waitFor({timeout:15000});
  const download=teacher.waitForEvent('download');await teacher.getByTestId('classroom-export-csv').click();await(await download).saveAs(`${out}/rounds.csv`);
  await teacher.getByTestId('classroom-retry').click();await a.getByTestId('classroom-ref').fill('improved');await a.getByTestId('classroom-submit').click();
  await a.waitForFunction(()=>document.querySelector('[data-testid="classroom-own-score"]')?.textContent==='100.0 /100');
  await a.reload();await a.getByTestId('classroom-own-score').waitFor();
  await teacher.reload();await teacher.getByTestId('classroom-attack').waitFor();await teacher.getByTestId('classroom-attack').click();await teacher.getByTestId('classroom-next').waitFor({timeout:15000});await teacher.getByTestId('classroom-next').click();
  await a.waitForFunction(()=>document.querySelector('.cr-task h2')?.textContent?.startsWith('2.'));
  for(const width of [390,360]){await a.setViewportSize({width,height:844});const overflow=await a.evaluate(()=>document.querySelector('.classroom-screen')!.scrollWidth>innerWidth);if(overflow)throw new Error(`Overflow ${width}`);await a.evaluate(()=>document.querySelector('.classroom-screen')!.scrollTop=0);await a.screenshot({path:`${out}/phone-${width}.png`});}
  const traffic=await a.evaluate(()=>(window as any).traffic);
  if(traffic.sent.some((m:any)=>m.t==='input'||m.t==='controls')||traffic.received.some((m:any)=>m.t==='snapshot'))throw new Error('Classroom started battle stream');
  if(errors.length)throw new Error(errors.join('\n'));
  const oldRoom=rooms.createRoom(undefined,'edu');
  const migration=await desktop.newPage();await migration.goto(`${base}/r/${oldRoom}`);
  await migration.getByTestId('classroom-open-teacher').click();
  await migration.getByTestId('classroom-plan-editor').waitFor();
  if((await migration.locator('body').innerText()).includes('most KOs wins'))throw new Error('Old classroom PvP copy remains');
  for (const id of ['01-hello','02-numbers','03-strings','04-conditions','05-for','06-while','07-lists','08-functions','09-dict']) {
    await migration.getByTestId('classroom-preset-select').selectOption(id);
    await migration.getByTestId('classroom-preset-load').click();
    if(!(await migration.getByTestId('lesson-title').inputValue()).includes(id.slice(0,2)))throw new Error(`Wrong preset ${id}`);
    if(await migration.locator('.cr-step-editor').count()!==3)throw new Error('Preset must load all3steps');
  }
  const starterDownload=migration.waitForEvent('download');await migration.getByTestId('classroom-preset-download').click();
  const starter=await starterDownload;if(starter.suggestedFilename()!=='09_dict.py')throw new Error('Wrong starter filename');
  await starter.saveAs(`${out}/09_dict.py`);
  await migration.getByTestId('step-title-0').fill('My dictionary challenge');
  await migration.getByTestId('step-checks-0').fill('file: README.md\ncontains: python/09_dict.py :: inventory');
  await migration.getByTestId('step-checks-0').evaluate(el => el.setAttribute('data-editor-identity', 'preserved'));
  await migration.getByTestId('settings-open').click();
  await migration.getByTestId('classroom-language').selectOption('fr');
  await migration.getByTestId('settings-close').click();
  await migration.waitForFunction(()=>document.documentElement.lang==='fr');
  if(await migration.getByTestId('step-title-0').inputValue()!=='My dictionary challenge')throw new Error('Language switch lost unpublished title');
  if(await migration.getByTestId('step-checks-0').inputValue()!=='file: README.md\ncontains: python/09_dict.py :: inventory')throw new Error('Language switch lost unpublished checks');
  if(await migration.getByTestId('step-checks-0').getAttribute('data-editor-identity')!=='preserved')throw new Error('Language switch rebuilt the active editor');
  await migration.getByTestId('settings-open').click();
  await migration.getByTestId('classroom-language').selectOption('en');
  await migration.getByTestId('settings-close').click();
  await migration.getByTestId('classroom-preset-select').selectOption('01-hello');
  if(await migration.getByTestId('step-title-0').inputValue()!=='My dictionary challenge')throw new Error('Previewing a preset overwrote the draft');
  await migration.getByTestId('classroom-save-plan').click();
  const courseStudent=await phone.newPage();await courseStudent.goto(`${base}/r/${oldRoom}`);
  await courseStudent.waitForFunction(()=>document.querySelector('.cr-task h2')?.textContent?.includes('My dictionary challenge'));
  if(!(await courseStudent.locator('.cr-instructions').innerText()).includes('inventory'))throw new Error('Published preset instructions missing');
  if(await courseStudent.getByTestId('classroom-language').count()!==0 && await courseStudent.getByTestId('classroom-language').isVisible())throw new Error('Student has a classroom language control');
  const instructionLanguages = new Set<string>();
  for(const lang of ['en','zh','es','fr']) {
    await migration.getByTestId('settings-open').click();
    await migration.getByTestId('classroom-language').selectOption(lang);
    await migration.getByTestId('settings-close').click();
    await courseStudent.waitForFunction(l=>document.documentElement.lang===l,lang);
    if((await courseStudent.locator('.cr-task h2').innerText()).indexOf('My dictionary challenge')<0)throw new Error('Language switch overwrote teacher-authored text');
    instructionLanguages.add(await courseStudent.locator('.cr-instructions').innerText());
    if(await courseStudent.evaluate(()=>document.querySelector('.classroom-screen')!.scrollWidth>innerWidth))throw new Error(`Localized student page overflows: ${lang}`);
    await courseStudent.screenshot({path:`${out}/classroom-student-${lang}.png`});
  }
  if(instructionLanguages.size!==4)throw new Error('Preset instructions did not change across all four languages');
  await courseStudent.evaluate(()=>localStorage.setItem('gitzilla.locale','zh'));
  await courseStudent.reload();await courseStudent.waitForFunction(()=>document.documentElement.lang==='fr');
  await migration.reload();await migration.getByTestId('settings-open').click();await migration.getByTestId('classroom-language').waitFor();
  if(await migration.getByTestId('classroom-language').inputValue()!=='fr')throw new Error('Host language did not survive reload');
  await migration.getByTestId('settings-close').click();
  await migration.setViewportSize({width:390,height:844});
  await migration.getByTestId('classroom-preset-library').screenshot({path:`${out}/python-presets-phone.png`});
  if(await migration.evaluate(()=>document.querySelector('.classroom-screen')!.scrollWidth>innerWidth))throw new Error('Preset form overflows phone');
  await migration.setViewportSize({width:1920,height:1080});
  await migration.getByTestId('classroom-preset-library').screenshot({path:`${out}/python-presets.png`});
  const battleRoom=rooms.createRoom(undefined,'battle');const entry=await desktop.newPage();
  await entry.goto(`${base}/r/${battleRoom}`);await entry.getByTestId('mode-edu').click();
  await entry.getByTestId('classroom-plan-editor').waitFor();
  if(new URL(entry.url()).pathname===`/r/${battleRoom}`)throw new Error('Battle classroom entry did not open a teacher room');
  const result={passed:true,pythonPresets:9,presetPublish:true,starterDownload:true,hostOnlyLanguages:4,localeReconnect:true,legacyRoomMigration:true,battleClassroomEntry:true,students:30,flow:'configure,submit,review,pause,raid,export,retry,newSHA,reconnect,next',phoneWidths:[390,360],battleInputs:0,battleSnapshots:0,browserErrors:errors};
  writeFileSync(`${out}/result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} finally {
  for(const ws of sockets)ws.close();await browser.close();rooms.close();await vite.close();await new Promise<void>(r=>wss.close(()=>r()));await new Promise<void>(r=>server.close(()=>r()));
}
