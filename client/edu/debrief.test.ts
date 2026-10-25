import { describe, expect, it } from 'vitest';
import type { ClassroomReport, ClassroomRound, ClassroomState } from '../../shared/classroom';
import { pythonClassroomPlan } from '../../shared/classroom-presets';
import { ClassroomSession } from '../../server/classroom';
import { analyzeFiles } from '../../analysis/in-app';
import { buildLessonDebrief, buildRoundDebrief, DEBRIEF_TEXT } from './debrief';

function classroom(count = 3, preset = '08-functions'): ClassroomState {
  return {
    plan: pythonClassroomPlan(preset, 'en'), phase: 'feedback', stepIndex: 0, attempt: 1,
    deadline: null, remainingMs: null, serverTime: 10_000, raidEndsAt: null, bossHp: 200, bossMaxHp: 200,
    rows: Array.from({ length: count }, (_, i) => ({ id: `s${i}`, name: ['Ada', 'Ben', 'Cam'][i] ?? `Student ${i + 1}`,
      connected: i !== 1, status: 'empty', improvement: 0, damage: 0, totalDamage: 0, attempts: 0 })), rounds: [],
  };
}

/** Real preset/check shapes; teacher review explains scores that differ from file-check percentages.
 * Nominal fixture damage is one point for a new high score, zero for unchanged work. It does not
 * reimplement server balance. A separate actual-session regression covers the server's capped loss.
 */
function attack(state: ClassroomState, stepIndex: number, attempt: number, values: (number | null)[], passed?: boolean[][]) {
  const step = state.plan.steps[stepIndex];
  state.stepIndex = stepIndex; state.attempt = attempt;
  const reports: Record<string, ClassroomReport> = {};
  const attacks = state.rows.flatMap((row, i) => {
    const score = values[i];
    row.status = score === null || score === undefined ? 'empty' : 'submitted';
    if (score === null || score === undefined) return [];
    const earlier = state.rounds.filter(round => round.stepId === step.id).flatMap(round => round.attacks.filter(a => a.id === row.id));
    const improvement = score - (earlier.at(-1)?.score ?? score);
    const damage = score > Math.max(0, ...earlier.map(a => a.score)) ? 1 : 0;
    const commit = `inapp:${(i + 1).toString(16).padStart(8, '0')}`;
    row.score = score; row.improvement = improvement; row.damage = damage;
    reports[row.id] = { stepId: step.id, attempt, repo: 'in-app', commit, source: 'in-app', submittedAt: state.serverTime,
      score, improvement, teacherReview: { score, note: 'Teacher checked the worked example.' },
      checks: step.checks.map((check, index) => ({ label: check.label, passed: passed?.[i]?.[index] ?? true, detail: `${check.path}: checked` })),
      criteria: [], advice: [], files: [{ path: 'main.py', content: 'PRIVATE_SOURCE_DO_NOT_DISPLAY' }],
    };
    return [{ id: row.id, name: row.name, score, improvement, damage, commit }];
  });
  const bossBefore = state.bossHp, bossAfter = Math.max(0, bossBefore - attacks.reduce((sum, a) => sum + a.damage, 0));
  const round: ClassroomRound = { stepId: step.id, attempt, at: state.serverTime++, bossBefore, bossAfter, attacks, roster: state.rows.length,
    checkStats: step.checks.map((check, i) => ({ label: check.label, passed: Object.values(reports).filter(report => report.checks[i].passed).length, total: attacks.length })) };
  state.bossHp = bossAfter; state.rounds.push(round);
  return { round, reports };
}

