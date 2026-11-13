// Student question set (phone first): one card per question, a progress strip, autosave with a visible saved state
// ('after-close'), or a Check button per question with attempts and locks ('immediate'). After the class attack the
// same panel shows the reveal (answer, key, correctness, explanation), or only the score when answers stay private.
import type { ClassroomPhase, ClassroomQuestion, ClassroomReport, ClassroomStep, QuestionAnswer, QuestionResult } from '../../shared/classroom';
import { h, store } from '../app/util';
import { richText } from './task-card';
import { answerText, explainFor, feedbackMode, isAnswered, keyFor, maxAttempts, revealMode, sameAnswer, verdict, type AnyQuestion } from './questions';
import { KIND_LABEL, LETTERS, pointsLabel, questionContextView, renderPrompt, reviewCard, verdictText } from './question-view';

export interface QuestionSetView {
  step: ClassroomStep;          // redacted for students until reveal (StudentQuestion items)
  attempt: number;
  phase: ClassroomPhase;
  report?: ClassroomReport | null;   // this student's report (any step; checked against step + attempt here)
  error?: string;               // the server's last error for this student
  canSave: boolean;             // connected and the phase accepts answers
}
export interface QuestionSet { el: HTMLElement; update(v: QuestionSetView): void; flush(): void; dispose(): void; readonly answeredCount: number; readonly total: number }

const AUTOSAVE_MS = 900, MIN_GAP_MS = 1100, ECHO_MS = 5000;

