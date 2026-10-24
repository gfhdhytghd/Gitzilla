import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import type { ClientMsg, InputFrame, ServerMsg } from '../shared/types.ts';

const base = process.env.SMOKE_URL || 'http://localhost:5173';
const sockets: WebSocket[] = [];
const messages: ServerMsg[][] = [];
const snapshots = [0, 0, 0, 0];
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
  for (let i = 0; i < 4; i++) {
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
  for (let i = 0; i < 4; i++) send(i, { t: 'setRepo', repo: fallbacks[i % fallbacks.length] });
  send(0, { t: 'setBoss', repo: fallbacks[0] });
  await waitFor(() => {
    const lobbies = messages[0].filter(m => m.t === 'lobby');
    const lobby = lobbies.at(-1)?.lobby;
    if (lobby?.players.some(p => p.status === 'error') || lobby?.boss.status === 'error') throw new Error(`Analysis failed: ${JSON.stringify(lobby)}`);
    return lobby?.players.length === 4 && lobby.players.every(p => p.status === 'ready') && lobby.boss.status === 'ready';
  }, 'four ready players and boss', 90_000);
  send(0, { t: 'start' });
  await waitFor(() => snapshots.every(count => count > 0), 'initial snapshots');
  const before = [...snapshots];
  timer = setInterval(() => {
    const seq = ++sequence;
    for (let i = 0; i < 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      const frame: InputFrame = { seq, move: [Math.cos(angle), Math.sin(angle)], aim: null, fire: true, dash: Math.random() < 0.08, skill: Math.random() < 0.03, source: 'keyboard' };
      send(i, { t: 'input', frame });
    }
  }, 1000 / 30);
  await pause(5000);
  clearInterval(timer);
  for (let i = 0; i < 4; i++) {
    assert.ok(snapshots[i] - before[i] >= 50, `Client ${i} should receive ~100 snapshots in 5s, got ${snapshots[i] - before[i]}`);
    assert.equal(messages[i].filter(m => m.t === 'error').length, 0, `Client ${i} protocol errors`);
    const states = messages[i].filter(m => m.t === 'snapshot');
    assert.equal(states.at(-1)?.state.players.length, 4);
    assert.ok(states.at(-1)!.state.boss.kit.heart, 'Boss kit carries analyzed heart');
    assert.ok(states.at(-1)!.state.boss.regions.some(region => region.id === 'heart'), 'Sim supplies core region');
    assert.ok(states.at(-1)!.ack > 0, 'Input ack advances');
    assert.ok(states.at(-1)!.state.t >= 4, 'Authoritative simulation advances');
  }
  console.log(`PASS room=${room}; 4 clients; five-second snapshots=${snapshots.map((n, i) => n - before[i]).join(', ')}; QR/fallback endpoints OK`);
} finally {
  clearInterval(timer);
  for (const socket of sockets) socket.close();
}
