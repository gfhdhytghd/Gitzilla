// "Hall of Monsters": event-wide leaderboard from GET /api/hall (server records each autopsy once).
import { fmtTime, h, shortRepo } from "./util";

interface Hall {
  fastestKills: { boss: string; squad: string[]; seconds: number }[];
  topDamage: { name: string; repo: string; damage: number; boss: string }[];
  bossRecords: { boss: string; wins: number; losses: number }[];
}

const MOCK_HALL: Hall = {
  fastestKills: [
    { boss: "pallets/flask", squad: ["ada", "linus", "octocat"], seconds: 128 },
    { boss: "lodash/lodash", squad: ["wilf", "grace"], seconds: 171 },
  ],
  topDamage: [
    { name: "ada", repo: "rust-lang/rust", damage: 4210, boss: "pallets/flask" },
    { name: "linus", repo: "torvalds/linux", damage: 3890, boss: "lodash/lodash" },
    { name: "octocat", repo: "facebook/react", damage: 2650, boss: "pallets/flask" },
  ],
  bossRecords: [{ boss: "pallets/flask", wins: 3, losses: 2 }],
};

export async function fetchHall(mock: boolean): Promise<Hall | null> {
  if (mock) return MOCK_HALL;
  try {
    const r = await fetch("/api/hall");
    return r.ok ? ((await r.json()) as Hall) : null;
  } catch {
    return null;
  }
}

export function createHallBoard(mock: boolean, opts: { rows?: number; highlight?: string[] } = {}): HTMLElement {
  const n = opts.rows ?? 5;
  const body = h("div.hall-body", null, h("div.dim.blink", null, "querying hall…"));
  const el = h("section.panel.hall", null, h("h2.panel-title", null, "☠ HALL OF MONSTERS"), body);
  fetchHall(mock).then((hall) => {
    if (!hall || (!hall.fastestKills?.length && !hall.topDamage?.length)) {
      body.replaceChildren(h("div.dim", null, "no kills recorded yet. be the first."));
      return;
    }
    const hi = new Set(opts.highlight ?? []);
    const kills = (hall.fastestKills ?? []).slice(0, n);
    const dmg = (hall.topDamage ?? []).slice(0, n);
    body.replaceChildren(
      h("div.hall-col", null,
        h("div.hall-h", null, "$ fastest kills"),
        ...(kills.length ? kills.map((k, i) =>
          h("div.hall-row", null, h("span.hr-rank", null, `${i + 1}.`), h("span.hr-time", null, fmtTime(k.seconds)), h("span.hr-main", { title: k.squad.join(", "), translate: "no" }, shortRepo(k.boss)), h("span.hr-sub", null, `${k.squad.length}p`)),
        ) : [h("div.dim", null, "—")]),
      ),
      h("div.hall-col", null,
        h("div.hall-h", null, "$ top damage"),
        ...(dmg.length ? dmg.map((d, i) =>
          h(`div.hall-row${hi.has(d.name) ? ".hi" : ""}`, null, h("span.hr-rank", null, `${i + 1}.`), h("span.hr-dmg", null, `${Math.round(d.damage)} dmg`), h("span.hr-main", { title: d.repo, translate: "no" }, d.name), h("span.hr-sub", null, `vs ${shortRepo(d.boss)}`)),
        ) : [h("div.dim", null, "—")]),
      ),
    );
  });
  return el;
}
