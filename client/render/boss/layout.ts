// Pure boss geometry (no DOM). The sim owns hit regions (BossState.regions, absolute px).
// drawBoss passes them in as `anchors` (offsets from boss center) so limb art sits exactly on
// the hitboxes. Without anchors (portraits, gallery) we fall back to the same formula as
// sim/regions.ts: limb i of n at angle -PI/2 + i*2PI/n + (seed % 7)*0.045, offset (cos*37, sin*32),
// r 13; heart at (0,0) r 19. Everything else (lobes, appendages, eyes, legs, growths) is cosmetic,
// driven by kit.design (Gemini art direction) when present, else by the seed.
import type { BossAttackKind, BossBody, BossGrowth, BossKit, BossMouth } from "../../../shared/types.ts";
import { kaijuAnatomy } from "./anatomy.ts";
import { kaijuAnchors } from "../../../shared/kaiju-anatomy.ts";

export type Appendage = "spines" | "coil" | "claw" | "lens" | "fist" | "horns" | "hive" | "antenna" | "nub";
export type Material = "flesh" | "scales" | "chitin" | "stone" | "metal" | "bark" | "foliage" | "sclera" | "obsidian" | "belly";
/** "kaiju" (the primary, Godzilla-inspired archetype) is renderer-only; the others come from BossDesign.body. */
export type BodyKind = BossBody | "kaiju";

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
/** Optional extra hints (gallery/dev): forceBody overrides the archetype pick. */
export interface BossVisualHints { forceBody?: BodyKind }
export interface PlateLayout { x: number; y: number; nx: number; ny: number; ch: string; scale: number; owner: number; order: number /* 0 = tail end */ }
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
  kaiju?: { plates: PlateLayout[]; heads: { x: number; y: number }[]; mouth: { x: number; y: number }; tailLen: number; jawLimb: number; slots: string[] };
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

