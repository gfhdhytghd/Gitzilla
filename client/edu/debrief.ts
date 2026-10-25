/**
 * Pure teacher debriefs; no DOM, clock, storage, network, AI, or student-source inspection.
 * i18n: plain English from exported DEBRIEF_TEXT templates with numbered {0} placeholders.
 * The UI passes returned sentences through t(); add these templates to its translation catalog.
 * Step titles and brief.doneWhen/check labels are already teacher-provided/localized values.
 * Names occur only in participation.missing, needHelp and shoutouts: keep those teacher-only.
 *
 * Frozen attacks decide scores; frozen checkStats win over live reports. Legacy rounds use
 * only exact step+attempt reports belonging to their attacks, with each check's known denominator.
 * No reports means unknown checks, never invented failures. Old roster fallback is the current
 * class size (at least submitted); the headline explicitly says past class size is unavailable.
 * We cannot prove repeated individual check failures or a later first-ever full pass: reports
 * retain only the latest attempt. Repeated difficulties below are explicitly class-wide.
 */
import type { ClassroomAttack, ClassroomReport, ClassroomRound, ClassroomState } from '../../shared/classroom';
import { pythonClassroomPresets } from '../../shared/classroom-presets';

export interface DebriefCheck { text: string; passed: number; total: number }
export interface Debrief {
  headline: string;
  participation: { roster: number; submitted: number; missing: string[] };
  scores: { avg: number; median: number; bands: { label: string; count: number }[] };
  checks: DebriefCheck[];
  reteach: string[];
  needHelp: { id: string; name: string; why: string }[];
  shoutouts: { id: string; name: string; why: string }[];
  next: string;
}
export interface LessonStepDebrief {
  stepId: string; title: string; attempt: number; attempts: number;
  avg: number; median: number; submitted: number; roster: number;
  weakestCheck: DebriefCheck | null;
}
export interface LessonDebrief extends Debrief {
  /** One row per reviewed step, in plan order; latest settled attempt only, not every retry. */
  steps: LessonStepDebrief[];
  /** Navigation target when recommending the next official Python preset. */
  nextPresetId?: string;
}
export type DebriefReports = Readonly<Record<string, ClassroomReport>>;

export const DEBRIEF_TEXT = {
  round: '{0} of {1} submitted · class average {2} · boss −{3}%',
  legacyRound: '{0} submissions · average {1} · boss −{2}% · past class size unavailable',
  emptyRound: 'No submissions to review yet.',
  lesson: 'Steps reviewed: {0} · students with submissions: {1} · class average {2}',
  emptyLesson: 'No class rounds have been reviewed yet.',
  lowBand: 'Below 50', middleBand: '50 to under 80', highBand: '80–100',
  practice: '{0}/{1}: {2}. Work through one example together.',
  repeatPractice: '{0}/{1}: {2}. The class also needed this last time; try a different example.',
  missing: '{0} students have no submission. Check that they can open the editor and send their work.',
  missingOne: 'One student has no submission. Check that they can open the editor and send their work.',
  noDetails: 'The check details are unavailable. Ask students to show one example before choosing what to revisit.',
  partialDetails: 'Check details cover {0} of {1} submissions. Ask the others to show their work.',
  showWork: 'Ask students to show the result and explain one change they made.',
  explain: 'Ask a few students to explain how their code works before moving on.',
  noSubmission: 'No submission in this round. Help them send one small change.',
  lowScore: 'Score {0}. Offer a short check-in and one small next step.',
  failedCheck: 'Take a look together: {0}',
  improved: 'Improved by {0} points this round.',
  improvedStep: 'Improved by {0} points on {1}.',
  firstChecks: 'Met every recorded check on the first round.',
  allChecks: 'Met every recorded check this round.',
  submitFirst: 'Open this step again so students can send their work.',
  waitForClass: 'Give students time to submit before moving on.',
  oneAway: 'Retry this step; most submitted work is one check away.',
  retry: 'Work through one example together, then retry this step.',
  reviewFirst: 'Check one example of student work before choosing the next step.',
  nextStep: 'Move on to step {0}: {1}.',
  finish: 'Finish the lesson and ask students to explain one change they made.',
  noLessonSubmission: 'No submission in the reviewed rounds. Help them get started.',
  lessonLow: 'Average {0} across {1} submitted steps. Offer a short check-in.',
  lessonLowOne: 'Score {0} on the submitted step. Offer a short check-in.',
  lowStep: 'Score {0} on {1}. Check one example together.',
  stepCheck: '{0}: {1}',
  reviewStep: 'Start next time by revisiting {0}.',
  returnStep: 'Return to step {0}: {1} before starting a new lesson.',
  startLesson: 'Review the first task and invite one small submission.',
  nextPython: 'Try Python lesson {0} next.',
  project: 'Choose a small project that combines what the class practiced.',
  nextLesson: 'Choose a short task that uses today’s ideas in a new way.',
} as const;

