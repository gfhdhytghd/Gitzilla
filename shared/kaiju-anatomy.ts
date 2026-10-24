// Kaiju anatomy anchors (owned by claude-boss): pure, deterministic, no DOM.
// The kaiju boss stands upright facing LEFT (toward the heroes). Offsets are logical px relative to BossState.x/y.
// The sim builds hit regions from these and the boss renderer draws the art on them, so the two can never drift.
// Limb i maps to anatomy slot i (kit.limbs are sorted by component size: the biggest component = the dorsal plates).
import type { BossKit } from "./types.ts";

export type KaijuSlot = "plates" | "tail" | "jaw" | "arms" | "leg" | "neck-plates" | "leg-back" | "tail-tip";

/** Slot table (index = limb index). r = hit radius, roughly matching the art. */
export const KAIJU_SLOTS: { slot: KaijuSlot; dx: number; dy: number; r: number }[] = [
  { slot: "plates", dx: 21, dy: -20, r: 15 },      // dorsal plates along the back
  { slot: "tail", dx: 62, dy: 50, r: 13 },         // tail (mid, lying on the ground)
  { slot: "jaw", dx: -38, dy: -38, r: 11 },        // head / jaw
  { slot: "arms", dx: -26, dy: -2, r: 11 },        // small arms
  { slot: "leg", dx: -8, dy: 36, r: 13 },          // front leg
  { slot: "neck-plates", dx: -2, dy: -46, r: 12 }, // plates on the neck
  { slot: "leg-back", dx: 16, dy: 38, r: 12 },     // back leg
  { slot: "tail-tip", dx: 100, dy: 44, r: 11 },    // curled tail tip (moved out with the tail length)
];

function h32(n: number) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Horizontal reach of the dragging tail (deep dependency chains -> the sim gives a laser -> longer tail). */
export function kaijuTailLen(kit: BossKit): number {
  const deep = kit.attacks.some((a) => a.kind === "laser");
  return (deep ? 108 : 98) + Math.round(h32(kit.seed >>> 0) * 8);
}

export interface KaijuAnchors {
  chest: { dx: number; dy: number; r: number };  // the glowing heart core = "heart" region
  mouth: { dx: number; dy: number };             // atomic breath (laser) origin
  limbs: { id: string; slot: KaijuSlot; dx: number; dy: number; r: number }[];
}

export function kaijuAnchors(kit: BossKit): KaijuAnchors {
  const tail = kaijuTailLen(kit);
  return {
    chest: { dx: -6, dy: -2, r: 15 },
    mouth: { dx: -48, dy: -39 },
    limbs: kit.limbs.map((l, i) => {
      // more than 8 limbs never happens (analysis caps components at 8); wrap just in case
      const s = KAIJU_SLOTS[i % KAIJU_SLOTS.length];
      const extra = Math.floor(i / KAIJU_SLOTS.length) * 6;
      return { id: l.id, slot: s.slot, dx: (s.slot === "tail-tip" ? tail - 4 : s.dx) + extra, dy: s.dy, r: s.r };
    }),
  };
}
