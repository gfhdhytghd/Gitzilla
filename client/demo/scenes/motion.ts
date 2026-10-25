// 4 · Your phone is the controller.
//   beat 1: the four gestures large, each drawn as what the phone really does (input/README + spin-circle card):
//             tilt  = tip the flat phone (a level ball rolls downhill) → the hero walks that way
//             swing = a sharp flick (ghost trail + speed lines)        → attack
//             swipe or tilt hard (≥ 50°, any direction) = a steep tip right, then left, then a short finger swipe
//                     across the screen; a direction arrow + dash streak each time → dash that way
//             spin  = the phone orbits its own long axis: upright and facing you, its centre travels a horizontal
//                     circle (a flattened ellipse in perspective: bigger when near, behind the ring when far,
//                     a soft shadow under it); it never rotates → skill
//           The active tile restarts in phase with the real hero, whose inputs fire on the same beats.
//   beat 2: four phones around one projector: an 8-bot-style PvP royale with four fighters, each phone tilting with
//           its fighter's real move input, and a kill feed. Phones also work as gamepads for a big screen / Vision Pro.
import { h } from "../../app/util.ts";
import { R } from "../../app/renderers.ts";
import type { InputFrame, MatchState, PlayerState } from "../../../shared/types.ts";
import type { Scene } from "../core.ts";
import { FEATURED, HERO_REPOS, bossKit, heroKit } from "../data.ts";
import { createMiniSim, drawSim, type MiniSim } from "../sims.ts";
import { ring } from "./fx.ts";

// period = one animation cycle (s); dwell = how long the hero demo stays on it
const GESTURES = [
  { id: "tilt", verb: "TILT", act: "walk", note: "tip it like a tray", period: 4.8, dwell: 4.8 },
  { id: "swing", verb: "SWING", act: "attack", note: "one sharp flick", period: 1.2, dwell: 3.6 },
  { id: "dash", verb: "SWIPE or TILT HARD", act: "dash", note: "swipe, or tip 50°+ any way", period: 3.6, dwell: 3.6 },
  { id: "spin", verb: "SPIN", act: "skill", note: "circle it around, stay upright", period: 1.8, dwell: 3.8 },
] as const;
type GestureId = (typeof GESTURES)[number]["id"];
// spin orbit: a horizontal circle seen in perspective (stage px); the phone's base rides the ellipse
const ORBIT = { cx: 150, cy: 178, rx: 98, ry: 26 };
const phone = (cls = "", finger = false) => h(`div.dp${cls}`, null, h("i.dp-screen", null, h("i.dp-ball"), finger ? h("i.dp-swipe", null, h("i.dp-finger")) : null), h("i.dp-notch"));
const SVG = (inner: string) => h("div.mo-path", { html: `<svg viewBox="0 0 300 240" width="300" height="240">${inner}</svg>` });
const ARROW = '<defs><marker id="ah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker></defs>';
/** The animated rig for one gesture: path guide + phone (+ ghost copies for the trail). */
function rig(id: GestureId): HTMLElement {
  if (id === "tilt") return h("div.mo-stage.g-tilt", null,
    SVG(`${ARROW}<ellipse cx="150" cy="150" rx="118" ry="44" class="guide"/><path d="M60 196 Q150 230 240 196" class="arrow" marker-start="url(#ah)" marker-end="url(#ah)"/><path d="M262 92 Q290 150 262 208" class="arrow" marker-start="url(#ah)" marker-end="url(#ah)"/>`),
    h("div.mo-rig", null, phone()));
  if (id === "swing") return h("div.mo-stage.g-swing", null,
    SVG(`${ARROW}<path d="M70 150 Q150 96 236 128" class="arrow fast" marker-end="url(#ah)"/><g class="speed"><path d="M196 92 h56"/><path d="M206 120 h62"/><path d="M196 148 h56"/></g>`),
    ...[3, 2, 1].map((k) => h(`div.mo-rig.ghost.g${k}`, { style: `--k:${k}` }, phone())), h("div.mo-rig", null, phone()));
  if (id === "dash") return h("div.mo-stage.g-dash", null,
    SVG(`<ellipse cx="150" cy="150" rx="118" ry="44" class="guide"/>`),
    h("div.mo-dash-arrow", null, h("i.mo-streak"), h("b.mo-head")), h("div.mo-rig", null, phone("", true)));
  // spin: the frame loop places these on the ellipse (translate + depth scale only, never a rotation). Layers: far
  // half of the ring, shadows, phones, near half of the ring; a phone on the near side is lifted above the near half.
  const { cx, cy, rx, ry } = ORBIT;
  return h("div.mo-stage.g-spin", null,
    h("div.mo-path.back", { html: `<svg viewBox="0 0 300 240" width="300" height="240"><path d="M${cx - rx} ${cy} A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}" class="guide"/></svg>` }),
    ...[0, 1, 2, 3].map((k) => h("i.mo-shadow", { "data-lag": k })),
    ...[3, 2, 1].map((k) => h("div.mo-rig.mo-spot.ghost", { style: `--k:${k}`, "data-lag": k }, phone())), h("div.mo-rig.mo-spot", { "data-lag": 0 }, phone()),
    h("div.mo-path.front", { html: `<svg viewBox="0 0 300 240" width="300" height="240">${ARROW}<path d="M${cx + rx} ${cy} A${rx} ${ry} 0 0 1 ${cx - rx} ${cy}" class="guide"/><path d="M${cx + 60} ${cy + ry + 14} Q${cx} ${cy + ry + 30} ${cx - 60} ${cy + ry + 14}" class="arrow" marker-end="url(#ah)"/></svg>` }));
}
const ARENA = { x: 900, y: 238, w: 960, h: 576 };
const PROJ = { x: 600, y: 170, w: 720, h: 486 };

