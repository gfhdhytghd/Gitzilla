import { pathToFileURL } from 'node:url';
import type { CodeDNA } from '../shared/types.ts';
import { syntheticProfile, createBot } from './bots.ts';
import { playerKitFromProfile } from './kits.ts';
import { ClassroomMatch } from './pvp.ts';

/** Explicit synthetic quality measurements: no claims about a real student's code. */
export function qualityProfile(strong: boolean, seed = 1) {
  const profile = syntheticProfile(seed, `class/${strong ? 'focused' : 'learning'}-${seed}`);
  profile.primaryLanguage = 'TypeScript'; profile.totalLoc = 10000; profile.totalFiles = 100;
  profile.readme = 'An actual fixture README with examples. '.repeat(strong ? 50 : 8);
  profile.testRatio = strong ? 0.3 : 0.09; profile.maxDepth = strong ? 2 : 7;
  profile.components.forEach((c, i) => { c.fanOut = strong ? 1 : 4; c.fanIn = i + 1; });
  profile.cycles = strong ? [] : [[profile.components[0].name, profile.components[1].name]];
  profile.dna = { identifiers: ['parse', 'emit'], componentSymbols: {}, heartLines: [], snippets: [], todos: [], commits: [], tokens: [],
    bigFiles: [{ path: 'src/parser.ts', loc: 100 }], longestFunction: { name: 'parse', file: 'src/parser.ts', lines: strong ? 30 : 180 },
    counts: { functions: 200, classes: 0, todo: strong ? 0 : 25, fixme: 0, hack: 0, comments: strong ? 2000 : 800 },
    maxNesting: 2, avgLineLength: 40, indent: 'spaces2', avgFunctionLength: strong ? 24 : 85, hasTestDir: true } as CodeDNA;
  return profile;
}

export function classroomSweep(trials = 12) {
  const runs = [];
  const started = performance.now();
  for (let trial = 0; trial < trials; trial++) {
    const roster = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `Student ${i}`, kit: {
      ...playerKitFromProfile(qualityProfile(i === trial % 4, i + 1)), skill: 'firewall' as const,
    } }));
    const m = new ClassroomMatch(roster), bots = roster.map((_, i) => createBot(1009 + trial * 401 + i * 37, 0.7));
    while (!m.over) {
      const s = m.snapshot(); m.step(1 / 30, new Map(s.players.map((p, i) => [p.id, bots[i](s, p)])));
    }
    const report = m.autopsy();
    runs.push({ trial, duration: report.duration, strong: `p${trial % 4}`, winner: report.mvp,
      students: report.ranking!.map(({ id, kos, damage, roundWins }) => ({ id, kos, damage, roundWins })) });
  }
  const roster = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `Student ${i}`, kit: playerKitFromProfile(qualityProfile(i % 3 === 0, i + 1)) }));
  const m = new ClassroomMatch(roster), bots = roster.map((_, i) => createBot(1901 + i * 37, 0.7));
  let maxBullets = 0, maxStepMs = 0; const stressStart = performance.now();
  while (!m.over) {
    const s = m.snapshot(); maxBullets = Math.max(maxBullets, s.bullets.length);
    const inputs = new Map(s.players.map((p, i) => [p.id, bots[i](s, p)]));
    const start = performance.now(); m.step(1 / 30, inputs); maxStepMs = Math.max(maxStepMs, performance.now() - start);
    if (!s.players.every(p => Number.isFinite(p.x + p.y + p.hp + p.armor + p.energy))) throw new Error('Non-finite classroom state');
  }
  return { game: 'Gitzilla', mode: 'edu', syntheticQualityFixtures: true, trials, playersPerTrial: 4,
    controls: 'Same TypeScript blaster, firewall skill and 0.7 bot skill; one strong-quality versus three C-range kits; strong identity rotates.',
    strongWins: runs.filter(r => r.winner === r.strong).length,
    strongKOs: runs.reduce((sum, r) => sum + r.students.find(p => p.id === r.strong)!.kos, 0),
    learningKOs: runs.reduce((sum, r) => sum + r.students.filter(p => p.id !== r.strong).reduce((s, p) => s + p.kos, 0), 0),
    runs, stress: { players: 30, duration: m.autopsy().duration, wallSeconds: (performance.now() - stressStart) / 1000,
      maxBullets, maxStepMs, kos: m.autopsy().ranking!.reduce((s, p) => s + p.kos, 0), allFinite: true }, wallSeconds: (performance.now() - started) / 1000 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(classroomSweep(Number(process.argv[2] ?? 12)), null, 2));
