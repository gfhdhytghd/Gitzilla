import type { BossKit, PlayerKit, RepoProfile } from '../shared/types.ts';
import { ATTACK_FLAVOR } from './flavor.ts';

export type BossCode = NonNullable<BossKit['code']> & {
  bigFiles: { path: string; loc: number }[];
  attackSymbols: Record<string, string>;
  limbNames: Record<string, string>;
};
export const signature = (symbol: string) => symbol ? `${symbol.replace(/\(.*$/, '').slice(0, 40)}()` : '';

/** Repair a later display-design override that reused one source identifier everywhere. */
export function reconcileCodeNames(kit: BossKit): BossKit {
  const copy = structuredClone(kit), code = copy.code as Partial<BossCode> | undefined;
  const prefixes = copy.attacks.map(a => a.name.match(/^(.+?\(\))/)?.[1]?.toLowerCase());
  const repeated = new Set(prefixes.filter((s, i) => s && prefixes.indexOf(s) !== i));
  copy.attacks.forEach((a, i) => {
    const symbol = code?.attackSymbols?.[a.id];
    if (symbol && repeated.has(prefixes[i])) {
      a.name = `${symbol} ${ATTACK_FLAVOR[a.kind]}`;
      if (copy.design) copy.design.attackNames[a.id] = a.name;
    }
  });
  if (copy.design && code?.limbNames) {
    const parts = Object.values(copy.design.limbNames).map(n => n.split(' ').at(-1));
    if (new Set(parts).size < parts.length) copy.design.limbNames = { ...copy.design.limbNames, ...code.limbNames };
  }
  return copy;
}

export function symbolAllocator(p: RepoProfile, reserved: string[] = []) {
  const used = new Set(reserved.map(s => s.toLowerCase()));
  return (component: string) => {
    for (const raw of [...(p.dna?.componentSymbols[component] ?? []), ...(p.dna?.identifiers ?? [])]) {
      const label = signature(raw.trim());
      if (!label || used.has(label.toLowerCase())) continue;
      used.add(label.toLowerCase()); return label;
    }
    return ''; // No invented identifiers or repeats when genuine symbols run out.
  };
}

export function heroCode(p: RepoProfile): NonNullable<PlayerKit['code']> {
  const dna = p.dna;
  return {
    tokens: [...(dna?.tokens ?? [])], identifiers: [...(dna?.identifiers ?? [])],
    signature: signature(dna?.identifiers[0] ?? ''), snippet: dna?.snippets[0]?.code ?? dna?.heartLines[0] ?? '',
  };
}

export function bossCode(p: RepoProfile, limbs: BossKit['limbs'], attackSymbols: Record<string, string> = {}): BossCode {
  const dna = p.dna;
  const pick = symbolAllocator(p, Object.values(attackSymbols));
  const allAttackSymbols = { ...attackSymbols };
  const heartComponent = p.components.find(c => p.heart === c.name || p.heart.startsWith(`${c.name}/`))?.name ?? p.components[0]?.name ?? 'heart';
  for (const kind of ['ring', 'spiral', 'laser', 'slam']) {
    const symbol = pick(heartComponent);
    if (symbol) allAttackSymbols[`heart-${kind}`] = symbol;
  }
  const parts = ['Claw', 'Lens', 'Mandible', 'Tendril', 'Coil', 'Antenna', 'Plating', 'Root'];
  const limbNames = Object.fromEntries(limbs.map((limb, i) => {
    const part = parts[((p.seed >>> 0) + i) % parts.length];
    const label = pick(limb.component) || limb.component.split('/').pop() || 'Core';
    return [limb.id, `${label.slice(0, 31 - part.length)} ${part}`];
  }));
  return {
    heartLines: [...(dna?.heartLines ?? [])], snippets: dna?.snippets.map(s => s.code) ?? [],
    todos: dna?.todos.map(t => t.text) ?? [], commits: [...(dna?.commits ?? [])], tokens: [...(dna?.tokens ?? [])],
    limbSymbols: Object.fromEntries(limbs.map(l => [l.id, [...(dna?.componentSymbols[l.component] ?? [])]])),
    attackSymbols: allAttackSymbols, limbNames,
    // Local structural extension until the coordinator adds optional code.bigFiles.
    // Lives only in the room kit; never logs or persists source from private repos.
    bigFiles: dna?.bigFiles.map(f => ({ ...f })) ?? [],
  };
}
