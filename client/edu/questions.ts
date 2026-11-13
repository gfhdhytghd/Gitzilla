// Question sets (single choice, multiple choice, fill in the blank): pure helpers shared by the student panel, the
// teacher editor, the live console and the projector. No DOM here. Limits mirror shared/classroom.ts and the server
// normalizer (server/classroom.ts); the server stays the authority, these only give the teacher early feedback.
import type { BlankSpec, ClassroomQuestion, ClassroomStep, QuestionAnswer, QuestionResult, StepMode, StudentQuestion } from '../../shared/classroom';

export const QUESTION_LIMITS = {
  questions: 30, prompt: 2000, explain: 1000, points: [1, 100], attempts: [1, 10], defaultAttempts: 3,
  context: 4000, options: [2, 8], optionText: 300, blanks: [1, 6], accept: 10, acceptText: 200, idLength: 32, optionIdLength: 16,
} as const;

/** A question as any recipient may hold it: the full one (teacher, revealed step) or the redacted student copy. */
export type AnyQuestion = ClassroomQuestion | StudentQuestion;

export const stepMode = (step: Pick<ClassroomStep, 'mode'> | null | undefined): StepMode => step?.mode ?? 'code';
export const hasQuestions = (step: Pick<ClassroomStep, 'mode' | 'questions'> | null | undefined) => stepMode(step) !== 'code' && !!step?.questions?.length;
export const hasCode = (step: Pick<ClassroomStep, 'mode'> | null | undefined) => stepMode(step) !== 'questions';
export const feedbackMode = (step: Pick<ClassroomStep, 'answerFeedback'> | null | undefined) => step?.answerFeedback ?? 'after-close';
export const revealMode = (step: Pick<ClassroomStep, 'revealAnswers'> | null | undefined) => step?.revealAnswers ?? 'after-raid';
export const questionsWeight = (step: Pick<ClassroomStep, 'questionsWeight'>) => step.questionsWeight ?? 50;
export const maxAttempts = (q: { maxAttempts?: number }) => q.maxAttempts ?? QUESTION_LIMITS.defaultAttempts;
export const points = (q: { points?: number }) => q.points ?? 1;

/** Number of blanks a blank question has, whether it carries its specs (teacher) or only a count (student). */
export function blankCount(q: AnyQuestion): number {
  if (q.kind !== 'blank') return 0;
  if ('blanks' in q && Array.isArray(q.blanks)) return q.blanks.length;
  return 'blankCount' in q && typeof q.blankCount === 'number' ? q.blankCount : markers(q.prompt).length;
}
/** The {{n}} markers in a prompt, in order of appearance. */
export function markers(prompt: string): number[] { return [...prompt.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1])); }

