import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import { offlineProfile } from '../analysis';
import { bossKitFromProfile, playerKitFromProfile } from '../sim';
import type { ClientMsg, LobbyState, ServerMsg } from '../shared/types';

const base=process.env.CADENCE_URL||'http://localhost:5175',target=new URL(base);
const local=['localhost','127.0.0.1','[::1]'].includes(target.hostname)&&target.port==='5175';
const publicProbe=process.env.ALLOW_PUBLIC_CADENCE==='1'&&base==='https://gitzilla.wilflin.me';
assert.ok(local||publicProbe,'Only DEV5175 or the explicitly authorized single public-tunnel probe is allowed');
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until<T>(get:()=>T|false|undefined,label:string):Promise<T>{for(let i=0;i<2400;i++){const value=get();if(value)return value;await pause(25);}throw new Error(`Cadence probe timed out: ${label}`);}
const summarize=(samples:number[])=>{const values=[...samples].sort((a,b)=>a-b),n=values.length,round=(v:number)=>Math.round(v*100)/100;return{samples:n,mean:round(values.reduce((s,v)=>s+v,0)/Math.max(1,n)),p50:round(values[Math.floor(n*.5)]??0),p95:round(values[Math.min(n-1,Math.floor(n*.95))]??0),p99:round(values[Math.min(n-1,Math.floor(n*.99))]??0),max:round(values.at(-1)??0)};};
const gaps=(times:number[])=>times.slice(1).map((time,i)=>time-times[i]);
type Peer={socket:WebSocket;welcome?:Extract<ServerMsg,{t:'welcome'}>;lobby?:LobbyState;arrivals:number[];simTimes:number[];errors:string[]};
const peers:Peer[]=[],rtts:number[]=[],sent:number[]=[],pending=new Map<number,number>();
let room:string|undefined,measuring=false,timer:ReturnType<typeof setInterval>|undefined,endedEarly=false,report:Record<string,unknown>={};
try{
  const fallbacks=await(await fetch(base+'/api/fallbacks',{redirect:'error'})).json() as string[];
  const profile=fallbacks.map(repo=>offlineProfile(repo));
  const hero=[...profile].sort((a,b)=>{const x=playerKitFromProfile(a),y=playerKitFromProfile(b);return(y.maxHp+y.maxArmor)-(x.maxHp+x.maxArmor);})[0].slug;
  const boss=[...profile].sort((a,b)=>bossKitFromProfile(b,3).maxHp-bossKitFromProfile(a,3).maxHp)[0].slug;
  // Exactly one room creation. No retry or fallback to any other room/server.
  const created=await fetch(base+'/api/room',{method:'POST',redirect:'error'});assert.equal(created.status,201);room=((await created.json()) as {room:string}).room;
  async function connect(role:'player'|'screen'){
    const socket=new WebSocket(base.replace(/^http/,'ws')+'/ws'),peer:Peer={socket,arrivals:[],simTimes:[],errors:[]};peers.push(peer);
    socket.on('message',raw=>{const message=JSON.parse(String(raw)) as ServerMsg;
      if(message.t==='welcome'){peer.welcome=message;peer.lobby=message.lobby;}
      if(message.t==='lobby')peer.lobby=message.lobby;
      if(message.t==='error')peer.errors.push(message.message);
      if(measuring&&message.t==='autopsy')endedEarly=true;
      if(measuring&&message.t==='snapshot'){
        const now=performance.now();peer.arrivals.push(now);peer.simTimes.push(message.state.t*1000);
        if(role==='player')for(const[seq,at]of pending){if(seq<=message.ack){rtts.push(now-at);pending.delete(seq);}}
      }
    });
    socket.on('error',()=>{});await new Promise<void>((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
    socket.send(JSON.stringify({t:'hello',room:room!,role,name:role==='player'?'Cadence probe owner':'Cadence probe observer'} satisfies ClientMsg));
    await until(()=>{if(peer.errors.length)throw new Error(peer.errors.join(';'));return peer.welcome;},'welcome');return peer;
  }
  const owner=await connect('player'),spectator=await connect('screen');
  const send=(message:ClientMsg)=>owner.socket.send(JSON.stringify(message));
  send({t:'setRepo',repo:hero});send({t:'setBoss',repo:boss});send({t:'setBots',count:2});
  await until(()=>{if(owner.errors.length)throw new Error(owner.errors.join(';'));return owner.lobby?.players.length===3&&owner.lobby.players.every(p=>p.status==='ready')&&owner.lobby.boss.status==='ready';},'ready owner + two bots');
  send({t:'controls',ready:true,mode:'tap-only'});await pause(100);
  const fighting=new Promise<void>((resolve)=>{const listener=(raw:unknown)=>{const message=JSON.parse(String(raw)) as ServerMsg;if(message.t==='snapshot'&&message.state.status==='fighting'){owner.socket.off('message',listener);resolve();}};owner.socket.on('message',listener);});
  send({t:'start'});await Promise.race([fighting,pause(15_000).then(()=>{throw new Error('Probe did not enter combat');})]);
  measuring=true;const start=performance.now();let seq=0;
  const input=()=>{const now=performance.now();sent.push(now);pending.set(++seq,now);send({t:'input',frame:{seq,move:[0,0],aim:null,fire:false,dash:false,skill:false,source:'keyboard'}});};
  input();timer=setInterval(input,1000/30);await pause(20_000);clearInterval(timer);await pause(100);measuring=false;
  report={target:base,room,hero,boss,bots:2,elapsedMs:Math.round(performance.now()-start),endedEarly,
    playerSnapshots:summarize(gaps(owner.arrivals)),spectatorSnapshots:summarize(gaps(spectator.arrivals)),
    playerSimStepGaps:summarize(gaps(owner.simTimes)),inputSendGaps:summarize(gaps(sent)),inputToCumulativeAckRtt:summarize(rtts),protocolErrors:peers.flatMap(p=>p.errors)};
  assert.ok(owner.arrivals.length>0&&spectator.arrivals.length>0&&rtts.length>0,'Probe must receive snapshots and advancing acks');
}finally{
  clearInterval(timer);measuring=false;
  // The last owned human/screen leaving deletes this throwaway room and its bots.
  for(const peer of peers)if(peer.socket.readyState===WebSocket.OPEN&&peer.welcome){
    const closed=new Promise<void>(resolve=>peer.socket.once('close',()=>resolve()));
    peer.socket.send(JSON.stringify({t:'leave'} satisfies ClientMsg));await Promise.race([closed,pause(3000)]);
  }
  for(const peer of peers)peer.socket.terminate();
  if(room){const info=await(await fetch(`${base}/api/room/${room}`,{redirect:'error'})).json() as {exists:boolean};report.roomDeleted=!info.exists;assert.equal(info.exists,false,'Probe room and bots must be deleted');}
  if(process.env.CADENCE_REPORT)writeFileSync(process.env.CADENCE_REPORT,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
