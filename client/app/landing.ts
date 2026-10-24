// Landing page (/): animated logo over a living arena backdrop, create room / big-screen room / join by code.
// Also the "$ whoami" name gate shown before joining a room for the first time.
import { toast } from "./app";
import { createBackdrop } from "./backdrop";
import { fetchMe } from "./github";
import { createHallBoard } from "./hall";
import { createLogo } from "./logo";
import { demoBossKit, demoPlayerKit } from "./mock";
import { audio } from "./sound";
import { h, isTouchDevice, store, typeInto } from "./util";

const TAGLINES = [
  "your codebase is a monster. now make it fight.",
  "circular dependencies are weak points. aim for the knots.",
  "bring your repo. summon a hero. delete the boss.",
  "the heart is the module everyone imports. rip it out.",
  "tech debt has entered the arena.",
];

async function createRoom(mock: boolean): Promise<string> {
  if (mock) return Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("");
  const res = await fetch("/api/room", { method: "POST" });
  if (!res.ok) throw new Error(`server said ${res.status}`);
  const j = (await res.json()) as { room: string };
  return j.room;
}

export function createLanding(opts: { go(room: string, screen?: boolean): void; mock: boolean }) {
  const backdrop = createBackdrop({
    dim: 0.45,
    themeCycle: true,
    boss: demoBossKit("lodash/lodash"),
    heroes: ["facebook/react", "torvalds/linux", "pallets/flask", "rust-lang/rust"].map(demoPlayerKit),
  });
  const logo = createLogo(isTouchDevice() && innerHeight < 500 ? 4 : innerWidth < 760 ? 4 : innerHeight < 800 ? 8 : 10);
  const tag = h("span.typed");
  let tagIdx = 0;
  let cancelType = () => {};
  const cycleTag = () => {
    cancelType = typeInto(tag, TAGLINES[tagIdx++ % TAGLINES.length], 28, () => setTimeout(cycleTag, 3200));
  };
  cycleTag();

  const busy = (b: boolean) => el.classList.toggle("busy", b);
  const create = async (screen: boolean) => {
    busy(true);
    try {
      const room = await createRoom(opts.mock);
      if (screen) {
        history.pushState(null, "", `/r/${room}?screen=1${opts.mock ? "&mock=1" : ""}`);
        location.reload();
      } else opts.go(room);
    } catch (e) {
      toast(`could not create room: ${(e as Error).message}`, "err");
      busy(false);
    }
  };

  audio.music("lobby");
  const hall = createHallBoard(opts.mock, { rows: 5 });
  hall.classList.add("landing-hall");
  const toggleHall = () => el.classList.toggle("hall-open");
  const code = h("input.code-input", { maxlength: 4, placeholder: "CODE", autocomplete: "off", autocapitalize: "characters", spellcheck: "false", "aria-label": "room code" }) as HTMLInputElement;
  code.addEventListener("input", () => (code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, "")));
  const join = () => {
    const c = code.value.trim();
    if (c.length < 2) return code.focus();
    opts.go(c);
  };
  code.addEventListener("keydown", (e) => e.key === "Enter" && join());

  const el = h(
    "div.screen.landing",
    null,
    backdrop.canvas,
    h("div.crt"),
    h(
      "main.landing-inner",
      null,
      h("div.logo-wrap", null, logo.canvas),
      h("p.tagline", null, h("span.prompt", null, "> "), tag, h("span.cursor", null, "_")),
      h(
        "div.landing-actions",
        null,
        h("button.btn.btn-big.btn-primary", { "data-testid": "create-room", onclick: () => create(false) }, "$ ./create-room"),
        h(
          "div.join-row",
          null,
          h("span.prompt", null, "$ join "),
          code,
          h("button.btn", { onclick: join }, "⏎"),
        ),
        h("button.btn.btn-ghost.host-big", { onclick: () => create(true) }, "[ host on big screen + QR ]"),
        h("button.btn.btn-ghost.hall-toggle", { onclick: toggleHall }, "[ hall of monsters ]"),
      ),
      h(
        "ul.landing-facts",
        null,
        h("li", null, h("b", null, "1–8"), " players, phones are controllers"),
        h("li", null, h("b", null, "any public repo"), " becomes your hero"),
        h("li", null, h("b", null, "the boss"), " is a repo the owner picks"),
      ),
    ),
    hall,
    h("footer.landing-foot", null, "HackPSU · tilt to move · tap or swing to attack · DASH + SKILL buttons"),
  );
  return {
    el,
    destroy() {
      cancelType();
      backdrop.destroy();
      logo.destroy();
      el.remove();
    },
  };
}

/** First-visit name prompt, styled as a login shell. */
export function createWhoami(room: string, done: (name: string) => void) {
  const input = h("input.term-input", {
    "data-testid": "player-name", maxlength: 16, autocomplete: "nickname", spellcheck: "false", placeholder: "your-handle", "aria-label": "your name",
  }) as HTMLInputElement;
  input.value = store.get("kaiju.name") ?? "";
  const submit = () => {
    const n = input.value.trim().replace(/\s+/g, "_").slice(0, 16) || `dev_${Math.floor(Math.random() * 0xffff).toString(16)}`;
    done(n);
  };
  input.addEventListener("keydown", (e) => e.key === "Enter" && submit());
  const backdrop = createBackdrop({ dim: 0.7, themeCycle: true });
  const el = h(
    "div.screen.whoami",
    null,
    backdrop.canvas,
    h("div.crt"),
    h(
      "div.term-window",
      null,
      h("div.term-title", null, h("span.dots", null, "● ● ●"), ` kaiju@room-${room}`),
      h(
        "div.term-body",
        null,
        h("div.dim", null, `$ ssh kaiju@${location.host} -p ${room}`),
        h("div.dim", null, "Connecting to arena... ", h("span.ok", null, "ok")),
        h("div.dim", null, "WARNING: a boss kaiju has been sighted in this room."),
        h("label.term-line", null, h("span.prompt", null, "login as: "), input),
        h("button.btn.btn-primary", { "data-testid": "join-room", onclick: submit }, "$ join --room ", room),
      ),
    ),
  );
  setTimeout(() => input.focus(), 50);
  // signed in with GitHub? default the handle to the login
  fetchMe().then(({ user }) => {
    if (user && !input.value) input.value = user.login;
  });
  return {
    el,
    destroy() {
      backdrop.destroy();
      el.remove();
    },
  };
}
