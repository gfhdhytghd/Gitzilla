// Boss anatomy anchors (owned by claude-boss): pure, deterministic, no DOM.
// Every archetype faces LEFT (toward the heroes). Offsets are logical px relative to BossState.x/y.
// The sim builds hit regions from these and the boss renderer draws the art on them, so the two can never drift.
// Limb i maps to the archetype's slot i (kit.limbs are sorted by component size: the biggest component = slot 0).
import type { BossArchetype, BossKit } from "./types.ts";

export type KaijuSlot = "plates" | "tail" | "jaw" | "arms" | "leg" | "neck-plates" | "leg-back" | "tail-tip";
export type HydraSlot = "wing" | "tail" | "head-0" | "head-1" | "leg" | "head-2" | "neck" | "tail-tip";
export type MechaSlot = "back-armor" | "tail" | "head" | "rocket-fist" | "leg" | "shoulder-cannon" | "leg-back" | "tail-tip";
export type AbyssalSlot = "coil" | "tail" | "head" | "crest" | "coil-front" | "neck" | "coil-back" | "tail-tip";
export type BossSlot = KaijuSlot | HydraSlot | MechaSlot | AbyssalSlot;

interface SlotDef { slot: BossSlot; dx: number; dy: number; r: number; aloft?: boolean }

/** Kaiju slot table (index = limb index). r = hit radius, roughly matching the art. */
export const KAIJU_SLOTS: SlotDef[] = [
  { slot: "plates", dx: 21, dy: -20, r: 15 },      // dorsal fins along the back
  { slot: "tail", dx: 62, dy: 50, r: 13 },         // tail (mid, lying on the ground)
  { slot: "jaw", dx: -38, dy: -38, r: 11 },        // head / jaw
  { slot: "arms", dx: -26, dy: -2, r: 11 },        // small arms
  { slot: "leg", dx: -8, dy: 36, r: 13 },          // front leg
  { slot: "neck-plates", dx: -2, dy: -46, r: 12 }, // fins on the neck
  { slot: "leg-back", dx: 16, dy: 38, r: 12 },     // back leg
  { slot: "tail-tip", dx: 100, dy: 44, r: 11 },    // curled tail tip (moved out with the tail length)
];

/** Hydra (ref boss-2): heads on long necks up-left, a big wing up-right, thick thighs, long tail. aloft = still hittable in flight. */
export const HYDRA_SLOTS: SlotDef[] = [
  { slot: "wing", dx: 34, dy: -42, r: 16, aloft: true },
  { slot: "tail", dx: 62, dy: 40, r: 12 },
  { slot: "head-0", dx: -46, dy: -50, r: 11, aloft: true },
  { slot: "head-1", dx: -36, dy: -76, r: 10, aloft: true },
  { slot: "leg", dx: 0, dy: 34, r: 13 },
  { slot: "head-2", dx: -52, dy: -24, r: 10, aloft: true },
  { slot: "neck", dx: -22, dy: -36, r: 10, aloft: true },
  { slot: "tail-tip", dx: 100, dy: 36, r: 10 },
];

/** Mecha (ref boss-3): the kaiju frame in armor: back armor fins, rocket fist, shoulder cannon, visor head. */
export const MECHA_SLOTS: SlotDef[] = [
  { slot: "back-armor", dx: 22, dy: -20, r: 15 },
  { slot: "tail", dx: 62, dy: 48, r: 13 },
  { slot: "head", dx: -32, dy: -46, r: 11 },
  { slot: "rocket-fist", dx: -32, dy: -2, r: 11 },
  { slot: "leg", dx: -6, dy: 36, r: 13 },
  { slot: "shoulder-cannon", dx: 8, dy: -44, r: 12 },
  { slot: "leg-back", dx: 18, dy: 38, r: 12 },
  { slot: "tail-tip", dx: 100, dy: 44, r: 11 },
];

