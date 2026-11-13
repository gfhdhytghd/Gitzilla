import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassroomPlan, ClassroomReport, ClassroomRound, ClassroomState } from '../../shared/classroom';
import type { ClientMsg } from '../../shared/types';
import { pythonClassroomPlan } from '../../shared/classroom-presets';
import type { AppCtx, Screen } from './app';
import { checkText, createClassroom, parseChecks } from './classroom';
import { installTestDom, TestNode } from '../edu/test-dom';
import { t } from '../i18n';

// Keep classroom events and exports real; replace unrelated graphics and editor panels.
vi.mock('./settings', () => ({ placeSettingsButton() {} }));
vi.mock('./sound', () => ({ setClassroomAudio() {}, audio: { stopMusic() {}, onEvents() {} } }));
vi.mock('./backdrop', () => ({ createBackdrop: () => ({ canvas: document.createElement('canvas'), setTheme() {}, destroy() {} }) }));
vi.mock('../edu/class-boss', () => ({ createClassBoss: () => ({ el: document.createElement('div'), update() {}, destroy() {} }) }));
vi.mock('./github', () => ({ createGithubPicker: () => document.createElement('div'), emailLogin: vi.fn(), fetchMe: async () => ({ enabled: true, required: true, user: null }) }));
vi.mock('../edu/inapp-panel', () => ({ createInAppPanel: () => ({ el: document.createElement('div'), setStep() {}, setSubmit() {}, dispose() {} }) }));
vi.mock('./pause', () => ({ createPauseOverlay: () => ({ el: document.createElement('div'), apply() {}, tick() {}, dispose() {} }) }));
vi.mock('../i18n', async importOriginal => {
  const original = await importOriginal<typeof import('../i18n')>();
  return { ...original, t: vi.fn(original.t) };
});

