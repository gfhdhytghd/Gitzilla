import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RoomServer } from './rooms';

export async function handleControllerRoute(req: IncomingMessage, res: ServerResponse, url: URL, rooms: RoomServer): Promise<boolean> {
  const match = /^\/api\/rooms\/([^/]+)\/my-seat$/.exec(url.pathname);
  if (!match) return false;
  const result = req.method === 'GET' ? await rooms.mySeat(decodeURIComponent(match[1]).toUpperCase(), req)
    : { status: 405, body: { error: 'Method not allowed' } };
  res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(result.body)); return true;
}