/** Prompt → render parts. Fenced code blocks (```) stay code; `{{n}}` anywhere becomes blank n (1-based). */
export type PromptPart = { kind: 'text'; text: string } | { kind: 'code'; parts: ({ kind: 'text'; text: string } | { kind: 'blank'; n: number })[] } | { kind: 'blank'; n: number };
export function promptParts(prompt: string): PromptPart[] {
  const out: PromptPart[] = [];
  const blanks = (s: string) => s.split(/(\{\{\d+\}\})/).filter(Boolean).map(piece => {
    const m = /^\{\{(\d+)\}\}$/.exec(piece);
    return m ? { kind: 'blank' as const, n: Number(m[1]) } : { kind: 'text' as const, text: piece };
  });
  const chunks = prompt.split(/^```[^\n]*\n?/m);
  chunks.forEach((chunk, i) => {
    if (!chunk) return;
    if (i % 2 === 1) out.push({ kind: 'code', parts: blanks(chunk.replace(/\n$/, '')) });
    else out.push(...blanks(chunk));
  });
  return out;
}

export function isAnswered(answer: QuestionAnswer | undefined): boolean {
  if (!answer) return false;
  if ('choice' in answer) return !!answer.choice;
  if ('choices' in answer) return answer.choices.length > 0;
  return answer.blanks.some(b => b.trim() !== '');
}
export function sameAnswer(a: QuestionAnswer | undefined, b: QuestionAnswer | undefined): boolean {
  if (!a || !b) return !isAnswered(a) && !isAnswered(b);
  if ('choice' in a) return 'choice' in b && a.choice === b.choice;
  if ('choices' in a) return 'choices' in b && [...a.choices].sort().join('\0') === [...b.choices].sort().join('\0');
  return 'blanks' in b && a.blanks.length === b.blanks.length && a.blanks.every((x, i) => x.trim() === (b.blanks[i] ?? '').trim());
}
/** The key a recipient may show: the server's revealed key first, else the plan's own (teacher, revealed step). */
export function keyFor(q: AnyQuestion, result?: QuestionResult): QuestionAnswer | undefined {
  if (result?.key) return result.key;
  if (q.kind === 'single' && 'answer' in q && typeof q.answer === 'string') return { choice: q.answer };
  if (q.kind === 'multi' && 'answer' in q && Array.isArray(q.answer)) return { choices: q.answer };
  if (q.kind === 'blank' && 'blanks' in q && Array.isArray(q.blanks)) return { blanks: q.blanks.map(b => b.accept[0] ?? '') };
  return undefined;
}
export const explainFor = (q: AnyQuestion, result?: QuestionResult) => result?.explain ?? ('explain' in q ? q.explain : undefined);
/** Accepted answers of blank i, when the recipient holds the specs. */
export function acceptedFor(q: AnyQuestion, i: number): string[] {
  return q.kind === 'blank' && 'blanks' in q && Array.isArray(q.blanks) ? q.blanks[i]?.accept ?? [] : [];
}

/** Correctness the student may see now: immediate grading, or a revealed / teacher result. */
export type Verdict = 'correct' | 'partial' | 'wrong' | null;
export function verdict(result: QuestionResult | undefined): Verdict {
  if (!result || result.correct === undefined) return null;
  if (result.correct) return 'correct';
  return (result.score ?? 0) > 0 ? 'partial' : 'wrong';
}

/** One question's score share as a whole percent (for "60%" in partial multi / blank feedback). */
export const percent = (score: number | undefined) => Math.round((score ?? 0) * 100);

// ---------- authoring ----------
const ID = /^[a-z0-9-]+$/;
export function nextId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let i = 1; ; i++) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
}
const OPTION_IDS = 'abcdefghijklmnop';
export function nextOptionId(taken: Iterable<string>): string {
  const used = new Set(taken);
  for (const c of OPTION_IDS) if (!used.has(c)) return c;
  return nextId('o', used);
}
export function newQuestion(kind: ClassroomQuestion['kind'], taken: Iterable<string>): ClassroomQuestion {
  const id = nextId('q', taken);
  if (kind === 'blank') return { id, kind, prompt: 'Python lists start at index {{1}}.', blanks: [{ accept: ['0'] }] };
  const options = [{ id: 'a', text: 'Option A' }, { id: 'b', text: 'Option B' }, { id: 'c', text: 'Option C' }];
  return kind === 'single' ? { id, kind, prompt: '', options, answer: 'a' } : { id, kind, prompt: '', options, answer: ['a'] };
}
/** Change a question's kind and keep as much of it as makes sense. */
export function convertQuestion(q: ClassroomQuestion, kind: ClassroomQuestion['kind']): ClassroomQuestion {
  if (q.kind === kind) return q;
  const base = { id: q.id, prompt: q.prompt, ...(q.points !== undefined ? { points: q.points } : {}), ...(q.explain !== undefined ? { explain: q.explain } : {}), ...(q.maxAttempts !== undefined ? { maxAttempts: q.maxAttempts } : {}) };
  const options = q.kind === 'blank' ? [{ id: 'a', text: '' }, { id: 'b', text: '' }] : q.options;
  if (kind === 'single') return { ...base, kind, options, answer: q.kind === 'multi' ? q.answer[0] ?? options[0].id : q.kind === 'single' ? q.answer : options[0].id };
  if (kind === 'multi') return { ...base, kind, options, answer: q.kind === 'single' ? [q.answer] : [options[0].id] };
  const n = markers(q.prompt).length;
  return { ...base, kind, prompt: n ? q.prompt : `${q.prompt.trimEnd()}${q.prompt.trim() ? ' ' : ''}{{1}}`, blanks: Array.from({ length: Math.max(1, n) }, () => ({ accept: [''] })) };
}

/** Teacher-side validation of one step's question settings. Returns readable errors (empty = valid). */
export function validateQuestions(step: ClassroomStep): string[] {
  const mode = stepMode(step);
  if (mode === 'code') return [];
  const errors: string[] = [];
  const qs = step.questions ?? [];
  if (!qs.length) errors.push('Add at least one question.');
  if (qs.length > QUESTION_LIMITS.questions) errors.push(`Use at most ${QUESTION_LIMITS.questions} questions per step.`);
  if (mode === 'mixed') {
    const w = step.questionsWeight ?? 50;
    if (!Number.isFinite(w) || w < 0 || w > 100) errors.push('Questions weight must be from 0 to 100.');
  }
  if ((step.questionContext ?? '').length > QUESTION_LIMITS.context) errors.push('The shared code or reading is longer than 4000 characters.');
  if (feedbackMode(step) === 'immediate' && revealMode(step) === 'never') errors.push('Instant feedback cannot be used when answers stay private.');
  const ids = new Set<string>();
  qs.forEach((q, i) => {
    const n = i + 1;
    if (!ID.test(q.id) || q.id.length > QUESTION_LIMITS.idLength) errors.push(`Question ${n}: its id must use a–z, 0–9 or - (up to 32).`);
    if (ids.has(q.id)) errors.push(`Question ${n}: its id repeats another question's id.`);
    ids.add(q.id);
    if (!q.prompt.trim()) errors.push(`Question ${n}: write the question.`);
    if (q.prompt.length > QUESTION_LIMITS.prompt) errors.push(`Question ${n}: the question is longer than 2000 characters.`);
    if ((q.explain ?? '').length > QUESTION_LIMITS.explain) errors.push(`Question ${n}: the explanation is longer than 1000 characters.`);
    const p = q.points ?? 1;
    if (!Number.isInteger(p) || p < 1 || p > 100) errors.push(`Question ${n}: points must be a whole number from 1 to 100.`);
    const a = q.maxAttempts ?? 3;
    if (!Number.isInteger(a) || a < 1 || a > 10) errors.push(`Question ${n}: attempts must be from 1 to 10.`);
    if (q.kind === 'single' || q.kind === 'multi') {
      if (q.options.length < 2 || q.options.length > 8) errors.push(`Question ${n}: give 2 to 8 options.`);
      const oids = new Set<string>();
      q.options.forEach((o, j) => {
        if (!o.text.trim()) errors.push(`Question ${n}: option ${j + 1} is empty.`);
        if (o.text.length > QUESTION_LIMITS.optionText) errors.push(`Question ${n}: option ${j + 1} is longer than 300 characters.`);
        if (!ID.test(o.id) || o.id.length > QUESTION_LIMITS.optionIdLength || oids.has(o.id)) errors.push(`Question ${n}: option ${j + 1} needs a unique id.`);
        oids.add(o.id);
      });
      if (q.kind === 'single' && !oids.has(q.answer)) errors.push(`Question ${n}: mark the correct option.`);
      if (q.kind === 'multi' && (!q.answer.length || q.answer.some(x => !oids.has(x)))) errors.push(`Question ${n}: mark at least one correct option.`);
    } else {
      const found = markers(q.prompt);
      if (q.blanks.length < 1 || q.blanks.length > 6) errors.push(`Question ${n}: use 1 to 6 blanks.`);
      if (found.length !== q.blanks.length || found.some((n, j) => n !== j + 1)) errors.push(`Question ${n}: the blanks in the question must be {{1}}, {{2}} … in order, one per answer box.`);
      q.blanks.forEach((b: BlankSpec, j) => {
        const accept = b.accept.filter(s => s.trim());
        if (!accept.length) errors.push(`Question ${n}: blank ${j + 1} needs an accepted answer.`);
        if (b.accept.length > QUESTION_LIMITS.accept) errors.push(`Question ${n}: blank ${j + 1} has more than 10 accepted answers.`);
        if (b.accept.some(s => s.length > QUESTION_LIMITS.acceptText)) errors.push(`Question ${n}: an accepted answer of blank ${j + 1} is longer than 200 characters.`);
        if (b.numeric && (!Number.isFinite(b.numeric.value) || !Number.isFinite(b.numeric.tolerance) || b.numeric.tolerance < 0)) errors.push(`Question ${n}: blank ${j + 1} needs a number and a tolerance of 0 or more.`);
      });
    }
  });
  return errors;
}

