import type { Rubric, RubricCriterion, RubricSignal, StudentFeedback } from '../shared/types.ts';

const signals: RubricSignal[] = ['tests', 'modularity', 'cohesion', 'documentation', 'size', 'cycles', 'tech-debt', 'function-length', 'readme', 'ci', 'license', 'typing', 'commits', 'check'];

/** Keep edited teacher documents inside the shared contract and normalize relative weights. */
export function normalizeRubric(value: unknown): Rubric {
  const rubric = value as Rubric | null;
  if (!rubric || typeof rubric.title !== 'string' || !rubric.title.trim() || rubric.title.length > 200 ||
      !['doc', 'default'].includes(rubric.source) || !Array.isArray(rubric.criteria) || rubric.criteria.length < 1 || rubric.criteria.length > 100) {
    throw new Error('Provide a rubric title and 1–100 mapped criteria. Review any unparsed requirements.');
  }
  const ids = new Set<string>();
  const criteria: RubricCriterion[] = rubric.criteria.map(c => {
    if (!c || typeof c.id !== 'string' || !c.id || c.id.length > 100 || ids.has(c.id) || typeof c.name !== 'string' ||
        !c.name.trim() || c.name.length > 200 || typeof c.description !== 'string' || c.description.length > 8000 ||
        !signals.includes(c.signal) || !Number.isFinite(c.weight) || c.weight < 0 ||
        (c.target !== undefined && (!Number.isFinite(c.target) || c.target < 0))) throw new Error('Invalid rubric criterion or weight.');
    ids.add(c.id);
    let check: RubricCriterion['check'];
    if (c.check) {
      const { kind, value } = c.check;
      if (!['path-exists', 'path-absent', 'max-file-loc', 'min-commits', 'language'].includes(kind) ||
          !((typeof value === 'string' && value.length > 0 && value.length <= 1000) || (typeof value === 'number' && Number.isFinite(value) && value >= 0))) {
        throw new Error('Invalid rubric custom check.');
      }
      check = { kind, value };
    }
    if (c.signal === 'check' && !check) throw new Error('Custom checks need a rule and value.');
    return { id: c.id, name: c.name.trim(), description: c.description, signal: c.signal, weight: c.weight,
      ...(check ? { check } : {}), ...(c.target === undefined ? {} : { target: c.target }) };
  });
  const total = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error('Give at least one rubric criterion a positive weight.');
  const unparsed = rubric.unparsed;
  if (unparsed !== undefined && (!Array.isArray(unparsed) || unparsed.length > 1000 || unparsed.some(line => typeof line !== 'string' || line.length > 8000))) {
    throw new Error('Invalid unparsed rubric requirements.');
  }
  return { title: rubric.title.trim(), source: rubric.source, criteria: criteria.map(c => ({ ...c, weight: c.weight / total })),
    ...(unparsed ? { unparsed: [...unparsed] } : {}) };
}

const csv = (value: string | number) => {
  const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? "'" + value : String(value);
  return '"' + text.replaceAll('"', '""') + '"';
};
const md = (value: string | number) => String(value).replace(/[\\`*_\[\]<>|]/g, '\\$&').replace(/[\r\n]+/g, ' ');

export function feedbackCsv(rubric: Rubric, items: StudentFeedback[]): string {
  const columns = ['Name', 'Repository', 'Rubric score', 'Rank', 'KOs', 'Damage', 'Round wins', 'Quiz', 'Strengths', 'Improvements', 'Summary',
    ...rubric.criteria.flatMap(c => [`${c.name} score (%)`, `${c.name} evidence`])];
  const rows = items.map(item => [item.name, item.repo, item.rubricScore, item.match.rank, item.match.kos, item.match.damage,
    item.match.roundWins, item.match.quiz ?? '', item.strengths.join(' | '), item.improvements.map(i => i.text + (i.file ? ` (${i.file})` : '')).join(' | '), item.summary,
    ...rubric.criteria.flatMap(c => { const result = item.results.find(r => r.criterionId === c.id); return result ? [Math.round(result.score * 10000) / 100, result.evidence] : ['', '']; })]);
  return [columns, ...rows].map(row => row.map(csv).join(',')).join('\r\n') + '\r\n';
}

export function feedbackMarkdown(rubric: Rubric, items: StudentFeedback[]): string {
  return `# ${md(rubric.title)}\n\n` + items.map(item => `## ${md(item.name)} — ${md(item.repo)}\n\n` +
    `Rubric score: **${item.rubricScore}/100**. Rank ${item.match.rank}; ${item.match.kos} KOs; ${item.match.damage} damage; ${item.match.roundWins} round wins.${item.match.quiz ? ' Quiz: ' + md(item.match.quiz) + '.' : ''}\n\n` +
    `${md(item.summary)}\n\n` + rubric.criteria.map(c => {
      const row = item.results.find(r => r.criterionId === c.id);
      return `- **${md(c.name)} (${Math.round(c.weight * 100)}%)**: ${row ? `${Math.round(row.score * 100)}% — ${md(row.evidence)}${row.tip ? ' Tip: ' + md(row.tip) : ''}` : 'Not available'}`;
    }).join('\n') + '\n\nStrengths:\n\n' + item.strengths.map(s => '- ' + md(s)).join('\n') + '\n\nNext steps:\n\n' +
    item.improvements.map(i => '- ' + md(i.text) + (i.file ? ' — ' + md(i.file) : '')).join('\n') + '\n').join('\n');
}