let screens: Screen[];
beforeEach(() => {
  vi.useFakeTimers(); installTestDom(); screens = [];
  vi.stubGlobal('location', { origin: 'https://classroom.test', pathname: '/r/ABCD', search: '' });
  vi.stubGlobal('addEventListener', vi.fn()); vi.stubGlobal('removeEventListener', vi.fn());
  vi.stubGlobal('BroadcastChannel', undefined); vi.stubGlobal('ResizeObserver', undefined);
  vi.stubGlobal('window', { setTimeout, clearTimeout });
});
afterEach(() => {
  for (const screen of screens) screen.destroy();
  vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

function classroom(owner = true, report?: ClassroomReport) {
  const state: ClassroomState = {
    plan: pythonClassroomPlan('01-hello', 'en'), phase: owner ? 'setup' : 'coding', stepIndex: 0, attempt: 1,
    deadline: null, remainingMs: null, serverTime: Date.now(), raidEndsAt: null, bossHp: 180, bossMaxHp: 180,
    rows: [], rounds: [],
  };
  const sent: ClientMsg[] = [];
  const app = {
    room: 'ABCD', role: owner ? 'screen' : 'player', name: owner ? 'Teacher' : 'Student', you: owner ? 'teacher' : 'student',
    lobby: { ownerId: 'teacher', players: [], classroom: state }, classroomReports: report ? { student: report } : {},
    status: 'open', conn: { send: (msg: ClientMsg) => { sent.push(msg); } },
  } as unknown as AppCtx;
  const mount = () => {
    const screen = createClassroom(app); screens.push(screen);
    return screen.el as unknown as TestNode;
  };
  const root = mount();
  const get = (id: string) => {
    const node = root.querySelector(`[data-testid="${id}"]`);
    if (!node) throw new Error(`Missing ${id}`);
    return node;
  };
  const publish = (): ClassroomPlan => {
    get('classroom-save-plan').click();
    const msg = sent.at(-1);
    if (msg?.t !== 'classroomPlan') throw new Error('Lesson was not published');
    return msg.plan;
  };
  return { app, state, root, get, publish, mount, sent };
}

const feedback = (advice: string[], failed = true): ClassroomReport => ({
  stepId: pythonClassroomPlan('01-hello', 'en').steps[0].id, attempt: 1, repo: 'student/work', commit: 'abc123', submittedAt: 0,
  score: 50, improvement: 0, criteria: [], checks: [{ label: 'File exists', detail: 'Missing file', passed: !failed }], advice,
});

describe('teacher submission review placement', () => {
  it('opens a selected submission above the boss and keeps it there after updates', () => {
    const report = feedback([]);
    const { state, app, mount } = classroom(true, report);
    state.phase = 'coding';
    state.rows = [{ id: 'student', name: 'Ada', connected: true, status: 'submitted', score: 50, improvement: 0, damage: 0, totalDamage: 0, attempts: 1 }];
    const root = mount();
    const review = root.querySelector('[data-testid="classroom-feedback"]')!;
    const boss = root.querySelector('[data-testid="classroom-boss"]')!;
    const scroll = vi.spyOn(review, 'scrollIntoView');
    root.querySelector('[data-testid="classroom-row-student"]')!.click();
    expect(review.textContent).toContain('Ada · review');
    expect(review.parentElement).toBe(boss.parentElement);
    expect(review.parentElement!.children.indexOf(review)).toBeLessThan(review.parentElement!.children.indexOf(boss));
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    screens.at(-1)!.update?.(app);
    expect(review.parentElement!.children.indexOf(review)).toBeLessThan(review.parentElement!.children.indexOf(boss));
  });

  it('keeps student feedback on the student board', () => {
    const { get, root } = classroom(false, feedback([]));
    expect(get('classroom-feedback').parentElement).toBe(root.querySelector('.cr-student-board'));
  });
});

describe('classroom feedback advice', () => {
  it('keeps failed checks out of advice and points at the checks list when no other advice remains', () => {
    const { get } = classroom(false, feedback(['Review File exists: Missing file.']));
    const review = get('classroom-feedback');
    expect(review.querySelector('.cr-checks')?.textContent).toContain('Not found yet: add it and submit again');
    expect(review.textContent).toContain('Fix the missing checks above and submit again.');
    expect(t).toHaveBeenCalledWith('Fix the missing checks above and submit again.');
    expect(review.textContent).not.toContain('Review File exists: Missing file.');
    expect(review.textContent).not.toContain('What to work on next');
    expect(review.querySelector('.cr-advice')).toBeNull();
  });

  it('omits the advice block for all-clear reports with no advice', () => {
    const { get } = classroom(false, feedback([], false));
    const review = get('classroom-feedback');
    expect(review.querySelector('.cr-advice')).toBeNull();
    expect(review.textContent).not.toContain('What to work on next');
    expect(review.textContent).not.toContain('Fix the missing checks above');
  });

  it('keeps independent advice without repeating the failed-check prompt', () => {
    const { get } = classroom(false, feedback(['Review File exists: Missing file.', 'Explain your implementation.']));
    const review = get('classroom-feedback');
    expect(review.querySelector('.cr-advice')?.textContent).toBe('Explain your implementation.');
    expect(review.textContent).toContain('What to work on next');
    expect(review.textContent).not.toContain('Fix the missing checks above');
  });
});

describe('teacher edits to preset steps', () => {
  it('drops the brief on instruction edits and shows the published instructions to students', () => {
    const { get, publish, state } = classroom();
    expect(state.plan.steps[0].brief).toBeDefined();
    const instructions = get('step-instructions-0');
    instructions.value = 'Teacher-authored instructions for today.';
    instructions.dispatchEvent(new Event('input'));
    // A later check edit must not bring the old brief back.
    get('step-add-check-file-0').click();
    const plan = publish();
    expect(plan.steps[0].brief).toBeUndefined();
    expect(plan.steps[0].instructions).toBe(instructions.value);
    expect(plan.steps[1].brief).toEqual(state.plan.steps[1].brief);
    const student = classroom(false);
    student.state.plan = plan;
    const root = student.mount();
    expect(root.querySelector('.cr-instructions')?.hidden).toBe(false);
    expect(root.querySelector('.cr-instructions')?.textContent).toBe(instructions.value);
    expect(root.querySelector('[data-testid="classroom-task-card"]')?.hidden).toBe(true);
  });

  it('publishes aligned doneWhen rows after adding, reordering, replacing and removing preset checks', () => {
    const { get, publish, state } = classroom();
    const original = state.plan.steps[0];
    const checks = get('step-checks-0');
    get('step-add-check-ci-0').click();
    let step = publish().steps[0];
    expect(step.brief?.doneWhen).toEqual([...original.brief!.doneWhen, 'The GitHub check `unit-tests` passes']);
    checks.value = `ci: unit-tests\n${checks.value.split('\n').slice(0, -1).reverse().join('\n')}`;
    checks.dispatchEvent(new Event('input'));
    step = publish().steps[0];
    expect(step.brief?.doneWhen).toEqual(['The GitHub check `unit-tests` passes', ...original.brief!.doneWhen.slice().reverse()]);
    checks.value = 'file: custom.py'; checks.dispatchEvent(new Event('input'));
    step = publish().steps[0];
    expect(step.brief?.doneWhen).toEqual(['`custom.py` is in your submission']);
    expect(step.brief?.doneWhen).toHaveLength(step.checks.length);
    checks.value = ''; checks.dispatchEvent(new Event('input'));
    step = publish().steps[0];
    expect(step.checks).toEqual([]); expect(step.brief?.doneWhen).toEqual([]);
  });
});

it('escapes authored fields in both debriefs appended to the teacher Markdown download', async () => {
  const { get, state } = classroom();
  const injection = '<img src=//evil.test/x> | # *\nforged';
  const escaped = '\\<img src=//evil.test/x\\> \\| \\# \\* forged';
  state.plan.title = injection; state.plan.steps[0].title = injection;
  state.plan.steps[0].brief!.doneWhen[0] = injection;
  state.phase = 'feedback';
  state.rows = [{ id: 'student', name: injection, connected: true, status: 'empty', improvement: 0, damage: 0, totalDamage: 0, attempts: 0 }];
  state.rounds = [{ stepId: state.plan.steps[0].id, attempt: 1, at: Date.now(), bossBefore: 180, bossAfter: 170, roster: 1,
    attacks: [{ id: 'student', name: injection, score: 30, improvement: 30, damage: 10, commit: 'abc123' }],
    checkStats: [{ label: injection, passed: 0, total: 1 }] }];
  // Refresh the screen's localized state before clicking the real download action.
  screens[0].update?.({} as AppCtx);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('# Server export\n')));
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
  get('classroom-export-md').click();
  await vi.waitFor(() => expect(createUrl).toHaveBeenCalledOnce());
  const output = await (createUrl.mock.calls[0][0] as Blob).text();
  expect(output).toContain('# Server export');
  expect(output).toContain(`## Round debrief: Step 1 · ${escaped}`);
  expect(output).toContain(`## Lesson debrief: ${escaped}`);
  expect(output).toContain(`- ${escaped}:`);
  expect(output).not.toContain(injection); expect(output).not.toMatch(/(?<!\\)<img/);
});

