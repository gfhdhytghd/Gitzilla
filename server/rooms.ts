import type { IncomingMessage } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { RoomStore, type SavedRoom } from './room-store.ts';
import type { Autopsy, BossDesign, BossKit, ClientMsg, GameEvent, InputFrame, LobbyPlayer, LobbyState, MatchState, PlayerKit, PlayerState, RepoProfile, Role, ServerMsg } from '../shared/types.ts';

export interface Match {
  step(dt: number, inputs: Map<string, InputFrame>): void;
  snapshot(): MatchState;
  autopsy(): Autopsy;
  readonly over: boolean;
}
export interface GameServices {
  analyzeRepo(repo: string, options?: { token?: string }): Promise<RepoProfile>;
  getSession?(request: IncomingMessage): Promise<{ login: string } | null>;
  getGithubToken?(request: IncomingMessage): Promise<string | null>;
  listFallbackRepos(): string[];
  playerKitFromProfile(profile: RepoProfile): PlayerKit;
  bossKitFromProfile(profile: RepoProfile, count: number, design?: BossDesign): BossKit;
  enhanceHeroKit?(profile: RepoProfile, kit: PlayerKit): Promise<PlayerKit>;
  enhanceBossKit?(profile: RepoProfile, kit: BossKit): Promise<BossKit>;
  recordMatch?(result: Autopsy, room: string, bossRepo: string): void;
  botProfile?(repo: string): RepoProfile;
  createBot?(seed: number): (state: MatchState, player: PlayerState) => InputFrame;
  createMatch(players: { id: string; name: string; kit: PlayerKit }[], boss: BossKit): Match;
}
export interface RoomServerOptions {
  persistenceFile?: string; // Main supplies .cache/rooms.json; tests can use isolated files.
  debounceMs?: number;
}
interface Member {
  id: string;
  token: string;
  role: Role;
  name: string;
  namedByUser?: boolean;
  privateRepo?: boolean;
  socket: WebSocket | null;
  lobby: LobbyPlayer;
  revision: number;
  botSeed?: number;
  restartNotified?: boolean;
  botInput?: (state: MatchState, player: PlayerState) => InputFrame;
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
  privateMatch?: boolean;
  restartNotice?: string;
  state?: MatchState;
  result?: Autopsy;
  events: GameEvent[];
  stepTimer?: ReturnType<typeof setInterval>;
  snapshotTimer?: ReturnType<typeof setInterval>;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

const idle = (seq = 0): InputFrame => ({ seq, move: [0, 0], aim: null, fire: false, dash: false, skill: false, source: 'keyboard' });
const connectedPlayers = (room: Room) => [...room.members.values()].filter(m => m.role === 'player' && m.socket !== null);
const bots = (room: Room) => [...room.members.values()].filter(m => m.lobby.bot);
const squad = (room: Room) => [...connectedPlayers(room), ...bots(room)];
const send = (ws: WebSocket | null, message: ServerMsg) => {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
};

export class RoomServer {
  private store?: RoomStore;
  private persistTimer?: ReturnType<typeof setTimeout>;
  private closing = false;
  private rooms = new Map<string, Room>();
  private sessions = new WeakMap<WebSocket, { room: Room; member: Member }>();
  private requests = new WeakMap<WebSocket, IncomingMessage>();
  private joining = new WeakMap<WebSocket, Promise<void>>();
  private onConnection = (socket: WebSocket, request: IncomingMessage) => {
    this.requests.set(socket, request);
    socket.on('message', bytes => {
      void this.handle(socket, bytes.toString()).catch(error => {
        send(socket, { t: 'error', message: error instanceof Error ? error.message : 'Request failed' });
      });
    });
    socket.on('close', () => this.disconnect(socket));
    socket.on('error', () => this.disconnect(socket));
  };

  constructor(private wss: WebSocketServer, private services: GameServices, private options: RoomServerOptions = {}) {
    if (options.persistenceFile) {
      this.store = new RoomStore(options.persistenceFile);
      this.restoreRooms();
    }
    wss.on('connection', this.onConnection);
  }

