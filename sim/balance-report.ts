/** Reproduce with `npx tsx sim/balance-report.ts`; optional argv are parallel-run row JSONs. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { loadBalanceProfiles, runBalance, type BalanceRow } from './bots.ts';
import { ARCHETYPE_DECKS, bossArchetypeFromProfile } from './archetypes.ts';
import { ARCHETYPE_CONTACT_COST, ATTACK_COST, BATTLE_DIFFICULTY, MATCH_TUNING, SQUAD_TUNING, squadBudget } from './balance.ts';
import { BOSS_HIT_RADII } from './regions.ts';

const profiles = loadBalanceProfiles(), counts = [1, 4, 6, 8];
const rows: (BalanceRow & { archetype: string })[] = (process.argv.length > 2
  ? process.argv.slice(2).flatMap(file => JSON.parse(readFileSync(file, 'utf8')) as BalanceRow[])
  : runBalance(profiles, 5, counts)).map(row => ({ ...row, archetype: bossArchetypeFromProfile(profiles.find(p => p.slug === row.boss)!).archetype }));
assert.equal(rows.length, profiles.length * counts.length);
assert.equal(new Set(rows.map(r => `${r.boss}:${r.players}`)).size, rows.length);
assert.ok(rows.every(r => r.runs === 5 && counts.includes(r.players)));
const sum = (rs: typeof rows, value: (row: typeof rows[number]) => number) => rs.reduce((total, row) => total + value(row), 0);
const mergeCounts = (rs: typeof rows, field: 'perksPicked' | 'pickupsCollected') => {
  const result: Record<string, number> = {};
  for (const row of rs) for (const [key, count] of Object.entries(row[field])) result[key] = (result[key] ?? 0) + count;
  return result;
};
function summary(rs: typeof rows) {
  const wins = sum(rs, r => r.wins), runs = sum(rs, r => r.runs);
  return { wins, runs, winRate: wins / runs, meanDuration: sum(rs, r => r.duration * r.runs) / runs,
    meanWin: wins ? sum(rs, r => r.winDuration * r.wins) / wins : 0, reviews: sum(rs, r => r.reviews),
    blocksBroken: sum(rs, r => r.blocksBroken), perksPicked: mergeCounts(rs, 'perksPicked'), pickupsCollected: mergeCounts(rs, 'pickupsCollected') };
}
const archetypeSummary = counts.filter(n => n >= 4).flatMap(players => Object.keys(ARCHETYPE_DECKS).map(archetype => {
  const result = { players, archetype, ...summary(rows.filter(r => r.players === players && r.archetype === archetype)) };
  // Later user requests reduce HP to1/3 and damage/cast rate to2/3. The original archetype
  // calibration bands remain historical evidence, not assertions for the easier raid preset.
  return result;
}));
const sha = (file: string) => createHash('sha256').update(readFileSync(new URL(`../${file}`, import.meta.url))).digest('hex');
const runtimeFiles = readdirSync(new URL('.', import.meta.url)).filter(f => f.endsWith('.ts') && !/\.test\.|smoke|balance-report|classroom-bots/.test(f));
const report = {
  game: 'Gitzilla', round: 'archetypes', codeFlavor: true, socialImpact: true, correctedIdleCooldown: true, publicFallbacksOnly: true,
  trialsPerCell: 5, counts, pairedBotSeedBase: 1009, botSkills: [0.55, 0.67, 0.79, 0.55, 0.67],
  method: 'Five deterministic paired trials per repo and squad size; identical normal-input bots face every repo. Archetype cohorts contain 3–5 repos (15–25 trials); these are calibration observations, not human or population win-rate estimates.',
  reproduce: 'npx tsx sim/balance-report.ts', defaults: { ...MATCH_TUNING, difficulty: BATTLE_DIFFICULTY, squads: SQUAD_TUNING, contactCosts: ARCHETYPE_CONTACT_COST },
  budgets: counts.map(players => ({ players, ...squadBudget(players) })), attackCosts: ATTACK_COST, decks: ARCHETYPE_DECKS,
  selection: profiles.map(p => ({ repo: p.slug, ...bossArchetypeFromProfile(p) })),
  summary: counts.map(players => ({ players, ...summary(rows.filter(r => r.players === players)) })), archetypeSummary, rows,
  publicProfileHashes: profiles.map(p => ({ repo: p.slug, sha256: createHash('sha256').update(JSON.stringify(p)).digest('hex') })),
  runtimeHashes: Object.fromEntries([...runtimeFiles.map(f => `sim/${f}`), 'shared/types.ts', 'shared/kaiju-anatomy.ts'].map(f => [f, sha(f)])),
  anatomy: { helper: 'shared/kaiju-anatomy.ts#bossAnchors', sha256: sha('shared/kaiju-anatomy.ts'), radii: BOSS_HIT_RADII,
    hydraFlight: '3.5s/14s; heads + wings; 0.85s takeoff notice', mechaHop: 'up to60px/0.45s, hittable',
    abyssalBurrow: '0.55s in recovery, >=8s apart; 0.85s harmless destination warning', death: '2s, excluded from duration' },
};
writeFileSync(new URL('./balance-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log('| Archetype | Players | Wins | Win rate | Mean fight | Mean victory |\n| --- | ---: | ---: | ---: | ---: | ---: |');
for (const r of archetypeSummary) console.log(`| ${r.archetype} | ${r.players} | ${r.wins}/${r.runs} | ${(r.winRate * 100).toFixed(1)}% | ${r.meanDuration.toFixed(1)}s | ${r.meanWin.toFixed(1)}s |`);