describe('check line editor', () => {
  it('parses doctest lines into doctest source and labels them', () => {
    expect(parseChecks('doctest: main.py')).toEqual([{ id: 'check-0', kind: 'doctest', path: 'main.py', label: 'Doctest: main.py (docstring examples)' }]);
    expect(parseChecks('doctest: main.py :: add(2, 3) => 5')).toEqual([{ id: 'check-0', kind: 'doctest', path: 'main.py', label: 'Doctest: main.py :: add(2, 3) => 5', text: '>>> add(2, 3)\n5' }]);
    expect(parseChecks('doctest: main.py :: greet("Ada") => Hi\\nAda')[0].text).toBe('>>> greet("Ada")\nHi\nAda');
    expect(parseChecks('doctest: main.py :: run()')[0].text).toBe('>>> run()\n');
    expect(parseChecks('file: a.py\ndoctest: a.py :: f() => 1\ndoctest: a.py :: g() => 2').map(c => c.kind)).toEqual(['file', 'doctest', 'doctest']);
    expect(() => parseChecks('doctests: main.py')).toThrow(/doctest: path :: example => output/);
  });

  it('serializes doctest checks back to one line per example and round-trips the editor text', () => {
    expect(checkText({ checks: [{ id: 'c', kind: 'doctest', path: 'main.py', label: '' }] })).toBe('doctest: main.py');
    expect(checkText({ checks: [{ id: 'c', kind: 'doctest', path: 'main.py', label: '', text: '>>> add(2, 3)\n5' }] })).toBe('doctest: main.py :: add(2, 3) => 5');
    expect(checkText({ checks: [{ id: 'c', kind: 'doctest', path: 'main.py', label: '', text: '>>> greet()\nHi\nAda\n>>> run()\n' }] })).toBe('doctest: main.py :: greet() => Hi\\nAda\ndoctest: main.py :: run()');
    for (const src of ['doctest: main.py', 'doctest: main.py :: add(2, 3) => 5', 'doctest: main.py :: greet() => Hi\\nAda', 'file: a.py\ncontains: a.py :: x :: y\nci: unit-tests\ndoctest: a.py :: f() => 1'])
      expect(checkText({ checks: parseChecks(src) })).toBe(src);
  });

  it('adds a doctest sample for the step main file from the chip', () => {
    const { get, publish } = classroom();
    const checks = get('step-checks-0');
    checks.value = ''; checks.dispatchEvent(new Event('input'));
    get('step-add-check-doctest-0').click();
    expect(checks.value).toMatch(/^doctest: \S+\.py :: print_hello\(\) => Hello$/);
    expect(publish().steps[0].checks[0]).toMatchObject({ kind: 'doctest', text: '>>> print_hello()\nHello' });
  });
});

