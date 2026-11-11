import { describe, expect, it } from "vitest";
import { amountParts, DEATH, HITS, IMPACT_AT, myRound, NAMES_AT, raidElapsed, raidPose, raidStage, stepFloor } from "./class-raid.ts";
import { pythonClassroomPlan } from "../../shared/classroom-presets.ts";
import type { ClassroomRound } from "../../shared/classroom.ts";

const T0 = 1_000_000;
const raid = (paused?: { by: string; since: number; resumeAt: number | null }) => ({ phase: "raid" as const, raidEndsAt: T0 + 10_000, paused: paused ?? null });

describe("raid clock", () => {
  it("derives seconds into the raid from raidEndsAt, clamped to the 10 s raid", () => {
    expect(raidElapsed(raid(), T0)).toBe(0);
    expect(raidElapsed(raid(), T0 + 3_250)).toBe(3.25);
    expect(raidElapsed(raid(), T0 + 60_000)).toBe(10);
    expect(raidElapsed(raid(), T0 - 500)).toBe(0);
    expect(raidElapsed({ ...raid(), phase: "feedback" }, T0 + 3_000)).toBeNull();
    expect(raidElapsed({ ...raid(), raidEndsAt: null }, T0 + 3_000)).toBeNull();
  });
  it("freezes at the pause, through the resume countdown, and continues from there once the server shifts raidEndsAt", () => {
    expect(raidElapsed(raid({ by: "t", since: T0 + 4_000, resumeAt: null }), T0 + 9_000)).toBe(4);
    expect(raidElapsed(raid({ by: "t", since: T0 + 4_000, resumeAt: T0 + 12_000 }), T0 + 11_000)).toBe(4);
    // resumed after 8 s paused: the server added 8 s to raidEndsAt
    expect(raidElapsed({ ...raid(), raidEndsAt: T0 + 18_000 }, T0 + 12_500)).toBe(4.5);
  });
});

describe("raid timeline", () => {
  const hit = { bossBefore: 120, bossAfter: 60 };
  it("shows the HP before the attack until the first volley, then steps down volley by volley to the final HP", () => {
    expect(raidStage(hit, 0)).toMatchObject({ hp: 120, landed: 0, impact: false, names: false, dead: false });
    expect(raidStage(hit, HITS[0] - 0.01).hp).toBe(120);
    expect(raidStage(hit, HITS[0]).hp).toBe(110);
    expect(raidStage(hit, HITS[2] + 0.2)).toMatchObject({ hp: 90, landed: 3 });
    expect(raidStage(hit, HITS.at(-1)!)).toMatchObject({ hp: 60, landed: 6 });
    const hps = Array.from({ length: 101 }, (_, i) => raidStage(hit, i / 10).hp);
    for (let i = 1; i < hps.length; i++) expect(hps[i]).toBeLessThanOrEqual(hps[i - 1]);
  });
  it("reveals the impact and the names late in the raid, and everything at once outside it (or with reduced motion)", () => {
    expect(IMPACT_AT).toBeGreaterThan(HITS.at(-1)!);
    expect(NAMES_AT).toBeGreaterThan(IMPACT_AT);
    expect(raidStage(hit, IMPACT_AT - 0.1)).toMatchObject({ impact: false, names: false });
    expect(raidStage(hit, IMPACT_AT)).toMatchObject({ impact: true, names: false });
    expect(raidStage(hit, NAMES_AT)).toMatchObject({ impact: true, names: true });
    expect(raidStage(hit, null)).toMatchObject({ hp: 60, impact: true, names: true });
  });
  it("keeps a doomed boss alive (never 0 HP) until the killing blow near the end, then topples", () => {
    const kill = { bossBefore: 0.3, bossAfter: 0 };
    for (let e = 0; e < HITS.at(-1)!; e += 0.1) expect(raidStage(kill, e)).toMatchObject({ dead: false, kill: true });
    for (let e = 0; e < HITS.at(-1)!; e += 0.1) expect(raidStage(kill, e).hp).toBeGreaterThan(0);
    expect(raidStage(kill, HITS.at(-1)!)).toMatchObject({ hp: 0, dead: true, toppled: false });
    expect(raidStage(kill, HITS.at(-1)! + DEATH).toppled).toBe(true);
    expect(HITS.at(-1)! + DEATH).toBeLessThan(10);
    expect(raidStage({ bossBefore: 0, bossAfter: 0 }, 0)).toMatchObject({ dead: true, toppled: true, kill: false, landed: 0 });
  });
  it("puts a stagger on every volley, the death topple on the killing blow, and nothing at raid second 0", () => {
    for (const at of HITS.slice(0, -1)) expect(raidPose({ bossBefore: 50, bossAfter: 0 }, 180, at + 0.1)).toMatchObject({ name: "stagger" });
    expect(raidPose({ bossBefore: 50, bossAfter: 0 }, 180, 0)).toBeNull();
    expect(raidPose({ bossBefore: 50, bossAfter: 0 }, 180, HITS.at(-1)! + 0.5)).toMatchObject({ name: "death", t: 0.5, total: DEATH });
    expect(raidPose({ bossBefore: 50, bossAfter: 0 }, 180, 9.9)).toMatchObject({ name: "death", t: DEATH });
    expect(raidPose(hit, 180, HITS[3] + 0.2)).toMatchObject({ name: "stagger" });
    expect(raidPose({ bossBefore: 150, bossAfter: 100 }, 180, 7.5)).toMatchObject({ name: "enrage" });   // phase 1 → 2
    expect(raidPose({ bossBefore: 150, bossAfter: 140 }, 180, 7.5)).toMatchObject({ name: "roar" });
    // no damage: no staggers
    for (let e = 0; e < 10; e += 0.1) expect(raidPose({ bossBefore: 80, bossAfter: 80 }, 180, e)?.name ?? "idle").not.toBe("stagger");
  });
});

