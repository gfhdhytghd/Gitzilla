import type { ClassroomPlan, ClassroomStep, ClassroomQuestion, QuestionAnswer, QuestionResult, StudentQuestion } from '../shared/classroom';

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, name: string, max: number) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(`Invalid ${name}`);
  return v;
};
const integer = (v: unknown, name: string, min: number, max: number) => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new Error(`Invalid ${name}`);
  return v;
};
const bool = (v: unknown, name: string) => { if (v !== undefined && typeof v !== 'boolean') throw new Error(`Invalid ${name}`); return v === true; };
/** Compare the parsed numbers in decimal units, without widening a small tolerance at large magnitudes. */
function withinTolerance(value: number, target: number, tolerance: number): boolean {
  const decimal = (n: number) => {
    const [coefficient, exponent = '0'] = String(n).split('e');
    const [whole, fraction = ''] = coefficient.split('.');
    return { units: BigInt(whole + fraction), exponent: Number(exponent) - fraction.length };
  };
  const values = [value, target, tolerance].map(decimal);
  const exponent = Math.min(...values.map(v => v.exponent));
  const [actual, expected, allowed] = values.map(v => v.units * 10n ** BigInt(v.exponent - exponent));
  const difference = actual > expected ? actual - expected : expected - actual;
  return difference <= allowed;
}
function id(v: unknown, name: string, max: number): string {
  const s = str(v, name, max);
  if (!/^[a-z0-9-]+$/.test(s)) throw new Error(`Invalid ${name}`);
  return s;
}
export function normalizeQuestions(value: unknown): ClassroomQuestion[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) throw new Error('A question set needs 1–30 questions');
  const ids = new Set<string>();
  return value.map(q => {
    if (!object(q)) throw new Error('Invalid question');
    const qid = id(q.id, 'question id', 32);
    if (ids.has(qid)) throw new Error('Question ids must be unique'); ids.add(qid);
    const points = integer(q.points === undefined ? 1 : q.points, 'question points', 1, 100);
    const base = { id: qid, prompt: str(q.prompt, 'question prompt', 2000), points,
      maxAttempts: integer(q.maxAttempts === undefined ? 3 : q.maxAttempts, 'maxAttempts', 1, 10),
      ...(q.explain !== undefined ? { explain: typeof q.explain === 'string' && q.explain.length <= 1000 ? q.explain : str(q.explain, 'question explanation', 1000) } : {}) };
    if (q.kind === 'single' || q.kind === 'multi') {
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 8) throw new Error('Use 2–8 options');
      const options = q.options.map(o => {
        if (!object(o)) throw new Error('Invalid option');
        return { id: id(o.id, 'option id', 16), text: str(o.text, 'option text', 300) };
      });
      const optionIds = new Set(options.map(o => o.id));
      if (optionIds.size !== options.length) throw new Error('Option ids must be unique');
      if (q.kind === 'single') {
        if (typeof q.answer !== 'string' || !optionIds.has(q.answer)) throw new Error('Single answer must be an option id');
        return { ...base, kind: 'single', options, answer: q.answer };
      }
      if (!Array.isArray(q.answer) || !q.answer.length || q.answer.some(a => typeof a !== 'string' || !optionIds.has(a)) || new Set(q.answer).size !== q.answer.length) throw new Error('Multi answer must be a non-empty unique option subset');
      if (q.scoring !== undefined && q.scoring !== 'exact' && q.scoring !== 'partial') throw new Error('Invalid multi scoring');
      return { ...base, kind: 'multi', options, answer: q.answer as string[], scoring: q.scoring === undefined ? 'partial' : q.scoring };
    }
    if (q.kind !== 'blank') throw new Error('Invalid question kind');
    if (!Array.isArray(q.blanks) || q.blanks.length < 1 || q.blanks.length > 6) throw new Error('Use 1–6 blanks');
    const markers = [...base.prompt.matchAll(/\{\{([^{}]*)\}\}/g)].map(m => m[1]);
    if (markers.length !== q.blanks.length || markers.some((m, i) => m !== String(i + 1))) throw new Error('Blank markers must match blanks in order: {{1}}, {{2}}, …');
    const blanks = q.blanks.map(b => {
      if (!object(b) || !Array.isArray(b.accept) || b.accept.length < 1 || b.accept.length > 10) throw new Error('Use 1–10 accepted answers per blank');
      const accept = b.accept.map(a => str(a, 'accepted answer', 200));
      const caseSensitive = bool(b.caseSensitive, 'caseSensitive');
      if (b.numeric !== undefined) {
        if (!object(b.numeric) || typeof b.numeric.value !== 'number' || !Number.isFinite(b.numeric.value) || typeof b.numeric.tolerance !== 'number' || !Number.isFinite(b.numeric.tolerance) || b.numeric.tolerance < 0) throw new Error('Invalid numeric value or tolerance');
        return { accept, caseSensitive, numeric: { value: b.numeric.value, tolerance: b.numeric.tolerance } };
      }
      return { accept, caseSensitive };
    });
    return { ...base, kind: 'blank', blanks };
  });
}

