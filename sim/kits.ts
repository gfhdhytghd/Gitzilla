import type { ArenaTheme, BossAttack, BossAttackKind, BossKit, PlayerKit, RepoProfile, WeaponKind } from '../shared/types.ts';
import { clamp } from './math.ts';

const languages: Record<string, [WeaponKind, string, string, ArenaTheme]> = {
  rust: ['cannon', 'Paladin', '#e69b64', 'kernel'], c: ['shotgun', 'Vanguard', '#b8c4d8', 'kernel'],
  'c++': ['shotgun', 'Vanguard', '#85b8ff', 'kernel'], go: ['smg', 'Ranger', '#58d9e7', 'kernel'],
  typescript: ['blaster', 'Ranger', '#59aaff', 'web'], javascript: ['blaster', 'Ranger', '#f8df65', 'web'],
  python: ['staff', 'Mage', '#85c9ff', 'notebook'], 'jupyter notebook': ['staff', 'Sage', '#f7b85e', 'notebook'],
  r: ['staff', 'Sage', '#79b4f7', 'notebook'], julia: ['staff', 'Sage', '#bd88ef', 'notebook'],
  java: ['laser', 'Sentinel', '#ed9977', 'enterprise'], kotlin: ['laser', 'Sentinel', '#c493ff', 'enterprise'],
  'c#': ['laser', 'Sentinel', '#a18bfa', 'enterprise'], ruby: ['blade', 'Ronin', '#f07187', 'terminal'],
  php: ['blade', 'Ronin', '#a7a3e8', 'terminal'], lua: ['blade', 'Ronin', '#8c9dff', 'terminal'],
};
const language = (p: RepoProfile) => languages[p.primaryLanguage.toLowerCase()] ?? ['blade', 'Knight', '#78e5b4', 'terminal'] as const;

export function playerKitFromProfile(p: RepoProfile): PlayerKit {
  const [weapon, title, color] = language(p);
  // Exactly five budget points move between health, armor, energy, speed and damage.
  // Repo shape only changes allocation; it never increases the budget.
  const shape = (p.totalFiles + p.maxDepth * 3 + p.cycles.length * 7 + Math.round(p.testRatio * 100)) % 5;
  const points = Array.from({ length: 5 }, (_, i) => (i === shape % 5 ? 2 : i === (shape + 2) % 5 ? 0 : 1));
  const concentration = Math.max(0, ...p.components.map(c => c.fanIn)) / Math.max(1, p.components.reduce((s, c) => s + c.fanIn, 0));
  const skill = p.testRatio >= 0.18 ? 'hotfix' : p.cycles.length >= 2 ? 'rollback' : p.components.length >= 4 && concentration < 0.4 ? 'firewall' : p.contributors >= 15 ? 'fork' : 'overclock';
  return {
    repo: p.slug, title: `${p.primaryLanguage || 'Code'} ${title}`, weapon, skill,
    maxHp: 5 + points[0], maxArmor: 3 + points[1], maxEnergy: 150 + points[2] * 35,
    speed: 77 + points[3] * 8, damageMul: 0.9 + points[4] * 0.1,
    palette: ['#172131', color, (p.seed & 1) ? '#ffe2ac' : '#d5f5ff', '#f4faf7'], seed: p.seed,
  };
}

const names: Record<BossAttackKind, string> = {
  ring: 'Segfault Storm', spiral: 'Stack Overflow', fan: 'git push --force', laser: 'Null Pointer',
  slam: 'rm -rf /', charge: 'Race Condition', summon: 'npm install', cascade: 'Dependency Hell',
};
export function bossKitFromProfile(p: RepoProfile, playerCount: number): BossKit {
  const components = p.components.length ? p.components.slice(0, 8) : [{ name: 'core', loc: 100, files: 5, fanIn: 1, fanOut: 1 }];
  const cycles = new Set(p.cycles.flat());
  const total = components.reduce((s, c) => s + c.loc, 0) || 1;
  const scale = 0.6 + 0.4 * clamp(playerCount, 1, 8);
  const maxHp = Math.round(13200 * scale);
  const attacks: BossAttack[] = [];
  const limbs = components.map((c, i) => {
    const kinds: BossAttackKind[] = [];
    if (cycles.has(c.name)) kinds.push('cascade');
    else if (c.fanOut >= 4) kinds.push('fan');
    else if (p.maxDepth >= 4 && i === 1) kinds.push('laser');
    else if (c.files >= 35) kinds.push('summon');
    else kinds.push(i % 2 ? 'spiral' : 'ring');
    if (i === 0) kinds.push(p.heart.includes(c.name) ? 'slam' : 'charge');
    else if (i === 1 && p.maxDepth >= 4 && !kinds.includes('laser')) kinds.push('laser');
    kinds.forEach((kind, j) => attacks.push({
      id: `${i}-${kind}-${j}`, kind, source: c.name, name: `${names[kind]} :: ${c.name}`,
      damage: playerCount === 1 ? 2 : 5,
      cooldown: (6.8 + i * 0.55 + j) / (1 + (playerCount - 1) * 0.025),
      telegraph: kind === 'charge' || kind === 'laser' ? 1.05 : 0.85,
      params: { count: kind === 'ring' ? 17 : kind === 'spiral' ? 28 : kind === 'summon' ? 3 : 7,
        speed: 54 + (i % 3) * 5, spread: 1.15, radius: kind === 'slam' ? 34 : 27 },
    }));
    return { id: `limb-${i}`, component: c.name, maxHp: Math.round(maxHp * (0.035 + 0.13 * c.loc / total)), weakPoint: cycles.has(c.name) };
  });
  const [, , color, baseTheme] = language(p);
  const name = (p.slug.split('/').pop() || 'REPO').toUpperCase();
  const epithet = cycles.size ? 'THE TANGLED HORROR' : components.length <= 2 ? 'THE MONOLITH' : p.totalLoc < 15000 ? 'THE MICRO-HORROR' : 'THE DEPENDENCY DEVOURER';
  const kit: BossKit = {
    repo: p.slug, name: `${name}, ${epithet}`, heart: p.heart, maxHp, limbs, attacks, enrageAt: 0.5, speed: 10,
    palette: ['#160f25', '#59365e', color, '#ff527d', '#fff4c4'],
    theme: p.ageDays > 3650 && !['web', 'notebook'].includes(baseTheme) ? 'legacy' : baseTheme, seed: p.seed,
  };
  return kit;
}
