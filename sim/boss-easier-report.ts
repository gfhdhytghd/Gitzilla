/** Reproduce paired current-HP baseline/easier sweeps; optional6 args are3 baseline +3 easier row files. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { runBalance, loadBalanceProfiles, type BalanceRow } from './bots.ts';
import { BATTLE_DIFFICULTY, MATCH_TUNING, squadBudget } from './balance.ts';

const profiles = loadBalanceProfiles(), counts = [4, 6, 8], files = process.argv.slice(2);
function baseline() {
  const saved = { ...BATTLE_DIFFICULTY };
  try { Object.assign(BATTLE_DIFFICULTY, { damage: 1, attackFrequency: 1 }); return runBalance(profiles, 5, counts); }
  finally { Object.assign(BATTLE_DIFFICULTY, saved); }
}
if (files.length) assert.equal(files.length, 6, 'Provide3 baseline and3 easier files');
const before: BalanceRow[] = files.length ? files.slice(0, 3).flatMap(f => JSON.parse(readFileSync(f, 'utf8'))) : baseline();
const after: BalanceRow[] = files.length ? files.slice(3).flatMap(f => JSON.parse(readFileSync(f, 'utf8'))) : runBalance(profiles, 5, counts);
for (const rows of [before, after]) {
  assert.equal(rows.length, profiles.length * 3); assert.ok(rows.every(r => r.runs === 5 && counts.includes(r.players)));
  assert.equal(new Set(rows.map(r => `${r.boss}:${r.players}`)).size, rows.length);
}
const summarize = (rows: BalanceRow[], players: number) => {
  const group = rows.filter(r => r.players === players), runs = group.reduce((s, r) => s + r.runs, 0), wins = group.reduce((s, r) => s + r.wins, 0);
  return { wins, runs, winRate: wins / runs, meanDuration: group.reduce((s, r) => s + r.duration * r.runs, 0) / runs,
    meanVictory: group.reduce((s, r) => s + r.winDuration * r.wins, 0) / Math.max(1, wins) };
};
const summary = counts.map(players => ({ players, hp: squadBudget(players).hp, before: summarize(before, players), after: summarize(after, players) }));
const hashes = Object.fromEntries(['sim/balance.ts', 'sim/bossAi.ts', 'sim/bossMotion.ts', 'sim/match.ts', 'sim/kits.ts', 'sim/bots.ts', 'sim/weapons.ts', 'shared/kaiju-anatomy.ts']
  .map(file => [file, createHash('sha256').update(readFileSync(new URL(`../${file}`, import.meta.url))).digest('hex')]));
const report = { game: 'Gitzilla', change: 'battle bosses one third less damage and one third fewer attacks', mode: 'battle',
  trialsPerCell: 5, counts, profiles: profiles.length, matches: { before: before.reduce((s, r) => s + r.runs, 0), after: after.reduce((s, r) => s + r.runs, 0) }, publicFallbacksOnly: true,
  controls: 'Same normal-input squads, paired seeds1009+trial401+slot37, skills0.55/0.67/0.79. Both arms use the current already-reduced linear HP. No health/outcome overrides. User requested easier bosses; historical55–70% wins/150–210s archetype bands are superseded.',
  difficulty: { before: { damage: 1, attackFrequency: 1 }, after: BATTLE_DIFFICULTY }, healthTuningUnchanged: MATCH_TUNING,
  budgets: counts.map(players => ({ players, ...squadBudget(players) })), telegraph: 'Unchanged .95s generated/heart attacks and pressure warnings',
  summary, before, after, sourceHashes: hashes,
  publicProfiles: profiles.map(p => ({ repo: p.slug, sha256: createHash('sha256').update(JSON.stringify(p)).digest('hex') })),
};
writeFileSync(new URL('./boss-easier-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log('| Players | HP unchanged | Prior wins | New wins | Prior mean | New mean | New victory mean |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const r of summary) console.log(`| ${r.players} | ${r.hp} | ${r.before.wins}/${r.before.runs} (${(100 * r.before.winRate).toFixed(1)}%) | ${r.after.wins}/${r.after.runs} (${(100 * r.after.winRate).toFixed(1)}%) | ${r.before.meanDuration.toFixed(1)}s | ${r.after.meanDuration.toFixed(1)}s | ${r.after.meanVictory.toFixed(1)}s |`);
