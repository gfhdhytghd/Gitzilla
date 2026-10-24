import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import type { InputFrame, MatchState, ServerMsg } from '../shared/types.ts';
import { devURL, request, sleep, until } from './common.ts';

const base = devURL();
const output = `qa/artifacts/portrait-${new Date().toISOString().replace(/[:.]/g, '-')}`;
mkdirSync(output, { recursive: true });
const allCases = [
  { width: 390, height: 844, dpr: 3, top: 47, bottom: 34 },
  { width: 360, height: 800, dpr: 3, top: 32, bottom: 24 },
  { width: 430, height: 932, dpr: 3, top: 59, bottom: 34 },
  { width: 360, height: 640, dpr: 2, top: 24, bottom: 24 },
];
const selected = process.env.QA_PORTRAIT_SIZES?.split(',');
if (selected?.some(size => !allCases.some(c => `${c.width}x${c.height}` === size))) throw new Error('Unknown QA_PORTRAIT_SIZES; use comma-separated 390x844,360x800,430x932,360x640');
const cases = selected ? allCases.filter(c => selected.includes(`${c.width}x${c.height}`)) : allCases;
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
const results: Record<string, unknown>[] = [];
const pageErrors: string[] = [];
let layoutReady = false;
let currentPage: Page | undefined;
const shot = async (page: Page, label: string) => page.screenshot({ path: `${output}/${label}.png`, timeout: 10000 });

