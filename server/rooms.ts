import type { FinishedReceiptMatch } from './receipts/service';
import type { PvpAccess } from './pvp-access';
import { isLocale, type Locale } from '../shared/i18n/locale';
import { ClassroomSession, type ClassroomSource } from './classroom';
import { classroomExport } from './classroom-export';
import type { InAppFile } from '../shared/classroom';
import { editorCommit, normalizeEditorFiles } from './in-app';
import { asPvpAiKit } from '../sim/index';
import { githubIdFromSession, type GithubIdentity, type GithubSession } from './github-identity';
import type { IncomingMessage } from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { RoomStore, type SavedRoom } from './room-store.ts';
import { sanitizeInputFrame } from './input.ts';
import { feedbackCsv, feedbackMarkdown, normalizeRubric } from './rubrics.ts';
import type { Autopsy, BossDesign, BossKit, ClientMsg, CriterionResult, GameEvent, GameMode, Genesis, GenesisProgress, InputFrame, LobbyPlayer, LobbyState, MatchState, MotionProfile, PlayerKit, PlayerState, RepoProfile, Role, Rubric, ServerMsg, StudentFeedback } from '../shared/types.ts';

export interface Match {
  removePlayer?(id: string): void;
  step(dt: number, inputs: Map<string, InputFrame>): void;
  snapshot(): MatchState;
  autopsy(): Autopsy;
  readonly over: boolean;
}
export interface GameServices {
  recordReceipts?(input: FinishedReceiptMatch): Record<string,string>;
  analyzeFiles?(files: InAppFile[], name: string): RepoProfile;
  verifyPvpAccess?(repo: string, token: string): Promise<PvpAccess>;
  analyzeClassroomSubmission?(repo: string, ref: string, token: string, needsChecks: boolean): Promise<ClassroomSource>;
  defaultRubric?(): Rubric;
  parseRubric?(text: string, filename?: string): Rubric;
  scoreRepo?(profile: RepoProfile, rubric: Rubric): CriterionResult[];
  feedbackForPlayer?(profile: RepoProfile, rubric: Rubric, stats: StudentFeedback['match'] & { playerId: string; name: string }): StudentFeedback;
  applyRubric?(profile: RepoProfile, kit: PlayerKit, rubric: Rubric): PlayerKit;
  analyzeRepo(repo: string, options?: { token?: string; onProgress?: (progress: GenesisProgress) => void }): Promise<RepoProfile>;
  getSession?(request: IncomingMessage): Promise<{ login: string; userId?: string } | null>;
  getGithubIdentity?(request: IncomingMessage, session: GithubSession): Promise<GithubIdentity | null>;
  getGithubToken?(request: IncomingMessage): Promise<string | null>;
  buildGenesis?(profile: RepoProfile, kit: PlayerKit | BossKit, kind: 'hero' | 'boss'): Genesis;
  listFallbackRepos(): string[];
  playerKitFromProfile(profile: RepoProfile, options?: { mode?: GameMode }): PlayerKit;
  bossKitFromProfile(profile: RepoProfile, count: number, design?: BossDesign): BossKit;
  enhanceHeroKit?(profile: RepoProfile, kit: PlayerKit): Promise<PlayerKit>;
  enhanceBossKit?(profile: RepoProfile, kit: BossKit): Promise<BossKit>;
  recordMatch?(result: Autopsy, room: string, bossRepo: string): void;
  recordRoyale?(winner: { name: string; repo: string; kos: number; damage: number }): void;
  botProfile?(repo: string): RepoProfile;
  createBot?(seed: number): (state: MatchState, player: PlayerState) => InputFrame;
  createMatch(players: { id: string; name: string; kit: PlayerKit }[], boss: BossKit | null, options?: { mode?: GameMode }): Match;
}
export interface RoomServerOptions {
  allowLegacyEdu?: boolean; // Explicit compatibility harness only; never enabled by production.
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
  pvpAccess?: PvpAccess; // Memory-only; invalidated on reconnect and mode changes.
  identities?: string[];
  githubIdentity?: string;
  controllerToken?: string;
  controllerSocket?: WebSocket | null;
  controllerSeq?: number;
  displaySeq?: number;
  displayKeyboardReady?: boolean;
  needsController?: boolean;
  controllerReady?: boolean;
  screenHostPending?: boolean;
  inputFromController?: boolean;
  profile?: RepoProfile; // Memory-only, never part of the room-store whitelist.
  socket: WebSocket | null;
  lobby: LobbyPlayer;
  revision: number;
  botSeed?: number;
  restartNotified?: boolean;
  botInput?: (state: MatchState, player: PlayerState) => InputFrame;
  input?: InputFrame;
  inputAt: number;
  controlsReady: boolean;
  controlsMode?: MotionProfile;
  preview?: { profile: RepoProfile; rubric: Rubric; results: CriterionResult[] };
}
interface Room {
  code: string;
  ownerId: string;
  mode: GameMode;
  teacherId?: string;
  locale?: Locale;
  classroom?: ClassroomSession;
  classroomTimer?: ReturnType<typeof setInterval>;
  rubric?: Rubric;
  matchRubric?: Rubric;
  feedback?: StudentFeedback[];
  feedbackProfiles?: Map<string, RepoProfile>;
  members: Map<string, Member>;
  bans: { tokens: Set<string>; identities: Set<string> };
  boss: LobbyState['boss'];
  bossProfile?: RepoProfile;
  privateBoss?: boolean;
  bossRevision: number;
  phase: LobbyState['phase'];
  match?: Match;
  departed?: Set<string>;
  privateMatch?: boolean;
  receiptParticipants?: {id:string;tokenHash:string;publicKey?:string}[];
  receiptEligible?: boolean;
  restartNotice?: string;
  pendingProgress?: Map<string, () => boolean>;
  progressTimer?: ReturnType<typeof setTimeout>;
  lastProgressAt?: number;
  state?: MatchState;
  paused?: NonNullable<MatchState['paused']>;
  pauseOwnerDeadline?: number;
  result?: Autopsy;
  events: GameEvent[];
  stepTimer?: ReturnType<typeof setInterval>;
  snapshotTimer?: ReturnType<typeof setInterval>;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

const idle = (seq = 0): InputFrame => ({ seq, move: [0, 0], aim: null, fire: false, dash: false, skill: false, source: 'keyboard' });
const INPUT_TIMEOUT_MS = 300; // Nine missing 30 Hz frames before releasing stale controls.
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const removedMessage = 'You were removed from this room by the host.';
const controllerSignIn = 'Sign in with GitHub on both devices to use your phone as the controller.';
const controllerNoSeat = 'Open this room on your big screen or Vision Pro first, signed in as the same GitHub account.';
const online = (member: Member) => !!(member.socket || member.controllerSocket);
const seatControlsReady = (member: Member) => !!member.lobby.bot || (member.needsController
  ? !!member.controllerSocket && member.controllerReady === true : member.controlsReady);
const connectedPlayers = (room: Room) => [...room.members.values()].filter(m => m.role === 'player' && online(m));
const capacity = (room: Room) => room.mode === 'edu' ? 30 : 8;
const bots = (room: Room) => [...room.members.values()].filter(m => m.lobby.bot);
const squad = (room: Room) => [...connectedPlayers(room), ...bots(room)];
const phoneRequest = (request?: IncomingMessage) => request?.headers['sec-ch-ua-mobile'] === '?1' ||
  /Android|iPhone|iPad|iPod|Mobile/i.test(request?.headers['user-agent'] ?? '');
const send = (ws: WebSocket | null, message: ServerMsg) => {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
};

export class RoomServer {
  private store?: RoomStore;
  private persistTimer?: ReturnType<typeof setTimeout>;
  private closing = false;
  private classroomJobs = 0;
  private classroomWaiters: (() => void)[] = [];
  private rooms = new Map<string, Room>();
  private revokedTokens = new Set<string>();
  private sessions = new WeakMap<WebSocket, { room: Room; member: Member; controller?: boolean }>();
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
    const savedRooms = this.store!.load();
    this.revokedTokens = new Set(this.store!.revokedTokens);
    for (const saved of savedRooms) {
      const members = new Map<string, Member>();
      for (const player of saved.players) {
        const lobby = { ...player.lobby };
        delete lobby.rubricPreview;
        delete lobby.paired;
        if (lobby.status === 'analyzing') {
          lobby.status = 'error'; lobby.error = 'Server restarted during analysis. Choose this repo again.';
        }
        const member: Member = { ...player, lobby, role: player.role ?? 'player', socket: null, revision: 0, inputAt: 0, controlsReady: !!lobby.bot,
          botInput: lobby.bot ? this.services.createBot?.(player.botSeed ?? lobby.kit?.seed ?? 1) : undefined };
        if (lobby.bot && lobby.repo) {
          try { member.profile = this.services.botProfile?.(lobby.repo); } catch { /* Retry from the fallback picker when starting. */ }
        }
        members.set(player.id, member);
      }
      const boss: LobbyState['boss'] = saved.privateBoss
        ? { repo: saved.boss.repo, status: 'error', kit: null, error: 'Reconnect GitHub and reselect the private boss repo.' }
        : { ...saved.boss };
      if (boss.status === 'analyzing') { boss.status = 'error'; boss.error = 'Server restarted during analysis. Choose the boss again.'; }
      const room: Room = { locale: isLocale(saved.locale) ? saved.locale : 'en', code: saved.code, ownerId: saved.ownerId, mode: saved.mode === 'edu' ? 'edu' : saved.mode === 'pvp' ? 'pvp' : 'battle', teacherId: saved.teacherId, members, boss,
        bans: { tokens: new Set(saved.bans?.tokens), identities: new Set(saved.bans?.identities) },
        privateBoss: saved.privateBoss, bossProfile: saved.privateBoss ? undefined : saved.bossProfile,
        bossRevision: 0, phase: 'lobby', events: [],
        restartNotice: saved.phase === 'match'
          ? 'Server restarted. Your fight was reset to the lobby; repos and kits were restored.'
          : saved.restartNotice ?? 'Server restarted. Your lobby has been restored.' };
      try { room.rubric = saved.rubric ? normalizeRubric(saved.rubric) : room.mode === 'edu' ? this.services.defaultRubric?.() : undefined; }
      catch { room.rubric = this.services.defaultRubric?.(); }
      if (saved.classroom && room.mode === 'edu') {
        try { room.classroom = ClassroomSession.restore(saved.classroom); this.armClassroom(room); }
        catch { room.restartNotice = 'The saved lesson could not be restored. Configure a new lesson.'; }
      }
      this.preparePvpBots(room);
      this.rooms.set(room.code, room);
      this.scheduleCleanup(room);
    }
  }

