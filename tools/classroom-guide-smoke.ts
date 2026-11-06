/** Real-browser, loopback-only guide acceptance. No model or external account. */
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { createServer } from 'vite';
import { WebSocketServer } from 'ws';
import { RoomServer } from '../server/rooms';
import { handleEduRoute } from '../server/edu-http';
import { profileFromFiles } from '../analysis/graph';
import { playerKitFromProfile, bossKitFromProfile, createMatch } from '../sim';
import { defaultRubric, parseRubric } from '../rubric';
import { GUIDE_FILE_MAX_BYTES, GUIDE_TEXT_MAX_CHARS } from '../shared/classroom-guide';

const out = resolve('.cache/classroom-guide-smoke');
mkdirSync(out, { recursive: true });
let modelCalls = 0;
const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => { if (req.url === '/ws') wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req)); });
const rooms = new RoomServer(wss, {
  analyzeRepo: async slug => profileFromFiles(slug, []), listFallbackRepos: () => [],
  analyzeFiles: (files, name) => profileFromFiles(name, files.map(f => ({ path: f.path, text: f.content }))),
  reviewClassroomSubmission: async () => { modelCalls++; throw new Error('Guide acceptance must never call a model'); }, playerKitFromProfile, bossKitFromProfile, createMatch, defaultRubric, parseRubric,
});
const vite = await createServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
server.on('request', (req, res) => { void (async () => {
  const url = new URL(req.url!, 'http://localhost');
  if (await handleEduRoute(req, res, url, rooms)) return;
  if (url.pathname === '/api/me') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ enabled: false, required: false, user: null })); return; }
  if (url.pathname === '/api/qr') { res.writeHead(204); res.end(); return; }
  if (url.pathname.startsWith('/auth/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ authenticated: false })); return; }
  vite.middlewares(req, res);
})().catch(() => { res.writeHead(500); res.end(); }); });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const room = rooms.createRoom(undefined, 'edu');
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium' });
const errors: string[] = [], checks: string[] = [];
const results: Record<string, unknown> = { passed: false, checks, browserErrors: errors };
let teacher: Page | undefined, student: Page | undefined;
const messages = (page: Page) => page.evaluate(() => (window as any).guideSmoke.received);
const publishCount = (page: Page) => page.evaluate(() => (window as any).guideSmoke.sent.filter((m: any) => m.t === 'classroomPlan').length);
const waitPlan = (page: Page, text: string) => page.waitForFunction(value =>
  (window as any).guideSmoke.received.at(-1)?.state.plan.guideText === value, text);
