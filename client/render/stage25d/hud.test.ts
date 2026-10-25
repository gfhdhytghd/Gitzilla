import { describe, expect, it } from "vitest";
import type { BossState, MatchState } from "../../../shared/types.ts";
import { bossKitFromProfile, createMatch, playerKitFromProfile } from "../../../sim/index.ts";
import { syntheticProfile } from "../../../sim/bots.ts";
import { HUD_BAR_W, hudInfo } from "./hud.ts";

// the 2D HUD's boss bar (client/app/hud.ts), verbatim math
const twoD = (b: BossState) => {
  const pct = Math.max(0, b.hp / b.maxHp);
  return {
    width: (pct * 100).toFixed(2) + "%",
    text: `${Math.ceil(pct * 100)}%`,
    phase: b.phase === 3 ? " PHASE 3 · LAST STAND" : b.enraged || b.phase === 2 ? " PHASE 2 · ENRAGED" : " PHASE 1",
    limbs: b.kit.limbs.map((l) => { const st = b.limbs.find((x) => x.id === l.id)!; return { broken: st.broken, f: st.hp / st.maxHp }; }),
  };
};

function raid(): MatchState {
  const roster = [0, 1, 2].map((i) => ({ id: "p" + i, name: "dev" + i, kit: playerKitFromProfile(syntheticProfile(10 + i)) }));
  return createMatch(roster, bossKitFromProfile(syntheticProfile(7), 3)).snapshot() as MatchState;
}

function at(s: MatchState, frac: number, mut: (b: BossState) => void = () => {}): MatchState {
  const b: BossState = { ...s.boss!, hp: s.boss!.maxHp * frac, limbs: s.boss!.limbs.map((l) => ({ ...l })) };
  mut(b);
  return { ...s, boss: b };
}

describe("XR HUD panel (hudInfo) matches the 2D boss bar", () => {
  const s0 = raid();

  it("at several HP levels, after a limb break and across phase changes", () => {
    const cases: MatchState[] = [
      at(s0, 1),
      at(s0, 0.732),
      at(s0, 0.6, (b) => { b.limbs[0].hp = 0; b.limbs[0].broken = true; }),                        // limb break
      at(s0, 0.505, (b) => { b.limbs[0].hp = 0; b.limbs[0].broken = true; b.limbs[1].hp = b.limbs[1].maxHp * 0.3; b.phase = 2; b.enraged = true; }),
      at(s0, 0.149, (b) => { b.phase = 3; b.enraged = true; }),                                      // last stand
      at(s0, 0.004, (b) => { b.phase = 3; b.enraged = true; }),
      at(s0, -0.02, (b) => { b.phase = 3; b.enraged = true; }),                                      // overkill
    ];
    const keys = new Set<string>();
    for (const s of cases) {
      const h = hudInfo(s).boss!, d = twoD(s.boss!);
      expect((h.pct * 100).toFixed(2) + "%").toBe(d.width);
      expect(h.pctText).toBe(d.text);
      expect(" " + h.phaseText).toBe(d.phase);
      expect(h.barPx).toBe(Math.round(HUD_BAR_W * Math.max(0, s.boss!.hp / s.boss!.maxHp)));
      expect(h.limbs.map((l) => l.broken)).toEqual(d.limbs.map((l) => l.broken));
      h.limbs.forEach((l, i) => expect(l.f).toBeCloseTo(d.limbs[i].f, 6));
      keys.add(hudInfo(s).key);
    }
    expect(keys.size).toBe(cases.length); // every visible change redraws the panel
    expect(hudInfo(cases[2]).boss!.limbs[0]).toMatchObject({ broken: true, px: 0 });
    expect(hudInfo(cases[3]).boss!.limbs[1].px).toBe(Math.round(0.3 * hudInfo(cases[3]).boss!.pipW));
    expect(hudInfo(cases[6]).boss!).toMatchObject({ pct: 0, barPx: 0, pctText: "0%" });
  });

  it("reads boss.hp / boss.maxHp (not a limb, not kit.maxHp) and never overflows the bar", () => {
    const s = at(s0, 0.5, (b) => { b.maxHp = b.kit.maxHp * 2; b.hp = b.kit.maxHp; b.limbs[0].hp = 1; });
    expect(hudInfo(s).boss!.pctText).toBe("50%");
    expect(hudInfo(at(s0, 1.3)).boss!.barPx).toBe(HUD_BAR_W);
  });

  it("the key depends on what the panel shows, not on the caller's clock", () => {
    const a = at(s0, 0.8);
    expect(hudInfo({ ...a, t: 61.2 }).key).toBe(hudInfo({ ...a, t: 61.9 }).key);
    expect(hudInfo({ ...a, t: 61.9 }).key).not.toBe(hudInfo({ ...a, t: 62.0 }).key);
    expect(hudInfo({ ...a, t: 61 }).timer).toBe("T+1:01");
    expect(hudInfo(at(s0, 0.8)).key).not.toBe(hudInfo(at(s0, 0.79)).key);
  });

  it("royale (no boss) shows the alive count", () => {
    const h = hudInfo({ ...s0, boss: null });
    expect(h.boss).toBeNull();
    expect(h.alive).toBe("3 HEROES UP");
  });
});
