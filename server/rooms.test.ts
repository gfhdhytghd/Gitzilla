import http from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import type { Autopsy, BossKit, ClientMsg, InputFrame, MatchState, PlayerKit, RepoProfile, ServerMsg } from '../shared/types.ts';
import { RoomServer, type GameServices } from './rooms.ts';
import { qrSvg } from './qr.ts';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(fn: () => T | undefined | false): Promise<T> {
  for (let i = 0; i < 150; i++) { const value = fn(); if (value) return value; await wait(10); }
  throw new Error('Timed out waiting for network message');
}
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });

async function setup(endAt = 999) {
  const observed: InputFrame[] = [];
  const counts: number[] = [];
  const profile = (slug: string) => ({ slug, heart: 'src/real-heart.ts' }) as RepoProfile;
  const services: GameServices = {
    analyzeRepo: async slug => {
      if (slug === 'bad/repo') throw new Error('Unknown repo');
      if (slug === 'slow/repo') await wait(80);
      return profile(slug);
    },
    listFallbackRepos: () => ['test/repo'],
    playerKitFromProfile: p => ({ repo: p.slug }) as PlayerKit,
    bossKitFromProfile: (p, count) => { counts.push(count); return { repo: p.slug, heart: p.heart, maxHp: count * 100 } as BossKit; },
    createMatch: (players, boss) => {
      let t = 0;
      let events: MatchState['events'] = [];
      return {
        step: (dt, inputs) => { t += dt; observed.push(...inputs.values()); events.push({ type: 'hit', target: 'boss', amount: 1, x: 0, y: 0 }); },
        snapshot: () => ({ t, status: t >= endAt ? 'victory' : 'fighting', players: players.map(p => ({ ...p, x: 1, y: 1 })), boss: { kit: boss, regions: [{ id: 'heart', x: 335, y: 144, r: 15 }] }, bullets: [], hazards: [], minions: [], events: events.splice(0) }) as unknown as MatchState,
        get over() { return t >= endAt; },
        autopsy: () => ({ victory: true, duration: t, boss: { repo: boss.repo, limbs: [], heart: 'core' }, players: [], mvp: players[0].id }) as Autopsy,
      };
    },
  };
  const server = http.createServer();
  const wss = new WebSocketServer({ server, path: '/ws' });
  const rooms = new RoomServer(wss, services);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  cleanup.push(async () => { rooms.close(); await new Promise<void>(resolve => wss.close(() => resolve())); await new Promise<void>(resolve => server.close(() => resolve())); });
  const room = rooms.createRoom();
  async function connect(role: 'player' | 'screen' = 'player', resume?: string) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const messages: ServerMsg[] = [];
    socket.on('message', raw => messages.push(JSON.parse(raw.toString())));
    await once(socket, 'open');
    const send = (msg: ClientMsg) => socket.send(JSON.stringify(msg));
    send({ t: 'hello', room, role, name: 'Test', resume });
    const welcome = await until(() => messages.find(m => m.t === 'welcome'));
    return { socket, messages, welcome, send, lobby: () => messages.filter(m => m.t === 'lobby').at(-1)?.lobby };
  }
  return { connect, observed, counts };
}