  private savedRooms(): SavedRoom[] {
    return [...this.rooms.values()].map(room => ({ code: room.code, ownerId: room.ownerId, mode: room.mode, teacherId: room.teacherId, locale: room.locale, rubric: room.rubric, classroom: room.classroom?.save(),
      bans: { tokens: [...room.bans.tokens], identities: [...room.bans.identities] },
      players: [...room.members.values()].filter(m => m.role === 'player' || m.id === room.ownerId || m.id === room.teacherId).map(m => ({
        id: m.id, token: m.token, name: m.name, role: m.role, namedByUser: m.namedByUser, privateRepo: m.privateRepo, botSeed: m.botSeed, identities: m.identities,
        githubIdentity: m.githubIdentity, controllerToken: m.controllerToken, needsController: m.needsController, screenHostPending: m.screenHostPending,
        lobby: this.persistedLobby(m),
      })),
      boss: room.privateBoss
        ? { repo: room.boss.repo, status: 'error', kit: null, error: 'Reconnect GitHub and reselect the private boss repo.' }
        : room.boss,
      privateBoss: room.privateBoss, bossProfile: room.privateBoss ? undefined : room.bossProfile,
      phase: room.phase, restartNotice: room.restartNotice,
    }));
  }

  private persistedLobby(member: Member): LobbyPlayer {
    if (!member.privateRepo) { const { controlsReady: _controlsReady, paired: _paired, rubricPreview: _preview, ...lobby } = member.lobby; return lobby; }
    const kit = member.lobby.kit;
    // Whitelist gameplay fields: sim may attach classroom source facts outside PlayerKit.
    const safeKit: PlayerKit | null = kit ? {
      repo: kit.repo, title: 'Private repo hero', weapon: kit.weapon, skill: kit.skill,
      maxHp: kit.maxHp, maxArmor: kit.maxArmor, maxEnergy: kit.maxEnergy, speed: kit.speed,
      damageMul: kit.damageMul, palette: kit.palette, seed: kit.seed,
      quality: kit.quality?.map(q => ({ stat: q.stat, value: q.value, grade: q.grade,
        signal: 'Private source quality', tip: 'Reconnect GitHub and reselect the repo to view source tips.' })),
    } : null;
    return { id: member.lobby.id, name: member.lobby.name, repo: member.lobby.repo, status: member.lobby.status,
      error: member.lobby.error, bot: member.lobby.bot, kit: safeKit };
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
    try { this.store.save(this.savedRooms(), [...this.revokedTokens]); }
    catch { console.error('Room persistence write failed; current rooms remain available in memory.'); }
  }

  createRoom(requestedCode?: string, mode: GameMode = 'battle'): string {
    let code = requestedCode?.toUpperCase();
    if (code && !/^[A-Z]{4}$/.test(code)) throw new Error('Use a four-letter room code (A–Z only; no digits).');
    if (code && this.rooms.has(code)) return code;
    if (!code) do { code = Array.from(randomBytes(4), byte => String.fromCharCode(65 + byte % 26)).join(''); } while (this.rooms.has(code));
    const room: Room = { code, ownerId: '', mode, rubric: mode === 'edu' ? this.services.defaultRubric?.() : undefined,
      members: new Map(), bans: { tokens: new Set(), identities: new Set() }, boss: { repo: null, status: 'empty', kit: null }, bossRevision: 0, phase: 'lobby', events: [] };
    this.rooms.set(code, room);
    this.scheduleCleanup(room);
    this.persist();
    return code;
  }

  createScreenHostedRoom(mode: 'battle' | 'pvp'): { room: string; hostToken: string } {
    const code = this.createRoom(undefined, mode), room = this.rooms.get(code)!;
    const id = randomUUID(), token = randomBytes(24).toString('hex'), name = 'Big screen';
    room.members.set(id, { id, token, name, role: 'screen', socket: null, revision: 0, inputAt: 0,
      controlsReady: false, screenHostPending: true, lobby: { id, name, repo: null, status: 'empty', kit: null } });
    room.ownerId = id;
    this.persist();
    return { room: code, hostToken: token };
  }

  roomInfo(code: string): { exists: boolean; players: number; phase: LobbyState['phase'] | null } {
    const room = this.rooms.get(code.toUpperCase());
    return room ? { exists: true, players: squad(room).length, phase: room.phase } : { exists: false, players: 0, phase: null };
  }

  private async clientIdentity(request?: IncomingMessage) {
    const session = request ? await this.services.getSession?.(request) : null;
    if (!session || !request) return { session: null, github: null };
    const direct = githubIdFromSession(session);
    let github: GithubIdentity | null = direct ? { id: direct, login: session.login } : null;
    if (!github) try { github = await this.services.getGithubIdentity?.(request, session) ?? null; } catch { /* Keep the decoded session for room-ban checks. */ }
    return { session, github };
  }

  async mySeat(code: string, request: IncomingMessage) {
    if (!/^[A-Z]{4}$/.test(code)) return { status: 400, body: { error: 'Use a four-letter room code (A–Z only; no digits).' } };
    let identity: Awaited<ReturnType<RoomServer['clientIdentity']>>;
    try { identity = await this.clientIdentity(request); } catch { return { status: 401, body: { error: controllerSignIn } }; }
    if (!identity.github || !identity.session) return { status: 401, body: { error: controllerSignIn } };
    const room = this.rooms.get(code), github = tokenHash(`github:${identity.github.id}`);
    if (room && (room.bans.identities.has(github) || (identity.session.userId && room.bans.identities.has(tokenHash(`auth0:${identity.session.userId}`))))) return { status: 403, body: { error: removedMessage } };
    const member = room && [...room.members.values()].find(m => m.role === 'player' && !m.lobby.bot && m.githubIdentity === github && !!m.socket);
    return member ? { status: 200, body: { seatId: member.id, name: member.name, paired: !!member.controllerSocket } }
      : { status: 404, body: { error: controllerNoSeat } };
  }

  eduOwnerError(code: string, token: string | undefined, lobbyOnly = false): { status: number; error: string } | undefined {
    if (!/^[A-Z]{4}$/.test(code)) return { status: 400, error: 'Use a four-letter room code (A–Z only; no digits).' };
    const room = this.rooms.get(code);
    if (!room) return { status: 404, error: 'Room not found' };
    if (!token) return { status: 401, error: 'Provide the owner room token in X-Room-Token or Authorization: Bearer' };
    const owner = room.members.get(room.ownerId);
    if (!owner || owner.lobby.bot || owner.token !== token) return { status: 403, error: 'Only the current room owner can do that' };
    if (room.mode !== 'edu') return { status: 409, error: 'Rubrics and feedback require classroom mode' };
    if (lobbyOnly && room.phase !== 'lobby') return { status: 409, error: 'Return to the lobby to upload a rubric' };
  }

  previewRubric(text: string, filename?: string): Rubric | undefined {
    return this.services.parseRubric?.(text, filename);
  }

  exportClassroom(code: string, format: 'csv' | 'md'): string | undefined {
    const room = this.rooms.get(code), classroom = room?.classroom;
    return classroom ? classroomExport(classroom.publicState(), format, room?.locale ?? 'en') : undefined;
  }
  exportFeedback(code: string, format: 'csv' | 'md'): string | undefined {
    const room = this.rooms.get(code);
    if (!room || room.phase !== 'autopsy' || !room.feedback || !room.matchRubric) return;
    return format === 'csv' ? feedbackCsv(room.matchRubric, room.feedback) : feedbackMarkdown(room.matchRubric, room.feedback);
  }

  lobby(room: Room): LobbyState {
    return { room: room.code, ownerId: room.ownerId, mode: room.mode, ...(room.mode === 'edu' ? { locale: room.locale ?? 'en' } : {}),
      players: squad(room).map(m => ({ ...m.lobby, paired: !!m.controllerSocket, controlsReady: seatControlsReady(m), rubricPreview: this.rubricPreview(room, m) })), boss: { ...room.boss }, phase: room.phase,
      ...(room.classroom ? { classroom: room.classroom.publicState() } : {}),
      ...(room.mode === 'edu' && room.rubric ? { rubric: room.rubric } : {}) };
  }

  private rubricPreview(room: Room, member: Member): CriterionResult[] | undefined {
    if (room.mode !== 'edu' || room.phase !== 'lobby' || member.lobby.status !== 'ready' || !member.profile || !this.services.scoreRepo) {
      member.preview = undefined; return;
    }
    const rubric = room.rubric ?? this.services.defaultRubric?.();
    if (!rubric) { member.preview = undefined; return; }
    if (member.preview?.profile === member.profile && member.preview.rubric === rubric) return member.preview.results;
    const results = this.services.scoreRepo(member.profile, rubric).map(r => ({ criterionId: r.criterionId, score: r.score, evidence: r.evidence, ...(r.tip ? { tip: r.tip } : {}) }));
    member.preview = { profile: member.profile, rubric, results };
    return results;
  }

  private receiptResult(member:Member,result:Autopsy,controller=false):Autopsy {
    if(!result.receiptIds)return result;
    const id=!controller&&member.role==='player'?result.receiptIds[member.id]:undefined;
    return {...result,receiptIds:id?{[member.id]:id}:undefined};
  }
  private broadcast(room: Room, message: ServerMsg) {
    if(message.t==='autopsy'&&message.result.receiptIds){
      for(const member of room.members.values()) {
        send(member.socket,{t:'autopsy',result:this.receiptResult(member,message.result)});
        send(member.controllerSocket??null,{t:'autopsy',result:this.receiptResult(member,message.result,true)});
      }
      return;
    }
    const packet = JSON.stringify(message);
    for (const m of room.members.values()) { if (m.socket?.readyState === WebSocket.OPEN) m.socket.send(packet); if (m.controllerSocket?.readyState === WebSocket.OPEN) m.controllerSocket.send(packet); }
  }

