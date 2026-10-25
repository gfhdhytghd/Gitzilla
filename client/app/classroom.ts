import { placeSettingsButton } from './settings';
import { localizeClassroomPlan } from '../../shared/classroom-localize';
import { locale, onLocaleChange, t, formatNumber } from '../i18n';
import type { ClassroomPlan, ClassroomState, ClassroomStep, ClassroomReport, ClassroomCommand, ClassroomCheck, StepBrief } from '../../shared/classroom';
import { defaultClassroomPlan } from '../../shared/classroom-defaults';
import { pythonClassroomPresets, getPythonClassroomPresets, pythonClassroomPlan, pythonStarter, pythonTeacherGuide } from '../../shared/classroom-presets';
import { type AppCtx, type Screen, isOwner, joinUrl, toast } from './app';
import { h, store } from './util';
import { createGithubPicker } from './github';
import { createRubricEditor } from '../edu/rubric';
import { createBackdrop } from './backdrop';
import { createClassBoss } from '../edu/class-boss';
import { stepSummary as summarize } from '../edu/summary';
import { createInAppPanel } from '../edu/inapp-panel';
import { createCodeEditor } from '../edu/code-editor';
import { createTaskCard, richText } from '../edu/task-card';
import { createClassroomKicked } from '../edu/classroom-kicked';
import { buildLessonDebrief, buildRoundDebrief, type Debrief, type LessonDebrief } from '../edu/debrief';
import { createDebriefCard, debriefMarkdown } from '../edu/debrief-view';
import { alignDoneWhen, doneWhenFor } from '../edu/task-brief';
import type { InAppFile } from '../../shared/classroom';
import './classroom.css';
import { setClassroomAudio } from './sound';
import { createPauseOverlay } from './pause';
import { wordmark } from './wordmark';

const setText = (el: HTMLElement, s: string) => { if (el.textContent !== s) el.textContent = s; };
/** Scores, HP and damage read as whole numbers ("100", not "100.0"). */
const int = (n: number) => formatNumber(Math.round(n), 0);
const phaseNames = { setup: 'Prepare the lesson', coding: 'Build your next commit', paused: 'Coding paused', raid: 'Class attack', feedback: 'Review & improve', complete: 'Lesson complete' };
// the grader's all-clear advice (server text), said the way a student would
const PLAIN_ADVICE: Record<string, string> = { 'The measured criteria look strong. Check the task instructions and explain your implementation to your teacher.': 'Everything the checks look for is in your files. Run it, compare with the expected output, and be ready to explain it to your teacher.' };
const field = (label: string, input: HTMLElement) => h('label.cr-field', null, h('span', null, label), input);
const button = (label: string, test: string, run: () => void, cls = '') => h(`button.btn${cls ? '.' + cls : ''}`, { type: 'button', 'data-testid': test, onclick: run }, label);

function checkText(step: ClassroomStep) { return step.checks.map(c => `${c.kind}: ${c.path}${c.kind === 'contains' ? ` :: ${c.text}` : ''}`).join('\n'); }
function parseChecks(src: string): ClassroomCheck[] {
  return src.split('\n').filter(s => s.trim()).map((line, i) => {
    const match = line.match(/^\s*(file|contains|ci)\s*:\s*(.+?)\s*$/);
    if (!match) throw new Error('Use file: path, contains: path :: text, or ci: check name');
    const [, kind, rest] = match;
    const [path, ...words] = rest.split(' :: ');
    if (kind === 'contains' && !words.join(' :: ').trim()) throw new Error('A contains check needs :: followed by literal text');
    return { id: `check-${i}`, kind: kind as ClassroomCheck['kind'], path: path.trim(), label: `${kind === 'ci' ? 'GitHub check' : kind === 'file' ? 'File exists' : 'Literal code evidence'}: ${path.trim()}`, ...(kind === 'contains' ? { text: words.join(' :: ').trim() } : {}) };
  });
}

