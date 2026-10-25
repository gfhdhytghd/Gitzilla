// XR HUD panel model (claude-boss; pure, no DOM/three): what the floating headset panel shows, with the same math
// as the 2D HUD's boss bar (client/app/hud.ts): pct = max(0, hp / maxHp), text ceil(pct * 100)%, phase label, limb
// fills. `key` changes exactly when the drawn panel would change, so the panel redraws on content, not on a clock.
import type { MatchState } from "../../../shared/types.ts";

/** HP bar inner width in panel px (the bar spans x 6..250) */
export const HUD_BAR_W = 244;
export const HUD_PIP_GAP = 4;

export interface HudInfo {
  boss: {
    name: string;
    /** hp / maxHp, clamped to 0..1 */
    pct: number;
    /** "73%" (ceil, like the 2D bar) */
    pctText: string;
    /** filled bar width in panel px */
    barPx: number;
    phase: 1 | 2 | 3;
    phaseText: string;
    enraged: boolean;
    /** limb pips in kit order: fill fraction, filled px of the pip, broken, weak point */
    limbs: { f: number; px: number; broken: boolean; weak: boolean }[];
    /** width of one limb pip in panel px */
    pipW: number;
  } | null;
  alive: string;
  timer: string;
  key: string;
}

export function hudInfo(state: MatchState): HudInfo {
  const b = state.boss;
  let boss: HudInfo["boss"] = null;
  if (b) {
    const n = Math.max(1, b.kit.limbs.length), pipW = Math.floor((HUD_BAR_W - HUD_PIP_GAP * (n - 1)) / n);
    const pct = Math.min(1, Math.max(0, b.maxHp > 0 ? b.hp / b.maxHp : 0));
    boss = {
      name: b.kit.name.split(",")[0].toUpperCase().slice(0, 28),
      pct,
      pctText: `${Math.ceil(pct * 100)}%`,
      barPx: Math.round(HUD_BAR_W * pct),
      phase: b.phase,
      phaseText: b.phase === 3 ? "PHASE 3 · LAST STAND" : b.enraged || b.phase === 2 ? "PHASE 2 · ENRAGED" : "PHASE 1",
      enraged: b.enraged || b.phase >= 2,
      // kit order (the 2D limb row's order); state limbs are matched by id
      limbs: b.kit.limbs.map((l) => {
        const st = b.limbs.find((x) => x.id === l.id);
        const f = st ? Math.min(1, Math.max(0, st.maxHp > 0 ? st.hp / st.maxHp : 0)) : 1;
        return { f, px: st?.broken ? 0 : Math.round(f * pipW), broken: !!st?.broken, weak: !!l.weakPoint };
      }),
      pipW,
    };
  }
  const players = state.players ?? [];
  const alive = state.pvp?.royale ? `${state.pvp.royale.alive.length}/${players.length} ALIVE` : `${players.filter((p) => p.alive).length} HEROES UP`;
  const tt = Math.max(0, Math.floor(state.t ?? 0));
  const timer = `T+${Math.floor(tt / 60)}:${String(tt % 60).padStart(2, "0")}`;
  const key = boss
    ? `${boss.name}|${boss.barPx}|${boss.pctText}|${boss.phaseText}|${boss.limbs.map((l) => (l.broken ? "x" : l.px)).join(",")}|${alive}|${timer}`
    : `-|${alive}|${timer}`;
  return { boss, alive, timer, key };
}
