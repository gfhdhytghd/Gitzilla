// Account-linked phone transport. Player/display resume tokens are never read or changed here.
import type { ClientMsg, LobbyState, ServerMsg } from "../../shared/types";
import type { Conn, ConnStatus } from "./net";

export interface ControllerSeat { seatId: string; name: string; paired: boolean }
export type ControllerStatus = "connecting" | "open" | "closed" | "replaced" | "kicked" | "error" | "unlinked";
export interface ControllerLinkState {
  status: ControllerStatus;
  seatId: string | null;
  lobby: LobbyState | null;
  error: string | null;
}
/** Conn-compatible for input/visual consumers. `open` means welcome.controller was accepted, not just TCP open. */
export interface ControllerLink extends Conn {
  readonly state: ControllerLinkState;
  onState(fn: (state: ControllerLinkState) => void): () => void;
  /** Explicit retry after a transport failure. Replaced/kicked/unlinked bindings cannot reclaim a seat. */
  reconnect(): void;
  /** Send pairEnd, delete ONLY the controller token, close, and stop all reconnect attempts. */
  unlink(): void;
}

export const controllerTokenKey = (room: string): string => `kaiju.controllerToken.${room}`;
export const CONTROLLER_REPLACED = "Another phone took over the controls";
const KICKED_REJOIN = "You were removed from this room by the host.";

export class ControllerLookupError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "ControllerLookupError"; }
}

export const CONTROLLER_LOOKUP_TIMEOUT_MS = 1500;

/** Optional discovery only: a failed/absent identity or seat endpoint must never block normal room entry.
 * The single deadline covers identity, seat lookup AND body parsing, even if fetch ignores abort. */
export async function lookupControllerSeat(room: string, signal?: AbortSignal): Promise<ControllerSeat | null> {
  if (signal?.aborted) return null;
  const controller = new AbortController();
  let stop = () => {};
  const fallback = new Promise<null>(resolve => { stop = () => { resolve(null); controller.abort(); }; });
  const timer = setTimeout(stop, CONTROLLER_LOOKUP_TIMEOUT_MS);
  signal?.addEventListener("abort", stop, { once: true });
  const discover = async (): Promise<ControllerSeat | null> => {
    try {
      const options = { credentials: "same-origin", cache: "no-store", signal: controller.signal } as const;
      const identityResponse = await fetch("/api/me", options);
      if (!identityResponse.ok) return null;
      const identity = await identityResponse.json();
      if (controller.signal.aborted || identity?.enabled !== true || !identity.user || typeof identity.user.login !== "string" || !identity.user.login) return null;
      const response = await fetch(`/api/rooms/${encodeURIComponent(room)}/my-seat`, options);
      if (!response.ok) return null;
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || !("seatId" in value) || typeof value.seatId !== "string" || !value.seatId ||
          !("name" in value) || typeof value.name !== "string" || !("paired" in value) || typeof value.paired !== "boolean") return null;
      return { seatId: value.seatId, name: value.name, paired: value.paired };
    } catch { return null; }
  };
  try { return await Promise.race([discover(), fallback]); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", stop); }
}