const say = (template: string, ...values: (string | number)[]) => template.replace(/\{(\d+)\}/g, (_, i: string) => String(values[Number(i)]));
const rounded = (value: number) => Math.round(value * 10) / 10;
const rate = (check: Pick<DebriefCheck, 'passed' | 'total'>) => check.passed / check.total;
const stepFor = (state: ClassroomState, round: ClassroomRound) => state.plan.steps.find(step => step.id === round.stepId);
const matchingReports = (reports: DebriefReports, round: ClassroomRound) => round.attacks.flatMap(attack => {
  const report = reports[attack.id];
  return report?.stepId === round.stepId && report.attempt === round.attempt ? [{ id: attack.id, report }] : [];
});
const rosterFor = (state: ClassroomState, round: ClassroomRound) => round.roster ?? Math.max(state.rows.length, round.attacks.length);
const isCurrent = (state: ClassroomState, round: ClassroomRound) => state.plan.steps[state.stepIndex]?.id === round.stepId && state.attempt === round.attempt;

function scoresFor(attacks: readonly ClassroomAttack[]): Debrief['scores'] {
  const values = attacks.map(attack => attack.score).sort((a, b) => a - b), count = values.length;
  return {
    avg: count ? rounded(values.reduce((sum, score) => sum + score, 0) / count) : 0,
    median: count ? rounded(count % 2 ? values[Math.floor(count / 2)] : (values[count / 2 - 1] + values[count / 2]) / 2) : 0,
    bands: [
      { label: DEBRIEF_TEXT.lowBand, count: values.filter(score => score < 50).length },
      { label: DEBRIEF_TEXT.middleBand, count: values.filter(score => score >= 50 && score < 80).length },
      { label: DEBRIEF_TEXT.highBand, count: values.filter(score => score >= 80).length },
    ],
  };
}

function checksFor(state: ClassroomState, reports: DebriefReports, round: ClassroomRound): (DebriefCheck & { index: number })[] {
  const step = stepFor(state, round), known = matchingReports(reports, round);
  const text = (index: number, label: string) => step?.brief?.doneWhen[index] || step?.checks[index]?.label || label;
  const rows = round.checkStats !== undefined ? round.checkStats.map((check, index) => ({
    index, text: text(index, check.label), passed: check.passed, total: check.total,
  })) : Array.from({ length: step?.checks.length ?? Math.max(0, ...known.map(({ report }) => report.checks.length)) }, (_, index) => {
    const checks = known.flatMap(({ report }) => report.checks[index] ? [report.checks[index]] : []);
    return { index, text: text(index, checks[0]?.label ?? ''), passed: checks.filter(check => check.passed).length, total: checks.length };
  });
  return rows.filter(check => check.total > 0).sort((a, b) => rate(a) - rate(b) || a.index - b.index);
}
const publicCheck = ({ text, passed, total }: DebriefCheck): DebriefCheck => ({ text, passed, total });

