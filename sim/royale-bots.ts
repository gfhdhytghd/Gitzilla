import { pathToFileURL } from 'node:url';
import { createMatch } from './match.ts';
import { createBot, loadBalanceProfiles, syntheticProfile } from './bots.ts';
import { playerKitFromProfile } from './kits.ts';
import type { ClassroomRankingRow, RoyaleElimination } from './pvp.ts';
import type { InputFrame, WeaponKind } from '../shared/types.ts';
import { ROYALE_TUNING, royaleTimeline } from './royale-balance.ts';
import { pvpPowerFromProfile } from './pvpPower.ts';

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
    controls: 'Actual repo-power public kits, normal-input bots, paired seeds1009+trial401+slot37, skills0.55/0.67/0.79. Roster index(trial+slot*7)%15 balances every repo across every slot each15 trials. No source/health/outcome overrides. Quartiles are global rank cohorts across15 real profiles; weapon/skill styles are retained. Separate controlled duels isolate stat power.',
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
  console.log(JSON.stringify(royaleSweep(Number(process.argv[2] ?? 30)), null, 2));

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
