// Teacher lesson editor for one step's question set: step type, feedback / reveal settings, mixed weight, and the
// questions themselves (add, edit, reorder, delete; mark correct options; blanks with a live student preview).
// Edits write straight into `step` (the draft); validation mirrors the server limits (questions.ts).
import type { BlankSpec, ClassroomQuestion, ClassroomStep, StepMode } from '../../shared/classroom';
import { h } from '../app/util';
import { convertQuestion, excerpt, markers, newQuestion, nextOptionId, stepMode, validateQuestions, QUESTION_LIMITS } from './questions';
import { KIND_LABEL, questionContextView, renderPrompt } from './question-view';
import './questions.css';

const field = (label: string, input: HTMLElement, cls = '') => h(`label.cr-field${cls ? '.' + cls : ''}`, null, h('span', null, label), input);
const btn = (label: string, test: string, run: () => void, cls = '') => h(`button.btn${cls ? '.' + cls : ''}`, { type: 'button', 'data-testid': test, onclick: run }, label);
const num = (value: number | undefined, min: number, max: number, test: string, step = 1) =>
  h('input', { type: 'number', min, max, step, value: value ?? '', inputmode: 'decimal', 'data-testid': test }) as HTMLInputElement;

export const MODE_LABEL: Record<StepMode, string> = { code: 'Code task', questions: 'Questions only', mixed: 'Code task + questions' };

/**
 * `onMode` lets the step editor show or hide its code-only fields. `onChange` refreshes the step summary line.
 * Returns the element and validate(), which also paints the step's error line (a .cr-form-error, so Publish blocks).
 */