/** anchors: regions relative to the boss center (id = limb id or "heart"). */
export function bossLayout(kit: BossKit, anchors?: Anchor[]): BossLayout {
  const akey = anchors ? anchors.map((a) => a.id + ":" + Math.round(a.x) + "," + Math.round(a.y) + "," + Math.round(a.r)).join(";") : "";
  const d = kit.design;
  const dkey = (d ? d.body + d.mouth + d.eyes + d.growths.join("") : "") + ((kit as BossKit & BossVisualHints).forceBody ?? "");
  const key = kit.repo + "|" + kit.seed + "|" + kit.limbs.length + "|" + akey + "|" + dkey;
  const hit = layoutCache.get(key);
  if (hit) return hit;
  if (layoutCache.size > 200) layoutCache.clear();
  const R = prng(kit.seed ^ 0x9e3779b9);
  const seed = kit.seed >>> 0;
  // The kaiju is the primary boss; the older archetypes only show up as rare variants (~15% by seed) or when forced.
  const variant: BossBody = d?.body && BODIES.includes(d.body) ? d.body : BODIES[(seed >>> 5) % BODIES.length];
  const forced = (kit as BossKit & BossVisualHints).forceBody;
  const body: BodyKind = forced ?? (((seed >>> 7) % 100) < 15 ? variant : "kaiju");
  const mouthKind: BossMouth = d?.mouth ?? MOUTHS[(seed >>> 9) % MOUTHS.length];
  const growths: BossGrowth[] = (d?.growths?.length ? d.growths : [GROWTHS[(seed >>> 11) % GROWTHS.length], GROWTHS[(seed >>> 15) % GROWTHS.length]]).filter((g, i, a) => a.indexOf(g) === i).slice(0, 3);
  const eyeCount = Math.max(1, Math.min(12, d?.eyes ?? 3 + (seed % 6)));
  const mat: Material = body === "kaiju" ? "obsidian" : MATERIAL[body];
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
    case "kaiju": {
      const an = kaijuAnatomy(kit);
      const slotIdx = (slot: string) => an.limbs.findIndex((l) => l.slot === slot);
      const own = (slot: string) => slotIdx(slot);
      // limb visuals sit exactly on the shared anatomy anchors
      limbs.forEach((l, i) => {
        const a = an.limbs[i];
        if (!a) return;
        l.x = a.x; l.y = a.y; l.hitR = a.r; l.r = a.r; l.angle = Math.atan2(a.y, a.x || 0.001);
      });
      heart.x = an.heart.x; heart.y = an.heart.y; heart.hitR = an.heart.r; heart.r = 10;
      const ob: Material = "obsidian";
      // torso, belly, hips, neck, head, snout
      lobes.push({ x: 3, y: -4, r: 22, ry: 30, owner: -1, mat: ob });
      lobes.push({ x: 9, y: 18, r: 18, owner: -1, mat: ob });
      lobes.push({ x: -9, y: 6, r: 13, ry: 22, owner: -1, mat: "belly" });
      lobes.push({ x: -13, y: -30, r: 12, owner: -1, mat: ob });
      lobes.push({ x: -27, y: -46, r: 16, ry: 12, owner: -1, mat: ob });
      lobes.push({ x: -42, y: -43, r: 10, ry: 6.5, owner: -1, mat: ob });
      lobes.push({ x: -22, y: -55, r: 8, ry: 5, owner: -1, mat: ob }); // brow ridge
      // arms: upper arm stays, the forearm is severed when the arms limb breaks
      const arm = own("arms");
      lobes.push({ x: -20, y: -9, r: 6, owner: -1, mat: ob });
      lobes.push({ x: -28, y: -2, r: 5, ry: 4, owner: arm, mat: ob, sever: true });
      // legs (charred, not severed, when broken)
      const leg = own("leg"), legB = own("leg-back");
      lobes.push({ x: -7, y: 28, r: 14, owner: leg, mat: ob }, { x: -11, y: 44, r: 8, ry: 10, owner: leg, mat: ob }, { x: -16, y: 55, r: 12, ry: 4, owner: leg, mat: ob });
      lobes.push({ x: 17, y: 26, r: 13, owner: legB, mat: ob }, { x: 15, y: 42, r: 8, ry: 10, owner: legB, mat: ob }, { x: 11, y: 54, r: 11, ry: 4, owner: legB, mat: ob });
      // tail: a tapering bezier of lobes; the tip (and, if the tail limb breaks, the outer half) is severed
      const tail = own("tail"), tip = own("tail-tip");
      const tx = an.tailLen;
      const P = [[16, 22], [46, 48], [tx - 30, 50], [tx, 30]];
      const N = 14;
      for (let k = 0; k <= N; k++) {
        const t = k / N, u = 1 - t;
        const x = u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0];
        const y = u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1];
        const owner = t >= 0.72 && tip >= 0 ? tip : t >= 0.45 ? tail : -1;
        lobes.push({ x, y, r: Math.max(2.5, 13 - t * 10.5), owner, mat: ob, sever: owner >= 0 });
      }
      // extra heads for very cyclic repos (the dependency knot grew more heads)
      const heads = [{ x: -30, y: -48 }];
      if (an.heads >= 2) { lobes.push({ x: 0, y: -50, r: 8, owner: -1, mat: ob }, { x: -6, y: -62, r: 9, ry: 7, owner: -1, mat: ob }, { x: -16, y: -61, r: 6, ry: 4.5, owner: -1, mat: ob }); heads.push({ x: -9, y: -64 }); }
      if (an.heads >= 3) { lobes.push({ x: 12, y: -48, r: 7, owner: -1, mat: ob }, { x: 14, y: -60, r: 8, ry: 6, owner: -1, mat: ob }, { x: 5, y: -60, r: 5, ry: 4, owner: -1, mat: ob }); heads.push({ x: 11, y: -62 }); }
      for (const h of heads) eyes.push({ x: h.x - 1, y: h.y - 1, r: h === heads[0] ? 3 : 2, limb: -1, phase: R() * 10 });
      // dorsal plates along the spine, shaped like brackets taken from the repo's tokens
      const toks = (kit.code?.tokens ?? []).join("");
      const shapes = [...new Set([...toks].map((c) => ("{}".includes(c) ? "}" : "<>".includes(c) ? ">" : "[]".includes(c) ? "]" : "()".includes(c) ? ")" : "")).filter(Boolean))];
      const chars = shapes.length ? shapes : ["}", ">"];
      // spine = the actual back edge of the silhouette (head -> shoulders -> back -> hips -> top of the tail)
      const spine = [[-16, -57], [-4, -45], [9, -37], [17, -27], [23, -13], [25, 1], [27, 15], [33, 22], [46, 30], [60, 36], [76, 39], [tx - 12, 30]];
      const segLen: number[] = [];
      let total = 0;
      for (let k = 1; k < spine.length; k++) { const d2 = Math.hypot(spine[k][0] - spine[k - 1][0], spine[k][1] - spine[k - 1][1]); segLen.push(d2); total += d2; }
      const nPlates = 7 + ((kit.code?.tokens?.length ?? (seed >>> 3)) % 4);
      const plates: NonNullable<BossLayout["kaiju"]>["plates"] = [];
      const platesLimb = own("plates"), neckLimb = own("neck-plates");
      for (let k = 0; k < nPlates; k++) {
        const t = (k + 0.5) / nPlates * 0.9;
        let dist = t * total, j = 0;
        while (j < segLen.length - 1 && dist > segLen[j]) { dist -= segLen[j]; j++; }
        const f = Math.min(1, dist / segLen[j]);
        const x = spine[j][0] + (spine[j + 1][0] - spine[j][0]) * f, y = spine[j][1] + (spine[j + 1][1] - spine[j][1]) * f;
        const dx = spine[j + 1][0] - spine[j][0], dy = spine[j + 1][1] - spine[j][1], dl = Math.hypot(dx, dy) || 1;
        // outward normal (up/right of the spine when walking head -> tail)
        let nx = dy / dl, ny = -dx / dl;
        if (nx < 0 && ny > 0) { nx = -nx; ny = -ny; }
        const scale = t < 0.1 ? 3 : t < 0.22 ? 4 : t < 0.5 ? 5 : t < 0.68 ? 4 : t < 0.82 ? 3 : 2;
        const owner = t < 0.22 ? neckLimb : t < 0.6 ? platesLimb : -1;
        plates.push({ x, y, nx, ny, ch: chars[k % chars.length], scale, owner, order: nPlates - 1 - k });
      }
      mouth = null;
      kaiju = { plates, heads, mouth: an.mouth, tailLen: tx, jawLimb: own("jaw"), slots: an.limbs.map((l) => l.slot) };
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
  const want = body === "eye" ? Math.max(eyeCount, limbs.length) : body === "kaiju" ? eyes.length : eyeCount;
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

  const out: BossLayout = { body, mouthKind: mouth ? mouthKind : "none", growths, bodyR, heart, mouth: mouthKind === "none" ? null : mouth, limbs, lobes, eyes, tentacles, legs, spots, scars, extent: body === "kaiju" ? 124 : 100, kaiju };
  layoutCache.set(key, out);
  return out;
}

/** World-space hit regions, identical to sim's `bossRegions` (handy for debug overlays). */
export function bossHitRegions(kit: BossKit, x: number, y: number) {
  const L = bossLayout(kit);
  return L.limbs.map((l) => ({ id: l.id, x: x + l.x, y: y + l.y, r: l.hitR }))
    .concat([{ id: "heart", x: x + L.heart.x, y: y + L.heart.y, r: L.heart.hitR }]);
}