/** Abyssal (ref boss-5): a low, coiled crystalline serpent-dragon with a big horned head on the left. */
export const ABYSSAL_SLOTS: SlotDef[] = [
  { slot: "coil", dx: 16, dy: 10, r: 16 },
  { slot: "tail", dx: 66, dy: 30, r: 12 },
  { slot: "head", dx: -48, dy: -12, r: 12 },
  { slot: "crest", dx: -30, dy: -32, r: 10 },
  { slot: "coil-front", dx: -14, dy: 26, r: 12 },
  { slot: "neck", dx: -26, dy: 2, r: 11 },
  { slot: "coil-back", dx: 40, dy: 14, r: 12 },
  { slot: "tail-tip", dx: 100, dy: 22, r: 10 },
];

const SLOTS: Record<BossArchetype, SlotDef[]> = { kaiju: KAIJU_SLOTS, hydra: HYDRA_SLOTS, mecha: MECHA_SLOTS, abyssal: ABYSSAL_SLOTS };

function h32(n: number) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Horizontal reach of the tail (deep dependency chains -> the sim gives a laser -> longer tail). */
export function kaijuTailLen(kit: BossKit): number {
  const deep = kit.attacks.some((a) => a.kind === "laser");
  return (deep ? 108 : 98) + Math.round(h32(kit.seed >>> 0) * 8);
}

export interface BossAnchors {
  archetype: BossArchetype;
  chest: { dx: number; dy: number; r: number };  // the glowing heart core = "heart" region
  mouth: { dx: number; dy: number };             // primary breath/beam origin
  mouths: { dx: number; dy: number }[];          // hydra: one per head (pose.head / attack head index); others: [mouth]
  limbs: { id: string; slot: BossSlot; dx: number; dy: number; r: number; aloft: boolean }[];
}
/** Back-compat name used by the first kaiju version. */
export type KaijuAnchors = BossAnchors;

const CHEST: Record<BossArchetype, { dx: number; dy: number; r: number }> = {
  kaiju: { dx: -6, dy: -2, r: 15 }, hydra: { dx: 4, dy: 0, r: 15 }, mecha: { dx: -6, dy: -4, r: 15 }, abyssal: { dx: 4, dy: -2, r: 15 },
};
const MOUTHS: Record<BossArchetype, { dx: number; dy: number }[]> = {
  kaiju: [{ dx: -48, dy: -39 }],
  hydra: [{ dx: -58, dy: -48 }, { dx: -48, dy: -74 }, { dx: -64, dy: -22 }],
  mecha: [{ dx: -46, dy: -47 }],  // visor eye laser
  abyssal: [{ dx: -62, dy: -8 }],
};

export function bossArchetype(kit: BossKit): BossArchetype {
  const a = (kit as { archetype?: BossArchetype }).archetype;
  return a && a in SLOTS ? a : "kaiju";
}

/** Per-archetype anchors for a kit. Sim: region = { id, x: boss.x + l.dx, y: boss.y + l.dy, r }; heart from chest. */
export function bossAnchors(kit: BossKit): BossAnchors {
  const arch = bossArchetype(kit);
  const table = SLOTS[arch];
  const tail = kaijuTailLen(kit);
  const mouths = MOUTHS[arch];
  return {
    archetype: arch,
    chest: { ...CHEST[arch] },
    mouth: { ...mouths[0] },
    mouths: mouths.map((m) => ({ ...m })),
    limbs: kit.limbs.map((l, i) => {
      // more than 8 limbs never happens (analysis caps components at 8); wrap just in case
      const s = table[i % table.length];
      const extra = Math.floor(i / table.length) * 6;
      const dx = s.slot === "tail-tip" ? tail - 4 + (arch === "abyssal" ? 2 : 0) : s.dx;
      return { id: l.id, slot: s.slot, dx: dx + extra, dy: s.dy, r: s.r, aloft: !!s.aloft };
    }),
  };
}

/** Alias kept for existing callers (sim/regions.ts, renderer): now archetype-aware. */
export function kaijuAnchors(kit: BossKit): BossAnchors {
  return bossAnchors(kit);
}
