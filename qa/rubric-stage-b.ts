import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import type { Autopsy, LobbyState, ServerMsg, StudentFeedback } from '../shared/types.ts';
import { assertFeedbackExport, type ExpectedStudent } from './rubric-export-check.ts';

const origin = 'http://localhost:45093';
const assetOrigin = 'http://localhost:46099';
const compose = process.env.RUBRIC_STAGE_B_COMPOSITION === '1';
const stageAPath = process.env.RUBRIC_STAGE_A_SUMMARY || 'qa/artifacts/rubric-flow-2026-10-24T21-21-50-317Z/summary.json';
const stageA = JSON.parse(readFileSync(stageAPath, 'utf8'));
const room: string = process.env.RUBRIC_FLOW_ROOM || stageA.room;
assert.match(room, /^[A-Z]{4}$/);
const expected: ExpectedStudent[] = stageA.clients.filter((c: { teacher: boolean }) => !c.teacher)
  .map((c: { id: string; preview: { score: number }; feedback: StudentFeedback[][] }) => ({ id: c.id, name: c.feedback.at(-1)![0].name, repo: c.feedback.at(-1)![0].repo, score: c.preview.score }));
const output = `qa/artifacts/rubric-stage-b-${new Date().toISOString().replace(/[:.]/g, '-')}`;
mkdirSync(output, { recursive: true, mode: 0o700 });
const results: { name: string; status: string; detail?: string }[] = [];
const assets: { path: string; source: string; status: number; sha256: string }[] = [];
const api: { path: string; status: number; ownerHeader: boolean; hasTokenQuery: boolean; origin: string }[] = [];
const downloads: { format: string; filename: string; bytes: number; sha256: string }[] = [];
const pageErrors: string[] = []; const protocolErrors: string[] = [];
const transport: Record<string, unknown>[] = [];
let id: string | undefined; let lobby: LobbyState | undefined; let autopsy: Autopsy | undefined;
let feedback: StudentFeedback[] = []; let welcomes = 0; let useFinalAssets = false; let stateSaved = false;
let phase = 'fresh teacher screen restore'; let failure: string | undefined;
const log = (s: string) => console.log(`${new Date().toISOString()} ${s}`);
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function until(fn: () => boolean, label: string, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (fn()) return; await sleep(50); }
  throw new Error(`Timeout: ${label}`);
}
function evidence() {
  writeFileSync(`${output}/summary.json`, JSON.stringify({ phase, room, apiOrigin: origin, assetOrigin: compose ? assetOrigin : origin, assetComposition: compose, deployed: false,
    server: 'unchanged StageA 45093', frontend: compose ? 'final built StageB assets 46099 via HTML/static-only browser routing' : 'ordinary direct 45093 final dist installed by coordinator; no routing',
    stageAEvidence: stageAPath, originalNaturalDuration: stageA.naturalDuration, expected, results, assets, api, downloads,
    id, owner: lobby?.ownerId === id, mode: lobby?.mode, phaseOnServer: lobby?.phase, autopsyDuration: autopsy?.duration,
    feedback: feedback.map(f => ({ id: f.playerId, name: f.name, score: f.rubricScore })), stateSaved, pageErrors, protocolErrors, transport, failure,
    browserPermissions: compose ? ['local-network-access for http://localhost:45093'] : [],
    limits: 'Real restored natural room, actual server WS/API and real export buttons. Direct mode uses an ordinary fresh browser/context with no routes or permission overrides. No WS interception, API fulfillment, fabricated results, original StageA teacher-token read or runtime edits.' }, null, 2));
}
const browser = await chromium.launch({ headless: true, executablePath: existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath(), args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true,
  ...(process.env.RUBRIC_TEACHER_STATE ? { storageState: process.env.RUBRIC_TEACHER_STATE } : {}) });
