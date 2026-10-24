// WebSocket client: same-origin /ws, hello with a stored resume token, auto-reconnect.
import type { ClientMsg, Role, ServerMsg } from "../../shared/types";
import { store } from "./util";

export type ConnStatus = "connecting" | "open" | "closed";

export interface Conn {
  send(m: ClientMsg): void;
  onMessage(fn: (m: ServerMsg) => void): void;
  onStatus(fn: (s: ConnStatus) => void): void;
  /** Change the display name used for future hellos (reconnects). */
  setName(name: string): void;
  close(): void;
}

export interface ConnOpts {
  room: string;
  role: Role;
  name: string;
}

const tokenKey = (room: string) => `kaiju.token.${room}`;

export function connect(opts: ConnOpts): Conn {
  const msgFns: ((m: ServerMsg) => void)[] = [];
  const statusFns: ((s: ConnStatus) => void)[] = [];
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let name = opts.name;
  const queue: ClientMsg[] = [];

  const setStatus = (s: ConnStatus) => statusFns.forEach((f) => f(s));

  const open = () => {
    if (closed) return;
    setStatus("connecting");
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const sock = new WebSocket(`${proto}//${location.host}/ws`);
    ws = sock;
    sock.onopen = () => {
      retry = 0;
      const resume = opts.role === "player" ? store.get(tokenKey(opts.room)) ?? undefined : undefined;
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
      if (m.t === "welcome" && opts.role === "player") store.set(tokenKey(opts.room), m.token);
      for (const f of msgFns) f(m);
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      setStatus("closed");
      if (closed) return;
      retry++;
      setTimeout(open, Math.min(4000, 250 * 2 ** Math.min(retry, 4)));
    };
    sock.onerror = () => sock.close();
  };
  open();

  // Phones sleeping / tab switching kill sockets; reconnect fast when visible again.
  const onVis = () => {
    if (document.visibilityState === "visible" && !ws && !closed) open();
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
    close() {
      closed = true;
      document.removeEventListener("visibilitychange", onVis);
      ws?.close();
    },
  };
}
