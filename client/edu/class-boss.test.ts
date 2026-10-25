import { describe, expect, it } from "vitest";
import { classBossKit, classBossState } from "./class-boss.ts";

const frame = { bx: 64, by: 80 };
const idle = { name: "idle" as const, t: 0, total: 1, dir: [-1, 0] as [number, number] };

describe("classroom boss (real kaiju kit, HP-driven look)", () => {
  it("derives the same kit from the same lesson boss name, and keeps the teacher's name", () => {
    const a = classBossKit("The Release Blocker"), b = classBossKit("the release blocker ");
    expect(a.seed).toBe(b.seed);
    expect(a.name).toBe("The Release Blocker");
    expect(["kaiju", "hydra", "mecha", "abyssal"]).toContain(a.archetype);
    expect(classBossKit("Merge Conflict").seed).not.toBe(a.seed);
  });

  it("maps class HP to phase, enrage and broken limbs", () => {
    const kit = classBossKit("The Release Blocker");
    const at = (hp: number) => classBossState(kit, { hp, maxHp: 100 }, frame, idle);
    expect(at(100)).toMatchObject({ phase: 1, enraged: false });
    expect(at(100).limbs.every((l) => !l.broken)).toBe(true);
    expect(at(60)).toMatchObject({ phase: 2 });
    expect(at(40).enraged).toBe(true);
    expect(at(20).phase).toBe(3);
    const broken = (hp: number) => at(hp).limbs.filter((l) => l.broken).length;
    for (let hp = 100; hp > 0; hp -= 5) expect(broken(hp - 5)).toBeGreaterThanOrEqual(broken(hp));
    expect(broken(1)).toBe(kit.limbs.length - 1); // the last limb stays until the kill
    expect(broken(0)).toBe(kit.limbs.length);
    expect(at(30).regions).toEqual([]);
    expect(at(30)).toMatchObject({ x: 64, y: 80, airborne: false, casting: null });
  });
});