export function createQuestionEditor(step: ClassroomStep, index: number, hooks: { onMode(mode: StepMode): void; onChange(): void }) {
  const errorLine = h('p.cr-form-error.qe-errors', { role: 'alert', 'data-testid': `step-question-errors-${index}` });
  const modeSelect = h('select', { 'data-testid': `step-mode-${index}` }, ...(['code', 'questions', 'mixed'] as const).map(m => h('option', { value: m }, MODE_LABEL[m]))) as HTMLSelectElement;
  modeSelect.value = stepMode(step);
  const feedback = h('select', { 'data-testid': `step-feedback-${index}` },
    h('option', { value: 'after-close' }, 'After submissions close (students only see “saved”)'),
    h('option', { value: 'immediate' }, 'Immediately, with limited attempts')) as HTMLSelectElement;
  feedback.value = step.answerFeedback ?? 'after-close';
  const reveal = h('select', { 'data-testid': `step-reveal-${index}` },
    h('option', { value: 'after-raid' }, 'After the class attack'),
    h('option', { value: 'never' }, 'Never: students only see their score (exam)')) as HTMLSelectElement;
  reveal.value = step.revealAnswers ?? 'after-raid';
  const weight = num(step.questionsWeight ?? 50, 0, 100, `step-questions-weight-${index}`);
  const weightField = field('Questions share of the step score (%) · the rest is the code task', weight);
  const list = h('div.qe-list', { 'data-testid': `step-questions-${index}` });
  const counter = h('small.qe-count');
  const adders = h('div.qe-adders', null, h('small', null, 'Add a question:'),
    ...(['single', 'multi', 'blank'] as const).map(kind => btn(`+ ${KIND_LABEL[kind]}`, `step-add-question-${kind}-${index}`, () => {
      const qs = step.questions ??= [];
      if (qs.length >= QUESTION_LIMITS.questions) return;
      qs.push(newQuestion(kind, qs.map(q => q.id))); open.add(qs.at(-1)!.id); rebuild();
      list.lastElementChild?.querySelector<HTMLElement>('textarea')?.focus();
    }, 'btn-ghost')));
  // instant feedback would show correctness, which a private ('never') quiz must not: the two exclude each other
  const privateNote = h('small.qe-note', { 'data-testid': `step-feedback-note-${index}` }, 'Answers stay private, so students cannot see right away whether they are correct.');
  const immediateOption = [...feedback.options].find(o => o.value === 'immediate')!;
  const enforcePrivate = () => {
    const secret = reveal.value === 'never';
    immediateOption.disabled = secret; privateNote.hidden = !secret;
    if (secret && feedback.value === 'immediate') { feedback.value = 'after-close'; delete step.answerFeedback; }
  };
  const settings = h('div.qe-settings', null,
    h('div.cr-editor-numbers', null, h('div.qe-stack', null, field('Show correctness to students', feedback), privateNote), field('Reveal answers and explanations', reveal)), weightField);
  // shared code / reading (optional): shown once above the questions, so a question can say "the code above"
  const contextBox = h('textarea.qe-context', { rows: 4, maxlength: QUESTION_LIMITS.context, spellcheck: 'false', 'data-testid': `step-question-context-${index}`, 'aria-describedby': `qe-context-count-${index}`,
    placeholder: 'Optional. Code or a short reading that several questions use. Put code in ``` fences.' }, step.questionContext ?? '') as HTMLTextAreaElement;
  const contextCount = h('small.cu-count', { id: `qe-context-count-${index}`, 'data-testid': `step-question-context-count-${index}`, 'aria-live': 'polite' });
  const contextPreview = h('div.qe-preview', { 'aria-label': 'Student preview', 'data-testid': `step-question-context-preview-${index}` });
  const paintContext = () => {
    const n = contextBox.value.length;
    contextCount.textContent = `${n} / ${QUESTION_LIMITS.context}`; contextCount.classList.toggle('cu-count-full', n >= QUESTION_LIMITS.context);
    const shown = questionContextView(contextBox.value);
    contextPreview.hidden = !shown;
    contextPreview.replaceChildren(...(shown ? [h('small.qe-preview-label', null, 'Students see, above the questions'), shown] : []));
  };
  contextBox.oninput = () => { if (contextBox.value.trim()) step.questionContext = contextBox.value; else delete step.questionContext; paintContext(); changed(); };
  paintContext();
  const contextField = h('div.qe-context-field', null,
    h('label.cu-prompt-field', null, h('span.cu-prompt-head', null, h('span.cu-label', null, 'Shared code or reading for these questions (optional)'), contextCount), contextBox), contextPreview);
  const body = h('div.qe-body', null, settings, contextField, h('div.qe-list-head', null, h('h4', null, 'Questions'), counter), list, adders);
  const el = h('section.qe', { 'data-testid': `step-question-editor-${index}` }, field('Step type', modeSelect), body, errorLine);
  const open = new Set<string>(step.questions?.length ? [] : []);

  const validate = () => {
    const errors = validateQuestions(step);
    errorLine.textContent = errors.slice(0, 4).join(' ') + (errors.length > 4 ? ` (+${errors.length - 4} more)` : '');
    return !errors.length;
  };
  const changed = () => { validate(); hooks.onChange(); counter.textContent = `${step.questions?.length ?? 0} / ${QUESTION_LIMITS.questions}`; };
  const sync = () => {
    const mode = stepMode(step);
    body.hidden = mode === 'code';
    weightField.hidden = mode !== 'mixed';
    hooks.onMode(mode);
    for (const node of list.querySelectorAll<HTMLElement>('.qe-attempts')) node.hidden = feedback.value !== 'immediate';
  };
  modeSelect.onchange = () => {
    const mode = modeSelect.value as StepMode;
    if (mode === 'code') delete step.mode; else step.mode = mode;
    if (mode !== 'code' && !step.questions?.length) { step.questions = [newQuestion('single', [])]; open.add(step.questions[0].id); rebuild(); }
    sync(); changed();
  };
  feedback.onchange = () => { if (feedback.value === 'after-close') delete step.answerFeedback; else step.answerFeedback = 'immediate'; sync(); changed(); };
  reveal.onchange = () => { if (reveal.value === 'after-raid') delete step.revealAnswers; else step.revealAnswers = 'never'; enforcePrivate(); sync(); changed(); };
  enforcePrivate();
  weight.oninput = () => { step.questionsWeight = weight.value.trim() === '' ? NaN : Number(weight.value); changed(); };

  function rebuild() {
    const qs = step.questions ?? [];
    list.replaceChildren(...qs.map((q, i) => questionEditor(q, i)));
    sync(); changed();
  }
  const move = (i: number, delta: number) => {
    const qs = step.questions!, to = i + delta; if (to < 0 || to >= qs.length) return;
    [qs[i], qs[to]] = [qs[to], qs[i]]; rebuild();
    list.children[to]?.querySelector<HTMLElement>(`[data-testid="question-up-${index}-${to}"]`)?.focus();
  };

  function questionEditor(q: ClassroomQuestion, i: number): HTMLElement {
    const replace = (next: ClassroomQuestion) => { step.questions![i] = next; rebuild(); };
    const summary = h('summary', null);
    const paintSummary = () => {
      const text = excerpt(q.prompt, 200);
      summary.replaceChildren(h('b', null, `Q${i + 1}`), h('span.qe-sum-kind', null, KIND_LABEL[q.kind]), h('span.qe-sum-sep', { 'aria-hidden': 'true' }, '·'), h('span.qe-sum-text', { 'data-i18n-skip': '' }, text.length > 70 ? `${text.slice(0, 69)}…` : text || '…'));
    };
    const kind = h('select', { 'data-testid': `question-kind-${index}-${i}`, 'aria-label': 'Question type' }, ...(['single', 'multi', 'blank'] as const).map(k => h('option', { value: k }, KIND_LABEL[k]))) as HTMLSelectElement;
    kind.value = q.kind;
    kind.onchange = () => { open.add(q.id); replace(convertQuestion(q, kind.value as ClassroomQuestion['kind'])); };
    const prompt = h('textarea', { rows: 3, maxlength: QUESTION_LIMITS.prompt, 'data-testid': `question-prompt-${index}-${i}`,
      placeholder: q.kind === 'blank' ? 'The capital of France is {{1}}.' : 'What does print(2 + 3) show?' }, q.prompt) as HTMLTextAreaElement;
    const preview = h('div.qe-preview', { 'aria-label': 'Student preview' });
    const pointsIn = num(q.points ?? 1, 1, 100, `question-points-${index}-${i}`);
    pointsIn.oninput = () => { const v = Number(pointsIn.value); if (pointsIn.value.trim() === '' || v === 1) delete q.points; else q.points = v; changed(); };
    const attempts = num(q.maxAttempts ?? 3, 1, 10, `question-attempts-${index}-${i}`);
    attempts.oninput = () => { const v = Number(attempts.value); if (attempts.value.trim() === '' || v === 3) delete q.maxAttempts; else q.maxAttempts = v; changed(); };
    const explain = h('textarea', { rows: 2, maxlength: QUESTION_LIMITS.explain, 'data-testid': `question-explain-${index}-${i}`, placeholder: 'Shown with the correct answer when answers are revealed.' }, q.explain ?? '') as HTMLTextAreaElement;
    explain.oninput = () => { if (explain.value.trim()) q.explain = explain.value; else delete q.explain; changed(); };
    let specific: HTMLElement;
    if (q.kind === 'blank') {
      const blanks = h('div.qe-blanks');
      const paintBlanks = () => blanks.replaceChildren(...q.blanks.map((b, j) => blankEditor(q, b, j)));
      // keep one spec per {{n}} marker: typing {{3}} adds a blank, deleting one removes its spec
      const fit = () => {
        const n = Math.min(6, Math.max(...markers(q.prompt), 0));
        if (n !== q.blanks.length && n >= 1) { while (q.blanks.length < n) q.blanks.push({ accept: [''] }); q.blanks.length = n; paintBlanks(); }
      };
      const insert = btn('+ Insert blank', `question-insert-blank-${index}-${i}`, () => {
        if (q.blanks.length >= 6) return;
        const n = q.blanks.length + 1, at = prompt.selectionStart ?? prompt.value.length;
        const used = markers(prompt.value);
        const marker = `{{${used.length ? Math.max(...used) + 1 : n}}}`;
        prompt.value = `${prompt.value.slice(0, at)}${marker}${prompt.value.slice(prompt.selectionEnd ?? at)}`;
        prompt.dispatchEvent(new Event('input')); prompt.focus(); prompt.selectionStart = prompt.selectionEnd = at + marker.length;
      }, 'btn-ghost');
      prompt.addEventListener('input', fit);
      paintBlanks();
      specific = h('div.qe-specific', null, h('div.qe-row', null, insert, h('small', null, 'Write {{1}}, {{2}} … where students type. Put code in ``` fences.')), blanks);
    } else {
      const multi = q.kind === 'multi';
      const opts = h('div.qe-options');
      const paintOptions = () => opts.replaceChildren(...q.options.map((o, j) => {
        const isRight = multi ? (q.answer as string[]).includes(o.id) : q.answer === o.id;
        const mark = h('input', { type: multi ? 'checkbox' : 'radio', name: `qe-${step.id}-${q.id}`, checked: isRight || undefined, 'aria-label': 'Correct', 'data-testid': `option-correct-${index}-${i}-${j}` }) as HTMLInputElement;
        mark.onchange = () => {
          if (q.kind === 'multi') q.answer = q.options.filter((x, k) => k === j ? mark.checked : q.answer.includes(x.id)).map(x => x.id);
          else if (q.kind === 'single') q.answer = o.id;
          row.classList.toggle('qe-right', mark.checked); if (!multi) for (const r of opts.children) r.classList.toggle('qe-right', r === row);
          renderPreview(); changed();
        };
        const text = h('input', { value: o.text, maxlength: QUESTION_LIMITS.optionText, placeholder: `Option ${j + 1}`, 'aria-label': `Option ${j + 1}`, 'data-testid': `option-text-${index}-${i}-${j}` }) as HTMLInputElement;
        text.oninput = () => { o.text = text.value; renderPreview(); changed(); };
        const remove = h('button.qe-icon', { type: 'button', title: 'Remove option', 'aria-label': `Remove option ${j + 1}`, 'data-testid': `option-remove-${index}-${i}-${j}`, disabled: q.options.length <= 2 || undefined, onclick: () => {
          if (q.options.length <= 2) return;
          q.options.splice(j, 1);
          if (q.kind === 'multi') q.answer = q.answer.filter(id => id !== o.id);
          else if (q.kind === 'single' && q.answer === o.id) q.answer = q.options[0].id;
          paintOptions(); renderPreview(); changed();
        } }, '×');
        const row = h(`label.qe-option${isRight ? '.qe-right' : ''}`, null, mark, h('span.qe-mark-label', null, 'correct'), text, remove);
        return row;
      }));
      paintOptions();
      const add = btn('+ Option', `option-add-${index}-${i}`, () => {
        if (q.options.length >= 8) return;
        q.options.push({ id: nextOptionId(q.options.map(o => o.id)), text: '' }); paintOptions(); renderPreview(); changed();
        (opts.lastElementChild?.querySelector('input:not([type=radio]):not([type=checkbox])') as HTMLElement | null)?.focus();
      }, 'btn-ghost');
      const scoring = multi ? h('select', { 'data-testid': `question-scoring-${index}-${i}` },
        h('option', { value: 'partial' }, 'Partial credit (right picks minus wrong picks)'),
        h('option', { value: 'exact' }, 'All or nothing')) as HTMLSelectElement : null;
      if (scoring && q.kind === 'multi') { scoring.value = q.scoring ?? 'partial'; scoring.onchange = () => { if (q.kind !== 'multi') return; if (scoring.value === 'exact') q.scoring = 'exact'; else delete q.scoring; changed(); }; }
      specific = h('div.qe-specific', null, h('small', null, multi ? 'Tick every correct option.' : 'Pick the one correct option.'), opts, h('div.qe-row', null, add, scoring ? field('Scoring', scoring) : null));
    }
    function blankEditor(bq: Extract<ClassroomQuestion, { kind: 'blank' }>, b: BlankSpec, j: number) {
      const accept = h('textarea', { rows: 2, spellcheck: 'false', 'data-testid': `blank-accept-${index}-${i}-${j}`, placeholder: 'One accepted answer per line' }, b.accept.join('\n')) as HTMLTextAreaElement;
      accept.oninput = () => {
        const before = Number(b.accept[0]);
        b.accept = accept.value.split('\n').map(s => s.trim()).filter((s, k, all) => s || all.length === 1); if (!b.accept.length) b.accept = [''];
        // a number that still mirrors the first accepted answer follows it (typing "3" must not leave the range at 0)
        const now = Number(b.accept[0]);
        if (b.numeric && b.accept[0].trim() && Number.isFinite(now) && (b.numeric.value === before || !Number.isFinite(b.numeric.value))) { b.numeric.value = now; value.value = String(now); }
        renderPreview(); changed();
      };
      const caseBox = h('input', { type: 'checkbox', checked: b.caseSensitive || undefined, 'data-testid': `blank-case-${index}-${i}-${j}` }) as HTMLInputElement;
      caseBox.onchange = () => { if (caseBox.checked) b.caseSensitive = true; else delete b.caseSensitive; changed(); };
      const numBox = h('input', { type: 'checkbox', checked: !!b.numeric || undefined, 'data-testid': `blank-numeric-${index}-${i}-${j}` }) as HTMLInputElement;
      const value = num(b.numeric?.value, -1e12, 1e12, `blank-value-${index}-${i}-${j}`, 0.000001), tol = num(b.numeric?.tolerance ?? 0, 0, 1e12, `blank-tolerance-${index}-${i}-${j}`, 0.000001);
      value.step = 'any'; tol.step = 'any';
      const numFields = h('div.qe-row', { hidden: !b.numeric }, field('Number', value), field('± tolerance', tol));
      const setNumeric = () => {
        if (!numBox.checked) { delete b.numeric; numFields.hidden = true; changed(); return; }
        const guess = Number(b.accept[0]);
        b.numeric = { value: value.value.trim() === '' ? (Number.isFinite(guess) ? guess : NaN) : Number(value.value), tolerance: tol.value.trim() === '' ? 0 : Number(tol.value) };
        if (value.value.trim() === '' && Number.isFinite(b.numeric.value)) value.value = String(b.numeric.value);
        numFields.hidden = false; changed();
      };
      numBox.onchange = setNumeric; value.oninput = setNumeric; tol.oninput = setNumeric;
      void bq;
      return h('fieldset.qe-blank', { 'data-testid': `blank-editor-${index}-${i}-${j}` }, h('legend', null, `Blank {{${j + 1}}}`),
        field('Accepted answers (one per line)', accept),
        h('div.qe-row', null, h('label.qe-check', null, caseBox, h('span', null, 'Case sensitive')), h('label.qe-check', null, numBox, h('span', null, 'Number (accept a range)'))), numFields);
    }
    const renderPreview = () => {
      const blanksIn = q.kind === 'blank' ? (n: number) => h('input.qs-blank', { type: 'text', disabled: true, 'aria-label': `Blank ${n}`, style: 'width:7ch', placeholder: String(n) }) : () => document.createTextNode('____');
      preview.replaceChildren(h('small.qe-preview-label', null, 'Students see'), renderPrompt(q.prompt || '…', blanksIn),
        ...(q.kind !== 'blank' ? [h('ul.qe-preview-options', { 'data-i18n-skip': '' }, ...q.options.map(o => h('li', null, o.text || '…')))] : []));
    };
    prompt.oninput = () => { q.prompt = prompt.value; paintSummary(); renderPreview(); changed(); };
    paintSummary(); renderPreview();
    const card = h('details.qe-question', { open: open.has(q.id) || undefined, 'data-testid': `question-editor-${index}-${i}` }, summary,
      h('div.qe-question-body', null,
        h('div.qe-row', null, field('Type', kind), field('Points', pointsIn, 'qe-small'), field('Attempts', attempts, 'qe-small qe-attempts')),
        field('Question', prompt), specific, preview, field('Explanation (optional)', explain),
        h('div.cr-step-buttons', null,
          btn('Move up', `question-up-${index}-${i}`, () => move(i, -1)),
          btn('Move down', `question-down-${index}-${i}`, () => move(i, 1)),
          btn('Duplicate', `question-duplicate-${index}-${i}`, () => {
            const qs = step.questions!; if (qs.length >= QUESTION_LIMITS.questions) return;
            const copy = structuredClone(q); copy.id = newQuestion(q.kind, qs.map(x => x.id)).id; qs.splice(i + 1, 0, copy); open.add(copy.id); rebuild();
          }),
          btn('Delete', `question-delete-${index}-${i}`, () => { step.questions!.splice(i, 1); open.delete(q.id); rebuild(); }, 'btn-danger'))));
    card.addEventListener('toggle', () => { if ((card as HTMLDetailsElement).open) open.add(q.id); else open.delete(q.id); });
    return card;
  }

  rebuild();
  return { el, validate };
}
