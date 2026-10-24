import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import type { ClientMsg, LobbyState, MatchState, ServerMsg } from '../shared/types.ts';

const base = process.env.SMOKE_URL || 'http://localhost:5175';
const target = new URL(base);
assert.ok(target.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  && target.port === '5175' && !target.username && !target.password, 'Classroom smoke is DEV loopback 5175 only; live targets are forbidden');
const students = Number(process.env.CLASSROOM_PLAYERS || 2);
const botCount = Number(process.env.CLASSROOM_BOTS || 0);
assert.ok(Number.isInteger(students) && students >= 0 && students <= 30 && Number.isInteger(botCount) && botCount >= 0 && botCount <= 7
  && students + botCount >= 2 && students + botCount <= 30);
const sockets: WebSocket[] = [];
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(get: () => T | false | undefined, label: string): Promise<T> {
  for (let i = 0; i < 1200; i++) { const result = get(); if (result) return result; await pause(25); }
  throw new Error(`Classroom smoke timed out: ${label}`);
}
let inputTimer: ReturnType<typeof setInterval> | undefined;
try {
  for (let i = 0; ; i++) {
    try { await fetch(base + '/api/me', { signal: AbortSignal.timeout(1000) }); break; }
    catch { if (i >= 50) throw new Error('DEV 5175 unavailable; no live fallback'); await pause(100); }
  }
  const response = await fetch(base + '/api/room?mode=edu', { method: 'POST' });
  assert.equal(response.status, 201);
  const { room } = await response.json() as { room: string };
  const repos = await (await fetch(base + '/api/fallbacks')).json() as string[];
  async function connect(role: 'player' | 'screen', name: string) {
    const socket = new WebSocket(base.replace(/^http/, 'ws') + '/ws'); sockets.push(socket);
    const peer = { welcome: undefined as Extract<ServerMsg, { t: 'welcome' }> | undefined,
      lobby: undefined as LobbyState | undefined, state: undefined as MatchState | undefined, snapshots: 0, ack: -1, closed: false, errors: [] as string[],
      send: (msg: ClientMsg) => socket.send(JSON.stringify(msg)),
      leave: () => new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Classroom leave did not close socket')), 3000);
        socket.once('close', (code, reason) => { clearTimeout(timeout);
          try { assert.equal(code, 4002); assert.equal(reason.toString(), 'left'); resolve(); } catch (error) { reject(error); }
        });
        socket.send(JSON.stringify({ t: 'leave' } satisfies ClientMsg));
      }) };
    socket.on('message', raw => {
      const msg = JSON.parse(raw.toString()) as ServerMsg;
      if (msg.t === 'welcome') { peer.welcome = msg; peer.lobby = msg.lobby; }
      else if (msg.t === 'lobby') peer.lobby = msg.lobby;
      else if (msg.t === 'snapshot') { peer.state = msg.state; peer.ack = msg.ack; peer.snapshots++; }
      else if (msg.t === 'error') peer.errors.push(msg.message);
    });
    socket.on('error', () => {});
    socket.on('close', () => { peer.closed = true; });
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    peer.send({ t: 'hello', room, role, name });
    await until(() => {
      if (peer.errors.length) throw new Error(`${name}: ${peer.errors.join('; ')}`);
      if (peer.closed) throw new Error(`${name}: DEV socket closed during handshake (server restart or connection failure)`);
      return peer.welcome;
    }, `${name} welcome`);
    return peer;
  }
  const teacher = await connect('screen', 'DEV classroom teacher');
  assert.equal(teacher.welcome!.lobby.mode, 'edu');
  assert.equal(teacher.welcome!.lobby.ownerId, teacher.welcome!.you);
  assert.equal(teacher.welcome!.lobby.players.length, 0, 'Teacher consumes no student slot');
  const peers: Awaited<ReturnType<typeof connect>>[] = [];
  for (let i = 0; i < students; i++) {
    if (teacher.closed) throw new Error('DEV teacher connection closed while joining class (server restart or connection failure)');
    const peer = await connect('player', `DEV student ${i + 1}`); peers.push(peer);
    peer.send({ t: 'setRepo', repo: repos[i % Math.min(repos.length, 3)] });
  }
  if (botCount) teacher.send({ t: 'setBots', count: botCount });
  await until(() => {
    if (teacher.closed) throw new Error('DEV teacher connection closed (server restart or connection failure)');
    if (teacher.errors.length) throw new Error(teacher.errors.join('; '));
    return teacher.lobby?.players.length === students + botCount && teacher.lobby.players.every(p => p.status === 'ready');
  }, 'ready students');
  assert.ok(teacher.lobby!.players.every(p => p.kit?.quality?.length), 'Every classroom kit has code-quality grades');
  assert.ok(teacher.lobby!.players.every(p => p.genesis?.trace.length), 'Every classroom kit has a report-card Genesis');
  assert.equal(teacher.lobby!.boss.status, 'empty', 'No boss was selected');
  teacher.send({ t: 'start' });
  await until(() => {
    if (teacher.closed) throw new Error('DEV teacher connection closed (server restart or connection failure)');
    if (teacher.errors.length) throw new Error(teacher.errors.join('; '));
    return teacher.state?.mode === 'edu' && peers.every(p => p.state?.mode === 'edu');
  }, 'PvP match start');
  const before = peers.map(p => p.snapshots);
  const teacherBefore = teacher.snapshots;
  let seq = 0;
  inputTimer = setInterval(() => {
    seq++;
    for (let i = 0; i < peers.length; i++) {
      const angle = seq * 0.05 + i;
      peers[i].send({ t: 'input', frame: { seq, move: [Math.cos(angle), Math.sin(angle)], aim: null, fire: true, dash: seq % 40 === 0, skill: false, source: 'keyboard' } });
    }
  }, 1000 / 30);
  await pause(5000); clearInterval(inputTimer);
  assert.ok(!teacher.closed && peers.every(p => !p.closed), 'DEV sockets closed during the input window (server restart or connection failure)');
  const state = teacher.state!;
  assert.equal(state.mode, 'edu'); assert.equal(state.boss, null); assert.equal(state.heroScale, 2); assert.ok(state.pvp);
  assert.equal(state.players.length, students + botCount);
  assert.ok(state.players.every(p => p.id !== teacher.welcome!.you), 'Teacher remains a spectator');
  assert.ok(state.players.every(p => p.kit.quality?.length));
  for (let i = 0; i < peers.length; i++) {
    assert.equal(peers[i].errors.length, 0); assert.ok(peers[i].snapshots - before[i] >= 50); assert.ok(peers[i].ack > 0);
  }
  assert.equal(teacher.errors.length, 0);
  assert.ok(teacher.snapshots - teacherBefore >= 50, 'Teacher receives the authoritative stream');
  assert.ok(state.t >= 4);
  const throughput = peers.map((p, i) => p.snapshots - before[i]);
  const teacherThroughput = teacher.snapshots - teacherBefore;
  for (let i = 0; i < peers.length; i++) {
    await peers[i].leave();
    await until(() => teacher.lobby?.players.length === students + botCount - i - 1, 'student slot removed');
    await until(() => teacher.state?.players.length === students + botCount - i - 1, 'departed fighter removed from stream');
  }
  await teacher.leave();
  assert.deepEqual(await (await fetch(base + '/api/room/' + room)).json(), { exists: false, players: 0, phase: null });
  console.log(`PASS classroom DEV 5175 room=${room}; teacher + ${students} students + ${botCount} bots; boss=null; heroScale=2; quality/report Genesis; teacher snapshots=${teacherThroughput}; 5s student snapshots=${throughput.join(',')}; student/teacher leave + deletion OK`);
} finally {
  clearInterval(inputTimer);
  for (const socket of sockets) socket.terminate();
}
