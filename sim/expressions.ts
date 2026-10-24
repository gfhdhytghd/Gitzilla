import type { PlayerKit, WeaponKind } from '../shared/types.ts';

type CodeWeapon = NonNullable<NonNullable<PlayerKit['code']>['weapon']>;
interface Expression extends Omit<CodeWeapon, 'name'> { code: string }
const e = (code: string, muzzle: string, impact: string, ...projectiles: string[]): Expression => ({ code, muzzle, impact, projectiles });
const VERB: Record<WeaponKind, string> = { blaster: 'fire', smg: 'repeat', shotgun: 'spread', cannon: 'blast', staff: 'cast', laser: 'beam', blade: 'cut' };
const BASE: Record<WeaponKind, Expression[]> = {
  blaster: [e('fire({id}())', 'fire', 'hit()', '()', '=>'), e('emit({id})', 'emit', 'hit()', '=>', '{}'), e('{id}(shot)', 'shot', 'hit()', '()', 'shot')],
  smg: [e('repeat({id},3)', 'repeat', '++', 'i++', ';'), e('loop({id})', 'loop', '++', '++', '{}'), e('{id}(burst)', 'burst', '++', ';', 'burst')],
  shotgun: [e('spread({id})', 'spread', 'break;', '...', ','), e('scatter({id},3)', 'scatter', 'break;', ',', '*'), e('{id}(pellets)', 'pellets', 'break;', '...', 'case')],
  cannon: [e('blast({id}())', 'blast', 'free()', '0xDEAD', '*'), e('alloc({id})', 'alloc', 'free()', '*', '0xFF'), e('{id}(shell)', 'shell', 'free()', '0xFF', '*')],
  staff: [e('cast({id})', 'cast', 'return', '=>', '()'), e('map({id},runes)', 'map', 'return', '()', '=>'), e('{id}(runes)', 'runes', 'return', '()', 'rune')],
  laser: [e('beam({id})', 'beam', 'match', '|', '=>'), e('trace({id}())', 'trace', 'match', '|', '.'), e('{id}(beam)', 'beam', 'match', '=>', '|')],
  blade: [e('cut({id})', 'cut', 'del', '//', '|'), e('erase({id})', 'erase', 'del', '|', '//'), e('{id}(slash)', 'slash', 'del', '/', '|')],
};
const LANGUAGE: Record<string, Partial<Record<WeaponKind, Expression[]>>> = {
  javascript: { blaster: [e('await fetch({id})', 'fetch', 'catch()', '.then()', '=>'), e('{id}().then(fire)', 'then', 'catch()', '.then()', '=>'), e('await {id}()', 'await', 'return', 'await', '=>'), e('emit({id}())', 'emit', 'catch()', '=>', '()')] },
  typescript: { blaster: [e('<Blaster>{id}()', 'as', 'never', '<>', 'as'), e('await {id}()', 'await', 'never', 'await', '=>'), e('await fire({id})', 'fire', 'never', 'await', '=>'), e('emit({id}())', 'emit', 'never', '=>', '()')] },
  go: { smg: [e('for { go {id}() }', 'go', 'panic()', 'go', '<-ch'), e('go {id}()', 'go', 'panic()', 'go', 'chan'), e('go repeat({id})', 'repeat', 'break', '{}', 'go'), e('go burst({id})', 'go', 'close(ch)', '<-ch', 'go')] },
  c: { shotgun: [e('#define SPRAY({id})', '#define', '#undef', '#if', '*p'), e('scatter(&{id},3)', 'scatter', 'break;', '*p', ','), e('SPRAY({id})', 'SPRAY', 'break;', '#if', '*p'), e('{id}(pellets,3)', 'pellets', 'break;', '*p', ',')] },
  'c++': { shotgun: [e('std::spread({id})', 'spread', 'delete', '::', '<>'), e('{id}<Burst>()', 'Burst', 'delete', '<>', '::'), e('scatter({id},3)', 'scatter', 'delete', '::', ','), e('std::apply({id},xs)', 'apply', 'delete', '::', '...')] },
  rust: { cannon: [e('unsafe { {id}() }', 'unsafe', 'drop()', '&mut', '::'), e('blast!({id})', 'blast!', 'drop()', '0xDEAD', '!'), e('alloc({id}())', 'alloc', 'drop()', '::', '&mut'), e('blast(&{id})', 'blast', 'drop()', '&', '::')] },
  python: { staff: [e('yield from {id}()', 'yield', 'return', 'yield', 'def'), e('lambda: {id}()', 'lambda', 'return', 'lambda', ':'), e('next({id}())', 'next', 'return', 'next', '()'), e('yield {id}()', 'yield', 'return', 'yield', 'def')] },
  java: { laser: [e('stream().map({id})', 'stream', 'close()', '.map()', '::'), e('{id}.stream()', 'stream', 'close()', '->', '.map()'), e('beam.map({id})', 'map', 'close()', '.map()', '->'), e('trace({id}())', 'trace', 'close()', '->', '::')] },
  kotlin: {
    smg: [e('launch { {id}() }', 'launch', 'cancel()', 'launch', '{}'), e('repeat(3) { {id}() }', 'repeat', 'cancel()', '{}', '->'), e('launch({id})', 'launch', 'cancel()', '{}', '->')],
    laser: [e('{id}.map(::beam)', 'map', 'collect', '::', '->'), e('flowOf({id})', 'flowOf', 'collect', 'flow', '->'), e('{id}.asFlow()', 'asFlow', 'collect', 'flow', '?.')],
  },
  'c#': { laser: [e('{id}.Select(beam)', 'Select', 'yield', '.Select', '=>'), e('beam.Select({id})', 'Select', 'yield', '.Select', '=>'), e('from x in {id} select x', 'select', 'yield', 'in', '=>')] },
  ruby: {
    blade: [e('cut(:{id})', 'cut', 'nil', ':', '#'), e('{id}.slice!(0)', 'slice!', 'nil', '!', '#'), e('{id}.delete(bug)', 'delete', 'nil', '#', '!')],
    blaster: [e('puts {id}()', 'puts', 'nil', 'puts', '=>'), e('{id}.then(&:fire)', 'then', 'nil', '&:', '=>'), e('fire(:{id})', 'fire', 'nil', ':', '=>')],
  },
  php: { blade: [e('unset(${id})', 'unset', 'null', '$', '//'), e('exit({id}())', 'exit', 'null', '$', '//'), e('{id}() ?? die()', 'die', 'null', '??', '$')] },
  lua: { blade: [e('{id}=nil', 'nil', 'nil', '--', 'nil'), e('table.remove({id})', 'remove', 'nil', '--', '()'), e('rawset({id},1,nil)', 'rawset', 'nil', '--', 'nil')] },
  r: { staff: [e('lapply(runes,{id})', 'lapply', 'return', '<-', 'NA'), e('Map({id},runes)', 'Map', 'return', '<-', '()'), e('{id}(runes)', 'runes', 'return', '<-', 'NA')] },
  julia: { staff: [e('map({id},runes)', 'map', 'return', '.|>', '::'), e('{id}.(runes)', '@.', 'end', '.', '::'), e('@. {id}(runes)', '@.', 'end', '.', '::')] },
  zig: {
    cannon: [e('comptime blast({id})', 'comptime', 'defer', 'comptime', '*'), e('@as(u32,{id}())', '@as', 'defer', 'u32', '*'), e('blast({id})', 'blast', 'defer', '*', '[]')],
    blade: [e('defer {id}()', 'defer', 'defer', '*', '[]'), e('@memset(&{id},0)', '@memset', 'defer', '&', '[]'), e('cut({id})', 'cut', 'defer', '*', '[]')],
  },
  haskell: { staff: [e('fmap cast {id}', 'fmap', 'pure', '>>=', '::'), e('{id} >>= cast', 'bind', 'pure', '>>=', '::'), e('cast <$> {id}', 'fmap', 'pure', '<$>', '::')] },
  lisp: { staff: [e("(mapcar #'cast {id})", 'mapcar', 'nil', '(', ')'), e('(cast {id})', 'cast', 'nil', '(', ')'), e('(funcall {id})', 'funcall', 'nil', '(', ')')] },
};
const RESERVED = new Set('class def return yield lambda for while if else elif try catch finally throw throws new delete default from import export const let var function async await in is as with pass break continue switch case do end nil null true false void int long char float double static public private protected package select join where table'.split(' '));

