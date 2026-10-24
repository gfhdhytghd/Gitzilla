import { configureSettings, installSettings, placeSettingsButton } from './settings';
import { installLanguageUi, setClassroomLanguage } from '../i18n';
import { createClassroom } from './classroom';
// Entry: path router (/ landing, /r/<ROOM> room) + room controller that swaps lobby/game/autopsy screens.
import type { LobbyState, Role, ServerMsg } from "../../shared/types";
import { type AppCtx, type Screen, toast } from "./app";
import { createAutopsy } from "./autopsy";
import { createGame } from "./game";
import { consumeAuthError } from "./github";
import { createLanding, createWhoami, normalizeRoomCode } from "./landing";
import { createLobby } from "./lobby";
import { createMockConn } from "./mock";
import { connect } from "./net";
import { loadModules } from "./renderers";
import { getMotionPermissionState, subscribeMotionPermission } from "../input";
import { h, store } from "./util";

installLanguageUi();
installSettings();
const root = document.getElementById("app")!;
const params = new URLSearchParams(location.search);
const mock = params.has("mock");
// renderer chunks are lazy; screens wait briefly so portraits/backdrops use the real art, not placeholders
const modulesReady = Promise.all([Promise.race([loadModules(), new Promise((r) => setTimeout(r, 2000))]), document.fonts.load('16px "Unifont"').catch(() => [])]);

/** Full-screen terminal error with a way back to the landing page. */
function fatalScreen(title: string, detail: string): HTMLElement {
  return h(
    "div.screen.fatal",
    { "data-testid": "fatal" },
    h(
      "div.term-window",
      null,
      h("div.term-title.err", null, h("span.dots", null, "● ● ●"), " gitzilla: error"),
      h(
        "div.term-body",
        null,
        h("div.red", null, `fatal: ${title}`),
        h("div.dim", null, detail),
        h("a.btn.btn-primary", { href: "/", "data-testid": "back-home" }, "$ cd ~  (back to start)"),
      ),
    ),
  );
}

function route() {
  root.innerHTML = "";
  const m = location.pathname.match(/^\/r\/([^/]+)\/?$/);
  if (m) {
    const code = normalizeRoomCode(decodeURIComponent(m[1]));
    if (code.length !== 4 || code !== m[1].toUpperCase()) {
      if (code.length === 4) {
        // e.g. /r/0v39 → /r/OVSB-style fix-ups: send them to the corrected code
        history.replaceState(null, "", `/r/${code}${location.search}`);
        return enterRoom(code);
      }
      return root.append(fatalScreen(`"${m[1]}" isn't a room code`, "room codes are 4 letters, like QXRT. check the link or the code on the big screen."));
    }
    return enterRoom(code);
  }
  if (location.pathname !== "/") history.replaceState(null, "", "/" + location.search);
  modulesReady.finally(showLanding);
}

function showLanding() {
  configureSettings({});
  const landing = createLanding({
    go(room) {
      landing.destroy();
      history.pushState(null, "", `/r/${room}${location.search}`);
      route();
    },
    mock,
  });
  root.append(landing.el);
  placeSettingsButton(landing.el);
}

function enterRoom(room: string) {
  const role: Role = params.get("screen") === "1" ? "screen" : "player";
  document.body.classList.toggle("bigscreen", role === "screen");
  const stored = store.get("kaiju.name");
  if (role === "player" && !stored) {
    const gate = createWhoami(room, (name) => {
      store.set("kaiju.name", name);
      gate.destroy();
      modulesReady.finally(() => startRoom(room, role, name));
    });
    root.append(gate.el);
    placeSettingsButton(gate.el);
    return;
  }
  modulesReady.finally(() => startRoom(room, role, stored ?? "screen"));
}