  private restoreRooms() {
    for (const saved of this.store!.load()) {
      const members = new Map<string, Member>();
      for (const player of saved.players) {
        const lobby = { ...player.lobby };
        if (lobby.status === 'analyzing') {
          lobby.status = 'error'; lobby.error = 'Server restarted during analysis. Choose this repo again.';
        }
        members.set(player.id, { ...player, lobby, role: 'player', socket: null, revision: 0, inputAt: 0,
          botInput: lobby.bot ? this.services.createBot?.(player.botSeed ?? lobby.kit?.seed ?? 1) : undefined });
      }
      const boss = { ...saved.boss };
      if (boss.status === 'analyzing') { boss.status = 'error'; boss.error = 'Server restarted during analysis. Choose the boss again.'; }
      const room: Room = { code: saved.code, ownerId: saved.ownerId, members, boss, bossProfile: saved.bossProfile,
        bossRevision: 0, phase: 'lobby', events: [],
        restartNotice: saved.phase === 'match'
          ? 'Server restarted. Your fight was reset to the lobby; repos and kits were restored.'
          : saved.restartNotice ?? 'Server restarted. Your lobby has been restored.' };
      this.rooms.set(room.code, room);
      this.scheduleCleanup(room);
    }
  }

  private savedRooms(): SavedRoom[] {
    return [...this.rooms.values()].map(room => ({ code: room.code, ownerId: room.ownerId,
      players: [...room.members.values()].filter(m => m.role === 'player').map(m => ({
        id: m.id, token: m.token, name: m.name, namedByUser: m.namedByUser, privateRepo: m.privateRepo, botSeed: m.botSeed, lobby: m.lobby,
      })),
      boss: room.boss, bossProfile: room.bossProfile, phase: room.phase, restartNotice: room.restartNotice,
    }));
  }

  private persist() {
    if (!this.store || this.closing) return;
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.flushPersistence(), this.options.debounceMs ?? 100);
    this.persistTimer.unref();
  }

  private flushPersistence() {
    clearTimeout(this.persistTimer);
    if (!this.store) return;
    try { this.store.save(this.savedRooms()); }
    catch { console.error('Room persistence write failed; current rooms remain available in memory.'); }
  }

  createRoom(requestedCode?: string): string {
    let code = requestedCode?.toUpperCase();
    if (code && !/^[A-Z]{4}$/.test(code)) throw new Error('Use a four-letter room code');
    if (code && this.rooms.has(code)) return code;
    if (!code) do { code = Array.from(randomBytes(4), byte => String.fromCharCode(65 + byte % 26)).join(''); } while (this.rooms.has(code));
    const room: Room = { code, ownerId: '', members: new Map(), boss: { repo: null, status: 'empty', kit: null }, bossRevision: 0, phase: 'lobby', events: [] };
    this.rooms.set(code, room);
    this.scheduleCleanup(room);
    this.persist();
    return code;
  }

  lobby(room: Room): LobbyState {
    return { room: room.code, ownerId: room.ownerId, players: squad(room).map(m => ({ ...m.lobby })), boss: { ...room.boss }, phase: room.phase };
  }

  private broadcast(room: Room, message: ServerMsg) {
    for (const m of room.members.values()) send(m.socket, message);
  }

  private broadcastLobby(room: Room) {
    if (this.closing) return;
    this.persist();
    this.broadcast(room, { t: 'lobby', lobby: this.lobby(room) });
  }

