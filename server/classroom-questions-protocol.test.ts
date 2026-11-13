import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { RoomServer, type GameServices } from './rooms';
import { handleEduRoute } from './edu-http';
import { profileFromFiles } from '../analysis/graph';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import type { ClientMsg, ServerMsg } from '../shared/types';
import type { ClassroomPhase } from '../shared/classroom';

class Socket extends EventEmitter {
  readyState = 1;
  messages: ServerMsg[] = [];
  send(raw: string) { this.messages.push(JSON.parse(raw)); }
  close() { this.readyState = 3; this.emit('close'); }
  terminate() { this.close(); }
  welcome() { return this.messages.find(m => m.t === 'welcome')! as Extract<ServerMsg, { t: 'welcome' }>; }
  latest() { return this.messages.filter(m => m.t === 'classroom').at(-1)!; }
}
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(f => f()));
async function fixture(immediate = false, never = false) {
  const wss = new WebSocketServer({ noServer: true });
  const rooms = new RoomServer(wss, { listFallbackRepos: () => [] } as unknown as GameServices, { allowLegacyEdu: true });
  cleanup.push(() => { rooms.close(); wss.close(); });
  const code = rooms.createRoom(undefined, 'edu'), room = rooms['rooms'].get(code)!;
  const send = async (s: Socket, msg: ClientMsg) => {
    s.emit('message', Buffer.from(JSON.stringify(msg))); for (let i = 0; i < 20; i++) await Promise.resolve();
    // These assertions inspect a delivered batch; coalescing timing has dedicated tests.
    if (room.classroomPublishTimer) rooms['publishClassroom'](room, false);
  };
  const join = async (role: 'screen' | 'player', resume?: string) => {
    const s = new Socket(); wss.emit('connection', s, { headers: {} } as IncomingMessage);
    await send(s, { t: 'hello', room: code, role, resume, name: role }); return s;
  };
  const teacher = await join('screen'), alice = await join('player'), bob = await join('player'), projector = await join('screen');
  const plan = defaultClassroomPlan();
  plan.steps = [0, 1].map(i => ({ ...plan.steps[0], id: `step-${i}`, mode: 'questions', durationSec: 0,
    answerFeedback: immediate ? 'immediate' : 'after-close', revealAnswers: never ? 'never' : 'after-raid', questions: [
      { id: 'choose', kind: 'single', prompt: 'Pick', options: [{ id: 'right', text: 'A' }, { id: 'wrong', text: 'B' }], answer: 'right', explain: `EXPLANATION_SECRET_${i}` },
      { id: 'fill', kind: 'blank', prompt: '{{1}}', blanks: [{ accept: [`ACCEPT_SECRET_${i}`], numeric: { value: 12345 + i, tolerance: 0 } }], explain: `BLANK_SECRET_${i}` },
    ] }));
  await send(teacher, { t: 'classroomPlan', plan });
  const controller = new Socket(); room.members.get(alice.welcome().you)!.controllerSocket = controller as any;
  return { rooms, room, code, teacher, alice, bob, projector, controller, plan, send, join };
}

