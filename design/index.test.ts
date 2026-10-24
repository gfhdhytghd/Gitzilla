import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import rawProfile from '../data/fallback/pallets__flask.json';
import type { RepoProfile } from '../shared/types.ts';
import { bossKitFromProfile, playerKitFromProfile } from '../sim/kits.ts';
import { applyBossDesign, applyHeroDesign, createDesignService, designCacheKey, designFileStem, fallbackBoss, fallbackHero, parseApiKey, readApiKey, validateBoss, validateHero } from './index.ts';
import { bossSchema, heroSchema } from './schema.ts';

const profile: RepoProfile = { ...rawProfile, edges: rawProfile.edges.map(([from, to]) => [from, to]) };
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
    expect(designCacheKey(profile, 'boss')).toBe(`${profile.slug}:${profile.seed}:boss:v1`);
    expect(JSON.parse(await readFile(join(cacheDir, `${designFileStem(profile.slug)}.${profile.seed}.boss.v1.json`), 'utf8')).design).toEqual(boss);
  });
  it('loads precomputed assets without credentials and rejects a mismatched seed', async () => {
    const assetDir = await root(); const fetcher = vi.fn();
    await writeFile(join(assetDir, 'manifest.json'), JSON.stringify({ entries: { [profile.slug]: { seed: profile.seed } } }));
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
    const api = service(fetcher, { apiKey: '', assetDir: new URL('../data/design/', import.meta.url).pathname });
    const fallbackDir = new URL('../data/fallback/', import.meta.url);
    const files = (await readdir(fallbackDir)).filter(file => file.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const file of files) {
      const p = JSON.parse(await readFile(new URL(file, fallbackDir), 'utf8')) as RepoProfile;
      const pk = playerKitFromProfile(p), bk = bossKitFromProfile(p, 8);
      const h = JSON.parse(await readFile(new URL(`../data/design/${designFileStem(p.slug)}.hero.json`, import.meta.url), 'utf8'));
      const b = JSON.parse(await readFile(new URL(`../data/design/${designFileStem(p.slug)}.boss.json`, import.meta.url), 'utf8'));
      expect(h).toEqual(validateHero(h, p, pk)); expect(b).toEqual(validateBoss(b, p, bk));
      expect(await api.designHero(p, pk)).toEqual(h); expect(await api.designBoss(p, bk)).toEqual(b);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
