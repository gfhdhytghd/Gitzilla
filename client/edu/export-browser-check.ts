// Focused component render/download acceptance, using a protected HTTP fixture (not a live match).
// EDU_BASE_URL=http://127.0.0.1:5187 npx tsx client/edu/export-browser-check.ts
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const output = process.env.EDU_SCREENSHOT_DIR ?? '/tmp/gitzilla-edu-takeover-20261024/teacher-export';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? (existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/chromium') });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.addInitScript('globalThis.__name = (value) => value;');
const errors: string[] = [], requests: { format: string; authorized: boolean }[] = [];
let downloads = 0;
page.on('pageerror', error => errors.push(error.message));
page.on('download', () => { downloads++; });
await page.route('**/api/room/EDUT/feedback.*', async route => {
  const format = route.request().url().endsWith('.csv') ? 'csv' : 'md';
  const authorized = route.request().headers()['x-room-token'] === 'teacher-room-token';
  requests.push({ format, authorized });
  if (!authorized) { await route.fulfill({ status: 403, json: { error: 'Current owner only' } }); return; }
  await route.fulfill({ status: 200, contentType: format === 'csv' ? 'text/csv' : 'text/markdown',
    body: format === 'csv' ? 'Name,Repository\nAna,pallets/flask\n' : '# Teacher feedback\n\nAna — pallets/flask\n' });
});
try {
  await page.goto(`${process.env.EDU_BASE_URL ?? 'http://127.0.0.1:5187'}/client/edu/demo.html`);
  const renderMatrix = await page.evaluate(async () => {
    const viewUrl = '/client/edu/feedback-view.ts', engineUrl = '/rubric/index.ts';
    const [{ createClassFeedback }, engine] = await Promise.all([import(viewUrl), import(engineUrl)]);
    const profile = await (await fetch('/data/fallback/pallets__flask.json')).json(), rubric = engine.defaultRubric();
    const item = engine.buildFeedback(profile, rubric, engine.scoreRepo(profile, rubric), { playerId: 'ana', name: 'Ana', rank: 1, kos: 3, damage: 123, roundWins: 2 });
    const matrix: { variant: string; canExport: boolean | null; buttons: number }[] = [];
    for (const variant of ['screen', 'desktop', 'phone']) {
      for (const canExport of [undefined, false, true]) {
        const component = createClassFeedback({ items: [item], rubric, variant, canExport });
        matrix.push({ variant, canExport: canExport ?? null, buttons: component.querySelectorAll('.fb-export button').length });
      }
    }
    const state = window as typeof window & { mountExports: (token?: string, canExport?: boolean) => void };
    state.mountExports = (token = 'teacher-room-token', canExport = true) => {
      document.getElementById('app')!.replaceChildren(createClassFeedback({ items: [item], rubric, variant: 'screen', room: 'EDUT', token, canExport }));
    };
    state.mountExports();
    return matrix;
  });
  for (const row of renderMatrix) assert.equal(row.buttons, (row.canExport ?? (row.variant !== 'screen')) ? 2 : 0, JSON.stringify(row));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${output}/teacher-screen-exports.png`, fullPage: true });
  for (const [format, label] of [['csv', '⇩ CSV (spreadsheet)'], ['md', '⇩ Markdown (notes)']]) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label, exact: true }).click()]);
    assert.equal(download.suggestedFilename(), `gitzilla-feedback-EDUT.${format}`);
    assert.match(await readFile((await download.path())!, 'utf8'), /Ana/);
  }
  await page.evaluate(() => (window as typeof window & { mountExports: (token: string) => void }).mountExports('old-owner-token'));
  await page.getByRole('button', { name: '⇩ CSV (spreadsheet)', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Export failed: Current owner only' }).waitFor();
  assert.equal(downloads, 2, 'a denied owner export must not fall back to a local download');
  assert.deepEqual(requests, [{ format: 'csv', authorized: true }, { format: 'md', authorized: true }, { format: 'csv', authorized: false }]);
  assert.equal(errors.length, 0, errors.join('\n'));
  await page.screenshot({ path: `${output}/teacher-screen-export-denied.png`, fullPage: true });
  const report = { renderMatrix, csvDownload: 'PASS', markdownDownload: 'PASS', ownerDenialNoFallback: 'PASS', requests, browserErrors: errors };
  await writeFile(`${output}/export-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
