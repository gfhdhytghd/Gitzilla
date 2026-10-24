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
  async function fixture(withErrors: boolean) {
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
   document.body.innerHTML = '<input data-testid="player-repo-input"><button data-testid="player-repo-submit">Repo</button><div data-testid="player-ready" data-status="empty">Player</div><input data-testid="boss-repo-input"><button data-testid="boss-repo-submit">Boss</button><div data-testid="boss-ready" data-status="empty">Boss status</div><button data-testid="start-match">Start</button>';
   for(const [test,t] of [['player-repo-submit','setRepo'],['boss-repo-submit','setBoss'],['start-match','start']]) document.querySelector('[data-testid="'+test+'"]').onclick=()=>ws.send(JSON.stringify({t}));
  };
  ws.onmessage = event => {
   const m=JSON.parse(event.data);
   if(m.t==='welcome') id=m.you;
   if(m.t==='welcome'||m.t==='lobby') {
    renderLobby(); const lobby=m.lobby;
    document.querySelector('[data-testid="player-ready"]').dataset.status=lobby.players.find(p=>p.id===id)?.status || 'empty';
    document.querySelector('[data-testid="boss-ready"]').dataset.status=lobby.boss.status;
   }
   if(m.t==='snapshot'&&!fighting) {
    fighting=true; document.body.innerHTML='<div data-testid="boss-intro">SYNTHETIC HARNESS FIXTURE</div><canvas data-testid="game-canvas" width="480" height="288"></canvas>';
    const ctx=document.querySelector('canvas').getContext('2d');ctx.fillStyle='#173d49';ctx.fillRect(0,0,480,288);ctx.fillStyle='#f7b844';ctx.fillRect(220,110,40,60);
    setTimeout(()=>document.querySelector('[data-testid="boss-intro"]')?.remove(),1500);
   }
   if(m.t==='autopsy') { fighting=false;document.body.innerHTML='<div data-testid="autopsy">SYNTHETIC AUTOPSY</div>'; }
  };
  setInterval(()=>{if(fighting&&ws.readyState===1) {ws.send(JSON.stringify({t:'input',frame:{seq:++seq,move:[Number(keys.has('KeyD'))-Number(keys.has('KeyA')),Number(keys.has('KeyS'))-Number(keys.has('KeyW'))],aim:null,fire:keys.has('KeyJ'),dash,skill,source:'keyboard'}}));dash=skill=false;}},50);
 };
}
</script>`);
      }
    });
    const wss = new WebSocketServer({ server, path: '/ws' });
    const sockets = new Map<WebSocket, { id: string; status: string; ack: number }>();
    let bossStatus = 'empty';
    let timer: ReturnType<typeof setInterval> | undefined;
    let endTimer: ReturnType<typeof setTimeout> | undefined;
    const lobby = () => ({ players: [...sockets.values()], boss: { status: bossStatus }, phase: 'lobby' });
    const send = (ws: WebSocket, message: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); };
    const broadcast = (message: unknown) => { for (const ws of sockets.keys()) send(ws, message); };
    wss.on('connection', ws => {
      ws.on('message', payload => {
        const m = JSON.parse(payload.toString());
        if (m.t === 'hello') {
          const player = { id: `fixture-${sockets.size + 1}`, status: 'empty', ack: -1 };
          sockets.set(ws, player);
          send(ws, { t: 'welcome', you: player.id, lobby: lobby() });
          if (withErrors) send(ws, { t: 'error', message: 'fixture protocol error' });
          broadcast({ t: 'lobby', lobby: lobby() });
        } else if (m.t === 'setRepo') { sockets.get(ws)!.status = 'ready'; broadcast({ t: 'lobby', lobby: lobby() }); }
        else if (m.t === 'setBoss') { bossStatus = 'ready'; broadcast({ t: 'lobby', lobby: lobby() }); }
        else if (m.t === 'input') sockets.get(ws)!.ack = m.frame.seq;
        else if (m.t === 'start') {
          const began = Date.now();
          timer = setInterval(() => {
            for (const [socket, p] of sockets) send(socket, { t: 'snapshot', state: { status: 'fighting', t: (Date.now() - began) / 1000 }, ack: p.ack });
          }, 50);
          endTimer = setTimeout(() => {
            clearInterval(timer);
            broadcast({ t: 'autopsy', result: { victory: true } });
          }, withErrors ? 1500 : 11_000);
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
      expect(await playtest({ players: 2, boss: 'pallets/flask', seconds: 13, headed: false })).toBe(0);
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
      expect([phone.readUInt32BE(16), phone.readUInt32BE(20)]).toEqual([844, 390]);
    } finally {
      console.log = originalLog;
      if (previousURL === undefined) delete process.env.PLAYTEST_URL;
      else process.env.PLAYTEST_URL = previousURL;
      await testServer.close();
    }
  }, 60_000);

  it('returns nonzero and logs uncaught page and WebSocket protocol errors', async () => {
    const testServer = await fixture(true);
    const previousURL = process.env.PLAYTEST_URL;
    process.env.PLAYTEST_URL = testServer.url;
    try {
      expect(await playtest({ players: 2, boss: 'pallets/flask', seconds: 3, headed: false })).toBe(1);
    } finally {
      if (previousURL === undefined) delete process.env.PLAYTEST_URL;
      else process.env.PLAYTEST_URL = previousURL;
      await testServer.close();
    }
  }, 40_000);
});
