/** DEV/private real WebKit rematch diagnosis. Does not change simulation, endings or product files. */
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { webkit, devices, type Page } from 'playwright';
import type { LobbyState, MatchState, ServerMsg } from '../shared/types';
import { completeLandingOnboarding } from './onboarding';
import { installRematchProbe } from './rematch-probe';

const sleep = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
export interface SoakOptions { cycles: number; jobs: number; playSeconds: number; endTimeout: number; device: string; view: string; path: string; output?: string }
export function soakBaseURL(value = process.env.REMATCH_URL || 'http://localhost:5175') {
  const url = new URL(value);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['5175', '5191'].includes(url.port) || url.protocol !== 'http:') {
    throw new Error('rematch-soak is restricted to DEV :5175 or the explicitly authorized private :5191');
  }
  return url.origin;
}
export function parseSoakOptions(args: string[]): SoakOptions {
  const options: SoakOptions = { cycles: 12, jobs: 2, playSeconds: 15, endTimeout: 420, device: 'all', view: 'all', path: 'all' };
  for (let i = 0; i < args.length; i++) {
    const key = args[i], value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    const numeric = { '--cycles': 'cycles', '--jobs': 'jobs', '--play-seconds': 'playSeconds', '--end-timeout': 'endTimeout' } as const;
    if (key in numeric) (options as any)[numeric[key as keyof typeof numeric]] = Number(value);
    else if (key === '--device' || key === '--view' || key === '--path' || key === '--output') (options as any)[key.slice(2)] = value;
    else throw new Error(`Unknown option ${key}`);
  }
  for (const key of ['cycles', 'jobs', 'playSeconds', 'endTimeout'] as const) {
    if (!Number.isFinite(options[key]) || options[key] <= 0 || (['cycles', 'jobs'].includes(key) && !Number.isInteger(options[key]))) throw new Error(`Invalid ${key}`);
  }
  if (!['all', 'desktop', 'iphone'].includes(options.device) || !['all', '2d', '25d'].includes(options.view)
    || !['all', 'rematch', 'new-room'].includes(options.path)) throw new Error('Invalid device, view or path filter');
  return options;
}

