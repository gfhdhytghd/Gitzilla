/** Isolated headless WebSocket acceptance. No external server, accounts, or AI provider. */
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket, WebSocketServer } from 'ws';
import { RoomServer, type GameServices } from '../server/rooms';
import { handleEduRoute } from '../server/edu-http';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { profileFromFiles } from '../analysis/graph';
import type { ClientMsg, ServerMsg } from '../shared/types';

const option = (name: string, fallback: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const count = Number(option('bots', '6'));
const profiles = option('profiles', 'perfect,partial,wrong,code-only,questions-only,unanswered').split(',');
const scores: Record<string, number | null> = { perfect: 100, partial: 75, wrong: 0, 'code-only': 50, 'questions-only': 50, unanswered: null };
if (!Number.isInteger(count) || count < 1 || count > 30 || profiles.some(p => !Object.hasOwn(scores, p))) throw new Error('Use --bots=1..30 and --profiles=perfect,partial,wrong,code-only,questions-only,unanswered (cycled)');
const server = http.createServer(), wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req)));
const rooms = new RoomServer(wss, {
  listFallbackRepos: () => [],
  analyzeClassroomSubmission: async (_repo: string, ref: string) => {
    const files = ref === 'wrong' ? [] : [{ path: 'README.md', text: 'Smoke evidence' }];
    return { profile: profileFromFiles('smoke/local', files), files, commit: (files.length ? 'a' : 'b').repeat(40), checks: [] };
  },
} as unknown as GameServices, { allowLegacyEdu: true });
server.on('request', (req, res) => { void (async () => {
  const url = new URL(req.url!, 'http://local');
  if (await handleEduRoute(req, res, url, rooms)) return;
  if (url.pathname.startsWith('/api/room/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(rooms.roomInfo(url.pathname.split('/')[3]))); return;
  }
  res.writeHead(404); res.end();
})().catch(() => { res.writeHead(500); res.end(); }); });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`, room = rooms.createRoom(undefined, 'edu');
const sockets: WebSocket[] = [];
async function until(check: () => boolean, label: string, timeout = 15000) {
  const end = Date.now() + timeout;
  while (!check()) { if (Date.now() > end) throw new Error(`Timed out: ${label}`); await delay(10); }
}
async function join(role: 'screen' | 'player', name: string) {
  const socket = new WebSocket(base.replace('http', 'ws')); sockets.push(socket);
  const messages: ServerMsg[] = [];
  socket.on('message', raw => messages.push(JSON.parse(String(raw)))); await once(socket, 'open');
  const send = (msg: ClientMsg) => socket.send(JSON.stringify(msg));
  send({ t: 'hello', room, role, name }); await until(() => messages.some(m => m.t === 'welcome'), 'join');
  const welcome = messages.find(m => m.t === 'welcome')! as Extract<ServerMsg, { t: 'welcome' }>;
  return { socket, messages, welcome, send, latest: () => messages.filter(m => m.t === 'classroom').at(-1)! };
}
try {
  const teacher = await join('screen', 'Smoke teacher'), projector = await join('screen', 'Smoke projector');
  const bots: (Awaited<ReturnType<typeof join>> & { profile: string })[] = [];
  for (let i = 0; i < count; i++) bots.push({ ...await join('player', `Bot ${i + 1}`), profile: profiles[i % profiles.length] });
  const viewers = [teacher, projector, ...bots];
  const plan = defaultClassroomPlan(); plan.steps = [{ ...plan.steps[0], id: 'mixed', mode: 'mixed', durationSec: 0, checksWeight: 100, questionContext: 'SMOKE_PUBLIC_SHARED_CONTEXT',
    checks: [{ id: 'readme', label: 'Evidence', kind: 'file', path: 'README.md' }], questions: [
      { id: 'single', kind: 'single', prompt: 'Pick one', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], answer: 'a', explain: 'SMOKE_PRIVATE_EXPLANATION' },
      { id: 'multi', kind: 'multi', prompt: 'Pick several', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], answer: ['a', 'b'] },
      { id: 'blank', kind: 'blank', prompt: 'Fill {{1}} and {{2}}', blanks: [{ accept: ['SMOKE_PRIVATE_KEY'] }, { accept: ['23456'], numeric: { value: 23456, tolerance: .5 } }] },
    ] }];
  teacher.send({ t: 'classroomPlan', plan }); await until(() => !!projector.latest(), 'plan');
  teacher.send({ t: 'classroomControl', action: 'start' }); await until(() => teacher.latest().state.phase === 'coding', 'start');
  for (const bot of bots) {
    const p = bot.profile;
    if (p !== 'questions-only' && p !== 'unanswered') bot.send({ t: 'classroomSubmit', repo: 'smoke/local', ref: p === 'wrong' ? 'wrong' : 'right' });
    if (p !== 'code-only' && p !== 'unanswered') bot.send({ t: 'classroomAnswers', stepId: 'mixed', attempt: 1, answers: {
      single: { choice: p === 'wrong' ? 'b' : 'a' }, multi: { choices: p === 'wrong' ? ['c'] : p === 'partial' ? ['a'] : ['a', 'b'] }, blank: { blanks: p === 'perfect' || p === 'questions-only' ? ['SMOKE_PRIVATE_KEY', '23456'] : ['wrong', 'bad'] },
    } });
  }
  await until(() => bots.every(bot => {
    const row = teacher.latest().state.rows.find(r => r.id === bot.welcome.you);
    return row && (scores[bot.profile] === null ? row.status === 'empty' : row.status === 'submitted' && row.score === scores[bot.profile]);
  }), 'blended scores');
  const answered = bots.filter(b => !['code-only', 'unanswered'].includes(b.profile)).length;
  await until(() => teacher.latest().questionLive?.every(q => q.answered === answered) === true && viewers.every(peer => peer.latest()?.state.questionAnswered?.every(n => n === answered) === true), 'all answer broadcasts delivered');
  for (const peer of [...bots, projector]) {
    assert.ok(peer.messages.filter(m => m.t === 'classroom').every(m => !m.questionLive));
    const state = peer.latest().state;
    assert.equal(state.plan.steps[0].questionContext, 'SMOKE_PUBLIC_SHARED_CONTEXT');
    for (const q of state.plan.steps[0].questions!) { assert.ok(!('answer' in q)); assert.ok(!('blanks' in q)); assert.ok(!('explain' in q)); }
    assert.ok(!JSON.stringify(peer.messages).includes('SMOKE_PRIVATE_EXPLANATION'));
    assert.deepEqual((state.plan.steps[0].questions![2] as unknown as { blankNumeric: boolean[] }).blankNumeric, [false, true]);
    assert.ok(!JSON.stringify(state.plan).includes('23456'));
    for (const message of peer.messages) if (message.t === 'classroom') {
      if (message.state.phase === 'coding' || message.state.phase === 'paused') assert.ok(message.state.questionAnswered!.every(n => Number.isInteger(n) && n >= 0));
      else assert.ok(!('questionAnswered' in message.state));
    }
  }
  const live = teacher.latest().questionLive!;
  assert.equal(live[0].total, count); assert.equal(live[0].answered, bots.filter(b => !['code-only', 'unanswered'].includes(b.profile)).length);
  const publicCounts = live.map(q => q.answered);
  for (const peer of [teacher, projector, ...bots]) assert.deepEqual(peer.latest().state.questionAnswered, publicCounts);
  teacher.send({ t: 'classroomControl', action: 'pause' }); await until(() => viewers.every(peer => peer.latest().state.phase === 'paused'), 'pause');
  for (const peer of [teacher, projector, ...bots]) assert.deepEqual(peer.latest().state.questionAnswered, publicCounts);
  teacher.send({ t: 'classroomControl', action: 'resume' }); await until(() => viewers.every(peer => peer.latest().state.phase === 'coding'), 'resume');
  const publicInfo = await (await fetch(`${base}/api/room/${room}`)).json(); assert.ok(!JSON.stringify(publicInfo).includes('questions'));
  const submitted = bots.filter(b => scores[b.profile] !== null);
  if (!submitted.length) throw new Error('At least one bot profile must submit');
  teacher.send({ t: 'classroomControl', action: 'attack' }); await until(() => viewers.every(peer => peer.latest().state.phase === 'raid'), 'raid');
  for (const peer of [teacher, projector, ...bots]) assert.ok(!('questionAnswered' in peer.latest().state));
  assert.deepEqual(teacher.latest().state.rounds[0].questionStats, live);
  assert.ok(!projector.latest().state.rounds[0].questionStats![0].options);
  await until(() => viewers.every(peer => peer.latest().state.phase === 'feedback'), 'reveal');
  for (const peer of [teacher, projector, ...bots]) assert.ok(!('questionAnswered' in peer.latest().state));
  assert.deepEqual(projector.latest().state.rounds[0].questionStats, live);
  assert.ok(JSON.stringify(projector.latest().state.plan).includes('SMOKE_PRIVATE_KEY'));
  for (const bot of submitted) {
    assert.equal(bot.latest().reports[bot.welcome.you].score, scores[bot.profile]);
    const results = bot.latest().reports[bot.welcome.you].answers;
    if (results?.single) assert.deepEqual(results.single.key, { choice: 'a' });
  }
  const headers = { 'x-room-token': teacher.welcome.token };
  const exported = await (await fetch(`${base}/api/room/${room}/classroom.csv`, { headers })).text(); assert.ok(exported.includes('s1-single')); assert.ok(!exported.includes('SMOKE_PRIVATE_KEY'));
  assert.equal((await fetch(`${base}/api/room/${room}/classroom.csv`, { headers: { 'x-room-token': bots[0].welcome.token } })).status, 403);
  const grades = await (await fetch(`${base}/api/room/${room}/grades.csv`, { headers })).text(); assert.ok(grades.includes('s1-code')); assert.ok(grades.includes('s1-questions'));
  for (const peer of [teacher, projector, ...bots]) assert.deepEqual(peer.messages.filter(m => m.t === 'error'), []);
  console.log(JSON.stringify({ passed: true, bots: count, profiles, submitted: submitted.length, scores: bots.map(b => ({ profile: b.profile, score: scores[b.profile] })), liveStats: live, publicAnswerCounts: publicCounts, numericHints: true, sharedContext: true, reveal: true, teacherOnlyExports: true }));
} finally {
  for (const socket of sockets) socket.terminate();
  rooms.close(); await new Promise<void>(resolve => wss.close(() => resolve())); await new Promise<void>(resolve => server.close(() => resolve()));
}