  private async handle(socket: WebSocket, raw: string) {
    let msg: ClientMsg;
    try { msg = JSON.parse(raw); } catch { throw new Error('Invalid JSON'); }
    if (!msg || typeof msg.t !== 'string') throw new Error('Invalid message');
    if (msg.t === 'hello') {
      if (this.joining.has(socket)) throw new Error('Already joining');
      const pending = this.hello(socket, msg);
      this.joining.set(socket, pending);
      try { await pending; } finally { this.joining.delete(socket); }
      return;
    }
    // Name resolution may await session decoding; later messages wait only for hello,
    // while independent repo analyses remain concurrent and revision-protected.
    const pendingHello = this.joining.get(socket);
    if (pendingHello) await pendingHello;
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
    if (msg.t === 'setBoss' || msg.t === 'setBots' || msg.t === 'start' || msg.t === 'rematch') {
      if (room.ownerId !== member.id) throw new Error('Only the room owner can do that');
    }
    if (msg.t === 'rematch') {
      if (room.phase !== 'autopsy') throw new Error('Wait for the match to finish');
      room.restartNotice = undefined;
      room.phase = 'lobby'; room.match = undefined; room.state = undefined; room.result = undefined; room.events = [];
      for (const m of room.members.values()) m.input = undefined;
      this.broadcastLobby(room);
      return;
    }
    if (room.phase !== 'lobby') throw new Error('Wait until the lobby to change repos or start');
    if (msg.t === 'setBots') {
      await this.setBots(room, msg.count);
    } else if (msg.t === 'setRepo') {
      const revision = ++member.revision;
      member.lobby = { id: member.id, name: member.name, repo: msg.repo, status: 'analyzing', kit: null };
      this.broadcastLobby(room);
      let credentialed = false;
      try {
        const request = this.requests.get(socket);
        let token: string | null = null;
        try { token = request && this.services.getGithubToken ? await this.services.getGithubToken(request) : null; }
        catch { throw new Error('GitHub connection unavailable. Reconnect GitHub and retry.'); }
        if (revision !== member.revision || member.socket !== socket) return;
        credentialed = !!token;
        // The token lives only in this call; never attach it to member/profile/kit/messages.
        const profile = await this.services.analyzeRepo(msg.repo, token ? { token } : undefined);
        if (revision !== member.revision) return;
        member.privateRepo = credentialed;
        member.lobby = { id: member.id, name: member.name, repo: profile.slug, status: 'ready', kit: this.services.playerKitFromProfile(profile) };
        if (!credentialed) this.refineHero(room, member, revision, profile);
      } catch (error) {
        if (revision !== member.revision) return;
        member.lobby.status = 'error'; member.lobby.error = credentialed
          ? 'Could not analyze this repository. Check GitHub access and try again.'
          : error instanceof Error ? error.message : 'Analysis failed';
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
        const kit = this.services.bossKitFromProfile(profile, Math.max(1, squad(room).length));
        room.bossProfile = profile; room.boss = { repo: profile.slug, status: 'ready', kit };
        this.refineBoss(room, revision, profile, kit);
      } catch (error) {
        if (revision !== room.bossRevision) return;
        room.boss.status = 'error'; room.boss.error = error instanceof Error ? error.message : 'Analysis failed';
      }
      this.broadcastLobby(room);
    } else if (msg.t === 'start') {
      this.start(room);
    } else { throw new Error('Unknown message'); }
  }

  private refineHero(room: Room, member: Member, revision: number, profile: RepoProfile) {
    if (!this.services.enhanceHeroKit || !member.lobby.kit) return;
    void this.services.enhanceHeroKit(profile, structuredClone(member.lobby.kit)).then(decorated => {
      if (revision !== member.revision || !member.lobby.kit || this.rooms.get(room.code) !== room) return;
      // Only appearance fields cross this boundary; AI output cannot modify balance.
      member.lobby.kit = { ...member.lobby.kit, design: decorated.design, title: decorated.title, palette: decorated.palette };
      this.broadcastLobby(room);
    }).catch(() => { /* Keep the immediately-ready seed design if art direction fails. */ });
  }

  private refineBoss(room: Room, revision: number, profile: RepoProfile, seedKit: BossKit) {
    if (!this.services.enhanceBossKit) return;
    void this.services.enhanceBossKit(profile, structuredClone(seedKit)).then(decorated => {
      if (revision !== room.bossRevision || !room.boss.kit || this.rooms.get(room.code) !== room) return;
      const kit = room.boss.kit;
      room.boss.kit = { ...kit, design: decorated.design, name: decorated.name, palette: decorated.palette, theme: decorated.theme,
        attacks: kit.attacks.map(attack => ({ ...attack, name: decorated.attacks.find(a => a.id === attack.id)?.name ?? attack.name })) };
      // Running matches keep their cloned kit. A late result is ready for the next lobby/rematch.
      this.broadcastLobby(room);
    }).catch(() => { /* Art direction never changes readiness or prevents a fight. */ });
  }

