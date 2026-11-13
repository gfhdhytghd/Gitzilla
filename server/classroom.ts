import { normalizeQuestions, normalizeQuestionAnswer, gradeQuestion, questionKey, questionSetScore, stepScore, studentPlan } from './classroom-questions';
export { studentPlan } from './classroom-questions';
import type { QuestionAttack } from '../shared/classroom-grades';
import { normalizeClassroomEmail } from '../shared/classroom-email';
import { normalizeGuideText, normalizeGuideUrl } from '../shared/classroom-guide';
import type { RepoProfile } from '../shared/types';
import type { ClassroomPlan, ClassroomState, ClassroomRow, ClassroomReport, ClassroomCommand, StepBrief, QuestionAnswer, QuestionResult, QuestionStat } from '../shared/classroom';
import { normalizeRubric } from './rubrics';
import { scoreRepo, weightedScore } from '../rubric';
import { normalizeEditorFiles } from './in-app';
import { blendedScore, normalizeReviewSettings, reviewScore, type AIReview } from '../shared/classroom-review';

export interface ClassroomSource {
  profile: RepoProfile; commit: string;
  doctests?: Record<string, { passed: boolean; detail: string }>;
  aiReview?: AIReview;
  source?: 'github' | 'in-app';
  files: { path: string; text: string }[];
  checks: { name: string; status: string; conclusion: string | null }[];
}
export interface SubmissionTicket { id: string; generation: number; revision: number }
const round = (n: number) => Math.round(n * 10) / 10;
const REFERENCE_STUDENTS = 4;
const BOSS_HP_PER_STEP = 20;
const FULL_DAMAGE_AVERAGE = 75;
const CLASS_ATTACK_MULTIPLIER = 100 / FULL_DAMAGE_AVERAGE;
const bounded = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi;
const text = (s: unknown, name: string, max: number, empty = false): string => {
  if (typeof s !== 'string' || s.length > max || (!empty && !s.trim())) throw new Error(`Invalid ${name}`);
  return s.trim();
};
function normalizeBrief(value: StepBrief, checkCount: number): StepBrief {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid step brief');
  const strings = (items: unknown, name: string, min: number, max: number, chars = Infinity): string[] => {
    if (!Array.isArray(items) || items.length < min || items.length > max) throw new Error(`Invalid brief ${name}: use ${min}–${max} items`);
    return items.map(item => text(item, `brief ${name} item`, chars));
  };
  const doneWhen = strings(value.doneWhen, 'doneWhen', 0, 12);
  if (doneWhen.length !== checkCount) throw new Error('Brief doneWhen must have one row per check, in check order');
  let example: StepBrief['example'];
  if (value.example !== undefined) {
    if (!value.example || typeof value.example !== 'object' || Array.isArray(value.example) || typeof value.example.output !== 'string' || value.example.output.length > 2000) throw new Error('Invalid brief example output (maximum 2000 characters)');
    example = { output: value.example.output, ...(value.example.title !== undefined ? { title: text(value.example.title, 'brief example title', Infinity, true) } : {}) };
  }
  return { goal: text(value.goal, 'brief goal', 160), todo: strings(value.todo, 'todo', 1, 8, 160), doneWhen,
    ...(example ? { example } : {}),
    ...(value.hints !== undefined ? { hints: strings(value.hints, 'hints', 0, 5) } : {}),
    ...(value.concepts !== undefined ? { concepts: strings(value.concepts, 'concepts', 0, 6) } : {}) };
}
export function normalizeClassroomPlan(value: ClassroomPlan): ClassroomPlan {
  if (!value || !Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 12) throw new Error('A lesson needs 1–12 steps');
  const guideUrl = normalizeGuideUrl(value.guideUrl);
  const guideText = normalizeGuideText(value.guideText);
  const ids = new Set<string>();
  return { ...(guideUrl ? { guideUrl } : {}), ...(guideText ? { guideText } : {}), ...(value.grading !== undefined ? { grading: normalizeReviewSettings(value.grading) } : {}), title: text(value.title, 'lesson title', 120), bossName: text(value.bossName, 'boss name', 80), steps: value.steps.map(s => {
    if (!s || typeof s !== 'object') throw new Error('Invalid step');
    const mode = s.mode === undefined ? 'code' : s.mode;
    if (!['code', 'questions', 'mixed'].includes(mode)) throw new Error('Invalid step mode');
    const requestedFeedback = s.answerFeedback === undefined ? 'after-close' : s.answerFeedback, reveal = s.revealAnswers === undefined ? 'after-raid' : s.revealAnswers;
    if (!['after-close', 'immediate'].includes(requestedFeedback) || !['after-raid', 'never'].includes(reveal)) throw new Error('Invalid answer feedback or reveal mode');
    const feedback = reveal === 'never' ? 'after-close' : requestedFeedback;
    if (s.questionsWeight !== undefined && !bounded(s.questionsWeight, 0, 100)) throw new Error('Invalid questions weight');
    const questions = mode === 'code' ? undefined : normalizeQuestions(s.questions);
    const code = mode !== 'questions';
    const id = text(s.id, 'step id', 60); if (ids.has(id)) throw new Error('Step ids must be unique'); ids.add(id);
    if (!bounded(s.durationSec, 0, 7200) || !Number.isInteger(s.durationSec) || (code && (!bounded(s.checksWeight, 0, 100) || !Array.isArray(s.checks) || s.checks.length > 30))) throw new Error('Invalid step duration, checks or weights');
    const checks = (code ? s.checks : []).map((c, i) => {
      if (!c || !['file', 'contains', 'doctest', 'ci'].includes(c.kind)) throw new Error('Choose a file, literal text, doctest or GitHub check');
      const path = text(c.path, 'check path/name', 240);
      if (c.kind !== 'ci' && (path.startsWith('/') || path.split(/[\\/]/).includes('..'))) throw new Error('Use a repository-relative path');
      if (c.kind === 'doctest' && c.text !== undefined) text(c.text, 'doctest examples', 4000, true);
      return { id: `check-${i}`, kind: c.kind, label: text(c.label, 'check label', 240), path,
        ...(c.kind === 'doctest' && c.text !== undefined ? { text: c.text } : {}),
        ...(c.kind === 'contains' ? { text: text(c.text, 'required literal text', 500) } : {}) };
    });
    if (s.language !== undefined && s.language !== 'python') throw new Error('Choose Python for the editor language');
    return { id, title: text(s.title, 'step title', 120), instructions: text(s.instructions, 'instructions', 8000), durationSec: s.durationSec, rubric: code ? normalizeRubric(s.rubric) : { title: 'Questions', source: 'default', criteria: [] }, checks, checksWeight: code ? s.checksWeight : 0,
      ...(s.mode !== undefined || questions ? { mode } : {}),
      ...(s.questionContext !== undefined ? { questionContext: text(s.questionContext, 'question context', 4000, true) } : {}),
      ...(questions ? { questions, ...(mode === 'mixed' ? { questionsWeight: s.questionsWeight ?? 50 } : {}) } : {}),
      ...(questions || s.answerFeedback !== undefined || s.revealAnswers !== undefined ? { answerFeedback: feedback, revealAnswers: reveal } : {}),
      ...(s.brief !== undefined ? { brief: normalizeBrief(s.brief, checks.length) } : {}),
      ...(s.language !== undefined ? { language: s.language } : {}),
      ...(code && s.starter !== undefined ? { starter: normalizeEditorFiles(s.starter) } : {}) };
  }) };
}

