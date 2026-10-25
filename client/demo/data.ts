// Real public fallback analyses (data/fallback) + their bundled Gemini designs (data/design), turned into kits by the
// same sim rules the server uses. Nothing here talks to the network or to Gemini at runtime.
import type { BossDesign, BossKit, Genesis, HeroDesign, PlayerKit, RepoProfile } from "../../shared/types.ts";
import { bossKitFromProfile, playerKitFromProfile } from "../../sim/index.ts";
import { pvpPowerFromProfile } from "../../sim/pvpPower.ts";
import { buildGenesis } from "../../genesis/index.ts";

const profiles = import.meta.glob("/data/fallback/*.json", { eager: true, import: "default" }) as Record<string, RepoProfile>;
const bossDesigns = import.meta.glob("/data/design/*.boss.json", { eager: true, import: "default" }) as Record<string, BossDesign>;
const heroDesigns = import.meta.glob("/data/design/*.hero.json", { eager: true, import: "default" }) as Record<string, HeroDesign>;

const file = (slug: string) => slug.replace("/", "__");
export function profile(slug: string): RepoProfile {
  const p = profiles[`/data/fallback/${file(slug)}.json`];
  if (!p) throw new Error(`no fallback analysis for ${slug}`);
  return p;
}

/** The three repos the presenter cycles with R. */
export const FEATURED = ["redis/redis", "facebook/react", "pallets/flask"] as const;
/** Hero rosters for the mini-scenes (all real public repos with bundled analyses). */
export const HERO_REPOS = ["burntsushi/ripgrep", "gin-gonic/gin", "karpathy/nanogpt", "expressjs/express", "django/django", "rust-lang/rustlings", "vuejs/core", "lodash/lodash"];

const bossCache = new Map<string, BossKit>(), heroCache = new Map<string, PlayerKit>();
export function bossKit(slug: string, players = 4): BossKit {
  const key = `${slug}:${players}`;
  const hit = bossCache.get(key);
  if (hit) return hit;
  const kit = bossKitFromProfile(profile(slug), players);
  const d = bossDesigns[`/data/design/${file(slug)}.boss.json`];
  const out = d ? { ...kit, design: d, name: d.name, palette: [...d.palette], theme: d.theme, attacks: kit.attacks.map((a) => ({ ...a, name: d.attackNames[a.id] || a.name })) } : kit;
  bossCache.set(key, out);
  return out;
}
export function heroKit(slug: string, mode?: "pvp" | "edu"): PlayerKit {
  const key = `${slug}:${mode ?? ""}`;
  const hit = heroCache.get(key);
  if (hit) return hit;
  const kit = playerKitFromProfile(profile(slug), mode ? { mode } : undefined);
  const d = heroDesigns[`/data/design/${file(slug)}.hero.json`];
  const out = d ? { ...kit, design: d, title: d.title, palette: [...d.palette] } : kit;
  heroCache.set(key, out);
  return out;
}
export function bossGenesis(slug: string): Genesis { return buildGenesis(profile(slug), bossKit(slug), "boss"); }
export const power = (slug: string) => pvpPowerFromProfile(profile(slug));

export const compact = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(n);
export const basename = (path: string) => path.split("/").pop() ?? path;