  private broadcastLobby(room: Room, persist = true) {
    if (this.closing) return;
    if (persist) this.persist();
    room.lastProgressAt = Date.now();
    this.broadcast(room, { t: 'lobby', lobby: this.lobby(room) });
  }

  private queueProgress(room: Room, key: string, valid: () => boolean, apply: (progress: GenesisProgress) => void, progress: GenesisProgress) {
    if (this.closing || this.rooms.get(room.code) !== room || !valid()) return;
    const next: GenesisProgress = { stage: progress.stage, pct: Number.isFinite(progress.pct) ? Math.max(0, Math.min(1, progress.pct)) : 0,
      ...(progress.paths ? { paths: progress.paths.slice(0, 8) } : {}), ...(progress.note ? { note: progress.note } : {}) };
    room.pendingProgress ??= new Map();
    room.pendingProgress.set(key, () => { if (!valid()) return false; apply(next); return true; });
    const flush = () => {
      room.progressTimer = undefined;
      if (this.closing || this.rooms.get(room.code) !== room) return;
      const remaining = 125 - (Date.now() - (room.lastProgressAt ?? 0));
      if (remaining > 0) { room.progressTimer = setTimeout(flush, remaining); room.progressTimer.unref(); return; }
      const pending = [...room.pendingProgress!.values()]; room.pendingProgress!.clear();
      let changed = false;
      for (const update of pending) changed = update() || changed;
      if (changed) this.broadcastLobby(room, false); // Stream telemetry is ephemeral, not a disk-write loop.
    };
    if (!room.progressTimer) {
      room.progressTimer = setTimeout(flush, Math.max(0, 125 - (Date.now() - (room.lastProgressAt ?? 0))));
      room.progressTimer.unref();
    }
  }

  private heroProgress(room: Room, member: Member, revision: number) {
    return (progress: GenesisProgress) => this.queueProgress(room, member.id,
      () => revision === member.revision && member.lobby.status === 'analyzing' && room.members.get(member.id) === member,
      value => { member.lobby.progress = value; }, progress);
  }

  private bossProgress(room: Room, revision: number) {
    return (progress: GenesisProgress) => this.queueProgress(room, 'boss',
      () => revision === room.bossRevision && room.boss.status === 'analyzing',
      value => { room.boss.progress = value; }, progress);
  }

  private async handle(socket: WebSocket, raw: string) {
    // JSON escaping can expand a 200 KiB text submission 6x; plans may hold 12 starters.
    if (raw.length > 16 * 1024 * 1024) throw new Error('Room message is too large');
    let msg: ClientMsg;
    try { msg = JSON.parse(raw); } catch { throw new Error('Invalid JSON'); }
    if (!msg || typeof msg.t !== 'string') throw new Error('Invalid message');
    if (this.sessions.get(socket)?.controller && !['input', 'controls', 'leave', 'pairEnd'].includes(msg.t)) throw new Error('This phone is a controller');
    const limit = msg.t === 'classroomPlan' ? 16 * 1024 * 1024 : msg.t === 'classroomSubmitCode' ? 2 * 1024 * 1024 : 256 * 1024;
    if (raw.length > limit) throw new Error('Room message is too large');
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
    if (!session || (session.controller ? session.member.controllerSocket !== socket : session.member.socket !== socket)) throw new Error('Send hello first');
    const { room, member } = session;
    if (session.controller && !['input', 'controls', 'leave', 'pairEnd'].includes(msg.t)) throw new Error('This phone is a controller');
    if (msg.t === 'pairEnd' || (session.controller && msg.t === 'leave')) { this.detachController(room, member, true); return; }
    if (msg.t === 'leave') { this.leave(socket, room, member); return; }
    if (msg.t === 'kick' || msg.t === 'transferOwner') {
      if (room.ownerId !== member.id) throw new Error('Only the room owner can do that');
      if (msg.t === 'transferOwner' && room.mode === 'edu') throw new Error("The teacher can't hand over a classroom.");
      if (msg.t === 'transferOwner' && room.phase === 'match') throw new Error('Hand over the room after the match.');
      if (typeof msg.playerId !== 'string') throw new Error('Choose a room member');
      const target = room.members.get(msg.playerId);
      if (!target) throw new Error('That member is no longer in this room');
      if (target.id === member.id) throw new Error(msg.t === 'kick' ? "You can't kick yourself." : 'Choose someone else to host.');
      if (msg.t === 'kick') {
        this.kickMember(room, target, member.name);
      } else {
        if (target.lobby.bot || !target.socket || target.socket.readyState !== WebSocket.OPEN) throw new Error('Choose a connected human to host.');
        room.ownerId = target.id;
        this.broadcastLobby(room); this.flushPersistence();
      }
      return;
    }
    if (msg.t === 'pause') {
      if (room.ownerId !== member.id) throw new Error('Only the room owner can pause or resume');
      if (typeof msg.paused !== 'boolean') throw new Error('Choose pause or resume');
      if (!(room.phase === 'match' && room.match) && room.classroom?.state.phase !== 'raid') throw new Error('Pause is available during a match');
      if (msg.paused) {
        if (!room.paused || room.paused.resumeAt !== null || room.paused.by !== member.id) {
          room.paused = { by: member.id, since: Date.now(), resumeAt: null };
          room.pauseOwnerDeadline = undefined;
          room.classroom?.pauseHostClock(); this.clearInputs(room); this.publishPause(room);
        }
      } else this.requestResume(room);
      return;
    }
    if (['classroomLanguage', 'classroomPlan', 'classroomControl', 'classroomSubmit', 'classroomSubmitCode', 'classroomReview'].includes(msg.t)) {
      await this.handleClassroom(room, member, msg); return;
    }
    if (room.classroom && !['controls', 'input'].includes(msg.t)) throw new Error('Use the classroom controls for this lesson');
    if (msg.t === 'controls') {
      if (member.role !== 'player') return;
      if (typeof msg.ready !== 'boolean' || !['standard', 'seated', 'tap-only'].includes(msg.mode)
          || (msg.needsController !== undefined && typeof msg.needsController !== 'boolean')) throw new Error('Invalid controls readiness');
      const beforeReady = member.controlsReady, beforeMode = member.controlsMode, beforeRequired = !!member.needsController;
      if (session.controller) {
        member.controllerReady = msg.ready; member.controlsReady = msg.ready; member.controlsMode = msg.mode;
      } else {
        if (msg.needsController !== undefined) member.needsController = msg.needsController;
        member.displayKeyboardReady = !member.needsController && !phoneRequest(this.requests.get(socket)) && msg.ready;
        if (member.needsController) member.controlsReady = !!member.controllerSocket && member.controllerReady === true;
        else { member.controlsReady = msg.ready; member.controlsMode = msg.mode; }
      }
      const policyChanged = beforeRequired !== !!member.needsController;
      if (policyChanged) this.persist();
      if (!policyChanged && beforeReady === member.controlsReady && beforeMode === member.controlsMode) return;
      this.broadcastLobby(room, false); // Permission stays page-local; only needsController is durable.
      return;
    }
    if (msg.t === 'input') {
      if (member.role !== 'player' || room.phase !== 'match') return;
      if (room.paused) return;
      if (room.mode === 'pvp') {
        const fighter = room.state?.players.find(p => p.id === member.id);
        if (!fighter || fighter.eliminated) return;
      }
      const f = sanitizeInputFrame(msg.frame);
      if (!f) return;
      const seq = session.controller ? member.controllerSeq : member.displaySeq;
      if (seq !== undefined && f.seq <= seq) return;
      if (session.controller) member.controllerSeq = f.seq; else {
        member.displaySeq = f.seq;
        const activeKeyboard = f.source === 'keyboard' && (f.move[0] !== 0 || f.move[1] !== 0 || f.fire || f.dash || f.skill);
        if (activeKeyboard && !member.needsController) member.displayKeyboardReady = true;
        // The phone owns a linked seat. Display heartbeat/auto-aim frames are
        // acknowledged, but must neither replace tilt nor renew its stale timer.
        if (member.controllerSocket && !activeKeyboard) return;
      }
      const pending = member.input;
      member.input = { ...f, dash: !!f.dash || !!pending?.dash, skill: !!f.skill || !!pending?.skill };
      member.inputAt = Date.now();
      member.inputFromController = !!session.controller;
      return;
    }
    const ownerAction = msg.t === 'setBoss' || msg.t === 'setBots' || msg.t === 'setMode' || msg.t === 'setRubric' || msg.t === 'start' || msg.t === 'rematch';
    if (ownerAction) {
      if (room.ownerId !== member.id) throw new Error('Only the room owner can do that');
    } else if (member.role !== 'player') throw new Error('Spectators cannot change the room');
    if (msg.t === 'rematch') {
      if (room.phase !== 'autopsy') throw new Error('Wait for the match to finish');
      room.restartNotice = undefined;
      room.phase = 'lobby'; room.match = undefined; room.departed = undefined; room.state = undefined; room.result = undefined; room.events = [];
      room.feedback = undefined; room.feedbackProfiles = undefined; room.matchRubric = undefined;
      for (const m of room.members.values()) { m.input = undefined; m.displaySeq = undefined; m.controllerSeq = undefined; }
      this.preparePvpBots(room);
      this.broadcastLobby(room);
      return;
    }
    if (room.phase !== 'lobby') throw new Error('Wait until the lobby to change repos or start');
    if (msg.t === 'setRubric') {
      if (room.mode !== 'edu') throw new Error('Rubrics require classroom mode');
      room.rubric = normalizeRubric(msg.rubric);
      this.broadcastLobby(room);
    } else if (msg.t === 'setMode') {
      await this.setMode(room, msg.mode);
    } else if (msg.t === 'setBots') {
      await this.setBots(room, msg.count);
    } else if (msg.t === 'setRepo') {
      const revision = ++member.revision;
      member.profile = undefined;
      member.pvpAccess = undefined;
      member.lobby = { id: member.id, name: member.name, repo: msg.repo, status: 'analyzing', kit: null, progress: { stage: 'clone', pct: 0 } };
      room.pendingProgress?.delete(member.id);
      this.broadcastLobby(room);
      let credentialed = false;
      try {
        const request = this.requests.get(socket);
        let token: string | null = null;
        try { token = request && this.services.getGithubToken ? await this.services.getGithubToken(request) : null; }
        catch { throw new Error('GitHub connection unavailable. Reconnect GitHub and retry.'); }
        if (revision !== member.revision || member.socket !== socket) return;
        if (room.mode === 'pvp') {
          if (!token || !this.services.verifyPvpAccess) throw new Error('Connect GitHub before choosing a PvP repository.');
          const access = await this.services.verifyPvpAccess(msg.repo, token);
          if (revision !== member.revision || member.socket !== socket) return;
          const identity = tokenHash(`github:${access.userId}`);
          member.identities = [...new Set([...(member.identities ?? []), identity])];
          if (room.bans.identities.has(identity)) {
            send(socket, { t: 'error', message: removedMessage });
            this.kickMember(room, member, room.members.get(room.ownerId)?.name ?? 'the host'); return;
          }
          if ([...room.members.values()].some(m => m.id !== member.id && m.socket && m.pvpAccess?.userId === access.userId)) throw new Error('PvP needs different GitHub accounts.');
          member.pvpAccess = access;
          // Public eligibility was just verified using the owner's token. Analyze
          // public source anonymously so it can safely enter the public royale Hall.
          if (!access.private) token = null;
        }
        credentialed = !!token;
        member.privateRepo = credentialed; // Set before streaming any private paths.
        // The token lives only in this call; never attach it to member/profile/kit/messages.
        const profile = await this.services.analyzeRepo(msg.repo, { ...(token ? { token } : {}), onProgress: this.heroProgress(room, member, revision) });
        if (revision !== member.revision) return;
        member.privateRepo = credentialed;
        member.profile = profile;
        room.pendingProgress?.delete(member.id);
        member.lobby.progress = { stage: 'map', pct: 0.82 };
        this.broadcastLobby(room);
        const kit = this.services.playerKitFromProfile(profile, { mode: room.mode });
        member.lobby = { id: member.id, name: member.name, repo: profile.slug, status: 'ready', kit,
          genesis: this.services.buildGenesis?.(profile, kit, 'hero'), progress: { stage: 'ready', pct: 1 } };
        if (!credentialed) this.refineHero(room, member, revision, profile);
      } catch (error) {
        if (revision !== member.revision) return;
        member.lobby.progress = undefined; room.pendingProgress?.delete(member.id);
        member.lobby.status = 'error'; member.lobby.error = credentialed
          ? 'Could not analyze this repository. Check GitHub access and try again.'
          : error instanceof Error ? error.message : 'Analysis failed';
      }
      this.broadcastLobby(room);
    } else if (msg.t === 'setBoss') {
      if (room.mode !== 'battle') throw new Error('This mode has no boss repository.');
      const revision = ++room.bossRevision;
      room.bossProfile = undefined;
      room.privateBoss = false;
      room.boss = { repo: msg.repo, status: 'analyzing', kit: null, progress: { stage: 'clone', pct: 0 } };
      room.pendingProgress?.delete('boss');
      this.broadcastLobby(room);
      let credentialed = false;
      try {
        const request = this.requests.get(socket);
        let token: string | null = null;
        try { token = request && this.services.getGithubToken ? await this.services.getGithubToken(request) : null; }
        catch { throw new Error('GitHub connection unavailable. Reconnect GitHub and retry.'); }
        if (revision !== room.bossRevision || member.socket !== socket || room.ownerId !== member.id) return;
        credentialed = !!token;
        room.privateBoss = credentialed;
        const profile = await this.services.analyzeRepo(msg.repo, { ...(token ? { token } : {}), onProgress: this.bossProgress(room, revision) });
        if (revision !== room.bossRevision) return;
        room.pendingProgress?.delete('boss');
        room.boss.progress = { stage: 'map', pct: 0.82 };
        this.broadcastLobby(room);
        const kit = this.services.bossKitFromProfile(profile, Math.max(1, squad(room).length));
        room.bossProfile = profile; room.boss = { repo: profile.slug, status: 'ready', kit,
          genesis: this.services.buildGenesis?.(profile, kit, 'boss'), progress: { stage: 'ready', pct: 1 } };
        if (!credentialed) this.refineBoss(room, revision, profile, kit);
      } catch (error) {
        if (revision !== room.bossRevision) return;
        room.boss.progress = undefined; room.pendingProgress?.delete('boss');
        room.boss.status = 'error'; room.boss.error = credentialed
          ? 'Could not analyze this repository. Check GitHub access and try again.'
          : error instanceof Error ? error.message : 'Analysis failed';
      }
      this.broadcastLobby(room);
    } else if (msg.t === 'start') {
      if (room.mode === 'edu' && !this.options.allowLegacyEdu) throw new Error('Classroom mode now attacks one shared Boss. Refresh and open the teacher screen to publish a lesson.');
      if (room.mode === 'pvp') await this.validatePvpStart(room, member);
      this.start(room);
    } else { throw new Error('Unknown message'); }
  }

