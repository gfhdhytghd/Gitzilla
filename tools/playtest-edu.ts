import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import type { ClassroomState, ClassroomReport } from '../shared/classroom';
import type { ClientMsg, ServerMsg } from '../shared/types';
import type { Options } from './playtest';
import { completeLandingOnboarding } from './onboarding';

const UI_TIMEOUT = 15_000;
const sleep = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
interface ClassroomClient {
  name: string;
  role: 'teacher' | 'student' | 'projector';
  phone: boolean;
  page: Page;
  id?: string;
  state?: ClassroomState;
  reports: Record<string, ClassroomReport>;
  phases: string[];
  sent: Record<string, number>;
  controls: string[];
  snapshots: number;
}

/** Read-only observations: one completed attack must spend only part of the lesson's boss budget. */
export function assertClassroomRound(state: ClassroomState, students: number): void {
  if (state.phase !== 'feedback' || state.stepIndex !== 0 || state.rounds.length !== 1) {
    throw new Error('Expected the first round feedback, not a timed smoke or completed lesson');
  }
  const round = state.rounds[0];
  if (!(Number.isFinite(round.bossBefore) && Number.isFinite(round.bossAfter)
    && round.bossBefore > round.bossAfter && round.bossAfter > 0 && state.bossHp === round.bossAfter)) {
    throw new Error('Round 1 must decrease boss HP and leave it above zero');
  }
  if (round.attacks.length !== students || state.rows.length !== students
    || !state.rows.every(row => row.status === 'submitted')) {
    throw new Error('Every requested student must submit and participate in round 1');
  }
}

