import { pathToFileURL } from 'node:url';
import type { WeaponKind } from '../shared/types.ts';
import { loadBalanceProfiles, syntheticProfile } from './bots.ts';
import { playerKitFromProfile } from './kits.ts';
import { asPvpAiKit, asPvpKit } from './pvpPower.ts';
import { createPvpController, type PvpController, type PvpControllerMetrics } from './pvpAi.ts';
import { createMatch } from './match.ts';
import type { ClassroomKit } from './quality.ts';

const weapons: WeaponKind[] = ['blaster', 'smg', 'shotgun', 'cannon', 'staff', 'laser', 'blade'];
function fixedPower(score: number, weapon: WeaponKind, ai: boolean) {
  const kit = playerKitFromProfile(syntheticProfile(1)) as ClassroomKit;
  delete kit.classroom; delete kit.powerSource;
  kit.pvpPower = { score, parts: [{ label: 'Synthetic equal-final-power control', value: score, weight: 1 }] };
  kit.weapon = weapon; kit.skill = 'firewall';
  return ai ? asPvpAiKit(kit) : asPvpKit(kit);
}
function play(roster: { id: string; name: string; kit: ClassroomKit }[], controllers: PvpController[]) {
  const match = createMatch(roster, null, { mode: 'pvp' });
  while (!match.over) {
    const s = match.snapshot();
    match.step(1 / 30, new Map(s.players.map((p, i) => [p.id, controllers[i](s, p)])));
  }
  const report = match.autopsy();
  return { winner: report.mvp, placement: report.ranking.find(r => r.id === 'human')!.placement!, duration: report.duration };
}
function metrics(controllers: PvpController[]) {
  const sum = (key: keyof PvpControllerMetrics) => controllers.reduce((s, c) => s + c.metrics[key], 0);
  return { controllers: controllers.length, decisions: sum('decisions'), threats: sum('threats'), dodges: sum('dodges'),
    dodgeDecisionsRate: sum('dodges') / Math.max(1, sum('threats')), botTargets: sum('botTargets'), humanTargets: sum('humanTargets'),
    botTargetShare: sum('botTargets') / Math.max(1, sum('botTargets') + sum('humanTargets')),
    mixedChoices: sum('mixedChoices'), forcedBotChoices: sum('forcedBotChoices'), forcedBotChoiceRate: sum('forcedBotChoices') / Math.max(1, sum('mixedChoices')),
    minReaction: Math.min(...controllers.map(c => c.metrics.minReaction)), maxReaction: Math.max(...controllers.map(c => c.metrics.maxReaction)),
    maxAimError: Math.max(...controllers.map(c => c.metrics.maxAimError)), dashes: sum('dashes'), skills: sum('skills'),
    firingDuty: sum('fireFrames') / Math.max(1, sum('fireFrames') + sum('pauseFrames')) };
}

export function pvpAiSweep(trials = 120, trialOffset = 0) {
  const profiles = loadBalanceProfiles();
  const duels: { trial: number; weapon: WeaponKind; humanSlot: number; won: boolean; duration: number }[] = [];
  const royales: { trial: number; repo: string; humanSlot: number; humanPower: number; aiPowers: number[]; winner: string | null; placement: number; duration: number }[] = [];
  const duelAi: PvpController[] = [], fieldAi: PvpController[] = [], humans: PvpController[] = [];
  for (let trial = trialOffset; trial < trialOffset + trials; trial++) {
    const humanSlot = trial % 2, weapon = weapons[trial % weapons.length];
    const roster = [0, 1].map(i => ({ id: i === humanSlot ? 'human' : 'bot-1', name: i === humanSlot ? 'Human proxy' : 'AI',
      kit: fixedPower(i === humanSlot ? 70 : 87.5, weapon, i !== humanSlot) }));
    const controllers = roster.map((_, i) => createPvpController(1009 + trial * 401 + i * 37, i === humanSlot ? 'human-proxy' : 'ai'));
    const result = play(roster, controllers);
    duels.push({ trial, weapon, humanSlot, won: result.winner === 'human', duration: result.duration });
    duelAi.push(controllers[1 - humanSlot]); humans.push(controllers[humanSlot]);
  }
  for (let trial = trialOffset; trial < trialOffset + trials; trial++) {
    const humanSlot = trial % 8;
    const roster = Array.from({ length: 8 }, (_, i) => {
      const kit = playerKitFromProfile(profiles[(trial + i * 7) % profiles.length], { mode: 'pvp' });
      return { id: i === humanSlot ? 'human' : `bot-${i}`, name: i === humanSlot ? 'Human proxy' : `AI${i}`,
        kit: i === humanSlot ? kit as ClassroomKit : asPvpAiKit(kit) };
    });
    const controllers = roster.map((_, i) => createPvpController(1901 + trial * 401 + i * 37, i === humanSlot ? 'human-proxy' : 'ai'));
    const result = play(roster, controllers);
    royales.push({ trial, repo: roster[humanSlot].kit.repo, humanSlot, humanPower: roster[humanSlot].kit.pvpPower!.score,
      aiPowers: roster.filter((_, i) => i !== humanSlot).map(p => p.kit.pvpPower!.score), ...result });
    fieldAi.push(...controllers.filter((_, i) => i !== humanSlot)); humans.push(controllers[humanSlot]);
  }
  const wins = duels.filter(r => r.won).length, top3 = royales.filter(r => r.placement <= 3).length;
  return { game: 'Gitzilla', change: 'softer PvP AI', trials, trialOffset, simulatedHumanProxyOnly: true,
    controls: '1v1: explicit synthetic final POWER70 on both sides (AI base87.5 x.8); same weapon and firewall; alternating spawn slots;7 weapons cycle. 8p: actual15 fallback profiles;1 human-proxy +7 AI, AI raw repo score x.8; human cycles all8 spawns and profiles across120 trials. No hit/HP/outcome injection during matches.',
    proxy: 'Independent input-only comparator:300–400ms decisions,9–11deg aim envelope,50% threat dodge decisions, lead0.4–1.0, longer bursts/shorter pauses and moderately faster ability decisions. This is NOT actual human win probability.',
    duel: { wins, matches: trials, humanWinRate: wins / trials, meanDuration: duels.reduce((s, r) => s + r.duration, 0) / trials,
      aiMetrics: metrics(duelAi), runs: duels },
    royale: { top3, matches: trials, humanTop3Rate: top3 / trials, wins: royales.filter(r => r.winner === 'human').length,
      meanPlacement: royales.reduce((s, r) => s + r.placement, 0) / trials, meanDuration: royales.reduce((s, r) => s + r.duration, 0) / trials,
      aiMetrics: metrics(fieldAi), runs: royales }, humanMetrics: metrics(humans) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(pvpAiSweep(Number(process.argv[2] ?? 120), Number(process.argv[3] ?? 0)), null, 2));