export function classroomChecks(step: ClassroomPlan['steps'][number], source: ClassroomSource) {
    const inApp = source.source === 'in-app';
    const files = new Map(source.files.map(f => [f.path, f.text]));
    // Keep positional alignment with brief.doneWhen, including failed checks.
    return step.checks.map(c => {
      if (c.kind === 'doctest') return { label: c.label, ...(source.doctests?.[c.id] ?? { passed: false, detail: 'doctest runner unavailable on this server' }) };
      const run = source.checks.find(r => r.name === c.path);
      const passed = c.kind === 'ci' ? !inApp && run?.status === 'completed' && run.conclusion === 'success' : c.kind === 'file' ? files.has(c.path) : files.get(c.path)?.includes(c.text!) ?? false;
      return { label: c.label, passed, detail: c.kind === 'ci' ? `${c.path}: ${run ? `${run.status} / ${run.conclusion ?? 'pending'}` : 'not found on this commit'}` : `${c.path}: ${passed ? 'static evidence found' : 'required evidence not found in the analyzed archive'}` };
    });
}

export class ClassroomSession {
  private emails: Record<string, string> = {};
  setEmail(id: string, value: unknown) {
    this.row(id);
    this.emails[id] = normalizeClassroomEmail(value);
  }
  exportEmails(): Record<string, string> { return { ...this.emails }; }
  state: ClassroomState;
  private reports = new Map<string, ClassroomReport>();
  private pendingCode = new Set<string>();
  private graded = new Map<string, { row: ClassroomRow; report?: ClassroomReport }>();
  private errors = new Map<string, string>();
  private generation = 0;
  private revisions = new Map<string, number>();
  private previous = new Map<string, number>();
  private credited = new Map<string, number>();
  private submittedAt = new Map<string, number>();
  private hostPausedAt?: number;
  private answerSaves = new Map<string, { at: number; count: number }>();
  private revealedStep(): number | null {
    return ['feedback', 'complete'].includes(this.state.phase) ? this.state.stepIndex : null;
  }
  private questionGradeHidden(): boolean {
    const step = this.state.plan.steps[this.state.stepIndex];
    return !!step.questions?.length && step.answerFeedback !== 'immediate' && !['feedback', 'complete'].includes(this.state.phase);
  }
  private questionFeedback(stepIndex = this.state.stepIndex): boolean {
    const step = this.state.plan.steps[stepIndex];
    return step.revealAnswers !== 'never' && (this.revealedStep() === stepIndex || step.answerFeedback === 'immediate');
  }
  constructor(plan: ClassroomPlan, private now: () => number = Date.now) {
    this.state = { plan: normalizeClassroomPlan(plan), phase: 'setup', stepIndex: 0, attempt: 1, deadline: null, remainingMs: null, serverTime: now(), raidEndsAt: null, bossHp: plan.steps.length * BOSS_HP_PER_STEP, bossMaxHp: plan.steps.length * BOSS_HP_PER_STEP, rows: [], rounds: [] };
  }
  roster(students: { id: string; name: string; connected: boolean }[]) {
    for (const s of students) {
      const row = this.state.rows.find(r => r.id === s.id);
      if (row) { row.name = s.name; row.connected = s.connected; }
      else this.state.rows.push({ ...s, status: 'empty', improvement: 0, damage: 0, totalDamage: 0, attempts: 0 });
    }
    const ids = new Set(students.map(s => s.id));
    for (const row of this.state.rows) if (!ids.has(row.id)) row.connected = false;
    this.scaleBoss();
  }
  publicState(audience: 'teacher' | 'student'): ClassroomState {
    if (audience !== 'teacher' && audience !== 'student') throw new Error('Choose a classroom state audience: teacher or student');
    const state = structuredClone({ ...this.state, serverTime: this.hostPausedAt ?? this.now(), rows: [...this.state.rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.improvement - a.improvement || a.name.localeCompare(b.name)) });
    // Counts describe memory-only answers, not persisted grades or per-question correctness.
    delete state.questionAnswered;
    if (state.phase === 'coding' || state.phase === 'paused') state.questionAnswered = this.questionLive().map(q => q.answered);
    if (audience === 'student') {
      state.plan = studentPlan(state.plan, this.revealedStep());
      if (this.questionGradeHidden()) {
        for (const row of state.rows) {
          const codeScore = this.reports.get(row.id)?.codeScore;
          if (codeScore === undefined) delete row.score; else row.score = codeScore;
          row.improvement = 0;
          delete (row as ClassroomRow & { questionScore?: number }).questionScore;
        }
        state.rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name));
      }
      for (const r of state.rounds) {
        const i = state.plan.steps.findIndex(step => step.id === r.stepId);
        const revealed = i === this.revealedStep() && state.plan.steps[i]?.revealAnswers !== 'never';
        for (const a of r.attacks as QuestionAttack[]) {
          const codeScore = a.codeScore;
          delete a.questionScores;
          if (!revealed) {
            delete a.questionScore; delete a.codeScore;
            const step = state.plan.steps[i];
            if (i === state.stepIndex && r.attempt === state.attempt && step?.questions?.length && step.answerFeedback !== 'immediate' && this.questionGradeHidden()) { a.score = codeScore ?? 0; a.improvement = 0; }
          }
        }
        if (!revealed && r.questionStats) r.questionStats = r.questionStats.map(q => ({ id: q.id, answered: q.answered, correct: 0, total: q.total }));
      }
    }
    return state;
  }
  pauseHostClock() { this.hostPausedAt ??= this.now(); }
  resumeHostClock() {
    if (this.hostPausedAt === undefined) return;
    const elapsed = Math.max(0, this.now() - this.hostPausedAt);
    if (this.state.deadline !== null) this.state.deadline += elapsed;
    if (this.state.raidEndsAt !== null) this.state.raidEndsAt += elapsed;
    this.hostPausedAt = undefined;
  }
  remove(id: string) {
    this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
    this.restoreGrade(id);
    this.state.rows = this.state.rows.filter(row => row.id !== id);
    this.previous.delete(id); this.submittedAt.delete(id); this.pendingCode.delete(id);
    for (const key of this.credited.keys()) if (key.endsWith(`:${id}`)) this.credited.delete(key);
    this.reports.delete(id); this.errors.delete(id); this.answerSaves.delete(id);
    this.scaleBoss(); // Frozen rounds and started-lesson HP stay unchanged.
  }
  kick(id: string) { this.remove(id); }
  private restoreGrade(id: string): boolean {
    const saved = this.graded.get(id); this.graded.delete(id);
    const row = this.state.rows.find(r => r.id === id);
    if (!saved || !row) return false;
    const { repo, commit, score, improvement, reviewPending } = saved.row;
    Object.assign(row, { status: 'submitted', repo, commit, score, improvement, reviewPending });
    if (saved.report) {
      const live = this.reports.get(id);
      if (live?.answers && this.state.plan.steps[this.state.stepIndex].mode === 'mixed') {
        saved.report.answers = live.answers; saved.report.questionScore = live.questionScore;
        saved.report.score = stepScore(this.state.plan.steps[this.state.stepIndex], saved.report.codeScore, live.questionScore);
        saved.report.improvement = round(saved.report.score - (this.previous.get(id) ?? saved.report.score));
        row.score = saved.report.score; row.improvement = saved.report.improvement;
      }
      this.reports.set(id, saved.report);
    }
    return true;
  }
  privatePayload(id: string, teacher: boolean): { reports: Record<string, ClassroomReport>; errors: Record<string, string>; emails: Record<string, string> } {
    const reports = [...this.reports].filter(([key]) => teacher || key === id).map(([key, report]) => {
      if (teacher) return [key, structuredClone(report)] as const;
      const { files: _files, ...feedback } = report;
      if (this.state.plan.steps[this.state.stepIndex].questions?.length) {
        const step = this.state.plan.steps[this.state.stepIndex];
        const visible = this.questionFeedback(), reveal = this.revealedStep() === this.state.stepIndex && step.revealAnswers !== 'never';
        feedback.answers = Object.fromEntries(Object.entries(feedback.answers ?? {}).map(([qid, result]) => {
          const q = step.questions?.find(q => q.id === qid);
          const { key: _key, explain: _explain, correct: _correct, score: _score, blankCorrect: _blankCorrect, ...saved } = result;
          if (step.revealAnswers === 'never') delete saved.locked;
          return [qid, { ...saved, ...(visible ? { correct: result.correct, score: result.score, ...(result.blankCorrect ? { blankCorrect: result.blankCorrect } : {}) } : {}),
            ...(q && step.revealAnswers !== 'never' && (reveal || (step.answerFeedback === 'immediate' && result.locked)) ? { key: questionKey(q), ...(q.explain !== undefined ? { explain: q.explain } : {}) } : {}) }];
        }));
        if (this.questionGradeHidden()) {
          delete feedback.questionScore;
          if (feedback.codeScore !== undefined) feedback.score = feedback.codeScore;
          // The committed report type models teacher grades; student projections omit unavailable grades.
          else delete (feedback as Partial<ClassroomReport>).score;
          feedback.improvement = 0;
        }
      }
      if (feedback.aiReview) { const { concerns: _concerns, ...studentReview } = feedback.aiReview; feedback.aiReview = studentReview; }
      return [key, feedback] as const;
    });
    return { emails: Object.fromEntries(Object.entries(this.emails).filter(([key]) => teacher || key === id)), reports: Object.fromEntries(reports), errors: Object.fromEntries([...this.errors].filter(([key]) => teacher || key === id)) };
  }
  questionLive(): QuestionStat[] {
    return (this.state.plan.steps[this.state.stepIndex].questions ?? []).map(q => {
      const results = [...this.reports.values()].flatMap(r => r.stepId === this.state.plan.steps[this.state.stepIndex].id && r.attempt === this.state.attempt && r.answers?.[q.id] ? [r.answers[q.id]] : []);
      return { id: q.id, answered: results.length, correct: results.filter(r => r.correct).length, total: this.state.rows.length,
        ...(q.kind !== 'blank' ? { options: q.options.map(o => ({ id: o.id, count: results.filter(r => 'choice' in r.answer ? r.answer.choice === o.id : 'choices' in r.answer && r.answer.choices.includes(o.id)).length })) } : {}) };
    });
  }
  saveAnswers(id: string, stepId: string, attempt: number, value: Record<string, QuestionAnswer>) {
    this.tick();
    const step = this.state.plan.steps[this.state.stepIndex];
    if (stepId !== step.id || attempt !== this.state.attempt) throw new Error('Stale question save: stepId or attempt no longer matches the current step');
    if (this.state.phase !== 'coding') throw new Error('Answers are open only during coding');
    if (!step.questions?.length || step.mode === 'code') throw new Error('This step has no question set');
    const row = this.row(id);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid question answers');
    const prior = this.reports.get(id), answers = { ...prior?.answers };
    // Validate the entire save before consuming a rate-limit slot or changing any result.
    for (const [qid, valueAnswer] of Object.entries(value)) {
      const q = step.questions.find(q => q.id === qid);
      if (!q) throw new Error('Unknown question id');
      if (answers[qid]?.locked) continue;
      const answer = normalizeQuestionAnswer(q, valueAnswer);
      if (!answer) { if (step.answerFeedback !== 'immediate') delete answers[qid]; continue; }
      const result = gradeQuestion(q, answer), attempts = (answers[qid]?.attempts ?? 0) + 1;
      answers[qid] = { answer, attempts, ...result, ...(step.answerFeedback === 'immediate' ? { locked: result.correct || attempts >= (q.maxAttempts ?? 3) } : {}) };
    }
    const saved = this.answerSaves.get(id);
    if (saved && this.now() - saved.at < 1000) throw new Error('Wait 1 second before saving answers again');
    if ((saved?.count ?? 0) >= 200) throw new Error('Answer save limit reached for this step attempt');
    this.answerSaves.set(id, { at: this.now(), count: (saved?.count ?? 0) + 1 });
    if (!Object.keys(answers).length && !prior) return;
    const questionScore = questionSetScore(step, answers), score = stepScore(step, prior?.codeScore, questionScore);
    const improvement = round(score - (this.previous.get(id) ?? score));
    const report: ClassroomReport = { stepId, attempt, repo: 'questions', commit: 'questions', submittedAt: this.now(), checks: [], criteria: [], advice: [], ...prior, answers, questionScore, score, improvement };
    this.reports.set(id, report); this.errors.delete(id);
    // Submission status describes saved work; pendingCode independently fences the raid.
    Object.assign(row, { status: 'submitted', repo: report.repo, commit: report.commit, score, improvement });
  }
  setPlan(plan: ClassroomPlan) {
    if (this.state.phase !== 'setup') throw new Error('The lesson is already running; start a new room to change its plan');
    const next = normalizeClassroomPlan(plan); this.state.plan = next; this.scaleBoss();
  }
  begin(id: string, repo: string): SubmissionTicket {
    this.tick();
    if (this.state.phase !== 'coding') throw new Error('Submissions are open only during coding');
    if (this.state.plan.steps[this.state.stepIndex].mode === 'questions') throw new Error('This step accepts question answers only');
    const row = this.row(id);
    if (this.pendingCode.has(id) || row.status === 'queued') throw new Error('Your submission is already being checked');
    if (row.attempts >= 20) throw new Error('Submission limit reached for this step; ask the teacher to retry the step');
    if (this.now() - (this.submittedAt.get(id) ?? -Infinity) < 5000) throw new Error('Wait 5 seconds before submitting again');
    this.submittedAt.set(id, this.now());
    if (row.status === 'submitted') this.graded.set(id, structuredClone({ row, report: this.reports.get(id) }));
    const mixed = this.state.plan.steps[this.state.stepIndex].mode === 'mixed';
    const hasPart = mixed && this.reports.has(id);
    this.pendingCode.add(id);
    row.status = hasPart ? 'submitted' : 'queued'; row.repo = repo;
    if (!hasPart) { delete row.score; delete row.commit; }
    row.attempts++; this.errors.delete(id);
    if (this.state.plan.steps[this.state.stepIndex].mode !== 'mixed') this.reports.delete(id);
    const revision = (this.revisions.get(id) ?? 0) + 1; this.revisions.set(id, revision);
    return { id, generation: this.generation, revision };
  }
  valid(ticket: SubmissionTicket): boolean {
    return ticket.generation === this.generation && this.revisions.get(ticket.id) === ticket.revision && ['coding', 'paused'].includes(this.state.phase) && this.pendingCode.has(ticket.id) && this.state.rows.some(row => row.id === ticket.id);
  }
  accept(ticket: SubmissionTicket, source: ClassroomSource) {
    if (!this.valid(ticket)) return;
    const inApp = source.source === 'in-app';
    if (source.profile.fallback || !(inApp ? /^inapp:[a-f\d]{8}$/.test(source.commit) : /^[a-f\d]{40,64}$/i.test(source.commit))) throw new Error('An immutable live GitHub commit or in-app content hash is required; fallback data is not graded');
    const step = this.state.plan.steps[this.state.stepIndex];
    const criteria = scoreRepo(source.profile, step.rubric);
    const checks = classroomChecks(step, source);
    const measured = weightedScore(step.rubric, criteria), weight = checks.length ? step.checksWeight / 100 : 0;
    const automaticScore = round(measured * (1 - weight) + (checks.filter(c => c.passed).length / Math.max(1, checks.length)) * 100 * weight);
    const grading = this.state.plan.grading;
    const aiReview = grading ? source.aiReview ?? { status: 'pending' as const, items: [], summary: 'AI review unavailable. Ask the teacher to record a review.' } : undefined;
    const reviewedScore = aiReview?.status === 'complete' ? reviewScore(aiReview.items) : undefined;
    if (aiReview) aiReview.score = reviewedScore;
    const codeScore = grading ? blendedScore(automaticScore, reviewedScore, grading) : automaticScore;
    const answers = this.reports.get(ticket.id)?.answers;
    const questionScore = step.questions ? questionSetScore(step, answers ?? {}) : undefined;
    const score = stepScore(step, codeScore, questionScore);
    const improvement = round(score - (this.previous.get(ticket.id) ?? score));
    const advice = [...checks.filter(c => !c.passed).map(c => `Review ${c.label}: ${c.detail}.`), ...criteria.filter(c => c.score < 0.8 && c.tip).sort((a, b) => a.score - b.score).map(c => c.tip!)].slice(0, 3);
    if (!advice.length) advice.push('The measured criteria look strong. Check the task instructions and explain your implementation to your teacher.');
    const repo = inApp ? 'in-app' : source.profile.slug;
    const report: ClassroomReport = { ...(step.questions ? { codeScore, questionScore, ...(answers ? { answers } : {}) } : {}), stepId: step.id, attempt: this.state.attempt, repo, commit: source.commit, source: inApp ? 'in-app' : 'github', submittedAt: this.now(), score, improvement, criteria, checks, advice,
      ...(grading ? { automaticScore, aiReview, reviewPending: reviewedScore === undefined && grading.automaticWeight < 100 } : {}),
      ...(inApp ? { files: source.files.map(f => ({ path: f.path, content: f.text })) } : {}) };
    this.pendingCode.delete(ticket.id); this.graded.delete(ticket.id);
    this.reports.set(ticket.id, report); this.errors.delete(ticket.id);
    Object.assign(this.row(ticket.id), { status: 'submitted', repo, commit: source.commit, score, improvement, ...(grading ? { reviewPending: report.reviewPending } : {}) });
  }
  fail(ticket: SubmissionTicket, message: string) {
    if (!this.valid(ticket)) return;
    this.pendingCode.delete(ticket.id);
    if (!this.restoreGrade(ticket.id)) this.row(ticket.id).status = this.reports.get(ticket.id)?.answers ? 'submitted' : 'error';
    this.errors.set(ticket.id, message.slice(0, 400));
  }
  review(id: string, score: number, note: string) {
    if (!['coding', 'paused'].includes(this.state.phase)) throw new Error('Review scores before the class attacks');
    const report = this.reports.get(id);
    if (!report || this.pendingCode.has(id) || this.row(id).status !== 'submitted') throw new Error('Wait for this student to submit a commit');
    if (!bounded(score, 0, 100)) throw new Error('Review score must be 0–100');
    const reviewNote = text(note, 'review note', 2000);
    const step = this.state.plan.steps[this.state.stepIndex];
    if (step.mode === 'questions' || (step.mode === 'mixed' && report.codeScore === undefined)) throw new Error('Submit code before reviewing the code part');
    const codeScore = this.state.plan.grading && report.automaticScore !== undefined ? blendedScore(report.automaticScore, score, this.state.plan.grading) : round(score);
    if (step.questions) report.codeScore = codeScore;
    report.score = stepScore(step, codeScore, report.questionScore);
    report.improvement = round(report.score - (this.previous.get(id) ?? report.score)); report.teacherReview = { score: round(score), note: reviewNote };
    if (this.state.plan.grading) report.reviewPending = false;
    Object.assign(this.row(id), { score: report.score, improvement: report.improvement, ...(this.state.plan.grading ? { reviewPending: false } : {}) });
  }
  control(action: ClassroomCommand) {
    this.tick();
    const s = this.state;
    if (action === 'start' && s.phase === 'setup') { if (!s.rows.some(r => r.connected)) throw new Error('Wait for at least one student'); this.open(); return; }
    if (action === 'pause' && s.phase === 'coding') { s.remainingMs = s.deadline === null ? null : Math.max(0, s.deadline - this.now()); s.deadline = null; s.phase = 'paused'; return; }
    if (action === 'resume' && s.phase === 'paused') { s.phase = 'coding'; s.deadline = s.remainingMs === null ? null : this.now() + Math.max(1000, s.remainingMs); s.remainingMs = null; s.notice = undefined; return; }
    if (action === 'extend' && ['coding', 'paused'].includes(s.phase)) { if (s.phase === 'coding') s.deadline = (s.deadline ?? this.now()) + 120000; else s.remainingMs = (s.remainingMs ?? 0) + 120000; return; }
    if (action === 'attack' && ['coding', 'paused'].includes(s.phase)) { this.attack(); return; }
    if (action === 'next' && s.phase === 'feedback') { if (s.stepIndex + 1 >= s.plan.steps.length) { s.phase = 'complete'; return; } s.stepIndex++; s.attempt = 1; this.previous.clear(); this.open(false); return; }
    if (action === 'retry' && s.phase === 'feedback') { if (s.attempt >= 10) throw new Error('Maximum 10 attempts per step'); s.attempt++; this.open(); return; }
    if (action === 'finish' && ['coding', 'paused', 'feedback'].includes(s.phase)) { if (this.pendingCode.size || s.rows.some(r => r.status === 'queued')) throw new Error('Wait for queued submissions'); s.phase = 'complete'; s.deadline = null; this.generation++; return; }
    throw new Error('That control is not available in this phase');
  }
  tick(): boolean {
    if (this.hostPausedAt !== undefined) return false;
    const s = this.state;
    if (s.phase === 'coding' && s.deadline !== null && this.now() >= s.deadline) { s.phase = 'paused'; s.deadline = null; s.remainingMs = 0; s.notice = 'Time is up. Submissions are closed; the teacher can extend or launch the raid.'; return true; }
    if (s.phase === 'raid' && s.raidEndsAt !== null && this.now() >= s.raidEndsAt) { s.phase = 'feedback'; s.raidEndsAt = null; return true; }
    return false;
  }
  end() {
    this.generation++; this.state.phase = 'complete'; this.state.deadline = null; this.state.raidEndsAt = null;
    for (const row of this.state.rows) if (row.status === 'queued' || this.pendingCode.has(row.id)) { if (!this.restoreGrade(row.id)) row.status = this.reports.get(row.id)?.answers ? 'submitted' : 'error'; this.errors.set(row.id, 'The teacher ended this lesson before analysis completed.'); }
    this.pendingCode.clear();
    this.state.notice = 'The teacher ended this lesson.';
  }
  save(): ClassroomState & { emails: Record<string, string> } { return { ...this.publicState('teacher'), emails: this.exportEmails() }; } // Private persistence; never broadcast email addresses.
  static restore(value: ClassroomState & { emails?: Record<string, string> }, now: () => number = Date.now): ClassroomSession {
    const session = new ClassroomSession(value.plan, now);
    const { emails, ...publicValue } = value;
    for (const [id, email] of Object.entries(emails ?? {})) {
      try { session.emails[id] = normalizeClassroomEmail(email); } catch { /* Ignore invalid legacy data. */ }
    }
    session.state = { ...session.state, ...structuredClone(publicValue), plan: normalizeClassroomPlan(value.plan), serverTime: now() };
    // Older saved lessons could already have spent future steps' HP. Repair only
    // the live boss, leaving frozen historical rounds/exports untouched.
    const unlocked = session.state.bossMaxHp * (session.state.stepIndex + 1) / session.state.plan.steps.length;
    const locked = session.state.stepIndex < session.state.plan.steps.length - 1 ? Math.max(1, round(session.state.bossMaxHp - unlocked)) : 0;
    session.state.bossHp = Math.max(locked, Math.min(session.state.bossMaxHp, session.state.bossHp));
    for (const row of session.state.rows) { row.connected = false; if (row.status === 'queued') row.status = 'error'; }
    // Reconstruct credited scores so rejoining/retrying cannot farm unchanged commits.
    for (const r of session.state.rounds) for (const a of r.attacks) session.credited.set(`${r.stepId}:${a.id}`, Math.max(a.score, session.credited.get(`${r.stepId}:${a.id}`) ?? 0));
    for (const r of session.state.rounds) if (r.stepId === session.state.plan.steps[session.state.stepIndex].id) for (const a of r.attacks) session.previous.set(a.id, a.score);
    if (session.state.phase === 'raid') { session.state.phase = 'feedback'; session.state.raidEndsAt = null; }
    if (session.state.phase === 'coding') { session.state.phase = 'paused'; session.state.remainingMs = value.deadline === null ? null : Math.max(0, value.deadline - value.serverTime); session.state.deadline = null; }
    session.state.notice = 'Lesson restored. Coding is paused after restart. Detailed feedback is memory-only; resubmit to retrieve it.';
    return session;
  }
  private scaleBoss() {
    // Lock at lesson start: disconnects/retries cannot erase damage or lower difficulty.
    if (this.state.phase !== 'setup') return;
    const students = Math.max(1, this.state.rows.filter(r => r.connected).length);
    this.state.bossHp = this.state.bossMaxHp = round(this.state.plan.steps.length * BOSS_HP_PER_STEP * students / REFERENCE_STUDENTS);
  }
  private row(id: string): ClassroomRow { const row = this.state.rows.find(r => r.id === id); if (!row) throw new Error('Join as a student first'); return row; }
  private open(remember = true) {
    const s = this.state; this.generation++; this.pendingCode.clear(); this.graded.clear(); this.reports.clear(); this.errors.clear(); this.submittedAt.clear(); this.answerSaves.clear();
    for (const row of s.rows) { if (remember && row.score !== undefined) this.previous.set(row.id, row.score); row.status = 'empty'; delete row.score; delete row.reviewPending; row.damage = 0; row.improvement = 0; row.attempts = 0; }
    s.phase = 'coding'; s.notice = undefined; s.remainingMs = null; s.deadline = s.plan.steps[s.stepIndex].durationSec ? this.now() + s.plan.steps[s.stepIndex].durationSec * 1000 : null;
  }
  private attack() {
    const s = this.state;
    if (this.pendingCode.size || s.rows.some(r => r.status === 'queued')) throw new Error('Wait for queued submissions before launching the raid');
    const submitted = s.rows.filter(r => r.status === 'submitted');
    if (!submitted.length) throw new Error('At least one student must submit this step');
    const step = s.plan.steps[s.stepIndex];
    const reports = submitted.map(row => this.reports.get(row.id)).filter((report): report is ClassroomReport =>
      !!report && report.stepId === step.id && report.attempt === s.attempt);
    // Aggregate-only restored submissions have no check evidence: leave stats unavailable.
    const checkStats = reports.length === submitted.length ? step.checks.map((check, index) => ({ label: check.label,
      passed: reports.filter(report => report.checks[index]?.passed === true).length, total: reports.length })) : undefined;
    const roster = Math.max(1, s.rows.filter(row => row.connected || row.status === 'submitted').length), slice = s.bossMaxHp / s.plan.steps.length;
    const floor = s.stepIndex < s.plan.steps.length - 1 ? Math.max(1, round(s.bossMaxHp - slice * (s.stepIndex + 1))) : 0;
    const available = Math.max(0, s.bossHp - floor);
    const measured = submitted.map(r => {
      const key = `${s.plan.steps[s.stepIndex].id}:${r.id}`;
      const before = this.credited.get(key) ?? 0, score = r.score ?? 0;
      this.credited.set(key, Math.max(before, score));
      return { row: r, score, raw: slice / roster * Math.max(0, score - before) / 100 * CLASS_ATTACK_MULTIPLIER };
    });
    const rawTotal = measured.reduce((sum, attack) => sum + attack.raw, 0);
    // Round the class total to the nearest tenth before capping; floating-point
    // error at a full slice must not truncate damage by 0.1 HP.
    const damageUnits = Math.min(Math.round(available * 10), Math.round(rawTotal * 10));
    let cumulative = 0, assigned = 0;
    const attacks = measured.map(({ row: r, score, raw }, index) => {
      // Cumulative proportional rounding keeps visible 0.1-HP hits summing to the
      // actual capped boss damage, including large classes and tiny improvements.
      cumulative += raw;
      const next = index === measured.length - 1 ? damageUnits : rawTotal > 0 ? Math.round(damageUnits * cumulative / rawTotal) : 0;
      const damage = (next - assigned) / 10; assigned = next;
      r.damage = damage; r.totalDamage = round(r.totalDamage + damage);
      const report = this.reports.get(r.id);
      return { ...(step.questions && report ? { ...(step.mode === 'mixed' ? { codeScore: report.codeScore ?? 0 } : {}), questionScore: report.questionScore ?? 0,
        questionScores: Object.fromEntries(Object.entries(report.answers ?? {}).map(([id, answer]) => [id, answer.score ?? 0])) } : {}), id: r.id, name: r.name, score, improvement: r.improvement, damage, commit: r.commit!, ...(s.plan.grading ? { reviewPending: r.reviewPending === true } : {}) };
    });
    const bossBefore = s.bossHp; s.bossHp = Math.max(floor, round(s.bossHp - damageUnits / 10));
    // Freeze the enrolled roster and anonymous measurements; later joins/kicks/retries cannot rewrite them.
    s.rounds.push({ stepId: step.id, attempt: s.attempt, at: this.now(), bossBefore, bossAfter: s.bossHp, attacks, roster,
      ...(checkStats !== undefined ? { checkStats } : {}), ...(step.questions && reports.length === submitted.length ? { questionStats: this.questionLive() } : {}) });
    s.phase = 'raid'; s.deadline = null; s.remainingMs = null; s.raidEndsAt = this.now() + 10000; this.generation++;
  }
}
