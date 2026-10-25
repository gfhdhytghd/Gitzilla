import { pathToFileURL } from 'node:url';
import { createMatch } from './match.ts';
import { createReferenceBot as createBot, loadBalanceProfiles, syntheticProfile } from './bots.ts';
import { playerKitFromProfile } from './kits.ts';
import type { ClassroomRankingRow, RoyaleElimination } from './pvp.ts';
import type { InputFrame, MatchState, PlayerState, WeaponKind } from '../shared/types.ts';
import { ROYALE_TUNING, royaleTimeline } from './royale-balance.ts';
import { pvpPowerFromProfile } from './pvpPower.ts';
import { createPvpController } from './pvpAi.ts';
import { distance, random, unit } from './math.ts';
import { WEAPONS } from './weapons.ts';

interface RoyaleRun {
  players: number; trial: number; arena: { width: number; height: number }; duration: number; winner: string | null;
  maxBullets: number; pickups: number; weaponKOs: number; gcKOs: number;
  zoneStartedAt: number; zonePhaseKOs: number; zonePhaseSeconds: number; gcDecided: boolean;
  eliminations: RoyaleElimination[]; ranking: ClassroomRankingRow[];
  entrants: { id: string; repo: string; power: number; quartile: number }[];
}

/** Separate neutral five-point fixture: point-blank sustained input, no defender movement/skills.
 * Clock starts at the first damaging shot after countdown/spawn shield, not at room creation.
 */
export function focusedFireTrials() {
  return (['blaster', 'smg', 'shotgun', 'cannon', 'staff', 'laser', 'blade'] as WeaponKind[]).map(weapon => {
    const kit = { ...playerKitFromProfile(syntheticProfile(1)), maxHp: 6, maxArmor: 4, maxEnergy: 185, speed: 85, damageMul: 1, weapon,
      pvpPower: { score: 50, parts: [{ label: 'Synthetic power50 control', value: 50, weight: 1 }] } };
    // This explicit reference fixture has no real-repo evidence; roster sweeps below always do.
    delete (kit as import('./quality.ts').ClassroomKit).classroom; delete (kit as import('./quality.ts').ClassroomKit).powerSource;
    const match = createMatch([{ id: 'a', name: 'Focus', kit }, { id: 'b', name: 'Target', kit }], null, { mode: 'pvp' });
    const raw = match as unknown as { state: import('./pvp.ts').ClassroomState };
    raw.state.players[0].x = 180; raw.state.players[0].y = 128; raw.state.players[1].x = 220; raw.state.players[1].y = 128;
    const input: InputFrame = { seq: 1, move: [0, 0], aim: [1, 0], fire: true, dash: false, skill: false, source: 'keyboard' };
    let firstHitAt: number | null = null, impacts = 0;
    while (!match.over && raw.state.t < 40) {
      match.step(1 / 30, new Map([['a', input]])); const s = match.snapshot();
      const hits = s.events.filter(e => e.type === 'hit' && e.source === 'a' && e.amount > 0);
      if (hits.length && firstHitAt === null) firstHitAt = s.t;
      impacts += hits.length;
    }
    return { weapon, seconds: raw.state.t - (firstHitAt ?? 0), impacts, eliminated: raw.state.players[1].eliminated === true,
      fixture: 'Synthetic power50 control,8HP+5armor,215RAM,90speed,1.375damage;40px range; no defender actions' };
  });
}

