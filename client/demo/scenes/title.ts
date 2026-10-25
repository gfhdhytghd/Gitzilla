// 1 · Title: the arena backdrop drifting behind a dropped-in wordmark + the animated pixel kaiju mark, a glitch pass,
// and the tagline typed out.
import { h } from "../../app/util.ts";
import { createBackdrop } from "../../app/backdrop.ts";
import { createMarkAnim } from "../../app/logo.ts";
import { wordmark } from "../../app/wordmark.ts";
import type { Scene } from "../core.ts";
import { FEATURED, HERO_REPOS, bossKit, heroKit } from "../data.ts";
import { typeLines } from "./fx.ts";

export const title: Scene = {
  id: "title", title: "Gitzilla", tracks: ["grand"],
  mount(el, life, ctx) {
    const bd = createBackdrop({ dim: 0.35, boss: bossKit(FEATURED[0]), heroes: HERO_REPOS.slice(0, 6).map((r) => heroKit(r)), themeCycle: true });
    life.add(() => bd.destroy());
    const back = h("div.title-back", null, bd.canvas);
    const mark = createMarkAnim(9);
    life.add(() => mark.destroy());
    const wm = wordmark({ width: "1180px", enter: !ctx.calm, sparkle: !ctx.calm, className: "title-wm" });
    const tag = h("div.title-tag");
    const url = h("div.title-url", null, location.host);
    el.append(back, h("div.title-motes"), h("div.title-stack", null, h("div.title-glitch", null, wm), h("div.title-mark", null, mark.canvas), tag), url);
    // ken-burns drift on the backdrop: slow push-in + pan gives the flat arena some depth against the faster motes
    life.frame((t) => {
      const k = ctx.calm ? 0 : 1;
      back.style.transform = `scale(${1.12 + 0.04 * Math.sin(t * 0.13) * k}) translate(${Math.sin(t * 0.07) * 18 * k}px, ${Math.cos(t * 0.09) * 10 * k}px)`;
    });
    void (async () => {
      await life.sleep(ctx.calm ? 300 : 900);
      ctx.shake(1.2);
      await typeLines(tag, ["Your GitHub repo is a living monster.", "Now make it fight."], life, ctx.calm ? 0 : 38);
    })();
  },
};
