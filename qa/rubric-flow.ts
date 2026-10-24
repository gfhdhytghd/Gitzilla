import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, type BrowserContext, type Page } from 'playwright';
import type { Autopsy, CriterionResult, LobbyState, MatchState, Rubric, StudentFeedback, ServerMsg } from '../shared/types.ts';

// Explicitly authorized isolated production instance. No DEV/live fallback.
const base = new URL(process.env.RUBRIC_FLOW_URL || 'http://localhost:45093');
assert.ok(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname) && base.port === '45093' && !base.username && !base.password, 'Rubric flow is restricted to isolated production port 45093');
const output = `qa/artifacts/rubric-flow-${new Date().toISOString().replace(/[:.]/g, '-')}`;
mkdirSync(output, { recursive: true });
const rubricTitle = 'QA custom rubric 60-25-15';
const rubricText = `# ${rubricTitle}\nTesting (60%): tests target 20%\nREADME (25%): README with setup instructions\nFunction length (15%): functions at most 60 lines\n`;
writeFileSync(`${output}/teacher-rubric.md`, rubricText);
const results: { name: string; status: string; detail?: string }[] = [];
const pageErrors: string[] = [];
const notes: string[] = [];
const network: { kind: string; status: number; path: string; hasTokenQuery: boolean; roomTokenHeader: boolean }[] = [];
const downloads: { format: string; filename: string; bytes: number; status: number }[] = [];
const clients: Client[] = [];
let room: string | undefined; let phase = 'startup'; let failure: string | undefined;
let matchStartedAt: number | undefined; let naturalDuration: number | undefined;
let shuttingDown = false;
type Client = {
  name: string; phone: boolean; teacher: boolean; context: BrowserContext; page: Page;
  id?: string; lobby?: LobbyState; state?: MatchState; autopsy?: Autopsy;
  feedback: StudentFeedback[][]; errors: string[]; snapshots: number; inputs: number; firing: number; moving: number; ack: number;
  preview?: { rubric: Rubric; results: CriterionResult[]; score: number; domScore: number };
};
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function log(message: string) { console.log(`${new Date().toISOString()} ${message}`); }
function evidence() {
  writeFileSync(`${output}/summary.json`, JSON.stringify({ target: base.origin, room, phase, results, failure, pageErrors, notes, network, downloads,
    elapsedFightSeconds: matchStartedAt ? (Date.now() - matchStartedAt) / 1000 : undefined, naturalDuration,
    clients: clients.map(c => ({ name: c.name, teacher: c.teacher, phone: c.phone, id: c.id, snapshots: c.snapshots, inputs: c.inputs, firing: c.firing, moving: c.moving, ack: c.ack,
      preview: c.preview, feedback: c.feedback, protocolErrors: c.errors, status: c.state?.status, t: c.state?.t,
      pvp: c.state?.pvp, ranking: c.autopsy?.ranking })),
    limits: 'Actual production UI, uploads, controls and natural authoritative match; no WS injection, fabricated ending, runtime edits or restart. Phone input uses ordinary touch fallback; desktop uses WASD/J.' }, null, 2));
}
async function waitFor<T>(get: () => T | undefined | false, label: string, ms = 20000): Promise<T> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = get(); if (value) return value;
    await sleep(50);
  }
  throw new Error(`Timeout: ${label}`);
}
async function check(name: string, action: () => Promise<void>) {
  try { await action(); results.push({ name, status: 'PASS' }); log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: 'FAIL', detail: String(error) }); log(`FAIL ${name}: ${error}`); }
  evidence();
}
async function shot(c: Client, name: string) {
  await c.page.screenshot({ path: `${output}/${name}-${c.teacher ? 'teacher' : c.phone ? 'phone' : 'student'}.png`, timeout: 12000 });
}
function weighted(rubric: Rubric, rows: CriterionResult[]) {
  const total = rubric.criteria.reduce((s, c) => s + Math.max(0, c.weight), 0);
  const value = rubric.criteria.reduce((s, c) => s + (total ? Math.max(0, c.weight) / total : 1 / rubric.criteria.length) * Math.max(0, Math.min(1, rows.find(r => r.criterionId === c.id)?.score ?? 0)), 0);
  return Math.round(value * 1000) / 10;
}
function observe(c: Client) {
  c.page.on('pageerror', error => pageErrors.push(`${c.name}: ${error.message}`));
  c.page.on('websocket', socket => {
    if (new URL(socket.url()).pathname !== '/ws') return;
    socket.on('framereceived', frame => {
      const msg = JSON.parse(frame.payload.toString()) as ServerMsg;
      if (msg.t === 'welcome') { c.id = msg.you; c.lobby = msg.lobby; }
      if (msg.t === 'lobby') c.lobby = msg.lobby;
      if (msg.t === 'snapshot') { c.state = msg.state; c.snapshots++; c.ack = msg.ack; }
      if (msg.t === 'autopsy') c.autopsy = msg.result;
      if (msg.t === 'feedback') c.feedback.push(msg.items);
      if (msg.t === 'error' && !shuttingDown) { c.errors.push(msg.message); log(`protocol ${c.name}: ${msg.message}`); }
    });
    socket.on('framesent', frame => {
      const msg = JSON.parse(frame.payload.toString());
      if (msg.t === 'input') { c.inputs++; if (msg.frame.fire) c.firing++; if (Math.hypot(...msg.frame.move) > 0) c.moving++; }
    });
  });
  c.page.on('response', response => {
    const url = new URL(response.url());
    const kind = url.pathname === '/api/rubric/parse' ? 'rubric-upload' : /\/feedback\.(csv|md)$/.test(url.pathname) ? 'export' : undefined;
    if (!kind) return;
    network.push({ kind, status: response.status(), path: url.pathname, hasTokenQuery: [...url.searchParams.keys()].some(k => /token|authorization/i.test(k)), roomTokenHeader: !!response.request().headers()['x-room-token'] });
  });
}
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath()), args: ['--no-sandbox'] });
try {
  for (const [name, teacher, phone] of [['QA Teacher', true, false], ['QA Student One', false, false], ['QA Student Two', false, true]] as const) {
    const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : teacher ? { width: 1440, height: 1000 } : { width: 1280, height: 720 }, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 3 : 1, acceptDownloads: true });
    const c: Client = { name, teacher, phone, context, page: await context.newPage(), feedback: [], errors: [], snapshots: 0, inputs: 0, moving: 0, firing: 0, ack: -1 };
    c.page.setDefaultTimeout(20000); observe(c); clients.push(c);
  }
  const [teacher, desktop, phone] = clients;
  phase = 'teacher classroom creation'; evidence();
  await teacher.page.goto(base.href, { waitUntil: 'domcontentloaded' });
  await teacher.page.getByTestId('create-classroom').click();
  await teacher.page.waitForURL(/\/r\/[A-Z]{4}\?screen=1/);
  room = new URL(teacher.page.url()).pathname.split('/').pop();
  await waitFor(() => teacher.id && teacher.lobby?.mode === 'edu', 'teacher screen welcome');
  assert.equal(teacher.lobby!.ownerId, teacher.id); assert.equal(teacher.lobby!.players.length, 0);
  results.push({ name: 'teacher screen creates classroom and owns it without occupying a student slot', status: 'PASS' });
  phase = 'rubric upload and apply'; evidence();
  await teacher.page.locator('.rb-editor input[type=file]').setInputFiles(`${output}/teacher-rubric.md`);
  await teacher.page.locator('.rb-status.ok').waitFor();
  const title = await teacher.page.getByRole('textbox', { name: 'rubric title', exact: true }).inputValue();
  assert.equal(title, rubricTitle);
  await teacher.page.getByRole('button', { name: /use this rubric/i }).click();
  await waitFor(() => teacher.lobby?.rubric?.title === rubricTitle && teacher.lobby.rubric.source === 'doc' && teacher.lobby.rubric.criteria.length === 3, 'authoritative custom-rubric ACK');
  assert.equal(network.find(n => n.kind === 'rubric-upload')?.status, 200);
  assert.equal(network.find(n => n.kind === 'rubric-upload')?.roomTokenHeader, true);
  results.push({ name: 'real teacher file upload returns 200 and applied rubric is authoritatively ACKed', status: 'PASS' });
  if (await teacher.page.getByRole('button', { name: /use this rubric/i }).isVisible()) {
    notes.push('Known editor.same property-order bug: authoritative rubric is applied, but the editor still offers use this rubric; not used as ACK proof.');
    results.push({ name: 'editor ACK in-use label (known take-edu issue)', status: 'KNOWN_FAIL' });
  }
  await shot(teacher, 'rubric-applied'); evidence();
  phase = 'real students join and select repositories';
  for (const [c, repo] of [[desktop, 'pallets/flask'], [phone, 'golang/example']] as const) {
    await c.page.goto(new URL(`/r/${room}`, base).href, { waitUntil: 'domcontentloaded' });
    await c.page.getByTestId('player-name').fill(c.name); await c.page.getByTestId('join-room').click();
    await c.page.getByTestId('player-repo-input').fill(repo); await c.page.getByTestId('player-repo-submit').click();
    await c.page.locator('[data-testid="player-ready"][data-status="ready"]').waitFor({ timeout: 60000 });
    if (c.phone) await c.page.getByTestId('controls-touch').click();
    await waitFor(() => c.id && c.lobby?.players.find(p => p.id === c.id)?.rubricPreview?.length === 3, `${c.name} exact preview`);
    const rubric = c.lobby!.rubric!; const preview = c.lobby!.players.find(p => p.id === c.id)!.rubricPreview!;
    assert.equal(rubric.title, rubricTitle); assert.equal(rubric.source, 'doc');
    const scoreNode = c.page.locator('.rb-judged-score');
    await scoreNode.waitFor(); const scoreText = await scoreNode.innerText();
    assert.match(scoreText, /\/100 now/); assert.equal(await scoreNode.getAttribute('title'), 'your score right now');
    const score = weighted(rubric, preview); const domScore = parseFloat(scoreText);
    assert.equal(domScore, score);
    c.preview = { rubric, results: preview, score, domScore };
    results.push({ name: `${c.name}: exact weighted preview ${score} and custom-rubric source confirmed`, status: 'PASS' });
    await shot(c, 'exact-preview'); evidence();
  }
  assert.equal(teacher.lobby!.players.length, 2);
  phase = 'natural classroom running';
  await teacher.page.getByTestId('start-match').click();
  await waitFor(() => clients.every(c => c.state?.mode === 'edu'), 'all clients receive classroom snapshots');
  matchStartedAt = Date.now(); evidence(); log(`START room=${room}; teacher + 2 real UI students; custom rubric applied; waiting for natural finish`);
  assert.ok(clients.every(c => c.state!.boss === null && c.state!.players.length === 2));
  await shot(teacher, 'classroom-start'); await shot(phone, 'classroom-start');
  const phoneCDP = await phone.context.newCDPSession(phone.page);
  await desktop.page.keyboard.down('KeyJ');
  let held = ''; let step = 0; let lastLog = 0; let phoneTouch = false;
  const deadline = Date.now() + 330000;
  while (!clients.every(c => !!c.autopsy) && Date.now() < deadline) {
    const direction = ['KeyD', 'KeyS', 'KeyA', 'KeyW'][Math.floor(step / 5) % 4];
    if (direction !== held) { if (held) await desktop.page.keyboard.up(held); await desktop.page.keyboard.down(direction); held = direction; }
    // Ordinary native touch fallback on the portrait phone, no sensor or input-frame injection.
    const canvas = await phone.page.getByTestId('game-canvas').boundingBox();
    if (canvas && phone.state?.status !== 'victory' && phone.state?.status !== 'defeat') {
      const x = canvas.x + canvas.width * 0.42, y = canvas.y + canvas.height * 0.65;
      if (step % 2 === 0) {
        await phoneCDP.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); phoneTouch = true;
        await phoneCDP.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 45, y: y + (Math.floor(step / 4) % 2 ? 25 : -25) }] });
        await sleep(140);
        await phoneCDP.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); phoneTouch = false;
      } else {
        await phone.page.touchscreen.tap(x, y);
        await sleep(330); // Let tap classification finish before the next drag.
      }
    }
    await sleep(350); step++;
    const elapsed = (Date.now() - matchStartedAt) / 1000;
    if (elapsed - lastLog >= 20) {
      lastLog = elapsed; log(`RUN ${Math.floor(elapsed)}s; sim=${teacher.state?.t.toFixed(1)}; round=${teacher.state?.pvp?.round}; phase=${(teacher.state?.pvp as { phase?: string } | undefined)?.phase}; snapshots=${clients.map(c => c.snapshots).join('/')}`);
      evidence();
      if (elapsed >= 60 && elapsed < 85) { await shot(teacher, 'mid-classroom'); await shot(phone, 'mid-classroom'); }
    }
  }
  if (held) await desktop.page.keyboard.up(held); await desktop.page.keyboard.up('KeyJ');
  if (phoneTouch) await phoneCDP.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok(clients.every(c => !!c.autopsy), 'Natural classroom result must arrive within 330 seconds');
  naturalDuration = teacher.autopsy!.duration;
  results.push({ name: `natural classroom end at ${naturalDuration.toFixed(1)} simulation seconds`, status: 'PASS' });
  phase = 'feedback and privacy'; evidence();
  await waitFor(() => clients.every(c => c.feedback.some(items => items.length > 0)), 'feedback delivery', 20000);
  for (const c of clients) await c.page.getByTestId('autopsy').waitFor({ timeout: 15000 });
  for (const c of [desktop, phone]) await check(`${c.name}: only own feedback, preview/feedback weighted score and result equality`, async () => {
    for (const items of c.feedback) { assert.equal(items.length, 1); assert.equal(items[0].playerId, c.id); }
    const f = c.feedback.at(-1)![0]; assert.equal(f.rubricScore, c.preview!.score); assert.equal(weighted(c.preview!.rubric, f.results), c.preview!.score);
    assert.deepEqual(f.results, c.preview!.results);
    const host = c.page.getByTestId('autopsy-feedback'); await host.locator('.fb-view').waitFor();
    assert.equal(await host.locator('.fb-class').count(), 0);
    assert.equal(await host.getByRole('img', { name: `score ${f.rubricScore} out of 100`, exact: true }).count(), 1);
    await shot(c, 'personal-feedback');
  });
  await check('teacher receives and displays the complete class, and no teacher fighter exists', async () => {
    const all = teacher.feedback.at(-1)!; assert.equal(all.length, 2);
    assert.deepEqual(all.map(f => f.playerId).sort(), [desktop.id, phone.id].sort());
    assert.ok(!teacher.autopsy!.players.some(p => p.id === teacher.id));
    await teacher.page.locator('.fb-class').waitFor(); assert.equal(await teacher.page.locator('.fb-table .fb-tr[role=button]').count(), 2);
    await shot(teacher, 'class-feedback');
  });
  phase = 'real export buttons'; evidence();
  for (const [format, name] of [['csv', /CSV \(spreadsheet\)/i], ['md', /Markdown \(notes\)/i]] as const) await check(`teacher ${format.toUpperCase()} real-button download: HTTP 200, owner header and no token query`, async () => {
    const button = teacher.page.getByRole('button', { name });
    assert.ok(await button.isVisible(), 'Teacher screen has no visible export button; direct HTTP/API bypass is forbidden');
    const responsePromise = teacher.page.waitForResponse(r => new URL(r.url()).pathname === `/api/room/${room}/feedback.${format}`);
    const downloadPromise = teacher.page.waitForEvent('download');
    await button.click(); const response = await responsePromise;
    assert.equal(response.status(), 200); assert.equal(new URL(response.url()).search, '');
    assert.ok(response.request().headers()['x-room-token']);
    const download = await downloadPromise; const file = `${output}/teacher-feedback.${format}`; await download.saveAs(file);
    assert.equal(await download.failure(), null);
    const content = readFileSync(file, 'utf8'); assert.ok(content.includes(desktop.name)); assert.ok(content.includes(phone.name));
    downloads.push({ format, filename: download.suggestedFilename(), bytes: Buffer.byteLength(content), status: response.status() });
  });
  await check('no browser exceptions, protocol errors or token query requests', async () => {
    assert.deepEqual(pageErrors, []); assert.ok(clients.every(c => c.errors.length === 0)); assert.ok(network.every(n => !n.hasTokenQuery));
    assert.ok([desktop, phone].every(c => c.moving > 0 && c.firing > 0 && c.ack > 0));
  });
  phase = 'complete'; evidence();
} catch (error) {
  failure = String(error); log(`FAIL phase=${phase}: ${error}`);
  results.push({ name: phase, status: 'FAIL', detail: failure });
  for (const c of clients) await shot(c, 'failure').catch(() => {});
} finally {
  shuttingDown = true; evidence(); await browser.close();
  log(`Evidence: ${output}/summary.json`);
}
if (failure || results.some(result => result.status === 'FAIL')) process.exitCode = 1;
