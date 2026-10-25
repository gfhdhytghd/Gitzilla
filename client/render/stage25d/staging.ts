// Boss staging math for the 3D stage (claude-boss; pure, no DOM/three): how flat 2D points near the standing boss lift onto its billboard plane.
// Conventions: 3D X = world x, 3D Y = height above the floor (world px), 3D Z = world y (south = toward the camera).
import type { BossState } from "../../../shared/types.ts";
import { bossLayout } from "../boss/layout.ts";

/** The boss is a standing billboard: its 2D sprite becomes a vertical plane at its feet line. */
export interface BossPlane { bx: number; feetY: number; x0: number; x1: number; top: number; foot: number }

/** Feet offset below BossState.y for the boss body (where the billboard touches the floor). */
export function bossFootOffset(b: BossState): number {
  const L = bossLayout(b.kit);
  const K = L.kaiju;
  if (K?.feet.length) return Math.max(...K.feet.map((f) => f.y)) + 2;
  if (K?.kind === "abyssal") return 44;
  return 46;
}

export function bossPlane(b: BossState | null | undefined): BossPlane | null {
  if (!b) return null;
  const foot = bossFootOffset(b);
  // footprint of the drawn body (head at -64..-60, tail to ~+115, top of fins/heads ~-90)
  return { bx: b.x, feetY: b.y + foot, x0: b.x - 72, x1: b.x + 124, top: b.y - 96, foot };
}

const EDGE = 14;      // px blend band at the footprint sides (no visible jumps)
const EDGE_TOP = 40;  // the top edge is ~100 px up the plane: a wider band keeps shots from snapping down

/**
 * 2D point (x, y) at height h -> 3D [X, Y, Z]. Inside the boss footprint, points are lifted onto the boss's standing
 * plane (so hits/sparks on a limb appear on that limb of the billboard); elsewhere they stay above the floor at h.
 * Continuous everywhere: at the feet line the lift is 0, and it blends in over EDGE px at the sides/top.
 */
export function lift(plane: BossPlane | null, x: number, y: number, h: number, out: [number, number, number]): [number, number, number] {
  out[0] = x; out[1] = h; out[2] = y;
  if (!plane || y >= plane.feetY || y <= plane.top - EDGE_TOP || x <= plane.x0 - EDGE || x >= plane.x1 + EDGE) return out;
  const up = plane.feetY - y;
  const w = Math.min(1, (x - (plane.x0 - EDGE)) / EDGE, ((plane.x1 + EDGE) - x) / EDGE, (y - (plane.top - EDGE_TOP)) / EDGE_TOP);
  const height = up + Math.max(0, h - up); // chest-height shots ride up the plane smoothly
  out[1] = h + (height - h) * w;
  out[2] = y + (plane.feetY - y) * w;
  return out;
}
