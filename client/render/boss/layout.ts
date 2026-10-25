// Pure boss geometry (no DOM). The sim owns hit regions (BossState.regions, absolute px).
// drawBoss passes them in as `anchors` (offsets from boss center) so limb art sits exactly on
// the hitboxes. Without anchors (portraits, gallery) we fall back to the same formula as
// sim/regions.ts: limb i of n at angle -PI/2 + i*2PI/n + (seed % 7)*0.045, offset (cos*37, sin*32),
// r 13; heart at (0,0) r 19. Everything else (lobes, appendages, eyes, legs, growths) is cosmetic,
// driven by kit.design (Gemini art direction) when present, else by the seed.
import type { BossAttackKind, BossBody, BossGrowth, BossKit, BossMouth } from "../../../shared/types.ts";
import { kaijuAnatomy } from "./anatomy.ts";
import { bossArchetype, kaijuAnchors } from "../../../shared/kaiju-anatomy.ts";
import { bossVariety, type BossForm, type FinStyle, type WingStyle } from "./variety.ts";
import { eyeForm, golemForm, insectoidForm, wyrmLegs, type FormParts } from "./forms.ts";

export type Appendage = "spines" | "coil" | "claw" | "lens" | "fist" | "horns" | "hive" | "antenna" | "nub";
export type Material = "flesh" | "scales" | "chitin" | "stone" | "metal" | "bark" | "foliage" | "sclera" | "obsidian" | "belly" | "gold" | "void";
/** "kaiju" (the primary, Godzilla-inspired archetype) is renderer-only; the others come from BossDesign.body. */
export type BodyKind = BossBody | "kaiju" | "mecha" | "dragon" | "abyssal";
/** Jaw: hinge + length (opens downward toward the heroes); limb = the limb that owns it (-1 = none). */
export interface JawLayout { hx: number; hy: number; len: number; w: number; limb: number }

export interface LimbLayout {
  id: string;
  component: string;
  index: number;
  x: number; y: number;      // offset from boss center (hitbox center, == sim)
  hitR: number;              // == sim
  r: number;                 // visual lobe radius
  angle: number;             // outward direction
  weakPoint: boolean;
  appendage: Appendage;
  kinds: BossAttackKind[];   // attacks sourced from this limb
}

/** A body mass blob. owner: -1 core/extra, else limb index (vanishes / becomes a stump when broken). */
export interface Lobe { x: number; y: number; r: number; owner: number; mat: Material; sq?: number /* squareness exponent */; ry?: number; sever?: boolean /* removed (not charred) when its owner limb breaks */ }
/** Optional extra hints (gallery/dev): forceBody overrides the archetype pick, forceForm the body plan (variety.ts). */
export interface BossVisualHints { forceBody?: BodyKind; forceForm?: BossForm }
/** A dorsal fin: base point on the spine, outward normal, height (px) in `scale`, crystal spike count. */
export interface PlateLayout { x: number; y: number; nx: number; ny: number; ch: string; scale: number; owner: number; order: number /* 0 = tail end */; spikes: number; seed: number; style?: FinStyle /* else the boss's fin style */ }
export interface EyeLayout { x: number; y: number; r: number; limb: number /* -1 = core */; phase: number }
export interface TentacleLayout {
  from: number; to: number;  // limb indices; from = -1 => dangling from body
  ax: number; ay: number;
  bx: number; by: number;
  bulge: number;
  segs: number;
  thick: number;
  knot: boolean;             // part of a dependency cycle
  phase: number;
  style: "flesh" | "root" | "cable" | "nerve" | "neck";
  color?: string;
}
export interface LegLayout { limb: number; ax: number; ay: number; dir: number; reach: number; lift: number; phase: number; style: "spider" | "piston" | "pillar" }
export interface GrowthSpot { kind: BossGrowth; x: number; y: number; angle: number; size: number; owner: number; phase: number }
export interface ScarLayout { x0: number; y0: number; x1: number; y1: number }

export interface BossLayout {
  body: BodyKind;
  mouthKind: BossMouth;
  growths: BossGrowth[];
  bodyR: number;
  heart: { x: number; y: number; r: number; hitR: number; style: "braces" | "iris" | "reactor" };
  mouth: { x: number; y: number; w: number; angle: number } | null;
  limbs: LimbLayout[];
  lobes: Lobe[];
  eyes: EyeLayout[];
  tentacles: TentacleLayout[];
  legs: LegLayout[];
  spots: GrowthSpot[];
  scars: ScarLayout[];
  extent: number;            // half-size of a box that contains everything (for sprite buffers)
  kaiju?: {
    kind: "kaiju" | "mecha" | "dragon" | "abyssal";
    plates: PlateLayout[]; heads: { x: number; y: number }[]; mouth: { x: number; y: number }; mouths: { x: number; y: number }[];
    jaws: JawLayout[]; tailLen: number; jawLimb: number; slots: string[]; hint: BossBody;
    veins: { x: number; y: number; r: number; a: number }[]; mech: boolean;
    wing?: { x: number; y: number; span: number; limb: number; style: WingStyle };
    vents: { x: number; y: number }[];
    feet: { x: number; y: number }[];
    /** body plan (variety.ts); kind stays the archetype's (poses, attacks, beams) */
    form: BossForm;
    /** default fin style (plates without their own) */
    fins: FinStyle;
    /** hide material of the jaws / front details */
    mat: Material;
    /** cracks / veins glow in the element color even when calm */
    glowVeins: boolean;
    /** floats: a slow hover bob (and no stomps) */
    hover: boolean;
    /** slithers / glides instead of stomping */
    glide?: boolean;
  };
}

const BODIES: BossBody[] = ["blob", "serpent", "spider", "hydra", "golem", "swarm", "eye", "tree", "machine"];
const MOUTHS: BossMouth[] = ["maw", "brackets", "beak", "zipper", "brackets"];
const GROWTHS: BossGrowth[] = ["spikes", "cables", "crystals", "moss", "servers", "wings", "horns", "tentacles", "gears", "pipes"];

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const APPENDAGE: Record<BossAttackKind, Appendage> = {
  ring: "spines", spiral: "coil", fan: "claw", laser: "lens", slam: "fist", charge: "horns", summon: "hive", cascade: "antenna",
};

/** Same formula as sim/regions.ts. */
export function limbAngle(kit: BossKit, i: number): number {
  const n = kit.limbs.length;
  return -Math.PI / 2 + (i * Math.PI * 2) / Math.max(1, n) + (kit.seed % 7) * 0.045;
}

export type Anchor = { id: string; x: number; y: number; r: number };

const MATERIAL: Record<BossBody, Material> = {
  blob: "flesh", serpent: "scales", spider: "chitin", hydra: "scales", golem: "stone", swarm: "chitin", eye: "flesh", tree: "bark", machine: "metal",
};

const layoutCache = new Map<string, BossLayout>();
const big0 = (b: BodyKind) => b === "kaiju" || b === "mecha" || b === "dragon" || b === "abyssal";

