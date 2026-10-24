import type { RepoProfile } from '../shared/types.ts';

export interface RepoQualitySignals {
  commentRatio: number;
  readmeLength: number;
  hasReadme: boolean;
  avgFunctionLength?: number;
  functionsPerFile: number;
  hasTestDir: boolean;
  techDebtCount: number;
  techDebtDensity: number;
}

/** Raw, explainable measurements for the sim owner; no grades or stat balancing here. */
export function qualitySignalsFromProfile(profile: RepoProfile): RepoQualitySignals {
  const dna = profile.dna;
  const readmeLength = profile.readme?.length ?? 0;
  const avgFunctionLength = dna && 'avgFunctionLength' in dna && typeof dna.avgFunctionLength === 'number' ? dna.avgFunctionLength : undefined;
  const measuredTestDir = dna && 'hasTestDir' in dna && typeof dna.hasTestDir === 'boolean' ? dna.hasTestDir : undefined;
  const techDebtCount = (dna?.counts.todo ?? 0) + (dna?.counts.fixme ?? 0) + (dna?.counts.hack ?? 0);
  return {
    techDebtCount, techDebtDensity: profile.totalLoc ? techDebtCount / profile.totalLoc : 0,
    commentRatio: profile.totalLoc ? Math.max(0, Math.min(1, (dna?.counts.comments ?? 0) / profile.totalLoc)) : 0,
    readmeLength, hasReadme: readmeLength > 0,
    avgFunctionLength,
    functionsPerFile: profile.totalFiles ? (dna?.counts.functions ?? 0) / profile.totalFiles : 0,
    hasTestDir: measuredTestDir ?? (profile.tree ?? []).some(path => path.split('/').slice(0, -1).some(part => /^(?:__tests__|tests?|specs?)$/i.test(part))),
  };
}