it('downloads the grade book CSV from the lesson debrief with the room token', async () => {
  const { get, state } = classroom();
  state.phase = 'complete';
  state.rows = [{ id: 'student', name: 'Ada', connected: true, status: 'empty', improvement: 0, damage: 0, totalDamage: 0, attempts: 0 }];
  state.rounds = [{ stepId: state.plan.steps[0].id, attempt: 1, at: Date.now(), bossBefore: 180, bossAfter: 170, roster: 1,
    attacks: [{ id: 'student', name: 'Ada', score: 90, improvement: 90, damage: 10, commit: 'abc123' }] }];
  screens[0].update?.({} as AppCtx);
  const fetchMock = vi.fn().mockResolvedValue(new Response('name,total\nAda,90\n'));
  vi.stubGlobal('fetch', fetchMock);
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:grades');
  get('classroom-grades-export').click();
  await vi.waitFor(() => expect(createUrl).toHaveBeenCalledOnce());
  expect(fetchMock).toHaveBeenCalledWith('/api/room/ABCD/grades.csv', { headers: { 'X-Room-Token': '' } });
  expect(await (createUrl.mock.calls[0][0] as Blob).text()).toBe('name,total\nAda,90\n');
});

describe('class guide link', () => {
  it('waits for a pending Markdown guide before applying a generated draft', async () => {
    const generated = { ...pythonClassroomPlan('01-hello', 'en'), title: 'Generated lesson' };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ plan: generated })));
    const teacher = classroom(); teacher.app.token = 'owner';
    const root = teacher.mount();
    const get = (id: string) => root.querySelector(`[data-testid="${id}"]`)!;
    Object.assign(get('course-file'), { files: [new File(['Python'], 'course.txt')] });
    get('course-generate').click();
    await vi.waitFor(() => expect(get('course-apply')).toBeTruthy());
    let finish!: (text: string) => void;
    Object.assign(get('lesson-guide-file'), { files: [{ name: 'instructions.md', size: 20, text: () => new Promise<string>(resolve => { finish = resolve; }) }] });
    get('lesson-guide-file').dispatchEvent(new Event('change'));
    const original = get('lesson-title').value;
    get('course-apply').click();
    expect(get('lesson-title').value).toBe(original);
    finish('Keep these instructions.');
    await vi.waitFor(() => expect(get('lesson-guide-file-status').textContent).toBe('Markdown instructions loaded.'));
    get('course-apply').click();
    expect(get('lesson-title').value).toBe('Generated lesson');
    expect(get('lesson-guide-text').value).toBe('Keep these instructions.');
  });

  it('publishes pasted instructions with a link and displays safe text across steps', () => {
    const teacher = classroom();
    const instructions = teacher.get('lesson-guide-text');
    instructions.value = '# Today\nRun `print(42)`.\n<script>alert(1)</script>';
    instructions.dispatchEvent(new Event('input'));
    const link = teacher.get('lesson-guide-url');
    link.value = 'https://canvas.example.edu/assignment';
    link.dispatchEvent(new Event('input'));
    const plan = teacher.publish();
    expect(plan.guideText).toBe(instructions.value);
    expect(plan.guideUrl).toBe(link.value);
    const student = classroom(false);
    student.state.plan = plan;
    student.state.stepIndex = 1;
    const root = student.mount();
    expect(root.querySelector('[data-testid="classroom-guide-notes"]')?.hidden).toBe(false);
    const content = root.querySelector('[data-testid="classroom-guide-text"]')!;
    expect(content.textContent).toContain('<script>alert(1)</script>');
    expect(content.querySelector('script')).toBeNull();
    expect(content.querySelector('code')?.textContent).toBe('print(42)');
    instructions.value = ''; instructions.dispatchEvent(new Event('input'));
    expect(teacher.publish().guideText).toBeUndefined();
  });

  it('publishes a teacher link and displays it to students across steps', () => {
    const teacher = classroom();
    const input = teacher.get('lesson-guide-url');
    input.value = ' https://canvas.example.edu/courses/42/pages/guide ';
    input.dispatchEvent(new Event('input'));
    const plan = teacher.publish();
    expect(plan.guideUrl).toBe(input.value.trim());
    const student = classroom(false);
    student.state.plan = plan;
    student.state.stepIndex = 1;
    const root = student.mount();
    const link = root.querySelector('[data-testid="classroom-guide-link"]')!;
    expect(link.getAttribute('href')).toBe(plan.guideUrl);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(root.querySelector('.cr-guide-resource')?.hidden).toBe(false);
    input.value = ''; input.dispatchEvent(new Event('input'));
    expect(teacher.publish().guideUrl).toBeUndefined();
  });

  it('hides absent links and rejects unsafe teacher links before publishing', () => {
    const teacher = classroom();
    expect(teacher.root.querySelector('.cr-guide-resource')?.hidden).toBe(true);
    const input = teacher.get('lesson-guide-url');
    input.value = 'javascript:alert(1)'; input.dispatchEvent(new Event('input'));
    expect(() => teacher.publish()).toThrow('Lesson was not published');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
});


