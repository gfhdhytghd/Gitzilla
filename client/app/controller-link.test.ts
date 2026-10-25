import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientMsg, LobbyState, ServerMsg } from "../../shared/types";
import { CONTROLLER_REPLACED, CONTROLLER_LOOKUP_TIMEOUT_MS, controllerTokenKey, createControllerLink, lookupControllerSeat } from "./controller-link";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
class Socket {
  static OPEN = 1;
  static all: Socket[] = [];
  readyState = 0;
  sent: ClientMsg[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  constructor(readonly url: string) { Socket.all.push(this); }
  send(data: string) { if (this.readyState !== 1) throw new Error("socket not open"); this.sent.push(JSON.parse(data)); }
  open() { this.readyState = 1; this.onopen?.(); }
  message(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
  close() { this.serverClose(1000); }
  serverClose(code: number) { this.readyState = 3; this.onclose?.({ code }); }
}
const lobby = { room: "ABCD", players: [], phase: "lobby" } as unknown as LobbyState;
const welcome = (token = "controller-secret"): ServerMsg => ({ t: "welcome", you: "seat-1", token, lobby, controller: true });
const frame: Extract<ClientMsg, { t: "input" }> = { t: "input", frame: { seq: 1, source: "touch", move: [1, 0], aim: null, fire: true, dash: false, skill: false } };
let storage: MemoryStorage;
let documentMock: EventTarget & { visibilityState: string };

beforeEach(() => {
  vi.useFakeTimers(); Socket.all = []; storage = new MemoryStorage();
  documentMock = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("localStorage", storage); vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("location", { protocol: "https:", host: "example.test" }); vi.stubGlobal("document", documentMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function connected() {
  const link = createControllerLink({ room: "ABCD", name: "phone" });
  const socket = Socket.all[0]; socket.open(); socket.message(welcome());
  return { link, socket };
}

describe("optional controller seat lookup never blocks normal join", () => {
  const identity = () => new Response(JSON.stringify({ enabled: true, user: { userId: "github|1", login: "octocat" } }));
  const seat = () => new Response(JSON.stringify({ seatId: "s", name: "hero", paired: true, private: "omit" }));
  it("checks signed GitHub identity BEFORE the cookie-authenticated encoded-room lookup", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(identity()).mockResolvedValueOnce(seat()); vi.stubGlobal("fetch", fetcher);
    expect(await lookupControllerSeat("A/B")).toEqual({ seatId: "s", name: "hero", paired: true });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(["/api/me", "/api/rooms/A%2FB/my-seat"]);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", cache: "no-store", signal: expect.any(AbortSignal) });
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([{ enabled: false, user: null }, { enabled: true, user: null }, { enabled: true, user: {} }, { enabled: false, user: { login: "octocat" } }])("does not call my-seat without signed GitHub identity: %j", async user => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(user))); vi.stubGlobal("fetch", fetcher);
    expect(await lookupControllerSeat("ABCD")).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([401, 404, 403, 500])("identity HTTP%i silently joins normally without seat lookup", async status => {
    const fetcher = vi.fn().mockResolvedValue(new Response("refused", { status })); vi.stubGlobal("fetch", fetcher);
    expect(await lookupControllerSeat("ABCD")).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([401, 404, 403, 500])("my-seat HTTP%i silently falls through to normal join", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(identity()).mockResolvedValueOnce(new Response("refused", { status })));
    expect(await lookupControllerSeat("ABCD")).toBeNull();
  });
  it.each(["identity", "seat"])("HTTP200 HTML from missing %s route falls through instead of Unexpected token '<'", async endpoint => {
    const fetcher = vi.fn(); if (endpoint === "seat") fetcher.mockResolvedValueOnce(identity());
    fetcher.mockResolvedValueOnce(new Response("<!doctype html><html>Vite SPA fallback</html>")); vi.stubGlobal("fetch", fetcher);
    expect(await lookupControllerSeat("ABCD")).toBeNull();
  });
  it.each(["identity", "seat"])("%s network failure silently falls through", async endpoint => {
    const fetcher = vi.fn(); if (endpoint === "seat") fetcher.mockResolvedValueOnce(identity());
    fetcher.mockRejectedValueOnce(new Error("offline")); vi.stubGlobal("fetch", fetcher);
    expect(await lookupControllerSeat("ABCD")).toBeNull();
  });
  it.each([{ seatId: "s", name: "name" }, { seatId: 2, name: "name", paired: false }, null])("malformed seat %j is optional, not fatal", async value => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(identity()).mockResolvedValueOnce(new Response(JSON.stringify(value))));
    expect(await lookupControllerSeat("ABCD")).toBeNull();
  });
  it.each(["identity-fetch", "seat-fetch", "seat-body"])("bounds hanging %s to1500ms even if abort is ignored", async target => {
    const hanging = new Promise(() => {}); const fetcher = vi.fn();
    if (target !== "identity-fetch") fetcher.mockResolvedValueOnce(identity());
    if (target === "seat-body") fetcher.mockResolvedValueOnce({ ok: true, json: () => hanging }); else fetcher.mockReturnValueOnce(hanging);
    vi.stubGlobal("fetch", fetcher); const result = lookupControllerSeat("ABCD"); let settled = false; void result.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(CONTROLLER_LOOKUP_TIMEOUT_MS - 1); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1); expect(await result).toBeNull(); expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("shares one1500ms deadline across identity and seat (not1500ms per request)", async () => {
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(identity()), 1000))).mockReturnValueOnce(new Promise(() => {}));
    vi.stubGlobal("fetch", fetcher); const result = lookupControllerSeat("ABCD");
    await vi.advanceTimersByTimeAsync(1000); expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(500); expect(await result).toBeNull();
  });
  it("honors abort and does not issue a delayed seat request after deadline", async () => {
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn().mockReturnValue(new Promise<Response>(done => { resolve = done; })); vi.stubGlobal("fetch", fetcher);
    const abort = new AbortController(); const result = lookupControllerSeat("ABCD", abort.signal); abort.abort();
    expect(await result).toBeNull(); resolve(identity()); await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    expect(await lookupControllerSeat("ABCD", abort.signal)).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("account-linked controller transport", () => {
  it("sends only controller hello and uses a separate resume-token namespace", () => {
    storage.setItem("kaiju.token.ABCD", "display"); storage.setItem("kaiju.screenToken.ABCD", "screen");
    storage.setItem(controllerTokenKey("ABCD"), "phone");
    const link = createControllerLink({ room: "ABCD", name: "phone-name" }); const socket = Socket.all[0];
    expect(socket.url).toBe("wss://example.test/ws"); socket.open();
    expect(socket.sent).toEqual([{ t: "hello", room: "ABCD", role: "controller", name: "phone-name", resume: "phone" }]);
    expect(link.state.status).toBe("connecting"); socket.message(welcome());
    expect(link.state).toEqual({ status: "open", seatId: "seat-1", lobby, error: null });
    expect(storage.getItem(controllerTokenKey("ABCD"))).toBe("controller-secret");
    expect(storage.getItem("kaiju.token.ABCD")).toBe("display"); expect(storage.getItem("kaiju.screenToken.ABCD")).toBe("screen");
    link.close();
  });
  it("never borrows player or another room's token", () => {
    storage.setItem("kaiju.token.ABCD", "display"); storage.setItem(controllerTokenKey("OTHER"), "other");
    const link = createControllerLink({ room: "ABCD" }); Socket.all[0].open();
    expect(Socket.all[0].sent[0]).not.toHaveProperty("resume"); link.close();
  });
  it("requires welcome.controller before sending input; retains just the latest readiness", () => {
    const link = createControllerLink({ room: "ABCD" }); const socket = Socket.all[0]; socket.open();
    link.send(frame); link.send({ t: "controls", ready: false, mode: "standard" });
    link.send({ t: "controls", ready: true, mode: "tap-only" });
    expect(socket.sent).toHaveLength(1); socket.message(welcome());
    expect(socket.sent.slice(1)).toEqual([{ t: "controls", ready: true, mode: "tap-only" }]);
    link.send(frame); expect(socket.sent.at(-1)).toEqual(frame); link.close();
  });
  it("reconnects with controller token and fresh welcome readiness, dropping stale input", () => {
    const { link, socket } = connected(); link.send({ t: "controls", ready: true, mode: "seated" });
    socket.serverClose(1006); link.send(frame); vi.advanceTimersByTime(250);
    const next = Socket.all[1]; next.open(); expect(next.sent[0]).toMatchObject({ role: "controller", resume: "controller-secret" });
    expect(next.sent).toHaveLength(1); next.message(welcome("rotated"));
    expect(next.sent.slice(1)).toEqual([{ t: "controls", ready: true, mode: "seated" }]);
    expect(storage.getItem(controllerTokenKey("ABCD"))).toBe("rotated"); link.close();
  });
  it("explicit reconnect/visibility cannot create parallel sockets or honor stale socket events", () => {
    const { link, socket } = connected(); link.reconnect(); documentMock.dispatchEvent(new Event("visibilitychange"));
    expect(Socket.all).toHaveLength(1); socket.serverClose(1006); documentMock.dispatchEvent(new Event("visibilitychange"));
    expect(Socket.all).toHaveLength(2); const next = Socket.all[1]; next.open(); next.message(welcome("new"));
    socket.message(welcome("stale")); socket.serverClose(4003); vi.advanceTimersByTime(10000);
    expect(Socket.all).toHaveLength(2); expect(link.state.status).toBe("open"); expect(storage.getItem(controllerTokenKey("ABCD"))).toBe("new"); link.close();
  });
  it.each(["unlink", "leave", "pairEnd"] as const)("%s unlinks only the controller and stops reconnect", action => {
    const { link, socket } = connected(); storage.setItem("kaiju.token.ABCD", "display");
    if (action === "unlink") link.unlink(); else link.send({ t: action });
    expect(socket.sent.at(-1)).toEqual({ t: "pairEnd" }); expect(link.state.status).toBe("unlinked");
    expect(storage.getItem(controllerTokenKey("ABCD"))).toBeNull(); expect(storage.getItem("kaiju.token.ABCD")).toBe("display");
    link.reconnect(); link.reclaim(); documentMock.dispatchEvent(new Event("visibilitychange")); vi.advanceTimersByTime(10000);
    expect(Socket.all).toHaveLength(1);
  });
  it("remote unlink4002 stops without attempting to steal the display seat", () => {
    const { link, socket } = connected(); socket.serverClose(4002); vi.advanceTimersByTime(10000);
    expect(link.state.status).toBe("unlinked"); expect(Socket.all).toHaveLength(1);
  });
  it.each(["error", "close"])("replacement via %s never fights the newer phone", kind => {
    const { link, socket } = connected();
    if (kind === "error") socket.message({ t: "error", message: CONTROLLER_REPLACED }); else socket.serverClose(4001);
    expect(link.state.status).toBe("replaced"); expect(link.state.error).toBe(CONTROLLER_REPLACED);
    link.reclaim(); link.reconnect(); vi.advanceTimersByTime(10000); expect(Socket.all).toHaveLength(1);
    expect(storage.getItem(controllerTokenKey("ABCD"))).toBeNull();
  });
  it.each(["message", "close", "rejoin"])("kick via %s is terminal", kind => {
    const { link, socket } = connected();
    if (kind === "message") socket.message({ t: "kicked", by: "host" });
    else if (kind === "close") socket.serverClose(4003);
    else socket.message({ t: "error", message: "You were removed from this room by the host." });
    expect(link.state.status).toBe("kicked"); vi.advanceTimersByTime(10000); link.reconnect(); expect(Socket.all).toHaveLength(1);
  });
  it.each(["Sign in with GitHub on both devices to use your phone as the controller.", "Open this room on your big screen or Vision Pro first, signed in as the same GitHub account."])("surfaces binding refusal without reconnect loop: %s", message => {
    const link = createControllerLink({ room: "ABCD" }); const socket = Socket.all[0]; socket.open(); socket.message({ t: "error", message });
    expect(link.state).toMatchObject({ status: "error", error: message }); vi.advanceTimersByTime(10000); expect(Socket.all).toHaveLength(1);
  });
  it("rejects non-controller welcomes and controller-forbidden client messages", () => {
    const { link, socket } = connected(); expect(() => link.send({ t: "start" })).toThrow("This phone is a controller");
    socket.message({ ...welcome(), controller: false }); expect(link.state.status).toBe("error");
  });
  it("a subscriber can unlink on welcome without replaying controls into a closed socket", () => {
    const link = createControllerLink({ room: "ABCD" }); const socket = Socket.all[0];
    link.send({ t: "controls", ready: true, mode: "tap-only" });
    link.onState(s => { if (s.status === "open") link.unlink(); }); socket.open();
    expect(() => socket.message(welcome())).not.toThrow();
    expect(link.state.status).toBe("unlinked");
    expect(socket.sent.map(m => m.t)).toEqual(["hello", "pairEnd"]);
  });
  it("close disposes retry/visibility while keeping the resume token for a later page", () => {
    const { link, socket } = connected(); socket.serverClose(1006); link.close();
    documentMock.dispatchEvent(new Event("visibilitychange")); vi.advanceTimersByTime(10000);
    expect(Socket.all).toHaveLength(1); expect(storage.getItem(controllerTokenKey("ABCD"))).toBe("controller-secret");
  });
  it("supports blocked storage, HTTP websocket URLs, state subscriptions, and malformed frames", () => {
    vi.stubGlobal("localStorage", { getItem() { throw new Error("private"); }, setItem() { throw new Error("private"); }, removeItem() { throw new Error("private"); } });
    vi.stubGlobal("location", { protocol: "http:", host: "localhost:5192" });
    const link = createControllerLink({ room: "ABCD" }); const changes: string[] = [], received: string[] = [];
    const off = link.onState(s => changes.push(s.status)); link.onMessage(m => received.push(m.t));
    const socket = Socket.all[0]; expect(socket.url).toBe("ws://localhost:5192/ws"); socket.open();
    socket.onmessage?.({ data: "not json" }); socket.message(null); socket.message(welcome()); socket.message({ t: "lobby", lobby });
    expect(received).toEqual(["welcome", "lobby"]); expect(changes).toEqual(["connecting", "open", "open"]);
    off(); link.unlink(); expect(changes).toHaveLength(3);
  });
});
