// Read-only question rendering shared by the student reveal, the teacher's per-student review, the lesson preview and
// the course upload preview. Authored text (prompts, options, explanations, keys) is marked data-i18n-skip so the
// UI translator never rewrites it; only our own labels go through the catalog.
import type { ClassroomQuestion, QuestionAnswer, QuestionResult } from '../../shared/classroom';
import { h } from '../app/util';
import { richText } from './task-card';
import { acceptedFor, blankCount, explainFor, isAnswered, keyFor, percent, points, promptParts, verdict, type AnyQuestion } from './questions';
import './questions.css';

export const KIND_LABEL: Record<ClassroomQuestion['kind'], string> = { single: 'Single choice', multi: 'Select all that apply', blank: 'Fill in the blank' };
export const LETTERS = 'ABCDEFGHIJKLMNOP';
export const pointsLabel = (q: AnyQuestion) => points(q) === 1 ? '1 pt' : `${points(q)} pts`;

/** Prompt text with inline `code`, fenced code blocks and a node per {{n}} blank (from `blank(n)`). */
export function renderPrompt(prompt: string, blank: (n: number) => Node): HTMLElement {
  const el = h('div.qs-prompt', { 'data-i18n-skip': '' });
  let para: HTMLElement | null = null;
  const line = () => { if (!para) { para = h('p'); el.append(para); } return para; };
  for (const part of promptParts(prompt)) {
    if (part.kind === 'code') { para = null; el.append(h('pre.qs-code', { translate: 'no' }, ...part.parts.map(p => p.kind === 'blank' ? blank(p.n) : document.createTextNode(p.text)))); continue; }
    if (part.kind === 'blank') { line().append(blank(part.n)); continue; }
    // paragraphs: a blank line starts a new <p>; single newlines stay line breaks
    part.text.split(/\n{2,}/).forEach((chunk, i) => {
      if (i > 0) para = null;
      chunk.split('\n').forEach((row, j) => { if (j > 0) line().append(h('br')); if (row) line().append(...richText(row)); });
    });
  }
  return el;
}

export const verdictText = (v: ReturnType<typeof verdict>, result?: QuestionResult) =>
  v === 'correct' ? '✓ Correct' : v === 'partial' ? `◐ Partly right (${percent(result?.score)}%)` : v === 'wrong' ? '✗ Incorrect' : '';

/**
 * One question, read-only. `result` = a student's answer and grading (omit for an answer key preview).
 * showKey: mark the correct options / accepted blanks. Without a key the card only shows what was picked.
 */
