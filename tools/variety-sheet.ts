/** Renderer measurement only. Uses existing DEV5175; never starts or stops a server. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { transformWithEsbuild } from 'vite';
import type { BossKit, PlayerKit, RepoProfile } from '../shared/types.ts';
import { bossKitFromProfile, playerKitFromProfile } from '../sim/kits.ts';
import { applyBossDesign, applyHeroDesign, fallbackBoss, fallbackHero } from '../design/index.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const readJSON = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
export const PROTOCOL = {
  version: 1, syntheticCount: 30, frameTimeSeconds: 0.35, heroFrame: 0, phase: 1, pose: 'idle',
  alphaThreshold: 128, histogramBinsPerChannel: 8, normalizedSize: 64, dHashSize: [9, 8],
  distance: '0.5 * normalized dHash Hamming + 0.5 * RGB histogram total variation',
  lookalike: { maxDHash: 8 / 64, maxHistogram: 0.20, sameGroupOnly: true },
  shapeLookalike: { maxDHash: 8 / 64, sameGroupOnly: true, ignoresColour: true },
  framing: 'Foreground alpha>=128 bounding box fit into centered60x60 inside64x64; dHash on neutral matte. Histogram excludes transparent/background pixels. Sheet labels never enter scores.',
  scope: 'Actual 2D lobby portraits and idle fight sprites, not animation/3D/gameplay acceptance. Synthetic DNA is invented and explicitly labeled; no provider calls.',
};
export interface Fixture { id: string; origin: 'fallback' | 'synthetic'; designPath: string; profile: RepoProfile; hero: PlayerKit; boss: BossKit }
export interface Feature {
  id: string; origin: Fixture['origin']; group: string; base: string; palette: string[];
  dHash: string; histogram: number[]; entropyBits: number; foregroundPixels: number;
  bounds: number[]; touchesEdge: boolean; pixelHash: string;
}
export function selectedKinds(value: string): Array<'heroes' | 'bosses'> {
  assert(['all', 'heroes', 'bosses'].includes(value), '--kind must be all, heroes or bosses');
  return value === 'all' ? ['heroes', 'bosses'] : [value as 'heroes' | 'bosses'];
}
export const entropy = (histogram: number[]) => histogram.reduce((sum, p) => p > 0 ? sum - p * Math.log2(p) : sum, 0);
export function distance(a: Pick<Feature, 'dHash' | 'histogram'>, b: Pick<Feature, 'dHash' | 'histogram'>) {
  assert.equal(a.histogram.length, b.histogram.length);
  const dHash = (BigInt('0x' + a.dHash) ^ BigInt('0x' + b.dHash)).toString(2).replace(/0/g, '').length / 64;
  const histogram = a.histogram.reduce((sum, p, i) => sum + Math.abs(p - b.histogram[i]), 0) / 2;
  return { dHash, histogram, combined: (dHash + histogram) / 2 };
}
export function score(features: Feature[]) {
  const pairs = features.flatMap((a, i) => features.slice(i + 1).map(b => {
    const d = distance(a, b);
    return { a: a.id, b: b.id, ...d, sameGroup: a.group === b.group,
      lookalike: a.group === b.group && d.dHash <= PROTOCOL.lookalike.maxDHash && d.histogram <= PROTOCOL.lookalike.maxHistogram };
  })).sort((a, b) => a.combined - b.combined || a.a.localeCompare(b.a) || a.b.localeCompare(b.b));
  const stats = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? { min: sorted[0], p10: sorted[Math.floor((sorted.length - 1) * .1)], median: sorted[Math.floor(sorted.length / 2)], mean: sorted.reduce((a, b) => a + b, 0) / sorted.length, max: sorted.at(-1)! } : null;
  };
  const components = (selected: typeof pairs) => {
    const adjacent = new Map(features.map(f => [f.id, new Set<string>()]));
    for (const pair of selected) { adjacent.get(pair.a)!.add(pair.b); adjacent.get(pair.b)!.add(pair.a); }
    const seen = new Set<string>(), clusters: string[][] = [];
    for (const f of features) {
      if (seen.has(f.id)) continue;
      const queue = [f.id], members: string[] = []; seen.add(f.id);
      while (queue.length) { const id = queue.pop()!; members.push(id); for (const next of adjacent.get(id)!) if (!seen.has(next)) { seen.add(next); queue.push(next); } }
      if (members.length > 1) clusters.push(members.sort());
    }
    return clusters;
  };
  const clusters = components(pairs.filter(p => p.lookalike));
  const shapePairs = pairs.filter(p => p.sameGroup && p.dHash <= PROTOCOL.shapeLookalike.maxDHash), shapeClusters = components(shapePairs);
  const pooled = Array.from({ length: features[0]?.histogram.length ?? 0 }, (_, i) => features.reduce((n, f) => n + f.histogram[i], 0) / features.length);
  const pooledBits = entropy(pooled), meanImageBits = features.reduce((n, f) => n + f.entropyBits, 0) / Math.max(1, features.length);
  return { samples: features.length, pairs: pairs.length, combined: stats(pairs.map(p => p.combined)), dHash: stats(pairs.map(p => p.dHash)), histogram: stats(pairs.map(p => p.histogram)),
    paletteEntropy: { pooledBits, meanImageBits, betweenImageBits: Math.max(0, pooledBits - meanImageBits), maxBits: 9 },
    lookalikePairs: pairs.filter(p => p.lookalike).length, clusteredSamples: clusters.flat().length, clusters,
    shapeLookalikes: { pairs: shapePairs.length, clusteredSamples: shapeClusters.flat().length, clusters: shapeClusters }, nearestPairs: pairs.slice(0, 12) };
}

export function syntheticProfiles(): RepoProfile[] {
  const langs = ['Rust', 'C', 'C++', 'Go', 'TypeScript', 'JavaScript', 'Python', 'Java', 'Ruby', 'Kotlin', 'Swift', 'Lua', 'PHP', 'C#', 'Zig', 'Haskell', 'SQL', 'Elixir', 'R', 'Julia'];
  return Array.from({ length: 30 }, (_, i) => {
    const slug = `synthetic/variety-${String(i + 1).padStart(2, '0')}`;
    const seed = parseInt(sha(slug).slice(0, 8), 16), shape = i % 4;
    let language = langs[i % langs.length];
    if (shape === 2 && !/^(C|C\+\+|Rust|Go|Zig)$/.test(language)) language = ['Rust', 'C', 'C++', 'Go', 'Zig'][Math.floor(i / 4) % 5];
    const n = shape === 1 ? 4 + i % 5 : 1 + i % 8;
    const totalLoc = shape === 3 ? 40000 + i * 173 : shape === 2 ? 100000 + i * 131 : 300 + i * 237;
    const components = Array.from({ length: n }, (_, j) => ({ name: `src/module_${j}`, loc: Math.floor(totalLoc / n), files: 3 + j, fanIn: 1 + (j + i) % 5, fanOut: Math.min(n - 1, shape === 1 ? 6 : 2), maintainers: 1 + j % 4 }));
    const ids = Array.from({ length: 24 }, (_, j) => `${['route', 'walk', 'render', 'parse', 'serve', 'dispatch'][j % 6]}${i}_${j}`);
    return { slug, description: 'Explicit synthetic variety fixture; not a real repository.', stars: 20 + i * 2301, primaryLanguage: language, languages: { [language]: totalLoc * 30 },
      totalFiles: 20 + i * 17, totalLoc, commits: 30 + i * 301, contributors: 1 + i * 7, ageDays: shape === 3 ? 6500 + i * 10 : 200 + i * 75,
      components, heart: 'src/module_0/heart', heartFanIn: components[0].fanIn, edges: components.slice(1).map((_, j) => [j, j + 1] as [number, number]),
      cycles: shape === 1 ? [[components[0].name, components[1].name], [components[2].name, components[3].name]] : [], maxDepth: shape === 2 ? 4 : 1 + i % 2,
      testRatio: (i % 7) / 10, seed, fallback: false,
      dna: { identifiers: ids, componentSymbols: Object.fromEntries(components.map((c, j) => [c.name, ids.slice(j * 2, j * 2 + 2)])),
        heartLines: [`${ids[0]}()`, `return ${ids[1]}()`], snippets: [{ file: 'src/module_0/heart', line: 1, code: `${ids[0]}()` }],
        todos: [{ file: 'src/module_0/heart', text: `TODO: measure fixture ${i}` }], commits: [`synthetic fixture ${i}`],
        tokens: /Rust|C|Go|Zig/.test(language) ? ['fn', '::', '*', '->'] : language === 'Python' ? ['def', 'yield', ':', 'return'] : ['=>', '{}', 'return', 'const'],
        bigFiles: [{ path: 'src/module_0/heart', loc: Math.floor(totalLoc / n) }], longestFunction: { name: ids[0], file: 'src/module_0/heart', lines: 10 + i * 3 },
        counts: { functions: 30 + i * 10, classes: i, todo: i * 3, fixme: i, hack: i % 5, comments: 20 + i * 7 }, maxNesting: 1 + i % 8, avgLineLength: 30 + i, indent: i % 3 ? 'spaces2' : 'tabs' },
    };
  });
}
function fixtures(): Fixture[] {
  const publicRepos = readdirSync(join(ROOT, 'data/fallback')).filter(f => f.endsWith('.json')).sort().map((file, i): Fixture => {
    const p = readJSON(join(ROOT, 'data/fallback', file)) as RepoProfile, stem = file.slice(0, -5);
    return { id: `B${String(i + 1).padStart(2, '0')}`, origin: 'fallback', designPath: 'bundled Gemini', profile: p,
      hero: applyHeroDesign(playerKitFromProfile(p), readJSON(join(ROOT, `data/design/${stem}.hero.json`))),
      boss: applyBossDesign(bossKitFromProfile(p, 4), readJSON(join(ROOT, `data/design/${stem}.boss.json`))) };
  });
  return publicRepos.concat(syntheticProfiles().map((p, i): Fixture => {
    const hero = playerKitFromProfile(p), boss = bossKitFromProfile(p, 4), designed = i % 2 === 1;
    return { id: `S${String(i + 1).padStart(2, '0')}`, origin: 'synthetic', designPath: designed ? 'deterministic design' : 'seed-only', profile: p,
      hero: designed ? applyHeroDesign(hero, fallbackHero(p, hero)) : hero, boss: designed ? applyBossDesign(boss, fallbackBoss(p, boss)) : boss };
  }));
}
function sources(ref?: string, kind = 'all') {
  const dirs = ['client/render', 'shared'];
  const paths = (ref ? execFileSync('git', ['ls-tree', '-r', '--name-only', ref, '--', ...dirs], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n')
    : dirs.flatMap(dir => readdirSync(join(ROOT, dir), { recursive: true }).map(name => join(dir, String(name)))))
    .filter(f => /\.(ts|json)$/.test(f) && !/\.(test|spec)\.ts$|(?:^|\/)gallery\.ts$|client\/render\/stage25d\//.test(f))
    .filter(f => !(kind === 'heroes' && f.startsWith('client/render/boss/')) && !(kind === 'bosses' && f.startsWith('client/render/player/'))).sort();
  const contents = Object.fromEntries(paths.map(path => [path, ref ? execFileSync('git', ['show', `${ref}:${path}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }) : readFileSync(join(ROOT, path), 'utf8')]));
  const files = Object.fromEntries(Object.entries(contents).map(([path, content]) => [path, sha(content)]));
  return { hash: sha(JSON.stringify(files)), files, contents, sourceRef: ref ?? 'working-tree' };
}

async function render(page: Page, input: Fixture[], revision: string, kinds: Array<'heroes' | 'bosses'>) {
  return page.evaluate(async ({ input, revision, protocol, kinds }) => {
    const player = (kinds.includes('heroes') ? await import(/* @vite-ignore */ `/client/render/player/index.ts?variety=${revision}`) : null) as typeof import('../client/render/player/index.ts');
    const boss = (kinds.includes('bosses') ? await import(/* @vite-ignore */ `/client/render/boss/index.ts?variety=${revision}`) : null) as typeof import('../client/render/boss/index.ts');
    const { fx } = await import(/* @vite-ignore */ `/client/render/arena/fx.ts?variety=${revision}`) as typeof import('../client/render/arena/fx.ts');
    const canvas = (size: number) => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
    const views: Record<string, { sheet: string; features: Feature[] }> = {};
    for (const kind of kinds) for (const view of ['portraits', 'fight'] as const) {
      const sheet = document.createElement('canvas'); sheet.width = 9 * 256; sheet.height = 68 + Math.ceil(input.length / 9) * 284;
      const g = sheet.getContext('2d')!; g.fillStyle = '#0c111b'; g.fillRect(0, 0, sheet.width, sheet.height); g.imageSmoothingEnabled = false;
      g.font = 'bold 22px monospace'; g.fillStyle = '#e6edf3'; g.fillText(`Gitzilla · ${kind} ${view} · ${input.length} inputs`, 16, 29);
      g.font = '13px monospace'; g.fillStyle = '#9caac0'; g.fillText('B = bundled public repo · S = synthetic · idle t=0.35s · label-free scores', 16, 52);
      const features: Feature[] = [];
      for (let i = 0; i < input.length; i++) {
        const f = input[i], kit = kind === 'heroes' ? f.hero : f.boss;
        let s = (kit.seed ^ 0x7f4a7c15) >>> 0;
        Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
        fx.look = null; fx.project = null; fx.pvp = false; fx.victoryAt = -1; fx.defeatAt = -1; fx.bossFlash = -10; fx.limbFlash.clear(); fx.now = protocol.frameTimeSeconds;
        let cv: HTMLCanvasElement, group: string, base: string, palette: string[];
        if (kind === 'heroes') {
          const look = player.lookFor(f.hero); group = look.cls;
          base = [look.cls, look.headgear, look.back, look.crest].join(':'); palette = [look.c.primary, look.c.secondary, look.c.accent, look.c.skin];
          if (view === 'portraits') cv = player.playerPortrait(f.hero, 192, 0);
          else {
            cv = canvas(128);
            player.drawPlayer(cv.getContext('2d')!, { id: f.id, name: 'A', x: 64, y: 68, vx: 0, vy: 0, facing: [1, 0], hp: f.hero.maxHp, armor: f.hero.maxArmor, energy: f.hero.maxEnergy,
              alive: true, downedFor: 0, reviveProgress: 0, skillCd: 0, dashCd: 0, invuln: 0, buffs: [], perks: [], kit: f.hero,
              stats: { damage: 0, bestCombo: 0, limbsBroken: 0, revives: 0, killingBlow: false } }, protocol.frameTimeSeconds, false);
          }
        } else {
          const layout = boss.bossLayout(f.boss); group = f.boss.archetype; base = [layout.body, layout.kaiju?.hint ?? ''].join(':'); palette = [...f.boss.palette];
          if (view === 'portraits') cv = boss.bossPortrait(f.boss, 256);
          else {
            const frame = boss.portraitFrame(f.boss), size = Math.max(256, frame.logical + 64); cv = canvas(size);
            const x = frame.bx + (size - frame.logical) / 2, y = frame.by + (size - frame.logical) / 2;
            boss.drawBoss(cv.getContext('2d')!, { x, y, hp: f.boss.maxHp, maxHp: f.boss.maxHp, phase: 1,
              limbs: f.boss.limbs.map(l => ({ id: l.id, hp: l.maxHp, maxHp: l.maxHp, broken: false })), casting: null, targetPlayer: null, enraged: false,
              pose: { name: 'idle', t: 0, total: 1, dir: [-1, 0] }, airborne: false, regions: boss.bossHitRegions(f.boss, x, y), kit: f.boss }, protocol.frameTimeSeconds);
          }
        }
        const pixels = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height), hist = Array(512).fill(0);
        let left = cv.width, top = cv.height, right = -1, bottom = -1, count = 0;
        for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
          const j = (y * cv.width + x) * 4;
          if (pixels.data[j + 3] < protocol.alphaThreshold) continue;
          left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); count++;
          hist[(pixels.data[j] >> 5) * 64 + (pixels.data[j + 1] >> 5) * 8 + (pixels.data[j + 2] >> 5)]++;
        }
        if (!count) throw new Error(`Empty renderer output: ${kind}/${view}/${f.id}`);
        const normalized = canvas(64), n = normalized.getContext('2d')!;
        const w = right - left + 1, h = bottom - top + 1, scale = 60 / Math.max(w, h);
        n.imageSmoothingEnabled = false; n.drawImage(cv, left, top, w, h, (64 - w * scale) / 2, (64 - h * scale) / 2, w * scale, h * scale);
        const tiny = document.createElement('canvas'); tiny.width = 9; tiny.height = 8;
        const t = tiny.getContext('2d')!; t.fillStyle = '#181c26'; t.fillRect(0, 0, 9, 8); t.imageSmoothingEnabled = true; t.drawImage(normalized, 0, 0, 9, 8);
        const gray = t.getImageData(0, 0, 9, 8).data;
        const lum = (j: number) => gray[j] * .299 + gray[j + 1] * .587 + gray[j + 2] * .114;
        let bits = ''; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += lum((y * 9 + x) * 4) > lum((y * 9 + x + 1) * 4) ? '1' : '0';
        const histogram = hist.map(p => p / count), entropyBits = histogram.reduce((a, p) => p ? a - p * Math.log2(p) : a, 0);
        const digest = await crypto.subtle.digest('SHA-256', pixels.data.slice().buffer);
        features.push({ id: f.id, origin: f.origin, group, base, palette, dHash: BigInt('0b' + bits).toString(16).padStart(16, '0'), histogram, entropyBits,
          foregroundPixels: count, bounds: [left, top, w, h], touchesEdge: !left || !top || right === cv.width - 1 || bottom === cv.height - 1,
          pixelHash: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') });
        const cx = (i % 9) * 256, cy = 68 + Math.floor(i / 9) * 284;
        g.fillStyle = '#131d2a'; g.fillRect(cx + 4, cy + 4, 248, 276);
        g.drawImage(cv, cx + 16, cy + 8, 224, 224); g.font = 'bold 12px monospace'; g.fillStyle = f.origin === 'fallback' ? '#69e4d4' : '#edbc74';
        g.fillText(`${f.id} ${f.profile.slug}`, cx + 12, cy + 246, 232); g.font = '11px monospace'; g.fillStyle = '#b3c0d4';
        g.fillText(`${group} · ${f.profile.primaryLanguage} · ${f.designPath}`, cx + 12, cy + 266, 232);
      }
      views[`${kind}-${view}`] = { sheet: sheet.toDataURL('image/png'), features };
    }
    return views;
  }, { input, revision, protocol: PROTOCOL, kinds });
}

