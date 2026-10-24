import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { devURL, join, Peer, request, sleep, until } from './common.ts';

const output = `qa/artifacts/protocol-${new Date().toISOString().replace(/[:.]/g, '-')}`;
mkdirSync(output, { recursive: true });
const results: { name: string; status: string; detail?: string }[] = [];
const peers: Peer[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); }
  catch (error) { const detail = String(error); results.push({ name, status: 'FAIL', detail }); console.log(`FAIL ${name}: ${detail}`); }
}
const base = devURL();
const ws = new URL('/ws', base); ws.protocol = 'ws:';
const { room } = await (await request('/api/room', 'POST')).json() as { room: string };
const connect = async (resume?: string) => {
  const client = await join(ws.href, room, resume); peers.push(client.peer); return client;
};
try {
  let owner = await connect();
  const identity = owner.welcome.you;
  const token = owner.welcome.token;
  await check('lobby resume preserves identity and selected kit', async () => {
    owner.peer.send({ t: 'setRepo', repo: 'pallets/flask' });
    owner.peer.send({ t: 'setBoss', repo: 'pallets/flask' });
    await until(() => owner.peer.lobby()?.players[0]?.status === 'ready' && owner.peer.lobby()?.boss.status === 'ready', 'ready', 30000);
    await owner.peer.close(); owner = await connect(token);
    assert.equal(owner.welcome.you, identity);
    assert.equal(owner.peer.lobby()?.players[0].kit?.repo, 'pallets/flask');
  });
  await check('repo/boss spam keeps latest request; invalid and 200KB slugs recover', async () => {
    for (const repo of ['', '../secret', 'x/'.padEnd(200000, 'x'), 'pallets/flask']) {
      owner.peer.send({ t: 'setRepo', repo }); owner.peer.send({ t: 'setBoss', repo });
    }
    await sleep(150); // Await this batch's processing, not an earlier ready lobby.
    await until(() => owner.peer.lobby()?.players[0]?.status === 'ready' && owner.peer.lobby()?.boss.status === 'ready', 'latest ready', 30000);
    assert.equal(owner.peer.lobby()?.players[0].repo, 'pallets/flask');
    assert.equal(owner.peer.lobby()?.boss.repo, 'pallets/flask');
  });
  await check('eight humans replace seven bots; ninth human rejected', async () => {
    owner.peer.send({ t: 'setBots', count: 7 });
    await until(() => owner.peer.lobby()?.players.filter(p => p.bot && p.status === 'ready').length === 7, 'seven bots ready', 30000);
    for (let i = 1; i < 8; i++) await connect();
    await until(() => owner.peer.lobby()?.players.length === 8 && owner.peer.lobby()?.players.every(p => !p.bot), 'eight humans');
    owner.peer.send({ t: 'setBots', count: 7 }); await sleep(100);
    assert.equal(owner.peer.lobby()?.players.length, 8);
    const ninth = new Peer(ws.href); peers.push(ninth);
    await until(() => ninth.socket.readyState === 1, 'ninth open');
    ninth.send({ t: 'hello', room, role: 'player', name: 'QA ninth' });
    await until(() => ninth.messages.some(m => m.t === 'error' && /full/i.test(m.message)), 'room full error');
    await ninth.close();
  });
  await check('owner leaving transfers control; former owner resume keeps identity', async () => {
    const successor = peers.find(p => p !== owner.peer && p.socket.readyState === 1)!;
    await owner.peer.close();
    await until(() => !!successor.lobby()?.ownerId && successor.lobby()?.ownerId !== identity, 'new owner');
    owner = await connect(token);
    assert.equal(owner.welcome.you, identity);
    assert.notEqual(owner.peer.lobby()?.ownerId, identity);
    // Disconnect everyone else, restoring the configured owner without changing rooms.
    for (const p of peers) if (p !== owner.peer) await p.close();
    await until(() => owner.peer.lobby()?.ownerId === identity, 'owner restored');
  });
  await check('malformed JSON/message fuzz leaves socket and lobby usable', async () => {
    for (const value of ['{', 'null', '[]', '{}', '{"t":123}', '{"t":"input","frame":null}', '{"t":"setBots","count":"7"}', '{"t":"wat"}', '{"t":"setRepo","repo":null}', '{"t":"setBoss","repo":{}}']) owner.peer.raw(value);
    owner.peer.send({ t: 'setRepo', repo: 'pallets/flask' });
    owner.peer.send({ t: 'setBoss', repo: 'pallets/flask' });
    await sleep(150);
    await until(() => owner.peer.lobby()?.players[0]?.status === 'ready' && owner.peer.lobby()?.boss.status === 'ready', 'fuzz recovery', 30000);
    assert.equal(owner.peer.socket.readyState, 1);
  });
  await check('start double-click/spam creates one progressing match', async () => {
    for (let i = 0; i < 15; i++) owner.peer.send({ t: 'start' });
    await until(() => !!owner.peer.snapshot(), 'initial snapshot');
    const t = owner.peer.snapshot()!.state.t; await sleep(500);
    assert.ok(owner.peer.snapshot()!.state.t > t);
    assert.equal(owner.peer.lobby()?.phase, 'match');
  });
  await check('mid-match resume restores player and advances input ack', async () => {
    await owner.peer.close(); owner = await connect(token);
    assert.equal(owner.welcome.you, identity);
    await until(() => owner.peer.snapshot()?.state.players.some(p => p.id === identity), 'resumed snapshot');
    owner.peer.send({ t: 'input', frame: { seq: 101, move: [1, 0], aim: null, fire: true, dash: false, skill: false, source: 'keyboard' } });
    await until(() => owner.peer.snapshot()?.ack === 101, 'input ack');
  });
  await check('sleep/stalled input idles movement and fire after 300ms', async () => {
    await sleep(700);
    const state = owner.peer.snapshot()!.state;
    const player = state.players.find(p => p.id === identity)!;
    assert.equal(player.vx, 0); assert.equal(player.vy, 0);
    const position = [player.x, player.y]; await sleep(300);
    const later = owner.peer.snapshot()!.state.players.find(p => p.id === identity)!;
    assert.deepEqual([later.x, later.y], position);
  });
  await check('malformed aim is ignored without stopping a live match', async () => {
    await until(() => owner.peer.snapshot()?.state.status === 'fighting', 'fighting (past countdown)');
    owner.peer.clear();
    owner.peer.raw({ t: 'input', frame: { seq: 102, move: [0, 0], aim: {}, fire: true, dash: false, skill: false, source: 'keyboard' } });
    await sleep(500);
    assert.ok(owner.peer.received > 0);
    const error = owner.peer.messages.find(m => m.t === 'error' && /Match stopped/.test(m.message));
    assert.equal(error, undefined, error?.t === 'error' ? error.message : 'No match-stopped error expected');
    assert.equal(owner.peer.lobby()?.phase ?? 'match', 'match');
  });
} finally {
  for (const p of peers) await p.close();
  writeFileSync(`${output}/summary.json`, JSON.stringify({ target: base.origin, room, results, note: 'Bounded protocol probes; no real auth, sensors or heap instrumentation.' }, null, 2));
  console.log(`Evidence: ${output}/summary.json`);
}
if (results.some(result => result.status === 'FAIL')) process.exitCode = 1;