  private makeRoomForHuman(room: Room) {
    if (room.phase === 'lobby' && squad(room).length >= 8) {
      const last = bots(room).at(-1);
      if (last) { last.revision++; room.members.delete(last.id); }
    }
  }

  private async setBots(room: Room, requested: number) {
    if (!Number.isFinite(requested)) throw new Error('Choose 0–7 AI teammates');
    const count = Math.min(7, 8 - connectedPlayers(room).length, Math.max(0, Math.floor(requested)));
    const current = bots(room);
    for (const member of current.slice(count)) { member.revision++; room.members.delete(member.id); }
    const repos = this.services.listFallbackRepos();
    if (bots(room).length < count && !repos.length) throw new Error('Fallback repos are not ready for AI teammates');
    const pending: Promise<void>[] = [];
    while (bots(room).length < count) {
      const seed = randomBytes(4).readUInt32LE();
      const repo = repos[seed % repos.length];
      const id = `bot-${randomUUID()}`;
      const name = `[BOT] ${repo.split('/').pop()}`.slice(0, 32);
      const member: Member = { id, name, token: '', role: 'player', socket: null, revision: 1, inputAt: 0, botSeed: seed,
        lobby: { id, name, repo, bot: true, status: 'analyzing', kit: null } };
      room.members.set(id, member);
      pending.push((async () => {
        try {
          const profile = this.services.botProfile ? this.services.botProfile(repo) : await this.services.analyzeRepo(repo);
          if (room.members.get(id) !== member) return;
          member.lobby = { ...member.lobby, repo: profile.slug, status: 'ready', kit: this.services.playerKitFromProfile(profile) };
          member.botInput = this.services.createBot?.(seed);
          this.refineHero(room, member, member.revision, profile);
        } catch (error) {
          if (room.members.get(id) !== member) return;
          member.lobby.status = 'error'; member.lobby.error = error instanceof Error ? error.message : 'AI repo failed';
        }
        this.broadcastLobby(room);
      })());
    }
    this.broadcastLobby(room);
    await Promise.all(pending);
  }

