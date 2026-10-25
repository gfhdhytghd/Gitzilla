// Real DEV landing + native Chromium audio, strict autoplay. Not physical iOS proof.
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { completeLandingOnboarding } from './onboarding';
import { playtestBaseURL } from './playtest';

const base = playtestBaseURL(process.env.SMOKE_URL || process.env.PLAYTEST_URL);
const output = `docs/shots/${new Date().toISOString().replace(/[:.]/g, '-')}-phone-audio`;
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/chromium'),
  args: ['--autoplay-policy=user-gesture-required'] });
const errors: string[] = [];
const results: Record<string, unknown> = { evidence: '390x844 touch Chromium, native DSP; iOS hardware unverified' };
try {
  for (const sessionApi of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    // tsx annotates class/function names in serialized Playwright callbacks.
    await context.addInitScript('globalThis.__name = (value) => value;');
    await context.addInitScript(({ sessionApi }) => {
      const w = window as any;
      const probe: any = w.__phoneAudio = { contexts: [], loops: 0, resumes: [], hidden: false, session: { type: 'auto' } };
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => probe.hidden });
      Object.defineProperty(navigator, 'audioSession', { configurable: true, value: sessionApi ? probe.session : undefined });
      const Native = window.AudioContext;
      window.AudioContext = class extends Native {
        constructor(options?: AudioContextOptions) { super(options); probe.contexts.push(this); }
        resume() { probe.resumes.push({ gesture: w.event?.type || '', active: navigator.userActivation.isActive, state: this.state }); return super.resume(); }
        createGain() {
          const gain = super.createGain(); const connect = gain.connect.bind(gain);
          gain.connect = ((target: AudioNode, ...rest: any[]) => {
            if (target === this.destination) {
              const analyser = this.createAnalyser(); analyser.fftSize = 2048;
              connect(analyser); analyser.connect(target); w.__phoneAudio.analyser = analyser; return target;
            }
            return (connect as any)(target, ...rest);
          }) as typeof gain.connect;
          return gain;
        }
        createBufferSource() {
          const node = super.createBufferSource(); const start = node.start.bind(node);
          node.start = ((...args: any[]) => { if (node.loop) probe.loops++; return (start as any)(...args); }) as typeof node.start;
          return node;
        }
      };
    }, { sessionApi });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    page.on('pageerror', e => errors.push(e.stack || e.message));
    await page.goto(`${base}/?debug=input`, { waitUntil: 'networkidle' });
    await page.getByTestId('create-room').waitFor({ state: 'visible' });
    // No evaluate()/CDP script before the first tap: evaluation can grant activation.
    const onboarding = await completeLandingOnboarding(page, { controls: 'touch', touch: true });
    if (!onboarding.shown) await page.touchscreen.tap(20, 20);
    await page.waitForFunction(() => (window as any).__phoneAudio.contexts[0]?.state === 'running' && (window as any).__phoneAudio.loops > 0);
    await page.evaluate(async () => {
      const path = '/client/input/debug.ts';
      const { createInputDebugPanel } = await import(/* @vite-ignore */ path);
      document.body.append(createInputDebugPanel());
    });
    await page.getByTestId('input-debug').filter({ hasText: 'audio: running | music: playing' }).waitFor();
    await page.waitForTimeout(300);
    const snapshot = () => page.evaluate(async () => {
      const p = (window as any).__phoneAudio;
      const a: AnalyserNode = p.analyser; const pcm = new Float32Array(a.fftSize); a.getFloatTimeDomainData(pcm);
      const media = document.querySelector<HTMLAudioElement>('[data-kj-audio-session]');
      const path = '/client/audio/status.ts';
      const { readAudioDebugStatus } = await import(/* @vite-ignore */ path);
      return { state: p.contexts[0].state, contexts: p.contexts.length, loops: p.loops, resumes: p.resumes,
        session: p.session.type, media: media ? { paused: media.paused, loop: media.loop, inline: media.hasAttribute('playsinline'), error: media.error?.message } : null,
        rms: Math.sqrt(pcm.reduce((sum, v) => sum + v * v, 0) / pcm.length), status: readAudioDebugStatus() };
    });
    const first = await snapshot();
    results[sessionApi ? 'mockPlaybackSession' : 'nativeSilentMedia'] = { first };
    assert.equal(first.contexts, 1); assert.equal(first.loops, 1);
    assert(first.resumes.some((r: any) => r.active && ['pointerup', 'touchend', 'click'].includes(r.gesture)), 'resume called synchronously in activating gesture');
    assert(first.rms > 0.0001 && first.status.musicPlaying, 'actual music output and bus playing');
    if (sessionApi) { assert.equal(first.session, 'playback'); assert.equal(first.media, null); }
    else { assert.equal(first.media?.paused, false); assert(first.media?.loop && first.media.inline); }
    for (const wake of ['visibilitychange', 'pageshow']) {
      await page.evaluate(async () => { const p = (window as any).__phoneAudio; p.hidden = true; await p.contexts[0].suspend(); });
      await page.getByTestId('input-debug').filter({ hasText: 'audio: suspended' }).waitFor();
      await page.evaluate(wake => {
        (window as any).__phoneAudio.hidden = false;
        (wake === 'pageshow' ? window : document).dispatchEvent(new Event(wake));
      }, wake);
      await page.waitForFunction(() => (window as any).__phoneAudio.contexts[0].state === 'running');
    }
    await page.waitForTimeout(150);
    const recovered = await snapshot();
    assert.equal(recovered.loops, 1); assert(recovered.rms > 0.0001);
    await page.screenshot({ path: `${output}/${sessionApi ? 'playback' : 'media'}.png` });
    results[sessionApi ? 'mockPlaybackSession' : 'nativeSilentMedia'] = { first, recovered };
    await context.close();
  }
  assert.equal(errors.length, 0, errors.join('\n')); results.pass = true;
} catch (error) { results.pass = false; results.failure = String(error); process.exitCode = 1; }
finally { await browser.close(); writeFileSync(`${output}/summary.json`, JSON.stringify({ ...results, errors }, null, 2)); console.log(JSON.stringify({ output, ...results, errors }, null, 2)); }
