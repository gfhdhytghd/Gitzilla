import { chromium } from 'playwright';
import { WebSocket } from 'ws';
import { once } from 'node:events';
import { writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { mergeClassroomPacket } from '../shared/classroom-delta';

const base='http://127.0.0.1:60815', out='/tmp/classroom-final-ii48wwik/browser';
mkdirSync(out,{recursive:true});
const result:any={head:'62760c7',base,started:new Date().toISOString(),checks:[],defects:[],pageErrors:[],consoleErrors:[],protocolErrors:[],privacyViolations:[],snapshots:[],notes:[]};
const peers:any[]=[];const pages:any[]=[];
let browser:any;
const save=()=>writeFileSync(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');
const check=(ok:boolean,name:string,details?:any)=>{(ok?result.checks:result.defects).push({name,details});console.log(`${ok?'PASS':'DEFECT'} ${name}`);save();};
const until=async(fn:()=>any,label:string,ms=45000)=>{const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw Error(`Timeout: ${label}`);await sleep(20);}};
async function openPage(name:string,teacher=false,width=393){
  const ctx=await browser.newContext({viewport:{width,height:width===393?852:1000},isMobile:width===393,hasTouch:width===393});
  await ctx.route('**/*',async route=>{const u=route.request().url();if(!u.startsWith(base)&&/^https?:/.test(u))await route.abort();else await route.continue();});
  await ctx.addInitScript(({name,teacher}:any)=>{
    try{localStorage.setItem('gitzilla.onboarding.v1','1');localStorage.setItem('kaiju.name',name);localStorage.setItem('gitzilla.locale','en');}catch{}
    const qa=(window as any).qa={name,teacher,frames:[],sent:[],violations:[],protocolErrors:[],deltas:0,bytes:0};
    const Native=window.WebSocket;
    window.WebSocket=class extends Native{
      constructor(url:any,protocols?:any){super(url,protocols);let prior:any;
        this.addEventListener('message',(e:any)=>{
          let m:any;try{m=JSON.parse(String(e.data));}catch{return;}
          if(!['welcome','lobby','classroom','error','kicked'].includes(m.t))return;
          qa.bytes+=String(e.data).length;
          if(m.t==='welcome'){qa.id=m.you;qa.welcome=m;}
          if(m.t==='error')qa.protocolErrors.push(m.message);
          const state=m.t==='classroom'?m.state:m.lobby?.classroom;
          if(state&&!teacher){
            for(const row of state.rows??[])if(row.id!==qa.id)qa.violations.push({field:'row',id:row.id});
            for(const round of state.rounds??[])for(const a of round.attacks??[])if(a.id!==qa.id)qa.violations.push({field:'attack',id:a.id});
            for(const id of Object.keys(m.reports??{}))if(id!==qa.id)qa.violations.push({field:'report',id});
            for(const p of m.lobby?.players??[])if(p.id!==qa.id)qa.violations.push({field:'player',id:p.id});
          }
          qa.frames.push(m);
          if(m.t==='classroom'){
            let full=m;
            if(m.delta){qa.deltas++;if(!prior){qa.protocolErrors.push('delta without initial snapshot');return;}
              const reports={...prior.reports,...m.reports};for(const id of m.delta.removedReports)delete reports[id];
              full={...m,state:{...m.state,...(m.delta.planUnchanged?{plan:prior.state.plan}:{}),...(m.delta.roundsUnchanged?{rounds:prior.state.rounds}:{})},reports};
            }
            prior=full;qa.state=full.state;qa.reports=full.reports;
          }
        });
      }
      send(data:any){if(typeof data==='string')try{qa.sent.push(JSON.parse(data));}catch{}super.send(data);}
    } as any;
  },{name,teacher});
  const page=await ctx.newPage();pages.push({name,page,teacher});
  page.on('pageerror',(e:any)=>{result.pageErrors.push({name,message:e.message});save();});
  page.on('console',(m:any)=>{if(m.type()==='error')result.consoleErrors.push({name,message:m.text()});});
  page.on('dialog',(d:any)=>d.accept());
  return page;
}
const tid=(p:any,id:string)=>p.getByTestId(id);
const phase=(p:any)=>p.evaluate(()=>(window as any).qa.state?.phase);
async function snap(p:any,name:string){await p.screenshot({path:`${out}/${name}.png`,fullPage:false});result.snapshots.push(name);save();}
async function bot(name:string,room:string){
  const socket=new WebSocket(base.replace('http','ws')+'/ws');const peer:any={name,socket,id:'',packet:undefined};peers.push(peer);
  socket.on('error',e=>result.protocolErrors.push(`${name}: ${e.message}`));
  socket.on('message',raw=>{
    const m=JSON.parse(String(raw));if(m.t==='welcome')peer.id=m.you;
    if(m.t==='error')result.protocolErrors.push(`${name}: ${m.message}`);
    const state=m.t==='classroom'?m.state:m.lobby?.classroom;
    if(state){for(const row of state.rows??[])if(row.id!==peer.id)result.privacyViolations.push({name,field:'row',id:row.id});for(const r of state.rounds??[])for(const a of r.attacks??[])if(a.id!==peer.id)result.privacyViolations.push({name,field:'attack',id:a.id});}
    if(m.t==='classroom')peer.packet=mergeClassroomPacket(peer.packet,m);
  });
  await once(socket,'open');socket.send(JSON.stringify({t:'hello',room,role:'player',name,classroomDelta:true}));
  await until(()=>peer.id,`${name} joined`);return peer;
}
try{
  browser=await chromium.launch({headless:true});
  const response=await fetch(base+'/api/room?mode=edu',{method:'POST'});const {room}=await response.json() as any;result.room=room;
  const teacher=await openPage('QA_TEACHER',true,1440);await teacher.goto(`${base}/r/${room}?screen=1`);await tid(teacher,'classroom-plan-editor').waitFor({timeout:60000});
  console.log('TEACHER EDITOR READY');
  // Author both the mixed step and its starter through the real UI. No course API mocks or state injection.
  if(await tid(teacher,'step-remove-2').count()){await tid(teacher,'step-editor-2').locator('summary').first().click();await tid(teacher,'step-remove-2').click();}
  await teacher.locator('[data-testid="step-editor-0"]').evaluate((e:any)=>e.open=true);
  await tid(teacher,'step-title-0').fill('Acceptance: code and question');
  await tid(teacher,'step-instructions-0').fill('Make answer() return 42, submit your code, and answer the question.');
  await tid(teacher,'step-minutes-0').fill('0');
  await tid(teacher,'step-checks-0').fill('contains: main.py :: return 42');
  await tid(teacher,'step-check-weight-0').fill('100');
  await tid(teacher,'step-mode-0').selectOption('mixed');
  await tid(teacher,'question-prompt-0-0').fill('What should answer() return?');
  await tid(teacher,'option-text-0-0-0').fill('42');await tid(teacher,'option-text-0-0-1').fill('0');
  await tid(teacher,'option-correct-0-0-0').check();
  await tid(teacher,'question-explain-0-0').fill('The required answer is 42.');
  await tid(teacher,'step-starter-add-0').click();
  await tid(teacher,'step-starter-path-0-0').fill('main.py');
  const input=tid(teacher,'step-starter-content-0-0');await input.fill('');await input.focus();
  await teacher.keyboard.type('def answer():');await teacher.keyboard.press('Enter');await teacher.keyboard.type('return 0');
  check(await input.inputValue()==='def answer():\n    return 0','starter authored with editor indentation');
  await teacher.locator('[data-testid="step-editor-1"]').evaluate((e:any)=>e.open=true);
  await tid(teacher,'step-title-1').fill('Acceptance wrap-up');await tid(teacher,'step-minutes-1').fill('0');
  await tid(teacher,'classroom-save-plan').click();
  await teacher.waitForFunction(()=>(window as any).qa.state?.plan.steps[0].mode==='mixed',null,{timeout:30000});
  const plan=await teacher.evaluate(()=>(window as any).qa.state.plan);result.authoredPlan=plan;
  check(plan.steps[0].starter[0].content==='def answer():\n    return 0','published starter matches editor');
  await snap(teacher,'teacher-authored-1440');
  const students=[];
  for(const name of ['QA_ADA','QA_BEN','QA_CAI']){
    const p=await openPage(name);await p.goto(`${base}/r/${room}`);
    await Promise.race([tid(p,'join-room').waitFor({timeout:30000}).then(async()=>{await tid(p,'player-name').fill(name);await tid(p,'join-room').click();}),tid(p,'classroom-screen').waitFor({timeout:30000})]);
    await tid(p,'classroom-screen').waitFor({timeout:30000});students.push(p);
  }
  const projector=await openPage('QA_PROJECTOR',false,1440);await projector.goto(`${base}/r/${room}?screen=1&view=projector`);await tid(projector,'classroom-screen').waitFor({timeout:30000});
  console.log('BROWSER STUDENTS READY; JOINING 197 BOTS');
  const bots=await Promise.all(Array.from({length:197},(_,i)=>bot(`QA_BOT_${String(i).padStart(3,'0')}`,room)));
  await teacher.waitForFunction(()=>(window as any).qa.state?.summary?.roster===200,null,{timeout:30000});
  async function counts(label:string,submitted:number){
    for(const [index,p] of [...students,projector].entries()){
      await p.waitForFunction(({submitted}:any)=>{const s=(window as any).qa.state;return s?.summary?.roster===200&&s.summary.submitted===submitted;},{submitted},{timeout:30000});
      await p.waitForFunction(({submitted}:any)=>new RegExp(`${submitted} of 200 submitted`).test(document.querySelector('[data-testid="classroom-progress"]')?.textContent??''),{submitted},{timeout:15000});
      const value=await tid(p,'classroom-progress').textContent();check(new RegExp(`${submitted} of 200 submitted`).test(value),`${label}: ${index===3?'projector':`student ${index+1}`} displayed counts`,value);
    }
  }
  await counts('setup',0);await snap(projector,'projector-setup-200');
  await tid(teacher,'classroom-start').click();await until(async()=>await phase(teacher)==='coding','coding');
  for(const p of students){
    await tid(p,'classroom-part-code').click();await tid(p,'classroom-inapp').getByTestId('code-editor-input').waitFor();
    const editor=tid(p,'classroom-inapp').getByTestId('code-editor-input');
    check((await editor.inputValue()).includes('return 0'),'browser student received authored starter');
    await editor.fill('def answer():\n    return 42\n');await tid(p,'classroom-submit-code').click();
    await p.waitForFunction(()=>{const q=(window as any).qa;return q.state?.rows.find((r:any)=>r.id===q.id)?.status==='submitted';},null,{timeout:30000});
    await tid(p,'classroom-part-questions').click();await tid(p,`question-option-${plan.steps[0].questions[0].id}-${plan.steps[0].questions[0].answer}`).check({force:true});
    await p.waitForFunction(()=>document.querySelector('[data-testid="question-save-state"]')?.textContent?.includes('All saved'),null,{timeout:15000});
  }
  for(const p of bots){p.socket.send(JSON.stringify({t:'classroomSubmitCode',files:[{path:'main.py',content:'def answer():\n    return 42\n'}]}));p.socket.send(JSON.stringify({t:'classroomAnswers',stepId:plan.steps[0].id,attempt:1,answers:{[plan.steps[0].questions[0].id]:{choice:plan.steps[0].questions[0].answer}}}));}
  await teacher.waitForFunction(()=>{const s=(window as any).qa.state;return s?.summary?.submitted===200&&s.summary.queued===0;},null,{timeout:60000});
  await counts('submitted',200);await snap(students[0],'student-submitted-393');await snap(projector,'projector-submitted-200');
  const graded=await teacher.evaluate(()=>(window as any).qa.state.rows.map((r:any)=>({id:r.id,score:r.score,status:r.status})));
  check(graded.length===200&&graded.every((r:any)=>r.score===100),'all 200 mixed submissions grade to 100',graded.filter((r:any)=>r.score!==100));
  await tid(teacher,'classroom-attack').click();await until(async()=>await phase(projector)==='raid','raid');await counts('raid',200);await snap(projector,'projector-raid-200');
  await until(async()=>await phase(projector)==='feedback','reveal',20000);await counts('reveal',200);
  for(const p of students){await tid(p,'classroom-part-questions').click();check((await p.evaluate(()=>(window as any).qa.reports[(window as any).qa.id]?.answers))?.[plan.steps[0].questions[0].id]?.correct===true,'student answer revealed');}
  await snap(teacher,'teacher-reveal-1440');await snap(projector,'projector-reveal-200');
  const body=await projector.locator('body').innerText();check(!/QA_ADA|QA_BEN|QA_CAI|QA_BOT_/.test(body),'projector visible text has no peer names');
  await tid(teacher,'classroom-next').click();await until(async()=>await phase(projector)==='coding','next');await counts('next',0);
  await tid(teacher,'classroom-more').locator('summary').click();await tid(teacher,'classroom-finish').click();await until(async()=>await phase(projector)==='complete','finish');await counts('finish',0);
  await snap(projector,'projector-complete-200');
  for(const {name,page,teacher:isTeacher} of pages){
    const qa=await page.evaluate(()=>(window as any).qa);result.protocolErrors.push(...qa.protocolErrors.map((message:string)=>({name,message})));result.privacyViolations.push(...qa.violations.map((v:any)=>({name,...v})));
    const hellos=qa.sent.filter((m:any)=>m.t==='hello');check(hellos.length>0&&hellos.every((m:any)=>m.classroomDelta===true),`${name}: real client negotiated delta`);
    check(qa.deltas>0,`${name}: delta frames consumed`,{frames:qa.frames.length,deltas:qa.deltas,bytes:qa.bytes});
    const redact=(_k:string,value:any)=>_k==='token'||_k==='resume'?'<redacted>':value;writeFileSync(`${out}/${name}-frames.json`,JSON.stringify(qa.frames,redact,2)+'\n');
    if(!isTeacher)check(qa.violations.length===0,`${name}: no peer names/scores in row, attack or report frames`);
  }
  check(result.pageErrors.length===0,'no browser page errors',result.pageErrors);
  check(result.protocolErrors.length===0,'no protocol/socket errors',result.protocolErrors);
  check(result.privacyViolations.length===0,'all 197 bot frames retain only own identity',result.privacyViolations);
}catch(error:any){result.defects.push({name:'browser scenario could not complete',message:error.message,stack:error.stack});console.error(error);
  for(const {name,page} of pages)try{await snap(page,`${name}-failure`);writeFileSync(`${out}/${name}-failure.txt`,await page.locator('body').innerText());}catch{}
}finally{
  for(const p of peers)p.socket.terminate();if(browser)await browser.close();result.finished=new Date().toISOString();save();console.log(JSON.stringify({checks:result.checks.length,defects:result.defects,pageErrors:result.pageErrors,privacyViolations:result.privacyViolations.length}));
  if(result.defects.length)process.exitCode=1;
}