/** Insert read-only source hooks into the Vite response, without editing any product file. */
export function instrumentModule(path: string, source: string): { body: string; hooks: string[] } {
  const hooks: string[] = [], edits: { at: number; text: string }[] = [];
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const visit = (node: ts.Node) => {
    if (path.endsWith('/app/game.ts') && ts.isVariableDeclaration(node) && node.name.getText(sf) === 'frame'
      && node.initializer && ts.isArrowFunction(node.initializer) && ts.isBlock(node.initializer.body)) {
      edits.push({ at: node.initializer.body.getStart(sf) + 1, text: '\nglobalThis.__rematchProbe?.game({zoom,zoomTarget,camX,camY,camInit,visTime,offset,offsetAt,drift,lag,delay,nowMs,latestT:latest?.t,snaps:snaps.length});\n' }); hooks.push('game-frame');
    }
    if (path.endsWith('/player/index.ts') && ts.isFunctionDeclaration(node) && node.name?.text === 'drawPlayer' && node.body) {
      edits.push({ at: node.body.getStart(sf) + 1, text: '\nconst __qaEndHero=globalThis.__rematchProbe?.beginHero(ctx,p,isYou);try {\n' });
      edits.push({ at: node.body.end - 1, text: '\n} finally { __qaEndHero?.(); }\n' }); hooks.push('hero-draw');
    }
    if (path.endsWith('/stage25d/index.ts') && ts.isExpressionStatement(node) && node.expression.getText(sf) === 'renderer.render(look.scene, rig.camera)') {
      edits.push({ at: node.end, text: '\nglobalThis.__rematchProbe?.stage(renderer,look,rig,state,extras);\n' }); hooks.push('stage-project');
    }
    if (path.endsWith('/player/index.ts') && ts.isFunctionDeclaration(node) && node.name?.text === 'drawPlayerLocal' && node.body) {
      const squash = (child: ts.Node) => {
        if (ts.isVariableStatement(child) && child.declarationList.declarations.some(d => d.name.getText(sf) === 'm' && d.initializer?.getText(sf) === 'memFor(p, t)')) {
          edits.push({ at: child.end, text: '\nglobalThis.__rematchProbe?.memory(p,m,t);\n' }); hooks.push('hero-memory-identity');
        }
        if (ts.isVariableStatement(child) && child.declarationList.declarations.some(d => d.name.getText(sf) === 'since')) {
          edits.push({ at: child.getStart(sf), text: '\nglobalThis.__rematchProbe?.squash(p.id,{t,sx,sy,hk,dk,rk,kk,flip,pose:fr.pose,previousT:m.t,hurtT:m.hurtT,dashT:m.dashT,reviveT:m.reviveT,kbT:m.kbT});\n' }); hooks.push('hero-squash');
        }
        ts.forEachChild(child, squash);
      }; squash(node.body);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (path.endsWith('/arena/fx.ts')) {
    edits.push({ at: source.length, text: '\nglobalThis.__rematchProbe.fx=()=>({now:fx.now,victoryAt:fx.victoryAt,defeatAt:fx.defeatAt,bossSeenAt:fx.bossSeenAt,bossHp:fx.boss?.hp,phaseGlitch:fx.phaseGlitch,limbBreak:fx.limbBreak,flash:fx.flash,danger:fx.danger,project:!!fx.project,pvp:fx.pvp});\n' }); hooks.push('fx-getter');
  }
  let body = source;
  for (const edit of edits.sort((a, b) => b.at - a.at)) body = body.slice(0, edit.at) + edit.text + body.slice(edit.at);
  return { body, hooks };
}

/** Decode screenshot outside the tested page: no diagnostic canvas/WebGL/audio resources contaminate counts. */
export function luminance(png: Buffer) {
  const result = spawnSync('python3', ['-c', `import sys,json,io
from PIL import Image,ImageStat
im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGB')
im.thumbnail((320,320))
ys=[0.2126*r+0.7152*g+0.0722*b for r,g,b in im.getdata()]
mean=sum(ys)/len(ys); dark=sum(y<5 for y in ys)/len(ys); white=sum(y>250 for y in ys)/len(ys)
print(json.dumps(dict(mean=mean,blackFraction=dark,whiteFraction=white,allBlack=dark>0.995,allWhite=white>0.995,nearBlack=dark>0.90 and mean<8,nearWhite=white>0.60 and mean>220)))`], { input: png, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Screenshot decoder failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

export async function rematchSoak(options: SoakOptions) {
  const base = soakBaseURL();
  const output = resolve(options.output || `docs/shots/${new Date().toISOString().replace(/[:.]/g, '-')}-rematch-soak`);
  mkdirSync(output, { recursive: true });
  const cases = ['rematch', 'new-room'].flatMap(path => ['desktop', 'iphone'].flatMap(device => ['2d', '25d'].map(view => ({ path, device, view }))))
    .filter(c => (options.path === 'all' || c.path === options.path) && (options.device === 'all' || c.device === options.device) && (options.view === 'all' || c.view === options.view));
  const log = (message: string) => { const line = `${new Date().toISOString()} ${message}`; console.log(line); appendFileSync(join(output, 'run.log'), `${line}\n`); };
  const results: any[] = [];
  writeFileSync(join(output, 'manifest.json'), JSON.stringify({ pid: process.pid, base, options, cases, sourceHooks: 'Read-only Vite response instrumentation; no simulation/ending overrides; non-game HMR socket held inert; 2D/25D query inherited at new document startup.', startedAt: new Date().toISOString() }, null, 2));
  log(`START ${cases.length} cases × ${options.cycles} cycles; artifacts=${output}`);
  let nextCase = 0, stopping = false;
  const stop = () => { stopping = true; log('STOP requested; closing own contexts at the next checkpoint'); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  async function runCase(test: typeof cases[number]) {
    const label = `${test.device}-${test.view}-${test.path}`, dir = join(output, label); mkdirSync(dir, { recursive: true });
    const browser = await webkit.launch({ headless: true });
    const context = await browser.newContext(test.device === 'iphone' ? devices['iPhone 15'] : { viewport: { width: 1440, height: 900 } });
    context.setDefaultTimeout(20_000);
    // tsx's function-name helper must be lexical to the serialized init function.
    await context.addInitScript(`(()=>{const __name=(fn,name)=>Object.defineProperty(fn,'name',{value:name,configurable:true});(${installRematchProbe.toString()})();})();`);
    await context.addInitScript(({ view }) => {
      // New-room UI drops query parameters; keep the explicitly requested renderer on each new document.
      if ((location.pathname.startsWith('/r/') || location.pathname === '/') && !new URLSearchParams(location.search).has('view')) {
        const url = new URL(location.href); url.searchParams.set('view', view); history.replaceState(null, '', url);
      }
      Object.defineProperty(window, 'DeviceMotionEvent', { configurable: true, value: undefined });
      Object.defineProperty(window, 'DeviceOrientationEvent', { configurable: true, value: undefined });
    }, { view: test.view });
    const sources = new Map<string, { body: string; contentType: string; sha: string; hooks: string[] }>();
    await context.route(url => /^\/client\//.test(url.pathname), async route => {
      const originalURL = new URL(route.request().url()), key = originalURL.pathname;
      let entry = sources.get(key);
      if (!entry) {
        const requestURL = new URL(originalURL); requestURL.searchParams.set('qa-rematch-revision', String(Date.now()));
        const response = await route.fetch({ url: requestURL.href });
        const source = await response.text(), transformed = instrumentModule(key, source);
        entry = { body: transformed.body, contentType: response.headers()['content-type'] ?? 'text/javascript', sha: createHash('sha256').update(source).digest('hex'), hooks: transformed.hooks };
        sources.set(key, entry);
        if (transformed.hooks.length) writeFileSync(join(dir, key.replaceAll('/', '_') + '.original.js'), source);
      }
      await route.fulfill({ status: 200, body: entry.body, contentType: entry.contentType });
    });
    // Prevent concurrent product edits from reloading a tested document; real /ws remains untouched.
    await context.routeWebSocket(url => url.pathname !== '/ws', socket => socket.send(JSON.stringify({ type: 'connected' })));
    const page = await context.newPage();
    const errors: any[] = [], cycles: any[] = [];
    let lobby: LobbyState | undefined, snapshot: MatchState | undefined, id = '', ending = false, round = 0;
    let inMatch = false, snapshotAt = 0, serverInterrupted = false;
    const stateNow = (): MatchState | undefined => snapshot;
    const recordError = (value: any) => { errors.push(value); appendFileSync(join(dir, 'errors.jsonl'), `${JSON.stringify(value)}\n`); };
    page.on('pageerror', error => recordError({ cycle: round, type: 'pageerror', message: error.message, stack: error.stack }));
    page.on('console', async msg => {
      if (msg.type() !== 'error' && !/context.*lost|too many.*context|3D view unavailable/i.test(msg.text())) return;
      const value = { cycle: round, type: `console:${msg.type()}`, message: msg.text(), details: [] as any[] }; recordError(value);
      value.details = await Promise.all(msg.args().map(arg => arg.evaluate(v => v instanceof Error ? { message: v.message, stack: v.stack } : null).catch(() => null)));
      appendFileSync(join(dir, 'errors.jsonl'), `${JSON.stringify({ ...value, detailUpdate: true })}\n`);
    });
    page.on('response', response => { if (response.status() >= 400) recordError({ cycle: round, type: 'http', status: response.status(), url: response.url() }); });
    page.on('websocket', socket => {
      if (new URL(socket.url()).pathname !== '/ws') return;
      socket.on('close', () => { if (inMatch && !ending) { errors.push({ cycle: round, type: 'ws-close', message: 'Game socket closed during match' }); log(`${label} cycle ${round} game socket closed`); } });
      socket.on('framereceived', frame => {
        const msg = JSON.parse(frame.payload.toString()) as ServerMsg;
        if (msg.t === 'welcome') { id = msg.you; lobby = msg.lobby; }
        if (msg.t === 'lobby') lobby = msg.lobby;
        if (msg.t === 'snapshot') { snapshot = msg.state; snapshotAt = Date.now(); }
        if (msg.t === 'autopsy') ending = true;
        if (msg.t === 'error') { errors.push({ cycle: round, type: 'protocol', message: msg.message }); if (/server restarted/i.test(msg.message)) serverInterrupted = true; }
      });
    });
    const wait = async (condition: () => boolean, message: string, ms = 45_000) => {
      const end = Date.now() + ms; while (!condition() && Date.now() < end && !stopping && !serverInterrupted) await sleep(100);
      if (!condition()) throw new Error(message);
    };
    const checkpoint = async (name: string, save = true) => {
      const metrics = await page.evaluate(() => (window as any).__rematchProbe.sample());
      if (metrics.first3sHeroFrames?.length && name !== 'lobby') {
        writeFileSync(join(dir, `${String(round).padStart(2, '0')}-first3s-hero.json`), JSON.stringify({
          cycle: round, epoch: metrics.epoch, captureComplete: metrics.sinceEpochMs >= 3000,
          definition: 'Every owning-hero draw in the first 3000ms of the new game render epoch (includes countdown/intro). Bounds include actual sprite/effect draw calls; no renderer state reset.',
          frames: metrics.first3sHeroFrames,
        }, null, 2));
      }
      metrics.first3sHeroCount = metrics.first3sHeroFrames?.length ?? 0; delete metrics.first3sHeroFrames;
      const png = await page.screenshot({ timeout: 15_000 });
      const luma = luminance(png);
      const shot = `${String(round).padStart(2, '0')}-${name}.png`;
      const abnormalHero = metrics.heroFrames.some((h: any) => h.squash && (Math.abs(h.squash.sx) > 3 || Math.abs(h.squash.sy) > 3));
      const fx = metrics.fx;
      const phantomEnd = snapshot?.status === 'fighting' && fx && ((fx.victoryAt > 0 && fx.now - fx.victoryAt > 1.75)
        || (fx.defeatAt > 0 && fx.now - fx.defeatAt > 0.6));
      if (save || luma.allBlack || luma.allWhite || abnormalHero || phantomEnd) writeFileSync(join(dir, shot), png);
      const gameCanvas = page.locator('.stage-3d, [data-testid="game-canvas"]').first();
      let gameLuma;
      if (await gameCanvas.count() && snapshot && !ending) {
        const bounds = await gameCanvas.boundingBox();
        if (bounds && bounds.width > 0 && bounds.height > 0) {
          const viewport = page.viewportSize()!, x = Math.max(0, bounds.x), y = Math.max(0, bounds.y);
          const width = Math.min(viewport.width - x, bounds.x + bounds.width - x), height = Math.min(viewport.height - y, bounds.y + bounds.height - y);
          if (width > 0 && height > 0) {
            const clip = await page.screenshot({ clip: { x, y, width, height }, timeout: 15_000 }); gameLuma = luminance(clip);
            if (gameLuma.allBlack || gameLuma.allWhite) writeFileSync(join(dir, `${String(round).padStart(2, '0')}-${name}-game-flag.png`), clip);
          }
        }
      }
      const value = { name, at: new Date().toISOString(), metrics, luminance: luma, gameLuminance: gameLuma,
        snapshot: snapshot && { t: snapshot.t, status: snapshot.status, paused: snapshot.paused, bossHp: snapshot.boss?.hp, hero: snapshot.players.find(p => p.id === id) && { alive: snapshot.players.find(p => p.id === id)!.alive, hp: snapshot.players.find(p => p.id === id)!.hp } } };
      writeFileSync(join(dir, `${String(round).padStart(2, '0')}-${name}.json`), JSON.stringify(value, null, 2)); return value;
    };
    const joinIfNeeded = async () => {
      await completeLandingOnboarding(page, { controls: 'touch', touch: test.device === 'iphone' });
      const name = page.getByTestId('player-name');
      if (await name.isVisible()) { await name.fill('QA_rematch'); await page.getByTestId('join-room').click(); }
    };
    const createRoom = async () => {
      await page.getByTestId('create-room').click(); await page.waitForURL(/\/r\//); await joinIfNeeded();
    };
    const prepareLobby = async () => {
      await page.locator('.screen.lobby').waitFor();
      await wait(() => !!lobby?.players.find(p => p.id === id), 'Owner missing from lobby');
      if (!lobby?.players.find(p => p.id === id && p.status === 'ready')) {
        await page.getByTestId('player-repo-input').fill('lodash/lodash'); await page.getByTestId('player-repo-submit').click();
      }
      await page.locator('[data-testid="player-ready"][data-status="ready"]').waitFor({ timeout: 60_000 });
      if (lobby?.boss.status !== 'ready') {
        await page.getByTestId('boss-repo-input').fill('expressjs/express'); await page.getByTestId('boss-repo-submit').click();
      }
      await page.locator('[data-testid="boss-ready"][data-status="ready"]').waitFor({ timeout: 60_000 });
      const touch = page.getByTestId('controls-touch'); if (await touch.isVisible()) await touch.click();
      while ((lobby?.players.filter(p => p.bot).length ?? 0) < 3) {
        const before = lobby?.players.filter(p => p.bot).length ?? 0; await page.getByTestId('bots-plus').click();
        await wait(() => (lobby?.players.filter(p => p.bot).length ?? 0) > before, 'Bot UI did not add teammate');
      }
      if (lobby?.players.filter(p => p.bot).length !== 3) throw new Error('Expected owner + exactly three bots');
    };
    let failure: string | undefined;
    try {
      await page.goto(`${base}/?view=${test.view}`, { waitUntil: 'domcontentloaded' });
      await completeLandingOnboarding(page, { controls: 'touch', touch: test.device === 'iphone' }); await createRoom();
      for (round = 1; round <= options.cycles; round++) {
        await prepareLobby(); ending = false; snapshot = undefined;
        const before = await checkpoint('lobby');
        await page.getByTestId('start-match').click(); inMatch = true;
        await page.getByTestId('game-canvas').waitFor();
        await wait(() => snapshot?.status === 'fighting', 'No authoritative fighting snapshot');
        if (test.view === '25d') await page.locator('.stage-3d').waitFor({ timeout: 30_000 });
        const begun = Date.now(); const samples: any[] = [];
        log(`${label} cycle ${round}/${options.cycles} START room=${new URL(page.url()).pathname.split('/')[2]}`);
        const stage = page.getByTestId('game-canvas'); const box = await stage.boundingBox();
        await page.keyboard.down('KeyJ');
        const directions = ['KeyD', 'KeyS', 'KeyA', 'KeyW']; let held = '', nextSample = 0;
        while (Date.now() - begun < options.playSeconds * 1000 && !ending) {
          if (stopping || serverInterrupted) throw new Error('Soak interrupted by stop request or shared server restart');
          const elapsed = (Date.now() - begun) / 1000;
          const direction = directions[Math.floor(elapsed / 2) % 4];
          if (direction !== held) { if (held) await page.keyboard.up(held); held = direction; await page.keyboard.down(held); }
          if (test.device === 'iphone' && box) await page.touchscreen.tap(box.x + box.width * 0.4, box.y + box.height * 0.6);
          if (elapsed >= nextSample) { samples.push(await checkpoint(`fight-${Math.floor(elapsed)}s`, nextSample === 0 || nextSample >= 10)); nextSample += 5; }
          await sleep(400);
        }
        await page.keyboard.up('KeyJ'); if (held) await page.keyboard.up(held);
        const played = (Date.now() - begun) / 1000;
        // Natural ending only: bots continue fighting. No artificial defeat, speedup or server control.
        let nextProgress = Date.now() + 30_000, nextWaitSample = Date.now() + 10_000;
        const endDeadline = Date.now() + options.endTimeout * 1000;
        while (!ending && Date.now() < endDeadline) {
          await sleep(1000);
          if (stopping || serverInterrupted || Date.now() - snapshotAt > 15_000) throw new Error('Soak interrupted: stop/server restart or no authoritative snapshot for 15s');
          if (!ending && Date.now() >= nextWaitSample) {
            samples.push(await checkpoint(`wait-${Math.floor((Date.now() - begun) / 1000)}s`, false)); nextWaitSample = Date.now() + 10_000;
          }
          if (Date.now() >= nextProgress) { log(`${label} cycle ${round} waiting natural autopsy t=${stateNow()?.t.toFixed(1)} bossHP=${stateNow()?.boss?.hp}`); nextProgress += 30_000; }
        }
        if (!ending) throw new Error('Natural ending timeout; no result fabricated');
        const continueBSOD = page.getByTestId('bsod-continue');
        try {
          await continueBSOD.waitFor({ timeout: 4000 }); await sleep(750);
          await checkpoint('natural-outro');
          if (test.device === 'iphone') await continueBSOD.tap(); else await page.keyboard.press('Enter');
        } catch (error) {
          if (await continueBSOD.isVisible()) throw error;
          // Older revision / defeat auto-advances, with no victory continuation prompt.
        }
        await page.getByTestId('autopsy').waitFor({ timeout: 20_000 }); inMatch = false; await sleep(1600);
        const after = await checkpoint('autopsy');
        const row = { cycle: round, playedSeconds: played, naturalDuration: stateNow()?.t, before, samples, after };
        cycles.push(row); writeFileSync(join(dir, 'cycles.json'), JSON.stringify(cycles, null, 2));
        log(`${label} cycle ${round} AUTOPSY t=${stateNow()?.t.toFixed(1)} canvas=${after.metrics.canvases.length} raf=${after.metrics.raf.activeChains.length} intervals=${after.metrics.timers.active.filter((x: any) => x.kind === 'interval').length} GLcreated=${after.metrics.contexts.filter((x: any) => /webgl/.test(x.kind)).length}`);
        if (round === options.cycles) break;
        if (test.path === 'rematch') {
          await page.getByTestId('rematch').click(); await page.locator('.screen.lobby').waitFor(); await sleep(500);
        } else {
          lobby = undefined;
          // Cover both direct [new room] and [leave] → landing → create in this path, alternating cycles.
          if (round % 2) { await page.getByTestId('autopsy-new-room').click(); await page.waitForURL(url => url.pathname !== new URL(after.metrics.url, base).pathname); await joinIfNeeded(); }
          else { await page.getByTestId('autopsy-leave').click(); await page.waitForURL(url => url.pathname === '/'); await createRoom(); }
        }
      }
    } catch (error) {
      failure = error instanceof Error ? error.stack ?? error.message : String(error); log(`${label} FAIL cycle=${round}: ${failure}`);
      await checkpoint('failure').catch(() => {});
    } finally {
      const sourceManifest = [...sources].map(([path, { sha, hooks }]) => ({ path, sha, hooks }));
      const result = { ...test, label, completedCycles: cycles.length, requestedCycles: options.cycles, failure, errors, sourceManifest };
      writeFileSync(join(dir, 'summary.json'), JSON.stringify(result, null, 2)); results.push(result);
      await context.close().catch(error => log(`${label} context cleanup: ${String(error)}`));
      await browser.close().catch(error => log(`${label} browser cleanup: ${String(error)}`));
      writeFileSync(join(output, 'summary.json'), JSON.stringify({ base, options, results }, null, 2));
    }
  }
  await Promise.all(Array.from({ length: Math.min(options.jobs, cases.length) }, async () => {
    while (nextCase < cases.length && !stopping) { const test = cases[nextCase++]; await runCase(test); }
  }));
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  log(`DONE ${results.filter(r => r.completedCycles === options.cycles).length}/${cases.length} cases completed. Inspect counter growth and flagged frames; completion alone is not a no-leak verdict.`);
  return results.every(r => r.completedCycles === options.cycles) ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) console.log('npx tsx tools/rematch-soak.ts [--cycles 12] [--jobs 2] [--play-seconds 15] [--device all|desktop|iphone] [--view all|2d|25d] [--path all|rematch|new-room] [--end-timeout 420] [--output DIR]');
  else { try { process.exitCode = await rematchSoak(parseSoakOptions(process.argv.slice(2))); } catch (error) { console.error(error); process.exitCode = 1; } }
}
