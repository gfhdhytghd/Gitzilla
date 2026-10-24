/** DEV protocol proof, separate from headless behavior tests. Never targets the live server. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import type { BossArchetype, ClientMsg, LobbyState, ServerMsg } from '../shared/types.ts';
import { bossArchetypeFromProfile } from './archetypes.ts';
import { loadBalanceProfiles } from './bots.ts';
import { bossRegions } from './regions.ts';

const base = process.env.SMOKE_URL || 'http://localhost:5175', target = new URL(base);
assert.ok(target.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) && target.port === '5175'
  && !target.username && !target.password, 'Archetype smoke is DEV loopback 5175 only');
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function smoke(archetype: BossArchetype) {
  // DEV can have newer public analyses than the bundled balance fixtures (e.g. age unavailable).
  const candidates = loadBalanceProfiles().filter(p => bossArchetypeFromProfile(p).archetype === archetype);
  const profile = candidates.find(p => {
    const file = new URL(`../.cache/analysis/${p.slug}.json`, import.meta.url);
    if (!existsSync(file)) return false;
    const cached = JSON.parse(readFileSync(file, 'utf8'));
    return bossArchetypeFromProfile(cached.profile ?? cached).archetype === archetype;
  }) ?? candidates[0];
  const response = await fetch(base + '/api/room', { method: 'POST' }); assert.equal(response.status, 201);
  const { room } = await response.json() as { room: string };
  const socket = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
  let lobby: LobbyState | undefined, welcomed = false, snapshots = 0, airborne = 0, failure: unknown;
  const poses = new Set<string>();
  socket.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString()) as ServerMsg;
      if (message.t === 'error') throw new Error(message.message);
      if (message.t === 'welcome') { welcomed = true; lobby = message.lobby; }
      if (message.t === 'lobby') lobby = message.lobby;
      if (message.t !== 'snapshot') return;
      const boss = message.state.boss; assert.ok(boss); assert.equal(boss.kit.archetype, archetype);
      assert.ok(Number.isFinite(boss.pose.t) && boss.pose.total > 0 && boss.pose.t <= boss.pose.total + 1e-6);
      assert.ok(boss.pose.dir.every(Number.isFinite)); assert.deepEqual(boss.regions, bossRegions(boss));
      poses.add(boss.pose.name); snapshots++; if (boss.airborne) airborne++;
    } catch (error) { failure = error; }
  });
  socket.on('error', error => { failure = error; });
  const send = (msg: ClientMsg) => socket.send(JSON.stringify(msg));
  async function until(check: () => boolean) {
    for (let i = 0; i < 1200; i++) {
      if (failure) throw failure;
      if (socket.readyState >= WebSocket.CLOSING) throw new Error('DEV socket closed during archetype smoke');
      if (check()) return;
      await pause(25);
    }
    throw new Error(`${archetype}: DEV timeout`);
  }
  try {
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    send({ t: 'hello', room, role: 'player', name: 'DEV archetype test' }); await until(() => welcomed);
    send({ t: 'setRepo', repo: profile.slug }); send({ t: 'setBoss', repo: profile.slug }); send({ t: 'setBots', count: 3 });
    await until(() => lobby?.boss.repo === profile.slug && lobby.boss.status === 'ready' && lobby.players.length === 4 && lobby.players.every(p => p.status === 'ready'));
    assert.equal(lobby!.boss.kit!.archetype, archetype, 'DEV analyzed traits select the expected form');
    send({ t: 'controls', ready: true, mode: 'tap-only' }); send({ t: 'start' });
    await until(() => snapshots > 0); await pause(11_000);
    if (failure) throw failure;
    assert.equal(socket.readyState, WebSocket.OPEN); assert.ok(snapshots >= 180);
    assert.ok(poses.has('windup') && poses.has('attack'), `${archetype}: primary attacks carry poses`);
    if (archetype === 'hydra' || archetype === 'mecha') assert.ok(airborne > 0 && poses.has('fly'), `${archetype}: flight/hop reaches wire`);
    if (archetype === 'abyssal') assert.ok(airborne > 0 && poses.has('burrow') && poses.has('emerge'), 'Burrow/emerge reaches wire');
    return { archetype, repo: profile.slug, room, snapshots, airborne, poses: [...poses] };
  } finally {
    if (socket.readyState === WebSocket.OPEN) {
      send({ t: 'leave' });
      for (let i = 0; i < 80 && socket.readyState === WebSocket.OPEN; i++) await pause(25);
    }
    socket.terminate();
  }
}

// The shared watcher may be between restarts when a teammate edits a dependency.
for (let i = 0; ; i++) {
  try { await fetch(base + '/api/me', { signal: AbortSignal.timeout(1000) }); break; }
  catch { if (i >= 100) throw new Error('DEV 5175 unavailable after 10s; no live fallback'); await pause(100); }
}
const results = await Promise.allSettled((['kaiju', 'hydra', 'mecha', 'abyssal'] as const).map(smoke));
for (const result of results) {
  if (result.status === 'fulfilled') console.log('PASS', JSON.stringify(result.value));
  else { console.error(result.reason); process.exitCode = 1; }
}
