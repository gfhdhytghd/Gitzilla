import { existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Autopsy } from '../../shared/types';
import { claimMessage, canonical, type ReceiptPayload, type ReceiptView } from '../../shared/receipt';
import { base58, from58, hash, loadSeed, publicBytes, signReceipt, verifyEd25519 } from './crypto';
import { ReceiptStore, type ReceiptRecord } from './store';
import { SolanaRpc, type AnchorRpc, type MemoBinding } from './rpc';
export interface FinishedReceiptMatch {
  eligible:boolean; result:Autopsy; participants:{id:string;tokenHash:string}[];
  winner:string|null; placements:Record<string,number>;
}
export class ReceiptError extends Error {constructor(public status:number,message:string){super(message);}}
export class ReceiptService {
  readonly attestor:string;
  private busy=new Map<string,Promise<unknown>>();
  private nonceRates=new Map<string,{count:number;until:number}>();
  constructor(readonly store:ReceiptStore,private seed:Uint8Array,readonly origin:string,private rpc:AnchorRpc=new SolanaRpc(),private now:()=>number=Date.now) {
    this.attestor=base58(publicBytes(seed));
    const u=new URL(origin);if(u.origin!==origin || origin.length>100)throw new Error('Configure a short application origin');
  }
  /** Called once after a public PvP result is frozen. Never accepts a client result. */
  record(input:FinishedReceiptMatch):Record<string,string> {
    if(!input.eligible || input.result.mode!=='pvp' || input.result.boss || input.participants.length<2)return {};
    const ids:Record<string,string>={},match=randomUUID(),issuedAt=new Date(this.now()).toISOString();
    return this.store.transaction(()=>{
    for(const owner of input.participants) {
      const row=input.result.ranking?.find(p=>p.id===owner.id),player=input.result.players.find(p=>p.id===owner.id);
      if(!player || !/^[a-f0-9]{64}$/.test(owner.tokenHash))continue;
      const payload:ReceiptPayload={version:1,game:'gitzilla',mode:'pvp',id:randomUUID(),match,issuedAt,
        outcome:input.winner===null?'draw':input.winner===owner.id?'win':'loss',placement:input.placements[owner.id]??null,
        entrants:input.result.players.length,humans:input.participants.length,repo:player.repo,kos:Math.max(0,Math.round(row?.kos??0)),damage:Math.max(0,Math.round(player.stats.damage*10)/10)};
      const receipt=signReceipt(payload,this.seed);
      this.store.put({id:payload.id,ownerHash:owner.tokenHash,receipt,status:'unclaimed',wallet:null,nonce:null,expires:null,message:null,challengeOrigin:null,memo:null,walletSignature:null,transaction:null,wire:null,lastValidHeight:null});
      ids[owner.id]=payload.id;
    }
    return ids;
    });
  }
  private owner(id:string,token:string|undefined) {
    const row=this.store.get(id);
    if(!row || !token || token.length>256 || hash(token)!==row.ownerHash)throw new ReceiptError(404,'Receipt not found for this player');
    return row;
  }
  private view(row:ReceiptRecord):ReceiptView {
    return {receipt:row.receipt,network:'solana:devnet',status:row.status,wallet:row.wallet,transaction:row.transaction,
      explorer:row.transaction?`https://explorer.solana.com/tx/${row.transaction}?cluster=devnet`:null,anchorAvailable:row.receipt.attestor===this.attestor};
  }
  get(id:string,token:string|undefined) {return this.view(this.owner(id,token));}
  keys() {return {version:1,network:'solana:devnet',current:this.attestor,keys:[...new Set([this.attestor,...this.store.keys()])]};}
  private async lock<T>(id:string,fn:()=>Promise<T>):Promise<T> {
    while(this.busy.has(id))await this.busy.get(id)!.catch(()=>{});
    const job=fn();this.busy.set(id,job);
    try{return await job;}finally{if(this.busy.get(id)===job)this.busy.delete(id);}
  }
  private limit(id:string,max=10) {
    const now=this.now(),before=this.nonceRates.get(id);
    const next=before&&before.until>now?{...before,count:before.count+1}:{count:1,until:now+60000};
    this.nonceRates.set(id,next);
    if(this.nonceRates.size>10000)for(const [key,value]of this.nonceRates)if(value.until<now)this.nonceRates.delete(key);
    if(next.count>max)throw new ReceiptError(429,'Too many receipt requests; wait a minute');
  }
  private wallet(wallet:string) {
    try {if(wallet.length<32||wallet.length>44||from58(wallet).length!==32||wallet===this.attestor)throw 0;}
    catch{throw new ReceiptError(400,'Choose a valid Solana wallet');}
  }
  async challenge(id:string,token:string|undefined,wallet:string) {
    return this.lock(id,async()=>{
      const row=this.owner(id,token);this.limit(id);this.wallet(wallet);
      if(row.receipt.attestor!==this.attestor)throw new ReceiptError(409,'This receipt uses an archived signing key; download the signed receipt');
      if((row.status==='pending'||row.status==='finalized'||row.walletSignature)&&row.wallet&&row.wallet!==wallet)throw new ReceiptError(409,'This receipt is already bound to another wallet');
      if(row.status==='pending'||row.status==='finalized')return {view:this.view(row)};
      if(row.nonce&&row.expires!>this.now()&&row.wallet===wallet)return {message:row.message,expires:row.expires};
      try {if(await this.rpc.balance(this.attestor)<10000)throw 0;}
      catch {throw new ReceiptError(503,'Devnet anchoring is temporarily unavailable. You can download the signed receipt.');}
      const nonce=randomBytes(16).toString('hex'),expires=this.now()+300000;
      row.wallet=wallet;row.nonce=nonce;row.expires=expires;row.challengeOrigin=this.origin;
      row.message=claimMessage({origin:row.challengeOrigin,id,digest:row.receipt.digest,wallet,attestor:this.attestor,nonce,expires});
      this.store.put(row);return {message:row.message,expires};
    });
  }
  async publish(id:string,token:string|undefined,wallet:string,signature:string):Promise<ReceiptView> {
    return this.lock(id,async()=>{
      const row=this.owner(id,token);this.limit(id);this.wallet(wallet);
      if(row.wallet!==wallet)throw new ReceiptError(409,'The wallet changed; request a new signing message');
      if(row.status==='pending'||row.status==='finalized')return this.view(row);
      if(!row.nonce||!row.message||!row.challengeOrigin||!row.expires||row.expires<=this.now())throw new ReceiptError(409,'The signing message expired; try again');
      if(!verifyEd25519(wallet,new TextEncoder().encode(row.message),signature))throw new ReceiptError(400,'Wallet signature verification failed');
      const binding:MemoBinding={v:1,id,d:row.receipt.digest,w:wallet,o:row.challengeOrigin,n:row.nonce,e:row.expires,s:signature};
      const memo=canonical(binding);
      let prepared;
      try {prepared=await this.rpc.prepare(this.seed,this.attestor,memo);}
      catch {throw new ReceiptError(503,'Devnet anchoring is temporarily unavailable. You can download the signed receipt.');}
      row.memo=memo;row.status='pending';row.transaction=prepared.signature;row.wire=prepared.wire;row.lastValidHeight=prepared.lastValidHeight;
      row.walletSignature=signature;row.nonce=null;this.store.put(row);
      // The txid and exact bytes are durable before broadcast. A timeout never creates a new tx.
      void this.rpc.send(row.wire).catch(()=>{}); // Reconcile the known signature on explicit refresh.
      return this.view(row);
    });
  }
  async refresh(id:string,token:string|undefined):Promise<ReceiptView> {
    return this.lock(id,async()=>{
      const row=this.owner(id,token);this.limit(id+':refresh',30);
      if(row.status!=='pending'||!row.transaction||!row.wire||row.lastValidHeight===null||!row.memo)return this.view(row);
      try {
        const status=await this.rpc.inspect(row.transaction,row.receipt.attestor,row.memo,row.lastValidHeight);
        row.status=status;
        if(status!=='pending'){row.message=null;row.nonce=null;row.wire=null;}
        this.store.put(row);
        // Resending identical bytes is idempotent, including across server restarts.
        if(status==='pending'&&row.wire)void this.rpc.send(row.wire).catch(()=>{});
      }catch{ /* Unknown stays pending. No automatic rebuild or duplicate transaction. */ }
      return this.view(row);
    });
  }
}
export function createReceiptService(root:string,origin:string) {
  const directory=resolve(process.env.SOLANA_RECEIPTS_DIR||resolve(root,'.cache/solana'));
  const path=resolve(process.env.SOLANA_ATTESTOR_KEY_FILE||resolve(directory,'attestor.seed'));
  const rel=relative(root,path);
  if(!rel.startsWith('..')) {
    if(/^(?:dist|public)(?:[\\/]|$)/.test(rel))throw new Error('Attestor key must be outside served asset directories');
    if(spawnSync('git',['ls-files','--error-unmatch','--',rel],{cwd:root,stdio:'ignore'}).status===0)throw new Error('Attestor keys must not be tracked');
    if(spawnSync('git',['check-ignore','--quiet','--',rel],{cwd:root,stdio:'ignore'}).status!==0)throw new Error('Attestor key path must be ignored by Git');
  }
  const database=resolve(directory,'receipts.sqlite');
  if(/^(?:dist|public)(?:[\\/]|$)/.test(relative(root,database)))throw new Error('Receipt database must be outside served asset directories');
  if(existsSync(database)&&!existsSync(path))throw new Error('Restore the existing attestor key before reopening its database');
  const rpc=new SolanaRpc(process.env.SOLANA_DEVNET_RPC_URL),seed=loadSeed(path),store=new ReceiptStore(database);
  try{return new ReceiptService(store,seed,origin,rpc);}catch(error){store.close();throw error;}
}
