/** Explicit network smoke test; never runs during npm test and never uses real funds. */
import { randomBytes, sign } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { base58, hash, keyFromSeed, loadSeed, publicBytes } from '../server/receipts/crypto';
import { ReceiptService, type FinishedReceiptMatch } from '../server/receipts/service';
import { ReceiptStore } from '../server/receipts/store';
import { SolanaRpc, DEVNET_RPC, DEVNET_GENESIS } from '../server/receipts/rpc';
if(!process.argv.includes('--send-devnet'))throw new Error('Pass --send-devnet to request free test SOL and send a synthetic test receipt.');
const dir=resolve(process.env.SOLANA_SMOKE_DIR||'.cache/solana-smoke'),seed=loadSeed(resolve(dir,'attestor.seed')),walletSeed=loadSeed(resolve(dir,'wallet.seed'));
const attestor=base58(publicBytes(seed)),wallet=base58(publicBytes(walletSeed));
async function rpc(method:string,params:unknown[]=[]){
  const r=await fetch(DEVNET_RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(10000)});
  const data=await r.json();if(!r.ok||data.error)throw new Error(data.error?.message??'Devnet request failed');return data.result;
}
if(await rpc('getGenesisHash')!==DEVNET_GENESIS)throw new Error('Wrong network');
let balance=(await rpc('getBalance',[attestor,{commitment:'confirmed'}])).value;
if(balance<10000){
  try{await rpc('requestAirdrop',[attestor,100_000_000]);console.log('Free Devnet airdrop requested.');}
  catch(error){console.log(JSON.stringify({status:'funding-unavailable',network:'solana:devnet',attestor,reason:error instanceof Error?error.message:'Airdrop failed',note:'No real funds used; a free Devnet faucet is required. No retry attempted.'}));process.exit(2);}
  for(let i=0;i<20&&balance<10000;i++){await new Promise(r=>setTimeout(r,1500));balance=(await rpc('getBalance',[attestor,{commitment:'confirmed'}])).value;}
}
if(balance<10000)throw new Error('Devnet test funding not confirmed');
const store=new ReceiptStore(resolve(dir,'receipts.sqlite'));
try{
  const service=new ReceiptService(store,seed,'https://gitzilla.wilflin.me',new SolanaRpc()),token=base58(randomBytes(24));
  // Synthetic public-PvP fixture, expressly not a real user's match.
  const input={eligible:true,winner:'test-player',placements:{'test-player':1},participants:[{id:'test-player',tokenHash:hash(token)},{id:'other-test-player',tokenHash:hash(randomBytes(24))}],result:{mode:'pvp',victory:false,duration:30,boss:null,mvp:'test-player',players:[{id:'test-player',name:'Synthetic smoke fixture',repo:'pallets/flask',stats:{damage:42,bestCombo:0,limbsBroken:0,revives:0,killingBlow:false}},{id:'other-test-player',name:'Synthetic opponent',repo:'golang/example',stats:{damage:0,bestCombo:0,limbsBroken:0,revives:0,killingBlow:false}}],ranking:[{id:'test-player',name:'Synthetic smoke fixture',repo:'pallets/flask',kos:1,damage:42,roundWins:0,quality:[]}]}} as FinishedReceiptMatch;
  const id=service.record(input)['test-player'],challenge=await service.challenge(id,token,wallet);
  let view=await service.publish(id,token,wallet,base58(sign(null,Buffer.from(challenge.message!),keyFromSeed(walletSeed))));
  const file=resolve(dir,'receipt.json');writeFileSync(file,JSON.stringify(view.receipt,null,2)+'\n',{mode:0o600});
  for(let i=0;i<40&&view.status==='pending';i++){await new Promise(r=>setTimeout(r,2500));view=await service.refresh(id,token);if(i%5===0)console.log(JSON.stringify({status:view.status,transaction:view.transaction}));}
  console.log(JSON.stringify({status:view.status,attestor,wallet,transaction:view.transaction,explorer:view.explorer,file,synthetic:true}));
  if(view.status!=='finalized')process.exitCode=2;
}finally{store.close();}
