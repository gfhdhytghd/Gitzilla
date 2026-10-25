// 7 · Play it yourself: a static invitation (the deck is a presentation, nothing live). A big bundled QR to the
// homepage (plain image, nothing on top of it), the URL in large type, three steps, and real heroes bobbing gently.
import { h } from "../../app/util.ts";
import { R } from "../../app/renderers.ts";
import type { Scene } from "../core.ts";
import { HERO_REPOS, heroKit } from "../data.ts";
import { HOME_URL, clearOverQr, homeQr, typeLines } from "./fx.ts";

export const play: Scene = {
  id: "play", title: "Play it yourself", tracks: ["mystery"],
  mount(el, life, ctx) {
    const url = h("div.play-url");
    const steps = [["scan", "the code with your phone"], ["paste", "any public GitHub repo"], ["fight", "its monster with friends"]]
      .map(([k, v], i) => h("div.play-step", { style: `--i:${i}` }, h("b", null, `${i + 1}`), h("span", null, h("em", null, k), ` ${v}`)));
    const heroes = HERO_REPOS.slice(0, 6).map((slug, i) => {
      const port = R.playerPortrait(heroKit(slug), 144);
      return h("div.play-hero", { style: `--i:${i}` }, port, h("span", null, slug.split("/")[1]));
    });
    el.append(
      h("h2.slide-h", null, "Your turn. ", h("em", null, "Play it yourself.")),
      h("div.play-qr", null, homeQr("play-qr-img")),
      h("div.play-right", null, url, h("div.play-steps", null, ...steps), h("div.play-note", null, "no app · no account · any phone browser")),
      h("div.play-heroes", null, ...heroes),
    );
    clearOverQr(el, life);
    void typeLines(url, [HOME_URL.replace(/^https:\/\//, "")], life, ctx.calm ? 0 : 55);
  },
};