/** Open hello role=controller with its own room-scoped resume token. No player seat is ever created here. */
export function createControllerLink(opts: { room: string; name?: string }): ControllerLink {
  const key = controllerTokenKey(opts.room);
  const messages = new Set<(m: ServerMsg) => void>();
  const statuses = new Set<(s: ConnStatus) => void>();
  const states = new Set<(s: ControllerLinkState) => void>();
  let state: ControllerLinkState = { status: "connecting", seatId: null, lobby: null, error: null };
  let socket: WebSocket | null = null;
  let accepted = false, stopped = false, terminal = false, retry = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let name = opts.name ?? "controller";
  let controls: Extract<ClientMsg, { t: "controls" }> | null = null;
  const storage = {
    get() { try { return localStorage.getItem(key) ?? undefined; } catch { return undefined; } },
    set(token: string) { try { localStorage.setItem(key, token); } catch { /* private mode */ } },
    clear() { try { localStorage.removeItem(key); } catch { /* private mode */ } },
  };
  const publish = (status: ControllerStatus, error: string | null = null) => {
    state = { ...state, status, error };
    for (const fn of states) fn({ ...state });
    const connectionStatus: ConnStatus = status === "replaced" ? "displaced" : status === "kicked" ? "kicked"
      : status === "open" ? "open" : status === "connecting" ? "connecting" : "closed";
    for (const fn of statuses) fn(connectionStatus);
  };
  const cancelRetry = () => { clearTimeout(timer); timer = undefined; };
  const finish = (status: "replaced" | "kicked" | "error" | "unlinked", error: string | null = null) => {
    terminal = stopped = true; accepted = false; cancelRetry();
    storage.clear();
    const old = socket; socket = null;
    publish(status, error);
    old?.close();
    document.removeEventListener("visibilitychange", onVisible);
  };
  const open = () => {
    if (stopped || terminal || socket) return;
    cancelRetry(); accepted = false; publish("connecting");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const current = new WebSocket(`${protocol}//${location.host}/ws`);
    socket = current;
    current.onopen = () => {
      if (socket !== current || stopped) return;
      current.send(JSON.stringify({ t: "hello", room: opts.room, role: "controller", name, resume: storage.get() } satisfies ClientMsg));
    };
    current.onmessage = event => {
      if (socket !== current || stopped) return;
      let message: ServerMsg;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (!message || typeof message !== "object" || typeof message.t !== "string") return;
      if (message.t === "welcome") {
        if (message.controller !== true || !message.you || !message.token || !message.lobby) { finish("error", "This connection was not accepted as a controller."); return; }
        accepted = true; retry = 0; storage.set(message.token);
        state = { ...state, seatId: message.you, lobby: message.lobby };
        publish("open");
        // The server resets readiness on every binding/reconnect, even in the same page.
        if (controls && socket === current && accepted && !stopped) current.send(JSON.stringify(controls));
      } else if (message.t === "lobby") {
        state = { ...state, lobby: message.lobby };
        for (const fn of states) fn({ ...state });
      } else if (message.t === "kicked") finish("kicked", KICKED_REJOIN);
      else if (message.t === "error") {
        finish(message.message === CONTROLLER_REPLACED ? "replaced" : message.message === KICKED_REJOIN ? "kicked" : "error", message.message);
      }
      for (const fn of messages) fn(message);
    };
    current.onclose = event => {
      if (socket !== current) return;
      socket = null; accepted = false;
      if (event.code === 4001) return finish("replaced", CONTROLLER_REPLACED);
      if (event.code === 4002) return finish("unlinked");
      if (event.code === 4003) return finish("kicked", KICKED_REJOIN);
      publish("closed");
      if (!stopped && !terminal) timer = setTimeout(open, Math.min(4000, 250 * 2 ** Math.min(retry++, 4)));
    };
    current.onerror = () => { if (socket === current) current.close(); };
  };
  function onVisible() {
    if (document.visibilityState === "visible" && !socket && !stopped && !terminal) open();
  }
  document.addEventListener("visibilitychange", onVisible);
  const unlink = () => {
    if (terminal) return;
    if (accepted && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: "pairEnd" } satisfies ClientMsg));
    finish("unlinked");
  };
  const reconnect = () => {
    if (terminal) return;
    stopped = false;
    document.addEventListener("visibilitychange", onVisible);
    if (!socket) open();
  };
  const link: ControllerLink = {
    get state() { return { ...state }; },
    onState(fn) { states.add(fn); fn({ ...state }); return () => { states.delete(fn); }; },
    onMessage(fn) { messages.add(fn); },
    onStatus(fn) { statuses.add(fn); },
    setName(value) { name = value; },
    reclaim: reconnect,
    reconnect,
    unlink,
    send(message) {
      if (message.t === "leave" || message.t === "pairEnd") return unlink();
      if (message.t !== "input" && message.t !== "controls") throw new Error("This phone is a controller");
      if (stopped || terminal) return;
      if (message.t === "controls") controls = { ...message };
      // Drop stale input during reconnect; retain just the latest controls state.
      if (accepted && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
    close() {
      stopped = true; accepted = false; cancelRetry();
      const old = socket; socket = null; old?.close();
      document.removeEventListener("visibilitychange", onVisible);
      if (!terminal) publish("closed");
    },
  };
  open();
  return link;
}
