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
  async function joinRoom(base: string, room: string, resume?: string) {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws'); sockets.push(ws);
    const messages: ServerMsg[] = [];
    ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
    ws.on('error', () => {});
    await once(ws, 'open');
    const send = (msg: ClientMsg) => ws.send(JSON.stringify(msg));
    send({ t: 'hello', room, resume, role: 'player', name: 'Restart test' });
    const welcome = await until(() => messages.find(m => m.t === 'welcome'));
    return { send, messages, welcome, lobby: () => messages.filter(m => m.t === 'lobby').at(-1)?.lobby };
  }
  try {
    const first = await boot();
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
    const stale = await joinRoom(third.base, 'HEAL');
    expect(stale.welcome.lobby.ownerId).toBe(stale.welcome.you);
    expect(stale.welcome.lobby.room).toBe('HEAL');
  } finally {
    for (const socket of sockets) socket.terminate();
    for (const child of children) await stop(child);
    rmSync(directory, { recursive: true, force: true });
  }
}, 90_000);
