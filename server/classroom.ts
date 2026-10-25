import type { RepoProfile } from '../shared/types';
import type { ClassroomPlan, ClassroomState, ClassroomRow, ClassroomReport, ClassroomCommand, StepBrief } from '../shared/classroom';
import { normalizeRubric } from './rubrics';
import { scoreRepo, weightedScore } from '../rubric';
import { normalizeEditorFiles } from './in-app';

export interface ClassroomSource {
  profile: RepoProfile; commit: string;
  source?: 'github' | 'in-app';
  files: { path: string; text: string }[];
  checks: { name: string; status: string; conclusion: string | null }[];
}
export interface SubmissionTicket { id: string; generation: number; revision: number }
const round = (n: number) => Math.round(n * 10) / 10;
const REFERENCE_STUDENTS = 4;
const BOSS_HP_PER_STEP = 20;
const CLASS_ATTACK_MULTIPLIER = 1.85;
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
  const ids = new Set<string>();
  return { title: text(value.title, 'lesson title', 120), bossName: text(value.bossName, 'boss name', 80), steps: value.steps.map(s => {
    const id = text(s.id, 'step id', 60); if (ids.has(id)) throw new Error('Step ids must be unique'); ids.add(id);
    if (!bounded(s.durationSec, 0, 7200) || !Number.isInteger(s.durationSec) || !bounded(s.checksWeight, 0, 100) || !Array.isArray(s.checks) || s.checks.length > 30) throw new Error('Invalid step duration, checks or weights');
    const checks = s.checks.map((c, i) => {
      if (!c || !['file', 'contains', 'ci'].includes(c.kind)) throw new Error('Choose a file, literal text or GitHub check');
      const path = text(c.path, 'check path/name', 240);
      if (c.kind !== 'ci' && (path.startsWith('/') || path.split(/[\\/]/).includes('..'))) throw new Error('Use a repository-relative path');
      return { id: `check-${i}`, kind: c.kind, label: text(c.label, 'check label', 240), path,
        ...(c.kind === 'contains' ? { text: text(c.text, 'required literal text', 500) } : {}) };
    });
    if (s.language !== undefined && s.language !== 'python') throw new Error('Choose Python for the editor language');
    return { id, title: text(s.title, 'step title', 120), instructions: text(s.instructions, 'instructions', 8000), durationSec: s.durationSec, rubric: normalizeRubric(s.rubric), checks, checksWeight: s.checksWeight,
      ...(s.brief !== undefined ? { brief: normalizeBrief(s.brief, checks.length) } : {}),
      ...(s.language !== undefined ? { language: s.language } : {}),
      ...(s.starter !== undefined ? { starter: normalizeEditorFiles(s.starter) } : {}) };
  }) };
}

