import type { BossAttackKind, BossDesign, BossKit, HeroArchetype, HeroDesign, PlayerKit, RepoProfile } from '../shared/types.ts';
import { accessories, bodies, headgear, mouths } from './schema.ts';

const choose = <T>(values: readonly T[], seed: number, shift = 0): T => values[((seed >>> shift) >>> 0) % values.length];
const short = (value: string, length: number) => value.slice(0, length).trimEnd();
const attackNames: Record<BossAttackKind, readonly string[]> = {
  ring: ['Segfault Halo', 'Exception Orbit'], spiral: ['Stack Overflow', 'Recursive Regret'],
  fan: ['Merge Conflict', 'Force Push'], laser: ['Null Pointer', 'Traceback Beam'],
  slam: ['rm -rf /', 'Core Dump'], charge: ['Race Condition', 'Fast Forward'],
  summon: ['Bug Factory', 'npm install'], cascade: ['Dependency Hell', 'Circular Import'],
};
const palettes = {
  rust: ['#ac583c', '#f3a76c', '#ffdeb0', '#77f2cd'],
  python: ['#355b99', '#65b8ed', '#ffdda1', '#ffe36c'],
  javascript: ['#96712d', '#f3d75c', '#ffdeb0', '#82f4d2'],
  typescript: ['#315aa5', '#71b5ff', '#f5deb4', '#a7f3dc'],
  go: ['#267f8c', '#65e0df', '#ffe4ba', '#f8f7d6'],
  java: ['#8e405a', '#f08c73', '#f8d8a4', '#9bd8ff'],
};

export function fallbackHero(profile: RepoProfile, kit: PlayerKit): HeroDesign {
  const seed = profile.seed >>> 0;
  const archetype: HeroArchetype = ({ staff: 'mage', cannon: 'heavy', smg: 'ranger', blaster: 'ranger', shotgun: 'engineer', laser: 'engineer', blade: 'knight' } as const)[kit.weapon];
  const language = profile.primaryLanguage.toLowerCase();
  const palette = palettes[language as keyof typeof palettes] ?? ['#476987', '#99d8d4', '#ffe1b5', '#f7a6d8'];
  const names = { knight: 'Patch Paladin', ranger: 'Branch Ranger', mage: 'Byte Mage', heavy: 'Compile Guardian', engineer: 'Hotfix Engineer', rogue: 'Shadow Fork' };
  return {
    title: short(`${profile.slug.split('/').pop()} ${names[archetype]}`, 24), archetype,
    headgear: choose(headgear, seed, 3), accessory: choose(accessories, seed, 8),
    emblem: choose(['{}', '++', '#', '<>', '*', 'R'], seed, 12), palette: [...palette],
    catchphrase: choose(['Small hero. Clean commits.', 'One more patch saves the party.', 'Tests green. Sword ready.', 'I brought a rollback.'], seed, 16),
  };
}

export function fallbackBoss(profile: RepoProfile, kit: BossKit): BossDesign {
  const seed = profile.seed >>> 0;
  const repo = (profile.slug.split('/').pop() || 'repo').toUpperCase();
  const body = profile.cycles.length > 1 ? 'hydra' : choose(bodies, seed, 4);
  const old = profile.ageDays > 3650;
  const suffix = profile.cycles.length ? 'THE KNOT THAT IMPORTS' : 'THE UNMERGED';
  return {
    name: short(`${repo}, ${suffix}`, 64),
    epithet: short(`Its ${profile.components.length} limbs feed the sleepless heart of ${profile.heart}.`, 120),
    body, eyes: Math.max(1, Math.min(12, profile.contributors || 1)), mouth: choose(mouths, seed, 12),
    growths: [old ? 'moss' : 'cables', profile.cycles.length ? 'tentacles' : 'gears'],
    palette: ['#211329', choose(['#683b65', '#465b72', '#5a4145'], seed), '#ff547b', '#bb83ef', '#fff4bd'],
    theme: kit.theme,
    intro: [`$ git clone ${profile.slug}`.slice(0, 80), '[##########] architecture awakened', `FATAL: ${profile.heart}`.slice(0, 80)],
    taunts: ['Your PR has conflicts.', 'There is no base case.', 'Works on my machine.'],
    attackNames: Object.fromEntries(kit.attacks.map((a, i) => [a.id, choose(attackNames[a.kind], seed + i)])),
    limbNames: Object.fromEntries(kit.limbs.map((limb, i) => [limb.id, short(`${limb.component.split('/').pop()} ${choose(['Claw', 'Tendril', 'Mandible', 'Coil'], seed + i)}`, 32)])),
  };
}
