// Alternate boss body plans (claude-boss; pure geometry, no DOM), drawn on the archetype's anchors so the sim's hit
// regions, heart and mouths stay exactly where they were (shared/kaiju-anatomy.ts). Each part that a limb owns sits on
// that limb's anchor; severable parts vanish when it breaks, the rest are charred (sprite.ts).
//   golem      stone (kaiju) or iron (mecha "ironclad") brute: block torso, huge fist, pillar legs, a chained boulder for a tail
//   insectoid  upright mantis-wasp (kaiju): scythe arm, banded abdomen along the ground with a stinger, thin legs, antennae
//   eye        floating eye (kaiju, small repos): the heart is the iris; eye-pods, an eyestalk, dangling tentacles
import { KAIJU_SLOTS, MECHA_SLOTS, type BossSlot } from "../../../shared/kaiju-anatomy.ts";
import type { KaijuAnatomy } from "./anatomy.ts";
import type { EyeLayout, JawLayout, LegLayout, Lobe, Material, PlateLayout, TentacleLayout } from "./layout.ts";
import type { FinStyle } from "./variety.ts";

export interface FormParts {
  lobes: Lobe[];
  plates: PlateLayout[];
  jaws: JawLayout[];
  heads: { x: number; y: number }[];
  eyes: EyeLayout[];
  legs: LegLayout[];
  tentacles: TentacleLayout[];
  veins: { x: number; y: number; r: number; a: number }[];
  feet: { x: number; y: number }[];
  vents: { x: number; y: number }[];
  /** cracks / veins glow in the element's color even when calm */
  glowVeins: boolean;
  /** floats (no stomps, a slow hover bob) */
  hover: boolean;
  mat: Material;
}

type Pt = { x: number; y: number; i: number };

/** anchor of a slot (its limb index, or -1 when the repo has fewer limbs: the part is then cosmetic) */
function slotAt(an: KaijuAnatomy, table: { slot: BossSlot; dx: number; dy: number }[], slot: BossSlot): Pt {
  const i = an.limbs.findIndex((l) => l.slot === slot);
  if (i >= 0) return { x: an.limbs[i].x, y: an.limbs[i].y, i };
  if (slot === "tail-tip") return { x: an.tailLen - 4, y: 44, i: -1 };
  const s = table.find((t) => t.slot === slot)!;
  return { x: s.dx, y: s.dy, i: -1 };
}

const bez = (t: number, a: number, b: number, c: number, d: number) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };

/** a chain of lobes along a cubic bezier (tails, tentacles, thin legs) */
function chain(out: Lobe[], P: number[][], n: number, r0: number, r1: number, part: (t: number, k: number) => Partial<Lobe>) {
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    out.push({ x: bez(t, P[0][0], P[1][0], P[2][0], P[3][0]), y: bez(t, P[0][1], P[1][1], P[2][1], P[3][1]), r: r0 + (r1 - r0) * t, owner: -1, mat: "obsidian", ...part(t, k) });
  }
}
/** a straight jointed limb: hip -> knee -> foot as small lobes */
function stick(out: Lobe[], pts: number[][], r: number, owner: number, mat: Material) {
  for (let s = 0; s + 1 < pts.length; s++) {
    const [ax, ay] = pts[s], [bx, by] = pts[s + 1];
    const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 2.5));
    for (let k = 0; k <= n; k++) out.push({ x: ax + ((bx - ax) * k) / n, y: ay + ((by - ay) * k) / n, r: r * (s === pts.length - 2 ? 0.85 : 1), owner, mat });
  }
}
/** fins along a polyline (the back) */
function finsAlong(plates: PlateLayout[], spine: number[][], count: number, h0: number, h1: number, owner: (k: number) => number, seed: number, style?: FinStyle, order0 = 0) {
  const seg: number[] = [];
  let total = 0;
  for (let k = 1; k < spine.length; k++) { const d = Math.hypot(spine[k][0] - spine[k - 1][0], spine[k][1] - spine[k - 1][1]); seg.push(d); total += d; }
  for (let k = 0; k < count; k++) {
    let dist = ((k + 0.5) / count) * total, j = 0;
    while (j < seg.length - 1 && dist > seg[j]) { dist -= seg[j]; j++; }
    const f = Math.min(1, dist / seg[j]);
    const x = spine[j][0] + (spine[j + 1][0] - spine[j][0]) * f, y = spine[j][1] + (spine[j + 1][1] - spine[j][1]) * f;
    const dx = spine[j + 1][0] - spine[j][0], dy = spine[j + 1][1] - spine[j][1], dl = Math.hypot(dx, dy) || 1;
    let nx = dy / dl, ny = -dx / dl;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const h = Math.round(h0 + (h1 - h0) * Math.sin(Math.PI * Math.min(1, (k + 0.7) / count)));
    plates.push({ x, y, nx, ny, ch: k % 2 ? ">" : "}", scale: h, owner: owner(k), order: order0 + count - 1 - k, spikes: 2 + ((seed >>> k) & 1), seed: (seed + k * 7919) >>> 0, style });
  }
}

