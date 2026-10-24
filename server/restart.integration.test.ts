import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../shared/types.ts';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(get: () => T | false | undefined): Promise<T> {
  for (let i = 0; i < 600; i++) { const value = get(); if (value) return value; await pause(50); }
  throw new Error('Restart integration timed out');
}

// Explicit opt-in: real server processes use only OS-assigned ports and a temp store.
it.skipIf(process.env.ROOM_RESTART_TEST !== '1')('recovers real main.ts processes, resumes a lobby, and resets an interrupted fight', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'gitzilla-restart-'));
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const children: ChildProcess[] = [];
  const sockets: WebSocket[] = [];
  async function stop(child: ChildProcess) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exit = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    await exit; clearTimeout(timer);
  }
  async function boot() {
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/main.ts'], {
      cwd: root,
      env: { ...process.env, NODE_ENV: 'production', PORT: '0', ROOMS_FILE: join(directory, 'rooms.json'),
        TRACES_DIR: join(directory, 'traces'),
        PUBLIC_URL: '', HTTPS_KEY: '', HTTPS_CERT: '', REPO_KAIJU_HTTPS: '', HTTP_REDIRECT_PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    let output = '';
    child.stdout!.on('data', chunk => { output += chunk.toString(); });
    child.stderr!.on('data', () => {}); // Never dump env/provider diagnostic bodies.
    const port = await until(() => {
      if (child.exitCode !== null) throw new Error('Isolated server exited before listening');
      return output.match(/Local: http:\/\/localhost:(\d+)/)?.[1];
    });
    expect(Number(port)).not.toBe(5173);
    expect(Number(port)).not.toBe(5175);
    return { child, base: `http://127.0.0.1:${port}` };
  }
  async function joinRoom(base: string, room: string, resume?: string, role: 'player' | 'screen' = 'player') {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws'); sockets.push(ws);
    const messages: ServerMsg[] = [];
    ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
    ws.on('error', () => {});
    await once(ws, 'open');
    const send = (msg: ClientMsg) => ws.send(JSON.stringify(msg));
    send({ t: 'hello', room, resume, role, name: 'Restart test' });
    const welcome = await until(() => messages.find(m => m.t === 'welcome'));
    return { ws, send, messages, welcome, lobby: () => messages.filter(m => m.t === 'lobby').at(-1)?.lobby };
  }
  try {
    const first = await boot();
    const manifest = await fetch(first.base + '/manifest.webmanifest');
    expect(manifest.status).toBe(200); expect(manifest.headers.get('content-type')).toBe('application/manifest+json');
    expect(await manifest.json()).toHaveProperty('name');
    const upload = await fetch(first.base + '/api/trace', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ua: 'Synthetic isolated server test', samples: [{ t: 16, rotationRate: { alpha: 80 } }] }) });
    expect(upload.status).toBe(201);
    const trace = await upload.json() as { id: string };
    const listed = await (await fetch(first.base + '/api/trace/list')).json() as { traces: { id: string }[] };
    expect(listed.traces.some(item => item.id === trace.id)).toBe(true);
    expect((await fetch(first.base + '/api/trace/list', { headers: { 'CF-Connecting-IP': '192.0.2.5' } })).status).toBe(403);
    expect((await fetch(first.base + '/.cache/traces/' + trace.id)).status).toBe(404);
    const { room } = await (await fetch(first.base + '/api/room', { method: 'POST' })).json() as { room: string };
    const player = await joinRoom(first.base, room);
    const repos = await (await fetch(first.base + '/api/fallbacks')).json() as string[];
    player.send({ t: 'setRepo', repo: repos[0] }); player.send({ t: 'setBoss', repo: repos[1] });
    await until(() => player.lobby()?.players[0].status === 'ready' && player.lobby()?.boss.status === 'ready');
    expect((await fetch(first.base + '/.cache/rooms.json')).status).toBe(404);
    await stop(first.child);
    const second = await boot();
    const resumed = await joinRoom(second.base, room, player.welcome.token);
    expect(resumed.welcome.you).toBe(player.welcome.you);
    expect(resumed.welcome.token).toBe(player.welcome.token);
    expect(resumed.welcome.lobby.phase).toBe('lobby');
    expect(resumed.welcome.lobby.players[0].kit?.repo).toBe(repos[0]);
    resumed.send({ t: 'start' });
    await until(() => resumed.messages.find(m => m.t === 'snapshot'));
    await stop(second.child);
    const third = await boot();
    const recovered = await joinRoom(third.base, room, player.welcome.token);
    expect(recovered.welcome.lobby.phase).toBe('lobby');
    expect(recovered.welcome.lobby.boss.kit?.repo).toBe(repos[1]);
    const notice = await until(() => recovered.messages.find(m => m.t === 'error'));
    expect(notice.message).toMatch(/server restarted.*fight/i);
    const stale = await joinRoom(third.base, 'HEAL', 'stale-room-resume-token');
    expect(stale.welcome.lobby.ownerId).toBe(stale.welcome.you);
    expect(stale.welcome.lobby.room).toBe('HEAL');
    const { room: classroom } = await (await fetch(third.base + '/api/room?mode=edu', { method: 'POST' })).json() as { room: string };
    const teacher = await joinRoom(third.base, classroom, undefined, 'screen');
    const studentA = await joinRoom(third.base, classroom);
    const studentB = await joinRoom(third.base, classroom);
    studentA.send({ t: 'setRepo', repo: repos[0] }); studentB.send({ t: 'setRepo', repo: repos[1] });
    await until(() => teacher.lobby()?.players.length === 2 && teacher.lobby()?.players.every(p => p.status === 'ready' && p.kit?.quality?.length));
    await stop(third.child);
    const fourth = await boot();
    const restoredTeacher = await joinRoom(fourth.base, classroom, teacher.welcome.token, 'screen');
    expect(restoredTeacher.welcome.you).toBe(teacher.welcome.you);
    expect(restoredTeacher.welcome.lobby.ownerId).toBe(teacher.welcome.you);
    expect(restoredTeacher.welcome.lobby.mode).toBe('edu');
    const restoredA = await joinRoom(fourth.base, classroom, studentA.welcome.token);
    const restoredB = await joinRoom(fourth.base, classroom, studentB.welcome.token);
    expect(restoredA.welcome.lobby.players.find(p => p.id === studentA.welcome.you)?.kit?.quality?.length).toBeGreaterThan(0);
    restoredTeacher.send({ t: 'start' });
    const pvp = await until(() => restoredTeacher.messages.find(m => m.t === 'snapshot'));
    expect(pvp.state.mode).toBe('edu'); expect(pvp.state.boss).toBeNull(); expect(pvp.state.heroScale).toBe(2);

    let closed = once(restoredA.ws, 'close'); restoredA.send({ t: 'leave' });
    expect((await closed)[0]).toBe(4002);
    await until(() => restoredTeacher.messages.find(m => m.t === 'snapshot' && m.state.players.length === 1));
    closed = once(restoredB.ws, 'close'); restoredB.send({ t: 'leave' }); await closed;
    closed = once(restoredTeacher.ws, 'close'); restoredTeacher.send({ t: 'leave' }); await closed;
    expect(await (await fetch(fourth.base + '/api/room/' + classroom)).json()).toEqual({ exists: false, players: 0, phase: null });
    await stop(fourth.child);
    const fifth = await boot();
    for (const resume of [studentA.welcome.token, studentB.welcome.token, teacher.welcome.token]) {
      const ws = new WebSocket(fifth.base.replace('http:', 'ws:') + '/ws'); sockets.push(ws);
      await once(ws, 'open'); const denied = once(ws, 'close');
      ws.send(JSON.stringify({ t: 'hello', room: classroom, role: resume === teacher.welcome.token ? 'screen' : 'player', resume }));
      expect((await denied)[0]).toBe(4002);
    }
    expect(await (await fetch(fifth.base + '/api/room/' + classroom)).json()).toEqual({ exists: false, players: 0, phase: null });

  } finally {
    for (const socket of sockets) socket.terminate();
    for (const child of children) await stop(child);
    rmSync(directory, { recursive: true, force: true });
  }
}, 90_000);
