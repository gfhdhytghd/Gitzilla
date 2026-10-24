import { WebSocket } from 'ws';
import type { ClientMsg, LobbyState, ServerMsg } from '../shared/types.ts';

// Deliberately narrower than tools/playtest: QA never follows redirects to a live target.
export function devURL(value = process.env.QA_URL ?? 'http://localhost:5175'): URL {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.port !== '5175' || url.username || url.password) {
    throw new Error('QA requires local HTTP port 5175; live targets are forbidden');
  }
  return new URL(url.origin);
}
export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export async function until<T>(fn: () => T | undefined | false, label: string, ms = 5000): Promise<T> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const result = fn();
    if (result) return result;
    await sleep(20);
  }
  throw new Error(`Timeout: ${label}`);
}
export async function request(path: string, method = 'GET') {
  const response = await fetch(new URL(path, devURL()), { method, redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response;
}
export class Peer {
  messages: ServerMsg[] = [];
  received = 0;
  snapshotCount = 0;
  transportErrors: string[] = [];
  socket: WebSocket;
  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.on('message', bytes => {
      this.received++;
      const message = JSON.parse(bytes.toString()) as ServerMsg;
      if (message.t === 'snapshot') this.snapshotCount++;
      this.messages.push(message);
      if (this.messages.length > 200) this.messages.shift();
    });
    this.socket.on('error', error => this.transportErrors.push(error.message));
  }
  send(message: ClientMsg) { this.socket.send(JSON.stringify(message)); }
  raw(message: unknown) { this.socket.send(typeof message === 'string' ? message : JSON.stringify(message)); }
  lobby(): LobbyState | undefined {
    const message = this.messages.findLast(m => m.t === 'lobby' || m.t === 'welcome');
    return message && 'lobby' in message ? message.lobby : undefined;
  }
  snapshot() { return this.messages.findLast(m => m.t === 'snapshot'); }
  clear() { this.messages.length = 0; }
  async close() {
    this.socket.close();
    try { await until(() => this.socket.readyState === WebSocket.CLOSED, 'socket closed', 1000); }
    catch { this.socket.terminate(); }
    // The fixture retains peers for teardown. Closed peers must not pin 200 full
    // snapshots and make a server soak measure the QA client's retained history.
    this.clear();
  }
}
export async function join(url: string, room: string, resume?: string, role: 'player' | 'screen' = 'player') {
  const peer = new Peer(url);
  await until(() => peer.socket.readyState === WebSocket.OPEN, 'WebSocket open');
  peer.send({ t: 'hello', room, role, name: 'QA', resume });
  const welcome = await until(() => peer.messages.find(m => m.t === 'welcome'), 'welcome');
  return { peer, welcome };
}
