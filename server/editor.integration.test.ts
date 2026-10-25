import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../shared/types';
import { defaultClassroomPlan } from '../shared/classroom-defaults';

async function until<T>(get: () => T | false | undefined): Promise<T> {
  for (let i = 0; i < 300; i++) { const value = get(); if (value) return value; await new Promise(r => setTimeout(r, 20)); }
  throw new Error('Isolated editor integration timed out');
}

it.skipIf(process.env.EDITOR_SERVER_TEST !== '1')('wires real main.ts editor analysis and Hall HTTP on an OS-assigned port', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'gitzilla-editor-'));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/main.ts'], {
    env: { ...process.env, NODE_ENV: 'production', PORT: '0', ROOMS_FILE: join(directory, 'rooms.json'), ROYALE_HALL_FILE: join(directory, 'royale.json'), TRACES_DIR: join(directory, 'traces'),
      PUBLIC_URL: '', HTTPS_KEY: '', HTTPS_CERT: '', REPO_KAIJU_HTTPS: '', HTTP_REDIRECT_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; child.stdout!.on('data', data => { output += data.toString(); }); child.stderr!.on('data', () => {});
  const sockets: WebSocket[] = [];
  try {
    const port = await until(() => { if (child.exitCode !== null) throw new Error('Isolated editor server exited'); return output.match(/Local: http:\/\/localhost:(\d+)/)?.[1]; });
    expect([5173, 5175]).not.toContain(Number(port)); const base = `http://127.0.0.1:${port}`;
    const hall = await fetch(base + '/api/hall'); expect(hall.status).toBe(200); expect(await hall.json()).toHaveProperty('royaleWins', []);
    const { room } = await (await fetch(base + '/api/room?mode=edu', { method: 'POST' })).json() as { room: string };
    async function connect(role: 'screen' | 'player') {
      const socket = new WebSocket(base.replace('http:', 'ws:') + '/ws'); sockets.push(socket);
      const messages: ServerMsg[] = []; socket.on('message', raw => messages.push(JSON.parse(raw.toString()))); await once(socket, 'open');
      const send = (msg: ClientMsg) => socket.send(JSON.stringify(msg)); send({ t: 'hello', room, role, name: role === 'screen' ? 'Teacher' : 'Student' });
      const welcome = await until(() => messages.find(m => m.t === 'welcome'));
      return { send, welcome, latest: () => messages.filter(m => m.t === 'classroom').at(-1) };
    }
    const teacher = await connect('screen'), student = await connect('player');
    const plan = defaultClassroomPlan(); plan.steps[0].language = 'python'; plan.steps[0].starter = [{ path: 'main.py', content: '# TODO' }];
    plan.steps[0].checksWeight = 100; plan.steps[0].checks = [{ id: 'answer', kind: 'contains', path: 'main.py', text: 'answer = 42', label: 'Answer' }];
    teacher.send({ t: 'classroomPlan', plan }); await until(() => student.latest());
    teacher.send({ t: 'classroomControl', action: 'start' }); await until(() => student.latest()?.state.phase === 'coding');
    student.send({ t: 'classroomSubmitCode', files: [{ path: 'main.py', content: 'answer = 42\nraise RuntimeError("PRIVATE_MAIN_EDITOR")' }] });
    const report = await until(() => student.latest()?.reports[student.welcome.you]);
    expect(report.source).toBe('in-app'); expect(report.commit).toMatch(/^inapp:[a-f\d]{8}$/); expect(report.score).toBe(100); expect(report.criteria.length).toBeGreaterThan(0);
    await until(() => teacher.latest()?.reports[student.welcome.you]);
  } finally {
    for (const socket of sockets) socket.terminate();
    if (child.exitCode === null && child.signalCode === null) {
      const exit = once(child, 'exit'); child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 3000); await exit; clearTimeout(timer);
    }
    try { expect(readFileSync(join(directory, 'rooms.json'), 'utf8')).not.toContain('PRIVATE_MAIN_EDITOR'); }
    finally { rmSync(directory, { recursive: true, force: true }); }
  }
}, 15_000);
