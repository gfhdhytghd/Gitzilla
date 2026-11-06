/** Loopback course-upload acceptance: real file extraction, mocked AI transport. */
import http from 'node:http';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { WebSocketServer } from 'ws';
import { RoomServer } from '../server/rooms';
import { handleCourseRoute } from '../server/course-http';
import { createCourseGenerator } from '../server/course-generation';
import { handleEduRoute } from '../server/edu-http';
import { profileFromFiles } from '../analysis/graph';
import { playerKitFromProfile, bossKitFromProfile, createMatch } from '../sim';
import { defaultRubric, parseRubric } from '../rubric';
import { pythonClassroomPlan } from '../shared/classroom-presets';

const out = resolve('.cache/classroom-course-smoke');
mkdirSync(out, { recursive: true });
let modelCalls = 0, failProvider = false;
const sourcePrompts: string[] = [];
const generated = pythonClassroomPlan('01-hello', 'en');
generated.title = 'Generated Python course';
const generator = createCourseGenerator({ apiKey: 'loopback-test-only', deepseekApiKey: '', fetch: async (_url, init) => {
  modelCalls++;
  sourcePrompts.push(JSON.parse(String(init?.body)).contents[0].parts[0].text);
  if (failProvider) return new Response('{}', { status: 503 });
  return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(generated) }] } }] });
} });
const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => { if (req.url === '/ws') wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req)); });
const rooms = new RoomServer(wss, {
  analyzeRepo: async slug => profileFromFiles(slug, []), listFallbackRepos: () => [],
  analyzeFiles: (files, name) => profileFromFiles(name, files.map(f => ({ path: f.path, text: f.content }))),
  playerKitFromProfile, bossKitFromProfile, createMatch, defaultRubric, parseRubric,
});
const vite = await createServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
server.on('request', (req, res) => { void (async () => {
  const url = new URL(req.url!, 'http://localhost');
  if (await handleCourseRoute(req, res, url, rooms, generator)) return;
  if (await handleEduRoute(req, res, url, rooms)) return;
  if (url.pathname === '/api/me') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ enabled: false, required: false, user: null })); return; }
  if (url.pathname === '/api/qr') { res.writeHead(204); res.end(); return; }
  vite.middlewares(req, res);
})().catch(() => { res.writeHead(500); res.end(); }); });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const room = rooms.createRoom(undefined, 'edu');
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium' });
const errors: string[] = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/, route => route.abort());
  await context.addInitScript(() => {
    localStorage.setItem('gitzilla.onboarding.v1', '1'); localStorage.setItem('kaiju.name', 'Teacher'); localStorage.setItem('gitzilla.locale', 'en');
    (window as any).coursePlanMessages = 0;
    const Original = window.WebSocket;
    window.WebSocket = class extends Original {
      send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        if (typeof data === 'string' && JSON.parse(data).t === 'classroomPlan') (window as any).coursePlanMessages++;
        super.send(data);
      }
    } as any;
  });
  const page = await context.newPage();
  let ownerToken = '';
  page.on('request', req => { if (req.url().includes('/api/course/generate?')) ownerToken = req.headers()['x-room-token'] ?? ''; });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/r/${room}?screen=1`);
  await page.getByTestId('course-upload').waitFor();
  await page.getByTestId('lesson-guide-url').fill('https://canvas.example.edu/course');
  await page.getByTestId('lesson-guide-text').fill('Keep this teacher instruction.');
  const initialTitle = await page.getByTestId('lesson-title').inputValue();
  const sources = [
    { name: 'course.md', mimeType: 'text/markdown', buffer: Buffer.from('# Python\nTeach variables with COURSE_MARKDOWN.') },
    { name: 'course.txt', mimeType: 'text/plain', buffer: Buffer.from('Teach print with COURSE_PLAINTEXT.') },
    { name: 'course.pdf', mimeType: 'application/pdf', buffer: readFileSync(new URL('../../ideas-new.pdf', import.meta.url)) },
  ];
  for (const source of sources) {
    await page.getByTestId('course-file').setInputFiles(source);
    await page.getByTestId('course-generate').click();
    await page.getByTestId('course-apply').waitFor();
    if (await page.getByTestId('lesson-title').inputValue() !== initialTitle) throw new Error('Generation replaced the draft before Apply.');
  }
  if (!sourcePrompts[0].includes('COURSE_MARKDOWN') || !sourcePrompts[1].includes('COURSE_PLAINTEXT') || sourcePrompts[2].length < 10000) throw new Error('Document text did not reach the mocked provider.');
  if (await page.evaluate(() => (window as any).coursePlanMessages) !== 0) throw new Error('Generation published a lesson.');
  await page.getByTestId('course-preview-title').fill('Teacher-edited generated lesson');
  await page.getByTestId('course-apply').click();
  if (await page.getByTestId('lesson-title').inputValue() !== 'Teacher-edited generated lesson') throw new Error('Editable preview was not applied.');
  if (await page.getByTestId('lesson-guide-text').inputValue() !== 'Keep this teacher instruction.') throw new Error('Apply lost teacher instructions.');
  if (await page.getByTestId('lesson-guide-url').inputValue() !== 'https://canvas.example.edu/course') throw new Error('Apply lost the guide link.');
  if (await page.evaluate(() => (window as any).coursePlanMessages) !== 0) throw new Error('Apply draft published a lesson.');
  failProvider = true;
  await page.getByTestId('course-file').setInputFiles(sources[0]);
  await page.getByTestId('course-generate').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="course-status"]')?.textContent?.includes('failed'));
  if (await page.getByTestId('lesson-title').inputValue() !== 'Teacher-edited generated lesson') throw new Error('Provider failure changed the draft.');
  const unauthorized = await fetch(`${base}/api/course/generate?room=${room}&filename=course.txt`, { method: 'POST', body: 'Python' });
  if (unauthorized.status !== 401) throw new Error(`Unauthenticated upload returned ${unauthorized.status}.`);
  await page.screenshot({ path: `${out}/teacher-course.png`, fullPage: true });
  await page.getByTestId('classroom-save-plan').click();
  if (await page.evaluate(() => (window as any).coursePlanMessages) !== 1) throw new Error('Explicit Publish did not send exactly one lesson.');
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    if (await page.evaluate(() => document.querySelector('.classroom-screen')!.scrollWidth > innerWidth)) throw new Error(`Teacher overflow at ${width}px`);
  }
  const studentContext = await browser.newContext();
  await studentContext.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/, route => route.abort());
  await studentContext.addInitScript(() => {
    localStorage.setItem('gitzilla.onboarding.v1', '1'); localStorage.setItem('kaiju.name', 'Course student'); localStorage.setItem('gitzilla.locale', 'en');
  });
  const student = await studentContext.newPage();
  await student.goto(`${base}/r/${room}`);
  await student.getByTestId('classroom-screen').waitFor();
  await page.getByTestId('classroom-start').click();
  await page.getByTestId('classroom-plan-editor').waitFor({ state: 'hidden' });
  const started = await fetch(`${base}/api/course/generate?room=${room}&filename=course.txt`, { method: 'POST', headers: { 'X-Room-Token': ownerToken }, body: 'Python' });
  if (started.status !== 409 || modelCalls !== 4) throw new Error('A running lesson allowed course generation.');
  if (errors.length) throw new Error(errors.join('\n'));
  const result = { passed: true, modelCalls, uploads: ['md', 'txt', 'pdf'], realPdfExtraction: true, editablePreview: true, explicitApplyAndPublish: true, teacherGuidancePreserved: true, failureKeepsDraft: true, unauthenticatedStatus: unauthorized.status, startedLessonStatus: started.status, phoneWidths: [390, 360], browserErrors: errors };
  writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  await browser.close(); rooms.close(); await vite.close();
  await new Promise<void>(done => wss.close(() => done())); await new Promise<void>(done => server.close(() => done()));
}
