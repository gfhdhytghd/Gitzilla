import { pathToFileURL } from 'node:url';
import { createMatch } from './match.ts';
import { createBot, loadBalanceProfiles } from './bots.ts';
import { playerKitFromProfile } from './kits.ts';
import type { ClassroomRankingRow, RoyaleElimination } from './pvp.ts';

interface RoyaleRun {
  players: number; trial: number; arena: { width: number; height: number }; duration: number; winner: string | null;
  maxBullets: number; pickups: number; weaponKOs: number; gcKOs: number;
  eliminations: RoyaleElimination[]; ranking: ClassroomRankingRow[];
}

/** Normal-input public-repo playtest; never changes health, stats, placement or outcomes. */
export function royaleSweep(trials = 5) {
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
      eliminations: report.royale.eliminations as RoyaleElimination[], ranking: report.ranking });
  }
  return { game: 'Gitzilla', mode: 'pvp', royale: true, publicFallbacksOnly: true, trials,
    controls: 'Actual equal-budget public kits, normal-input bots, paired seeds1009+trial401+slot37, skills0.55/0.67/0.79. No source/health/outcome overrides.',
    summary: [2, 4, 8].map(players => {
      const group = runs.filter(run => run.players === players);
      return { players, matches: group.length, meanDuration: group.reduce((s, r) => s + r.duration, 0) / group.length,
        maxDuration: Math.max(...group.map(r => r.duration)), weaponKOs: group.reduce((s, r) => s + r.weaponKOs, 0),
        gcKOs: group.reduce((s, r) => s + r.gcKOs, 0), maxBullets: Math.max(...group.map(r => r.maxBullets)),
        pickups: group.reduce((s, r) => s + r.pickups, 0), uniqueWinners: new Set(group.map(r => r.winner)).size };
    }), runs };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(royaleSweep(Number(process.argv[2] ?? 5)), null, 2));
