import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fixture } from './fixture.ts';
import { until } from './common.ts';

const output = `qa/artifacts/soak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const accelerated = process.env.QA_REALTIME !== '1';
const wallStart = Date.now();
mkdirSync(output, { recursive: true });
const active = new Set<ReturnType<typeof setInterval>>();
const originalSet = globalThis.setInterval;
const originalClear = globalThis.clearInterval;
globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
  const timer = originalSet(...args); active.add(timer); return timer;
}) as typeof setInterval;
globalThis.clearInterval = ((timer: ReturnType<typeof setInterval>) => {
  active.delete(timer); originalClear(timer);
}) as typeof clearInterval;
const samples: { match: number; duration: number; activeMatchIntervals: number; heapUsed: number; rss: number; snapshots: number }[] = [];
const server = await fixture({ accelerated });
try {
  let client = await server.connect();
  const token = client.welcome.token;
  client.peer.send({ t: 'setRepo', repo: 'pallets/flask' }); client.peer.send({ t: 'setBoss', repo: 'pallets/flask' });
  await until(() => client.peer.lobby()?.boss.status === 'ready' && client.peer.lobby()?.players[0]?.status === 'ready', 'ready');
  for (let i = 1; i <= 20; i++) {
    const snapshotsBefore = client.peer.snapshotCount;
    client.peer.clear(); client.peer.send({ t: 'start' });
    const autopsy = await until(() => {
      const error = client.peer.messages.find(m => m.t === 'error' && /Match stopped/.test(m.message));
      if (error?.t === 'error') throw new Error(error.message);
      return client.peer.messages.find(m => m.t === 'autopsy');
    }, 'natural defeat', accelerated ? 15000 : 90000);
    assert.equal(active.size, 0, 'All match intervals released');
    samples.push({ match: i, duration: autopsy.result.duration, activeMatchIntervals: active.size, snapshots: client.peer.snapshotCount - snapshotsBefore, ...(({ heapUsed, rss }) => ({ heapUsed, rss }))(process.memoryUsage()) });
    if (i % 5 === 0) {
      await client.peer.close(); client = await server.connect(token);
      await until(() => client.peer.messages.some(m => m.t === 'autopsy'), 'autopsy resumed');
    }
    client.peer.send({ t: 'rematch' }); await until(() => client.peer.lobby()?.phase === 'lobby', 'rematch');
    client.peer.clear(); globalThis.gc?.();
    const memory = process.memoryUsage();
    samples[i - 1].heapUsed = memory.heapUsed; samples[i - 1].rss = memory.rss;
    console.log(`Match ${i}/20: sim duration ${autopsy.result.duration.toFixed(2)}s, heap ${memory.heapUsed}, intervals ${active.size}`);
  }
  assert.equal(server.completed.length, 20);
} finally {
  await server.close();
  globalThis.setInterval = originalSet; globalThis.clearInterval = originalClear;
  const average = (list: typeof samples) => list.reduce((sum, s) => sum + s.heapUsed, 0) / Math.max(1, list.length);
  const report = { isolated: true, accelerated, actualRoomServerAndSim: true, explicitGC: !!globalThis.gc, complete: samples.length === 20, elapsedWallSeconds: (Date.now() - wallStart) / 1000,
    limits: accelerated ? '300 ticks per room step; no real wall-clock endurance, live Hall writes, DEV heap instrumentation or browser heap profiling.' : 'Real 30Hz room simulation, 20Hz WebSocket snapshots; isolated service without auth/Gemini/Hall persistence; does not profile DEV or browser heap.',
    samples, retainedHeapGrowthBytes: average(samples.slice(-5)) - average(samples.slice(0, 5)), remainingMatchIntervals: active.size };
  writeFileSync(`${output}/summary.json`, JSON.stringify(report, null, 2));
  console.log(`Completed ${samples.length} matches; remaining match intervals ${active.size}; mean retained-heap delta ${Math.round(report.retainedHeapGrowthBytes)} bytes; ${output}/summary.json`);
}
