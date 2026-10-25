// Tests the harness against an explicitly synthetic UI/protocol fixture, not the game.
// Opt in: PLAYTEST_SELF_TEST=1 npx vitest run tools/playtest.integration.test.ts
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { describe, expect, it } from 'vitest';
import { playtest } from './playtest';

const enabled = process.env.PLAYTEST_SELF_TEST === '1';
describe.skipIf(!enabled)('playtest browser self-test (synthetic fixture)', () => {
  async function fixture(withErrors: boolean, ending: { afterMs?: number; outroMs?: number } = {}) {
    const server = createServer((req, res) => {
      if (req.url === '/api/fallbacks') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(['pallets/flask', 'lodash/lodash']));
      } else {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#112;color:#bfc;font:20px monospace}canvas{width:75vw;height:50vh}</style><body><script>
const withErrors = ${withErrors};
if(withErrors) setTimeout(() => { console.error('fixture console error'); throw new Error('fixture uncaught page error'); }, 200);
if(location.pathname === '/') {
 document.body.innerHTML = '<button data-testid="create-room">Create</button>';
 document.querySelector('button').onclick = () => location.href = '/r/FIXT';
} else {
 document.body.innerHTML = '<input data-testid="player-name"><button data-testid="join-room">Join</button>';
 document.querySelector('button').onclick = () => {
  const name = document.querySelector('input').value;
  const ws = new WebSocket('ws://' + location.host + '/ws'); let id, seq=0, fighting=false; const keys=new Set(); let dash=false,skill=false;
  window.addEventListener('keydown', e => {keys.add(e.code); if(e.code==='Space')dash=true;if(e.code==='KeyE')skill=true;});
  window.addEventListener('keyup', e => keys.delete(e.code));
  ws.onopen = () => ws.send(JSON.stringify({t:'hello',name}));
  const renderLobby = () => {
   if(document.querySelector('[data-testid="player-repo-input"]')) return;
   document.body.innerHTML = '<button data-testid="mode-battle">Battle</button><button data-testid="mode-edu">Classroom PvP</button><input data-testid="player-repo-input"><button data-testid="player-repo-submit">Repo</button><div data-testid="player-ready" data-status="empty">Player</div><input data-testid="boss-repo-input"><button data-testid="boss-repo-submit">Boss</button><div data-testid="boss-ready" data-status="empty">Boss status</div><button data-testid="start-match">Start</button>';
   for(const mode of ['battle','edu']) document.querySelector('[data-testid="mode-'+mode+'"]').onclick=()=>ws.send(JSON.stringify({t:'setMode',mode}));
   for(const [test,t] of [['player-repo-submit','setRepo'],['boss-repo-submit','setBoss'],['start-match','start']]) document.querySelector('[data-testid="'+test+'"]').onclick=()=>ws.send(JSON.stringify({t}));
  };
  ws.onmessage = event => {
   const m=JSON.parse(event.data);
   if(m.t==='welcome') id=m.you;
   if(m.t==='welcome'||m.t==='lobby') {
    renderLobby(); const lobby=m.lobby;
    document.querySelector('[data-testid="player-ready"]').dataset.status=lobby.players.find(p=>p.id===id)?.status || 'empty';
    document.querySelector('[data-testid="boss-ready"]').dataset.status=lobby.boss.status;
    for(const id of ['boss-repo-input','boss-repo-submit','boss-ready']) document.querySelector('[data-testid="'+id+'"]').hidden=lobby.mode==='edu';
   }
   if(m.t==='snapshot'&&!fighting) {
    fighting=true; document.body.innerHTML='<div data-testid="boss-intro">SYNTHETIC HARNESS FIXTURE</div><canvas data-testid="game-canvas" width="480" height="288"></canvas>';
    const ctx=document.querySelector('canvas').getContext('2d');ctx.fillStyle='#173d49';ctx.fillRect(0,0,480,288);ctx.fillStyle='#f7b844';ctx.fillRect(220,110,40,60);
    setTimeout(()=>document.querySelector('[data-testid="boss-intro"]')?.remove(),1500);
   }
   if(m.t==='autopsy') { fighting=false;setTimeout(()=>{document.body.innerHTML='<div data-testid="autopsy">SYNTHETIC AUTOPSY</div>';},${ending.outroMs ?? 0}); }
  };
  setInterval(()=>{if(fighting&&ws.readyState===1) {ws.send(JSON.stringify({t:'input',frame:{seq:++seq,move:[Number(keys.has('KeyD'))-Number(keys.has('KeyA')),Number(keys.has('KeyS'))-Number(keys.has('KeyW'))],aim:null,fire:keys.has('KeyJ'),dash,skill,source:'keyboard'}}));dash=skill=false;}},50);
 };
}
</script>`);
      }
    });
    const wss = new WebSocketServer({ server, path: '/ws' });
    const sockets = new Map<WebSocket, { id: string; name: string; status: string; ack: number }>();
    let bossStatus = 'empty';
    let mode: 'battle' | 'edu' = 'battle';
    let timer: ReturnType<typeof setInterval> | undefined;
    let endTimer: ReturnType<typeof setTimeout> | undefined;
    const lobby = () => ({ players: [...sockets.values()], boss: { status: bossStatus }, phase: 'lobby', mode });
    const send = (ws: WebSocket, message: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); };
    const broadcast = (message: unknown) => { for (const ws of sockets.keys()) send(ws, message); };
    wss.on('connection', ws => {
      ws.on('message', payload => {
        const m = JSON.parse(payload.toString());
        if (m.t === 'hello') {
          const player = { id: `fixture-${sockets.size + 1}`, name: m.name, status: 'empty', ack: -1 };
          sockets.set(ws, player);
          send(ws, { t: 'welcome', you: player.id, lobby: lobby() });
          if (withErrors) send(ws, { t: 'error', message: 'fixture protocol error' });
          broadcast({ t: 'lobby', lobby: lobby() });
        } else if (m.t === 'setRepo') { sockets.get(ws)!.status = 'ready'; broadcast({ t: 'lobby', lobby: lobby() }); }
        else if (m.t === 'setMode') { mode = m.mode; broadcast({ t: 'lobby', lobby: lobby() }); }
        else if (m.t === 'setBoss') {
          if (mode === 'edu') send(ws, { t: 'error', message: 'Fixture: edu must never set a boss' });
          else { bossStatus = 'ready'; broadcast({ t: 'lobby', lobby: lobby() }); }
        }
        else if (m.t === 'input') sockets.get(ws)!.ack = m.frame.seq;
        else if (m.t === 'start') {
          const began = Date.now();
          timer = setInterval(() => {
            for (const [socket, p] of sockets) send(socket, { t: 'snapshot', state: { status: 'fighting', t: (Date.now() - began) / 1000,
              mode, boss: mode === 'edu' ? null : { hp: 100 }, heroScale: mode === 'edu' ? 2 : 1,
              pvp: mode === 'edu' ? { round: 1, rounds: 3, roundEndsAt: 75, scores: {}, leader: null } : null,
              players: [...sockets.values()].map(player => ({ id: player.id, kit: { quality: mode === 'edu'
                ? [{ stat: 'armor', grade: 'B', value: 5, signal: 'tests: 30%', tip: 'test parser' }] : undefined } })), events: [],
            }, ack: p.ack });
          }, 50);
          endTimer = setTimeout(() => {
            clearInterval(timer);
            broadcast({ t: 'autopsy', result: { victory: mode === 'battle', mode, boss: null, ranking: mode === 'edu'
              ? [...sockets.values()].map(p => ({ id: p.id, name: p.name, repo: 'fixture/repo', kos: 0, damage: 0, roundWins: 0, quality: [] })) : undefined } });
          }, ending.afterMs ?? (withErrors ? 1500 : mode === 'edu' ? 2500 : 11_000));
        }
      });
    });
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
    const address = server.address() as { port: number };
    return { url: `http://127.0.0.1:${address.port}`, async close() {
      clearInterval(timer); clearTimeout(endTimer);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>(done => wss.close(() => done()));
      await new Promise<void>(done => server.close(() => done()));
    } };
  }

  it('drives two isolated clients, captures both viewports and reaches natural fixture autopsy', async () => {
    const testServer = await fixture(false);
    const previousURL = process.env.PLAYTEST_URL;
    const originalLog = console.log;
    let artifactDir = '';
    console.log = (...args) => {
      originalLog(...args);
      const match = String(args[0]).match(/artifacts=(.*)$/);
      if (match) artifactDir = match[1];
    };
    process.env.PLAYTEST_URL = testServer.url;
    try {
      expect(await playtest({ players: 2, boss: 'pallets/flask', seconds: 13, headed: false, mode: 'battle' })).toBe(0);
      const summary = JSON.parse(readFileSync(join(artifactDir, 'summary.json'), 'utf8'));
      expect(summary.outcome).toBe('autopsy');
      for (const label of ['landing', 'lobby', 'boss-intro', 'mid-fight-010s', 'autopsy']) {
        for (const viewport of ['desktop', 'phone']) expect(summary.screenshots).toContain(`${label}-${viewport}.png`);
      }
      for (const client of summary.clients) {
        expect(client.moving).toBeGreaterThan(0);
        expect(client.firing).toBeGreaterThan(0);
        expect(client.dashes).toBeGreaterThan(0);
        expect(client.skills).toBeGreaterThan(0);
        expect(client.ack).toBeGreaterThan(0);
      }
      const desktop = readFileSync(join(artifactDir, 'landing-desktop.png'));
      const phone = readFileSync(join(artifactDir, 'landing-phone.png'));
      expect([desktop.readUInt32BE(16), desktop.readUInt32BE(20)]).toEqual([1280, 720]);
      expect([phone.readUInt32BE(16), phone.readUInt32BE(20)]).toEqual([1170, 2532]); // 390×844 CSS at DPR 3
    } finally {
      console.log = originalLog;
      if (previousURL === undefined) delete process.env.PLAYTEST_URL;
      else process.env.PLAYTEST_URL = previousURL;
      await testServer.close();
    }
  }, 60_000);

  it('waits for a delayed outro when the server autopsy arrives near the timed grace deadline', async () => {
    const testServer = await fixture(false, { afterMs: 6200, outroMs: 2500 });
    const previousURL = process.env.PLAYTEST_URL;
    const originalLog = console.log;
    let artifactDir = '';
    console.log = (...args) => {
      originalLog(...args);
      const match = String(args[0]).match(/artifacts=(.*)$/);
      if (match) artifactDir = match[1];
    };
    process.env.PLAYTEST_URL = testServer.url;
    try {
      expect(await playtest({ players: 2, boss: 'pallets/flask', seconds: 2, headed: false, mode: 'battle' })).toBe(0);
      const summary = JSON.parse(readFileSync(join(artifactDir, 'summary.json'), 'utf8'));
      expect(summary.outcome).toBe('autopsy');
      expect(summary.screenshots).toContain('autopsy-desktop.png');
      expect(summary.screenshots).toContain('autopsy-phone.png');
      expect(summary.clients.every((client: any) => client.autopsy)).toBe(true);
    } finally {
      console.log = originalLog;
      if (previousURL === undefined) delete process.env.PLAYTEST_URL;
      else process.env.PLAYTEST_URL = previousURL;
      await testServer.close();
    }
  }, 30_000);

  it('returns nonzero and logs uncaught page and WebSocket protocol errors', async () => {
    const testServer = await fixture(true);
    const previousURL = process.env.PLAYTEST_URL;
    process.env.PLAYTEST_URL = testServer.url;
    try {
      expect(await playtest({ players: 2, boss: 'pallets/flask', seconds: 3, headed: false, mode: 'battle' })).toBe(1);
    } finally {
      if (previousURL === undefined) delete process.env.PLAYTEST_URL;
      else process.env.PLAYTEST_URL = previousURL;
      await testServer.close();
    }
  }, 40_000);

  it('runs the cooperative preset/editor/class-attack flow without legacy battle controls', async () => {
    const testServer = await classroomFixture();
    const previousURL = process.env.PLAYTEST_URL;
    const originalLog = console.log;
    let artifactDir = '';
    console.log = (...args) => {
      originalLog(...args);
      const match = String(args[0]).match(/artifacts=(.*)$/);
      if (match) artifactDir = match[1];
    };
    process.env.PLAYTEST_URL = testServer.url;
    try {
      expect(await playtest({ players: 2, boss: 'unused/never-submit', seconds: 5, headed: false, mode: 'edu' })).toBe(0);
      const summary = JSON.parse(readFileSync(join(artifactDir, 'summary.json'), 'utf8'));
      expect(summary.outcome).toBe('round-debrief');
      expect(Object.values(summary.checks).every(Boolean)).toBe(true);
      expect(summary.clients.find((c: any) => c.role === 'teacher').controls).toEqual(['start', 'attack']);
      expect(summary.clients.filter((c: any) => c.role === 'student').every((c: any) => c.sent.classroomSubmitCode === 1)).toBe(true);
      expect(summary.clients.find((c: any) => c.role === 'teacher').classroom.bossHp).toBe(40);
      expect(summary.errors.page).toBe(0);
    } finally {
      console.log = originalLog;
      if (previousURL === undefined) delete process.env.PLAYTEST_URL;
      else process.env.PLAYTEST_URL = previousURL;
      await testServer.close();
    }
  }, 40_000);
});

