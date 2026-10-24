/** Settings stays at the page's top-right and scrolls with its content. */
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
const base=`http://127.0.0.1:${(server.httpServer!.address() as {port:number}).port}`;
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});
try {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/,r=>r.abort());
 await context.addInitScript(()=>{
  localStorage.setItem('gitzilla.onboarding.v1','1');localStorage.setItem('kaiju.motionProfile','tap-only');
  localStorage.setItem('kaiju.touchTrained.v1','1');localStorage.setItem('kaiju.name','Layout tester');
 });
 const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const views=[['landing','/?mock=1','.landing'],['lobby','/r/TEST?mock=1','.lobby-scroll'],['results','/r/TEST?mock=autopsy','.ap-scroll'],['classroom','/r/EDUT?mock=edu&screen=1','.classroom-screen']];
 for(const [name,path,selector] of views){
  await page.goto(base+path);await page.locator(selector).waitFor();await page.getByTestId('settings-open').waitFor({state:'visible'});
  console.log('checking',name);
  const result=await page.evaluate(selector=>{
   const button=document.querySelector('[data-testid="settings-open"]') as HTMLElement;
   const parent=document.querySelector(selector) as HTMLElement;
   const before=button.getBoundingClientRect();
   if(button.parentElement!==parent)throw new Error('Settings is outside the page scroll container: '+button.parentElement?.className+' vs '+parent?.className);
   if(getComputedStyle(button).position!=='absolute')throw new Error('Settings must be positioned relative to the page');
   if(before.top<0||before.top>30||Math.abs(innerWidth-before.right)>20)throw new Error('Settings is not at the top-right');
   parent.scrollTop=300;
   return {delta:before.top-button.getBoundingClientRect().top,scroll:parent.scrollTop};
  },selector);
  if(name!=='landing'&&(result.scroll<50||Math.abs(result.delta-result.scroll)>1))throw new Error(`Settings did not scroll: ${name} ${JSON.stringify(result)}`);
  await page.locator(selector).evaluate((el:HTMLElement)=>{el.scrollTop=0;});
  await page.getByTestId('settings-open').click();await page.getByTestId('settings-close').click();
 }
 if(errors.length)throw new Error(errors.join('\n'));
 console.log(JSON.stringify({passed:true,pages:views.map(v=>v[0]),scrollsWithContent:true,topRight:true,errors}));
}finally{await browser.close();await server.close();}
