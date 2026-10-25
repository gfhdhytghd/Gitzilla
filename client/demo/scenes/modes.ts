// 5 · Three ways to play: looping mini-scenes from the real sim + renderers. Only the raid card feeds the shared
// particle pool (one global pool), the others draw without hit sparks.
import { h } from "../../app/util.ts";
import type { Scene } from "../core.ts";
import { FEATURED, HERO_REPOS, bossKit, heroKit } from "../data.ts";
import { createMiniSim, drawSim } from "../sims.ts";
import { createClassAttack } from "./classfx.ts";

export const modes: Scene = {
  id: "modes", title: "Three ways to play", tracks: ["mystery", "nittany"],
  mount(el, life, ctx) {
    const raid = createMiniSim({ kind: "raid", heroes: HERO_REPOS.slice(0, 4).map((r) => ({ name: r.split("/")[1], kit: heroKit(r) })), boss: bossKit(FEATURED[ctx.repo], 4) });
    const roy = createMiniSim({ kind: "royale", heroes: HERO_REPOS.slice(0, 6).map((r) => ({ name: r.split("/")[1], kit: heroKit(r, "pvp") })), speed: 1.3 });
    const c1 = h("canvas", { width: 480, height: 288 }) as HTMLCanvasElement;
    const c2 = h("canvas", { width: roy.world.w, height: roy.world.h }) as HTMLCanvasElement;
    const cls = createClassAttack("pallets/flask", [
      { label: "submission · 3/3 checks", dmg: 19 }, { label: "submission · 2/3 checks", dmg: 13 },
      { label: "submission · 3/3 checks", dmg: 17 }, { label: "submission · 1/3 checks", dmg: 7 },
    ], life, { period: 8, scale: 1 });
    const card = (n: number, title: string, sub: string, body: HTMLElement, cls2: string) => h(`div.mode-card.${cls2}`, { style: `--i:${n}` },
      h("div.mode-k", null, `0${n + 1}`), h("div.mode-t", null, title), h("div.mode-view", null, body), h("div.mode-s", null, sub));
    el.append(h("h2.slide-h", null, "One monster. ", h("em", null, "Three ways to fight it.")), h("div.mode-row", null,
      card(0, "Co-op raid", "2–8 phones vs your repo's boss. Break limbs, read telegraphs, revive friends.", c1, "raid"),
      card(1, "PvP royale", "Up to 8 repos fight it out while the GC sweep closes in. Last one standing.", c2, "royale"),
      card(2, "Classroom", "Students code in the browser. Every submission's score hits the class boss.", cls.el, "class")));
    const g1 = c1.getContext("2d")!, g2 = c2.getContext("2d")!;
    life.frame((t, dt) => {
      raid.step(dt); roy.step(dt);
      g1.setTransform(1, 0, 0, 1, 0, 0); g1.imageSmoothingEnabled = false;
      drawSim(g1, raid, t, { events: true });
      g2.setTransform(1, 0, 0, 1, 0, 0); g2.imageSmoothingEnabled = false;
      drawSim(g2, roy, t);
      cls.frame(t, dt);
    });
  },
};
