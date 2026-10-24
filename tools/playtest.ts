import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type CDPSession, type Locator, type Page } from 'playwright';
import type { Autopsy, ClientMsg, GameMode, InputFrame, LobbyState, MatchState, ServerMsg } from '../shared/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
const UI_TIMEOUT = 15_000;
const ANALYSIS_TIMEOUT = 30_000;

export interface Options { players: number; boss: string; seconds: number; headed: boolean; mode: GameMode }
export function playtestBaseURL(override = process.env.PLAYTEST_URL): string {
  const url = new URL(override || 'http://localhost:5175');
  if (url.port === '5173' || url.hostname === 'gitzilla.wilflin.me') {
    throw new Error('Playtests cannot target the stable live server; use http://localhost:5175');
  }
  return url.href.replace(/\/$/, '');
}
export function parseOptions(args: string[]): Options {
  const opts: Options = { players: 4, boss: 'pallets/flask', seconds: 60, headed: false, mode: 'battle' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--headed') opts.headed = true;
    else if (arg === '--players' || arg === '--seconds' || arg === '--boss' || arg === '--mode') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--boss') opts.boss = value;
      else if (arg === '--mode') {
        if (value !== 'battle' && value !== 'edu') throw new Error('--mode must be battle or edu');
        opts.mode = value;
      }
      else opts[arg === '--players' ? 'players' : 'seconds'] = Number(value);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  const minPlayers = opts.mode === 'edu' ? 2 : 1;
  const maxPlayers = opts.mode === 'edu' ? 30 : 8;
  if (!Number.isInteger(opts.players) || opts.players < minPlayers || opts.players > maxPlayers) throw new Error(`--players must be an integer from ${minPlayers} to ${maxPlayers} for ${opts.mode}`);
  if (!Number.isFinite(opts.seconds) || opts.seconds <= 0) throw new Error('--seconds must be a positive number');
  return opts;
}

class IncompleteUI extends Error {}
interface Telemetry {
  id?: string;
  lobby?: LobbyState;
  snapshot?: MatchState;
  snapshots: number;
  fightingSnapshots: number;
  inputs: number;
  moving: number;
  firing: number;
  dashes: number;
  skills: number;
  ack: number;
  autopsy: boolean;
  result?: Autopsy;
  sources: Record<string, number>;
  lessons: number;
  quizAnswers: number;
}
interface Client {
  name: string;
  phone: boolean;
  spectator: boolean;
  context: BrowserContext;
  page: Page;
  telemetry: Telemetry;
  touchDriver?: { session: CDPSession; x: number; y: number; originX: number; originY: number; down?: boolean; nextAttack?: number };
}

export async function playtest(options: Options): Promise<number> {
  const timestamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
  const output = join(ROOT, 'docs', 'shots', timestamp);
  mkdirSync(output, { recursive: true });
  const logFile = join(output, 'playtest.log');
  const screenshots: string[] = [];
  const missing: string[] = [];
  const notes: string[] = [];
  const errors = { page: 0, console: 0, websocket: 0, failedRequests: 0 };
  const clients: Client[] = [];
  let browser: Browser | undefined;
  let shuttingDown = false;
  let interrupted = false;
  let outcome = 'incomplete';
  let failure: string | undefined;
  let room: string | undefined;
  let phase = 'startup';
  let startedAt: number | undefined;
  let elapsed = 0;
  let exitCode = 2;
  const baseURL = playtestBaseURL();
  const log = (kind: string, message: string, print = false) => {
    const line = `${new Date().toISOString()} [${kind}] ${message}`;
    appendFileSync(logFile, `${line}\n`);
    if (print) console.log(line);
  };
  const note = (message: string) => { notes.push(message); log('note', message, true); };
  const stopOnSignal = () => {
    interrupted = true;
    void browser?.close().catch(() => {});
  };
  process.once('SIGINT', stopOnSignal);
  process.once('SIGTERM', stopOnSignal);

  const probe = async (): Promise<string[] | null> => {
    try {
      const response = await fetch(`${baseURL}/api/fallbacks`, { signal: AbortSignal.timeout(1500) });
      if (!response.ok) return null;
      const body: unknown = await response.json();
      return Array.isArray(body) && body.length > 0 && body.every(v => typeof v === 'string') ? body : null;
    } catch { return null; }
  };
  const screenshot = async (client: Client, label: string) => {
    const file = `${label}-${client.phone ? 'phone' : 'desktop'}.png`;
    try {
      await client.page.screenshot({ path: join(output, file), timeout: 8000 });
      screenshots.push(file);
      log('shot', file);
    } catch (error) {
      missing.push(`Screenshot unavailable: ${file}`);
      note(`Could not capture ${file}: ${String(error)}`);
    }
  };
  const pair = () => [clients[0], clients.find(c => c.phone)].filter((c): c is Client => !!c);
  const capturePair = async (label: string) => {
    await Promise.all(pair().map(client => screenshot(client, label)));
  };
  const required = async (client: Client, id: string, timeout = UI_TIMEOUT): Promise<Locator> => {
    const locator = client.page.getByTestId(id);
    try { await locator.waitFor({ state: 'visible', timeout }); }
    catch {
      const message = `${client.name}: missing visible [data-testid="${id}"] during ${phase} (${client.page.url()})`;
      missing.push(message);
      throw new IncompleteUI(message);
    }
    return locator;
  };
  const click = async (client: Client, id: string) => {
    const locator = await required(client, id);
    try { await locator.click({ timeout: UI_TIMEOUT }); }
    catch { throw new IncompleteUI(`${client.name}: ${id} is visible but not enabled/clickable during ${phase}`); }
  };
  const optionalJoin = async (client: Client) => {
    // Name/join controls are optional for UIs which auto-connect on /r/<ROOM>.
    const deadline = Date.now() + UI_TIMEOUT;
    while (Date.now() < deadline && !interrupted) {
      if (await client.page.getByTestId('join-room').isVisible()
        || await client.page.getByTestId('player-repo-input').isVisible()) break;
      await sleep(100);
    }
    const name = client.page.getByTestId('player-name');
    if (await name.isVisible()) await name.fill(client.name);
    const joinButton = client.page.getByTestId('join-room');
    if (await joinButton.isVisible()) await joinButton.click();
  };
  const waitForReady = async (client: Client, id: 'player-ready' | 'boss-ready') => {
    const status = await required(client, id);
    const deadline = Date.now() + ANALYSIS_TIMEOUT;
    while (Date.now() < deadline && !interrupted) {
      const state = await status.getAttribute('data-status');
      if (state === 'ready') return;
      if (state === 'error') throw new IncompleteUI(`${client.name}: ${id} reports analysis error: ${await status.textContent()}`);
      await sleep(200);
    }
    throw new IncompleteUI(`${client.name}: ${id} never reached data-status="ready" within ${ANALYSIS_TIMEOUT / 1000}s`);
  };
  const attach = (client: Client) => {
    const { page, telemetry: t, name } = client;
    page.on('console', message => {
      if (message.type() === 'error') errors.console++;
      log(`console:${message.type()}`, `${name}: ${message.text()}`);
    });
    page.on('pageerror', error => { errors.page++; log('pageerror', `${name}: ${error.stack || error.message}`, true); });
    page.on('requestfailed', request => {
      if (shuttingDown) return;
      errors.failedRequests++;
      log('requestfailed', `${name}: ${request.method()} ${request.url()} ${request.failure()?.errorText}`);
    });
    page.on('response', response => {
      if (response.status() >= 400) log('http-error', `${name}: ${response.status()} ${response.url()}`);
    });
    page.on('websocket', socket => {
      if (new URL(socket.url()).pathname !== '/ws') return; // Ignore Vite HMR sockets.
      log('ws:open', `${name}: ${socket.url()}`);
      socket.on('socketerror', error => {
        if (shuttingDown) return;
        errors.websocket++;
        log('ws:error', `${name}: ${error}`, true);
      });
      socket.on('close', () => { if (!shuttingDown) log('ws:close', name); });
      socket.on('framesent', frame => {
        let message: ClientMsg;
        try { message = JSON.parse(frame.payload.toString()) as ClientMsg; } catch { return; }
        if (message.t !== 'input') {
          // Never dump hello resume tokens.
          log('ws:sent', `${name}: ${message.t}${'repo' in message ? ` ${message.repo}` : ''}`);
          return;
        }
        const input: InputFrame = message.frame;
        t.inputs++;
        if (Math.hypot(...input.move) > 0) t.moving++;
        if (input.fire) t.firing++;
        if (input.dash) t.dashes++;
        if (input.skill) t.skills++;
        t.sources[input.source] = (t.sources[input.source] || 0) + 1;
      });
      socket.on('framereceived', frame => {
        let message: ServerMsg;
        try { message = JSON.parse(frame.payload.toString()) as ServerMsg; } catch { return; }
        if (message.t === 'welcome') { t.id = message.you; t.lobby = message.lobby; }
        else if (message.t === 'lobby') t.lobby = message.lobby;
        else if (message.t === 'snapshot') {
          const previousStatus = t.snapshot?.status;
          t.snapshot = message.state;
          t.snapshots++;
          t.lessons += message.state.events?.filter(event => event.type === 'lesson').length ?? 0;
          t.quizAnswers += message.state.events?.filter(event => event.type === 'perk' && event.correct !== undefined).length ?? 0;
          if (message.state.status === 'fighting') t.fightingSnapshots++;
          t.ack = Math.max(t.ack, message.ack);
          if (previousStatus !== message.state.status) log('ws:status', `${name}: ${message.state.status}`);
        } else if (message.t === 'autopsy') {
          t.autopsy = true; t.result = message.result;
          log('ws:autopsy', `${name}: ${message.result.mode === 'edu' ? `class ranking (${message.result.ranking?.length ?? 0} students)` : message.result.victory ? 'victory' : 'defeat'}`);
        }
        else if (message.t === 'error') {
          errors.websocket++;
          log('ws:protocol-error', `${name}: ${message.message}`, true);
        }
      });
    });
  };

  try {
    log('start', JSON.stringify({ ...options, baseURL, output }), true);
    const repos = await probe();
    if (!repos) throw new Error(`No Repo Kaiju fallback endpoint at ${baseURL}; start the shared DEV server on 5175. The harness never starts or stops servers.`);
    log('server', `Reusing ${baseURL}`, true);
    note(`Fallback repos: ${repos.join(', ')}`);
    if (options.mode === 'battle' && !repos.includes(options.boss)) note(`Requested boss ${options.boss} isn't listed in /api/fallbacks; real analysis may be needed.`);
    const bundledChromium = chromium.executablePath();
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      || (existsSync(bundledChromium) ? bundledChromium : existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
    browser = await chromium.launch({ headless: !options.headed, executablePath,
      args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
    log('browser', executablePath || 'Playwright default Chromium');
    const totalContexts = Math.max(2, options.players);
    for (let i = 0; i < totalContexts; i++) {
      const phone = i === totalContexts - 1;
      const spectator = i >= options.players;
      const context = await browser.newContext({
        viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 720 },
        deviceScaleFactor: phone ? 3 : 1, isMobile: phone, hasTouch: phone, ignoreHTTPSErrors: true,
      });
      context.setDefaultTimeout(UI_TIMEOUT);
      if (phone) await context.addInitScript(() => {
        // No synthetic sensors in this generic harness: exercise the real touch fallback.
        // tools/motion-v3.ts separately proves sensor input against authoritative snapshots.
        Object.defineProperty(window, 'DeviceMotionEvent', { configurable: true, value: undefined });
        Object.defineProperty(window, 'DeviceOrientationEvent', { configurable: true, value: undefined });
      });
      const client: Client = { name: spectator ? 'Phone spectator' : `Playtester ${i + 1}`, phone, spectator, context,
        page: await context.newPage(), telemetry: { snapshots: 0, fightingSnapshots: 0, inputs: 0, moving: 0, firing: 0, dashes: 0, skills: 0, ack: -1, autopsy: false, sources: {}, lessons: 0, quizAnswers: 0 } };
      // DEV's broad /data/ watch ignore can leave old input transforms cached.
      const inputRevision = Date.now();
      await client.page.route('**/client/input/**', route => {
        const url = new URL(route.request().url()); url.searchParams.set('input-revision', String(inputRevision));
        return route.continue({ url: url.toString() });
      });
      clients.push(client);
      attach(client);
    }
    const owner = clients[0];
    phase = 'landing';
    await Promise.all(clients.map(client => client.page.goto(baseURL, { waitUntil: 'domcontentloaded' })));
    try { await required(owner, 'create-room'); }
    finally { await capturePair('landing'); }
    const ownerName = owner.page.getByTestId('player-name');
    if (await ownerName.isVisible()) await ownerName.fill(owner.name);
    await click(owner, 'create-room');
    try { await owner.page.waitForURL(/\/r\/[^/?#]+/, { timeout: UI_TIMEOUT }); }
    catch { throw new IncompleteUI('create-room did not navigate to /r/<ROOM>'); }
    room = new URL(owner.page.url()).pathname.split('/')[2];
    log('room', room, true);
    phase = 'joining';
    await optionalJoin(owner);
    if (options.mode === 'edu') {
      phase = 'classroom mode selection';
      await click(owner, 'mode-edu');
      const deadline = Date.now() + UI_TIMEOUT;
      while (owner.telemetry.lobby?.mode !== 'edu' && Date.now() < deadline) await sleep(50);
      if (owner.telemetry.lobby?.mode !== 'edu') throw new IncompleteUI('mode-edu did not change authoritative LobbyState.mode to edu');
    }
    await Promise.all(clients.slice(1).map(async client => {
      await client.page.goto(`${baseURL}/r/${room}${client.spectator ? '?screen=1' : ''}`, { waitUntil: 'domcontentloaded' });
      if (!client.spectator) await optionalJoin(client);
    }));
    phase = 'repository selection';
    await Promise.all(clients.filter(client => !client.spectator).map(async (client, index) => {
      const field = await required(client, 'player-repo-input');
      await field.fill(repos![index % repos!.length]);
      await click(client, 'player-repo-submit');
      await waitForReady(client, 'player-ready');
    }));
    if (options.mode === 'battle') {
      await (await required(owner, 'boss-repo-input')).fill(options.boss);
      await click(owner, 'boss-repo-submit');
      await waitForReady(owner, 'boss-ready');
    }
    await capturePair('lobby');
    // Rendering and the Playwright WS observer can settle on adjacent event turns.
    const readyDeadline = Date.now() + 2000;
    while ((owner.telemetry.lobby?.players.filter(player => player.status === 'ready').length ?? 0) !== options.players
      && Date.now() < readyDeadline) await sleep(50);
    const readyCount = owner.telemetry.lobby?.players.filter(player => player.status === 'ready').length ?? 0;
    if (readyCount !== options.players) throw new IncompleteUI(`UI selected repos but server reports ${readyCount}/${options.players} ready players`);
    phase = options.mode === 'edu' ? 'classroom PvP start' : 'boss intro';
    await click(owner, 'start-match');
    startedAt = Date.now();
    await Promise.all(pair().map(async client => {
      if (options.mode === 'battle') {
        try { await client.page.getByTestId('boss-intro').waitFor({ state: 'visible', timeout: 2500 }); }
        catch { note(`${client.name}: optional boss-intro overlay absent; capturing fight canvas instead`); await required(client, 'game-canvas'); }
      } else await required(client, 'game-canvas');
      await screenshot(client, options.mode === 'edu' ? 'classroom-start' : 'boss-intro');
    }));
    await Promise.all(clients.filter(c => !c.spectator).map(client => required(client, 'game-canvas')));
    phase = 'fight';
    const fighters = clients.filter(client => !client.spectator);
    const directions = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
    const held = new Map<Client, string>();
    await Promise.all(fighters.map(client => client.page.keyboard.down('KeyJ')));
    let nextShot = 10;
    let lastDash = -1;
    let lastSkill = -1;
    while ((elapsed = (Date.now() - startedAt) / 1000) < options.seconds && !interrupted) {
      if (owner.telemetry.autopsy || await owner.page.getByTestId('autopsy').isVisible()) break;
      const dashPeriod = Math.floor(elapsed / 4);
      const skillPeriod = Math.floor(elapsed / 12);
      await Promise.all(fighters.map(async (client, index) => {
        const direction = directions[(Math.floor(elapsed / 1.5) + index) % directions.length];
        const gesturePhone = client.phone && await client.page.locator('.kj-touch-overlay').count() > 0;
        if (!gesturePhone) {
          const old = held.get(client);
          if (old !== direction) {
            if (old) await client.page.keyboard.up(old);
            await client.page.keyboard.down(direction); held.set(client, direction);
          }
          if (dashPeriod !== lastDash) await client.page.keyboard.press('Space');
          if (skillPeriod !== lastSkill) await client.page.keyboard.press('KeyE');
          return;
        }
        // Real phone fallback: invisible drag + tap/double-tap/long-press. No buttons.
        if (!client.touchDriver) {
          const box = await client.page.getByTestId('game-canvas').boundingBox();
          if (!box) return;
          const x = box.x + box.width * 0.35, y = box.y + box.height * 0.5;
          client.touchDriver = { session: await client.context.newCDPSession(client.page), x, y, originX: x, originY: y, nextAttack: 0 };
        }
        const touch = client.touchDriver;
        const release = async () => {
          if (touch.down) await touch.session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          touch.down = false;
        };
        if (skillPeriod !== lastSkill) {
          await release();
          await touch.session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touch.originX, y: touch.originY }] });
          await sleep(620);
          await touch.session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else if (dashPeriod !== lastDash) {
          await release(); await client.page.touchscreen.tap(touch.originX, touch.originY);
          await sleep(80); await client.page.touchscreen.tap(touch.originX, touch.originY);
        } else if (Date.now() >= (touch.nextAttack ?? 0)) {
          await release(); await client.page.touchscreen.tap(touch.originX, touch.originY);
          // Let the single-tap classifier rule out a second tap before starting a drag.
          await sleep(330); touch.nextAttack = Date.now() + 1200;
        } else {
          if (!touch.down) {
            await touch.session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touch.originX, y: touch.originY }] });
            touch.down = true;
          }
          const vector = { KeyW: [0, -1], KeyD: [1, 0], KeyS: [0, 1], KeyA: [-1, 0] }[direction as 'KeyW' | 'KeyD' | 'KeyS' | 'KeyA'];
          touch.x = touch.originX + vector[0] * 44; touch.y = touch.originY + vector[1] * 44;
          await touch.session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touch.x, y: touch.y }] });
        }
      }));
      lastDash = dashPeriod;
      lastSkill = skillPeriod;
      if (elapsed >= nextShot) {
        await capturePair(`mid-fight-${String(nextShot).padStart(3, '0')}s`);
        log('fight', `${Math.floor(elapsed)}s: ${fighters.map(c => `${c.name} ${c.telemetry.snapshots} snapshots / ${c.telemetry.inputs} inputs`).join('; ')}`, true);
        nextShot += 10;
      }
      await sleep(180);
    }
    // Include the exact final 10s boundary when --seconds is a multiple of ten.
    if (nextShot <= options.seconds && elapsed >= nextShot && !owner.telemetry.autopsy) await capturePair(`mid-fight-${String(nextShot).padStart(3, '0')}s`);
    await Promise.all(fighters.map(async client => {
      await client.page.keyboard.up('KeyJ');
      const direction = held.get(client);
      if (direction) await client.page.keyboard.up(direction);
      if (client.touchDriver?.down) {
        await client.touchDriver.session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        client.touchDriver.down = false;
      }
    }));
    phase = 'autopsy';
    try { await owner.page.getByTestId('autopsy').waitFor({ state: 'visible', timeout: 5000 }); }
    catch { /* A timed smoke need not last long enough for a natural match ending. */ }
    if (await owner.page.getByTestId('autopsy').isVisible()) {
      for (const client of pair()) await required(client, 'autopsy');
      await capturePair('autopsy');
      outcome = 'autopsy';
    } else {
      await capturePair('end-fight');
      note('Autopsy not reached within the requested fight window plus 5s grace; screenshots show the real end-of-run fight.');
      outcome = 'timed-fight';
      if (owner.telemetry.autopsy) throw new IncompleteUI('Server sent autopsy, but visible [data-testid="autopsy"] is missing');
    }
    for (const client of fighters) {
      const t = client.telemetry;
      if (options.mode === 'edu' && (t.snapshot?.mode !== 'edu' || t.snapshot.boss !== null || t.snapshot.heroScale !== 2 || !t.snapshot.pvp)) {
        throw new IncompleteUI(`${client.name}: classroom snapshot must have mode=edu, boss=null, heroScale=2 and PvP scoring`);
      }
      if (options.mode === 'edu' && t.snapshot?.players.some(player => !player.kit.quality?.length)) {
        throw new IncompleteUI(`${client.name}: classroom hero is missing its code-quality report card`);
      }
      if (options.mode === 'edu' && t.result && (t.result.mode !== 'edu' || t.result.boss !== null
        || t.result.ranking?.length !== options.players)) {
        throw new IncompleteUI(`${client.name}: classroom autopsy must have no boss and a ranking for every student`);
      }
      if (!t.fightingSnapshots || !t.inputs || !t.moving || !t.firing || t.ack < 1) {
        throw new IncompleteUI(`${client.name}: missing end-to-end snapshot/ack/movement/fire evidence (${JSON.stringify(totals(t))})`);
      }
    }
    exitCode = missing.length ? 2 : 0;
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    exitCode = error instanceof IncompleteUI ? 2 : 1;
    log(error instanceof IncompleteUI ? 'incomplete-ui' : 'failure', `${phase}: ${failure}`, true);
    if (error instanceof IncompleteUI && !missing.includes(failure)) missing.push(failure);
    await capturePair('failure');
    for (const client of clients) {
      try {
        const inventory = await client.page.locator('[data-testid]').evaluateAll(elements => elements.map(el => ({
          id: el.getAttribute('data-testid'), status: el.getAttribute('data-status'), visible: el.getClientRects().length > 0,
        })));
        log('testid-inventory', `${client.name}: ${JSON.stringify(inventory)}`);
      } catch { /* The page may have crashed/closed. */ }
    }
  } finally {
    shuttingDown = true;
    if (interrupted || errors.page || errors.websocket) exitCode = 1;
    await browser?.close().catch(error => log('cleanup', String(error)));
    process.removeListener('SIGINT', stopOnSignal);
    process.removeListener('SIGTERM', stopOnSignal);
    const summary = {
      options, baseURL, room, syntheticFixture: process.env.PLAYTEST_SELF_TEST === '1',
      outcome: exitCode ? 'incomplete-or-failed' : outcome, exitCode, phase, failure,
      elapsedFightSeconds: Number(elapsed.toFixed(2)), errors, missing, notes, screenshots,
      clients: clients.map(client => ({ name: client.name, phone: client.phone, spectator: client.spectator,
        url: client.page.url(), ...totals(client.telemetry) })),
    };
    writeFileSync(join(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    log('result', `exit=${exitCode} outcome=${summary.outcome} artifacts=${output}`, true);
  }
  return exitCode;
}

function totals(t: Telemetry) {
  return { playerId: t.id, snapshots: t.snapshots, fightingSnapshots: t.fightingSnapshots, inputs: t.inputs, moving: t.moving, firing: t.firing,
    dashes: t.dashes, skills: t.skills, ack: t.ack, sources: t.sources, autopsy: t.autopsy,
    lastMatchStatus: t.snapshot?.status, serverTime: t.snapshot?.t, mode: t.snapshot?.mode,
    heroScale: t.snapshot?.heroScale, hasBoss: t.snapshot?.boss != null, pvp: t.snapshot?.pvp,
    lessons: t.lessons, quizAnswers: t.quizAnswers,
    qualityCards: t.snapshot?.players.map(player => ({ id: player.id, quality: player.kit.quality })), ranking: t.result?.ranking };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log('Usage: npx tsx tools/playtest.ts [--mode battle|edu] [--players 4] [--boss pallets/flask] [--seconds 60] [--headed]\nSee tools/README.md for selectors, artifacts, and exit codes.');
  } else {
    try { process.exitCode = await playtest(parseOptions(process.argv.slice(2))); }
    catch (error) { console.error(String(error)); process.exitCode = 1; }
  }
}
