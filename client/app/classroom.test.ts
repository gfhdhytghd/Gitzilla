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
vi.mock('./sound', () => ({ setClassroomAudio() {} }));
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