function roundReteach(state: ClassroomState, round: ClassroomRound, checks: ReturnType<typeof checksFor>, missing: number): string[] {
  const coverage = Math.max(0, ...checks.map(check => check.total));
  const partial = coverage > 0 && coverage < round.attacks.length;
  const limit = 3 - (missing > 0 ? 1 : 0) - (partial ? 1 : 0);
  const tips = checks.filter(check => rate(check) < 0.75).slice(0, limit).map(check => {
    const repeated = state.rounds.some(earlier => earlier.stepId === round.stepId && earlier.attempt < round.attempt &&
      (earlier.checkStats?.[check.index]?.total ?? 0) > 0 && rate(earlier.checkStats![check.index]) < 0.75);
    return say(repeated ? DEBRIEF_TEXT.repeatPractice : DEBRIEF_TEXT.practice, check.passed, check.total, check.text);
  });
  if (missing > 0) tips.push(missing === 1 ? DEBRIEF_TEXT.missingOne : say(DEBRIEF_TEXT.missing, missing));
  if (partial) tips.push(say(DEBRIEF_TEXT.partialDetails, coverage, round.attacks.length));
  if (!tips.length) tips.push(checks.length ? DEBRIEF_TEXT.explain : stepFor(state, round)?.checks.length === 0 ? DEBRIEF_TEXT.showWork : DEBRIEF_TEXT.noDetails);
  return tips.slice(0, 3);
}

function helpersFor(state: ClassroomState, reports: DebriefReports, round: ClassroomRound): Debrief['needHelp'] {
  const submitted = new Set(round.attacks.map(attack => attack.id)), step = stepFor(state, round);
  // Historical membership IDs were not recorded; only name missing students for the current step/attempt.
  const stableRoster = round.roster === undefined || round.roster === state.rows.length;
  const missing = isCurrent(state, round) && stableRoster ? state.rows.filter(row => !submitted.has(row.id)).map(row => ({
    id: row.id, name: row.name, why: DEBRIEF_TEXT.noSubmission,
  })) : [];
  const help = [...round.attacks].sort((a, b) => a.score - b.score).flatMap(attack => {
    if (attack.score < 50) return [{ id: attack.id, name: attack.name, why: say(DEBRIEF_TEXT.lowScore, attack.score) }];
    const report = matchingReports(reports, round).find(item => item.id === attack.id)?.report;
    const failed = report?.checks.findIndex(check => !check.passed) ?? -1;
    return failed < 0 ? [] : [{ id: attack.id, name: attack.name, why: say(DEBRIEF_TEXT.failedCheck, step?.brief?.doneWhen[failed] || report!.checks[failed].label) }];
  });
  return [...missing, ...help];
}

function shoutoutsFor(state: ClassroomState, reports: DebriefReports, round: ClassroomRound): Debrief['shoutouts'] {
  const out: Debrief['shoutouts'] = [];
  const improved = [...round.attacks].filter(attack => attack.improvement > 0).sort((a, b) => b.improvement - a.improvement)[0];
  if (improved) out.push({ id: improved.id, name: improved.name, why: say(DEBRIEF_TEXT.improved, improved.improvement) });
  const step = stepFor(state, round);
  for (const attack of round.attacks) {
    const report = matchingReports(reports, round).find(item => item.id === attack.id)?.report;
    if (step?.checks.length && report?.checks.length === step.checks.length && report.checks.every(check => check.passed) && !out.some(item => item.id === attack.id)) {
      out.push({ id: attack.id, name: attack.name, why: round.attempt === 1 ? DEBRIEF_TEXT.firstChecks : DEBRIEF_TEXT.allChecks });
    }
    if (out.length === 3) break;
  }
  return out;
}

