import http from 'node:http';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { offlineProfile } from '../analysis/index.ts';
import { bossKitFromProfile, createMatch, playerKitFromProfile } from '../sim/index.ts';
import { RoomServer, type GameServices } from '../server/rooms.ts';
import { join, type Peer } from './common.ts';

// Local ephemeral WebSocket fixture: real RoomServer + real sim, offline profiles,
// no auth credentials, enrichment providers, disk Hall writes or DEV mutations.
export async function fixture(options: { accelerated?: boolean; services?: Partial<GameServices> } = {}) {
  const httpServer = http.createServer();
  const wss = new WebSocketServer({ server: httpServer });
  const completed: unknown[] = [];
  let created = 0;
  const services: GameServices = {
    analyzeRepo: async repo => offlineProfile(repo),
    listFallbackRepos: () => ['pallets/flask'],
    botProfile: offlineProfile,
    playerKitFromProfile, bossKitFromProfile,
    recordMatch: result => { completed.push(result); },
    createMatch: (players, boss) => {
      created++;
      const match = createMatch(players, boss);
      if (!options.accelerated) return match;
      return {
        step(dt, inputs) {
          for (let i = 0; i < 300 && !match.over; i++) match.step(dt, inputs);
        },
        snapshot: () => match.snapshot(), autopsy: () => match.autopsy(),
        get over() { return match.over; },
      };
    },
    ...options.services,
  };
  const rooms = new RoomServer(wss, services);
  httpServer.listen(0, '127.0.0.1'); await once(httpServer, 'listening');
  const port = (httpServer.address() as { port: number }).port;
  const room = rooms.createRoom();
  const peers: Peer[] = [];
  return {
    room, url: `ws://127.0.0.1:${port}`, completed, created: () => created,
    async connect(resume?: string) {
      const client = await join(`ws://127.0.0.1:${port}`, room, resume);
      peers.push(client.peer); return client;
    },
    async close() {
      for (const peer of peers) await peer.close();
      rooms.close();
      await new Promise<void>(resolve => wss.close(() => resolve()));
      await new Promise<void>(resolve => httpServer.close(() => resolve()));
    },
  };
}
