import { mkdirSync, writeFileSync } from 'node:fs';
import { devURL, join, type Peer, request, sleep, until } from './common.ts';

const base = devURL(); const socketURL = new URL('/ws', base); socketURL.protocol = 'ws:';
const botCount = Number(process.env.QA_BOTS || 0);
if (!Number.isInteger(botCount) || botCount < 0 || botCount > 7) throw new Error('QA_BOTS must be 0..7');
const humanCount = 8 - botCount;
const output = `qa/artifacts/snapshot-rate-${new Date().toISOString().replace(/[:.]/g, '-')}`;
mkdirSync(output, { recursive: true });
const peers: Peer[] = [];
let timer: ReturnType<typeof setInterval> | undefined;
let result: Record<string, unknown> = {};
try {
  const { room } = await (await request('/api/room', 'POST')).json() as { room: string };
  for (let i = 0; i < humanCount; i++) peers.push((await join(socketURL.href, room)).peer);
  for (const peer of peers) peer.send({ t: 'setRepo', repo: 'pallets/flask' });
  peers[0].send({ t: 'setBoss', repo: 'pallets/flask' });
  if (botCount) peers[0].send({ t: 'setBots', count: botCount });
  await sleep(100);
  await until(() => peers[0].lobby()?.players.length === 8 && peers[0].lobby()?.players.every(p => p.status === 'ready') && peers[0].lobby()?.boss.status === 'ready', 'eight ready squad members', 30000);
  peers[0].send({ t: 'start' });
  await until(() => peers.every(p => !!p.snapshot()), 'eight snapshots');
  const starts = peers.map(p => ({ t: p.snapshot()!.state.t, count: p.snapshotCount }));
  const wall = Date.now(); let seq = 0;
  timer = setInterval(() => {
    seq++;
    for (const peer of peers) peer.send({ t: 'input', frame: { seq, move: [0, 0], aim: null, fire: true, dash: seq % 30 === 0, skill: seq % 60 === 0, source: 'keyboard' } });
  }, 1000 / 30);
  await sleep(5000); clearInterval(timer);
  const wallSeconds = (Date.now() - wall) / 1000;
  const clients = peers.map((p, i) => ({ simulationSeconds: p.snapshot()!.state.t - starts[i].t, snapshots: p.snapshotCount - starts[i].count, ack: p.snapshot()!.ack }));
  const errors = peers.flatMap(p => p.messages.flatMap(m => m.t === 'error' ? [m.message] : []));
  const success = errors.length === 0 && clients.every(p => p.simulationSeconds >= 4 && p.snapshots >= 50 && p.ack > 0);
  result = { target: base.origin, room, humans: humanCount, bots: botCount, success, wallSeconds, clients, errors, limits: 'Shared DEV, not a controlled benchmark; coordinator activity can affect scheduling.' };
  console.log(JSON.stringify(result)); if (!success) process.exitCode = 1;
} catch (error) { result = { ...result, failure: String(error) }; console.log(String(error)); process.exitCode = 1; }
finally {
  clearInterval(timer); for (const p of peers) await p.close();
  writeFileSync(`${output}/summary.json`, JSON.stringify(result, null, 2)); console.log(`Evidence: ${output}/summary.json`);
}
