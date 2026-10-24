import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import type { ClientMsg, InputFrame, ServerMsg } from '../shared/types.ts';

const base = process.env.SMOKE_URL || 'http://localhost:5173';
const humanCount = Number(process.env.SMOKE_PLAYERS || 4);
const botCount = Number(process.env.SMOKE_BOTS || 0);
assert.ok(humanCount >= 1 && humanCount <= 8 && botCount >= 0 && humanCount + botCount <= 8);
const sockets: WebSocket[] = [];
const messages: ServerMsg[][] = [];
const snapshots = Array.from({ length: humanCount }, () => 0);
let sequence = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor<T>(get: () => T | undefined | false, label: string, timeout = 30_000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = get(); if (value) return value;
    await pause(25);
  }
  throw new Error(`Timed out: ${label}`);
}
function send(index: number, message: ClientMsg) { sockets[index].send(JSON.stringify(message)); }

try {
  const response = await fetch(new URL('/api/room', base), { method: 'POST' });
  assert.equal(response.status, 201);
  const { room } = await response.json() as { room: string };
  assert.match(room, /^[A-Z]{4}$/);
  const fallbacks = await (await fetch(new URL('/api/fallbacks', base))).json() as string[];
  assert.ok(fallbacks.length >= 1, 'At least one fallback repo is required');
  const qr = await fetch(new URL(`/api/qr?text=${encodeURIComponent(`${base}/r/${room}`)}`, base));
  assert.equal(qr.status, 200);
  assert.match(qr.headers.get('content-type') || '', /image\/svg\+xml/);
  assert.match(await qr.text(), /<svg/);
  for (let i = 0; i < humanCount; i++) {
    messages[i] = [];
    const url = new URL('/ws', base); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url); sockets.push(socket);
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
  for (let i = 0; i < humanCount; i++) {
    assert.ok(snapshots[i] - before[i] >= 50, `Client ${i} should receive ~100 snapshots in 5s, got ${snapshots[i] - before[i]}`);
    assert.equal(messages[i].filter(m => m.t === 'error').length, 0, `Client ${i} protocol errors`);
    const states = messages[i].filter(m => m.t === 'snapshot');
    assert.equal(states.at(-1)?.state.players.length, humanCount + botCount);
    assert.ok(states.at(-1)!.state.boss.kit.heart, 'Boss kit carries analyzed heart');
    assert.ok(states.at(-1)!.state.boss.kit.design, 'Boss seed/cached design is attached without blocking readiness');
    assert.ok(states.at(-1)!.state.players.every(p => !!p.kit.design), 'Hero seed/cached designs reach all clients');
    assert.ok(states.at(-1)!.state.boss.regions.some(region => region.id === 'heart'), 'Sim supplies core region');
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
  console.log(`PASS room=${room}; ${humanCount} humans + ${botCount} bots; five-second snapshots=${snapshots.map((n, i) => n - before[i]).join(', ')}; QR/fallback/Hall endpoints OK`);
} finally {
  clearInterval(timer);
  for (const socket of sockets) socket.close();
}