// Explicitly synthetic browser contract for the current edu path. Real-game proof is a separate staging run.
async function classroomFixture() {
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body><script>
const root = location.pathname === '/';
const projector = location.search.includes('view=projector');
const teacher = !projector && location.search.includes('screen=1');
if(root) {
 document.body.innerHTML='<button data-testid="create-classroom">Classroom</button>';
 document.querySelector('button').onclick=()=>location.href='/r/FIXT?screen=1';
} else {
 const connect = name => {
  const ws = new WebSocket('ws://'+location.host+'/ws');
  const btn=(id,label,t,rest={})=>{const b=document.createElement('button');b.dataset.testid=id;b.textContent=label;b.onclick=()=>ws.send(JSON.stringify({t,...rest}));return b;};
  const main=document.createElement('main');main.dataset.testid='classroom-screen';main.style.minHeight='80px';main.textContent='SYNTHETIC CLASSROOM FIXTURE';document.body.replaceChildren(main);
  let score, debrief;
  if(teacher) {
   main.innerHTML='<select data-testid="classroom-preset-select"><option>01-hello</option></select>';
   main.append(btn('classroom-preset-load','Load','fixtureLoad'),btn('classroom-save-plan','Publish','classroomPlan'));
   const open=btn('classroom-open-projector','Projector','fixtureProjector');open.onclick=()=>window.open('/r/FIXT?screen=1&view=projector');main.append(open);
   main.append(btn('classroom-start','Open step 1','classroomControl',{action:'start'}),btn('classroom-attack','Launch class attack','classroomControl',{action:'attack'}));
  } else if(!projector) {
   main.innerHTML='<textarea data-testid="code-editor-input"></textarea>';
   main.append(btn('classroom-submit-code','Submit my code','classroomSubmitCode'));
   score=document.createElement('strong');score.dataset.testid='classroom-own-score';score.hidden=true;score.textContent='100';main.append(score);
  }
  if(teacher||projector){debrief=document.createElement('section');debrief.dataset.testid='classroom-debrief';debrief.hidden=true;debrief.innerHTML='<h2>Round debrief</h2><p data-testid="classroom-debrief-headline">2 of 2 submitted</p>';main.append(debrief);}
  ws.onopen=()=>ws.send(JSON.stringify({t:'hello',name,role:teacher?'teacher':projector?'projector':'student'}));
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.t==='classroom'){if(score)score.hidden=!m.reports[id];if(debrief)debrief.hidden=m.state.phase!=='feedback';}if(m.t==='welcome')id=m.you;};let id;
 };
 if(teacher||projector)connect(projector?'Projector':'Teacher');
 else {document.body.innerHTML='<input data-testid="player-name"><button data-testid="join-room">Join</button>';document.querySelector('button').onclick=()=>connect(document.querySelector('input').value);}
}
</script>`);
  });
  const wss = new WebSocketServer({ server, path: '/ws' });
  const peers = new Map<WebSocket, { id: string; name: string; role: string }>();
  const reports: Record<string, unknown> = {};
  const state = { phase: 'setup', stepIndex: 0, bossHp: 60, bossMaxHp: 60, plan: { steps: [{ id: 'unpublished' }] },
    rows: [] as { id: string; name: string; connected: boolean; status: string }[], rounds: [] as unknown[] };
  const send = (ws: WebSocket, msg: unknown) => ws.send(JSON.stringify(msg));
  const broadcast = () => { for (const ws of peers.keys()) send(ws, { t: 'classroom', state, reports }); };
  let timer: ReturnType<typeof setTimeout> | undefined;
  wss.on('connection', ws => ws.on('message', payload => {
    const msg = JSON.parse(payload.toString());
    if (msg.t === 'hello') {
      const peer = { id: String(peers.size + 1), name: msg.name, role: msg.role }; peers.set(ws, peer);
      if (msg.role === 'student') state.rows.push({ ...peer, connected: true, status: 'empty' });
      send(ws, { t: 'welcome', you: peer.id, lobby: { classroom: state } });
    } else if (msg.t === 'classroomPlan') state.plan.steps = [1, 2, 3].map(i => ({ id: `01-hello-${i}` }));
    else if (msg.t === 'classroomSubmitCode') {
      const id = peers.get(ws)!.id; state.rows.find(row => row.id === id)!.status = 'submitted'; reports[id] = { source: 'in-app', score: 100 };
    } else if (msg.t === 'classroomControl' && msg.action === 'start') state.phase = 'coding';
    else if (msg.t === 'classroomControl' && msg.action === 'attack') {
      state.phase = 'raid'; state.bossHp = 40;
      state.rounds.push({ bossBefore: 60, bossAfter: 40, attacks: state.rows.map(row => ({ id: row.id })) });
      timer = setTimeout(() => { state.phase = 'feedback'; broadcast(); }, 1000);
    }
    broadcast();
  }));
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, async close() {
    clearTimeout(timer); for (const ws of wss.clients) ws.terminate();
    await new Promise<void>(done => wss.close(() => done()));
    await new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); });
  } };
}