/** Current cooperative classroom. All commands originate from real UI; WS listeners only observe. */
export async function playtestClassroom(options: Options, baseURL: string): Promise<number> {
  const output = resolve('docs/shots', `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-edu`);
  mkdirSync(output, { recursive: true });
  const clients: ClassroomClient[] = [];
  const screenshots: string[] = [];
  const errors = { page: 0, console: 0, websocket: 0, failedRequests: 0 };
  const checks: Record<string, boolean> = { publishedPreset: false, editorSubmissions: false,
    roundDebriefVisible: false, bossDamagedAndAlive: false };
  const log = (kind: string, message: string) => {
    const line = `${new Date().toISOString()} [${kind}] ${message}`;
    appendFileSync(join(output, 'playtest.log'), `${line}\n`);
    console.log(line);
  };
  let browser: Browser | undefined;
  let shuttingDown = false, interrupted = false;
  let phase = 'startup', room: string | undefined, failure: string | undefined;
  let exitCode = 2;
  const stop = () => { interrupted = true; void browser?.close().catch(() => {}); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const wait = async (condition: () => boolean, label: string, timeout = UI_TIMEOUT) => {
    const deadline = Date.now() + timeout;
    while (!condition() && Date.now() < deadline && !interrupted) await sleep(50);
    if (!condition()) throw new Error(`Timed out: ${label} during ${phase}`);
  };
  const shot = async (client: ClassroomClient, label: string) => {
    const file = `${label}-${client.role}${client.role === 'student' ? `-${client.name}` : ''}${client.phone ? '-phone' : ''}.png`;
    await client.page.screenshot({ path: join(output, file), timeout: 8000 });
    screenshots.push(file);
  };
  const attach = (page: Page, role: ClassroomClient['role'], name: string, phone = false) => {
    const client: ClassroomClient = { page, role, name, phone, reports: {}, phases: [], sent: {}, controls: [], snapshots: 0 };
    clients.push(client);
    page.on('pageerror', error => { errors.page++; log('pageerror', `${name}: ${error.message}`); });
    page.on('console', message => {
      if (message.type() === 'error') { errors.console++; log('console:error', `${name}: ${message.text()}`); }
    });
    page.on('requestfailed', request => {
      if (!shuttingDown) { errors.failedRequests++; log('requestfailed', `${name}: ${request.url()} ${request.failure()?.errorText}`); }
    });
    page.on('websocket', socket => {
      if (new URL(socket.url()).pathname !== '/ws') return;
      socket.on('socketerror', error => { if (!shuttingDown) { errors.websocket++; log('ws:error', `${name}: ${error}`); } });
      socket.on('framesent', frame => {
        let msg: ClientMsg;
        try { msg = JSON.parse(frame.payload.toString()) as ClientMsg; } catch { return; }
        client.sent[msg.t] = (client.sent[msg.t] ?? 0) + 1;
        if (msg.t === 'classroomControl') client.controls.push(msg.action);
        // Do not serialize hello credentials or editor contents.
      });
      socket.on('framereceived', frame => {
        let msg: ServerMsg;
        try { msg = JSON.parse(frame.payload.toString()) as ServerMsg; } catch { return; }
        if (msg.t === 'welcome') { client.id = msg.you; client.state = msg.lobby.classroom; }
        if (msg.t === 'lobby') client.state = msg.lobby.classroom;
        if (msg.t === 'classroom') {
          client.state = msg.state; client.reports = msg.reports;
          if (Object.keys(msg.errors ?? {}).length) { errors.websocket++; log('grading-error', `${name}: ${JSON.stringify(msg.errors)}`); }
        }
        if (msg.t === 'snapshot') client.snapshots++;
        if (msg.t === 'error') { errors.websocket++; log('ws:error', `${name}: ${msg.message}`); }
        const current = client.state?.phase;
        if (current && client.phases.at(-1) !== current) { client.phases.push(current); log('phase', `${name}: ${current}`); }
      });
    });
    return client;
  };
  try {
    log('start', JSON.stringify({ options, baseURL, output }));
    const bundled = chromium.executablePath();
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      || (existsSync(bundled) ? bundled : existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
    browser = await chromium.launch({ headless: !options.headed, executablePath });
    const teacherContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    teacherContext.setDefaultTimeout(UI_TIMEOUT);
    const teacher = attach(await teacherContext.newPage(), 'teacher', 'QA teacher');
    await teacher.page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await completeLandingOnboarding(teacher.page);
    phase = 'create classroom';
    await teacher.page.getByTestId('create-classroom').click();
    await teacher.page.waitForURL(/\/r\/[^/?#]+\?screen=1/);
    room = new URL(teacher.page.url()).pathname.split('/')[2];
    log('room', room);
    phase = 'load and publish preset';
    await teacher.page.getByTestId('classroom-preset-select').selectOption('01-hello');
    await teacher.page.getByTestId('classroom-preset-load').click();
    await teacher.page.getByTestId('classroom-save-plan').click();
    await wait(() => teacher.state?.plan.steps.length === 3 && teacher.state.plan.steps[0]?.id === '01-hello-1', 'published three-step preset ACK');
    checks.publishedPreset = true;
    await shot(teacher, 'published');

    phase = 'join students';
    const students: ClassroomClient[] = [];
    for (let i = 0; i < options.players; i++) {
      const phone = i === options.players - 1;
      const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 },
        deviceScaleFactor: phone ? 3 : 1, isMobile: phone, hasTouch: phone });
      context.setDefaultTimeout(UI_TIMEOUT);
      const student = attach(await context.newPage(), 'student', `QA_student_${i + 1}`, phone);
      students.push(student);
      await student.page.goto(`${baseURL}/r/${room}`, { waitUntil: 'domcontentloaded' });
      await completeLandingOnboarding(student.page, { touch: phone });
      await student.page.getByTestId('player-name').fill(student.name);
      await student.page.getByTestId('join-room').click();
      await student.page.getByTestId('classroom-screen').waitFor();
    }
    await wait(() => teacher.state?.rows.length === options.players && teacher.state.rows.every(row => row.connected), 'connected student roster');
    await wait(() => students.every(student => teacher.state?.rows.some(row => row.id === student.id && row.name === student.name)),
      'classroom roster bound to real student identities');

    phase = 'open projector';
    let projector: ClassroomClient | undefined;
    teacherContext.once('page', page => { projector = attach(page, 'projector', 'Projector'); });
    await teacher.page.getByTestId('classroom-open-projector').click();
    await wait(() => !!projector, 'projector popup');
    const screen = projector!;
    await screen.page.getByTestId('classroom-screen').waitFor();
    const assertAnonymousProjector = async (label: string) => {
      const content = await screen.page.locator('body').innerText();
      const labels = await screen.page.locator('[aria-label], [title]').evaluateAll(elements =>
        elements.map(el => `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''}`).join('\n'));
      if (students.some(student => `${content}\n${labels}`.includes(student.name))) throw new Error(`Projector exposes a student name during ${label}`);
      checks[`projectorAnonymous_${label}`] = true;
    };
    await assertAnonymousProjector('setup');

    phase = 'open step and submit in-app code';
    await teacher.page.getByTestId('classroom-start').click();
    await wait(() => teacher.state?.phase === 'coding', 'coding phase');
    for (const student of students) {
      await student.page.getByTestId('code-editor-input').fill('name = "Ada"\nage = 12\nprint("Hello, Python!")\nprint(f"I am {name}, age {age}.")\n');
      await student.page.getByTestId('classroom-submit-code').click();
      await student.page.getByTestId('classroom-own-score').waitFor();
      await wait(() => student.reports[student.id ?? '']?.source === 'in-app', `${student.name} graded editor submission`);
    }
    await wait(() => teacher.state?.rows.every(row => row.status === 'submitted') ?? false, 'all submissions graded');
    checks.editorSubmissions = students.every(student => !!student.sent.classroomSubmitCode);
    await Promise.all([shot(teacher, 'submitted'), shot(students.at(-1)!, 'submitted')]);

    phase = 'launch class attack';
    await teacher.page.getByTestId('classroom-attack').click();
    await wait(() => teacher.state?.phase === 'raid', 'real class attack');
    await wait(() => screen.state?.phase === 'raid', 'projector class attack');
    await assertAnonymousProjector('raid');
    await shot(screen, 'class-attack');
    phase = 'round debrief';
    // --seconds bounds this post-attack wait. It never manufactures an ending.
    await wait(() => teacher.state?.phase === 'feedback', 'natural raid completion', options.seconds * 1000);
    const round = teacher.state!.rounds[0];
    checks.bossDamagedAndAlive = !!round && round.bossBefore > round.bossAfter && round.bossAfter > 0
      && teacher.state!.bossHp === round.bossAfter;
    await teacher.page.getByTestId('classroom-debrief').waitFor();
    await screen.page.getByTestId('classroom-debrief').waitFor();
    await screen.page.getByTestId('classroom-debrief-headline').waitFor();
    await assertAnonymousProjector('debrief');
    checks.roundDebriefVisible = true;
    await Promise.all([shot(teacher, 'round-debrief'), shot(screen, 'round-debrief'), shot(students.at(-1)!, 'round-feedback')]);
    assertClassroomRound(teacher.state!, options.players);
    checks.bossDamagedAndAlive = true;
    if (clients.some(client => client.snapshots || client.sent.input || client.sent.setRepo || client.sent.start)) {
      throw new Error('Cooperative classroom must not enter the legacy battle/PvP path');
    }
    if (!teacher.sent.classroomPlan || teacher.controls.join(',') !== 'start,attack' || !checks.editorSubmissions) {
      throw new Error('Missing real UI publish/start/submit/attack protocol evidence');
    }
    checks.noPageErrors = errors.page === 0;
    exitCode = errors.page || errors.websocket ? 1 : 0;
    log('result', `Round 1 HP ${teacher.state!.rounds[0].bossBefore} → ${teacher.state!.bossHp}; debrief visible; anonymous projector`);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    log('failure', `${phase}: ${failure}`);
    for (const client of clients) await shot(client, 'failure').catch(() => {});
  } finally {
    shuttingDown = true;
    checks.noPageErrors = errors.page === 0;
    if (interrupted || errors.page || errors.websocket) exitCode = 1;
    await browser?.close();
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    writeFileSync(join(output, 'summary.json'), JSON.stringify({ options, baseURL, room, syntheticFixture: process.env.PLAYTEST_SELF_TEST === '1',
      outcome: exitCode ? 'incomplete-or-failed' : 'round-debrief', exitCode, phase, failure, checks, errors, screenshots,
      clients: clients.map(({ page, reports, state, ...client }) => ({ ...client, url: page.url(),
        reports: Object.entries(reports).map(([id, report]) => ({ id, source: report.source, score: report.score })),
        classroom: state && { phase: state.phase, stepIds: state.plan.steps.map(step => step.id), stepIndex: state.stepIndex,
          bossHp: state.bossHp, bossMaxHp: state.bossMaxHp, rounds: state.rounds } })),
    }, null, 2));
    console.log(`Playtest ${exitCode === 0 ? 'PASS' : 'INCOMPLETE/FAIL'}: artifacts=${output}`);
  }
  return exitCode;
}
