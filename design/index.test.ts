import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import rawProfile from '../data/fallback/pallets__flask.json';
import type { CodeDNA, RepoProfile, WeaponKind } from '../shared/types.ts';
import { bossKitFromProfile, playerKitFromProfile } from '../sim/kits.ts';
import { applyBossDesign, applyHeroDesign, createDesignService, designCacheFilename, designCacheKey, designFileStem, fallbackBoss, fallbackHero, parseApiKey, readApiKey, validateBoss, validateHero } from './index.ts';
import { bossSchema, heroSchema } from './schema.ts';

// JSON imports infer tuples/union-valued fields as broad arrays/strings; use the producer's contract.
const profile = JSON.parse(JSON.stringify(rawProfile)) as RepoProfile;
const heroKit = playerKitFromProfile(profile);
const bossKit = bossKitFromProfile(profile, 1);
const hero = fallbackHero(profile, heroKit);
const boss = fallbackBoss(profile, bossKit);
const roots: string[] = [];
const root = async () => { const dir = await mkdtemp(join(tmpdir(), 'kaiju-design-')); roots.push(dir); return dir; };
const response = (value: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200 });
const service = (fetcher = vi.fn().mockResolvedValue(response(hero)), options = {}) => createDesignService({ apiKey: 'test-secret', cacheDir: false, assetDir: false, fetch: fetcher, ...options });

afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

describe('appearance only', () => {
  it('is deterministic without optional README/tree and fills every boss ID', () => {
    expect(fallbackHero({ ...profile, readme: undefined, tree: undefined }, heroKit)).toEqual(hero);
    expect(fallbackBoss(profile, bossKitFromProfile(profile, 8))).toEqual(boss);
    expect(Object.keys(boss.attackNames)).toEqual(bossKit.attacks.map(a => a.id));
    expect(Object.keys(boss.limbNames)).toEqual(bossKit.limbs.map(l => l.id));
    expect(hero.palette).toHaveLength(4);
    expect(boss.palette).toHaveLength(5);
  });
  it('applies all art fields without mutation or any gameplay change', () => {
    const h = { ...hero, title: 'Tiny Flask Knight' };
    const b = { ...boss, name: 'THE TEST HORROR', theme: 'web' as const };
    expect(applyHeroDesign(heroKit, h)).toEqual({ ...heroKit, design: h, title: h.title, palette: h.palette });
    const changed = applyBossDesign(bossKit, b);
    expect(changed).toEqual({ ...bossKit, design: b, name: b.name, theme: b.theme, palette: b.palette, attacks: bossKit.attacks.map(a => ({ ...a, name: b.attackNames[a.id] })) });
    expect(heroKit.design).toBeUndefined();
    expect(bossKit.design).toBeUndefined();
    expect(changed.limbs).toEqual(bossKit.limbs);
    changed.design!.palette[0] = '#000000';
    expect(b.palette[0]).not.toBe('#000000');
  });
  it('repairs malformed fields, clamps lengths/colors/eyes, and strips unknown IDs', () => {
    const h = validateHero({ ...hero, title: 'x'.repeat(100), archetype: 'monster', headgear: 'invalid', palette: ['#aAbBcC', 'red'], emblem: 'λ{}', catchphrase: 'z'.repeat(100) }, profile, heroKit);
    expect(h.title).toHaveLength(24); expect(h.catchphrase).toHaveLength(40);
    expect(h.archetype).toBe(hero.archetype); expect(h.headgear).toBe(hero.headgear);
    expect(h.emblem).toBe('{}'); expect(h.palette).toEqual(['#aabbcc', ...hero.palette.slice(1)]);
    const b = validateBoss({ body: 'cute knight', eyes: 99, growths: ['cables', 'bad', 'cables', 'moss', 'gears', 'pipes'], intro: ['hi'], taunts: [], attackNames: { extra: 'bad', [bossKit.attacks[0].id]: 'x'.repeat(100) } }, profile, bossKit);
    expect(b.body).toBe(boss.body); expect(b.eyes).toBe(12); expect(b.growths).toEqual(['cables', 'moss', 'gears']);
    expect(b.intro).toHaveLength(2); expect(b.taunts).toHaveLength(3);
    expect(b.attackNames[bossKit.attacks[0].id]).toHaveLength(22);
    expect(Object.keys(b.attackNames)).toEqual(bossKit.attacks.map(a => a.id));
    expect(b.limbNames).toEqual(boss.limbNames);
    expect(validateBoss({ eyes: -50 }, profile, bossKit).eyes).toBe(1);
    expect(validateHero({ title: '\x00\x01' }, profile, heroKit).title).toBe(hero.title);
    expect(validateBoss({ intro: ['\x00'], taunts: ['\x01'] }, profile, bossKit).intro).toEqual(boss.intro.slice(0, 2));
  });
});

