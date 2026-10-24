import type { Rubric, RubricCriterion, RubricSignal } from '../shared/types.ts';

const clean = (text: string) => text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/`/g, '').trim();
const signalRules: [RubricSignal, RegExp][] = [
  ['function-length', /\b(?:function|method)\s+(?:length|size)|\b(?:short|small|long|focused)\s+(?:functions?|methods?)\b|\b(?:functions?|methods?)\s+(?:over|under|below|above|longer than|at most)\s+\d+/i],
  ['cycles', /\bcircular\b|\bcycles?\b/i],
  ['tech-debt', /\bTODO\b|\bFIXME\b|\bHACK\b|\b(?:tech(?:nical)?[ -])?debt\b/i],
  ['ci', /\bCI\b|\bCD\b|\bpipelines?\b|\bcontinuous integration\b|\bgithub actions\b/i],
  ['license', /\blicen[cs]e\b/i],
  ['typing', /\btyp(?:ing|es|e hints|e annotations|e safety|escript)\b|\btypescript\b/i],
  ['commits', /\bcommits?\b|\b(?:git |version )?history\b/i],
  ['modularity', /\bmodular(?:ity)?\b|\bcoupling\b|\barchitecture\b|\bfan[ -]?out\b|\bdependency depth\b/i],
  ['cohesion', /\bcohesion\b|\bfunctions?\b|\bmethods?\b/i],
  ['tests', /\btests?\b|\btesting\b|\bcoverage\b|\bunit tests?\b/i],
  ['readme', /\breadme\b/i],
  ['documentation', /\bdoc(?:s|umentation)?\b|\bcomments?\b/i],
  ['size', /\b(?:project |code |repo )?size\b|\blines of code\b|\bLOC\b/i],
];

function signalFor(text: string): RubricSignal | undefined {
  return signalRules.find(([, pattern]) => pattern.test(text))?.[0];
}

function customCheck(text: string): RubricCriterion['check'] | undefined {
  const max = text.match(/\bfiles?\s+(?:should\s+be\s+|must\s+be\s+)?(?:no\s+)?(?:over|above|exceed(?:ing)?|under|below|at most|up to|longer than)\s+(\d+)\s*(?:lines?|LOC)\b/i)
    ?? text.match(/\bmax(?:imum)?\s+file\s+(?:size|length|LOC)\s*[:=]?\s*(\d+)/i);
  if (max) return { kind: 'max-file-loc', value: Number(max[1]) };
  const commits = text.match(/\b(?:at least|minimum(?: of)?|min\.?)\s+(\d+)\s+commits?\b/i);
  if (commits) return { kind: 'min-commits', value: Number(commits[1]) };
  const language = text.match(/\b(?:written in|implemented in|required language\s*:?|language\s*:)\s*(TypeScript|JavaScript|Python|Rust|Go|Java|C\+\+|C#|C|Ruby|Kotlin|Swift|R|Julia)(?=\s|[.,;:)]|$)/i);
  if (language) return { kind: 'language', value: language[1] };
  const path = text.match(/\b(?:contain|include|have|provide|contains|includes)\s+(?:an?\s+)?(?:folder\s+|directory\s+|file\s+)?([\w.@/-]+\/|[\w.@/-]+\.[\w*.-]+)(?:\s|$|[,;)])/i);
  if (path) return { kind: /\b(?:must not|may not|should not|not contain|no|without)\b/i.test(text) ? 'path-absent' : 'path-exists', value: path[1] };
  return undefined;
}

function takeWeight(text: string): { text: string; weight?: number } {
  // Only parentheses/brackets, leading percentages, or trailing labelled weights are weights.
  // A percentage inside the requirement ("tests: at least 20%") is a target.
  const match = text.match(/[([]\s*(\d+(?:\.\d+)?)\s*(?:%|pts?\b|points?\b)\s*[)\]]/i)
    ?? text.match(/(?:^|[—–:]\s*|\s+-\s+)(\d+(?:\.\d+)?)\s*(?:pts?\b|points?\b)/i)
    ?? text.match(/^(\d+(?:\.\d+)?)\s*%\s+/)
    ?? text.match(/\s+(\d+(?:\.\d+)?)\s*(?:pts?\b|points?\b)\s*$/i)
    ?? (!/\b(?:at least|at most|target|coverage|ratio|minimum|maximum)\b/i.test(text)
      ? text.match(/(?:\s+[—–-]\s*|:\s*|\s+)(\d+(?:\.\d+)?)\s*%\s*(?::|$)/)
      : null);
  if (!match) return { text };
  return { weight: Number(match[1]), text: text.replace(match[0], match[0].trimEnd().endsWith(':') ? ': ' : ' ').trim() };
}

function targetFor(text: string, signal: RubricSignal): number | undefined {
  const percentage = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentage && ['tests', 'documentation', 'typing'].includes(signal)) return Number(percentage[1]) / 100;
  // A naked number must occur in a measured requirement, rather than a course name or list ordinal.
  const n = text.match(/\b(?:at least|at most|under|over|below|above|maximum(?: of)?|minimum(?: of)?|target\s*:?|no more than|up to)\s*(\d+(?:\.\d+)?)/i)
    ?? text.match(/(\d+(?:\.\d+)?)\s*(?:characters?|chars?|lines?|LOC|commits?|cycles?|TODOs?|per\s+(?:kLOC|file)|functions?\/file)\b/i)
    ?? text.match(/(?:fan[ -]?out|depth|length)\s*(?:[<≤=:]\s*)?(\d+(?:\.\d+)?)/i);
  if (n) return Number(n[1]);
  if (['cycles', 'tech-debt'].includes(signal) && /\b(?:no|zero|without|free of)\b/i.test(text)) return 0;
  return undefined;
}

/** Deterministic preview: unsupported requirements stay visible for the teacher to fix. */
export function parseRubric(text: string, filename?: string): Rubric {
  const criteria: RubricCriterion[] = [], unparsed: string[] = [];
  let title = filename?.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ') || 'Classroom rubric';
  let titleFound = false;
  let tableHeader: string[] | undefined;
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const raw = lines[lineIndex];
    let line = raw.trim();
    if (!line || /^[-=]{3,}$/.test(line)) continue;
    const heading = /^#{1,6}\s+/.test(line);
    line = clean(line.replace(/^#{1,6}\s+/, '').replace(/^(?:[-+*•]\s+|\d+[.)]\s+)/, ''));
    if (!line) continue;
    // Criterion headings commonly put their requirement in the following paragraph.
    // Preserve bullets as separate requirements so unmeasurable work remains visible.
    if (heading && /^#{2,6}\s+/.test(raw.trim()) && (signalFor(line) || takeWeight(line).weight !== undefined)) {
      while (lineIndex + 1 < lines.length) {
        const next = lines[lineIndex + 1].trim();
        if (/^(?:#|[-+*•]\s|\d+[.)]\s)/.test(next) || next.includes('|')) break;
        lineIndex++;
        if (next) line += `: ${clean(next)}`;
      }
    }
    let weight: number | undefined, tableName: string | undefined, targetText: string | undefined;
    if (line.includes('|')) {
      const cells = line.replace(/^\||\|$/g, '').split('|').map(clean);
      if (cells.every(cell => /^:?-{2,}:?$/.test(cell))) continue;
      if (cells.some(cell => /^(?:criterion|criteria|category|requirement)$/i.test(cell)) && cells.some(cell => /weight|points|marks|percent/i.test(cell))) {
        tableHeader = cells; continue;
      }
      const weightIndex = tableHeader?.findIndex(cell => /weight|points|marks|percent/i.test(cell)) ?? 1;
      const targetIndex = tableHeader?.findIndex(cell => /target|threshold/i.test(cell)) ?? -1;
      const nameIndex = tableHeader?.findIndex(cell => /criterion|criteria|category|requirement/i.test(cell)) ?? 0;
      tableName = cells[nameIndex] ?? cells[0];
      if (weightIndex >= 0 && /^\d+(?:\.\d+)?\s*(?:%|pts?|points?)?$/i.test(cells[weightIndex] ?? '')) weight = parseFloat(cells[weightIndex]);
      targetText = targetIndex >= 0 ? cells[targetIndex] : undefined;
      line = cells.filter((_, i) => i !== weightIndex || weight === undefined).join(': ');
    } else tableHeader = undefined;
    const weighted = takeWeight(line);
    line = weighted.text; weight ??= weighted.weight;
    const check = customCheck(line);
    const label = (tableName ?? line.split(/[:—–]/)[0]).replace(/\s*\(.*$/, '').trim();
    const signal = check ? 'check' : signalFor(label) ?? signalFor(line);
    // The first document heading is its title; criterion headings still parse below.
    if (heading && !titleFound) {
      title = line; titleFound = true;
      if (!signal || /rubric|course|project|grading|assessment/i.test(line) && weight === undefined) continue;
    }
    if (!signal) { unparsed.push(raw.trim()); continue; }
    const target = check ? undefined : targetFor(targetText ? `target ${targetText}` : line, signal);
    const name = (tableName ?? label.replace(/\s+\d+(?:\.\d+)?\s*(?:pts?|points?)\s*$/i, '')).trim() || line;
    criteria.push({ id: `criterion-${criteria.length + 1}`, name, weight: weight ?? 1, signal, description: line,
      ...(check ? { check } : {}), ...(target === undefined ? {} : { target }) });
  }
  const total = criteria.reduce((sum, c) => sum + c.weight, 0);
  for (const criterion of criteria) criterion.weight = total > 0 ? criterion.weight / total : 1 / criteria.length;
  return { title, criteria, source: 'doc', ...(unparsed.length ? { unparsed } : {}) };
}

export function defaultRubric(): Rubric {
  return { title: 'Code quality classroom rubric', source: 'default', criteria: [
    { id: 'tests', name: 'Testing', signal: 'tests', weight: 0.25, target: 0.3, description: 'Test-file ratio and a test directory support your armor; this measures presence, not passing tests or coverage.' },
    { id: 'modularity', name: 'Modularity', signal: 'modularity', weight: 0.2, description: 'Low component fan-out and shorter dependency chains support your speed.' },
    { id: 'cohesion', name: 'Focused functions', signal: 'cohesion', weight: 0.2, description: 'Focused functions and a healthy number of definitions per file support your damage.' },
    { id: 'documentation', name: 'Documentation', signal: 'documentation', weight: 0.2, description: 'Useful comments and README examples support energy and regeneration.' },
    { id: 'size', name: 'Project foundation', signal: 'size', weight: 0.05, description: 'Capped logarithmic source size and README presence support HP.' },
    { id: 'cycles', name: 'Acyclic dependencies', signal: 'cycles', weight: 0.05, target: 0, description: 'Fewer circular dependencies reduce your weakness.' },
    { id: 'tech-debt', name: 'Manage technical debt', signal: 'tech-debt', weight: 0.05, target: 0, description: 'Review TODO/FIXME/HACK density; comments are prompts for review, not proof of defects.' },
  ] };
}
