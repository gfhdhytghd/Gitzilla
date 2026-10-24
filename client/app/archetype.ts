// Boss archetypes (BossKit.archetype) in plain words for the UI: label, a one-line "what it does", and "why this repo
// became it" from the real kit facts the client has (the sim picks the archetype from repo traits).
import type { BossArchetype, BossKit, BossState } from "../../shared/types";

export const ARCH: Record<BossArchetype, { label: string; icon: string; blurb: string; death: string }> = {
  kaiju: { label: "KAIJU", icon: "🦖", blurb: "stomps toward you, tail sweeps, </> breath down its glowing fins", death: "toppled — segfault" },
  hydra: { label: "HYDRA", icon: "🐉", blurb: "many heads, many beams; flies in arcs, dive-bombs, lands to rest", death: "its heads dropped one by one" },
  mecha: { label: "MECHA", icon: "🤖", blurb: "armored machine: rocket fists, eye lasers, missile barrages, jet hops", death: "exploded into code" },
  abyssal: { label: "ABYSSAL", icon: "🐍", blurb: "crystal serpent: coils, burrows under the floor, erupts elsewhere", death: "shattered into crystal" },
};

const SYSTEMS = /^(c|c\+\+|rust|go|zig)$/i;

/** "why this repo became this archetype", using facts present in the kit (falls back to the rule itself). */
export function archetypeWhy(kit: BossKit, language?: string): string {
  const knots = kit.limbs.filter((l) => l.weakPoint).length;
  const todos = kit.code?.todos?.length ?? 0;
  switch (kit.archetype) {
    case "hydra":
      return knots >= 2 ? `${knots} components in import cycles → ${Math.min(3, Math.max(2, knots))} heads` : "everything imports everything (high fan-out) → many heads";
    case "mecha":
      return language && SYSTEMS.test(language) ? `${language} with deep import chains → armored machine` : "systems code with deep import chains → armored machine";
    case "abyssal":
      return todos >= 8 ? `${todos}+ TODO/FIXME notes of debt → something old lives down there` : "a huge / very old codebase → something ancient lives down there";
    default:
      return "a classic monolith → the classic kaiju";
  }
}

/** Short status line for unusual boss states (sim decides; we only explain what players can do). */
export function bossStateHint(b: BossState): { text: string; kind: "air" | "under" } | null {
  if (b.airborne && (b.pose?.name === "burrow" || b.kit.archetype === "abyssal")) return { text: "⇣ burrowed — can't be hit · watch for the emerge point", kind: "under" };
  if (b.airborne) return { text: "✈ airborne — only heads & wings can be hit", kind: "air" };
  return null;
}