export async function main() {
  const args = process.argv.slice(2), option = (name: string, fallback?: string) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  const label = option('--label', 'baseline')!; assert(/^[a-z0-9_-]+$/i.test(label), 'Use a simple --label');
  const kind = option('--kind', 'all')!, kinds = selectedKinds(kind);
  const base = new URL(option('--base', process.env.VARIETY_URL ?? 'http://localhost:5175')!);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) && base.port === '5175', 'Only the existing DEV5175 server is allowed');
  const out = resolve(ROOT, option('--out', 'docs/variety')!), run = join(out, label); mkdirSync(run, { recursive: true });
  const fixtureArg = option('--fixtures'), input: Fixture[] = fixtureArg ? readJSON(resolve(ROOT, fixtureArg)).fixtures : fixtures();
  assert.equal(input.length, 45); assert.equal(new Set(input.map(f => f.id)).size, 45);
  const sourceArg = option('--source-ref');
  const sourceRef = sourceArg ? execFileSync('git', ['rev-parse', '--verify', `${sourceArg}^{commit}`], { cwd: ROOT, encoding: 'utf8' }).trim() : undefined;
  const fixtureHash = sha(JSON.stringify(input)), before = sources(sourceRef, kind), errors: string[] = [];
  // Snapshot unchanged renderer sources into the browser fixture, not into product files.
  // This supports a committed BEFORE revision while owners edit the shared worktree.
  const modules = Object.fromEntries(await Promise.all(Object.entries(before.contents).map(async ([path, content]) => {
    if (path.endsWith('.json')) return [path, `export default ${JSON.stringify(JSON.parse(content))};`];
    const transformed = await transformWithEsbuild(content, path, { loader: 'ts', target: 'es2023', format: 'esm' });
    const code = transformed.code.replace(/((?:from\s*|import\s*\(?\s*)["'])(\.[^"']+)(["'])/g,
      (_all, start: string, specifier: string, end: string) => `${start}${specifier}${specifier.includes('?') ? '&' : '?'}variety=${before.hash}${end}`);
    return [path, code];
  })));
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/chromium');
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const capture = async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', colorScheme: 'dark' });
      // tsx/esbuild's serialized function-name helper belongs only to this isolated fixture.
      await context.addInitScript('window.__name = (fn) => fn; let s=12345; Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296};');
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      page.on('requestfailed', request => errors.push(`Module request failed: ${new URL(request.url()).pathname}`));
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/__variety-sheet') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">' });
        if (url.origin !== base.origin) return route.abort();
        const path = decodeURIComponent(url.pathname.slice(1));
        const module = modules[path] ?? modules[path + '.ts'] ?? modules[path + '/index.ts'];
        if (module !== undefined) return route.fulfill({ contentType: 'text/javascript', body: module });
        if (url.pathname.startsWith('/client/render/') || url.pathname.startsWith('/shared/')) { errors.push(`Unpinned module: ${path}`); return route.abort(); }
        return route.continue();
      });
      await page.routeWebSocket('**/*', socket => socket.close());
      await page.goto(new URL('/__variety-sheet', base).toString());
      try { return await render(page, input, before.hash, kinds); }
      catch (error) { throw new Error(`${String(error)}\n${errors.join('\n')}`); }
      finally { await context.close(); }
    };
    const first = await capture(), second = await capture();
    assert.deepEqual(errors, [], 'Browser renderer errors');
    for (const key of Object.keys(first)) assert.deepEqual(first[key].features.map(f => f.pixelHash), second[key].features.map(f => f.pixelHash), `Non-deterministic ${key}`);
    assert.equal(before.hash, sources(sourceRef, kind).hash, 'Render sources changed during capture; repeat on a stable revision');
    const views = Object.fromEntries(Object.entries(first).map(([key, value]) => {
      const sheet = join(run, key + '.png'); writeFileSync(sheet, Buffer.from(value.sheet.split(',')[1], 'base64'));
      const features = value.features;
      return [key, { sheet: relative(ROOT, sheet), all: score(features), fallback: score(features.filter(f => f.origin === 'fallback')), synthetic: score(features.filter(f => f.origin === 'synthetic')),
        groups: Object.fromEntries([...new Set(features.map(f => f.group))].sort().map(group => [group, score(features.filter(f => f.group === group))])), features }];
    }));
    const summary: Record<string, unknown> = { schemaVersion: 1, label, selectedKinds: kinds, createdAt: new Date().toISOString(), baseURL: base.origin, chromium: browser.version(), node: process.version,
      gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(), rendererSources: { hash: before.hash, files: before.files, sourceRef: before.sourceRef }, fixtureHash,
      fixturePath: relative(ROOT, join(run, 'fixtures.json')), protocol: PROTOCOL, repeatPixelHashesMatch: true, browserErrors: errors, views };
    const compare = option('--compare');
    if (compare) {
      const old = readJSON(resolve(ROOT, compare)); assert.equal(old.fixtureHash, fixtureHash, 'Comparison requires the frozen baseline fixtures'); assert.deepEqual(old.protocol, PROTOCOL);
      summary.comparison = Object.fromEntries(Object.entries(views).map(([key, value]) => [key, {
        minDistanceDelta: value.all.combined!.min - old.views[key].all.combined.min,
        meanDistanceDelta: value.all.combined!.mean - old.views[key].all.combined.mean,
        lookalikePairsDelta: value.all.lookalikePairs - old.views[key].all.lookalikePairs,
        clusteredSamplesDelta: value.all.clusteredSamples - old.views[key].all.clusteredSamples,
        shapeLookalikePairsDelta: value.all.shapeLookalikes.pairs - old.views[key].all.shapeLookalikes.pairs,
        paletteBetweenImageBitsDelta: value.all.paletteEntropy.betweenImageBits - old.views[key].all.paletteEntropy.betweenImageBits,
      }]));
    }
    writeFileSync(join(run, 'fixtures.json'), JSON.stringify({ schemaVersion: 1, fixtureHash, fixtures: input }, null, 2) + '\n');
    writeFileSync(join(run, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    // Partial runs have their own summary and never replace the full baseline/latest report.
    if (kind === 'all') writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify({ label, fixtureHash, summary: relative(ROOT, join(run, 'summary.json')), views: Object.fromEntries(Object.entries(views).map(([key, value]) => [key, {
      sheet: value.sheet, ...value.all, nearestPairs: undefined, clusters: value.all.clusters.length,
      shapeLookalikes: { ...value.all.shapeLookalikes, clusters: value.all.shapeLookalikes.clusters.length },
    }])) }, null, 2));
  } finally { await browser.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