describe('Canvas email entry', () => {
  it('validates email before sending and saves the trimmed address', () => {
    const { get, sent } = classroom(false);
    get('classroom-email').value = 'not-an-email'; get('classroom-email-save').click();
    expect(sent.some(m => m.t === 'classroomEmail')).toBe(false);
    expect(get('classroom-email-status').textContent).toContain('valid Canvas email');
    get('classroom-email').value = ' student@psu.edu '; get('classroom-email-save').click();
    expect(sent.at(-1)).toEqual({ t: 'classroomEmail', email: 'student@psu.edu' });
  });
  it('restores the saved email when the student reopens the classroom', () => {
    const { app, mount } = classroom(false); app.classroomEmails = { student: 'student@psu.edu' };
    const root = mount();
    expect(root.querySelector('[data-testid="classroom-email"]')?.value).toBe('student@psu.edu');
  });
});

describe('AI / teacher review setup and feedback', () => {
  it('publishes the editable 50/50 checklist and rejects invalid weights', () => {
    const { get, publish } = classroom();
    get('lesson-review-mode').value = 'review'; get('lesson-review-mode').dispatchEvent(new Event('change'));
    expect(publish().grading).toMatchObject({ automaticWeight: 50 });
    expect(publish().grading?.checklist.length).toBeGreaterThan(30);
    get('lesson-review-checklist').value = 'Use descriptive names\nHandle empty input';
    get('lesson-review-checklist').dispatchEvent(new Event('input'));
    expect(publish().grading?.checklist).toEqual(['Use descriptive names', 'Handle empty input']);
    get('lesson-auto-weight').value = '101'; get('lesson-auto-weight').dispatchEvent(new Event('input'));
    const calls = get('lesson-review-error').textContent; expect(calls).toContain('0–100');
    get('lesson-review-mode').value = 'legacy'; get('lesson-review-mode').dispatchEvent(new Event('change'));
    expect(publish().grading).toBeUndefined();
  });
  it('shows provisional feedback and hides teacher-only concerns from students', () => {
    const report = { ...feedback([]), automaticScore: 80, reviewPending: true,
      aiReview: { status: 'pending' as const, items: [], summary: 'Ask your teacher.', concerns: ['Private concern'] } };
    const { get } = classroom(false, report);
    expect(get('classroom-review-pending').textContent).toContain('provisional');
    expect(get('classroom-ai-review').textContent).not.toContain('Private concern');
  });
});