if (compose) await context.grantPermissions(['local-network-access'], { origin });
const page = await context.newPage(); page.setDefaultTimeout(15000);
page.on('pageerror', error => pageErrors.push(error.message));
page.on('requestfailed', request => transport.push({ kind: 'requestfailed', path: new URL(request.url()).pathname, error: request.failure()?.errorText }));
page.on('console', message => { if (message.type() === 'error') transport.push({ kind: 'console-error', text: message.text() }); });
page.on('websocket', socket => {
  transport.push({ kind: 'websocket', url: socket.url() });
  assert.equal(new URL(socket.url()).origin, 'ws://localhost:45093');
  socket.on('socketerror', error => transport.push({ kind: 'socketerror', error }));
  socket.on('close', () => transport.push({ kind: 'socketclosed' }));
  socket.on('framesent', frame => {
    const msg = JSON.parse(frame.payload.toString());
    if (msg.t === 'hello') transport.push({ kind: 'hello', role: msg.role, resumePresent: !!msg.resume });
  });
  socket.on('framereceived', frame => {
    const msg = JSON.parse(frame.payload.toString()) as ServerMsg;
    if (msg.t === 'welcome') { id = msg.you; lobby = msg.lobby; welcomes++; }
    if (msg.t === 'lobby') lobby = msg.lobby;
    if (msg.t === 'autopsy') autopsy = msg.result;
    if (msg.t === 'feedback') feedback = msg.items;
    if (msg.t === 'error') protocolErrors.push(msg.message);
  });
});
page.on('response', response => {
  const url = new URL(response.url());
  if (!compose && url.origin === origin && (url.pathname.startsWith('/assets/') || response.request().resourceType() === 'document')) {
    void response.body().then(body => assets.push({ path: url.pathname, source: origin, status: response.status(), sha256: createHash('sha256').update(body).digest('hex') })).catch(() => {});
  }
  if (!url.pathname.startsWith('/api/')) return;
  api.push({ origin: url.origin, path: url.pathname, status: response.status(), ownerHeader: !!response.request().headers()['x-room-token'], hasTokenQuery: [...url.searchParams.keys()].some(k => /token|authorization/i.test(k)) });
});
if (compose) await page.route('**/*', async route => {
  const req = route.request(); const url = new URL(req.url());
  const staticType = ['document', 'script', 'stylesheet', 'font', 'image'].includes(req.resourceType());
  if (!useFinalAssets || url.origin !== origin || req.method() !== 'GET' || !staticType || /^\/(api|auth|ws)(\/|$)/.test(url.pathname)) return route.continue();
  const response = await route.fetch({ url: new URL(url.pathname + url.search, assetOrigin).href, maxRedirects: 0 });
  const body = await response.body();
  assets.push({ path: url.pathname, source: assetOrigin, status: response.status(), sha256: createHash('sha256').update(body).digest('hex') });
  await route.fulfill({ response, body });
});
try {
  // Fresh normal UI hello; no previous teacher token is read or printed.
  await page.goto(`${origin}/r/${room}?screen=1`, { waitUntil: 'domcontentloaded' });
  await until(() => !!id && !!autopsy && feedback.length === 2, 'new teacher screen receives existing natural autopsy');
  assert.equal(lobby?.ownerId, id); assert.equal(lobby?.phase, 'autopsy');
  const newTeacherId = id;
  assert.equal(autopsy!.duration, stageA.naturalDuration);
  results.push({ name: 'fresh teacher UI owns and restores original natural KXEN autopsy without replaying a match', status: 'PASS' });
  await page.screenshot({ path: `${output}/stage-a-restored-teacher.png` });
  writeFileSync(`${output}/teacher-session.json`, JSON.stringify(await context.storageState()), { mode: 0o600 }); chmodSync(`${output}/teacher-session.json`, 0o600); stateSaved = true;
  phase = compose ? 'final frontend and unchanged server composition' : 'direct final frontend and unchanged server'; useFinalAssets = compose;
  const before = welcomes; autopsy = undefined; feedback = [];
  await page.reload({ waitUntil: 'domcontentloaded' });
  await until(() => welcomes > before && !!autopsy && feedback.length === 2, 'final frontend restores actual server result');
  assert.equal(id, newTeacherId); assert.equal(lobby?.ownerId, id); assert.equal(autopsy!.duration, stageA.naturalDuration);
  assert.deepEqual(feedback.map(f => ({ id: f.playerId, name: f.name, repo: f.repo, score: f.rubricScore })).sort((a, b) => a.id.localeCompare(b.id)), [...expected].sort((a, b) => a.id.localeCompare(b.id)));
  await page.locator('.fb-class').waitFor();
  if (compose) {
    assert.ok(assets.some(a => a.path.startsWith('/r/')) && assets.some(a => /\.js$/.test(a.path)));
    assert.ok(assets.every(a => a.status === 200));
  }
  results.push({ name: `${compose ? 'composed' : 'ordinary direct'} final frontend displays unchanged natural StageA class scores and teacher owner`, status: 'PASS' });
  await page.getByTestId('autopsy-feedback').screenshot({ path: `${output}/final-class-feedback-teacher.png` }); evidence();
  phase = 'real CSV and Markdown export';
  for (const [format, name] of [['csv', /CSV \(spreadsheet\)/i], ['md', /Markdown \(notes\)/i]] as const) {
    const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === `/api/room/${room}/feedback.${format}`);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name }).click();
    const response = await responsePromise;
    assert.equal(new URL(response.url()).origin, origin); assert.equal(response.status(), 200);
    assert.equal(new URL(response.url()).search, ''); assert.ok(response.request().headers()['x-room-token']);
    const download = await downloadPromise;
    const path = `${output}/teacher-feedback.${format}`; await download.saveAs(path);
    assert.equal(await download.failure(), null);
    const content = readFileSync(path, 'utf8');
    assertFeedbackExport(format, content, expected);
    downloads.push({ format, filename: download.suggestedFilename(), bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') });
    results.push({ name: `${format.toUpperCase()} actual teacher button → original server 200 → browser download, owner header, no token query, both students/scores`, status: 'PASS' });
    log(`PASS ${format.toUpperCase()} real export; HTTP 200; no token query`); evidence();
  }
  assert.deepEqual(pageErrors, []); assert.deepEqual(protocolErrors, []);
  assert.ok(api.every(r => r.origin === origin && !r.hasTokenQuery));
  writeFileSync(`${output}/teacher-session.json`, JSON.stringify(await context.storageState()), { mode: 0o600 }); chmodSync(`${output}/teacher-session.json`, 0o600);
  await page.screenshot({ path: `${output}/final-teacher.png` });
  phase = 'PASS; teacher context held'; evidence(); log(`PASS StageB ${compose ? 'composition' : 'ordinary direct'}; evidence ${output}/summary.json; session saved privately, no token printed`);
} catch (error) {
  failure = String(error); results.push({ name: phase, status: 'FAIL', detail: failure });
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  writeFileSync(`${output}/teacher-session.json`, JSON.stringify(await context.storageState()), { mode: 0o600 }); chmodSync(`${output}/teacher-session.json`, 0o600); stateSaved = true;
  phase = 'FAIL; teacher context held'; evidence(); log(`FAIL ${failure}; evidence ${output}/summary.json`);
}
// Optional explicit hold; normal repeat runs clean up their own context.
if (process.env.RUBRIC_STAGE_B_HOLD === '1') {
  log(`HOLD context; create ${output}/release.json to release it`);
  while (!existsSync(`${output}/release.json`)) await sleep(1000);
}
await browser.close();
phase = failure ? 'FAIL; context released' : 'PASS; context released'; evidence();
if (failure) process.exitCode = 1;
