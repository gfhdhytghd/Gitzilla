import type { BossKit, RepoProfile } from '../shared/types.ts';
import { artDNA, codeLines, dnaFingerprint } from './code.ts';
import { bossArt } from './archetypes.ts';

const generic = new Set(['SRC', 'LIB', 'PACKAGES', 'INTERNAL', 'INDEX', 'INIT', 'MAIN', 'MOD', 'CORE', 'SHARED', 'MODEL', 'SERVER', 'APP', 'GET', 'SET', 'NEW', 'NAME', 'VALUE', 'TEST', 'FN', 'FROM', 'PATH', 'BUILD', 'RENDER', 'DATA', 'FOO', 'BAR', 'CLIENT']);
const label = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[^a-z0-9]+/gi, ' ').trim().toUpperCase();
const compact = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** The title's vocabulary comes from code; no cross-request uniqueness registry or squad-dependent rolls. */
export function bossEpithet(profile: RepoProfile, kit: BossKit): string {
  const dna = artDNA(profile, kit);
  const repo = compact(profile.slug.split('/').pop() || '');
  const repeatsRepo = (value: string) => !!repo && compact(value).includes(repo);
  const heart = profile.heart.replace(/\.[^.\/]+$/, '').split('/').reverse().map(label);
  const longest = codeLines(profile.dna?.longestFunction ? [profile.dna.longestFunction.name] : [], 1, 64).map(label);
  const todoWords = dna.todos.flatMap(todo => todo.replace(/^(?:TODO|FIXME|HACK|XXX|NOTE|BUG)\b:?/i, '').match(/[a-zA-Z_]{4,}/g) ?? []).map(label);
  const noun = [...heart, ...longest, ...dna.identifiers.map(label), ...todoWords, ...dna.tokens.map(label)]
    .find(word => word && !generic.has(word) && !repeatsRepo(word))
    || ['BYTECODE', 'SYNTAX', 'STACK', 'NULL'].find(word => !repeatsRepo(word))!;
  const vocabulary = [profile.heart, ...dna.identifiers, ...Object.values(dna.componentSymbols).flat(), ...dna.todos, ...dna.commits].join(' ');
  const templates = bossArt[kit.archetype].titles;
  const subject = /gitignore|walkdir|readdir|directory|travers/i.test(vocabulary) && !repeatsRepo('DIRS') ? 'DIRS' : noun;
  // Source/age/cycles/TODO/commit changes all participate through the DNA seed, while
  // each title pool describes the already-selected silhouette.
  const seed = ((profile.seed >>> 0) ^ parseInt(dnaFingerprint(profile, kit).slice(0, 8), 16)) >>> 0;
  const candidates = templates.map(template => template.replace('{noun}', subject.slice(0, 24).trimEnd())).filter(candidate => !repeatsRepo(candidate));
  return candidates[seed % candidates.length] || subject.slice(0, 24).trimEnd();
}
