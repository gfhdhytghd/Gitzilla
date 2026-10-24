import http from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import type { Autopsy, BossDesign, BossKit, ClientMsg, InputFrame, MatchState, PlayerKit, RepoProfile, ServerMsg } from '../shared/types.ts';
import { RoomServer, type GameServices, type RoomServerOptions } from './rooms.ts';
import { qrSvg } from './qr.ts';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(fn: () => T | undefined | false): Promise<T> {
  for (let i = 0; i < 150; i++) { const value = fn(); if (value) return value; await wait(10); }
  throw new Error('Timed out waiting for network message');
}
const cleanup: (() => Promise<void>)[] = [];
const directories: string[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function persistenceFile() {
  const directory = mkdtempSync(join(tmpdir(), 'gitzilla-rooms-'));
  directories.push(directory);
  return join(directory, 'rooms.json');
}

async function setup(endAt = 999, overrides: Partial<GameServices> = {}, options: RoomServerOptions = {}, existingRoom?: string) {
  const recorded: Autopsy[] = [];
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
    playerKitFromProfile: p => ({ repo: p.slug, title: 'Seed hero', maxHp: 7, maxArmor: 4, maxEnergy: 180, speed: 70, damageMul: 1, seed: 12, weapon: 'blaster', skill: 'hotfix', palette: ['#111111', '#222222', '#333333', '#444444'] }),
    bossKitFromProfile: (p, count, design) => { counts.push(count); return { repo: p.slug, heart: p.heart, name: design?.name ?? 'Seed boss', maxHp: count * 100, design, attacks: [], limbs: [], theme: 'terminal', palette: [], speed: 10, enrageAt: 0.5, seed: 20 }; },
    recordMatch: result => { recorded.push(result); },
    createMatch: (players, boss) => {
      let t = 0;
      let events: MatchState['events'] = [];
      return {
        step: (dt, inputs) => { t += dt; observed.push(...inputs.values()); events.push({ type: 'hit', target: 'boss', amount: 1, x: 0, y: 0 }); },
        snapshot: () => ({ t, status: t >= endAt ? 'victory' : 'fighting', players: players.map(p => ({ ...p, x: 1, y: 1 })), boss: { kit: boss, regions: [{ id: 'heart', x: 335, y: 144, r: 15 }] }, bullets: [], hazards: [], minions: [], events: events.splice(0) }) as unknown as MatchState,
        get over() { return t >= endAt; },
        autopsy: () => ({ victory: true, duration: t, boss: { repo: boss.repo, limbs: [], heart: 'core' }, players: players.map(p => ({ id: p.id, name: p.name, repo: p.kit.repo, stats: { damage: 42, bestCombo: 1, limbsBroken: 0, revives: 0, killingBlow: false } })), mvp: players[0].id }) as Autopsy,
      };
    },
    ...overrides,
  };
  const server = http.createServer();
  const wss = new WebSocketServer({ server, path: '/ws' });
  const rooms = new RoomServer(wss, services, options);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  let closed = false;
  const close = async () => {
    if (closed) return; closed = true;
    rooms.close();
    await new Promise<void>(resolve => wss.close(() => resolve()));
    await new Promise<void>(resolve => server.close(() => resolve()));
  };
  cleanup.push(close);
  const room = existingRoom ?? rooms.createRoom();
  async function connect(role: 'player' | 'screen' = 'player', resume?: string, name = 'Test', cookie?: string, beforeWelcome?: ClientMsg) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: cookie ? { Cookie: cookie } : undefined });
    const messages: ServerMsg[] = [];
    socket.on('message', raw => messages.push(JSON.parse(raw.toString())));
    await once(socket, 'open');
    const send = (msg: ClientMsg) => socket.send(JSON.stringify(msg));
    send({ t: 'hello', room, role, name, resume });
    if (beforeWelcome) send(beforeWelcome);
    const welcome = await until(() => messages.find(m => m.t === 'welcome'));
    return { socket, messages, welcome, send, lobby: () => messages.filter(m => m.t === 'lobby').at(-1)?.lobby };
  }
  return { connect, observed, counts, recorded, close, room };
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
    const resumed = await connect('player', owner.welcome.token, 'Renamed');
    expect(resumed.welcome.lobby.players.find(p => p.id === resumed.welcome.you)?.name).toBe('Renamed');
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

  it('keeps seed kits ready, applies only cosmetic async updates, and preserves boss art when scaling', async () => {
    let finishHero!: (kit: PlayerKit) => void;
    let finishBoss!: (kit: BossKit) => void;
    const { connect } = await setup(999, {
      enhanceHeroKit: () => new Promise(resolve => { finishHero = resolve; }),
      enhanceBossKit: () => new Promise(resolve => { finishBoss = resolve; }),
    });
    const owner = await connect();
    owner.send({ t: 'setRepo', repo: 'test/player' });
    owner.send({ t: 'setBoss', repo: 'test/boss' });
    await until(() => owner.lobby()?.players[0].status === 'ready' && owner.lobby()?.boss.status === 'ready');
    const hero = owner.lobby()!.players[0].kit!;
    const boss = owner.lobby()!.boss.kit!;
    finishHero({ ...hero, title: 'AI hero', maxHp: 999 });
    finishBoss({ ...boss, name: 'AI boss', design: { name: 'AI boss' } as BossDesign, maxHp: 999 });
    await until(() => owner.lobby()?.boss.kit?.name === 'AI boss' && owner.lobby()?.players[0].kit?.title === 'AI hero');
    expect(owner.lobby()?.players[0].kit?.maxHp).toBe(7);
    expect(owner.lobby()?.boss.kit?.maxHp).toBe(100);
    owner.send({ t: 'start' });
    const snapshot = await until(() => owner.messages.find(m => m.t === 'snapshot'));
    expect(snapshot.state.boss.kit.name).toBe('AI boss');
    expect(snapshot.state.boss.kit.maxHp).toBe(100);
    expect(snapshot.state.players[0].kit.title).toBe('AI hero');
  });

  it('ignores stale cosmetic jobs and starts while current art is still pending', async () => {
    const jobs = new Map<string, { kit: PlayerKit; finish: (kit: PlayerKit) => void }>();
    const { connect } = await setup(999, {
      enhanceHeroKit: (profile, kit) => new Promise(resolve => { jobs.set(profile.slug, { kit, finish: resolve }); }),
    });
    const owner = await connect();
    owner.send({ t: 'setRepo', repo: 'old/hero' });
    await until(() => owner.lobby()?.players[0].status === 'ready');
    owner.send({ t: 'setRepo', repo: 'new/hero' });
    owner.send({ t: 'setBoss', repo: 'test/boss' });
    await until(() => owner.lobby()?.players[0].repo === 'new/hero' && owner.lobby()?.players[0].status === 'ready' && owner.lobby()?.boss.status === 'ready');
    const old = jobs.get('old/hero')!;
    old.finish({ ...old.kit, title: 'Outdated' });
    owner.send({ t: 'start' });
    const snapshot = await until(() => owner.messages.find(m => m.t === 'snapshot'));
    expect(snapshot.state.players[0].kit.repo).toBe('new/hero');
    expect(snapshot.state.players[0].kit.title).toBe('Seed hero');
  });

  it('lets only the owner add AI slots, drives bot inputs, and records completion exactly once', async () => {
    const { connect, observed, counts, recorded } = await setup(0.3, {
      createBot: () => () => ({ seq: 1000, move: [1, 0], aim: null, fire: true, dash: false, skill: false, source: 'keyboard' }),
    });
    const owner = await connect();
    const other = await connect();
    other.send({ t: 'setBots', count: 2 });
    await until(() => other.messages.find(m => m.t === 'error'));
    owner.send({ t: 'setBots', count: 2 });
    await until(() => owner.lobby()?.players.filter(p => p.bot && p.status === 'ready').length === 2);
    expect(owner.lobby()?.players).toHaveLength(4);
    expect(owner.lobby()?.ownerId).toBe(owner.welcome.you);
    expect(owner.lobby()?.players.filter(p => p.bot).every(p => p.name.startsWith('[BOT]'))).toBe(true);
    for (const c of [owner, other]) c.send({ t: 'setRepo', repo: 'test/human' });
    owner.send({ t: 'setBoss', repo: 'test/boss' });
    await until(() => owner.lobby()?.players.every(p => p.status === 'ready') && owner.lobby()?.boss.status === 'ready');
    owner.send({ t: 'start' });
    const snapshot = await until(() => owner.messages.find(m => m.t === 'snapshot'));
    expect(snapshot.state.players).toHaveLength(4);
    await until(() => owner.messages.find(m => m.t === 'autopsy'));
    expect(observed.some(f => f.seq === 1000 && f.fire)).toBe(true);
    expect(counts.at(-1)).toBe(4);
    expect(recorded).toHaveLength(1);
    const screen = await connect('screen');
    await until(() => screen.messages.find(m => m.t === 'autopsy'));
    expect(recorded).toHaveLength(1);
    owner.send({ t: 'rematch' });
    await until(() => owner.lobby()?.phase === 'lobby');
    owner.send({ t: 'setBots', count: 0 });
    await until(() => owner.lobby()?.players.length === 2);
  });

  it('keeps an eight-player cap and replaces a bot when a human joins', async () => {
    const { connect } = await setup();
    const owner = await connect();
    owner.send({ t: 'setBots', count: 7 });
    await until(() => owner.lobby()?.players.length === 8);
    const other = await connect();
    expect(other.welcome.lobby.players).toHaveLength(8);
    expect(other.welcome.lobby.players.filter(p => p.bot)).toHaveLength(6);
    expect(other.welcome.lobby.ownerId).toBe(owner.welcome.you);
  });

  it('defaults unnamed players to GitHub login and preserves explicit names across resume', async () => {
    const { connect } = await setup(999, {
      getSession: async req => { await wait(15); return req.headers.cookie === 'session=alice' ? { login: 'octocat' } : null; },
    });
    const github = await connect('player', undefined, '', 'session=alice', { t: 'setRepo', repo: 'public/queued' });
    await until(() => github.lobby()?.players[0].status === 'ready');
    expect(github.messages.some(m => m.t === 'error')).toBe(false);
    expect(github.welcome.lobby.players[0].name).toBe('octocat');
    const named = await connect('player', undefined, 'My Name', 'session=alice');
    expect(named.welcome.lobby.players.find(p => p.id === named.welcome.you)?.name).toBe('My Name');
    named.socket.close(); await once(named.socket, 'close');
    const resumed = await connect('player', named.welcome.token, '', 'session=alice');
    expect(resumed.welcome.lobby.players.find(p => p.id === resumed.welcome.you)?.name).toBe('My Name');
    const anonymous = await connect('player', undefined, '');
    expect(anonymous.welcome.lobby.players.find(p => p.id === anonymous.welcome.you)?.name).toBe('Player');
  });

  it('passes the upgrade-cookie token only to analysis and keeps private details out of designs, wire and Hall', async () => {
    const fixtureToken = 'mock-gh-token-not-a-real-credential';
    const secondToken = 'mock-second-gh-credential';
    const getGithubToken = vi.fn(async (req: http.IncomingMessage) => req.headers.cookie === 'session=alice' ? fixtureToken : req.headers.cookie === 'session=bob' ? secondToken : null);
    const analyzeRepo = vi.fn(async (repo: string, options?: { token?: string }) => {
      if (repo === 'acme/private') {
        expect(options).toEqual({ token: fixtureToken });
        return { slug: repo, heart: 'CONFIDENTIAL/internal/heart.ts', readme: 'CONFIDENTIAL README', tree: ['CONFIDENTIAL/internal/heart.ts'], description: 'CONFIDENTIAL description' } as RepoProfile;
      }
      return { slug: repo, heart: 'public/core.ts' } as RepoProfile;
    });
    const enhanceHeroKit = vi.fn(async (_profile: RepoProfile, kit: PlayerKit) => kit);
    const { connect, recorded } = await setup(0.3, { getGithubToken, analyzeRepo, enhanceHeroKit });
    const owner = await connect('player', undefined, 'Private Player', 'session=alice');
    owner.send({ t: 'setRepo', repo: 'acme/private' });
    owner.send({ t: 'setBoss', repo: 'public/boss' });
    await until(() => owner.lobby()?.players[0].status === 'ready' && owner.lobby()?.boss.status === 'ready');
    expect(analyzeRepo).toHaveBeenCalledWith('acme/private', { token: fixtureToken });
    expect(analyzeRepo).toHaveBeenCalledWith('public/boss');
    expect(getGithubToken).toHaveBeenCalledTimes(1);
    const peer = await connect('player', undefined, 'Other Player', 'session=bob');
    peer.send({ t: 'setRepo', repo: 'other/private' });
    await until(() => peer.lobby()?.players.find(p => p.id === peer.welcome.you)?.status === 'ready');
    expect(analyzeRepo).toHaveBeenCalledWith('other/private', { token: secondToken });
    expect(getGithubToken).toHaveBeenCalledTimes(2);
    expect(enhanceHeroKit).not.toHaveBeenCalled();
    owner.send({ t: 'start' });
    await until(() => owner.messages.find(m => m.t === 'autopsy'));
    expect(recorded).toHaveLength(0);
    const wire = JSON.stringify(owner.messages);
    expect(wire).toContain('acme/private');
    expect(wire).not.toContain(fixtureToken);
    expect(wire).not.toContain(secondToken);
    expect(wire).not.toContain('CONFIDENTIAL');
    const anonymous = await connect('screen');
    expect(JSON.stringify(anonymous.messages)).not.toContain(fixtureToken);
  });

  it('keeps anonymous public analysis and Hall recording working without a GitHub credential', async () => {
    const analyzeRepo = vi.fn(async (repo: string, options?: { token?: string }) => {
      expect(options).toBeUndefined();
      return { slug: repo, heart: 'public/core.ts' } as RepoProfile;
    });
    const { connect, recorded } = await setup(0.2, { analyzeRepo, getGithubToken: async () => null });
    const owner = await connect();
    owner.send({ t: 'setRepo', repo: 'public/hero' });
    owner.send({ t: 'setBoss', repo: 'public/boss' });
    await until(() => owner.lobby()?.players[0].status === 'ready' && owner.lobby()?.boss.status === 'ready');
    owner.send({ t: 'start' });
    await until(() => owner.messages.find(m => m.t === 'autopsy'));
    expect(analyzeRepo).toHaveBeenCalledWith('public/hero', undefined);
    expect(recorded).toHaveLength(1);
  });

  it('does not expose upstream auth or authenticated-analysis error details', async () => {
    const { connect } = await setup(999, { getGithubToken: async () => { throw new Error('UPSTREAM-CREDENTIAL-SENTINEL'); } });
    const owner = await connect();
    owner.send({ t: 'setRepo', repo: 'acme/private' });
    await until(() => owner.lobby()?.players[0].status === 'error');
    expect(owner.lobby()?.players[0].error).toContain('Reconnect GitHub');
    expect(JSON.stringify(owner.messages)).not.toContain('UPSTREAM-CREDENTIAL-SENTINEL');
    const next = await setup(999, {
      getGithubToken: async () => 'mock-private-token',
      analyzeRepo: async () => { throw new Error('PRIVATE-DETAIL-SENTINEL mock-private-token'); },
    });
    const second = await next.connect();
    second.send({ t: 'setRepo', repo: 'acme/private' });
    await until(() => second.lobby()?.players[0].status === 'error');
    expect(JSON.stringify(second.messages)).not.toContain('PRIVATE-DETAIL-SENTINEL');
    expect(JSON.stringify(second.messages)).not.toContain('mock-private-token');
  });

  it('recreates an unknown stale room code and gives ownership to its first player', async () => {
    const { connect } = await setup(999, {}, {}, 'LOST');
    const screen = await connect('screen');
    expect(screen.welcome.lobby.room).toBe('LOST');
    expect(screen.welcome.lobby.ownerId).toBe('');
    const owner = await connect();
    expect(owner.welcome.lobby.room).toBe('LOST');
    expect(owner.welcome.lobby.ownerId).toBe(owner.welcome.you);
    const peer = await connect();
    expect(peer.welcome.lobby.ownerId).toBe(owner.welcome.you);
    expect(owner.messages.some(m => m.t === 'error')).toBe(false);
  });

  it('persists debounced lobby edits and restores owner, resume tokens, kits, boss and AI slots', async () => {
    const file = persistenceFile();
    const first = await setup(999, {}, { persistenceFile: file, debounceMs: 15 });
    const owner = await first.connect('player', undefined, 'Owner');
    const peer = await first.connect('player', undefined, 'Peer');
    owner.send({ t: 'setRepo', repo: 'saved/owner' });
    peer.send({ t: 'setRepo', repo: 'saved/peer' });
    owner.send({ t: 'setBoss', repo: 'saved/boss' });
    owner.send({ t: 'setBots', count: 2 });
    await until(() => owner.lobby()?.players.length === 4 && owner.lobby()?.players.every(p => p.status === 'ready') && owner.lobby()?.boss.status === 'ready');
    await wait(40);
    const stored = JSON.parse(readFileSync(file, 'utf8'));
    expect(stored.rooms[0].ownerId).toBe(owner.welcome.you);
    expect(stored.rooms[0].players.find((p: { id: string }) => p.id === owner.welcome.you).token).toBe(owner.welcome.token);
    expect(stored.rooms[0].players).toHaveLength(4);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    await first.close();
    const second = await setup(999, {}, { persistenceFile: file }, first.room);
    const resumed = await second.connect('player', owner.welcome.token, '');
    expect(resumed.welcome.you).toBe(owner.welcome.you);
    expect(resumed.welcome.token).toBe(owner.welcome.token);
    expect(resumed.welcome.lobby.ownerId).toBe(owner.welcome.you);
    expect(resumed.welcome.lobby.players.find(p => p.id === owner.welcome.you)?.kit?.repo).toBe('saved/owner');
    expect(resumed.welcome.lobby.players.filter(p => p.bot)).toHaveLength(2);
    expect(resumed.welcome.lobby.boss.kit?.repo).toBe('saved/boss');
    const restoredPeer = await second.connect('player', peer.welcome.token, '');
    expect(restoredPeer.welcome.you).toBe(peer.welcome.you);
    expect(restoredPeer.welcome.lobby.players).toHaveLength(4);
    resumed.send({ t: 'start' });
    const snapshot = await until(() => resumed.messages.find(m => m.t === 'snapshot'));
    expect(snapshot.state.players).toHaveLength(4);
    expect(second.counts.at(-1)).toBe(4);
  });

  it('flushes on shutdown and restores interrupted matches as lobbies with a restart notice', async () => {
    const file = persistenceFile();
    const first = await setup(999, {}, { persistenceFile: file, debounceMs: 60_000 });
    const owner = await first.connect();
    owner.send({ t: 'setRepo', repo: 'saved/player' });
    owner.send({ t: 'setBoss', repo: 'saved/boss' });
    await until(() => owner.lobby()?.players[0].status === 'ready' && owner.lobby()?.boss.status === 'ready');
    owner.send({ t: 'start' });
    await until(() => owner.messages.find(m => m.t === 'snapshot'));
    expect(JSON.parse(readFileSync(file, 'utf8')).rooms[0].phase).toBe('match');
    await first.close();
    const second = await setup(999, {}, { persistenceFile: file }, first.room);
    const resumed = await second.connect('player', owner.welcome.token, '');
    expect(resumed.welcome.lobby.phase).toBe('lobby');
    expect(resumed.welcome.lobby.players[0].kit?.repo).toBe('saved/player');
    const notice = await until(() => resumed.messages.find(m => m.t === 'error'));
    expect(notice.message).toMatch(/server restarted/i);
    expect(resumed.messages.some(m => m.t === 'snapshot' || m.t === 'autopsy')).toBe(false);
    resumed.send({ t: 'start' });
    await until(() => resumed.messages.find(m => m.t === 'snapshot'));
  });

  it('retains privacy flags across restart without persisting a GitHub credential or private profile', async () => {
    const file = persistenceFile();
    const first = await setup(999, {
      getGithubToken: async () => 'mock-private-credential',
      analyzeRepo: async repo => ({ slug: repo, heart: repo === 'saved/private' ? 'CONFIDENTIAL/path.ts' : 'public/core', readme: repo === 'saved/private' ? 'CONFIDENTIAL README' : '' }) as RepoProfile,
    }, { persistenceFile: file });
    const owner = await first.connect();
    owner.send({ t: 'setRepo', repo: 'saved/private' });
    owner.send({ t: 'setBoss', repo: 'saved/boss' });
    await until(() => owner.lobby()?.players[0].status === 'ready' && owner.lobby()?.boss.status === 'ready');
    await first.close();
    const contents = readFileSync(file, 'utf8');
    expect(contents).not.toContain('mock-private-credential');
    expect(contents).not.toContain('CONFIDENTIAL');
    const second = await setup(0.2, {}, { persistenceFile: file }, first.room);
    const resumed = await second.connect('player', owner.welcome.token, '');
    resumed.send({ t: 'start' });
    await until(() => resumed.messages.find(m => m.t === 'autopsy'));
    expect(second.recorded).toHaveLength(0);
  });

  it('gives ownership to the first returning human when the saved owner is offline', async () => {
    const file = persistenceFile();
    const first = await setup(999, {}, { persistenceFile: file });
    await first.connect('player', undefined, 'Old owner');
    const peer = await first.connect('player', undefined, 'Returning player');
    await first.close();
    const second = await setup(999, {}, { persistenceFile: file }, first.room);
    const resumed = await second.connect('player', peer.welcome.token, '');
    expect(resumed.welcome.lobby.ownerId).toBe(peer.welcome.you);
    resumed.send({ t: 'setBoss', repo: 'saved/boss' });
    await until(() => resumed.lobby()?.boss.status === 'ready');
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