const pasted = '# Pasted instructions\nUse `print()` with your own name.';
const uploaded = '# Uploaded instructions\nUse `print()` in every step.\n<img src=x onerror="window.guideInjected=1">\n<script>window.guideInjected=2</script>\n[unsafe](javascript:alert(1))\n' + 'LongWord'.repeat(90);
const guideUrl = 'https://example.com/course?lesson=1#instructions';
try {
  const host = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const context of [host, phone]) {
    await context.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/, route => route.abort());
    await context.addInitScript(() => {
      try { localStorage.setItem('gitzilla.onboarding.v1', '1'); localStorage.setItem('kaiju.name', 'Guide Student'); localStorage.setItem('gitzilla.locale', 'en'); } catch {}
      (window as any).guideSmoke = { sent: [], received: [] };
      const Original = window.WebSocket;
      window.WebSocket = class extends Original {
        constructor(url: string, protocols?: string | string[]) {
          super(url, protocols);
          this.addEventListener('message', e => { try { const m = JSON.parse(e.data); if (m.t === 'classroom') (window as any).guideSmoke.received.push(m); } catch {} });
        }
        send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
          if (typeof data === 'string') { try { (window as any).guideSmoke.sent.push(JSON.parse(data)); } catch {} }
          super.send(data);
        }
      } as any;
    });
    context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  }
  teacher = await host.newPage(); student = await phone.newPage();
  await teacher.goto(`${base}/r/${room}?screen=1`);
  await teacher.getByTestId('classroom-plan-editor').waitFor();
  await teacher.getByTestId('classroom-preset-select').selectOption('01-hello');
  await teacher.getByTestId('classroom-preset-load').click();
  await teacher.getByTestId('lesson-guide-url').fill(guideUrl);
  // Exercise an actual browser paste event rather than assigning the draft directly.
  await teacher.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await teacher.evaluate(text => navigator.clipboard.writeText(text), pasted);
  await teacher.getByTestId('lesson-guide-text').focus();
  await teacher.keyboard.press('Control+V');
  await teacher.waitForFunction(text => (document.querySelector('[data-testid="lesson-guide-text"]') as HTMLTextAreaElement)?.value === text, pasted);
  await teacher.getByTestId('classroom-save-plan').click();
  await waitPlan(teacher, pasted);
  await student.goto(`${base}/r/${room}`);
  await waitPlan(student, pasted);
  const notes = student.getByTestId('classroom-guide-notes');
  await notes.locator('summary').click();
  assert.equal(await student.getByTestId('classroom-guide-text').textContent(), pasted.replaceAll('`', ''));
  assert.equal(await student.getByTestId('classroom-guide-link').getAttribute('href'), guideUrl);
  checks.push('Teacher clipboard paste publishes with link; student sees both.');

  const invalidFiles = [
    { name: 'invalid.txt', buffer: Buffer.from('Not Markdown'), error: 'Choose a Markdown' },
    { name: 'binary.md', buffer: Buffer.from([0, 1, 2]), error: 'valid text' },
    { name: 'empty.md', buffer: Buffer.alloc(0), error: 'empty' },
    { name: 'whitespace.md', buffer: Buffer.from(' \n '), error: 'empty' },
    { name: 'oversized.md', buffer: Buffer.alloc(GUIDE_FILE_MAX_BYTES + 1, 'x'), error: 'no larger' },
    { name: 'too-long.md', buffer: Buffer.alloc(GUIDE_TEXT_MAX_CHARS + 1, 'x'), error: 'maximum' },
  ];
  for (const test of invalidFiles) {
    await teacher.getByTestId('lesson-guide-file').setInputFiles({ name: test.name, mimeType: 'text/markdown', buffer: test.buffer });
    await teacher.waitForFunction(error => document.querySelector('[data-testid="lesson-guide-file-error"]')?.textContent?.includes(error), test.error);
    const before = await publishCount(teacher);
    await teacher.getByTestId('classroom-save-plan').click();
    await teacher.waitForTimeout(250); // Detect delayed unintended sends and server state changes.
    assert.equal(await publishCount(teacher), before, `${test.name} must block publish`);
    assert.equal((await messages(student)).at(-1).state.plan.guideText, pasted);
    checks.push(`${test.name}: visible error, publish blocked, student plan unchanged.`);
  }
  await teacher.getByTestId('lesson-guide-editor').screenshot({ path: `${out}/teacher-invalid-file.png` });
  await teacher.getByTestId('lesson-guide-file').setInputFiles({ name: 'instructions.md', mimeType: 'text/markdown', buffer: Buffer.from(uploaded) });
  await teacher.waitForFunction(() => document.querySelector('[data-testid="lesson-guide-file-status"]')?.textContent === 'Markdown instructions loaded.');
  assert.equal(await teacher.getByTestId('lesson-guide-text').inputValue(), uploaded);
  assert.equal(await teacher.getByTestId('lesson-guide-url').inputValue(), guideUrl);
  await teacher.getByTestId('classroom-save-plan').click();
  await waitPlan(student, uploaded);
  await teacher.getByTestId('lesson-guide-editor').screenshot({ path: `${out}/teacher-published.png` });
  checks.push('Local .md replaces pasted text while preserving the link; publish reaches student.');

  const assertStudentGuide = async (label: string) => {
    const content = student!.getByTestId('classroom-guide-text');
    assert.equal(await content.textContent(), uploaded.replaceAll('`', ''));
    assert.equal(await student!.getByTestId('classroom-guide-link').getAttribute('href'), guideUrl);
    assert.equal(await content.locator('img, script, a, iframe').count(), 0);
    assert.equal(await student!.evaluate(() => (window as any).guideInjected), undefined);
    if (await notes.getAttribute('open') === null) await notes.locator('summary').click();
    assert.equal(await content.isVisible(), true);
    checks.push(`${label}: same published content and link; HTML and Markdown URLs inert.`);
  };
  await teacher.getByTestId('classroom-start').click();
  await student.waitForFunction(() => (window as any).guideSmoke.received.at(-1)?.state.phase === 'coding');
  const steps = (await messages(student)).at(-1).state.plan.steps.length;
  assert.ok(steps >= 2, 'Acceptance requires at least two steps');
  for (let index = 0; index < steps; index++) {
    await student.waitForFunction(i => (window as any).guideSmoke.received.at(-1)?.state.stepIndex === i, index);
    await assertStudentGuide(`Step ${index + 1}/${steps}`);
    if (index === 0) {
      for (const width of [390, 360]) {
        await student.setViewportSize({ width, height: 844 });
        await student.getByTestId('classroom-guide-text').scrollIntoViewIfNeeded();
        const geometry: { width: number; documentWidth: number; screenWidth: number; contentWidth: number; contentScrollWidth: number; left: number; right: number } = await student.evaluate(() => {
          const content = document.querySelector('[data-testid="classroom-guide-text"]')!;
          const rect = content.getBoundingClientRect();
          return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, screenWidth: document.querySelector('.classroom-screen')!.scrollWidth,
            contentWidth: content.clientWidth, contentScrollWidth: content.scrollWidth, left: rect.left, right: rect.right };
        });
        assert.ok(geometry.documentWidth <= width && geometry.screenWidth <= width && geometry.contentScrollWidth <= geometry.contentWidth + 1 && geometry.left >= 0 && geometry.right <= width, `Overflow at ${width}px: ${JSON.stringify(geometry)}`);
        await student.screenshot({ path: `${out}/student-${width}.png` });
        results[`mobile${width}`] = geometry;
        checks.push(`${width}px: expanded instructions visible; document, screen and content have no horizontal overflow.`);
      }
    }
    if (index + 1 < steps) {
      await student.getByTestId('classroom-submit-code').click();
      await teacher.waitForFunction(() => !(document.querySelector('[data-testid="classroom-attack"]') as HTMLButtonElement)?.disabled);
      await teacher.getByTestId('classroom-attack').click();
      await teacher.getByTestId('classroom-next').waitFor({ state: 'visible', timeout: 20000 });
      await teacher.getByTestId('classroom-next').click();
    }
  }
  assert.equal(modelCalls, 0);
  assert.deepEqual(errors, []);
  Object.assign(results, { passed: true, steps, modelCalls, phoneWidths: [390, 360], priorFocusedTests: 40 });
} catch (error) {
  results.failure = error instanceof Error ? error.stack : String(error);
  for (const [label, page] of [['teacher', teacher], ['student', student]] as const) {
    await page?.screenshot({ path: `${out}/${label}-failure.png`, fullPage: true }).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  results.modelCalls = modelCalls;
  writeFileSync(`${out}/result.json`, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
  await browser.close(); rooms.close(); await vite.close();
  await new Promise<void>(resolve => wss.close(() => resolve()));
  await new Promise<void>(resolve => server.close(() => resolve()));
}
