/** Offline browser acceptance for the global language control and canvas fonts. */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LOCALES } from '../shared/i18n/locale';
import { translate } from '../shared/i18n/text';

const out = resolve('docs/shots/i18n'); mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 0, host: '127.0.0.1' } });
await server.listen(); const address = server.httpServer!.address() as { port: number };
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium' });
const errors: string[] = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/, route => route.abort());
  await context.route('**/auth/me', route => route.fulfill({ json: { authenticated: false } }));
  await context.addInitScript(() => { localStorage.setItem('kaiju.name', 'Ready'); localStorage.setItem('gitzilla.locale', 'en'); });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  const cases = [
    { name: 'landing', path: '/?mock=1', control: 'join-submit', source: 'join' },
    { name: 'lobby', path: '/r/TEST?mock=1', control: 'player-repo-submit', source: '▶ summon hero' },
    { name: 'autopsy', path: '/r/TEST?mock=autopsy', control: 'autopsy-new-room', source: '[ new room ]' },
  ];
  for (const view of cases) {
    await page.goto(base + view.path); await page.getByTestId(view.control).waitFor();
    for (const lang of LOCALES) {
      await page.getByTestId('language-select').selectOption(lang);
      const expected = translate(view.source, lang);
      if (lang !== 'en' && expected === view.source) throw new Error(`Missing translation: ${view.source}/${lang}`);
      await page.waitForFunction(({ id, expected }) => document.querySelector(`[data-testid="${id}"]`)?.textContent === expected, { id: view.control, expected });
      if (view.name === 'landing') for (const fragment of [' players, phones are controllers', ' becomes your hero', ' is a repo the owner picks']) {
        const expectedFact = translate(fragment, lang).trim();
        if (lang !== 'en' && expectedFact === fragment.trim()) throw new Error(`Missing landing fact translation: ${lang}`);
        await page.waitForFunction(text => document.querySelector('.landing-facts')?.textContent?.includes(text), expectedFact);
      }
      if (view.name === 'landing') {
        if (!await page.getByTestId('create-pvp').isVisible()) throw new Error('PvP entry must be visible on phones');
        const pvp = translate('[ PvP: challenge a friend ]', lang);
        if (lang !== 'en' && pvp === '[ PvP: challenge a friend ]') throw new Error('Missing PvP entry translation');
        await page.waitForFunction(text => document.querySelector('[data-testid="create-pvp"]')?.textContent === text, pvp);
      }
      if (view.name === 'lobby') await page.waitForFunction(text => document.querySelector('[data-testid="github-connect"]')?.textContent?.includes(text), translate(' Connect GitHub', lang).trim());
      if (view.name === 'autopsy' && !(await page.locator('.ap-name').allTextContents()).some(text => text.includes('Ready'))) throw new Error('A player name was translated');
      if (await page.locator('html').getAttribute('lang') !== lang) throw new Error('Document language did not follow selection');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (overflow) throw new Error(`Page overflows: ${view.name}/${lang}`);
      await page.screenshot({ path: `${out}/${view.name}-${lang}.png` });
    }
  }
  const canvas = await page.evaluate(async () => {
    const path = '/client/render/localized-text.ts';
    const { nativeTextSprite, nativeTextWidth } = await import(/* @vite-ignore */ path);
    return ['准备好了', 'Prêt à combattre', 'Español'].map(text => {
      const sprite = nativeTextSprite(text, '#ffffff', '#000000');
      const data = sprite.getContext('2d')!.getImageData(0, 0, sprite.width, sprite.height).data;
      return { text, width: sprite.width, measured: nativeTextWidth(text), painted: data.some((v: number, i: number) => i % 4 === 3 && v > 0) };
    });
  });
  if (canvas.some(row => !row.painted || row.width !== row.measured + 2)) throw new Error('Canvas glyph rendering/measurement failed');
  if (errors.length) throw new Error(errors.join('\n'));
  const result = { passed: true, locales: LOCALES, views: cases.map(x => x.name), width: 390, canvas, browserErrors: errors };
  writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await browser.close(); await server.close(); }