describe('credentials', () => {
  it('parses both key spellings, quotes, exports, and comments', () => {
    expect(parseApiKey('OTHER=x\nGEMINI-API-KEY="hyphen-key" # comment')).toBe('hyphen-key');
    expect(parseApiKey(" export GEMINI_API_KEY = 'quoted-key' ")).toBe('quoted-key');
    expect(parseApiKey('GEMINI_API_KEY=plain-key # comment')).toBe('plain-key');
    expect(parseApiKey('GEMINI_API_KEY=\nGEMINI-API-KEY=second')).toBe('second');
  });
  it('prefers env, root .env, then parent .env without printing secrets', async () => {
    const dir = await root(); const project = join(dir, 'project'); await mkdir(project);
    await writeFile(join(dir, '.env'), 'GEMINI-API-KEY=parent-secret');
    vi.stubEnv('GEMINI_API_KEY', '');
    expect(await readApiKey(project)).toBe('parent-secret');
    await writeFile(join(project, '.env'), 'GEMINI_API_KEY=root-secret');
    expect(await readApiKey(project)).toBe('root-secret');
    vi.stubEnv('GEMINI_API_KEY', 'env-secret');
    expect(await readApiKey(project)).toBe('env-secret');
  });
  it('silently skips network when no key is available', async () => {
    const fetcher = vi.fn(); const log = vi.spyOn(console, 'log'); const warn = vi.spyOn(console, 'warn');
    expect(await service(fetcher, { apiKey: '' }).designHero(profile, heroKit)).toEqual(hero);
    expect(fetcher).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled();
  });
});

