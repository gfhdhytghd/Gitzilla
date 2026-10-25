import type { IncomingMessage, ServerResponse } from 'node:http';
import { ReceiptError, type ReceiptService } from './service';
const requests=new Map<string,{n:number;until:number}>();
function json(res:ServerResponse,status:number,value:unknown) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));
}
async function body(req:IncomingMessage):Promise<Record<string,unknown>> {
  if(!(req.headers['content-type']??'').startsWith('application/json'))throw new ReceiptError(415,'Send JSON');
  if(Number(req.headers['content-length'])>8192)throw new ReceiptError(413,'Receipt request is too large');
  return new Promise((resolve,reject)=>{
    const chunks:Buffer[]=[];let length=0,settled=false;
    const timer=setTimeout(()=>{if(!settled){settled=true;reject(new ReceiptError(408,'Receipt request timed out'));req.resume();}},5000);
    const fail=(error:unknown)=>{clearTimeout(timer);if(!settled){settled=true;reject(error);}};
    req.on('data',(chunk:Buffer)=>{length+=chunk.length;if(length>8192){fail(new ReceiptError(413,'Receipt request is too large'));return;}if(!settled)chunks.push(chunk);});
    req.on('end',()=>{clearTimeout(timer);if(settled)return;try{const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw 0;settled=true;resolve(parsed);}catch{fail(new ReceiptError(400,'Invalid receipt request'));}});
    req.on('error',()=>fail(new ReceiptError(400,'Incomplete receipt request')));req.on('aborted',()=>fail(new ReceiptError(400,'Incomplete receipt request')));
  });
}
export async function handleReceiptRoute(req:IncomingMessage,res:ServerResponse,url:URL,service:ReceiptService|undefined):Promise<boolean> {
  const metadata=url.pathname==='/.well-known/gitzilla-attestor.json';
  const match=url.pathname.match(/^\/api\/receipts\/([a-f0-9-]{36})(?:\/(challenge|publish|refresh|handoff|redeem))?$/);
  if(!metadata&&!match)return false;
  try {
    if(!service)throw new ReceiptError(503,'Match receipts are temporarily unavailable');
    const action=match?.[2],method=metadata||!action?'GET':'POST';
    if(req.method!==method){res.setHeader('Allow',method);throw new ReceiptError(405,'Method not allowed');}
    const origin=req.headers.origin;
    if(origin&&origin!==service.origin)throw new ReceiptError(403,'Use the Gitzilla site to manage this receipt');
    const ip=req.socket.remoteAddress??'unknown',now=Date.now(),old=requests.get(ip);
    const count=old&&old.until>now?{n:old.n+1,until:old.until}:{n:1,until:now+60000};requests.set(ip,count);
    if(requests.size>10000)for(const [key,value]of requests)if(value.until<now)requests.delete(key);
    if(count.n>120)throw new ReceiptError(429,'Too many receipt requests; wait a minute');
    if(metadata){json(res,200,service.keys());return true;}
    const id=match![1],header=req.headers['x-receipt-token']??req.headers['x-room-token'];
    const token=typeof header==='string'?header:undefined;
    if(!action){json(res,200,service.get(id,token));return true;}
    // Redemption accepts a bounded one-time ticket, never a room token in the URL.
    if(action==='redeem'){
      const input=await body(req);
      if(typeof input.ticket!=='string')throw new ReceiptError(400,'This wallet link is invalid or expired. Open a new link from the game.');
      json(res,200,service.redeem(id,input.ticket));return true;
    }
    // Authenticate before doing any asynchronous work or accepting an upload.
    service.get(id,token);
    const input=await body(req);
    if(action==='handoff'){json(res,200,service.handoff(id,token));return true;}
    if(action==='refresh'){json(res,200,await service.refresh(id,token));return true;}
    if(typeof input.wallet!=='string')throw new ReceiptError(400,'Choose a valid Solana wallet');
    if(action==='challenge'){json(res,200,await service.challenge(id,token,input.wallet));return true;}
    if(typeof input.signature!=='string'||input.signature.length>100)throw new ReceiptError(400,'Provide the wallet signature');
    json(res,200,await service.publish(id,token,input.wallet,input.signature));
  }catch(error){
    if(error instanceof ReceiptError&&[408,413].includes(error.status)){res.setHeader('Connection','close');res.once('finish',()=>req.destroy());}
    req.resume();json(res,error instanceof ReceiptError?error.status:503,{error:error instanceof ReceiptError?error.message:'Devnet anchoring is temporarily unavailable. You can download the signed receipt.'});}
  return true;
}
