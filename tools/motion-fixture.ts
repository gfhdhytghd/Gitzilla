/** Tools-only test server. Production imports no part of this module. */
import http from 'node:http';
import https from 'node:https';
import { WebSocketServer } from 'ws';
import { RoomServer, type Match } from '../server/rooms';
import { TraceStore, handleTraceRoute } from '../server/traces';
import { offlineProfile, listFallbackRepos } from '../analysis';
import { createMatch, playerKitFromProfile, bossKitFromProfile } from '../sim';
import { createBot } from '../sim/bots';
import { applyHeroDesign, applyBossDesign, fallbackHero, fallbackBoss } from '../design';
import { buildGenesis } from '../genesis';
import type { InputFrame, MatchState } from '../shared/types';
import { playtestBaseURL } from './playtest';

export function requireMotionFixtureEnvironment(environment = process.env.NODE_ENV): void {
  if (environment === 'production') throw new Error('Motion proof protection is test-only and cannot run with NODE_ENV=production');
}

/** Mutates the real simulation BEFORE each step, never a client snapshot or WS frame.
 * Kept here rather than shipping a god-mode message/flag in the production server.
 * ArenaMatch.state is an ordinary TS-private field; fail loudly if that seam changes. */
export function protectMotionProofPlayer(match: Match, playerId: string): Match {
  requireMotionFixtureEnvironment();
  const engine = match as unknown as { state?: MatchState };
  if (!engine.state?.players.some(player => player.id === playerId)) throw new Error('Real simulation state missing for motion proof protection');
  return {
    step(dt: number, inputs: Map<string, InputFrame>) {
      const player = engine.state!.players.find(candidate => candidate.id === playerId);
      if (player) player.invuln = 3600;
      match.step(dt, inputs);
    },
    snapshot: () => match.snapshot(), autopsy: () => match.autopsy(),
    get over() { return match.over; },
    removePlayer: id => match.removePlayer?.(id),
  };
}

/** Frozen staging UI + real isolated room/simulation/trace services on loopback port0.
 * No .env, auth credentials, Gemini calls, shared-room writes or shared-server changes. */
export async function startMotionFixture(appBase: string, traceDirectory: string) {
  requireMotionFixtureEnvironment();
  const upstream = new URL(playtestBaseURL(appBase));
  if (!['localhost', '127.0.0.1', '[::1]'].includes(upstream.hostname)) throw new Error('Motion fixture UI must come from loopback DEV/staging');
  const server = http.createServer();
  const wss = new WebSocketServer({ server, path: '/ws' });
  const protectedPlayers: string[] = [];
  const rooms = new RoomServer(wss, {
    analyzeRepo: async slug => {
      if (!listFallbackRepos().some(repo => repo.toLowerCase() === slug.toLowerCase())) throw new Error('Motion fixture accepts bundled public profiles only');
      return offlineProfile(slug);
    },
    listFallbackRepos, buildGenesis, createBot, botProfile: offlineProfile,
    playerKitFromProfile(profile, options) {
      const kit = playerKitFromProfile(profile, options); return applyHeroDesign(kit, fallbackHero(profile, kit));
    },
    bossKitFromProfile(profile, count, design) {
      const kit = bossKitFromProfile(profile, count); return applyBossDesign(kit, design ?? fallbackBoss(profile, kit));
    },
    createMatch(players, boss, options) {
      if (options?.mode !== 'battle' || !boss) throw new Error('Motion proof fixture supports battle only');
      const player = players.find(candidate => candidate.name === 'motion-v3');
      if (!player) throw new Error('Harness player missing; protection will not fall back to another player');
      protectedPlayers.push(player.id);
      return protectMotionProofPlayer(createMatch(players, boss, { mode: 'battle' }), player.id);
    },
  });
  const traces = new TraceStore(traceDirectory);
  const json = (res: http.ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value));
  };
  server.on('request', (req, res) => {
    void (async () => {
      const url = new URL(req.url || '/', 'http://localhost');
      if (await handleTraceRoute(req, res, url.pathname, traces)) return;
      if (url.pathname === '/api/room' && req.method === 'POST') {
        req.resume();
        if (url.searchParams.get('mode') && url.searchParams.get('mode') !== 'battle') { json(res, 400, { error: 'Battle proof only' }); return; }
        json(res, 201, { room: rooms.createRoom() }); return;
      }
      if (url.pathname.startsWith('/api/room/') && req.method === 'GET') {
        json(res, 200, rooms.roomInfo(decodeURIComponent(url.pathname.slice('/api/room/'.length)).toUpperCase())); return;
      }
      if (url.pathname === '/api/fallbacks') { json(res, 200, listFallbackRepos()); return; }
      // UI, fonts, QR and read-only ancillary routes are served by the frozen app.
      // Room creation, /ws and trace storage above never reach the staging backend.
      const destination = new URL(req.url || '/', upstream);
      const transport = destination.protocol === 'https:' ? https : http;
      const forwarded = transport.request(destination, { method: req.method, headers: { ...req.headers, host: destination.host } }, response => {
        res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
      });
      forwarded.on('error', error => { if (!res.headersSent) json(res, 502, { error: `Frozen UI unavailable: ${error.message}` }); else res.destroy(error); });
      req.pipe(forwarded);
    })().catch(error => { if (!res.headersSent) json(res, 500, { error: String(error) }); else res.destroy(); });
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Motion fixture missing loopback port');
  return {
    url: `http://127.0.0.1:${address.port}`,
    appBase: upstream.href.replace(/\/$/, ''), protectedPlayers,
    protection: 'tools-only real simulation invulnerability for motion-v3 player; no production hook',
    async close() {
      rooms.close();
      for (const socket of wss.clients) socket.terminate();
      await new Promise<void>(resolve => wss.close(() => resolve()));
      await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    },
  };
}