export const motion: Scene = {
  id: "motion", title: "Your phone is the controller", tracks: ["mystery", "auth0"], beats: 2,
  mount(el, life, ctx) {
    // ---------- beat 1: gestures
    const solo = h("div.mo-solo");
    const tiles = GESTURES.map((g) => h(`div.mo-tile.t-${g.id}`, { style: `--period:${g.period}s` }, rig(g.id),
      h("div.mo-verb", null, g.verb, h("span.mo-act", null, " → ", g.act)), h("div.mo-note", null, g.note)));
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
    const spinSpots = [...tiles[3].querySelectorAll<HTMLElement>(".mo-spot, .mo-shadow")];
    // inputs fire on the same beats the active tile's animation shows (phase restarts with the tile in pick())
    const phase = () => (since % GESTURES[active].period) / GESTURES[active].period;
    const crossed = (at: number, dt = 1 / 30) => { const P = GESTURES[active].period, a = (since - dt) / P, b = since / P; return Math.floor(a - at) !== Math.floor(b - at) && since > dt; };
    // tilt keyframes: tip right · top edge down · left · bottom edge down (demo.css @keyframes mo-tilt)
    const TIPS: [number, number, [number, number]][] = [[0.06, 0.22, [1, 0]], [0.31, 0.47, [0, -1]], [0.56, 0.72, [-1, 0]], [0.81, 0.97, [0, 1]]];
    // dash beats (@keyframes mo-dash / mo-swipe): hard tip right, hard tip left, then a finger swipe right. Side tips
    // read clearly; forward/back would turn the flat phone edge-on. The arrow and the copy still say any direction.
    const DASHES: [number, [number, number]][] = [[0.05, [1, 0]], [0.38, [-1, 0]], [0.76, [1, 0]]];
    soloSim.drive = (p: PlayerState, s: MatchState): InputFrame => {
      const g = GESTURES[active].id, b = s.boss, f = phase();
      const base: InputFrame = { seq: 0, move: [0, 0], aim: null, fire: false, dash: false, skill: false, source: "motion" };
      if (g === "tilt") { const tip = TIPS.find(([a, z]) => f >= a && f <= z); return { ...base, move: tip ? [tip[2][0] * 0.9, tip[2][1] * 0.9] : [0, 0] }; }
      if (g === "swing") return { ...base, fire: f >= 0.52, move: b ? [Math.sign(b.x - 150 - p.x) * 0.2, Math.sign(b.y - p.y) * 0.15] : [0, 0] };
      if (g === "dash") { const tip = DASHES.find(([a]) => f >= a && f <= a + 0.12); return { ...base, dash: DASHES.some(([a]) => crossed(a)), move: tip ? tip[1] : [0, 0] }; }
      return { ...base, skill: crossed(0.999), fire: false };
    };
    // stage-px centre of a tile's phone area, for the "haptic" rings
    const tileCentre = (i: number) => {
      const r = tiles[i].getBoundingClientRect(), host = el.getBoundingClientRect(), s = host.width / 1920;
      return { x: (r.left - host.left) / s + r.width / s / 2, y: (r.top - host.top) / s + 140 };
    };
    function pick(i: number) {
      active = i; since = 0;
      tiles.forEach((t, k) => t.classList.toggle("on", k === i));
      // restart every animation in the active tile so its phase matches the hero's inputs
      for (const n of [tiles[i], ...tiles[i].querySelectorAll<HTMLElement>("*")]) { n.style.animation = "none"; void n.offsetWidth; n.style.animation = ""; }
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
        if (since > GESTURES[active].dwell) pick((active + 1) % GESTURES.length);
        const g = GESTURES[active].id;
        // pulse rings on the beat: at the phone (the gesture lands) and at the hero (the action fires)
        const beats = g === "swing" ? [0.52] : g === "dash" ? DASHES.map(([a]) => a) : g === "spin" ? [0.999] : [];
        if (beats.some((at) => crossed(at, dt))) {
          const c = tileCentre(active), me = soloSim.state.players[0], col = g === "spin" ? "var(--magenta)" : g === "dash" ? "var(--yellow)" : "var(--cyan)";
          ring(solo, c.x, c.y, col);
          if (me) ring(solo, ARENA.x + (me.x / 480) * ARENA.w, ARENA.y + (me.y / 288) * ARENA.h, col);
        }
        // spin: each phone's base rides the ellipse; depth (sin) sets size, stacking and its shadow. No rotation, ever.
        const spinT = (g === "spin" ? since : t) / GESTURES[3].period;
        for (const spot of spinSpots) {
          const a = ctx.calm ? Math.PI / 2 : (spinT - Number(spot.dataset.lag) * 0.05) * Math.PI * 2;
          const near = Math.sin(a), k = 1 + 0.16 * near, x = Math.cos(a) * ORBIT.rx, y = ORBIT.cy + near * ORBIT.ry;
          if (spot.classList.contains("mo-shadow")) { spot.style.transform = `translate(${(150 + x).toFixed(1)}px, ${y.toFixed(1)}px) scale(${k.toFixed(3)})`; spot.style.opacity = (0.28 + 0.14 * near).toFixed(2); continue; }
          spot.style.transform = `translate(${x.toFixed(1)}px, ${(y - 120 - 56 * k).toFixed(1)}px) scale(${k.toFixed(3)})`;
          spot.style.zIndex = near > 0 ? "4" : "2";
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
