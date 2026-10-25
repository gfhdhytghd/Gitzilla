// The demo's one live room: created through the same POST /api/room the landing page uses, joined as the spectator
// big screen (net.ts stores the screen token, so /r/CODE?screen=1 later resumes this exact seat). It outlives scene
// changes on purpose (people keep joining while the presenter talks) and is reused across reloads of /demo.
import type { LobbyPlayer, LobbyState, ServerMsg } from "../../shared/types.ts";
import { connect, type Conn } from "../app/net.ts";

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
        const r = await fetch("/api/room?mode=battle", { method: "POST" });
        if (!r.ok) throw new Error(`room service said ${r.status}`);
        room = ((await r.json()) as { room: string }).room;
        ss.set(KEY, room);
      }
    } catch {
      return set("offline", "Wi-Fi down: no live room");
    }
    conn = connect({ room, role: "screen", name: "stage" });
    conn.onStatus((s) => { if (s === "open" && status !== "starting") set("open", null); else if (s === "closed" && status === "open") set("reconnecting", "reconnecting…"); });
    conn.onMessage((m: ServerMsg) => {
      if (m.t === "welcome") { you = m.you; lobby = m.lobby; set("open", null); }
      else if (m.t === "lobby") { lobby = m.lobby; if (startedFor && lobby.boss.repo === startedFor && lobby.boss.status === "ready" && lobby.phase === "lobby") conn?.send({ t: "start" }); emit(); }
      else if (m.t === "error") { error = m.message; emit(); }
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
        startedFor = boss;
        if (lobby?.boss.repo === boss && lobby.boss.status === "ready") conn.send({ t: "start" });
        else conn.send({ t: "setBoss", repo: boss });
        setTimeout(() => status === "starting" && bigScreen(), 8000);
      } else {
        // battle rooms are owned by the first phone: the stage just becomes the big screen and the host phone starts
        bigScreen();
      }
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