describe('class attack staged on the raid timeline', () => {
  const raidRound = (state: ClassroomState, over: Partial<ClassroomRound> = {}): ClassroomRound => ({
    stepId: state.plan.steps[0].id, attempt: 1, at: Date.now(), bossBefore: 180, bossAfter: 170, roster: 2,
    attacks: [{ id: 'student', name: 'Ada', score: 80, improvement: 0, damage: 10, commit: 'abc123' }, { id: 'other', name: 'Bo', score: 0, improvement: 0, damage: 0, commit: 'def456' }], ...over });
  const startRaid = (owner: boolean, over: Partial<ClassroomRound> = {}) => {
    const c = classroom(owner);
    const { state } = c;
    state.phase = 'raid'; state.serverTime = Date.now(); state.raidEndsAt = Date.now() + 10_000;
    state.rows = [{ id: 'student', name: 'Ada', connected: true, status: 'submitted', score: 80, improvement: 0, damage: 10, totalDamage: 25.5, attempts: 1 }];
    state.rounds = [raidRound(state, over)]; state.bossHp = state.rounds[0].bossAfter;
    const root = c.mount();
    const text = (id: string) => root.querySelector(`[data-testid="${id}"]`)!.textContent;
    return { ...c, root, text };
  };

  it('holds the final HP, impact and names back until the volleys land, then topples a killed boss near the end', () => {
    const { text, root } = startRaid(true, { bossBefore: 30, bossAfter: 0 });
    const hpText = () => root.querySelector('[data-testid="classroom-boss-hp"]')!.textContent;
    const ko = () => root.querySelector('[data-testid="classroom-boss-ko"]')!.hidden;
    expect(hpText()).toBe('30 / 180');
    expect(text('classroom-damage')).toBe('The class attack is landing…');
    expect(root.querySelector('.cr-attack-names')!.textContent).toBe('');
    vi.advanceTimersByTime(3_600);   // 3 of 6 volleys
    expect(hpText()).toBe('15 / 180');
    expect(ko()).toBe(true);
    vi.advanceTimersByTime(3_000);   // the killing blow (6.5 s)
    expect(hpText()).toBe('0 / 180');
    expect(text('classroom-damage')).toBe('The class attack is landing…');
    vi.advanceTimersByTime(1_000);   // 7.6 s: impact revealed, still toppling
    expect(text('classroom-damage')).toBe('Class impact: 30 damage');
    expect(root.querySelector('.cr-attack-names')!.textContent).toBe('');
    vi.advanceTimersByTime(1_000);   // 8.6 s: names, toppled
    expect(root.querySelector('.cr-attack-names')!.textContent).toBe('2 students attacked. In a step’s first attack, every submitted score counts.');
    expect(ko()).toBe(false);
  });

  it('freezes the staged HP while the host pauses the raid', () => {
    const { state, app, root } = startRaid(true, { bossBefore: 120, bossAfter: 60 });
    const hpText = () => root.querySelector('[data-testid="classroom-boss-hp"]')!.textContent;
    vi.advanceTimersByTime(2_000);
    expect(hpText()).toBe('110 / 180');
    state.paused = { by: 'teacher', since: Date.now(), resumeAt: null };
    screens.at(-1)!.update?.(app);
    vi.advanceTimersByTime(5_000);
    expect(hpText()).toBe('110 / 180');
    expect(root.querySelector('[data-testid="classroom-damage"]')!.textContent).toBe('The class attack is landing…');
  });

  it('never prints 0 for a small hit or a living boss, and explains a retry that dealt no damage', () => {
    const { state, app, root, text } = startRaid(true, { bossBefore: 0.5, bossAfter: 0.1 });
    state.phase = 'feedback'; state.raidEndsAt = null;
    screens.at(-1)!.update?.(app);
    expect(root.querySelector('[data-testid="classroom-boss-hp"]')!.textContent).toBe('0.1 / 180');
    expect(text('classroom-damage')).toBe('Class impact: 0.4 damage');
    state.rounds = [raidRound(state, { attempt: 2, bossBefore: 150, bossAfter: 150 })]; state.bossHp = 150;
    screens.at(-1)!.update?.(app);
    expect(text('classroom-damage')).toBe('Class impact: 0 damage (no one beat their best score for this step)');
    expect(root.querySelector('.cr-attack-names')!.textContent).toBe('2 students attacked. On a retry, only the gain over each student’s best score for this step counts.');
  });

  it('shows students their own damage once it lands on the projector, with the lesson total and a light HP bar', () => {
    const { text, root } = startRaid(false, { bossBefore: 180, bossAfter: 170 });
    expect(root.querySelector('[data-testid="classroom-my-raid"]')!.hidden).toBe(false);
    expect(text('classroom-my-damage')).toBe('Your code is in this attack. Watch the big screen!');
    expect(root.querySelector('[data-testid="classroom-my-total"]')!.hidden).toBe(true);
    expect(text('classroom-my-boss-hp')).toBe('Boss HP 180 / 180');
    vi.advanceTimersByTime(7_500);
    expect(text('classroom-my-damage')).toBe('You dealt 10 damage in this attack.');
    expect(text('classroom-my-total')).toBe('Lesson total: 25.5 damage');
    expect(text('classroom-my-boss-hp')).toBe('Boss HP 170 / 180');
    expect(root.querySelector('canvas')).toBeNull();
  });

  it('tells a student who did not submit, or whose submission dealt no damage, why', () => {
    const absent = startRaid(false, { attacks: [{ id: 'other', name: 'Bo', score: 90, improvement: 0, damage: 10, commit: 'x' }] });
    expect(absent.text('classroom-my-damage')).toContain('You didn’t submit for this attack');
    const retry = startRaid(false, { attempt: 2, bossBefore: 150, bossAfter: 150, attacks: [{ id: 'student', name: 'Ada', score: 80, improvement: 0, damage: 0, commit: 'x' }] });
    retry.state.phase = 'feedback'; retry.state.raidEndsAt = null;
    screens.at(-1)!.update?.(retry.app);
    expect(retry.text('classroom-my-damage')).toBe('Your code dealt no damage in this attack.');
    expect(retry.root.querySelector('.cr-my-why')!.textContent).toContain('only the gain over your best score');
  });
});