describe('question WebSocket protocol and privacy', () => {
  it('routes synchronous saves, publishes teacher-only live stats and rejects stale/unauthorized saves', async () => {
    const f = await fixture();
    const answer: ClientMsg = { t: 'classroomAnswers', stepId: 'step-0', attempt: 1, answers: { choose: { choice: 'right' } } };
    await f.send(f.alice, answer); expect(f.alice.messages.at(-1)).toMatchObject({ t: 'error', message: expect.stringContaining('coding') });
    await f.send(f.teacher, { t: 'classroomControl', action: 'start' });
    await f.send(f.teacher, answer); expect(f.teacher.messages.at(-1)).toMatchObject({ t: 'error', message: expect.stringContaining('student') });
    await f.send(f.projector, answer); expect(f.projector.messages.at(-1)).toMatchObject({ t: 'error' });
    await f.send(f.alice, { ...answer, attempt: 2 }); expect(f.alice.messages.at(-1)).toMatchObject({ t: 'error', message: expect.stringContaining('Stale') });
    await f.send(f.alice, { ...answer, stepId: 'step-1' }); expect(f.alice.messages.at(-1)).toMatchObject({ t: 'error', message: expect.stringContaining('Stale') });
    await f.send(f.alice, answer);
    expect(f.teacher.latest().questionLive![0]).toMatchObject({ answered: 1, correct: 1, total: 2 });
    for (const s of [f.alice, f.bob, f.projector, f.controller]) expect(s.latest()).not.toHaveProperty('questionLive');
    expect(f.alice.latest().reports[f.alice.welcome().you].answers!.choose).not.toHaveProperty('correct');
    expect(f.bob.latest().reports).toEqual({});
    await f.send(f.alice, answer); expect(f.alice.messages.at(-1)).toMatchObject({ t: 'error', message: expect.stringContaining('1 second') });
    expect(f.teacher.latest().questionLive![0].answered).toBe(1);
  });

  it.each([false, true])('serializes every non-teacher payload in every phase without unrevealed keys (never=%s)', async never => {
    const f = await fixture(false, never);
    await f.send(f.teacher, { t: 'classroomControl', action: 'start' });
    await f.send(f.alice, { t: 'classroomAnswers', stepId: 'step-0', attempt: 1, answers: { choose: { choice: 'right' } } });
    await f.send(f.bob, { t: 'classroomAnswers', stepId: 'step-0', attempt: 1, answers: { choose: { choice: 'wrong' } } });
    expect(f.teacher.latest().questionLive![0].correct).toBe(1);
    const viewers = [f.alice, f.bob, f.projector, f.controller];
    for (const phase of ['setup', 'coding', 'paused', 'raid', 'feedback', 'complete'] as ClassroomPhase[]) {
      f.room.classroom!.state.phase = phase;
      const cursors = viewers.map(s => s.messages.length);
      f.rooms['broadcastLobby'](f.room); f.rooms['publishClassroom'](f.room);
      const teacherBody = JSON.stringify(f.teacher.latest());
      if (phase === 'coding' || phase === 'paused') expect(f.teacher.latest().state.questionAnswered).toEqual([2, 0]);
      else expect(f.teacher.latest().state).not.toHaveProperty('questionAnswered');
      expect(teacherBody).toContain('ACCEPT_SECRET_0'); expect(teacherBody).toContain('EXPLANATION_SECRET_1');
      for (const [index, socket] of viewers.entries()) {
        const packets = socket.messages.slice(cursors[index]); expect(packets.length).toBeGreaterThan(0);
        const body = JSON.stringify(packets), revealed = !never && ['feedback', 'complete'].includes(phase);
        for (const marker of ['ACCEPT_SECRET_1', 'EXPLANATION_SECRET_1', 'BLANK_SECRET_1', '12346']) expect(body).not.toContain(marker);
        for (const packet of packets) {
          const state = packet.t === 'classroom' ? packet.state : packet.t === 'lobby' ? packet.lobby.classroom! : null;
          expect(state).not.toBeNull();
          if (!['feedback', 'complete'].includes(phase)) {
            for (const row of state!.rows) expect(row).not.toHaveProperty('score');
            if (packet.t === 'classroom') for (const report of Object.values(packet.reports)) {
              expect(report).not.toHaveProperty('score'); expect(report).not.toHaveProperty('questionScore');
              expect(JSON.stringify(report)).not.toContain('\"questionScore\"');
            }
          }
          if (phase === 'coding' || phase === 'paused') {
            expect(state!.questionAnswered).toEqual([2, 0]);
            expect(state!.questionAnswered!.every(n => Number.isInteger(n) && n >= 0)).toBe(true);
            expect(JSON.stringify(state!.questionAnswered)).toBe('[2,0]');
          } else expect(state).not.toHaveProperty('questionAnswered');
          const first = state!.plan.steps[0].questions!, second = state!.plan.steps[1].questions!;
          for (const q of second) { expect(q).not.toHaveProperty('answer'); expect(q).not.toHaveProperty('blanks'); expect(q).not.toHaveProperty('explain'); }
          expect(second[1]).toHaveProperty('blankNumeric', [true]);
          if (!revealed) expect(first[1]).toHaveProperty('blankNumeric', [true]);
          if (revealed) expect(first[0]).toHaveProperty('answer', 'right');
          else for (const q of first) { expect(q).not.toHaveProperty('answer'); expect(q).not.toHaveProperty('blanks'); expect(q).not.toHaveProperty('explain'); }
        }
        if (!revealed) for (const marker of ['ACCEPT_SECRET_0', 'EXPLANATION_SECRET_0', 'BLANK_SECRET_0', '12345']) expect(body).not.toContain(marker);
      }
      // /api/room/<code> exposes only the presence/count/phase/mode summary.
      expect(Object.keys(f.rooms.roomInfo(f.code)).sort()).toEqual(['exists', 'mode', 'phase', 'players']);
      expect(JSON.stringify(f.rooms.lobby(f.room))).not.toContain('ACCEPT_SECRET_1');
      // A reconnect's welcome embeds a role-specific lobby as well.
      const reconnect = await f.join('player', f.alice.welcome().token);
      expect(reconnect.welcome().lobby.classroom?.questionAnswered).toEqual(phase === 'coding' || phase === 'paused' ? [2, 0] : undefined);
      const welcomeBody = JSON.stringify(reconnect.welcome()); expect(welcomeBody).not.toContain('ACCEPT_SECRET_1');
      if (never || !['feedback', 'complete'].includes(phase)) expect(welcomeBody).not.toContain('ACCEPT_SECRET_0');
      viewers[0] = reconnect;
    }
  });

  it('keeps immediate keys private to the locked question and its student', async () => {
    const f = await fixture(true);
    await f.send(f.teacher, { t: 'classroomControl', action: 'start' });
    await f.send(f.alice, { t: 'classroomAnswers', stepId: 'step-0', attempt: 1, answers: { choose: { choice: 'right' } } });
    expect(f.alice.latest().reports[f.alice.welcome().you].answers!.choose).toMatchObject({ correct: true, key: { choice: 'right' } });
    expect(JSON.stringify(f.alice.latest())).toContain('EXPLANATION_SECRET_0');
    expect(JSON.stringify(f.alice.latest())).not.toContain('ACCEPT_SECRET_0');
    for (const socket of [f.bob, f.projector, f.controller]) {
      expect(JSON.stringify(socket.latest())).not.toContain('EXPLANATION_SECRET_0');
      expect(JSON.stringify(socket.latest())).not.toContain('ACCEPT_SECRET_0');
    }
  });

  it('keeps exports teacher-only and emits per-question numeric columns', async () => {
    const f = await fixture();
    await f.send(f.teacher, { t: 'classroomControl', action: 'start' });
    await f.send(f.alice, { t: 'classroomAnswers', stepId: 'step-0', attempt: 1, answers: { choose: { choice: 'right' } } });
    await f.send(f.teacher, { t: 'classroomControl', action: 'attack' });
    for (const file of ['classroom.csv', 'classroom.md', 'grades.csv', 'grades.md']) for (const socket of [f.teacher, f.alice, f.projector]) {
      const req = { method: 'GET', headers: { 'x-room-token': socket.welcome().token }, resume() {} } as unknown as IncomingMessage;
      const res = { status: 0, body: '', writeHead(status: number) { this.status = status; }, end(body: string) { this.body = body; } };
      await handleEduRoute(req, res as unknown as ServerResponse, new URL(`http://test/api/room/${f.code}/${file}`), f.rooms);
      expect(res.status).toBe(socket === f.teacher ? 200 : 403);
      expect(res.body).not.toContain('ACCEPT_SECRET');
      if (socket === f.teacher && file.startsWith('classroom')) expect(res.body).toContain('s1-choose');
      if (socket === f.teacher && file.startsWith('grades')) expect(res.body).toContain('s1-questions');
    }
  });
});


