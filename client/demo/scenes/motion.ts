// 4 · Your phone is the controller.
//   beat 1: the four gestures large (the training screen's pixel-phone animations), each driving the real hero in a
//           real sim with the matching action, with "haptic" pulse rings.
//   beat 2: four phones around one projector: an 8-bot-style PvP royale with four fighters, each phone tilting with
//           its fighter's real move input, and a kill feed. Phones also work as gamepads for a big screen / Vision Pro.
import { h } from "../../app/util.ts";
import { R } from "../../app/renderers.ts";
import type { InputFrame, MatchState, PlayerState } from "../../../shared/types.ts";
import type { Scene } from "../core.ts";
import { FEATURED, HERO_REPOS, bossKit, heroKit } from "../data.ts";
import { createMiniSim, drawSim, type MiniSim } from "../sims.ts";
import { ring } from "./fx.ts";

const GESTURES = [
  { id: "tilt", anim: "a-tilt", glyph: "↔", verb: "TILT", act: "move", note: "15° = full speed" },
  { id: "swing", anim: "a-swing", glyph: "✊", verb: "SWING", act: "attack", note: "flick it like a punch" },
  { id: "twist", anim: "a-twist", glyph: "↻", verb: "TWIST", act: "dash", note: "snap and back" },
  { id: "spin", anim: "a-spin", glyph: "⟳", verb: "SPIN", act: "skill", note: "a full turn" },
] as const;
const ARENA = { x: 900, y: 238, w: 960, h: 576 };
const PROJ = { x: 600, y: 170, w: 720, h: 486 };