describe('room protocol over real WebSockets', () => {
  it('reserves ownership for players, enforces owner/spectator rules and resumes kits', async () => {
    const { connect } = await setup();
    const screen = await connect('screen');
    expect(screen.welcome.lobby.ownerId).toBe('');
    const owner = await connect();
    const other = await connect();
    expect(owner.welcome.lobby.ownerId).toBe(owner.welcome.you);
    other.send({ t: 'setBoss', repo: 'test/boss' });
    await until(() => other.messages.find(m => m.t === 'error'));
    screen.send({ t: 'setRepo', repo: 'test/screen' });
    await until(() => screen.messages.find(m => m.t === 'error'));
    owner.send({ t: 'setRepo', repo: 'test/player' });
    await until(() => owner.lobby()?.players[0].status === 'ready');
    owner.socket.close(); await once(owner.socket, 'close');
    await until(() => other.lobby()?.ownerId === other.welcome.you);
    const resumed = await connect('player', owner.welcome.token);
    expect(resumed.welcome.you).toBe(owner.welcome.you);
    expect(resumed.welcome.lobby.players.find(p => p.id === resumed.welcome.you)?.kit?.repo).toBe('test/player');
    expect(resumed.welcome.lobby.ownerId).toBe(other.welcome.you);
  });

  it('starts with one ready player, lets screens watch, and resumes during a match', async () => {
    const { connect, counts } = await setup();
    const owner = await connect();
    await connect(); // Unconfigured clients do not prevent a ready squad from starting.
    owner.send({ t: 'setRepo', repo: 'test/player' });
    owner.send({ t: 'setBoss', repo: 'test/boss' });
    await until(() => owner.lobby()?.players[0].status === 'ready' && owner.lobby()?.boss.status === 'ready');
    owner.send({ t: 'start' });
    await until(() => owner.messages.find(m => m.t === 'snapshot'));
    expect(counts.at(-1)).toBe(1);
    const screen = await connect('screen');
    await until(() => screen.messages.find(m => m.t === 'snapshot'));
    owner.socket.close(); await once(owner.socket, 'close');
    const resumed = await connect('player', owner.welcome.token);
    const snapshot = await until(() => resumed.messages.find(m => m.t === 'snapshot'));
    expect(resumed.welcome.you).toBe(owner.welcome.you);
    expect(snapshot.state.players).toHaveLength(1);
    expect(snapshot.state.players[0].id).toBe(resumed.welcome.you);
    expect(snapshot.state.boss.kit.heart).toBe('src/real-heart.ts');
    expect(snapshot.state.boss.regions).toEqual([{ id: 'heart', x: 335, y: 144, r: 15 }]);
  });

  it('ignores superseded analyses and exposes analysis errors', async () => {
    const { connect } = await setup();
    const owner = await connect();
    owner.send({ t: 'setRepo', repo: 'slow/repo' });
    owner.send({ t: 'setRepo', repo: 'fast/repo' });
    await until(() => owner.lobby()?.players[0].status === 'ready');
    await wait(100);
    expect(owner.lobby()?.players[0].repo).toBe('fast/repo');
    owner.send({ t: 'setBoss', repo: 'bad/repo' });
    await until(() => owner.lobby()?.boss.status === 'error');
    expect(owner.lobby()?.boss.error).toBe('Unknown repo');
  });

  it('steps at 30Hz, snapshots at 20Hz without losing events, idles stale input, and sends autopsy/rematch', async () => {
    const { connect, observed, counts } = await setup(0.7);
    const owner = await connect();
    const other = await connect();
    for (const client of [owner, other]) client.send({ t: 'setRepo', repo: 'test/player' });
    owner.send({ t: 'setBoss', repo: 'test/boss' });
    await until(() => owner.lobby()?.players.every(p => p.status === 'ready') && owner.lobby()?.boss.status === 'ready');
    owner.send({ t: 'start' });
    await until(() => owner.messages.find(m => m.t === 'snapshot'));
    owner.send({ t: 'input', frame: { seq: 7, move: [1, 0], aim: null, fire: true, dash: true, skill: true, source: 'keyboard' } });
    const result = await until(() => owner.messages.find(m => m.t === 'autopsy'));
    expect(result.result.victory).toBe(true);
    expect(result.result.boss.heart).toBe('src/real-heart.ts');
    const snapshots = owner.messages.filter(m => m.t === 'snapshot');
    const hits = snapshots.flatMap(m => m.state.events).filter(e => e.type === 'hit');
    expect(hits.length).toBe(Math.round(result.result.duration * 30));
    expect(snapshots.length).toBeGreaterThanOrEqual(12);
    expect(snapshots.length).toBeLessThanOrEqual(18);
    expect(observed.filter(f => f.dash)).toHaveLength(1);
    expect(observed.filter(f => f.skill)).toHaveLength(1);
    expect(observed.at(-2)?.fire).toBe(false);
    expect(snapshots.some(m => m.ack === 7)).toBe(true);
    expect(counts.at(-1)).toBe(2);
    owner.send({ t: 'rematch' });
    await until(() => owner.lobby()?.phase === 'lobby');
    expect(owner.lobby()?.players.every(p => p.status === 'ready')).toBe(true);
  });
});

it('encodes an SVG QR with white quiet zone and no injected markup', () => {
  const svg = qrSvg('http://192.168.1.2:5173/r/ABCD?x=<script>');
  expect(svg).toContain('shape-rendering="crispEdges"');
  expect(svg).toContain('fill="#fff"');
  expect(svg).not.toContain('<script>');
  expect(svg).toMatch(/M4,4h1v1h-1z/);
});