/** anchors: regions relative to the boss center (id = limb id or "heart"). */
export function bossLayout(kit: BossKit, anchors?: Anchor[]): BossLayout {
  const akey = anchors ? anchors.map((a) => a.id + ":" + Math.round(a.x) + "," + Math.round(a.y) + "," + Math.round(a.r)).join(";") : "";
  const d = kit.design;
  const dkey = (d ? d.body + d.mouth + d.eyes + d.growths.join("") : "") + ((kit as BossKit & BossVisualHints).forceBody ?? "") + ((kit as BossKit & BossVisualHints).forceForm ?? "") + kit.theme;
  const key = kit.repo + "|" + kit.seed + "|" + kit.limbs.length + "|" + akey + "|" + dkey + "|" + bossArchetype(kit);
  const hit = layoutCache.get(key);
  if (hit) return hit;
  if (layoutCache.size > 200) layoutCache.clear();
  const R = prng(kit.seed ^ 0x9e3779b9);
  const seed = kit.seed >>> 0;
  // The kaiju is the primary boss; the older archetypes only show up as rare variants (~15% by seed) or when forced.
  const variant: BossBody = d?.body && BODIES.includes(d.body) ? d.body : BODIES[(seed >>> 5) % BODIES.length];
  const forced = (kit as BossKit & BossVisualHints).forceBody;
  // The kaiju IS the boss. design.body (Gemini / saved designs) only flavors it (see `hint` in the kaiju case);
  // the other silhouettes are reachable only through the dev override `forceBody`.
  // The boss body follows the sim's archetype pick (kit.archetype, from real repo traits).
  const arch = bossArchetype(kit);
  const body: BodyKind = forced ?? (arch === "hydra" ? "dragon" : arch);
  const hint: BossBody = variant;
  // look variety (variety.ts): body plan on the archetype's anchors, element, fin / horn / tail / wing variants
  const V = bossVariety(kit);
  const forcedForm = (kit as BossKit & BossVisualHints).forceForm;
  const form: BossForm = forcedForm ?? (forced ? (body === "kaiju" || body === "mecha" || body === "dragon" || body === "abyssal" ? body : "kaiju") : V.form);
  const mouthKind: BossMouth = d?.mouth ?? MOUTHS[(seed >>> 9) % MOUTHS.length];
  const growths: BossGrowth[] = (d?.growths?.length ? d.growths : [GROWTHS[(seed >>> 11) % GROWTHS.length], GROWTHS[(seed >>> 15) % GROWTHS.length]]).filter((g, i, a) => a.indexOf(g) === i).slice(0, 3);
  // the archetype bodies only take growths that sit on the hide (no dangling tentacles/cables, horns, spikes or wings)
  if (["kaiju", "mecha", "hydra", "abyssal"].includes(bossArchetype(kit)) && !(kit as BossKit & BossVisualHints).forceBody)
    for (let i = growths.length - 1; i >= 0; i--) if (!["moss", "crystals", "gears", "servers", "pipes"].includes(growths[i])) growths.splice(i, 1);
  const eyeCount = Math.max(1, Math.min(12, d?.eyes ?? 3 + (seed % 6)));
  const mat: Material = body === "kaiju" || body === "mecha" ? "obsidian" : body === "dragon" ? "gold" : body === "abyssal" ? "void" : MATERIAL[body];
  const n = kit.limbs.length;
  const totalHp = kit.limbs.reduce((s, l) => s + l.maxHp, 0) || 1;
  const bodyR = 26 + Math.round(R() * 4);

  const anchorOf = (id: string) => anchors?.find((a) => a.id === id);
  const limbs: LimbLayout[] = kit.limbs.map((l, i) => {
    const an = anchorOf(l.id);
    // no sim regions (portraits): use the shared kaiju anatomy, which is what the sim builds its regions from
    const ka = kaijuAnchors(kit).limbs[i];
    const ax = an ? Math.round(an.x) : ka ? ka.dx : Math.round(Math.cos(limbAngle(kit, i)) * 37), ay = an ? Math.round(an.y) : ka ? ka.dy : Math.round(Math.sin(limbAngle(kit, i)) * 32);
    const angle = Math.atan2(ay, ax || 0.001);
    const share = l.maxHp / totalHp;
    const kinds = kit.attacks.filter((a) => a.source === l.component).map((a) => a.kind);
    const appendage: Appendage = kinds.length ? APPENDAGE[kinds[kinds.length > 1 && R() < 0.5 ? 1 : 0]] : "nub";
    return {
      id: l.id, component: l.component, index: i, x: ax, y: ay, hitR: an ? an.r : 13,
      r: Math.round(Math.max(10, Math.min(16, 8.5 + 16 * Math.sqrt(share * Math.min(n, 4) / 4) + R() * 2))),
      angle, weakPoint: l.weakPoint, appendage, kinds,
    };
  });
  const ha = anchorOf("heart");
  const chest = kaijuAnchors(kit).chest;
  const hx = ha ? Math.round(ha.x) : chest.dx, hy = ha ? Math.round(ha.y) : chest.dy;
  const heart = { x: hx, y: hy, r: 12, hitR: ha ? ha.r : 19, style: (body === "eye" ? "iris" : body === "machine" ? "reactor" : "braces") as "braces" | "iris" | "reactor" };

  const lobes: Lobe[] = [];
  const tentacles: TentacleLayout[] = [];
  const legs: LegLayout[] = [];
  const eyes: EyeLayout[] = [];
  let mouth: BossLayout["mouth"] = { x: hx, y: hy + Math.round(bodyR * 0.62), w: 14 + Math.round(R() * 6), angle: Math.PI / 2 };

  const danglers = (count: number, style: TentacleLayout["style"], len0: number, lenVar: number, from = bodyR - 4, cy = 0) => {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const a = Math.PI * (0.2 + t * 0.6) + (R() - 0.5) * 0.25;
      const ax = Math.cos(a) * from, ay = Math.sin(a) * from + cy;
      const len = len0 + R() * lenVar;
      tentacles.push({ from: -1, to: -1, ax, ay, bx: ax + Math.cos(a) * len * 0.6, by: ay + len, bulge: (R() - 0.5) * 18, segs: 12, thick: style === "root" ? 4 : 3 + Math.round(R()), knot: false, phase: R() * 10, style });
    }
  };
  const edgeTentacles = (style: TentacleLayout["style"]) => {
    const weak = limbs.filter((l) => l.weakPoint).map((l) => l.index);
    let edges: [number, number][] = [];
    if (n > 1) for (let i = 0; i < n; i++) if (R() < 0.55) edges.push([i, (i + 1 + (R() < 0.3 ? 1 : 0)) % n]);
    if (!edges.length && n > 1) edges.push([0, 1]);
    for (let k = 0; k < weak.length; k++) edges.push([weak[k], weak[(k + 1) % weak.length]]);
    const seen = new Set<string>();
    edges = edges.filter(([a, b]) => {
      const k = Math.min(a, b) + "-" + Math.max(a, b);
      if (a === b || seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 7);
    for (const [a, b] of edges) {
      const A = limbs[a], B = limbs[b];
      tentacles.push({ from: a, to: b, ax: A.x, ay: A.y, bx: B.x, by: B.y, bulge: 14 + R() * 12, segs: 14, thick: 2 + Math.round(R()), knot: A.weakPoint && B.weakPoint, phase: R() * 10, style });
    }
  };

  let kaiju: BossLayout["kaiju"];
  switch (body) {
    case "mecha":
    case "kaiju": {
      const an = kaijuAnatomy(kit);
      const own = (slot: string) => an.limbs.findIndex((l) => l.slot === slot);
      // limb visuals sit exactly on the shared anatomy anchors (the sim builds its hit regions from the same function)
      limbs.forEach((l, i) => {
        const a = an.limbs[i];
        if (!a) return;
        l.x = a.x; l.y = a.y; l.hitR = a.r; l.r = a.r; l.angle = Math.atan2(a.y, a.x || 0.001);
      });
      heart.x = an.heart.x; heart.y = an.heart.y; heart.hitR = an.heart.r; heart.r = 10;
      const mech = body === "mecha";
      if (form === "golem" || form === "ironclad" || form === "insectoid" || form === "eye") {
        const F: FormParts = form === "eye" ? eyeForm(an, R, seed) : form === "insectoid" ? insectoidForm(an, R, seed) : golemForm(an, form === "ironclad", R, seed);
        lobes.push(...F.lobes); legs.push(...F.legs); tentacles.push(...F.tentacles); eyes.push(...F.eyes);
        if (form === "eye") { heart.style = "iris"; heart.r = 12; }
        mouth = null;
        kaiju = {
          kind: mech ? "mecha" : "kaiju", plates: F.plates, heads: F.heads, mouth: an.mouth, mouths: an.mouths, jaws: F.jaws, tailLen: an.tailLen, jawLimb: F.jaws[0]?.limb ?? -1,
          slots: an.limbs.map((l) => l.slot), hint, veins: F.veins, mech: form === "ironclad", vents: F.vents, feet: F.feet,
          form, fins: V.fins, mat: F.mat, glowVeins: F.glowVeins, hover: F.hover,
        };
        for (let i = growths.length - 1; i >= 0; i--) if (growths[i] === "wings") growths.splice(i, 1);
        break;
      }
      const ob: Material = mech ? "metal" : "obsidian";
      const limbMat: Material = mech ? "metal" : hint === "golem" ? "stone" : ob;
      const tailMat: Material = hint === "tree" ? "bark" : ob;
      const sq = mech ? 3 : undefined; // the mech is built from boxier segments
      // torso, heavy hips, belly + throat, neck, head, snout, brow
      lobes.push({ x: 4, y: -4, r: 23, ry: 31, owner: -1, mat: ob });
      lobes.push({ x: 10, y: 19, r: 21, owner: -1, mat: ob, sq });
      lobes.push({ x: -9, y: 4, r: 14, ry: 24, owner: -1, mat: "belly" });
      lobes.push({ x: -13, y: -30, r: 12, owner: -1, mat: ob });
      lobes.push({ x: -20, y: -25, r: 7, owner: -1, mat: "belly" });
      lobes.push({ x: -28, y: -46, r: 16, ry: 12, owner: -1, mat: ob, sq });
      lobes.push({ x: -43, y: -43, r: 10, ry: 7, owner: -1, mat: ob, sq });
      lobes.push({ x: -23, y: -56, r: 8, ry: 5, owner: -1, mat: ob });
      // arms: upper arm stays, the forearm is severed when the arms limb breaks
      const arm = own(body === "mecha" ? "rocket-fist" : "arms");
      lobes.push({ x: -21, y: -8, r: 6.5, owner: -1, mat: limbMat });
      lobes.push({ x: -30, y: -2, r: body === "mecha" ? 7 : 5.5, ry: body === "mecha" ? 6 : 4.5, owner: arm, mat: ob, sever: true, sq }); // mecha: rocket fist
      if (hint === "spider") {
        lobes.push({ x: -19, y: 8, r: 5, owner: -1, mat: limbMat });
        lobes.push({ x: -27, y: 14, r: 4, ry: 3.5, owner: arm, mat: ob, sever: true });
      }
      if (hint === "blob") lobes.push({ x: 21, y: -18, r: 11, owner: -1, mat: ob }, { x: 24, y: 6, r: 10, owner: -1, mat: ob });
      // heavy legs (charred, not severed, when broken)
      const leg = own("leg"), legB = own("leg-back");
      lobes.push({ x: -6, y: 28, r: 16, owner: leg, mat: limbMat, sq }, { x: -10, y: 45, r: 10, ry: 11, owner: leg, mat: ob, sq }, { x: -15, y: 57, r: 14, ry: 5, owner: leg, mat: ob });
      lobes.push({ x: 19, y: 26, r: 15, owner: legB, mat: limbMat, sq }, { x: 17, y: 43, r: 9, ry: 11, owner: legB, mat: ob, sq }, { x: 13, y: 56, r: 13, ry: 5, owner: legB, mat: ob });
      // tail: drags on the ground behind, then curls up at the tip
      const tail = own("tail"), tip = own("tail-tip");
      const tx = an.tailLen;
      const P = hint === "serpent" ? [[18, 24], [40, 66], [tx - 40, 66], [tx, 50]] : [[18, 24], [44, 54], [tx - 40, 60], [tx, 52]];
      const N = 18;
      const tailPts: [number, number, number][] = [];
      for (let k = 0; k <= N; k++) {
        const t = k / N, u = 1 - t;
        const x = u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0];
        const y = u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1];
        tailPts.push([x, y, Math.max(3.5, 16 - t * 12)]);
      }
      for (const [cx2, cy2, r2] of [[tx + 5, 46, 3.5], [tx + 7, 40, 3], [tx + 4, 35, 2.6], [tx - 1, 33, 2.3]] as [number, number, number][]) tailPts.push([cx2, cy2, r2]);
      tailPts.forEach(([x, y, r2], k) => {
        const t = k / (tailPts.length - 1);
        const owner = t >= 0.72 && tip >= 0 ? tip : t >= 0.42 ? tail : -1;
        lobes.push({ x, y, r: r2, owner, mat: mech ? "metal" : tailMat, sq: mech && k % 2 ? 3 : undefined, sever: owner >= 0 });
      });
      // extra heads: very cyclic repos, or the hydra hint (on long necks, like a three-headed dragon)
      const heads = [{ x: -31, y: -48 }];
      const nHeads = 1; // multi-head and wings belong to the hydra archetype
      if (nHeads >= 2) { for (const [nx2, ny2, nr] of [[-2, -50, 8], [-6, -60, 6.5], [-12, -68, 6]] as [number, number, number][]) lobes.push({ x: nx2, y: ny2, r: nr, owner: -1, mat: ob }); lobes.push({ x: -22, y: -76, r: 10, ry: 7, owner: -1, mat: ob, sq }, { x: -33, y: -74, r: 6.5, ry: 4.5, owner: -1, mat: ob }); heads.push({ x: -25, y: -78 }); }
      if (nHeads >= 3) { for (const [nx2, ny2, nr] of [[12, -48, 7], [12, -60, 6], [8, -72, 5.5]] as [number, number, number][]) lobes.push({ x: nx2, y: ny2, r: nr, owner: -1, mat: ob }); lobes.push({ x: 0, y: -82, r: 9, ry: 6.5, owner: -1, mat: ob, sq }, { x: -10, y: -81, r: 6, ry: 4, owner: -1, mat: ob }); heads.push({ x: -3, y: -84 }); }
      for (const h of heads) eyes.push({ x: h.x - 1, y: h.y - 1, r: h === heads[0] ? 3 : 2, limb: -1, phase: R() * 10 });
      if (hint === "eye") for (const [ex, ey] of [[-8, -36], [2, -28], [10, -16], [12, -2], [16, 12]]) eyes.push({ x: ex, y: ey, r: 2, limb: -1, phase: R() * 10 });
      // dorsal fins: tall, jagged crystal clusters along the back edge, shrinking into a ridge down the tail.
      // Code in spirit: each big fin carries an etched bracket from the repo's tokens.
      const toks = (kit.code?.tokens ?? []).join("");
      const shapes = [...new Set([...toks].map((c) => ("{}".includes(c) ? "}" : "<>".includes(c) ? ">" : "[]".includes(c) ? "]" : "()".includes(c) ? ")" : "")).filter(Boolean))];
      const chars = shapes.length ? shapes : ["}", ">"];
      const spine: number[][] = [[-15, -58], [-3, -45], [10, -37], [19, -27], [25, -13], [27, 1], [30, 16], [38, 26]];
      for (let k = 3; k < tailPts.length - 6; k += 2) spine.push([tailPts[k][0], tailPts[k][1] - tailPts[k][2] + 1]);
      const segLen: number[] = [];
      let total = 0;
      for (let k = 1; k < spine.length; k++) { const d2 = Math.hypot(spine[k][0] - spine[k - 1][0], spine[k][1] - spine[k - 1][1]); segLen.push(d2); total += d2; }
      const nBig = 7 + ((kit.code?.tokens?.length ?? (seed >>> 3)) % 4);
      const nFins = nBig + 5; // the last few are the small tail ridge
      const plates: NonNullable<BossLayout["kaiju"]>["plates"] = [];
      const platesLimb = own(body === "mecha" ? "back-armor" : "plates"), neckLimb = own(body === "mecha" ? "shoulder-cannon" : "neck-plates");
      for (let k = 0; k < nFins; k++) {
        const t = k < nBig ? ((k + 0.6) / nBig) * 0.46 : 0.5 + ((k - nBig) / 5) * 0.42;
        let dist = t * total, j = 0;
        while (j < segLen.length - 1 && dist > segLen[j]) { dist -= segLen[j]; j++; }
        const f = Math.min(1, dist / segLen[j]);
        const x = spine[j][0] + (spine[j + 1][0] - spine[j][0]) * f, y = spine[j][1] + (spine[j + 1][1] - spine[j][1]) * f;
        const dx = spine[j + 1][0] - spine[j][0], dy = spine[j + 1][1] - spine[j][1], dl = Math.hypot(dx, dy) || 1;
        let nx = dy / dl, ny = -dx / dl;
        if (ny > 0) { nx = -nx; ny = -ny; }
        // fin height: tallest over the shoulders and mid-back, tapering to the neck and down the tail
        const height = k < nBig ? Math.round((mech ? 14 : 18) + (mech ? 12 : 22) * Math.sin(Math.PI * Math.min(1, (k + 0.8) / (nBig * 0.95)))) : Math.max(6, 14 - (k - nBig) * 1.8);
        const spikes = k < nBig ? 3 + ((seed >>> k) & 1) + (height > 22 ? 1 : 0) : 2;
        const owner = k < Math.ceil(nBig * 0.3) ? neckLimb : k < nBig ? platesLimb : -1;
        plates.push({ x, y, nx, ny, ch: chars[k % chars.length], scale: height, owner, order: nFins - 1 - k, spikes, seed: (seed + k * 7919) >>> 0 });
      }
      // enrage veins: crescent marks across the hide that glow red (phase 2) / red+cyan (phase 3)
      const veins: { x: number; y: number; r: number; a: number }[] = [];
      for (const [vx, vy] of [[6, -22], [-4, -10], [14, -6], [8, 10], [20, 22], [-10, 30], [16, 40], [-16, -38], [40, 44], [62, 54], [84, 56]] as [number, number][]) veins.push({ x: vx, y: vy, r: 4 + R() * 3, a: R() * Math.PI * 2 });
      mouth = null;
      const jawLimb = mech && body === "mecha" ? own("head") : own("jaw");
      // variants: horns on the head, a tail-tip shape
      const horn = (x: number, y: number, nx: number, ny: number, sc: number, k: number, style: FinStyle = "blade") =>
        plates.push({ x, y, nx, ny, ch: ">", scale: sc, owner: jawLimb, order: nFins + k, spikes: 1, seed: (seed + 900 + k) >>> 0, style });
      if (mech) { if (V.horns !== "none") horn(-26, -58, 0.2, -0.98, 12, 0, "needle"); }
      else if (V.horns === "brow") horn(-30, -55, 0.45, -0.9, 9, 0);
      else if (V.horns === "nose") horn(-45, -49, -0.25, -0.97, 7, 0);
      else if (V.horns === "crown") [[-36, -55], [-28, -58], [-20, -56]].forEach(([x, y], k) => horn(x, y, 0.1 + k * 0.2, -0.98, 6, k));
      else if (V.horns === "swept") horn(-22, -54, 0.88, -0.48, 14, 0);
      const tipOwner = tip >= 0 ? tip : tail;
      const end = tailPts[tailPts.length - 1];
      if (V.tail === "club") {
        lobes.push({ x: end[0] + 3, y: end[1] + 2, r: 7, owner: tipOwner, mat: mech ? "metal" : tailMat, sq: 2, sever: tipOwner >= 0 });
        [[0.2, -1], [1, -0.2], [0.7, 0.7]].forEach(([nx, ny], k) => plates.push({ x: end[0] + 3 + nx * 5, y: end[1] + 2 + ny * 5, nx, ny, ch: ">", scale: 6, owner: tipOwner, order: k, spikes: 1, seed: (seed + 800 + k) >>> 0, style: "blade" }));
      } else if (V.tail === "spade") {
        plates.push({ x: end[0] + 2, y: end[1], nx: 0.7, ny: -0.7, ch: ">", scale: 10, owner: tipOwner, order: 0, spikes: 1, seed: (seed + 801) >>> 0, style: "blade" });
        plates.push({ x: end[0] + 3, y: end[1] + 3, nx: 0.95, ny: 0.3, ch: ">", scale: 8, owner: tipOwner, order: 0, spikes: 1, seed: (seed + 802) >>> 0, style: "blade" });
      } else if (V.tail === "blade") {
        for (let k = 0; k < 3; k++) { const q = tailPts[tailPts.length - 8 + k * 2]; plates.push({ x: q[0], y: q[1] - q[2] + 1, nx: 0.3, ny: -0.95, ch: ">", scale: 11 - k * 2, owner: tipOwner, order: k, spikes: 1, seed: (seed + 810 + k) >>> 0, style: "blade" }); }
      }
      kaiju = {
        kind: body === "mecha" ? "mecha" : "kaiju", plates, heads, mouth: an.mouth, mouths: an.mouths, tailLen: tx, jawLimb, slots: an.limbs.map((l) => l.slot), hint, veins, mech,
        jaws: [{ hx: -24, hy: -40, len: mech ? 23 : 26, w: mech ? 4 : 5, limb: jawLimb }],
        vents: mech ? [[16, -40], [26, -30], [30, -14], [30, 2]].map(([x2, y2]) => ({ x: x2, y: y2 })) : [],
        feet: [{ x: -15, y: 60 }, { x: 13, y: 59 }],
        form, fins: V.fins, mat: mech ? "metal" : "obsidian", glowVeins: false, hover: false,
      };
      if (hint === "tree" && !growths.includes("moss")) growths.push("moss");
      const wi = growths.indexOf("wings"); if (wi >= 0) growths.splice(wi, 1);
      break;
    }
    case "dragon": {
      // hydra archetype (ref boss-2): golden upright trunk, thick thighs, long tail, 2-3 heads on S-necks, one big ribbed wing
      const an = kaijuAnatomy(kit);
      const own = (slot: string) => an.limbs.findIndex((l) => l.slot === slot);
      limbs.forEach((l, i) => { const a = an.limbs[i]; if (a) { l.x = a.x; l.y = a.y; l.hitR = a.r; l.r = a.r; l.angle = Math.atan2(a.y, a.x || 0.001); } });
      heart.x = an.heart.x; heart.y = an.heart.y; heart.hitR = an.heart.r; heart.r = 10;
      const gd: Material = "gold";
      lobes.push({ x: 8, y: -2, r: 18, ry: 24, owner: -1, mat: gd }, { x: 2, y: 4, r: 11, ry: 17, owner: -1, mat: gd }, { x: 12, y: 18, r: 17, owner: -1, mat: gd });
      const leg = own("leg");
      // naga form (variety.ts): the trunk rises from coils on the ground (the leg slot is the front coil) instead of legs
      const naga = form === "naga";
      if (naga) {
        for (const [cx2, cy2, rx, ry2, rr, n2, own2] of [[8, 46, 30, 9, 9, 16, leg], [6, 34, 20, 7, 8, 12, -1]] as number[][])
          for (let k = 0; k < n2; k++) {
            const a = (k / n2) * Math.PI * 2;
            const front = Math.sin(a) > 0.2;
            lobes.push({ x: cx2 + Math.cos(a) * rx, y: cy2 + Math.sin(a) * ry2, r: rr * (front ? 1 : 0.85), owner: front ? own2 : -1, mat: k % 3 ? gd : "belly" });
          }
        lobes.push({ x: 2, y: 24, r: 13, owner: -1, mat: gd });
      } else {
        lobes.push({ x: 4, y: 28, r: 14, owner: leg, mat: gd }, { x: 1, y: 44, r: 8, ry: 10, owner: leg, mat: gd }, { x: -3, y: 55, r: 11, ry: 4, owner: leg, mat: gd });
        lobes.push({ x: 20, y: 30, r: 11, owner: -1, mat: gd }, { x: 18, y: 45, r: 7, ry: 9, owner: -1, mat: gd }, { x: 16, y: 55, r: 9, ry: 4, owner: -1, mat: gd });
      }
      // tail sweeping right along the ground, tip lifting into a spade
      const tail = own("tail"), tip = own("tail-tip");
      const tx = an.tailLen;
      const P = [[22, 26], [50, 54], [tx - 30, 52], [tx, 34]];
      for (let k = 0; k <= 16; k++) {
        const t = k / 16, u = 1 - t;
        const x = u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0];
        const y = u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1];
        const owner = t >= 0.72 && tip >= 0 ? tip : t >= 0.42 ? tail : -1;
        lobes.push({ x, y, r: Math.max(2.5, 11 - t * 8.5), owner, mat: gd, sever: owner >= 0 });
      }
      if (V.tail === "club") lobes.push({ x: tx + 3, y: 31, r: 6.5, owner: tip >= 0 ? tip : tail, mat: gd, sq: 2, sever: true });
      else lobes.push({ x: tx + 3, y: 30, r: 4, ry: 3, owner: tip >= 0 ? tip : tail, mat: gd, sever: true });
      const dragonTipPlates: PlateLayout[] = V.tail === "blade" || V.tail === "spade"
        ? [{ x: tx + 2, y: 27, nx: 0.6, ny: -0.8, ch: ">", scale: V.tail === "blade" ? 12 : 9, owner: tip >= 0 ? tip : tail, order: 0, spikes: 1, seed: (seed + 77) >>> 0, style: "blade" }]
        : [];
      // necks + heads: one per mouth, each head ending at its anchor
      const headSlots = ["head-0", "head-1", "head-2"];
      const neckI = own("neck");
      const heads: { x: number; y: number }[] = [];
      const jaws: JawLayout[] = [];
      const plates: PlateLayout[] = [];
      an.mouths.forEach((m, hi) => {
        const slotI = own(headSlots[hi]);
        const hx = m.x + 12, hy = m.y + 1;
        const sx = -4, sy = -16;
        const c1 = [sx - 6, sy - 18 - hi * 6], c2 = [hx + 14, hy + 10];
        for (let k = 0; k <= 9; k++) {
          const t = k / 9, u = 1 - t;
          const x = u * u * u * sx + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * hx;
          const y = u * u * u * sy + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * hy;
          // the lower half of the first neck is the "neck" limb (charred when it breaks; the head is severed with its own limb)
          const o = t > 0.5 ? slotI : hi === 0 ? neckI : -1;
          lobes.push({ x, y, r: 7 - t * 1.5, owner: o, mat: gd, sever: t > 0.5 && slotI >= 0 });
          // small neck spines (the hydra's landmarks are horns and neck spines, not a giant sail)
          if (k % 2 === 1 && k < 9) {
            const t2 = t + 0.01, u2 = 1 - t2;
            const x2 = u2 * u2 * u2 * sx + 3 * u2 * u2 * t2 * c1[0] + 3 * u2 * t2 * t2 * c2[0] + t2 * t2 * t2 * hx;
            const y2 = u2 * u2 * u2 * sy + 3 * u2 * u2 * t2 * c1[1] + 3 * u2 * t2 * t2 * c2[1] + t2 * t2 * t2 * hy;
            const dl = Math.hypot(x2 - x, y2 - y) || 1;
            let nx = (y2 - y) / dl, ny = -(x2 - x) / dl;
            if (ny > 0) { nx = -nx; ny = -ny; }
            plates.push({ x, y: y - 4, nx, ny, ch: "}", scale: 6, owner: slotI, order: hi * 10 + k, spikes: 2, seed: (seed + hi * 97 + k) >>> 0 });
          }
        }
        lobes.push({ x: hx, y: hy, r: 8.5, ry: 6.5, owner: slotI, mat: gd, sever: slotI >= 0 });
        lobes.push({ x: hx - 9, y: hy + 1, r: 5.5, ry: 3.5, owner: slotI, mat: gd, sever: slotI >= 0 });
        // horns (variant): swept back (the original), upright brow horns, a nose horn, a small crown or long swept blades
        const hs = (x: number, y: number, nx: number, ny: number, sc: number, k: number, style?: FinStyle) => plates.push({ x, y, nx, ny, ch: ">", scale: sc, owner: slotI, order: 50 + hi * 4 + k, spikes: 2, seed: (seed + hi * 31 + k) >>> 0, style });
        if (V.horns === "brow") hs(hx + 2, hy - 6, 0.25, -0.97, 9, 0, "blade");
        else if (V.horns === "nose") { hs(hx - 8, hy - 3, -0.2, -0.98, 6, 0, "blade"); hs(hx + 4, hy - 5, 0.7, -0.7, 7, 1); }
        else if (V.horns === "crown") [[-2, -7], [3, -7], [7, -4]].forEach(([dx, dy], k) => hs(hx + dx, hy + dy, 0.2 + k * 0.3, -0.95, 5, k, "blade"));
        else if (V.horns === "swept") hs(hx + 4, hy - 5, 0.9, -0.43, 13, 0, "blade");
        else hs(hx + 4, hy - 5, 0.7, -0.7, 9, 0);
        heads.push({ x: hx - 3, y: hy - 2 });
        eyes.push({ x: hx - 4, y: hy - 2, r: 2, limb: slotI, phase: R() * 10 });
        jaws.push({ hx: hx - 2, hy: hy + 3, len: 11, w: 3, limb: slotI });
      });
      plates.push(...dragonTipPlates);
      mouth = null;
      kaiju = {
        kind: "dragon", plates, heads, mouth: an.mouth, mouths: an.mouths, jaws, tailLen: tx, jawLimb: -1, slots: an.limbs.map((l) => l.slot), hint, mech: false,
        veins: [[6, -16], [12, 4], [8, 20], [40, 44], [70, 48]].map(([x2, y2]) => ({ x: x2, y: y2, r: 5, a: R() * 6 })),
        wing: { x: 12, y: -22, span: V.wing === "feather" ? 70 : 66, limb: own("wing"), style: V.wing }, vents: [], feet: naga ? [{ x: -20, y: 54 }, { x: 34, y: 54 }] : [{ x: -3, y: 58 }, { x: 16, y: 58 }],
        form, fins: V.fins, mat: "gold", glowVeins: false, hover: false, glide: naga,
      };
      break;
    }
    case "abyssal": {
      // abyssal archetype (ref boss-5): low coiled crystalline serpent-dragon; segments pass through every anchor
      const an = kaijuAnatomy(kit);
      const own = (slot: string) => an.limbs.findIndex((l) => l.slot === slot);
      limbs.forEach((l, i) => { const a = an.limbs[i]; if (a) { l.x = a.x; l.y = a.y; l.hitR = a.r; l.r = a.r; l.angle = Math.atan2(a.y, a.x || 0.001); } });
      heart.x = an.heart.x; heart.y = an.heart.y; heart.hitR = an.heart.r; heart.r = 10;
      // wyrm form (variety.ts): the same path as a banded chitin centipede with legs, mandibles and antennae
      const wyrm = form === "wyrm";
      const vd: Material = wyrm ? "chitin" : "void";
      const tx = an.tailLen;
      // the body path: head -> neck -> front coil (down) -> along the ground -> loop up over the heart -> back coil -> tail
      const path: [number, number, number, string][] = [
        [-30, 0, 10, "neck"], [-22, 14, 11, "neck"], [-14, 26, 12, "coil-front"], [-2, 32, 12, "coil-front"], [12, 30, 13, "coil"],
        [26, 22, 13, "coil"], [30, 8, 12, "coil"], [24, -6, 11, "coil"], [12, -14, 10, "coil"], [0, -14, 9, ""], [-8, -6, 8, ""],
        [-4, 6, 9, ""], [8, 12, 10, "coil"], [24, 14, 11, "coil-back"], [40, 14, 11, "coil-back"], [54, 22, 10, "tail"], [66, 30, 9, "tail"],
        [78, 32, 7.5, "tail"], [88, 30, 6, "tail-tip"], [tx - 6, 26, 4.5, "tail-tip"], [tx, 22, 3.5, "tail-tip"],
      ];
      const plates: PlateLayout[] = [];
      path.forEach(([x, y, r0, slot], k) => {
        const r2 = r0 * 1.25;
        const o = slot ? own(slot) : -1;
        const sever = slot === "tail" || slot === "tail-tip";
        lobes.push({ x, y, r: r2, owner: o, mat: wyrm && k % 2 ? "belly" : vd, sq: wyrm ? 2.4 : undefined, sever: sever && o >= 0 });
        // crystal ridge (abyssal) / armor plates (wyrm) on top of each segment, sweeping backward
        if (k % 2 === 0 && k < path.length - 2) plates.push({ x: x + 2, y: y - r2 + 2, nx: 0.45, ny: -0.9, ch: k % 4 ? ">" : "}", scale: Math.round((wyrm ? 4 : 6) + r2 * 0.6), owner: o, order: path.length - k, spikes: 2 + (k % 2), seed: (seed + k * 13) >>> 0, style: wyrm ? "plate" : undefined });
      });
      // big horned head with a crystal crest
      const head = own("head"), crest = own("crest");
      if (wyrm) {
        // a rounder head with blade mandibles, long antennae on the crest slot, short legs under the segments
        lobes.push({ x: -46, y: -12, r: 13, ry: 10, owner: -1, mat: vd, sq: 2.4 }, { x: -56, y: -6, r: 6, ry: 5, owner: -1, mat: "belly" });
        plates.push({ x: -44, y: -21, nx: 0.3, ny: -0.95, ch: "}", scale: 20, owner: crest, order: 90, spikes: 0, seed: (seed + 500) >>> 0, style: "needle" });
        plates.push({ x: -58, y: -1, nx: -0.7, ny: 0.7, ch: ">", scale: 9, owner: head, order: 91, spikes: 1, seed: (seed + 501) >>> 0, style: "blade" });
        eyes.push({ x: -51, y: -15, r: 2, limb: -1, phase: R() * 10 }, { x: -45, y: -16, r: 2, limb: -1, phase: R() * 10 });
        legs.push(...wyrmLegs(path.map(([x, y, r0, sl]) => [x, y, r0 * 1.25, sl] as [number, number, number, string]), R));
      } else {
        lobes.push({ x: -46, y: -12, r: 16, ry: 12, owner: -1, mat: vd }, { x: -60, y: -7, r: 9, ry: 6, owner: -1, mat: vd }, { x: -40, y: -24, r: 8, ry: 5, owner: -1, mat: vd });
        for (const [px2, py2, sc, k] of [[-44, -26, 16, 0], [-33, -30, 22, 1], [-22, -26, 16, 2]] as [number, number, number, number][])
          plates.push({ x: px2, y: py2, nx: 0.6, ny: -0.8, ch: "}", scale: sc, owner: crest, order: 90 + k, spikes: 3, seed: (seed + 500 + k) >>> 0 });
        eyes.push({ x: -49, y: -15, r: 3, limb: -1, phase: R() * 10 });
      }
      // crescent veins all along the segments (glow cyan; red when enraged)
      const veins = path.filter((_, k) => k % 2 === 1).map(([x, y, r2]) => ({ x, y, r: r2 * 0.55, a: R() * 6 }));
      mouth = null;
      kaiju = {
        kind: "abyssal", plates, heads: [{ x: -46, y: -14 }], mouth: an.mouth, mouths: an.mouths, tailLen: tx, jawLimb: head, slots: an.limbs.map((l) => l.slot), hint, veins, mech: false,
        jaws: [{ hx: -42, hy: -6, len: wyrm ? 14 : 21, w: wyrm ? 4 : 5, limb: head }], vents: [], feet: [],
        form, fins: V.fins, mat: vd, glowVeins: false, hover: false,
      };
      break;
    }
    case "blob": {
      lobes.push({ x: hx * 0.5, y: hy * 0.5, r: bodyR, owner: -1, mat });
      const bulges = 2 + Math.floor(R() * 3);
      for (let i = 0; i < bulges; i++) {
        const a = R() * Math.PI * 2;
        lobes.push({ x: Math.cos(a) * bodyR * 0.55, y: Math.sin(a) * bodyR * 0.45 + 3, r: bodyR * (0.45 + R() * 0.25), owner: -1, mat });
      }
      for (const l of limbs) lobes.push({ x: l.x, y: l.y, r: l.r, owner: l.index, mat });
      edgeTentacles("flesh");
      danglers(3 + Math.floor(R() * 3) + (n <= 3 ? 2 : 0), "flesh", 26, 22);
      break;
    }
    case "serpent": {
      // a coiled serpent: tube spiralling inward around the heart, raised head top-right, tail tucked inside
      const a0 = -Math.PI / 2 + 0.25;
      const steps = 52;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const a = a0 + t * Math.PI * 2 * 1.02;
        const rr = 1.04 - 0.3 * t;
        const tube = 11.5 - t * 7.5;
        lobes.push({ x: Math.cos(a) * 37 * rr, y: Math.sin(a) * 32 * rr + 4, r: Math.max(2.5, tube), owner: -1, mat });
      }
      // neck + head rising above the coil
      const headX = Math.cos(a0) * 34 + 6, headY = Math.sin(a0) * 30 - 14;
      lobes.push({ x: Math.cos(a0) * 38, y: Math.sin(a0) * 32 - 2, r: 10, owner: -1, mat });
      lobes.push({ x: headX, y: headY, r: 12, owner: -1, mat });
      lobes.push({ x: headX + 11, y: headY + 2, r: 7.5, owner: -1, mat, ry: 6 });
      mouth = { x: Math.round(headX + 12), y: Math.round(headY + 5), w: 9, angle: 0 };
      eyes.push({ x: Math.round(headX + 2), y: Math.round(headY - 5), r: 4, limb: -1, phase: R() * 10 });
      if (eyeCount > 1) eyes.push({ x: Math.round(headX + 10), y: Math.round(headY - 4), r: 3, limb: -1, phase: R() * 10 });
      for (const l of limbs) lobes.push({ x: l.x, y: l.y + 2, r: Math.min(11, l.r - 2), owner: l.index, mat });
      break;
    }
    case "spider": {
      lobes.push({ x: hx, y: hy - 3, r: bodyR + 1, owner: -1, mat, ry: bodyR - 2 });
      lobes.push({ x: hx, y: hy + bodyR * 0.82, r: bodyR * 0.5, owner: -1, mat });
      for (const l of limbs) lobes.push({ x: l.x, y: l.y, r: Math.max(7, l.r * 0.65), owner: l.index, mat });
      mouth = { x: hx, y: Math.round(hy + bodyR * 0.95), w: 10, angle: Math.PI / 2 };
      // 8 legs from the abdomen sides
      for (let i = 0; i < 8; i++) {
        const side = i % 2 ? 1 : -1, k = i >> 1;
        const dir = (side > 0 ? 0 : Math.PI) + side * (-0.7 + k * 0.45);
        legs.push({ limb: -1, ax: hx + Math.cos(dir) * bodyR * 0.75, ay: hy + Math.sin(dir) * bodyR * 0.55, dir, reach: 30 + k * 4 + R() * 6, lift: 18 - k * 2 + R() * 4, phase: R() * 6, style: "spider" });
      }
      // eye cluster on the "head"
      const cx = hx, cy = Math.round(hy + bodyR * 0.7);
      eyes.push({ x: cx - 4, y: cy - 2, r: 3, limb: -1, phase: R() * 10 }, { x: cx + 4, y: cy - 2, r: 3, limb: -1, phase: R() * 10 });
      break;
    }
    case "hydra": {
      lobes.push({ x: hx, y: hy + 10, r: bodyR * 0.82, owner: -1, mat });
      lobes.push({ x: hx, y: hy + bodyR * 0.85, r: bodyR * 0.62, owner: -1, mat });
      for (const l of limbs) {
        // each limb is a head on a neck, snout pointing outward
        const hr = Math.max(8, l.r * 0.78);
        lobes.push({ x: l.x, y: l.y, r: hr, owner: l.index, mat });
        lobes.push({ x: l.x + Math.cos(l.angle) * hr * 0.95, y: l.y + Math.sin(l.angle) * hr * 0.95 + 1, r: hr * 0.55, owner: l.index, mat });
        tentacles.push({ from: -2, to: l.index, ax: hx + Math.cos(l.angle) * bodyR * 0.3, ay: hy + 10 + Math.sin(l.angle) * bodyR * 0.3, bx: l.x, by: l.y, bulge: 6 + R() * 6, segs: 12, thick: 5, knot: false, phase: R() * 10, style: "neck" });
        eyes.push({ x: Math.round(l.x + Math.cos(l.angle - 1.1) * hr * 0.5), y: Math.round(l.y + Math.sin(l.angle - 1.1) * hr * 0.5 - 1), r: 2 + (hr > 10 ? 1 : 0), limb: l.index, phase: R() * 10 });
      }
      mouth = { x: hx, y: Math.round(hy + bodyR * 0.95), w: 12, angle: Math.PI / 2 };
      break;
    }
    case "golem": {
      lobes.push({ x: hx, y: hy, r: bodyR + 1, owner: -1, mat, sq: 4 });
      lobes.push({ x: hx, y: hy - bodyR * 0.5, r: bodyR * 0.7, owner: -1, mat, sq: 4 });
      for (const l of limbs) lobes.push({ x: l.x, y: l.y, r: l.r, owner: l.index, mat, sq: 3 + R() * 2 });
      // stumpy legs
      for (const s of [-1, 1]) lobes.push({ x: hx + s * 14, y: hy + bodyR + 6, r: 9, owner: -1, mat, sq: 5 });
      mouth = { x: hx, y: Math.round(hy + bodyR * 0.62), w: 16, angle: Math.PI / 2 };
      edgeTentacles("root");
      tentacles.splice(0, tentacles.length, ...tentacles.filter((t) => t.knot));
      break;
    }
    case "swarm": {
      lobes.push({ x: hx, y: hy, r: 17, owner: -1, mat });
      let guard = 0, placed = 0;
      while (placed < 26 && guard++ < 400) {
        const a = R() * Math.PI * 2, dd = 18 + R() * 30;
        const x = Math.cos(a) * dd, y = Math.sin(a) * dd * 0.85;
        const r = 3 + R() * 4;
        if (lobes.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r - 2)) continue;
        lobes.push({ x, y, r, owner: -1, mat });
        placed++;
      }
      for (const l of limbs) {
        lobes.push({ x: l.x, y: l.y, r: Math.max(6, l.r * 0.6), owner: l.index, mat });
        for (let k = 0; k < 3; k++) { const a = R() * Math.PI * 2; lobes.push({ x: l.x + Math.cos(a) * l.r * 0.7, y: l.y + Math.sin(a) * l.r * 0.7, r: 3 + R() * 2.5, owner: l.index, mat }); }
      }
      mouth = mouthKind === "none" ? null : { x: hx, y: hy + 12, w: 10, angle: Math.PI / 2 };
      break;
    }
    case "eye": {
      lobes.push({ x: hx, y: hy, r: bodyR + 3, owner: -1, mat: "sclera" });
      for (const l of limbs) lobes.push({ x: l.x, y: l.y, r: Math.max(7, l.r * 0.72), owner: l.index, mat: "sclera" });
      // eyestalks
      for (const l of limbs) tentacles.push({ from: -2, to: l.index, ax: hx + Math.cos(l.angle) * bodyR * 0.6, ay: hy + Math.sin(l.angle) * bodyR * 0.6, bx: l.x, by: l.y, bulge: 6, segs: 8, thick: 2.5, knot: l.weakPoint, phase: R() * 10, style: "nerve" });
      for (const l of limbs) eyes.push({ x: l.x, y: l.y, r: Math.max(4, Math.round(l.r * 0.5)), limb: l.index, phase: R() * 10 });
      mouth = mouthKind === "none" ? null : { x: hx, y: hy + bodyR + 1, w: 14, angle: Math.PI / 2 };
      danglers(4 + Math.floor(R() * 3), "nerve", 22, 18, bodyR + 1);
      break;
    }
    case "tree": {
      lobes.push({ x: hx, y: hy + 8, r: bodyR * 0.62, owner: -1, mat: "bark", ry: bodyR * 1.25 });
      lobes.push({ x: hx, y: hy + bodyR + 6, r: bodyR * 0.85, owner: -1, mat: "bark", ry: bodyR * 0.3 });
      for (const l of limbs) lobes.push({ x: l.x, y: l.y, r: l.r + 1, owner: l.index, mat: "foliage" });
      for (let k = 0; k < 3; k++) lobes.push({ x: hx + (k - 1) * 15, y: hy - bodyR - 8 + Math.abs(k - 1) * 7, r: 11, owner: -1, mat: "foliage" });
      for (const l of limbs) tentacles.push({ from: -2, to: l.index, ax: hx + Math.cos(l.angle) * 6, ay: hy + Math.sin(l.angle) * 6, bx: l.x, by: l.y, bulge: 4, segs: 10, thick: 3, knot: l.weakPoint, phase: R() * 10, style: "root" });
      danglers(6, "root", 14, 10, bodyR * 0.9, 14);
      mouth = mouth && { x: hx, y: hy + 22, w: 12, angle: Math.PI / 2 };
      break;
    }
    case "machine": {
      lobes.push({ x: hx, y: hy, r: bodyR + 1, owner: -1, mat, sq: 6 });
      lobes.push({ x: hx, y: hy + bodyR * 0.7, r: bodyR * 0.65, owner: -1, mat, sq: 6 });
      for (const l of limbs) lobes.push({ x: l.x, y: l.y, r: l.r - 1, owner: l.index, mat, sq: 6 });
      for (let i = 0; i < 4; i++) {
        const dir = Math.PI * (0.15 + (i / 3) * 0.7);
        legs.push({ limb: -1, ax: hx + Math.cos(dir) * bodyR * 0.8, ay: hy + Math.sin(dir) * bodyR * 0.6, dir, reach: 30, lift: 6, phase: i * 1.6, style: "piston" });
      }
      edgeTentacles("cable");
      break;
    }
  }

  // ---- extra eyes (design eye count) ----
  const brow = R() < 0.45 ? 1 : 2;
  if (eyes.length === 0) {
    if (brow === 1 || eyeCount === 1) eyes.push({ x: hx + Math.round((R() - 0.5) * 6), y: hy - bodyR + 9, r: eyeCount === 1 ? 6 : 5, limb: -1, phase: R() * 10 });
    else for (const s of [-1, 1]) eyes.push({ x: hx + s * (7 + Math.round(R() * 3)), y: hy - bodyR + 10 + Math.round(R() * 2), r: 3 + Math.round(R()), limb: -1, phase: R() * 10 });
  }
  const want = body === "eye" ? Math.max(eyeCount, limbs.length) : big0(body) ? eyes.length : eyeCount;
  let guard = 0;
  const solid = (x: number, y: number) => lobes.some((o) => Math.hypot(x - o.x, (y - o.y) * (o.ry ? o.r / o.ry : 1)) < o.r - 2 && o.mat !== "foliage");
  while (eyes.length < want && guard++ < 400) {
    const o = lobes[Math.floor(R() * lobes.length)];
    if (!o || o.r < 5 || (body === "serpent" && o.owner === -1 && R() < 0.7)) continue;
    const a = R() * Math.PI * 2, dd = R() * (o.r - 3);
    const x = Math.round(o.x + Math.cos(a) * dd), y = Math.round(o.y + Math.sin(a) * dd * (o.ry ? o.ry / o.r : 1));
    const r = body === "swarm" ? 1.5 : 2 + Math.round(R() * (o.r > 12 ? 1.6 : 0.6));
    if (!solid(x, y)) continue;
    if (Math.hypot(x - hx, y - hy) < 17) continue;
    if (mouth && Math.hypot(x - mouth.x, y - mouth.y) < mouth.w * 0.6 + 3) continue;
    if (eyes.some((e) => Math.hypot(e.x - x, e.y - y) < e.r + r + 2)) continue;
    if (limbs.some((l) => l.appendage === "lens" && Math.hypot(l.x - x, l.y - y) < 10)) continue;
    eyes.push({ x, y, r, limb: o.owner, phase: R() * 10 });
  }

  // ---- growth spots ----
  const spots: GrowthSpot[] = [];
  const topLobes = lobes.filter((o) => o.r >= 7).sort((a, b) => a.y - a.r - (b.y - b.r));
  for (const g of growths) {
    switch (g) {
      case "spikes": for (const o of topLobes.slice(0, 5)) spots.push({ kind: g, x: o.x, y: o.y, angle: Math.atan2(o.y - hy, o.x - hx) * 0.5 - Math.PI / 4, size: o.r, owner: o.owner, phase: R() * 6 }); break;
      case "horns": spots.push({ kind: g, x: hx, y: hy - bodyR + 6, angle: -Math.PI / 2, size: bodyR, owner: -1, phase: 0 }); break;
      case "crystals": for (let k = 0; k < 3; k++) { const o = topLobes[Math.floor(R() * Math.min(6, topLobes.length))]; if (o) spots.push({ kind: g, x: o.x + (R() - 0.5) * o.r, y: o.y - o.r * 0.6, angle: -Math.PI / 2 + (R() - 0.5) * 1.2, size: 5 + R() * 4, owner: o.owner, phase: R() * 6 }); } break;
      case "moss": spots.push({ kind: g, x: 0, y: 0, angle: 0, size: 0, owner: -1, phase: 0 }); break;
      case "servers": for (let k = 0; k < 2; k++) { const o = lobes[Math.floor(R() * lobes.length)]; if (o && o.r > 9) spots.push({ kind: g, x: Math.round(o.x - 5), y: Math.round(o.y - 3), angle: 0, size: 3, owner: o.owner, phase: R() * 6 }); } break;
      case "wings": spots.push({ kind: g, x: hx, y: hy - 8, angle: 0, size: 46 + R() * 10, owner: -1, phase: R() * 6 }); break;
      case "tentacles": danglers(3, "flesh", 30, 16, bodyR - 2, 4); break;
      case "gears": for (let k = 0; k < 2; k++) { const o = lobes[Math.floor(R() * lobes.length)]; if (o) spots.push({ kind: g, x: Math.round(o.x + (R() - 0.5) * o.r), y: Math.round(o.y + (R() - 0.5) * o.r), angle: 0, size: 5 + Math.round(R() * 3), owner: o.owner, phase: R() * 6 }); } break;
      case "pipes": for (let k = 0; k < 2; k++) { const a = -Math.PI * (0.2 + R() * 0.6); spots.push({ kind: g, x: hx + Math.cos(a) * bodyR * 0.8, y: hy + Math.sin(a) * bodyR * 0.8, angle: a, size: 14 + R() * 8, owner: -1, phase: R() * 6 }); } break;
      case "cables": for (let k = 0; k < 3; k++) { const a = Math.PI * (0.1 + R() * 0.8); const b = a + 0.6 + R() * 0.8; tentacles.push({ from: -1, to: -1, ax: Math.cos(a) * bodyR, ay: Math.sin(a) * bodyR * 0.5, bx: Math.cos(b) * bodyR, by: Math.sin(b) * bodyR * 0.5 + 4, bulge: 14 + R() * 10, segs: 12, thick: 1.2, knot: false, phase: R() * 10, style: "cable", color: ["#ff4d4d", "#ffd23f", "#3fd2ff", "#7dff6b"][k % 4] }); } break;
    }
  }

  // ---- per-limb parts (variety.ts: gears on engines, server racks on data, crystals on tests, moss on docs, cables
  //      on I/O), sitting on the limb's anchor and gone when it breaks; the archetype bodies only ----
  // (the 3 biggest components only, so the hide stays readable)
  if (kaiju && !forced) limbs.forEach((l, i) => {
    const part = V.parts[i];
    if (i >= 3 || !part || part === "plain") return;
    const ph = R() * 6;
    if (part === "gears") spots.push({ kind: "gears", x: l.x + 3, y: l.y - 2, angle: 0, size: 4, owner: i, phase: ph });
    else if (part === "servers") spots.push({ kind: "servers", x: l.x - 5, y: l.y - 3, angle: 0, size: 3, owner: i, phase: ph });
    else if (part === "crystals") spots.push({ kind: "crystals", x: l.x, y: l.y - 3, angle: -Math.PI / 2 + (R() - 0.5) * 0.8, size: 5 + R() * 3, owner: i, phase: ph });
    else if (part === "moss") spots.push({ kind: "moss", x: l.x, y: l.y, angle: 0, size: l.r + 6, owner: i, phase: ph });
    else if (part === "cables") tentacles.push({ from: -1, to: -1, ax: l.x - 4, ay: l.y, bx: l.x + 6, by: l.y + 4, bulge: 8 + R() * 6, segs: 10, thick: 1.2, knot: false, phase: R() * 10, style: "cable", color: ["#ff4d4d", "#ffd23f", "#3fd2ff", "#7dff6b"][i % 4] });
  });

  // ---- scars from seed ----
  const scarCount = 1 + (seed >>> 3) % 4;
  const scars: ScarLayout[] = [];
  for (let i = 0; i < scarCount; i++) {
    const o = lobes[Math.floor(R() * lobes.length)];
    if (!o || o.r < 8) continue;
    const x0 = o.x + (R() - 0.5) * o.r, y0 = o.y + (R() - 0.5) * o.r;
    const la = R() * Math.PI, len = 6 + R() * 8;
    scars.push({ x0, y0, x1: x0 + Math.cos(la) * len, y1: y0 + Math.sin(la) * len });
  }

  const big = body === "kaiju" || body === "mecha" || body === "dragon" || body === "abyssal";
  const out: BossLayout = { body, mouthKind: mouth ? mouthKind : "none", growths, bodyR, heart, mouth: mouthKind === "none" ? null : mouth, limbs, lobes, eyes, tentacles, legs, spots, scars, extent: big ? 128 : 100, kaiju };
  layoutCache.set(key, out);
  return out;
}

/** World-space hit regions, identical to sim's `bossRegions` (handy for debug overlays). */
export function bossHitRegions(kit: BossKit, x: number, y: number) {
  const L = bossLayout(kit);
  return L.limbs.map((l) => ({ id: l.id, x: x + l.x, y: y + l.y, r: l.hitR }))
    .concat([{ id: "heart", x: x + L.heart.x, y: y + L.heart.y, r: L.heart.hitR }]);
}
