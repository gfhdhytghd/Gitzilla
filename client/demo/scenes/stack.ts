// 8 · Under the hood: the pipeline as an animated diagram (packets flow node to node), the stack, and the system's
// numbers. Everything here is static (the deck never calls the network); each number is a fact of the code/data.
import { h } from "../../app/util.ts";
import type { Scene } from "../core.ts";
import { REPO_COUNT } from "../data.ts";
import { ELEMENTS, bossVariety } from "../../render/boss/variety.ts";
import type { BossArchetype, BossKit } from "../../../shared/types.ts";
import { FEATURED, bossKit } from "../data.ts";

const NODES = [
  { k: "GitHub tarball", s: "streamed + untarred in memory" },
  { k: "import graph", s: "9 languages · Tarjan SCC cycles" },
  { k: "Gemini", s: "structured art direction (JSON schema)" },
  { k: "game server", s: "authoritative sim · 30 Hz" },
  { k: "snapshots", s: "20 Hz over WebSockets" },
  { k: "phones", s: "any browser · motion sensors" },
];
/** Body plans the boss renderer can actually draw: run its own bossVariety() over every archetype with small/mid/big
 *  limb sets, the component names that steer the kaiju-family pick, and many seeds, then count distinct forms.
 *  (The renderer has no exported list; this follows it as claude-boss adds plans.) */
function bodyPlans(): number {
  const base = bossKit(FEATURED[0]), forms = new Set<string>();
  const comps = [["src/core", "src/main"], ["tests", "spec", "utils"], ["api", "web", "docs", "cli", "pkg", "lib", "app", "ui"]];
  for (const archetype of ["kaiju", "hydra", "mecha", "abyssal"] as BossArchetype[]) for (const n of [3, 5, 8]) for (const names of comps) for (let seed = 1; seed <= 24; seed++) {
    const limbs = Array.from({ length: n }, (_, i) => ({ ...base.limbs[i % base.limbs.length], id: `limb-${i}`, component: names[i % names.length] }));
    forms.add(bossVariety({ ...base, repo: `probe/${archetype}/${n}/${seed}`, archetype, seed: seed * 7919, limbs } as BossKit).form);
  }
  return forms.size;
}
// pre-analyzed repos (data/fallback) · body plans + elements (boss renderer) · room cap · i18n LOCALES
const ELEMENT_COUNT = Object.keys(ELEMENTS).length;
const FACTS: [number, string, string?][] = [[REPO_COUNT, "famous repos ship pre-analyzed"], [bodyPlans(), "boss body plans", `in ${ELEMENT_COUNT} elements`], [8, "players per raid"], [4, "languages in the UI"]];

export const stack: Scene = {
  id: "stack", title: "Under the hood", tracks: ["gemini", "auth0"],
  mount(el, life) {
    const row = h("div.pipe");
    NODES.forEach((n, i) => {
      row.append(h("div.pipe-node", { style: `--i:${i}` }, h("b", null, n.k), h("span", null, n.s)));
      if (i < NODES.length - 1) row.append(h("div.pipe-link", { style: `--i:${i}` }, h("i"), h("i"), h("i")));
    });
    const stackRow = h("div.stack-row", null, ...["Gemini API", "Auth0 · GitHub sign-in", "Vision Pro · WebXR", "Web Audio chiptune", "TypeScript end to end"].map((s, i) => h("span.stack-chip", { style: `--i:${i}` }, s)));
    const nums = FACTS.map(([n, label, sub], i) => h("div.fact-num", { style: `--i:${i}` }, h("b", { "data-n": n }, "0"), h("span", null, label), sub ? h("span", null, sub) : null));
    el.append(h("h2.slide-h", null, "Under the hood: ", h("em", null, "real analysis, real-time sim")), row, stackRow, h("div.facts-row", null, ...nums));
    // count up once (smooth, no flashing)
    const t0 = performance.now() + 2200;
    life.frame(() => {
      const k = Math.max(0, Math.min(1, (performance.now() - t0) / 900));
      for (const b of el.querySelectorAll<HTMLElement>(".fact-num b")) b.textContent = String(Math.round(Number(b.dataset.n) * (1 - Math.pow(1 - k, 3))));
    });
  },
};