describe('round teacher debrief', () => {
  it('uses a realistic three-student round, counting disconnected enrolled students and missing work', () => {
    const state = classroom(), { round, reports } = attack(state, 0, 1, [90, 70, null]);
    const model = buildRoundDebrief(state, reports, round);
    expect(model.headline).toBe('2 of 3 submitted · class average 80 · boss −1%');
    expect(model.participation).toEqual({ roster: 3, submitted: 2, missing: ['Cam'] });
    expect(model.scores).toMatchObject({ avg: 80, median: 80 });
    expect(model.scores.bands.map(band => band.count)).toEqual([0, 1, 1]);
    expect(model.needHelp.find(person => person.id === 's2')?.why).toBe(DEBRIEF_TEXT.noSubmission);
    expect(model.reteach.join(' ')).toContain('One student has no submission');
  });

  it('calculates odd medians and bands correctly for fractional review scores', () => {
    const state = classroom(5), { round, reports } = attack(state, 0, 1, [0, 49.5, 50, 79.5, 100]);
    const model = buildRoundDebrief(state, reports, round);
    expect(model.scores).toMatchObject({ avg: 55.8, median: 50 });
    expect(model.scores.bands.map(band => band.count)).toEqual([2, 2, 1]);
    expect(model.needHelp.filter(person => /Offer a short check-in/.test(person.why))).toHaveLength(2);
  });

  it('handles a class of 30 without losing missing submissions or returning unbounded suggestions', () => {
    const state = classroom(30), { round, reports } = attack(state, 0, 1, Array.from({ length: 30 }, (_, i) => i < 25 ? i * 4 : null));
    const model = buildRoundDebrief(state, reports, round);
    expect(model.participation).toMatchObject({ roster: 30, submitted: 25 });
    expect(model.participation.missing).toHaveLength(5);
    expect(model.scores.avg).toBe(48);
    expect(model.reteach.length).toBeGreaterThanOrEqual(1); expect(model.reteach.length).toBeLessThanOrEqual(3);
    expect(model.shoutouts.length).toBeLessThanOrEqual(3);
    expect(new Set(model.needHelp.map(person => person.id)).size).toBe(model.needHelp.length);
  });

  it('prefers frozen counts and weakest-first brief text even when live reports change', () => {
    const state = classroom(), { round, reports } = attack(state, 0, 1, [90, 90, 90]);
    round.checkStats![1].passed = 1; round.checkStats![2].passed = 2;
    const model = buildRoundDebrief(state, reports, round);
    expect(model.checks.map(check => check.passed)).toEqual([1, 2, 3]);
    expect(model.checks[0].text).toBe(state.plan.steps[0].brief!.doneWhen[1]);
    expect(model.reteach[0]).toContain('1/3');
    expect(model.next).toBe(DEBRIEF_TEXT.retry);
    expect(reports.s0.checks.every(check => check.passed)).toBe(true);
  });

  it('uses check labels when an older plan has no brief', () => {
    const state = classroom(), { round, reports } = attack(state, 0, 1, [80, 80, 80]);
    delete state.plan.steps[0].brief;
    expect(buildRoundDebrief(state, reports, round).checks[0].text).toBe(state.plan.steps[0].checks[0].label);
  });

  it('keeps frozen counts available after reports are lost on restart', () => {
    const state = classroom(), { round } = attack(state, 0, 1, [100, 100, 100]);
    const model = buildRoundDebrief(state, {}, round);
    expect(model.checks).toHaveLength(state.plan.steps[0].checks.length);
    expect(model.checks.every(check => check.passed === 3 && check.total === 3)).toBe(true);
    expect(model.shoutouts).toEqual([]); // 100 alone is not evidence of an individual's check results.
  });

  it('reads actual capped boss loss from a real session and reports zero loss on an unchanged retry', () => {
    let now = 10_000;
    const session = new ClassroomSession(pythonClassroomPlan('01-hello', 'en'), () => now);
    session.roster(['Ada', 'Ben', 'Cam'].map((name, i) => ({ id: `s${i}`, name, connected: true })));
    session.control('start');
    const submit = () => {
      for (const row of session.state.rows) {
        const files = [{ path: session.state.plan.steps[0].starter![0].path, content: 'print("Hello, Python!")\n' }];
        session.accept(session.begin(row.id, 'in-app'), { profile: analyzeFiles(files, 'in-app'), source: 'in-app', commit: 'inapp:12345678',
          files: files.map(file => ({ path: file.path, text: file.content })), checks: [] });
        session.review(row.id, 100, 'Teacher checked the example output.');
      }
      session.control('attack');
      const state = session.publicState(), round = state.rounds.at(-1)!;
      return { state, round, model: buildRoundDebrief(state, session.privatePayload('teacher', true).reports, round) };
    };
    const first = submit(), before = JSON.stringify(first.round);
    const loss = first.round.bossBefore - first.round.bossAfter;
    expect(loss).toBeGreaterThan(0);
    expect(first.round.attacks.reduce((sum, hit) => sum + hit.damage, 0)).toBeCloseTo(loss, 8);
    expect(first.round.bossAfter).toBeGreaterThan(0); // This step cannot consume later steps' locked health.
    expect(first.model.headline).toContain(`boss −${Math.round(loss / first.round.bossBefore * 100)}%`);
    expect(first.model.scores.avg).toBe(100);
    now += 10_001; session.tick(); session.control('retry');
    const retry = submit();
    expect(retry.round.attacks.every(hit => hit.damage === 0)).toBe(true);
    expect(retry.round.bossAfter).toBe(retry.round.bossBefore);
    expect(retry.model.headline).toContain('boss −0%');
    expect(retry.model.scores.avg).toBe(100);
    expect(JSON.stringify(session.state.rounds[0])).toBe(before);
  });

  it('falls back only to exact attack participants step/attempt reports and known denominators', () => {
    const state = classroom(), { round, reports } = attack(state, 0, 1, [80, 80, 80]);
    delete round.roster; delete round.checkStats;
    reports.s1.attempt = 2; reports.s2.stepId = state.plan.steps[1].id;
    reports.s0.checks[1].passed = false;
    reports.extra = { ...reports.s0, score: 0 }; // not an attack participant
    const model = buildRoundDebrief(state, reports, round);
    expect(model.checks.every(check => check.total === 1)).toBe(true);
    expect(model.checks[0].passed).toBe(0);
    expect(model.headline).toContain('past class size unavailable');
    expect(model.scores.avg).toBe(80);
    expect(model.reteach.join(' ')).toContain('Check details cover 1 of 3 submissions');
    expect(model.next).toBe(DEBRIEF_TEXT.reviewFirst);
  });

  it('does not turn aggregate-only old rounds into fabricated check failures', () => {
    const state = classroom(), { round } = attack(state, 0, 1, [90, 90, 90]);
    delete round.roster; delete round.checkStats;
    const model = buildRoundDebrief(state, {}, round);
    expect(model.checks).toEqual([]); expect(model.scores.avg).toBe(90);
    expect(model.reteach).toEqual([DEBRIEF_TEXT.noDetails]);
    expect(model.next).toBe(DEBRIEF_TEXT.reviewFirst);
    expect(model.shoutouts).toEqual([]);
  });

  it('does not apply a retry report to an older round', () => {
    const state = classroom(), first = attack(state, 0, 1, [30, 30, null]);
    delete first.round.checkStats;
    const second = attack(state, 0, 2, [90, 90, 90]);
    const historical = buildRoundDebrief(state, second.reports, first.round);
    expect(historical.scores.avg).toBe(30); expect(historical.checks).toEqual([]);
    expect(historical.participation.missing).toEqual([]);
    expect(historical.shoutouts).toEqual([]);
  });

  it('can describe repeated class difficulty without inventing repeated individual failures', () => {
    const state = classroom();
    attack(state, 0, 1, [60, 60, 60], Array.from({ length: 3 }, () => [true, false, true]));
    const second = attack(state, 0, 2, [65, 65, 65], [[true, false, true], [true, false, true], [true, true, true]]);
    const model = buildRoundDebrief(state, second.reports, second.round);
    expect(model.reteach.join(' ')).toContain('The class also needed this last time');
    expect(model.needHelp.every(person => !/failed twice|same check again|repeated failure/i.test(person.why))).toBe(true);
  });

  it('recommends a retry when most actual submissions are one check away', () => {
    const state = classroom(), { round, reports } = attack(state, 0, 1, [70, 70, 100], [[true, false, true], [true, false, true], [true, true, true]]);
    expect(buildRoundDebrief(state, reports, round).next).toBe(DEBRIEF_TEXT.oneAway);
  });

  it('prioritizes participation when most students have no submission', () => {
    const state = classroom(30), { round, reports } = attack(state, 0, 1, [90, 90, 90]);
    const model = buildRoundDebrief(state, reports, round);
    expect(model.participation.missing).toHaveLength(27);
    expect(model.next).toBe(DEBRIEF_TEXT.waitForClass);
  });

  it('requires actual check evidence for a full-check shoutout and highlights improvement', () => {
    const state = classroom(); attack(state, 0, 1, [40, 70, 80]);
    const { round, reports } = attack(state, 0, 2, [90, 75, 100], [[true, true, true], [true, true, true], [true, false, true]]);
    const model = buildRoundDebrief(state, reports, round);
    expect(model.shoutouts[0]).toMatchObject({ id: 's0', why: 'Improved by 50 points this round.' });
    expect(model.shoutouts.find(person => person.id === 's1')?.why).toBe(DEBRIEF_TEXT.allChecks);
    expect(model.shoutouts.some(person => person.id === 's2')).toBe(false);
    expect(model.shoutouts.every(person => !person.why.includes('first round'))).toBe(true);
  });

  it('keeps the frozen denominator after membership changes without blaming new arrivals', () => {
    const state = classroom(), { round, reports } = attack(state, 0, 1, [90, 90, null]);
    state.rows.push({ ...state.rows[2], id: 'late', name: 'New arrival' });
    const model = buildRoundDebrief(state, reports, round);
    expect(model.participation).toEqual({ roster: 3, submitted: 2, missing: [] });
    expect(model.needHelp.some(person => person.id === 'late')).toBe(false);
    expect(model.headline).toContain('2 of 3');
    state.rows = state.rows.filter(row => row.id !== 's2' && row.id !== 'late');
    expect(buildRoundDebrief(state, reports, round).participation.roster).toBe(3);
  });

  it('keeps source and names out of anonymous fields', () => {
    const state = classroom(), { round, reports } = attack(state, 0, 1, [20, 90, null]);
    const model = buildRoundDebrief(state, reports, round);
    const anonymous = JSON.stringify({ headline: model.headline, scores: model.scores, checks: model.checks, reteach: model.reteach, next: model.next });
    expect(anonymous).not.toMatch(/Ada|Ben|Cam|PRIVATE_SOURCE/);
    expect(JSON.stringify(model)).not.toContain('PRIVATE_SOURCE');
    expect(model.needHelp.some(person => person.name === 'Ada')).toBe(true);
  });
});

