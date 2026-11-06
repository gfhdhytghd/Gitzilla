// First-run join gate: "sign in with GitHub" then "pick a handle", styled as a login shell.
// Players (raid, PvP, classroom students) and the classroom teacher console pass through it; big screens and
// the projector never do. The server enforces the same rule, so this screen is the friendly half of it.
import type { GameMode } from "../../shared/types";
import { createBackdrop } from "./backdrop";
import { login, emailLogin, logout, type Me } from "./github";
import { h, store } from "./util";

export type GateKind = "player" | "teacher";

/** Room mode for routing decisions; null when the room is missing or the server can't tell. */
export async function fetchRoomMode(room: string): Promise<GameMode | null> {
  try {
    const r = await fetch(`/api/room/${room}`);
    return r.ok ? (((await r.json()) as { mode?: GameMode | null }).mode ?? null) : null;
  } catch {
    return null;
  }
}

/** Does this visitor have to stop at the gate before connecting? */
export function needsGate(me: Me, kind: GateKind | null, mode: GameMode | null = null): boolean {
  if (!kind) return false;
  if (me.required && (!me.user || (mode !== "edu" && me.user.userId.startsWith("email|")))) return true;
  return kind === "player" && !store.get("kaiju.name");
}

const WHY: Record<string, string> = {
  battle: "Every fighter in a raid is a real GitHub account.",
  pvp: "Every fighter in the royale is a real GitHub account.",
  edu: "Students sign in so every submission belongs to a real account.",
  teacher: "Teachers sign in before running a classroom. The projector window doesn't need it.",
};

export function createJoinGate(opts: { room: string; kind: GateKind; mode: GameMode | null; me: Me; done(name: string): void }) {
  const { room, kind, me } = opts;
  const user = me.user;
  const classroom = opts.mode === "edu" || kind === "teacher";
  const emailUser = !!user?.userId.startsWith("email|");
  const signedIn = !!user && (classroom || !emailUser);
  const optional = !me.required;
  const backdrop = createBackdrop({ dim: 0.7, themeCycle: true });

  const input = h("input.term-input", {
    "data-testid": "player-name", maxlength: 16, autocomplete: "nickname", spellcheck: "false", placeholder: "your-handle", "aria-label": "your name",
    disabled: !signedIn && !optional,
  }) as HTMLInputElement;
  input.value = store.get("kaiju.name") ?? user?.login ?? "";
  const submit = () => {
    if (input.disabled) return;
    opts.done(input.value.trim().replace(/\s+/g, "_").slice(0, 16) || user?.login || `dev_${Math.floor(Math.random() * 0xffff).toString(16)}`);
  };
  input.addEventListener("keydown", (e) => e.key === "Enter" && submit());

  const avatar = () => (user?.avatar ? h("img.gh-avatar", { src: user.avatar, alt: "", width: 20, height: 20 }) : h("span.gh-avatar.ph", null, "@"));
  const step = (n: number, state: "todo" | "done" | "locked", title: string, ...body: (Node | string | null)[]) =>
    h(`section.jg-step.${state}`, { "aria-current": state === "todo" ? "step" : undefined },
      h("div.jg-head", null, h("span.jg-num", null, state === "done" ? "✓" : String(n)), h("span.jg-title", null, title),
        n === 1 && !signedIn ? h("span.jg-tag", null, optional ? "optional" : "required") : null),
      h("div.jg-body", null, ...body));

  const signInStep = signedIn
    ? step(1, "done", emailUser ? "signed in with email" : "signed in with GitHub",
      h("div.gh-who.jg-who", { "data-testid": "gate-signed-in" }, avatar(), h("b", null, `@${user!.login}`),
        h("button.btn-link", { onclick: () => emailUser ? emailLogin() : login(true) }, "switch account"),
        h("button.btn-link", { onclick: logout }, "sign out")))
    : step(1, "todo", classroom ? "sign in to your classroom" : "sign in with GitHub",
      h("p.jg-why", null, WHY[kind === "teacher" ? "teacher" : opts.mode ?? "battle"]),
      classroom ? h("button.btn.btn-primary", { "data-testid": "gate-email", onclick: emailLogin }, "Continue with email") : null,
      classroom ? h("p.jg-fine.dim", null, "Enter your email, then enter the one-time code sent to your inbox. No password needed.") : null,
      h("button.btn.btn-gh.jg-gh", { "data-testid": "gate-github", onclick: () => login() }, h("span.gh-mark", null, "◉"), " Continue with GitHub"),
      h("p.jg-fine.dim", null, "Your GitHub token stays on our server. It never reaches this page or other players."));

  // The teacher console needs no handle: it joins as soon as the sign-in step is done.
  const handleStep = kind === "player"
    ? step(2, signedIn || optional ? "todo" : "locked", "pick your handle",
      h("label.term-line", null, h("span.prompt", null, "login as: "), input),
      h("button.btn.btn-primary", { "data-testid": "join-room", disabled: input.disabled, onclick: submit }, "$ join --room ", room),
      input.disabled ? h("p.jg-fine.dim", null, "unlocks after you sign in") : null)
    : null;

  // Spectating stays open: a big screen never signs in.
  const watch = kind === "player" && opts.mode !== "edu"
    ? h("p.jg-watch.dim", null, "just watching? ", h("a.btn-link", { href: `/r/${room}?screen=1`, "data-testid": "gate-spectate" }, "open the big-screen view"))
    : null;

  const el = h(
    "div.screen.whoami.join-gate",
    { "data-testid": "join-gate" },
    backdrop.canvas,
    h("div.crt"),
    h(
      "div.term-window",
      null,
      h("div.term-title", null, h("span.dots", null, "● ● ●"), kind === "teacher" ? ` classroom@room-${room}` : ` kaiju@room-${room}`),
      h(
        "div.term-body",
        null,
        h("div.dim", null, `$ ssh kaiju@${location.host} -p ${room}`),
        h("div.dim", null, "Connecting to arena... ", h("span.ok", null, "ok")),
        h("div.jg-steps", null, signInStep, handleStep),
        watch,
      ),
    ),
  );
  setTimeout(() => (signedIn || optional ? input : el.querySelector<HTMLButtonElement>(".jg-gh"))?.focus(), 50);
  return {
    el,
    destroy() {
      backdrop.destroy();
      el.remove();
    },
  };
}
