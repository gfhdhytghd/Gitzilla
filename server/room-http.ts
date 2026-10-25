import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RoomServer } from './rooms';

export function handleRoomCreate(req: IncomingMessage, res: ServerResponse, url: URL, rooms: RoomServer, onCreated?: (room: string) => void): boolean {
  if (url.pathname !== '/api/room' || req.method !== 'POST') return false;
  req.resume();
  const mode = url.searchParams.get('mode') || 'battle', host = url.searchParams.get('host');
  let status = 201, body: { room: string; hostToken?: string } | { error: string };
  if (!['battle', 'edu', 'pvp'].includes(mode)) { status = 400; body = { error: 'Choose battle, classroom, or PvP mode' }; }
  else if (host !== null && host !== 'screen') { status = 400; body = { error: 'Choose host=screen or omit host' }; }
  else {
    // Classroom keeps its existing teacher claim flow.
    body = host === 'screen' && mode !== 'edu' ? rooms.createScreenHostedRoom(mode as 'battle' | 'pvp')
      : { room: rooms.createRoom(undefined, mode as 'battle' | 'edu' | 'pvp') };
    onCreated?.(body.room);
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
  return true;
}
