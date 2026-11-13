// Class-level question aggregates: the teacher's live bars (questionLive, weakest question first) and the projector
// board (during coding only "N answered"; after the attack the frozen distributions from round.questionStats, with
// the correct option marked unless the step keeps answers private). Anonymous: never names.
import type { ClassroomStep, QuestionStat } from '../../shared/classroom';
import { h } from '../app/util';
import { excerpt, keyFor, revealMode, type AnyQuestion } from './questions';
import { KIND_LABEL, LETTERS, questionContextView } from './question-view';
import { richText } from './task-card';
import './questions.css';

const pct = (a: number, b: number) => b > 0 ? Math.round(a / b * 100) : 0;
const meter = (value: number, cls: string, label: string) => h(`div.ql-meter.${cls}`, { role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(value), 'aria-label': label }, h('i', { style: `width:${Math.max(0, Math.min(100, value))}%` }));

interface RowOpts { rates: boolean; distribution: boolean; markKey: boolean; testid: string }
function statRow(q: AnyQuestion, index: number, stat: QuestionStat | undefined, o: RowOpts): HTMLElement {
  const answered = stat?.answered ?? 0, total = stat?.total ?? 0, correct = stat?.correct ?? 0;
  const rate = pct(correct, answered);
  const key = o.markKey ? keyFor(q) : undefined;
  const right = new Set(key ? 'choice' in key ? [key.choice] : 'choices' in key ? key.choices : [] : []);
  const head = h('div.ql-head', null, h('span.qs-num', null, String(index + 1)), h('span.ql-prompt', { 'data-i18n-skip': '' }, ...richText(excerpt(q.prompt) || '…')), h('small.ql-kind', null, KIND_LABEL[q.kind]));
  const answeredLine = h('div.ql-line', null, h('span.ql-label', null, `${answered} of ${total} answered`), meter(pct(answered, total), 'ql-answered', 'answered'));
  const rateLine = o.rates ? h('div.ql-line', null, h(`span.ql-label${answered && rate < 50 ? '.ql-low' : ''}`, null, answered ? `${rate}% correct` : 'no answers yet'), meter(rate, rate < 50 ? 'ql-bad' : 'ql-good', 'correct')) : null;
  const options = o.distribution && q.kind !== 'blank' && stat?.options ? h('ul.ql-options', null, ...q.options.map((opt, i) => {
    const n = stat.options?.find(x => x.id === opt.id)?.count ?? 0, isKey = right.has(opt.id);
    return h(`li${isKey ? '.ql-key' : ''}`, null, h('span.qs-letter', { 'aria-hidden': 'true' }, isKey ? '✓' : LETTERS[i]), h('span.ql-opt', { 'data-i18n-skip': '' }, excerpt(opt.text, 60)),
      meter(pct(n, answered), isKey ? 'ql-good' : 'ql-plain', opt.text), h('b.ql-n', null, String(n)));
  })) : null;
  return h(`article.ql-row${o.rates && answered && rate < 50 ? '.ql-weak' : ''}`, { 'data-testid': `${o.testid}-${q.id}`, 'data-q': q.id }, head, answeredLine, rateLine, options);
}

