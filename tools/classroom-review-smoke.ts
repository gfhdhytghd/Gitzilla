/** Loopback-only acceptance. Python executes in the real sandbox; model calls are mocked. */
import http from 'node:http';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { WebSocketServer } from 'ws';
import { RoomServer } from '../server/rooms';
import { createClassroomReviewer } from '../server/classroom-review';
import { handleEduRoute } from '../server/edu-http';
import { profileFromFiles } from '../analysis/graph';
import { playerKitFromProfile, bossKitFromProfile, createMatch } from '../sim';
import { defaultRubric, parseRubric } from '../rubric';
import { doctestAvailable } from '../server/py-sandbox';

if (!doctestAvailable()) throw new Error('Real doctest runner unavailable; acceptance cannot run.');
const out = resolve(process.env.CLASSROOM_REVIEW_SMOKE_OUT || '.cache/classroom-review-smoke');
mkdirSync(out, { recursive: true });
let modelCalls = 0;
const reviewer = createClassroomReviewer({ apiKey: 'local-test-only', deepseekApiKey: '', fetch: async () => {
  modelCalls++;
  return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({
    items: [{ id: 0, verdict: 'pass', reason: 'The submitted file has the expected name.' }, { id: 1, verdict: 'fail', reason: 'The required docstring is absent.' }],
    summary: 'Add a docstring.', concerns: ['TEACHER_ONLY_SMOKE'],
  }) }] } }] }));
} });
const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => { if (req.url === '/ws') wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req)); });
const rooms = new RoomServer(wss, {
  analyzeRepo: async slug => profileFromFiles(slug, []), listFallbackRepos: () => [],
  analyzeFiles: (files, name) => profileFromFiles(name, files.map(f => ({ path: f.path, text: f.content }))),
  reviewClassroomSubmission: reviewer, playerKitFromProfile, bossKitFromProfile, createMatch, defaultRubric, parseRubric,
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
const errors: string[] = [];
try {
  const host = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const context of [host, phone]) {
    await context.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/, route => route.abort());
    await context.addInitScript(() => {
      try { localStorage.setItem('gitzilla.onboarding.v1', '1'); localStorage.setItem('kaiju.name', 'Ada'); localStorage.setItem('gitzilla.locale', 'en'); } catch { /* New blank tabs have an opaque origin. */ }
      (window as any).classroomMessages = [];
      const Original = window.WebSocket;
      window.WebSocket = class extends Original {
        constructor(url: string, protocols?: string | string[]) { super(url, protocols); this.addEventListener('message', e => { try { const m = JSON.parse(e.data); if (m.t === 'classroom') (window as any).classroomMessages.push(m); } catch {} }); }
      } as any;
    });
    context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  }
  const teacher = await host.newPage(), student = await phone.newPage();
  await teacher.goto(`${base}/r/${room}?screen=1`);
  await teacher.getByTestId('classroom-plan-editor').waitFor();
  await teacher.getByTestId('classroom-preset-select').selectOption('01-hello');
  await teacher.getByTestId('classroom-preset-use').click();
  await teacher.getByTestId('lesson-review-mode').selectOption('review');
  await teacher.getByTestId('lesson-review-checklist').fill('The file has the expected name.\nEvery function has a docstring.');
  await teacher.getByTestId('step-checks-0').fill('doctest: python/01_hello.py :: 1 + 1 => 2');
  await teacher.getByTestId('step-check-weight-0').fill('100');
  await teacher.getByTestId('classroom-save-plan').click();
  await student.goto(`${base}/r/${room}`);
  await teacher.getByTestId('classroom-start').click();
  await student.getByTestId('classroom-submit-code').click();
  await student.waitForFunction(() => document.querySelector('[data-testid="classroom-own-score"]')?.textContent === '75 /100', undefined, { timeout: 30000 });
  const studentMessages = await student.evaluate(() => (window as any).classroomMessages);
  if (JSON.stringify(studentMessages).includes('TEACHER_ONLY_SMOKE')) throw new Error('Teacher concerns reached student WebSocket.');
  if (!(await student.getByTestId('classroom-ai-review').innerText()).includes('50/100')) throw new Error('Review breakdown missing.');
  const ownReport = Object.values(studentMessages.at(-1).reports)[0] as any;
  if (!ownReport.checks[0].passed || ownReport.checks[0].detail !== '1/1 examples passed') throw new Error('Real doctest did not pass.');
  await teacher.locator('.cr-row-pick').first().click();
  if (await teacher.getByTestId('classroom-reveal').isVisible().catch(() => false)) await teacher.getByTestId('classroom-reveal').click();
  const reviewAboveBoss = await teacher.evaluate(() => {
    const review = document.querySelector('[data-testid="classroom-feedback"]')!.getBoundingClientRect();
    const boss = document.querySelector('[data-testid="classroom-boss"]')!.getBoundingClientRect();
    return review.bottom <= boss.top;
  });
  if (!reviewAboveBoss) throw new Error('Teacher submission review must appear above the boss.');
  await teacher.getByTestId('classroom-review-accept-ai').click();
  await teacher.waitForFunction(() => document.querySelector('.cr-teacher-note')?.textContent?.includes('Accepted AI review:'));
  await teacher.getByTestId('classroom-review-score').fill('20');
  await teacher.getByTestId('classroom-review-note').fill('Teacher checked the exact submitted version.');
  await teacher.getByTestId('classroom-review-submit').click();
  await student.waitForFunction(() => document.querySelector('[data-testid="classroom-own-score"]')?.textContent === '60 /100');
  await teacher.waitForFunction(() => document.querySelector('[data-testid="classroom-own-score"]')?.textContent === '60 /100');
  await teacher.screenshot({ path: `${out}/teacher-review.png`, fullPage: true });
  for (const width of [390, 360]) {
    await student.setViewportSize({ width, height: 844 });
    if (await student.evaluate(() => document.querySelector('.classroom-screen')!.scrollWidth > innerWidth)) throw new Error(`Phone overflow at ${width}px`);
    await student.getByTestId('classroom-ai-review').scrollIntoViewIfNeeded();
    await student.screenshot({ path: `${out}/student-${width}.png` });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const result = { passed: true, modelCalls, realDoctest: true, automatic: 100, aiReview: 50, initialFinal: 75, teacherReview: 20, teacherFinal: 60, teacherConcernsPrivate: true, reviewAboveBoss, phoneWidths: [390, 360], browserErrors: errors };
  if (modelCalls !== 1) throw new Error(`Unexpected model call count: ${modelCalls}`);
  writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result));
} finally {
  await browser.close(); rooms.close(); await vite.close();
  await new Promise<void>(resolve => wss.close(() => resolve())); await new Promise<void>(resolve => server.close(() => resolve()));
}