function nextFor(state: ClassroomState, reports: DebriefReports, round: ClassroomRound, checks: DebriefCheck[], avg: number): string {
  if (!round.attacks.length) return DEBRIEF_TEXT.submitFirst;
  if (rosterFor(state, round) - round.attacks.length > round.attacks.length) return DEBRIEF_TEXT.waitForClass;
  const step = stepFor(state, round);
  const oneAway = matchingReports(reports, round).filter(({ report }) => report.checks.length === step?.checks.length && report.checks.filter(check => !check.passed).length === 1).length;
  if (oneAway > round.attacks.length / 2) return DEBRIEF_TEXT.oneAway;
  if (checks.some(check => check.total < round.attacks.length)) return DEBRIEF_TEXT.reviewFirst;
  if (avg < 60 || (checks[0] && rate(checks[0]) < 0.6)) return DEBRIEF_TEXT.retry;
  if (!checks.length && step?.checks.length) return DEBRIEF_TEXT.reviewFirst;
  const index = state.plan.steps.findIndex(item => item.id === round.stepId), next = state.plan.steps[index + 1];
  return index >= 0 && next ? say(DEBRIEF_TEXT.nextStep, index + 2, next.title) : DEBRIEF_TEXT.finish;
}

export function buildRoundDebrief(state: ClassroomState, reports: DebriefReports, round: ClassroomRound): Debrief {
  const submitted = round.attacks.length, roster = rosterFor(state, round), scores = scoresFor(round.attacks);
  const checks = checksFor(state, reports, round), needHelp = helpersFor(state, reports, round);
  const bossLoss = round.bossBefore > 0 ? Math.round(Math.max(0, round.bossBefore - round.bossAfter) / round.bossBefore * 100) : 0;
  return {
    headline: !submitted ? DEBRIEF_TEXT.emptyRound : round.roster === undefined
      ? say(DEBRIEF_TEXT.legacyRound, submitted, scores.avg, bossLoss)
      : say(DEBRIEF_TEXT.round, submitted, roster, scores.avg, bossLoss),
    participation: { roster, submitted, missing: needHelp.filter(item => item.why === DEBRIEF_TEXT.noSubmission).map(item => item.name) },
    scores, checks: checks.map(publicCheck), reteach: roundReteach(state, round, checks, Math.max(0, roster - submitted)), needHelp,
    shoutouts: shoutoutsFor(state, reports, round), next: nextFor(state, reports, round, checks, scores.avg),
  };
}

/** Latest settled attempt per reviewed step; retries never add another lesson-score row.
 * Overall scores weight each latest submitted student-step equally. Participation counts distinct
 * students across all recorded attempts; missing a retry does not erase earlier participation.
 * Roster is the largest known class size (never below known submitters).
 */
