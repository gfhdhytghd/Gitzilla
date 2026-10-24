/** First-run, permission-denial, touch training and secondary settings acceptance. */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const server = await createServer({server:{host:'127.0.0.1',port:0}});
await server.listen();
const base=`http://127.0.0.1:${(server.httpServer!.address() as {port:number}).port}`;
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});
const errors:string[]=[];
try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/,r=>r.abort());
  await context.addInitScript(()=>{
    Object.defineProperty(window,'__name',{value:Function('f','return f'),configurable:true});
    (window as any).permissionCalls=0;
    for(const name of ['DeviceMotionEvent','DeviceOrientationEvent']){
      Object.defineProperty(window,name,{configurable:true,value:{requestPermission:()=>{(window as any).permissionCalls++;return Promise.resolve('denied');}}});
    }
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?mock=1');
  await page.getByTestId('settings-dialog').waitFor({state:'visible'});
  if(await page.getByTestId('controls-seated').count())throw new Error('Removed seated option remains');
  if(await page.evaluate(()=>(window as any).permissionCalls)!==0)throw new Error('Prompted without a user gesture');
  await page.getByTestId('language-select').selectOption('zh');
  await page.waitForFunction(()=>document.documentElement.lang==='zh');
  if(!await page.evaluate(()=>document.fonts.check('16px "Unifont"','中文')))throw new Error('Unifont not loaded');
  await page.getByTestId('controls-motion').click();
  await page.waitForFunction(()=>(window as any).permissionCalls===2);
  await page.evaluate(()=>{
    for(const name of ['DeviceMotionEvent','DeviceOrientationEvent']) Object.defineProperty(window,name,{configurable:true,value:{requestPermission:()=>{(window as any).permissionCalls++;return Promise.resolve('granted');}}});
  });
  await page.getByTestId('controls-motion').click();
  await page.waitForFunction(()=>(window as any).permissionCalls===4);
  await page.evaluate(()=>window.dispatchEvent(Object.assign(new Event('deviceorientation'),{beta:0,gamma:0})));
  await page.getByTestId('controls-retrain').click();
  await page.getByTestId('training').waitFor({state:'visible'});
  await page.getByTestId('training-skip').click();
  if(await page.evaluate(()=>localStorage.getItem('kaiju.gestureProfile'))!==null)throw new Error('Skipped motion practice was marked complete');
  await page.getByTestId('controls-touch').click();
  await page.getByTestId('controls-retrain').click();
  await page.getByTestId('training').waitFor({state:'visible'});
  let pad=await page.getByTestId('touch-practice').boundingBox();if(!pad)throw new Error('Missing practice pad');
  const x=pad.x+pad.width/2,y=pad.y+pad.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+70,y,{steps:5});await page.mouse.up();
  await page.getByTestId('training-next').click();
  for(let i=0;i<3;i++){await page.mouse.click(x,y);await page.waitForTimeout(400);}
  await page.getByTestId('training-next').click();
  for(let i=0;i<2;i++){await page.mouse.dblclick(x,y,{delay:80});await page.waitForTimeout(500);}
  await page.getByTestId('training-next').click();
  await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(700);await page.mouse.up();
  await page.getByTestId('training-next').click();
  await page.getByTestId('settings-dialog').waitFor({state:'visible'});
  if(await page.evaluate(()=>localStorage.getItem('kaiju.touchTrained.v1'))!=='1')throw new Error('Touch practice did not persist');
  mkdirSync('docs/shots/settings',{recursive:true});
  await page.screenshot({path:'docs/shots/settings/oobe-zh.png'});
  await page.getByTestId('settings-close').click();
  if(await page.getByTestId('language-select').isVisible())throw new Error('Language escaped secondary menu');
  await page.reload();await page.getByTestId('join-submit').waitFor();
  if(await page.getByTestId('settings-dialog').isVisible())throw new Error('Completed touch onboarding repeated');
  await page.getByTestId('settings-open').click();
  for(const lang of ['en','zh','es','fr']){await page.getByTestId('language-select').selectOption(lang);await page.waitForFunction(l=>document.documentElement.lang===l,lang);}
  if(await page.evaluate(()=>document.querySelector('[data-testid="settings-dialog"]')!.scrollWidth>innerWidth))throw new Error('Settings overflow');
  await page.screenshot({path:'docs/shots/settings/settings-fr.png'});
  await page.getByTestId('settings-close').click();
  await page.getByTestId('settings-open').focus();await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  if(await page.getByTestId('settings-dialog').isVisible())throw new Error('Escape did not close settings');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify({passed:true,firstRun:true,nativePermissions:4,denialFallback:true,touchPractice:true,remembered:true,locales:4,unifont:true,errors}));
}finally{await browser.close();await server.close();}
