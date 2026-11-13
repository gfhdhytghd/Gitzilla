// Real-browser check for starter-file authoring in the lesson editor, against a running local server (never production):
//   PORT=5291 GITZILLA_OPEN_PLAY=1 ROOMS_FILE=/tmp/x/rooms.json npx tsx server/main.ts
//   QS_BASE_URL=http://127.0.0.1:5291 QS_SHOTS=/tmp/se-shots npx tsx client/edu/starter-browser-check.ts
// Teacher (Chromium 1440, plus a 393 capture) edits an AI-generated starter, writes a mixed step's starter files with
// keyboard indentation, sees a path error block Publish, previews as a student, publishes; a phone student (393) gets
// the in-app editor. 0 horizontal overflow and 0 page errors.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium, webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import { defaultClassroomPlan } from '../../shared/classroom-defaults';

const base = process.env.QS_BASE_URL ?? 'http://127.0.0.1:5291';
if (/gitzilla\.wilflin\.me/.test(base)) throw new Error('Never run this against production');
const out = process.env.QS_SHOTS ?? '/tmp/se-shots';
mkdirSync(out, { recursive: true });
const errors: string[] = [], shots: { name: string; overflow: number }[] = [], checks: string[] = [];
const browsers: Browser[] = [];
const notes: string[] = [];
const snapshots: Record<string, string> = {};

async function context(engine: 'chromium' | 'webkit', width: number, height: number, name: string): Promise<BrowserContext> {
  const b = engine === 'chromium'
    ? await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? (existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/chromium') })
    : await webkit.launch({ headless: true }).catch(async error => {
      // WebKit needs its bundled system libraries (libicu 74 on Linux); record it and keep the run going on Chromium
      notes.push(`WebKit could not launch here, ${name} ran on Chromium instead: ${String((error as Error).message).match(/error while loading[^\n]*/)?.[0] ?? (error as Error).message.split('\n')[0]}`);
      return chromium.launch({ headless: true, executablePath: existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/chromium' });
    });
  browsers.push(b);
  const ctx = await b.newContext({ viewport: { width, height }, ...(width < 800 ? { isMobile: engine === 'chromium', hasTouch: true } : {}) });
  await ctx.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/, r => r.abort());
  await ctx.addInitScript((who: string) => {
    try { localStorage.setItem('gitzilla.onboarding.v1', '1'); localStorage.setItem('kaiju.name', who); localStorage.setItem('gitzilla.locale', 'en'); } catch { /* */ }
    (window as any).qsCheck = { received: [] as unknown[], sent: [] as unknown[], deltas: 0 };
    const Original = window.WebSocket;
    window.WebSocket = class extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        // record what the app sees: classroom deltas merged per socket like client/app/net.ts (shared/classroom-delta.ts)
        let prev: any;
        this.addEventListener('message', e => { try {
          let m = JSON.parse(String(e.data));
          if (m.t === 'classroom') {
            (window as any).qsCheck.deltas += m.delta ? 1 : 0;
            if (m.delta) {
              const { delta, ...next } = m; const reports = { ...prev.reports, ...m.reports };
              for (const id of delta.removedReports) delete reports[id];
              m = { ...next, state: { ...m.state, ...(delta.planUnchanged ? { plan: prev.state.plan } : {}), ...(delta.roundsUnchanged ? { rounds: prev.state.rounds } : {}) }, reports };
            }
            prev = m;
          }
          if (m.t === 'classroom' || m.t === 'lobby' || m.t === 'welcome' || m.t === 'error') (window as any).qsCheck.received.push(m);
        } catch { /* */ } });
      }
      send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        // qsCheck.blockAnswers: answers never leave this page (a dead connection, for the draft-restore check)
        if (typeof data === 'string' && (window as any).qsCheck.blockAnswers && data.includes('"classroomAnswers"')) return;
        // QS_DELTA=0: this page does not opt in to classroom deltas (full snapshots), to compare both paths
        if (typeof data === 'string' && (window as any).qsNoDelta && data.includes('"t":"hello"')) data = data.replace(',"classroomDelta":true', '');
        if (typeof data === 'string') try { (window as any).qsCheck.sent.push(JSON.parse(data)); } catch { /* */ } super.send(data);
      }
    } as typeof WebSocket;
  }, name);
  if (process.env.QS_DELTA === '0') await ctx.addInitScript(() => { (window as any).qsNoDelta = true; });
  ctx.on('page', p => { p.on('pageerror', e => errors.push(`${name}: ${e.message}`)); });
  return ctx;
}
async function shot(page: Page, name: string, full = true) {
  await page.waitForTimeout(250);
  // toasts are transient: keep them out of the layout captures (the error toast is asserted separately)
  if (!name.includes('error')) await page.evaluate(() => document.querySelectorAll('.toast').forEach(n => n.remove()));
  const overflow = await page.evaluate(() => {
    const root = document.querySelector('.classroom-screen') as HTMLElement | null;
    return Math.max(document.documentElement.scrollWidth - innerWidth, root ? root.scrollWidth - root.clientWidth : 0);
  });
  shots.push({ name, overflow });
  if (overflow > 1) console.log(name, await page.evaluate(`(() => { const W = innerWidth; return [...document.querySelectorAll('.classroom-screen *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > W + 1 && r.width > 0; }).slice(0, 14).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right) + ' ' + (e.getAttribute('data-testid') ?? '')); })()`));
  assert.ok(overflow <= 1, `${name}: horizontal overflow ${overflow}px`);
  const size = page.viewportSize()!;
  if (full) {
    // the classroom scrolls inside .classroom-screen: grow the viewport to its content for a full capture
    const tall = await page.evaluate(() => Math.max(document.querySelector('.classroom-screen')?.scrollHeight ?? 0, document.documentElement.scrollHeight));
    await page.setViewportSize({ width: size.width, height: Math.min(9000, Math.max(size.height, tall)) });
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: `${out}/${name}.png` });
  if (full) await page.setViewportSize(size);
}
const tid = (page: Page, id: string) => page.getByTestId(id);
const lastClassroom = (page: Page) => page.evaluate(() => [...(window as any).qsCheck.received].reverse().find((m: any) => m.t === 'classroom'));


