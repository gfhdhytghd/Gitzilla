// Run against an isolated Vite server: EDU_BASE_URL=http://127.0.0.1:5187 npx tsx client/edu/browser-check.ts
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { normalizeRubric } from '../../server/rubrics.ts';

const base = process.env.EDU_BASE_URL ?? 'http://127.0.0.1:5187';
const output = process.env.EDU_SCREENSHOT_DIR ?? '/tmp/gitzilla-edu-takeover-20261024';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? (existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/chromium') });
const page = await browser.newPage();
// tsx keep-names helpers are captured when Playwright serializes nested test functions.
await page.addInitScript('globalThis.__name = (value) => value;');
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
const shots: unknown[] = [];
try {
  for (const viewport of [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }, { name: 'projector', width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    for (const view of ['rubric&parsed', 'feedback', 'feedback-class&open=0']) {
      await page.goto(`${base}/client/edu/demo.html?view=${view}`);
      await page.locator(view.startsWith('rubric') ? '.rb-status.ok' : '.fb-view').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const geometry = await page.evaluate(() => {
        const head = document.querySelector('.fb-thead'), row = document.querySelector('.fb-tr[role="button"]');
        return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          tableScroll: document.querySelector('.fb-table')?.scrollWidth,
          headerAligned: !head || !row || Array.from(head.children).every((cell, i) => Math.abs(cell.getBoundingClientRect().left - row.children[i].getBoundingClientRect().left) < 1) };
      });
      assert.ok(geometry.scrollWidth <= geometry.width + 1, `${view} ${viewport.name}: page overflow`);
      assert.equal(geometry.headerAligned, true, `${view} ${viewport.name}: headings must align with student scores`);
      const file = `${output}/${view.split('&')[0]}-${viewport.name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      shots.push({ view, viewport: viewport.name, file, ...geometry });
    }
  }
  for (const [view, width, height] of [['feedback-screen', 1920, 1080], ['report', 390, 844], ['report-screen', 1920, 1080], ['phone&t=30&freeze', 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/client/edu/demo.html?view=${view}`);
    await page.locator(view === 'feedback-screen' ? '.fb-class' : view.startsWith('report') ? '.edu-report' : '.demo-phone').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const file = `${output}/${view.split('&')[0]}-extra.png`;
    await page.screenshot({ path: file, fullPage: true });
    shots.push({ view, file });
  }

  // Real DOM editor events -> shared rubric engine -> actual sim stats. Reset keeps stable defaults.
  await page.goto(`${base}/client/edu/demo.html`);
  // Run the actual server normalizer in Node; serve its ACK to the DOM regression below.
  await page.route('**/__edu-test-normalize', async route => {
    const rubric = normalizeRubric(route.request().postDataJSON());
    await route.fulfill({ json: rubric });
  });
  const editorCheck = await page.evaluate(async () => {
    const editorUrl = '/client/edu/rubric.ts', engineUrl = '/rubric/index.ts', simUrl = '/sim/quality.ts', kitsUrl = '/sim/kits.ts';
    const [{ createRubricEditor, createJudgedCard }, engine, { qualityFromRubric }, { playerKitFromProfile }] = await Promise.all([import(editorUrl), import(engineUrl), import(simUrl), import(kitsUrl)]);
    const profile = await (await fetch('/data/fallback/pallets__flask.json')).json();
    const baseKit = playerKitFromProfile(profile, { mode: 'edu' });
    const changes: { field: string; source: string; same: boolean; statsChanged: boolean }[] = [];
    const stats = (kit: { maxHp: number; maxArmor: number; damageMul: number; speed: number; maxEnergy: number }) => JSON.stringify([kit.maxHp, kit.maxArmor, kit.damageMul, kit.speed, kit.maxEnergy]);
    const current = engine.defaultRubric();
    let applied: typeof current | undefined;
    const editor = createRubricEditor({ current, onUse: (rubric: typeof current) => { applied = rubric; } });
    document.body.append(editor.el);
    const button = () => editor.el.querySelector('.btn-primary') as HTMLButtonElement;
    const initiallySame = button().disabled;
    const values = Array.from(editor.el.querySelectorAll('.rb-weight'), (input: Element) => (input as HTMLInputElement).value);
    for (const field of ['weight', 'signal', 'target']) {
      (editor.el.querySelector('.btn-ghost') as HTMLButtonElement).click();
      const input = editor.el.querySelector(field === 'weight' ? '.rb-weight' : field === 'signal' ? '.rb-signal' : '.rb-target input') as HTMLInputElement | HTMLSelectElement;
      input.value = field === 'weight' ? '50' : field === 'signal' ? 'function-length' : '80';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      button().click();
      const rubric = applied!;
      const next = qualityFromRubric(baseKit, { rubric, results: engine.scoreRepo(profile, rubric) });
      const normalized = await (await fetch('/__edu-test-normalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rubric) })).json();
      editor.setCurrent(normalized);
      changes.push({ field, source: rubric.source, same: button().disabled, statsChanged: stats(next) !== stats(baseKit) });
    }
    (editor.el.querySelector('.btn-ghost') as HTMLButtonElement).click();
    const reset = editor.draft();
    const unchanged = qualityFromRubric(baseKit, { rubric: reset, results: engine.scoreRepo(profile, reset) });
    const results = engine.scoreRepo(profile, current), feedback = engine.buildFeedback(profile, current, results, { playerId: 'ana', name: 'Ana', rank: 1, kos: 3, damage: 123, roundWins: 2 });
    const judged = createJudgedCard({ rubric: current, preview: results });
    const estimated = createJudgedCard({ rubric: current, quality: baseKit.quality });
    const empty = createJudgedCard({ rubric: current, preview: [] });
    editor.dispose();
    return { initiallySame, values, changes, resetSource: reset.source, defaultStatsPreserved: stats(unchanged) === stats(baseKit),
      previewScore: judged.querySelector('.rb-judged-score')?.firstChild?.textContent, feedbackScore: String(feedback.rubricScore),
      estimate: estimated.querySelector('.rb-judged-score small')?.textContent, emptyPreview: empty.querySelector('.rb-judged-score')?.firstChild?.textContent };
  });
  assert.equal(editorCheck.initiallySame, true);
  assert.equal(editorCheck.values[0], '25');
  for (const check of editorCheck.changes) { assert.equal(check.source, 'doc', check.field); assert.equal(check.same, true, check.field); assert.equal(check.statsChanged, true, check.field); }
  assert.equal(editorCheck.resetSource, 'default'); assert.equal(editorCheck.defaultStatsPreserved, true);
  assert.equal(editorCheck.previewScore, editorCheck.feedbackScore); assert.equal(editorCheck.estimate, '/100 est.'); assert.equal(editorCheck.emptyPreview, '0');

  await page.goto(`${base}/client/edu/demo.html?view=feedback-class`);
  const row = page.locator('.fb-tr[role="button"]').first();
  await row.focus(); await page.keyboard.press('Enter'); await page.locator('.fb-drill .fb-view').waitFor();
  await page.locator('.fb-th').filter({ hasText: 'student' }).click();
  assert.match(await page.locator('.fb-who').first().innerText(), /ana/);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '⇩ CSV (spreadsheet)', exact: true }).click();
  assert.match((await downloaded).suggestedFilename(), /\.csv$/);
  assert.equal(errors.length, 0, errors.join('\n'));
  const report = { base, shots, editorCheck, browserErrors: errors, classKeyboardAndSort: 'PASS', demoCsvDownload: 'PASS' };
  await writeFile(`${output}/browser-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
