import { afterEach, describe, expect, it, vi } from 'vitest';
import { devURL, sleep, until } from './common.ts';
import { fixture } from './fixture.ts';

afterEach(() => vi.restoreAllMocks());

describe('QA target boundary', () => {
  it('accepts only loopback DEV port 5175 before making requests', () => {
    expect(devURL().origin).toBe('http://localhost:5175');
    for (const target of ['http://localhost:5173', 'https://gitzilla.wilflin.me', 'http://example.com:5175', 'https://localhost:5175', 'http://localhost:5175@gitzilla.wilflin.me', 'http://user:pass@localhost:5175']) {
      expect(() => devURL(target)).toThrow('live targets are forbidden');
    }
  });
});

describe('real RoomServer and simulation lifecycle (offline fixture)', () => {
  it('finishes 20 accelerated matches, resumes real autopsies, retains kits, and releases match intervals', async () => {
    const activeIntervals = new Set<ReturnType<typeof setInterval>>();
    const originalSet = globalThis.setInterval;
    const originalClear = globalThis.clearInterval;
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((...args: Parameters<typeof setInterval>) => {
      const handle = originalSet(...args); activeIntervals.add(handle); return handle;
    }) as typeof setInterval);
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(((handle: ReturnType<typeof setInterval>) => {
      activeIntervals.delete(handle); originalClear(handle);
    }) as typeof clearInterval);
    const server = await fixture({ accelerated: true });
    try {
      let client = await server.connect();
      const token = client.welcome.token; const id = client.welcome.you;
      client.peer.send({ t: 'setRepo', repo: 'pallets/flask' });
      client.peer.send({ t: 'setBoss', repo: 'pallets/flask' });
      await until(() => client.peer.lobby()?.boss.status === 'ready' && client.peer.lobby()?.players[0]?.status === 'ready', 'ready');
      for (let i = 0; i < 20; i++) {
        client.peer.clear(); client.peer.send({ t: 'start' });
        await until(() => client.peer.messages.some(m => m.t === 'autopsy'), `natural sim autopsy ${i + 1}`, 10000);
        expect(server.completed).toHaveLength(i + 1);
        expect(activeIntervals.size).toBe(0);
        expect(client.peer.lobby()?.phase).toBe('autopsy');
        if (i === 0 || i === 19) {
          await client.peer.close(); client = await server.connect(token);
          expect(client.welcome.you).toBe(id);
          await until(() => client.peer.messages.some(m => m.t === 'autopsy'), 'replayed autopsy');
          expect(client.peer.messages.find(m => m.t === 'snapshot')?.state.events).toEqual([]);
        }
        client.peer.send({ t: 'rematch' });
        await until(() => client.peer.lobby()?.phase === 'lobby', 'rematch lobby');
        expect(client.peer.lobby()?.players[0]?.kit?.repo).toBe('pallets/flask');
      }
      expect(server.created()).toBe(20);
      console.log(JSON.stringify({ qa: '20 real-sim accelerated defeats', matches: server.completed.length, activeMatchIntervals: activeIntervals.size, heapUsed: process.memoryUsage().heapUsed }));
    } finally { await server.close(); }
    expect(activeIntervals.size).toBe(0);
  }, 90000);

  it.runIf(process.env.QA_REPRO === '1')('QA-NET-01: malformed aim must not stop the match', async () => {
    const server = await fixture();
    try {
      const { peer } = await server.connect();
      peer.send({ t: 'setRepo', repo: 'pallets/flask' }); peer.send({ t: 'setBoss', repo: 'pallets/flask' });
      await until(() => peer.lobby()?.boss.status === 'ready' && peer.lobby()?.players[0]?.status === 'ready', 'ready');
      peer.send({ t: 'start' }); await until(() => !!peer.snapshot(), 'match');
      await until(() => peer.snapshot()?.state.status === 'fighting', 'countdown complete');
      peer.raw({ t: 'input', frame: { seq: 1, move: [0, 0], aim: {}, fire: true, dash: false, skill: false, source: 'keyboard' } });
      await sleep(200);
      expect(peer.messages.filter(m => m.t === 'error')).toEqual([]);
      expect(peer.lobby()?.phase).toBe('match');
    } finally { await server.close(); }
  });

  it('nonnumeric aim arrays retain finite facing coordinates', async () => {
    const startedAt = performance.now();
    const trace = (stage: string) => {
      if (process.env.QA_TRACE_FIXTURE === '1') console.info(JSON.stringify({ qa: 'nonnumeric-aim', stage, elapsedMs: Math.round(performance.now() - startedAt) }));
    };
    const server = await fixture({ trace });
    trace('listening');
    try {
      const { peer } = await server.connect();
      trace('joined');
      peer.send({ t: 'setRepo', repo: 'pallets/flask' }); peer.send({ t: 'setBoss', repo: 'pallets/flask' });
      await until(() => peer.lobby()?.boss.status === 'ready' && peer.lobby()?.players[0]?.status === 'ready', 'ready');
      trace('ready');
      peer.send({ t: 'start' });
      await until(() => peer.snapshot()?.state.status === 'fighting', 'fighting');
      trace('fighting');
      peer.raw({ t: 'input', frame: { seq: 2, move: [0, 0], aim: ['oops', 0], fire: true, dash: false, skill: false, source: 'keyboard' } });
      await until(() => peer.snapshot()?.ack === 2, 'malformed frame processed');
      trace('acknowledged');
      await sleep(100); // Ack can be published before the next simulation tick.
      expect(peer.snapshot()!.state.players.every(p => p.facing.every(Number.isFinite))).toBe(true);
      trace('asserted');
    } finally { await server.close(); trace('closed'); }
    expect(server.status()).toEqual({ listening: false, webSockets: 0 });
  });
});
