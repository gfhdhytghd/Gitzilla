import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ClassroomAttack, ClassroomRound, ClassroomState } from '../shared/classroom';
import type { ServerMsg } from '../shared/types';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { lessonGrades } from '../shared/classroom-grades';
import { ClassroomSession } from './classroom';
import { classroomExport, gradesExport } from './classroom-export';
import { handleEduRoute } from './edu-http';
import { RoomServer, type GameServices } from './rooms';

// Exports quote every cell. Parse quoted newlines and doubled quotes as well.
function table(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  for (const match of text.matchAll(/"((?:[^"]|"")*)"(,|\r\n)/g)) {
    row.push(match[1].replaceAll('""', '"'));
    if (match[2] === '\r\n') { rows.push(row); row = []; }
  }
  const headers = rows.shift()!;
  return rows.map(cells => {
    expect(cells).toHaveLength(headers.length);
    return Object.fromEntries(headers.map((header, i) => [header, cells[i]]));
  });
}
function fixture(): ClassroomState {
  const state = new ClassroomSession(defaultClassroomPlan()).state;
  state.rows = ['missing', 'zero', 'active'].map(id => ({
    id, name: id, connected: true, status: 'empty', improvement: 0,
    damage: 0, totalDamage: 0, attempts: 0,
  }));
  return state;
}
const attack = (id: string, score: number, reviewPending = false): ClassroomAttack => ({
  id, name: id, score, reviewPending, improvement: 10, damage: 20, commit: 'sha',
});
function round(state: ClassroomState, step: number, at: number, attacks: ClassroomAttack[]): ClassroomRound {
  return { stepId: state.plan.steps[step].id, at, attempt: at, bossBefore: 100, bossAfter: 80, attacks };
}
const summaries = (state: ClassroomState) => table(classroomExport(state, 'csv')).filter(r => r.row_type === 'student_summary');

