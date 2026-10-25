import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BossArchetype, BossDesign, BossKit, RepoProfile } from "../../../shared/types.ts";
import { bossKitFromProfile } from "../../../sim/index.ts";
import { syntheticProfile } from "../../../sim/bots.ts";
import { applyBossDesign } from "../../../design/index.ts";
import { bossAnchors } from "../../../shared/kaiju-anatomy.ts";
import { bossLayout } from "./layout.ts";
import { bossVariety, type BossForm } from "./variety.ts";

const ROOT = new URL("../../../data/", import.meta.url);
function fallbackKits(): { slug: string; kit: BossKit }[] {
  return readdirSync(new URL("fallback/", ROOT)).filter((f) => f.endsWith(".json")).map((f) => {
    const p = JSON.parse(readFileSync(new URL("fallback/" + f, ROOT), "utf8")) as RepoProfile;
    const d = JSON.parse(readFileSync(new URL("design/" + p.slug.replace("/", "__") + ".boss.json", ROOT), "utf8"));
    return { slug: p.slug, kit: applyBossDesign(bossKitFromProfile(p, 4), (d.design ?? d) as BossDesign) };
  });
}

const FORMS: [BossArchetype, BossForm][] = [["kaiju", "kaiju"], ["kaiju", "golem"], ["kaiju", "insectoid"], ["kaiju", "eye"], ["mecha", "mecha"], ["mecha", "ironclad"], ["hydra", "dragon"], ["hydra", "naga"], ["abyssal", "abyssal"], ["abyssal", "wyrm"]];

describe("boss variety", () => {
  it("is deterministic per repo", () => {
    for (const { kit } of fallbackKits()) {
      const a = bossVariety(kit), b = bossVariety(structuredClone(kit));
      expect(b.form).toBe(a.form);
      expect(b.element.id).toBe(a.element.id);
      expect([b.fins, b.horns, b.tail, b.wing, b.hue]).toEqual([a.fins, a.horns, a.tail, a.wing, a.hue]);
    }
  });

  it("no two of the 15 fallback bosses share base (archetype + body plan) and palette (element)", () => {
    const kits = fallbackKits();
    expect(kits.length).toBe(15);
    const looks = kits.map(({ kit }) => { const v = bossVariety(kit); return `${kit.archetype}/${v.form}/${v.element.id}`; });
    expect(new Set(looks).size).toBe(15);
    // and the set actually spreads: several body plans and elements
    expect(new Set(kits.map(({ kit }) => bossVariety(kit).form)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(kits.map(({ kit }) => bossVariety(kit).element.id)).size).toBeGreaterThanOrEqual(6);
  });

  it("every body plan keeps the hitbox mapping: limb art on the sim's anchors, the heart on the chest", () => {
    for (let seed = 1; seed <= 6; seed++) for (const [arch, form] of FORMS) for (const n of [2, 3, 5, 8]) {
      const base = bossKitFromProfile(syntheticProfile(seed), 4);
      const limbs = Array.from({ length: n }, (_, i) => ({ ...base.limbs[i % base.limbs.length], id: "limb" + i }));
      const kit = { ...base, archetype: arch, limbs, forceForm: form } as BossKit;
      const L = bossLayout(kit);
      const A = bossAnchors(kit);
      expect(L.kaiju?.form).toBe(form);
      for (const a of A.limbs) {
        const l = L.limbs.find((q) => q.id === a.id)!;
        expect([l.x, l.y, l.hitR]).toEqual([a.dx, a.dy, a.r]);
      }
      expect([L.heart.x, L.heart.y, L.heart.hitR]).toEqual([A.chest.dx, A.chest.dy, A.chest.r]);
      // something the limb owns is drawn on (or right next to) its hitbox, so a hit visibly lands on that part
      L.limbs.forEach((l, i) => {
        const near = (x: number, y: number, r: number) => Math.hypot(x - l.x, y - l.y) <= l.hitR + r + 4;
        const owned = L.lobes.some((o) => o.owner === i && near(o.x, o.y, o.r)) || (L.kaiju?.plates ?? []).some((p) => p.owner === i && near(p.x, p.y, p.scale))
          || (L.kaiju?.jaws ?? []).some((j) => j.limb === i && near(j.hx, j.hy, j.len)) || (L.kaiju?.wing?.limb === i);
        expect(owned, `${arch}/${form} n=${n} limb ${i} (${A.limbs[i].slot})`).toBe(true);
      });
      // the body itself covers the heart
      expect(L.lobes.some((o) => Math.hypot(o.x - L.heart.x, (o.y - L.heart.y) * (o.ry ? o.r / o.ry : 1)) < o.r + 3), `${arch}/${form} heart (within the smooth-union blend)`).toBe(true);
    }
  });

  it("small repos float as an eye, others keep their archetype's plans", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const kit = bossKitFromProfile(syntheticProfile(seed), 4);
      const v = bossVariety(kit);
      const allowed: Record<BossArchetype, BossForm[]> = { kaiju: ["kaiju", "golem", "insectoid", "eye"], mecha: ["mecha", "ironclad"], hydra: ["dragon", "naga"], abyssal: ["abyssal", "wyrm"] };
      expect(allowed[kit.archetype]).toContain(v.form);
      if (kit.archetype === "kaiju") expect(v.form === "eye").toBe(kit.limbs.length <= 3);
    }
  });
});
