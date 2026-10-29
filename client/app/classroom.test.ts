import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassroomPlan, ClassroomReport, ClassroomState } from '../../shared/classroom';
import type { ClientMsg } from '../../shared/types';
import { pythonClassroomPlan } from '../../shared/classroom-presets';
import type { AppCtx, Screen } from './app';
import { createClassroom } from './classroom';
import { installTestDom, TestNode } from '../edu/test-dom';
import { t } from '../i18n';

// Keep classroom events and exports real; replace unrelated graphics and editor panels.
vi.mock('./settings', () => ({ placeSettingsButton() {} }));
vi.mock('./sound', () => ({ setClassroomAudio() {} }));
vi.mock('./backdrop', () => ({ createBackdrop: () => ({ canvas: document.createElement('canvas'), setTheme() {}, destroy() {} }) }));
vi.mock('../edu/class-boss', () => ({ createClassBoss: () => ({ el: document.createElement('div'), update() {}, destroy() {} }) }));
vi.mock('./github', () => ({ createGithubPicker: () => document.createElement('div') }));
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
  return { app, state, root, get, publish, mount };
}

const feedback = (advice: string[], failed = true): ClassroomReport => ({
  stepId: pythonClassroomPlan('01-hello', 'en').steps[0].id, attempt: 1, repo: 'student/work', commit: 'abc123', submittedAt: 0,
  score: 50, improvement: 0, criteria: [], checks: [{ label: 'File exists', detail: 'Missing file', passed: !failed }], advice,
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
