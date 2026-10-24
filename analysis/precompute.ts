import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { RepoProfile } from '../shared/types.ts';
import { normalizeSlug } from './index.ts';
import { analyzeGitHubRepo } from './github.ts';

export const FAMOUS_REPOS = [
  'facebook/react', 'vuejs/core', 'expressjs/express', 'pallets/flask', 'fastapi/fastapi',
  'django/django', 'rust-lang/rustlings', 'burntsushi/ripgrep', 'golang/example', 'gin-gonic/gin',
  'redis/redis', 'lodash/lodash', 'spring-projects/spring-petclinic', 'jquery/jquery', 'karpathy/nanogpt',
];

/** Regenerate actual source-based snapshots, without silently replacing them with synthetic data.
 * Usage: npx tsx analysis/precompute.ts [owner/repo ...] */
async function main(): Promise<void> {
  const repos = process.argv.slice(2).length ? process.argv.slice(2) : FAMOUS_REPOS;
  const directory = fileURLToPath(new URL('../data/fallback/', import.meta.url));
  await mkdir(directory, { recursive: true });
  let failed = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < repos.length) {
      const input = repos[cursor++];
      try {
        const slug = normalizeSlug(input);
        const filename = `${directory}${slug.replace('/', '__')}.json`;
        const previous = await readFile(filename, 'utf8').then(text => JSON.parse(text) as RepoProfile).catch(() => undefined);
        const profile = await analyzeGitHubRepo(slug, { timeoutMs: 60_000, metadataFallback: previous });
        await writeFile(filename, JSON.stringify(profile, null, 2) + '\n');
        console.log(`${slug}: ${profile.totalFiles} files, ${profile.totalLoc} LOC, ${profile.components.length} components, ${profile.edges.length} edges, ${profile.cycles.length} cycles`);
      } catch (error) { failed++; console.error(`${input}: ${String(error)}`); }
    }
  };
  await Promise.all([worker(), worker()]);
  if (failed) process.exitCode = 1;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
