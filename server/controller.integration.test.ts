import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ClientMsg, Role, ServerMsg } from '../shared/types';
import { seal } from '../auth';

async function until<T>(get: () => T | false | undefined): Promise<T> {
  for(let i=0;i<300;i++){const value=get();if(value)return value;await new Promise(r=>setTimeout(r,20));}
  throw new Error('Isolated controller integration timed out');
}

it.skipIf(process.env.ROOM_RESTART_TEST!=='1')('wires my-seat and authenticated controller resume across real main.ts restarts',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'gitzilla-controller-')),children:ChildProcess[]=[],sockets:WebSocket[]=[];
  const key=createHash('sha256').update('gitzilla:controller-test-cookie-secret').digest();
  const cookie=`rk_session=${seal({userId:'github|42',login:'fixture-user',avatar:''},key,60)}`;
  async function stop(child:ChildProcess){if(child.exitCode!==null||child.signalCode!==null)return;const exit=once(child,'exit');child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);await exit;clearTimeout(timer);}
  async function boot(){
    const child=spawn(process.execPath,['--import','tsx','server/main.ts'],{env:{...process.env,NODE_ENV:'production',PORT:'0',
      ROOMS_FILE:join(directory,'rooms.json'),ROYALE_HALL_FILE:join(directory,'royale.json'),TRACES_DIR:join(directory,'traces'),
      AUTH0_DOMAIN:'controller-fixture.auth0.invalid',AUTH0_CLIENT_ID:'fixture-client',AUTH0_CLIENT_SECRET:'fixture-client-secret',AUTH0_COOKIE_SECRET:'controller-test-cookie-secret',
      PUBLIC_URL:'',HTTPS_KEY:'',HTTPS_CERT:'',REPO_KAIJU_HTTPS:'',HTTP_REDIRECT_PORT:'0'},stdio:['ignore','pipe','pipe']});children.push(child);
    let output='';child.stdout!.on('data',data=>{output+=data.toString();});child.stderr!.on('data',()=>{});
    const port=await until(()=>{if(child.exitCode!==null)throw new Error('Controller server exited');return output.match(/Local: http:\/\/localhost:(\d+)/)?.[1];});
    expect([5173,5175]).not.toContain(Number(port));return{child,base:`http://127.0.0.1:${port}`};
  }
  async function connect(base:string,room:string,role:Role,resume?:string){
    const socket=new WebSocket(base.replace('http:','ws:')+'/ws',{headers:{Cookie:cookie}});sockets.push(socket);
    const messages:ServerMsg[]=[];socket.on('message',raw=>messages.push(JSON.parse(String(raw))));socket.on('error',()=>{});await once(socket,'open');
    const send=(msg:ClientMsg)=>socket.send(JSON.stringify(msg));send({t:'hello',room,role,name:'Fixture display',resume});
    const welcome=await until(()=>{const joined=messages.find(m=>m.t==='welcome');if(joined)return joined;const error=messages.find(m=>m.t==='error');if(error)throw new Error(error.message);return false;});return{socket,messages,send,welcome};
  }
  try{
    const first=await boot();const{room}=await(await fetch(first.base+'/api/room',{method:'POST'})).json() as {room:string};
    expect((await fetch(`${first.base}/api/rooms/${room}/my-seat`)).status).toBe(401);
    const display=await connect(first.base,room,'player'),headers={Cookie:cookie};
    const lookup=()=>fetch(`${first.base}/api/rooms/${room}/my-seat`,{headers});
    expect(await(await lookup()).json()).toEqual({seatId:display.welcome.you,name:'Fixture display',paired:false});
    const phone=await connect(first.base,room,'controller');expect(phone.welcome.you).toBe(display.welcome.you);expect(phone.welcome.controller).toBe(true);
    expect(await(await lookup()).json()).toEqual({seatId:display.welcome.you,name:'Fixture display',paired:true});
    await stop(first.child);const saved=readFileSync(join(directory,'rooms.json'),'utf8');
    expect(saved).toContain(phone.welcome.token);expect(saved).not.toContain('github|42');expect(saved).not.toContain(cookie);
    const second=await boot();const resumedPhone=await connect(second.base,room,'controller',phone.welcome.token);
    expect(resumedPhone.welcome.controller).toBe(true);expect(resumedPhone.welcome.you).toBe(display.welcome.you);
    expect(resumedPhone.welcome.lobby.players).toHaveLength(1);expect(resumedPhone.welcome.lobby.players[0].controlsReady).toBe(false);
    const resumedDisplay=await connect(second.base,room,'player',display.welcome.token);
    expect(await(await fetch(`${second.base}/api/rooms/${room}/my-seat`,{headers})).json()).toEqual({seatId:display.welcome.you,name:'Fixture display',paired:true});
    const close=once(resumedPhone.socket,'close');resumedDisplay.send({t:'pairEnd'});expect((await close)[0]).toBe(4002);
    await until(()=>resumedDisplay.messages.some(m=>m.t==='lobby'&&m.lobby.players[0].paired===false));
    expect((await fetch(`${second.base}/api/rooms/${room}/my-seat`,{headers})).status).toBe(200);
  }finally{for(const socket of sockets)socket.terminate();for(const child of children)await stop(child);rmSync(directory,{recursive:true,force:true});}
},20_000);