export function reviewCard(q: AnyQuestion, index: number, opts: { result?: QuestionResult; showKey: boolean; showAnswer: boolean; testid?: string }): HTMLElement {
  const { result } = opts;
  const answer: QuestionAnswer | undefined = opts.showAnswer ? result?.answer : undefined;
  const key = opts.showKey ? keyFor(q, result) : undefined;
  const v = opts.showAnswer ? verdict(result) : null;
  const answered = isAnswered(answer);
  const badge = !opts.showAnswer ? null
    : !answered ? h('span.qs-badge.qs-badge-none', null, 'Not answered')
    : v ? h(`span.qs-badge.qs-badge-${v}`, null, verdictText(v, result)) : h('span.qs-badge', null, 'Answered');
  const head = h('header.qs-card-head', null, h('span.qs-num', null, String(index + 1)), h('span.qs-kind', null, KIND_LABEL[q.kind]), h('span.qs-pts', null, pointsLabel(q)), badge);
  let body: HTMLElement;
  if (q.kind === 'blank') {
    const given = answer && 'blanks' in answer ? answer.blanks : [];
    const keyBlanks = key && 'blanks' in key ? key.blanks : [];
    const prompt = renderPrompt(q.prompt, n => {
      const i = n - 1, text = given[i]?.trim() ?? '';
      const ok = result?.blankCorrect?.[i];
      if (opts.showAnswer) return h(`span.qs-filled${ok === true ? '.qs-ok' : ok === false ? '.qs-bad' : ''}${text ? '' : '.qs-empty'}`, { 'data-i18n-skip': '' }, text || '—');
      return h('span.qs-filled.qs-ok', { 'data-i18n-skip': '' }, keyBlanks[i] ?? acceptedFor(q, i)[0] ?? '____');
    });
    const n = blankCount(q);
    const keyRows = key && opts.showAnswer ? Array.from({ length: n }, (_, i) => {
      const accepted = acceptedFor(q, i); const shown = accepted.length ? accepted : keyBlanks[i] ? [keyBlanks[i]] : [];
      return h('li', null, h('span.qs-key-label', null, n > 1 ? `Blank ${i + 1}` : 'Answer'), h('span.qs-key-text', { 'data-i18n-skip': '' }, shown.join(' · ') || '—'));
    }) : !opts.showAnswer && key ? Array.from({ length: n }, (_, i) => acceptedFor(q, i).length > 1 ? h('li', null, h('span.qs-key-label', null, n > 1 ? `Blank ${i + 1} also accepts` : 'Also accepts'), h('span.qs-key-text', { 'data-i18n-skip': '' }, acceptedFor(q, i).slice(1).join(' · '))) : null).filter(Boolean) as HTMLElement[] : [];
    const numeric = !opts.showAnswer && 'blanks' in q && Array.isArray(q.blanks) ? q.blanks.map((b, i) => b.numeric ? h('li', null, h('span.qs-key-label', null, n > 1 ? `Blank ${i + 1} number` : 'Number'), h('span.qs-key-text', null, `${b.numeric.value} ± ${b.numeric.tolerance}`)) : null).filter(Boolean) as HTMLElement[] : [];
    body = h('div', null, prompt, keyRows.length || numeric.length ? h('ul.qs-key-list', null, ...keyRows, ...numeric) : null);
  } else {
    const picked = new Set(answer ? 'choice' in answer ? [answer.choice] : 'choices' in answer ? answer.choices : [] : []);
    const right = new Set(key ? 'choice' in key ? [key.choice] : 'choices' in key ? key.choices : [] : []);
    const options = h('ul.qs-options.qs-options-static', null, ...q.options.map((o, i) => {
      const isPicked = picked.has(o.id), isRight = right.has(o.id);
      const cls = `${isPicked ? '.qs-picked' : ''}${key && isRight ? '.qs-opt-key' : ''}${key && isPicked && !isRight ? '.qs-opt-bad' : ''}`;
      const note = key && isRight && opts.showAnswer && !isPicked ? h('small.qs-opt-note', null, 'correct answer') : key && isPicked && !isRight ? h('small.qs-opt-note', null, 'your pick') : isPicked && !key ? h('small.qs-opt-note', null, 'your pick') : null;
      return h(`li.qs-option${cls}`, null, h('span.qs-letter', { 'aria-hidden': 'true' }, key && isRight ? '✓' : key && isPicked ? '✗' : LETTERS[i]),
        h('span.qs-opt-text', { 'data-i18n-skip': '' }, ...richText(o.text)), note);
    }));
    body = h('div', null, renderPrompt(q.prompt, () => document.createTextNode('____')), options);
  }
  const explain = opts.showKey ? explainFor(q, result) : undefined;
  const attempts = opts.showAnswer && result && result.attempts > 1 ? h('small.qs-attempts', null, `${result.attempts} checks`) : null;
  return h(`article.qs-card.qs-review${v ? `.qs-${v}` : ''}`, { 'data-testid': opts.testid ?? `question-review-${q.id}`, 'data-q': q.id }, head, body,
    explain ? h('div.qs-explain', null, h('b', null, 'Why'), h('p', { 'data-i18n-skip': '' }, ...richText(explain))) : null, attempts);
}

/**
 * The step's shared code or reading (`questionContext`), shown once above its questions so a question can say
 * "the code above". Markdown-lite like a prompt; `{{n}}` has no meaning here and stays literal text.
 */
export function questionContextView(text: string | undefined, testid = 'question-context'): HTMLElement | null {
  if (!text?.trim()) return null;
  return h('section.qs-context', { 'data-testid': testid, 'aria-label': 'Shared code and reading' },
    h('small.qs-context-label', null, 'Read this first · the questions below refer to it'),
    renderPrompt(text, n => document.createTextNode(`{{${n}}}`)));
}

/** Answer-key preview of a whole set (lesson preview overlay, course upload preview), with the shared context on top. */
export function questionPreview(questions: AnyQuestion[], testid = 'question-preview', context?: string): HTMLElement {
  return h('div.qs-preview', { 'data-testid': testid }, questionContextView(context, `${testid}-context`), ...questions.map((q, i) => reviewCard(q, i, { showKey: true, showAnswer: false, testid: `${testid}-${q.id}` })));
}
