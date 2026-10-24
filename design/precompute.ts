import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RepoProfile } from '../shared/types.ts';
import { bossKitFromProfile, playerKitFromProfile } from '../sim/kits.ts';
import { createDesignService, designCacheKey, designFileStem, type DesignResult } from './index.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const force = args.includes('--force');
const offline = args.includes('--offline');
const requireDNA = args.includes('--require-dna');
const slugs = args.filter(arg => !arg.startsWith('--'));
const outputDir = join(root, 'data/design');
await mkdir(outputDir, { recursive: true });
const manifestPath = join(outputDir, 'manifest.json');
type Entry = { seed: number; keys: { hero: string; boss: string }; hero?: DesignResult; boss?: DesignResult };
let entries: Record<string, Entry> = {};
try { entries = JSON.parse(await readFile(manifestPath, 'utf8')).entries ?? {}; } catch { /* First run. */ }
const results = new Map<string, DesignResult>();
const service = createDesignService({
  rootDir: root, readCache: !force, assetDir: force ? false : outputDir,
  ...(offline ? { apiKey: '' } : {}),
  onResult(result) { results.set(`${result.slug}:${result.kind}`, result); },
});
const files = (await readdir(join(root, 'data/fallback'))).filter(file => file.endsWith('.json')).sort();
const profiles: RepoProfile[] = [];
for (const filename of files) {
  const profile = JSON.parse(await readFile(join(root, 'data/fallback', filename), 'utf8')) as RepoProfile;
  if (!slugs.length || slugs.includes(profile.slug)) profiles.push(profile);
}
if (requireDNA) {
  const missing = profiles.filter(profile => !profile.dna || !profile.dna.identifiers.length || !profile.dna.tokens.length);
  if (missing.length) throw new Error(`Public fallback snapshots still need real CodeDNA: ${missing.map(profile => profile.slug).join(', ')}`);
}
let count = 0;
for (const profile of profiles) {
  const heroKit = playerKitFromProfile(profile), bossKit = bossKitFromProfile(profile, 1);
  const [hero, boss] = await Promise.all([
    service.designHero(profile, heroKit),
    service.designBoss(profile, bossKit),
  ]);
  const heroResult = results.get(`${profile.slug}:hero`)!;
  const bossResult = results.get(`${profile.slug}:boss`)!;
  const previous = entries[profile.slug];
  entries[profile.slug] = {
    seed: profile.seed,
    keys: { hero: designCacheKey(profile, 'hero', heroKit), boss: designCacheKey(profile, 'boss', bossKit) },
    hero: heroResult.source === 'precomputed' ? previous?.hero ?? heroResult : heroResult,
    boss: bossResult.source === 'precomputed' ? previous?.boss ?? bossResult : bossResult,
  };
  await Promise.all([
    writeFile(join(outputDir, `${designFileStem(profile.slug)}.hero.json`), JSON.stringify(hero, null, 2) + '\n'),
    writeFile(join(outputDir, `${designFileStem(profile.slug)}.boss.json`), JSON.stringify(boss, null, 2) + '\n'),
  ]);
  await writeFile(manifestPath, JSON.stringify({ version: 2, entries }, null, 2) + '\n');
  console.log(`${profile.slug}: hero=${heroResult.source}${heroResult.model ? ` (${heroResult.model})` : ''}, boss=${bossResult.source}${bossResult.model ? ` (${bossResult.model})` : ''}`);
  count++;
}
console.log(`Wrote ${count * 2} designs for ${count} repos to ${resolve(outputDir)}.`);
