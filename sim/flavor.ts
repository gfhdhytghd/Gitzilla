import type { BossAttackKind, PlayerKit, SkillKind, WeaponKind } from '../shared/types.ts';

export type CodeWeapon = NonNullable<NonNullable<PlayerKit['code']>['weapon']>;
const BASE: Record<WeaponKind, CodeWeapon> = {
  blaster: { name: 'printf() Pistol', projectiles: ['"str"', '{}'], muzzle: 'printf', impact: '\\n' },
  smg: { name: 'for Loop SMG', projectiles: ['i++', '++', ';'], muzzle: 'loop', impact: '++' },
  shotgun: { name: 'switch Shotgun', projectiles: ['case', '||', '?'], muzzle: 'switch', impact: 'break;' },
  cannon: { name: 'malloc() Cannon', projectiles: ['0xDEAD', '0xFF'], muzzle: 'alloc', impact: 'free()' },
  staff: { name: 'lambda Staff', projectiles: ['λ', '=>'], muzzle: '=>', impact: 'return' },
  laser: { name: 'regex Beam', projectiles: ['/.*/', '$1'], muzzle: 'match', impact: '$1' },
  blade: { name: 'Ctrl+X Katana', projectiles: ['//', '|'], muzzle: 'cut', impact: 'rm' },
};
const LANGUAGE: Record<string, Partial<CodeWeapon>> = {
  typescript: { name: 'as any Blaster', projectiles: ['as', 'any', '=>'], muzzle: 'as any', impact: 'never' },
  javascript: { name: 'Promise Blaster', projectiles: ['.then()', '=>'], muzzle: 'resolve', impact: 'catch()' },
  go: { name: 'goroutine SMG', projectiles: ['go', '<-ch', 'chan'], muzzle: 'go', impact: 'panic!' },
  c: { name: '#define Shotgun', projectiles: ['#if', 'MACRO', '*p'], muzzle: '#define', impact: '#undef' },
  'c++': { name: 'template<> Shotgun', projectiles: ['T', '::', '<>'], muzzle: 'new', impact: 'delete' },
  rust: { name: 'unsafe{} Cannon', projectiles: ['&mut', '::', '0xDEAD'], muzzle: 'alloc', impact: 'drop()' },
  python: { name: 'yield Staff', projectiles: ['λ', 'yield', 'def'], muzzle: 'yield', impact: 'return' },
  'jupyter notebook': { name: 'Cell[ ] Staff', projectiles: ['In[]', 'λ', '%'], muzzle: 'run', impact: 'Out[]' },
  r: { name: 'vector Staff', projectiles: ['<-', 'NA', 'c()'], muzzle: 'apply', impact: 'return' },
  julia: { name: 'broadcast Staff', projectiles: ['.|>', '::', 'end'], muzzle: '@.', impact: 'end' },
  java: { name: 'Stream Beam', projectiles: ['.map()', '::', '->'], muzzle: 'stream', impact: '.close()' },
  kotlin: { name: 'Flow Beam', projectiles: ['emit', '->', '?.'], muzzle: 'emit', impact: 'collect' },
  'c#': { name: 'LINQ Ray', projectiles: ['=>', 'JOIN', 'in'], muzzle: 'select', impact: 'yield' },
  ruby: { name: 'puts() Cutter', projectiles: ['#', 'end', 'do'], muzzle: 'puts', impact: 'exit' },
  php: { name: 'die() Saber', projectiles: ['//', '?>', '$'], muzzle: 'echo', impact: 'die()' },
  lua: { name: 'end Blade', projectiles: ['--', 'end', 'nil'], muzzle: 'cut', impact: 'return' },
  zig: { name: 'comptime Blade', projectiles: ['comptime', '[]', '*'], muzzle: 'comptime', impact: 'defer' },
  haskell: { name: '>>= Katana', projectiles: ['>>=', '::', '--'], muzzle: 'bind', impact: 'pure' },
  lisp: { name: '((() Blade', projectiles: ['(((', ')', 'nil'], muzzle: 'eval', impact: 'cons' },
  sql: { name: 'DROP TABLE Blade', projectiles: ['--', ';', 'NULL'], muzzle: 'ALTER', impact: 'DROP' },
};

/** Display metadata only: never changes WeaponKind, interval, damage, speed or energy. */
export function weaponCode(kind: WeaponKind, language: string, seed: number, realTokens: string[] = []): CodeWeapon {
  const style = { ...BASE[kind], ...LANGUAGE[language.toLowerCase()] };
  const genuine = realTokens.find(token => token.length > 0 && token.length <= 8 && !/\s/.test(token));
  const glyphs = [...new Set([...style.projectiles, ...(genuine ? [genuine] : [])])].slice(0, 4);
  const rotation = (seed >>> 0) % glyphs.length;
  return { ...style, name: style.name.slice(0, 20), projectiles: [...glyphs.slice(rotation), ...glyphs.slice(0, rotation)] };
}

export const SKILL_FLAVOR: Record<SkillKind, string> = {
  firewall: 'try { } catch', fork: 'git fork', hotfix: '+patch', overclock: 'sudo !!', rollback: 'git revert',
};
export const ATTACK_FLAVOR: Record<BossAttackKind, string> = {
  ring: 'while(true) Loop', spiral: 'Recursion', fan: 'throw Spray', laser: 'grep Trace',
  slam: 'Stack Overflow', charge: 'git push --force', summon: 'npm install Swarm', cascade: 'Merge Conflict',
};