function startRoom(room: string, role: Role, name: string) {
  const mk = mock ? createMockConn : connect;
  let screen: Screen | null = null;
  let screenKind: "lobby" | "game" | "autopsy" | "classroom" | null = null;
  const link = h("div.link-status.connecting", null, "LINK…");
  document.body.append(link);

  let stopControls = () => {};
  const app: AppCtx = {
    room, role, name, you: null, lobby: null, autopsy: null, mock, status: "connecting",
    conn: mk({ room, role, name }),
    refresh,
    leave(o = {}) {
      stopControls();
      setClassroomLanguage(null);
      // remember the repo so the next room can offer it again
      const me = app.lobby?.players.find((p) => p.id === app.you);
      if (me?.repo) store.set("kaiju.lastRepo", me.repo);
      const mode = app.lobby?.mode ?? "battle";
      try {
        app.conn.send({ t: "leave" });
      } catch {
        /* socket already gone */
      }
      store.del(`kaiju.token.${room}`);
      store.del(`kaiju.screenToken.${room}`);
      document.body.classList.add("leaving");
      const go = async () => {
        app.conn.close();
        if (!o.newRoom) return location.assign(mock ? "/?mock=1" : "/");
        if (mock) return location.assign(`/r/${Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("")}?mock=1`);
        try {
          const r = await fetch(`/api/room?mode=${mode}`, { method: "POST" });
          const j = (await r.json()) as { room: string };
          location.assign(`/r/${j.room}${role === "screen" ? "?screen=1" : ""}`);
        } catch {
          location.assign("/");
        }
      };
      setTimeout(go, 150); // let the leave message flush before closing the socket
    },
    rename(n) {
      app.name = n;
      store.set("kaiju.name", n);
      app.conn.setName(n);
      if (!mock) {
        // hello is the only way to carry a name today (see contract request); reconnect with resume token
        app.conn.close();
        app.conn = connect({ room, role, name: n });
        wire();
      }
    },
  };

  const reportControls = () => {
    if (role === "screen" || app.lobby?.mode === "edu" || !app.you || app.status !== "open") return;
    const state = getMotionPermissionState();
    app.conn.send({ t: "controls", ready: state.ready, mode: state.profile });
  };
  stopControls = subscribeMotionPermission(reportControls);

  const show = (kind: typeof screenKind) => {
    if (kind === screenKind) return;
    screen?.destroy();
    screen = kind === "classroom" ? createClassroom(app) : kind === "lobby" ? createLobby(app) : kind === "game" ? createGame(app) : kind === "autopsy" ? createAutopsy(app) : null;
    screenKind = kind;
    if (screen) { root.append(screen.el); placeSettingsButton(screen.el); }
  };

  function refresh() {
    if (!app.lobby) return;
    setClassroomLanguage(app.lobby.mode === "edu" ? app.lobby.locale ?? "en" : null);
    configureSettings({ classroom: app.lobby.mode === "edu", host: app.role === "screen" && app.lobby.ownerId === app.you, connected: app.status === "open", spectator: app.role === "screen", changeLanguage: lang => app.conn.send({ t: "classroomLanguage", locale: lang }) });
    if (app.lobby.mode === "edu") {
      show("classroom"); screen?.update?.(app); return;
    }
    const ph = app.lobby.phase;
    if (ph === "lobby") {
      app.autopsy = null;
      app.feedback = [];
      show("lobby");
    } else if (ph === "match") show("game");
    else if (ph === "autopsy") {
      // the game screen plays its outro first, then calls refresh() again with app.autopsy set
      if (screenKind === "game" && !(screen as Screen & { outroDone?: boolean }).outroDone) return;
      if (app.autopsy) show("autopsy");
      else if (screenKind !== "game") show("game");
    }
    screen?.update?.(app);
  }

  // the server moved this player to another tab (close 4001): explain, and let them take it back explicitly
  let displacedEl: HTMLElement | null = null;
  function showDisplaced(on: boolean) {
    if (!on) {
      displacedEl?.remove();
      displacedEl = null;
      return;
    }
    if (displacedEl) return;
    displacedEl = h(
      "div.displaced",
      { "data-testid": "displaced" },
      h(
        "div.term-window",
        null,
        h("div.term-title", null, h("span.dots", null, "● ● ●"), ` kaiju@room-${room}`),
        h(
          "div.term-body",
          null,
          h("div", null, "this room is open in another tab."),
          h("div.dim", null, "your player moved there. only one tab can drive it at a time."),
          h("button.btn.btn-primary", { "data-testid": "use-here", onclick: () => app.conn.reclaim() }, "[ use here ]"),
        ),
      ),
    );
    document.body.append(displacedEl);
  }

  let fatal = false;
  /** PR-0: tell people when a match vanished (server restart) or the host changed, instead of silently moving them. */
  function noticeLobbyChange(prev: LobbyState | null, next: LobbyState) {
    if (!prev) return;
    if (prev.phase === "match" && next.phase === "lobby" && !app.autopsy) {
      showBanner(next.mode === "edu" ? "⚠ the brawl was interrupted — the teacher can start again" : "⚠ the match was interrupted — the host can start again");
    }
    if (prev.ownerId !== next.ownerId && next.ownerId) {
      if (next.ownerId === app.you) toast("★ you are now the host", "ok", 4500);
      else {
        const who = next.players.find((p) => p.id === next.ownerId)?.name;
        toast(who ? `host is now ${who}` : next.mode === "edu" ? "the teacher screen is now the host" : "the host changed", "info", 4000);
      }
    }
  }
  function showBanner(text: string) {
    const b = h("div.interrupt-banner", { role: "alert", "data-testid": "match-interrupted" }, text, h("button.btn-link", { onclick: () => b.remove() }, "✕"));
    document.body.append(b);
    setTimeout(() => b.remove(), 9000);
  }

  function wire() {
    app.conn.onStatus((s) => {
      if (fatal) return; // keep "LINK ERR" after a fatal error instead of "retrying"
      app.status = s;
      link.className = `link-status ${s}`;
      link.textContent = s === "open" ? (mock ? "LINK MOCK" : "LINK OK") : s === "connecting" ? "LINK…" : s === "displaced" ? "OPEN IN ANOTHER TAB" : "LINK LOST · RETRYING";
      showDisplaced(s === "displaced");
    });
    app.conn.onMessage((m: ServerMsg) => {
      switch (m.t) {
        case "classroom":
          if (app.lobby) app.lobby.classroom = m.state;
          app.classroomReports = m.reports; app.classroomErrors = m.errors ?? {};
          break;
        case "welcome":
          app.you = m.you;
          app.token = m.token;
          noticeLobbyChange(app.lobby, m.lobby);
          app.lobby = m.lobby;
          reportControls();
          break;
        case "lobby":
          noticeLobbyChange(app.lobby, m.lobby);
          app.lobby = m.lobby;
          break;
        case "snapshot":
          if (screenKind !== "game") {
            if (app.lobby) app.lobby.phase = "match";
            show("game");
          }
          break;
        case "autopsy":
          app.autopsy = m.result;
          if (app.lobby) app.lobby.phase = "autopsy";
          break;
        case "feedback":
          app.feedback = m.items;
          break;
        case "error":
          // before we ever got a welcome, an error is fatal for this page: show a card with a way back
          if (!app.you && !app.lobby) {
            fatal = true;
            app.conn.close();
            link.className = "link-status closed";
            link.textContent = "LINK ERR";
            screen?.destroy();
            screen = null;
            root.replaceChildren(fatalScreen("can't join this room", m.message));
          } else toast(m.message, "err");
          break;
      }
      screen?.onMsg?.(m, app);
      if (m.t !== "snapshot") refresh();
    });
  }
  wire();
}

// rooms hold a live socket; simplest correct back/forward is a fresh load
addEventListener("popstate", () => location.reload());
consumeAuthError();
// phones play in portrait; a sideways phone gets a full-screen guard (the game keeps running underneath)
document.body.append(h("div.rotate-guard", null, h("div.rg-phone"), h("div", null, "ROTATE TO PORTRAIT ↻"), h("div.rg-sub", null, "gitzilla is played with the phone upright")));
route();
