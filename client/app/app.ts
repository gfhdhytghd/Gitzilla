// Shared app context passed to every screen.
import type { Autopsy, LobbyState, Role, ServerMsg } from "../../shared/types";
import type { Conn, ConnStatus } from "./net";
import { h } from "./util";

export interface AppCtx {
  room: string;
  role: Role;
  name: string;
  you: string | null;
  lobby: LobbyState | null;
  autopsy: Autopsy | null;
  conn: Conn;
  status: ConnStatus;
  mock: boolean;
  /** Re-run the router after a state change. */
  refresh(): void;
  /** Rename and reconnect (hello carries the name). */
  rename(name: string): void;
}

export interface Screen {
  el: HTMLElement;
  update?(app: AppCtx): void;
  onMsg?(m: ServerMsg, app: AppCtx): void;
  destroy(): void;
}

let toastBox: HTMLElement | null = null;
export function toast(msg: string, kind: "err" | "ok" | "info" = "info", ms = 3200) {
  if (!toastBox) {
    toastBox = h("div.toasts");
    document.body.append(toastBox);
  }
  const t = h(`div.toast.${kind}`, null, kind === "err" ? "ERR " : "$ ", msg);
  toastBox.append(t);
  setTimeout(() => t.classList.add("out"), ms);
  setTimeout(() => t.remove(), ms + 400);
}

export const isOwner = (app: AppCtx) => !!app.lobby && !!app.you && app.lobby.ownerId === app.you;
export const joinUrl = (room: string) => `${location.origin}/r/${room}`;
