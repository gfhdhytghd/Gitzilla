import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import type { ClientMsg, InputFrame, ServerMsg } from '../shared/types.ts';

const base = process.env.SMOKE_URL || 'http://localhost:5175';
const target = new URL(base);
assert.ok(['http:', 'https:'].includes(target.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  && target.port === '5175' && !target.username && !target.password, 'Smoke is DEV-only: use loopback port 5175; live targets are forbidden');
const humanCount = Number(process.env.SMOKE_PLAYERS || 4);
const botCount = Number(process.env.SMOKE_BOTS || 0);
assert.ok(humanCount >= 1 && humanCount <= 8 && botCount >= 0 && humanCount + botCount <= 8);
const sockets: WebSocket[] = [];
const leaving = new Set<WebSocket>();
const messages: ServerMsg[][] = [];
const snapshots = Array.from({ length: humanCount }, () => 0);
let sequence = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor<T>(get: () => T | undefined | false, label: string, timeout = 30_000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (sockets.some(socket => socket.readyState >= WebSocket.CLOSING && !leaving.has(socket))) {
      throw new Error(`DEV socket closed while waiting for ${label} (server restart or connection failure)`);
    }
    const value = get(); if (value) return value;
    await pause(25);
  }
  throw new Error(`Timed out: ${label}`);
}
async function devIdentity(): Promise<Response> {
  const deadline = Date.now() + 10_000;
  while (true) {
    try { return await fetch(new URL('/api/me', base), { signal: AbortSignal.timeout(2000) }); }
    catch {
      if (Date.now() >= deadline) throw new Error('DEV 5175 is unavailable after 10s; no live fallback attempted');
      await pause(100);
    }
  }
}
function send(index: number, message: ClientMsg) { sockets[index].send(JSON.stringify(message)); }

async function checkDevHmr() {
  const response = await fetch(new URL('/@vite/client', base));
  assert.equal(response.status, 200);
  const source = await response.text();
  const constant = (name: string) => {
    const match = source.match(new RegExp(`const ${name} = ([^;\\n]+);`));
    assert.ok(match, `Vite injects ${name}`);
    return JSON.parse(match[1]) as unknown;
  };
  assert.equal(constant('hmrPort'), null, 'Browser HMR port must follow the page through HTTPS tunnels');
  const direct = String(constant('directSocketHost'));
  assert.equal(new URL('ws://' + direct).port, target.port, 'Vite fallback targets the actual DEV port');
  assert.ok(source.includes('hmrPort || importMetaUrl.port'));
  assert.match(source, /const socketProtocol = null \|\|/, 'Browser chooses ws/wss from the page protocol');
  const url = new URL('/', base); url.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', String(constant('wsToken')));
  const socket = new WebSocket(url, 'vite-hmr');
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('DEV HMR handshake timed out')), 3000);
      socket.once('error', error => { clearTimeout(timeout); reject(error); });
      socket.on('message', raw => {
        if (JSON.parse(raw.toString()).type === 'connected') { clearTimeout(timeout); resolve(); }
      });
    });
  } finally { socket.terminate(); }
}