describe('lesson teacher debrief', () => {
  it('uses the latest settled retry once, retaining the biggest recorded improvement', () => {
    const state = classroom(); attack(state, 0, 1, [30, 60, null]); attack(state, 0, 2, [80, 90, null]);
    const final = attack(state, 0, 3, [80, 90, null]);
    const model = buildLessonDebrief(state, final.reports);
    expect(model.steps).toHaveLength(1);
    expect(model.steps[0]).toMatchObject({ stepId: state.plan.steps[0].id, attempt: 3, attempts: 3, avg: 85, submitted: 2, roster: 3 });
    expect(model.scores.avg).toBe(85); expect(model.participation.submitted).toBe(2);
    expect(model.participation.missing).toEqual(['Cam']);
    expect(model.shoutouts[0].why).toContain('Improved by 50 points');
    expect(model.next).toContain('Return to step 2');
  });

  it('summarizes each completed preset step and recommends the next Python lesson', () => {
    const state = classroom(3, '01-hello');
    attack(state, 0, 1, [80, 90, null]); attack(state, 1, 1, [60, 80, 100]);
    const final = attack(state, 2, 1, [90, 90, 90]); state.phase = 'complete';
    const model = buildLessonDebrief(state, final.reports);
    expect(model.steps.map(step => step.title)).toEqual(state.plan.steps.map(step => step.title));
    expect(model.steps.map(step => step.avg)).toEqual([85, 80, 90]);
    expect(model.scores.avg).toBe(85); // 680 points / 8 submitted student-steps, not 3 rounds equally weighted.
    expect(model.participation).toEqual({ roster: 3, submitted: 3, missing: [] });
    expect(model.nextPresetId).toBe('02-numbers'); expect(model.next).toBe('Try Python lesson 02 next.');
    expect(model.steps.every(step => step.weakestCheck !== null)).toBe(true);
  });

  it('does not erase earlier participation when a student misses a retry', () => {
    const state = classroom(); attack(state, 0, 1, [90, 90, 90]);
    const final = attack(state, 0, 2, [100, null, 100]);
    const model = buildLessonDebrief(state, final.reports);
    expect(model.participation).toEqual({ roster: 3, submitted: 3, missing: [] });
    expect(model.steps[0].submitted).toBe(2); expect(model.scores.avg).toBe(100);
    expect(model.needHelp.find(person => person.id === 's1')?.why).toBe(DEBRIEF_TEXT.noSubmission);
    expect(model.needHelp.some(person => person.why === DEBRIEF_TEXT.noLessonSubmission)).toBe(false);
  });

  it('puts revisiting a difficult step ahead of advancing to another preset', () => {
    const state = classroom(3, '01-hello'); attack(state, 0, 1, [90, 90, 90]); attack(state, 1, 1, [20, 40, 30]);
    const final = attack(state, 2, 1, [90, 90, 90]); state.phase = 'complete';
    const model = buildLessonDebrief(state, final.reports);
    expect(model.next).toBe(`Start next time by revisiting ${state.plan.steps[1].title}.`);
    expect(model.nextPresetId).toBeUndefined();
    expect(model.needHelp.find(person => person.id === 's0')?.why).toBe(`Score 20 on ${state.plan.steps[1].title}. Check one example together.`);
  });

  it('does not repeat the final Python preset and handles checkless teacher tasks', () => {
    const state = classroom(3, '09-dict');
    for (const step of state.plan.steps) { step.checks = []; if (step.brief) step.brief.doneWhen = []; }
    attack(state, 0, 1, [80, 80, 80]); attack(state, 1, 1, [80, 80, 80]); const final = attack(state, 2, 1, [80, 80, 80]);
    const model = buildLessonDebrief(state, final.reports);
    expect(model.next).toBe(DEBRIEF_TEXT.project); expect(model.nextPresetId).toBeUndefined();
    expect(model.checks).toEqual([]); expect(model.steps.every(step => step.weakestCheck === null)).toBe(true);
    expect(model.reteach).toEqual([DEBRIEF_TEXT.showWork]);
  });

  it('returns a useful empty lesson without NaN, infinity, or claims of failing checks', () => {
    const state = classroom();
    const model = buildLessonDebrief(state, {});
    expect(model.headline).toBe(DEBRIEF_TEXT.emptyLesson); expect(model.steps).toEqual([]);
    expect(model.scores).toMatchObject({ avg: 0, median: 0 }); expect(model.checks).toEqual([]);
    expect(model.next).toBe(DEBRIEF_TEXT.startLesson);
    expect(JSON.stringify(model)).not.toMatch(/NaN|Infinity|undefined|\{\d\}/);
  });

  it('does not mutate input snapshots/reports and returns detached output objects', () => {
    const state = classroom(), { round, reports } = attack(state, 0, 1, [90, 80, 70]);
    const before = JSON.stringify({ state, reports });
    const first = buildRoundDebrief(state, reports, round), lesson = buildLessonDebrief(state, reports);
    first.checks[0].text = 'changed'; lesson.steps[0].weakestCheck!.text = 'changed'; lesson.scores.bands[0].count = 99;
    expect(JSON.stringify({ state, reports })).toBe(before);
    expect(buildRoundDebrief(state, reports, round).checks[0].text).not.toBe('changed');
    expect(buildLessonDebrief(state, reports).steps[0].weakestCheck!.text).not.toBe('changed');
  });
});
