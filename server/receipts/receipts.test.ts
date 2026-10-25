import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { randomBytes, sign } from 'node:crypto';
import { mkdtempSync, rmSync, statSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { ReceiptService,createReceiptService, type FinishedReceiptMatch } from './service';
import { ReceiptStore } from './store';
import { base58, hash, keyFromSeed, publicBytes, verifyReceipt, verifyEd25519, loadSeed } from './crypto';
import { SolanaRpc, DEVNET_GENESIS, MEMO_PROGRAM, type AnchorRpc } from './rpc';
import { handleReceiptRoute } from './http';
import { walletBindingMessage } from '../../tools/receipt-verifier';
import { canonical,claimMessage } from '../../shared/receipt';
import { encode58 } from '../../client/receipts/base58';
const dirs:string[]=[],stores:ReceiptStore[]=[];
afterEach(()=>{for(const s of stores.splice(0))s.close();for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});vi.restoreAllMocks();vi.unstubAllEnvs();});
function temp(){const d=mkdtempSync(join(tmpdir(),'gitzilla-receipt-'));dirs.push(d);return d;}
function fixture(path=':memory:') {
  let now=1_800_000_000_000;
  const seed=randomBytes(32),walletSeed=randomBytes(32),wallet=base58(publicBytes(walletSeed));
  const rpc:AnchorRpc={balance:vi.fn(async()=>1e9),prepare:vi.fn(async()=>({wire:'same-wire',signature:'same-tx',lastValidHeight:90})),send:vi.fn(async()=>{expect(store.get(id)?.status).toBe('pending');return 'same-tx';}),inspect:vi.fn(async()=> 'pending' as const)};
  const store=new ReceiptStore(path);stores.push(store);
  const service=new ReceiptService(store,seed,'https://gitzilla.example',rpc,()=>now);
  const input={eligible:true,winner:'a',placements:{a:1,b:2},participants:[{id:'a',tokenHash:hash('token-a')},{id:'b',tokenHash:hash('token-b')}],result:{mode:'pvp',victory:false,duration:30,boss:null,mvp:'a',players:[{id:'a',name:'Alice',repo:'alice/public',stats:{damage:12.34,bestCombo:0,limbsBroken:0,revives:0,killingBlow:false}},{id:'b',name:'Bob',repo:'bob/public',stats:{damage:9,bestCombo:0,limbsBroken:0,revives:0,killingBlow:false}}],ranking:[{id:'a',name:'Alice',repo:'alice/public',kos:2,damage:12.34,roundWins:0,quality:[]},{id:'b',name:'Bob',repo:'bob/public',kos:0,damage:9,roundWins:0,quality:[]}]}} as FinishedReceiptMatch;
  const ids=service.record(input),id=ids.a;
  const signature=(message:string)=>base58(sign(null,Buffer.from(message),keyFromSeed(walletSeed)));
  async function publish(){const challenge=await service.challenge(id,'token-a',wallet);return service.publish(id,'token-a',wallet,signature(challenge.message!));}
  return {service,store,rpc,seed,id,ids,input,wallet,walletSeed,signature,publish,setNow:(n:number)=>now=n};
}
describe('signed public PvP receipts',()=>{
  it('signs salted, canonical own-player results without opponents, source, grades or commit claims',()=>{
    const f=fixture(),a=f.service.get(f.id,'token-a').receipt,b=f.service.get(f.ids.b,'token-b').receipt;
    expect(verifyReceipt(a)).toBe(true);expect(a.payload).toMatchObject({outcome:'win',placement:1,entrants:2,repo:'alice/public',damage:12.3});
    expect(b.payload.outcome).toBe('loss');expect(a.salt).toHaveLength(64);expect(a.salt).not.toBe(b.salt);
    const json=JSON.stringify(a);for(const secret of ['Bob','bob/public','quality','commit','token-a','token-b','Alice'])expect(json).not.toContain(secret);
    expect(verifyReceipt({...a,payload:{...a.payload,outcome:'loss'}})).toBe(false);
    expect(canonical({z:1,a:{y:2,b:0}})).toBe('{"a":{"b":0,"y":2},"z":1}');
  });
  it('refuses classroom, boss and private eligibility and preserves draws',()=>{
    const f=fixture();expect(f.service.record({...f.input,eligible:false})).toEqual({});expect(f.service.record({...f.input,participants:[f.input.participants[0]]})).toEqual({});
    expect(f.service.record({...f.input,result:{...f.input.result,mode:'edu'}})).toEqual({});
    expect(f.service.record({...f.input,result:{...f.input.result,boss:{} as never}})).toEqual({});
    const draw=f.service.record({...f.input,winner:null});expect(f.service.get(draw.a,'token-a').receipt.payload.outcome).toBe('draw');
  });
  it('requires the original player token for reads and all mutations',async()=>{
    const f=fixture();for(const token of [undefined,'token-b','bad']){
      expect(()=>f.service.get(f.id,token)).toThrow('not found');
      await expect(f.service.challenge(f.id,token,f.wallet)).rejects.toThrow('not found');
      await expect(f.service.publish(f.id,token,f.wallet,'bad')).rejects.toThrow('not found');
      await expect(f.service.refresh(f.id,token)).rejects.toThrow('not found');
    }expect(f.rpc.balance).not.toHaveBeenCalled();
  });
  it('binds exact domain, chain, receipt, wallet, digest and expiry; prevents replay and tampering',async()=>{
    const f=fixture(),a=await f.service.challenge(f.id,'token-a',f.wallet);
    expect(a.message).toContain('Origin: https://gitzilla.example');expect(a.message).toContain('Network: solana:devnet');
    expect((await f.service.challenge(f.id,'token-a',f.wallet)).message).toBe(a.message);
    await expect(f.service.publish(f.id,'token-a',f.wallet,f.signature(a.message!.replace('devnet','mainnet')))).rejects.toThrow('verification');
    await f.service.challenge(f.ids.b,'token-b',f.wallet);
    await expect(f.service.publish(f.ids.b,'token-b',f.wallet,f.signature(a.message!))).rejects.toThrow('verification');
    f.setNow(1_800_000_300_001);
    await expect(f.service.publish(f.id,'token-a',f.wallet,f.signature(a.message!))).rejects.toThrow('expired');
    expect(f.rpc.prepare).not.toHaveBeenCalled();
  });
  it('allows account correction before signing, then permanently binds the published wallet',async()=>{
    const f=fixture(),other=base58(publicBytes(randomBytes(32)));
    await f.service.challenge(f.id,'token-a',other);await f.publish();
    await expect(f.service.challenge(f.id,'token-a',other)).rejects.toThrow('another wallet');
  });
  it('keeps download available if RPC, sponsor funding or a rotated attestor is unavailable',async()=>{
    const f=fixture();vi.mocked(f.rpc.balance).mockResolvedValue(0);
    await expect(f.service.challenge(f.id,'token-a',f.wallet)).rejects.toThrow('temporarily unavailable');
    expect(verifyReceipt(f.service.get(f.id,'token-a').receipt)).toBe(true);
    const next=new ReceiptService(f.store,randomBytes(32),'https://gitzilla.example',f.rpc);
    expect(next.get(f.id,'token-a').anchorAvailable).toBe(false);expect(next.keys().keys).toContain(f.service.attestor);
    await expect(next.challenge(f.id,'token-a',f.wallet)).rejects.toThrow('archived');
  });
  it('persists before broadcast, serializes double clicks and resends identical bytes after timeout',async()=>{
    const f=fixture();vi.mocked(f.rpc.send).mockImplementation(async()=>{expect(f.store.get(f.id)?.wire).toBe('same-wire');throw new Error('timeout');});
    const a=await f.service.challenge(f.id,'token-a',f.wallet),sig=f.signature(a.message!);
    const replies=await Promise.all([f.service.publish(f.id,'token-a',f.wallet,sig),f.service.publish(f.id,'token-a',f.wallet,sig)]);
    expect(replies.map(r=>r.transaction)).toEqual(['same-tx','same-tx']);expect(f.rpc.prepare).toHaveBeenCalledTimes(1);
    await f.service.refresh(f.id,'token-a');expect(f.rpc.send).toHaveBeenCalledTimes(2);
    expect(vi.mocked(f.rpc.send).mock.calls.every(c=>c[0]==='same-wire')).toBe(true);
  });
  it('recovers pending bytes after restart, finalizes only after inspection, and forbids a second claim',async()=>{
    const path=join(temp(),'receipts.sqlite'),f=fixture(path);await f.publish();
    f.store.close();stores.splice(stores.indexOf(f.store),1);
    const store=new ReceiptStore(path);stores.push(store);
    const recovered=new ReceiptService(store,f.seed,'https://gitzilla.example',f.rpc);
    vi.mocked(f.rpc.send).mockResolvedValue('same-tx');expect((await recovered.refresh(f.id,'token-a')).status).toBe('pending');
    vi.mocked(f.rpc.inspect).mockResolvedValue('finalized');expect((await recovered.refresh(f.id,'token-a')).status).toBe('finalized');
    expect((await recovered.publish(f.id,'token-a',f.wallet,'replayed')).transaction).toBe('same-tx');expect(f.rpc.prepare).toHaveBeenCalledTimes(1);
  });
  it('never rebuilds unknown transactions, and requires a new signature after definitive expiry',async()=>{
    const f=fixture();await f.publish();vi.mocked(f.rpc.inspect).mockRejectedValueOnce(new Error('offline'));
    expect((await f.service.refresh(f.id,'token-a')).status).toBe('pending');expect(f.rpc.prepare).toHaveBeenCalledTimes(1);
    vi.mocked(f.rpc.inspect).mockResolvedValue('expired');expect((await f.service.refresh(f.id,'token-a')).status).toBe('expired');
    await expect(f.service.publish(f.id,'token-a',f.wallet,'old-signature')).rejects.toThrow('expired');
    const a=await f.service.challenge(f.id,'token-a',f.wallet);await f.service.publish(f.id,'token-a',f.wallet,f.signature(a.message!));expect(f.rpc.prepare).toHaveBeenCalledTimes(2);
  });
  it('persists the exact signed origin and Memo across a configuration change',async()=>{
    const f=fixture(),challenge=await f.service.challenge(f.id,'token-a',f.wallet);
    const moved=new ReceiptService(f.store,f.seed,'https://other.example',f.rpc);
    await moved.publish(f.id,'token-a',f.wallet,f.signature(challenge.message!));
    const memo=f.store.get(f.id)!.memo!;
    expect(JSON.parse(memo).o).toBe('https://gitzilla.example');
    await moved.refresh(f.id,'token-a');expect(f.rpc.inspect).toHaveBeenCalledWith('same-tx',f.service.attestor,memo,90);
  });
  it('rolls back all receipts when a batch write fails',()=>{
    const f=fixture(),put=f.store.put.bind(f.store);let calls=0;
    vi.spyOn(f.store,'put').mockImplementation(row=>{put(row);if(++calls===2)throw new Error('disk full');});
    expect(()=>f.service.record(f.input)).toThrow('disk full');
    const rows=vi.mocked(f.store.put).mock.calls.map(c=>c[0].id);for(const id of rows)expect(f.store.get(id)).toBeUndefined();
  });
  it('refuses a second writer process for the same receipt database',()=>{
    const path=join(temp(),'single.sqlite');fixture(path);
    expect(()=>new ReceiptStore(path)).toThrow(/locked/);
  });
  it('recovers the same pending transaction after process death at broadcast',async()=>{
    const dir=temp(),f=fixture(),program=`
      import {ReceiptStore} from './server/receipts/store.ts';
      import {ReceiptService} from './server/receipts/service.ts';
      import {loadSeed,base58,publicBytes,keyFromSeed} from './server/receipts/crypto.ts';
      import {sign} from 'node:crypto';
      const dir=process.env.RECEIPT_CRASH_DIR;
      const seed=loadSeed(dir+'/key'),walletSeed=loadSeed(dir+'/wallet');
      const store=new ReceiptStore(dir+'/crash.sqlite');
      const rpc={balance:async()=>1e9,prepare:async()=>({wire:'crash-wire',signature:'crash-tx',lastValidHeight:90}),send:async()=>process.exit(0),inspect:async()=>'pending'};
      const service=new ReceiptService(store,seed,'https://gitzilla.example',rpc);
      const input=${JSON.stringify(f.input)};
      const id=service.record(input).a;
      const wallet=base58(publicBytes(walletSeed)),c=await service.challenge(id,'token-a',wallet);
      await service.publish(id,'token-a',wallet,base58(sign(null,Buffer.from(c.message),keyFromSeed(walletSeed))));
      process.exit(3);
    `;
    const child=spawnSync(process.execPath,['--import','tsx','--input-type=module'],{input:program,env:{...process.env,RECEIPT_CRASH_DIR:dir},encoding:'utf8'});
    expect(child.status,child.stderr).toBe(0);
    const store=new ReceiptStore(join(dir,'crash.sqlite'));stores.push(store);
    // IDs are random; the DB's public metadata deliberately cannot enumerate results.
    const {DatabaseSync}=await import('node:sqlite');store.close();stores.splice(stores.indexOf(store),1);
    const db=new DatabaseSync(join(dir,'crash.sqlite'));const rows=db.prepare('SELECT id FROM receipts').all() as {id:string}[];db.close();
    const reopened=new ReceiptStore(join(dir,'crash.sqlite'));stores.push(reopened);
    const id=rows.find(r=>reopened.get(r.id)?.status==='pending')!.id;
    const rpc={...f.rpc,send:vi.fn(async(wire:string)=>{expect(wire).toBe('crash-wire');return 'crash-tx';})};
    const service=new ReceiptService(reopened,loadSeed(join(dir,'key')),'https://gitzilla.example',rpc);
    expect((await service.refresh(id,'token-a')).transaction).toBe('crash-tx');expect(rpc.send).toHaveBeenCalledTimes(1);
  });
  it('creates a private key with strict file permissions and rejects an exposed key',()=>{
    const path=join(temp(),'key');const seed=loadSeed(path);expect(seed).toHaveLength(32);expect(loadSeed(path)).toEqual(seed);expect(statSync(path).mode&0o777).toBe(0o600);
    chmodSync(path,0o644);expect(()=>loadSeed(path)).toThrow('private file');
  });
  it('pins the independently implemented verifier signing-message protocol',()=>{
    const f=fixture(),input={origin:'https://gitzilla.example',id:f.id,digest:'a'.repeat(64),wallet:f.wallet,attestor:f.service.attestor,nonce:'b'.repeat(32),expires:1_800_000_300_000};
    expect(walletBindingMessage({o:input.origin,id:input.id,d:input.digest,w:input.wallet,n:input.nonce,e:input.expires},input.attestor)).toBe(claimMessage(input));
  });
  it('refuses an ignored key under publicly served assets',()=>{
    vi.stubEnv('SOLANA_ATTESTOR_KEY_FILE',resolve('dist/unsafe.seed'));
    expect(()=>createReceiptService(process.cwd(),'https://gitzilla.example')).toThrow('outside served');
  });
  it('matches the SDK base58 codec including leading zero bytes',()=>{
    for(const bytes of [new Uint8Array(),new Uint8Array(64),new Uint8Array([0,0,2,255]),randomBytes(64)])expect(encode58(bytes)).toBe(base58(bytes));
  });
});
function rpcFixture(overrides:Record<string,unknown>={}) {
  const responses:Record<string,unknown>={getGenesisHash:DEVNET_GENESIS,getLatestBlockhash:{value:{blockhash:'11111111111111111111111111111111',lastValidBlockHeight:90}},getSignatureStatuses:{context:{slot:100},value:[null]},getEpochInfo:{blockHeight:80,absoluteSlot:100},...overrides};
  const fetcher=vi.fn(async(_url:unknown,options:any)=>{const {method}=JSON.parse(options.body);if(!(method in responses))throw new Error('Unexpected RPC '+method);return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:responses[method]}),{status:200});}) as unknown as typeof fetch;
  return {rpc:new SolanaRpc('https://devnet.example',fetcher),responses,fetcher};
}
describe('Devnet transaction boundary',()=>{
  it('rejects HTTP and mainnet endpoints before reading balance or signing',async()=>{
    expect(()=>new SolanaRpc('http://example.com')).toThrow('HTTPS');const f=rpcFixture({getGenesisHash:'mainnet'});
    await expect(f.rpc.balance('anything')).rejects.toThrow('Only Solana Devnet');expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it('constructs a genuine single-signer Memo transaction with no user transaction or transfers',async()=>{
    const f=rpcFixture(),seed=randomBytes(32),attestor=base58(publicBytes(seed)),memo=canonical({d:'a'.repeat(64),v:1});
    const tx=await f.rpc.prepare(seed,attestor,memo),wire=Buffer.from(tx.wire,'base64');
    expect(wire[0]).toBe(1);expect(base58(wire.subarray(1,65))).toBe(tx.signature);expect(verifyEd25519(attestor,wire.subarray(65),tx.signature)).toBe(true);
    expect(wire.subarray(65,68)).toEqual(Buffer.from([1,0,1]));expect(wire.includes(Buffer.from(memo))).toBe(true);expect(tx.lastValidHeight).toBe(90);
  });
  it('does not expire a landed transaction from a stale load-balanced status response',async()=>{
    const f=rpcFixture({getEpochInfo:{blockHeight:91,absoluteSlot:200},getSignatureStatuses:{context:{slot:199},value:[null]}});
    expect(await f.rpc.inspect('tx','attestor','memo',90)).toBe('pending');
    const methods=vi.mocked(f.fetcher).mock.calls.map(c=>JSON.parse(c[1]!.body as string).method);
    expect(methods.indexOf('getEpochInfo')).toBeLessThan(methods.indexOf('getSignatureStatuses'));
    f.responses.getSignatureStatuses={context:{slot:200},value:[null]};
    expect(await f.rpc.inspect('tx','attestor','memo',90)).toBe('expired');
    f.responses.getSignatureStatuses={context:{slot:200},value:[{err:'fork error',confirmationStatus:'processed'}]};
    expect(await f.rpc.inspect('tx','attestor','memo',90)).toBe('pending');
  });
  it('requires finalized exact memo, app signer and successful metadata; a status alone is insufficient',async()=>{
    const seed=randomBytes(32),attestor=base58(publicBytes(seed)),memo='receipt';
    const tx={meta:{err:null},transaction:{signatures:['tx'],message:{header:{numRequiredSignatures:1},accountKeys:[attestor,MEMO_PROGRAM],instructions:[{programIdIndex:1,accounts:[0],data:base58(Buffer.from(memo))}]}}};
    const f=rpcFixture({getSignatureStatuses:{context:{slot:100},value:[{err:null,confirmationStatus:'finalized'}]},getTransaction:tx});
    expect(await f.rpc.inspect('tx',attestor,memo,90)).toBe('finalized');
    expect(await f.rpc.inspect('tx',attestor,'forged',90)).toBe('failed');expect(await f.rpc.inspect('tx','other',memo,90)).toBe('failed');
    f.responses.getTransaction=null;expect(await f.rpc.inspect('tx',attestor,memo,90)).toBe('pending');
    f.responses.getSignatureStatuses={context:{slot:100},value:[null]};expect(await f.rpc.inspect('tx',attestor,memo,90)).toBe('pending');
    f.responses.getEpochInfo={blockHeight:91,absoluteSlot:100};expect(await f.rpc.inspect('tx',attestor,memo,90)).toBe('expired');
    f.responses.getSignatureStatuses={context:{slot:100},value:[{err:{InstructionError:0},confirmationStatus:'finalized'}]};expect(await f.rpc.inspect('tx',attestor,memo,90)).toBe('failed');
  });
});
describe('receipt HTTP ownership and origin',()=>{
  it('serves public keys, gates receipt reads and rejects cross-origin or oversized mutations',async()=>{
    const f=fixture();const server=http.createServer((req,res)=>{void handleReceiptRoute(req,res,new URL(req.url!,'https://gitzilla.example'),f.service).then(ok=>{if(!ok){res.writeHead(404);res.end();}});});
    server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    try{
      expect((await (await fetch(base+'/.well-known/gitzilla-attestor.json')).json()).current).toBe(f.service.attestor);
      expect((await fetch(base+'/api/receipts/'+f.id)).status).toBe(404);
      const headers={'X-Room-Token':'token-a'};
      expect((await fetch(base+'/api/receipts/'+f.id,{headers})).status).toBe(200);
      expect((await fetch(base+'/api/receipts/'+f.id+'/challenge',{method:'POST',headers:{...headers,Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({wallet:f.wallet})})).status).toBe(403);
      expect((await fetch(base+'/api/receipts/'+f.id+'/challenge',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({wallet:f.wallet,padding:'a'.repeat(8192)})})).status).toBe(413);
      expect((await fetch(base+'/api/receipts/'+f.id+'/challenge',{method:'POST',headers,body:'{}'})).status).toBe(415);
      expect(f.rpc.balance).not.toHaveBeenCalled();
    }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
});