  private async hello(socket: WebSocket, msg: Extract<ClientMsg, { t: 'hello' }>) {
    if (this.sessions.has(socket)) throw new Error('Already joined');
    if (msg.role !== 'screen' && msg.role !== 'player') throw new Error('Choose player or screen');
    const code = String(msg.room).toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) throw new Error('Use a four-letter room code');
    const room = this.rooms.get(code) ?? this.rooms.get(this.createRoom(code))!;
    const suppliedName = String(msg.name || '').trim().slice(0, 32);
    let githubName: string | undefined;
    const request = this.requests.get(socket);
    if (!suppliedName && msg.role === 'player' && request && this.services.getSession) {
      try { githubName = (await this.services.getSession(request))?.login; }
      catch { /* Anonymous play works if session resolution is unavailable. */ }
    }
    if (this.closing || socket.readyState !== WebSocket.OPEN) return;
    let member = msg.resume ? [...room.members.values()].find(m => m.token === msg.resume && m.role === msg.role) : undefined;
    if (!member) {
      if (msg.role === 'player' && room.phase !== 'lobby') throw new Error('A match is in progress. Join as a screen or wait for the lobby.');
      if (msg.role === 'player' && connectedPlayers(room).length >= 8) throw new Error('Room is full (8 players)');
      if (msg.role === 'player') this.makeRoomForHuman(room);
      const id = randomUUID();
      const name = suppliedName || githubName?.slice(0, 32) || (msg.role === 'screen' ? 'Big screen' : 'Player');
      member = { id, name, namedByUser: !!suppliedName, token: randomBytes(24).toString('hex'), role: msg.role, socket: null, revision: 0, inputAt: 0, lobby: { id, name, repo: null, status: 'empty', kit: null } };
      room.members.set(id, member);
    } else if (!member.socket && member.role === 'player' && connectedPlayers(room).length >= 8) {
      throw new Error('Room is full (8 players)');
    } else if (member.socket) {
      this.sessions.delete(member.socket);
      member.socket.close(4001, 'Resumed in another tab');
    }
    // The lobby's rename control reconnects with the same token and a new hello name.
    if (member.role === 'player' && !member.socket) this.makeRoomForHuman(room);
    member.name = suppliedName || (!member.namedByUser && githubName?.slice(0, 32)) || member.name;
    if (suppliedName) member.namedByUser = true;
    member.lobby.name = member.name;
    member.socket = socket; member.input = undefined;
    clearTimeout(room.cleanupTimer);
    this.sessions.set(socket, { room, member });
    if (member.role === 'player' && (!room.ownerId || !room.members.get(room.ownerId)?.socket)) room.ownerId = member.id;
    send(socket, { t: 'welcome', you: member.id, token: member.token, lobby: this.lobby(room) });
    this.broadcastLobby(room);
    if (room.restartNotice && !member.restartNotified) {
      send(socket, { t: 'error', message: room.restartNotice });
      member.restartNotified = true;
    }
    if (room.state) send(socket, { t: 'snapshot', state: { ...room.state, events: [] }, ack: -1 });
    if (room.result) send(socket, { t: 'autopsy', result: room.result });
  }

  private disconnect(socket: WebSocket) {
    if (this.closing) return;
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
    room.cleanupTimer = setTimeout(() => { this.stopMatch(room); this.rooms.delete(room.code); this.persist(); }, 10 * 60_000);
    room.cleanupTimer.unref();
  }

  private start(room: Room) {
    const humans = connectedPlayers(room).filter(p => p.lobby.status === 'ready' && p.lobby.kit);
    if (!humans.length) throw new Error('At least one player must choose a repo and finish analysis');
    if (room.boss.status !== 'ready' || !room.bossProfile) throw new Error('Choose a boss repo and wait for analysis');
    if (bots(room).some(p => p.lobby.status !== 'ready' || !p.lobby.kit)) throw new Error('Wait for AI teammates to finish loading');
    const players = [...humans, ...bots(room)];
    const boss = this.services.bossKitFromProfile(room.bossProfile, players.length, room.boss.kit?.design);
    const match = this.services.createMatch(players.map(p => ({ id: p.id, name: p.name, kit: p.lobby.kit! })), boss);
    room.restartNotice = undefined;
    room.privateMatch = players.some(p => p.privateRepo);
    room.boss.kit = boss; room.match = match; room.phase = 'match'; room.events = [];
    for (const member of room.members.values()) member.input = undefined;
    this.capture(room);
    this.broadcastLobby(room);
    this.publishSnapshot(room);
    // Persist the match marker before combat starts so a crash restores a lobby with a notice.
    this.flushPersistence();
    room.stepTimer = setInterval(() => {
      try {
        const now = Date.now();
        const inputs = new Map<string, InputFrame>();
        for (const m of room.members.values()) {
          if (m.role !== 'player') continue;
          if (m.lobby.bot && m.botInput && room.state) {
            const player = room.state.players.find(p => p.id === m.id);
            if (player) inputs.set(m.id, m.botInput(room.state, player));
            continue;
          }
          inputs.set(m.id, m.socket && m.input && now - m.inputAt < 300 ? { ...m.input } : idle(m.input?.seq));
          if (m.input) { m.input.dash = false; m.input.skill = false; }
        }
        match.step(1 / 30, inputs);
        this.capture(room);
        if (match.over) {
          this.stopMatch(room);
          this.publishSnapshot(room);
          room.result = match.autopsy();
          // Retain the source profile's exact heart file path for the autopsy.
          if (room.bossProfile) room.result.boss.heart = room.bossProfile.heart;
          // Authenticated analysis has no visibility flag yet: conservatively keep
          // any credentialed squad out of the public event leaderboard entirely.
          try { if (!room.privateMatch) this.services.recordMatch?.(room.result, room.code, room.result.boss.repo); }
          catch (error) { console.error('Hall persistence failed:', error); }
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
    if (this.closing) return;
    this.flushPersistence();
    this.closing = true;
    this.wss.off('connection', this.onConnection);
    for (const room of this.rooms.values()) { this.stopMatch(room); clearTimeout(room.cleanupTimer); }
    for (const socket of this.wss.clients) socket.terminate();
    this.rooms.clear();
  }
}
