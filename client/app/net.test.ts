import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassroomState, ClassroomReport } from '../../shared/classroom';
import type { ServerMsg } from '../../shared/types';
import { pythonClassroomPlan } from '../../shared/classroom-presets';
import { connect } from './net';

// a fake socket per open(): records sends, lets the test push server frames and close it
class FakeSocket {
  static all: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 0; sent: string[] = [];
  onopen?: () => void; onmessage?: (ev: { data: string }) => void; onclose?: (ev?: { code?: number }) => void; onerror?: () => void;
  constructor(readonly url: string) { FakeSocket.all.push(this); }
  send(data: string) { this.sent.push(data); }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({ code: 1006 }); }
  open() { this.readyState = 1; this.onopen?.(); }
  push(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

const state = (extra: Partial<ClassroomState> = {}): ClassroomState => ({
  plan: pythonClassroomPlan('01-hello', 'en'), phase: 'coding', stepIndex: 0, attempt: 1, deadline: null, remainingMs: null, serverTime: 0,
  raidEndsAt: null, bossHp: 100, bossMaxHp: 100, rows: [], rounds: [{ stepId: 'x', attempt: 1, at: 1, bossBefore: 100, bossAfter: 90, attacks: [] }], ...extra,
});
const report = (score: number) => ({ stepId: 'x', attempt: 1, repo: 'in-app', commit: 'c', submittedAt: 0, score, improvement: 0, checks: [], criteria: [], advice: [] }) as ClassroomReport;

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('location', { protocol: 'http:', host: 'test', search: '' });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('classroom deltas in the connection', () => {
  it('opts in on hello and merges every delta before any listener sees it', () => {
    const conn = connect({ room: 'ABCD', role: 'player', name: 'Ana' });
    const seen: ServerMsg[] = [];
    conn.onMessage(m => seen.push(m));
    const sock = FakeSocket.all[0]; sock.open();
    expect(JSON.parse(sock.sent[0])).toMatchObject({ t: 'hello', classroomDelta: true });
    const full = state();
    sock.push({ t: 'classroom', state: full, reports: { a: report(50), b: report(60) } });
    // a delta: plan and rounds unchanged (placeholders), one report patched, one removed
    sock.push({ t: 'classroom', state: { ...state({ phase: 'paused' }), plan: { title: '', bossName: '', steps: [] }, rounds: [] },
      reports: { a: report(70) }, delta: { planUnchanged: true, roundsUnchanged: true, reports: true, removedReports: ['b'] } });
    const last = seen.at(-1) as Extract<ServerMsg, { t: 'classroom' }>;
    expect(last.delta).toBeUndefined();
    expect(last.state.phase).toBe('paused');
    expect(last.state.plan.steps.length).toBe(full.plan.steps.length);
    expect(last.state.rounds).toEqual(full.rounds);
    expect(Object.keys(last.reports)).toEqual(['a']);
    expect(last.reports.a.score).toBe(70);
  });
  it('unflagged empty data replaces the previous data', () => {
    const conn = connect({ room: 'ABCD', role: 'player', name: 'Ana' });
    const seen: ServerMsg[] = [];
    conn.onMessage(m => seen.push(m));
    const sock = FakeSocket.all[0]; sock.open();
    sock.push({ t: 'classroom', state: state(), reports: {} });
    sock.push({ t: 'classroom', state: state({ rounds: [] }), reports: {}, delta: { reports: true, removedReports: [] } });
    expect((seen.at(-1) as Extract<ServerMsg, { t: 'classroom' }>).state.rounds).toEqual([]);
  });
  it('resets the cache on reconnect: a delta before the first full packet closes the socket and is never shown', () => {
    const conn = connect({ room: 'ABCD', role: 'player', name: 'Ana' });
    const seen: ServerMsg[] = [];
    conn.onMessage(m => seen.push(m));
    const first = FakeSocket.all[0]; first.open();
    first.push({ t: 'classroom', state: state(), reports: {} });
    first.close();
    vi.advanceTimersByTime(5000);
    const second = FakeSocket.all[1]; second.open();
    expect(JSON.parse(second.sent[0])).toMatchObject({ t: 'hello', classroomDelta: true });
    const before = seen.length;
    second.push({ t: 'classroom', state: state(), reports: {}, delta: { planUnchanged: true, reports: true, removedReports: [] } });
    expect(seen.length).toBe(before);
    expect(second.readyState).toBe(3);
    vi.advanceTimersByTime(5000);
    const third = FakeSocket.all[2]; third.open();
    third.push({ t: 'classroom', state: state({ phase: 'raid' }), reports: {} });
    expect((seen.at(-1) as Extract<ServerMsg, { t: 'classroom' }>).state.phase).toBe('raid');
  });
});
