import { pathToFileURL } from 'node:url';
import { createMatch } from './match.ts';
import { createBot, loadBalanceProfiles, syntheticProfile } from './bots.ts';
import { playerKitFromProfile } from './kits.ts';
import type { ClassroomRankingRow, RoyaleElimination } from './pvp.ts';
import type { InputFrame, WeaponKind } from '../shared/types.ts';
import { ROYALE_TUNING, royaleTimeline } from './royale-balance.ts';

interface RoyaleRun {
  players: number; trial: number; arena: { width: number; height: number }; duration: number; winner: string | null;
  maxBullets: number; pickups: number; weaponKOs: number; gcKOs: number;
  zoneStartedAt: number; zonePhaseKOs: number; zonePhaseSeconds: number; gcDecided: boolean;
  eliminations: RoyaleElimination[]; ranking: ClassroomRankingRow[];
}

/** Separate neutral five-point fixture: point-blank sustained input, no defender movement/skills.
 * Clock starts at the first damaging shot after countdown/spawn shield, not at room creation.
 */
export function focusedFireTrials() {
  return (['blaster', 'smg', 'shotgun', 'cannon', 'staff', 'laser', 'blade'] as WeaponKind[]).map(weapon => {
    const kit = { ...playerKitFromProfile(syntheticProfile(1)), maxHp: 6, maxArmor: 4, maxEnergy: 185, speed: 85, damageMul: 1, weapon };
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
      fixture: 'Neutral five-point budget,6HP+4armor,185RAM,85speed,1damage;40px range; no defender actions' };
  });
}

/** Normal-input public-repo playtest; never changes health, stats, placement or outcomes. */
export function royaleSweep(trials = 10) {
  const profiles = loadBalanceProfiles(), runs: RoyaleRun[] = [];
  for (const count of [2, 4, 8]) for (let trial = 0; trial < trials; trial++) {
    const roster = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Bot ${i + 1}`,
      kit: playerKitFromProfile(profiles[(trial * 3 + i) % profiles.length], { mode: 'pvp' }) }));
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
      eliminations: report.royale.eliminations as RoyaleElimination[], ranking: report.ranking });
  }
  return { game: 'Gitzilla', mode: 'pvp', royale: true, publicFallbacksOnly: true, trials,
    controls: 'Actual equal-budget public kits, normal-input bots, paired seeds1009+trial401+slot37, skills0.55/0.67/0.79. No source/health/outcome overrides. PvP bots retreat to recharge, project movement off walls and obey the zone; edu/battle controllers unchanged.',
    tuning: { ...ROYALE_TUNING, timelines: [2, 4, 8].map(players => ({ players, ...royaleTimeline(players) })) },
    focusedFire: focusedFireTrials(),
    summary: [2, 4, 8].map(players => {
      const group = runs.filter(run => run.players === players);
      const meanDuration = group.reduce((s, r) => s + r.duration, 0) / group.length;
      const target = players === 2 ? [60, 90] : players === 4 ? [90, 130] : [120, 160];
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
  console.log(JSON.stringify(royaleSweep(Number(process.argv[2] ?? 10)), null, 2));