describe("damage and HP numbers", () => {
  it("prints whole numbers whole, else one decimal, and never 0 for a non-zero value", () => {
    expect(amountParts(12)).toEqual({ value: 12, digits: 0 });
    expect(amountParts(0.4)).toEqual({ value: 0.4, digits: 1 });
    expect(amountParts(12.34)).toEqual({ value: 12.3, digits: 1 });
    expect(amountParts(0.04)).toEqual({ value: 0.1, digits: 1 });
    expect(amountParts(-0.04)).toEqual({ value: -0.1, digits: 1 });
    expect(amountParts(0)).toEqual({ value: 0, digits: 0 });
    expect(amountParts(179.96)).toEqual({ value: 180, digits: 0 });
  });
});

describe("a student's own result", () => {
  const plan = pythonClassroomPlan("01-hello", "en");
  const round = (over: Partial<ClassroomRound>, attacks: ClassroomRound["attacks"]): ClassroomRound =>
    ({ stepId: plan.steps[0].id, attempt: 1, at: 0, bossBefore: 60, bossAfter: 50, attacks, ...over });
  const atk = (damage: number, score = 80) => ({ id: "me", name: "Ada", score, improvement: 0, damage, commit: "c" });
  const s = (r: ClassroomRound[]) => ({ plan, bossMaxHp: 60, rounds: r });
  it("covers no attack yet, did not submit, a hit, and each kind of zero", () => {
    expect(stepFloor({ plan, bossMaxHp: 60 }, { stepId: plan.steps[0].id })).toBe(40);
    expect(stepFloor({ plan, bossMaxHp: 60 }, { stepId: plan.steps.at(-1)!.id })).toBe(0);
    expect(myRound(s([]), "me")).toEqual({ kind: "none" });
    expect(myRound(s([round({}, [{ ...atk(3), id: "other" }])]), "me")).toEqual({ kind: "absent" });
    expect(myRound(s([round({}, [atk(0.4)])]), "me")).toEqual({ kind: "hit", damage: 0.4 });
    expect(myRound(s([round({ bossBefore: 0, bossAfter: 0 }, [atk(0)])]), "me")).toEqual({ kind: "zero", why: "defeated" });
    expect(myRound(s([round({}, [atk(0, 0)])]), "me")).toEqual({ kind: "zero", why: "score0" });
    expect(myRound(s([round({ bossBefore: 40, bossAfter: 40 }, [atk(0)])]), "me")).toEqual({ kind: "zero", why: "capped" });
    expect(myRound(s([round({ attempt: 2, bossBefore: 50, bossAfter: 50 }, [atk(0)])]), "me")).toEqual({ kind: "zero", why: "nogain" });
  });
});