function templates(kind: WeaponKind, language: string): Expression[] {
  if (LANGUAGE[language]?.[kind]) return LANGUAGE[language][kind]!;
  const verb = VERB[kind];
  if (language === 'haskell') return [`${verb} {id}`, `{id} >>= ${verb}`, `${verb} <$> {id}`].map(code => e(code, verb, 'pure', '>>=', '::'));
  if (language === 'lisp') return [`(${verb} {id})`, `(funcall {id} '${verb})`, `(mapcar #'${verb} {id})`].map(code => e(code, verb, 'nil', '(', ')'));
  if (language === 'sql') return (kind === 'blade' ? ['DELETE FROM {id}', 'DROP TABLE {id}', 'TRUNCATE {id}'] : [`SELECT ${verb}({id})`, `SELECT ${verb} FROM {id}`, `SELECT ${verb}({id}())`])
    .map(code => e(code, kind === 'blade' ? 'DELETE' : 'SELECT', 'NULL', ';', 'NULL'));
  return BASE[kind];
}

/** Select a whole fitting expression, never truncated syntax or invented source symbols. */
export function codeExpression(kind: WeaponKind, language: string, seed: number, identifiers: string[]): CodeWeapon {
  const lang = language.toLowerCase() === 'jupyter notebook' ? 'python' : language.toLowerCase();
  const identifierPattern = lang === 'ruby' ? /^[\p{L}_][\p{L}\p{N}_]*[!?]?$/u
    : ['javascript', 'typescript', 'java', 'c#'].includes(lang) ? /^[\p{L}_$][\p{L}\p{N}_$]*$/u : /^[\p{L}_][\p{L}\p{N}_]*$/u;
  const ids = [...new Set(identifiers.map(raw => raw.replace(/\(.*$/, '').trim()))].filter(id => identifierPattern.test(id) && !RESERVED.has(id.toLowerCase()));
  const choices = templates(kind, lang), offset = seed >>> 0, first = (Math.imul(offset, 31) >>> 0) % choices.length;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[(offset + i) % ids.length];
    for (let j = 0; j < choices.length; j++) {
      const chosen = choices[(first + j) % choices.length], name = chosen.code.replaceAll('{id}', id);
      if (name.length <= 24) return { name, muzzle: chosen.muzzle, impact: chosen.impact, projectiles: [...chosen.projectiles, ...(id.length <= 8 ? [id] : [])] };
    }
  }
  // Source unavailable/only oversized symbols: a seed literal is honest, a fake identifier isn't.
  const verb = VERB[kind], literal = String(offset % 1_000_000_000);
  const name = lang === 'haskell' ? `${verb} ${literal}` : lang === 'lisp' ? `(${verb} ${literal})` : lang === 'sql' ? `SELECT ${verb}(${literal})` : `${verb}(${literal})`;
  return { name, muzzle: verb, impact: BASE[kind][0].impact, projectiles: [...BASE[kind][0].projectiles] };
}