async function joinName(page: Page) {
  await page.getByTestId('player-name').fill('QA portrait');
  await page.getByTestId('join-room').click();
}
async function geometry(page: Page) {
  return page.evaluate(() => {
    const boxes: Record<string, { x: number; y: number; w: number; h: number; right: number; bottom: number } | null> = {};
    for (const [name, selector] of Object.entries({
      stage: '[data-testid="phone-viewport"], .phone-viewport, .game-viewport, .stage',
      bossText: '.hb-top', self: '.hud-self', deck: '.deck',
      dash: '[data-testid="input-dash"]', skill: '[data-testid="input-skill"]',
      joystick: '.kj-touch-joystick', joystickZone: '.kj-touch-joystick-zone',
      minimap: '[data-testid="minimap"], [data-testid="phone-minimap"], .minimap, .game-minimap, .phone-minimap',
      sensor: '[data-testid="input-sensors"], .sensor-status, .phone-sensors, .kj-sensor-status',
    })) {
      const element = document.querySelector(selector);
      if (!element) { boxes[name] = null; continue; }
      const r = element.getBoundingClientRect();
      boxes[name] = { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    }
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    document.body.append(probe); const style = getComputedStyle(probe);
    const insets = { top: parseFloat(style.paddingTop), bottom: parseFloat(style.paddingBottom) }; probe.remove();
    return { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, insets, scrollWidth: document.documentElement.scrollWidth,
      stage: boxes.stage, bossText: boxes.bossText, self: boxes.self, deck: boxes.deck,
      dash: boxes.dash, skill: boxes.skill, minimap: boxes.minimap, sensor: boxes.sensor,
      joystick: boxes.joystick, joystickZone: boxes.joystickZone,
    };
  });
}

try {
  // Readiness gate only: don't label the expected old layout as a new product bug.
  const probe = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  await probe.goto(new URL('/r/QAPR?mock=match', base).href); await joinName(probe);
  await probe.getByTestId('game-canvas').waitFor({ timeout: 15000 });
  await sleep(250);
  const before = await geometry(probe);
  layoutReady = !!before.stage && before.stage.h >= before.h * 0.4 && !!before.self && before.self.y >= before.stage.bottom - 1 && !!before.deck && before.deck.h > 0;
  if (!layoutReady) {
    await shot(probe, 'waiting-for-portrait-layout');
    results.push({ status: 'WAITING_FOR_LAYOUT', readinessProbeOnly: true, syntheticGameplay: true, geometry: before });
    process.exitCode = 2;
  }
  await probe.close();
  if (layoutReady) for (const test of cases) {
    const label = `${test.width}x${test.height}-dpr${test.dpr}`;
    const context = await browser.newContext({ viewport: { width: test.width, height: test.height }, isMobile: true, hasTouch: true, deviceScaleFactor: test.dpr });
    const page = await context.newPage(); currentPage = page;
    const cdp = await context.newCDPSession(page);
    const errors: string[] = [];
    let state: MatchState | undefined; let id: string | undefined; let ack = -1;
    let lastInput: InputFrame | undefined;
    const sent = { fire: 0, dash: 0, skill: 0 };
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('websocket', socket => {
      if (new URL(socket.url()).pathname !== '/ws') return;
      socket.on('framereceived', frame => {
        const msg = JSON.parse(frame.payload.toString()) as ServerMsg;
        if (msg.t === 'welcome') id = msg.you;
        if (msg.t === 'snapshot') { state = msg.state; ack = msg.ack; }
        if (msg.t === 'error') errors.push(msg.message);
      });
      socket.on('framesent', frame => {
        const msg = JSON.parse(frame.payload.toString());
        if (msg.t !== 'input') return;
        lastInput = msg.frame;
        if (msg.frame.fire) sent.fire++;
        if (msg.frame.dash) sent.dash++;
        if (msg.frame.skill) sent.skill++;
      });
    });
    try {
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: test.top, bottom: test.bottom, left: 0, right: 0 } });
      await page.goto(base.href);
      await page.getByTestId('create-room').waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Portrait landing does not overflow horizontally');
      await shot(page, `${label}-landing`);
      const { room } = await (await request('/api/room', 'POST')).json() as { room: string };
      await page.goto(new URL(`/r/${room}`, base).href); await joinName(page);
      for (const kind of ['player', 'boss']) {
        await page.getByTestId(`${kind}-repo-input`).fill('pallets/flask');
        await page.getByTestId(`${kind}-repo-submit`).click();
        await page.locator(`[data-testid="${kind}-ready"][data-status="ready"]`).waitFor({ timeout: 30000 });
      }
      await shot(page, `${label}-lobby`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Portrait lobby must not overflow horizontally');
      await page.getByTestId('start-match').click(); await page.getByTestId('game-canvas').waitFor();
      await until(() => state?.status === 'fighting', 'fighting');
      if (await page.getByTestId('motion-enable').isVisible()) await page.getByTestId('motion-enable').tap();
      await sleep(3200); // Let the intro finish before checking actual control hit targets.
      if (await page.getByTestId('motion-enable').isVisible()) {
        await page.getByTestId('motion-enable').tap();
        await page.getByTestId('motion-enable').waitFor({ state: 'hidden', timeout: 5000 });
      }
      const g = await geometry(page);
      await shot(page, `${label}-game`);
      assert.equal(g.insets.top, test.top, 'CDP top safe-area override is effective');
      assert.equal(g.insets.bottom, test.bottom, 'CDP bottom safe-area override is effective');
      assert.ok(g.stage && g.stage.h >= test.height * 0.4, 'Portrait viewport occupies useful vertical space');
      assert.ok(g.bossText && g.bossText.y >= test.top - 1, 'Boss text clears the notch');
      assert.ok(g.self && g.stage && g.self.y >= g.stage.bottom - 1, 'Self HUD is in the deck below the viewport');
      assert.ok(g.minimap && g.minimap.w > 0 && g.minimap.h > 0, 'Minimap visible');
      assert.ok(g.sensor && g.sensor.w > 0 && g.sensor.h > 0, 'Sensor status visible');
      assert.ok(g.sensor && g.stage && g.sensor.y >= g.stage.bottom && g.sensor.bottom <= Math.min(g.dash?.y ?? Infinity, g.skill?.y ?? Infinity), 'Sensor status remains in the deck and out of the notch/button areas');
      for (const [name, button] of [['dash', g.dash], ['skill', g.skill]] as const) {
        assert.ok(button && button.w >= 64 && button.h >= 48, `${name}: thumb-sized control`);
        assert.ok(button && button.y >= test.top && button.bottom <= test.height - test.bottom + 1 && button.x >= 0 && button.right <= test.width + 1, `${name}: inside safe usable bounds`);
      }
      const initialId = id;
      for (let flip = 0; flip < 3; flip++) {
        await page.setViewportSize({ width: test.height, height: test.width }); await sleep(180);
        assert.ok(await page.getByText(/rotate to portrait/i).first().isVisible(), 'Landscape phone has portrait rotate guard');
        await page.setViewportSize({ width: test.width, height: test.height }); await sleep(180);
        assert.equal(await page.getByText(/rotate to portrait/i).first().isVisible(), false, 'Portrait clears rotate guard');
      }
      assert.equal(id, initialId, 'Rotation retains player identity');
      if (errors.some(e => /Server restarted/.test(e))) throw new Error('DEV restarted during rotation; case requires a stable-server rerun');
      const touchStage = (await geometry(page)).stage!;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchStage.x + touchStage.w / 2, y: touchStage.y + touchStage.h / 2 }] });
      await until(() => !!lastInput?.fire, 'held viewport touch fires');
      // Headless Chromium keeps both tabs visibilityState=visible. Explicitly
      // exercise real app handlers with labeled synthetic visibility/blur events.
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('blur'));
      });
      await until(() => !!lastInput && !lastInput.fire && !lastInput.dash && !lastInput.skill && lastInput.move.every(n => n === 0), 'background clears held controls');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.evaluate(() => {
        Reflect.deleteProperty(document, 'visibilityState');
        document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus'));
      });
      const backgroundTab = await context.newPage();
      await backgroundTab.goto('about:blank'); await backgroundTab.bringToFront(); await sleep(400);
      const backgroundVisibility = await page.evaluate(() => document.visibilityState);
      await page.bringToFront(); await backgroundTab.close();
      const foregroundVisibility = await page.evaluate(() => document.visibilityState);
      const t = state!.t;
      await cdp.send('Page.setWebLifecycleState', { state: 'frozen' }); await sleep(1200);
      await cdp.send('Page.setWebLifecycleState', { state: 'active' }); await page.bringToFront();
      await until(() => !!state && state.t > t + 0.5, 'foreground receives current snapshots');
      const ackBefore = ack;
      await page.getByTestId('input-dash').tap(); await page.getByTestId('input-skill').tap();
      const stage = (await geometry(page)).stage!;
      await page.touchscreen.tap(stage.x + stage.w / 2, stage.y + stage.h / 2);
      await until(() => ack > ackBefore && sent.fire > 0 && sent.dash > 0 && sent.skill > 0, 'foreground touch fire/dash/skill reach the server');
      await shot(page, `${label}-after-flips-and-wake`);
      assert.equal(id, initialId);
      assert.equal(errors.filter(e => /Match stopped|Server restarted/.test(e)).length, 0, errors.join('; '));
      let autopsy = 'not reached within optional 30s end window';
      try {
        await until(() => {
          const interrupted = errors.find(e => /Server restarted|Match stopped/.test(e));
          if (interrupted) throw new Error(interrupted);
          return state?.status === 'defeat' || state?.status === 'victory';
        }, 'natural phone autopsy', 30000);
        await page.getByTestId('autopsy').waitFor({ timeout: 10000 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Portrait autopsy does not overflow horizontally');
        await page.getByTestId('rematch').scrollIntoViewIfNeeded();
        await shot(page, `${label}-autopsy`); autopsy = 'visible natural result';
      } catch (error) {
        if (!String(error).includes('Timeout: natural phone autopsy')) throw error;
      }
      results.push({ label, status: 'PASS', geometry: g, sent, ack, id, errors, autopsy, safeArea: 'native CDP env override', background: 'synthetic visibility/blur held-control clear, tab switch, CDP frozen/active lifecycle', backgroundVisibility, foregroundVisibility });
    } catch (error) {
      await shot(page, `${label}-failure`).catch(() => {});
      const status = errors.some(e => /Server restarted/.test(e)) ? 'INCONCLUSIVE' : 'FAIL';
      results.push({ label, status, failure: String(error), errors, geometry: await geometry(page).catch(() => null), sent });
      console.log(`${status} ${label}: ${error}`); process.exitCode = status === 'FAIL' ? 1 : (process.exitCode || 2);
    } finally { await context.close(); }
  }
} catch (error) {
  results.push({ status: 'HARNESS_FAILURE', failure: String(error) });
  if (currentPage) await shot(currentPage, 'harness-failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  writeFileSync(`${output}/summary.json`, JSON.stringify({ target: base.origin, layoutReady, results, pageErrors, limits: 'Chromium phone/touch/DPR and native safe-area emulation; CDP frozen lifecycle, not physical sensors, Safari or real OS app suspension.' }, null, 2));
  console.log(`Evidence: ${output}/summary.json`);
}
if (pageErrors.length) process.exitCode = 1;