/** Teacher console: live per-question bars. hidden = this console may be on the projector (answered counts only). */
export function createQuestionLive(opts: { onReveal(): void }) {
  let sig = '';
  const el = h('section.ql.cr-measurements', { 'data-testid': 'question-live' });
  return {
    el,
    update(v: { step: ClassroomStep | undefined; stats: QuestionStat[] | undefined; hidden: boolean; frozen?: boolean }) {
      const qs = (v.step?.questions ?? []) as AnyQuestion[];
      el.hidden = !qs.length;
      const next = JSON.stringify([v.step?.id, qs.map(q => q.id), v.stats, v.hidden, v.frozen]);
      if (next === sig || !qs.length) return; sig = next;
      const byId = new Map((v.stats ?? []).map(s => [s.id, s]));
      // weakest first: lowest correct rate among answered questions; unanswered ones last, in step order
      const order = qs.map((q, i) => ({ q, i, s: byId.get(q.id) })).sort((a, b) => {
        const ra = a.s?.answered ? a.s.correct / a.s.answered : 2, rb = b.s?.answered ? b.s.correct / b.s.answered : 2;
        return ra - rb || a.i - b.i;
      });
      const answeredAll = qs.length && v.stats?.length ? Math.min(...qs.map(q => byId.get(q.id)?.answered ?? 0)) : 0;
      el.replaceChildren(
        h('div.ql-title', null, h('h3', null, v.frozen ? 'Questions · results' : 'Questions · live'), h('small', null, v.hidden ? 'Correct rates are hidden while this screen may be on the projector.' : 'Weakest question first. Updates on every save.'),
          v.hidden ? h('button.btn', { type: 'button', 'data-testid': 'question-live-reveal', onclick: () => opts.onReveal() }, 'Show details') : null),
        !v.stats?.length ? h('p.ql-empty', null, 'No answers yet.') : h('p.ql-empty', null, `${answeredAll} answered every question so far.`),
        ...(v.hidden ? qs.map((q, i) => ({ q, i })) : order).map(({ q, i }) => statRow(q, i, byId.get(q.id), { rates: !v.hidden, distribution: !v.hidden, markKey: !v.hidden, testid: 'question-live' })));
    },
  };
}

/** Projector: no names, no per-student data. During coding only the answered count; after the attack the frozen stats. */
export function createQuestionBoard() {
  let sig = '';
  const el = h('section.ql.ql-board', { 'data-testid': 'question-board' });
  return {
    el,
    update(v: { step: ClassroomStep | undefined; phase: string; answered: number; total: number; stats?: QuestionStat[]; mixed?: boolean; answeredPer?: number[] }) {
      const qs = (v.step?.questions ?? []) as AnyQuestion[];
      el.hidden = !qs.length || !['coding', 'paused', 'feedback', 'complete'].includes(v.phase);
      const next = JSON.stringify([v.step?.id, v.step?.questions, v.step?.questionContext, v.phase, v.answered, v.total, v.stats, v.mixed, v.answeredPer]);
      if (next === sig || el.hidden) return; sig = next;
      const after = !!v.stats?.length && ['feedback', 'complete'].includes(v.phase);
      const secret = revealMode(v.step) === 'never';
      const byId = new Map((v.stats ?? []).map(s => [s.id, s]));
      el.replaceChildren(
        h('div.ql-title', null, h('h3', null, after ? 'How the class answered' : qs.length === 1 ? '1 question' : `${qs.length} questions`),
          h('small', null, after ? (secret ? 'Answers stay private for this quiz.' : 'The correct option is marked ✓.') : v.mixed ? 'Answer these on your phone or laptop, next to the code task.' : `${v.answered} of ${v.total} students answered`)),
        ...[questionContextView(v.step?.questionContext, 'question-board-context')].filter((n): n is HTMLElement => !!n),
        ...(after
          ? qs.map((q, i) => statRow(q, i, byId.get(q.id), { rates: !secret, distribution: !secret, markKey: !secret, testid: 'question-board' }))
          // during coding: only how many answered each question (ClassroomState.questionAnswered), never what or whether right
          : [h('ol.ql-list', null, ...qs.map((q, i) => h('li', { 'data-testid': `question-board-${q.id}` }, h('span.ql-prompt', { 'data-i18n-skip': '' }, ...richText(excerpt(q.prompt, 140))), h('small.ql-kind', null, KIND_LABEL[q.kind]),
              v.answeredPer ? h('div.ql-line', null, h('span.ql-label', null, `${v.answeredPer[i] ?? 0} answered`), meter(pct(v.answeredPer[i] ?? 0, v.total), 'ql-answered', 'answered')) : null)))]));
    },
  };
}
