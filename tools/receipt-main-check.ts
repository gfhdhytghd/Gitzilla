/** Exercise the actual production entry point on an ephemeral port and private temporary state. */
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import {base58,publicBytes} from '../server/receipts/crypto';
const directory=mkdtempSync(join(tmpdir(),'gitzilla-receipt-main-'));
const env={...process.env,NODE_ENV:'production',PORT:'0',PUBLIC_URL:'',SOLANA_RECEIPTS_DIR:join(directory,'.cache/solana'),SOLANA_ATTESTOR_KEY_FILE:'',SOLANA_DEVNET_RPC_URL:'',SOLANA_RECEIPTS_ENABLED:'1',ROOMS_FILE:join(directory,'rooms.json'),ROYALE_HALL_FILE:join(directory,'royale.json'),TRACES_DIR:join(directory,'traces'),HTTPS_KEY:'',HTTPS_CERT:'',REPO_KAIJU_HTTPS:'',HTTP_REDIRECT_PORT:'0'};
// Empty RPC is different from an omitted override.
delete (env as Record<string,string|undefined>).SOLANA_DEVNET_RPC_URL;
const child=spawn(process.execPath,['--import',resolve('node_modules/tsx/dist/loader.mjs'),resolve('server/main.ts')],{cwd:directory,env,stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',data=>output+=data);child.stderr.resume();
try{
 let port:string|undefined;
 for(let i=0;i<200&&!port;i++){if(child.exitCode!==null)throw new Error('Isolated production server exited');port=output.match(/Local: http:\/\/localhost:(\d+)/)?.[1];if(!port)await new Promise(r=>setTimeout(r,25));}
 if(!port)throw new Error('Isolated server did not start');
 const base=`http://127.0.0.1:${port}`,metadata=await (await fetch(base+'/.well-known/gitzilla-attestor.json')).json();
 const seed=readFileSync(join(directory,'.cache/solana/attestor.seed'));
 if(metadata.current!==base58(publicBytes(seed)))throw new Error('Production attestor metadata mismatch');
 const paths=['/.cache/solana/attestor.seed','/%2ecache/solana/attestor.seed','/@fs'+join(directory,'.cache/solana/attestor.seed'),'/%5c.cache%5csolana%5cattestor.seed'];
 for(const path of paths){const res=await fetch(base+path);if(res.status!==404)throw new Error('Private production path was not denied');}
 if((await fetch(base+'/')).status!==200)throw new Error('Production page unavailable');
 if((await fetch(base+'/api/receipts/00000000-0000-0000-0000-000000000000')).status!==404)throw new Error('Receipt ownership route mismatch');
 console.log(JSON.stringify({passed:true,productionEntry:true,ephemeralPort:Number(port),metadataMatchesPrivateKey:true,privatePathsDenied:paths.length,root:200,unknownReceipt:404,chainTraffic:false}));
}finally{
 if(child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);await done;clearTimeout(timer);}
 rmSync(directory,{recursive:true,force:true});
}
