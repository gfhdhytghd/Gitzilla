import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connect } from '../client/app/net.ts';

class Socket {
  static OPEN = 1;
  static all: Socket[] = [];
  readyState = 0;
  onopen?: () => void;
  onclose?: (event: { code: number }) => void;
  sent: string[] = [];
  constructor() { Socket.all.push(this); }
  send(value: string) { this.sent.push(value); }
  open() { this.readyState = 1; this.onopen?.(); }
  close(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
}
let visible: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers(); Socket.all = [];
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal('location', { protocol: 'http:', host: 'localhost:5175' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: (_: string, fn: () => void) => { visible = fn; },
    removeEventListener: () => { visible = undefined; },
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe.runIf(process.env.QA_REPRO === '1')('browser reconnect regressions (deterministic fake socket, actual net.ts)', () => {
  it('QA-UI-01: visibility wake must cancel pending retry before opening a socket', async () => {
    const conn = connect({ room: 'TEST', role: 'player', name: 'QA' });
    try {
      Socket.all[0].open(); Socket.all[0].close();
      visible?.(); Socket.all[1].open();
      await vi.advanceTimersByTimeAsync(501);
      expect(Socket.all).toHaveLength(2);
    } finally { conn.close(); }
  });
  it('QA-UI-02: displaced tab must not reconnect after resume takeover close 4001', async () => {
    const conn = connect({ room: 'TEST', role: 'player', name: 'QA' });
    try {
      Socket.all[0].open(); Socket.all[0].close(4001);
      await vi.advanceTimersByTimeAsync(501);
      expect(Socket.all).toHaveLength(1);
    } finally { conn.close(); }
  });
});
