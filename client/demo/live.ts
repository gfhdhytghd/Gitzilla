// The demo's one live room: POST /api/room?host=screen reserves the host seat for this screen and returns its
// hostToken, which is stored where net.ts keeps the screen resume token (never in a URL). The hello then resumes that
// seat, so the stage owns the room even if a phone joins first, and /r/CODE?screen=1 later resumes the same seat.
// It outlives scene changes on purpose (people keep joining while the presenter talks) and is reused across reloads.
import type { LobbyPlayer, LobbyState, ServerMsg } from "../../shared/types.ts";
import { connect, type Conn } from "../app/net.ts";
import { store } from "../app/util.ts";

// offline = no room could be created (Wi-Fi down); reconnecting = the socket dropped and net.ts is retrying
export type LiveStatus = "idle" | "creating" | "open" | "reconnecting" | "offline" | "starting";
export interface LiveRoom {
  readonly status: LiveStatus;
  readonly room: string | null;
  readonly players: LobbyPlayer[];   // humans first, in join order
  readonly owner: boolean;           // can this screen start the match itself?
  readonly error: string | null;
  joinUrl(): string;
  ensure(): void;
  /** Owner: pick the boss and start. Either way the stage then becomes the room's 3D big screen. */
  start(boss: string): void;
  subscribe(fn: () => void): () => void;
}

const KEY = "kaiju.demoRoom";
const ss = { get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } } };

export function createLiveRoom(): LiveRoom {
  let status: LiveStatus = "idle", room: string | null = null, lobby: LobbyState | null = null, you: string | null = null;
  let error: string | null = null, conn: Conn | null = null, startedFor: string | null = null;
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  const set = (s: LiveStatus, e: string | null = error) => { status = s; error = e; emit(); };

  async function reuse(code: string): Promise<boolean> {
    try {
      const r = await fetch(`/api/room/${code}`);
      const j = (await r.json()) as { exists?: boolean; phase?: string };
      return !!j.exists && j.phase === "lobby";
    } catch { return false; }
  }
  async function create() {
    set("creating", null);
    try {
      const prev = ss.get(KEY);
      if (prev && (await reuse(prev))) room = prev;
      else {
        const r = await fetch("/api/room?mode=battle&host=screen", { method: "POST" });
        if (!r.ok) throw new Error(`room service said ${r.status}`);
        const j = (await r.json()) as { room: string; hostToken?: string };
        room = j.room;
        if (j.hostToken) store.set(`kaiju.screenToken.${room}`, j.hostToken);
        ss.set(KEY, room);
      }
    } catch {
      return set("offline", "Wi-Fi down: no live room");
    }
    conn = connect({ room, role: "screen", name: "Demo stage" });
    conn.onStatus((s) => { if (s === "open" && status !== "starting") set("open", null); else if (s === "closed" && status === "open") set("reconnecting", "reconnecting…"); });
    conn.onMessage((m: ServerMsg) => {
      if (m.t === "welcome") { you = m.you; lobby = m.lobby; set("open", null); }
      else if (m.t === "lobby") {
        lobby = m.lobby;
        if (status === "starting" && startedFor && lobby.boss.repo === startedFor && lobby.boss.status === "ready" && lobby.phase === "lobby") { startedFor = null; conn?.send({ t: "start" }); }
        emit();
      }
      // a refused start (e.g. "waiting for controls: leo") keeps the wall up with the reason; START retries
      else if (m.t === "error") { error = m.message; if (status === "starting") { status = "open"; startedFor = null; } emit(); }
      if (status === "starting" && (m.t === "snapshot" || (m.t === "lobby" && m.lobby.phase === "match"))) bigScreen();
    });
  }
  function bigScreen() {
    if (!room) return;
    conn?.close();
    location.assign(`/r/${room}?screen=1&view=25d`);
  }

  return {
    get status() { return status; },
    get room() { return room; },
    get players() { return (lobby?.players ?? []).filter((p) => !p.bot).concat((lobby?.players ?? []).filter((p) => p.bot)); },
    get owner() { return !!lobby && !!you && lobby.ownerId === you; },
    get error() { return error; },
    joinUrl: () => (room ? `${location.origin}/r/${room}` : location.origin),
    ensure() { if (status === "idle" || (status === "offline" && !conn)) void create(); },
    start(boss) {
      if (!room || !conn) return;
      status = "starting"; emit();
      if (this.owner) {
        // the boss must be analyzed before start; the lobby handler starts once it reports ready
        startedFor = boss; error = null;
        if (lobby?.boss.repo === boss && lobby.boss.status === "ready") conn.send({ t: "start" });
        else conn.send({ t: "setBoss", repo: boss });
      } else {
        // only if the server didn't grant the host seat (older server): become the big screen, the host phone starts
        bigScreen();
      }
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
