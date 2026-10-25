import { describe, expect, it } from 'vitest';
import { webkit } from 'playwright';
import { spawnSync } from 'node:child_process';
import { instrumentModule, luminance, parseSoakOptions, soakBaseURL } from './rematch-soak';
import { installRematchProbe } from './rematch-probe';

describe('rematch diagnosis controls', () => {
  it('refuses live, staging, non-loopback and non-HTTP targets', () => {
    expect(soakBaseURL('http://localhost:5175')).toBe('http://localhost:5175');
    expect(soakBaseURL('http://localhost:5191')).toBe('http://localhost:5191');
    for (const url of ['http://localhost:5173', 'http://localhost:5176', 'https://gitzilla.wilflin.me', 'http://example.com:5175', 'https://localhost:5175']) {
      expect(() => soakBaseURL(url)).toThrow('restricted');
    }
  });
  it('defaults to the requested twelve-cycle matrix and validates filters/durations', () => {
    expect(parseSoakOptions([])).toMatchObject({ cycles: 12, playSeconds: 15, device: 'all', view: 'all', path: 'all' });
    for (const args of [['--cycles', '0'], ['--jobs', '1.5'], ['--device', 'chromium'], ['--view', 'bad'], ['--wat', '1']]) {
      expect(() => parseSoakOptions(args)).toThrow();
    }
  });
  it('observes hero drawing without swallowing exceptions or restoring product context state', () => {
    const source = 'function drawPlayer(ctx,p,time,isYou,opts) { ctx.scale(2,2); throw new Error("product failure"); }';
    const result = instrumentModule('/client/render/player/index.ts', source);
    let ended = 0, restores = 0, scale = 1;
    const run = new Function('globalThis', `${result.body}; return drawPlayer;`)({ __rematchProbe: { beginHero: () => () => { ended++; } } });
    expect(() => run({ scale: (x: number) => { scale *= x; }, restore: () => { restores++; } }, {}, 0, true)).toThrow('product failure');
    expect(ended).toBe(1); expect(scale).toBe(2); expect(restores).toBe(0);
  });
  it.each(['black', 'white', '#808080'])('classifies screenshot luminance outside the page: %s', color => {
    const png = spawnSync('python3', ['-c', 'from PIL import Image;import sys;Image.new("RGB",(8,8),sys.argv[1]).save(sys.stdout.buffer,"PNG")', color]).stdout;
    const result = luminance(png);
    expect(result.allBlack).toBe(color === 'black'); expect(result.allWhite).toBe(color === 'white');
  });
});

describe.skipIf(process.env.REMATCH_PROBE_SELF_TEST !== '1')('WebKit probe calibration (synthetic page)', () => {
  it('counts a running/cancelled RAF chain, timer cleanup, global listener removal and canvas transforms', async () => {
    const browser = await webkit.launch();
    try {
      const context = await browser.newContext();
      await context.addInitScript(`(()=>{const __name=(fn,name)=>Object.defineProperty(fn,'name',{value:name,configurable:true});(${installRematchProbe.toString()})();})();`);
      const page = await context.newPage(); await page.goto('about:blank');
      await page.evaluate(() => {
        const w = window as any;
        const cv = document.createElement('canvas'); document.body.append(cv);
        const ctx = cv.getContext('2d')!; ctx.setTransform(2, 0, 0, 2, 0, 0);
        w.iv = setInterval(() => {}, 10_000); w.to = setTimeout(() => {}, 10_000);
        w.listener = () => {}; document.addEventListener('qa-probe', w.listener); document.addEventListener('qa-probe', w.listener);
        const frame = () => { w.raf = requestAnimationFrame(frame); }; w.raf = requestAnimationFrame(frame);
      });
      await page.waitForTimeout(350);
      const active = await page.evaluate(() => (window as any).__rematchProbe.sample());
      expect(active.contexts.filter((x: any) => x.kind === '2d')).toHaveLength(1);
      expect(active.raf.activeChains).toHaveLength(1);
      expect(active.timers.active).toHaveLength(2);
      expect(active.listeners.filter((x: any) => x.type === 'qa-probe')).toHaveLength(1);
      expect(active.frames.at(-1).canvases[0]).toMatchObject({ identity: false, matrix: [2, 0, 0, 2, 0, 0] });
      await page.evaluate(() => {
        const w = window as any; clearInterval(w.iv); clearTimeout(w.to); cancelAnimationFrame(w.raf);
        document.removeEventListener('qa-probe', w.listener); document.querySelector('canvas')!.remove();
      });
      await page.waitForTimeout(1600);
      const stopped = await page.evaluate(() => (window as any).__rematchProbe.sample());
      expect(stopped.raf.activeChains).toHaveLength(0); expect(stopped.timers.active).toHaveLength(0);
      expect(stopped.canvases).toHaveLength(0); expect(stopped.listeners.filter((x: any) => x.type === 'qa-probe')).toHaveLength(0);
    } finally { await browser.close(); }
  }, 15_000);
});
