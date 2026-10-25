/** Browser-only mobile handoff acceptance. Native wallet launch and blockchain are simulated. */
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {spawnSync} from 'node:child_process';
import {randomBytes,sign} from 'node:crypto';
import {mkdtempSync,readFileSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ReceiptStore} from '../server/receipts/store';
import {ReceiptService,type FinishedReceiptMatch} from '../server/receipts/service';
import {handleReceiptRoute} from '../server/receipts/http';
import {base58,hash,keyFromSeed,publicBytes} from '../server/receipts/crypto';
import type {AnchorRpc} from '../server/receipts/rpc';
const certDir=mkdtempSync(join(tmpdir(),'receipt-mobile-tls-'));
const cert=join(certDir,'cert.pem'),key=join(certDir,'key.pem');
const generated=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
if(generated.status!==0)throw new Error('Cannot create isolated test TLS certificate');
const store=new ReceiptStore(':memory:'),walletSeed=randomBytes(32),wallet=base58(publicBytes(walletSeed));
let sent=0,prepared=0,finalized=false,redeems=0;
const rpc:AnchorRpc={balance:async()=>1e9,prepare:async()=>{prepared++;return {wire:'one-wire',signature:'mobile-tx',lastValidHeight:99};},send:async()=>{sent++;return 'mobile-tx';},inspect:async()=>finalized?'finalized':'pending'};
const vite=await createServer({configFile:'vite.config.ts',root:process.cwd(),server:{host:'127.0.0.1',port:0,https:{key:readFileSync(key),cert:readFileSync(cert)}},appType:'custom'});
let service:ReceiptService;
vite.middlewares.use((req,res,next)=>{
  if(req.url?.startsWith('/api/receipts/')){if(req.url.endsWith('/redeem'))redeems++;void handleReceiptRoute(req,res,new URL(req.url,'https://localhost'),service);return;}
  if(req.url==='/receipt-harness'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/client/style.css"><body><div class="screen autopsy"><div class="ap-scroll"><main id="test"></main></div></div>');return;}
  if(req.url?.startsWith('/receipt.html')){res.setHeader('Content-Type','text/html');void vite.transformIndexHtml(req.url,readFileSync('receipt.html','utf8')).then(html=>res.end(html));return;}
  next();
});
await vite.listen();const base='https://127.0.0.1:'+(vite.httpServer!.address() as {port:number}).port;
service=new ReceiptService(store,randomBytes(32),base,rpc);
const input={eligible:true,winner:'a',placements:{a:1,b:2},participants:[{id:'a',tokenHash:hash('ORIGINAL_ROOM_TOKEN')},{id:'b',tokenHash:hash('other')}],result:{mode:'pvp',boss:null,victory:false,duration:20,mvp:'a',players:['a','b'].map(id=>({id,name:'test',repo:'pallets/flask',stats:{damage:1,bestCombo:0,limbsBroken:0,revives:0,killingBlow:false}}))}} as FinishedReceiptMatch;
const id=service.record(input).a;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium'});
const config={ignoreHTTPSErrors:true,viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',hasTouch:true,isMobile:true};
const originalContext=await browser.newContext(config),walletContext=await browser.newContext(config),original=await originalContext.newPage();
const errors:string[]=[],requestUrls:string[]=[];
for(const context of [originalContext,walletContext]){await context.addInitScript('window.__name = (fn) => fn;');context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));context.on('request',r=>requestUrls.push(r.url()));}
original.on('pageerror',e=>errors.push(e.message));
await walletContext.exposeFunction('walletSignature',(bytes:number[])=>[...sign(null,Buffer.from(bytes),keyFromSeed(walletSeed))]);
await walletContext.addInitScript(({address,publicKey})=>{
  const account={address,publicKey:new Uint8Array(publicKey),chains:['solana:mainnet'],features:['solana:signMessage']};
  const provider={version:'1.0.0',name:'Mobile test wallet',icon:'data:image/svg+xml;base64,PHN2Zy8+',chains:['solana:mainnet'],accounts:[account],features:{'standard:connect':{version:'1.0.0',connect:async()=>({accounts:[account]})},'solana:signMessage':{version:'1.0.0',signMessage:async({message}:any)=>[{signedMessage:message,signature:new Uint8Array(await (window as any).walletSignature([...message]))}]}}};
  window.addEventListener('wallet-standard:app-ready',(event:any)=>event.detail.register(provider));
},{address:wallet,publicKey:[...publicBytes(walletSeed)]});
const assert=(value:unknown,message:string)=>{if(!value)throw new Error(message);};
mkdirSync('qa/artifacts/receipts-mobile',{recursive:true});
try{
  await original.goto(base+'/receipt-harness');
  await original.evaluate(async(id)=>{
    const {installLanguageUi}=await import('/client/'+'i18n/index.ts');installLanguageUi();
    const {createReceiptEntry}=await import('/client/'+'receipts/entry.ts');document.querySelector('#test')!.append(createReceiptEntry(id,'ORIGINAL_ROOM_TOKEN').el);
  },id);
  await original.getByRole('button',{name:'Open match receipt',exact:true}).click();
  await original.getByRole('button',{name:'Connect with a mobile wallet',exact:true}).click();
  const launch=original.getByRole('link',{name:'Open in Phantom',exact:true});await launch.click({trial:true});assert(await launch.getAttribute('target')==='_blank','App-not-installed fallback would replace the game tab');
  const link=await launch.getAttribute('href');assert(link,'Missing Phantom link');
  await original.screenshot({path:'qa/artifacts/receipts-mobile/open-wallet-en.png',fullPage:true});
  const parsed=new URL(link!),target=decodeURIComponent(parsed.pathname.slice('/ul/browse/'.length));
  assert(!link!.includes('ORIGINAL_ROOM_TOKEN'),'Room token crossed wallet boundary');
  assert(target.startsWith(base+'/receipt.html?'),'Wrong app target');
  assert(await original.getByRole('link',{name:'Open in Solflare',exact:true}).count()===1,'Missing Solflare link');
  const mobile=await walletContext.newPage();await mobile.goto(target);
  await mobile.getByRole('button',{name:'Connect wallet',exact:false}).waitFor();
  assert(!mobile.url().includes('#'),'Handoff ticket remained in browser URL');
  await mobile.getByRole('button',{name:'Connect wallet',exact:false}).click();
  await mobile.getByRole('button',{name:'Sign message and anchor',exact:true}).click();
  await mobile.getByText('Anchor pending.',{exact:false}).waitFor();assert(prepared===1&&sent===1,'Wrong transaction count');
  await mobile.reload();await mobile.getByText('Anchor pending.',{exact:false}).waitFor();assert(redeems===1,'Reload replayed one-use ticket');
  const replayContext=await browser.newContext(config),replay=await replayContext.newPage();await replay.goto(target);await replay.getByText('Wallet link unavailable',{exact:true}).waitFor();await replayContext.close();
  finalized=true;
  await original.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await original.getByText('Finalized on Solana Devnet.',{exact:true}).waitFor();
  for(const lang of ['en','zh','es','fr']){
    await mobile.evaluate(async(lang)=>(await import('/client/'+'i18n/index.ts')).setLanguage(lang as any),lang);await mobile.waitForTimeout(100);
    assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow '+lang);
    await mobile.screenshot({path:`qa/artifacts/receipts-mobile/${lang}.png`,fullPage:true});
  }
  assert(!requestUrls.some(url=>url.includes('ORIGINAL_ROOM_TOKEN')||url.includes('handoff=')),'Credential leaked in HTTP URL');
  assert(!requestUrls.some(url=>/\/ws(?:\?|$)|\/api\/room(?:\?|$)/.test(url)),'Wallet page tried to join a room');
  assert(errors.length===0,'Page errors: '+errors.join(','));
  const result={passed:true,simulatedNativeLaunch:true,realWalletAppVerified:false,viewport:'390x844',checks:['HTTPS official links','no room token transfer','separate browser storage','fragment cleared','receipt-scoped grant','default mainnet message signer','single transaction','reload without ticket replay','used ticket rejected','original tab updates','four language layouts','no room websocket'],prepared,sent,redeems,errors};
  writeFileSync('qa/artifacts/receipts-mobile/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();await vite.close();store.close();rmSync(certDir,{recursive:true,force:true});}
