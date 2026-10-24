import type { BossDesign, BossKit, HeroDesign, PlayerKit, RepoProfile } from '../shared/types.ts';
import { fallbackBoss, fallbackHero } from './fallback.ts';
import { accessories, archetypes, bodies, growths, headgear, mouths, themes } from './schema.ts';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown, fallback: string, limit: number): string {
  return typeof value === 'string' && value.trim() ? value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, limit).trimEnd() : fallback;
}
function enumeration<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}
function palette(value: unknown, fallback: string[]): string[] {
  const colors = Array.isArray(value) ? value : [];
  return fallback.map((color, i) => typeof colors[i] === 'string' && /^#[0-9a-f]{6}$/i.test(colors[i]) ? colors[i].toLowerCase() : color);
}
function lines(value: unknown, fallback: string[], min: number, max: number, length: number): string[] {
  const result = Array.isArray(value) ? value.filter(v => typeof v === 'string' && v.trim()).slice(0, max).map(v => text(v, '', length)) : [];
  while (result.length < min) result.push(fallback[result.length % fallback.length]);
  return result;
}

export function validateHero(value: unknown, profile: RepoProfile, kit: PlayerKit): HeroDesign {
  const source = record(value), fallback = fallbackHero(profile, kit);
  const emblem = typeof source.emblem === 'string' ? source.emblem.replace(/[^\x20-\x7e]/g, '').trim().slice(0, 2) : '';
  return {
    title: text(source.title, fallback.title, 24), archetype: enumeration(source.archetype, archetypes, fallback.archetype),
    headgear: enumeration(source.headgear, headgear, fallback.headgear), accessory: enumeration(source.accessory, accessories, fallback.accessory),
    emblem: emblem || fallback.emblem, palette: palette(source.palette, fallback.palette), catchphrase: text(source.catchphrase, fallback.catchphrase, 40),
  };
}

export function validateBoss(value: unknown, profile: RepoProfile, kit: BossKit): BossDesign {
  const source = record(value), fallback = fallbackBoss(profile, kit);
  const attackNames = record(source.attackNames), limbNames = record(source.limbNames);
  const selectedGrowths = Array.isArray(source.growths) ? [...new Set(source.growths.filter((g): g is typeof growths[number] => growths.includes(g)))].slice(0, 3) : [];
  return {
    name: text(source.name, fallback.name, 64), epithet: text(source.epithet, fallback.epithet, 120),
    body: enumeration(source.body, bodies, fallback.body),
    eyes: typeof source.eyes === 'number' && Number.isFinite(source.eyes) ? Math.max(1, Math.min(12, Math.round(source.eyes))) : fallback.eyes,
    mouth: enumeration(source.mouth, mouths, fallback.mouth), growths: selectedGrowths.length ? selectedGrowths : fallback.growths,
    palette: palette(source.palette, fallback.palette), theme: enumeration(source.theme, themes, fallback.theme),
    intro: lines(source.intro, fallback.intro, 2, 4, 80), taunts: lines(source.taunts, fallback.taunts, 3, 6, 64),
    attackNames: Object.fromEntries(kit.attacks.map(a => [a.id, text(attackNames[a.id], fallback.attackNames[a.id], 22)])),
    limbNames: Object.fromEntries(kit.limbs.map(l => [l.id, text(limbNames[l.id], fallback.limbNames[l.id], 32)])),
  };
}