describe('Gemini REST', () => {
  it('sends JSON schemas, context and the key only in a header; validates the result', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ ...hero, title: 'Flask Spellguard' }));
    const result = await service(fetcher).designHero({ ...profile, readme: 'A micro web framework', tree: ['src/flask/app.py'] }, heroKit);
    expect(result.title).toBe('Flask Spellguard');
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toContain('gemini-3.8-flash:generateContent'); expect(url).not.toContain('test-secret');
    expect(request.headers['x-goog-api-key']).toBe('test-secret');
    const body = JSON.parse(request.body);
    expect(body.generationConfig).toEqual({ responseMimeType: 'application/json', responseJsonSchema: heroSchema });
    expect(body.contents[0].parts[0].text).toContain('A micro web framework');
    expect(body.contents[0].parts[0].text).toContain('src/flask/app.py');
  });
  it('requires every boss ID and keeps prompt independent of playerCount', async () => {
    const fetcher = vi.fn().mockImplementation(async () => response(boss));
    await service(fetcher).designBoss(profile, bossKit);
    await service(fetcher).designBoss(profile, bossKitFromProfile(profile, 8));
    const bodies = fetcher.mock.calls.map(call => JSON.parse(call[1].body));
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0].generationConfig.responseJsonSchema).toEqual(bossSchema(bossKit));
    expect(bodies[0].generationConfig.responseJsonSchema.properties.attackNames.required).toEqual(bossKit.attacks.map(a => a.id));
  });
  it('retries lite once on HTTP error and honors a custom primary model', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(response(hero));
    expect(await service(fetcher, { model: 'custom-flash' }).designHero(profile, heroKit)).toEqual(hero);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toContain('custom-flash');
    expect(fetcher.mock.calls[1][0]).toContain('gemini-3.1-flash-lite');
  });
  it('falls back after two malformed or empty responses', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response([])).mockResolvedValueOnce(new Response('{}', { status: 200 }));
    expect(await service(fetcher).designBoss(profile, bossKit)).toEqual(boss);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not cache an empty JSON object as a successful design', async () => {
    const cacheDir = await root(), onResult = vi.fn();
    const fetcher = vi.fn().mockImplementation(async () => response({}));
    expect(await service(fetcher, { cacheDir, onResult }).designHero(profile, heroKit)).toEqual(hero);
    expect(fetcher).toHaveBeenCalledTimes(2); expect(await readdir(cacheDir)).toEqual([]);
    expect(onResult).toHaveBeenCalledWith({ slug: profile.slug, kind: 'hero', source: 'fallback' });
  });
  it('does not let a result callback failure repeat requests or reject usable art', async () => {
    const fetcher = vi.fn().mockImplementation(async () => response(hero));
    expect(await service(fetcher, { onResult() { throw new Error('observer failed'); } }).designHero(profile, heroKit)).toEqual(hero);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('aborts timed out calls and retries once before deterministic fallback', async () => {
    const fetcher = vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))));
    expect(await service(fetcher, { timeoutMs: 5 }).designHero(profile, heroKit)).toEqual(hero);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('cache and offline assets', () => {
  it('deduplicates simultaneous requests and returns isolated mutable results', async () => {
    const fetcher = vi.fn().mockImplementation(async () => response(hero)); const api = service(fetcher);
    const [a, b] = await Promise.all([api.designHero(profile, heroKit), api.designHero(profile, heroKit)]);
    expect(fetcher).toHaveBeenCalledTimes(1); a.palette[0] = '#000000'; expect(b.palette[0]).toBe(hero.palette[0]);
  });
  it('reuses persistent boss cache across player counts and new service instances', async () => {
    const cacheDir = await root(); const fetcher = vi.fn().mockImplementation(async () => response(boss));
    await service(fetcher, { cacheDir }).designBoss(profile, bossKit);
    const api = service(fetcher, { cacheDir, apiKey: '' });
    expect(await api.designBoss(profile, bossKitFromProfile(profile, 8))).toEqual(boss);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(designCacheKey(profile, 'boss', bossKit)).toMatch(new RegExp(`^${profile.slug}:${profile.seed}:boss:v2:[a-f0-9]{16}$`));
    expect(designCacheKey(profile, 'boss', bossKit)).toBe(designCacheKey(profile, 'boss', bossKitFromProfile(profile, 8)));
    expect(JSON.parse(await readFile(join(cacheDir, designCacheFilename(profile, 'boss', bossKit)), 'utf8')).design).toEqual(boss);
  });
  it('loads precomputed assets without credentials and rejects a mismatched seed', async () => {
    const assetDir = await root(); const fetcher = vi.fn();
    await writeFile(join(assetDir, 'manifest.json'), JSON.stringify({ version: 2, entries: { [profile.slug]: { seed: profile.seed, keys: { hero: designCacheKey(profile, 'hero', heroKit) } } } }));
    await writeFile(join(assetDir, `${designFileStem(profile.slug)}.hero.json`), JSON.stringify({ ...hero, title: 'Offline Spellguard' }));
    expect((await service(fetcher, { assetDir, apiKey: '' }).designHero(profile, heroKit)).title).toBe('Offline Spellguard');
    const altered = { ...profile, seed: profile.seed + 1 };
    expect(await service(fetcher, { assetDir, apiKey: '' }).designHero(altered, heroKit)).toEqual(fallbackHero(altered, heroKit));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('continues when cache writes are unavailable', async () => {
    const dir = await root(); const file = join(dir, 'not-a-directory'); await writeFile(file, 'x');
    expect(await service(undefined, { cacheDir: file }).designHero(profile, heroKit)).toEqual(hero);
  });
  it('ships valid hero/boss assets for every fallback repo, loadable offline at any squad size', async () => {
    const fetcher = vi.fn();
    const onResult = vi.fn();
    const api = service(fetcher, { apiKey: '', assetDir: new URL('../data/design/', import.meta.url).pathname, onResult });
    const fallbackDir = new URL('../data/fallback/', import.meta.url);
    const files = (await readdir(fallbackDir)).filter(file => file.endsWith('.json'));
    const manifest = JSON.parse(await readFile(new URL('../data/design/manifest.json', import.meta.url), 'utf8'));
    const savedEpithets: string[] = [];
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const file of files) {
      const p = JSON.parse(await readFile(new URL(file, fallbackDir), 'utf8')) as RepoProfile;
      expect(p.dna?.identifiers.length, `${p.slug} needs source DNA before design assets ship`).toBeGreaterThan(0);
      expect(p.dna?.tokens.length, `${p.slug} needs real source tokens`).toBeGreaterThan(0);
      const pk = playerKitFromProfile(p), bk = bossKitFromProfile(p, 8);
      const h = JSON.parse(await readFile(new URL(`../data/design/${designFileStem(p.slug)}.hero.json`, import.meta.url), 'utf8'));
      const b = JSON.parse(await readFile(new URL(`../data/design/${designFileStem(p.slug)}.boss.json`, import.meta.url), 'utf8'));
      if (manifest.entries[p.slug].boss.source === 'fallback') expect(b.name).toBe(fallbackBoss(p, bk).name);
      const suffix = b.name.slice(b.name.indexOf(',') + 1).trim();
      expect(suffix.replace(/[^a-z0-9]/gi, '').toLowerCase()).not.toContain(p.slug.split('/').pop()!.replace(/[^a-z0-9]/gi, '').toLowerCase());
      savedEpithets.push(suffix);
      expect(h).toEqual(validateHero(h, p, pk)); expect(b).toEqual(validateBoss(b, p, bk));
      expect(h.weaponName.length).toBeGreaterThan(0); expect(h.weaponName.length).toBeLessThanOrEqual(20);
      expect(await api.designHero(p, pk)).toEqual(h); expect(await api.designBoss(p, bk)).toEqual(b);
      expect(onResult).toHaveBeenCalledWith({ slug: p.slug, kind: 'hero', source: 'precomputed' });
      expect(onResult).toHaveBeenCalledWith({ slug: p.slug, kind: 'boss', source: 'precomputed' });
    }
    expect(new Set(savedEpithets).size, savedEpithets.join('\n')).toBe(files.length);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('gives every fallback boss a distinct DNA-derived epithet, stable across squad sizes', async () => {
    const fallbackDir = new URL('../data/fallback/', import.meta.url);
    const files = (await readdir(fallbackDir)).filter(file => file.endsWith('.json'));
    const epithets: string[] = [];
    for (const file of files) {
      const p = JSON.parse(await readFile(new URL(file, fallbackDir), 'utf8')) as RepoProfile;
      const name = fallbackBoss(p, bossKitFromProfile(p, 1)).name;
      expect(name).toBe(fallbackBoss(p, bossKitFromProfile(p, 8)).name);
      expect(name.length).toBeLessThanOrEqual(64);
      expect(name).not.toContain('THE UNMERGED');
      const suffix = name.slice(name.indexOf(',') + 1).trim();
      expect(suffix.replace(/[^a-z0-9]/gi, '').toLowerCase()).not.toContain(p.slug.split('/').pop()!.replace(/[^a-z0-9]/gi, '').toLowerCase());
      epithets.push(suffix);
    }
    expect(new Set(epithets).size, epithets.join('\n')).toBe(files.length);
  });
});

describe('code weapon names', () => {
  const weapon = { name: 'printf() Pistol', projectiles: ['"str"', '.then()'], muzzle: 'printf', impact: '\\n' };
  const kit = { ...heroKit, weapon: 'blaster' as const, code: {
    tokens: ['=>'], signature: 'emit()', snippet: 'return emit();', identifiers: ['emit'], weapon,
  } };

  it('provides deterministic names for every weapon kind and retains sim language flavors', () => {
    const names = new Set<string>();
    const kinds: WeaponKind[] = ['blaster', 'smg', 'shotgun', 'cannon', 'staff', 'laser', 'blade'];
    for (const kind of kinds) {
      const legacy = { ...heroKit, weapon: kind, code: undefined };
      const a = fallbackHero(profile, legacy), b = fallbackHero(profile, legacy);
      expect(a.weaponName).toBe(b.weaponName); expect(a.weaponName!.length).toBeLessThanOrEqual(20);
      names.add(a.weaponName!);
    }
    expect(names.size).toBe(kinds.length);
    expect(fallbackHero(profile, { ...kit, code: { ...kit.code, weapon: { ...weapon, name: 'Promise Blaster' } } }).weaponName).toBe('Promise Blaster');
  });

  it('accepts optional Gemini names and clamps invalid or missing names to usable fallback', () => {
    expect(heroSchema.required).not.toContain('weaponName');
    expect(heroSchema.properties.weaponName).toEqual({ type: 'string', minLength: 1, maxLength: 20 });
    expect(validateHero({ ...hero, weaponName: 'x'.repeat(80) }, profile, kit).weaponName).toHaveLength(20);
    for (const value of [undefined, null, 42, '', '  ', '\x00']) {
      expect(validateHero({ ...hero, weaponName: value }, profile, kit).weaponName).toBe(weapon.name);
    }
  });

  it('maps only the weapon name and leaves all stats, code, glyphs and FX intact', () => {
    const design = { ...hero, weaponName: 'emit() Pistol' };
    const changed = applyHeroDesign(kit, design);
    expect(changed).toEqual({ ...kit, design, title: design.title, palette: design.palette,
      code: { ...kit.code, weapon: { ...weapon, name: 'emit() Pistol' } } });
    expect(kit.code.weapon.name).toBe('printf() Pistol');
    expect(changed.code!.weapon!.projectiles).toEqual(weapon.projectiles);
    expect(changed.code!.weapon!.muzzle).toBe(weapon.muzzle); expect(changed.code!.weapon!.impact).toBe(weapon.impact);
  });

  it('keeps old designs and old kits compatible without constructing partial weapons', () => {
    const { weaponName: _ignored, ...oldDesign } = hero;
    expect(applyHeroDesign(kit, oldDesign).code).toEqual(kit.code);
    expect(applyHeroDesign({ ...heroKit, code: undefined }, { ...hero, weaponName: 'Byte Pistol' }).code).toBeUndefined();
  });

  it('sends the existing weapon vocabulary to Gemini and maps a returned rename', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ ...hero, weaponName: 'emit() Pistol' }));
    const design = await service(fetcher).designHero(profile, kit);
    expect(applyHeroDesign(kit, design).code!.weapon!.name).toBe('emit() Pistol');
    const prompt = JSON.parse(fetcher.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain('optional weaponName'); expect(prompt).toContain('plain weapon hint');
    expect(prompt).toContain(JSON.stringify(weapon));
  });

  it('invalidates hero caches for the weapon vocabulary, while renaming never rerolls art or bosses', () => {
    const renamed = applyHeroDesign(kit, { ...hero, weaponName: 'emit() Pistol' });
    expect(designCacheKey(profile, 'hero', renamed)).toBe(designCacheKey(profile, 'hero', kit));
    expect(designCacheKey(profile, 'hero', { ...kit, code: { ...kit.code, weapon: { ...weapon, projectiles: ['go'] } } })).not.toBe(designCacheKey(profile, 'hero', kit));
    expect(fallbackBoss(profile, bossKitFromProfile(profile, 8)).name).toBe(boss.name);
  });
});

