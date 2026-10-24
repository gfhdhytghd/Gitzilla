import type { HeroDesign, PlayerKit, WeaponKind } from '../shared/types.ts';

/** Structural extension until the coordinator adds optional HeroDesign.weaponName. */
export type HeroDesignWithWeapon = HeroDesign & { weaponName?: string };

const baseNames: Record<WeaponKind, string> = {
  blaster: 'printf() Pistol', smg: 'for Loop SMG', shotgun: 'switch Shotgun', cannon: 'malloc() Cannon',
  staff: 'lambda Staff', laser: 'regex Beam', blade: 'Ctrl+X Katana',
};

export function cleanWeaponName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 20).trimEnd() || undefined;
}

/** sim owns language flavors; retain its name when available, with a legacy-kit fallback. */
export function fallbackWeaponName(kit: PlayerKit): string {
  return cleanWeaponName(kit.code?.weapon?.name) ?? baseNames[kit.weapon];
}
