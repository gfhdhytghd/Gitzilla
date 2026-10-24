import type { CodeDNA, CriterionResult, RepoProfile, Rubric, RubricCriterion } from '../shared/types.ts';

// Existing analyzer extensions are optional for old fallback/cache profiles.
type MeasuredDNA = CodeDNA & { avgFunctionLength?: number; functionsPerFile?: number; hasTestDir?: boolean; commentRatio?: number; readmeLength?: number; typingRatio?: number };
const clamp = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const atLeast = (value: number, target: number) => target <= 0 ? 1 : clamp(value / target);
const atMost = (value: number, target: number) => value <= target ? 1 : target <= 0 ? 1 / (1 + value) : clamp(target / value);
const pathPattern = (value: string) => new RegExp(`(?:^|/)${value.replace(/^\.\//, '').replace(/\/$/, '').split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}(?:/|$)`, 'i');
const readmePattern = /(?:^|\/)readme(?:\.[^/]+)?$/i;

export function evidenceFile(p: RepoProfile, c: RubricCriterion): string | undefined {
  const paths = p.tree ?? [];
  if (c.check?.kind === 'max-file-loc') return [...(p.dna?.bigFiles ?? [])].sort((a, b) => b.loc - a.loc)[0]?.path;
  if (c.check?.kind === 'path-exists' || c.check?.kind === 'path-absent') return paths.find(path => !path.endsWith('/') && pathPattern(String(c.check!.value)).test(path));
  if (c.signal === 'function-length' || c.signal === 'cohesion') return p.dna?.longestFunction?.file ?? p.heart;
  if (c.signal === 'documentation' || c.signal === 'readme') return paths.find(path => readmePattern.test(path)) ?? p.heart;
  if (c.signal === 'tech-debt') return p.dna?.todos[0]?.file ?? p.heart;
  if (c.signal === 'cycles') return paths.find(path => !path.endsWith('/') && p.cycles[0]?.some(member => path === member || path.startsWith(`${member}/`))) ?? p.heart;
  return p.heart || p.dna?.bigFiles[0]?.path;
}

