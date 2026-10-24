import type { ArenaTheme, BossAttack, BossAttackKind, BossKit, GameMode, PlayerKit, RepoProfile, WeaponKind } from '../shared/types.ts';
import { ATTACK_COST, squadBudget } from './balance.ts';
import { bossCode, heroCode, symbolAllocator } from './code.ts';
import { ATTACK_FLAVOR } from './flavor.ts';
import { asClassroomKit, classroomFacts, type ClassroomKit } from './quality.ts';
import { bossSocial, fragileComponents, type SocialBossKit } from './social.ts';

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

export function playerKitFromProfile(p: RepoProfile, options: { mode?: GameMode } = {}): PlayerKit {
  const [weapon, title, color] = language(p);
  // Exactly five budget points move between health, armor, energy, speed and damage.
  // Repo shape only changes allocation; it never increases the budget.
  const shape = (p.totalFiles + p.maxDepth * 3 + p.cycles.length * 7 + Math.round(p.testRatio * 100)) % 5;
  const points = Array.from({ length: 5 }, (_, i) => (i === shape % 5 ? 2 : i === (shape + 2) % 5 ? 0 : 1));
  const concentration = Math.max(0, ...p.components.map(c => c.fanIn)) / Math.max(1, p.components.reduce((s, c) => s + c.fanIn, 0));
  const skill = p.testRatio >= 0.18 ? 'hotfix' : p.cycles.length >= 2 ? 'rollback' : p.components.length >= 4 && concentration < 0.4 ? 'firewall' : p.contributors >= 15 ? 'fork' : 'overclock';
  const kit: ClassroomKit = {
    repo: p.slug, title: `${p.primaryLanguage || 'Code'} ${title}`, weapon, skill,
    maxHp: 5 + points[0], maxArmor: 3 + points[1], maxEnergy: 150 + points[2] * 35,
    speed: 77 + points[3] * 8, damageMul: 0.9 + points[4] * 0.1,
    palette: ['#172131', color, (p.seed & 1) ? '#ffe2ac' : '#d5f5ff', '#f4faf7'], seed: p.seed, code: heroCode(p, weapon),
    classroom: classroomFacts(p),
  };
  return options.mode === 'edu' ? asClassroomKit(kit) : kit;
}

export function bossKitFromProfile(p: RepoProfile, playerCount: number): BossKit {
  const components = p.components.length ? p.components.slice(0, 8) : [{ name: 'core', loc: 100, files: 5, fanIn: 1, fanOut: 1 }];
  const cycles = new Set(p.cycles.flat());
  const fragile = fragileComponents(p, components);
  const total = components.reduce((s, c) => s + c.loc, 0) || 1;
  const limbWeight = (loc: number) => 0.5 / components.length + 0.5 * loc / total;
  const vulnerability = components.reduce((sum, c) => sum + limbWeight(c.loc) / (cycles.has(c.name) || fragile.has(c.name) ? 1.5 : 1), 0);
  const maxHp = squadBudget(playerCount).hp;
  const attacks: BossAttack[] = [];
  const pickSymbol = symbolAllocator(p), attackSymbols: Record<string, string> = {};
  const limbs = components.map((c, i) => {
    const kinds: BossAttackKind[] = [];
    if (cycles.has(c.name)) kinds.push('cascade');
    else if (c.fanOut >= 4) kinds.push('fan');
    else if (p.maxDepth >= 4 && i === 1) kinds.push('laser');
    else if (c.files >= 35) kinds.push('summon');
    else kinds.push(i % 2 ? 'spiral' : 'ring');
    if (i === 0) kinds.push(p.heart.includes(c.name) ? 'slam' : 'charge');
    else if (i === 1 && p.maxDepth >= 4 && !kinds.includes('laser')) kinds.push('laser');
    kinds.forEach((kind, j) => {
      const id = `${i}-${kind}-${j}`, symbol = pickSymbol(c.name);
      if (symbol) attackSymbols[id] = symbol;
      attacks.push({
        id, kind, source: c.name,
        name: symbol ? `${symbol} ${ATTACK_FLAVOR[kind]}` :
          kind === 'summon' && p.dna?.todos.length ? `${p.dna.todos[j % p.dna.todos.length].text.slice(0, 32)} Swarm` : `${ATTACK_FLAVOR[kind]} :: ${c.name}`,
        damage: squadBudget(playerCount).hitDamage * (kind === 'charge' ? 0.65 : 1),
        cooldown: 0.3 * ATTACK_COST[kind] * squadBudget(playerCount).recoveryScale,
        telegraph: 0.95,
        params: { count: kind === 'ring' ? 17 : kind === 'spiral' ? 28 : kind === 'summon' ? 3 : 7,
          speed: 58, spread: 1.15, radius: kind === 'slam' ? 34 : 27,
          threatShare: (0.5 / components.length + 0.5 * c.loc / total) / kinds.length, threatCost: ATTACK_COST[kind] },
      });
    });
    // Keep the cycle flag truthful for report cards; fragile is a separate crit source.
    const weakPoint = cycles.has(c.name);
    return { id: `limb-${i}`, component: c.name,
      maxHp: Math.round(maxHp * 0.36 * limbWeight(c.loc) / vulnerability), weakPoint,
      ...(c.maintainers === undefined ? {} : { maintainers: c.maintainers, fragile: fragile.has(c.name) }),
      ...(c.issues ? { issues: structuredClone(c.issues) } : {}),
      ...((p.vulns ?? []).some(v => v.component === c.name) ? { parasites: structuredClone(p.vulns!.filter(v => v.component === c.name)) } : {}),
    };
  });
  const [, , color, baseTheme] = language(p);
  const name = (p.slug.split('/').pop() || 'REPO').toUpperCase();
  const epithet = cycles.size ? 'THE TANGLED HORROR' : components.length <= 2 ? 'THE MONOLITH' : p.totalLoc < 15000 ? 'THE MICRO-HORROR' : 'THE DEPENDENCY DEVOURER';
  const kit: SocialBossKit = {
    repo: p.slug, name: `${name}, ${epithet}`, heart: p.heart, maxHp, limbs, attacks, enrageAt: 0.5, speed: 10,
    palette: ['#160f25', '#59365e', color, '#ff527d', '#fff4c4'],
    theme: p.ageDays > 3650 && !['web', 'notebook'].includes(baseTheme) ? 'legacy' : baseTheme, seed: p.seed,
    code: bossCode(p, limbs, attackSymbols),
    social: bossSocial(p),
  };
  return kit;
}