/** Normal-input public-repo playtest; never changes health, stats, placement or outcomes. */
export function royaleSweep(trials = 30) {
  const profiles = loadBalanceProfiles(), runs: RoyaleRun[] = [];
  const ordered = profiles.map(profile => ({ profile, power: pvpPowerFromProfile(profile).score })).sort((a, b) => a.power - b.power || a.profile.slug.localeCompare(b.profile.slug));
  const quartile = new Map(ordered.map((p, i) => [p.profile.slug, Math.min(4, 1 + Math.floor(i * 4 / ordered.length))]));
  for (const count of [2, 4, 8]) for (let trial = 0; trial < trials; trial++) {
    const roster = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Bot ${i + 1}`,
      kit: playerKitFromProfile(profiles[(trial + i * 7) % profiles.length], { mode: 'pvp' }) }));
    const match = createMatch(roster, null, { mode: 'pvp' });
    const bots = roster.map((_, i) => createBot(1009 + trial * 401 + i * 37, 0.55 + trial % 3 * 0.12));
    let maxBullets = 0, pickups = 0;
    while (!match.over) {
      const state = match.snapshot(); maxBullets = Math.max(maxBullets, state.bullets.length);
      pickups += state.events.filter(event => event.type === 'pickup').length;
      if (!state.players.every(p => Number.isFinite(p.x + p.y + p.hp + p.energy + p.armor))) throw new Error('Non-finite royale state');
      match.step(1 / 30, new Map(state.players.map((p, i) => [p.id, bots[i](state, p)])));
    }
    const state = match.snapshot(), report = match.autopsy();
    if (state.players.filter(p => p.alive).length !== 1 || !report.royale?.winner) throw new Error('Missing sole survivor');
    runs.push({ players: count, trial, arena: { width: state.pvp.arenaW, height: state.pvp.arenaH },
      duration: report.duration, winner: report.mvp, maxBullets, pickups,
      weaponKOs: report.royale.eliminations.filter(e => e.reason === 'weapon').length,
      gcKOs: report.royale.eliminations.filter(e => e.reason === 'zone' || e.reason === 'timeout').length,
      zoneStartedAt: state.pvp.royale!.zone!.shrinkStart - 2,
      zonePhaseKOs: report.royale.eliminations.filter(e => e.at >= state.pvp.royale!.zone!.shrinkStart).length,
      zonePhaseSeconds: Math.max(0, report.duration - (state.pvp.royale!.zone!.shrinkStart - 2)),
      gcDecided: ['zone', 'timeout'].includes(report.royale.eliminations.at(-1)!.reason),
      entrants: roster.map(p => ({ id: p.id, repo: p.kit.repo, power: (p.kit as import('./quality.ts').ClassroomKit).pvpPower!.score, quartile: quartile.get(p.kit.repo)! })),
      eliminations: report.royale.eliminations as RoyaleElimination[], ranking: report.ranking });
  }
  return { game: 'Gitzilla', mode: 'pvp', royale: true, publicFallbacksOnly: true, trials,
    controls: 'Actual repo-power public kits, archived pre-soft-AI reference inputs (createReferenceBot), paired seeds1009+trial401+slot37, skills0.55/0.67/0.79. Roster index(trial+slot*7)%15 balances every repo across every slot each15 trials. No source/health/outcome overrides. Quartiles are global rank cohorts across15 real profiles; weapon/skill styles are retained. Separate controlled duels isolate stat power; live softer-AI acceptance is pvp-ai-bots.ts.',
    repoPower: ordered.map(({ profile, power }) => ({ repo: profile.slug, score: power, quartile: quartile.get(profile.slug)! })),
    powerQuartiles: [1, 2, 3, 4].map(quartile => {
      const entrants = runs.flatMap(run => run.entrants.filter(p => p.quartile === quartile).map(p => ({ ...p, won: p.id === run.winner })));
      const wins = entrants.filter(p => p.won).length;
      return { quartile, entries: entrants.length, wins, winRate: wins / Math.max(1, entrants.length) };
    }),
    tuning: { ...ROYALE_TUNING, timelines: [2, 4, 8].map(players => ({ players, ...royaleTimeline(players) })) },
    focusedFire: focusedFireTrials(),
    controlledPowerDuels: controlledPowerDuels(),
    summary: [2, 4, 8].map(players => {
      const group = runs.filter(run => run.players === players);
      const meanDuration = group.reduce((s, r) => s + r.duration, 0) / group.length;
      const target = [60, 180];
      return { players, matches: group.length, meanDuration, target, durationTargetMet: meanDuration >= target[0] && meanDuration <= target[1],
        maxDuration: Math.max(...group.map(r => r.duration)), weaponKOs: group.reduce((s, r) => s + r.weaponKOs, 0),
        gcKOs: group.reduce((s, r) => s + r.gcKOs, 0), maxBullets: Math.max(...group.map(r => r.maxBullets)),
        pickups: group.reduce((s, r) => s + r.pickups, 0), uniqueWinners: new Set(group.map(r => r.winner)).size,
        zoneReachedMatches: group.filter(r => r.zonePhaseSeconds > 0).length,
        zoneDecidedMatches: group.filter(r => r.gcDecided).length,
        zonePhaseKOs: group.reduce((s, r) => s + r.zonePhaseKOs, 0),
        closingPhaseFraction: group.reduce((s, r) => s + r.zonePhaseSeconds, 0) / group.reduce((s, r) => s + r.duration, 0) };
    }), runs };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(process.argv.includes('--contact') ? contactSweep(Number(process.argv[2] ?? 30), process.argv.includes('--duels') ? [2] : [2, 4, 8]) : royaleSweep(Number(process.argv[2] ?? 30)), null, 2));

/** Actual profiles, identical blaster/firewall and controller skill, every pairing in both spawn slots. */
export function controlledPowerDuels(trialsPerPair = 10) {
  const sorted = loadBalanceProfiles().sort((a, b) => pvpPowerFromProfile(a).score - pvpPowerFromProfile(b).score || a.slug.localeCompare(b.slug));
  const groups = [1, 2, 3, 4].map(q => sorted.filter((_, i) => Math.min(4, 1 + Math.floor(i * 4 / sorted.length)) === q));
  const rows: { lowQuartile: number; highQuartile: number; matches: number; higherQuartileWins: number; unequalPowerMatches: number; higherPowerWins: number; meanDuration: number }[] = [];
  const quartiles = [1, 2, 3, 4].map(quartile => ({ quartile, entries: 0, wins: 0, winRate: 0 }));
  for (let low = 0; low < 3; low++) for (let high = low + 1; high < 4; high++) {
    let higherQuartileWins = 0, higherPowerWins = 0, unequalPowerMatches = 0, duration = 0;
    for (let trial = 0; trial < trialsPerPair; trial++) for (const swap of [false, true]) {
      const chosen = [groups[low][trial % groups[low].length], groups[high][trial % groups[high].length]];
      const unequal = pvpPowerFromProfile(chosen[1]).score > pvpPowerFromProfile(chosen[0]).score;
      if (swap) chosen.reverse();
      const roster = chosen.map((p, i) => ({ id: `p${i}`, name: `Bot ${i}`, kit: { ...playerKitFromProfile(p, { mode: 'pvp' }), weapon: 'blaster' as const, skill: 'firewall' as const } }));
      const match = createMatch(roster, null, { mode: 'pvp' }), bots = roster.map((_, i) => createBot(1009 + trial * 401 + i * 37, 0.7));
      while (!match.over) { const s = match.snapshot(); match.step(1 / 30, new Map(s.players.map((p, i) => [p.id, bots[i](s, p)]))); }
      const result = match.autopsy(), wonHigh = result.mvp === (swap ? 'p0' : 'p1');
      if (wonHigh) higherQuartileWins++;
      if (unequal) { unequalPowerMatches++; if (wonHigh) higherPowerWins++; }
      duration += result.duration;
      quartiles[low].entries++; quartiles[high].entries++; quartiles[wonHigh ? high : low].wins++;
    }
    rows.push({ lowQuartile: low + 1, highQuartile: high + 1, matches: trialsPerPair * 2, higherQuartileWins, unequalPowerMatches, higherPowerWins, meanDuration: duration / (trialsPerPair * 2) });
  }
  quartiles.forEach(q => { q.winRate = q.wins / q.entries; });
  return { controls: 'Actual public profiles; same blaster,firewall,0.7 controller skill; paired seeds and both slot assignments; no health/source/outcome overrides. Equal-score cross-quartile pairs remain in quartile statistics but are excluded from the strictly-higher-power metric.',
    higherPowerWinRate: rows.reduce((s, r) => s + r.higherPowerWins, 0) / rows.reduce((s, r) => s + r.unequalPowerMatches, 0), rows, quartiles };
}


/** Phone-motion approximation, not human evidence. Holds stale input between ~300ms decisions;
 * broad tilt error, imperfect lead, burst pauses and wandering/dashes, no projectile oracle.
 * Frozen before the combat changes so before/after runs use exactly the same inputs policy.
 */
export function createMotionPlayer(seed: number) {
  const rng = random(seed), side = seed & 1 ? 1 : -1;
  let next = 0, seq = 0, burst = false, switchAt = 0, dashAt = 3, skillAt = 6;
  let frame: InputFrame = { seq: 0, move: [0, 0], aim: [1, 0], fire: false, dash: false, skill: false, source: 'motion' };
  return (s: MatchState, p: PlayerState): InputFrame => {
    if (!p.alive) return { ...frame, seq: seq++, fire: false, dash: false, skill: false, move: [0, 0] };
    if (s.t < next) return { ...frame, seq: seq++, dash: false, skill: false };
    next = s.t + 0.27 + rng() * 0.08;
    if (s.t >= switchAt) { burst = !burst; switchAt = s.t + (burst ? 0.65 + rng() * 0.8 : 0.35 + rng() * 0.65); }
    const foe = s.players.filter(q => q.alive && q.id !== p.id).sort((a, b) => distance(p, a) - distance(p, b))[0];
    if (!foe) return { ...frame, seq: seq++, fire: false, dash: false, skill: false };
    const w = WEAPONS[p.kit.weapon], d = distance(p, foe), toward = unit(foe.x - p.x, foe.y - p.y);
    const range = Math.min(155, w.speed * w.life * 0.6), radial = d > range ? 0.65 : d < range * 0.6 ? -0.4 : 0;
    const wander = Math.sin(s.t * 0.7 + seed) * 0.65 + (rng() - 0.5) * 0.5;
    let mx = toward[0] * radial - toward[1] * side * wander, my = toward[1] * radial + toward[0] * side * wander;
    const zone = s.pvp?.royale?.zone;
    if (zone && s.t > zone.shrinkStart + 0.6 && distance(p, { x: zone.cx, y: zone.cy }) > zone.r - 12) {
      const inward = unit(zone.cx - p.x, zone.cy - p.y);
      mx = inward[0] + Math.sin(s.t + seed) * 0.3; my = inward[1] + Math.cos(s.t + seed) * 0.3;
    }
    const lead = Math.min(0.35, d / (w.speed * 1.35)) * (rng() * 1.2 - 0.3);
    const error = (rng() * 2 - 1) * (25 + rng() * 10) * Math.PI / 180;
    const a = Math.atan2(foe.y + foe.vy * lead - p.y, foe.x + foe.vx * lead - p.x) + error;
    const dash = s.t >= dashAt && rng() < 0.35;
    if (s.t >= dashAt) dashAt = s.t + 2.5 + rng() * 3;
    const skill = s.t >= skillAt && rng() < 0.45;
    if (s.t >= skillAt) skillAt = s.t + 3 + rng() * 3;
    const length = Math.max(1, Math.hypot(mx, my));
    frame = { seq: seq++, move: [mx / length, my / length], aim: [Math.cos(a), Math.sin(a)], fire: burst, dash, skill, source: 'motion' };
    return frame;
  };
}

/** Paired normal-input measurement: all public kits, three input profiles, identical trial seeds. */
export function contactSweep(trials = 30, counts = [2, 4, 8]) {
  const profiles = loadBalanceProfiles();
  const runs: { profile: string; players: number; trial: number; duration: number; winner: string | null;
    weaponKOs: number; creditedZone: number; uncreditedZone: number; uncreditedDecider: boolean;
    eliminations: RoyaleElimination[] }[] = [];
  for (const profile of ['perfect', 'motion', 'mixed'] as const) for (const count of counts) for (let trial = 0; trial < trials; trial++) {
    const roster = Array.from({ length: count }, (_, slot) => ({ id: profile === 'mixed' && slot % 2 ? `bot-${slot}` : `p${slot}`,
      name: `Player ${slot}`, kit: playerKitFromProfile(profiles[(trial + slot * 7) % profiles.length], { mode: 'pvp' }) }));
    const controllers = roster.map((_, slot) => {
      const seed = 1009 + trial * 401 + slot * 37;
      return profile === 'perfect' ? createBot(seed, 0.55 + trial % 3 * 0.12)
        : profile === 'mixed' && slot % 2 ? createPvpController(seed) : createMotionPlayer(seed);
    });
    const match = createMatch(roster, null, { mode: 'pvp' });
    while (!match.over) {
      const s = match.snapshot();
      if (s.t > 240) throw new Error('Unbounded contact match');
      match.step(1 / 30, new Map(s.players.map((p, i) => [p.id, controllers[i](s, p)])));
    }
    const report = match.autopsy(), eliminations = report.royale!.eliminations;
    runs.push({ profile, players: count, trial, duration: report.duration, winner: report.mvp,
      weaponKOs: eliminations.filter(e => e.reason === 'weapon').length,
      creditedZone: eliminations.filter(e => ['zone', 'timeout'].includes(e.reason) && e.by !== null).length,
      uncreditedZone: eliminations.filter(e => ['zone', 'timeout'].includes(e.reason) && e.by === null).length,
      uncreditedDecider: eliminations.at(-1)?.by === null, eliminations });
  }
  return { trials, controls: 'Paired public15 kits, roster(trial+slot*7)%15, seed1009+trial401+slot37; perfect=archived sustained reference (still reaction/dodge/retreat); motion=270–350ms,25–35deg error envelope,stale aim,imperfect lead,bursts,wander,dashes; mixed=half motion/half production soft AI with honest20% power handicap. No outcomes/health overrides. Synthetic inputs, not real human acceptance.',
    tuning: { ...ROYALE_TUNING, timelines: [2, 4, 8].map(players => ({ players, ...royaleTimeline(players) })) }, focusedFire: focusedFireTrials(),
    summary: ['perfect', 'motion', 'mixed'].flatMap(profile => counts.map(players => {
      const group = runs.filter(r => r.profile === profile && r.players === players);
      const sum = (key: 'weaponKOs' | 'creditedZone' | 'uncreditedZone') => group.reduce((s, r) => s + r[key], 0);
      const weaponKOs = sum('weaponKOs'), creditedZone = sum('creditedZone'), uncreditedZone = sum('uncreditedZone');
      return { profile, players, matches: group.length, weaponKOs, creditedZone, uncreditedZone,
        playerAttributed: (weaponKOs + creditedZone) / (weaponKOs + creditedZone + uncreditedZone),
        uncreditedDeciderRate: group.filter(r => r.uncreditedDecider).length / group.length,
        meanDuration: group.reduce((s, r) => s + r.duration, 0) / group.length };
    })), runs };
}