const empty = (mat: Material): FormParts => ({ lobes: [], plates: [], jaws: [], heads: [], eyes: [], legs: [], tentacles: [], veins: [], feet: [], vents: [], glowVeins: false, hover: false, mat });

/** Stone golem (kaiju slots) or iron golem (mecha slots). */
export function golemForm(an: KaijuAnatomy, iron: boolean, R: () => number, seed: number): FormParts {
  const T = iron ? MECHA_SLOTS : KAIJU_SLOTS;
  const at = (s: BossSlot) => slotAt(an, T, s);
  const head = at(iron ? "head" : "jaw"), arm = at(iron ? "rocket-fist" : "arms"), leg = at("leg"), legB = at("leg-back");
  const back = at(iron ? "back-armor" : "plates"), crest = at(iron ? "shoulder-cannon" : "neck-plates"), tail = at("tail"), tip = at("tail-tip");
  const ob: Material = iron ? "metal" : "stone";
  const sq = iron ? 4 : 3;
  const F = empty(ob);
  const L = F.lobes;
  // block torso, chest, heavy hips, a belly plate
  L.push({ x: 6, y: -8, r: 22, ry: 27, owner: -1, mat: ob, sq: 2.6 }, { x: -6, y: -12, r: 14, ry: 15, owner: -1, mat: ob, sq: 2.4 });
  L.push({ x: 10, y: 16, r: 19, ry: 13, owner: -1, mat: ob, sq }, { x: -8, y: 2, r: 9, ry: 12, owner: -1, mat: "belly", sq: 2.4 });
  // boulder shoulders (the back one belongs to the back slot: charred when it breaks)
  L.push({ x: -16, y: -28, r: 12, owner: -1, mat: ob, sq: 2.2 }, { x: 18, y: -30, r: 13, owner: back.i, mat: ob, sq: 2.2 });
  // small head sunk between the shoulders, heavy brow
  const hx = head.x + 8, hy = head.y - 2;
  L.push({ x: hx, y: hy, r: 10, ry: 9, owner: head.i, mat: ob, sq: 3 }, { x: hx - 2, y: hy - 7, r: 9, ry: 4, owner: head.i, mat: ob, sq: 3 });
  // the huge fist on the arm anchor (severed when the arm breaks), a smaller back arm
  L.push({ x: -22, y: -16, r: 7, owner: -1, mat: ob, sq });
  L.push({ x: arm.x + 3, y: arm.y - 6, r: 7, ry: 8, owner: arm.i, mat: ob, sq, sever: true }, { x: arm.x - 3, y: arm.y + 6, r: 10, ry: 9, owner: arm.i, mat: ob, sq: 3, sever: true });
  L.push({ x: 28, y: -12, r: 6, owner: -1, mat: ob, sq }, { x: 32, y: 2, r: 8, ry: 9, owner: -1, mat: ob, sq: 3 });
  // pillar legs
  for (const [p, dx] of [[leg, -4], [legB, 2]] as [Pt, number][]) {
    L.push({ x: p.x + 2, y: p.y - 8, r: 11, ry: 12, owner: p.i, mat: ob, sq }, { x: p.x, y: p.y + 10, r: 10, ry: 10, owner: p.i, mat: ob, sq: 3.5 }, { x: p.x + dx, y: 58, r: 12, ry: 4, owner: p.i, mat: ob, sq: 4 });
    F.feet.push({ x: p.x + dx - 2, y: 59 });
  }
  // the tail: an iron chain from the hip to a wrecking boulder (the chain's shackle is the tail slot)
  const tx = tip.x + 4;
  chain(L, [[28, 26], [40, 54], [tx - 34, 60], [tx - 8, 50]], 15, 2.8, 2.8, (t) => {
    const o = t >= 0.72 && tip.i >= 0 ? tip.i : t >= 0.42 ? tail.i : -1;
    return { owner: o, mat: "metal", sq: 2, sever: o >= 0 };
  });
  L.push({ x: tail.x, y: tail.y, r: 6, owner: tail.i, mat: "metal", sq: 3, sever: tail.i >= 0 });
  L.push({ x: tx - 2, y: 45, r: 10, ry: 9, owner: tip.i >= 0 ? tip.i : tail.i, mat: ob, sq: 2.2, sever: true });
  // crystal (stone) or armor (iron) clusters along the back
  finsAlong(F.plates, [[-20, -40], [-6, -42], [8, -40], [20, -40], [30, -30], [34, -14], [34, 2]], 7, 10, iron ? 16 : 20, (k) => (k < 2 ? crest.i : back.i), seed);
  F.jaws.push({ hx: hx - 4, hy: hy + 4, len: 14, w: 5, limb: head.i });
  F.heads.push({ x: hx - 2, y: hy - 2 });
  F.eyes.push({ x: hx - 5, y: hy - 3, r: 2, limb: -1, phase: R() * 10 });
  // glowing cracks (stone) / seams (iron)
  for (const [x, y] of [[0, -22], [8, -6], [-4, 6], [14, 12], [20, -24], [-12, -26], [4, 26]]) F.veins.push({ x, y, r: 4 + R() * 2, a: R() * 6 });
  if (iron) F.vents.push({ x: 24, y: -36 }, { x: 32, y: -24 }, { x: 34, y: -10 });
  F.glowVeins = !iron;
  return F;
}