export const motion: Scene = {
  id: "motion", title: "Your phone is the controller", tracks: ["mystery", "auth0"], beats: 2,
  mount(el, life, ctx) {
    // ---------- beat 1: gestures
    const solo = h("div.mo-solo");
    const tiles = GESTURES.map((g) => h("div.mo-tile", null,
      h("div.mo-phone-wrap", null, h(`div.tr-phone.mo-phone`, null, h("div.tr-screen", null, g.glyph))),
      h("div.mo-verb", null, g.verb), h("div.mo-act", null, "→ ", g.act), h("div.mo-note", null, g.note)));
    const arena = h("canvas.mo-arena", { width: 480 * 2, height: 288 * 2, style: `left:${ARENA.x}px;top:${ARENA.y}px;width:${ARENA.w}px;height:${ARENA.h}px` }) as HTMLCanvasElement;
    solo.append(h("h2.slide-h", null, "No app. No gamepad. ", h("em", null, "Your phone.")), h("div.mo-grid", null, ...tiles), arena,
      h("div.mo-cap", null, "real sim · real hero · each gesture is the move it triggers"));

    // ---------- beat 2: four phones, one projector
    const royale = h("div.mo-royale");
    const proj = h("canvas.mo-proj", { style: `left:${PROJ.x}px;top:${PROJ.y}px;width:${PROJ.w}px;height:${PROJ.h}px` }) as HTMLCanvasElement;
    const feed = h("div.mo-feed");
    const phones = [0, 1, 2, 3].map((i) => h(`div.mo-p.mo-p${i}`, null, h("div.mo-p-body", null, h("div.mo-p-screen"))));
    royale.append(h("h2.slide-h", null, "4 phones, 1 screen: ", h("em.pink", null, "PvP royale")),
      h("div.mo-proj-frame", { style: `left:${PROJ.x - 14}px;top:${PROJ.y - 14}px;width:${PROJ.w + 28}px;height:${PROJ.h + 28}px` }), proj, ...phones,
      h("div.mo-feed-box", null, h("div.mo-feed-h", null, "$ git log --royale  ·  last one standing"), feed,
        h("div.mo-pad", null, "Also a gamepad: sign in with GitHub (Auth0) and your phone drives your seat on a big screen or a Vision Pro.")));
    el.append(solo, royale);

    // ---------- sims (only the visible one steps)
    const hero = heroKit("burntsushi/ripgrep");
    const soloSim = createMiniSim({ kind: "raid", heroes: [{ name: "you", kit: hero }], boss: bossKit(FEATURED[2], 1), restartAfter: 2 });
    let active = 0, since = 0, beat = 0;
    const g0 = arena.getContext("2d")!;
    soloSim.drive = (p: PlayerState, s: MatchState): InputFrame => {
      const g = GESTURES[active].id, b = s.boss;
      const base: InputFrame = { seq: 0, move: [0, 0], aim: null, fire: false, dash: false, skill: false, source: "motion" };
      if (g === "tilt") { const a = since * 2.2; return { ...base, move: [Math.cos(a) * 0.9, Math.sin(a) * 0.6] }; }
      if (g === "swing") return { ...base, fire: true, move: b ? [Math.sign(b.x - 150 - p.x) * 0.3, Math.sign(b.y - p.y) * 0.2] : [0, 0] };
      if (g === "twist") { const kick = Math.floor(since * 1.25) !== Math.floor((since - 1 / 30) * 1.25); return { ...base, dash: kick, move: [Math.sin(since * 3) > 0 ? 1 : -1, 0.2] }; }
      return { ...base, skill: since < 1 / 15 || Math.floor(since) !== Math.floor(since - 1 / 30), fire: true };
    };
    function pick(i: number) {
      active = i; since = 0;
      tiles.forEach((t, k) => {
        t.classList.toggle("on", k === i);
        const ph = t.querySelector(".mo-phone")!;
        ph.classList.remove(...GESTURES.map((g) => g.anim));
        if (k === i && !ctx.calm) ph.classList.add(GESTURES[k].anim);
      });
      const r = tiles[i].getBoundingClientRect(), host = el.getBoundingClientRect();
      const s = host.width / 1920;
      ring(solo, (r.left - host.left) / s + r.width / s / 2, (r.top - host.top) / s + 150, "var(--cyan)");
      ctx.blip();
    }

    const fighters = HERO_REPOS.slice(0, 4).map((slug) => ({ name: slug.split("/")[1], kit: heroKit(slug, "pvp") }));
    let roy: MiniSim | null = null, gone = new Set<string>();
    const g1 = proj.getContext("2d")!;
    function startRoyale() {
      roy = createMiniSim({ kind: "royale", heroes: fighters, restartAfter: 3, speed: 1.8 });
      proj.width = roy.world.w * 2; proj.height = roy.world.h * 2;
      gone = new Set(); feed.replaceChildren(h("div.kill.note", null, `round 1 · ${fighters.length} fighters · one life each`));
      fighters.forEach((f, i) => {
        const scr = phones[i].querySelector(".mo-p-screen")!;
        const port = R.playerPortrait(f.kit, 144);
        scr.replaceChildren(port, h("b", null, f.name), h("div.mo-hp", null, h("i")));
        phones[i].classList.remove("ko");
      });
    }
    function killFeed(s: MatchState) {
      for (const p of s.players) {
        if (!p.eliminated || gone.has(p.id)) continue;
        gone.add(p.id);
        const by = s.players.find((o) => o.id === p.killedBy);
        feed.prepend(h("div.kill", null, h("span.kill-by", null, by?.name ?? "GC SWEEP"), h("span.kill-x", null, " ✕ "), h("span.kill-v", null, p.name), h("span.kill-t", null, ` @${s.t.toFixed(1)}s`)));
        while (feed.children.length > 5) feed.lastChild!.remove();
        const i = s.players.indexOf(p);
        phones[i]?.classList.add("ko");
        ctx.shake(0.5);
        const alive = s.players.filter((o) => !o.eliminated);
        if (alive.length === 1) feed.prepend(h("div.kill.win", null, `${alive[0].name} is the last one standing`));
      }
      // the mini-sim restarted the round: clear the feed and stand everyone back up
      if (s.t < 1 && gone.size && !s.players.some((p) => p.eliminated)) { gone.clear(); feed.replaceChildren(h("div.kill.note", null, `new round · ${fighters.length} fighters`)); phones.forEach((p) => p.classList.remove("ko")); }
    }

    life.frame((t, dt) => {
      if (beat === 0) {
        since += dt;
        if (since > 3.2) pick((active + 1) % GESTURES.length);
        const g = GESTURES[active].id;
        if ((g === "twist" && Math.floor(since * 1.25) !== Math.floor((since - dt) * 1.25)) || (g === "spin" && Math.floor(since) !== Math.floor(since - dt))) {
          const me = soloSim.state.players[0];
          if (me) ring(solo, ARENA.x + (me.x / 480) * ARENA.w, ARENA.y + (me.y / 288) * ARENA.h, g === "spin" ? "var(--magenta)" : "var(--yellow)");
        }
        soloSim.step(dt);
        g0.setTransform(2, 0, 0, 2, 0, 0); g0.imageSmoothingEnabled = false;
        drawSim(g0, soloSim, t, { events: true });
      } else if (roy) {
        roy.step(dt);
        g1.setTransform(2, 0, 0, 2, 0, 0); g1.imageSmoothingEnabled = false;
        drawSim(g1, roy, t, { events: true });
        const s = roy.state;
        killFeed(s);
        s.players.forEach((p, i) => {
          const ph = phones[i];
          if (!ph) return;
          // the phone leans the way its fighter is moving (that's the tilt input that moved it)
          const vx = Math.max(-1, Math.min(1, p.vx / 60)), vy = Math.max(-1, Math.min(1, p.vy / 60));
          (ph.firstChild as HTMLElement).style.transform = ctx.calm ? "" : `rotate(${vx * 9}deg) translateY(${vy * 6}px)`;
          const hp = ph.querySelector(".mo-hp i") as HTMLElement | null;
          if (hp) hp.style.width = `${Math.max(0, (p.hp / p.kit.maxHp) * 100)}%`;
        });
      }
    });
    const handle = {
      beat(b: number) {
        beat = b;
        solo.classList.toggle("off", b !== 0);
        royale.classList.toggle("off", b !== 1);
        if (b === 1 && !roy) startRoyale();
        if (b === 0) pick(active);
      },
    };
    handle.beat(0);
    return handle;
  },
};