  private refineHero(room: Room, member: Member, revision: number, profile: RepoProfile) {
    if (!this.services.enhanceHeroKit || !member.lobby.kit) return;
    member.lobby.progress = { stage: 'design', pct: 0.9 };
    void this.services.enhanceHeroKit(profile, structuredClone(member.lobby.kit)).then(decorated => {
      if (revision !== member.revision || !member.lobby.kit || this.rooms.get(room.code) !== room) return;
      // Only appearance fields cross this boundary; AI output cannot modify balance.
      member.lobby.kit = { ...member.lobby.kit, design: decorated.design, title: decorated.title, palette: decorated.palette };
      member.lobby.genesis = this.services.buildGenesis?.(profile, member.lobby.kit, 'hero');
      member.lobby.progress = { stage: 'ready', pct: 1 };
      this.broadcastLobby(room);
    }).catch(() => {
      if (revision !== member.revision || !member.lobby.kit || this.rooms.get(room.code) !== room) return;
      member.lobby.progress = { stage: 'ready', pct: 1 };
      this.broadcastLobby(room);
    });
  }

  private refineBoss(room: Room, revision: number, profile: RepoProfile, seedKit: BossKit) {
    if (!this.services.enhanceBossKit) return;
    room.boss.progress = { stage: 'design', pct: 0.9 };
    void this.services.enhanceBossKit(profile, structuredClone(seedKit)).then(decorated => {
      if (revision !== room.bossRevision || !room.boss.kit || this.rooms.get(room.code) !== room) return;
      const kit = room.boss.kit;
      room.boss.kit = { ...kit, design: decorated.design, name: decorated.name, palette: decorated.palette, theme: decorated.theme,
        attacks: kit.attacks.map(attack => ({ ...attack, name: decorated.attacks.find(a => a.id === attack.id)?.name ?? attack.name })) };
      room.boss.genesis = this.services.buildGenesis?.(profile, room.boss.kit, 'boss');
      room.boss.progress = { stage: 'ready', pct: 1 };
      // Running matches keep their cloned kit. A late result is ready for the next lobby/rematch.
      this.broadcastLobby(room);
    }).catch(() => {
      if (revision !== room.bossRevision || !room.boss.kit || this.rooms.get(room.code) !== room) return;
      room.boss.progress = { stage: 'ready', pct: 1 };
      this.broadcastLobby(room);
    });
  }

  private makeRoomForHuman(room: Room) {
    if (room.phase === 'lobby' && squad(room).length >= capacity(room)) {
      const last = bots(room).at(-1);
      if (last) { last.revision++; room.members.delete(last.id); }
    }
  }

  private async rebuildHero(room: Room, member: Member, broadcast = true) {
    const repo = member.lobby.repo;
    if (!repo) return;
    const revision = ++member.revision, mode = room.mode;
    if (mode === 'pvp' && !member.lobby.bot) {
      member.pvpAccess = undefined; member.profile = undefined;
      member.lobby = { id: member.id, name: member.name, repo: null, status: 'empty', kit: null };
      if (broadcast) this.broadcastLobby(room); return;
    }
    const oldKit = member.lobby.kit;
    member.lobby = { ...member.lobby, status: 'analyzing', error: undefined, genesis: undefined, progress: { stage: 'map', pct: 0.82 } };
    if (broadcast) this.broadcastLobby(room);
    try {
      let profile = member.profile;
      if (!profile) {
        if (member.lobby.bot && this.services.botProfile) profile = this.services.botProfile(repo);
        else {
          const request = member.socket ? this.requests.get(member.socket) : undefined;
          let token: string | null = null;
          try { token = request && this.services.getGithubToken ? await this.services.getGithubToken(request) : null; }
          catch { throw new Error('Reconnect GitHub and reselect this repo.'); }
          if (revision !== member.revision || room.mode !== mode) return;
          if (member.privateRepo && !token) throw new Error('Reconnect GitHub and reselect this private repo.');
          member.privateRepo = !!token;
          profile = await this.services.analyzeRepo(repo, { ...(token ? { token } : {}), onProgress: this.heroProgress(room, member, revision) });
        }
      }
      if (revision !== member.revision || room.mode !== mode || this.rooms.get(room.code) !== room) return;
      member.profile = profile;
      let kit = this.services.playerKitFromProfile(profile, { mode });
      if (oldKit) kit = { ...kit, title: oldKit.title, palette: oldKit.palette, design: oldKit.design };
      if (mode === 'pvp' && member.lobby.bot) kit = asPvpAiKit(kit);
      member.lobby = { ...member.lobby, status: 'ready', kit,
        genesis: this.services.buildGenesis?.(profile, kit, 'hero'), progress: { stage: 'ready', pct: 1 } };
      if (!member.privateRepo && !kit.design) this.refineHero(room, member, revision, profile);
    } catch {
      if (revision !== member.revision || this.rooms.get(room.code) !== room) return;
      member.lobby.status = 'error'; member.lobby.progress = undefined;
      member.lobby.error = 'Reselect this repo to update its stats; reconnect GitHub for private repos.';
    }
    if (broadcast) this.broadcastLobby(room);
  }

