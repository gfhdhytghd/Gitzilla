/** Isolated real-WebSocket load test. Run: capmem 8G npx tsx tools/classroom-load.ts --bots=200
 * External servers are contacted only with explicit --target=<URL> --room=<CODE>.
 * That mode uses the target's auth policy; optional --cookie-env=NAME supplies a cookie.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { fork, type ChildProcess } from 'node:child_process';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pathJoin } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket, WebSocketServer } from 'ws';
import { RoomServer, CLASSROOM_CAPACITY, type GameServices } from '../server/rooms';
import { analyzeFiles } from '../analysis/in-app';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { mergeClassroomPacket, type ClassroomPacket } from '../shared/classroom-delta';
import { editorCommit } from '../server/in-app';
import type { ClientMsg, ServerMsg } from '../shared/types';
import type { ClassroomReport, ClassroomState } from '../shared/classroom';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const match = /^--([a-z-]+)(?:=(.*))?$/.exec(process.argv[i]);
  if (!match) throw new Error('Use named flags; external URLs require --target');
  const allowed = ['worker','bots','target','room','cookie-env','output','seed'];
  if (!allowed.includes(match[1])) throw new Error(`Unknown flag --${match[1]}`);
  args.set(match[1], match[2] ?? (process.argv[i + 1]?.startsWith('--') === false ? process.argv[++i] : 'true'));
}

async function worker() {
  const directory = mkdtempSync(pathJoin(tmpdir(), 'classroom-load-'));
  const server = http.createServer(), wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });
  server.on('upgrade', (req, socket, head) => wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req)));
  const rooms = new RoomServer(wss, {
    listFallbackRepos: () => [],
    analyzeFiles,
  } as unknown as GameServices, { allowLegacyEdu: true, persistenceFile: pathJoin(directory, 'rooms.json') });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const lag = monitorEventLoopDelay({ resolution: 10 });
  let cpu = process.cpuUsage(), start = performance.now(), peakRss = process.memoryUsage().rss;
  const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 50);
  process.on('message', message => {
    if (message === 'begin') { lag.enable(); lag.reset(); cpu = process.cpuUsage(); start = performance.now(); peakRss = process.memoryUsage().rss; }
    if (message === 'metrics') {
      const usage = process.cpuUsage(cpu), elapsed = performance.now() - start;
      process.send?.({ metrics: { scope: 'isolated server process only', cpuMs: (usage.user + usage.system) / 1000,
        cpuPercent: (usage.user + usage.system) / (elapsed * 10), rssMiB: process.memoryUsage().rss / 2 ** 20,
        peakRssMiB: peakRss / 2 ** 20, eventLoopLagMs: {p50:lag.percentile(50)/1e6,p95:lag.percentile(95)/1e6,p99:lag.percentile(99)/1e6,max:lag.max/1e6} } });
    }
    if (message === 'stop') {
      clearInterval(sampler); lag.disable(); rooms.close();
      wss.close(() => server.close(() => { rmSync(directory,{recursive:true,force:true}); process.exit(0); }));
    }
  });
  process.send?.({base:`http://127.0.0.1:${(server.address() as {port:number}).port}`,room:rooms.createRoom(undefined,'edu')});
}

type ReportPredicate = (report: ClassroomReport | undefined, state: ClassroomState) => boolean;
type Pending = { sent: number; predicate: ReportPredicate; done: boolean };
type Peer = { name: string; role: 'screen' | 'player'; socket: WebSocket; id: string; token: string;
  state?: ClassroomState; packet?: ClassroomPacket; reports: Record<string, ClassroomReport>; messages: number; bytes: number;
  own: Pending[]; teacher: Pending[]; errors: string[]; dropped: number; sentMessages: number; sentBytes: number;
  buckets: Map<number,{messages:number;bytes:number}> };
const peers: Peer[] = [], ownLatency: number[] = [], teacherLatency: number[] = [];
let child: ChildProcess | undefined, trafficStart = performance.now(), base = '', room = '', measuring = false;
let seed = Number(args.get('seed') ?? 200);
const random = () => { seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
const percentile = (values: number[], p: number) => values.length ? [...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)] : 0;
const distribution = (values: number[]) => ({samples:values.length,p50:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99),max:Math.max(0,...values)});
async function until(check: () => boolean, label: string, timeout = 20000) {
  const end = performance.now() + timeout;
  while (!check()) { if (performance.now() > end) throw new Error(`Timeout: ${label}`); await delay(5); }
}
function send(peer: Peer, msg: ClientMsg) {
  const raw = JSON.stringify(msg); peer.sentMessages++; peer.sentBytes += Buffer.byteLength(raw); peer.socket.send(raw);
}
async function connect(name: string, role: Peer['role'], prior?: Peer): Promise<Peer> {
  const wsUrl = new URL(base); wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : wsUrl.protocol === 'http:' ? 'ws:' : wsUrl.protocol;
  if (wsUrl.pathname === '/') wsUrl.pathname = '/ws';
  const cookie = args.get('cookie-env') ? process.env[args.get('cookie-env')!] : undefined;
  const socket = new WebSocket(wsUrl, cookie ? {headers:{Cookie:cookie}} : {});
  const peer: Peer = prior ?? {name,role,socket,id:'',token:'',reports:{},messages:0,bytes:0,own:[],teacher:[],errors:[],dropped:0,sentMessages:0,sentBytes:0,buckets:new Map()};
  peer.socket = socket;
  if (!prior) peers.push(peer);
  let welcomed = false, expectedClose = false;
  socket.on('message', raw => {
    const bytes = Array.isArray(raw) ? raw.reduce((sum, part) => sum + part.byteLength, 0) : raw.byteLength;
    peer.messages++; peer.bytes += bytes;
    const second = Math.floor((performance.now()-trafficStart)/1000), bucket = peer.buckets.get(second) ?? {messages:0,bytes:0};
    bucket.messages++; bucket.bytes += bytes; peer.buckets.set(second,bucket);
    let msg = JSON.parse(raw.toString()) as ServerMsg;
    if (msg.t === 'welcome') { peer.id = msg.you; peer.token = msg.token; welcomed = true; }
    if (msg.t === 'error') peer.errors.push(msg.message);
    const publicState = msg.t === 'classroom' ? msg.state : msg.t === 'lobby' ? msg.lobby.classroom : msg.t === 'welcome' ? msg.lobby.classroom : undefined;
    if (publicState && peer !== peers[0]) {
      assert.ok(publicState.rounds.every(r=>r.attacks.every(a=>peer.role==='player' && a.id===peer.id)), 'Peer attack identity leaked');
      assert.ok(publicState.rows.every(r=>peer.role==='player' && r.id===peer.id), 'Peer roster identity leaked');
    }
    if (msg.t === 'classroom') {
      msg = mergeClassroomPacket(peer.packet,msg); peer.packet = msg;
      peer.state = msg.state; peer.reports = msg.reports;
      for (const pending of peer.own) if (!pending.done && pending.predicate(msg.reports[peer.id],msg.state)) {
        pending.done = true; ownLatency.push(performance.now()-pending.sent);
      }
      if (peer === peers[0]) for (const student of peers) for (const pending of student.teacher) {
        if (!pending.done && pending.predicate(msg.reports[student.id],msg.state)) { pending.done = true; teacherLatency.push(performance.now()-pending.sent); }
      }
    }
  });
  socket.on('error', error => peer.errors.push(error.message));
  socket.on('close', () => { if (measuring && !expectedClose) peer.dropped++; });
  // Explicit churn uses this closure, so accidental closes remain measurable.
  Object.assign(socket, {closeExpected: () => { expectedClose = true; socket.close(); }});
  await once(socket,'open');
  send(peer,{t:'hello',room,role,name,resume:prior?.token,classroomDelta:true});
  await until(() => welcomed || peer.errors.length > 0, `${name} hello`);
  assert.equal(peer.errors.length,0,`${name}: ${peer.errors.join('; ')}`);
  return peer;
}
async function churn(peer: Peer) {
  (peer.socket as WebSocket & {closeExpected():void}).closeExpected(); await once(peer.socket,'close');
  await delay(20 + random()*100); const id = peer.id;
  await connect(peer.name,peer.role,peer); assert.equal(peer.id,id,'Resume changed identity');
}
async function run() {
  const count = Number(args.get('bots') ?? CLASSROOM_CAPACITY);
  assert.ok(Number.isInteger(count) && count >= 1 && count <= CLASSROOM_CAPACITY, 'Use --bots=1..200');
  if (args.has('target')) {
    base = args.get('target')!; const url = new URL(base);
    assert.ok(['http:','https:','ws:','wss:'].includes(url.protocol));
    assert.match(args.get('room') ?? '', /^[A-Z]{4}$/, 'External mode requires --room=CODE'); room = args.get('room')!;
  } else {
    child = fork(fileURLToPath(import.meta.url),['--worker'],{stdio:['ignore','inherit','inherit','ipc']});
    const ready = await new Promise<{base:string;room:string}>((resolve,reject) => {
      const timer = setTimeout(() => reject(new Error('Local server startup timeout')),20000);
      child!.once('error',reject); child!.once('exit',code => reject(new Error(`Local server exited: ${code}`)));
      child!.once('message', message => { clearTimeout(timer); resolve(message as {base:string;room:string}); });
    }); base = ready.base; room = ready.room;
  }
  console.log(`Running ${count} WebSocket students against ${args.has('target') ? 'explicit target' : 'isolated local server'}; seed=${seed}`);
  trafficStart = performance.now(); measuring = true; child?.send('begin');
  const teacher = await connect('Load teacher','screen'), projector = await connect('Load projector','screen');
  const plan = defaultClassroomPlan();
  plan.steps = [0,1].map(i => ({...plan.steps[0],id:`load-${i}`,title:`Load step ${i+1}`,mode:'mixed',durationSec:0,brief:undefined,
    checksWeight:100,questionsWeight:50,answerFeedback:'after-close',
    checks:[{id:'evidence',label:'Evidence present',kind:'contains',path:'main.py',text:'answer = 42'}],
    questions:[{id:'q',kind:'single',prompt:'Choose 42',options:[{id:'yes',text:'42'},{id:'no',text:'0'}],answer:'yes'}]}));
  send(teacher,{t:'classroomPlan',plan}); await until(() => teacher.state?.plan.steps[0].id === 'load-0','publish plan');
  const joinStart = performance.now();
  const students = await Promise.all(Array.from({length:count},async (_,i) => { await delay(random()*300); return connect(`Student ${String(i).padStart(3,'0')}`,'player'); }));
  const joinMs = performance.now()-joinStart;
  await until(() => teacher.state?.summary?.roster === count && teacher.state?.summary?.connected === count,'full roster');
  async function control(action: 'start'|'attack'|'retry'|'next'|'finish', phase: ClassroomState['phase']) {
    const oldAttempt = teacher.state?.attempt, oldStep = teacher.state?.stepIndex;
    send(teacher,{t:'classroomControl',action});
    await until(() => peers.every(p => p.state?.phase === phase) &&
      (action !== 'retry' || teacher.state?.attempt !== oldAttempt) && (action !== 'next' || teacher.state?.stepIndex !== oldStep),action);
  }
  async function measured(peer: Peer, msg: ClientMsg, predicate: ReportPredicate) {
    const own = {sent:performance.now(),predicate,done:false}, consoleUpdate = {...own};
    peer.own.push(own); peer.teacher.push(consoleUpdate); send(peer,msg);
    await until(() => own.done, `${peer.name} own result`);
  }
  async function wave(index: number, attempt: number) {
    await Promise.all(students.map(async (peer,i) => {
      // 40% open burst, 40% sustained activity, 20% close burst.
      const group = i % 5; await delay(group < 2 ? random()*100 : group < 4 ? 300+random()*1200 : 1900+random()*100);
      const choice = i % 4 === 0 ? 'no' : 'yes';
      await measured(peer,{t:'classroomAnswers',stepId:`load-${index}`,attempt,answers:{q:{choice}}},
        r => r?.stepId === `load-${index}` && r.attempt === attempt && JSON.stringify(r.answers?.q?.answer) === JSON.stringify({choice}) && r.answers?.q?.attempts === 1);
      const content = i % 4 < 2 ? 'answer = 42\n' : 'answer = 0\n', files = [{path:'main.py',content}];
      await delay(random()*150);
      const commit = editorCommit(files);
      await measured(peer,{t:'classroomSubmitCode',files},r => r?.stepId === `load-${index}` && r.attempt === attempt && r.commit === commit);
    }));
    await until(() => students.every(p => p.teacher.every(x => x.done)),'teacher console caught up');
    // Students near the closing boundary revise saved answers after the rate-limit window.
    await delay(1100);
    await Promise.all(students.filter((_,i)=>i%10===0).map(async peer => {
      const choice = 'yes';
      await measured(peer,{t:'classroomAnswers',stepId:`load-${index}`,attempt,answers:{q:{choice}}},
        r => r?.stepId === `load-${index}` && r.attempt === attempt && r.answers?.q?.attempts === 2);
    }));
    await until(() => students.every(p => p.teacher.every(x => x.done)),'closing burst delivered');
    for (const peer of students) assert.equal(peer.state?.rows.length,1,'Student lost own row');
    assert.equal(projector.state?.rows.length,0,'Projector received roster');
  }
  await control('start','coding'); await wave(0,1);
  const reconnects = students.filter((_,i)=>i%20===0), refreshes = students.filter((_,i)=>i%40===1);
  await Promise.all([...reconnects,...refreshes].map(churn));
  await control('attack','raid'); await until(() => peers.every(p=>p.state?.phase==='feedback'),'raid feedback',15000);
  await control('retry','coding'); await wave(0,2);
  await control('attack','raid'); await until(() => peers.every(p=>p.state?.phase==='feedback'),'retry feedback',15000);
  await control('next','coding'); await wave(1,1); await control('finish','complete');
  const seconds = (performance.now()-trafficStart)/1000;
  const metrics = child ? await new Promise<any>(resolve => { child!.once('message',m => resolve((m as any).metrics)); child!.send('metrics'); })
    : {scope:'unavailable for external target; collect CPU/RSS/event-loop lag on the server'};
  measuring = false;
  const clients = peers.map(p => ({name:p.name,role:p.role,messagesPerSec:p.messages/seconds,bytesPerSec:p.bytes/seconds,
    sentMessagesPerSec:p.sentMessages/seconds,sentBytesPerSec:p.sentBytes/seconds,
    peakMessagesPerSecond:Math.max(0,...[...p.buckets.values()].map(b=>b.messages)),peakBytesPerSecond:Math.max(0,...[...p.buckets.values()].map(b=>b.bytes)),
    errors:p.errors,dropped:p.dropped}));
  const studentTraffic = clients.filter(p=>p.role==='player');
  const dropped = clients.reduce((n,p)=>n+p.dropped,0), errors = clients.flatMap(p=>p.errors);
  const result = {bots:count,seed:Number(args.get('seed')??200),durationSec:seconds,joinMs,reconnects:reconnects.length,refreshes:refreshes.length,
    ownResultMs:distribution(ownLatency),teacherUpdateMs:distribution(teacherLatency),server:metrics,
    traffic:{studentsMessagesPerSec:distribution(clients.filter(p=>p.role==='player').map(p=>p.messagesPerSec)),
      studentsBytesPerSec:distribution(clients.filter(p=>p.role==='player').map(p=>p.bytesPerSec))},
    dropped,errors,clients,totalServerBytesPerSec:clients.reduce((sum,p)=>sum+p.bytesPerSec,0),budgets:{ownResultP95:percentile(ownLatency,.95)<300,teacherUpdateP95:percentile(teacherLatency,.95)<1000,
      studentBandwidth:studentTraffic.every(p=>p.bytesPerSec<5000),projectorBandwidth:clients[1].bytesPerSec<5000,teacherBandwidth:clients[0].bytesPerSec<150000,
      eventLoopLagP99:metrics.eventLoopLagMs ? metrics.eventLoopLagMs.p99<100 : null,noDroppedSockets:dropped===0,noErrors:errors.length===0}};
  if (args.has('output')) writeFileSync(args.get('output')!,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
  assert.ok(Object.values(result.budgets).every(v=>v===true), 'A local budget failed or external server metrics are unavailable; inspect the report');
}

if (args.has('worker')) await worker();
else try { await run(); } finally {
  measuring = false; for (const peer of peers) peer.socket.terminate();
  if (child?.connected) { child.send('stop'); const timer = setTimeout(()=>child?.kill(),5000); await once(child,'exit'); clearTimeout(timer); }
}