let teacher: Page | undefined;
try {
  const res = await fetch(`${base}/api/room?mode=edu`, { method: 'POST' });
  const { room } = await res.json() as { room: string };
  const tctx = await context('chromium', 1440, 1000, 'Teacher');
  teacher = await tctx.newPage();
  // an AI-generated course with a starter file (the AI route is replaced; no provider is called)
  await teacher.route('**/api/course/generate**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plan: {
    title: 'Generated course', bossName: 'Starter Kaiju', steps: [{ id: 'gen-1', title: 'Say hello', instructions: 'Make the program greet the class.', durationSec: 600,
      checks: [{ id: 'check-0', kind: 'file', label: 'hello file', path: 'python/01_hello.py' }], checksWeight: 50, rubric: defaultClassroomPlan().steps[0].rubric,
      language: 'python', starter: [{ path: 'python/01_hello.py', content: 'print("TODO")\n' }] }] } }) }));
  await teacher.goto(`${base}/r/${room}?screen=1`);
  await tid(teacher, 'classroom-plan-editor').waitFor({ timeout: 30000 });
  await tid(teacher, 'course-file').setInputFiles({ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Notes') });
  await tid(teacher, 'course-generate').click();
  await tid(teacher, 'course-apply').click();
  // AI starter: editable in the lesson editor
  await tid(teacher, 'step-starter-content-0-0').waitFor();
  assert.equal(await tid(teacher, 'step-starter-content-0-0').inputValue(), 'print("TODO")\n');
  await tid(teacher, 'step-starter-content-0-0').fill('print("Hello, class!")\n');
  assert.ok(await tid(teacher, 'step-language-python-0').isChecked());
  checks.push('AI-generated starter file shows in the lesson editor and stays editable.');

  // a teacher-written mixed step (code + questions) gets its own starter files
  await tid(teacher, 'classroom-add-step').click();
  await tid(teacher, 'step-editor-1').evaluate(e => { (e as HTMLDetailsElement).open = true; });
  await tid(teacher, 'step-title-1').fill('Add two numbers');
  await tid(teacher, 'step-mode-1').selectOption('mixed');
  await tid(teacher, 'question-prompt-1-0').fill('What does add(2, 3) return?');
  assert.match(await tid(teacher, 'step-starter-mode-1').textContent() ?? '', /GitHub repository/);
  await tid(teacher, 'step-starter-add-1').click();
  assert.equal(await tid(teacher, 'step-starter-path-1-0').inputValue(), 'main.py');
  assert.ok(await tid(teacher, 'step-language-python-1').isChecked(), 'the first .py file turns Python on');
  await tid(teacher, 'step-starter-path-1-0').fill('src/app.py');
  const code = tid(teacher, 'step-starter-content-1-0');
  await code.fill('');
  await code.focus();
  await teacher.keyboard.type('def add(a, b):');
  await teacher.keyboard.press('Enter');                 // keeps the indent (+4 after a colon)
  await teacher.keyboard.type('return a + b');
  await teacher.keyboard.press('Enter');
  await teacher.keyboard.press('Shift+Tab');             // outdent
  await teacher.keyboard.press('Tab');                   // indent again
  await teacher.keyboard.press('Shift+Tab');
  await teacher.keyboard.type('print(add(2, 3))');
  assert.equal(await code.inputValue(), 'def add(a, b):\n    return a + b\nprint(add(2, 3))');
  await teacher.keyboard.press('Escape');
  await teacher.keyboard.press('Tab');                   // Esc, then Tab leaves the code box
  assert.notEqual(await teacher.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'step-starter-content-1-0');
  checks.push('Code box: Enter keeps the indent, Tab / Shift+Tab indent and outdent, Esc then Tab leaves it.');
  // second file: an unsafe path blocks Publish, then a rename fixes it
  await tid(teacher, 'step-starter-add-1').click();
  await tid(teacher, 'step-starter-path-1-1').fill('../secret.py');
  assert.match(await tid(teacher, 'step-starter-path-error-1-1').textContent() ?? '', /relative path/);
  const sentBefore = await teacher.evaluate(() => (window as any).qsCheck.sent.filter((m: any) => m.t === 'classroomPlan').length);
  await tid(teacher, 'classroom-save-plan').click();
  await teacher.waitForTimeout(400);
  assert.equal(await teacher.evaluate(() => (window as any).qsCheck.sent.filter((m: any) => m.t === 'classroomPlan').length), sentBefore, 'an unsafe path blocks Publish');
  assert.match(await teacher.locator('.toast.err').last().textContent() ?? '', /Fix the errors marked in red/);
  await shot(teacher, 'starter-editor-error-1440');
  await tid(teacher, 'step-starter-path-1-1').fill('lib/util.py');
  await tid(teacher, 'step-starter-content-1-1').fill('def double(x):\n    return 2 * x\n');
  assert.equal(await tid(teacher, 'step-starter-errors-1').textContent(), '');
  assert.match(await tid(teacher, 'step-starter-usage-1').textContent() ?? '', /^2 \/ 20 files · /);
  checks.push('Starter paths are checked like the server (relative, unique); an error blocks Publish and clears after a rename.');
  // move the authored mixed step first, so students open it
  await tid(teacher, 'step-up-1').click();
  await tid(teacher, 'step-starter-content-0-0').waitFor();
  assert.equal(await tid(teacher, 'step-starter-path-0-0').inputValue(), 'src/app.py');
  await tid(teacher, 'step-starter-editor-0').scrollIntoViewIfNeeded();
  await shot(teacher, 'starter-editor-1440');
  await teacher.setViewportSize({ width: 393, height: 852 });
  await tid(teacher, 'step-starter-editor-0').scrollIntoViewIfNeeded();
  await shot(teacher, 'starter-editor-393', false);
  await teacher.setViewportSize({ width: 1440, height: 1000 });

  // Preview as a student: the in-app editor with the starter files
  await tid(teacher, 'classroom-preview').click();
  const overlay = tid(teacher, 'classroom-preview-overlay');
  await overlay.waitFor();
  await overlay.getByTestId('code-editor-input').waitFor();
  assert.match(await overlay.getByTestId('code-editor-input').inputValue(), /def add\(a, b\)/);
  assert.match(await overlay.textContent() ?? "", /app\.py/);
  assert.match(await overlay.textContent() ?? "", /util\.py/);
  assert.ok(!/no starter files/i.test(await overlay.textContent() ?? ''));
  await shot(teacher, 'starter-preview-1440', false);
  await tid(teacher, 'classroom-preview-next').click();
  await teacher.waitForFunction(() => /Hello, class!/.test((document.querySelector('[data-testid="classroom-preview-overlay"] [data-testid="code-editor-input"]') as HTMLTextAreaElement | null)?.value ?? ''));
  await tid(teacher, 'classroom-preview-close').click();
  checks.push('Preview as a student shows the in-app editor with the authored files (and the edited AI starter on step 2).');

  // Publish: the server keeps both starters and the language
  await tid(teacher, 'classroom-save-plan').click();
  await teacher.waitForFunction(() => [...(window as any).qsCheck.received].reverse().find((m: any) => m.t === 'classroom')?.state?.plan?.steps?.[0]?.starter?.length === 2, null, { timeout: 15000 })
    .catch(async e => { throw new Error(`${(e as Error).message}; errors: ${await teacher!.evaluate(() => JSON.stringify((window as any).qsCheck.received.filter((m: any) => m.t === 'error')))}; visible alerts: ${await teacher!.evaluate(() => [...document.querySelectorAll('.cr-form-error, .toast')].filter(n => n.textContent && (n as HTMLElement).offsetParent).map(n => n.textContent).join(' | '))}`); });
  const published = (await lastClassroom(teacher)).state.plan;
  assert.deepEqual(published.steps[0].starter.map((f: { path: string }) => f.path), ['src/app.py', 'lib/util.py']);
  assert.equal(published.steps[0].language, 'python');
  assert.equal(published.steps[0].mode, 'mixed');
  assert.equal(published.steps[1].starter[0].content, 'print("Hello, class!")\n');
  checks.push('Publish: the server keeps the authored starter files, the language and the edited AI starter.');

  // a phone student gets the in-app editor on the authored mixed step
  const sctx = await context('chromium', 393, 852, 'Ana');
  const ana = await sctx.newPage();
  await ana.goto(`${base}/r/${room}`);
  const join = tid(ana, 'join-room');
  await Promise.race([join.waitFor({ timeout: 20000 }).then(async () => { await tid(ana, 'player-name').fill('Ana'); await join.click(); }), tid(ana, 'classroom-screen').waitFor({ timeout: 20000 })]);
  await tid(ana, 'classroom-screen').waitFor({ timeout: 20000 });
  await teacher.waitForFunction(() => !(document.querySelector('[data-testid="classroom-start"]') as HTMLButtonElement | null)?.disabled, null, { timeout: 20000 });
  await tid(teacher, 'classroom-start').click();
  await tid(ana, 'classroom-inapp').waitFor({ timeout: 15000 });
  const tab = tid(ana, 'classroom-part-code');
  if (await tab.isVisible()) await tab.click();
  await ana.getByTestId('classroom-inapp').getByTestId('code-editor-input').waitFor();
  assert.match(await ana.getByTestId('classroom-inapp').getByTestId('code-editor-input').inputValue(), /def add\(a, b\)/);
  await shot(ana, 'starter-student-inapp-393');
  checks.push('Phone student (393): the authored mixed step opens the in-app editor with the starter code.');
  // the student and projector views count from classCounts (compact-state ready): progress text still reads right
  assert.match(await ana.locator('body').textContent() ?? '', /of 1 submitted/);
  checks.push('Student progress line reads from class counts.');
  // compact non-teacher state from the 200-student server: the projector gets no rows, the student only their own
  const pctx = await context('chromium', 1440, 900, 'Projector');
  const projector = await pctx.newPage();
  await projector.goto(`${base}/r/${room}?screen=1&view=projector`);
  await tid(projector, 'classroom-screen').waitFor({ timeout: 20000 });
  await projector.waitForFunction(() => /of 1 submitted/.test(document.querySelector('[data-testid="classroom-progress"]')?.textContent ?? ''), null, { timeout: 15000 });
  const pState = (await lastClassroom(projector)).state, sState = (await lastClassroom(ana)).state, tState = (await lastClassroom(teacher)).state;
  if (pState.summary) {
    assert.equal(pState.rows.length, 0, 'projector: no rows in the compact state');
    assert.equal(sState.rows.length, 1, 'student: own row only');
    assert.equal(pState.summary.roster, 1);
    assert.match(await tid(projector, 'classroom-roster-summary').textContent() ?? '', /1 of 1 students connected · 0 submitted/);
    checks.push('Compact state (server summary): projector has no rows and shows the anonymous count; the student holds only their own row; progress reads "0 of 1 submitted".');
  } else notes.push('The server sent no summary: the compact-state check was skipped.');
  assert.ok(tState.rows.length >= 1, 'teacher keeps the roster');
  await shot(projector, 'starter-projector-compact-1440', false);
  // visible text of each view, clock digits removed, for the with/without-delta comparison (snapshots in the result)
  const text = (p: Page) => p.evaluate(() => (document.querySelector('[data-testid="classroom-screen"]') as HTMLElement).innerText.replace(/\d+:\d\d/g, 'T').replace(/\b[A-Z]{4}\b/g, 'ROOM'));
  snapshots.teacher = await text(teacher); snapshots.student = await text(ana); snapshots.projector = await text(projector);
  // classroom deltas: negotiated by default (merged before the UI), off with QS_DELTA=0; the same checks pass either way
  const deltaFrames = await teacher!.evaluate(() => (window as any).qsCheck.deltas as number);
  if (process.env.QS_DELTA === '0') assert.equal(deltaFrames, 0, 'QS_DELTA=0: no delta frames'); else assert.ok(deltaFrames > 0, 'the teacher received classroom deltas');
  checks.push(`Classroom deltas ${process.env.QS_DELTA === '0' ? 'off (full snapshots)' : `on (${deltaFrames} delta frames to the teacher, merged before the UI)`}.`);
} catch (error) {
  errors.push(`failure: ${(error as Error).stack ?? error}`);
  if (teacher) await teacher.screenshot({ path: `${out}/starter-failure-teacher.png` }).catch(() => {});
} finally {
  const result = { checks, notes, snapshots, shots: shots.length, maxOverflow: Math.max(0, ...shots.map(s => s.overflow)), errors };
  writeFileSync(`${out}/starter-result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  for (const b of browsers) await b.close().catch(() => {});
  if (errors.length) process.exitCode = 1;
}
