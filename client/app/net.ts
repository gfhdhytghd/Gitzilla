// WebSocket client: same-origin /ws, hello with a stored resume token, auto-reconnect.
import type { ClientMsg, Role, ServerMsg } from "../../shared/types";
import { store } from "./util";

/** "displaced" = the server resumed this player in another tab (close 4001); we stop reconnecting until reclaim(). */
export type ConnStatus = "connecting" | "open" | "closed" | "displaced";

/** Server close code when the same resume token connects from another tab. */
export const CLOSE_RESUMED_ELSEWHERE = 4001;

export interface Conn {
  send(m: ClientMsg): void;
  onMessage(fn: (m: ServerMsg) => void): void;
  onStatus(fn: (s: ConnStatus) => void): void;
  /** Change the display name used for future hellos (reconnects). */
  setName(name: string): void;
  /** After being displaced by another tab: take the session back here. */
  reclaim(): void;
  close(): void;
}

export interface ConnOpts {
  room: string;
  role: Role;
  name: string;
}

// players and the teacher's projector screen resume separately (a teacher may also have a phone in the same browser)
const tokenKey = (room: string, role: Role = "player") => (role === "screen" ? `kaiju.screenToken.${room}` : `kaiju.token.${room}`);

export function connect(opts: ConnOpts): Conn {
  const msgFns: ((m: ServerMsg) => void)[] = [];
  const statusFns: ((s: ConnStatus) => void)[] = [];
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let displaced = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelRetry = () => {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
  };
  let name = opts.name;
  const queue: ClientMsg[] = [];

  const setStatus = (s: ConnStatus) => statusFns.forEach((f) => f(s));

  const open = () => {
    cancelRetry();
    if (closed || displaced) return;
    // never stack sockets: a wake + a pending retry both land here
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    setStatus("connecting");
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const sock = new WebSocket(`${proto}//${location.host}/ws`);
    ws = sock;
    sock.onopen = () => {
      retry = 0;
      const resume = store.get(tokenKey(opts.room, opts.role)) ?? undefined;
      sock.send(JSON.stringify({ t: "hello", room: opts.room, role: opts.role, name, resume } satisfies ClientMsg));
      setStatus("open");
      while (queue.length) sock.send(JSON.stringify(queue.shift()));
    };
    sock.onmessage = (ev) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      } catch {
        return;
      }
      if (m.t === "welcome" && m.token) store.set(tokenKey(opts.room, opts.role), m.token);
      for (const f of msgFns) f(m);
    };
    sock.onclose = (ev?: { code?: number }) => {
      if (ws !== sock) return;
      ws = null;
      if (ev?.code === CLOSE_RESUMED_ELSEWHERE) {
        // another tab took this player over; reconnecting would just steal it back, forever
        displaced = true;
        cancelRetry();
        setStatus("displaced");
        return;
      }
      setStatus("closed");
      if (closed) return;
      retry++;
      cancelRetry();
      retryTimer = setTimeout(open, Math.min(4000, 250 * 2 ** Math.min(retry, 4)));
    };
    sock.onerror = () => sock.close();
  };
  open();

  // Phones sleeping / tab switching kill sockets; reconnect fast when visible again.
  const onVis = () => {
    if (document.visibilityState === "visible" && !ws && !closed && !displaced) open();
  };
  document.addEventListener("visibilitychange", onVis);

  return {
    send(m) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
      else if (m.t !== "input") queue.push(m);
    },
    onMessage(fn) {
      msgFns.push(fn);
    },
    onStatus(fn) {
      statusFns.push(fn);
    },
    setName(n) {
      name = n;
    },
    reclaim() {
      displaced = false;
      retry = 0;
      open();
    },
    close() {
      closed = true;
      cancelRetry();
      document.removeEventListener("visibilitychange", onVis);
      ws?.close();
    },
  };
}
