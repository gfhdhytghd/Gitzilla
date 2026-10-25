/** Local browser acceptance with a fake Wallet Standard provider and injected RPC. No chain traffic. */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { randomBytes,sign } from 'node:crypto';
import { mkdirSync,writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ReceiptService,type FinishedReceiptMatch } from '../server/receipts/service';
import { ReceiptStore } from '../server/receipts/store';
import { handleReceiptRoute } from '../server/receipts/http';
import { base58,hash,keyFromSeed,publicBytes } from '../server/receipts/crypto';
import type { AnchorRpc } from '../server/receipts/rpc';
const seed=randomBytes(32),walletSeed=randomBytes(32),wallet=base58(publicBytes(walletSeed));
let prepared=0,sent=0,finalized=false;
const rpc:AnchorRpc={balance:async()=>1e9,prepare:async()=>{prepared++;return {wire:'exact-wire',signature:'test-tx',lastValidHeight:99};},send:async()=>{sent++;throw new Error('simulate RPC timeout');},inspect:async()=>finalized?'finalized':'pending'};
const store=new ReceiptStore(':memory:');
const vite=await createServer({configFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},appType:'custom'});
let service:ReceiptService,id='';
vite.middlewares.use((req,res,next)=>{
  if(req.url==='/receipt-harness'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/client/style.css"></head><body style="padding:16px;overflow:auto"><main id="test"></main></body></html>');return;}
  if(req.url?.startsWith('/api/receipts/')||req.url?.startsWith('/.well-known/'))void handleReceiptRoute(req,res,new URL(req.url,'http://localhost'),service).then(ok=>{if(!ok)next();});else next();
});
await vite.listen();const base=vite.resolvedUrls!.local[0].replace(/\/$/,'');service=new ReceiptService(store,seed,base,rpc);
const input={eligible:true,winner:'a',placements:{a:1},participants:[{id:'a',tokenHash:hash('own-token')}],result:{mode:'pvp',victory:false,duration:30,boss:null,mvp:'a',players:[{id:'a',name:'fixture',repo:'pallets/flask',stats:{damage:1,bestCombo:0,limbsBroken:0,revives:0,killingBlow:false}}]}} as FinishedReceiptMatch;
id=service.record(input).a;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium'}),page=await browser.newPage({viewport:{width:390,height:844}}),errors:string[]=[],requests:string[]=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
await page.addInitScript('window.__name = (fn) => fn;');
await page.exposeFunction('testSign',(bytes:number[])=>[...sign(null,Buffer.from(bytes),keyFromSeed(walletSeed))]);
const assert=(ok:unknown,msg:string)=>{if(!ok)throw new Error(msg);};
mkdirSync('qa/artifacts/receipts',{recursive:true});
try{
  await page.goto(base+'/receipt-harness');
  await page.evaluate(async({id})=>{
    const {installLanguageUi}=await import('/client/'+ 'i18n/index.ts');installLanguageUi();
    const {createReceiptEntry}=await import('/client/'+ 'receipts/entry.ts');
    const entry=createReceiptEntry(id,'own-token');(window as any).entry=entry;document.querySelector('#test')!.append(entry.el);
  },{id});
  assert(!requests.some(url=>url.includes('wallet-standard')),'Wallet discovery eagerly loaded');
  await page.getByRole('button',{name:'Open match receipt',exact:true}).click();
  await page.getByText('No compatible wallet detected.',{exact:false}).waitFor();
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download signed receipt',exact:true}).click();
  const file=await downloaded;assert(file.suggestedFilename().endsWith('.json'),'Download missing');await file.saveAs('qa/artifacts/receipts/download.json');
  const verification=spawnSync('npx',['tsx','tools/verify-solana-receipt.ts','qa/artifacts/receipts/download.json','--attestor',service.attestor],{encoding:'utf8'});
  assert(verification.status===0,'Independent downloaded receipt verifier failed: '+verification.stderr);
  await page.evaluate(({wallet,publicKey})=>{
    const account={address:wallet,publicKey:new Uint8Array(publicKey),chains:['solana:devnet'],features:['solana:signMessage']};
    (window as any).deny=true;
    const provider={version:'1.0.0',name:'Test Wallet',icon:'data:image/svg+xml;base64,PHN2Zy8+',chains:['solana:devnet'],accounts:[account],features:{'standard:connect':{version:'1.0.0',connect:async()=>({accounts:[account]})},'solana:signMessage':{version:'1.0.0',signMessage:async({message}:any)=>{if((window as any).deny){(window as any).deny=false;throw new Error('rejected');}return [{signedMessage:message,signature:new Uint8Array(await (window as any).testSign([...message]))}];}}}};
    window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet',{detail:(api:any)=>api.register(provider)}));
  },{wallet,publicKey:[...publicBytes(walletSeed)]});
  await page.getByRole('button',{name:'Connect wallet',exact:false}).click();
  await page.getByRole('button',{name:'Sign message and anchor',exact:true}).click();
  await page.getByText('Signing cancelled.',{exact:false}).waitFor();assert(prepared===0,'Rejected signature published');
  await page.getByRole('button',{name:'Sign message and anchor',exact:true}).click();
  await page.getByText('Anchor pending.',{exact:false}).waitFor();assert(prepared===1,'Missing prepared transaction');
  await page.getByRole('button',{name:'Check anchor status',exact:true}).click();assert(prepared===1,'Retry rebuilt transaction');
  finalized=true;await page.getByRole('button',{name:'Check anchor status',exact:true}).click();
  await page.getByText('Finalized on Solana Devnet.',{exact:true}).waitFor();
  assert((await page.getByRole('link',{name:'View on Devnet explorer'}).getAttribute('href'))?.includes('cluster=devnet'),'Wrong explorer network');
  for(const lang of ['en','zh','es','fr']){
    await page.evaluate(async lang=>{(await import('/client/'+ 'i18n/index.ts')).setLanguage(lang as any);},lang);await page.waitForTimeout(100);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile horizontal overflow '+lang);
    await page.screenshot({path:`qa/artifacts/receipts/${lang}.png`,fullPage:true});
  }
  await page.evaluate(()=>(window as any).entry.destroy());assert(await page.locator('[data-testid="match-receipt"]').count()===0,'Receipt did not dispose');
  assert(errors.length===0,'Browser errors: '+errors.join(','));
  const result={passed:true,viewport:'390x844',locales:['en','zh','es','fr'],checks:['lazy wallet discovery','no-wallet download','independent download verifier','late wallet registration','rejected signature','real Ed25519 wallet signature','pending after timeout','same-wire refresh','finalized link','mobile layout','dispose'],prepared,sent,errors};
  writeFileSync('qa/artifacts/receipts/browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();await vite.close();store.close();}