describe('real source DNA (round 2)', () => {
  const dna: CodeDNA = {
    identifiers: ['renderForest', 'releaseSentinel'], componentSymbols: { [profile.components[0].name]: ['renderForest', 'meshReady'] },
    heartLines: ['return renderForest(tree);'], snippets: [{ file: 'src/main.ts', line: 7, code: 'function renderForest(tree) {' }],
    todos: [{ file: 'src/main.ts', text: 'TODO: remove this hack' }], commits: ['fix fern recursion'], tokens: ['=>', 'const', '{}'],
    bigFiles: [{ path: 'src/main.ts', loc: 120 }], longestFunction: { name: 'renderForest', file: 'src/main.ts', lines: 42 },
    counts: { functions: 4, classes: 1, todo: 1, fixme: 0, hack: 1, comments: 5 }, maxNesting: 4, avgLineLength: 32, indent: 'spaces2',
  };
  const p: RepoProfile = { ...profile, dna };

  it('grounds fallback hero identity, emblem, limbs, attacks, intro and taunts in real source', () => {
    const h = fallbackHero(p, heroKit), b = fallbackBoss(p, bossKit);
    expect(h.title).toContain('renderForest'); expect(h.catchphrase).toContain('renderForest'); expect(h.emblem).toBe('=>');
    const firstLimb = bossKit.limbs[0];
    expect(b.limbNames[firstLimb.id]).toMatch(/renderForest|meshReady/);
    expect(b.attackNames[bossKit.attacks[0].id]).toContain('renderForest');
    expect(b.taunts.some(line => line.includes('TODO: remove this hack'))).toBe(true);
    expect(b.taunts.some(line => line.includes('fix fern recursion'))).toBe(true);
    expect(b.intro).toContain('return renderForest(tree);');
    expect(fallbackBoss(p, bossKitFromProfile(p, 8))).toEqual(b);
  });
  it('derives the boss surname and cache identity from the heart, cycles and age', () => {
    const moon = { ...p, heart: 'src/moonlight.ts' }, sun = { ...p, heart: 'src/sunfire.ts' };
    expect(fallbackBoss(moon, bossKit).name).toContain('MOONLIGHT');
    expect(fallbackBoss(sun, bossKit).name).toContain('SUNFIRE');
    expect(fallbackBoss(moon, bossKit).name).not.toBe(fallbackBoss(sun, bossKit).name);
    expect(designCacheKey(p, 'boss', bossKit)).not.toBe(designCacheKey({ ...p, ageDays: 0 }, 'boss', bossKit));
    expect(designCacheKey(p, 'boss', bossKit)).not.toBe(designCacheKey({ ...p, cycles: [['loop-a', 'loop-b']] }, 'boss', bossKit));
  });
  it('uses real longest-function DNA when the heart only repeats the repo name', () => {
    const named = { ...p, slug: 'owner/forest', heart: 'src/forest/__init__.py', dna: { ...dna,
      identifiers: ['Forest', 'forestBuilder'], longestFunction: { name: 'make_response', file: 'src/forest/app.py', lines: 141 },
    } };
    const suffix = fallbackBoss(named, bossKit).name.split(', ')[1];
    expect(suffix).toContain('MAKE RESPONSE'); expect(suffix).not.toContain('FOREST');
    expect(designCacheKey(named, 'boss', bossKit)).not.toBe(designCacheKey({ ...named, dna: { ...named.dna, longestFunction: null } }, 'boss', bossKit));
  });

  it('uses kit.code limbSymbols/tokens/taunts even if profile DNA is missing', () => {
    const withoutDNA = { ...profile, dna: undefined };
    const h = fallbackHero(withoutDNA, { ...heroKit, code: { tokens: ['::'], signature: 'forge()', snippet: 'fn forge() {}', identifiers: ['forge'] } });
    const b = fallbackBoss(withoutDNA, { ...bossKit, code: {
      tokens: ['fn'], heartLines: ['fn forge() {}'], snippets: [], todos: ['FIXME: molten borrow'], commits: ['cool the forge'],
      limbSymbols: { [bossKit.limbs[0].id]: ['forge'] },
    } });
    expect(h.emblem).toBe('::'); expect(h.title).toContain('forge');
    expect(b.limbNames[bossKit.limbs[0].id]).toContain('forge');
    expect(b.taunts.join(' ')).toContain('FIXME: molten borrow'); expect(b.taunts.join(' ')).toContain('cool the forge');
  });

  it('passes real DNA into both public Gemini prompts without balance values', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(hero)).mockResolvedValueOnce(response(boss));
    await service(fetcher).designHero(p, heroKit);
    await service(fetcher).designBoss(p, bossKit);
    for (const [, request] of fetcher.mock.calls) {
      const prompt = JSON.parse(request.body).contents[0].parts[0].text;
      for (const value of ['renderForest', 'meshReady', 'TODO: remove this hack', 'fix fern recursion', 'return renderForest(tree);', '=>']) expect(prompt).toContain(value);
      expect(prompt).toContain('Quote real identifiers');
      expect(prompt).not.toContain('maxHp'); expect(prompt).not.toContain('damageMul'); expect(prompt).not.toContain('cooldown');
    }
  });

  it('invalidates same-slug/seed art when DNA changes and ignores legacy assets', async () => {
    const cacheDir = await root(), assetDir = await root();
    const fetcher = vi.fn().mockImplementation(async () => response(hero));
    const api = service(fetcher, { cacheDir, assetDir });
    const changed = { ...p, dna: { ...dna, identifiers: ['growForest'] } };
    await writeFile(join(assetDir, 'manifest.json'), JSON.stringify({ version: 1, entries: { [p.slug]: { seed: p.seed } } }));
    await writeFile(join(assetDir, `${designFileStem(p.slug)}.hero.json`), JSON.stringify({ ...hero, title: 'Legacy art' }));
    expect((await api.designHero(p, heroKit)).title).not.toBe('Legacy art');
    await api.designHero(changed, heroKit);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(designCacheKey(p, 'hero', heroKit)).not.toBe(designCacheKey(changed, 'hero', heroKit));
    expect((await readdir(cacheDir)).length).toBe(2);
  });

  it('rejects bundled source designs whose DNA fingerprint no longer matches', async () => {
    const assetDir = await root();
    await writeFile(join(assetDir, 'manifest.json'), JSON.stringify({ version: 2, entries: { [p.slug]: { seed: p.seed, keys: { hero: designCacheKey(p, 'hero', heroKit) } } } }));
    await writeFile(join(assetDir, `${designFileStem(p.slug)}.hero.json`), JSON.stringify({ ...hero, title: 'Old source art' }));
    const changed = { ...p, dna: { ...dna, identifiers: ['growForest'] } };
    const fetcher = vi.fn();
    expect((await service(fetcher, { assetDir, apiKey: '' }).designHero(changed, heroKit)).title).toContain('growForest');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps private/credentialed DNA room-local, bypassing network, caches and callbacks', async () => {
    const cacheDir = await root(), assetDir = await root();
    const fetcher = vi.fn().mockImplementation(async () => response(hero));
    const onResult = vi.fn();
    const api = service(fetcher, { cacheDir, assetDir, onResult });
    await api.designHero(p, heroKit); // Populate the public cache first.
    fetcher.mockClear(); onResult.mockClear();
    const privateProfile = { ...p, readme: 'PRIVATE-README-SENTINEL', dna: { ...dna, identifiers: ['privateSymbol'], todos: [{ file: 'internal.ts', text: 'TODO: PRIVATE-CODE-SENTINEL' }] } };
    const [h, b] = await Promise.all([
      api.designHero(privateProfile, heroKit, { credentialed: true }),
      api.designBoss(privateProfile, bossKit, { private: true }),
    ]);
    expect(h.title).toContain('privateSymbol'); expect(b.taunts.join(' ')).toContain('PRIVATE-CODE-SENTINEL');
    expect(fetcher).not.toHaveBeenCalled(); expect(onResult).not.toHaveBeenCalled();
    expect(await readdir(assetDir)).toEqual([]);
    const files = await readdir(cacheDir); expect(files).toHaveLength(1);
    expect(await readFile(join(cacheDir, files[0]), 'utf8')).not.toContain('PRIVATE');
  });

  it('drops accidental secret-shaped code lines before public prompt/persistence', async () => {
    const fetcher = vi.fn().mockImplementation(async () => response(hero));
    await service(fetcher).designHero({ ...p, dna: { ...dna, heartLines: ['api_key = "SAMPLE-NOT-A-KEY"', 'safeFunction()'], commits: ['secret = "SAMPLE-NOT-A-KEY"'] } }, heroKit);
    const body = fetcher.mock.calls[0][1].body;
    expect(body).toContain('safeFunction()'); expect(body).not.toContain('SAMPLE-NOT-A-KEY');
  });
});
