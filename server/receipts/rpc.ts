import { AccountRole, address, appendTransactionMessageInstruction, blockhash, compileTransaction, createKeyPairFromPrivateKeyBytes,
  createTransactionMessage, getBase64EncodedWireTransaction, getSignatureFromTransaction, setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash, signTransaction } from '@solana/kit';
import { from58 } from './crypto';
export const DEVNET_RPC='https://api.devnet.solana.com';
export const DEVNET_GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const MEMO_PROGRAM='MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
export interface MemoBinding { v:1; id:string; d:string; w:string; o:string; n:string; e:number; s:string }
export interface AnchorRpc {
  balance(attestor:string):Promise<number>;
  slot?(signature:string):Promise<number | undefined>;
  prepare(seed:Uint8Array,attestor:string,memo:string):Promise<{wire:string;signature:string;lastValidHeight:number}>;
  send(wire:string):Promise<string>;
  inspect(signature:string,attestor:string,memo:string,lastValidHeight:number):Promise<'pending'|'finalized'|'expired'|'failed'>;
}
export class SolanaRpc implements AnchorRpc {
  private checked=0;
  constructor(private url=DEVNET_RPC,private fetcher:typeof fetch=fetch) {
    if(new URL(url).protocol!=='https:')throw new Error('Use an HTTPS Devnet RPC');
  }
  private async raw<T>(method:string,params:unknown[]=[]):Promise<T> {
    const response=await this.fetcher(this.url,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error('Solana Devnet is unavailable');
    const payload=await response.json();
    if(payload.error||!('result' in payload))throw new Error('Solana Devnet request failed');
    return payload.result as T;
  }
  private async check() {
    if(Date.now()-this.checked<60000)return;
    if(await this.raw<string>('getGenesisHash')!==DEVNET_GENESIS)throw new Error('Only Solana Devnet is supported');
    this.checked=Date.now();
  }
  async balance(attestor:string) {
    await this.check();
    return (await this.raw<{value:number}>('getBalance',[attestor,{commitment:'confirmed'}])).value;
  }
  async slot(signature:string) {
    await this.check();
    const result=await this.raw<{value:({slot:number;confirmationStatus:string}|null)[]}>('getSignatureStatuses',[[signature],{searchTransactionHistory:true}]);
    const status=result.value[0];
    return status?.confirmationStatus==='finalized' && Number.isSafeInteger(status.slot) ? status.slot : undefined;
  }
  async prepare(seed:Uint8Array,attestor:string,memo:string) {
    await this.check();
    if(Buffer.byteLength(memo)>500)throw new Error('Receipt memo is too long');
    const latest=await this.raw<{value:{blockhash:string;lastValidBlockHeight:number}}>('getLatestBlockhash',[{commitment:'confirmed'}]);
    const key=await createKeyPairFromPrivateKeyBytes(seed);
    let message=setTransactionMessageFeePayer(address(attestor),createTransactionMessage({version:'legacy'}));
    const live=setTransactionMessageLifetimeUsingBlockhash({blockhash:blockhash(latest.value.blockhash),lastValidBlockHeight:BigInt(latest.value.lastValidBlockHeight)},message);
    const withMemo=appendTransactionMessageInstruction({programAddress:address(MEMO_PROGRAM),accounts:[{address:address(attestor),role:AccountRole.READONLY_SIGNER}],data:new TextEncoder().encode(memo)},live);
    const signed=await signTransaction([key],compileTransaction(withMemo));
    return {wire:getBase64EncodedWireTransaction(signed),signature:getSignatureFromTransaction(signed),lastValidHeight:latest.value.lastValidBlockHeight};
  }
  async send(wire:string) {
    await this.check();
    return this.raw<string>('sendTransaction',[wire,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:2}]);
  }
  async inspect(signature:string,attestor:string,memo:string,lastValidHeight:number) {
    await this.check();
    // Read finalized height first. A later status response must be at least this fresh
    // before absence can prove expiry on a load-balanced RPC.
    const epoch=await this.raw<{blockHeight:number;absoluteSlot:number}>('getEpochInfo',[{commitment:'finalized'}]);
    const snapshot=await this.raw<{context:{slot:number};value:({err:unknown;confirmationStatus:string}|null)[]}>('getSignatureStatuses',[[signature],{searchTransactionHistory:true}]);
    const status=snapshot.value[0];
    if(status?.err&&status.confirmationStatus==='finalized')return 'failed' as const;
    if(status?.confirmationStatus==='finalized') {
      const tx=await this.raw<any>('getTransaction',[signature,{encoding:'json',commitment:'finalized',maxSupportedTransactionVersion:0}]);
      if(!tx)return 'pending' as const;
      const message=tx.transaction?.message,keys=message?.accountKeys,instructions=message?.instructions;
      if(!tx.meta || tx.meta.err!==null || !Array.isArray(keys) || !Array.isArray(instructions) || instructions.length!==1
        || keys[0]!==attestor || message.header?.numRequiredSignatures!==1 || tx.transaction.signatures?.[0]!==signature) return 'failed' as const;
      const ix=instructions[0];
      try {
        if(keys[ix.programIdIndex]!==MEMO_PROGRAM || ix.accounts?.length!==1 || keys[ix.accounts[0]]!==attestor
          || new TextDecoder('utf-8',{fatal:true}).decode(from58(ix.data))!==memo)return 'failed' as const;
      } catch { return 'failed' as const; }
      return 'finalized' as const;
    }
    if(!status && epoch.blockHeight>lastValidHeight && Number.isSafeInteger(epoch.absoluteSlot) && snapshot.context?.slot>=epoch.absoluteSlot)return 'expired' as const;
    return 'pending' as const;
  }
}