describe('main classroom CSV overall grades', () => {
  it('exports one shared grade per student without summing retries or live unrecorded work', () => {
    const state = fixture();
    state.rows[2].score = 100; // Live work is not a recorded attack.
    state.rounds = [
      round(state, 0, 20, [attack('active', 90)]),
      round(state, 0, 10, [attack('active', 100), attack('departed', 45.25), attack('zero', 0)]),
      round(state, 0, 20, [attack('active', 80.25)]),
      round(state, 1, 30, [attack('active', 20)]),
    ];
    const before = structuredClone(state);
    const rows = table(classroomExport(state, 'csv'));
    const overall = rows.filter(r => r.row_type === 'student_summary');
    expect(overall).toHaveLength(4);
    for (const grade of lessonGrades(state).students) {
      expect(overall.find(r => r.student_id === grade.id)).toMatchObject({
        overall_score: String(grade.average), overall_total: String(grade.total),
        overall_max: String(grade.max), overall_status: 'recorded',
        score: '', step: '', attempt: '',
      });
    }
    expect(overall.find(r => r.student_id === 'active')?.overall_score).toBe('33.4');
    for (const id of ['zero', 'missing']) expect(overall.find(r => r.student_id === id)?.overall_score).toBe('0');
    expect(overall[0].overall_score_definition).toContain('missing/unrecorded steps count 0');
    expect(overall[0].overall_score_definition).toContain('retries replace earlier scores');
    const attempts = rows.filter(r => r.row_type === 'attack');
    expect(attempts).toHaveLength(6);
    expect(attempts[0]).toMatchObject({ step: 'build', attempt: '20', student_id: 'active', commit: 'sha', score: '90', improvement: '10', damage: '20', overall_score: '' });
    expect(state).toEqual(before);
    const gradeRows = table(gradesExport(state, 'csv'));
    for (const row of overall) expect(gradeRows.find(g => g.student_id === row.student_id)?.average).toBe(row.overall_score);
  });

  it('includes all roster students with zero before any attack, including an empty plan', () => {
    const state = fixture();
    expect(summaries(state)).toHaveLength(3);
    expect(summaries(state).every(r => r.overall_score === '0' && r.overall_max === '300')).toBe(true);
    state.plan.steps = [];
    expect(summaries(state).every(r => r.overall_score === '0' && r.overall_max === '0')).toBe(true);
    state.rows = [];
    expect(table(classroomExport(state, 'csv'))).toEqual([]);
  });

  it('marks only latest selected pending scores provisional, independently of historical attempts', () => {
    const state = fixture();
    state.plan.grading = { automaticWeight: 50, checklist: ['Correctness'] };
    state.rounds = [round(state, 0, 1, [attack('active', 90, true)]), round(state, 0, 2, [attack('active', 60)])];
    expect(summaries(state).find(r => r.student_id === 'active')).toMatchObject({ overall_score: '20', overall_status: 'recorded' });
    state.rounds.push(round(state, 1, 3, [attack('active', 30, true)]));
    const rows = table(classroomExport(state, 'csv'));
    expect(rows.find(r => r.row_type === 'student_summary' && r.student_id === 'active')).toMatchObject({ overall_score: '30', overall_status: 'provisional: review pending' });
    expect(rows.find(r => r.row_type === 'attack' && r.attempt === '1')?.review_status).toBe('provisional: review pending');
    expect(rows.find(r => r.row_type === 'attack' && r.attempt === '2')?.review_status).toBe('reviewed');
    expect(rows.find(r => r.student_id === 'missing')?.overall_status).toBe('recorded');
  });

  it('keeps CSV escaping and formula defense for summaries and attack evidence', () => {
    const state = fixture();
    const name = ' \t=SUM(1,2),"quoted"\r\nnext';
    state.rows[0].name = name;
    state.rows[1].name = '+zero';
    state.rounds = [round(state, 0, 1, [{ ...attack('active', 10), name: '@active', commit: '-commit' }])];
    state.rows[2].name = '@active';
    const emails = { missing: '\n=malicious@example.com', active: 'a,"b"@example.com' };
    const text = classroomExport(state, 'csv', 'en', emails), rows = table(text);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(rows.find(r => r.student_id === 'missing')).toMatchObject({ student: "'" + name, email: "'" + emails.missing });
    expect(rows.find(r => r.student_id === 'zero')?.student).toBe("'+zero");
    expect(rows.find(r => r.row_type === 'attack')).toMatchObject({ student: "'@active", commit: "'-commit", email: emails.active });
    expect(classroomExport(state, 'md')).not.toContain('student_summary');
  });

  it('serves the main CSV only to the reserved teacher through the existing endpoint', async () => {
    const wss = new WebSocketServer({ noServer: true });
    const rooms = new RoomServer(wss, { listFallbackRepos: () => [] } as unknown as GameServices, { allowLegacyEdu: true });
    try {
      const code = rooms.createRoom(undefined, 'edu');
      const join = async (role: 'player' | 'screen') => {
        const messages: ServerMsg[] = [];
        const socket = Object.assign(new EventEmitter(), { readyState: 1, send: (raw: string) => messages.push(JSON.parse(raw)), close() {}, terminate() {} });
        wss.emit('connection', socket, { headers: {} });
        socket.emit('message', Buffer.from(JSON.stringify({ t: 'hello', room: code, role, name: role })));
        for (let i = 0; i < 20; i++) await Promise.resolve();
        return messages.find(m => m.t === 'welcome')! as Extract<ServerMsg, { t: 'welcome' }>;
      };
      const teacher = await join('screen'), student = await join('player');
      const session = new ClassroomSession(defaultClassroomPlan());
      session.roster([{ id: 'missing', name: 'Missing', connected: true }]);
      session.setEmail('missing', 'missing@example.com');
      rooms['rooms'].get(code)!.classroom = session;
      const request = async (token?: string) => {
        const req = { method: 'GET', headers: token ? { 'x-room-token': token } : {}, resume() {} } as unknown as IncomingMessage;
        const res = { status: 0, headers: {} as Record<string, string>, body: '', writeHead(status: number, headers: Record<string, string>) { this.status = status; this.headers = headers; }, end(body: string) { this.body = body; } };
        expect(await handleEduRoute(req, res as unknown as ServerResponse, new URL(`http://fixture/api/room/${code}/classroom.csv`), rooms)).toBe(true);
        return res;
      };
      for (const token of [undefined, 'invalid', student.token]) {
        const res = await request(token);
        expect(res.status).toBe(token ? 403 : 401);
        expect(res.body).not.toContain('missing@example.com');
      }
      const res = await request(teacher.token);
      expect(res.status).toBe(200);
      expect(res.headers).toMatchObject({ 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' });
      expect(res.headers['Content-Disposition']).toContain(`gitzilla-${code}-classroom.csv`);
      expect(table(res.body)).toEqual([expect.objectContaining({ student_id: 'missing', email: 'missing@example.com', overall_score: '0' })]);
    } finally { rooms.close(); wss.close(); }
  });
});
