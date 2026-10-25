// 9 · Vision Pro: a virtual tabletop. A pre-rendered loop of the real 3D stage (stage25d raid, captured flat and
// checked frame by frame for brightness jumps) as an animated WebP in a plain <img>, under a gentle CSS tilt.
// No live WebGL (its post-FX crit flash strobes) and no <video> (a media pipeline that can crash a WebKit page is a
// white screen on a slide). Reduced motion shows the still poster.
import { h } from "../../app/util.ts";
import type { Scene } from "../core.ts";
import loop from "../assets/vision-tabletop.webp";
import poster from "../assets/vision-tabletop.jpg";

const VIEW = { w: 1120, h: 672 };

export const vision: Scene = {
  id: "vision", title: "Vision Pro", tracks: [],
  mount(el, life, ctx) {
    const img = h("img.vp-video", { src: ctx.calm ? poster : loop, alt: "A Gitzilla raid on a virtual tabletop", width: VIEW.w, height: VIEW.h, draggable: "false" });
    const box = h("div.vp-box", { style: `width:${VIEW.w}px;height:${VIEW.h}px;background:#000 url(${poster}) center / cover no-repeat` }, img);
    const table = h("div.vp-table", null, box);
    el.append(h("h2.slide-h", null, "Put the fight on a table ", h("em", null, "in front of you.")), h("div.vp-glass", null, table),
      h("div.vp-open", null, "Open on Vision Pro"));
    life.frame((t) => {
      if (!ctx.calm) table.style.transform = `rotateX(${24 + Math.sin(t * 0.3) * 4}deg) rotateZ(${Math.sin(t * 0.17) * 6}deg)`;
    });
  },
};
