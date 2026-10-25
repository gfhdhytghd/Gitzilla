import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import type { ClientMsg, LobbyState, ServerMsg } from '../shared/types.ts';
import { defaultClassroomPlan } from '../shared/classroom-defaults';

const base = process.env.SMOKE_URL || 'http://localhost:5175';
const target = new URL(base);
assert.ok(target.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  && target.port === '5175' && !target.username && !target.password, 'Classroom smoke is DEV loopback 5175 only; live targets are forbidden');
const students = Number(process.env.CLASSROOM_PLAYERS || 2);
const botCount = Number(process.env.CLASSROOM_BOTS || 0);
assert.ok(Number.isInteger(students) && students >= 2 && students <= 30 && botCount === 0, 'Staged classroom smoke needs 2–30 real student clients, no AI classmates');
const sockets: WebSocket[] = [];
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(get: () => T | false | undefined, label: string): Promise<T> {
  for (let i = 0; i < 1200; i++) { const result = get(); if (result) return result; await pause(25); }
  throw new Error(`Classroom smoke timed out: ${label}`);
}
try {
  for (let i = 0; ; i++) {
    try { await fetch(base + '/api/me', { signal: AbortSignal.timeout(1000) }); break; }
    catch { if (i >= 50) throw new Error('DEV 5175 unavailable; no live fallback'); await pause(100); }
  }
  const response = await fetch(base + '/api/room?mode=edu', { method: 'POST' });
  assert.equal(response.status, 201);
  const { room } = await response.json() as { room: string };
  async function connect(role: 'player' | 'screen', name: string) {
    const socket = new WebSocket(base.replace(/^http/, 'ws') + '/ws'); sockets.push(socket);
    const peer = { socket, welcome: undefined as Extract<ServerMsg, { t: 'welcome' }> | undefined,
      lobby: undefined as LobbyState | undefined, classroom: undefined as Extract<ServerMsg, { t: 'classroom' }> | undefined,
      kicked: undefined as Extract<ServerMsg, { t: 'kicked' }> | undefined, closed: false, errors: [] as string[],
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
      else if (msg.t === 'classroom') peer.classroom = msg;
      else if (msg.t === 'kicked') peer.kicked = msg;
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
  assert.equal(teacher.welcome!.lobby.rubric?.source, 'default', 'New classroom has a default rubric');
  assert.equal(teacher.welcome!.lobby.ownerId, teacher.welcome!.you);
  assert.equal(teacher.welcome!.lobby.players.length, 0, 'Teacher consumes no student slot');
  const peers: Awaited<ReturnType<typeof connect>>[] = [];
  for (let i = 0; i < students; i++) {
    if (teacher.closed) throw new Error('DEV teacher connection closed while joining class (server restart or connection failure)');
    const peer = await connect('player', `DEV student ${i + 1}`); peers.push(peer);
  }
  await until(() => {
    if (teacher.closed) throw new Error('DEV teacher connection closed (server restart or connection failure)');
    if (teacher.errors.length) throw new Error(teacher.errors.join('; '));
    return teacher.lobby?.players.length === students;
  }, 'joined students');
  assert.equal(teacher.lobby!.boss.status, 'empty', 'No boss was selected');
  const preview = await fetch(base + '/api/rubric/parse?room=' + room + '&filename=smoke.md', { method: 'POST',
    headers: { Authorization: `Bearer ${teacher.welcome!.token}`, 'Content-Type': 'text/markdown' },
    body: '# DEV smoke classroom rubric\nTesting (60%): tests target 20%\nDocumentation (40%): README' });
  assert.equal(preview.status, 200);
  const rubric = await preview.json() as import('../shared/types.ts').Rubric;
  teacher.send({ t: 'setRubric', rubric });
  await until(() => teacher.lobby?.rubric?.title === rubric.title && peers.every(p => p.lobby?.rubric?.title === rubric.title), 'teacher rubric broadcast');
  const plan = defaultClassroomPlan(); plan.steps = plan.steps.slice(0, 1);
  Object.assign(plan.steps[0], { durationSec: 0, rubric, checksWeight: 100, language: 'python', starter: [{ path: 'main.py', content: '# TODO\n' }],
    checks: [{ id: 'file', kind: 'file', path: 'main.py', label: 'Python file' }, { id: 'answer', kind: 'contains', path: 'main.py', text: 'answer = 42', label: 'Answer' }],
    brief: { goal: 'Set the answer.', todo: ['Open `main.py`.', 'Assign 42 to `answer`.'], doneWhen: ['The file exists.', 'The file assigns the answer.'] } });
  teacher.send({ t: 'classroomPlan', plan }); await until(() => teacher.classroom?.state.rows.length === students, 'published lesson');
  assert.deepEqual(teacher.classroom!.state.plan.steps[0].brief, plan.steps[0].brief);
  teacher.send({ t: 'classroomControl', action: 'start' }); await until(() => peers.every(p => p.classroom?.state.phase === 'coding'), 'coding phase');
  for (const p of peers) p.send({ t: 'classroomSubmitCode', files: [{ path: 'main.py', content: 'answer = 42\n# DEV_SMOKE_STUDENT_SOURCE\n' }] });
  await until(() => teacher.classroom?.state.rows.every(r => r.status === 'submitted'), 'static grading');
  assert.equal(Object.keys(teacher.classroom!.reports).length, students);
  for (const p of peers) {
    const report = p.classroom!.reports[p.welcome!.you]; assert.equal(report.score, 100); assert.equal(report.source, 'in-app');
    assert.match(report.commit, /^inapp:[a-f0-9]{8}$/); assert.equal(report.files, undefined); assert.equal(Object.keys(p.classroom!.reports).length, 1);
  }
  assert.ok(Object.values(teacher.classroom!.reports).every(r => r.files?.[0].content.includes('DEV_SMOKE_STUDENT_SOURCE')));
  teacher.send({ t: 'classroomControl', action: 'attack' }); await until(() => peers.every(p => p.classroom?.state.phase === 'raid'), 'class raid');
  const frozenRound = structuredClone(teacher.classroom!.state.rounds[0]);
  assert.equal(frozenRound.roster, students);
  assert.deepEqual(frozenRound.checkStats, [{ label:'Python file', passed:students, total:students }, { label:'Answer', passed:students, total:students }]);
  for (const peer of peers) assert.deepEqual(peer.classroom!.state.rounds[0].checkStats, frozenRound.checkStats);
  await pause(5000); assert.ok(!teacher.closed && peers.every(p => !p.closed));
  const exportUrl = `${base}/api/room/${room}/classroom.csv`, headers = { 'X-Room-Token': teacher.welcome!.token };
  const before = await (await fetch(exportUrl, { headers })).text();
  assert.equal((await fetch(exportUrl, { headers: { 'X-Room-Token': peers[0].welcome!.token } })).status, 403);
  const kicked = peers[0], closed = new Promise<number>(resolve => kicked.socket.once('close', code => resolve(code)));
  teacher.send({ t: 'kick', playerId: kicked.welcome!.you }); assert.equal(await closed, 4003);
  assert.deepEqual(kicked.kicked, { t: 'kicked', by: 'DEV classroom teacher' });
  await until(() => teacher.classroom?.state.rows.length === students - 1, 'kicked student removed');
  assert.equal(teacher.classroom!.reports[kicked.welcome!.you], undefined);
  assert.deepEqual(teacher.classroom!.state.rounds[0], frozenRound, 'Frozen roster/check totals survive removal');
  assert.equal(await (await fetch(exportUrl, { headers })).text(), before, 'Frozen earned results survive the kick');
  const probe = new WebSocket(base.replace(/^http/, 'ws') + '/ws'); sockets.push(probe);
  const errors: string[] = []; probe.on('message', raw => { const msg = JSON.parse(String(raw)) as ServerMsg; if (msg.t === 'error') errors.push(msg.message); });
  await new Promise<void>(resolve => probe.once('open', resolve)); const probeClose = new Promise<number>(resolve => probe.once('close', code => resolve(code)));
  probe.send(JSON.stringify({ t: 'hello', room, role: 'player', name: 'Banned probe', resume: kicked.welcome!.token } satisfies ClientMsg));
  assert.equal(await probeClose, 4003); assert.ok(errors.includes('You were removed from this room by the host.'));
  for (let i = 1; i < peers.length; i++) {
    await peers[i].leave();
    await until(() => teacher.lobby?.players.length === students - i - 1, 'student slot removed');
  }
  await teacher.leave();
  assert.deepEqual(await (await fetch(base + '/api/room/' + room)).json(), { exists: false, players: 0, phase: null });
  console.log(`PASS classroom DEV 5175 room=${room}; teacher + ${students} students; rubric upload, brief, static in-app grading/private source, 5s raid, kick+resume ban, frozen exports, student/teacher leave + deletion OK`);
} finally {
  for (const socket of sockets) socket.terminate();
}