/** Plain-text answer for exports, summaries and screen readers. */
export function answerText(q: AnyQuestion, answer: QuestionAnswer | undefined): string {
  if (!answer || !isAnswered(answer)) return '';
  if ('choice' in answer) return q.kind !== 'blank' ? q.options.find(o => o.id === answer.choice)?.text ?? answer.choice : answer.choice;
  if ('choices' in answer) return q.kind !== 'blank' ? answer.choices.map(c => q.options.find(o => o.id === c)?.text ?? c).join(' · ') : answer.choices.join(' · ');
  return answer.blanks.map(b => b.trim() || '—').join(' · ');
}

/**
 * One-line label for a question prompt (bars, projector). Fenced code is dropped when the prompt has other text;
 * a prompt that is only code shows its first code line as inline code. Blanks become ____.
 */
export function excerpt(prompt: string, n = 110): string {
  const blanks = (t: string) => t.replace(/\{\{(\d+)\}\}/g, '____');
  const flat = (t: string) => t.replace(/\s+/g, ' ').trim();
  let one = flat(blanks(prompt.replace(/```[^\n]*\n?([\s\S]*?)(```|$)/g, ' ')));
  if (!one) {
    const line = blanks(/```[^\n]*\n?([\s\S]*?)(```|$)/.exec(prompt)?.[1] ?? '').split('\n').map(l => l.trim()).find(Boolean) ?? '';
    const code = line.length > 60 ? `${line.slice(0, 59)}…` : line;
    one = code ? `\`${code.replace(/`/g, "'")}\`` : '';
  }
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}
