import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import type { Autopsy, BossKit, ClientMsg, GameEvent, InputFrame, LobbyPlayer, LobbyState, MatchState, PlayerKit, RepoProfile, Role, ServerMsg } from '../shared/types.ts';

export interface Match {
  step(dt: number, inputs: Map<string, InputFrame>): void;
  snapshot(): MatchState;
  autopsy(): Autopsy;
  readonly over: boolean;
}
export interface GameServices {
  analyzeRepo(repo: string): Promise<RepoProfile>;
  listFallbackRepos(): string[];
  playerKitFromProfile(profile: RepoProfile): PlayerKit;
  bossKitFromProfile(profile: RepoProfile, count: number): BossKit;
  createMatch(players: { id: string; name: string; kit: PlayerKit }[], boss: BossKit): Match;
}
interface Member {
  id: string;
  token: string;
  role: Role;
  name: string;
  socket: WebSocket | null;
  lobby: LobbyPlayer;
  revision: number;
  input?: InputFrame;
  inputAt: number;
}
interface Room {
  code: string;
  ownerId: string;
  members: Map<string, Member>;
  boss: LobbyState['boss'];
  bossProfile?: RepoProfile;
  bossRevision: number;
  phase: LobbyState['phase'];
  match?: Match;
  state?: MatchState;
  result?: Autopsy;
  events: GameEvent[];
  stepTimer?: ReturnType<typeof setInterval>;
  snapshotTimer?: ReturnType<typeof setInterval>;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

const idle = (seq = 0): InputFrame => ({ seq, move: [0, 0], aim: null, fire: false, dash: false, skill: false, source: 'keyboard' });
const connectedPlayers = (room: Room) => [...room.members.values()].filter(m => m.role === 'player' && m.socket !== null);
const send = (ws: WebSocket | null, message: ServerMsg) => {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
};

export class RoomServer {
  private rooms = new Map<string, Room>();
  private sessions = new WeakMap<WebSocket, { room: Room; member: Member }>();
  private onConnection = (socket: WebSocket) => {
    socket.on('message', bytes => {
      void this.handle(socket, bytes.toString()).catch(error => {
        send(socket, { t: 'error', message: error instanceof Error ? error.message : 'Request failed' });
      });
    });
    socket.on('close', () => this.disconnect(socket));
    socket.on('error', () => this.disconnect(socket));
  };

  constructor(private wss: WebSocketServer, private services: GameServices) {
    wss.on('connection', this.onConnection);
  }

  createRoom(): string {
    let code: string;
    do { code = Array.from(randomBytes(4), byte => String.fromCharCode(65 + byte % 26)).join(''); } while (this.rooms.has(code));
    const room: Room = { code, ownerId: '', members: new Map(), boss: { repo: null, status: 'empty', kit: null }, bossRevision: 0, phase: 'lobby', events: [] };
    this.rooms.set(code, room);
    this.scheduleCleanup(room);
    return code;
  }

  lobby(room: Room): LobbyState {
    return { room: room.code, ownerId: room.ownerId, players: connectedPlayers(room).map(m => ({ ...m.lobby })), boss: { ...room.boss }, phase: room.phase };
  }

  private broadcast(room: Room, message: ServerMsg) {
    for (const m of room.members.values()) send(m.socket, message);
  }

  private broadcastLobby(room: Room) { this.broadcast(room, { t: 'lobby', lobby: this.lobby(room) }); }