export function questionKey(q: ClassroomQuestion): QuestionAnswer {
  return q.kind === 'single' ? { choice: q.answer } : q.kind === 'multi' ? { choices: [...q.answer] } : { blanks: q.blanks.map(b => b.accept[0]) };
}
/** Empty controls are unanswered, and never spend an immediate-feedback attempt. */
export function normalizeQuestionAnswer(q: ClassroomQuestion, value: unknown): QuestionAnswer | null {
  if (!object(value)) throw new Error(`Invalid answer for ${q.id}`);
  const allowed = q.kind === 'single' ? 'choice' : q.kind === 'multi' ? 'choices' : 'blanks';
  if (Object.keys(value).some(k => k !== allowed)) throw new Error(`Invalid answer fields for ${q.id}`);
  if (q.kind === 'single') {
    if (value.choice === '') return null;
    if (typeof value.choice !== 'string' || !q.options.some(o => o.id === value.choice)) throw new Error(`Invalid choice for ${q.id}`);
    return { choice: value.choice };
  }
  const values = value[allowed];
  const limit = q.kind === 'multi' ? q.options.length : q.blanks.length;
  if (!Array.isArray(values) || values.length > limit || values.some(v => typeof v !== 'string' || v.length > 200)) throw new Error(`Invalid answer for ${q.id}`);
  if (q.kind === 'multi') {
    if (new Set(values).size !== values.length || values.some(v => !q.options.some(o => o.id === v))) throw new Error(`Invalid choices for ${q.id}`);
    return values.length ? { choices: [...values] } : null;
  }
  if (!values.some(v => v.trim())) return null;
  return { blanks: Array.from({ length: limit }, (_, i) => values[i] ?? '') };
}
export function gradeQuestion(q: ClassroomQuestion, answer: QuestionAnswer): Pick<QuestionResult, 'score' | 'correct' | 'blankCorrect'> {
  let score: number;
  if (q.kind === 'single') score = 'choice' in answer && answer.choice === q.answer ? 1 : 0;
  else if (q.kind === 'multi') {
    const picked = new Set('choices' in answer ? answer.choices : []);
    const right = q.answer.filter(a => picked.has(a)).length, wrong = [...picked].filter(a => !q.answer.includes(a)).length;
    score = q.scoring === 'exact' ? Number(right === q.answer.length && wrong === 0) : Math.max(0, (right - wrong) / q.answer.length);
  } else {
    const normalize = (s: string) => s.trim().replace(/\s+/g, ' ');
    const blankCorrect = q.blanks.map((b, i) => {
      const value = normalize('blanks' in answer ? answer.blanks[i] ?? '' : '');
      if (b.numeric) {
        // Decimal only: reject exponent, hex, separators, Infinity and empty input.
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return false;
        const n = Number(value);
        return Number.isFinite(n) && withinTolerance(n, b.numeric.value, b.numeric.tolerance);
      }
      return b.accept.some(a => b.caseSensitive ? normalize(a) === value : normalize(a).toLowerCase() === value.toLowerCase());
    });
    score = blankCorrect.filter(Boolean).length / q.blanks.length;
    return { score, correct: score === 1, blankCorrect };
  }
  return { score, correct: score === 1 };
}
export function questionSetScore(step: ClassroomStep, answers: Record<string, QuestionResult>): number {
  const questions = step.questions ?? [], points = questions.reduce((n, q) => n + ((q.points === undefined ? 1 : q.points)), 0);
  return points ? Math.round(questions.reduce((n, q) => n + ((q.points === undefined ? 1 : q.points)) * (answers[q.id]?.score ?? 0), 0) / points * 1000) / 10 : 0;
}
export function stepScore(step: ClassroomStep, code = 0, questions = 0): number {
  const w = (step.questionsWeight ?? 50) / 100;
  return Math.round((step.mode === 'questions' ? questions : step.mode === 'mixed' ? code * (1 - w) + questions * w : code) * 10) / 10;
}
export function studentPlan(plan: ClassroomPlan, revealStepIndex: number | null): ClassroomPlan {
  const clone = structuredClone(plan);
  clone.steps = clone.steps.map((step, i) => {
    if (!step.questions || (i === revealStepIndex && step.revealAnswers !== 'never')) return step;
    const questions: StudentQuestion[] = step.questions.map(q => {
      const { explain: _explain, ...base } = q;
      if (base.kind === 'blank') { const { blanks, ...safe } = base; return { ...safe, blankCount: blanks.length, blankNumeric: blanks.map(b => b.numeric !== undefined) }; }
      const { answer: _answer, ...safe } = base; return safe;
    });
    // The committed wire contract uses ClassroomPlan for both roles; StudentQuestion is its redacted projection.
    return { ...step, questions: questions as ClassroomQuestion[] };
  });
  return clone;
}
