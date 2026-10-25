// 2 · Code → creature: the real Genesis "compile" cinematic (client/genesis) replays a famous public repo's analysis
// into its boss, then rotates to the next repo. Callouts name the real heart file and the creature's limbs.
import { h } from "../../app/util.ts";
import { playGenesis, type GenesisHandle } from "../../genesis/index.ts";
import type { Scene } from "../core.ts";
import { FEATURED, basename, bossGenesis, bossKit, compact, profile } from "../data.ts";

export const genesis: Scene = {
  id: "genesis", title: "Code → creature", tracks: ["gemini"],
  mount(el, life, ctx) {
    const head = h("div.gen-head");
    // playGenesis lays out from getBoundingClientRect (already scaled by the stage transform), so its host is
    // counter-scaled: measured size == displayed size at any window size
    const host = h("div.gen-fit");
    const frame = h("div.gen-host", null, host);
    const fit = () => {
      const s = Math.min(innerWidth / 1920, innerHeight / 1080);
      Object.assign(host.style, { width: `${1290 * s}px`, height: `${820 * s}px`, transform: `scale(${1 / s})` });
    };
    fit();
    life.on(window, "resize", fit);
    const calls = h("div.gen-calls");
    el.append(head, frame, calls);
    let handle: GenesisHandle | null = null, gen = 0;
    life.add(() => handle?.dispose());

    function show(i: number) {
      const slug = FEATURED[i], p = profile(slug), kit = bossKit(slug), mine = ++gen;
      head.replaceChildren(
        h("span.prompt", null, "$ gitzilla summon "),
        h("a.repo-link", { href: `https://github.com/${slug}`, target: "_blank", rel: "noopener" }, `github.com/${slug}`),
        h("span.gen-stats", null, `${compact(p.totalFiles)} files · ${compact(p.totalLoc)} LOC · ${p.components.length} components · ${p.cycles.length} cycles`),
      );
      calls.replaceChildren();
      handle?.dispose();
      handle = playGenesis(host, { kind: "boss", genesis: bossGenesis(slug), kit, slug, interactive: false, condensed: ctx.calm,
        onDone: () => { if (mine === gen) life.timeout(() => mine === gen && advance(), 4500); } });
      // callouts land while the cinematic maps components to limbs
      const items = [
        h("div.call.heart", null, h("b", null, "♥ heart"), h("code", null, p.heart), h("span", null, `imported by ${p.heartFanIn} files`)),
        ...kit.limbs.slice(0, 5).map((l) => h("div.call", null, h("b", null, kit.design?.limbNames?.[l.id] ?? basename(l.component)), h("code", null, l.component))),
      ];
      items.forEach((it, k) => life.timeout(() => { if (mine === gen) { calls.append(it); if (k === 0) ctx.shake(0.4); } }, (ctx.calm ? 600 : 2200) + k * 420));
    }
    const advance = () => { ctx.repo = (ctx.repo + 1) % FEATURED.length; show(ctx.repo); };
    ctx.onRepo((i) => show(i), life);
    show(ctx.repo);
  },
};