describe('classroom question sets', () => {
  // students get the redacted plan (no keys); the teacher gets the full one
  const questionsStep = (state: ClassroomState, full = false) => {
    const step = state.plan.steps[0];
    Object.assign(step, { mode: 'questions', questions: full ? [
      { id: 'q1', kind: 'single', prompt: 'Pick `b`', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], answer: 'b' },
      { id: 'q2', kind: 'blank', prompt: 'x = {{1}}', blanks: [{ accept: ['1'], numeric: { value: 1, tolerance: 0 } }] },
    ] : [
      { id: 'q1', kind: 'single', prompt: 'Pick `b`', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] },
      { id: 'q2', kind: 'blank', prompt: 'x = {{1}}', blankCount: 1, blankNumeric: [true] },
    ] });
    return step;
  };
  it('shows the question set instead of the code task and autosaves a pick', () => {
    const { state, app, mount, sent } = classroom(false);
    const step = questionsStep(state);
    step.questionContext = 'Use this code:\n```python\ndef f(x):\n    return x + 1\n```';
    const root = mount();
    screens.at(-1)!.update?.(app);
    expect(root.querySelector('[data-testid="question-set"]')!.hidden).toBe(false);
    // the shared code is shown once, above the questions
    expect(root.querySelectorAll('[data-testid="question-context"]').length).toBe(1);
    expect(root.querySelector('[data-testid="question-context"]')!.querySelector('.qs-code')!.textContent).toContain('return x + 1');
    expect(root.querySelector('[data-testid="question-card-q1"]')).not.toBeNull();
    expect(root.querySelector('.cr-github')!.hidden).toBe(true);
    const pick = root.querySelector('[data-testid="question-option-q1-b"]')! as unknown as { checked: boolean; dispatchEvent(e: Event): void };
    pick.checked = true; pick.dispatchEvent(new Event('change'));
    vi.advanceTimersByTime(2000);
    const save = sent.find(m => m.t === 'classroomAnswers');
    expect(save).toEqual({ t: 'classroomAnswers', stepId: step.id, attempt: 1, answers: { q1: { choice: 'b' } } });
  });
  it('hides the question score from a student until the reveal', () => {
    const { state, app, mount } = classroom(false);
    const step = questionsStep(state);
    app.classroomReports = { student: { stepId: step.id, attempt: 1, repo: 'questions', commit: 'questions', submittedAt: 0, score: 50, improvement: 0, checks: [], criteria: [], advice: [],
      answers: { q1: { answer: { choice: 'a' }, attempts: 1 } }, questionScore: 50 } };
    const root = mount();
    screens.at(-1)!.update?.(app);
    const review = root.querySelector('[data-testid="classroom-feedback"]')!;
    expect(review.textContent).toContain('Your answers are saved');
    expect(review.textContent).not.toContain('50');
    state.phase = 'feedback';
    screens.at(-1)!.update?.(app);
    expect(review.textContent).toContain('50');
  });
  it("shows only the score when the step keeps answers private ('never')", () => {
    const { state, app, mount } = classroom(false);
    const step = questionsStep(state); step.revealAnswers = 'never'; state.phase = 'feedback';
    app.classroomReports = { student: { stepId: step.id, attempt: 1, repo: 'questions', commit: 'questions', submittedAt: 0, score: 50, improvement: 0, checks: [], criteria: [], advice: [],
      answers: { q1: { answer: { choice: 'a' }, attempts: 1 } }, questionScore: 50 } };
    const root = mount();
    screens.at(-1)!.update?.(app);
    const set = root.querySelector('[data-testid="question-set"]')!;
    expect(root.querySelector('[data-testid="question-score"]')!.textContent).toContain('50');
    expect(set.textContent).toContain('keeps the answers to this quiz private');
    expect(root.querySelector('[data-testid="question-review-q1"]')).toBeNull();
  });
  it('puts the live question bars above the review panel on the teacher console', () => {
    const { state, app, mount } = classroom(true);
    const step = questionsStep(state, true); state.phase = 'coding';
    step.questions![1].prompt = '```python\nx = 7 // 2\n```\n`x` is {{1}}.';
    app.classroomQuestionLive = [{ id: 'q1', answered: 2, correct: 1, total: 3, options: [{ id: 'a', count: 1 }, { id: 'b', count: 1 }] }, { id: 'q2', answered: 0, correct: 0, total: 3 }];
    const root = mount();
    screens.at(-1)!.update?.(app);
    const live = root.querySelector('[data-testid="question-live"]')!;
    const review = root.querySelector('[data-testid="classroom-feedback"]')!;
    expect(live.hidden).toBe(false);
    expect(live.parentElement).toBe(review.parentElement);
    expect(live.parentElement!.children.indexOf(live)).toBeLessThan(live.parentElement!.children.indexOf(review));
    // the console may be on the projector: answered counts only until the teacher asks for details
    expect(live.textContent).toContain('2 of 3 answered');
    expect(live.textContent).not.toContain('% correct');
    // a blank with a code block: the label drops the code, never a "[code]" placeholder
    expect(live.textContent).not.toContain('[code]');
    expect(live.textContent).toContain('is ____.');
  });
});
