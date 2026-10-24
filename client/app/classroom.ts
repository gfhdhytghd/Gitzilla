import { placeSettingsButton } from './settings';
import { localizeClassroomPlan } from '../../shared/classroom-localize';
import { locale, onLocaleChange, t, formatNumber } from '../i18n';
import type { ClassroomPlan, ClassroomState, ClassroomStep, ClassroomReport, ClassroomCommand, ClassroomCheck } from '../../shared/classroom';
import { defaultClassroomPlan } from '../../shared/classroom-defaults';
import { pythonClassroomPresets, getPythonClassroomPresets, pythonClassroomPlan, pythonStarter, pythonTeacherGuide } from '../../shared/classroom-presets';
import { type AppCtx, type Screen, isOwner, toast } from './app';
import { h, store } from './util';
import { createGithubPicker } from './github';
import { createRubricEditor } from '../edu/rubric';
import './classroom.css';
import { setClassroomAudio } from './sound';

const setText = (el: HTMLElement, s: string) => { if (el.textContent !== s) el.textContent = s; };
const phaseNames = { setup: 'Prepare the lesson', coding: 'Build your next commit', paused: 'Coding paused', raid: 'Class attack', feedback: 'Review & improve', complete: 'Lesson complete' };
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
  let selectedPreset = pythonClassroomPresets[0].id;
  let rowsSig = '', detailsSig = '', phaseSig = '', planSig = '';
  let raidKey = '', expectationsSig = '';
  const rawChecks = new Map<string, string>();
  const disposables: (() => void)[] = [];
  let refreshEditorLocale = () => {};
  const teacher = () => app.role === 'screen' && isOwner(app);
  const title = h('h1', null, 'Build. Review. Improve.');
  const phase = h('span.cr-phase');
  const clock = h('strong.cr-clock', { 'data-testid': 'classroom-clock' });
  const progress = h('div.cr-class-progress', { 'data-testid': 'classroom-progress' });
  const head = h('header.cr-header', null,
    h('a.cr-brand', { href: '/' }, 'GIT', h('span', null, 'ZILLA'), h('small', null, 'classroom')),
    h('div.cr-title', null, title, phase),
    h('div.cr-room', null, h('span', null, 'Join room'), h('b', { 'data-testid': 'classroom-code', translate: 'no' }, app.room)),
    clock, button('Leave', 'classroom-leave', () => { if (confirm(t(teacher() ? 'End this lesson and leave?' : 'Leave this classroom?'))) app.leave(); }));
  placeSettingsButton(head);
  const taskTitle = h('h2'), taskText = h('p.cr-instructions'), stepRail = h('nav.cr-steps', { 'aria-label': 'Lesson steps' });
  const notice = h('div.cr-notice', { role: 'status' });
  const teacherEntry = h('a.btn.btn-primary', { href: `${location.pathname}?screen=1`, 'data-testid': 'classroom-open-teacher' }, 'Open teacher screen for this room');
  const task = h('section.cr-task', null, stepRail, taskTitle, taskText, progress, notice, teacherEntry);
  const controls = h('div.cr-controls', { 'data-testid': 'classroom-controls' });
  const rosterList = h('div.cr-roster-list', { 'data-testid': 'classroom-roster' });
  const roster = h('aside.cr-roster', null, h('div.cr-roster-heading', null, h('h2', null, 'Class ranking'), h('small', null, 'Current task · score /100')), rosterList);
  const bossHpFill = h('i'), bossHpText = h('strong');
  const bossName = h('h2', { translate: 'no' });
  const bossArt = h('pre.cr-boss-art', { 'aria-hidden': 'true' }, '       ▄████▄\n   ▄▄▄██▀  ▀██▄▄▄\n   ███ ▀█  █▀ ███\n    ██  ▄▄▄▄  ██\n      ████████\n   ▄███▀██▀███▄\n  ██▀  ████  ▀██\n       ██ ██\n     ▄███ ███▄');
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
  const student = h('section.cr-student-work', null, h('h2', null, 'Your next commit'),
    h('ol.cr-workflow', null, h('li', null, 'Build in your editor.'), h('li', null, 'Push your changes to GitHub.'), h('li', null, 'Submit, read feedback, improve.')),
    expectations, field('GitHub repository', repo), field('Branch / tag / commit', ref), github, submit, submissionStatus,
    h('p.cr-evidence-note', null, 'Each score is tied to an exact commit. Static evidence checks do not execute your code. GitHub checks report the CI result for that commit; your teacher can review functionality.'));
  const studentBoard = h('div.cr-student-board', null, student, review);
  const el = h('div.screen.classroom-screen', { 'data-testid': 'classroom-screen' }, head, task, controls, editor, hostBoard, studentBoard);

  const command = (action: ClassroomCommand) => app.conn.send({ t: 'classroomControl', action });
  const buildPlanEditor = () => {
    for (const dispose of disposables.splice(0)) dispose();
    const presets = h('select', { 'data-testid': 'classroom-preset-select', 'aria-label': 'Python 预设课程' },
      ...getPythonClassroomPresets(locale()).map(p => h('option', { value: p.id }, p.title))) as HTMLSelectElement;
    presets.value = selectedPreset;
    const presetSummary = h('p'), presetPrerequisite = h('p.cr-preset-meta'), presetFile = h('p.cr-preset-meta');
    const guide = h('pre.cr-teacher-guide', { 'data-testid': 'classroom-preset-guide' });
    const previewPreset = () => {
      selectedPreset = presets.value;
      const preset = getPythonClassroomPresets(locale()).find(p => p.id === selectedPreset)!;
      presetSummary.textContent = preset.summary;
      presetPrerequisite.textContent = `前置知识：${preset.prerequisite}`;
      presetFile.textContent = `3 个步骤 · 约 ${preset.minutes} 分钟 · 学生文件：${preset.file}`;
      guide.textContent = pythonTeacherGuide(selectedPreset, locale());
    };
    presets.onchange = previewPreset; previewPreset();
    const starterDownload = () => {
      const starter = pythonStarter(selectedPreset, locale()), url = URL.createObjectURL(new Blob([starter.content], { type: 'text/x-python;charset=utf-8' }));
      const link = h('a', { href: url, download: starter.filename.split('/').at(-1)! }); link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const library = h('section.cr-preset-library', { 'data-testid': 'classroom-preset-library' },
      h('h3', null, 'Python 预设课程 · 从零到 dict'),
      field('按顺序选择一课', presets), presetSummary, presetPrerequisite, presetFile,
      h('div.cr-plan-buttons', null,
        button('载入这节课', 'classroom-preset-load', () => { draft = pythonClassroomPlan(selectedPreset, locale()); rawChecks.clear(); buildPlanEditor(); }, 'btn-primary'),
        button('下载学生起始文件', 'classroom-preset-download', starterDownload)),
      h('small', null, '载入只替换下面的草稿；发布后学生才会收到。下载的 .py 文件需放入所示的 python/ 目录。所有题目可编辑。'),
      h('details', null, h('summary', null, '教师备课与复核说明'), guide));
    const lessonTitle = h('input', { value: draft.title, maxlength: 120, 'data-testid': 'lesson-title' }) as HTMLInputElement;
    lessonTitle.oninput = () => { draft.title = lessonTitle.value; };
    const target = h('input', { value: draft.bossName, maxlength: 80, 'data-testid': 'lesson-boss-name' }) as HTMLInputElement;
    target.oninput = () => { draft.bossName = target.value; };
    const steps = h('div.cr-step-editors');
    const stepInputs: { step: ClassroomStep; name: HTMLInputElement; instructions: HTMLTextAreaElement }[] = [];
    for (const [index, step] of draft.steps.entries()) {
      const name = h('input', { value: step.title, maxlength: 120, 'data-testid': `step-title-${index}` }) as HTMLInputElement;
      name.oninput = () => { step.title = name.value; };
      const instructions = h('textarea', { rows: 4, maxlength: 8000, 'data-testid': `step-instructions-${index}` }, step.instructions) as HTMLTextAreaElement;
      instructions.oninput = () => { step.instructions = instructions.value; };
      stepInputs.push({ step, name, instructions });
      const duration = h('input', { type: 'number', min: 0, max: 120, value: step.durationSec / 60, 'data-testid': `step-minutes-${index}` }) as HTMLInputElement;
      duration.oninput = () => { step.durationSec = Math.round(Number(duration.value) * 60); };
      const checks = h('textarea', { rows: 3, spellcheck: 'false', placeholder: 'file: README.md\ncontains: src/main.py :: def calculate\nci: unit-tests', 'data-testid': `step-checks-${index}` }, rawChecks.get(step.id) ?? checkText(step)) as HTMLTextAreaElement;
      const weight = h('input', { type: 'number', min: 0, max: 100, value: step.checksWeight, 'data-testid': `step-check-weight-${index}` }) as HTMLInputElement;
      weight.oninput = () => { step.checksWeight = Number(weight.value); };
      const checksWarning = h('small.cr-form-error');
      try { parseChecks(checks.value); } catch (e) { checksWarning.textContent = (e as Error).message; }
      checks.oninput = () => { rawChecks.set(step.id, checks.value); try { step.checks = parseChecks(checks.value); checksWarning.textContent = ''; } catch (e) { checksWarning.textContent = (e as Error).message; } };
      const rubricStatus = h('small', null, `Rubric: ${step.rubric.title}`);
      const rubricDetails = h('details.cr-rubric-config', null, h('summary', null, 'Edit / upload this step’s rubric'), rubricStatus);
      let rubricMounted = false;
      rubricDetails.addEventListener('toggle', () => {
        if (!rubricDetails.open || rubricMounted) return;
        rubricMounted = true;
        const ed = createRubricEditor({ current: step.rubric, room: app.room, token: app.token, onUse: r => { step.rubric = r; ed.setCurrent(r); rubricStatus.textContent = `Rubric: ${r.title}`; } });
        rubricDetails.append(ed.el); disposables.push(() => ed.dispose());
      });
      const move = (delta: number) => { const to = index + delta; if (to < 0 || to >= draft.steps.length) return; [draft.steps[index], draft.steps[to]] = [draft.steps[to], draft.steps[index]]; buildPlanEditor(); };
      steps.append(h('fieldset.cr-step-editor', null, h('legend', null, `Step ${index + 1}`), field('Task title', name), field('Student instructions', instructions),
        h('div.cr-editor-numbers', null, field('Minutes · 0 = manual', duration), field('Evidence-check weight %', weight)),
        field('Optional evidence checks · one per line', checks), checksWarning,
        h('small.cr-evidence-note', null, 'file = file exists · contains = literal text, not behavior · ci = exact GitHub check name. Functional requirements can receive a teacher review score.'),
        rubricDetails, h('div.cr-step-buttons', null, button('Move up', `step-up-${index}`, () => move(-1)), button('Move down', `step-down-${index}`, () => move(1)), button('Remove', `step-remove-${index}`, () => { if (draft.steps.length > 1) { draft.steps.splice(index, 1); buildPlanEditor(); } }))));
    }
    refreshEditorLocale = () => {
      lessonTitle.value = draft.title; target.value = draft.bossName;
      const choices = getPythonClassroomPresets(locale());
      for (const option of presets.options) option.textContent = choices.find(p => p.id === option.value)?.title ?? option.textContent;
      for (const fields of stepInputs) { fields.name.value = fields.step.title; fields.instructions.value = fields.step.instructions; }
      previewPreset();
    };
    editor.replaceChildren(h('div.cr-editor-intro', null, h('h2', null, 'Build the lesson'), h('p', null, 'Give the class a sequence of code challenges. Each task ends with one shared attack.')),
      library, h('div.cr-editor-numbers', null, field('Lesson title', lessonTitle), field('Boss name', target)), steps,
      h('div.cr-plan-buttons', null, button('+ Add step', 'classroom-add-step', () => { if (draft.steps.length < 12) { const step = localizeClassroomPlan(defaultClassroomPlan(), locale()).steps[0]; step.id = `step-${crypto.randomUUID()}`; step.title = t('New challenge'); draft.steps.push(step); buildPlanEditor(); } }),
        button('Publish lesson', 'classroom-save-plan', () => {
          if (editor.querySelector('.cr-form-error:not(:empty)')) return toast('Fix the evidence-check format before publishing.', 'err');
          app.conn.send({ t: 'classroomPlan', plan: structuredClone(draft) });
        }, 'btn-primary')));
  };

  const renderReport = (id: string | null) => {
    const report = id ? app.classroomReports?.[id] : undefined;
    const error = id ? app.classroomErrors?.[id] : undefined;
    const sig = JSON.stringify([id, report, error, teacher(), state?.phase]);
    if (sig === detailsSig) return; detailsSig = sig;
    if (!report) { review.replaceChildren(h('h2', null, teacher() ? 'Code review' : 'Your feedback'), h('p', null, error ?? (teacher() ? 'Select a student to inspect their commit, evidence and next steps.' : 'Submit your GitHub version to receive measured feedback and a next step.'))); return; }
    const name = state?.rows.find(r => r.id === id)?.name ?? app.name;
    const localCheckDetail = (detail: string) => { const colon = detail.indexOf(': '); return colon < 0 ? t(detail) : detail.slice(0, colon + 2) + t(detail.slice(colon + 2)); };
    const localAdvice = report.advice.map(advice => {
      const check = report.checks.find(c => advice === `Review ${c.label}: ${c.detail}.`);
      return check ? t(`Review ${t(check.label)}: ${localCheckDetail(check.detail)}.`) : t(advice);
    });
    const rows = report.criteria.map(c => {
      const criterion = state?.plan.steps.find(s => s.id === report.stepId)?.rubric.criteria.find(q => q.id === c.criterionId);
      return h('div.cr-criterion', null, h('div', null, h('b', null, criterion?.name ?? c.criterionId), h('span', null, `${Math.round(c.score * 100)}%`)), h('p', null, c.evidence));
    });
    review.replaceChildren(h('div.cr-feedback-title', null, h('h2', null, teacher() ? `${name} · review` : 'Your feedback'), h('strong.cr-score', { 'data-testid': 'classroom-own-score' }, formatNumber(report.score), h('small', null, ' /100'))),
      h('p.cr-version', null, h('a', { href: `https://github.com/${report.repo}/commit/${report.commit}`, target: '_blank', rel: 'noopener noreferrer' }, `${report.repo} @ ${report.commit.slice(0, 8)}`)),
      h('p', null, report.improvement > 0 ? `↑ +${formatNumber(report.improvement)} from your last submission round` : report.improvement < 0 ? `${formatNumber(report.improvement)} from your last submission round` : 'Your measured result for this task'),
      h('h3', null, 'What to work on next'), h('ul.cr-advice', null, ...localAdvice.map(a => h('li', null, a))),
      report.checks.length ? h('div.cr-checks', null, ...report.checks.map(c => h(`div.${c.passed ? 'passed' : 'missing'}`, null, h('b', null, `${c.passed ? '✓' : '○'} ${t(c.label)}`), h('small', null, localCheckDetail(c.detail))))) : document.createTextNode(''),
      h('details.cr-measurements', null, h('summary', null, 'See the measured rubric evidence'), ...rows),
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
    const url = URL.createObjectURL(await response.blob()), link = h('a', { href: url, download: `classroom-${app.room}.${format}` }); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const renderControls = () => {
    const s = state, owner = teacher();
    controls.hidden = !owner || !s;
    if (!owner || !s) return;
    const items: HTMLElement[] = [];
    const add = (label: string, action: ClassroomCommand, disabled = false) => { const btn = button(label, `classroom-${action}`, () => command(action), action === 'attack' || action === 'start' || action === 'next' ? 'btn-primary' : ''); btn.disabled = disabled; items.push(btn); };
    if (s.phase === 'setup') add('Open step 1', 'start', !s.rows.some(r => r.connected));
    if (s.phase === 'coding') add('Pause coding', 'pause');
    if (s.phase === 'paused') add('Resume coding', 'resume');
    if (['coding', 'paused'].includes(s.phase)) { add('+2 minutes', 'extend'); add('Launch class attack', 'attack', !s.rows.some(r => r.status === 'submitted') || s.rows.some(r => r.status === 'queued')); }
    if (s.phase === 'feedback') { add('Retry & improve', 'retry'); add(s.stepIndex + 1 >= s.plan.steps.length ? 'Complete lesson' : 'Open next step', 'next'); }
    if (['coding', 'paused', 'feedback'].includes(s.phase)) add('End lesson', 'finish', s.rows.some(r => r.status === 'queued'));
    items.push(button('Export CSV', 'classroom-export-csv', () => { void download('csv'); }), button('Export Markdown', 'classroom-export-md', () => { void download('md'); }));
    controls.replaceChildren(...items);
  };
  const updateClock = () => {
    if (!state) return setText(clock, 'Ready when you are');
    const now = Date.now() + clockOffset;
    const ms = state.phase === 'raid' ? Math.max(0, (state.raidEndsAt ?? now) - now) : state.phase === 'paused' ? state.remainingMs : state.deadline === null ? null : Math.max(0, state.deadline - now);
    const seconds = ms === null ? 0 : Math.ceil(ms / 1000);
    setText(clock, ms === null ? state.phase === 'complete' ? 'Well played' : 'Teacher paced' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
  };
  const render = () => {
    const rawState = app.lobby?.classroom;
    state = rawState ? { ...rawState, plan: localizeClassroomPlan(rawState.plan, locale()) } : undefined; if (state && state.serverTime !== lastServerTime) { clockOffset = state.serverTime - Date.now(); lastServerTime = state.serverTime; }
    const owner = teacher(), screen = app.role === 'screen';
    el.classList.toggle('cr-projector', screen); el.classList.toggle('cr-student-view', !screen);
    teacherEntry.hidden = !(app.role === 'player' && isOwner(app) && !state);
    editor.hidden = !owner || (!!state && state.phase !== 'setup'); hostBoard.hidden = !screen; studentBoard.hidden = screen;
    // A node belongs to one board at a time; roles are fixed for this page.
    if (screen && review.parentElement !== hostBoard.lastElementChild) hostBoard.lastElementChild!.append(review);
    else if (!screen && review.parentElement !== studentBoard) studentBoard.append(review);
    setText(title, state?.plan.title ?? t('Build. Review. Improve.')); setText(phase, state ? phaseNames[state.phase] : owner ? 'Prepare the lesson' : 'Waiting for your teacher');
    const step = state?.plan.steps[state.stepIndex];
    setText(taskTitle, step ? `${state!.stepIndex + 1}. ${step.title}` : t(owner ? 'A classroom built around real code' : 'Your teacher is preparing the first task'));
    setText(taskText, step?.instructions ?? t('Work in your own editor, push to GitHub, and bring each new version back here. Your class will attack the Boss together.'));
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
    setText(progress, `${submitted} / ${s?.rows.length ?? app.lobby?.players.length ?? 0} submitted${queued ? t(` · ${queued} checking`) : ''}${s ? t(` · attempt ${s.attempt}`) : ''}`);
    const key = JSON.stringify([s?.phase, s?.stepIndex, s?.rows.map(r => [r.status, r.connected]), owner]);
    if (key !== phaseSig) { phaseSig = key; renderControls(); }
    const rs = JSON.stringify(s?.rows);
    if (rs !== rowsSig) {
      rowsSig = rs; roster.classList.toggle('cr-dense', (s?.rows.length ?? 0) > 15);
      rosterList.replaceChildren(...(s?.rows ?? []).map((row, i) => {
        const b = button('', `classroom-row-${row.id}`, () => { selected = row.id; detailsSig = ''; renderReport(selected); }); b.className = `cr-student${row.id === app.you ? ' cr-you' : ''}`;
        b.append(h('span.cr-rank', null, row.score === undefined ? '—' : String(i + 1)), h('span.cr-person', null, h('b', null, row.name), h('small', null, !row.connected ? 'offline' : row.status === 'queued' ? 'checking commit…' : row.status === 'submitted' ? `${row.commit?.slice(0, 8)}${row.improvement > 0 ? ` · ↑${row.improvement}` : ''}` : row.status === 'error' ? 'needs resubmission' : 'writing code')),
          h('strong.cr-points', null, row.score === undefined ? '—' : formatNumber(row.score)), h('span.cr-contribution', null, row.damage > 0 ? `+${row.damage}` : ''));
        return b;
      }));
      if (!s?.rows.length) rosterList.append(h('p.cr-empty', null, `Students: open ${location.origin} and join ${app.room}.`));
    }
    setText(bossName, s?.plan.bossName ?? draft.bossName);
    const hp = s?.bossHp ?? 180, max = s?.bossMaxHp ?? 180;
    bossHpFill.style.width = `${hp / max * 100}%`; setText(bossHpText, `${formatNumber(hp)} / ${max}`);
    const last = s?.rounds.at(-1);
    const newRaid = s?.phase === 'raid' && last ? `${last.stepId}:${last.attempt}:${last.at}` : '';
    if (newRaid && raidKey !== newRaid) { raidKey = newRaid; boss.classList.remove('cr-attacking'); void boss.offsetWidth; boss.classList.add('cr-attacking'); }
    if (s?.phase !== 'raid') boss.classList.remove('cr-attacking');
    boss.classList.toggle('cr-defeated', hp <= 0);
    setText(bossMessage, s?.phase === 'raid' ? 'Your code is making the attack. No controller needed.' : s?.phase === 'feedback' ? 'Review the evidence. Improve your next commit.' : s?.phase === 'complete' ? hp <= 0 ? 'Boss defeated. Keep building.' : 'Lesson complete. Every improvement moved the class forward.' : 'Push a better version. Bring the whole class closer.');
    setText(attackTotal, last ? `Class impact: ${formatNumber(last.bossBefore - last.bossAfter)} damage` : 'The first class attack is waiting.');
    const top = last?.attacks.filter(a => a.improvement > 0).sort((a, b) => b.improvement - a.improvement).slice(0, 3) ?? [];
    setText(attackNames, top.length ? `Big improvements: ${top.map(a => `${a.name} +${formatNumber(a.improvement)}`).join(' · ')}` : last ? `${last.attacks.length} students contributed. Retrying unchanged scores does not farm extra damage.` : 'All submitted code contributes. Improvements unlock extra impact.');
    const mine = s?.rows.find(r => r.id === app.you);
    submit.disabled = s?.phase !== 'coding' || mine?.status === 'queued' || app.status !== 'open';
    setText(submit, mine?.status === 'queued' ? 'Checking your GitHub commit…' : mine?.status === 'submitted' ? 'Submit an improved version' : 'Submit this version');
    setText(submissionStatus, app.classroomErrors?.[app.you ?? ''] ?? (mine?.status === 'submitted' ? `Scored commit ${mine.commit?.slice(0, 8)}. You can keep coding until the teacher closes submissions.` : s?.phase === 'coding' ? 'Push first, then submit. A saved local file is not a GitHub commit.' : s?.phase === 'raid' ? 'The class is attacking. Your scored version is locked for this round.' : 'Wait for your teacher to open coding.'));
    renderReport(owner ? selected : app.you); updateClock();
  };
  const stopLanguage = onLocaleChange(() => {
    const translated = localizeClassroomPlan(draft, locale()); draft.title = translated.title; draft.bossName = translated.bossName;
    draft.steps.forEach((step, i) => Object.assign(step, translated.steps[i]));
    rowsSig = detailsSig = phaseSig = planSig = expectationsSig = ''; refreshEditorLocale(); render();
  });
  if (teacher()) buildPlanEditor(); render();
  const timer = setInterval(updateClock, 1000);
  return { el, update: render, destroy() { placeSettingsButton(); stopLanguage(); setClassroomAudio(false); document.body.classList.remove('classroom-active'); clearInterval(timer); for (const dispose of disposables) dispose(); el.remove(); } };
}
