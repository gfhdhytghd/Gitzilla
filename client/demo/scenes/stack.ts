// 8 · Under the hood: the pipeline as an animated diagram (packets flow node to node), the stack, and live numbers
// from /api/hall (falls back to "offline", never to invented numbers).
import { h } from "../../app/util.ts";
import type { Scene } from "../core.ts";

const NODES = [
  { k: "GitHub tarball", s: "streamed + untarred in memory" },
  { k: "import graph", s: "9 languages · Tarjan SCC cycles" },
  { k: "Gemini", s: "structured art direction (JSON schema)" },
  { k: "authoritative sim", s: "30 Hz, server-side" },
  { k: "snapshots", s: "20 Hz over WebSockets" },
  { k: "phones", s: "any browser · motion sensors" },
];
interface Hall { fastestKills?: { boss: string; squad: string[]; seconds: number }[]; royaleWins?: { name: string; repo: string; wins: number }[]; bossRecords?: { boss: string; wins: number; losses: number }[] }

export const stack: Scene = {
  id: "stack", title: "Under the hood", tracks: ["gemini", "auth0"],
  mount(el, life) {
    const row = h("div.pipe");
    NODES.forEach((n, i) => {
      row.append(h("div.pipe-node", { style: `--i:${i}` }, h("b", null, n.k), h("span", null, n.s)));
      if (i < NODES.length - 1) row.append(h("div.pipe-link", { style: `--i:${i}` }, h("i"), h("i"), h("i")));
    });
    const stackRow = h("div.stack-row", null, ...["Gemini API", "Auth0 · GitHub sign-in", "Vision Pro · WebXR", "Web Audio chiptune", "TypeScript end to end"].map((s, i) => h("span.stack-chip", { style: `--i:${i}` }, s)));
    const hall = h("div.hall-live", null, h("div.hall-h", null, "$ curl /api/hall", h("span.dim", null, "  live")), h("div.hall-body", null, "loading…"));
    el.append(h("h2.slide-h", null, "Under the hood: ", h("em", null, "real analysis, real-time sim")), row, stackRow, hall);
    void (async () => {
      let j: Hall | null = null;
      try { const r = await fetch("/api/hall"); if (r.ok) j = (await r.json()) as Hall; } catch { /* offline */ }
      if (!life.alive) return;
      const body = hall.querySelector(".hall-body")!;
      if (!j) { body.textContent = "offline: live numbers unavailable"; return; }
      const fk = (j.fastestKills ?? []).slice(0, 3), rw = (j.royaleWins ?? []).slice(0, 3);
      const kills = (j.bossRecords ?? []).reduce((s, b) => s + b.wins, 0);
      body.replaceChildren(
        h("div.hall-col", null, h("h4", null, "fastest boss kills"), ...(fk.length ? fk.map((k) => h("div.hall-r", null, h("b", null, `${k.seconds.toFixed(1)}s`), ` ${k.boss} · ${k.squad.length} heroes`)) : [h("div.hall-r.dim", null, "no kills yet: be the first")])),
        h("div.hall-col", null, h("h4", null, "royale wins"), ...(rw.length ? rw.map((k) => h("div.hall-r", null, h("b", null, `×${k.wins}`), ` ${k.name} · ${k.repo}`)) : [h("div.hall-r.dim", null, "no royale wins yet")])),
        h("div.hall-col", null, h("h4", null, "bosses deleted"), h("div.hall-big", null, String(kills))));
    })();
  },
};