it.each([false, true])('serializes only code scores for mixed after-close views before grading closes (never=%s)', async never => {
  const f = await fixture(false, never);
  const p = structuredClone(f.plan); for (const step of p.steps) Object.assign(step, { mode: 'mixed', questionsWeight: 50 });
  await f.send(f.teacher, { t: 'classroomPlan', plan: p }); await f.send(f.teacher, { t: 'classroomControl', action: 'start' });
  await f.send(f.alice, { t: 'classroomAnswers', stepId: 'step-0', attempt: 1, answers: { choose: { choice: 'right' } } });
  const id = f.alice.welcome().you, session = f.room.classroom!, files = [{ path: 'main.py', text: 'answer = 42' }];
  session.accept(session.begin(id, 'demo/repo'), { profile: profileFromFiles('demo/repo', files), commit: 'a'.repeat(40), files, checks: [] });
  session.review(id, 80, 'Code evidence only');
  for (const phase of ['setup', 'coding', 'paused', 'raid', 'feedback', 'complete'] as const) {
    session.state.phase = phase;
    const viewers = [f.alice, f.bob, f.projector, f.controller], cursors = viewers.map(s => s.messages.length);
    f.rooms['broadcastLobby'](f.room); f.rooms['publishClassroom'](f.room);
    expect(f.teacher.latest().reports[id]).toMatchObject({ codeScore: 80, questionScore: 50, score: 65 });
    for (const [i, viewer] of viewers.entries()) for (const packet of viewer.messages.slice(cursors[i])) {
      const state = packet.t === 'classroom' ? packet.state : packet.t === 'lobby' ? packet.lobby.classroom! : null;
      if (!state) continue;
      const beforeReveal = !['feedback', 'complete'].includes(phase);
      if (viewer === f.alice || viewer === f.controller) expect(state.rows.find(r => r.id === id)?.score).toBe(beforeReveal ? 80 : 65);
      else expect(state.rows.some(r => r.id === id)).toBe(false);
      if (packet.t === 'classroom' && packet.reports[id]) {
        const report = packet.reports[id];
        expect(report.score).toBe(beforeReveal ? 80 : 65);
        if (beforeReveal) { expect(report).not.toHaveProperty('questionScore'); expect(report.improvement).toBe(0); expect(report.answers!.choose).not.toHaveProperty('correct'); }
      }
    }
  }
});
