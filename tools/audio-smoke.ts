// Browser/DSP proof, not a claim that a human heard the mix or that iOS was tested.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'docs/shots', `${new Date().toISOString().replace(/[:.]/g, '-')}-audio`);
mkdirSync(output, { recursive: true });
const base = process.env.PLAYTEST_BASE_URL || 'http://127.0.0.1:5173';
const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/chromium');
const browser = await chromium.launch({ executablePath: executable, headless: true });
const errors: string[] = [];
const results: Record<string, unknown> = { evidence: 'instrumented Chromium WebAudio/DSP, not listening or physical-device proof' };

// Observe actual output by adding an analyser immediately before the destination.
const instrument = `(() => {
  const Native = window.AudioContext;
  const probe = window.__audioProbe = { contexts: [], starts: [], compressors: 0, shapers: 0, live: 0, maxLive: 0 };
  window.AudioContext = class extends Native {
    constructor(options) { super(options); probe.contexts.push(this); }
    createDynamicsCompressor() { probe.compressors++; return super.createDynamicsCompressor(); }
    createWaveShaper() { probe.shapers++; return super.createWaveShaper(); }
    createGain() {
      const gain = super.createGain(); const connect = gain.connect.bind(gain); const ctx = this;
      gain.connect = (target, ...rest) => {
        if(target === ctx.destination) {
          const analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
          connect(analyser); analyser.connect(target); probe.analyser = analyser; probe.master = gain;
          return target;
        }
        return connect(target, ...rest);
      };
      return gain;
    }
    createBufferSource() {
      const node = super.createBufferSource(); const start = node.start.bind(node);
      node.start = (...args) => {
        probe.starts.push({ loop:node.loop, duration:node.buffer?.duration, rate:node.playbackRate.value });
        probe.live++;probe.maxLive=Math.max(probe.maxLive,probe.live);
        node.addEventListener('ended',()=>probe.live--,{once:true});
        return start(...args);
      };
      return node;
    }
  };
})();`;

try {
  for (const phone of [false, true]) {
    const context = await browser.newContext({ viewport: phone ? { width: 844, height: 390 } : { width: 1280, height: 720 },
      isMobile: phone, hasTouch: phone, deviceScaleFactor: 1 });
    await context.addInitScript(instrument);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`page: ${error.stack || error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()} ${message.location().url}`); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
    await page.goto(`${base}/client/audio/demo.html`, { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => (window as any).__audioProbe.contexts.length), 0, 'context must be lazy');
    const activate = async (id: string) => {
      const button = page.getByTestId(id);
      if (phone) await button.tap(); else await button.click();
      await page.waitForTimeout(80);
    };
    await activate('audio-unlock');
    assert.match(await page.getByTestId('audio-status').innerText(), /UNLOCKED/);
    assert.equal(await page.evaluate(() => (window as any).__audioProbe.contexts[0].state), 'running');
    await activate('music-terminal');
    await page.waitForTimeout(200);
    const rms = () => page.evaluate(() => {
      const a: AnalyserNode = (window as any).__audioProbe.analyser;
      const pcm = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(pcm);
      return { rms: Math.sqrt(pcm.reduce((sum, sample) => sum + sample * sample, 0) / pcm.length),
        peak: pcm.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0), finite: pcm.every(Number.isFinite) };
    });
    const playing = await rms();
    assert(playing.finite && playing.rms > 0.0001 && playing.peak < 1, 'music must produce finite, non-clipping output');
    if (!phone) {
      for (const theme of ['kernel', 'web', 'notebook', 'enterprise', 'legacy', 'lobby', 'victory', 'defeat']) await activate(`music-${theme}`);
      await activate('music-terminal');
      const durations: number[] = [];
      for (const phase of ['1', '2', '3']) {
        await page.locator('#phase').selectOption(phase);
        await page.waitForTimeout(100);
        durations.push(await page.evaluate(() => (window as any).__audioProbe.starts.filter((s: any) => s.loop).at(-1).duration));
      }
      assert(durations[0] > durations[1] && durations[1] > durations[2], 'higher phases must increase tempo');
      results.phaseLoopDurations = durations;
      for (const weapon of ['blaster', 'smg', 'shotgun', 'cannon', 'staff', 'laser', 'blade']) await activate(`fire-${weapon}`);
      for (const event of ['hit', 'crit', 'combo', 'hurt', 'telegraph', 'limbBroken', 'downed', 'revived', 'phase', 'victory', 'defeat']) await activate(`event-${event}`);
      for (const skill of ['firewall', 'fork', 'hotfix', 'overclock', 'rollback']) await activate(`skill-${skill}`);
      for (const effect of ['dash', 'intro', 'ui-tick', 'stress-burst']) await activate(effect);
      const stress = await rms();
      assert(stress.finite && stress.peak < 1, 'stress burst output must stay bounded');
      results.stress = stress;
    }
    await page.locator('#muted').check();
    await page.waitForTimeout(400);
    const silent = await rms();
    assert(silent.rms < 0.00001, `mute should silence the graph: ${JSON.stringify(silent)}`);
    assert.equal(await page.evaluate(() => (window as any).__audioProbe.live), 0, 'mute should stop active sources');
    await page.locator('#muted').uncheck();
    await page.waitForTimeout(250);
    assert((await rms()).rms > 0.0001, 'unmute should restart the retained music selection');
    await page.locator('#volume').evaluate(element => {
      (element as HTMLInputElement).value = '0.25';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(120);
    const state = await page.evaluate(() => {
      const p = (window as any).__audioProbe;
      return { contexts: p.contexts.length, state: p.contexts[0].state, starts: p.starts.length,
        compressors: p.compressors, shapers: p.shapers, volume: p.master.gain.value, maxLiveIncludingMusic: p.maxLive };
    });
    assert.equal(state.contexts, 1);
    assert.equal(state.compressors, 1);
    assert(state.shapers >= 1);
    assert(Math.abs(state.volume - 0.25) < 0.001);
    await page.screenshot({ path: join(output, `audio-demo-${phone ? 'phone' : 'desktop'}.png`) });
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForFunction(() => (window as any).__audioProbe.contexts[0].state === 'closed');
    results[phone ? 'phoneTouchEmulation' : 'desktop'] = { ...state, playing, muted: silent, disposed: true };
    await context.close();
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  results.pass = true;
} catch (error) {
  results.pass = false;
  results.failure = String(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  results.errors = errors;
  writeFileSync(join(output, 'audio-smoke.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify({ output, ...results }, null, 2));
}
