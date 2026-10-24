import { codeExpression } from './expressions.ts';
import type { BossAttackKind, PlayerKit, SkillKind, WeaponKind } from '../shared/types.ts';

export type CodeWeapon = NonNullable<NonNullable<PlayerKit['code']>['weapon']>;
/** Display metadata only: never changes WeaponKind, cadence, damage, speed or energy. */
export function weaponCode(kind: WeaponKind, language: string, seed: number, realTokens: string[] = [], realIdentifiers: string[] = []): CodeWeapon {
  const style = codeExpression(kind, language, seed, realIdentifiers);
  const genuine = realTokens.find(token => token.length > 0 && token.length <= 8 && !/\s/.test(token));
  const glyphs = [...new Set([...style.projectiles, ...(genuine ? [genuine] : [])])].slice(0, 4);
  const rotation = (seed >>> 0) % glyphs.length;
  return { ...style, projectiles: [...glyphs.slice(rotation), ...glyphs.slice(0, rotation)] };
}

export const SKILL_FLAVOR: Record<SkillKind, string> = {
  firewall: 'try { } catch', fork: 'git fork', hotfix: '+patch', overclock: 'sudo !!', rollback: 'git revert',
};
export const ATTACK_FLAVOR: Record<BossAttackKind, string> = {
  ring: 'while(true) Loop', spiral: 'Recursion', fan: 'throw Spray', laser: 'grep Trace',
  slam: 'Stack Overflow', charge: 'git push --force', summon: 'npm install Swarm', cascade: 'Merge Conflict',
};
