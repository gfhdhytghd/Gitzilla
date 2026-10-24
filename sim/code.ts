import type { BossKit, PlayerKit, RepoProfile } from '../shared/types.ts';
import { ATTACK_FLAVOR_POOLS, attackFlavorPicker } from './flavor.ts';

export type BossCode = NonNullable<BossKit['code']> & {
  bigFiles: { path: string; loc: number }[];
  attackSymbols: Record<string, string>;
  limbNames: Record<string, string>;
  archetypeReason?: string;
};
export const signature = (symbol: string) => symbol ? `${symbol.replace(/\(.*$/, '').slice(0, 40)}()` : '';

/** Preserve each attack's assigned real identifier through later display-design overrides. */
export function reconcileCodeNames(kit: BossKit, hints?: Pick<BossCode, 'attackSymbols' | 'limbNames'>): BossKit {
  const copy = structuredClone(kit), code = hints ?? copy.code as Partial<BossCode> | undefined;
  const pickFlavor = attackFlavorPicker(copy.seed), used = new Map<string, Set<string>>();
  copy.attacks.forEach(a => {
    const symbol = code?.attackSymbols?.[a.id];
    const pooled = pickFlavor(a.kind), rawSuffix = a.name.replace(/^.+?\(\)\s*/, '').trim();
    const previousTag = ATTACK_FLAVOR_POOLS[a.kind].find(phrase => rawSuffix.endsWith(` · ${phrase}`));
    const suffix = previousTag ? rawSuffix.slice(0, -previousTag.length - 3) : rawSuffix;
    const seen = used.get(a.kind) ?? new Set<string>(); used.set(a.kind, seen);
    const legacy = ['throw Spray', 'grep Trace', a.kind].includes(suffix);
    const fromPool = ATTACK_FLAVOR_POOLS[a.kind].includes(suffix) || legacy || !suffix;
    let flavor = fromPool ? pooled : suffix;
    if (!fromPool && seen.has(suffix)) flavor = `${suffix} · ${pooled}`;
    seen.add(suffix);
    if (symbol) {
      if (symbol.length + flavor.length + 1 > 64) flavor = pooled;
      a.name = `${symbol} ${flavor}`;
      if (copy.design) copy.design.attackNames[a.id] = a.name;
    }
  });
  if (copy.design && code?.limbNames) {
    const available = Object.values(code.limbNames).map(n => n.split(' ').at(-1)!);
    const used = new Set<string>();
    for (const limb of copy.limbs) {
      const current = copy.design.limbNames[limb.id] ?? code.limbNames[limb.id];
      if (!current) continue;
      let suffix = current.split(' ').at(-1)!;
      if (used.has(suffix)) {
        const canonical = code.limbNames[limb.id] ?? current;
        suffix = available.find(part => !used.has(part)) ?? `${suffix}${used.size + 1}`;
        const label = canonical.slice(0, canonical.lastIndexOf(' '));
        copy.design.limbNames[limb.id] = `${label.slice(0, 31 - suffix.length)} ${suffix}`;
      }
      used.add(suffix);
    }
  }
  return copy;
}

export function symbolAllocator(p: { dna?: Pick<NonNullable<RepoProfile['dna']>, 'identifiers' | 'componentSymbols'> }, reserved: string[] = []) {
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