function scoreCriterion(p: RepoProfile, c: RubricCriterion): CriterionResult {
  const d = p.dna as MeasuredDNA | undefined;
  const file = evidenceFile(p, c) ?? 'a central source file';
  const result = (score: number, evidence: string, tip: string): CriterionResult => ({ criterionId: c.id, score: clamp(score), evidence, tip });
  const unknown = (detail: string) => result(0.5, `${detail}; not measured in this analysis (neutral 50%, review required).`, `Re-analyze ${p.slug} or review this criterion with your teacher before treating it as a grade.`);
  const target = c.target === undefined || !Number.isFinite(c.target) ? undefined : Math.max(0, c.target);
  const readmeLength = d?.readmeLength ?? p.readme?.length;
  const hasReadme = (readmeLength ?? 0) > 0 || !!p.tree?.some(path => readmePattern.test(path));
  const avgFanOut = p.components.reduce((sum, item) => sum + item.fanOut, 0) / Math.max(1, p.components.length);
  const debt = d ? d.counts.todo + d.counts.fixme + d.counts.hack : undefined;
  switch (c.signal) {
    case 'tests': {
      const goal = target ?? 0.2;
      const hasTests = d?.hasTestDir ?? p.tree?.some(path => /(?:^|\/)(?:__tests__|tests?|specs?)(?:\/|$)/i.test(path));
      const bonus = c.id === 'tests' && c.description.includes('support your armor') && hasTests ? 0.1 : 0;
      return result(atLeast(p.testRatio, goal) + bonus,
        `Test files: approximately ${Math.round(p.testRatio * p.totalFiles)} of ${p.totalFiles} analyzed files (${pct(p.testRatio)}); target ${pct(goal)}${hasTests ? '; test directory detected' : ''}. Test-file presence is not execution or coverage.`,
        `Add focused behavior tests for ${p.heart || file}; aim for ${pct(goal)} test files and run them locally.`);
    }
    case 'modularity': {
      if (!p.components.length) return unknown('Component fan-out and dependency depth unavailable');
      const depthTarget = /\bdepth\b/i.test(c.description) && !/fan[ -]?out/i.test(c.description);
      const score = target === undefined ? 1 - clamp(avgFanOut / 8 * 0.6 + p.maxDepth / 16 * 0.4) : atMost(depthTarget ? p.maxDepth : avgFanOut, target);
      return result(score, `Average component fan-out ${avgFanOut.toFixed(1)}; dependency depth ${p.maxDepth}${target === undefined ? '' : `; target ${depthTarget ? 'depth' : 'fan-out'} ≤ ${target}`}.`,
        `Reduce dependencies around ${p.heart || file}; extract a shared interface to shorten import chains.`);
    }
    case 'function-length': {
      const goal = target ?? 40;
      // "No function over N" evaluates the longest function, not the mean.
      const maximum = /\b(?:no (?:function|method)|max(?:imum)?|every|each)\b|\b(?:functions?|methods?)\s+(?:under|below|at most)\b/i.test(c.description);
      const length = maximum ? d?.longestFunction?.lines : d?.avgFunctionLength;
      if (length === undefined || !d?.counts.functions) return unknown(`${maximum ? 'Maximum' : 'Mean'} function length unavailable; total LOC / definitions is not a function-span measurement`);
      const ref = maximum && d.longestFunction ? ` (${d.longestFunction.name} in ${d.longestFunction.file})` : '';
      return result(atMost(length, goal), `${maximum ? 'Longest' : 'Average'} measured function ${length.toFixed(1)} lines${ref}; target ≤ ${goal} lines.`, `Extract one responsibility from ${d.longestFunction?.file ?? file}; keep functions within ${goal} lines.`);
    }
    case 'cohesion': {
      if (!d?.counts.functions || d.avgFunctionLength === undefined) return unknown('Function cohesion measurements unavailable');
      const density = d.functionsPerFile ?? d.counts.functions / Math.max(1, p.totalFiles);
      const score = target === undefined ? clamp((density >= 1 && density <= 8 ? 1 : density < 1 ? density : 8 / density) * 0.45 +
        (1 - clamp((d.avgFunctionLength - 20) / 120)) * 0.35 + (1 - clamp(((d.longestFunction?.lines ?? 0) - 60) / 240)) * 0.2) : atMost(density, target);
      return result(score, `${density.toFixed(1)} function definitions/file; average measured function ${d.avgFunctionLength.toFixed(1)} lines; longest ${d.longestFunction?.lines ?? 'unavailable'}${d.longestFunction ? ` in ${d.longestFunction.file}` : ''}.`,
        `Give each function one clear responsibility; start by reviewing ${file}.`);
    }
    case 'documentation': {
      if (!d && readmeLength === undefined) return unknown('Comment ratio and README length unavailable');
      const comments = d?.commentRatio ?? (d ? d.counts.comments / Math.max(1, p.totalLoc) : undefined);
      if (target !== undefined && comments === undefined) return unknown('Comment ratio unavailable for the teacher’s target');
      const score = target === undefined ? (comments === undefined ? 0.25 : atLeast(comments, 0.2) * 0.65) + atLeast(readmeLength ?? 0, 1500) * 0.35 : atLeast(comments!, target);
      return result(score, `Comment/source LOC ratio ${comments === undefined ? 'unavailable' : pct(comments)}; README ${readmeLength === undefined ? 'length unavailable' : `${readmeLength} analyzed characters`}${target === undefined ? '' : `; comment target ${pct(target)}`}.`,
        `Document an example and a tricky decision in ${file}; explain why rather than adding filler comments.`);
    }
    case 'readme': {
      if (readmeLength === undefined) {
        if (hasReadme) return result(0.5, 'README path detected, but content length unavailable (neutral 50%, review required).', 'Include README content in the next repository analysis.');
        return unknown('README content unavailable');
      }
      const goal = target ?? 1500;
      return result(atLeast(readmeLength, goal), `README ${readmeLength} analyzed characters; target ≥ ${goal} characters${p.tree?.find(path => readmePattern.test(path)) ? ` (${p.tree.find(path => readmePattern.test(path))})` : ''}.`, 'Add setup instructions, a working example, and how to run tests to your README.');
    }
    case 'size': {
      const score = target === undefined ? clamp((Math.log10(Math.max(1, p.totalLoc)) - 2) / 4) * 0.7 + (hasReadme ? 0.3 : 0) : atLeast(p.totalLoc, target);
      return result(score, `${p.totalLoc} analyzed LOC across ${p.totalFiles} files; README ${hasReadme ? 'detected' : 'not found in the sample'}${target === undefined ? '; size bonus capped logarithmically' : `; target ≥ ${target} LOC`}.`, `Keep ${p.heart || file} focused and document a complete, runnable project; extra code alone is not better engineering.`);
    }
    case 'cycles': {
      const goal = target ?? 0, count = p.cycles.length;
      return result(atMost(count, goal), `${count} dependency cycles; target ≤ ${goal}${count ? `; example ${p.cycles[0].join(' ↔ ')}` : '; analyzed component graph is acyclic'}.`,
        count ? `Break ${p.cycles[0].join(' ↔ ')} by moving a shared contract into its own module.` : 'Keep new imports one-directional as you add features.');
    }
    case 'tech-debt': {
      if (debt === undefined) return unknown('TODO/FIXME/HACK counts unavailable');
      const density = debt * 1000 / Math.max(1, p.totalLoc), goal = target ?? 0;
      const isDensity = /density|per\s*(?:kLOC|1[,.]?000)|\/\s*kLOC/i.test(c.description) || target === undefined;
      return result(atMost(isDensity ? density : debt, goal), `${debt} TODO/FIXME/HACK markers (${density.toFixed(1)} per kLOC); target ≤ ${goal} ${isDensity ? 'per kLOC' : 'markers'}${d?.todos[0] ? `; sample ${d.todos[0].file}` : ''}. Markers invite review; they do not prove bugs.`,
        `Review ${d?.todos[0]?.file ?? file} and resolve or explain stale TODO/FIXME/HACK markers.`);
    }
    case 'ci': {
      if (!p.tree) return unknown('CI configuration paths unavailable');
      const config = p.tree.find(path => /^\.github\/workflows\/[^/]+\.ya?ml$|^\.gitlab-ci\.ya?ml$|^\.circleci\/config\.yml$|(?:^|\/)Jenkinsfile$|^azure-pipelines\.ya?ml$|^\.travis\.yml$/i.test(path));
      return result(config ? 1 : 0, config ? `CI configuration found: ${config}. Pipeline execution was not checked.` : 'No CI configuration found in the sampled tree; this is not a complete repository audit.',
        'Add a CI workflow that runs the project’s tests on each push and pull request.');
    }
    case 'license': {
      if (!p.tree) return unknown('License paths unavailable');
      const license = p.tree.find(path => /(?:^|\/)(?:licen[cs]e|copying)(?:\.[^/]+)?$/i.test(path));
      return result(license ? 1 : 0, license ? `License file found: ${license}; license terms were not evaluated.` : 'No LICENSE/COPYING file found in the sampled tree; this is not a complete repository audit.', 'Choose an appropriate project license and include its license file at the repository root.');
    }
    case 'typing': {
      if (d?.typingRatio === undefined) return unknown('Type-hint/type-checking ratio unavailable; language choice alone does not prove type safety');
      return result(atLeast(d.typingRatio, target ?? 0.8), `Measured typing ratio ${pct(d.typingRatio)}; target ${pct(target ?? 0.8)}.`, `Add annotations at the public boundary of ${file} and run the project’s type checker.`);
    }
    case 'commits': {
      if (p.commits === 0) return unknown('Commit history count is zero/unknown in this profile');
      const goal = target ?? 10;
      return result(atLeast(p.commits, goal), `Approximately ${p.commits} commits; target ≥ ${goal}. Counts describe history, not commit quality.`, 'Commit meaningful, reviewable steps with a short message explaining each change.');
    }
    case 'check': {
      if (!c.check) return unknown('Custom criterion has no measurable check configured');
      const { kind, value } = c.check;
      if (kind === 'language') {
        const normalize = (s: string) => s.toLowerCase().replace(/\s/g, '');
        return result(normalize(p.primaryLanguage) === normalize(String(value)) ? 1 : 0, `Primary analyzed language ${p.primaryLanguage}; required ${value}.`, `Confirm that ${value} is the intended project language with your teacher.`);
      }
      if (kind === 'min-commits') {
        if (!p.commits) return unknown('Commit history count is zero/unknown in this profile');
        return result(p.commits >= Number(value) ? 1 : 0, `Approximately ${p.commits} commits; required ≥ ${value}.`, `Build toward ${value} meaningful commits; avoid splitting changes only to inflate the count.`);
      }
      if (kind === 'max-file-loc') {
        const largest = [...(d?.bigFiles ?? [])].sort((a, b) => b.loc - a.loc)[0];
        if (!largest) return unknown('Maximum file LOC unavailable');
        return result(largest.loc <= Number(value) ? 1 : 0, `Largest analyzed file ${largest.path}: ${largest.loc} LOC; required ≤ ${value}.`, `Split a coherent responsibility out of ${largest.path}; target files of at most ${value} LOC.`);
      }
      if (!p.tree) return unknown('Repository paths unavailable');
      const found = p.tree.find(path => pathPattern(String(value)).test(path));
      return result((kind === 'path-exists' ? !!found : !found) ? 1 : 0,
        `${value}: ${found ? `found ${found}` : 'not found'} in the sampled tree; required ${kind === 'path-exists' ? 'present' : 'absent'}. Absence is limited to this sample.`,
        kind === 'path-exists' ? `Include ${value} and useful contents in the repository, then analyze it again.` : `Review ${value} and remove it if it does not belong in version control.`);
    }
  }
}

/** Uses analyzed measurements only; no network calls, source execution, or mutations. */
export function scoreRepo(profile: RepoProfile, rubric: Rubric): CriterionResult[] {
  return rubric.criteria.map(criterion => scoreCriterion(profile, criterion));
}

/** Relative weights are normalized here too, so a teacher-edited preview scores identically. */
export function weightedScore(rubric: Rubric, results: CriterionResult[]): number {
  const weights = rubric.criteria.map(c => Number.isFinite(c.weight) ? Math.max(0, c.weight) : 0);
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (!rubric.criteria.length) return 0;
  const byId = new Map(results.map(result => [result.criterionId, result.score]));
  const score = rubric.criteria.reduce((sum, c, i) => sum + (total ? weights[i] / total : 1 / rubric.criteria.length) * clamp(byId.get(c.id) ?? 0), 0);
  return Math.round(score * 1000) / 10;
}
