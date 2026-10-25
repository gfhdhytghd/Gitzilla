import { onLocaleChange } from '../i18n';
// Landing page (/): animated logo over a living arena backdrop, create room / big-screen room / join by code.
// Also the "$ whoami" name gate shown before joining a room for the first time.
import { toast } from "./app";
import { createBackdrop } from "./backdrop";
import { fetchMe } from "./github";
import { createHallBoard } from "./hall";
import { createMarkAnim } from "./logo";
import { wordmark } from "./wordmark";
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

export function normalizeRoomCode(v: string): string {
  const map: Record<string, string> = { "0": "O", "1": "I", "5": "S", "8": "B" };
  return v.toUpperCase().replace(/[0158]/g, (d) => map[d]).replace(/[^A-Z]/g, "").slice(0, 4);
}

/** true/false from GET /api/room/<code>; null when the server can't tell (old server, offline) — then just try. */
async function roomExists(c: string): Promise<boolean | null> {
  try {
    const r = await fetch(`/api/room/${c}`);
    if (!r.ok) return null;
    const j = (await r.json()) as { exists?: boolean };
    return typeof j.exists === "boolean" ? j.exists : null;
  } catch {
    return null;
  }
}

async function createRoom(mock: boolean, mode: "battle" | "edu" | "pvp" = "battle"): Promise<string> {
  if (mock) return Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("");
  const res = await fetch(`/api/room?mode=${mode}`, { method: "POST" });
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
  // lockup: the roaring pixel kaiju mark + the hand-drawn wordmark (beside it on wide screens, above it on phones)
  const stack = innerWidth < 700;
  const logo = createMarkAnim(stack ? 3 : innerHeight < 800 ? 4 : 5);
  const lockup = h(
    `div.brand-lockup${stack ? ".stack" : ""}`,
    { "data-testid": "brand-lockup" },
    h("div.bl-mark", null, logo.canvas),
    wordmark({ width: stack ? "min(86vw, 420px)" : "min(56vw, 600px)", enter: true, sparkle: true }),
  );
  const tag = h("span.typed");
  let tagIdx = 0;
  let cancelType = () => {};
  let tagTimer: ReturnType<typeof setTimeout> | undefined;
  const cycleTag = () => {
    cancelType(); clearTimeout(tagTimer);
    cancelType = typeInto(tag, TAGLINES[tagIdx++ % TAGLINES.length], 28, () => { tagTimer = setTimeout(cycleTag, 3200); });
  };
  cycleTag();
  const stopLocale = onLocaleChange(cycleTag);

  const busy = (b: boolean) => el.classList.toggle("busy", b);
  const create = async (screen: boolean, mode: "battle" | "edu" | "pvp" = "battle") => {
    busy(true);
    try {
      const room = await createRoom(opts.mock, mode);
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
  // When the hall opens as a modal (phones / small screens) it needs its own way out: a close button,
  // a tap on the dimmed backdrop, or Esc.
  const closeHall = () => el.classList.remove("hall-open");
  hall.prepend(h("button.btn.btn-ghost.hall-close", { "aria-label": "close hall of monsters", onclick: closeHall }, "[ x close ]"));
  const onBackdrop = (e: Event) => {
    if (el.classList.contains("hall-open") && !hall.contains(e.target as Node) && !(e.target as Element).closest?.(".hall-toggle")) closeHall();
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeHall(); };
  document.addEventListener("pointerup", onBackdrop, true);
  document.addEventListener("keydown", onKey);
  // room codes are exactly 4 letters; digits that look like letters are mapped (0→O, 1→I, 5→S, 8→B)
  const code = h("input.code-input", { "data-testid": "join-code", maxlength: 4, placeholder: "ABCD", autocomplete: "off", autocapitalize: "characters", spellcheck: "false", inputmode: "text", "aria-label": "4-letter room code" }) as HTMLInputElement;
  const joinBtn = h("button.btn.join-btn", { "data-testid": "join-submit", disabled: true, onclick: () => join() }, "join") as HTMLButtonElement;
  const joinMsg = h("div.join-msg", { role: "status" });
  code.addEventListener("input", () => {
    code.value = normalizeRoomCode(code.value);
    joinBtn.disabled = code.value.length !== 4;
    joinMsg.replaceChildren();
  });
  const join = async (force = false) => {
    const c = normalizeRoomCode(code.value);
    if (c.length !== 4) {
      joinMsg.replaceChildren("room codes are 4 letters, like ", h("b", null, "QXRT"));
      return code.focus();
    }
    if (!force && !opts.mock) {
      joinBtn.disabled = true;
      joinMsg.replaceChildren(h("span.dim", null, `$ ping room ${c}…`));
      const exists = await roomExists(c);
      joinBtn.disabled = false;
      if (exists === false) {
        joinMsg.replaceChildren(
          h("span.red", null, `room ${c} not found`),
          " — check the code, or ",
          h("button.btn-link", { "data-testid": "join-create-anyway", onclick: () => join(true) }, `create ${c}`),
        );
        return;
      }
    }
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
      h("div.logo-wrap", null, lockup),
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
          joinBtn,
        ),
        joinMsg,
        h("button.btn.btn-ghost.host-big", { onclick: () => create(true) }, "[ host on big screen + QR ]"),
        h("button.btn.btn-ghost.nowrap-label", { "data-testid": "create-pvp", onclick: () => create(false, "pvp") }, "[ PvP royale: up to 8 ]"),
        h("button.btn.btn-ghost.host-big", { "data-testid": "create-classroom", onclick: () => create(true, "edu") }, "[ 🎓 classroom: code together, raid together ]"),
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
    h("footer.landing-foot", null, "HackPSU · tilt to move · swing to attack · tilt hard to dash · draw a circle for your skill"),
  );
  return {
    el,
    destroy() {
      cancelType(); clearTimeout(tagTimer); stopLocale();
      document.removeEventListener("pointerup", onBackdrop, true);
      document.removeEventListener("keydown", onKey);
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
