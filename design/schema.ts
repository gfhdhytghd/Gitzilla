import type { ArenaTheme, BossBody, BossGrowth, BossKit, BossMouth, HeroAccessory, HeroArchetype, HeroHeadgear } from '../shared/types.ts';

export const archetypes = ['knight', 'ranger', 'mage', 'heavy', 'engineer', 'rogue'] as const satisfies readonly HeroArchetype[];
export const headgear = ['helmet', 'hood', 'wizard-hat', 'goggles', 'bandana', 'cat-ears', 'headphones', 'crown', 'antenna', 'beanie', 'none'] as const satisfies readonly HeroHeadgear[];
export const accessories = ['cape', 'scarf', 'laptop-backpack', 'jetpack', 'sticker-shield', 'rubber-duck', 'coffee-mug', 'tail', 'none'] as const satisfies readonly HeroAccessory[];
export const bodies = ['blob', 'serpent', 'spider', 'hydra', 'golem', 'swarm', 'eye', 'tree', 'machine'] as const satisfies readonly BossBody[];
export const mouths = ['maw', 'brackets', 'beak', 'zipper', 'none'] as const satisfies readonly BossMouth[];
export const growths = ['spikes', 'cables', 'crystals', 'moss', 'servers', 'wings', 'horns', 'tentacles', 'gears', 'pipes'] as const satisfies readonly BossGrowth[];
export const themes = ['terminal', 'kernel', 'web', 'notebook', 'enterprise', 'legacy'] as const satisfies readonly ArenaTheme[];

const string = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength });
const enumeration = (values: readonly string[]) => ({ type: 'string', enum: values });
const array = (items: object, minItems: number, maxItems: number) => ({ type: 'array', items, minItems, maxItems });
const object = (properties: Record<string, object>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const palette = (count: number) => array({ type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, count, count);

export const heroSchema = object({
  title: string(24), archetype: enumeration(archetypes), headgear: enumeration(headgear), accessory: enumeration(accessories),
  emblem: { type: 'string', minLength: 1, maxLength: 2, pattern: '^[ -~]{1,2}$' },
  palette: palette(4), catchphrase: string(40),
});

export function bossSchema(kit: BossKit) {
  return object({
    name: string(64), epithet: string(120), body: enumeration(bodies), eyes: { type: 'integer', minimum: 1, maximum: 12 },
    mouth: enumeration(mouths), growths: array(enumeration(growths), 1, 3), palette: palette(5), theme: enumeration(themes),
    intro: array(string(80), 2, 4), taunts: array(string(64), 3, 6),
    attackNames: object(Object.fromEntries(kit.attacks.map(a => [a.id, string(22)]))),
    limbNames: object(Object.fromEntries(kit.limbs.map(l => [l.id, string(32)]))),
  });
}
