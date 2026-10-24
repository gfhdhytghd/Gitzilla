import { createHash } from 'node:crypto';
import type { BossKit, PlayerKit, RepoProfile } from '../shared/types.ts';

/** A small, bounded view of the analysis-owned fingerprint for art direction. */
export function artDNA(profile: RepoProfile, kit?: PlayerKit | BossKit) {
  const dna = profile.dna;
  const hero = kit && 'weapon' in kit ? kit.code : undefined;
  const boss = kit && 'attacks' in kit ? kit.code : undefined;
  const limbSymbols = kit && 'attacks' in kit ? Object.fromEntries(kit.limbs.map(limb => [
    limb.id, dna ? dna.componentSymbols[limb.component] ?? [] : boss?.limbSymbols[limb.id] ?? [],
  ])) : {};
  return {
    identifiers: codeLines(dna?.identifiers ?? hero?.identifiers, 24, 64),
    componentSymbols: Object.fromEntries(Object.entries(dna?.componentSymbols ?? {}).slice(0, 8).map(([component, symbols]) => [component, codeLines(symbols, 4, 64)])),
    heartLines: codeLines(dna?.heartLines ?? boss?.heartLines, 12, 40),
    snippets: codeLines(dna?.snippets.map(s => s.code) ?? (hero?.snippet ? [hero.snippet] : boss?.snippets), 12, 48),
    todos: codeLines(dna?.todos.map(todo => todo.text) ?? boss?.todos, 12, 60),
    commits: codeLines(dna?.commits ?? boss?.commits, 10, 80),
    tokens: codeLines(dna?.tokens ?? hero?.tokens ?? boss?.tokens, 12, 16),
    limbSymbols: Object.fromEntries(Object.entries(limbSymbols).slice(0, 8).map(([id, symbols]) => [id, codeLines(symbols, 4, 64)])),
  };
}

export function codeLines(values: readonly string[] | undefined, count: number, length: number): string[] {
  // The extractor already filters secrets; retain a small guard at the external/persistence boundary.
  return (values ?? []).filter(value => typeof value === 'string')
    .filter(value => !/(?:api[_-]?key|token|password|secret)\s*[:=]\s*["'`]|[A-Za-z0-9+/=_-]{48,}/i.test(value))
    .map(value => value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, length).trimEnd()).filter(Boolean).slice(0, count);
}

export function dnaFingerprint(profile: RepoProfile, kit?: PlayerKit | BossKit): string {
  // No HP/cooldowns/count: source changes invalidate art without rerolling when the squad changes.
  return createHash('sha256').update(JSON.stringify({
    recipe: 'dna-epithets-3', dna: artDNA(profile, kit), heart: profile.heart, cycles: profile.cycles, ageDays: profile.ageDays,
    longestFunction: profile.dna?.longestFunction ?? null,
    ...(kit && 'weapon' in kit ? { heroRecipe: 'code-expression-2', language: profile.primaryLanguage, weapon: kit.weapon,
      glyphs: kit.code?.weapon ? { projectiles: kit.code.weapon.projectiles, muzzle: kit.code.weapon.muzzle, impact: kit.code.weapon.impact } : null } : {}),
  })).digest('hex').slice(0, 16);
}

/** Prompt/art recipe changes invalidate bundles without rerolling DNA-based creature names. */
export function designFingerprint(profile: RepoProfile, kind: 'hero' | 'boss', kit?: PlayerKit | BossKit): string {
  const dna = dnaFingerprint(profile, kit);
  const theme = kit && 'theme' in kit ? kit.theme : '';
  const archetype = kit && 'attacks' in kit ? kit.archetype : '';
  return kind === 'boss' ? createHash('sha256').update(`boss-archetypes-1:${archetype}:${profile.primaryLanguage.toLowerCase()}:${theme}:${dna}`).digest('hex').slice(0, 16) : dna;
}

export function dnaEmblem(tokens: string[]): string | undefined {
  const printable = tokens.map(token => token.replace(/[^\x21-\x7e]/g, '')).filter(Boolean);
  return (printable.find(token => token.length <= 2) ?? printable[0])?.slice(0, 2);
}

