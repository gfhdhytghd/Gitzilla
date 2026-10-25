import { describe, expect, it } from "vitest";
import { DEPTH_MAX, voxelBox, voxelInstancedBox } from "./voxel.ts";

describe("voxel sprite boxes", () => {
  it("span the sprite rect with the feet at the origin and carry the slot/shape attributes", () => {
    const s = { x: 328, y: 100, w: 96, h: 100, ax: 48, ay: 88 };
    const g = voxelBox(s, 2, 0);
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect([b.min.x, b.max.x]).toEqual([-48, 48]);
    expect([b.min.y, b.max.y]).toEqual([88 - 100, 88]);
    expect([b.min.z, b.max.z]).toEqual([-2, 0]); // flat front face at z = 0 (the exact pixel art)
    expect(Array.from(g.getAttribute("aSlot").array.slice(0, 4))).toEqual([328, 100, 96, 100]);
    expect(Array.from(g.getAttribute("aShape").array.slice(0, 4))).toEqual([48, 88, 2, 0]);
  });

  it("boss boxes reserve room for per-texel depth offsets in front and behind", () => {
    const g = voxelBox({ x: 0, y: 0, w: 320, h: 208, ax: 112, ay: 200 }, 5, 1);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.z).toBe(DEPTH_MAX);
    expect(g.boundingBox!.min.z).toBe(-5 - DEPTH_MAX);
  });

  it("instanced boxes take the atlas cell per instance", () => {
    const { geometry, slots } = voxelInstancedBox(40, 24, 2, 64);
    expect(slots.count).toBe(64);
    expect(geometry.getAttribute("aSlot")).toBe(slots);
    expect(geometry.getAttribute("aShape").array[0]).toBe(20);
  });
});
