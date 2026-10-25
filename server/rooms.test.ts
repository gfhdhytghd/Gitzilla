import http from 'node:http';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import type { Autopsy, BossDesign, BossKit, ClientMsg, GameMode, InputFrame, MatchState, PlayerKit, RepoProfile, ServerMsg } from '../shared/types.ts';
import { RoomServer, type GameServices, type RoomServerOptions } from './rooms.ts';
import { qrSvg } from './qr.ts';
import { buildGenesis } from '../genesis/index.ts';
import { offlineProfile } from '../analysis/index.ts';
import { replayProfileProgress } from '../analysis/progress.ts';
import { handleEduRoute, MAX_RUBRIC_BYTES } from './edu-http.ts';
import { buildFeedback, defaultRubric, parseRubric, scoreRepo } from '../rubric/index.ts';
import { playerKitFromProfile, bossKitFromProfile, createMatch, qualityFromRubric } from '../sim/index.ts';
import { createBot } from '../sim/bots.ts';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(fn: () => T | undefined | false, attempts = 150): Promise<T> {
  for (let i = 0; i < attempts; i++) { const value = fn(); if (value) return value; await wait(10); }
  throw new Error('Timed out waiting for network message');
}
const cleanup: (() => Promise<void>)[] = [];
const directories: string[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});
function persistenceFile() {
  const directory = mkdtempSync(join(tmpdir(), 'gitzilla-rooms-'));
  directories.push(directory);
  return join(directory, 'rooms.json');
}
function rubricPdf() {
  const content = 'BT /F1 12 Tf 40 200 Td (Testing: unit tests target 20%) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets: number[] = [];
  for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n` + offsets.map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  return Buffer.from(pdf + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

async function setup(endAt = 999, overrides: Partial<GameServices> = {}, options: RoomServerOptions = {}, existingRoom?: string, initialMode: GameMode = 'battle') {
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
    bossKitFromProfile: (p, count, design) => { counts.push(count); return { repo: p.slug, heart: p.heart, archetype: 'kaiju', name: design?.name ?? 'Seed boss', maxHp: count * 100, design, attacks: [], limbs: [], theme: 'terminal', palette: [], speed: 10, enrageAt: 0.5, seed: 20 }; },
    recordMatch: result => { recorded.push(result); },
    createMatch: (players, boss, options) => {
      const mode = options?.mode ?? 'battle';
      let t = 0;
      let events: MatchState['events'] = [];
      return {
        removePlayer: id => { const index = players.findIndex(p => p.id === id); if (index >= 0) players.splice(index, 1); },
        step: (dt, inputs) => { t += dt; observed.push(...inputs.values()); events.push({ type: 'hit', target: 'boss', amount: 1, x: 0, y: 0 }); },
        snapshot: () => ({ t, mode, heroScale: mode === 'edu' ? 2 : 1, pvp: mode === 'edu' ? { round: 1, rounds: 3, roundEndsAt: 75, scores: {}, quizScores: Object.fromEntries(players.map((p, i) => [p.id, i + 1])), leader: null } : null, status: t >= endAt ? 'victory' : 'fighting', players: players.map(p => ({ ...p, x: 1, y: 1 })), boss: boss ? { kit: boss, regions: [{ id: 'heart', x: 335, y: 144, r: 15 }] } : null, bullets: [], hazards: [], minions: [], events: events.splice(0) }) as unknown as MatchState,
        get over() { return t >= endAt; },
        autopsy: () => ({ mode, victory: mode === 'battle', duration: t, boss: boss ? { repo: boss.repo, limbs: [], heart: 'core' } : null,
          ranking: mode === 'edu' ? players.map(p => ({ id: p.id, name: p.name, repo: p.kit.repo, kos: 1, damage: 42, roundWins: 1, quality: p.kit.quality ?? [] })) : undefined, players: players.map(p => ({ id: p.id, name: p.name, repo: p.kit.repo, stats: { damage: 42, bestCombo: 1, limbsBroken: 0, revives: 0, killingBlow: false } })), mvp: players[0]?.id ?? null }) as Autopsy,
      };
    },
    ...overrides,
  };
  const server = http.createServer((req, res) => {
    void handleEduRoute(req, res, new URL(req.url!, 'http://localhost'), rooms).then(handled => {
      if (!handled) { res.writeHead(404); res.end(); }
    });
  });
  const wss = new WebSocketServer({ server, path: '/ws' });
  const rooms = new RoomServer(wss, services, { allowLegacyEdu: true, ...options });
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
  const room = existingRoom ?? rooms.createRoom(undefined, initialMode);
  async function connect(role: 'player' | 'screen' = 'player', resume?: string, name = 'Test', cookie?: string, beforeWelcome?: ClientMsg, userAgent?: string) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { ...(cookie ? { Cookie: cookie } : {}), ...(userAgent ? { 'User-Agent': userAgent } : {}) } });
    const messages: ServerMsg[] = [];
    socket.on('message', raw => messages.push(JSON.parse(raw.toString())));
    await once(socket, 'open');
    const send = (msg: ClientMsg) => socket.send(JSON.stringify(msg));
    send({ t: 'hello', room, role, name, resume });
    if (beforeWelcome) send(beforeWelcome);
    const welcome = await until(() => messages.find(m => m.t === 'welcome'));
    return { socket, messages, welcome, send, lobby: () => messages.filter(m => m.t === 'lobby').at(-1)?.lobby };
  }
  return { connect, observed, counts, recorded, close, room, services, rooms, wsUrl: `ws://127.0.0.1:${port}/ws`, base: `http://127.0.0.1:${port}` };
}

const genesisServices: Partial<GameServices> = {
  analyzeRepo: async slug => offlineProfile(slug),
  listFallbackRepos: () => ['pallets/flask'], botProfile: offlineProfile,
  playerKitFromProfile, bossKitFromProfile, buildGenesis,
};
const rubricServices: Partial<GameServices> = { ...genesisServices, defaultRubric, parseRubric, scoreRepo,
  feedbackForPlayer: (profile, rubric, stats) => buildFeedback(profile, rubric, scoreRepo(profile, rubric), stats, stats.quiz),
  applyRubric: (profile, kit, rubric) => qualityFromRubric(kit, { rubric, results: scoreRepo(profile, rubric) }) };

