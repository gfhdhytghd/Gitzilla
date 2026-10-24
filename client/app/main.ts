// Entry: path router (/ landing, /r/<ROOM> room) + room controller that swaps lobby/game/autopsy screens.
import type { Role, ServerMsg } from "../../shared/types";
import { type AppCtx, type Screen, toast } from "./app";
import { createAutopsy } from "./autopsy";
import { createGame } from "./game";
import { consumeAuthError } from "./github";
import { createLanding, createWhoami } from "./landing";
import { createLobby } from "./lobby";
import { createMockConn } from "./mock";
import { connect } from "./net";
import { loadModules } from "./renderers";
import { h, store } from "./util";

const root = document.getElementById("app")!;
const params = new URLSearchParams(location.search);
const mock = params.has("mock");
// renderer chunks are lazy; screens wait briefly so portraits/backdrops use the real art, not placeholders
const modulesReady = Promise.race([loadModules(), new Promise((r) => setTimeout(r, 2000))]);

function route() {
  root.innerHTML = "";
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9]{2,12})\/?$/);
  if (m) return enterRoom(m[1].toUpperCase());
  if (location.pathname !== "/") history.replaceState(null, "", "/" + location.search);
  modulesReady.finally(showLanding);
}

function showLanding() {
  const landing = createLanding({
    go(room) {
      landing.destroy();
      history.pushState(null, "", `/r/${room}${location.search}`);
      route();
    },
    mock,
  });
  root.append(landing.el);
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
    return;
  }
  modulesReady.finally(() => startRoom(room, role, stored ?? "screen"));
}

function startRoom(room: string, role: Role, name: string) {
  const mk = mock ? createMockConn : connect;
  let screen: Screen | null = null;
  let screenKind: "lobby" | "game" | "autopsy" | null = null;
  const link = h("div.link-status.connecting", null, "LINK…");
  document.body.append(link);

  const app: AppCtx = {
    room, role, name, you: null, lobby: null, autopsy: null, mock, status: "connecting",
    conn: mk({ room, role, name }),
    refresh,
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

  const show = (kind: typeof screenKind) => {
    if (kind === screenKind) return;
    screen?.destroy();
    screen = kind === "lobby" ? createLobby(app) : kind === "game" ? createGame(app) : kind === "autopsy" ? createAutopsy(app) : null;
    screenKind = kind;
    if (screen) root.append(screen.el);
  };

  function refresh() {
    if (!app.lobby) return;
    const ph = app.lobby.phase;
    if (ph === "lobby") {
      app.autopsy = null;
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

  function wire() {
    app.conn.onStatus((s) => {
      app.status = s;
      link.className = `link-status ${s}`;
      link.textContent = s === "open" ? (mock ? "LINK MOCK" : "LINK OK") : s === "connecting" ? "LINK…" : s === "displaced" ? "OPEN IN ANOTHER TAB" : "LINK LOST · RETRYING";
      showDisplaced(s === "displaced");
    });
    app.conn.onMessage((m: ServerMsg) => {
      switch (m.t) {
        case "welcome":
          app.you = m.you;
          app.lobby = m.lobby;
          break;
        case "lobby":
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
        case "error":
          toast(m.message, "err");
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
