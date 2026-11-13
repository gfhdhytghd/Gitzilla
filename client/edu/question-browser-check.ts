// Real-browser acceptance for classroom question sets against a running local server (never production):
//   PORT=5291 GITZILLA_OPEN_PLAY=1 ROOMS_FILE=/tmp/x/rooms.json npx tsx server/main.ts
//   QS_BASE_URL=http://127.0.0.1:5291 QS_SHOTS=/tmp/qs-shots npx tsx client/edu/question-browser-check.ts
// Teacher console (Chromium 1440) builds a questions step and a mixed 'immediate' step in the lesson editor; one phone
// student on Chromium (393) and one on WebKit (393) answer; a separate projector window watches. Screenshots of every
// state, 0 horizontal overflow, 0 page errors, and no answer key in any student/projector message before the reveal.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium, webkit, type Browser, type BrowserContext, type Page } from 'playwright';

const base = process.env.QS_BASE_URL ?? 'http://127.0.0.1:5291';
if (/gitzilla\.wilflin\.me/.test(base)) throw new Error('Never run this against production');
const out = process.env.QS_SHOTS ?? '/tmp/qs-shots';
mkdirSync(out, { recursive: true });
const errors: string[] = [], shots: { name: string; overflow: number }[] = [], checks: string[] = [];
const browsers: Browser[] = [];
const notes: string[] = [];

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
    (window as any).qsCheck = { received: [] as unknown[], sent: [] as unknown[] };
    const Original = window.WebSocket;
    window.WebSocket = class extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this.addEventListener('message', e => { try { const m = JSON.parse(String(e.data)); if (m.t === 'classroom' || m.t === 'lobby' || m.t === 'welcome') (window as any).qsCheck.received.push(m); } catch { /* */ } });
      }
      send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        // qsCheck.blockAnswers: answers never leave this page (a dead connection, for the draft-restore check)
        if (typeof data === 'string' && (window as any).qsCheck.blockAnswers && data.includes('"classroomAnswers"')) return;
        if (typeof data === 'string') try { (window as any).qsCheck.sent.push(JSON.parse(data)); } catch { /* */ } super.send(data);
      }
    } as typeof WebSocket;
  }, name);
  ctx.on('page', p => { p.on('pageerror', e => errors.push(`${name}: ${e.message}`)); });
  return ctx;
}
async function shot(page: Page, name: string, full = true) {
  await page.waitForTimeout(250);
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

// strings that only exist in the answer key; none may reach a student or the projector before the reveal
const SECRET = ['Because len counts the items', 'qs-secret-accept', 'Floor division drops'];

let teacher: Page | undefined;
try {
  const res = await fetch(`${base}/api/room?mode=edu`, { method: 'POST' });
  const { room } = await res.json() as { room: string };
  const tctx = await context('chromium', 1440, 1000, 'Teacher');
  teacher = await tctx.newPage();
  // course upload: a generated plan with questions (the AI route is replaced; no provider is called)
  let generateUrl = '', generatePrompt: string | undefined;
  await teacher.route('**/api/course/generate**', route => { generateUrl = route.request().url(); generatePrompt = route.request().headers()['x-course-prompt']; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plan: {
    title: 'Generated quiz', bossName: 'Quiz Kaiju', steps: [{ id: 'gen-1', title: 'Check your reading', instructions: 'Answer from the reading.', durationSec: 600, checks: [], checksWeight: 0,
      rubric: { title: 'Rubric', criteria: [] }, mode: 'questions', questionContext: 'Read this:\n```python\nnums = [1, 2, 3]\n```', questions: [
        { id: 'g1', kind: 'single', prompt: 'Which planet is largest?', options: [{ id: 'a', text: 'Mars' }, { id: 'b', text: 'Jupiter' }], answer: 'b', explain: 'Jupiter is the largest planet.' },
        { id: 'g2', kind: 'blank', prompt: 'Water boils at {{1}} °C at sea level.', blanks: [{ accept: ['100'], numeric: { value: 100, tolerance: 0.5 } }] }] }] } }) }); });
  await teacher.goto(`${base}/r/${room}?screen=1`);
  await tid(teacher, 'classroom-plan-editor').waitFor({ timeout: 30000 });
  await tid(teacher, 'course-file').setInputFiles({ name: 'reading.md', mimeType: 'text/markdown', buffer: Buffer.from('# Reading') });
  // difficulty slider: keyboard (one step right of the default Medium = Hard)
  assert.equal(await tid(teacher, 'course-difficulty-level').textContent(), 'Medium');
  await tid(teacher, 'course-difficulty').focus();
  await teacher.keyboard.press('ArrowRight');
  assert.equal(await tid(teacher, 'course-difficulty-level').textContent(), 'Hard');
  await tid(teacher, 'course-preset-quiz').check();
  const extra = 'Focus on binary search; 8 questions; include one trace-the-code question';
  await tid(teacher, 'course-prompt').fill(extra);
  assert.equal(await tid(teacher, 'course-prompt-count').textContent(), `${extra.length} / 2000`);
  await tid(teacher, 'course-generate').click();
  await tid(teacher, 'course-preview-questions-0').waitFor();
  assert.match(generateUrl, /[?&]difficulty=hard(&|$)/);
  assert.match(generateUrl, /[?&]preset=quiz(&|$)/);
  assert.equal(generatePrompt, encodeURIComponent(extra));
  assert.deepEqual(await teacher.evaluate(() => [localStorage.getItem('kaiju.course.preset'), localStorage.getItem('kaiju.course.difficulty')]), ['quiz', 'hard']);
  checks.push('Course settings: preset=quiz, difficulty=hard and X-Course-Prompt reach the generate request; preset and difficulty are remembered.');
  checks.push('Course difficulty slider: keyboard step Medium → Hard; the request carries difficulty=hard.');
  await tid(teacher, 'course-upload').scrollIntoViewIfNeeded();
  await shot(teacher, 'teacher-course-preview-1440');
  await teacher.setViewportSize({ width: 393, height: 852 });
  await tid(teacher, 'course-settings').scrollIntoViewIfNeeded();
  await shot(teacher, 'teacher-course-settings-393', false);
  await tid(teacher, 'course-difficulty').scrollIntoViewIfNeeded();
  await shot(teacher, 'teacher-course-difficulty-393', false);
  await teacher.setViewportSize({ width: 1440, height: 1000 });
  assert.match(await tid(teacher, 'course-preview-q-0-context').textContent() ?? '', /nums = \[1, 2, 3\]/);
  checks.push('Course upload preview shows generated questions read-only with keys, with the shared code once on top.');

  // ---- lesson editor: step 1 = questions only (after-close), step 2 = code + questions (immediate) ----
  await tid(teacher, 'step-title-0').fill('Python warm-up quiz');
  await tid(teacher, 'step-mode-0').selectOption('questions');
  await tid(teacher, 'step-question-context-0').fill('All questions use this code:\n```python\nnums = [1, 2, 3]\nx = 7 // 2\n```');
  await tid(teacher, 'step-question-context-preview-0').waitFor();
  await tid(teacher, 'question-prompt-0-0').fill('What does `len(nums)` in the code above return?');
  await tid(teacher, 'option-text-0-0-0').fill('2');
  await tid(teacher, 'option-text-0-0-1').fill('3');
  await tid(teacher, 'option-text-0-0-2').fill('4');
  await tid(teacher, 'option-correct-0-0-1').check();
  await tid(teacher, 'question-explain-0-0').fill('Because len counts the items in the list.');
  await tid(teacher, 'step-add-question-multi-0').click();
  await tid(teacher, 'question-prompt-0-1').fill('Which of these are Python keywords?');
  for (const [j, text] of ['def', 'print', 'class'].entries()) await tid(teacher, `option-text-0-1-${j}`).fill(text);
  await tid(teacher, 'option-add-0-1').click();
  await tid(teacher, 'option-text-0-1-3').fill('lambda');
  await tid(teacher, 'option-correct-0-1-2').check();
  await tid(teacher, 'option-correct-0-1-3').check();
  await tid(teacher, 'question-points-0-1').fill('2');
  await tid(teacher, 'step-add-question-blank-0').click();
  await tid(teacher, 'question-prompt-0-2').fill('```python\nx = 7 // 2\n```\n`x` is {{1}} and its type is {{2}}.');
  await tid(teacher, 'blank-accept-0-2-0').fill('3');
  await tid(teacher, 'blank-numeric-0-2-0').check();
  await tid(teacher, 'blank-accept-0-2-1').fill('int\nqs-secret-accept');
  await tid(teacher, 'question-explain-0-2').fill('Floor division drops the remainder; the result is an int.');
  // invalid state blocks publishing: an empty option
  await tid(teacher, 'option-text-0-0-2').fill('');
  await teacher.waitForFunction(() => /option 3 is empty/.test(document.querySelector('[data-testid="step-question-errors-0"]')?.textContent ?? ''));
  await tid(teacher, 'option-text-0-0-2').fill('4');
  await teacher.waitForFunction(() => !document.querySelector('[data-testid="step-question-errors-0"]')?.textContent);
  checks.push('Editor validation shows and clears question errors.');
  await shot(teacher, 'teacher-editor-questions-1440');

  await tid(teacher, 'step-editor-1').locator('summary').first().click();
  await tid(teacher, 'step-mode-1').selectOption('mixed');
  await tid(teacher, 'step-feedback-1').selectOption('immediate');
  await tid(teacher, 'step-questions-weight-1').fill('40');
  await tid(teacher, 'question-prompt-1-0').fill('What is `2 + 2`?');
  for (const [j, text] of ['3', '4', '5'].entries()) await tid(teacher, `option-text-1-0-${j}`).fill(text);
  await tid(teacher, 'option-correct-1-0-1').check();
  await tid(teacher, 'question-attempts-1-0').fill('2');
  await shot(teacher, 'teacher-editor-mixed-1440');
  await tid(teacher, 'classroom-preview').click();
  await tid(teacher, 'classroom-preview-questions').waitFor();
  await shot(teacher, 'teacher-preview-1440', false);
  await tid(teacher, 'classroom-preview-close').click();
  // step 3: a 30-question exam that keeps its answers private; 'never' must switch off instant feedback
  await tid(teacher, 'step-editor-2').locator('summary').first().click();
  await tid(teacher, 'step-title-2').fill('Exam: 30 questions');
  await tid(teacher, 'step-mode-2').selectOption('questions');
  await tid(teacher, 'step-feedback-2').selectOption('immediate');
  await tid(teacher, 'step-reveal-2').selectOption('never');
  assert.equal(await tid(teacher, 'step-feedback-2').inputValue(), 'after-close', "'never' switches feedback to after-close");
  assert.equal(await tid(teacher, 'step-feedback-2').evaluate(e => (e.querySelector('option[value="immediate"]') as HTMLOptionElement).disabled), true, 'immediate is disabled');
  assert.equal(await tid(teacher, 'step-feedback-note-2').isVisible(), true);
  await shot(teacher, 'teacher-editor-never-1440');
  checks.push("Editor: choosing 'never' switches instant feedback off and disables it with a reason.");
  await tid(teacher, 'question-prompt-2-0').fill('Exam question 1: pick Option A.');
  for (let i = 1; i < 30; i++) {
    await tid(teacher, 'step-add-question-single-2').click();
    await tid(teacher, `question-prompt-2-${i}`).fill(`Exam question ${i + 1}: pick Option ${'ABC'[i % 3]}.`);
    await tid(teacher, `option-correct-2-${i}-${i % 3}`).check();
  }
  assert.equal((await tid(teacher, 'step-add-question-single-2').isDisabled()) || (await teacher.locator('[data-testid^="question-editor-2-"]').count()) === 30, true);
  await tid(teacher, 'classroom-save-plan').click();
  await teacher.waitForFunction(() => [...(window as any).qsCheck.received].reverse().find((m: any) => m.t === 'classroom')?.state.plan.steps[0].mode === 'questions', null, { timeout: 10000 });
  const published = await lastClassroom(teacher);
  assert.equal(published.state.plan.steps[0].questions.length, 3);
  assert.match(published.state.plan.steps[0].questionContext ?? '', /nums = \[1, 2, 3\]/, 'the server keeps questionContext');
  assert.equal(published.state.plan.steps[1].mode, 'mixed');
  assert.equal(published.state.plan.steps[1].questionsWeight, 40);
  checks.push('Lesson editor publishes a questions step and a mixed immediate step; the server keeps them.');

  // ---- phone editor layout ----
  // a second teacher console would take over the seat: check the phone layout of the same console by resizing it
  await teacher.setViewportSize({ width: 393, height: 852 });
  await tid(teacher, 'step-editor-0').scrollIntoViewIfNeeded();
  await shot(teacher, 'teacher-editor-393');
  await teacher.setViewportSize({ width: 1440, height: 1000 });

  // ---- students and projector ----
  const anaCtx = await context('chromium', 393, 852, 'Ana');
  let ana = await anaCtx.newPage();
  const ben = await (await context('webkit', 393, 852, 'Ben')).newPage();
  const projector = await (await context('chromium', 1440, 900, 'Projector')).newPage();
  for (const p of [ana, ben]) {
    await p.goto(`${base}/r/${room}`);
    const join = tid(p, 'join-room');
    await Promise.race([join.waitFor({ timeout: 20000 }).then(async () => { await tid(p, 'player-name').fill(p === ana ? 'Ana' : 'Ben'); await join.click(); }), tid(p, 'classroom-screen').waitFor({ timeout: 20000 })]);
    await tid(p, 'classroom-screen').waitFor({ timeout: 20000 });
  }
  await projector.goto(`${base}/r/${room}?screen=1&view=projector`);
  await tid(projector, 'classroom-screen').waitFor({ timeout: 20000 });
  await teacher.waitForFunction(() => !(document.querySelector('[data-testid="classroom-start"]') as HTMLButtonElement | null)?.disabled, null, { timeout: 20000 });
  await tid(teacher, 'classroom-start').click();
  for (const p of [ana, ben]) await tid(p, 'question-card-q1').waitFor({ timeout: 15000 });
  for (const p of [ana, ben]) {
    assert.equal(await p.locator('[data-testid="question-context"]').count(), 1, 'shared code shows once');
    assert.match(await tid(p, 'question-context').textContent() ?? '', /nums = \[1, 2, 3\]/);
  }
  checks.push('Shared code (questionContext) shows once above the questions on both phones.');
  await shot(ana, 'student-questions-empty-393');

  // Ana: q1 right, q2 partial (def + class, misses lambda), q3 both blanks right
  await tid(ana, 'question-option-q1-b').check({ force: true });
  await tid(ana, 'question-option-q2-a').check({ force: true });
  await tid(ana, 'question-option-q2-c').check({ force: true });
  await tid(ana, 'question-blank-q3-1').fill('3');
  await tid(ana, 'question-blank-q3-2').fill('int');
  await tid(ana, 'question-blank-q3-2').blur();
  await ana.waitForFunction(() => document.querySelector('[data-testid="question-save-state"]')?.textContent === '✓ All saved', null, { timeout: 15000 });
  assert.equal(await tid(ana, 'question-count').textContent(), '3 of 3 answered');
  assert.equal(await tid(ana, 'question-blank-q3-1').getAttribute('inputmode'), 'decimal', 'numeric blank uses the decimal keypad');
  await shot(ana, 'student-questions-saved-393');
  checks.push('Chromium phone: autosave reaches the server and shows ✓ All saved; numeric blank has inputmode=decimal.');
  // Ben (WebKit): q1 wrong, q3 half, presses Submit answers
  await tid(ben, 'question-option-q1-a').check({ force: true });
  await tid(ben, 'question-blank-q3-1').fill('3.0');
  await tid(ben, 'question-blank-q3-2').fill('Int');
  await tid(ben, 'question-submit').click();
  await ben.waitForFunction(() => /saved/i.test(document.querySelector('[data-testid="question-save-state"]')?.textContent ?? ''), null, { timeout: 15000 });
  await shot(ben, 'student-questions-webkit-393');
  checks.push('Second phone (WebKit when it launches): Submit answers saves.');

  // projector during coding: per-question answered counts only
  await projector.waitForFunction(() => /answered/.test(document.querySelector('[data-testid="question-board"]')?.textContent ?? ''), null, { timeout: 15000 });
  const boardText = await tid(projector, 'question-board').textContent();
  assert.ok(!/correct/i.test(boardText ?? ''), 'projector shows no correctness during coding');
  assert.match(await tid(projector, 'question-board-context').textContent() ?? '', /nums = \[1, 2, 3\]/, 'projector shows the shared code');
  assert.ok(!/\[code\]/.test(await tid(projector, 'question-board').textContent() ?? ''), 'question-board: no [code] placeholder in labels');
  await shot(projector, 'projector-coding-1440');
  // teacher live bars: hidden while projecting is possible (no projector window in this browser) → Show details
  await tid(teacher, 'question-live').waitFor();
  await shot(teacher, 'teacher-live-hidden-1440');
  await tid(teacher, 'question-live-reveal').click();
  await teacher.waitForFunction(() => /% correct/.test(document.querySelector('[data-testid="question-live"]')?.textContent ?? ''));
  const liveOrder = await teacher.locator('[data-testid^="question-live-q"]').evaluateAll(rows => rows.map(r => (r as HTMLElement).dataset.q));
  assert.equal(liveOrder[0], 'q2', 'weakest question first (q2: 0 of 1 correct; q1 1 of 2; q3 2 of 2)');
  assert.ok(!/\[code\]/.test(await tid(teacher, 'question-live').textContent() ?? ''), 'question-live: no [code] placeholder in labels');
  await shot(teacher, 'teacher-live-1440');
  // per-student answers in the review panel
  await teacher.locator('[data-testid^="classroom-row-"]').filter({ hasText: 'Ben' }).click();
  const reveal = tid(teacher, 'classroom-reveal');
  if (await reveal.isVisible().catch(() => false)) await reveal.click();
  await tid(teacher, 'classroom-student-answers').waitFor();
  await tid(teacher, 'classroom-feedback').screenshot({ path: `${out}/teacher-student-answers-1440.png` });
  checks.push('Teacher console: live bars (weakest first) and per-student answers.');

  // secrecy: nothing a student or the projector received so far holds the key
  for (const [who, p] of [['Ana', ana], ['Ben', ben], ['Projector', projector]] as const) {
    const raw = JSON.stringify(await p.evaluate(() => (window as any).qsCheck.received));
    for (const s of SECRET) assert.ok(!raw.includes(s), `${who} received "${s}" before the reveal`);
    assert.ok(!/"answer":"b"|"accept"|"explain"/.test(raw), `${who} received an answer key before the reveal`);
  }
  checks.push('No answer key, accept list or explanation reached students or the projector before the reveal.');

  // ---- attack → reveal ----
  await teacher.waitForFunction(() => !(document.querySelector('[data-testid="classroom-attack"]') as HTMLButtonElement | null)?.disabled);
  await tid(teacher, 'classroom-attack').click();
  await tid(teacher, 'classroom-next').waitFor({ state: 'visible', timeout: 30000 });
  await tid(ana, 'question-summary').waitFor({ timeout: 15000 });
  await ana.waitForFunction(() => document.querySelector('[data-testid="question-review-q1"]')?.classList.contains('qs-correct'), null, { timeout: 15000 });
  assert.ok(/Because len counts/.test(await tid(ana, 'question-set').textContent() ?? ''), 'reveal shows the explanation');
  assert.equal(await ana.locator('[data-testid="question-context"]').count(), 1, 'reveal keeps the shared code once');
  await shot(ana, 'student-reveal-393');
  await tid(ben, 'question-summary').waitFor({ timeout: 15000 });
  for (const p of [ana, ben]) assert.ok(await tid(p, 'question-review-q3').evaluate(e => e.classList.contains('qs-correct')), 'blank: "3" / "3.0" (numeric) and "int" / "Int" (case-insensitive) are correct');
  checks.push('Numeric blank accepts 3 and 3.0; text blank is case-insensitive.');
  await shot(ben, 'student-reveal-webkit-393');
  await projector.waitForFunction(() => /How the class answered/.test(document.querySelector('[data-testid="question-board"]')?.textContent ?? ''), null, { timeout: 15000 });
  assert.ok(!/\[code\]/.test(await tid(projector, 'question-board').textContent() ?? ''), 'question-board: no [code] placeholder in labels');
  await shot(projector, 'projector-after-raid-1440');
  assert.equal(await projector.locator('[data-testid="question-board-context"]').count(), 1, 'projector keeps the shared code after the attack');
  checks.push('Reveal: students see answer, key, correctness, explanation; projector shows frozen distributions; the shared code stays on top.');

  // ---- step 2: mixed, immediate ----
  await tid(teacher, 'classroom-next').click();
  for (const p of [ana, ben]) { await tid(p, 'classroom-parts').waitFor({ timeout: 15000 }); await tid(p, 'classroom-part-questions').click(); await tid(p, 'question-card-q1').waitFor(); }
  await shot(ana, 'student-mixed-tabs-393');
  await tid(ana, 'question-option-q1-a').check({ force: true });
  await tid(ana, 'question-check-q1').click();
  await ana.waitForFunction(() => /1 attempt left/.test(document.querySelector('[data-testid="question-feedback-q1"]')?.textContent ?? ''), null, { timeout: 15000 });
  await shot(ana, 'student-immediate-wrong-393');
  await tid(ana, 'question-option-q1-b').check({ force: true });
  await ana.waitForTimeout(1200);   // the server accepts one save per second
  await tid(ana, 'question-check-q1').click();
  await ana.waitForFunction(() => document.querySelector('[data-testid="question-card-q1"]')?.classList.contains('qs-locked'), null, { timeout: 15000 });
  await shot(ana, 'student-immediate-correct-393');
  await tid(ben, 'question-option-q1-a').check({ force: true });
  await tid(ben, 'question-check-q1').click();
  await ben.waitForFunction(() => /1 attempt left/.test(document.querySelector('[data-testid="question-feedback-q1"]')?.textContent ?? ''), null, { timeout: 15000 });
  await tid(ben, 'question-option-q1-c').check({ force: true });
  await ben.waitForTimeout(1200);
  await tid(ben, 'question-check-q1').click();
  await ben.waitForFunction(() => !(document.querySelector('[data-testid="question-key-q1"]') as HTMLElement | null)?.hidden, null, { timeout: 15000 });
  await shot(ben, 'student-immediate-locked-webkit-393');
  await tid(ben, 'classroom-part-code').click();
  await shot(ben, 'student-mixed-code-tab-webkit-393');
  checks.push('Immediate feedback: attempts left, lock on correct, key after running out (two phones).');
  await shot(teacher, 'teacher-mixed-live-1440');
  await shot(projector, 'projector-mixed-coding-1440');

  // complete the lesson: reveal on the last step
  await tid(teacher, 'classroom-attack').click();
  await tid(teacher, 'classroom-next').waitFor({ state: 'visible', timeout: 30000 });
  await shot(ana, 'student-mixed-feedback-393');

  // ---- step 3: paused phase, a 30-question set on a phone, a draft restored after a lost connection, 'never' ----
  await tid(teacher, 'classroom-next').click();
  await tid(ana, 'question-card-q30').waitFor({ timeout: 15000 });
  for (let i = 1; i <= 5; i++) await tid(ana, `question-option-q${i}-${'abc'[(i - 1) % 3]}`).check({ force: true });
  await ana.waitForFunction(() => document.querySelector('[data-testid="question-save-state"]')?.textContent === '✓ All saved', null, { timeout: 15000 });
  assert.equal(await tid(ana, 'question-count').textContent(), '5 of 30 answered');
  await shot(ana, 'student-30-questions-393');
  checks.push('A 30-question set renders and saves on a 393 px phone.');
  await tid(teacher, 'classroom-pause').click();
  await ana.waitForFunction(() => /paused/.test(document.querySelector('[data-testid="question-foot"]')?.textContent ?? ''), null, { timeout: 15000 });
  assert.equal(await tid(ana, 'question-option-q6-a').isDisabled(), true, 'paused: inputs are disabled');
  assert.equal(await tid(ana, 'question-submit').isDisabled(), true);
  await shot(ana, 'student-paused-393', false);
  await tid(teacher, 'classroom-resume').click();
  await ana.waitForFunction(() => !(document.querySelector('[data-testid="question-option-q6-a"]') as HTMLInputElement | null)?.disabled, null, { timeout: 15000 });
  checks.push('Paused phase: answers kept, inputs and Submit disabled, then enabled again on resume.');
  // the connection drops (answers never leave the page), the student answers q6 and q7, then reopens the page
  await ana.evaluate(() => { (window as any).qsCheck.blockAnswers = true; });
  await tid(ana, 'question-option-q6-a').check({ force: true });
  await tid(ana, 'question-option-q7-b').check({ force: true });
  await ana.waitForFunction(() => /Not saved yet/.test(document.querySelector('[data-testid="question-save-state"]')?.textContent ?? ''), null, { timeout: 15000 });
  await shot(ana, 'student-not-saved-393', false);
  await ana.close();
  ana = await anaCtx.newPage();
  await ana.goto(`${base}/r/${room}`);
  await tid(ana, 'question-card-q7').waitFor({ timeout: 20000 });
  assert.equal(await tid(ana, 'question-option-q7-b').isChecked(), true, 'the draft restores q7');
  await ana.waitForFunction(() => document.querySelector('[data-testid="question-save-state"]')?.textContent === '✓ All saved', null, { timeout: 15000 });
  const echo = await lastClassroom(ana);
  assert.deepEqual(echo.reports[Object.keys(echo.reports)[0]].answers.q7.answer, { choice: 'b' }, 'the restored draft reached the server');
  assert.equal(await tid(ana, 'question-count').textContent(), '7 of 30 answered');
  await shot(ana, 'student-draft-restored-393', false);
  checks.push('Reconnect: unsaved answers come back from the local draft after reopening the page and are saved.');
  await tid(ben, 'question-option-q1-b').check({ force: true });
  await ben.waitForFunction(() => document.querySelector('[data-testid="question-save-state"]')?.textContent === '✓ All saved', null, { timeout: 15000 });
  await tid(teacher, 'classroom-attack').click();
  await tid(teacher, 'classroom-next').waitFor({ state: 'visible', timeout: 30000 });
  await tid(ana, 'question-summary').waitFor({ timeout: 15000 });
  assert.match(await tid(ana, 'question-summary').textContent() ?? '', /private/);
  assert.equal(await ana.locator('[data-testid^="question-review-"]').count(), 0, "'never': no answer cards");
  await shot(ana, 'student-never-reveal-393');
  await projector.waitForFunction(() => /private/.test(document.querySelector('[data-testid="question-board"]')?.textContent ?? ''), null, { timeout: 15000 });
  assert.equal(await projector.locator('[data-testid="question-board"] .ql-key').count(), 0, "'never': the projector marks no key");
  await shot(projector, 'projector-never-1440');
  for (const [who, p] of [['Ana', ana], ['Ben', ben], ['Projector', projector]] as const) {
    const m = await lastClassroom(p);
    const qs = m.state.plan.steps[2].questions as Record<string, unknown>[];
    assert.ok(qs.every(q => !('answer' in q) && !('explain' in q)), `${who}: 'never' step keys stay hidden after the attack`);
    const res = Object.values((m.reports ?? {}) as Record<string, { answers?: Record<string, Record<string, unknown>> }>).flatMap(r => Object.values(r.answers ?? {}));
    assert.ok(res.every(r => !('key' in r) && !('correct' in r)), `${who}: 'never' results carry no key or correctness`);
  }
  checks.push("'never' reveal: students see only their score; no key or correctness reaches students or the projector.");

  assert.deepEqual(errors, []);
  writeFileSync(`${out}/result.json`, JSON.stringify({ passed: true, room, checks, notes, shots, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, checks, notes, shots: shots.length, maxOverflow: Math.max(...shots.map(s => s.overflow)), errors }, null, 2));
} catch (error) {
  await teacher?.screenshot({ path: `${out}/teacher-failure.png`, fullPage: true }).catch(() => {});
  writeFileSync(`${out}/result.json`, JSON.stringify({ passed: false, failure: String((error as Error).stack ?? error), checks, shots, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: false, failure: String((error as Error).stack ?? error), checks, errors }, null, 2));
  process.exitCode = 1;
} finally {
  for (const b of browsers) await b.close();
}