/** Upright mantis-wasp (kaiju slots). */
export function insectoidForm(an: KaijuAnatomy, R: () => number, seed: number): FormParts {
  const at = (s: BossSlot) => slotAt(an, KAIJU_SLOTS, s);
  const head = at("jaw"), arm = at("arms"), leg = at("leg"), legB = at("leg-back"), back = at("plates"), crest = at("neck-plates"), tail = at("tail"), tip = at("tail-tip");
  const F = empty("chitin");
  const L = F.lobes;
  // thorax standing up, a thin neck, the head up front
  L.push({ x: 0, y: -12, r: 13, ry: 18, owner: -1, mat: "chitin" }, { x: 6, y: 6, r: 14, ry: 11, owner: -1, mat: "chitin" }, { x: -15, y: -29, r: 6, ry: 5, owner: -1, mat: "chitin" });
  const hx = head.x + 8, hy = head.y - 2;
  L.push({ x: hx, y: hy, r: 9, ry: 8, owner: head.i, mat: "chitin" }, { x: hx - 7, y: hy + 3, r: 5, ry: 6, owner: head.i, mat: "belly" });
  // wing cases on the back (the back slot: charred, not severed)
  L.push({ x: back.x - 1, y: back.y + 4, r: 14, ry: 8, owner: back.i, mat: "chitin" }, { x: back.x + 9, y: back.y + 16, r: 12, ry: 7, owner: back.i, mat: "chitin" });
  // banded abdomen lying along the ground to the stinger (tail / tail-tip slots, severed when broken)
  const tx = tip.x + 4;
  chain(L, [[14, 14], [34, 42], [tail.x - 6, tail.y + 2], [tx - 6, 44]], 12, 14, 5, (t, k) => {
    const o = t >= 0.72 && tip.i >= 0 ? tip.i : t >= 0.42 ? tail.i : -1;
    return { ry: (14 + (5 - 14) * t) * 0.82, owner: o, mat: (k >> 1) % 2 ? "belly" : "chitin", sever: o >= 0 };
  });
  F.plates.push({ x: tx - 4, y: 41, nx: 0.8, ny: -0.6, ch: ">", scale: 10, owner: tip.i >= 0 ? tip.i : tail.i, order: 0, spikes: 1, seed: seed + 3, style: "blade" });
  // the raptorial scythe on the arm anchor
  L.push({ x: -16, y: -16, r: 4, owner: -1, mat: "chitin" }, { x: -21, y: -11, r: 4, owner: -1, mat: "chitin" });
  L.push({ x: arm.x + 2, y: arm.y - 4, r: 5, ry: 6, owner: arm.i, mat: "chitin", sever: true });
  F.plates.push({ x: arm.x - 2, y: arm.y + 2, nx: -0.55, ny: 0.83, ch: ">", scale: 12, owner: arm.i, order: 30, spikes: 1, seed: seed + 5, style: "blade" });
  // thin jointed legs: front and back on their anchors, a cosmetic middle pair
  stick(L, [[-2, 4], [leg.x, leg.y - 6], [leg.x - 8, 58]], 2.6, leg.i, "chitin");
  stick(L, [[10, 10], [legB.x + 2, legB.y - 6], [legB.x + 8, 58]], 2.6, legB.i, "chitin");
  stick(L, [[4, 8], [4, 30], [0, 58]], 2.2, -1, "chitin");
  F.feet.push({ x: leg.x - 8, y: 58 }, { x: legB.x + 8, y: 58 });
  // antennae (the crest slot) and a short spine ridge
  F.plates.push({ x: hx + 4, y: hy - 7, nx: 0.35, ny: -0.94, ch: "}", scale: 18, owner: crest.i, order: 40, spikes: 0, seed: seed + 7, style: "needle" });
  finsAlong(F.plates, [[-12, -34], [0, -30], [10, -22], [16, -8]], 4, 6, 9, () => crest.i, seed, "needle", 10);
  // mandibles
  F.jaws.push({ hx: hx - 4, hy: hy + 4, len: 10, w: 3, limb: head.i }, { hx: hx - 3, hy: hy + 6, len: 8, w: 3, limb: head.i });
  F.heads.push({ x: hx - 2, y: hy - 2 });
  F.eyes.push({ x: hx - 3, y: hy - 3, r: 3, limb: -1, phase: R() * 10 });
  for (const [x, y] of [[0, -16], [6, 4], [30, 30], [50, 44], [-2, -30]]) F.veins.push({ x, y, r: 3 + R() * 2, a: R() * 6 });
  return F;
}

