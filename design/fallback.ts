import type { BossDesign, BossKit, HeroArchetype, PlayerKit, RepoProfile } from '../shared/types.ts';
import { signature, symbolAllocator, type BossCode } from '../sim/code.ts';
import { attackFlavorPicker } from '../sim/flavor.ts';
import { accessories, headgear, mouths } from './schema.ts';
import { artDNA, dnaEmblem } from './code.ts';
import { bossEpithet } from './names.ts';
import { fallbackWeaponName, type HeroDesignWithWeapon } from './weapon.ts';
import { bossArt, chooseBossBody } from './archetypes.ts';

const choose = <T>(values: readonly T[], seed: number, shift = 0): T => values[((seed >>> shift) >>> 0) % values.length];
const short = (value: string, length: number) => value.slice(0, length).trimEnd();
const palettes = {
  rust: ['#ac583c', '#f3a76c', '#ffdeb0', '#77f2cd'],
  python: ['#355b99', '#65b8ed', '#ffdda1', '#ffe36c'],
  javascript: ['#96712d', '#f3d75c', '#ffdeb0', '#82f4d2'],
  typescript: ['#315aa5', '#71b5ff', '#f5deb4', '#a7f3dc'],
  go: ['#267f8c', '#65e0df', '#ffe4ba', '#f8f7d6'],
  java: ['#8e405a', '#f08c73', '#f8d8a4', '#9bd8ff'],
};

export function fallbackHero(profile: RepoProfile, kit: PlayerKit): HeroDesignWithWeapon {
  const seed = profile.seed >>> 0;
  const archetype: HeroArchetype = ({ staff: 'mage', cannon: 'heavy', smg: 'ranger', blaster: 'ranger', shotgun: 'engineer', laser: 'engineer', blade: 'knight' } as const)[kit.weapon];
  const language = profile.primaryLanguage.toLowerCase();
  const palette = palettes[language as keyof typeof palettes] ?? ['#476987', '#99d8d4', '#ffe1b5', '#f7a6d8'];
  const names = { knight: 'Patch Paladin', ranger: 'Branch Ranger', mage: 'Byte Mage', heavy: 'Compile Guardian', engineer: 'Hotfix Engineer', rogue: 'Shadow Fork' };
  const dna = artDNA(profile, kit);
  const identifier = dna.identifiers[0];
  return {
    title: short(`${identifier || profile.slug.split('/').pop()} ${names[archetype]}`, 24), archetype,
    headgear: choose(headgear, seed, 3), accessory: choose(accessories, seed, 8),
    emblem: dnaEmblem(dna.tokens) ?? choose(['{}', '++', '#', '<>', '*', 'R'], seed, 12), palette: [...palette],
    catchphrase: identifier ? short(`${identifier}() saves the party.`, 40) : choose(['Small hero. Clean commits.', 'One more patch saves the party.', 'Tests green. Sword ready.', 'I brought a rollback.'], seed, 16),
    weaponName: fallbackWeaponName(profile, kit),
  };
}

export function fallbackBoss(profile: RepoProfile, kit: BossKit): BossDesign {
  const seed = profile.seed >>> 0;
  const repo = (profile.slug.split('/').pop() || 'repo').toUpperCase();
  const body = chooseBossBody(profile, kit);
  const art = bossArt[kit.archetype];
  const suffix = bossEpithet(profile, kit);
  const dna = artDNA(profile, kit);
  const pickAttack = symbolAllocator({ dna });
  const pickFlavor = attackFlavorPicker(profile.seed);
  const canonicalAttacks = Object.fromEntries(kit.attacks.map(a => {
    const symbol = pickAttack(a.source), flavor = pickFlavor(a.kind);
    return [a.id, symbol ? `${symbol} ${flavor}` : `${flavor} :: ${a.source}`];
  }));
  const limbParts = ['Claw', 'Lens', 'Mandible', 'Tendril', 'Coil', 'Antenna', 'Plating', 'Root'];
  const symbol = dna.identifiers.find(id => id.length <= 24);
  const target = symbol ? `${symbol}()` : 'your stack';
  const taunts = [
    ...(dna.todos.length ? [short(`${art.todo}: ${choose(dna.todos, seed)}`, 64)] : []),
    ...(dna.commits.length ? [short(`${art.commit}: ${choose(dna.commits, seed, 4)}`, 64)] : []),
    ...art.taunts(target).map(line => short(line, 64)),
  ];
  return {
    name: short(`${repo}, ${suffix}`, 64),
    epithet: short(`${art.creature}; ${symbol ? `${symbol}() fuels` : `${profile.components.length} code-limbs guard`} the ${art.core}.`, 120),
    body, eyes: Math.max(1, Math.min(12, profile.contributors || 1)), mouth: choose(mouths, seed, 12),
    growths: body === 'tree' ? ['moss', 'crystals', 'spikes'] : [...art.growths],
    palette: [...art.palette],
    theme: kit.theme,
    intro: [`$ git clone ${profile.slug}`.slice(0, 80), art.intro, `FATAL: ${art.fatal} :: ${profile.heart}`.slice(0, 80), ...dna.heartLines.slice(0, 1)],
    taunts,
    attackNames: canonicalAttacks,
    limbNames: Object.fromEntries(kit.limbs.map((limb, i) => {
      const canonical = (kit.code as Partial<BossCode> | undefined)?.limbNames?.[limb.id];
      if (canonical && [...dna.identifiers, ...Object.values(dna.componentSymbols).flat()].some(s => canonical.startsWith(signature(s)))) return [limb.id, canonical];
      const symbols = dna.limbSymbols[limb.id]?.length ? dna.limbSymbols[limb.id] : dna.componentSymbols[limb.component];
      const label = symbols?.length ? choose(symbols, seed + i) : limb.component.split('/').pop();
      return [limb.id, short(`${label} ${limbParts[((seed >>> 0) + i) % limbParts.length]}`, 32)];
    })),
  };
}