describe('room protocol over real WebSockets', () => {
  it('pauses a staged classroom raid, resumes after 3s and recovers from teacher absence at 60s', async () => {
    let now = 1_800_000_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now);
    const { defaultClassroomPlan } = await import('../shared/classroom-defaults');
    const { profileFromFiles } = await import('../analysis/graph');
    const files = [{ path: 'README.md', text: '# Example' }, { path: 'src/main.ts', text: 'export const answer=42' }];
    const f = await setup(999, { analyzeClassroomSubmission: async repo => ({ profile: profileFromFiles(repo, files), files, commit: 'a'.repeat(40), checks: [] }) }, { allowLegacyEdu: false }, undefined, 'edu');
    const teacher = await f.connect('screen'), student = await f.connect();
    const latest = (client: typeof teacher) => client.messages.filter(m => m.t === 'classroom').at(-1);
    const pause = (client: typeof teacher) => latest(client)?.state.paused;
    const plan = defaultClassroomPlan(); plan.steps[0].checksWeight = 100;
    plan.steps[0].checks = [{ id: 'docs', kind: 'file', path: 'README.md', label: 'README' }];
    teacher.send({ t: 'classroomPlan', plan }); await until(() => latest(teacher));
    teacher.send({ t: 'classroomControl', action: 'start' }); await until(() => latest(teacher)?.state.phase === 'coding');
    teacher.send({ t: 'pause', paused: true }); await until(() => teacher.messages.find(m => m.t === 'error'));
    student.send({ t: 'classroomSubmit', repo: 'demo/repo' }); await until(() => latest(teacher)?.state.rows[0].status === 'submitted');
    teacher.send({ t: 'classroomControl', action: 'attack' }); await until(() => latest(teacher)?.state.phase === 'raid');
    teacher.send({ t: 'pause', paused: true }); await until(() => pause(student));
    expect(pause(student)).toEqual({ by: teacher.welcome.you, since: now, resumeAt: null });
    const frozen = latest(student)!.state, remaining = frozen.raidEndsAt! - frozen.serverTime;
    student.send({ t: 'pause', paused: false }); await until(() => student.messages.find(m => m.t === 'error'));
    now += 20000; await wait(240);
    expect(latest(student)?.state.phase).toBe('raid'); expect(latest(student)?.state.serverTime).toBe(frozen.serverTime);
    expect(latest(student)?.state.raidEndsAt).toBe(frozen.raidEndsAt);
    teacher.send({ t: 'pause', paused: false }); await until(() => pause(student)?.resumeAt === now + 3000);
    now += 2999; await wait(240); expect(latest(student)?.state.serverTime).toBe(frozen.serverTime);
    now += 1; await until(() => pause(student) === null);
    expect(latest(student)!.state.raidEndsAt! - latest(student)!.state.serverTime).toBe(remaining);
    teacher.send({ t: 'pause', paused: true }); await until(() => pause(student)?.resumeAt === null);
    teacher.socket.close(); await once(teacher.socket, 'close'); const absentAt = now;
    now = absentAt + 57000; await until(() => pause(student)?.resumeAt === absentAt + 60000);
    now = absentAt + 59999; await wait(240); expect(latest(student)?.state.phase).toBe('raid');
    now = absentAt + 60000; await until(() => pause(student) === null);
    expect(latest(student)!.state.raidEndsAt! - latest(student)!.state.serverTime).toBe(remaining);
    now += remaining - 1; await wait(240); expect(latest(student)?.state.phase).toBe('raid');
    now += 1; await until(() => latest(student)?.state.phase === 'feedback');
    expect(latest(student)?.state.rounds).toHaveLength(1);
    const returning = await f.connect('screen', teacher.welcome.token);
    returning.send({ t: 'classroomControl', action: 'retry' }); await until(() => latest(student)?.state.phase === 'coding');
    student.send({ t: 'classroomSubmit', repo: 'demo/repo' }); await until(() => latest(student)?.state.rows[0].status === 'submitted');
    returning.send({ t: 'classroomControl', action: 'attack' }); await until(() => latest(student)?.state.phase === 'raid');
    returning.send({ t: 'pause', paused: true }); await until(() => pause(student));
    const left = once(returning.socket, 'close'); returning.send({ t: 'leave' }); await left;
    await until(() => latest(student)?.state.phase === 'complete'); expect(pause(student)).toBeNull();
  });

  it('does not persist a combat pause or carry it into the restored match', async () => {
    const file = persistenceFile(), first = await setup(999, {}, { persistenceFile: file });
    const owner = await first.connect();
    owner.send({ t: 'setRepo', repo: 'test/owner' }); owner.send({ t: 'setBoss', repo: 'test/boss' });
    await until(() => owner.lobby()?.players[0].status === 'ready' && owner.lobby()?.boss.status === 'ready');
    owner.send({ t: 'start' }); await until(() => owner.messages.find(m => m.t === 'snapshot'));
    owner.send({ t: 'pause', paused: true }); await until(() => owner.messages.filter(m => m.t === 'snapshot').at(-1)?.state.paused);
    await first.close(); expect(readFileSync(file, 'utf8')).not.toContain('resumeAt');
    const second = await setup(0.1, {}, { persistenceFile: file }, first.room), resumed = await second.connect('player', owner.welcome.token);
    expect(resumed.welcome.lobby.phase).toBe('lobby'); resumed.send({ t: 'start' });
    const snapshot = await until(() => resumed.messages.find(m => m.t === 'snapshot'));
    expect(snapshot.state.paused).toBeNull();
    await until(() => resumed.messages.find(m => m.t === 'autopsy'));
  });

  it.each(['battle', 'pvp', 'edu'] as const)('host pause freezes the real %s sim and drops held/paused inputs through the resume countdown', async mode => {
    let now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const step = vi.fn<ReturnType<GameServices['createMatch']>['step']>();
    let match!: ReturnType<GameServices['createMatch']>;
    const f = await setup(999, { ...genesisServices,
      getGithubToken: async req => req.headers.cookie ?? null,
      verifyPvpAccess: async (repo, token) => ({ repo, userId: token === 'alice' ? 1 : 2, login: token, private: false }),
      createMatch: (players, boss, options) => {
        match = createMatch(players, boss, options);
        for (let i = 0; i < 90; i++) match.step(1 / 30, new Map()); // Enter actual combat before testing cooldown/round clocks.
        step.mockImplementation((dt, inputs) => match.step(dt, inputs));
        return { step, snapshot: () => match.snapshot(), autopsy: () => match.autopsy(), removePlayer: id => match.removePlayer?.(id), get over() { return match.over; } };
      },
    }, {}, undefined, mode);
    const player = await f.connect('player', undefined, 'Host', 'alice'), peer = await f.connect('player', undefined, 'Peer', 'bob');
    const owner = mode === 'edu' ? await f.connect('screen') : player;
    player.send({ t: 'setRepo', repo: 'pallets/flask' }); peer.send({ t: 'setRepo', repo: 'fastapi/fastapi' });
    if (mode === 'battle') owner.send({ t: 'setBoss', repo: 'pallets/flask' });
    await until(() => owner.lobby()?.players.every(p => p.status === 'ready') && (mode !== 'battle' || owner.lobby()?.boss.status === 'ready'));
    owner.send({ t: 'start' }); await until(() => owner.messages.find(m => m.t === 'snapshot'));
    player.send({ t: 'input', frame: { seq: 7, move: [1, 0], aim: null, fire: true, dash: true, skill: true, source: 'keyboard' } });
    await until(() => step.mock.calls.some(call => call[1].get(player.welcome.you)?.fire));
    owner.send({ t: 'pause', paused: true });
    const paused = await until(() => owner.messages.filter(m => m.t === 'snapshot').at(-1)?.state.paused);
    expect(paused).toEqual({ by: owner.welcome.you, since: now, resumeAt: null });
    const before = match.snapshot(), calls = step.mock.calls.length, snapshots = peer.messages.filter(m => m.t === 'snapshot').length;
    player.send({ t: 'input', frame: { seq: 99, move: [-1, 0], aim: [1, 0], fire: true, dash: true, skill: true, source: 'keyboard' } });
    await wait(140);
    expect(step).toHaveBeenCalledTimes(calls); expect(match.snapshot()).toEqual(before);
    expect(peer.messages.filter(m => m.t === 'snapshot').length).toBeGreaterThan(snapshots + 1);
    const screen = await f.connect('screen');
    expect((await until(() => screen.messages.find(m => m.t === 'snapshot'))).state.paused).toEqual(paused);
    peer.send({ t: 'pause', paused: false }); await until(() => peer.messages.find(m => m.t === 'error'));
    expect(peer.messages.filter(m => m.t === 'error').at(-1)?.message).toContain('Only the room owner');
    owner.send({ t: 'pause', paused: false });
    await until(() => owner.messages.filter(m => m.t === 'snapshot').at(-1)?.state.paused?.resumeAt === now + 3000);
    const resumeAt = now + 3000;
    now += 1000; owner.send({ t: 'pause', paused: false }); await wait(40);
    expect(owner.messages.filter(m => m.t === 'snapshot').at(-1)?.state.paused?.resumeAt).toBe(resumeAt);
    now = resumeAt - 1; await wait(80); expect(step).toHaveBeenCalledTimes(calls); expect(match.snapshot()).toEqual(before);
    now = resumeAt; await until(() => step.mock.calls.length > calls);
    const firstInput = step.mock.calls[calls][1].get(player.welcome.you)!;
    expect(firstInput).toMatchObject({ seq: 7, move: [0, 0], aim: null, fire: false, dash: false, skill: false });
    await until(() => owner.messages.filter(m => m.t === 'snapshot').at(-1)?.state.paused === null);
    expect(match.snapshot().t - before.t).toBeLessThan(1); // No wall-time catch-up.
  });

  it('schedules resume on paused owner transfer and lets the new owner cancel/re-pause', async () => {
    let now = 1_800_000_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now);
    const f = await setup(), owner = await f.connect(), peer = await f.connect();
    owner.send({ t: 'setRepo', repo: 'test/owner' }); owner.send({ t: 'setBoss', repo: 'test/boss' }); peer.send({ t: 'setRepo', repo: 'test/peer' });
    await until(() => owner.lobby()?.players.every(p => p.status === 'ready') && owner.lobby()?.boss.status === 'ready');
    owner.send({ t: 'start' }); await until(() => owner.messages.find(m => m.t === 'snapshot'));
    owner.send({ t: 'pause', paused: true }); await until(() => peer.messages.filter(m => m.t === 'snapshot').at(-1)?.state.paused);
    const t = peer.messages.filter(m => m.t === 'snapshot').at(-1)!.state.t;
    owner.socket.close(); await once(owner.socket, 'close');
    await until(() => peer.lobby()?.ownerId === peer.welcome.you && peer.messages.filter(m => m.t === 'snapshot').at(-1)?.state.paused?.resumeAt === now + 3000);
    peer.send({ t: 'pause', paused: true }); await until(() => peer.messages.filter(m => m.t === 'snapshot').at(-1)?.state.paused?.by === peer.welcome.you);
    now += 5000; await wait(80);
    expect(peer.messages.filter(m => m.t === 'snapshot').at(-1)?.state.paused?.resumeAt).toBeNull();
    expect(peer.messages.filter(m => m.t === 'snapshot').at(-1)?.state.t).toBe(t);
    peer.send({ t: 'pause', paused: false }); await until(() => peer.messages.filter(m => m.t === 'snapshot').at(-1)?.state.paused?.resumeAt === now + 3000);
    now += 3000; await until(() => peer.messages.filter(m => m.t === 'snapshot').at(-1)?.state.t! > t);
  });

  it.each([false, true])('handles paused owner absence with a 60s bound (owner returns: %s)', async returns => {
    let now = 1_800_000_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now);
    const f = await setup(), owner = await f.connect(), screen = await f.connect('screen');
    owner.send({ t: 'setRepo', repo: 'test/owner' }); owner.send({ t: 'setBoss', repo: 'test/boss' });
    await until(() => owner.lobby()?.players[0].status === 'ready' && owner.lobby()?.boss.status === 'ready');
    owner.send({ t: 'start' }); await until(() => owner.messages.find(m => m.t === 'snapshot'));
    owner.send({ t: 'pause', paused: true }); await until(() => screen.messages.filter(m => m.t === 'snapshot').at(-1)?.state.paused);
    const frozen = screen.messages.filter(m => m.t === 'snapshot').at(-1)!.state.t;
    owner.socket.close(); await once(owner.socket, 'close'); await until(() => screen.lobby()?.ownerId === '');
    const disconnectedAt = now;
    if (returns) {
      now += 10000; const resumed = await f.connect('player', owner.welcome.token);
      expect((await until(() => resumed.messages.find(m => m.t === 'snapshot'))).state.paused?.resumeAt).toBeNull();
      now = disconnectedAt + 70000; await wait(100);
      expect(screen.messages.filter(m => m.t === 'snapshot').at(-1)?.state.t).toBe(frozen);
      resumed.send({ t: 'pause', paused: false }); await until(() => resumed.messages.filter(m => m.t === 'snapshot').at(-1)?.state.paused?.resumeAt === now + 3000);
      now += 3000;
    } else {
      now = disconnectedAt + 56999; await wait(80); expect(screen.messages.filter(m => m.t === 'snapshot').at(-1)?.state.paused?.resumeAt).toBeNull();
      now = disconnectedAt + 57000; await until(() => screen.messages.filter(m => m.t === 'snapshot').at(-1)?.state.paused?.resumeAt === disconnectedAt + 60000);
      now = disconnectedAt + 59999; await wait(80); expect(screen.messages.filter(m => m.t === 'snapshot').at(-1)?.state.t).toBe(frozen);
      now = disconnectedAt + 60000;
    }
    await until(() => screen.messages.filter(m => m.t === 'snapshot').at(-1)?.state.paused === null && screen.messages.filter(m => m.t === 'snapshot').at(-1)!.state.t > frozen);
  });

  it('rejects pause outside combat and rejects malformed pause booleans', async () => {
    const f = await setup(), owner = await f.connect(), peer = await f.connect();
    peer.send({ t: 'pause', paused: true }); owner.send({ t: 'pause', paused: true });
    await until(() => peer.messages.find(m => m.t === 'error')); await until(() => owner.messages.find(m => m.t === 'error'));
    expect(peer.messages.filter(m => m.t === 'error').at(-1)?.message).toContain('owner');
    expect(owner.messages.filter(m => m.t === 'error').at(-1)?.message).toContain('during a match');
    owner.socket.send(JSON.stringify({ t: 'pause', paused: 'false' }));
    await until(() => owner.messages.filter(m => m.t === 'error').length === 2);
    expect(owner.messages.filter(m => m.t === 'error').at(-1)?.message).toContain('Choose pause');
  });

  it('previews exact current scores, reuses unchanged evidence and invalidates on rubric/repo/mode changes', async () => {
    const score = vi.fn(scoreRepo);
    const test = await setup(999, { ...rubricServices, scoreRepo: score,
      analyzeRepo: async slug => { if (slug === 'fastapi/fastapi') await wait(80); return offlineProfile(slug); },
    }, {}, undefined, 'edu');
    const teacher = await test.connect('screen'), student = await test.connect();
    expect(student.welcome.lobby.players[0].rubricPreview).toBeUndefined();
    student.send({ t: 'setRepo', repo: 'pallets/flask' }); teacher.send({ t: 'setBots', count: 1 });
    await until(() => teacher.lobby()?.players.length === 2 && teacher.lobby()?.players.every(p => p.status === 'ready' && p.rubricPreview));
    for (const card of teacher.lobby()!.players) expect(card.rubricPreview).toEqual(scoreRepo(offlineProfile(card.repo!), teacher.lobby()!.rubric!));
    const calls = score.mock.calls.length;
    student.send({ t: 'controls', ready: true, mode: 'tap-only' }); await wait(30);
    expect(score).toHaveBeenCalledTimes(calls);
    const custom = parseRubric('# New class targets\nTesting (60%): tests target 60%\nCI (40%): CI pipeline');
    teacher.send({ t: 'setRubric', rubric: custom });
    await until(() => teacher.lobby()?.rubric?.title === custom.title);
    expect(score).toHaveBeenCalledTimes(calls + 2);
    expect(teacher.lobby()?.players[0].rubricPreview).toEqual(scoreRepo(offlineProfile('pallets/flask'), teacher.lobby()!.rubric!));
    student.send({ t: 'setRepo', repo: 'fastapi/fastapi' });
    await until(() => student.lobby()?.players.find(p => p.id === student.welcome.you)?.status === 'analyzing');
    expect(student.lobby()?.players.find(p => p.id === student.welcome.you)?.rubricPreview).toBeUndefined();
    await until(() => student.lobby()?.players.find(p => p.id === student.welcome.you)?.status === 'ready');
    expect(score).toHaveBeenCalledTimes(calls + 3);
    expect(student.lobby()?.players.find(p => p.id === student.welcome.you)?.rubricPreview).toEqual(scoreRepo(offlineProfile('fastapi/fastapi'), student.lobby()!.rubric!));
    teacher.send({ t: 'setMode', mode: 'battle' }); await until(() => teacher.lobby()?.mode === 'battle');
    expect(teacher.lobby()?.players.every(p => p.rubricPreview === undefined)).toBe(true);
    teacher.send({ t: 'setMode', mode: 'edu' }); await until(() => teacher.lobby()?.mode === 'edu' && teacher.lobby()?.players.every(p => p.status === 'ready'));
    expect(teacher.lobby()?.players[0].rubricPreview).toEqual(scoreRepo(offlineProfile('fastapi/fastapi'), teacher.lobby()!.rubric!));
  });

  it('keeps private preview evidence in its room, never broadcasts a raw profile, and rehydrates after restart', async () => {
    const file = persistenceFile(), privatePath = 'PRIVATE-PREVIEW-EVIDENCE/internal.py', raw = 'RAW-PROFILE-MUST-NEVER-REACH-THE-WIRE';
    const privateProfile = { ...offlineProfile('pallets/flask'), slug: 'alice/private', heart: privatePath, rawPrivateBody: raw };
    const services = { ...rubricServices, analyzeRepo: async () => structuredClone(privateProfile), getGithubToken: async () => 'mock-private-preview-token' };
    const first = await setup(999, services, { persistenceFile: file }, undefined, 'edu');
    const teacher = await first.connect('screen'), student = await first.connect();
    student.send({ t: 'setRepo', repo: privateProfile.slug });
    await until(() => student.lobby()?.players[0].rubricPreview);
    expect(student.lobby()?.players[0].rubricPreview).toEqual(scoreRepo(privateProfile, student.lobby()!.rubric!));
    expect(JSON.stringify(teacher.lobby()?.players[0].rubricPreview)).toContain(privatePath);
    expect(JSON.stringify([...teacher.messages, ...student.messages])).not.toContain(raw);
    expect(JSON.stringify([...teacher.messages, ...student.messages])).not.toContain('mock-private-preview-token');
    const other = await setup(999, rubricServices, {}, undefined, 'edu'), outsider = await other.connect();
    outsider.send({ t: 'setRepo', repo: 'pallets/flask' }); await until(() => outsider.lobby()?.players[0].rubricPreview);
    expect(JSON.stringify(outsider.messages)).not.toContain(privatePath); expect(JSON.stringify(outsider.messages)).not.toContain(raw);
    await first.close(); const saved = readFileSync(file, 'utf8');
    expect(saved).not.toContain('rubricPreview'); expect(saved).not.toContain(privatePath); expect(saved).not.toContain(raw);
    const restarted = await setup(999, services, { persistenceFile: file }, first.room);
    await restarted.connect('screen', teacher.welcome.token);
    const resumed = await restarted.connect('player', student.welcome.token);
    expect(resumed.welcome.lobby.players[0].rubricPreview).toBeUndefined();
    await until(() => resumed.lobby()?.players[0].rubricPreview);
    expect(resumed.lobby()?.players[0].rubricPreview).toEqual(scoreRepo(privateProfile, resumed.lobby()!.rubric!));
  });

  it('finishes an accelerated real classroom match with the teacher rubric and private feedback delivery', async () => {
    const factory = vi.fn<GameServices['createMatch']>((players, boss, options) => {
      const real = createMatch(players, boss, options);
      return { removePlayer: id => real.removePlayer(id), snapshot: () => real.snapshot(), autopsy: () => real.autopsy(), get over() { return real.over; },
        step: (dt, inputs) => {
          const held = new Map([...inputs].map(([id, input]) => [id, { ...input, dash: false, skill: false }]));
          for (let i = 0; i < 90 && !real.over; i++) real.step(dt, i ? held : inputs);
        } };
    });
    const test = await setup(999, { ...rubricServices, createBot, createMatch: factory }, {}, undefined, 'edu');
    const teacher = await test.connect('screen'), alice = await test.connect('player', undefined, 'Alice'), bob = await test.connect('player', undefined, 'Bob');
    const rubric = parseRubric('# CS project\nTesting (70%): tests target 20%\nDocumentation (30%): README');
    teacher.send({ t: 'setRubric', rubric });
    alice.send({ t: 'setRepo', repo: 'pallets/flask' }); bob.send({ t: 'setRepo', repo: 'fastapi/fastapi' }); teacher.send({ t: 'setBots', count: 1 });
    await until(() => teacher.lobby()?.players.length === 3 && teacher.lobby()?.players.every(p => p.status === 'ready'));
    const before = alice.lobby()!.players.find(p => p.id === alice.welcome.you)!.kit!;
    const expected = qualityFromRubric(before, { rubric, results: scoreRepo(offlineProfile('pallets/flask'), rubric) });
    teacher.send({ t: 'start' }); await until(() => factory.mock.calls.length === 1);
    expect(factory.mock.calls[0][0].find(p => p.id === alice.welcome.you)?.kit.quality).toEqual(expected.quality);
    const messages = await until(() => teacher.messages.find(m => m.t === 'feedback'), 1500);
    expect(messages.items).toHaveLength(2);
    const ending = teacher.messages.find(m => m.t === 'autopsy')!;
    expect(ending.result.mode).toBe('edu'); expect(ending.result.boss).toBeNull(); expect(ending.result.duration).toBeGreaterThan(75);
    const personal = await until(() => alice.messages.find(m => m.t === 'feedback'));
    expect(personal.items.map(f => f.playerId)).toEqual([alice.welcome.you]);
    const rank = ending.result.ranking!.findIndex(p => p.id === alice.welcome.you);
    expect(personal.items[0].match).toMatchObject({ rank: rank + 1, kos: ending.result.ranking![rank].kos, damage: ending.result.ranking![rank].damage, roundWins: ending.result.ranking![rank].roundWins });
    expect(personal.items[0].results).toEqual(scoreRepo(offlineProfile('pallets/flask'), rubric));
    const download = await fetch(test.base + '/api/room/' + test.room + '/feedback.md', { headers: { Authorization: `Bearer ${teacher.welcome.token}` } });
    expect(download.status).toBe(200); expect(await download.text()).toContain('CS project'); expect(test.recorded).toHaveLength(0);
  }, 20_000);

  it('previews teacher uploads, applies normalized criteria, and persists the rubric across restart', async () => {
    const file = persistenceFile();
    const first = await setup(999, rubricServices, { persistenceFile: file }, undefined, 'edu');
    const teacher = await first.connect('screen'), student = await first.connect();
    expect(teacher.welcome.lobby.rubric?.source).toBe('default');
    const url = first.base + '/api/rubric/parse?room=' + first.room;
    const text = '# Intro class\n- Testing (70%): tests target 20%\n- Documentation (30%): README\n';
    expect((await fetch(url, { method: 'POST', body: text })).status).toBe(401);
    expect((await fetch(url, { method: 'POST', body: text, headers: { 'X-Room-Token': student.welcome.token } })).status).toBe(403);
    const headers = { 'X-Room-Token': teacher.welcome.token, 'Content-Type': 'text/markdown' };
    const preview = await fetch(url + '&filename=class.md', { method: 'POST', headers, body: text });
    expect(preview.status).toBe(200);
    const rubric = await preview.json() as ReturnType<typeof defaultRubric>;
    expect((await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${teacher.welcome.token}` }, body: text })).status).toBe(200);
    expect(rubric.title).toBe('Intro class'); expect(rubric.criteria).toHaveLength(2);
    expect(teacher.lobby()?.rubric?.source).toBe('default'); // Preview has not applied anything.
    student.send({ t: 'setRubric', rubric }); await until(() => student.messages.find(m => m.t === 'error'));
    teacher.send({ t: 'setRubric', rubric: { ...rubric, criteria: rubric.criteria.map((c, i) => ({ ...c, weight: i ? 30 : 70 })) } });
    await until(() => student.lobby()?.rubric?.title === 'Intro class');
    expect(student.lobby()?.rubric?.criteria.map(c => c.weight)).toEqual([0.7, 0.3]);
    teacher.send({ t: 'setRubric', rubric: { ...rubric, criteria: rubric.criteria.map(c => ({ ...c, weight: 0 })) } });
    await until(() => teacher.messages.find(m => m.t === 'error'));
    expect(teacher.lobby()?.rubric?.criteria.map(c => c.weight)).toEqual([0.7, 0.3]);
    await first.close();
    const second = await setup(999, rubricServices, { persistenceFile: file }, first.room);
    const resumed = await second.connect('screen', teacher.welcome.token);
    expect(resumed.welcome.lobby.rubric).toEqual(student.lobby()?.rubric);
    expect(second.rooms.eduOwnerError(first.room, teacher.welcome.token, true)).toBeUndefined();
  });

  it('caps rubric uploads by actual bytes and retains unparsed previews without leaking documents publicly', async () => {
    const test = await setup(999, rubricServices, {}, undefined, 'edu'), teacher = await test.connect('screen');
    const url = test.base + '/api/rubric/parse?room=' + test.room;
    const headers = { 'X-Room-Token': teacher.welcome.token, 'Content-Type': 'application/json' };
    const json = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ text: '# Unknown checks\nMake it delightful and poetic', filename: 'class.md' }) });
    expect(json.status).toBe(200); expect((await json.json() as { unparsed: string[] }).unparsed.length).toBeGreaterThan(0);
    const exact = 'Testing: unit tests\n' + ' '.repeat(MAX_RUBRIC_BYTES - Buffer.byteLength('Testing: unit tests\n'));
    expect((await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: exact })).status).toBe(200);
    expect((await fetch(url, { method: 'POST', headers, body: 'x'.repeat(MAX_RUBRIC_BYTES + 1) })).status).toBe(413);
    const chunked = await new Promise<number>(resolve => {
      const req = http.request(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' } }, res => { res.resume(); resolve(res.statusCode!); });
      for (let i = 0; i < 20; i++) req.write('⚡'.repeat(20_000)); req.end();
    });
    expect(chunked).toBe(413);
    expect((await fetch(url, { method: 'POST', headers, body: '{broken' })).status).toBe(400);
    expect((await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: 'not a doc' })).status).toBe(415);
    expect((await fetch(url + '&filename=bad.pdf', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/pdf' }, body: '%PDF-invalid' })).status).toBe(422);
    const pdf = await fetch(url + '&filename=assignment.pdf', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/pdf' }, body: rubricPdf() });
    if (!spawnSync('pdftotext', ['-v']).error) {
      expect(pdf.status).toBe(200); expect((await pdf.json() as ReturnType<typeof defaultRubric>).criteria[0]).toMatchObject({ signal: 'tests', target: 0.2 });
    } else expect(pdf.status).toBe(422);
    expect((await fetch(test.base + '/api/room/' + test.room + '/feedback.csv', { headers })).status).toBe(404);
    teacher.send({ t: 'setMode', mode: 'battle' }); await until(() => teacher.lobby()?.mode === 'battle');
    expect((await fetch(url, { method: 'POST', headers, body: '{"text":"tests"}' })).status).toBe(409);
    teacher.send({ t: 'setRubric', rubric: defaultRubric() }); await until(() => teacher.messages.find(m => m.t === 'error'));
  });

  it('delivers real feedback only to each student and all to teacher/screens; exports require the current owner', async () => {
    const file = persistenceFile();
    const test = await setup(0.2, rubricServices, { persistenceFile: file }, undefined, 'edu');
    const teacher = await test.connect('screen'), alice = await test.connect('player', undefined, '=Alice'), bob = await test.connect('player', undefined, 'Bob');
    alice.send({ t: 'setRepo', repo: 'pallets/flask' }); bob.send({ t: 'setRepo', repo: 'fastapi/fastapi' }); teacher.send({ t: 'setBots', count: 1 });
    await until(() => teacher.lobby()?.players.length === 3 && teacher.lobby()?.players.every(p => p.status === 'ready'));
    teacher.send({ t: 'start' });
    teacher.send({ t: 'setRubric', rubric: defaultRubric() }); await until(() => teacher.messages.find(m => m.t === 'error'));
    const all = await until(() => teacher.messages.find(m => m.t === 'feedback'));
    const mine = await until(() => alice.messages.find(m => m.t === 'feedback'));
    const theirs = await until(() => bob.messages.find(m => m.t === 'feedback'));
    expect(all.items).toHaveLength(2); expect(mine.items.map(f => f.playerId)).toEqual([alice.welcome.you]);
    expect(theirs.items.map(f => f.playerId)).toEqual([bob.welcome.you]); expect(all.items.some(f => f.playerId.startsWith('bot-'))).toBe(false);
    const row = mine.items[0];
    expect(row.results).toEqual(scoreRepo(offlineProfile('pallets/flask'), defaultRubric()));
    expect(row.match).toMatchObject({ rank: 1, kos: 1, damage: 42, roundWins: 1, quiz: '1 correct quiz answer' });
    expect(row.strengths.length).toBeGreaterThan(0); expect(row.improvements.length).toBeGreaterThan(0);
    const projector = await test.connect('screen'); expect((await until(() => projector.messages.find(m => m.t === 'feedback'))).items).toHaveLength(2);
    alice.socket.close(); await once(alice.socket, 'close');
    const resumed = await test.connect('player', alice.welcome.token);
    expect((await until(() => resumed.messages.find(m => m.t === 'feedback'))).items.map(f => f.playerId)).toEqual([alice.welcome.you]);
    const csv = test.base + '/api/room/' + test.room + '/feedback.csv';
    expect((await fetch(csv)).status).toBe(401);
    expect((await fetch(csv, { headers: { 'X-Room-Token': bob.welcome.token } })).status).toBe(403);
    const exported = await fetch(csv, { headers: { 'X-Room-Token': teacher.welcome.token } });
    expect(exported.status).toBe(200); expect(exported.headers.get('cache-control')).toBe('no-store');
    expect(await exported.text()).toContain('"\'=Alice"');
    const markdown = await fetch(csv.replace('.csv', '.md'), { headers: { 'X-Room-Token': teacher.welcome.token } });
    expect(markdown.status).toBe(200); expect(await markdown.text()).toContain('Next steps:');
    expect(test.recorded).toHaveLength(0);
    const closed = once(teacher.socket, 'close'); teacher.send({ t: 'leave' }); await closed;
    await until(() => resumed.lobby()?.ownerId === resumed.welcome.you);
    expect((await fetch(csv, { headers: { 'X-Room-Token': teacher.welcome.token } })).status).toBe(403);
    expect((await fetch(csv, { headers: { 'X-Room-Token': resumed.welcome.token } })).status).toBe(200);
    await test.close(); expect(readFileSync(file, 'utf8')).not.toContain('"rubricScore"'); expect(readFileSync(file, 'utf8')).not.toContain('"strengths"');
  });

  it('keeps credentialed student feedback room-only and removes it on permanent leave', async () => {
    const file = persistenceFile(), secret = 'PRIVATE-FEEDBACK-ONLY-FOR-ALICE';
    const test = await setup(0.1, { ...rubricServices,
      getGithubToken: async req => req.headers.cookie === 'session=alice' ? 'mock-private-rubric-token' : null,
      analyzeRepo: async slug => { const profile = offlineProfile('pallets/flask'); profile.slug = slug; return profile; },
      feedbackForPlayer: (profile, rubric, stats) => ({ ...buildFeedback(profile, rubric, scoreRepo(profile, rubric), stats),
        summary: profile.slug === 'alice/private' ? secret : 'Public Bob feedback' }),
    }, { persistenceFile: file }, undefined, 'edu');
    const teacher = await test.connect('screen'), alice = await test.connect('player', undefined, 'Alice', 'session=alice'), bob = await test.connect('player', undefined, 'Bob');
    alice.send({ t: 'setRepo', repo: 'alice/private' }); bob.send({ t: 'setRepo', repo: 'bob/public' });
    await until(() => teacher.lobby()?.players.every(p => p.status === 'ready'));
    teacher.send({ t: 'start' });
    const personal = await until(() => alice.messages.find(m => m.t === 'feedback'));
    const other = await until(() => bob.messages.find(m => m.t === 'feedback'));
    expect(personal.items[0].summary).toBe(secret); expect(JSON.stringify(other)).not.toContain(secret);
    expect((await until(() => teacher.messages.find(m => m.t === 'feedback'))).items).toHaveLength(2);
    expect(JSON.stringify([...teacher.messages, ...alice.messages, ...bob.messages])).not.toContain('mock-private-rubric-token');
    const closed = once(alice.socket, 'close'); alice.send({ t: 'leave' }); await closed;
    await until(() => teacher.messages.filter(m => m.t === 'feedback').at(-1)?.items.length === 1);
    const exported = await fetch(test.base + '/api/room/' + test.room + '/feedback.md', { headers: { Authorization: `Bearer ${teacher.welcome.token}` } });
    expect(exported.status).toBe(200); expect(await exported.text()).not.toContain(secret);
    await test.close(); const saved = readFileSync(file, 'utf8');
    expect(saved).not.toContain(secret); expect(saved).not.toContain('mock-private-rubric-token'); expect(saved).not.toContain('"rubricScore"');
    expect(test.recorded).toHaveLength(0);
  });

  it('broadcasts phone readiness and blocks START with names until both phones enable controls', async () => {
    const { connect } = await setup();
    const owner = await connect('player', undefined, 'Host', undefined, undefined, 'Mozilla/5.0 (X11; Linux x86_64)');
    const alice = await connect('player', undefined, 'Alice', undefined, undefined, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    const bob = await connect('player', undefined, 'Bob', undefined, undefined, 'Mozilla/5.0 (Linux; Android 14) Mobile');
    owner.send({ t: 'setBots', count: 1 }); owner.send({ t: 'setBoss', repo: 'public/boss' });
    for (const client of [owner, alice, bob]) client.send({ t: 'setRepo', repo: 'public/hero' });
    await until(() => owner.lobby()?.players.length === 4 && owner.lobby()?.players.every(p => p.status === 'ready') && owner.lobby()?.boss.status === 'ready');
    expect(owner.lobby()?.players.find(p => p.id === owner.welcome.you)?.controlsReady).toBe(true);
    expect(owner.lobby()?.players.find(p => p.bot)?.controlsReady).toBe(true);
    expect(alice.welcome.lobby.players.find(p => p.id === alice.welcome.you)?.controlsReady).toBe(false);
    expect(bob.welcome.lobby.players.find(p => p.id === bob.welcome.you)?.controlsReady).toBe(false);
    owner.send({ t: 'start' });
    const blocked = await until(() => owner.messages.find(m => m.t === 'error'));
    expect(blocked.message).toContain('2 phones need to tap enable motion: Alice, Bob');
    expect(owner.lobby()?.phase).toBe('lobby');
    alice.send({ t: 'controls', ready: true, mode: 'standard' });
    await until(() => owner.lobby()?.players.find(p => p.id === alice.welcome.you)?.controlsReady === true);
    owner.send({ t: 'start' });
    await until(() => owner.messages.filter(m => m.t === 'error').length === 2);
    expect(owner.messages.filter(m => m.t === 'error').at(-1)?.message).toContain('1 phone needs to tap enable motion: Bob');
    bob.send({ t: 'controls', ready: true, mode: 'seated' });
    await until(() => owner.lobby()?.players.every(p => p.controlsReady));
    owner.send({ t: 'start' }); await until(() => owner.messages.find(m => m.t === 'snapshot'));
    expect(owner.lobby()?.phase).toBe('match');
    alice.send({ t: 'controls', ready: false, mode: 'standard' });
    await until(() => owner.lobby()?.players.find(p => p.id === alice.welcome.you)?.controlsReady === false);
    expect(owner.lobby()?.phase).toBe('match'); // UI owns the recovery overlay; teammates continue.
    alice.send({ t: 'controls', ready: true, mode: 'tap-only' });
    await until(() => owner.lobby()?.players.find(p => p.id === alice.welcome.you)?.controlsReady === true);
  });

  it('resets a resumed phone page to unready despite saved repo/choice and never persists readiness', async () => {
    const file = persistenceFile();
    const first = await setup(999, {}, { persistenceFile: file });
    const owner = await first.connect();
    const ua = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Mobile';
    const phone = await first.connect('player', undefined, 'Phone', undefined, undefined, ua);
    phone.send({ t: 'setRepo', repo: 'public/hero' }); phone.send({ t: 'controls', ready: true, mode: 'seated' });
    await until(() => owner.lobby()?.players.find(p => p.id === phone.welcome.you)?.status === 'ready' && owner.lobby()?.players.find(p => p.id === phone.welcome.you)?.controlsReady === true);
    phone.socket.close(); await once(phone.socket, 'close');
    const secondPage = await first.connect('player', phone.welcome.token, '', undefined, undefined, ua);
    const card = secondPage.welcome.lobby.players.find(p => p.id === phone.welcome.you)!;
    expect(secondPage.welcome.you).toBe(phone.welcome.you); expect(card.status).toBe('ready'); expect(card.kit).not.toBeNull();
    expect(card.controlsReady).toBe(false);
    secondPage.send({ t: 'controls', ready: true, mode: 'tap-only' });
    await until(() => owner.lobby()?.players.find(p => p.id === phone.welcome.you)?.controlsReady === true);
    await first.close();
    expect(readFileSync(file, 'utf8')).not.toContain('controlsReady'); expect(readFileSync(file, 'utf8')).not.toContain('controlsMode');
    const restarted = await setup(999, {}, { persistenceFile: file }, first.room);
    await restarted.connect('player', owner.welcome.token);
    const thirdPage = await restarted.connect('player', phone.welcome.token, '', undefined, undefined, ua);
    expect(thirdPage.welcome.lobby.players.find(p => p.id === phone.welcome.you)?.controlsReady).toBe(false);
    thirdPage.send({ t: 'controls', ready: true, mode: 'standard' });
    await until(() => thirdPage.lobby()?.players.find(p => p.id === phone.welcome.you)?.controlsReady === true);
  });

  it('rejects malformed readiness, allows touch choice, and ignores spectator controls reports', async () => {
    const { connect } = await setup(); const owner = await connect(); const screen = await connect('screen');
    owner.send({ t: 'controls', ready: false, mode: 'standard' });
    await until(() => owner.lobby()?.players[0].controlsReady === false);
    owner.socket.send(JSON.stringify({ t: 'controls', ready: 'true', mode: 'standard' }));
    await until(() => owner.messages.find(m => m.t === 'error'));
    expect(owner.lobby()?.players[0].controlsReady).toBe(false);
    owner.socket.send(JSON.stringify({ t: 'controls', ready: true, mode: 'unknown' }));
    await until(() => owner.messages.filter(m => m.t === 'error').length === 2);
    expect(owner.lobby()?.players[0].controlsReady).toBe(false);
    owner.send({ t: 'controls', ready: true, mode: 'tap-only' });
    await until(() => owner.lobby()?.players[0].controlsReady === true);
    const broadcasts = owner.messages.filter(m => m.t === 'lobby').length;
    owner.send({ t: 'controls', ready: true, mode: 'tap-only' }); screen.send({ t: 'controls', ready: false, mode: 'standard' });
    await wait(30);
    expect(owner.messages.filter(m => m.t === 'lobby')).toHaveLength(broadcasts);
    expect(screen.messages.filter(m => m.t === 'error')).toHaveLength(0);
  });

  it.each(['battle', 'edu'] as const)('removes a departing fighter from the real %s sim without resetting teammates', async mode => {
    const factory = vi.fn<GameServices['createMatch']>((players, boss, options) => createMatch(players, boss, options));
    const { connect } = await setup(999, { ...genesisServices, createBot, createMatch: factory }, {}, undefined, mode);
    const owner = await connect(); const peer = await connect();
    owner.send({ t: 'setRepo', repo: 'pallets/flask' }); peer.send({ t: 'setRepo', repo: 'pallets/flask' });
    if (mode === 'battle') owner.send({ t: 'setBoss', repo: 'pallets/flask' });
    owner.send({ t: 'setBots', count: 1 });
    await until(() => owner.lobby()?.players.length === 3 && owner.lobby()?.players.every(p => p.status === 'ready') && (mode === 'edu' || owner.lobby()?.boss.status === 'ready'));
    owner.send({ t: 'start' }); await until(() => peer.messages.find(m => m.t === 'snapshot'));
    const match: ReturnType<GameServices['createMatch']> = factory.mock.results[0].value;
    expect(typeof match.removePlayer, 'Simulation must expose physical player removal').toBe('function');
    const before = match.snapshot().t;
    const closed = once(owner.socket, 'close'); owner.send({ t: 'leave' }); await closed;
    await until(() => match.snapshot().t > before + 0.1);
    const state = match.snapshot();
    expect(state.players).toHaveLength(2);
    expect(state.players.some(p => p.id === owner.welcome.you)).toBe(false);
    expect(state.bullets.some(b => b.owner === owner.welcome.you)).toBe(false);
    expect(state.players.some(p => p.id.startsWith('bot-'))).toBe(true);
    if (state.pvp) expect(state.pvp.scores).not.toHaveProperty(owner.welcome.you);
    expect(peer.lobby()?.phase).toBe('match'); expect(peer.lobby()?.ownerId).toBe(peer.welcome.you);
  });

  it('leaves permanently, frees the slot, transfers ownership to a human and revokes the token', async () => {
    const { connect, rooms, room, wsUrl } = await setup();
    const owner = await connect(); const peer = await connect(); await connect('screen');
    owner.send({ t: 'setBots', count: 1 });
    await until(() => owner.lobby()?.players.some(p => p.bot));
    const closed = once(owner.socket, 'close'); owner.send({ t: 'leave' });
    const [code, reason] = await closed;
    expect(code).toBe(4002); expect(reason.toString()).toBe('left');
    await until(() => peer.lobby()?.ownerId === peer.welcome.you);
    expect(peer.lobby()?.players.some(p => p.id === owner.welcome.you)).toBe(false);
    expect(rooms.roomInfo(room).players).toBe(2);
    const stale = new WebSocket(wsUrl); const messages: ServerMsg[] = [];
    stale.on('message', raw => messages.push(JSON.parse(raw.toString())));
    await once(stale, 'open'); const denied = once(stale, 'close');
    stale.send(JSON.stringify({ t: 'hello', room, role: 'player', resume: owner.welcome.token }));
    expect((await denied)[0]).toBe(4002); expect(messages.some(m => m.t === 'welcome')).toBe(false);
    const fresh = await connect(); expect(fresh.welcome.you).not.toBe(owner.welcome.you);
  });

  it('deletes a last-human room with bots, persists revocation and cannot resurrect it after restart', async () => {
    const file = persistenceFile();
    const first = await setup(999, {}, { persistenceFile: file, debounceMs: 60_000 });
    const owner = await first.connect(); const dormant = await first.connect();
    dormant.socket.close(); await once(dormant.socket, 'close');
    owner.send({ t: 'setBots', count: 2 }); await until(() => owner.lobby()?.players.filter(p => p.bot).length === 2);
    const closed = once(owner.socket, 'close'); owner.send({ t: 'leave' }); await closed;
    expect(first.rooms.roomInfo(first.room).exists).toBe(false);
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    expect(saved.rooms).toEqual([]); expect(saved.revokedTokens).toHaveLength(2);
    expect(readFileSync(file, 'utf8')).not.toContain(owner.welcome.token);
    await first.close();
    const second = await setup(999, {}, { persistenceFile: file }, first.room);
    for (const resume of [owner.welcome.token, dormant.welcome.token]) {
      const ws = new WebSocket(second.wsUrl); await once(ws, 'open'); const denied = once(ws, 'close');
      ws.send(JSON.stringify({ t: 'hello', room: first.room, role: 'player', resume }));
      expect((await denied)[0]).toBe(4002);
    }
    expect(second.rooms.roomInfo(first.room).exists).toBe(false);
  });

  it('lets a teacher screen leave, transfers to a student and deletes the room after the last screen leaves', async () => {
    const { connect, rooms, room } = await setup(999, {}, {}, undefined, 'edu');
    const teacher = await connect('screen'); const student = await connect(); const screen = await connect('screen');
    let closed = once(teacher.socket, 'close'); teacher.send({ t: 'leave' }); await closed;
    await until(() => student.lobby()?.ownerId === student.welcome.you);
    closed = once(student.socket, 'close'); student.send({ t: 'leave' }); await closed;
    await until(() => screen.lobby()?.ownerId === screen.welcome.you);
    expect(rooms.roomInfo(room).exists).toBe(true);
    closed = once(screen.socket, 'close'); screen.send({ t: 'leave' }); await closed;
    expect(rooms.roomInfo(room).exists).toBe(false);
  });

  it('removes a fighter during combat while the bot and teammate keep advancing', async () => {
    const { connect, observed } = await setup(0.7);
    const owner = await connect(); const peer = await connect();
    owner.send({ t: 'setRepo', repo: 'test/player' }); peer.send({ t: 'setRepo', repo: 'test/peer' });
    owner.send({ t: 'setBoss', repo: 'test/boss' }); owner.send({ t: 'setBots', count: 1 });
    await until(() => owner.lobby()?.players.length === 3 && owner.lobby()?.players.every(p => p.status === 'ready') && owner.lobby()?.boss.status === 'ready');
    owner.send({ t: 'start' });
    const before = await until(() => peer.messages.find(m => m.t === 'snapshot'));
    const closed = once(owner.socket, 'close'); owner.send({ t: 'leave' }); await closed;
    await until(() => peer.lobby()?.ownerId === peer.welcome.you);
    const after = await until(() => peer.messages.find(m => m.t === 'snapshot' && m.state.t > before.state.t + 0.1 && m.state.players.length === 2));
    expect(after.t === 'snapshot' && after.state.players.some(p => p.id === owner.welcome.you)).toBe(false);
    const result = await until(() => peer.messages.find(m => m.t === 'autopsy'));
    expect(result.result.players).toHaveLength(2); expect(result.result.mvp).not.toBe(owner.welcome.you);
    expect(observed.length).toBeGreaterThan(4);
  });

  it('removes autopsy entries and invalidates pending analysis on leave', async () => {
    const first = await setup(0.1);
    const owner = await first.connect(); const peer = await first.connect();
    owner.send({ t: 'setRepo', repo: 'test/player' }); peer.send({ t: 'setRepo', repo: 'test/peer' }); owner.send({ t: 'setBoss', repo: 'test/boss' });
    await until(() => owner.lobby()?.players.every(p => p.status === 'ready') && owner.lobby()?.boss.status === 'ready');
    owner.send({ t: 'start' }); await until(() => peer.messages.find(m => m.t === 'autopsy'));
    const closed = once(owner.socket, 'close'); owner.send({ t: 'leave' }); await closed;
    await until(() => peer.messages.filter(m => m.t === 'autopsy').length === 2);
    expect(peer.messages.filter(m => m.t === 'autopsy').at(-1)?.result.players.map(p => p.id)).toEqual([peer.welcome.you]);
    peer.send({ t: 'rematch' }); await until(() => peer.lobby()?.phase === 'lobby');
    const late = await first.connect(); late.send({ t: 'setRepo', repo: 'slow/repo' });
    await until(() => peer.lobby()?.players.find(p => p.id === late.welcome.you)?.status === 'analyzing');
    const leaving = once(late.socket, 'close'); late.send({ t: 'leave' }); await leaving; await wait(120);
    expect(peer.lobby()?.players.map(p => p.id)).toEqual([peer.welcome.you]);
  });

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
    expect(snapshot.state.boss!.kit.heart).toBe('src/real-heart.ts');
    expect(snapshot.state.boss!.regions).toEqual([{ id: 'heart', x: 335, y: 144, r: 15 }]);
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
    expect(snapshot.state.boss!.kit.name).toBe('AI boss');
    expect(snapshot.state.boss!.kit.maxHp).toBe(100);
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
        expect(options).toEqual(expect.objectContaining({ token: fixtureToken }));
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
    expect(analyzeRepo).toHaveBeenCalledWith('acme/private', expect.objectContaining({ token: fixtureToken }));
    expect(analyzeRepo).toHaveBeenCalledWith('public/boss', expect.objectContaining({ token: fixtureToken, onProgress: expect.any(Function) }));
    expect(getGithubToken).toHaveBeenCalledTimes(2);
    const peer = await connect('player', undefined, 'Other Player', 'session=bob');
    peer.send({ t: 'setRepo', repo: 'other/private' });
    await until(() => peer.lobby()?.players.find(p => p.id === peer.welcome.you)?.status === 'ready');
    expect(analyzeRepo).toHaveBeenCalledWith('other/private', expect.objectContaining({ token: secondToken }));
    expect(getGithubToken).toHaveBeenCalledTimes(3);
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
      expect(options?.token).toBeUndefined();
      return { slug: repo, heart: 'public/core.ts' } as RepoProfile;
    });
    const { connect, recorded } = await setup(0.2, { analyzeRepo, getGithubToken: async () => null });
    const owner = await connect();
    owner.send({ t: 'setRepo', repo: 'public/hero' });
    owner.send({ t: 'setBoss', repo: 'public/boss' });
    await until(() => owner.lobby()?.players[0].status === 'ready' && owner.lobby()?.boss.status === 'ready');
    owner.send({ t: 'start' });
    await until(() => owner.messages.find(m => m.t === 'autopsy'));
    expect(analyzeRepo).toHaveBeenCalledWith('public/hero', expect.objectContaining({ onProgress: expect.any(Function) }));
    expect(recorded).toHaveLength(1);
  });

  it('uses only the owner upgrade credential for a private boss and excludes it from Gemini and Hall', async () => {
    const credential = 'mock-owner-boss-credential';
    const getGithubToken = vi.fn(async (req: http.IncomingMessage) => req.headers.cookie === 'session=owner' ? credential : null);
    const analyzeRepo = vi.fn(async (slug: string, options?: { token?: string }) => {
      expect(options?.token).toBe(slug === 'owner/private-boss' ? credential : undefined);
      return { slug, heart: 'core.ts' } as RepoProfile;
    });
    const enhanceBossKit = vi.fn(async (_profile: RepoProfile, kit: BossKit) => kit);
    const test = await setup(0.2, { getGithubToken, analyzeRepo, enhanceBossKit });
    const publicPlayer = await test.connect(); publicPlayer.send({ t: 'setRepo', repo: 'public/hero' });
    await until(() => publicPlayer.lobby()?.players[0].status === 'ready');
    publicPlayer.socket.close(); await once(publicPlayer.socket, 'close');
    const owner = await test.connect('player', publicPlayer.welcome.token, '', 'session=owner');
    const peer = await test.connect('player', undefined, 'Peer', 'session=someone-else');
    const calls = getGithubToken.mock.calls.length;
    peer.send({ t: 'setBoss', repo: 'peer/not-authorized' }); await until(() => peer.messages.find(m => m.t === 'error'));
    expect(getGithubToken).toHaveBeenCalledTimes(calls);
    expect(analyzeRepo).not.toHaveBeenCalledWith('peer/not-authorized', expect.anything());
    owner.send({ t: 'setBoss', repo: 'owner/private-boss' }); await until(() => owner.lobby()?.boss.status === 'ready');
    expect(analyzeRepo).toHaveBeenCalledWith('owner/private-boss', expect.objectContaining({ token: credential, onProgress: expect.any(Function) }));
    expect(enhanceBossKit).not.toHaveBeenCalled();
    owner.send({ t: 'start' }); await until(() => owner.messages.find(m => m.t === 'autopsy'));
    expect(test.recorded).toHaveLength(0); // The hero was analyzed anonymously; only the boss is private.
    expect(JSON.stringify([...owner.messages, ...peer.messages])).not.toContain(credential);
    owner.send({ t: 'rematch' }); await until(() => owner.lobby()?.phase === 'lobby');
    const left = once(peer.socket, 'close'); peer.send({ t: 'leave' }); await left;
    owner.socket.close(); await once(owner.socket, 'close');
    const anonymous = await test.connect('player', owner.welcome.token);
    anonymous.send({ t: 'setBoss', repo: 'public/boss' }); await until(() => anonymous.lobby()?.boss.repo === 'public/boss' && anonymous.lobby()?.boss.status === 'ready');
    expect(enhanceBossKit).toHaveBeenCalledTimes(1);
    anonymous.send({ t: 'start' }); await until(() => anonymous.messages.find(m => m.t === 'autopsy'));
    expect(test.recorded).toHaveLength(1); // A subsequent anonymous boss clears the credentialed-boss flag.
  });

  it('keeps private boss source/kit/Genesis out of persistence and requires fresh owner auth after restart', async () => {
    const file = persistenceFile();
    let credential = 'mock-first-owner-boss-token';
    const secret = 'PRIVATE-BOSS-SOURCE-SENTINEL';
    const analyzeRepo = vi.fn(async (slug: string, options?: { token?: string }) => {
      const profile = offlineProfile('pallets/flask'); profile.slug = slug;
      if (slug === 'owner/private-boss') {
        expect(options?.token).toBe(credential); profile.heart = secret + '/heart.py'; profile.readme = secret;
        profile.dna = { ...profile.dna!, heartLines: [secret], identifiers: [secret] };
      }
      return profile;
    });
    const services = { ...genesisServices, analyzeRepo,
      getGithubToken: async (req: http.IncomingMessage) => req.headers.cookie === 'session=owner' ? credential : null };
    const first = await setup(999, services, { persistenceFile: file });
    const original = await first.connect(); original.send({ t: 'setRepo', repo: 'pallets/flask' });
    await until(() => original.lobby()?.players[0].status === 'ready');
    original.socket.close(); await once(original.socket, 'close');
    const owner = await first.connect('player', original.welcome.token, '', 'session=owner');
    owner.send({ t: 'setBoss', repo: 'owner/private-boss' }); await until(() => owner.lobby()?.boss.status === 'ready');
    expect(owner.lobby()?.boss.genesis).toBeDefined();
    await first.close();
    const saved = readFileSync(file, 'utf8');
    expect(saved).toContain('owner/private-boss'); expect(saved).not.toContain(secret); expect(saved).not.toContain(credential);
    expect(JSON.parse(saved).rooms[0]).toEqual(expect.objectContaining({ privateBoss: true, boss: expect.objectContaining({ kit: null, status: 'error' }) }));
    expect(JSON.parse(saved).rooms[0].bossProfile).toBeUndefined();
    credential = 'mock-fresh-owner-boss-token';
    const second = await setup(0.2, services, { persistenceFile: file }, first.room);
    const resumed = await second.connect('player', owner.welcome.token, '', 'session=owner');
    expect(resumed.welcome.lobby.boss.repo).toBe('owner/private-boss'); expect(resumed.welcome.lobby.boss.status).toBe('error');
    resumed.send({ t: 'setBoss', repo: 'owner/private-boss' }); await until(() => resumed.lobby()?.boss.status === 'ready');
    expect(analyzeRepo).toHaveBeenLastCalledWith('owner/private-boss', expect.objectContaining({ token: credential }));
    resumed.send({ t: 'start' }); await until(() => resumed.messages.find(m => m.t === 'autopsy'));
    expect(second.recorded).toHaveLength(0);
  });

  it('does not expose upstream auth or authenticated-analysis error details', async () => {
    const { connect } = await setup(999, { getGithubToken: async () => { throw new Error('UPSTREAM-CREDENTIAL-SENTINEL'); } });
    const owner = await connect();
    owner.send({ t: 'setRepo', repo: 'acme/private' });
    await until(() => owner.lobby()?.players[0].status === 'error');
    expect(owner.lobby()?.players[0].error).toContain('Reconnect GitHub');
    expect(JSON.stringify(owner.messages)).not.toContain('UPSTREAM-CREDENTIAL-SENTINEL');
    owner.send({ t: 'setBoss', repo: 'acme/private-boss' });
    await until(() => owner.lobby()?.boss.status === 'error');
    expect(owner.lobby()?.boss.error).toContain('Reconnect GitHub');
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
    second.send({ t: 'setBoss', repo: 'acme/private-boss' });
    await until(() => second.lobby()?.boss.status === 'error');
    expect(second.lobby()?.boss.error).toContain('Check GitHub access');
    expect(JSON.stringify(second.messages)).not.toContain('PRIVATE-DETAIL-SENTINEL');
    expect(JSON.stringify(second.messages)).not.toContain('mock-private-token');
  });

  it('recreates an unknown stale room code only with a resume token and gives ownership to its first player', async () => {
    const { connect } = await setup(999, {}, {}, 'LOST');
    const owner = await connect('player', 'stale-room-resume-token');
    expect(owner.welcome.lobby.room).toBe('LOST');
    expect(owner.welcome.lobby.ownerId).toBe(owner.welcome.you);
    const peer = await connect();
    expect(peer.welcome.lobby.ownerId).toBe(owner.welcome.you);
    expect(owner.messages.some(m => m.t === 'error')).toBe(false);
  });

  it('rejects fresh unknown/digit room codes and exposes non-mutating room lookups', async () => {
    const test = await setup();
    async function helloError(code: string) {
      const socket = new WebSocket(test.wsUrl);
      const messages: ServerMsg[] = [];
      socket.on('message', raw => messages.push(JSON.parse(raw.toString())));
      await once(socket, 'open');
      socket.send(JSON.stringify({ t: 'hello', room: code, role: 'player', name: 'Mistyped' }));
      const error = await until(() => messages.find(m => m.t === 'error'));
      socket.close(); await once(socket, 'close'); return error.message;
    }
    expect(test.rooms.roomInfo('LOST')).toEqual({ exists: false, players: 0, phase: null });
    expect(await helloError('LOST')).toMatch(/room not found/i);
    expect(test.rooms.roomInfo('LOST')).toEqual({ exists: false, players: 0, phase: null });
    expect(await helloError('AB12')).toMatch(/no digits/i);
    expect(test.rooms.roomInfo(test.room)).toEqual({ exists: true, players: 0, phase: 'lobby' });
    await test.connect();
    expect(test.rooms.roomInfo(test.room).players).toBe(1);
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
    expect(resumed.welcome.lobby.boss.status).toBe('error');
    expect(resumed.welcome.lobby.boss.error).toContain('private boss');
    resumed.send({ t: 'setBoss', repo: 'saved/boss' });
    await until(() => resumed.lobby()?.boss.status === 'ready');
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

  it('drops a throwing simulation frame and keeps the match running for later valid input', async () => {
    const test = await setup();
    const create = test.services.createMatch;
    let threw = false;
    test.services.createMatch = (players, boss) => {
      const match = create(players, boss);
      return {
        step(dt, inputs) {
          if (!threw && [...inputs.values()].some(frame => frame.fire)) { threw = true; throw new TypeError('PRIVATE-ERROR-SENTINEL'); }
          match.step(dt, inputs);
        },
        snapshot: () => match.snapshot(), autopsy: () => match.autopsy(), get over() { return match.over; },
      };
    };
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const owner = await test.connect();
      owner.send({ t: 'setRepo', repo: 'test/hero' }); owner.send({ t: 'setBoss', repo: 'test/boss' });
      await until(() => owner.lobby()?.players[0].status === 'ready' && owner.lobby()?.boss.status === 'ready');
      owner.send({ t: 'start' });
      await until(() => owner.messages.find(m => m.t === 'snapshot'));
      owner.send({ t: 'input', frame: { seq: 1, move: [0, 0], aim: null, fire: true, dash: false, skill: false, source: 'keyboard' } });
      await until(() => threw && warning.mock.calls.length === 1);
      expect(owner.lobby()?.phase).toBe('match');
      expect(owner.messages.filter(m => m.t === 'error')).toEqual([]);
      expect(JSON.stringify(warning.mock.calls)).not.toContain('PRIVATE-ERROR-SENTINEL');
      owner.send({ t: 'input', frame: { seq: 2, move: [1, 0], aim: null, fire: true, dash: false, skill: false, source: 'keyboard' } });
      await until(() => owner.messages.some(m => m.t === 'snapshot' && m.ack === 2 && m.state.t > 0.1));
      expect(test.observed.some(frame => frame.seq === 2 && frame.fire)).toBe(true);
      expect(owner.lobby()?.phase).toBe('match');
    } finally { warning.mockRestore(); }
  });

  it('attaches real Genesis to heroes, bosses and bots, rescales it at start, and preserves public replay on restart', async () => {
    const file = persistenceFile();
    const test = await setup(999, genesisServices, { persistenceFile: file });
    const owner = await test.connect();
    owner.send({ t: 'setRepo', repo: 'pallets/flask' }); owner.send({ t: 'setBoss', repo: 'fastapi/fastapi' });
    owner.send({ t: 'setBots', count: 2 });
    await until(() => owner.lobby()?.players.length === 3 && owner.lobby()?.players.every(p => p.genesis && p.status === 'ready') && owner.lobby()?.boss.genesis);
    const lobby = owner.lobby()!;
    expect(lobby.players.every(p => p.progress?.stage === 'ready')).toBe(true);
    expect(lobby.players[0].genesis).toEqual(buildGenesis(offlineProfile('pallets/flask'), lobby.players[0].kit!, 'hero'));
    expect(lobby.boss.genesis).toEqual(buildGenesis(offlineProfile('fastapi/fastapi'), lobby.boss.kit!, 'boss'));
    expect(owner.messages.some(m => m.t === 'lobby' && m.lobby.boss.progress?.stage === 'map')).toBe(true);
    owner.send({ t: 'start' });
    await until(() => owner.messages.find(m => m.t === 'snapshot'));
    expect(owner.lobby()!.boss.genesis).toEqual(buildGenesis(offlineProfile('fastapi/fastapi'), owner.lobby()!.boss.kit!, 'boss'));
    const heroGenesis = owner.lobby()!.players[0].genesis;
    await test.close();
    const restarted = await setup(999, genesisServices, { persistenceFile: file }, test.room);
    const resumed = await restarted.connect('player', owner.welcome.token, '');
    expect(resumed.welcome.lobby.players.find(p => p.id === owner.welcome.you)?.genesis).toEqual(heroGenesis);
  });

  it('coalesces streaming analysis progress to about 8Hz, caps path batches and finishes ready', async () => {
    let callbacks = 0;
    const started = Date.now();
    const { connect } = await setup(999, {
      ...genesisServices,
      analyzeRepo: async (slug, options) => {
        for (let i = 1; i <= 80; i++) {
          callbacks++;
          options?.onProgress?.({ stage: i < 20 ? 'clone' : i < 40 ? 'parse' : i < 60 ? 'graph' : 'dna', pct: i / 110,
            paths: Array.from({ length: 12 }, (_, n) => `fixture/source-${i}-${n}.ts`) });
          await wait(6);
        }
        return offlineProfile(slug);
      },
    });
    const owner = await connect(); owner.send({ t: 'setRepo', repo: 'pallets/flask' });
    await until(() => owner.lobby()?.players[0].status === 'ready');
    const streams = owner.messages.filter(m => m.t === 'lobby' && m.lobby.players[0]?.status === 'analyzing'
      && m.lobby.players[0].progress?.paths?.length);
    expect(callbacks).toBe(80);
    expect(streams.length).toBeGreaterThanOrEqual(2);
    expect(streams.length).toBeLessThanOrEqual(Math.ceil((Date.now() - started) / 125));
    for (const message of streams) if (message.t === 'lobby') expect(message.lobby.players[0].progress!.paths!.length).toBeLessThanOrEqual(8);
    expect(owner.lobby()?.players[0].progress).toEqual({ stage: 'ready', pct: 1 });
    expect(owner.lobby()?.players[0].genesis?.slug).toBe('pallets/flask');
  });

  it('uses final Genesis replay when cached analysis stages finish inside one throttle window', async () => {
    const { connect } = await setup(999, { ...genesisServices, analyzeRepo: async (slug, options) => {
      const profile = offlineProfile(slug); replayProfileProgress(profile, options?.onProgress, 'cache'); return profile;
    } });
    const owner = await connect(); owner.send({ t: 'setRepo', repo: 'pallets/flask' });
    await until(() => owner.lobby()?.players[0].status === 'ready');
    expect(owner.lobby()?.players[0].genesis?.metrics.files).toBe(offlineProfile('pallets/flask').totalFiles);
    expect(owner.lobby()?.players[0].genesis?.sampleFiles.length).toBeGreaterThan(0);
    expect(owner.lobby()?.players[0].progress?.stage).toBe('ready');
    await wait(160);
    expect(owner.lobby()?.players[0].progress?.stage).toBe('ready');
  });

  it('ignores late progress from superseded jobs and clears the prior Genesis during a new analysis', async () => {
    let emitOld: NonNullable<NonNullable<Parameters<GameServices['analyzeRepo']>[1]>['onProgress']> | undefined;
    const { connect } = await setup(999, {
      ...genesisServices,
      analyzeRepo: async (slug, options) => {
        if (slug === 'old/repo') { emitOld = options?.onProgress; await wait(100); }
        return offlineProfile(slug);
      },
    });
    const owner = await connect();
    owner.send({ t: 'setRepo', repo: 'pallets/flask' });
    await until(() => !!owner.lobby()?.players[0].genesis);
    owner.send({ t: 'setRepo', repo: 'old/repo' });
    await until(() => owner.lobby()?.players[0].repo === 'old/repo');
    expect(owner.lobby()?.players[0].genesis).toBeUndefined();
    owner.send({ t: 'setRepo', repo: 'fastapi/fastapi' });
    await until(() => owner.lobby()?.players[0].genesis?.slug === 'fastapi/fastapi');
    emitOld?.({ stage: 'clone', pct: 0.1, paths: ['STALE-PATH.ts'] }); await wait(160);
    expect(owner.lobby()?.players[0].progress?.stage).toBe('ready');
    expect(owner.lobby()?.players[0].genesis?.slug).toBe('fastapi/fastapi');
    expect(JSON.stringify(owner.lobby())).not.toContain('STALE-PATH');
  });

  it('shows design progress without blocking ready, then refreshes Genesis for final or failed optional art', async () => {
    let finishHero!: (kit: PlayerKit) => void;
    const { connect } = await setup(999, {
      ...genesisServices,
      enhanceHeroKit: async (_profile, _kit) => new Promise(resolve => { finishHero = resolve; }),
      enhanceBossKit: async () => { throw new Error('Offline optional art'); },
    });
    const owner = await connect(); owner.send({ t: 'setRepo', repo: 'pallets/flask' }); owner.send({ t: 'setBoss', repo: 'fastapi/fastapi' });
    await until(() => owner.lobby()?.players[0].status === 'ready' && owner.lobby()?.boss.status === 'ready');
    const kit = owner.lobby()!.players[0].kit!;
    expect(owner.lobby()?.players[0].progress?.stage).toBe('design');
    expect(owner.lobby()?.players[0].genesis).toBeDefined();
    await until(() => owner.lobby()?.boss.progress?.stage === 'ready');
    finishHero({ ...kit, title: 'Final art name' });
    await until(() => owner.lobby()?.players[0].progress?.stage === 'ready');
    expect(owner.lobby()?.players[0].genesis).toEqual(buildGenesis(offlineProfile('pallets/flask'), owner.lobby()!.players[0].kit!, 'hero'));
    expect(owner.lobby()?.players[0].genesis?.trace.some(step => step.to.includes('Final art name'))).toBe(true);
  });

  it('shares sanitized private Genesis only inside its room and excludes private source from persistence/Gemini/Hall', async () => {
    const file = persistenceFile();
    const profile = offlineProfile('pallets/flask'); profile.slug = 'acme/private'; profile.heart = 'internal/roomOnlySymbol.py';
    profile.dna = { ...profile.dna!, identifiers: ['roomOnlySymbol'], heartLines: ['def roomOnlySymbol(): pass'], snippets: [
      { file: 'internal/roomOnly.py', line: 1, code: 'def roomOnlySymbol(): pass' },
      { file: 'internal/roomOnly.py', line: 2, code: 'token = ' + 'ghp_' + 'A'.repeat(30) },
    ] };
    const enhance = vi.fn(async (_profile: RepoProfile, kit: PlayerKit) => kit);
    const test = await setup(0.2, { ...genesisServices,
      analyzeRepo: async slug => slug === profile.slug ? profile : offlineProfile(slug),
      getGithubToken: async () => 'mock-private-genesis-credential', enhanceHeroKit: enhance,
    }, { persistenceFile: file });
    const owner = await test.connect();
    owner.send({ t: 'setRepo', repo: profile.slug }); owner.send({ t: 'setBoss', repo: 'fastapi/fastapi' });
    await until(() => !!owner.lobby()?.players[0].genesis && owner.lobby()?.boss.status === 'ready');
    const genesis = owner.lobby()!.players[0].genesis!;
    expect(genesis.snippets.some(line => line.includes('roomOnlySymbol'))).toBe(true);
    expect(JSON.stringify(genesis)).not.toContain('ghp_');
    expect(enhance).not.toHaveBeenCalled();
    owner.send({ t: 'start' }); await until(() => owner.messages.find(m => m.t === 'autopsy'));
    expect(test.recorded).toHaveLength(0);
    await test.close();
    const stored = readFileSync(file, 'utf8');
    expect(stored).not.toContain('roomOnlySymbol');
    expect(stored).not.toContain('mock-private-genesis-credential');
    expect(stored).not.toContain('ghp_');
  });

  it('switches owner-controlled modes, rebuilds quality kits, starts boss-free PvP and keeps class results out of Hall', async () => {
    const test = await setup(0.2);
    const base = test.services.playerKitFromProfile;
    test.services.playerKitFromProfile = (profile, options) => ({ ...base(profile),
      maxArmor: options?.mode === 'edu' ? 9 : 4,
      quality: options?.mode === 'edu' ? [{ stat: 'armor', value: 9, grade: 'A', signal: 'Fixture tests: 30%', tip: 'Keep testing' }] : undefined });
    const create = test.services.createMatch;
    const factory = vi.fn((...args: Parameters<GameServices['createMatch']>) => create(...args));
    test.services.createMatch = factory;
    const owner = await test.connect(); const peer = await test.connect();
    peer.send({ t: 'setMode', mode: 'edu' }); await until(() => peer.messages.find(m => m.t === 'error'));
    expect(peer.lobby()?.mode).toBe('battle');
    for (const c of [owner, peer]) c.send({ t: 'setRepo', repo: 'fixture/student' });
    await until(() => owner.lobby()?.players.every(p => p.status === 'ready'));
    owner.send({ t: 'setMode', mode: 'edu' });
    await until(() => owner.lobby()?.mode === 'edu' && owner.lobby()?.players.every(p => p.status === 'ready' && p.kit?.quality?.length));
    expect(owner.lobby()?.players.every(p => p.kit?.maxArmor === 9)).toBe(true);
    owner.send({ t: 'start' });
    const snapshot = await until(() => owner.messages.find(m => m.t === 'snapshot'));
    expect(snapshot.state.boss).toBeNull(); expect(snapshot.state.mode).toBe('edu'); expect(snapshot.state.heroScale).toBe(2); expect(snapshot.state.pvp).not.toBeNull();
    expect(factory).toHaveBeenCalledWith(expect.any(Array), null, { mode: 'edu' });
    owner.send({ t: 'setMode', mode: 'battle' });
    await until(() => owner.messages.some(m => m.t === 'error' && m.message.includes('lobby')));
    const result = await until(() => owner.messages.find(m => m.t === 'autopsy'));
    expect(result.result.boss).toBeNull(); expect(result.result.ranking).toHaveLength(2); expect(test.recorded).toHaveLength(0);
    owner.send({ t: 'rematch' }); await until(() => owner.lobby()?.phase === 'lobby');
    owner.send({ t: 'setMode', mode: 'battle' });
    await until(() => owner.lobby()?.mode === 'battle' && owner.lobby()?.players.every(p => p.status === 'ready' && !p.kit?.quality));
    expect(owner.lobby()?.players.every(p => p.kit?.maxArmor === 4)).toBe(true);
  });

  it('supports a non-playing teacher, 30 student slots, human priority and teacher-token recovery', async () => {
    const test = await setup(999, {}, {}, undefined, 'edu');
    const first = await test.connect('player', undefined, 'Early student');
    const teacher = await test.connect('screen', undefined, 'Teacher');
    expect(teacher.welcome.lobby.ownerId).toBe(teacher.welcome.you);
    expect(teacher.welcome.lobby.players).toHaveLength(1);
    teacher.send({ t: 'setBots', count: 7 });
    await until(() => teacher.lobby()?.players.filter(p => p.bot).length === 7);
    for (let i = 1; i < 30; i++) await test.connect('player', undefined, `Student ${i}`);
    expect(test.rooms.roomInfo(test.room).players).toBe(30);
    expect(teacher.lobby()?.players.filter(p => p.bot)).toHaveLength(0);
    const extra = new WebSocket(test.wsUrl); const errors: ServerMsg[] = [];
    extra.on('message', raw => errors.push(JSON.parse(raw.toString()))); await once(extra, 'open');
    extra.send(JSON.stringify({ t: 'hello', room: test.room, role: 'player', name: '31st student' }));
    const full = await until(() => errors.find(m => m.t === 'error'));
    expect(full.message).toContain('30'); extra.close(); await once(extra, 'close');
    teacher.send({ t: 'setMode', mode: 'battle' });
    await until(() => teacher.messages.some(m => m.t === 'error' && m.message.includes('8 players')));
    expect(teacher.lobby()?.mode).toBe('edu');
    teacher.socket.close(); await once(teacher.socket, 'close');
    await until(() => first.lobby()?.ownerId === first.welcome.you);
    const returned = await test.connect('screen', teacher.welcome.token, 'Teacher');
    expect(returned.welcome.you).toBe(teacher.welcome.you);
    expect(returned.welcome.lobby.ownerId).toBe(teacher.welcome.you);
    expect(returned.welcome.lobby.players).toHaveLength(30);
  }, 10_000);

  it('persists classroom mode and the teacher screen identity across process-style restart', async () => {
    const file = persistenceFile();
    const first = await setup(999, {}, { persistenceFile: file }, undefined, 'edu');
    const teacher = await first.connect('screen', undefined, 'Teacher');
    await first.close();
    const saved = JSON.parse(readFileSync(file, 'utf8')).rooms[0];
    expect(saved.mode).toBe('edu'); expect(saved.teacherId).toBe(teacher.welcome.you);
    expect(saved.players.find((p: { id: string }) => p.id === teacher.welcome.you).role).toBe('screen');
    const second = await setup(999, {}, { persistenceFile: file }, first.room);
    const resumed = await second.connect('screen', teacher.welcome.token, 'Teacher');
    expect(resumed.welcome.lobby.mode).toBe('edu'); expect(resumed.welcome.lobby.ownerId).toBe(teacher.welcome.you);
  });

  it('preserves battle social-impact autopsy metadata through delivery and the Hall hook', async () => {
    const test = await setup(0.2);
    const create = test.services.createMatch;
    const issue = { number: 12, title: 'Fixture help wanted', url: 'https://github.com/fixture/repo/issues/12', labels: ['help wanted'] };
    test.services.createMatch = (players, boss, options) => {
      const match = create(players, boss, options);
      return { step: (dt, inputs) => match.step(dt, inputs), snapshot: () => match.snapshot(), get over() { return match.over; },
        autopsy() {
          const result = match.autopsy();
          if (result.boss) result.boss = { ...result.boss, busFactor: 1, repoIssues: [issue], limbs: [{ component: 'core', broken: true, damageTaken: 42,
            fragile: true, maintainers: 1, issues: [issue], parasites: [{ id: 'OSV-FIXTURE', pkg: 'fixture-package', ecosystem: 'npm', summary: 'Fixture advisory', fixed: '2.0.0' }] }] };
          return result;
        } };
    };
    const owner = await test.connect(); owner.send({ t: 'setRepo', repo: 'fixture/hero' }); owner.send({ t: 'setBoss', repo: 'fixture/boss' });
    await until(() => owner.lobby()?.players[0].status === 'ready' && owner.lobby()?.boss.status === 'ready'); owner.send({ t: 'start' });
    const result = await until(() => owner.messages.find(m => m.t === 'autopsy'));
    expect(result.result.boss?.limbs[0].issues).toEqual([issue]); expect(result.result.boss?.limbs[0].parasites?.[0].fixed).toBe('2.0.0');
    expect(test.recorded[0].boss?.busFactor).toBe(1); expect(test.recorded[0].boss?.repoIssues).toEqual([issue]);
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
    expect(result.result.boss!.heart).toBe('src/real-heart.ts');
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

describe('cooperative staged classroom protocol', () => {
  it('handles30students with4analysis slots, private feedback, teacher-only controls and reconnect', async () => {
    const { defaultClassroomPlan } = await import('../shared/classroom-defaults');
    const { profileFromFiles } = await import('../analysis/graph');
    const files = [{ path: 'src/main.ts', text: 'export const x = 42' }];
    const profile = profileFromFiles('demo/repo', files);
    let active=0, peak=0, jobs=0;
    const test = await setup(999, { analyzeClassroomSubmission: async () => {
      active++; peak=Math.max(peak,active); jobs++; await wait(30); active--;
      return {profile,files,commit:'a'.repeat(40),checks:[]};
    } }, {}, undefined, 'edu');
    const teacher=await test.connect('screen');
    teacher.send({t:'classroomPlan',plan:defaultClassroomPlan()});
    await until(()=>teacher.messages.find(m=>m.t==='classroom'));
    const students: Awaited<ReturnType<typeof test.connect>>[]=[];for(let i=0;i<30;i++) students.push(await test.connect('player',undefined,`Student ${i+1}`));
    const latest=(client:typeof teacher)=>client.messages.filter(m=>m.t==='classroom').at(-1);
    await until(()=>latest(teacher)?.state.rows.length===30);
    students[0].send({t:'classroomControl',action:'start'});
    await until(()=>students[0].messages.find(m=>m.t==='error'&&m.message.includes('teacher')));
    teacher.send({t:'classroomControl',action:'start'});await until(()=>latest(teacher)?.state.phase==='coding');
    for(const student of students)student.send({t:'classroomSubmit',repo:'demo/repo'});
    await until(()=>latest(teacher)?.state.rows.every(r=>r.status==='submitted'),500);
    expect(jobs).toBe(30);expect(peak).toBe(4);expect(Object.keys(latest(teacher)!.reports)).toHaveLength(30);
    for(const student of students)expect(Object.keys(latest(student)!.reports)).toEqual([student.welcome.you]);
    expect(teacher.messages.some(m=>m.t==='snapshot')).toBe(false);
    teacher.socket.close();await once(teacher.socket,'close');
    students[0].send({t:'classroomControl',action:'attack'});await wait(30);expect(latest(students[0])!.state.phase).toBe('coding');
    const rejoined=await test.connect('screen',teacher.welcome.token);expect(rejoined.welcome.you).toBe(teacher.welcome.you);
    const resumed=await test.connect('player',students[0].welcome.token);expect(resumed.welcome.you).toBe(students[0].welcome.you);
    rejoined.send({t:'classroomControl',action:'attack'});await until(()=>latest(rejoined)?.state.phase==='raid');
    expect(latest(rejoined)!.state.rounds[0].attacks).toHaveLength(30);
    const denied=await fetch(`${test.base}/api/room/${test.room}/classroom.csv`,{headers:{'X-Room-Token':students[1].welcome.token}});expect(denied.status).toBe(403);
    const exported=await fetch(`${test.base}/api/room/${test.room}/classroom.csv`,{headers:{'X-Room-Token':teacher.welcome.token}});expect(exported.status).toBe(200);expect((await exported.text()).split('\r\n')).toHaveLength(32);
  });

  it('restores the reserved teacher and paused lesson without private evidence', async () => {
    const { defaultClassroomPlan } = await import('../shared/classroom-defaults');
    const file=persistenceFile(); const test=await setup(999,{}, {persistenceFile:file},undefined,'edu');
    const teacher=await test.connect('screen'), student=await test.connect();teacher.send({t:'classroomPlan',plan:defaultClassroomPlan()});
    await until(()=>teacher.messages.find(m=>m.t==='classroom'));teacher.send({t:'classroomControl',action:'start'});
    await until(()=>teacher.messages.find(m=>m.t==='classroom'&&m.state.phase==='coding'));await test.close();
    const restarted=await setup(999,{}, {persistenceFile:file},test.room,'edu');
    const s=await restarted.connect('player',student.welcome.token);
    const current=await until(()=>s.messages.find(m=>m.t==='classroom'));expect(current.state.phase).toBe('paused');expect(current.reports).toEqual({});expect(s.welcome.lobby.ownerId).toBe(teacher.welcome.you);
    const t=await restarted.connect('screen',teacher.welcome.token);t.send({t:'classroomControl',action:'resume'});
    await until(()=>t.messages.find(m=>m.t==='classroom'&&m.state.phase==='coding'));
  });
});


it('rejects legacy PvP start commands in production classroom mode', async () => {
  const test = await setup(999, {}, { allowLegacyEdu: false }, undefined, 'edu');
  const teacher = await test.connect('screen');
  teacher.send({ t: 'start' });
  await until(() => teacher.messages.find(m => m.t === 'error' && m.message.includes('shared Boss')));
  expect(teacher.messages.some(m => m.t === 'snapshot')).toBe(false);
});

describe('PvP duel authority and isolation', () => {
  function accessServices() {
    let revoked = false;
    const verify = vi.fn(async (repo: string, token: string) => {
      if (revoked) throw new Error('Access revoked');
      return { userId: token === 'alice' ? 1 : 2, login: token, repo, private: true };
    });
    return { verify, revoke() { revoked = true; }, services: {
      getGithubToken: async (req: http.IncomingMessage) => req.headers.cookie ?? null,
      verifyPvpAccess: verify,
    } };
  }
  it('requires two eligible distinct accounts, rejects bots/boss, and rechecks permissions at start', async () => {
    const auth = accessServices(), f = await setup(999, auth.services, {}, undefined, 'pvp');
    const a = await f.connect('player', undefined, 'Alice', 'alice');
    const b = await f.connect('player', undefined, 'Bob', 'bob');
    const third = new WebSocket(f.wsUrl);
    await once(third, 'open');
    const denied = once(third, 'message');
    third.send(JSON.stringify({ t: 'hello', room: f.room, role: 'player', name: 'Third' }));
    expect(JSON.parse(String((await denied)[0]))).toMatchObject({ t: 'error', message: 'Room is full (2 players)' });
    third.close();
    a.send({ t: 'setBots', count: 1 }); a.send({ t: 'setBoss', repo: 'third/party' }); a.send({ t: 'start' });
    await until(() => a.messages.filter(m => m.t === 'error').length >= 3);
    expect(a.lobby()?.phase).toBe('lobby');
    a.send({ t: 'setRepo', repo: 'alice/own' }); b.send({ t: 'setRepo', repo: 'bob/own' });
    await until(() => a.lobby()?.players.every(p => p.status === 'ready'));
    expect(auth.verify).toHaveBeenCalledTimes(2);
    auth.revoke(); a.send({ t: 'start' });
    await until(() => a.messages.some(m => m.t === 'error' && m.message.includes('Access revoked')));
    expect(a.lobby()?.phase).toBe('lobby');
    const before = a.messages.length;
    const anon = await f.connect('screen'); anon.send({ t: 'setRepo', repo: 'alice/own' });
    await until(() => anon.messages.some(m => m.t === 'error'));
    expect(a.messages.slice(before).some(m => m.t === 'snapshot')).toBe(false);
  });
  it('denies a second slot using the same GitHub account and invalidates reconnect selection', async () => {
    const auth = accessServices(), f = await setup(999, auth.services, {}, undefined, 'pvp');
    const a = await f.connect('player', undefined, 'Alice', 'alice');
    const b = await f.connect('player', undefined, 'Other tab', 'alice');
    a.send({ t: 'setRepo', repo: 'alice/one' });
    await until(() => a.lobby()?.players.find(p => p.id === a.welcome.you)?.status === 'ready');
    b.send({ t: 'setRepo', repo: 'alice/two' });
    await until(() => b.lobby()?.players.some(p => p.status === 'error' && p.error?.includes('different GitHub')));
    const resumed = await f.connect('player', a.welcome.token, 'Alice', 'bob');
    expect(resumed.welcome.lobby.players.find(p => p.id === a.welcome.you)?.status).toBe('empty');
  });
  it('drops disconnected ready players from the lobby and starts with a verified replacement', async () => {
    const auth = accessServices(), f = await setup(999, auth.services, {}, undefined, 'pvp');
    const a = await f.connect('player', undefined, 'Alice', 'alice'), b = await f.connect('player', undefined, 'Bob', 'bob');
    a.send({ t: 'setRepo', repo: 'alice/own' }); b.send({ t: 'setRepo', repo: 'bob/own' });
    await until(() => b.lobby()?.players.every(p => p.status === 'ready'));
    a.socket.close();
    await until(() => b.lobby()?.players.length === 1);
    const replacement = await f.connect('player', undefined, 'Alice again', 'alice');
    replacement.send({ t: 'setRepo', repo: 'alice/next' });
    await until(() => b.lobby()?.players.length === 2 && b.lobby()?.players.every(p => p.status === 'ready'));
    expect(b.lobby()?.players.some(p => p.id === a.welcome.you)).toBe(false);
    b.send({ t: 'start' });
    await until(() => b.lobby()?.phase === 'match');
  });
  it('starts a verified duel with two humans and no boss, preserves mode after persistence', async () => {
    const auth = accessServices(), file = persistenceFile();
    const f = await setup(0.05, auth.services, { persistenceFile: file, debounceMs: 1 }, undefined, 'pvp');
    const a = await f.connect('player', undefined, 'Alice', 'alice'), b = await f.connect('player', undefined, 'Bob', 'bob');
    a.send({ t: 'setRepo', repo: 'alice/own' }); b.send({ t: 'setRepo', repo: 'bob/own' });
    await until(() => a.lobby()?.players.every(p => p.status === 'ready'));
    a.send({ t: 'start' });
    await until(() => a.messages.some(m => m.t === 'autopsy'));
    expect(auth.verify).toHaveBeenCalledTimes(4);
    const result = a.messages.find(m => m.t === 'autopsy');
    expect(result && result.t === 'autopsy' && result.result.mode).toBe('pvp');
    expect(f.recorded).toHaveLength(0);
    await wait(30);
    const persisted = JSON.parse(readFileSync(file, 'utf8'));
    expect(persisted.rooms[0].mode).toBe('pvp');
    expect(readFileSync(file, 'utf8')).not.toContain('userId');
    expect(readFileSync(file, 'utf8')).not.toContain('src/real-heart.ts');
  });
});


it('only the classroom host can switch language, including before a lesson is published', async () => {
  const test=await setup(999,{}, {}, undefined, 'edu');
  const teacher=await test.connect('screen'), student=await test.connect(), spectator=await test.connect('screen');
  teacher.send({t:'classroomLanguage',locale:'fr'});
  await until(()=>student.lobby()?.locale==='fr');expect(spectator.lobby()?.locale).toBe('fr');
  student.send({t:'classroomLanguage',locale:'es'});
  await until(()=>student.messages.find(m=>m.t==='error'&&m.message.includes('teacher')));
  expect(student.lobby()?.locale).toBe('fr');
  spectator.send({t:'classroomLanguage',locale:'zh'});
  await until(()=>spectator.messages.find(m=>m.t==='error'&&m.message.includes('teacher')));
  teacher.send({t:'classroomLanguage',locale:'bogus'} as unknown as ClientMsg);
  await until(()=>teacher.messages.find(m=>m.t==='error'&&m.message.includes('English')));
  expect(student.lobby()?.locale).toBe('fr');
  const {defaultClassroomPlan}=await import('../shared/classroom-defaults');
  teacher.send({t:'classroomPlan',plan:defaultClassroomPlan()});
  await until(()=>teacher.messages.find(m=>m.t==='classroom'));
  teacher.send({t:'classroomLanguage',locale:'es'});await until(()=>student.lobby()?.locale==='es');
  const resumed=await test.connect('player',student.welcome.token);expect(resumed.welcome.lobby.locale).toBe('es');
});

it('persists the host-selected classroom language across server restarts', async () => {
  const file=persistenceFile(),test=await setup(999,{}, {persistenceFile:file},undefined,'edu');
  const teacher=await test.connect('screen');teacher.send({t:'classroomLanguage',locale:'zh'});
  await until(()=>teacher.lobby()?.locale==='zh');await test.close();
  const restored=await setup(999,{}, {persistenceFile:file},test.room,'edu');
  const resumed=await restored.connect('screen',teacher.welcome.token);expect(resumed.welcome.lobby.locale).toBe('zh');
});
