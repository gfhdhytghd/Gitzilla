// Renderer view of the kaiju anatomy. The anchors themselves live in shared/kaiju-anatomy.ts (also used by the sim).
import type { BossKit } from "../../../shared/types.ts";
import { bossAnchors, kaijuTailLen, type BossSlot } from "../../../shared/kaiju-anatomy.ts";

export type KaijuSlot = BossSlot;

export interface KaijuAnatomy {
  limbs: { id: string; slot: KaijuSlot; x: number; y: number; r: number }[];
  heart: { x: number; y: number; r: number };
  mouth: { x: number; y: number };
  mouths: { x: number; y: number }[];
  tailLen: number;
  heads: number;            // 1, or 2–3 for very cyclic repos
}

export function kaijuAnatomy(kit: BossKit): KaijuAnatomy {
  const a = bossAnchors(kit);
  const cyclic = kit.limbs.filter((l) => l.weakPoint).length;
  return {
    limbs: a.limbs.map((l) => ({ id: l.id, slot: l.slot, x: l.dx, y: l.dy, r: l.r })),
    heart: { x: a.chest.dx, y: a.chest.dy, r: a.chest.r },
    mouth: { x: a.mouth.dx, y: a.mouth.dy },
    mouths: a.mouths.map((m) => ({ x: m.dx, y: m.dy })),
    tailLen: kaijuTailLen(kit),
    heads: cyclic >= 4 ? 3 : cyclic >= 3 ? 2 : 1,
  };
}