  private async handle(socket: WebSocket, raw: string) {
    let msg: ClientMsg;
    try { msg = JSON.parse(raw); } catch { throw new Error('Invalid JSON'); }
    if (!msg || typeof msg.t !== 'string') throw new Error('Invalid message');
    if (msg.t === 'hello') return this.hello(socket, msg);
    const session = this.sessions.get(socket);
    if (!session || session.member.socket !== socket) throw new Error('Send hello first');
    const { room, member } = session;
    if (msg.t === 'input') {
      if (member.role !== 'player' || room.phase !== 'match') return;
      const f = msg.frame;
      if (!f || !Number.isFinite(f.seq) || !Array.isArray(f.move) || f.move.length !== 2 || !f.move.every(Number.isFinite)) return;
      if (member.input && f.seq <= member.input.seq) return;
      const length = Math.max(1, Math.hypot(...f.move));
      const pending = member.input;
      member.input = { ...f, move: [f.move[0] / length, f.move[1] / length], dash: !!f.dash || !!pending?.dash, skill: !!f.skill || !!pending?.skill };
      member.inputAt = Date.now();
      return;
    }
    if (member.role !== 'player') throw new Error('Spectators cannot change the room');
    if (msg.t === 'setBoss' || msg.t === 'start' || msg.t === 'rematch') {
      if (room.ownerId !== member.id) throw new Error('Only the room owner can do that');
    }
    if (msg.t === 'rematch') {
      if (room.phase !== 'autopsy') throw new Error('Wait for the match to finish');
      room.phase = 'lobby'; room.match = undefined; room.state = undefined; room.result = undefined; room.events = [];
      for (const m of room.members.values()) m.input = undefined;
      this.broadcastLobby(room);
      return;
    }
    if (room.phase !== 'lobby') throw new Error('Wait until the lobby to change repos or start');
    if (msg.t === 'setRepo') {
      const revision = ++member.revision;
      member.lobby = { id: member.id, name: member.name, repo: msg.repo, status: 'analyzing', kit: null };
      this.broadcastLobby(room);
      try {
        const profile = await this.services.analyzeRepo(msg.repo);
        if (revision !== member.revision) return;
        member.lobby = { id: member.id, name: member.name, repo: profile.slug, status: 'ready', kit: this.services.playerKitFromProfile(profile) };
      } catch (error) {
        if (revision !== member.revision) return;
        member.lobby.status = 'error'; member.lobby.error = error instanceof Error ? error.message : 'Analysis failed';
      }
      this.broadcastLobby(room);
    } else if (msg.t === 'setBoss') {
      const revision = ++room.bossRevision;
      room.bossProfile = undefined;
      room.boss = { repo: msg.repo, status: 'analyzing', kit: null };
      this.broadcastLobby(room);
      try {
        const profile = await this.services.analyzeRepo(msg.repo);
        if (revision !== room.bossRevision) return;
        const kit = this.services.bossKitFromProfile(profile, Math.max(1, connectedPlayers(room).length));
        room.bossProfile = profile; room.boss = { repo: profile.slug, status: 'ready', kit };
      } catch (error) {
        if (revision !== room.bossRevision) return;
        room.boss.status = 'error'; room.boss.error = error instanceof Error ? error.message : 'Analysis failed';
      }
      this.broadcastLobby(room);
    } else if (msg.t === 'start') {
      this.start(room);
    } else { throw new Error('Unknown message'); }
  }

  private hello(socket: WebSocket, msg: Extract<ClientMsg, { t: 'hello' }>) {
    if (this.sessions.has(socket)) throw new Error('Already joined');
    const room = this.rooms.get(String(msg.room).toUpperCase());
    if (!room) throw new Error('Room not found. Create a room first.');
    if (msg.role !== 'screen' && msg.role !== 'player') throw new Error('Choose player or screen');
    let member = msg.resume ? [...room.members.values()].find(m => m.token === msg.resume && m.role === msg.role) : undefined;
    if (!member) {
      if (msg.role === 'player' && room.phase !== 'lobby') throw new Error('A match is in progress. Join as a screen or wait for the lobby.');
      if (msg.role === 'player' && connectedPlayers(room).length >= 8) throw new Error('Room is full (8 players)');
      const id = randomUUID();
      const name = String(msg.name || (msg.role === 'screen' ? 'Big screen' : 'Player')).slice(0, 32);
      member = { id, name, token: randomBytes(24).toString('hex'), role: msg.role, socket: null, revision: 0, inputAt: 0, lobby: { id, name, repo: null, status: 'empty', kit: null } };
      room.members.set(id, member);
    } else if (!member.socket && member.role === 'player' && connectedPlayers(room).length >= 8) {
      throw new Error('Room is full (8 players)');
    } else if (member.socket) {
      this.sessions.delete(member.socket);
      member.socket.close(4001, 'Resumed in another tab');
    }
    member.socket = socket; member.input = undefined;
    clearTimeout(room.cleanupTimer);
    this.sessions.set(socket, { room, member });
    if (!room.ownerId && member.role === 'player') room.ownerId = member.id;
    send(socket, { t: 'welcome', you: member.id, token: member.token, lobby: this.lobby(room) });
    this.broadcastLobby(room);
    if (room.state) send(socket, { t: 'snapshot', state: { ...room.state, events: [] }, ack: -1 });
    if (room.result) send(socket, { t: 'autopsy', result: room.result });
  }