export class ClassroomSession {
  state: ClassroomState;
  private reports = new Map<string, ClassroomReport>();
  private errors = new Map<string, string>();
  private generation = 0;
  private revisions = new Map<string, number>();
  private previous = new Map<string, number>();
  private credited = new Map<string, number>();
  private submittedAt = new Map<string, number>();
  private hostPausedAt?: number;
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
  publicState(): ClassroomState {
    return structuredClone({ ...this.state, serverTime: this.hostPausedAt ?? this.now(), rows: [...this.state.rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.improvement - a.improvement || a.name.localeCompare(b.name)) });
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
    const row = this.state.rows.find(r => r.id === id);
    if (row) { row.connected = false; if (row.status === 'queued') row.status = 'error'; }
    this.scaleBoss();
    this.reports.delete(id); this.errors.delete(id);
  }
  kick(id: string) {
    this.remove(id); // Invalidates queued grading before removing its live row.
    this.state.rows = this.state.rows.filter(row => row.id !== id);
    this.previous.delete(id); this.submittedAt.delete(id);
    for (const key of this.credited.keys()) if (key.endsWith(`:${id}`)) this.credited.delete(key);
    this.scaleBoss(); // Frozen attack rounds and started-lesson HP stay unchanged.
  }
  privatePayload(id: string, teacher: boolean): { reports: Record<string, ClassroomReport>; errors: Record<string, string> } {
    const reports = [...this.reports].filter(([key]) => teacher || key === id).map(([key, report]) => {
      if (teacher) return [key, report] as const;
      const { files: _files, ...feedback } = report;
      return [key, feedback] as const;
    });
    return { reports: Object.fromEntries(reports), errors: Object.fromEntries([...this.errors].filter(([key]) => teacher || key === id)) };
  }
  setPlan(plan: ClassroomPlan) {
    if (this.state.phase !== 'setup') throw new Error('The lesson is already running; start a new room to change its plan');
    const next = normalizeClassroomPlan(plan); this.state.plan = next; this.scaleBoss();
  }
  begin(id: string, repo: string): SubmissionTicket {
    this.tick();
    if (this.state.phase !== 'coding') throw new Error('Submissions are open only during coding');
    const row = this.row(id);
    if (row.status === 'queued') throw new Error('Your submission is already being checked');
    if (row.attempts >= 20) throw new Error('Submission limit reached for this step; ask the teacher to retry the step');
    if (this.now() - (this.submittedAt.get(id) ?? -Infinity) < 5000) throw new Error('Wait 5 seconds before submitting again');
    this.submittedAt.set(id, this.now());
    row.status = 'queued'; row.repo = repo; delete row.score; delete row.commit; row.attempts++; this.errors.delete(id); this.reports.delete(id);
    const revision = (this.revisions.get(id) ?? 0) + 1; this.revisions.set(id, revision);
    return { id, generation: this.generation, revision };
  }
  valid(ticket: SubmissionTicket): boolean {
    return ticket.generation === this.generation && this.revisions.get(ticket.id) === ticket.revision && ['coding', 'paused'].includes(this.state.phase) && this.row(ticket.id).status === 'queued';
  }
  accept(ticket: SubmissionTicket, source: ClassroomSource) {
    if (!this.valid(ticket)) return;
    const inApp = source.source === 'in-app';
    if (source.profile.fallback || !(inApp ? /^inapp:[a-f\d]{8}$/.test(source.commit) : /^[a-f\d]{40,64}$/i.test(source.commit))) throw new Error('An immutable live GitHub commit or in-app content hash is required; fallback data is not graded');
    const step = this.state.plan.steps[this.state.stepIndex];
    const criteria = scoreRepo(source.profile, step.rubric);
    const files = new Map(source.files.map(f => [f.path, f.text]));
    // Keep positional alignment with brief.doneWhen, including failed checks.
    const checks = step.checks.map(c => {
      const run = source.checks.find(r => r.name === c.path);
      const passed = c.kind === 'ci' ? !inApp && run?.status === 'completed' && run.conclusion === 'success' : c.kind === 'file' ? files.has(c.path) : files.get(c.path)?.includes(c.text!) ?? false;
      return { label: c.label, passed, detail: c.kind === 'ci' ? `${c.path}: ${run ? `${run.status} / ${run.conclusion ?? 'pending'}` : 'not found on this commit'}` : `${c.path}: ${passed ? 'static evidence found' : 'required evidence not found in the analyzed archive'}` };
    });
    const measured = weightedScore(step.rubric, criteria), weight = checks.length ? step.checksWeight / 100 : 0;
    const score = round(measured * (1 - weight) + (checks.filter(c => c.passed).length / Math.max(1, checks.length)) * 100 * weight);
    const improvement = round(score - (this.previous.get(ticket.id) ?? score));
    const advice = [...checks.filter(c => !c.passed).map(c => `Review ${c.label}: ${c.detail}.`), ...criteria.filter(c => c.score < 0.8 && c.tip).sort((a, b) => a.score - b.score).map(c => c.tip!)].slice(0, 3);
    if (!advice.length) advice.push('The measured criteria look strong. Check the task instructions and explain your implementation to your teacher.');
    const repo = inApp ? 'in-app' : source.profile.slug;
    const report: ClassroomReport = { stepId: step.id, attempt: this.state.attempt, repo, commit: source.commit, source: inApp ? 'in-app' : 'github', submittedAt: this.now(), score, improvement, criteria, checks, advice,
      ...(inApp ? { files: source.files.map(f => ({ path: f.path, content: f.text })) } : {}) };
    this.reports.set(ticket.id, report); this.errors.delete(ticket.id);
    Object.assign(this.row(ticket.id), { status: 'submitted', repo, commit: source.commit, score, improvement });
  }
  fail(ticket: SubmissionTicket, message: string) {
    if (!this.valid(ticket)) return;
    this.row(ticket.id).status = 'error'; this.errors.set(ticket.id, message.slice(0, 400));
  }
  review(id: string, score: number, note: string) {
    if (!['coding', 'paused'].includes(this.state.phase)) throw new Error('Review scores before the class attacks');
    const report = this.reports.get(id);
    if (!report || this.row(id).status !== 'submitted') throw new Error('Wait for this student to submit a commit');
    if (!bounded(score, 0, 100)) throw new Error('Review score must be 0–100');
    const reviewNote = text(note, 'review note', 2000);
    report.score = round(score); report.improvement = round(score - (this.previous.get(id) ?? score)); report.teacherReview = { score: round(score), note: reviewNote };
    Object.assign(this.row(id), { score: report.score, improvement: report.improvement });
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
    if (action === 'finish' && ['coding', 'paused', 'feedback'].includes(s.phase)) { if (s.rows.some(r => r.status === 'queued')) throw new Error('Wait for queued submissions'); s.phase = 'complete'; s.deadline = null; this.generation++; return; }
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
    for (const row of this.state.rows) if (row.status === 'queued') { row.status = 'error'; this.errors.set(row.id, 'The teacher ended this lesson before analysis completed.'); }
    this.state.notice = 'The teacher ended this lesson.';
  }
  save(): ClassroomState { return this.publicState(); } // aggregate scores only; never source/evidence/credentials
  static restore(value: ClassroomState, now: () => number = Date.now): ClassroomSession {
    const session = new ClassroomSession(value.plan, now);
    session.state = { ...session.state, ...structuredClone(value), plan: normalizeClassroomPlan(value.plan), serverTime: now() };
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
    const s = this.state; this.generation++; this.reports.clear(); this.errors.clear(); this.submittedAt.clear();
    for (const row of s.rows) { if (remember && row.score !== undefined) this.previous.set(row.id, row.score); row.status = 'empty'; delete row.score; row.damage = 0; row.improvement = 0; row.attempts = 0; }
    s.phase = 'coding'; s.notice = undefined; s.remainingMs = null; s.deadline = s.plan.steps[s.stepIndex].durationSec ? this.now() + s.plan.steps[s.stepIndex].durationSec * 1000 : null;
  }
  private attack() {
    const s = this.state;
    if (s.rows.some(r => r.status === 'queued')) throw new Error('Wait for queued submissions before launching the raid');
    const submitted = s.rows.filter(r => r.status === 'submitted');
    if (!submitted.length) throw new Error('At least one student must submit this step');
    const step = s.plan.steps[s.stepIndex];
    const reports = submitted.map(row => this.reports.get(row.id)).filter((report): report is ClassroomReport =>
      !!report && report.stepId === step.id && report.attempt === s.attempt);
    // Aggregate-only restored submissions have no check evidence: leave stats unavailable.
    const checkStats = reports.length === submitted.length ? step.checks.map((check, index) => ({ label: check.label,
      passed: reports.filter(report => report.checks[index]?.passed === true).length, total: reports.length })) : undefined;
    const roster = Math.max(1, s.rows.length), slice = s.bossMaxHp / s.plan.steps.length;
    const floor = s.stepIndex < s.plan.steps.length - 1 ? Math.max(1, round(s.bossMaxHp - slice * (s.stepIndex + 1))) : 0;
    const available = Math.max(0, s.bossHp - floor);
    const measured = submitted.map(r => {
      const key = `${s.plan.steps[s.stepIndex].id}:${r.id}`;
      const before = this.credited.get(key) ?? 0, score = r.score ?? 0;
      this.credited.set(key, Math.max(before, score));
      return { row: r, score, raw: slice / roster * Math.max(0, score - before) / 100 * CLASS_ATTACK_MULTIPLIER };
    });
    const rawTotal = measured.reduce((sum, attack) => sum + attack.raw, 0);
    const damageUnits = Math.min(Math.round(available * 10), Math.round(rawTotal * 10));
    let cumulative = 0, assigned = 0;
    const attacks = measured.map(({ row: r, score, raw }, index) => {
      // Cumulative proportional rounding keeps visible 0.1-HP hits summing to the
      // actual capped boss damage, including large classes and tiny improvements.
      cumulative += raw;
      const next = index === measured.length - 1 ? damageUnits : rawTotal > 0 ? Math.round(damageUnits * cumulative / rawTotal) : 0;
      const damage = (next - assigned) / 10; assigned = next;
      r.damage = damage; r.totalDamage = round(r.totalDamage + damage);
      return { id: r.id, name: r.name, score, improvement: r.improvement, damage, commit: r.commit! };
    });
    const bossBefore = s.bossHp; s.bossHp = Math.max(floor, round(s.bossHp - damageUnits / 10));
    // Freeze the enrolled roster and anonymous measurements; later joins/kicks/retries cannot rewrite them.
    s.rounds.push({ stepId: step.id, attempt: s.attempt, at: this.now(), bossBefore, bossAfter: s.bossHp, attacks, roster: s.rows.length,
      ...(checkStats !== undefined ? { checkStats } : {}) });
    s.phase = 'raid'; s.deadline = null; s.remainingMs = null; s.raidEndsAt = this.now() + 10000; this.generation++;
  }
}
