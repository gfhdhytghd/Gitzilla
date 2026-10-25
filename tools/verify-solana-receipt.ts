/** Independent read-only verifier. Pin an attestor from a separately trusted source. */
import { readFileSync } from 'node:fs';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { getBase58Encoder } from '@solana/kit';
const args=process.argv.slice(2),file=args[0];
function option(name:string){const i=args.indexOf(name);return i<0?undefined:args[i+1];}
const expected=option('--attestor'),transaction=option('--transaction');
if(!file||!expected)throw new Error('Usage: npx tsx tools/verify-solana-receipt.ts receipt.json --attestor TRUSTED_PUBLIC_KEY [--transaction DEVNET_TXID]');
const receipt=JSON.parse(readFileSync(file,'utf8'));
function sorted(value:any):string {
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(sorted).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+sorted(value[k])).join(',')+'}';
}
const decode=(s:string)=>Buffer.from(getBase58Encoder().encode(s));
function signatureValid(key:string,bytes:Uint8Array,sig:string){
  const pub=decode(key),signature=decode(sig);if(pub.length!==32||signature.length!==64)return false;
  return verify(null,bytes,createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),pub]),format:'der',type:'spki'}),signature);
}
if(receipt.attestor!==expected)throw new Error('Untrusted attestor');
if(receipt.payload.version!==1||receipt.payload.game!=='gitzilla'||receipt.payload.mode!=='pvp'||!/^[a-f0-9]{64}$/.test(receipt.salt))throw new Error('Unsupported receipt');
const digest=createHash('sha256').update(sorted(receipt.payload)+'\0'+receipt.salt).digest('hex');
if(digest!==receipt.digest||!signatureValid(expected,Buffer.from('gitzilla-receipt-v1\0'+digest),receipt.signature))throw new Error('Invalid signed result');
if(transaction){
  async function rpc(method:string,params:unknown[]=[]){
    const response=await fetch('https://api.devnet.solana.com',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('Devnet RPC unavailable');const data=await response.json();if(data.error)throw new Error('Devnet RPC error');return data.result;
  }
  if(await rpc('getGenesisHash')!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw new Error('Wrong network');
  const tx=await rpc('getTransaction',[transaction,{encoding:'json',commitment:'finalized',maxSupportedTransactionVersion:0}]);
  if(!tx||!tx.meta||tx.meta.err!==null)throw new Error('No successful finalized transaction');
  const m=tx.transaction.message,ix=m.instructions[0];
  if(tx.transaction.signatures[0]!==transaction||m.header.numRequiredSignatures!==1||m.accountKeys[0]!==expected||m.instructions.length!==1||m.accountKeys[ix.programIdIndex]!=='MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'||ix.accounts.length!==1||m.accountKeys[ix.accounts[0]]!==expected)throw new Error('Incorrect Memo signer or instruction');
  const binding=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode(ix.data)));
  if(binding.v!==1||binding.id!==receipt.payload.id||binding.d!==digest||typeof binding.o!=='string'||new URL(binding.o).origin!==binding.o||!Number.isSafeInteger(binding.e)||!/^[a-f0-9]{32}$/.test(binding.n))throw new Error('Invalid wallet binding');
  const message=['Gitzilla wallet binding v1',`Origin: ${binding.o}`,'Network: solana:devnet',`Receipt: ${binding.id}`,`Digest: ${binding.d}`,`Wallet: ${binding.w}`,`Attestor: ${expected}`,`Nonce: ${binding.n}`,`Expires: ${new Date(binding.e).toISOString()}`,'Bind this wallet to this server-attested result. No token transfer or mainnet transaction.'].join('\n');
  if(!signatureValid(binding.w,Buffer.from(message),binding.s))throw new Error('Invalid wallet signature');
  console.log(JSON.stringify({verified:true,network:'solana:devnet',attestor:expected,receipt:receipt.payload.id,wallet:binding.w,transaction}));
}else console.log(JSON.stringify({verified:true,attestor:expected,receipt:receipt.payload.id,anchorVerified:false}));
