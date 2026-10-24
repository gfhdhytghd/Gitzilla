import type { BossAttack, BossKit, Genesis, PlayerKit, QualityStat, RepoProfile, TraceStep } from '../shared/types.ts';
import { bossArchetypeFromProfile } from '../sim/archetypes.ts';

export type GenesisKind = 'hero' | 'boss';
export const MAX_GENESIS_BYTES = 12 * 1024;

// A second small guard at the room payload boundary. Filter BEFORE truncation so a
// cut-off credential cannot slip through. No credentials/options enter this API.
const secret = /(?:gh[pousr]_|github_pat_|sk-(?:proj-)?)[\w-]{12,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|-----BEGIN [\w ]*PRIVATE KEY|\b[\w$-]*(?:api[_-]?key|token|password|passwd|secret|credential|authorization)\s*["'`]?\s*[:=]\s*["'`]?\S+|\bBearer\s+[\w.+/=-]{12,}|https?:\/\/[^\s/]+:[^\s/]+@|[A-Za-z0-9+_=-]{64,}/i;
const clean = (s: string, max = 160) => secret.test(s) ? '' : s.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max);
const lines = (values: string[], count: number, length: number) => [...new Set(values.map(v => clean(v, length)).filter(Boolean))].slice(0, count);
const num = (n: number) => Number(n.toFixed(3));
const human = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
const pct = (n: number) => `${Math.round(n * 100)}%`;
const caption = (s: string, max = 40) => {
  const text = clean(s, s.length) || '[source omitted]';
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
};
const leaf = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path;
// Reserve space for the number so a long name never crowds out its payoff.
const withMetric = (name: string, metric: string, max = 40) => `${caption(name, Math.max(1, max - 3 - metric.length))} · ${metric}`;

/** Decode actual kit values, rather than re-rolling the sim's five-point allocation. */
export function heroBudget(kit: PlayerKit): Genesis['budget'] {
  // Classroom PvP earns stats independently. There is no shared five-point pool.
  if (kit.quality !== undefined) return [];
  return [
    { label: 'hp', value: kit.maxHp - 5 },
    { label: 'armor', value: kit.maxArmor - 3 },
    { label: 'energy', value: (kit.maxEnergy - 150) / 35 },
    { label: 'speed', value: (kit.speed - 77) / 8 },
    { label: 'damage', value: (kit.damageMul - 0.9) / 0.1 },
  ].map(b => ({ ...b, value: num(b.value) }));
}

/** Display the sim's report card verbatim in meaning; never grade a repo twice.
 * References join short captions to the complete signal/tip on kit.quality.
 * Show all grades before tips, so a phone's first eight steps cover the card. */
export function qualityTrace(quality: readonly QualityStat[]): TraceStep[] {
  const order: QualityStat['stat'][] = ['armor', 'speed', 'damage', 'weakness', 'hp', 'energy', 'regen'];
  const rows = [...quality].sort((a, b) => order.indexOf(a.stat) - order.indexOf(b.stat));
  return [
    ...rows.map(q => ({
      part: 'stats' as const, from: caption(q.signal),
      to: caption(`${q.stat} ${q.grade} · ${q.value.toLocaleString('en-US', { maximumFractionDigits: 3 })}`),
      ref: `quality:${q.stat}`,
    })),
    ...rows.filter(q => q.tip.trim()).map(q => ({
      part: 'stats' as const, from: `Improve ${q.stat} · ${q.grade}`,
      to: caption(q.tip), ref: `quality-tip:${q.stat}`,
    })),
  ];
}

/** Explain the final silhouette with the sim's exact winning selection reason.
 * If a caller explicitly overrides the archetype, keep that identity and show
 * its real repo context rather than claiming a different rule selected it. */
export function bossArchetypeTrace(profile: RepoProfile, kit: BossKit): TraceStep {
  const maxFanOut = Math.max(0, ...profile.components.map(c => c.fanOut));
  const debt = (profile.dna?.counts.todo ?? 0) + (profile.dna?.counts.fixme ?? 0) + (profile.dna?.counts.hack ?? 0);
  const signals: Record<BossKit['archetype'], string> = {
    kaiju: `${human(profile.components.length)} modules · ${human(profile.cycles.length)} cycles`,
    hydra: `${human(profile.cycles.length)} import cycles · fan-out ${human(maxFanOut)}`,
    mecha: `${profile.primaryLanguage} · ${human(profile.maxDepth)} import layers`,
    abyssal: `${human(profile.totalLoc)} LOC · ${human(profile.ageDays)}d · ${human(debt)} debt marks`,
  };
  const silhouettes: Record<BossKit['archetype'], string> = {
    kaiju: 'Kaiju · crystal-backed titan', hydra: 'Hydra · many-headed terror',
    mecha: 'Mecha · armored machine', abyssal: 'Abyssal · crystalline serpent',
  };
  const selected = bossArchetypeFromProfile(profile);
  const reason = selected.reason.split(' → ')[0]
    .replace(' circular dependency groups', ' import cycles')
    .replace('Highest component fan-out', 'fan-out')
    .replace(' systems code; dependency depth ', ' · import depth ')
    .replace(/, ([\d,]+ LOC)$/, ' · $1')
    .replace('analyzed LOC', 'LOC').replace('days of history', 'days old')
    .replace('TODO/FIXME/HACK notes', 'debt marks');
  return { part: 'class', from: caption(selected.archetype === kit.archetype ? reason : signals[kit.archetype]), to: caption(silhouettes[kit.archetype]), ref: 'archetype' };
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
  if (p.testRatio >= 0.18) return `tests ${pct(p.testRatio)} · healing power`;
  if (p.cycles.length >= 2) return `${human(p.cycles.length)} cycles · rewind the chaos`;
  return `tests ${pct(p.testRatio)} · ${human(p.components.length)} modules`;
}

function attackReason(p: RepoProfile, kit: BossKit, attack: BossAttack): string {
  const i = kit.limbs.findIndex(l => l.component === attack.source);
  const c = p.components.find(c => c.name === attack.source);
  switch (attack.kind) {
    case 'cascade': return withMetric(attack.source, 'dependency loop');
    case 'fan': return withMetric(attack.source, `${human(c?.fanOut ?? 0)} imports out`);
    case 'laser': return withMetric(attack.source, `${human(p.maxDepth)} layers deep`);
    case 'summon': return withMetric(attack.source, `${human(c?.files ?? 5)} files`);
    case 'ring': case 'spiral': return withMetric(attack.source, `formation ${i + 1}`);
    case 'slam': return withMetric(attack.source, 'heart-bearing module');
    case 'charge': return withMetric(attack.source, 'largest module');
  }
}

/** Pure, synchronous and room-only. Call AFTER design decoration so names/colors
 * match the final kit. Never logs, persists, fetches, or sends code to a model. */
export function buildGenesis(profile: RepoProfile, kit: PlayerKit | BossKit, kind: GenesisKind): Genesis {
  const p = profile;
  const trace: TraceStep[] = [];
  const add = (part: TraceStep['part'], from: string, to: string, ref?: string) => {
    // Weapon names are complete code expressions (up to 24 chars). An ellipsis
    // could split a token or remove its closing delimiter; keep them whole.
    trace.push({ part, from: caption(from), to: part === 'weapon' ? clean(to, to.length) || '[source omitted]' : caption(to), ...(ref && clean(ref, 96) ? { ref: clean(ref, 96) } : {}) });
  };
  const languageBytes = Object.values(p.languages).reduce((s, n) => s + n, 0);
  const lang = languageBytes ? withMetric(p.primaryLanguage, `${pct((p.languages[p.primaryLanguage] ?? 0) / languageBytes)} of code`) : p.primaryLanguage;
  const tokens = lines(p.dna?.tokens ?? [], 4, 8);
  let budget: Genesis['budget'];

  if (kind === 'hero') {
    const hero = kit as PlayerKit;
    if (hero.quality !== undefined) trace.push(...qualityTrace(hero.quality));
    const weaponName = hero.code?.weapon?.name ?? hero.weapon;
    const sourceWidth = Math.max(1, 40 - 3 - weaponName.length);
    const weaponFrom = lang.length <= sourceWidth ? lang : languageBytes
      ? withMetric(p.primaryLanguage, pct((p.languages[p.primaryLanguage] ?? 0) / languageBytes), sourceWidth)
      : caption(p.primaryLanguage, sourceWidth);
    add('weapon', weaponFrom, weaponName);
    add('skill', hero.skill === 'fork' ? `${human(p.contributors)} contributors` : skillReason(p), `skill: ${hero.skill}`);
    add('glyphs', tokens.length ? tokens.join(' · ') : `${p.primaryLanguage} syntax`, tokens.length ? 'Code becomes your ammo' : 'Language-forged ammo');
    if (hero.code?.signature) add('name', p.dna?.identifiers[0] ?? hero.code.signature, `signature: ${hero.code.signature}`, 'signature');
    add('class', lang, `class: ${hero.design?.archetype ?? hero.title}`);
    add('palette', lang, hero.design ? 'Your signature colors' : 'Language-forged colors');
    budget = heroBudget(hero);
    if (hero.quality === undefined) {
      add('stats', `${human(p.totalFiles)} files · ${human(p.components.length)} modules`, '5 points · one fair fight');
      const actual = [
        `${human(hero.maxHp)} HP`, `${human(hero.maxArmor)} armor`, `${human(hero.maxEnergy)} energy`,
        `${human(hero.speed)} speed`, `${human(hero.damageMul)}× damage`,
      ];
      budget.forEach((b, i) => add('stats', `${b.label} · ${human(b.value)} ${b.value === 1 ? 'point' : 'points'}`, actual[i], b.label));
    }
    if (hero.code?.snippet) add('cape', hero.code.snippet, 'Your code, etched into your outfit', p.dna?.snippets[0]?.file ?? p.heart);
    if (hero.design) add('cape', `class: ${hero.design.archetype}`, `${hero.design.headgear} · ${hero.design.accessory}`);
    add('name', p.slug, `name: ${hero.title}`);
  } else {
    const boss = kit as BossKit;
    // Transitional callers may still hold pre-contract kits in memory.
    if (boss.archetype) trace.push(bossArchetypeTrace(p, boss));
    for (const limb of boss.limbs) {
      const c = p.components.find(c => c.name === limb.component);
      add('limb', c ? withMetric(c.name, `${human(c.loc)} LOC`) : 'No modules found', withMetric(boss.design?.limbNames[limb.id] ?? leaf(limb.component), `${human(limb.maxHp)} HP`), limb.id);
    }
    add('heart', `${human(p.cycles.length)} cycles · heart fan-in ${human(p.heartFanIn)}`, `heart: ${leaf(boss.heart)}`, p.heart);
    for (const limb of boss.limbs) {
      add('weakpoint', withMetric(limb.component, limb.weakPoint ? 'dependency loop' : 'no cycles'), limb.weakPoint ? 'Glowing weak point · 1.5× damage' : 'Armored limb', limb.id);
    }
    add('eyes', boss.design ? `${human(p.contributors)} contributors` : 'A creature takes shape', boss.design ? `${human(boss.design.eyes)} watchful eyes` : `${3 + ((boss.seed >>> 0) % 6)} watchful eyes`);
    add('limb', `${human(p.edges.length)} import connections`, 'Dependencies become tentacles', 'dependencies');
    if (boss.design) add('class', `${human(p.components.length)} modules entwined`, `${boss.design.body} · ${boss.design.growths.join(' · ')}`);
    add('scars', 'A battle-worn creature', 'Scars across its hide');
    if (p.dna?.commits.length) add('name', `${human(p.commits)} commits`, 'Commit messages become taunts', 'commits');
    const todos = p.dna?.counts.todo ?? 0;
    add('minions', `${human(todos)} TODOs · unfinished business`, boss.code?.todos.length ? 'Your TODOs name the bug swarm' : 'A bug swarm awaits');
    for (const attack of boss.attacks) {
      add('attack', attackReason(p, boss, attack), attack.name, attack.id);
    }
    budget = bossBudget(boss);
    add('stats', 'One squad · one shared challenge', `${human(boss.maxHp)} HP · equal threat`);
    add('stats', 'The heart grows desperate', `Enrages at ${pct(boss.enrageAt)} HP`);
    add('theme', withMetric(p.primaryLanguage, `${human(p.ageDays)} days old`), `arena: ${boss.theme}`);
    add('palette', lang, 'Monster-forged colors');
    add('glyphs', tokens.length ? tokens.join(' · ') : 'No code samples found', tokens.length ? 'Code carved into the monster' : 'A creature takes shape');
    add('name', p.slug, `name: ${boss.name}`);

    // Phones may show only eight steps. Keep the silhouette's real-code reason
    // in that opening alongside anatomy, heart, vulnerability and an attack.
    const highlights = [
      trace.find(t => t.part === 'limb'), trace.find(t => t.part === 'heart'),
      trace.find(t => t.ref === 'archetype'),
      trace.find(t => t.part === 'weakpoint' && boss.limbs.some(l => l.id === t.ref && l.weakPoint)) ?? trace.find(t => t.part === 'eyes'),
      trace.find(t => t.part === 'attack'),
    ].filter((t): t is TraceStep => !!t);
    trace.splice(0, trace.length, ...highlights, ...trace.filter(t => !highlights.includes(t)));
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
    for (const step of trace) { step.from = step.from.slice(0, cap); if (step.part !== 'weapon') step.to = step.to.slice(0, cap); if (step.ref) step.ref = step.ref.slice(0, cap); }
  }
  return genesis;
}