export function createQuestionSet(opts: { room: string; send(stepId: string, attempt: number, answers: Record<string, QuestionAnswer>): void; now?: () => number }): QuestionSet {
  const now = opts.now ?? Date.now;
  let view: QuestionSetView | null = null;
  let key = '', layoutSig = '';
  let local: Record<string, QuestionAnswer> = {};
  const dirty = new Set<string>();
  const inflight = new Map<string, { answer: QuestionAnswer; at: number }>();
  let lastSend = 0, timer: ReturnType<typeof setTimeout> | null = null, failed = '', lastError: string | undefined;
  const cards = new Map<string, { q: AnyQuestion; el: HTMLElement; sync(): void; state(): void }>();

  const count = h('b.qs-count', { 'data-testid': 'question-count' });
  const saveState = h('span.qs-save', { role: 'status', 'aria-live': 'polite', 'data-testid': 'question-save-state' });
  const dots = h('div.qs-dots', { role: 'list', 'aria-label': 'Questions' });
  const strip = h('div.qs-strip', { 'data-testid': 'question-strip' }, h('div.qs-strip-row', null, count, saveState), dots);
  const hint = h('p.qs-hint', { 'data-testid': 'question-hint' });
  const context = h('div.qs-context-slot');
  const list = h('div.qs-list');
  const submitBtn = h('button.btn.btn-primary.qs-submit', { type: 'button', 'data-testid': 'question-submit', onclick: () => submitAll() }, 'Submit answers');
  const footNote = h('p.qs-foot-note', { role: 'status', 'data-testid': 'question-foot' });
  const foot = h('div.qs-foot', null, submitBtn, footNote);
  const summary = h('div.qs-summary', { 'data-testid': 'question-summary', hidden: true });
  const el = h('section.qs', { 'data-testid': 'question-set' }, summary, strip, hint, context, list, foot);

  const draftKey = () => view ? `kaiju.qs.${opts.room}.${view.step.id}.${view.attempt}` : '';
  const saveDraft = () => { if (!view) return; try { store.set(draftKey(), JSON.stringify(local)); } catch { /* storage is optional */ } };
  const loadDraft = (): Record<string, QuestionAnswer> => { try { const raw = store.get(draftKey()); const v = raw ? JSON.parse(raw) : null; return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
  const results = (): Record<string, QuestionResult> => {
    const r = view?.report;
    return r && view && r.stepId === view.step.id && r.attempt === view.attempt ? r.answers ?? {} : {};
  };
  const questions = (): AnyQuestion[] => (view?.step.questions ?? []) as AnyQuestion[];
  const immediate = () => feedbackMode(view?.step) === 'immediate';
  const editable = () => !!view && ['coding'].includes(view.phase) && view.canSave;
  const locked = (q: AnyQuestion) => !!results()[q.id]?.locked;
  const answered = () => questions().filter(q => isAnswered(local[q.id])).length;

  // ---------- saving ----------
  function schedule(ms: number) { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; retryStale(); flush(); }, ms); }
  function flush() {
    if (!view || !editable()) return;
    const ids = [...dirty].filter(id => isAnswered(local[id]) || results()[id]);   // an untouched blank is not a save
    if (!ids.length) { dirty.clear(); paint(); return; }
    const wait = lastSend + MIN_GAP_MS - now();
    if (wait > 0) { schedule(wait); paint(); return; }
    const answers: Record<string, QuestionAnswer> = {};
    for (const id of ids) {
      if (immediate() && (locked(questions().find(q => q.id === id)!) || !isAnswered(local[id]))) continue;
      answers[id] = structuredClone(local[id]); inflight.set(id, { answer: answers[id], at: now() });
    }
    for (const id of ids) dirty.delete(id);
    if (!Object.keys(answers).length) { paint(); return; }
    lastSend = now();   // a warning (failed) stays until the server echoes a save
    opts.send(view.step.id, view.attempt, answers);
    schedule(ECHO_MS);   // no echo by then: put them back and try again
    paint();
  }
  function retryStale() {
    const stale = [...inflight].filter(([, v]) => now() - v.at >= ECHO_MS - 50);
    if (!stale.length) return;
    for (const [id] of stale) { inflight.delete(id); dirty.add(id); }
    failed = 'Not saved yet. Trying again…';
  }
  function change(id: string, answer: QuestionAnswer, delay = AUTOSAVE_MS) {
    local[id] = answer; dirty.add(id); saveDraft();
    if (!immediate()) schedule(delay);
    cards.get(id)?.state(); paint();
  }
  function check(id: string) { if (!dirty.has(id) && !isAnswered(local[id])) return; dirty.clear(); dirty.add(id); flush(); }
  function submitAll() {
    if (!view || !editable()) return;
    for (const q of questions()) {
      const r = results()[q.id];
      if (isAnswered(local[q.id]) && (!r || !sameAnswer(r.answer, local[q.id])) && !(immediate() && r?.locked)) dirty.add(q.id);
    }
    lastSend = Math.min(lastSend, now() - MIN_GAP_MS);   // an explicit tap saves now (the server allows 1 / s)
    if (!dirty.size && !inflight.size) { failed = ''; footNote.textContent = answered() ? 'All answers are saved.' : 'Answer a question first.'; return; }
    flush();
  }

  // ---------- one answer card ----------
  function answerCard(q: AnyQuestion, index: number) {
    const name = `qs-${q.id}-${Math.random().toString(36).slice(2, 7)}`;
    const badge = h('span.qs-badge');
    const head = h('header.qs-card-head', null, h('span.qs-num', null, String(index + 1)), h('span.qs-kind', null, KIND_LABEL[q.kind]), h('span.qs-pts', null, pointsLabel(q)), badge);
    const feedback = h('p.qs-feedback', { role: 'status', 'aria-live': 'polite', 'data-testid': `question-feedback-${q.id}` });
    const keyBox = h('div.qs-keybox', { hidden: true, 'data-testid': `question-key-${q.id}` });
    const checkBtn = h('button.btn.qs-check', { type: 'button', 'data-testid': `question-check-${q.id}`, hidden: true, onclick: () => check(q.id) }, 'Check answer');
    let body: HTMLElement;
    let inputs: HTMLInputElement[] = [];
    if (q.kind === 'blank') {
      // numeric blanks get the decimal keypad. Students hold a redacted question (no specs): an optional
      // `blankNumeric` flag list from the server is used when present (see the UI report's open questions).
      const numeric = 'blanks' in q && Array.isArray(q.blanks) ? q.blanks.map(b => !!b.numeric) : (q as { blankNumeric?: boolean[] }).blankNumeric ?? [];
      const boxes: HTMLInputElement[] = [];
      const read = (): QuestionAnswer => ({ blanks: boxes.map(b => b.value) });
      const prompt = renderPrompt(q.prompt, n => {
        const box = h('input.qs-blank', { type: 'text', inputmode: numeric[n - 1] ? 'decimal' : 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done',
          'aria-label': `Blank ${n}`, 'data-testid': `question-blank-${q.id}-${n}`, maxlength: 200 }) as HTMLInputElement;
        const size = () => { box.style.width = `${Math.min(24, Math.max(5, box.value.length + 2))}ch`; };
        box.addEventListener('input', () => { size(); change(q.id, read(), AUTOSAVE_MS + 600); });
        box.addEventListener('blur', () => { if (dirty.has(q.id) && !immediate()) schedule(150); });
        box.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); if (immediate()) check(q.id); else flush(); } });
        boxes[n - 1] = box; size();
        return box;
      });
      inputs = boxes;
      body = h('div', null, prompt);
    } else {
      const multi = q.kind === 'multi';
      const rows = q.options.map((o, i) => {
        const input = h('input.qs-pick', { type: multi ? 'checkbox' : 'radio', name, value: o.id, 'data-testid': `question-option-${q.id}-${o.id}` }) as HTMLInputElement;
        input.addEventListener('change', () => {
          const answer: QuestionAnswer = multi ? { choices: inputs.filter(x => x.checked).map(x => x.value) } : { choice: o.id };
          change(q.id, answer, multi ? AUTOSAVE_MS + 300 : 400);
        });
        inputs.push(input);
        return h('label.qs-option', { 'data-option': o.id }, input, h('span.qs-letter', { 'aria-hidden': 'true' }, LETTERS[i]), h('span.qs-opt-text', { 'data-i18n-skip': '' }, ...richText(o.text)));
      });
      body = h('div', null, renderPrompt(q.prompt, () => document.createTextNode('____')),
        multi ? h('p.qs-multi-hint', null, 'Select all that apply.') : null,
        h('div.qs-options', { role: multi ? 'group' : 'radiogroup', 'aria-label': `Question ${index + 1} options` }, ...rows));
    }
    const card = h('article.qs-card', { id: `question-${q.id}`, 'data-testid': `question-card-${q.id}`, 'data-q': q.id }, head, body, h('footer.qs-card-foot', null, feedback, checkBtn), keyBox);
    // inputs ⇐ local answer
    const sync = () => {
      const a = local[q.id];
      if (q.kind === 'blank') { const b = a && 'blanks' in a ? a.blanks : []; inputs.forEach((x, i) => { if (document.activeElement !== x && x.value !== (b[i] ?? '')) { x.value = b[i] ?? ''; x.style.width = `${Math.min(24, Math.max(5, x.value.length + 2))}ch`; } }); }
      else { const set = new Set(a ? 'choice' in a ? [a.choice] : 'choices' in a ? a.choices : [] : []); inputs.forEach(x => { x.checked = set.has(x.value); }); }
    };
    const state = () => {
      const r = results()[q.id], a = local[q.id], isLocked = !!r?.locked && immediate();
      const pending = dirty.has(q.id) || inflight.has(q.id);
      const v = immediate() && r && sameAnswer(r.answer, a) ? verdict(r) : null;
      const has = isAnswered(a);
      card.classList.toggle('qs-answered', has);
      for (const cls of ['qs-correct', 'qs-partial', 'qs-wrong']) card.classList.remove(cls);
      if (v) card.classList.add(`qs-${v}`);
      card.classList.toggle('qs-locked', isLocked);
      for (const x of inputs) x.disabled = !editable() || isLocked;
      for (const label of card.querySelectorAll('.qs-option')) label.classList.toggle('qs-picked', !!(label.querySelector('input') as HTMLInputElement | null)?.checked);
      // per-blank marks only for the answer that was graded
      if (q.kind === 'blank') inputs.forEach((x, i) => { const ok = v ? r?.blankCorrect?.[i] : undefined; x.classList.toggle('qs-ok', ok === true); x.classList.toggle('qs-bad', ok === false); });
      // badge: what happened to this answer
      const left = r ? Math.max(0, maxAttempts(q) - r.attempts) : maxAttempts(q);
      badge.className = 'qs-badge';
      if (immediate()) {
        if (isLocked) { badge.textContent = r?.correct ? '✓ Correct' : 'Locked'; badge.classList.add(r?.correct ? 'qs-badge-correct' : 'qs-badge-none'); }
        else if (inflight.has(q.id)) badge.textContent = 'Checking…';
        else if (v) { badge.textContent = verdictText(v, r); badge.classList.add(`qs-badge-${v}`); }
        else badge.textContent = '';
      } else {
        badge.textContent = !has ? '' : pending ? (inflight.has(q.id) ? 'Saving…' : 'Not saved') : r && sameAnswer(r.answer, a) ? '✓ Saved' : '';
        if (badge.textContent === '✓ Saved') badge.classList.add('qs-badge-saved');
      }
      // feedback line + Check button ('immediate')
      let text = '';
      if (immediate()) {
        if (isLocked) text = r?.correct ? 'Correct. This question is done.' : 'No attempts left. Here is the answer.';
        else if (v === 'wrong' || v === 'partial') text = `${v === 'partial' ? 'Partly right.' : 'Not quite.'} ${left === 1 ? '1 attempt left.' : `${left} attempts left.`}`;
        else if (has && r && !sameAnswer(r.answer, a)) text = left === 1 ? 'Changed. Check again: 1 attempt left.' : `Changed. Check again: ${left} attempts left.`;
        else if (!r) text = maxAttempts(q) === 1 ? 'You get 1 check.' : `You get ${maxAttempts(q)} checks.`;
      }
      feedback.textContent = text; feedback.hidden = !text;
      checkBtn.hidden = !immediate() || isLocked || !editable();
      checkBtn.disabled = !has || inflight.has(q.id) || (!!r && sameAnswer(r.answer, a) && !dirty.has(q.id));
      // the key and explanation once this question locks ('immediate' only; the full reveal is a separate view)
      const showKey = isLocked && (r?.key || r?.explain);
      keyBox.hidden = !showKey;
      if (showKey) {
        const k = keyFor(q, r), why = explainFor(q, r);
        keyBox.replaceChildren(h('p', null, h('b', null, 'Answer: '), h('span', { 'data-i18n-skip': '' }, answerText(q, k))), why ? h('p', null, h('b', null, 'Why: '), h('span', { 'data-i18n-skip': '' }, ...richText(why))) : document.createTextNode(''));
        if (q.kind !== 'blank' && k) { const right = new Set('choice' in k ? [k.choice] : 'choices' in k ? k.choices : []); for (const label of card.querySelectorAll('.qs-option')) { const id = (label as HTMLElement).dataset.option ?? ''; label.classList.toggle('qs-opt-key', right.has(id)); label.classList.toggle('qs-opt-bad', !right.has(id) && label.classList.contains('qs-picked')); } }
      }
    };
    cards.set(q.id, { q, el: card, sync, state });
    return card;
  }

  // ---------- strip, summary, footer ----------
  function paint() {
    if (!view) return;
    const qs = questions(), n = answered();
    count.textContent = `${n} of ${qs.length} answered`;
    const reviewing = ['feedback', 'complete'].includes(view.phase);
    dots.replaceChildren(...qs.map((q, i) => {
      const r = results()[q.id], a = local[q.id];
      const v = (immediate() || reviewing) && r && (reviewing || sameAnswer(r.answer, a)) ? verdict(r) : null;
      const cls = `${isAnswered(reviewing ? r?.answer : a) ? '.qs-dot-on' : ''}${v ? `.qs-dot-${v}` : ''}${dirty.has(q.id) || inflight.has(q.id) ? '.qs-dot-pending' : ''}`;
      return h(`button.qs-dot${cls}`, { type: 'button', role: 'listitem', 'aria-label': `Question ${i + 1}`, onclick: () => document.getElementById(`question-${q.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, String(i + 1));
    }));
    for (const c of cards.values()) c.state();
    // save state: one word that says whether the work is safe
    const pending = dirty.size + inflight.size;
    saveState.className = 'qs-save';
    dots.classList.toggle('qs-dots-many', qs.length > 10);
    if (reviewing || !['coding', 'paused', 'raid'].includes(view.phase)) saveState.textContent = '';
    else if (view.phase === 'paused') { saveState.textContent = 'Paused'; saveState.classList.add('qs-save-paused'); }
    else if (view.phase === 'raid') saveState.textContent = 'Locked';
    else if (failed) { saveState.textContent = failed; saveState.classList.add('qs-save-bad'); }
    else if (inflight.size) saveState.textContent = immediate() ? 'Checking…' : 'Saving…';
    else if (pending && !immediate()) saveState.textContent = 'Unsaved changes';
    else if (immediate()) saveState.textContent = '';
    else if (n) { saveState.textContent = '✓ All saved'; saveState.classList.add('qs-save-ok'); }
    else saveState.textContent = 'Answers save automatically';
    submitBtn.disabled = !editable() || (immediate() && qs.every(q => locked(q)));
    submitBtn.textContent = immediate() ? 'Check all answers' : 'Submit answers';
    if (view.phase === 'paused') footNote.textContent = 'Coding is paused. Your answers are kept.';
    else if (view.phase === 'raid') footNote.textContent = 'Answers are locked while the class attacks.';
    else if (!view.canSave && view.phase === 'coding') footNote.textContent = 'Reconnecting… your answers stay on this device.';
    else if (failed) footNote.textContent = failed;
    else if (!immediate()) footNote.textContent = n === qs.length && !pending ? 'All answers saved. You can still change them until your teacher closes submissions.' : 'Your answers save as you go. Your teacher reveals the correct answers after the class attack.';
    else footNote.textContent = 'Each check uses one attempt. Correct answers lock.';
  }

  function build() {
    if (!view) return;
    cards.clear();
    const reviewing = ['feedback', 'complete'].includes(view.phase);
    el.classList.toggle('qs-reviewing', reviewing);
    // shared code / reading: once, above the list, while answering and in the reveal
    const shared = questionContextView(view.step.questionContext);
    context.replaceChildren(...(shared ? [shared] : []));
    if (reviewing) { list.replaceChildren(...revealCards()); return; }
    list.replaceChildren(...questions().map((q, i) => answerCard(q, i)));
    for (const c of cards.values()) c.sync();
  }
  function revealCards(): HTMLElement[] {
    if (!view) return [];
    const res = results();
    if (revealMode(view.step) === 'never') return [];
    // keys reach students only with the reveal: show them when the server sent them, else just the student's picks
    return questions().map((q, i) => reviewCard(q, i, { result: res[q.id] ?? { answer: { blanks: [] }, attempts: 0 }, showKey: true, showAnswer: true }));
  }
  function renderSummary() {
    if (!view) return;
    const reviewing = ['feedback', 'complete'].includes(view.phase);
    summary.hidden = !reviewing;
    strip.hidden = reviewing && revealMode(view.step) === 'never';
    hint.hidden = reviewing;
    foot.hidden = reviewing;
    if (!reviewing) {
      hint.textContent = immediate() ? 'Answer, then press Check answer. You see right away if you are correct.' : 'Tap an answer to choose it. Answers save automatically.';
      return;
    }
    const r = view.report && view.report.stepId === view.step.id && view.report.attempt === view.attempt ? view.report : null;
    const res = r?.answers ?? {};
    const correct = questions().filter(q => res[q.id]?.correct).length;
    const anyGraded = questions().some(q => res[q.id]?.correct !== undefined);
    const score = r?.questionScore;
    summary.replaceChildren(h('div.qs-score', null, h('span', null, 'Questions score'), h('strong', { 'data-testid': 'question-score' }, score === undefined ? '—' : String(Math.round(score)), h('small', null, ' /100'))),
      revealMode(view.step) === 'never'
        ? h('p', null, 'Your teacher keeps the answers to this quiz private. You only see your score.')
        : anyGraded ? h('p', null, `${correct} of ${questions().length} correct. Review each answer below.`)
        : h('p', null, r ? 'Your answers are below. The correct answers appear when your teacher reveals them.' : 'You did not answer these questions in this round.'));
  }

  return {
    el,
    get answeredCount() { return answered(); },
    get total() { return questions().length; },
    update(v) {
      const prevError = lastError;
      view = v; lastError = v.error;
      const nextKey = `${v.step.id}:${v.attempt}`;
      if (nextKey !== key) {
        key = nextKey; dirty.clear(); inflight.clear(); failed = '';
        // server answers win; a draft only fills questions the server has no answer for (and is saved again)
        const server = results(), draft = loadDraft();
        local = {};
        for (const q of questions()) {
          if (server[q.id]) local[q.id] = structuredClone(server[q.id].answer);
          else if (draft[q.id] && isAnswered(draft[q.id])) { local[q.id] = draft[q.id]; dirty.add(q.id); }
        }
      }
      // echoes: an inflight answer the server now holds is saved
      const server = results();
      for (const [id, sent] of [...inflight]) if (server[id] && sameAnswer(server[id].answer, sent.answer)) { inflight.delete(id); failed = ''; }
      // another device changed an answer we are not editing: follow it
      for (const q of questions()) if (server[q.id] && !dirty.has(q.id) && !inflight.has(q.id) && !sameAnswer(server[q.id].answer, local[q.id])) { local[q.id] = structuredClone(server[q.id].answer); cards.get(q.id)?.sync(); }
      if (v.error && v.error !== prevError && inflight.size) { for (const id of inflight.keys()) dirty.add(id); inflight.clear(); failed = v.error; }
      retryStale();
      const sig = JSON.stringify([nextKey, v.step.questions, v.step.questionContext, v.step.answerFeedback, v.step.revealAnswers, ['feedback', 'complete'].includes(v.phase), ['feedback', 'complete'].includes(v.phase) ? server : null]);
      if (sig !== layoutSig) { layoutSig = sig; build(); }
      renderSummary();
      paint();
      if (dirty.size && !immediate() && editable() && !timer) schedule(AUTOSAVE_MS);
    },
    flush,
    dispose() { if (timer) clearTimeout(timer); timer = null; },
  };
}
