import type { BossKit, RepoProfile } from '../shared/types.ts';
import { artDNA, codeLines, dnaFingerprint } from './code.ts';

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
  const templates = [
    'KEEPER OF {noun}', 'DEVOURER OF {noun}', 'THE {noun} COLOSSUS', 'HERALD OF {noun}',
    'THE {noun} ABERRATION', 'SOVEREIGN OF {noun}', 'THE {noun} LEVIATHAN', 'WAKER OF {noun}',
    'THE {noun} WRAITH', 'WITNESS OF {noun}', 'BREAKER OF {noun}', 'THE {noun} PARADOX',
    'THE {noun} CHIMERA', 'GUARDIAN OF LOST {noun}', 'THE {noun} TYRANT', 'ORACLE OF {noun}',
  ];
  let subject = noun;
  if (/gitignore|walkdir|readdir|directory|travers/i.test(vocabulary)) {
    subject = repeatsRepo('DIRS') ? noun : 'DIRS';
    templates.push('WALKER OF {noun}', 'HUNTER OF HIDDEN {noun}', 'THE {noun} PATHFINDER', 'STALKER OF LOST {noun}');
  } else if (/gpt|tensor|attention|embedding/i.test(vocabulary)) {
    templates.push('DREAMER OF {noun}', 'THE {noun} HALLUCINATION', 'PROPHET OF {noun}', 'THE {noun} SINGULARITY');
  } else if (/route|endpoint|request|response/i.test(vocabulary)) {
    templates.push('GATEKEEPER OF {noun}', 'THE {noun} DISPATCHER', 'WEAVER OF {noun}', 'THE {noun} TIMEOUT');
  } else if (/query|database|cursor|\bdb\b|\bsql\b/i.test(vocabulary)) {
    templates.push('HOARDER OF {noun}', 'THE {noun} DEADLOCK', 'WARDEN OF {noun}', 'THE {noun} TRANSACTION');
  } else if (/effect|reactiv|component|computed/i.test(vocabulary)) {
    templates.push('THE {noun} RERENDER', 'WEAVER OF {noun}', 'THE {noun} MIRAGE', 'OBSERVER OF {noun}');
  }
  if (profile.cycles.length) templates.push('THE {noun} RECURSION', 'KNOT OF {noun}', 'THE {noun} OUROBOROS');
  if (profile.ageDays > 3650) templates.push('ANCIENT {noun} REVENANT', 'THE MOSSBOUND {noun}', 'LICH OF {noun}');
  if (dna.todos.length) templates.push('THE UNFINISHED {noun}', 'THE {noun} HACK', 'THE UNFIXED {noun}');
  if (/revert|rollback|undo/i.test(dna.commits.join(' '))) templates.push('THE REVERTED {noun}', 'GHOST OF {noun}');
  if (/fix|bug|repair/i.test(dna.commits.join(' '))) templates.push('THE PATCHED {noun}', 'THE {noun} REGRESSION');
  if (/perf|optim|fast/i.test(dna.commits.join(' '))) templates.push('THE OVERCLOCKED {noun}', 'THE {noun} RACE');
  const seed = ((profile.seed >>> 0) ^ parseInt(dnaFingerprint(profile, kit).slice(0, 8), 16)) >>> 0;
  const candidates = templates.map(template => template.replace('{noun}', subject.slice(0, 24).trimEnd())).filter(candidate => !repeatsRepo(candidate));
  return candidates[seed % candidates.length] || subject.slice(0, 24).trimEnd();
}
