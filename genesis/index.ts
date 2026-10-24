import type { BossAttack, BossKit, Genesis, PlayerKit, RepoProfile, TraceStep } from '../shared/types.ts';

export type GenesisKind = 'hero' | 'boss';
export const MAX_GENESIS_BYTES = 12 * 1024;

// A second small guard at the room payload boundary. Filter BEFORE truncation so a
// cut-off credential cannot slip through. No credentials/options enter this API.
const secret = /(?:gh[pousr]_|github_pat_|sk-(?:proj-)?)[\w-]{12,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|-----BEGIN [\w ]*PRIVATE KEY|\b[\w$-]*(?:api[_-]?key|token|password|passwd|secret|credential|authorization)\s*["'`]?\s*[:=]\s*["'`]?\S+|\bBearer\s+[\w.+/=-]{12,}|https?:\/\/[^\s/]+:[^\s/]+@|[A-Za-z0-9+_=-]{64,}/i;
const clean = (s: string, max = 160) => secret.test(s) ? '' : s.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max);
const lines = (values: string[], count: number, length: number) => [...new Set(values.map(v => clean(v, length)).filter(Boolean))].slice(0, count);
const num = (n: number) => Number(n.toFixed(3));
const pct = (n: number) => `${num(n * 100)}%`;

/** Decode actual kit values, rather than re-rolling the sim's five-point allocation. */
export function heroBudget(kit: PlayerKit): Genesis['budget'] {
  return [
    { label: 'hp', value: kit.maxHp - 5 },
    { label: 'armor', value: kit.maxArmor - 3 },
    { label: 'energy', value: (kit.maxEnergy - 150) / 35 },
    { label: 'speed', value: (kit.speed - 77) / 8 },
    { label: 'damage', value: (kit.damageMul - 0.9) / 0.1 },
  ].map(b => ({ ...b, value: num(b.value) }));
}

/** Boss budget bars are percentages of the one anatomical attack budget. */
export function bossBudget(kit: BossKit): Genesis['budget'] {
  const weights = kit.limbs.map(l => kit.attacks.filter(a => a.source === l.component).reduce((s, a) => s + (a.params.threatShare ?? 0), 0));
  const total = weights.reduce((s, n) => s + n, 0);
  let allocated = 0;
  return kit.limbs.map((l, i) => {
    const value = i === kit.limbs.length - 1 ? num(100 - allocated) : num((total ? weights[i] / total : 1 / kit.limbs.length) * 100);
    allocated += value;
    return { label: clean(l.component, 96), value };
  });
}

function skillReason(p: RepoProfile): string {
  const concentration = Math.max(0, ...p.components.map(c => c.fanIn)) / Math.max(1, p.components.reduce((s, c) => s + c.fanIn, 0));
  if (p.testRatio >= 0.18) return `tests ${pct(p.testRatio)} >= 18% (first rule)`;
  if (p.cycles.length >= 2) return `tests <18%; ${p.cycles.length} cycles >=2`;
  if (p.components.length >= 4 && concentration < 0.4) return `tests <18%; cycles <2; ${p.components.length} components; fan-in concentration ${pct(concentration)} <40%`;
  return p.contributors >= 15 ? `earlier skill rules unmet; contributors ${p.contributors} >=15` : 'tests/cycles/distribution/contributor rules unmet; default';
}

function attackReason(p: RepoProfile, kit: BossKit, attack: BossAttack): string {
  const i = kit.limbs.findIndex(l => l.component === attack.source);
  const c = p.components.find(c => c.name === attack.source);
  const prefix = `${attack.source}: `;
  switch (attack.kind) {
    case 'cascade': return `${prefix}in dependency cycle (first attack rule)`;
    case 'fan': return `${prefix}acyclic; fan-out ${c?.fanOut ?? 0} >=4`;
    case 'laser': return `${prefix}depth ${p.maxDepth} >=4; second component`;
    case 'summon': return `${prefix}earlier rules unmet; files ${c?.files ?? 5} >=35`;
    case 'ring': case 'spiral': return `${prefix}earlier rules unmet; index ${i} ${i % 2 ? 'odd' : 'even'}`;
    case 'slam': return `${prefix}largest component contains heart ${p.heart}`;
    case 'charge': return `${prefix}largest component does not contain heart`;
  }
}

/** Pure, synchronous and room-only. Call AFTER design decoration so names/colors
 * match the final kit. Never logs, persists, fetches, or sends code to a model. */
export function buildGenesis(profile: RepoProfile, kit: PlayerKit | BossKit, kind: GenesisKind): Genesis {
  const p = profile;
  const trace: TraceStep[] = [];
  const add = (part: TraceStep['part'], from: string, to: string, ref?: string) => {
    trace.push({ part, from: clean(from, 220) || '[source omitted]', to: clean(to, 240) || '[source omitted]', ...(ref && clean(ref, 96) ? { ref: clean(ref, 96) } : {}) });
  };
  const languageBytes = Object.values(p.languages).reduce((s, n) => s + n, 0);
  const lang = `language: ${p.primaryLanguage}${languageBytes ? ` ${pct((p.languages[p.primaryLanguage] ?? 0) / languageBytes)}` : ''}`;
  let budget: Genesis['budget'];

  if (kind === 'hero') {
    const hero = kit as PlayerKit;
    add('class', lang, `class: ${hero.design?.archetype ?? hero.title}${hero.design ? ' (design from repo + weapon)' : ''}`);
    add('weapon', lang, `weapon: ${hero.code?.weapon?.name ?? hero.weapon}; kind ${hero.weapon}`);
    add('palette', `${lang}; seed ${p.seed}${hero.design ? '; authored design' : '; seed parity sets visor'}`, `palette: ${hero.palette.join(' ')}`);
    add('skill', skillReason(p), `skill: ${hero.skill}`);
    const shape = (p.totalFiles + p.maxDepth * 3 + p.cycles.length * 7 + Math.round(p.testRatio * 100)) % 5;
    add('stats', `shape=(files ${p.totalFiles} + depth ${p.maxDepth}*3 + cycles ${p.cycles.length}*7 + round(tests*100)) %5 = ${shape}`, '5 equal-budget points: 2 at shape, 0 at (shape+2)%5, 1 elsewhere');
    budget = heroBudget(hero);
    const actual = [hero.maxHp, hero.maxArmor, hero.maxEnergy, hero.speed, hero.damageMul];
    const formulas = ['5 + points', '3 + points', '150 + 35*points', '77 + 8*points', '0.9 + 0.1*points'];
    budget.forEach((b, i) => add('stats', `${b.label}: ${b.value} budget points; ${formulas[i]}`, `${b.label}: ${num(actual[i])}`, b.label));
    const tokens = lines(p.dna?.tokens ?? [], 12, 16);
    if (tokens.length) add('glyphs', `real tokens: ${tokens.join(' ')}`, `crest/orbiting glyphs; shots: ${hero.code?.weapon?.projectiles.join(' ') ?? hero.code?.tokens.join(' ') ?? ''}`);
    else add('glyphs', `${lang}; no extracted DNA tokens`, `language weapon glyphs: ${hero.code?.weapon?.projectiles.join(' ') ?? '(none)'}`);
    if (hero.code?.signature) add('name', `identifier: ${p.dna?.identifiers[0] ?? hero.code.signature}`, `signature: ${hero.code.signature}`);
    if (hero.code?.snippet) add('cape', `source: ${hero.code.snippet}`, 'code rows etched into outfit / cape', p.dna?.snippets[0]?.file ?? p.heart);
    if (hero.design) add('cape', `repo design; seed ${p.seed}`, `headgear: ${hero.design.headgear}; accessory: ${hero.design.accessory}; emblem: ${hero.design.emblem}`);
    add('name', `${p.slug}${hero.design ? '; repo/DNA authored design' : `; ${p.primaryLanguage} class table`}`, `name: ${hero.title}`);
  } else {
    const boss = kit as BossKit;
    if (boss.design) add('class', `component graph + seed ${p.seed}; repo-authored design`, `body: ${boss.design.body}; mouth: ${boss.design.mouth}; growths: ${boss.design.growths.join(', ')}`);
    const totalLoc = p.components.slice(0, 8).reduce((s, c) => s + c.loc, 0) || 1;
    for (const limb of boss.limbs) {
      const c = p.components.find(c => c.name === limb.component);
      add('limb', c ? `${c.name}: ${c.loc} LOC, ${c.files} files; weight=0.5/${boss.limbs.length}+0.5*LOC/${totalLoc}` : 'no analyzed components; sim core fallback', `limb: ${boss.design?.limbNames[limb.id] ?? limb.component}; ${limb.maxHp} HP`, limb.id);
    }
    add('limb', `${p.edges.length} real component import edges`, 'dependencies: swaying tentacles between component limbs', 'dependencies');
    add('heart', `heart: ${p.heart}; fan-in ${p.heartFanIn}`, `core: ${boss.heart}; pulsing heart`, p.heart);
    for (const limb of boss.limbs) {
      add('weakpoint', `${limb.component}: ${p.cycles.some(c => c.includes(limb.component)) ? 'in dependency cycle' : 'acyclic'}`, limb.weakPoint ? 'red weak point; 1.5x damage' : 'normal limb; no cycle bonus', limb.id);
    }
    add('eyes', `contributors: ${p.contributors}${boss.design ? '; repo-informed design' : `; seed ${p.seed}`}`, boss.design ? `design eye target: ${boss.design.eyes} (layout may add anatomical eyes)` : `seed eye target: ${3 + ((boss.seed >>> 0) % 6)}; contributor mapping needs design`);
    add('scars', `commits: ${p.commits}; seed ${p.seed}`, 'scars: seed-based; commit subjects supply taunt material');
    const todos = p.dna?.counts.todo ?? 0;
    const labels = lines(boss.code?.todos ?? [], 2, 60);
    add('minions', `TODO x${todos}; ${boss.code?.todos.length ?? 0} extracted bug labels`, `minion labels: ${labels.join(' | ') || '(no extracted labels)'}; count comes from summon attacks`);
    for (const attack of boss.attacks) {
      add('attack', attackReason(p, boss, attack), `${attack.kind}: ${attack.name}; ${attack.telegraph}s warning; ${attack.damage} damage; ${num(attack.cooldown)}s cooldown; ${attack.params.count} ${attack.kind === 'summon' ? 'bugs/cast' : 'shots'}; speed ${attack.params.speed}; share ${pct(attack.params.threatShare ?? 0)}`, attack.id);
    }
    budget = bossBudget(boss);
    add('stats', 'same squad size => same core HP and total anatomical threat', `core HP ${boss.maxHp}; limb effective HP pool 36%; budget bars = attack-share %`);
    add('stats', 'LOC weights split one threat budget; cycles normalize limb HP', `enrage at ${pct(boss.enrageAt)} HP; speed ${boss.speed}; cooldowns priced by attack kind`);
    add('theme', `${lang}; age ${p.ageDays} days; legacy if >3650 except web/notebook${boss.design ? '; design override' : ''}`, `arena: ${boss.theme}`);
    add('palette', `${lang}; ${boss.design ? 'repo-authored design' : 'language accent + fixed monster colors'}`, `palette: ${boss.palette.join(' ')}`);
    const tokens = lines(p.dna?.tokens ?? [], 12, 16);
    add('glyphs', tokens.length ? `real tokens: ${tokens.join(' ')}` : 'no extracted DNA tokens', tokens.length ? 'boss projectile glyphs + heart code + limb inscriptions' : 'seed art; no invented source excerpts');
    const epithet = p.cycles.length ? 'cycles => tangled horror' : boss.limbs.length <= 2 ? '<=2 components => monolith' : p.totalLoc < 15000 ? '<15000 LOC => micro-horror' : 'component graph => dependency devourer';
    add('name', `${p.slug}; ${boss.design ? 'repo/DNA authored design' : epithet}`, `name: ${boss.name}`);
  }

  const sampleFiles = lines([
    ...(p.tree ?? []), ...(p.dna?.bigFiles.map(f => f.path) ?? []),
    ...(p.dna?.snippets.map(s => s.file) ?? []), ...(p.dna?.todos.map(t => t.file) ?? []), p.heart,
  ].filter(path => path.length <= 120), 40, 120);
  const genesis: Genesis = {
    slug: clean(p.slug, 120), languages: Object.fromEntries(Object.entries(p.languages).slice(0, 16).map(([k, v]) => [clean(k, 40), v]).filter(([k]) => k)),
    metrics: { files: p.totalFiles, loc: p.totalLoc, functions: p.dna?.counts.functions ?? 0, todos: p.dna?.counts.todo ?? 0, contributors: p.contributors, commits: p.commits, ageDays: p.ageDays, testRatio: p.testRatio },
    components: p.components.slice(0, 8).map(c => ({ name: clean(c.name, 96), loc: c.loc, files: c.files })),
    edges: p.edges.filter(([a, b]) => a >= 0 && b >= 0 && a < Math.min(8, p.components.length) && b < Math.min(8, p.components.length)).slice(0, 64).map(([a, b]) => [a, b]),
    cycles: p.cycles.slice(0, 8).map(c => c.slice(0, 8).map(n => clean(n, 96))),
    heart: clean(p.heart, 120), heartFanIn: p.heartFanIn, sampleFiles,
    snippets: lines([...(p.dna?.snippets.map(s => s.code) ?? []), ...(p.dna?.heartLines ?? [])], 12, 48),
    trace, budget,
  };
  // Keep every mapping step; shed optional cinematic samples before shortening captions.
  // TextEncoder is standard JS (no Node imports), so the same pure builder works offline.
  const bytes = () => new TextEncoder().encode(JSON.stringify(genesis)).length;
  while (bytes() > MAX_GENESIS_BYTES && genesis.sampleFiles.length) genesis.sampleFiles.pop();
  while (bytes() > MAX_GENESIS_BYTES && genesis.snippets.length) genesis.snippets.pop();
  for (const cap of [160, 120, 80, 48, 32, 24]) {
    if (bytes() <= MAX_GENESIS_BYTES) break;
    for (const step of trace) { step.from = step.from.slice(0, cap); step.to = step.to.slice(0, cap); if (step.ref) step.ref = step.ref.slice(0, cap); }
  }
  return genesis;
}