  private async setMode(room: Room, mode: GameMode) {
    if (mode !== 'battle' && mode !== 'edu' && mode !== 'pvp') throw new Error('Choose battle, classroom, or PvP mode');
    if (room.mode === mode) return;
    if (mode === 'battle' && connectedPlayers(room).length > 8) throw new Error('Battle supports 8 players. Keep this class in edu mode or ask students to leave first.');
    if (mode === 'pvp' && connectedPlayers(room).length > 8) throw new Error('PvP supports up to eight players.');
    room.mode = mode;
    for (const member of room.members.values()) member.pvpAccess = undefined;
    if (mode === 'pvp') {
      for (const member of room.members.values()) if (!member.lobby.bot) {
        member.revision++; member.profile = undefined;
        member.lobby = { id: member.id, name: member.name, repo: null, status: 'empty', kit: null };
      }
      for (const bot of bots(room).slice(Math.max(0, 8 - connectedPlayers(room).length))) { bot.revision++; room.members.delete(bot.id); }
      await Promise.all(bots(room).map(bot => this.rebuildHero(room, bot, false)));
      this.broadcastLobby(room); return;
    }
    if (mode === 'edu' && !room.rubric) room.rubric = this.services.defaultRubric?.();
    const keepBots = Math.max(0, capacity(room) - connectedPlayers(room).length);
    for (const bot of bots(room).slice(keepBots)) { bot.revision++; room.members.delete(bot.id); }
    const jobs = squad(room).filter(m => m.lobby.repo && (m.lobby.status === 'ready' || m.lobby.status === 'analyzing')).map(m => this.rebuildHero(room, m, false));
    this.broadcastLobby(room);
    await Promise.all(jobs);
    this.broadcastLobby(room);
  }

