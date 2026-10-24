// Offline Genesis gallery: replays data/fallback repos through the real sim kit rules + the local genesis builder.
// URL params: ?repo=<idx|slug> &mode=edu &src=local &kind=hero|boss &layout=big|desktop|phone|card &condensed=1 &live=1 &t=<sec freeze> &loop=1
import type { BossDesign, BossKit, GenesisProgress, HeroDesign, PlayerKit, RepoProfile } from "../../shared/types.ts";
import { bossKitFromProfile, playerKitFromProfile } from "../../sim/kits.ts";
import { buildGenesis } from "../../genesis/index.ts";
import { buildGenesisLocal, playGenesis, type GenesisHandle } from "./index.ts";

const profiles = (Object.values(import.meta.glob("/data/fallback/*.json", { eager: true, import: "default" })) as RepoProfile[])
  .sort((a, b) => a.slug.localeCompare(b.slug));
const heroDesigns = import.meta.glob("/data/design/*.hero.json", { eager: true, import: "default" }) as Record<string, HeroDesign & { weaponName?: string }>;
const bossDesigns = import.meta.glob("/data/design/*.boss.json", { eager: true, import: "default" }) as Record<string, BossDesign>;

const q = new URLSearchParams(location.search);
const kind = (q.get("kind") === "boss" ? "boss" : "hero") as "hero" | "boss";
const layout = q.get("layout") ?? "desktop";
const mode = q.get("mode") === "edu" ? "edu" : "battle";
const repoQ = q.get("repo") ?? "0";
const idx = Math.max(0, /^\d+$/.test(repoQ) ? Number(repoQ) % profiles.length : profiles.findIndex((p) => p.slug === repoQ));
const profile = profiles[idx];
const file = profile.slug.replace("/", "__");

function heroKit(p: RepoProfile): PlayerKit {
  const kit = playerKitFromProfile(p, { mode });
  const d = heroDesigns[`/data/design/${file}.hero.json`];
  if (!d || q.get("design") === "0") return kit;
  return {
    ...kit, design: d, title: d.title, palette: [...d.palette],
    ...(d.weaponName && kit.code?.weapon ? { code: { ...kit.code, weapon: { ...kit.code.weapon, name: d.weaponName.slice(0, 20) } } } : {}),
  };
}
function bossKit(p: RepoProfile): BossKit {
  const kit = bossKitFromProfile(p, 4);
  const d = bossDesigns[`/data/design/${file}.boss.json`];
  if (!d || q.get("design") === "0") return kit;
  return { ...kit, design: d, name: d.name, palette: [...d.palette], theme: d.theme, attacks: kit.attacks.map((a) => ({ ...a, name: d.attackNames[a.id] || a.name })) };
}

const kit = kind === "boss" ? bossKit(profile) : heroKit(profile);
// default: the real server builder (genesis/, pure TS); ?src=local uses the client fallback builder
const genesis = q.get("src") === "local" ? buildGenesisLocal(profile, kit) : buildGenesis(profile, kit, kind);

// ---- nav
const bar = document.getElementById("bar")!;
const link = (label: string, patch: Record<string, string | null>, on = false) => {
  const u = new URLSearchParams(q);
  for (const [k, v] of Object.entries(patch)) v === null ? u.delete(k) : u.set(k, v);
  const a = document.createElement("a");
  a.href = "?" + u.toString();
  a.textContent = label;
  if (on) a.className = "on";
  bar.append(a);
};
const sel = document.createElement("select");
profiles.forEach((p, i) => { const o = new Option(p.slug, String(i), false, i === idx); sel.add(o); });
sel.onchange = () => { const u = new URLSearchParams(q); u.set("repo", sel.value); location.search = u.toString(); };
bar.append(sel);
link("hero", { kind: "hero" }, kind === "hero");
link("boss", { kind: "boss" }, kind === "boss");
for (const l of ["big", "desktop", "card", "phone"]) link(l, { layout: l }, layout === l);
link("edu", { mode: mode === "edu" ? null : "edu" }, mode === "edu");
link("condensed", { condensed: q.get("condensed") ? null : "1" }, !!q.get("condensed"));
link("live", { live: q.get("live") ? null : "1" }, !!q.get("live"));
const replay = document.createElement("button");
replay.textContent = "replay";
bar.append(replay);
const hint = document.createElement("span");
hint.className = "hint";
hint.textContent = "tap the cinematic: skip / replay";
bar.append(hint);

// ---- host size per layout
const host = document.getElementById("host")!;
const vw = window.innerWidth, vh = window.innerHeight - 44;
const size: Record<string, [number, number]> = {
  big: [Math.min(vw, (vh * 16) / 9), Math.min(vh, (vw * 9) / 16)],
  desktop: [vw - 16, vh - 12],
  card: [Math.min(vw - 20, 420), Math.min(vh - 20, 300)],
  phone: [Math.min(vw, 390), Math.min(vh, Math.round(844 * 0.45))],
};
const [w, h] = size[layout] ?? size.desktop;
host.style.width = `${Math.round(w)}px`;
host.style.height = `${Math.round(h)}px`;

let g: GenesisHandle;
const start = () => {
  g?.dispose();
  if (q.get("live")) {
    // simulate the analyzer: real paths stream in, the genesis lands after ~3 s
    g = playGenesis(host, { kind, slug: profile.slug, compact: layout === "phone", condensed: !!q.get("condensed"), mode, progress: { stage: "clone", pct: 0 } });
    const paths = genesis.sampleFiles;
    const stages: GenesisProgress["stage"][] = ["clone", "clone", "clone", "parse", "graph", "dna", "design"];
    let i = 0;
    const tick = setInterval(() => {
      const st = stages[Math.min(stages.length - 1, Math.floor(i / 4))];
      g.update({ progress: { stage: st, pct: Math.min(0.95, i / 28), paths: paths.slice((i * 3) % paths.length, (i * 3) % paths.length + 3), note: i === 12 ? `resolving ${genesis.edges.length * 37} imports` : undefined } });
      if (++i > 26) { clearInterval(tick); g.update({ genesis, kit }); }
    }, 120);
  } else {
    g = playGenesis(host, { kind, genesis, kit, compact: layout === "phone", condensed: !!q.get("condensed"), mode, loop: !!q.get("loop") });
  }
  const t = q.get("t");
  if (t !== null) g.seek(Number(t));
  (window as unknown as { genesis: GenesisHandle }).genesis = g;
};
replay.onclick = start;
start();
