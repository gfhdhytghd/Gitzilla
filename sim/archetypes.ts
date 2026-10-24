import type { BossArchetype, BossAttackKind, RepoProfile } from '../shared/types.ts';

export const ARCHETYPE_DECKS: Record<BossArchetype, readonly BossAttackKind[]> = {
  kaiju: ['laser', 'slam', 'fan', 'charge', 'ring'],
  hydra: ['laser', 'fan', 'charge', 'spiral'],
  mecha: ['fan', 'charge', 'ring', 'laser', 'summon'],
  abyssal: ['cascade', 'ring', 'slam', 'fan', 'charge'],
};

export interface ArchetypeSelection { archetype: BossArchetype; reason: string }
/** Architecture chooses identity; seed/art direction cannot buy a stronger archetype. */
export function bossArchetypeFromProfile(p: RepoProfile): ArchetypeSelection {
  const fanOut = Math.max(0, ...p.components.map(c => c.fanOut));
  const todos = p.dna ? p.dna.counts.todo + p.dna.counts.fixme + p.dna.counts.hack : 0;
  if (p.cycles.length >= 2) return { archetype: 'hydra', reason: `${p.cycles.length} circular dependency groups → multiple heads and winged flight.` };
  if (fanOut >= 6) return { archetype: 'hydra', reason: `Highest component fan-out ${fanOut} → multiple heads firing along different dependency paths.` };
  if (/^(c|c\+\+|rust|go|zig)$/i.test(p.primaryLanguage) && (p.maxDepth >= 3 || p.totalLoc >= 100_000))
    return { archetype: 'mecha', reason: `${p.primaryLanguage} systems code; dependency depth ${p.maxDepth}, ${p.totalLoc.toLocaleString('en-US')} LOC → armored machine and jet hops.` };
  if (p.totalLoc >= 150_000) return { archetype: 'abyssal', reason: `${p.totalLoc.toLocaleString('en-US')} analyzed LOC → a large coiling abyssal body.` };
  if (p.ageDays >= 6000) return { archetype: 'abyssal', reason: `${p.ageDays.toLocaleString('en-US')} days of history → an ancient burrowing serpent.` };
  if (todos >= 128) return { archetype: 'abyssal', reason: `${todos} TODO/FIXME/HACK notes → a debt-veined abyssal body.` };
  return { archetype: 'kaiju', reason: `${p.components.length} components, ${p.cycles.length} cycles, depth ${p.maxDepth} → grounded kaiju with a chest reactor and dorsal breath.` };
}