  private disconnect(socket: WebSocket) {
    const session = this.sessions.get(socket);
    if (!session || session.member.socket !== socket) return;
    this.sessions.delete(socket);
    const { room, member } = session;
    member.socket = null; member.input = undefined;
    if (room.ownerId === member.id) room.ownerId = connectedPlayers(room)[0]?.id ?? '';
    this.broadcastLobby(room);
    if (![...room.members.values()].some(m => m.socket)) this.scheduleCleanup(room);
  }

  private scheduleCleanup(room: Room) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = setTimeout(() => { this.stopMatch(room); this.rooms.delete(room.code); }, 10 * 60_000);
    room.cleanupTimer.unref();
  }

  private start(room: Room) {
    const players = connectedPlayers(room).filter(p => p.lobby.status === 'ready' && p.lobby.kit);
    if (!players.length) throw new Error('At least one player must choose a repo and finish analysis');
    if (room.boss.status !== 'ready' || !room.bossProfile) throw new Error('Choose a boss repo and wait for analysis');
    const boss = this.services.bossKitFromProfile(room.bossProfile, players.length);
    const match = this.services.createMatch(players.map(p => ({ id: p.id, name: p.name, kit: p.lobby.kit! })), boss);
    room.boss.kit = boss; room.match = match; room.phase = 'match'; room.events = [];
    for (const member of room.members.values()) member.input = undefined;
    this.capture(room);
    this.broadcastLobby(room);
    this.publishSnapshot(room);
    room.stepTimer = setInterval(() => {
      try {
        const now = Date.now();
        const inputs = new Map<string, InputFrame>();
        for (const m of room.members.values()) {
          if (m.role !== 'player') continue;
          inputs.set(m.id, m.socket && m.input && now - m.inputAt < 300 ? { ...m.input } : idle(m.input?.seq));
          if (m.input) { m.input.dash = false; m.input.skill = false; }
        }
        match.step(1 / 30, inputs);
        this.capture(room);
        if (match.over) {
          this.stopMatch(room);
          this.publishSnapshot(room);
          room.result = match.autopsy();
          // The transport still has the source profile; kits intentionally omit the real file path.
          if (room.bossProfile) room.result.boss.heart = room.bossProfile.heart;
          room.phase = 'autopsy';
          this.broadcastLobby(room);
          this.broadcast(room, { t: 'autopsy', result: room.result });
        }
      } catch (error) {
        this.stopMatch(room); room.phase = 'lobby'; room.match = undefined;
        this.broadcast(room, { t: 'error', message: `Match stopped: ${error instanceof Error ? error.message : 'simulation failed'}` });
        this.broadcastLobby(room);
      }
    }, 1000 / 30);
    room.snapshotTimer = setInterval(() => this.publishSnapshot(room), 1000 / 20);
  }

  private capture(room: Room) {
    room.state = room.match!.snapshot();
    room.events.push(...room.state.events);
  }

  private publishSnapshot(room: Room) {
    if (!room.state) return;
    const state = { ...room.state, events: room.events.splice(0) };
    for (const m of room.members.values()) send(m.socket, { t: 'snapshot', state, ack: m.input?.seq ?? -1 });
  }

  private stopMatch(room: Room) { clearInterval(room.stepTimer); clearInterval(room.snapshotTimer); }

  close() {
    this.wss.off('connection', this.onConnection);
    for (const room of this.rooms.values()) { this.stopMatch(room); clearTimeout(room.cleanupTimer); }
    for (const socket of this.wss.clients) socket.terminate();
    this.rooms.clear();
  }
}
