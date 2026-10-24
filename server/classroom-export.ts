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

/** Public aggregates only. Feedback details and repository source stay out of exports. */
export function classroomExport(state: ClassroomState, format: 'csv' | 'md', lang: Locale = 'en'): string {
  const tr = (s: string) => translate(s, lang);
  const plan = localizeClassroomPlan(state.plan, lang);
  const records = state.rounds.flatMap(round => round.attacks.map(a => [round.stepId, round.attempt, new Date(round.at).toISOString(), a.id, a.name, a.commit, a.score, a.improvement, a.damage]));
  if (format === 'csv') return [ ['step', 'attempt', 'time', 'student_id', 'student', 'commit', 'score', 'improvement', 'damage'], ...records ].map(row => row.map(csv).join(',')).join('\r\n') + '\r\n';
  return `# ${md(plan.title)}\n\n${tr('Boss')}: ${md(plan.bossName)} · HP ${state.bossHp}/${state.bossMaxHp}\n\n` +
    tr('Scores measure the configured rubric and static/commit CI evidence. They are not a proof of functional correctness. Teacher reviews may override scores.') + '\n\n' +
    '| ' + ['Step','Attempt','Time','Student ID','Student','Commit','Score','Improvement','Damage'].map(tr).join(' | ') + ' |\n|---|---|---|---|---|---|---|---|---|\n' +
    records.map(row => `| ${row.map(md).join(' | ')} |`).join('\n') + '\n';
}