/** Floating eye (kaiju slots; repos with 3 or fewer limbs): the heart is the iris. */
export function eyeForm(an: KaijuAnatomy, R: () => number, seed: number): FormParts {
  const at = (s: BossSlot) => slotAt(an, KAIJU_SLOTS, s);
  const head = at("jaw"), back = at("plates"), tail = at("tail");
  const F = empty("obsidian");
  const L = F.lobes;
  const cx = an.heart.x, cy = an.heart.y - 4;
  // the eyeball, heavy lids, a fleshy hump behind
  L.push({ x: cx, y: cy, r: 24, owner: -1, mat: "sclera" });
  L.push({ x: cx + 4, y: cy - 20, r: 20, ry: 8, owner: -1, mat: "obsidian" }, { x: cx + 4, y: cy + 20, r: 17, ry: 6, owner: -1, mat: "obsidian" }, { x: cx + 20, y: cy - 4, r: 13, owner: -1, mat: "obsidian" });
  // eye-pods on the back slot
  for (const [dx, dy, r] of [[0, -4, 6], [7, 5, 5], [-4, 7, 4.5]]) {
    L.push({ x: back.x + dx, y: back.y + dy, r, owner: back.i, mat: "sclera", sever: back.i >= 0 });
    F.eyes.push({ x: back.x + dx, y: back.y + dy, r: Math.max(2, r - 3), limb: back.i, phase: R() * 10 });
  }
  // an eyestalk out to the jaw slot, ending in a smaller eye with a beak (the breath origin)
  chain(L, [[cx - 14, cy - 12], [cx - 24, cy - 28], [head.x + 12, head.y + 6], [head.x + 4, head.y + 2]], 6, 3.5, 3, () => ({ owner: head.i, mat: "obsidian", sever: head.i >= 0 }));
  L.push({ x: head.x, y: head.y, r: 7, owner: head.i, mat: "sclera", sever: head.i >= 0 });
  F.eyes.push({ x: head.x - 1, y: head.y - 1, r: 3, limb: head.i, phase: R() * 10 });
  F.jaws.push({ hx: head.x - 3, hy: head.y + 4, len: 8, w: 3, limb: head.i });
  F.heads.push({ x: head.x, y: head.y });
  // a long tentacle down to the tail slot (pod on the anchor), and dangling cosmetic tentacles
  chain(L, [[cx + 10, cy + 18], [cx + 24, cy + 44], [tail.x - 18, tail.y + 8], [tail.x - 4, tail.y]], 10, 4, 3, (t) => ({ owner: t > 0.5 ? tail.i : -1, mat: "obsidian", sever: t > 0.5 && tail.i >= 0 }));
  L.push({ x: tail.x, y: tail.y, r: 6, owner: tail.i, mat: "sclera", sever: tail.i >= 0 });
  F.eyes.push({ x: tail.x, y: tail.y - 1, r: 2, limb: tail.i, phase: R() * 10 });
  for (const [ax, bx] of [[-14, -20], [-2, -4], [10, 14]] as [number, number][]) {
    const sway = (R() - 0.5) * 10;
    chain(L, [[cx + ax, cy + 20], [cx + ax + sway, cy + 34], [cx + bx - sway, 46], [cx + bx, 56]], 9, 3, 1.4, () => ({ mat: "obsidian" }));
    F.feet.push({ x: cx + bx, y: 57 });
  }
  // any further limb (more than the 3 a small repo has): an eye-pod on a stalk at its anchor
  an.limbs.forEach((l, i) => {
    if (i === head.i || i === back.i || i === tail.i) return;
    const a = Math.atan2(l.y - cy, l.x - cx), ex = cx + Math.cos(a) * 20, ey = cy + Math.sin(a) * 20;
    chain(L, [[ex, ey], [ex + (l.x - ex) * 0.4, ey + (l.y - ey) * 0.3], [l.x - (l.x - ex) * 0.2, l.y - 4], [l.x, l.y]], 6, 3, 2.5, () => ({ owner: i, mat: "obsidian", sever: true }));
    L.push({ x: l.x, y: l.y, r: 5.5, owner: i, mat: "sclera", sever: true });
    F.eyes.push({ x: l.x, y: l.y - 1, r: 2, limb: i, phase: R() * 10 });
  });
  // a crystal crown on the upper lid
  finsAlong(F.plates, [[cx - 14, cy - 24], [cx - 2, cy - 30], [cx + 12, cy - 28], [cx + 24, cy - 18]], 5, 8, 13, () => -1, seed);
  for (const [x, y] of [[cx - 12, cy - 8], [cx + 10, cy + 8], [cx - 6, cy + 14], [cx + 14, cy - 10]]) F.veins.push({ x, y, r: 3 + R() * 2, a: R() * 6 });
  F.hover = true;
  return F;
}

/** Centipede wyrm decorations on the abyssal body path: legs under each segment, mandibles, antennae (abyssal slots). */
export function wyrmLegs(path: [number, number, number, string][], R: () => number): LegLayout[] {
  const legs: LegLayout[] = [];
  path.forEach(([x, y, r0], k) => {
    if (k < 2 || k > path.length - 4 || k % 2) return;
    for (const s of [-1, 1]) legs.push({ limb: -1, ax: x + s * 3, ay: y + r0 * 0.9, dir: Math.PI / 2 + s * 0.55, reach: 9 + r0 * 0.3, lift: 4, phase: R() * 6 + k, style: "spider" });
  });
  return legs;
}