try {
  const me = await devIdentity();
  await checkDevHmr();
  assert.equal(me.status, 200, 'Auth routes run before the API catch-all');
  const identity = await me.json() as { enabled: boolean; user: unknown };
  assert.equal(typeof identity.enabled, 'boolean');
  assert.equal(identity.user, null, 'Smoke starts without a session cookie');
  assert.equal((await fetch(new URL('/api/me/repos', base))).status, 401, 'Anonymous private-repo listing requires login');
  const response = await fetch(new URL('/api/room', base), { method: 'POST' });
  assert.equal(response.status, 201);
  const { room } = await response.json() as { room: string };
  assert.match(room, /^[A-Z]{4}$/);
  const roomInfo = await (await fetch(new URL(`/api/room/${room}`, base))).json() as { exists: boolean; players: number; phase: string };
  assert.deepEqual(roomInfo, { exists: true, players: 0, phase: 'lobby' });
  assert.equal((await fetch(new URL('/api/room/AB12', base))).status, 400, 'Digit room codes have a clear validation error');
  const fallbacks = await (await fetch(new URL('/api/fallbacks', base))).json() as string[];
  assert.ok(fallbacks.length >= 1, 'At least one fallback repo is required');
  const qr = await fetch(new URL(`/api/qr?text=${encodeURIComponent(`${base}/r/${room}`)}`, base));
  assert.equal(qr.status, 200);
  assert.match(qr.headers.get('content-type') || '', /image\/svg\+xml/);
  assert.match(await qr.text(), /<svg/);
  for (let i = 0; i < humanCount; i++) {
    messages[i] = [];
    const url = new URL('/ws', base); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url, { headers: { 'User-Agent': i === 0 ? 'Gitzilla synthetic iPhone protocol smoke' : 'Gitzilla desktop protocol smoke' } }); sockets.push(socket);
    socket.on('message', raw => {
      const msg = JSON.parse(raw.toString()) as ServerMsg;
      messages[i].push(msg);
      if (msg.t === 'snapshot') snapshots[i]++;
    });
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    send(i, { t: 'hello', room, role: 'player', name: `Smoke ${i + 1}` });
    await waitFor(() => messages[i].find(m => m.t === 'welcome'), `client ${i} welcome`);
  }
  for (let i = 0; i < humanCount; i++) send(i, { t: 'setRepo', repo: fallbacks[i % fallbacks.length] });
  send(0, { t: 'setBoss', repo: fallbacks[0] });
  if (botCount) send(0, { t: 'setBots', count: botCount });
  await waitFor(() => {
    const lobbies = messages[0].filter(m => m.t === 'lobby');
    const lobby = lobbies.at(-1)?.lobby;
    if (lobby?.players.some(p => p.status === 'error') || lobby?.boss.status === 'error') throw new Error(`Analysis failed: ${JSON.stringify(lobby)}`);
    return lobby?.players.length === humanCount + botCount && lobby.players.every(p => p.status === 'ready') && lobby.boss.status === 'ready';
  }, 'ready human/bot squad and boss', 90_000);
  const ready = messages[0].filter(m => m.t === 'lobby').at(-1)!.lobby;
  assert.ok(ready.players.every(p => p.genesis?.slug === p.repo), 'Every human/bot has a replayable Genesis');
  assert.equal(ready.boss.genesis?.slug, ready.boss.repo, 'Boss Genesis is attached');
  assert.ok(ready.players.every(p => p.genesis!.trace.length > 0), 'Genesis maps real repo features to the hero');
  assert.ok(ready.boss.genesis!.trace.length > 0, 'Genesis maps boss anatomy and attacks');
  const you = messages[0].find(m => m.t === 'welcome')!.you;
  assert.equal(ready.players.find(p => p.id === you)?.controlsReady, false, 'A new synthetic phone page has no remembered sensor permission');
  assert.ok(ready.players.filter(p => p.id !== you).every(p => p.controlsReady), 'Desktop and bot teammates start ready');
  send(0, { t: 'controls', ready: true, mode: 'tap-only' });
  await waitFor(() => messages[0].filter(m => m.t === 'lobby').at(-1)?.lobby.players.find(p => p.id === you)?.controlsReady, 'explicit per-page touch readiness');
  send(0, { t: 'start' });
  await waitFor(() => snapshots.every(count => count > 0), 'initial snapshots');
  const before = [...snapshots];
  timer = setInterval(() => {
    const seq = ++sequence;
    for (let i = 0; i < humanCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const frame: InputFrame = { seq, move: [Math.cos(angle), Math.sin(angle)], aim: null, fire: true, dash: Math.random() < 0.08, skill: Math.random() < 0.03, source: 'keyboard' };
      send(i, { t: 'input', frame });
    }
  }, 1000 / 30);
  await pause(5000);
  clearInterval(timer);
  assert.ok(sockets.every(socket => socket.readyState === WebSocket.OPEN), 'DEV socket closed during input window (server restart or connection failure)');
  for (let i = 0; i < humanCount; i++) {
    assert.ok(snapshots[i] - before[i] >= 50, `Client ${i} should receive ~100 snapshots in 5s, got ${snapshots[i] - before[i]}`);
    assert.equal(messages[i].filter(m => m.t === 'error').length, 0, `Client ${i} protocol errors`);
    const states = messages[i].filter(m => m.t === 'snapshot');
    const boss = states.at(-1)!.state.boss;
    assert.ok(boss, 'Battle snapshots have a boss');
    assert.equal(states.at(-1)?.state.players.length, humanCount + botCount);
    assert.ok(boss.kit.heart, 'Boss kit carries analyzed heart');
    assert.ok(boss.kit.design, 'Boss seed/cached design is attached without blocking readiness');
    assert.ok(states.at(-1)!.state.players.every(p => !!p.kit.design), 'Hero seed/cached designs reach all clients');
    assert.ok(boss.regions.some(region => region.id === 'heart'), 'Sim supplies core region');
    assert.ok(states.at(-1)!.ack > 0, 'Input ack advances');
    assert.ok(states.at(-1)!.state.t >= 4, 'Authoritative simulation advances');
  }
  if (botCount) {
    const states = messages[0].filter(m => m.t === 'snapshot');
    assert.equal(states.at(-1)!.state.players.filter(p => p.id.startsWith('bot-')).length, botCount);
    assert.ok(states.some(m => m.state.players.some(p => p.id.startsWith('bot-') && Math.hypot(p.vx, p.vy) > 0)), 'AI teammates move under sim/bots.ts inputs');
  }
  const hall = await (await fetch(new URL('/api/hall', base))).json() as Record<string, unknown>;
  for (const key of ['fastestKills', 'topDamage', 'bossRecords']) assert.ok(Array.isArray(hall[key]), `Hall ${key} is an array`);
  const throughput = snapshots.map((n, i) => n - before[i]);
  const owner = messages[0].find(m => m.t === 'welcome')!;
  async function leave(index: number) {
    leaving.add(sockets[index]);
    const closed = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Explicit leave did not close the socket')), 3000);
      sockets[index].once('close', (code, reason) => { clearTimeout(timeout);
        try { assert.equal(code, 4002); assert.equal(reason.toString(), 'left'); resolve(); } catch (error) { reject(error); }
      });
    });
    send(index, { t: 'leave' }); await closed;
  }
  await leave(0);
  if (humanCount > 1) {
    const peer = messages[1].find(m => m.t === 'welcome')!;
    await waitFor(() => messages[1].filter(m => m.t === 'lobby').at(-1)?.lobby.ownerId === peer.you, 'ownership after leave');
    await waitFor(() => {
      const state = messages[1].filter(m => m.t === 'snapshot').at(-1)?.state;
      return state && state.players.length === humanCount + botCount - 1 && !state.players.some(p => p.id === owner.you);
    }, 'departed fighter removed while teammates continue');
  }
  for (let i = 1; i < humanCount; i++) await leave(i);
  assert.deepEqual(await (await fetch(new URL(`/api/room/${room}`, base))).json(), { exists: false, players: 0, phase: null });
  const url = new URL('/ws', base); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const stale = new WebSocket(url); sockets.push(stale);
  await new Promise<void>((resolve, reject) => { stale.once('open', resolve); stale.once('error', reject); });
  const denied = new Promise<number>(resolve => stale.once('close', resolve));
  stale.send(JSON.stringify({ t: 'hello', room, role: 'player', resume: owner.token }));
  assert.equal(await denied, 4002, 'A left tab cannot recreate the deleted room');
  console.log(`PASS room=${room}; ${humanCount} humans + ${botCount} bots; five-second snapshots=${throughput.join(', ')}; controls/HMR/Genesis/auth/QR/fallback/Hall + leave/owner/deletion/revocation OK`);
} finally {
  clearInterval(timer);
  for (const socket of sockets) socket.close();
}