export function createClassroom(app: AppCtx): Screen {
  setClassroomAudio(true);
  document.body.classList.add('classroom-active');
  let state = app.lobby?.classroom;
  let clockOffset = state ? state.serverTime - Date.now() : 0;
  let lastServerTime = state?.serverTime;
  let draft: ClassroomPlan = localizeClassroomPlan(state?.plan ?? defaultClassroomPlan(), locale());
  let selected: string | null = null;
  // teacher console: "Remove from class" asks inline on the student's row; `removing` = sent, waiting for the roster
  let confirmRemove: string | null = null;
  const removing = new Map<string, number>();
  let kickedOut = false;
  // ?preset=<id>: a classroom opened from the lesson debrief's "next lesson" starts with that preset selected
  const wantedPreset = new URLSearchParams(location.search).get('preset');
  let selectedPreset = pythonClassroomPresets.some(p => p.id === wantedPreset) ? wantedPreset! : pythonClassroomPresets[0].id;
  let rowsSig = '', detailsSig = '', phaseSig = '', planSig = '';
  let raidKey = '', expectationsSig = '';
  const rawChecks = new Map<string, string>();
  const disposables: (() => void)[] = [];
  let refreshEditorLocale = () => {};
  const teacher = () => app.role === 'screen' && isOwner(app);
  // ?screen=1&view=projector: the class-facing window the teacher drags to the projector. A separate spectator screen:
  // join info, task summary, submitted count, the boss and the class attack. Never names with scores, never feedback.
  const projectorView = app.role === 'screen' && new URLSearchParams(location.search).get('view') === 'projector';
  const title = h('h1', null, 'Build. Review. Improve.');
  const phase = h('span.cr-phase');
  const clock = h('strong.cr-clock', { 'data-testid': 'classroom-clock' });
  const progress = h('div.cr-class-progress', { 'data-testid': 'classroom-progress' });
  const head = h('header.cr-header', null,
    h('a.cr-brand', { href: '/', 'aria-label': 'GITZILLA classroom' }, wordmark({ width: projectorView ? '230px' : 'clamp(116px, 28vw, 168px)' }), h('small', null, 'classroom')),
    h('div.cr-title', null, title, phase),
    app.role === 'screen'
      ? h('button.cr-room.cr-room-btn', { type: 'button', 'data-testid': 'classroom-show-join', title: 'Show the QR code and join link', onclick: () => { joinOverlay.hidden = !joinOverlay.hidden; } },
          h('span', null, 'Join room'), h('b', { 'data-testid': 'classroom-code', translate: 'no' }, app.room), h('small', null, 'show QR'))
      : h('div.cr-room', null, h('span', null, 'Join room'), h('b', { 'data-testid': 'classroom-code', translate: 'no' }, app.room)),
    clock, button('Leave', 'classroom-leave', () => {
      if (teacher()) { if (confirm(t('Close the teacher screen? The lesson keeps running, and you can come back with the same link. To end it, use ⋯ → End lesson.'))) location.assign('/'); return; }
      if (confirm(t('Leave this classroom?'))) app.leave();
    }));
  const taskTitle = h('h2'), taskText = h('p.cr-instructions'), stepRail = h('nav.cr-steps', { 'aria-label': 'Lesson steps' });
  const notice = h('div.cr-notice', { role: 'status' });
  const teacherEntry = h('a.btn.btn-primary', { href: `${location.pathname}?screen=1`, 'data-testid': 'classroom-open-teacher' }, 'Open teacher screen for this room');
  const moreText = h('button.cr-more-text', { type: 'button', hidden: true, 'data-testid': 'classroom-more-text', onclick: () => { const open = task.classList.toggle('cr-task-open'); moreText.textContent = open ? 'show less' : teacher() ? 'show all instructions' : 'Read the full task'; } }, 'show all instructions');
  const phoneNote = h('p.cr-phone-note', null, 'The full task is on your phone or laptop.');
  const progressFill = h('i'), progressBar = h('div.cr-progress-bar', { 'aria-hidden': 'true' }, progressFill);
  // structured brief (StepBrief) when the step has one; the free-text instructions are the fallback
  const card = createTaskCard();
  const withBrief = (st: ClassroomStep | undefined): st is ClassroomStep & { brief: StepBrief } => !!st?.brief?.goal;
  const task = h('section.cr-task', null, stepRail, taskTitle, taskText, moreText, card.el, phoneNote, progress, progressBar, notice, teacherEntry);
  // students: the step, its title and the timer stay pinned while they scroll down to the editor
  const headStep = h('b.cr-step-head-n'), headTitle = h('span.cr-step-head-title'), headClock = h('strong.cr-step-head-clock', { 'data-testid': 'classroom-step-clock' });
  const stepHead = h('div.cr-step-head', { 'data-testid': 'classroom-step-head' }, headStep, headTitle, headClock);
  const controls = h('div.cr-controls', { 'data-testid': 'classroom-controls' });
  const openProjector = h('button.btn.cr-open-projector', { type: 'button', 'data-testid': 'classroom-open-projector', title: 'Opens the class view (no names, scores or feedback) in a new window. Drag it to the projector screen.',
    onclick: () => { window.open(`${location.pathname}?screen=1&view=projector`, `gitzilla-projector-${app.room}`, 'popup,width=1280,height=720'); projectorSeen = Date.now(); rowsSig = detailsSig = ''; render(); } }, 'Open projector window ↗');
  // why the main action is (not) available yet: teachers shouldn't have to guess at a greyed-out button
  const controlsHint = h('p.cr-controls-hint', { role: 'status', 'data-testid': 'classroom-controls-hint' });
  // Projector: how students join (QR + link + code). Inline while the class is filling up; any time later as an
  // overlay from the room code in the header (late joiners).
  const url = joinUrl(app.room);
  const joinBody = () => h('div.cr-join-body', null,
    h('img.cr-join-qr', { src: `/api/qr?text=${encodeURIComponent(url)}`, alt: 'QR code to join this classroom', width: 200, height: 200 }),
    h('div.cr-join-text', null,
      h('p.cr-join-step', null, '1. Scan the code with your phone camera, or open'),
      h('p.cr-join-url', { translate: 'no' }, url.replace(/^https?:\/\//, '')),
      h('p.cr-join-step', null, '2. Type your name. That’s it: no account or app needed.'),
      h('p.cr-join-code', null, h('span', null, 'Room code'), h('b', { translate: 'no' }, app.room))));
  const joinCard = h('section.cr-join', { 'data-testid': 'classroom-join-card' }, h('h2', null, 'Students: join on your phone or laptop'), joinBody());
  const joinOverlay = h('div.cr-join-overlay', { hidden: true, 'data-testid': 'classroom-join-overlay', onclick: (e: Event) => { if (e.target === joinOverlay) joinOverlay.hidden = true; } },
    h('section.cr-join', null, h('h2', null, 'Join this classroom'), joinBody(),
      h('button.btn', { type: 'button', onclick: () => { joinOverlay.hidden = true; } }, 'Close')));
  const rosterList = h('div.cr-roster-list', { 'data-testid': 'classroom-roster' });
  // Scores on the teacher console: hidden while this screen may be on the projector. "auto" (default): if this
  // browser has the projector window open (it sends a heartbeat on a BroadcastChannel), the class is looking at that
  // window, so this console is private and shows scores; without one, the console itself is probably projected, so
  // scores hide. The teacher can force "hide" or "show". Hidden scores are a clear "🙈 hidden" chip (press and hold,
  // or focus, to peek), never a blur. A selected student's feedback/code stays behind "Show details" while hidden.
  type ScoreMode = 'auto' | 'hide' | 'show';
  const savedMode = store.get('kaiju.scoreMode');
  let scoreMode: ScoreMode = savedMode === 'hide' || savedMode === 'show' ? savedMode : 'auto';
  let projectorSeen = 0;
  const projectorOpen = () => Date.now() - projectorSeen < 6000;
  const hideScores = () => scoreMode === 'hide' || (scoreMode === 'auto' && !projectorOpen());
  let projectorSafe = true;   // = hideScores(), refreshed on every render
  let revealed: string | null = null;
  const projectorChannel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`gitzilla-projector-${app.room}`);
  const setScoreMode = (mode: ScoreMode) => { scoreMode = mode; store.set('kaiju.scoreMode', mode); revealed = null; detailsSig = rowsSig = ''; render(); };
  const scoreToggle = h('button.cr-score-toggle', { type: 'button', 'data-testid': 'classroom-projector-safe', onclick: () => setScoreMode(projectorSafe ? 'show' : 'hide') });
  const scoreAuto = h('button.cr-score-auto', { type: 'button', 'data-testid': 'classroom-score-auto', onclick: () => setScoreMode('auto') }, '↺ auto');
  const scoreWhy = h('small.cr-score-why', { 'data-testid': 'classroom-score-why' });
  const scoreBox = h('div.cr-score-box', null, h('div.cr-score-row', null, scoreToggle, scoreAuto), scoreWhy);
  const renderScoreBox = () => {
    setText(scoreToggle, projectorSafe ? '🙈 Scores hidden (projecting)' : '👁 Scores visible');
    scoreToggle.classList.toggle('on', projectorSafe);
    scoreToggle.title = projectorSafe ? 'Show scores on this screen' : 'Hide scores on this screen';
    scoreAuto.hidden = scoreMode === 'auto';
    setText(scoreWhy, scoreMode === 'hide' ? 'You chose to hide scores here. Press and hold a 🙈 chip to peek.'
      : scoreMode === 'show' ? 'You chose to show scores here. Only do this if this screen isn’t on the projector.'
      : projectorSafe ? 'Hidden because this screen may be on the projector. Open the projector window to give the class its own view.'
      : 'Visible: the class sees the projector window, not this screen.');
  };
  const roster = h('aside.cr-roster', null, h('div.cr-roster-heading', null, h('h2', null, 'Submissions'), h('small', null, 'Who needs help first · tap a name to review'), scoreBox), rosterList);
  const bossHpFill = h('i'), bossHpText = h('strong');
  const bossName = h('h2', { translate: 'no' });
  // the game's real kaiju renderer; HP drives phase tint, broken limbs, staggers during the class attack, death
  // (projector only: student phones never show the boss panel, so they never start its animation loop)
  const classBoss = app.role === 'screen' ? createClassBoss() : null;
  const bossArt = classBoss?.el ?? h('div.cr-boss-art');
  const volley = h('div.cr-volley', { 'aria-hidden': 'true' }, ...Array.from({ length: 8 }, (_, i) => h('i', { style: `--shot:${i}` }, '◆')));
  const bossMessage = h('p.cr-boss-message');
  const attackTotal = h('div.cr-attack-total', { 'data-testid': 'classroom-damage' });
  const attackNames = h('div.cr-attack-names');
  const boss = h('section.cr-boss', { 'data-testid': 'classroom-boss' },
    h('div.cr-boss-heading', null, h('span', null, 'One class. One target.'), bossName),
    h('div.cr-hp', null, h('div', null, bossHpFill), bossHpText),
    h('div.cr-boss-stage', null, volley, bossArt), bossMessage, attackTotal, attackNames);
  const review = h('section.cr-feedback', { 'data-testid': 'classroom-feedback' });
  const editor = h('section.cr-editor', { 'data-testid': 'classroom-plan-editor' });
  const hostBoard = h('div.cr-host-board', null, roster, h('div.cr-host-main', null, boss, review));

  const repo = h('input', { 'data-testid': 'classroom-repo', placeholder: 'you/your-project', maxlength: 300, autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
  repo.value = store.get('kaiju.lastRepo') ?? '';
  const ref = h('input', { 'data-testid': 'classroom-ref', value: 'HEAD', placeholder: 'main, a branch, or commit SHA', maxlength: 200, spellcheck: 'false' }) as HTMLInputElement;
  const submit = button('Submit this version', 'classroom-submit', () => {
    const value = repo.value.trim(); if (!value) return repo.focus();
    store.set('kaiju.lastRepo', value); app.conn.send({ t: 'classroomSubmit', repo: value, ref: ref.value.trim() || 'HEAD' });
  }, 'btn-primary');
  const submissionStatus = h('p.cr-submission-status', { role: 'status', 'data-testid': 'classroom-submission-status' });
  const github = createGithubPicker(slug => { repo.value = slug; });
  const expectations = h('details.cr-measurements', null);
  // In-app editor (steps with starter files): code here, ▶ Run in the browser, submit without GitHub.
  let lastSource: 'github' | 'in-app' = 'github';
  submit.addEventListener('click', () => { lastSource = 'github'; });
  const inApp = createInAppPanel({ room: app.room, onSubmit: (files: InAppFile[]) => { lastSource = 'in-app'; app.conn.send({ t: 'classroomSubmitCode', files }); } });
  const studentTitle = h('h2', null, 'Your code');
  const githubFields = h('div.cr-github', null, field('GitHub repository', repo), field('Branch / tag / commit', ref), github, submit,
    h('p.cr-flow', null, 'Push to GitHub → Submit → read your feedback → improve and submit again.'),
    h('p.cr-evidence-note', null, 'Each score is tied to an exact commit. Static evidence checks do not execute your code. GitHub checks report the CI result for that commit; your teacher can review functionality.'));
  const githubAlt = h('details.cr-github-alt', { 'data-testid': 'classroom-github-alt' }, h('summary', null, 'or submit a GitHub repo instead'));
  const student = h('section.cr-student-work', null, studentTitle, expectations, inApp.el, githubAlt, githubFields, submissionStatus);
  const studentBoard = h('div.cr-student-board', null, student, review);
  // Projector only: the lobby's animated pixel backdrop. Student phones keep the CSS-only grid (no render loop).
  const backdrop = app.role === 'screen' ? createBackdrop({ dim: 0.55, themeCycle: false }) : null;
  backdrop?.setTheme('terminal');
  const studentHref = () => { const q = new URLSearchParams(location.search); q.delete('screen'); const qs = q.toString(); return `${location.pathname}${qs ? `?${qs}` : ''}`; };
  const notTeacher = h('div.cr-not-teacher', { role: 'status', 'data-testid': 'classroom-not-teacher', hidden: true },
    h('span', null, 'This big screen is not the teacher’s. The teacher controls the class from the screen that created the room.'),
    h('a.btn', { href: studentHref() }, 'Join as a student'));
  const sendPause = (paused: boolean) => app.conn.send({ t: 'pause', paused });
  const pause = createPauseOverlay({
    onResume: () => sendPause(false),
    onLeave: () => { if (confirm(t('End this lesson and leave?'))) app.leave(); },
    onNewRoom: () => app.leave({ newRoom: true }),
    hostHint: 'Students see this pause too.',
    classroom: true,
    waitHint: 'Your teacher will resume in a moment.',
    onChange: on => el.classList.toggle('cr-raid-paused', on),
  });
  // Teacher debrief (take-edu's model): round debrief after a class attack, lesson debrief when the lesson ends.
  // Console: everything, names only when not projecting (or revealed); projector: headline + check bars, no names.
  const debrief = createDebriefCard();
  let debriefNames = '';   // round key whose names the teacher chose to show while projecting
  const currentDebrief = (s: ClassroomState): { kind: 'round' | 'lesson'; title: string; key: string; d: Debrief | LessonDebrief } | null => {
    const reports = teacher() ? app.classroomReports ?? {} : {};
    if (s.phase === 'complete') return { kind: 'lesson', title: s.plan.title, key: 'lesson', d: buildLessonDebrief(s, reports) };
    const round = s.rounds.at(-1);
    if (s.phase !== 'feedback' || !round) return null;
    const at = s.plan.steps.findIndex(st => st.id === round.stepId);
    const title = `${t(`Step ${at + 1}`)} · ${s.plan.steps[at]?.title ?? ''}${round.attempt > 1 ? ` · ${t(`attempt ${round.attempt}`)}` : ''}`;
    return { kind: 'round', title, key: `${round.stepId}:${round.attempt}:${round.at}`, d: buildRoundDebrief(s, reports, round) };
  };
  const openNextLesson = async (presetId: string) => {
    const res = await fetch('/api/room?mode=edu', { method: 'POST' });
    if (!res.ok) return toast('Could not open a new classroom.', 'err');
    const { room } = await res.json() as { room: string };
    location.assign(`/r/${room}?screen=1&preset=${encodeURIComponent(presetId)}`);
  };
  const consoleBar = h('div.cr-console-bar', { 'data-testid': 'classroom-console-bar' }, h('div.cr-console-row', null, controls, h('div.cr-console-tools', null, openProjector)), controlsHint);
  const barSize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { el.style.setProperty('--cr-bar-h', `${consoleBar.hidden ? 0 : consoleBar.offsetHeight}px`); });
  barSize?.observe(consoleBar);
  const el = h('div.screen.classroom-screen', { 'data-testid': 'classroom-screen' }, backdrop ? h('div.cr-backdrop', { 'aria-hidden': 'true' }, backdrop.canvas) : null, head, notTeacher, joinCard, consoleBar, stepHead, task, debrief.el, editor, hostBoard, studentBoard, joinOverlay, pause.el);
  // teacher on the projector: P / Esc toggles the raid pause
  const onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (!teacher() || state?.phase !== 'raid' || (k !== 'p' && k !== 'escape') || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (!state.paused) sendPause(true);
    else if (state.paused.resumeAt === null) sendPause(false);
  };
  addEventListener('keydown', onKey);
  const pauseTimer = setInterval(() => pause.tick(), 100);
  let sentToTeacher = false;

  // destructive teacher actions ask first (a mis-tap in front of the class must be undoable)
  const CONFIRM: Partial<Record<ClassroomCommand, string>> = { finish: 'End the lesson for everyone? Students’ work is kept and you can still export the results.' };
  const command = (action: ClassroomCommand) => { if (CONFIRM[action] && !confirm(t(CONFIRM[action]!))) return; app.conn.send({ t: 'classroomControl', action }); };
  const buildPlanEditor = () => {
    for (const dispose of disposables.splice(0)) dispose();
    const presets = h('select', { 'data-testid': 'classroom-preset-select', 'aria-label': 'Python preset lessons' },
      ...getPythonClassroomPresets(locale()).map(p => h('option', { value: p.id }, p.title))) as HTMLSelectElement;
    presets.value = selectedPreset;
    const presetSummary = h('p'), presetPrerequisite = h('p.cr-preset-meta'), presetFile = h('p.cr-preset-meta');
    const guide = h('pre.cr-teacher-guide', { 'data-testid': 'classroom-preset-guide' });
    const previewPreset = () => {
      selectedPreset = presets.value;
      const preset = getPythonClassroomPresets(locale()).find(p => p.id === selectedPreset)!;
      presetSummary.textContent = preset.summary;
      presetPrerequisite.textContent = t(`Before this: ${preset.prerequisite}`);
      presetFile.textContent = t(`3 steps · about ${preset.minutes} min · student file: ${preset.file}`);
      guide.textContent = pythonTeacherGuide(selectedPreset, locale());
    };
    presets.onchange = previewPreset; previewPreset();
    const starterDownload = () => {
      const starter = pythonStarter(selectedPreset, locale()), url = URL.createObjectURL(new Blob([starter.content], { type: 'text/x-python;charset=utf-8' }));
      const link = h('a', { href: url, download: starter.filename.split('/').at(-1)! }); link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const library = h('section.cr-preset-library', { 'data-testid': 'classroom-preset-library' },
      h('h3', null, 'Python preset lessons · from zero to dict'),
      field('Pick a lesson (in order)', presets), presetSummary, presetPrerequisite, presetFile,
      h('div.cr-plan-buttons', null,
        button('Use this lesson', 'classroom-preset-use', () => { draft = pythonClassroomPlan(selectedPreset, locale()); rawChecks.clear(); buildPlanEditor(); app.conn.send({ t: 'classroomPlan', plan: structuredClone(draft) }); toast('Lesson ready. Open step 1 when the class has joined.', 'ok'); }, 'btn-primary'),
        button('Customize first', 'classroom-preset-load', () => { draft = pythonClassroomPlan(selectedPreset, locale()); rawChecks.clear(); buildPlanEditor(); editor.querySelector('.cr-step-editors')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }),
        button('Download the student starter file', 'classroom-preset-download', starterDownload)),
      h('small', null, 'Customize first only replaces the draft below; students get it when you publish. Put a downloaded .py file in the python/ folder shown. Every step can be edited.'),
      h('details', null, h('summary', null, 'Teacher notes: preparing and reviewing'), guide));
    const lessonTitle = h('input', { value: draft.title, maxlength: 120, 'data-testid': 'lesson-title' }) as HTMLInputElement;
    lessonTitle.oninput = () => { draft.title = lessonTitle.value; };
    const target = h('input', { value: draft.bossName, maxlength: 80, 'data-testid': 'lesson-boss-name' }) as HTMLInputElement;
    target.oninput = () => { draft.bossName = target.value; };
    const steps = h('div.cr-step-editors');
    const stepInputs: { step: ClassroomStep; name: HTMLInputElement; instructions: HTMLTextAreaElement; summary(): void }[] = [];
    for (const [index, step] of draft.steps.entries()) {
      const name = h('input', { value: step.title, maxlength: 120, 'data-testid': `step-title-${index}` }) as HTMLInputElement;
      name.oninput = () => { step.title = name.value; };
      const instructions = h('textarea', { rows: 4, maxlength: 8000, 'data-testid': `step-instructions-${index}` }, step.instructions) as HTMLTextAreaElement;
      instructions.oninput = () => { step.instructions = instructions.value; };
      const duration = h('input', { type: 'number', min: 0, max: 120, value: step.durationSec / 60, 'data-testid': `step-minutes-${index}` }) as HTMLInputElement;
      duration.oninput = () => { step.durationSec = Math.round(Number(duration.value) * 60); };
      const checks = h('textarea', { rows: 3, spellcheck: 'false', placeholder: 'file: README.md\ncontains: src/main.py :: def calculate\nci: unit-tests', 'data-testid': `step-checks-${index}` }, rawChecks.get(step.id) ?? checkText(step)) as HTMLTextAreaElement;
      const weight = h('input', { type: 'number', min: 0, max: 100, value: step.checksWeight, 'data-testid': `step-check-weight-${index}` }) as HTMLInputElement;
      weight.oninput = () => { step.checksWeight = Number(weight.value); };
      const checksWarning = h('small.cr-form-error');
      try { parseChecks(checks.value); } catch (e) { checksWarning.textContent = (e as Error).message; }
      // the brief's "Done when" rows must stay one per check, in order: re-align them from the preset's own lines
      const briefOrigin = step.brief ? { checks: step.checks, doneWhen: step.brief.doneWhen } : null;
      checks.oninput = () => { rawChecks.set(step.id, checks.value); try { step.checks = parseChecks(checks.value); if (step.brief && briefOrigin) step.brief = { ...step.brief, doneWhen: alignDoneWhen(briefOrigin, step.checks) }; checksWarning.textContent = ''; } catch (e) { checksWarning.textContent = (e as Error).message; } };
      // label and title as separate nodes so each is translated (the title is a catalog string for the default rubric)
      const rubricTitle = h('span', null, step.rubric.title);
      const rubricStatus = h('small', null, 'Rubric:', ' ', rubricTitle);
      const rubricDetails = h('details.cr-rubric-config', null, h('summary', null, 'How this step is scored (edit or upload a rubric)'), rubricStatus);
      let rubricMounted = false;
      rubricDetails.addEventListener('toggle', () => {
        if (!rubricDetails.open || rubricMounted) return;
        rubricMounted = true;
        const ed = createRubricEditor({ current: step.rubric, room: app.room, token: app.token, context: 'classroom', onUse: r => { step.rubric = r; ed.setCurrent(r); rubricTitle.textContent = r.title; } });
        rubricDetails.append(ed.el); disposables.push(() => ed.dispose());
      });
      const move = (delta: number) => { const to = index + delta; if (to < 0 || to >= draft.steps.length) return; [draft.steps[index], draft.steps[to]] = [draft.steps[to], draft.steps[index]]; buildPlanEditor(); };
      const stepSummary = () => [t(`Step ${index + 1}`), step.title || t('untitled'), step.durationSec ? t(`${Math.round(step.durationSec / 60)} min`) : t('teacher paced'),
        t(step.checks.length === 1 ? '1 check' : `${step.checks.length} checks`), ...(step.starter?.length ? [t('in-app editor')] : [])].join(' · ');
      const summaryLine = h('summary', null, stepSummary());
      for (const input of [name, duration, checks]) input.addEventListener('input', () => { summaryLine.textContent = stepSummary(); });
      stepInputs.push({ step, name, instructions, summary: () => { summaryLine.textContent = stepSummary(); } });
      steps.append(h('details.cr-step-editor', { open: index === 0 || undefined }, summaryLine, field('Task title', name), field('Student instructions', instructions),
        h('div.cr-editor-numbers', null, field('Minutes (0: you decide when to stop)', duration), field('How much the automatic checks count (%) · the rest is the rubric', weight)),
        field('Automatic checks (optional), one per line', checks),
        h('div.cr-check-adders', null, h('small', null, 'Add a check:'),
          ...([['file', 'File exists'], ['contains', 'File contains text'], ['ci', 'GitHub CI check']] as const).map(([kind, label]) =>
            h('button.btn.btn-ghost', { type: 'button', 'data-testid': `step-add-check-${kind}-${index}`, onclick: () => {
              const main = step.starter?.find(f => /\.py$/.test(f.path))?.path ?? 'README.md';
              const line = kind === 'file' ? `file: ${main}` : kind === 'contains' ? `contains: ${main} :: print(` : 'ci: unit-tests';
              checks.value = checks.value.trim() ? `${checks.value.trimEnd()}\n${line}` : line; checks.dispatchEvent(new Event('input')); checks.focus();
            } }, `+ ${label}`))),
        checksWarning,
        h('small.cr-evidence-note', null, 'Examples: “file: python/01_hello.py” (the file exists) · “contains: python/01_hello.py :: Hello, Python!” (the file contains this exact text; the code is never run) · “ci: unit-tests” (a GitHub check by that name passed). You can always override a score with ✓ / ✗ during class.'),
        rubricDetails, h('div.cr-step-buttons', null, button('Move up', `step-up-${index}`, () => move(-1)), button('Move down', `step-down-${index}`, () => move(1)), button('Remove', `step-remove-${index}`, () => { if (draft.steps.length > 1 && confirm(t(`Remove step ${index + 1} “${step.title}” and its instructions?`))) { draft.steps.splice(index, 1); buildPlanEditor(); } }))));
    }
    refreshEditorLocale = () => {
      lessonTitle.value = draft.title; target.value = draft.bossName;
      const choices = getPythonClassroomPresets(locale());
      for (const option of presets.options) option.textContent = choices.find(p => p.id === option.value)?.title ?? option.textContent;
      for (const fields of stepInputs) { fields.name.value = fields.step.title; fields.instructions.value = fields.step.instructions; fields.summary(); }
      previewPreset();
    };
    editor.replaceChildren(h('div.cr-editor-intro', null, h('h2', null, 'Build the lesson'), h('p', null, 'Give the class a sequence of code challenges. Each task ends with one shared attack.'),
        button('👁 Preview as a student', 'classroom-preview', () => openPreview())),
      library, h('div.cr-editor-numbers', null, field('Lesson title', lessonTitle), field('Name of the class monster', target)), steps,
      h('div.cr-plan-buttons', null, button('+ Add step', 'classroom-add-step', () => { if (draft.steps.length < 12) { const step = localizeClassroomPlan(defaultClassroomPlan(), locale()).steps[0]; step.id = `step-${crypto.randomUUID()}`; step.title = t('New challenge'); draft.steps.push(step); buildPlanEditor(); } }),
        button('Publish lesson', 'classroom-save-plan', () => {
          if (editor.querySelector('.cr-form-error:not(:empty)')) return toast('Fix the evidence-check format before publishing.', 'err');
          app.conn.send({ t: 'classroomPlan', plan: structuredClone(draft) });
        }, 'btn-primary')));
  };

  // Teacher: read-only view of an in-app submission. ClassroomReport.files reaches only the owning teacher screen.
  let viewer: { dispose(): void } | null = null;
  const codeViewer = (report: NonNullable<AppCtx['classroomReports']>[string]) => {
    viewer?.dispose(); viewer = null;
    if (!teacher() || report.source !== 'in-app') return document.createTextNode('');
    const files = report.files;
    if (!files?.length) return h('p.cr-evidence-note', null, 'Submitted in the in-app editor.');
    const step = state?.plan.steps.find(st => st.id === report.stepId);
    const ce = createCodeEditor({ starter: files, readOnly: true, language: step?.language ?? 'python', label: 'submitted code (read only)' });
    viewer = ce;
    return h('details.cr-code-view', { 'data-testid': 'classroom-code-view' }, h('summary', null, files.length === 1 ? 'View submitted code (1 file)' : `View submitted code (${files.length} files)`), ce.el);
  };
  const currentStep = () => state?.plan.steps[state.stepIndex];
  // What students will see for each (unpublished) step: title, instructions, starter files, how it's scored.
  const openPreview = () => {
    let at = 0, ce: { dispose(): void } | null = null;
    const body = h('div.cr-preview-body');
    const show = () => {
      ce?.dispose(); ce = null;
      const st = draft.steps[at];
      const editorEl = st.starter?.length ? (() => { const e = createCodeEditor({ starter: st.starter!, readOnly: true, language: st.language ?? 'python', label: 'starter code (preview)' }); ce = e; return e.el; })()
        : h('p.cr-evidence-note', null, 'This step has no starter files: students submit a GitHub repository.');
      body.replaceChildren(
        h('div.cr-preview-nav', null, button('◀', 'classroom-preview-prev', () => { at = Math.max(0, at - 1); show(); }), h('b', null, `Step ${at + 1} of ${draft.steps.length}`), button('▶', 'classroom-preview-next', () => { at = Math.min(draft.steps.length - 1, at + 1); show(); })),
        h('h2', null, `${at + 1}. ${st.title}`),
        withBrief(st) ? (() => { const c = createTaskCard(); c.update({ step: st, mode: 'preview' }); return c.el; })() : h('p.cr-instructions', null, st.instructions),
        h('h3', null, 'Starter code'), editorEl,
        h('h3', null, 'How this task is scored'),
        h('ul', null, ...st.checks.map(c => h('li', null, `${c.label}${c.text ? ` · ${c.text}` : ''}`)), ...st.rubric.criteria.map(c => h('li', null, c.name))));
    };
    const close = () => { ce?.dispose(); ov.remove(); };
    const ov = h('div.cr-join-overlay.cr-preview', { 'data-testid': 'classroom-preview-overlay', onclick: (e: Event) => { if (e.target === ov) close(); } },
      h('section.cr-join.cr-preview-card', null, h('div.cr-preview-head', null, h('h2', null, 'Student preview (not published yet)'), button('Close', 'classroom-preview-close', close)), body));
    show(); el.append(ov);
  };
  const renderReport = (id: string | null) => {
    projectorSafe = teacher() && hideScores();
    const report = id ? app.classroomReports?.[id] : undefined;
    const error = id ? app.classroomErrors?.[id] : undefined;
    const sig = JSON.stringify([id, report, error, teacher(), state?.phase, projectorSafe, revealed]);
    if (sig === detailsSig) return; detailsSig = sig;
    if (report && teacher() && projectorSafe && revealed !== id) {
      const name = state?.rows.find(r => r.id === id)?.name ?? '';
      review.replaceChildren(h('div.cr-feedback-title', null, h('h2', null, `${name} · review`), h('strong.cr-score', null, int(report.score), h('small', null, ' /100'))),
        h('p.cr-private', { 'data-testid': 'classroom-private-hidden' }, '🔒 Feedback, code and your notes for this student are hidden from the projector.'),
        h('div.cr-plan-buttons', null, button('Show details', 'classroom-reveal', () => { revealed = id; detailsSig = ''; renderReport(id); }, 'btn-primary')));
      return;
    }
    // teacher picked a student with nothing to review yet (e.g. from the debrief's "need help")
    if (!report && !error && teacher() && id) { review.replaceChildren(h('h2', null, `${state?.rows.find(r => r.id === id)?.name ?? ''} · review`), h('p', null, 'No submission yet for this step.')); return; }
    if (!report) { review.replaceChildren(h('h2', null, teacher() ? 'Code review' : 'Your feedback'), h('p', null, error ?? (teacher() ? 'Select a student to inspect their commit, evidence and next steps.' : (currentStep()?.starter?.length ? 'Submit your code to receive measured feedback and a next step.' : 'Submit your GitHub version to receive measured feedback and a next step.')))); return; }
    const name = state?.rows.find(r => r.id === id)?.name ?? app.name;
    const localCheckDetail = (detail: string) => { const colon = detail.indexOf(': '); return colon < 0 ? t(detail) : detail.slice(0, colon + 2) + t(detail.slice(colon + 2)); };
    const localAdvice = report.advice.filter(advice => !report.checks.some(c => advice === `Review ${c.label}: ${c.detail}.`)).map(advice => {
      const check = report.checks.find(c => advice === `Review ${c.label}: ${c.detail}.`);
      return check ? t(`Review ${t(check.label)}: ${localCheckDetail(check.detail)}.`) : t(PLAIN_ADVICE[advice] ?? advice);
    });
    const reportStep = state?.plan.steps.find(s => s.id === report.stepId);
    const rows = report.criteria.map(c => {
      const criterion = reportStep?.rubric.criteria.find(q => q.id === c.criterionId);
      return h('div.cr-criterion', null, h('div', null, h('b', null, criterion?.name ?? c.criterionId), h('span', null, `${Math.round(c.score * 100)}%`)), h('p', null, c.evidence));
    });
    // check rows in plain words: the step's own "Done when" line (doneWhen[i] ↔ checks[i] ↔ report.checks[i]), or a
    // plain line made from the check; the grader's wording stays in the evidence fold
    const plainCheck = (i: number) => reportStep?.brief?.doneWhen[i] ?? (reportStep?.checks[i] ? doneWhenFor(reportStep.checks[i]) : t(report.checks[i].label));
    const rawChecks = report.checks.map(c => h('div.cr-criterion', null, h('div', null, h('b', null, t(c.label)), h('span', null, c.passed ? '✓' : '✗')), h('p', null, localCheckDetail(c.detail))));
    // the task card already tells students that checks read files, not output
    const cardSaysIt = !teacher() && !!reportStep?.brief?.doneWhen.length;
    review.replaceChildren(h('div.cr-feedback-title', null, h('h2', null, teacher() ? `${name} · review` : 'Your feedback'), h('strong.cr-score', { 'data-testid': 'classroom-own-score' }, int(report.score), h('small', null, ' /100'))),
      report.source === 'in-app'
        ? h('p.cr-version', null, t(`in-app code · ${report.commit.replace(/^inapp:/, '')}`))
        : h('p.cr-version', null, h('a', { href: `https://github.com/${report.repo}/commit/${report.commit}`, target: '_blank', rel: 'noopener noreferrer' }, `${report.repo} @ ${report.commit.slice(0, 8)}`)),
      codeViewer(report),
      !teacher() && !report.teacherReview && report.checks.length && !cardSaysIt
        ? h('p.cr-unreviewed', { 'data-testid': 'classroom-unreviewed-note' }, 'These checks look at your files, not at what your program prints. Your teacher will confirm that it does the task.')
        : document.createTextNode(''),
      report.improvement ? h('p', null, report.improvement > 0 ? `↑ +${int(report.improvement)} from your last submission round` : `${int(report.improvement)} from your last submission round`) : document.createTextNode(''),
      report.checks.length ? h('div.cr-checks', { 'data-testid': 'classroom-feedback-checks' }, ...report.checks.map((c, i) => h(`div.${c.passed ? 'passed' : 'missing'}`, null,
        h('b', null, `${c.passed ? '✓' : '✗'} `, ...richText(plainCheck(i))),
        h('small', null, c.passed ? 'Found in your files' : 'Not found yet: add it and submit again')))) : document.createTextNode(''),
      localAdvice.length ? h('h3', null, 'What to work on next') : document.createTextNode(''),
      localAdvice.length ? h('ul.cr-advice', null, ...localAdvice.map(a => h('li', null, a))) : document.createTextNode(''),
      h('details.cr-measurements', null, h('summary', null, 'See the measured rubric evidence'), ...rows, ...rawChecks),
      report.teacherReview ? h('p.cr-teacher-note', null, `Teacher review: ${report.teacherReview.note}`) : document.createTextNode(''));
    if (teacher() && ['coding', 'paused'].includes(state?.phase ?? '')) {
      const score = h('input', { type: 'number', value: report.score, min: 0, max: 100, 'aria-label': 'Reviewed score', 'data-testid': 'classroom-review-score' }) as HTMLInputElement;
      const note = h('input', { placeholder: 'Explain the functional review', maxlength: 2000, 'aria-label': 'Review note', 'data-testid': 'classroom-review-note' }) as HTMLInputElement;
      review.append(h('div.cr-teacher-review', null, h('h3', null, 'Teacher functionality review'), score, note, button('Record review', 'classroom-review-submit', () => app.conn.send({ t: 'classroomReview', playerId: id!, score: Number(score.value), note: note.value }))));
    }
  };

  const download = async (format: 'csv' | 'md') => {
    const response = await fetch(`/api/room/${app.room}/classroom.${format}`, { headers: { 'X-Room-Token': app.token ?? '' } });
    if (!response.ok) return toast('The classroom report could not be exported.', 'err');
    let blob = await response.blob();
    if (format === 'md' && state?.rounds.length) {
      // the teacher's private record: lesson debrief (every reviewed step), plus this round's when it's open
      const reports = app.classroomReports ?? {}, parts = [await blob.text()];
      const round = state.phase === 'feedback' ? currentDebrief(state) : null;
      if (round) parts.push(debriefMarkdown('round', round.title, round.d, t));
      parts.push(debriefMarkdown('lesson', state.plan.title, buildLessonDebrief(state, reports), t));
      blob = new Blob([parts.join('\n\n')], { type: 'text/markdown;charset=utf-8' });
    }
    const url = URL.createObjectURL(blob), link = h('a', { href: url, download: `classroom-${app.room}.${format}` }); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const controlHint = (s: ClassroomState | undefined): string => {
    if (!s) return 'Pick a Python preset and press “Use this lesson”, or write your own steps below and press “Publish lesson”.';
    const connected = s.rows.filter(r => r.connected).length, total = s.rows.length;
    const submitted = s.rows.filter(r => r.status === 'submitted').length, queued = s.rows.filter(r => r.status === 'queued').length;
    switch (s.phase) {
      case 'setup': return !connected ? 'Waiting for the first student to join: show them the QR code above.'
        : connected === 1 ? '1 student connected. Open step 1 when the class is in; late joiners can still join.'
        : `${connected} students connected. Open step 1 when the class is in; late joiners can still join.`;
      case 'coding': case 'paused':
        if (queued) return queued === 1 ? 'Checking 1 submission… the class attack unlocks when it finishes.' : `Checking ${queued} submissions… the class attack unlocks when they finish.`;
        if (!submitted) return `The class attack unlocks after the first submission (0 of ${total} submitted).`;
        return `${submitted} of ${total} submitted. Launch the class attack when you’re ready; students who haven’t submitted just don’t add damage.`;
      case 'raid': return 'The class attack is playing on the projector (about 10 seconds).';
      case 'feedback': {
        // a line the teacher can say out loud after the attack
        const last = s.rounds.at(-1), best = last?.attacks.filter(a => a.improvement > 0).sort((a, b) => b.improvement - a.improvement)[0];
        const next = s.plan.steps[s.stepIndex + 1];
        const said = best ? t(`Say: “${submitted} of ${total} of you submitted, and ${best.name} improved the most.”`) : t(`Say: “${submitted} of ${total} of you submitted.”`);
        const upNext = next ? t(`Next up: ${next.title}.`) : '';
        const how = s.stepIndex + 1 >= s.plan.steps.length ? t('“Retry this step” (in the debrief below) gives everyone another go; “Complete lesson” ends it.') : t(`“Retry this step” (in the debrief below) gives everyone another go; “Next step” starts step ${s.stepIndex + 2}.`);
        return [said, upNext, how].filter(Boolean).join(' ');
      }
      case 'complete': return 'Lesson complete. Export the results for your records.';
    }
  };
  const renderControls = () => {
    const s = state, owner = teacher();
    controls.hidden = !owner || !s;
    setText(controlsHint, owner ? controlHint(s) : ''); controlsHint.hidden = !owner;
    if (!owner || !s) return;
    const items: HTMLElement[] = [];
    const add = (label: string, action: ClassroomCommand, disabled = false) => { const btn = button(label, `classroom-${action}`, () => command(action), action === 'attack' || action === 'start' || action === 'next' ? 'btn-primary' : ''); btn.disabled = disabled; items.push(btn); };
    if (s.phase === 'setup') add('Open step 1', 'start', !s.rows.some(r => r.connected));
    if (s.phase === 'coding') add('Pause coding', 'pause');
    if (s.phase === 'paused') add('Resume coding', 'resume');
    if (['coding', 'paused'].includes(s.phase)) { add('+2 minutes', 'extend'); add('Launch class attack', 'attack', !s.rows.some(r => r.status === 'submitted') || s.rows.some(r => r.status === 'queued')); }
    // after a class attack the round debrief carries Retry / Next (one pair, next to the advice); the bar keeps ⋯
    if (s.phase === 'feedback' && !s.rounds.length) { add('Retry & improve', 'retry'); add(s.stepIndex + 1 >= s.plan.steps.length ? 'Complete lesson' : 'Open next step', 'next'); }
    if (s.phase === 'raid') {
      const raidPaused = !!s.paused;
      const btn = button(raidPaused ? '▶ Resume raid' : '⏸ Pause raid (P)', 'classroom-raid-pause', () => sendPause(!raidPaused), raidPaused ? 'btn-primary' : '');
      btn.disabled = !!s.paused?.resumeAt;
      items.push(btn);
    }
    // rarely needed, and End is final: tucked into a ⋯ menu, End styled as danger and confirmed
    const end = button('End lesson…', 'classroom-finish', () => command('finish'), 'btn-danger');
    end.disabled = !['coding', 'paused', 'feedback'].includes(s.phase) || s.rows.some(r => r.status === 'queued');
    items.push(h('details.cr-more', { 'data-testid': 'classroom-more' }, h('summary', { title: 'Export results · end the lesson' }, '⋯'),
      h('div.cr-more-menu', null,
        h('small', null, 'Results for your records'),
        button('⇩ Export CSV', 'classroom-export-csv', () => { void download('csv'); }),
        button('⇩ Export Markdown', 'classroom-export-md', () => { void download('md'); }),
        end)));
    controls.replaceChildren(...items);
  };
  const updateClock = () => {
    if (!state) { clock.classList.add('cr-clock-text'); return setText(clock, 'Ready when you are'); }
    const now = Date.now() + clockOffset;
    const frozenAt = state.paused ? state.paused.since : null; // server ms, same clock as `now`
    const ms = state.phase === 'raid' ? Math.max(0, (state.raidEndsAt ?? now) - (frozenAt ?? now)) : state.phase === 'paused' ? state.remainingMs : state.deadline === null ? null : Math.max(0, state.deadline - now);
    const seconds = ms === null ? 0 : Math.ceil(ms / 1000);
    setText(clock, ms === null ? state.phase === 'complete' ? 'Well played' : 'Teacher paced' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
    setText(headClock, ms === null ? '' : clock.textContent!); headClock.classList.toggle('cr-low', ms !== null && ms < 60_000 && state.phase === 'coding');
    clock.classList.toggle('cr-clock-text', ms === null);
  };
  // ServerMsg "kicked" (the teacher removed this student): calm screen, no reconnect, offer to download the code
  const showKicked = (by: string) => {
    if (kickedOut) return;
    kickedOut = true;
    app.conn.close();
    // keep the resume token: the server bans it, so reopening the link is refused. Clearing it would make this an
    // anonymous newcomer the server lets back in (students have no GitHub identity to ban).
    const files = state?.plan.steps[state.stepIndex]?.starter?.length ? inApp.files() : undefined;
    pause.el.remove();
    el.classList.add('cr-kicked');
    el.replaceChildren(h('header.cr-header', null, h('a.cr-brand', { href: '/', 'aria-label': 'GITZILLA classroom' }, wordmark({ width: 'clamp(116px, 28vw, 168px)' }), h('small', null, 'classroom'))),
      createClassroomKicked({ by, room: app.room, files, onHome: () => location.assign('/') }));
  };
  // a hidden score: says so plainly; press and hold (or keyboard focus) peeks at it on this device
  const hiddenChip = (value: HTMLElement, name: string) => {
    const chip = h('button.cr-hidden-chip', { type: 'button', title: 'Press and hold to peek', 'aria-label': `${name}: score hidden. Press and hold to peek.`, 'data-testid': 'classroom-hidden-score' },
      h('span.cr-hidden-label', null, '🙈 hidden'), h('span.cr-hidden-value', null, value));
    const peek = (on: boolean) => chip.classList.toggle('peek', on);
    chip.addEventListener('pointerdown', (e) => { e.stopPropagation(); peek(true); });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) chip.addEventListener(type, () => peek(false));
    chip.addEventListener('focus', () => peek(true));
    chip.addEventListener('click', (e) => e.stopPropagation());
    chip.addEventListener('contextmenu', (e) => e.preventDefault());   // long-press on phones peeks, no menu
    return chip;
  };
  const render = () => {
    if (kickedOut) return;
    projectorSafe = teacher() && hideScores();
    renderScoreBox();
    const rawState = app.lobby?.classroom;
    state = rawState ? { ...rawState, plan: localizeClassroomPlan(rawState.plan, locale()) } : undefined; if (state && state.serverTime !== lastServerTime) { clockOffset = state.serverTime - Date.now(); lastServerTime = state.serverTime; }
    const owner = teacher(), screen = app.role === 'screen';
    // The room owner belongs on the teacher screen. A player-role owner (legacy edu room, or ?mock=edu) has no
    // lesson yet, so open this room's teacher view instead of a student page saying "Waiting for your teacher".
    if (!screen && isOwner(app) && !state && !sentToTeacher) {
      sentToTeacher = true;
      const q = new URLSearchParams(location.search); q.set('screen', '1');
      location.replace(`${location.pathname}?${q}`);
      return;
    }
    // class-facing = the projector window, or any big screen that isn't the teacher's console: no names with scores
    const classFacing = screen && !owner;
    notTeacher.hidden = projectorView || !(screen && app.lobby && app.you && !isOwner(app));
    joinCard.hidden = !screen || !!(state && state.phase !== 'setup' && state.rows.some(r => r.connected));
    consoleBar.hidden = !owner;
    el.classList.toggle('cr-pv', projectorView);
    el.classList.toggle('cr-class-facing', classFacing);
    el.classList.toggle('cr-safe-on', owner && projectorSafe);
    el.classList.toggle('cr-raid-takeover', screen && state?.phase === 'raid');
    el.classList.toggle('cr-projector', screen); el.classList.toggle('cr-student-view', !screen);
    teacherEntry.hidden = !(app.role === 'player' && isOwner(app) && !state);
    editor.hidden = !owner || (!!state && state.phase !== 'setup'); hostBoard.hidden = !screen; studentBoard.hidden = screen;
    // A node belongs to one board at a time; roles are fixed for this page.
    if (screen && review.parentElement !== hostBoard.lastElementChild) hostBoard.lastElementChild!.append(review);
    else if (!screen && review.parentElement !== studentBoard) studentBoard.append(review);
    setText(title, state?.plan.title ?? t('Build. Review. Improve.')); setText(phase, state ? (state.phase === 'coding' && state.plan.steps[state.stepIndex]?.starter?.length ? 'Coding time' : phaseNames[state.phase]) : owner ? 'Prepare the lesson' : 'Waiting for your teacher');
    const step = state?.plan.steps[state.stepIndex];
    // steps with starter files open the in-app editor; GitHub moves into an "or submit a GitHub repo" fold
    const inAppStep = !screen && !!step?.starter?.length;
    inApp.el.hidden = !inAppStep;
    setText(studentTitle, inAppStep ? 'Your code' : 'Your GitHub version');
    if (inAppStep && step) inApp.setStep(step, state!.stepIndex > 0 ? state!.plan.steps[state!.stepIndex - 1].id : null);
    if (inAppStep && githubFields.parentElement !== githubAlt) githubAlt.append(githubFields);
    else if (!inAppStep && githubFields.parentElement !== student) githubAlt.after(githubFields);
    githubAlt.hidden = !inAppStep;
    studentBoard.classList.toggle('cr-coding', inAppStep);
    setText(taskTitle, step ? `${state!.stepIndex + 1}. ${step.title}` : t(owner ? 'A classroom built around real code' : 'Your teacher is preparing the first task'));
    // students: sticky "Step 1/3 · title · 4:32" replaces the rail + heading
    stepHead.hidden = screen || !step;
    el.classList.toggle('cr-in-step', !screen && !!step);
    stepRail.hidden = !screen && !!step; taskTitle.hidden = !screen && !!step;
    if (step) { setText(headStep, `Step ${state!.stepIndex + 1}/${state!.plan.steps.length}`); setText(headTitle, step.title); }
    const brief = withBrief(step) ? step : null;
    const db = screen && state && (owner || classFacing) ? currentDebrief(state) : null;
    debrief.el.hidden = !db;
    if (db) {
      const names = owner && (!projectorSafe || debriefNames === db.key);
      const lesson = db.kind === 'lesson' ? db.d as LessonDebrief : null;
      const last = state!.stepIndex + 1 >= state!.plan.steps.length;
      debrief.update({ kind: db.kind, debrief: db.d, mode: owner ? 'teacher' : 'projector', title: db.title, namesVisible: names,
        onShowNames: () => { debriefNames = db.key; render(); },
        onPick: id => { selected = id; revealed = id; detailsSig = ''; renderReport(id); review.scrollIntoView({ block: 'start', behavior: 'smooth' }); },
        actions: db.kind === 'round'
          ? [{ label: 'Retry this step', testid: 'classroom-retry', run: () => command('retry') }, { label: last ? 'Complete lesson' : 'Next step', testid: 'classroom-next', primary: true, run: () => command('next') }]
          : [...(lesson?.nextPresetId ? [{ label: 'Start the next lesson in a new classroom', testid: 'classroom-debrief-next-lesson', primary: true, run: () => { void openNextLesson(lesson.nextPresetId!); } }] : []),
             { label: '⇩ Export Markdown', testid: 'classroom-debrief-export', run: () => { void download('md'); } }] });
    }
    // projector during a debrief: the debrief replaces the task card
    card.el.hidden = !brief || (classFacing && !!db);
    if (brief) card.update({ step: brief, mode: classFacing ? 'projector' : owner ? 'teacher' : 'student', room: app.room, report: screen ? null : app.classroomReports?.[app.you ?? ''] });
    setText(taskText, step?.instructions ?? t('Work in your own editor, push to GitHub, and bring each new version back here. Your class will attack the Boss together.'));
    // long instructions: clamped on the teacher console ("show all"), a short summary on class-facing screens
    const longText = (step?.instructions ?? '').split('\n').length > 6 || (step?.instructions ?? '').length > 420;
    if (classFacing && step && longText) setText(taskText, summarize(step.instructions));
    // students (phones!) get the clamp too, so the editor is near the top instead of 2,600 px down
    // with a brief, students and the class see the card; the free text stays the teacher's summary on the console
    taskText.hidden = !!brief && !owner;
    moreText.hidden = classFacing || !longText || taskText.hidden;
    if (!task.classList.contains('cr-task-open')) setText(moreText, owner ? 'show all instructions' : 'Read the full task');
    phoneNote.hidden = !(classFacing && step && (longText || brief));
    task.classList.toggle('cr-task-long', !!(longText && !classFacing));
    task.classList.toggle('cr-has-brief', !!brief);
    setText(notice, state?.notice ?? ''); notice.hidden = !state?.notice;
    const s = state;
    const railSig = JSON.stringify([s?.plan.steps.map(p => p.title), s?.stepIndex, s?.attempt]);
    if (railSig !== planSig) { planSig = railSig; stepRail.replaceChildren(...(s?.plan.steps ?? []).map((st, i) => h(`span${i === s!.stepIndex ? '.current' : ''}`, null, `${i + 1} ${st.title}`))); }
    const nextExpectations = JSON.stringify(step);
    if (nextExpectations !== expectationsSig) {
      expectationsSig = nextExpectations;
      expectations.replaceChildren(h('summary', null, 'How this task is scored'),
        h('p', null, step ? `${step.checks.length ? step.checksWeight : 0}% evidence checks · ${step.checks.length ? 100 - step.checksWeight : 100}% measured rubric. Teacher reviews can override the score.` : 'Your teacher will publish the scoring criteria.'),
        h('ul', null, ...(step?.checks ?? []).map(c => h('li', null, `${c.label}${c.text ? ` · ${c.text}` : ''}`))),
        h('ul', null, ...(step?.rubric.criteria ?? []).map(c => h('li', null, c.name))));
    }
    const submitted = s?.rows.filter(r => r.status === 'submitted').length ?? 0;
    const queued = s?.rows.filter(r => r.status === 'queued').length ?? 0;
    const away = s?.rows.filter(r => !r.connected && r.status === 'empty').length ?? 0;
    const total = (s?.rows.length ?? app.lobby?.players.length ?? 0) - away;
    setText(progress, `${t(`${submitted} of ${total} submitted`)}${queued ? t(` · ${queued} checking`) : ''}${away ? t(` · ${away} offline`) : ''}${s && s.attempt > 1 ? t(` · attempt ${s.attempt}`) : ''}`);
    progressFill.style.width = `${total ? (submitted / total) * 100 : 0}%`; progressBar.hidden = !screen || !s;
    const key = JSON.stringify([s?.phase, s?.stepIndex, s?.rows.map(r => [r.status, r.connected]), owner, s?.paused ?? null]);
    const p = s?.phase === 'raid' ? s.paused : null;
    const byName = !p ? '' : p.by === app.you ? 'you' : app.lobby?.players.find(x => x.id === p.by)?.name ?? 'the teacher';
    pause.apply(p, byName, owner);
    if (key !== phaseSig) { phaseSig = key; renderControls(); }
    const reports = owner ? app.classroomReports : undefined;
    // a removed student left the roster: forget their pending confirm / selection
    for (const id of [...removing.keys()]) if (!s?.rows.some(r => r.id === id)) removing.delete(id);
    if (confirmRemove && !s?.rows.some(r => r.id === confirmRemove)) confirmRemove = null;
    if (selected && s && !s.rows.some(r => r.id === selected)) { selected = null; detailsSig = ''; }
    const rs = JSON.stringify([s?.rows, owner && s?.rows.map(r => [reports?.[r.id]?.teacherReview, reports?.[r.id]?.checks.length]), s?.phase, projectorSafe, confirmRemove, [...removing.keys()]]);
    if (rs !== rowsSig) {
      rowsSig = rs; roster.classList.toggle('cr-dense', (s?.rows.length ?? 0) > 15);
      // who needs help first: stuck → not submitted → checking → submitted (then by name). Never ranked by score.
      const ORDER: Record<string, number> = { error: 0, empty: 1, queued: 2, submitted: 3 };
      const rows = [...(s?.rows ?? [])].sort((x, y) => ORDER[x.status] - ORDER[y.status] || Number(y.connected) - Number(x.connected) || x.name.localeCompare(y.name));
      const canReview = owner && ['coding', 'paused'].includes(s?.phase ?? '');
      rosterList.replaceChildren(...rows.map(row => {
        const rep = reports?.[row.id];
        const reviewed = rep?.teacherReview;
        const statusText = !row.connected ? 'offline' : row.status === 'queued' ? 'checking code…' : row.status === 'error' ? 'stuck: needs to resubmit'
          : row.status === 'submitted' ? (reviewed ? 'reviewed by you' : owner ? 'submitted · needs your review' : 'submitted') : 'writing code';
        const pick = button('', `classroom-row-${row.id}`, () => { if (selected !== row.id) revealed = null; selected = row.id; detailsSig = ''; renderReport(selected); });
        pick.className = 'cr-row-pick';
        pick.append(h(`span.cr-status-dot.st-${row.connected ? row.status : 'offline'}`, { 'aria-hidden': 'true' }), h('span.cr-person', null, h('b', null, row.name), h('small', null, statusText)));
        // until the teacher has looked, "checks 2/2" (what was measured), not a /100 that reads as "correct"
        const passed = rep?.checks.filter(c => c.passed).length ?? 0;
        const shown = !owner ? null
          : reviewed ? h('strong.cr-points', { title: 'your reviewed score' }, int(reviewed.score))
          : row.status === 'submitted' ? h('span.cr-checks-chip', { title: 'evidence checks passed (static, not run)' }, rep?.checks.length ? `checks ${passed}/${rep.checks.length}` : `${int(row.score ?? 0)}`)
          : h('span.cr-none', { 'aria-label': 'no result yet' }, '·');
        const result = shown && projectorSafe && !shown.classList.contains('cr-none') ? hiddenChip(shown, row.name) : shown;
        const verdict = (label: string, test: string, title: string, score: (s: number) => number, note: string) =>
          h('button.cr-verdict', { type: 'button', 'data-testid': `classroom-verdict-${test}-${row.id}`, title, onclick: (e: Event) => { e.stopPropagation(); app.conn.send({ t: 'classroomReview', playerId: row.id, score: score(rep!.score), note }); } }, label);
        const verdicts = canReview && row.status === 'submitted' && rep && !reviewed
          ? h('span.cr-verdicts', null,
              verdict('✓', 'works', 'Works: it does the task (100)', () => 100, 'Works ✓'),
              verdict('✗', 'notyet', 'Not yet: it doesn’t do the task yet (max 40)', sc => Math.min(sc, 40), 'Not yet: compare your output with the task.'),
              verdict('?', 'ask', 'Ask me: let’s talk about it (score unchanged)', sc => sc, 'Ask me about this one.'))
          : null;
        // teacher console only (never the projector window or a class-facing screen): remove, confirmed inline
        const canRemove = owner && !projectorView && row.id !== app.you;
        const more = canRemove ? h('button.cr-row-more', { type: 'button', 'data-testid': `classroom-remove-${row.id}`, title: 'Remove from class', 'aria-label': `Remove ${row.name} from class`, 'aria-expanded': String(confirmRemove === row.id),
          onclick: (e: Event) => { e.stopPropagation(); confirmRemove = confirmRemove === row.id ? null : row.id; rowsSig = ''; render(); } }, '⋯') : null;
        const ask = canRemove && confirmRemove === row.id
          ? h('div.cr-remove-confirm', { role: 'group', 'data-testid': `classroom-remove-confirm-${row.id}` },
              removing.has(row.id)
                ? h('p', null, `Removing ${row.name}…`)
                : h('p', null, `Remove ${row.name} from the class? They can't rejoin this classroom. Work they already handed in stays in your exports.`),
              h('div.cr-remove-buttons', null,
                h('button.btn.btn-danger', { type: 'button', 'data-testid': `classroom-remove-yes-${row.id}`, disabled: removing.has(row.id) || undefined, onclick: () => {
                  app.conn.send({ t: 'kick', playerId: row.id });
                  // the roster update removes the row; if the server refused (error toast), let the teacher try again
                  removing.set(row.id, window.setTimeout(() => { removing.delete(row.id); rowsSig = ''; render(); }, 8000));
                  rowsSig = ''; render();
                } }, 'Remove from class'),
                h('button.btn', { type: 'button', 'data-testid': `classroom-remove-cancel-${row.id}`, onclick: () => { confirmRemove = null; rowsSig = ''; render(); } }, 'Cancel')))
          : null;
        return h(`div.cr-student${row.id === app.you ? '.cr-you' : ''}${ask ? '.cr-removing' : ''}`, { 'data-row': row.id }, pick, result, verdicts, more, ask);
      }));
      if (!s?.rows.length) rosterList.append(h('p.cr-empty', null, `Students: open ${location.origin} and join ${app.room}.`));
    }
    setText(bossName, s?.plan.bossName ?? draft.bossName);
    const hp = s?.bossHp ?? 180, max = s?.bossMaxHp ?? 180;
    bossHpFill.style.width = `${hp / max * 100}%`; setText(bossHpText, `${int(hp)} / ${int(max)}`);
    const last = s?.rounds.at(-1);
    const newRaid = s?.phase === 'raid' && last ? `${last.stepId}:${last.attempt}:${last.at}` : '';
    if (newRaid && raidKey !== newRaid) { raidKey = newRaid; boss.classList.remove('cr-attacking'); void boss.offsetWidth; boss.classList.add('cr-attacking'); }
    classBoss?.update({ name: s?.plan.bossName ?? draft.bossName, hp, maxHp: max, raidKey: newRaid ? raidKey : '' });
    if (s?.phase !== 'raid') boss.classList.remove('cr-attacking');
    boss.classList.toggle('cr-defeated', hp <= 0);
    setText(bossMessage, s?.phase === 'raid' ? 'Your code is making the attack. No controller needed.' : s?.phase === 'feedback' ? 'Review the evidence. Improve your next commit.' : s?.phase === 'complete' ? hp <= 0 ? 'Boss defeated. Keep building.' : 'Lesson complete. Every improvement moved the class forward.' : 'Push a better version. Bring the whole class closer.');
    const impact = last ? Math.round(last.bossBefore - last.bossAfter) : 0;
    setText(attackTotal, !last ? 'The first class attack is waiting.'
      : impact > 0 ? `Class impact: ${int(impact)} damage`
      : last.bossBefore <= 0 ? 'Class impact: 0 damage (the boss was already defeated)'
      // improved work but no damage: the server caps each step at its share of the boss HP
      : last.attacks.some(a => a.improvement > 0) ? 'Class impact: 0 damage (this step’s share of the boss is used up; the next step unlocks more)'
      : 'Class impact: 0 damage (no improvement since the last round)');
    const top = last?.attacks.filter(a => a.improvement > 0).sort((a, b) => b.improvement - a.improvement).slice(0, 3) ?? [];
    setText(attackNames, top.length ? `Big improvements: ${top.map(a => `${a.name} +${int(a.improvement)}`).join(' · ')}` : last ? (last.attacks.length === 1 ? '1 student contributed. Only improvements add extra damage.' : `${last.attacks.length} students contributed. Only improvements add extra damage.`) : 'All submitted code contributes. Improvements unlock extra impact.');
    const mine = s?.rows.find(r => r.id === app.you);
    const canSubmit = s?.phase === 'coding' && mine?.status !== 'queued' && app.status === 'open';
    const mineInApp = !!mine?.commit?.startsWith('inapp:');
    submit.disabled = !canSubmit;
    setText(submit, mine?.status === 'queued' && lastSource === 'github' ? 'Checking your GitHub commit…' : mine?.status === 'submitted' ? 'Submit an improved version' : 'Submit this version');
    inApp.setSubmit({ enabled: !!canSubmit, label: mine?.status === 'queued' && lastSource === 'in-app' ? 'Checking your code…' : mine?.status === 'submitted' ? 'Submit improved code' : 'Submit my code' });
    setText(submissionStatus, app.classroomErrors?.[app.you ?? ''] ?? (mine?.status === 'submitted'
      ? (mineInApp ? `Scored your code (${mine.commit!.slice(6, 12)}). Keep improving until the teacher closes submissions.` : `Scored commit ${mine.commit?.slice(0, 8)}. You can keep coding until the teacher closes submissions.`)
      : s?.phase === 'coding' ? (inAppStep ? 'Your code saves on this device as you type. Submit when you are ready.' : 'Push first, then submit. A saved local file is not a GitHub commit.')
      : s?.phase === 'raid' ? 'The class is attacking. Your scored version is locked for this round.' : 'Wait for your teacher to open coding.'));
    renderReport(owner ? selected : app.you); updateClock();
  };
  const stopLanguage = onLocaleChange(() => {
    const translated = localizeClassroomPlan(draft, locale()); draft.title = translated.title; draft.bossName = translated.bossName;
    draft.steps.forEach((step, i) => Object.assign(step, translated.steps[i]));
    rowsSig = detailsSig = phaseSig = planSig = expectationsSig = ''; refreshEditorLocale(); render();
  });
  if (teacher()) buildPlanEditor(); render();
  const timer = setInterval(() => {
    updateClock();
    if (projectorView) projectorChannel?.postMessage('projector');
    else if (teacher() && scoreMode === 'auto' && projectorSafe !== hideScores()) { rowsSig = detailsSig = ''; render(); }
  }, 1000);
  if (projectorChannel && !projectorView) projectorChannel.onmessage = (e) => { if (e.data === 'projector') projectorSeen = Date.now(); else if (e.data === 'projector-closed') projectorSeen = 0; };
  const announceClose = () => { if (projectorView) projectorChannel?.postMessage('projector-closed'); };
  addEventListener('pagehide', announceClose);
  return { el, update: render, onMsg(m) { if (m.t === 'kicked' && !teacher()) showKicked(m.by); }, destroy() { barSize?.disconnect(); for (const t of removing.values()) clearTimeout(t); announceClose(); removeEventListener('pagehide', announceClose); projectorChannel?.close(); backdrop?.destroy(); classBoss?.destroy(); inApp.dispose(); viewer?.dispose(); placeSettingsButton(); stopLanguage(); setClassroomAudio(false); document.body.classList.remove('classroom-active'); clearInterval(timer); clearInterval(pauseTimer); removeEventListener('keydown', onKey); pause.dispose(); for (const dispose of disposables) dispose(); el.remove(); } };
}
