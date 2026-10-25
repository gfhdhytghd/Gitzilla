// 9 · Vision Pro: the real 3D stage (stage25d, the renderer behind ?view=25d / view=xr) running a raid on a tabletop,
// under a glass "window" with a slow orbit. Falls back to the 2D renderer if WebGL is unavailable.
import { h } from "../../app/util.ts";
import { R, safe } from "../../app/renderers.ts";
import type { Scene } from "../core.ts";
import { FEATURED, HERO_REPOS, bossKit, heroKit } from "../data.ts";
import { createMiniSim, drawSim } from "../sims.ts";

const VIEW = { w: 1120, h: 672 };

export const vision: Scene = {
  id: "vision", title: "Vision Pro", tracks: [],
  mount(el, life, ctx) {
    const sim = createMiniSim({ kind: "raid", heroes: HERO_REPOS.slice(0, 4).map((r) => ({ name: r.split("/")[1], kit: heroKit(r) })), boss: bossKit(FEATURED[ctx.repo], 4), hpMul: 4 });
    const box = h("div.vp-box", { style: `width:${VIEW.w}px;height:${VIEW.h}px` });
    const overlay = h("canvas.vp-overlay", { width: VIEW.w, height: VIEW.h }) as HTMLCanvasElement;
    const table = h("div.vp-table", null, box);
    const code = ctx.live.room ?? "CODE";
    el.append(h("h2.slide-h", null, "Put the fight ", h("em", null, "on your table.")), h("div.vp-glass", null, table),
      h("div.vp-open", null, h("span", null, "Open on Vision Pro"), h("code", null, `${location.host}/r/${code}?screen=1&view=xr`)),
      h("div.vp-sub", null, "same room, same match: WebXR tabletop, phones still the controllers"));
    const g = overlay.getContext("2d")!;
    let stage: { canvas: HTMLCanvasElement; resize(w: number, h: number, d: number): void; render: (...a: never[]) => void; destroy(): void } | null = null, failed = false;
    void import("../../render/stage25d/index.ts").then((m) => {
      if (!life.alive) return;
      try {
        const s = m.createStage25d({ spectator: true });
        s.canvas.classList.add("vp-gl");
        box.append(s.canvas, overlay);
        s.resize(VIEW.w, VIEW.h, Math.min(2, devicePixelRatio || 1));
        stage = s as unknown as typeof stage;
        life.add(() => s.destroy());
      } catch (e) { console.warn("[demo] 3D stage unavailable, using 2D", e); failed = true; box.append(overlay); }
    }, () => { failed = true; box.append(overlay); });
    life.frame((t, dt) => {
      sim.step(dt);
      if (!ctx.calm) table.style.transform = `rotateX(${24 + Math.sin(t * 0.3) * 4}deg) rotateZ(${Math.sin(t * 0.17) * 6}deg)`;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, VIEW.w, VIEW.h);
      if (stage) {
        g.setTransform(VIEW.w / 480, 0, 0, VIEW.h / 288, 0, 0);
        (stage.render as unknown as (c: CanvasRenderingContext2D, s: unknown, t: number, v: undefined, e: unknown) => void)(g, sim.state, t, undefined, { world: sim.world, events: sim.events, shake: 0 });
        safe("drawPostFx", R.drawPostFx, g, t, 0, { x: 0, y: 0, w: 480, h: 288 });
        sim.events.length = 0;
      } else if (failed) {
        g.setTransform(VIEW.w / 480, 0, 0, VIEW.h / 288, 0, 0);
        g.imageSmoothingEnabled = false;
        drawSim(g, sim, t, { events: true });
      }
    });
  },
};
