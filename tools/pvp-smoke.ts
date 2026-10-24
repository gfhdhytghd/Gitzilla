/** Local browser acceptance with synthetic GitHub identities, never production credentials. */
import http from 'node:http';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { RoomServer } from '../server/rooms';
import { profileFromFiles } from '../analysis/graph';
import { playerKitFromProfile, bossKitFromProfile, createMatch } from '../sim';
let fast = false;
const server = http.createServer(), wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => { if (req.url === '/ws') wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req)); });
const rooms = new RoomServer(wss, {
  analyzeRepo: async slug => profileFromFiles(slug, [{ path: 'main.py', text: 'print("hello")' }]),
  listFallbackRepos: () => [], playerKitFromProfile, bossKitFromProfile,
  getGithubToken: async req => req.headers.cookie?.includes('identity=bob') ? 'bob' : 'alice',
  verifyPvpAccess: async (repo, token) => ({ userId: token === 'alice' ? 1 : 2, login: token, repo, private: false }),
  createMatch: (players, boss, opts) => { const match = createMatch(players, boss, opts); return { step: (dt, inputs) => { for (let i = 0; i < (fast ? 30 : 1); i++) match.step(dt, inputs); }, snapshot: () => match.snapshot(), autopsy: () => match.autopsy(), removePlayer: id => match.removePlayer(id), get over() { return match.over; } }; },
});
const vite = await createServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
server.on('request', (req, res) => {
  if (req.url === '/api/me') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ enabled: true, user: { login: 'fixture' } })); return; }
  if (req.url === '/api/me/repos') { res.setHeader('Content-Type', 'application/json'); res.end('[]'); return; }
  vite.middlewares(req, res);
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const room = rooms.createRoom(undefined, 'pvp');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
const errors: string[] = [], out = resolve('docs/shots/pvp'); mkdirSync(out, { recursive: true });
try {
  const aCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const bCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await bCtx.addCookies([{ name: 'identity', value: 'bob', url: base }]);
  for (const context of [aCtx, bCtx]) {
    await context.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/, r => r.abort());
    await context.addInitScript(() => {
      try { localStorage.setItem('gitzilla.onboarding.v1','1');localStorage.setItem('kaiju.name', 'Duelist'); } catch { /* Blank frames have no storage. */ }
      (window as any).states = [];
      const Native = window.WebSocket;
      window.WebSocket = class extends Native { constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); this.addEventListener('message', e => { const msg = JSON.parse(e.data); if (msg.t === 'welcome') (window as any).playerId = msg.you; if (msg.t === 'snapshot') (window as any).states.push(msg.state); }); } };
    });
    context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  }
  const a = await aCtx.newPage(), b = await bCtx.newPage();
  await a.goto(`${base}/r/${room}`); await b.goto(`${base}/r/${room}`);
  await a.getByTestId('player-repo-input').fill('alice/original'); await a.getByTestId('player-repo-submit').click();
  await b.getByTestId('player-repo-input').fill('bob/original'); await b.getByTestId('player-repo-submit').click();
  await a.getByTestId('start-match').waitFor();
  await a.waitForFunction(() => !(document.querySelector('[data-testid="start-match"]') as HTMLButtonElement)?.disabled);
  await a.waitForTimeout(1000);
  await a.screenshot({ path: `${out}/lobby.png` });
  await a.getByTestId('start-match').click();
  await a.waitForFunction(() => (window as any).states.some((s: any) => s.status === 'fighting'));
  await a.waitForFunction(() => !document.querySelector('.game.intro-on'));
  await a.waitForTimeout(3500);
  const firingStart = await a.evaluate(() => {
    const states = (window as any).states, id = (window as any).playerId;
    return { index: states.length, damage: states.at(-1).players.find((p: any) => p.id === id).stats.damage };
  });
  await a.keyboard.down('d'); await a.keyboard.down('j');
  try {
    await a.waitForFunction(({ index, damage }) => (window as any).states.slice(index).some((s: any) => {
      const id = (window as any).playerId, me = s.players.find((p: any) => p.id === id);
      return me && Math.hypot(me.vx, me.vy) > 0
        && (s.bullets.some((bullet: any) => bullet.owner === id) || me.stats.damage > damage);
    }), firingStart, { timeout: 5000 });
  } finally {
    await a.keyboard.up('d'); await a.keyboard.up('j');
  }
  const valid = await a.evaluate(() => { const s = (window as any).states; return s.length > 2 && s.every((x: any) => x.mode === 'pvp' && x.boss === null && x.players.length === 2) && s.some((x: any) => x.players.some((p: any) => p.vx > 0)); });
  if (!valid) throw new Error('Expected two-player PvP snapshots and keyboard movement');
  await b.setViewportSize({ width: 390, height: 844 }); await b.screenshot({ path: `${out}/phone-fight.png` });
  fast = true;
  await a.getByTestId('autopsy').waitFor({ timeout: 20000 });
  if (!(await a.locator('body').innerText()).includes('PVP RESULTS')) throw new Error('Missing duel results');
  await a.waitForTimeout(1000);
  await a.screenshot({ path: `${out}/results.png` });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ twoPlayerBattle: true, noBoss: true, keyboardMovement: true, simultaneousMoveAndAttack: true, results: true, pageErrors: 0, screenshots: out }));
} finally {
  await browser.close(); rooms.close(); await vite.close(); await new Promise<void>(r => wss.close(() => r())); await new Promise<void>(r => server.close(() => r()));
}
