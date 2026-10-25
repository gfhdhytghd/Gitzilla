import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ChainBoardService } from './service';
export function handleChainBoardRoute(req: IncomingMessage, res: ServerResponse, url: URL, service?: ChainBoardService): boolean {
  if (url.pathname !== '/api/chain-board' && url.pathname !== '/api/chain-board/proof') return false;
  const send = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  if (req.method !== 'GET') { send(405, { error: 'Use GET' }); return true; }
  if (!service) { send(503, { error: 'Chain board unavailable' }); return true; }
  if (url.pathname === '/api/chain-board') send(200, service.response());
  else {
    const id = url.searchParams.get('snapshot') ?? '', kind = url.searchParams.get('kind') ?? '', key = url.searchParams.get('key') ?? '';
    if (id.length > 64 || key.length > 256 || !['player', 'project'].includes(kind)) send(400, { error: 'Invalid proof query' });
    else { const proof = service.proof(id, kind, key); send(proof ? 200 : 404, proof ?? { error: 'Snapshot or entry not found' }); }
  }
  return true;
}
