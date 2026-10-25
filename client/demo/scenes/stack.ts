// 8 · Under the hood: the pipeline as an animated diagram (packets flow node to node), the stack, and the system's
// numbers. Everything here is static (the deck never calls the network); each number is a fact of the code/data.
import { h } from "../../app/util.ts";
import type { Scene } from "../core.ts";
import { REPO_COUNT } from "../data.ts";
import { ARCHETYPE_DECKS } from "../../../sim/archetypes.ts";

const NODES = [
  { k: "GitHub tarball", s: "streamed + untarred in memory" },
  { k: "import graph", s: "9 languages · Tarjan SCC cycles" },
  { k: "Gemini", s: "structured art direction (JSON schema)" },
  { k: "game server", s: "authoritative sim · 30 Hz" },
  { k: "snapshots", s: "20 Hz over WebSockets" },
  { k: "phones", s: "any browser · motion sensors" },
];
// boss body plans: one entry per BossArchetype (a Record, so a new plan must be added there) · room cap · i18n LOCALES
const FACTS: [number, string][] = [[REPO_COUNT, "famous repos ship pre-analyzed"], [Object.keys(ARCHETYPE_DECKS).length, "boss body plans"], [8, "players per raid"], [4, "languages in the UI"]];

export const stack: Scene = {
  id: "stack", title: "Under the hood", tracks: ["gemini", "auth0"],
  mount(el, life) {
    const row = h("div.pipe");
    NODES.forEach((n, i) => {
      row.append(h("div.pipe-node", { style: `--i:${i}` }, h("b", null, n.k), h("span", null, n.s)));
      if (i < NODES.length - 1) row.append(h("div.pipe-link", { style: `--i:${i}` }, h("i"), h("i"), h("i")));
    });
    const stackRow = h("div.stack-row", null, ...["Gemini API", "Auth0 · GitHub sign-in", "Vision Pro · WebXR", "Web Audio chiptune", "TypeScript end to end"].map((s, i) => h("span.stack-chip", { style: `--i:${i}` }, s)));
    const nums = FACTS.map(([n, label], i) => h("div.fact-num", { style: `--i:${i}` }, h("b", { "data-n": n }, "0"), h("span", null, label)));
    el.append(h("h2.slide-h", null, "Under the hood: ", h("em", null, "real analysis, real-time sim")), row, stackRow, h("div.facts-row", null, ...nums));
    // count up once (smooth, no flashing)
    const t0 = performance.now() + 2200;
    life.frame(() => {
      const k = Math.max(0, Math.min(1, (performance.now() - t0) / 900));
      for (const b of el.querySelectorAll<HTMLElement>(".fact-num b")) b.textContent = String(Math.round(Number(b.dataset.n) * (1 - Math.pow(1 - k, 3))));
    });
  },
};