  private async setBots(room: Room, requested: number) {
    if (!Number.isFinite(requested)) throw new Error('Choose 0–7 AI teammates');
    const count = Math.min(7, capacity(room) - connectedPlayers(room).length, Math.max(0, Math.floor(requested)));
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
      const member: Member = { id, name, token: '', role: 'player', socket: null, revision: 1, inputAt: 0, controlsReady: true, botSeed: seed,
        lobby: { id, name, repo, bot: true, status: 'analyzing', kit: null } };
      room.members.set(id, member);
      pending.push((async () => {
        try {
          const profile = this.services.botProfile ? this.services.botProfile(repo) : await this.services.analyzeRepo(repo);
          if (room.members.get(id) !== member) return;
          member.profile = profile;
          let kit = this.services.playerKitFromProfile(profile, { mode: room.mode });
          if (room.mode === 'pvp') kit = asPvpAiKit(kit);
          member.lobby = { ...member.lobby, repo: profile.slug, status: 'ready', kit,
            genesis: this.services.buildGenesis?.(profile, kit, 'hero'), progress: { stage: 'ready', pct: 1 } };
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
    if (msg.role === 'controller') { await this.helloController(socket, msg); return; }
    if (msg.role !== 'screen' && msg.role !== 'player') throw new Error('Choose player, screen or controller');
    const code = String(msg.room).toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) throw new Error('Use a four-letter room code (A–Z only; no digits).');
    let room = this.rooms.get(code);
    if (room && typeof msg.resume === 'string' && room.bans.tokens.has(tokenHash(msg.resume))) { this.rejectBan(socket); return; }
    if (typeof msg.resume === 'string' && this.revokedTokens.has(tokenHash(msg.resume))) { socket.close(4002, 'left'); return; }
    if (!room && typeof msg.resume === 'string' && msg.resume.length > 0) room = this.rooms.get(this.createRoom(code));
    if (!room) throw new Error('Room not found. Check the room code and try again.');
    const suppliedName = String(msg.name || '').trim().slice(0, 32);
    let githubName: string | undefined;
    let identity: string | undefined;
    let githubIdentity: string | undefined;
    const request = this.requests.get(socket);
    if (request && this.services.getSession) {
      try {
        const { session, github } = await this.clientIdentity(request);
        githubName = msg.role === 'player' ? session?.login : undefined;
        if (session?.userId) identity = tokenHash(`auth0:${session.userId}`);
        if (github) githubIdentity = tokenHash(`github:${github.id}`);
      }
      catch { /* Anonymous play works if session resolution is unavailable. */ }
    }
    if (this.closing || socket.readyState !== WebSocket.OPEN) return;
    if ((typeof msg.resume === 'string' && room.bans.tokens.has(tokenHash(msg.resume))) || (identity && room.bans.identities.has(identity)) || (githubIdentity && room.bans.identities.has(githubIdentity))) { this.rejectBan(socket); return; }
    if (typeof msg.resume === 'string' && this.revokedTokens.has(tokenHash(msg.resume))) { socket.close(4002, 'left'); return; }
    if (this.rooms.get(code) !== room) throw new Error('Room not found. Check the room code and try again.');
    const previousOwner = room.ownerId;
    if (msg.resume && [...room.members.values()].some(m => m.controllerToken === msg.resume)) throw new Error('This token resumes a controller, not a player display.');
    let member = msg.resume ? [...room.members.values()].find(m => m.token === msg.resume && m.role === msg.role) : undefined;
    if ((member?.identities ?? []).some(key => room.bans.identities.has(key))) { this.rejectBan(socket); return; }
    if (!member) {
      if (msg.role === 'player' && room.phase !== 'lobby') throw new Error('A match is in progress. Join as a screen or wait for the lobby.');
      if (msg.role === 'player' && room.classroom && room.classroom.state.rows.length >= 30) throw new Error('This lesson already has 30 students; reconnect with your existing session');
      if (msg.role === 'player' && connectedPlayers(room).length >= capacity(room)) throw new Error(`Room is full (${capacity(room)} players)`);
      if (msg.role === 'player') this.makeRoomForHuman(room);
      const id = randomUUID();
      const name = suppliedName || githubName?.slice(0, 32) || (msg.role === 'screen' ? 'Big screen' : 'Player');
      member = { id, name, namedByUser: !!suppliedName, token: randomBytes(24).toString('hex'), role: msg.role, socket: null, revision: 0, inputAt: 0, controlsReady: false, lobby: { id, name, repo: null, status: 'empty', kit: null } };
      room.members.set(id, member);
    } else if (!online(member) && member.role === 'player' && connectedPlayers(room).length >= capacity(room)) {
      throw new Error(`Room is full (${capacity(room)} players)`);
    } else if (member.socket) {
      this.sessions.delete(member.socket);
      member.socket.close(4001, 'Resumed in another tab');
    }
    if (identity) member.identities = [...new Set([...(member.identities ?? []), identity])];
    if (member.githubIdentity !== githubIdentity && member.controllerToken) this.detachController(room, member, true);
    member.githubIdentity = githubIdentity;
    if (githubIdentity) {
      member.identities = [...new Set([...(member.identities ?? []), githubIdentity])];
    }
    // The lobby's rename control reconnects with the same token and a new hello name.
    if (member.role === 'player' && !online(member)) this.makeRoomForHuman(room);
    member.name = suppliedName || (!member.namedByUser && githubName?.slice(0, 32)) || member.name;
    if (suppliedName) member.namedByUser = true;
    member.lobby.name = member.name;
    member.socket = socket; member.displaySeq = undefined;
    member.screenHostPending = false;
    if (!member.controllerSocket) member.input = undefined;
    if (room.mode === 'pvp' && room.phase === 'lobby') {
      member.pvpAccess = undefined; member.profile = undefined; member.revision++;
      member.lobby = { id: member.id, name: member.name, repo: null, status: 'empty', kit: null };
    }
    // Every new WS hello may be a fresh iOS page. Desktop keyboard is immediately
    // usable; phone clients must report live sensors or an explicit touch choice.
    member.displayKeyboardReady = !member.needsController && !phoneRequest(request);
    if (!member.controllerSocket) { member.controlsReady = member.displayKeyboardReady; member.controlsMode = undefined; }
    clearTimeout(room.cleanupTimer);
    this.sessions.set(socket, { room, member });
    const owner = room.members.get(room.ownerId);
    if (!room.classroom && (member.role === 'player' || room.mode === 'edu' || member.id === room.ownerId)
        && (!owner || (!owner.socket && !owner.screenHostPending))) room.ownerId = member.id;
    if (!room.classroom && room.mode === 'edu' && member.role === 'screen' && (!room.teacherId || room.teacherId === member.id || room.ownerId === member.id)) {
      room.teacherId = member.id; room.ownerId = member.id;
    }
    if (!room.classroom && member.role === 'player' && member.lobby.repo && (member.lobby.status === 'analyzing' ||
        (member.lobby.status === 'ready' && ((room.mode === 'edu') !== !!member.lobby.kit?.quality?.length || (!!this.services.buildGenesis && !member.lobby.genesis) ||
          (room.mode === 'edu' && !!this.services.feedbackForPlayer && !member.profile))))) {
      void this.rebuildHero(room, member);
    }
    if (room.classroom) this.classroomRoster(room);
    send(socket, { t: 'welcome', you: member.id, token: member.token, lobby: this.lobby(room) });
    this.pauseOwnershipChanged(room, previousOwner);
    this.broadcastLobby(room);
    if (room.classroom) this.publishClassroom(room);
    if (room.restartNotice && !member.restartNotified) {
      send(socket, { t: 'error', message: room.restartNotice });
      member.restartNotified = true;
    }
    if (room.state) send(socket, { t: 'snapshot', state: { ...room.state, paused: room.paused ?? null, events: [] }, ack: -1 });
    if (room.result) send(socket, { t: 'autopsy', result: this.receiptResult(member,room.result) });
    this.sendFeedback(room, member);
  }

  private disconnect(socket: WebSocket) {
    if (this.closing) return;
    const session = this.sessions.get(socket);
    if (!session) return;
    if (session.controller) { if (session.member.controllerSocket === socket) this.detachController(session.room, session.member, false); return; }
    if (session.member.socket !== socket) return;
    this.sessions.delete(socket);
    const { room, member } = session;
    const previousOwner = room.ownerId;
    member.socket = null; member.displayKeyboardReady = false;
    if (!member.controllerSocket || !member.inputFromController) member.input = undefined;
    if (!member.controllerSocket) member.controlsReady = false;
    if (!room.classroom && room.ownerId === member.id) room.ownerId = connectedPlayers(room)[0]?.id ?? '';
    this.pauseOwnershipChanged(room, previousOwner);
    if (room.classroom) { this.classroomRoster(room); this.publishClassroom(room); }
    this.broadcastLobby(room);
    if (room.feedback) { const owner = room.members.get(room.ownerId); if (owner) this.sendFeedback(room, owner); }
    if (![...room.members.values()].some(online)) this.scheduleCleanup(room);
  }

  private async helloController(socket: WebSocket, msg: Extract<ClientMsg, { t: 'hello' }>) {
    const code = String(msg.room).toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) throw new Error('Use a four-letter room code (A–Z only; no digits).');
    const room = this.rooms.get(code);
    if (room && msg.resume && room.bans.tokens.has(tokenHash(msg.resume))) { this.rejectBan(socket); return; }
    if (msg.resume && this.revokedTokens.has(tokenHash(msg.resume))) { socket.close(4002, 'unlinked'); return; }
    let identity: Awaited<ReturnType<RoomServer['clientIdentity']>>;
    try { identity = await this.clientIdentity(this.requests.get(socket)); } catch { throw new Error(controllerSignIn); }
    if (!identity.session || !identity.github) throw new Error(controllerSignIn);
    if (this.closing || socket.readyState !== WebSocket.OPEN) return;
    if (!room || this.rooms.get(code) !== room) throw new Error(controllerNoSeat);
    const github = tokenHash(`github:${identity.github.id}`), auth0 = identity.session.userId ? tokenHash(`auth0:${identity.session.userId}`) : undefined;
    if (room.bans.identities.has(github) || (auth0 && room.bans.identities.has(auth0)) || (msg.resume && room.bans.tokens.has(tokenHash(msg.resume)))) { this.rejectBan(socket); return; }
    const member = [...room.members.values()].find(m => m.role === 'player' && !m.lobby.bot && m.githubIdentity === github
      && (msg.resume ? m.controllerToken === msg.resume : !!m.socket));
    if (!member) throw new Error(controllerNoSeat);
    const previous = member.controllerSocket;
    if (previous) { this.sessions.delete(previous); this.requests.delete(previous); send(previous, { t: 'error', message: 'Another phone took over the controls' }); previous.close(4001, 'Controller replaced'); }
    if (!msg.resume) {
      if (member.controllerToken) this.revokedTokens.add(tokenHash(member.controllerToken));
      member.controllerToken = randomBytes(24).toString('hex');
    }
    member.controllerSocket = socket; member.controllerSeq = undefined; member.controllerReady = false; member.controlsReady = false;
    if (member.inputFromController) { member.input = undefined; member.inputAt = 0; }
    member.identities = [...new Set([...(member.identities ?? []), github, ...(auth0 ? [auth0] : [])])];
    this.sessions.set(socket, { room, member, controller: true }); clearTimeout(room.cleanupTimer);
    this.classroomRoster(room);
    send(socket, { t: 'welcome', you: member.id, token: member.controllerToken!, controller: true, lobby: this.lobby(room) });
    this.broadcastLobby(room); this.flushPersistence();
    if (room.state) send(socket, { t: 'snapshot', state: { ...room.state, paused: room.paused ?? null, events: [] }, ack: -1 });
    if (room.result) send(socket, { t: 'autopsy', result: this.receiptResult(member,room.result,true) });
    if (room.classroom) this.publishClassroom(room);
  }

  private detachController(room: Room, member: Member, revoke: boolean) {
    const socket = member.controllerSocket;
    member.controllerSocket = null; member.controllerSeq = undefined; member.controllerReady = false;
    if (revoke && member.controllerToken) { this.revokedTokens.add(tokenHash(member.controllerToken)); member.controllerToken = undefined; }
    if (socket) { this.sessions.delete(socket); this.requests.delete(socket); if (revoke) socket.close(4002, 'unlinked'); }
    if (member.inputFromController) { member.input = undefined; member.inputAt = 0; }
    member.controlsReady = !member.needsController && !!member.socket && !!member.displayKeyboardReady;
    this.classroomRoster(room);
    this.broadcastLobby(room); this.flushPersistence();
    if (room.classroom) this.publishClassroom(room, false);
    if (![...room.members.values()].some(online)) this.scheduleCleanup(room);
  }

  private leave(socket: WebSocket, room: Room, member: Member) {
    this.removeMember(room, member, 'left');
  }

  private rejectBan(socket: WebSocket) {
    send(socket, { t: 'error', message: removedMessage }); socket.close(4003, 'kicked');
  }

  private kickMember(room: Room, member: Member, by: string) {
    if (!member.lobby.bot) {
      room.bans.tokens.add(tokenHash(member.token));
      if (member.controllerToken) room.bans.tokens.add(tokenHash(member.controllerToken));
      for (const identity of member.identities ?? []) room.bans.identities.add(identity);
      if (member.pvpAccess) room.bans.identities.add(tokenHash(`github:${member.pvpAccess.userId}`));
    }
    this.removeMember(room, member, 'kicked', by);
  }

  private removeMember(room: Room, member: Member, reason: 'left' | 'kicked', by?: string) {
    const socket = member.socket;
    const controller = member.controllerSocket;
    const previousOwner = room.ownerId;
    if (reason === 'left') this.revokedTokens.add(tokenHash(member.token));
    if (reason === 'left' && member.controllerToken) this.revokedTokens.add(tokenHash(member.controllerToken));
    ++member.revision;
    member.input = undefined; member.profile = undefined; member.preview = undefined; member.socket = null; member.controllerSocket = null;
    room.members.delete(member.id); room.pendingProgress?.delete(member.id);
    room.feedbackProfiles?.delete(member.id);
    if (room.feedback) room.feedback = room.feedback.filter(item => item.playerId !== member.id);
    if (socket) { this.sessions.delete(socket); this.requests.delete(socket); }
    if (controller) { this.sessions.delete(controller); this.requests.delete(controller); }
    if (reason === 'kicked') room.classroom?.kick(member.id); else room.classroom?.remove(member.id);
    if (room.classroom && room.teacherId === member.id) { room.classroom.end(); this.clearPause(room); }
    if (!room.classroom && room.teacherId === member.id) room.teacherId = undefined;
    const humans = [...room.members.values()].filter(m => !m.lobby.bot && online(m));
    if (!room.classroom && room.ownerId === member.id) room.ownerId = (humans.find(m => m.role === 'player') ?? (room.mode === 'edu' ? humans[0] : undefined))?.id ?? '';
    this.pauseOwnershipChanged(room, previousOwner);
    if (!humans.length) {
      for (const m of room.members.values()) { ++m.revision; if (!m.lobby.bot) this.revokedTokens.add(tokenHash(m.token)); }
      ++room.bossRevision;
      this.stopMatch(room); clearInterval(room.classroomTimer); clearTimeout(room.cleanupTimer); clearTimeout(room.progressTimer);
      room.members.clear(); room.pendingProgress?.clear(); this.rooms.delete(room.code);
    } else {
      room.departed ??= new Set(); if (room.mode !== 'pvp') room.departed.add(member.id);
      room.events = this.activeEvents(room, room.events);
      room.match?.removePlayer?.(member.id);
      if (room.match && room.phase === 'match') { this.capture(room); this.publishSnapshot(room); }
      if (room.result) { room.result = this.activeResult(room, room.result); this.broadcast(room, { t: 'autopsy', result: room.result }); }
      this.broadcastLobby(room);
      if (room.classroom) { this.classroomRoster(room); this.publishClassroom(room); }
      this.publishFeedback(room);
    }
    this.flushPersistence(); // Durable leave/revocation before acknowledging by closing.
    for (const peer of [socket, controller]) if (peer) {
      if (reason === 'kicked') send(peer, { t: 'kicked', by: by ?? 'the host' });
      peer.close(reason === 'kicked' ? 4003 : 4002, reason);
    }
  }

  private activeResult(room: Room, result: Autopsy): Autopsy {
    if (room.mode === 'pvp') return result; // Leavers retain their elimination/placement in the royale history.
    const active = (id: string) => !room.departed?.has(id);
    return { ...result, players: result.players.filter(p => active(p.id)), ranking: result.ranking?.filter(p => active(p.id)),
      mvp: result.mvp && active(result.mvp) ? result.mvp : null };
  }

  private activeEvents(room: Room, events: GameEvent[]): GameEvent[] {
    const gone = (id: string) => room.departed?.has(id);
    return events.filter(e => !('player' in e && gone(e.player)) && !('by' in e && gone(e.by)) &&
      !('target' in e && gone(e.target)) && !('source' in e && e.source && gone(e.source)) &&
      !('targetPlayer' in e && e.targetPlayer && gone(e.targetPlayer)));
  }

  private scheduleCleanup(room: Room) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = setTimeout(() => { this.stopMatch(room); clearInterval(room.classroomTimer); clearTimeout(room.progressTimer); this.rooms.delete(room.code); this.persist(); }, 10 * 60_000);
    room.cleanupTimer.unref();
  }

  private pvpFighters(room: Room) {
    const humans = connectedPlayers(room);
    const loading = [...humans, ...bots(room)].filter(m => m.lobby.status === 'analyzing');
    if (loading.length) throw new Error(`PvP is waiting for repository analysis: ${loading.map(m => m.name).join(', ')}.`);
    const failedBots = bots(room).filter(m => m.lobby.status !== 'ready' || !m.lobby.kit);
    if (failedBots.length) throw new Error(`PvP AI rivals are not ready: ${failedBots.map(m => m.name).join(', ')}. Remove and add them again.`);
    const fighters = humans.filter(m => m.lobby.status === 'ready' && m.lobby.kit);
    const unverified = fighters.filter(m => !m.pvpAccess);
    if (unverified.length) throw new Error(`PvP repository eligibility must be verified for: ${unverified.map(m => m.name).join(', ')}. Reconnect GitHub and reselect an eligible repository.`);
    const count = fighters.length + bots(room).length;
    if (count < 2) throw new Error(`PvP needs at least 2 ready fighters; found ${fighters.length} eligible human${fighters.length === 1 ? '' : 's'} and ${bots(room).length} AI rival${bots(room).length === 1 ? '' : 's'}. Add AI rivals or invite eligible players. A host without an eligible repository spectates.`);
    if (count > 8) throw new Error(`PvP supports at most 8 fighters; ${count} are ready. Remove AI rivals or reduce the roster.`);
    if (new Set(fighters.map(m => m.pvpAccess!.userId)).size !== fighters.length) throw new Error('PvP needs different GitHub accounts for every human fighter.');
    return fighters;
  }

  private async validatePvpStart(room: Room, owner: Member) {
    const roster = this.pvpFighters(room);
    const ownerSocket = owner.socket;
    const connections = connectedPlayers(room).map(member => ({ member, socket: member.socket, controller: member.controllerSocket, revision: member.revision }));
    const botRoster = bots(room).map(m => ({ id: m.id, revision: m.revision }));
    const captured = roster.map(m => ({ member: m, socket: m.socket, controller: m.controllerSocket, revision: m.revision, access: m.pvpAccess! }));
    const verified = await Promise.all(captured.map(async c => {
      try {
        const peer = c.socket ?? c.controller;
        const request = peer ? this.requests.get(peer) : undefined;
        let token: string | null | undefined;
        try { token = request ? await this.services.getGithubToken?.(request) : null; }
        catch { throw new Error('GitHub connection unavailable. Reconnect GitHub and retry.'); }
        if (!token || !this.services.verifyPvpAccess) throw new Error('Reconnect GitHub and reselect an eligible repository.');
        const access = await this.services.verifyPvpAccess(c.access.repo, token);
        if (room.bans.identities.has(tokenHash(`github:${access.userId}`))) throw new Error(removedMessage);
        return access;
      } catch (error) { throw new Error(`PvP cannot start: ${c.member.name}: ${error instanceof Error ? error.message : 'GitHub eligibility verification failed.'}`); }
    }));
    if (room.mode !== 'pvp' || room.phase !== 'lobby' || room.ownerId !== owner.id || !owner.socket || owner.socket !== ownerSocket
        || connectedPlayers(room).length !== connections.length || bots(room).length !== botRoster.length
        || connections.some(c => room.members.get(c.member.id) !== c.member || c.member.socket !== c.socket || c.member.controllerSocket !== c.controller || c.member.revision !== c.revision)
        || botRoster.some(c => room.members.get(c.id)?.revision !== c.revision)
        || captured.some((c, i) => c.member.socket !== c.socket || c.member.revision !== c.revision
          || c.member.pvpAccess !== c.access || verified[i].userId !== c.access.userId || verified[i].private !== c.access.private || verified[i].repo !== c.access.repo)) throw new Error('The PvP roster changed. Verify repositories and try again.');
    if (new Set(verified.map(v => v.userId)).size !== verified.length) throw new Error('PvP needs different GitHub accounts.');
  }

  private preparePvpBots(room: Room) {
    if (room.mode !== 'pvp') return;
    for (const member of bots(room)) if (member.lobby.kit) {
      member.lobby.kit = asPvpAiKit(member.lobby.kit);
      if (member.profile) member.lobby.genesis = this.services.buildGenesis?.(member.profile, member.lobby.kit, 'hero');
    }
  }

  private start(room: Room) {
    const humans = room.mode === 'pvp' ? this.pvpFighters(room) : connectedPlayers(room).filter(p => p.lobby.status === 'ready' && p.lobby.kit);
    if (bots(room).some(p => p.lobby.status !== 'ready' || !p.lobby.kit)) throw new Error('Wait for AI teammates to finish loading');
    const players = [...humans, ...bots(room)];
    let boss: BossKit | null = null;
    if (room.mode === 'pvp') {
      // The owner may be an unconfigured/error player or screen and spectate.
    } else if (room.mode === 'edu') {
      if (players.length < 2) throw new Error('Classroom PvP needs at least 2 ready students or bots');
      if (players.some(p => !p.lobby.kit?.quality?.length)) throw new Error('Classroom quality stats are still loading. Reselect repos after the update.');
      const missing = this.services.feedbackForPlayer || this.services.applyRubric ? players.filter(p => !p.profile) : [];
      if (missing.length) {
        for (const member of missing) void this.rebuildHero(room, member);
        throw new Error('Wait for repository evidence to refresh before starting the classroom');
      }
    } else {
      if (!humans.length) throw new Error('At least one player must choose a repo and finish analysis');
      if (room.boss.status !== 'ready' || !room.bossProfile) throw new Error('Choose a boss repo and wait for analysis');
      boss = this.services.bossKitFromProfile(room.bossProfile, players.length, room.boss.kit?.design);
      room.boss.genesis = this.services.buildGenesis?.(room.bossProfile, boss, 'boss');
      room.boss.progress = { stage: 'ready', pct: 1 };
    }
    const waiting = humans.filter(p => !seatControlsReady(p));
    if (waiting.length) throw new Error(`${waiting.length} phone${waiting.length === 1 ? ' needs' : 's need'} to tap enable motion: ${waiting.map(p => p.name).join(', ')}`);
    const matchRubric = room.mode === 'edu' && (room.rubric || this.services.defaultRubric) ? structuredClone(room.rubric ?? this.services.defaultRubric!()) : undefined;
    if (matchRubric && this.services.applyRubric) for (const member of players) {
      member.lobby.kit = this.services.applyRubric(member.profile!, member.lobby.kit!, matchRubric);
      member.lobby.genesis = this.services.buildGenesis?.(member.profile!, member.lobby.kit, 'hero');
    }
    this.preparePvpBots(room);
    const match = this.services.createMatch(players.map(p => ({ id: p.id, name: p.name, kit: p.lobby.kit! })), boss, { mode: room.mode });
    room.restartNotice = undefined;
    room.privateMatch = (room.mode === 'battle' && !!room.privateBoss) || players.some(p => p.privateRepo);
    room.receiptEligible = room.mode === 'pvp' && !room.privateMatch && players.filter(p => !p.lobby.bot).length >= 2;
    room.receiptParticipants = room.receiptEligible ? players.filter(p => !p.lobby.bot).map(p => ({id:p.id,tokenHash:tokenHash(p.token),publicKey:p.pvpAccess ? `github:${p.pvpAccess.userId}` : undefined})) : undefined;
    if (boss) room.boss.kit = boss;
    room.match = match; room.departed = new Set(); room.phase = 'match'; room.events = [];
    this.clearPause(room);
    room.feedback = undefined;
    room.matchRubric = matchRubric;
    room.feedbackProfiles = room.mode === 'edu' ? new Map(humans.flatMap(p => p.profile ? [[p.id, p.profile] as const] : [])) : undefined;
    for (const member of room.members.values()) { member.input = undefined; member.displaySeq = undefined; member.controllerSeq = undefined; }
    this.capture(room);
    this.broadcastLobby(room);
    this.publishSnapshot(room);
    // Persist the match marker before combat starts so a crash restores a lobby with a notice.
    this.flushPersistence();
    room.stepTimer = setInterval(() => {
      try {
        const now = Date.now();
        if (this.pauseBlocks(room, now)) return;
        const inputs = new Map<string, InputFrame>();
        for (const m of room.members.values()) {
          if (m.role !== 'player') continue;
          if (room.mode === 'pvp') {
            const fighter = room.state?.players.find(p => p.id === m.id);
            if (!fighter || fighter.eliminated) { m.input = m.input ? idle(m.input.seq) : undefined; m.inputAt = 0; continue; }
          }
          if (m.lobby.bot && m.botInput && room.state) {
            const player = room.state.players.find(p => p.id === m.id);
            if (player) inputs.set(m.id, sanitizeInputFrame(m.botInput(room.state, player)) ?? idle());
            continue;
          }
          inputs.set(m.id, online(m) && m.input && now - m.inputAt < INPUT_TIMEOUT_MS ? { ...m.input } : idle(m.input?.seq));
          if (m.input) { m.input.dash = false; m.input.skill = false; }
        }
        try { match.step(1 / 30, inputs); }
        catch {
          // Drop this tick's inputs without ending everybody's match. Do not replay a
          // potentially partially-applied step or log raw input/private code/errors.
          for (const m of room.members.values()) if (m.input) m.input = idle(m.input.seq);
          console.warn(`Dropped simulation frame in room ${room.code}; continuing match.`);
          return;
        }
        this.capture(room);
        if (match.over) {
          this.stopMatch(room);
          this.publishSnapshot(room);
          room.result = this.activeResult(room, match.autopsy());
          if (room.receiptEligible && this.services.recordReceipts) try {
            room.result.receiptIds = this.services.recordReceipts({eligible:true,result:structuredClone(room.result),participants:room.receiptParticipants??[],
              winner:room.state?.pvp?.royale ? room.state.pvp.royale.winner : room.result.mvp,placements:room.state?.pvp?.royale?.placements??{}});
          } catch { console.warn('Match receipt could not be saved; gameplay results remain available.'); }

          // Retain the source profile's exact heart file path for the autopsy.
          if (room.bossProfile && room.result.boss) room.result.boss.heart = room.bossProfile.heart;
          // Authenticated analysis has no visibility flag yet: conservatively keep
          // any credentialed squad out of the public event leaderboard entirely.
          try { if (room.mode === 'battle' && !room.privateMatch && room.result.mode !== 'edu' && room.result.boss) this.services.recordMatch?.(room.result, room.code, room.result.boss.repo); }
          catch (error) { console.error('Hall persistence failed:', error); }
          if (room.mode === 'pvp' && !room.privateMatch) {
            const id = room.state?.pvp?.royale?.winner;
            const winner = room.result.players.find(p => p.id === id), rank = room.result.ranking?.find(p => p.id === id);
            if (winner) try { this.services.recordRoyale?.({ name: winner.name, repo: winner.repo, kos: rank?.kos ?? 0, damage: winner.stats.damage }); }
            catch { console.warn('Royale Hall persistence failed.'); }
          }
          room.phase = 'autopsy';
          this.broadcastLobby(room);
          this.broadcast(room, { t: 'autopsy', result: room.result });
          this.finishFeedback(room);
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
    if (room.departed?.size) {
      const departed = room.departed;
      const state = room.state;
      const active = (id: string) => !departed.has(id);
      state.players = state.players.filter(p => active(p.id));
      state.bullets = state.bullets.filter(b => active(b.owner));
      state.events = this.activeEvents(room, state.events);
      if (state.boss?.targetPlayer && departed.has(state.boss.targetPlayer)) state.boss.targetPlayer = null;
      if (state.pvp) { state.pvp.scores = Object.fromEntries(Object.entries(state.pvp.scores).filter(([id]) => active(id))); if (state.pvp.leader && !active(state.pvp.leader)) state.pvp.leader = null; }
      if (state.perkOffer) state.perkOffer.picked = Object.fromEntries(Object.entries(state.perkOffer.picked).filter(([id]) => active(id)));
    }
    room.events.push(...room.state.events);
  }

  private finishFeedback(room: Room) {
    if (room.mode !== 'edu' || !room.result || !room.matchRubric || !this.services.feedbackForPlayer) return;
    room.feedback = [];
    const quizScores = (room.state?.pvp as (NonNullable<MatchState['pvp']> & { quizScores?: Record<string, number> }) | null)?.quizScores;
    for (const [index, rank] of (room.result.ranking ?? []).entries()) {
      const member = room.members.get(rank.id), profile = room.feedbackProfiles?.get(rank.id);
      if (!member || member.lobby.bot || !profile) continue;
      try {
        const quiz = quizScores?.[member.id];
        const feedback = this.services.feedbackForPlayer(profile, room.matchRubric, { playerId: member.id, name: member.name,
          rank: index + 1, kos: rank.kos, damage: rank.damage, roundWins: rank.roundWins,
          ...(typeof quiz === 'number' && Number.isFinite(quiz) ? { quiz: `${quiz} correct quiz answer${quiz === 1 ? '' : 's'}` } : {}) });
        room.feedback.push({ ...feedback, playerId: member.id, name: member.name, repo: profile.slug });
      } catch {
        console.warn('Classroom feedback unavailable for one participant.');
        send(member.socket, { t: 'error', message: 'Your feedback could not be generated. Ask the teacher to retry with your repository.' });
      }
    }
    this.publishFeedback(room);
  }

  private sendFeedback(room: Room, member: Member) {
    if (!room.feedback) return;
    const items = member.role === 'screen' || room.ownerId === member.id ? room.feedback : room.feedback.filter(f => f.playerId === member.id);
    send(member.socket, { t: 'feedback', items });
  }

  private publishFeedback(room: Room) {
    for (const member of room.members.values()) this.sendFeedback(room, member);
  }

  private publishSnapshot(room: Room) {
    if (!room.state) return;
    const state = { ...room.state, paused: room.paused ?? null, events: room.events.splice(0) };
    const json = JSON.stringify(state);
    for (const m of room.members.values()) if (m.socket?.readyState === WebSocket.OPEN) {
      m.socket.send(`{"t":"snapshot","state":${json},"ack":${m.displaySeq ?? -1}}`);
    }
    for (const m of room.members.values()) if (m.controllerSocket?.readyState === WebSocket.OPEN) m.controllerSocket.send(`{"t":"snapshot","state":${json},"ack":${m.controllerSeq ?? -1}}`);
  }

  private classroomRoster(room: Room) {
    room.classroom?.roster([...room.members.values()].filter(m => m.role === 'player' && !m.lobby.bot && m.id !== room.teacherId).map(m => ({ id: m.id, name: m.name, connected: online(m) })));
  }
  private publishClassroom(room: Room, persist = true) {
    if (!room.classroom || this.closing) return;
    const state = { ...room.classroom.publicState(), paused: room.paused ?? null };
    for (const member of room.members.values()) send(member.socket, { t: 'classroom', state, ...room.classroom.privatePayload(member.id,
      member.role === 'screen' && member.id === room.teacherId && member.id === room.ownerId) });
    for (const member of room.members.values()) send(member.controllerSocket ?? null, { t: 'classroom', state, reports: {} });
    if (persist) this.persist();
  }
  private armClassroom(room: Room) {
    clearInterval(room.classroomTimer);
    room.classroomTimer = setInterval(() => {
      if (this.pauseBlocks(room, Date.now())) { this.publishClassroom(room, false); return; }
      if (room.classroom?.tick()) this.publishClassroom(room);
    }, 200);
    room.classroomTimer.unref();
  }
  private async classroomSlot<T>(job: () => Promise<T>): Promise<T> {
    if (this.classroomJobs >= 4) await new Promise<void>(resolve => this.classroomWaiters.push(resolve));
    else this.classroomJobs++;
    try { return await job(); } finally { const next = this.classroomWaiters.shift(); if (next) next(); else this.classroomJobs--; }
  }
  private async handleClassroom(room: Room, member: Member, msg: ClientMsg) {
    if (room.mode !== 'edu' || room.phase !== 'lobby') throw new Error('Open a classroom room first');
    const teacher = member.role === 'screen' && room.teacherId === member.id && room.ownerId === member.id;
    if (msg.t === 'classroomLanguage') {
      if (!teacher) throw new Error('Only the teacher can change the classroom language');
      if (!isLocale(msg.locale)) throw new Error('Choose English, Chinese, Spanish or French');
      room.locale = msg.locale; this.broadcastLobby(room); this.publishClassroom(room); this.persist(); return;
    }
    if (msg.t === 'classroomPlan') {
      if (!teacher) throw new Error('Only the teacher can edit the lesson');
      if (room.classroom) room.classroom.setPlan(msg.plan);
      else { room.classroom = new ClassroomSession(msg.plan); this.armClassroom(room); }
      this.classroomRoster(room); this.broadcastLobby(room); this.publishClassroom(room); return;
    }
    if (!room.classroom) throw new Error('Wait for the teacher to publish the lesson');
    this.classroomRoster(room);
    if (msg.t === 'classroomControl' || msg.t === 'classroomReview') {
      if (!teacher) throw new Error('Only the teacher can control this lesson');
      if (msg.t === 'classroomControl') room.classroom.control(msg.action);
      else room.classroom.review(msg.playerId, msg.score, msg.note);
      this.publishClassroom(room); return;
    }
    if (member.role !== 'player' || member.id === room.teacherId) throw new Error('Join as a student to submit code');
    if (msg.t === 'classroomSubmitCode') {
      if (!this.services.analyzeFiles) throw new Error('In-app classroom analysis is unavailable');
      const files = normalizeEditorFiles(msg.files);
      const classroom = room.classroom, ticket = classroom.begin(member.id, 'in-app');
      this.publishClassroom(room);
      try {
        await this.classroomSlot(async () => {
          if (this.closing || this.rooms.get(room.code) !== room || !room.members.has(member.id) || !classroom.valid(ticket)) return;
          const profile = this.services.analyzeFiles!(files, 'in-app');
          classroom.accept(ticket, { profile, commit: editorCommit(files), source: 'in-app', files: files.map(f => ({ path: f.path, text: f.content })), checks: [] });
        });
      } catch { classroom.fail(ticket, 'Could not grade these editor files. Check the files and retry. No code was executed.'); }
      if (!this.closing && this.rooms.get(room.code) === room) this.publishClassroom(room);
      return;
    }
    if (msg.t !== 'classroomSubmit') throw new Error('Choose a classroom submission');
    if (!this.services.analyzeClassroomSubmission) throw new Error('GitHub classroom analysis is unavailable');
    if (typeof msg.repo !== 'string' || msg.repo.length > 300 || (msg.ref !== undefined && (typeof msg.ref !== 'string' || msg.ref.length > 200))) throw new Error('Enter a GitHub repo and a branch/ref');
    const classroom = room.classroom, ticket = classroom.begin(member.id, msg.repo);
    this.publishClassroom(room);
    try {
      const request = this.requests.get(member.socket!);
      const token = request && this.services.getGithubToken ? await this.services.getGithubToken(request) ?? '' : '';
      await this.classroomSlot(async () => {
        if (this.closing || this.rooms.get(room.code) !== room || !room.members.has(member.id) || !classroom.valid(ticket)) return;
        const source = await this.services.analyzeClassroomSubmission!(msg.repo, msg.ref || 'HEAD', token, classroom.state.plan.steps[classroom.state.stepIndex].checks.some(c => c.kind === 'ci'));
        if (!this.closing && this.rooms.get(room.code) === room && room.members.has(member.id)) classroom.accept(ticket, source);
      });
    } catch {
      classroom.fail(ticket, 'Could not grade this GitHub commit. Check the repo/branch, connect GitHub for private repos or rate limits, and retry. No fallback data was graded.');
    }
    if (!this.closing && this.rooms.get(room.code) === room) this.publishClassroom(room);
  }

  private clearInputs(room: Room) {
    for (const m of room.members.values()) { m.input = m.input ? idle(m.input.seq) : undefined; m.inputAt = 0; }
  }

  private publishPause(room: Room) {
    if (room.classroom) this.publishClassroom(room, false);
    else this.publishSnapshot(room);
  }

  private requestResume(room: Room, at = Date.now() + 3000) {
    if (!room.paused || room.paused.resumeAt !== null) return;
    room.paused.resumeAt = at; this.clearInputs(room); this.publishPause(room);
  }

  private pauseOwnershipChanged(room: Room, previousOwner: string) {
    if (!room.paused) return;
    if (room.members.get(room.ownerId)?.socket) {
      room.pauseOwnerDeadline = undefined;
      if (room.ownerId !== previousOwner && room.ownerId !== room.paused.by) this.requestResume(room);
    } else room.pauseOwnerDeadline ??= Date.now() + 60_000;
  }

  private pauseBlocks(room: Room, now: number): boolean {
    if (!room.paused) return false;
    if (room.pauseOwnerDeadline !== undefined && now >= room.pauseOwnerDeadline - 3000) this.requestResume(room, room.pauseOwnerDeadline);
    if (room.paused.resumeAt !== null && now >= room.paused.resumeAt) {
      this.clearPause(room); this.publishPause(room); return false;
    }
    return true;
  }

  private clearPause(room: Room) {
    room.paused = undefined; room.pauseOwnerDeadline = undefined;
    room.classroom?.resumeHostClock(); this.clearInputs(room);
  }

  private stopMatch(room: Room) { clearInterval(room.stepTimer); clearInterval(room.snapshotTimer); this.clearPause(room); }

  close() {
    if (this.closing) return;
    this.flushPersistence();
    this.closing = true;
    this.wss.off('connection', this.onConnection);
    for (const room of this.rooms.values()) { this.stopMatch(room); clearInterval(room.classroomTimer); clearTimeout(room.cleanupTimer); clearTimeout(room.progressTimer); }
    for (const socket of this.wss.clients) socket.terminate();
    this.rooms.clear();
  }
}
