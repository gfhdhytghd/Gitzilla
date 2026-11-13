import { lessonGrades, type QuestionAttack } from '../shared/classroom-grades';
import { localizeClassroomPlan } from '../shared/classroom-localize';
import { translate } from '../shared/i18n/text';
import type { Locale } from '../shared/i18n/locale';
import type { ClassroomState } from '../shared/classroom';

const csv = (value: unknown) => {
  let s = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
};
const md = (value: unknown) => String(value ?? '').replace(/[\\`*_{}\[\]<>|#]/g, '\\$&').replace(/[\r\n]+/g, ' ');

/** Teacher-only exports. Feedback details and repository source stay out of exports. */
export function classroomExport(state: ClassroomState, format: 'csv' | 'md', lang: Locale = 'en', emails: Record<string, string> = {}): string {
  const tr = (s: string) => translate(s, lang);
  const plan = localizeClassroomPlan(state.plan, lang);
  const questionColumns = state.plan.steps.flatMap((s, i) => (s.questions ?? []).map(q => ({ stepId: s.id, id: q.id, header: `s${i + 1}-${q.id}` })));
  const frozen = state.rounds.flatMap(r => r.attacks.map(a => ({ stepId: r.stepId, attack: a as QuestionAttack })));
  const questionValues = (i: number) => questionColumns.map(q => q.stepId === frozen[i].stepId ? frozen[i].attack.questionScores?.[q.id] ?? '' : '');
  const records = state.rounds.flatMap(round => round.attacks.map(a => [round.stepId, round.attempt, new Date(round.at).toISOString(), a.id, a.name, emails[a.id] ?? '', a.commit, a.score, a.improvement, a.damage, ...(state.plan.grading ? [a.reviewPending ? 'provisional: review pending' : 'reviewed'] : [])]));
  const headers = ['step', 'attempt', 'time', 'student_id', 'student', 'email', 'commit', 'score', 'improvement', 'damage', ...(state.plan.grading ? ['review_status'] : [])];
  if (format === 'csv') {
    const grades = lessonGrades(state);
    // Keep attempt evidence separate from one overall row per student, including
    // roster-only students and students who left after a recorded attack.
    const overallHeaders = ['row_type', 'overall_score', 'overall_total', 'overall_max', 'overall_status', 'overall_score_definition'];
    const definition = 'Average of latest recorded score per planned step (0-100); missing/unrecorded steps count 0; retries replace earlier scores';
    const attempts = records.map((row, i) => [...row, 'attack', '', '', '', '', '', ...questionValues(i)]);
    const summaries = grades.students.map(s => [
      '', '', '', s.id, s.name, emails[s.id] ?? '', '', '', '', '',
      ...(state.plan.grading ? [''] : []),
      'student_summary', s.average, s.total, s.max,
      s.provisional?.some(Boolean) ? 'provisional: review pending' : 'recorded', definition, ...questionColumns.map(() => ''),
    ]);
    return [[...headers, ...overallHeaders, ...questionColumns.map(q => q.header)], ...attempts, ...summaries].map(row => row.map(csv).join(',')).join('\r\n') + '\r\n';
  }
  return `# ${md(plan.title)}\n\n${tr('Boss')}: ${md(plan.bossName)} · HP ${state.bossHp}/${state.bossMaxHp}\n\n` +
    tr(state.plan.grading ? 'Scores blend automatic evidence and AI or teacher review. Review-pending scores are provisional. AI review is not proof of functional correctness.' : 'Scores measure the configured rubric and static/commit CI evidence. They are not a proof of functional correctness. Teacher reviews may override scores.') + '\n\n' +
    '| ' + ['Step','Attempt','Time','Student ID','Student','Email','Commit','Score','Improvement','Damage', ...(state.plan.grading ? ['Review status'] : []), ...questionColumns.map(q => q.header)].map(tr).join(' | ') + ' |\n|' + [...headers, ...questionColumns].map(() => '---').join('|') + '|\n' +
    records.map((row, i) => `| ${[...row, ...questionValues(i)].map(md).join(' | ')} |`).join('\n') + '\n';
}

export function gradesExport(state: ClassroomState, format: 'csv' | 'md', emails: Record<string, string> = {}): string {
  const grades = lessonGrades(state);
  const partColumns = state.plan.steps.flatMap((s, i) => s.mode === 'questions' ? [{ i, part: 'questions' as const, header: `s${i + 1}-questions` }] : s.mode === 'mixed' ? [{ i, part: 'code' as const, header: `s${i + 1}-code` }, { i, part: 'questions' as const, header: `s${i + 1}-questions` }] : [{ i, part: 'code' as const, header: `s${i + 1}-code` }]);
  const headers = ['student_id', 'student', 'email', ...grades.steps.map(s => s.title + (s.recorded ? '' : ' (not recorded)')), 'total', 'max', 'average', ...partColumns.map(c => c.header), ...(state.plan.grading ? ['review_status'] : [])];
  const rows = grades.students.map(s => [s.id, s.name, emails[s.id] ?? '', ...s.steps, s.total, s.max, s.average, ...partColumns.map(c => s.parts?.[c.i][c.part] ?? (c.part === 'code' && (state.plan.steps[c.i].mode ?? 'code') === 'code' ? s.steps[c.i] : '')), ...(state.plan.grading ? [s.provisional?.some(Boolean) ? 'provisional: review pending' : 'reviewed'] : [])]);
  if (format === 'csv') return [headers, ...rows].map(row => row.map(csv).join(',')).join('\r\n') + '\r\n';
  return 'Unrecorded steps count 0. The teacher must launch the class attack before finishing a step to record it.\n\n' +
    `| ${headers.map(md).join(' | ')} |\n|${headers.map(() => '---').join('|')}|\n` + rows.map(row => `| ${row.map(md).join(' | ')} |`).join('\n') + '\n';
}
