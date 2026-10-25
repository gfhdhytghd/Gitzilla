// 7 · Join NOW: a real room (POST /api/room, joined as the big screen). Giant QR + code + URL; every phone that joins
// pops onto the wall with its real hero portrait, confetti and a blip. Start turns this screen into the room's 3D big
// screen. Wi-Fi down → a recorded (locally simulated) match instead.
import { h } from "../../app/util.ts";
import { R } from "../../app/renderers.ts";
import type { LobbyPlayer } from "../../../shared/types.ts";
import type { Scene } from "../core.ts";
import { FEATURED, HERO_REPOS, bossKit, heroKit } from "../data.ts";
import { createMiniSim, drawSim, type MiniSim } from "../sims.ts";
import { confetti, qrImage } from "./fx.ts";

export const join: Scene = {
  id: "join", title: "Join now", tracks: ["mystery"],
  mount(el, life, ctx) {
    const live = ctx.live;
    live.ensure();
    const left = h("div.join-left"), wall = h("div.join-wall"), count = h("div.join-count"), status = h("div.join-status");
    const start = h("button.join-start", { onclick: () => live.start(FEATURED[ctx.repo]) }, "▶ START");
    el.append(h("h2.slide-h", null, "Get your phone out. ", h("em", null, "Join now.")), left,
      h("div.join-right", null, h("div.join-right-h", null, count, start), wall, status));

    const seen = new Map<string, HTMLElement>();
    let room: string | null = null, replay: MiniSim | null = null, rc: CanvasRenderingContext2D | null = null;
    function tile(p: LobbyPlayer, isNew: boolean) {
      const art = p.kit ? R.playerPortrait(p.kit, 144) : h("div.join-ghost", null, "?");
      const t = h("div.join-tile" + (p.bot ? ".bot" : "") + (isNew ? ".pop" : ""), null, h("div.join-art", null, art), h("b", null, p.name),
        h("span.join-sub", null, p.bot ? "AI rival" : p.status === "ready" ? (p.kit?.title ?? "ready") : p.status === "analyzing" ? "cloning repo…" : p.repo ?? "picking a repo"));
      return t;
    }
    function render() {
      if (live.status === "offline") return offline();
      if (live.room && live.room !== room) {
        room = live.room;
        const url = live.joinUrl();
        left.replaceChildren(qrImage(url, "join-qr"), h("div.join-code", null, room), h("div.join-url", null, url.replace(/^https?:\/\//, "")));
      } else if (!live.room) left.replaceChildren(h("div.join-wait", null, "opening a room…"));
      const players = live.players;
      const ids = new Set(players.map((p) => p.id));
      for (const [id, elx] of seen) if (!ids.has(id)) { elx.remove(); seen.delete(id); }
      players.forEach((p) => {
        const old = seen.get(p.id), isNew = !old;
        const sig = `${p.name}|${p.status}|${p.kit?.title ?? ""}`;
        if (old && old.dataset.sig === sig) return;
        const t = tile(p, isNew);
        t.dataset.sig = sig;
        if (old) old.replaceWith(t); else wall.append(t);
        seen.set(p.id, t);
        if (isNew) {
          ctx.blip("join");
          if (!ctx.calm) life.timeout(() => {
            const r = t.getBoundingClientRect(), host = el.getBoundingClientRect(), s = host.width / 1920;
            confetti(el, (r.left - host.left + r.width / 2) / s, (r.top - host.top + r.height / 2) / s);
          }, 30);
          ctx.shake(0.3);
        }
      });
      // empty seats keep the wall from looking dead before the first phone lands
      wall.querySelectorAll(".slot").forEach((s) => s.remove());
      for (let k = players.length; k < 8; k++) wall.append(h("div.join-tile.slot", null, `P${k + 1}`));
      const humans = players.filter((p) => !p.bot).length;
      count.replaceChildren(h("b", null, String(humans)), humans === 1 ? " player joined" : " players joined");
      start.toggleAttribute("disabled", !live.room || live.status === "starting");
      start.textContent = live.status === "starting" ? "starting…" : "▶ START";
      status.textContent = live.status === "starting" ? "opening the 3D big screen…"
        : live.error ? `${live.error} · press START again`
        : live.owner ? "this screen hosts · ▶ START picks the boss and starts the fight" : humans ? "host = the first phone: it picks the boss and starts · ▶ opens the big screen" : "scan the code · no app, no account";
    }
    function offline() {
      if (replay) return;
      left.replaceChildren(h("div.join-off", null, h("b", null, "Wi-Fi down"), h("span", null, "here's a recorded match")));
      const c = h("canvas.join-replay", { width: 960, height: 576 }) as HTMLCanvasElement;
      wall.replaceChildren(c);
      count.textContent = "";
      start.remove();
      status.textContent = `${location.host}/r/CODE · try again when the network is back`;
      replay = createMiniSim({ kind: "raid", heroes: HERO_REPOS.slice(0, 4).map((r) => ({ name: r.split("/")[1], kit: heroKit(r) })), boss: bossKit(FEATURED[ctx.repo], 4), hpMul: 4 });
      rc = c.getContext("2d")!;
    }
    life.add(live.subscribe(render));
    life.frame((t, dt) => {
      if (!replay || !rc) return;
      replay.step(dt);
      rc.setTransform(2, 0, 0, 2, 0, 0); rc.imageSmoothingEnabled = false;
      drawSim(rc, replay, t, { events: true });
    });
    render();
  },
};