export function buildLessonDebrief(state: ClassroomState, reports: DebriefReports): LessonDebrief {
  const latest = new Map<string, ClassroomRound>();
  for (const round of state.rounds) latest.set(round.stepId, round);
  const rounds = state.plan.steps.flatMap(step => latest.has(step.id) ? [latest.get(step.id)!] : []);
  const models = rounds.map(round => buildRoundDebrief(state, reports, round));
  const reviewedIds = new Set(rounds.map(round => round.stepId));
  const recorded = state.rounds.filter(round => reviewedIds.has(round.stepId));
  const attacks = rounds.flatMap(round => round.attacks);
  const submittedIds = new Set(recorded.flatMap(round => round.attacks.map(attack => attack.id)));
  const roster = Math.max(state.rows.length, submittedIds.size, 0, ...rounds.map(round => rosterFor(state, round)));
  const missing = state.rows.filter(row => !submittedIds.has(row.id)), scores = scoresFor(attacks);
  const checks = models.flatMap((model, i) => model.checks.map(check => ({ ...check, text: say(DEBRIEF_TEXT.stepCheck, stepFor(state, rounds[i])!.title, check.text) })))
    .sort((a, b) => rate(a) - rate(b));
  const steps: LessonStepDebrief[] = rounds.map((round, i) => ({
    stepId: round.stepId, title: stepFor(state, round)!.title, attempt: round.attempt,
    attempts: state.rounds.filter(item => item.stepId === round.stepId).length,
    avg: models[i].scores.avg, median: models[i].scores.median, submitted: round.attacks.length,
    roster: models[i].participation.roster, weakestCheck: models[i].checks[0] ? { ...models[i].checks[0] } : null,
  }));
  const needHelp: Debrief['needHelp'] = missing.map(row => ({ id: row.id, name: row.name, why: DEBRIEF_TEXT.noLessonSubmission }));
  for (const id of new Set(attacks.map(attack => attack.id))) {
    const work = attacks.filter(attack => attack.id === id), avg = scoresFor(work).avg;
    if (avg < 50) needHelp.push({ id, name: work.at(-1)!.name, why: work.length === 1 ? say(DEBRIEF_TEXT.lessonLowOne, avg) : say(DEBRIEF_TEXT.lessonLow, avg, work.length) });
    else {
      const low = rounds.flatMap(round => round.attacks.filter(attack => attack.id === id && attack.score < 50).map(attack => ({ attack, round })))
        .sort((a, b) => a.attack.score - b.attack.score)[0];
      if (low) needHelp.push({ id, name: low.attack.name, why: say(DEBRIEF_TEXT.lowStep, low.attack.score, stepFor(state, low.round)!.title) });
    }
  }
  const last = models.at(-1);
  for (const item of last?.needHelp ?? []) if (!needHelp.some(person => person.id === item.id)) needHelp.push({ ...item });
  const shoutouts: Debrief['shoutouts'] = [];
  const improved = recorded.flatMap(round => round.attacks.map(attack => ({ attack, round }))).filter(({ attack }) => attack.improvement > 0)
    .sort((a, b) => b.attack.improvement - a.attack.improvement)[0];
  if (improved) shoutouts.push({ id: improved.attack.id, name: improved.attack.name, why: say(DEBRIEF_TEXT.improvedStep, improved.attack.improvement, stepFor(state, improved.round)!.title) });
  for (const item of last?.shoutouts ?? []) if (shoutouts.length < 3 && !shoutouts.some(person => person.id === item.id)) shoutouts.push({ ...item });
  const reteach = steps.filter(step => step.weakestCheck && rate(step.weakestCheck) < 0.75).sort((a, b) => rate(a.weakestCheck!) - rate(b.weakestCheck!)).slice(0, 3)
    .map(step => say(DEBRIEF_TEXT.practice, step.weakestCheck!.passed, step.weakestCheck!.total, say(DEBRIEF_TEXT.stepCheck, step.title, step.weakestCheck!.text)));
  if (!reteach.length) reteach.push(checks.length ? DEBRIEF_TEXT.explain : !rounds.length ? DEBRIEF_TEXT.startLesson
    : rounds.some(round => stepFor(state, round)?.checks.length) ? DEBRIEF_TEXT.noDetails : DEBRIEF_TEXT.showWork);
  let next: string = DEBRIEF_TEXT.startLesson, nextPresetId: string | undefined;
  const unfinished = state.plan.steps.findIndex(step => !latest.has(step.id));
  const revisit = [...steps].sort((a, b) => a.avg - b.avg).find(step => step.avg < 60 || (step.weakestCheck && rate(step.weakestCheck) < 0.6));
  if (revisit) next = say(DEBRIEF_TEXT.reviewStep, revisit.title);
  else if (rounds.length && unfinished >= 0) next = say(DEBRIEF_TEXT.returnStep, unfinished + 1, state.plan.steps[unfinished].title);
  else if (rounds.length) {
    const preset = pythonClassroomPresets.findIndex(item => state.plan.steps.some(step => step.id.startsWith(`${item.id}-`)));
    const following = preset >= 0 ? pythonClassroomPresets[preset + 1] : undefined;
    nextPresetId = following?.id;
    next = following ? say(DEBRIEF_TEXT.nextPython, following.id.split('-')[0]) : preset >= 0 ? DEBRIEF_TEXT.project : DEBRIEF_TEXT.nextLesson;
  }
  return {
    headline: rounds.length ? say(DEBRIEF_TEXT.lesson, rounds.length, submittedIds.size, scores.avg) : DEBRIEF_TEXT.emptyLesson,
    participation: { roster, submitted: submittedIds.size, missing: missing.map(row => row.name) }, scores, checks,
    reteach, needHelp, shoutouts, next, steps, ...(nextPresetId ? { nextPresetId } : {}),
  };
}
