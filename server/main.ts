import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import https from 'node:https';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { analyzeRepo, listFallbackRepos, offlineProfile } from '../analysis/index.ts';
import { playerKitFromProfile, bossKitFromProfile, createMatch } from '../sim/index.ts';
import { designHero, designBoss, fallbackHero, fallbackBoss, applyHeroDesign, applyBossDesign } from '../design/index.ts';
import { recordMatch, top } from '../hall/index.ts';
import { createBot } from '../sim/bots.ts';
import { RoomServer } from './rooms.ts';
import { qrSvg, qrTerminal } from './qr.ts';
import { lanAddresses, loadTls, urlHost } from './tls.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const production = process.env.NODE_ENV === 'production';
const addresses = lanAddresses();
const certificate = loadTls(root, process.env.REPO_KAIJU_HTTPS === '1', addresses);
const tls = !!certificate;
const server = certificate ? https.createServer(certificate) : http.createServer();
let redirect: http.Server | undefined;
let publicBase = '';
function printRoomQr(room: string) {
  const url = `${publicBase}/r/${room}`;
  console.log(`\n  Join room ${room}: ${url}`);
  console.log(qrTerminal(url));
  console.log(`  Big screen: ${url}?screen=1\n`);
}
const wss = new WebSocketServer({ noServer: true });
// Handle /ws ourselves: Vite also listens for upgrade events for its HMR socket.
server.on('upgrade', (request, socket, head) => {
  if (new URL(request.url || '/', 'http://localhost').pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request));
  } else if (production) socket.destroy();
});
const rooms = new RoomServer(wss, {
  analyzeRepo, listFallbackRepos, createMatch, createBot, botProfile: offlineProfile, recordMatch,
  playerKitFromProfile(profile) {
    const kit = playerKitFromProfile(profile);
    return applyHeroDesign(kit, fallbackHero(profile, kit));
  },
  bossKitFromProfile(profile, count, design) {
    const kit = bossKitFromProfile(profile, count);
    return applyBossDesign(kit, design ?? fallbackBoss(profile, kit));
  },
  async enhanceHeroKit(profile, kit) { return applyHeroDesign(kit, await designHero(profile, kit)); },
  async enhanceBossKit(profile, kit) { return applyBossDesign(kit, await designBoss(profile, kit)); },
});
const vite = production ? null : await (await import('vite')).createServer({
  root,
  server: { middlewareMode: true, hmr: { server } },
  appType: 'spa',
});

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.map': 'application/json',
};
function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data));
}
async function serveDist(pathname: string, req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { error: 'Method not allowed' }); return; }
  const dist = resolve(root, 'dist');
  let path = resolve(dist, `.${decodeURIComponent(pathname)}`);
  if (!path.startsWith(dist + sep) && path !== dist) { json(res, 403, { error: 'Invalid path' }); return; }
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) path = resolve(dist, 'index.html');
  const file = await stat(path).catch(() => null);
  if (!file?.isFile()) { json(res, 503, { error: 'Client build missing. Run npm run build first.' }); return; }
  res.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Content-Length': file.size });
  if (req.method === 'HEAD') res.end();
  else createReadStream(path).on('error', () => res.destroy()).pipe(res);
}
server.on('request', (req, res) => {
  void (async () => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/api/room' && req.method === 'POST') {
      req.resume();
      const room = rooms.createRoom();
      printRoomQr(room);
      json(res, 201, { room });
      return;
    }
    if (url.pathname === '/api/fallbacks' && req.method === 'GET') { json(res, 200, listFallbackRepos()); return; }
    if (url.pathname === '/api/qr' && req.method === 'GET') {
      const text = url.searchParams.get('text');
      if (!text) { json(res, 400, { error: 'Provide text to encode' }); return; }
      const svg = qrSvg(text);
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }); res.end(svg); return;
    }
    if (url.pathname === '/api/hall' && req.method === 'GET') { json(res, 200, top()); return; }
    if (url.pathname.startsWith('/api/')) { json(res, 404, { error: 'API route not found' }); return; }
    if (vite) vite.middlewares(req, res, () => { res.writeHead(404); res.end('Not found'); });
    else await serveDist(url.pathname, req, res);
  })().catch(error => {
    console.error(error);
    if (!res.headersSent) json(res, 500, { error: error instanceof Error ? error.message : 'Server error' });
    else res.end();
  });
});

const port = Number(process.env.PORT || 5173);
server.listen(port, '0.0.0.0', () => {
  const actualPort = (server.address() as { port: number }).port;
  const protocol = tls ? 'https' : 'http';
  console.log(`\nRepo Kaiju ${production ? 'production' : 'development'} server`);
  console.log(`  Local: ${protocol}://localhost:${actualPort}`);
  for (const address of addresses) console.log(`  LAN:   ${protocol}://${urlHost(address)}:${actualPort}`);
  publicBase = process.env.PUBLIC_URL
    ? new URL(process.env.PUBLIC_URL).origin
    : `${protocol}://${urlHost(addresses[0] || 'localhost')}:${actualPort}`;
  if (process.env.PUBLIC_URL) console.log(`  Public: ${publicBase}`);
  console.log(`  WebSocket: ${tls ? 'wss' : 'ws'}://<host>:${actualPort}/ws`);
  if (certificate?.generated) console.log(`  Phone certificate: ${certificate.certPath} (install and trust on iOS for motion permissions)`);
  printRoomQr(rooms.createRoom());
  if (tls && process.env.HTTP_REDIRECT_PORT !== '0') {
    const redirectPort = Number(process.env.HTTP_REDIRECT_PORT || 5180);
    redirect = http.createServer((req, res) => {
      req.resume();
      const target = new URL(`https://${req.headers.host || 'localhost'}`);
      const source = new URL(req.url || '/', 'http://localhost');
      target.port = String(actualPort); target.pathname = source.pathname; target.search = source.search;
      res.writeHead(308, { Location: target.href }); res.end();
    });
    redirect.on('error', error => console.log(`  Optional HTTP redirect unavailable: ${error.message}`));
    redirect.listen(redirectPort, '0.0.0.0', () => console.log(`  HTTP redirect: http://<host>:${redirectPort} -> ${protocol}://<host>:${actualPort}`));
  }
});
server.on('error', error => { console.error('Server failed:', error.message); process.exitCode = 1; void shutdown(); });
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  rooms.close(); wss.close();
  redirect?.close(); redirect?.closeAllConnections();
  server.close(); server.closeAllConnections();
  await vite?.close();
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
