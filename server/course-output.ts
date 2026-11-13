import type { ClassroomPlan, ClassroomQuestion, ClassroomStep, ChoiceOption } from '../shared/classroom';
import { normalizeClassroomPlan } from './classroom';
import { normalizeQuestions } from './classroom-questions';
import { normalizeRubric } from './rubrics';
import { defaultRubric } from '../rubric/parser';
import { applyCoursePreset, normalizeCoursePreset, type CoursePreset } from './course-presets';
import { stepQuestionSeconds } from './course-question-policy';

export interface CourseAdjustment { path: string; reason: string; provider?: string; attempt?: number; raw?: unknown }
export interface CourseValidationDiagnostics { repairs: CourseAdjustment[]; droppedItems: CourseAdjustment[] }
export const validationDiagnostics = (): CourseValidationDiagnostics => ({ repairs: [], droppedItems: [] });
export class CourseValidationError extends Error {
  constructor(readonly errors: string[]) { super(errors.join('\n')); this.name = 'CourseValidationError'; }
}
const message = (error: unknown) => error instanceof Error ? error.message : 'Invalid generated item';
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Extract exactly the first complete object. Braces and escaped quotes inside strings are not delimiters. */
export function parseCourseJson(text: string, diagnostics = validationDiagnostics()): unknown {
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (start < 0) { if (c !== '{') continue; start = i; depth = 1; continue; }
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      let value: unknown;
      try { value = JSON.parse(text.slice(start, i + 1)); }
      catch { throw new CourseValidationError(['Invalid JSON in the first complete course object']); }
      if (text.slice(0, start).trim() || text.slice(i + 1).trim()) diagnostics.repairs.push({ path: '$', reason: 'Extracted the first complete JSON object; ignored surrounding text' });
      return value;
    }
  }
  throw new CourseValidationError(['Generated course JSON has no complete object; return one complete JSON object']);
}
const comparable = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
function optionId(answer: unknown, options: ChoiceOption[]): string | null {
  if (typeof answer !== 'string') return null;
  const trimmed = answer.trim();
  // A valid explicit ID is authoritative. Otherwise accept only one interpretation of text/letter labels.
  const exact = options.find(o => o.id === trimmed);
  if (exact) return exact.id;
  const candidates = new Set(options.filter(o => comparable(o.id) === comparable(trimmed) || comparable(o.text) === comparable(trimmed)).map(o => o.id));
  const letter = /^(?:option\s+)?\(?([a-h])\)?[.)]?$/i.exec(trimmed);
  if (letter) { const option = options[letter[1].toLowerCase().charCodeAt(0) - 97]; if (option) candidates.add(option.id); }
  return candidates.size === 1 ? [...candidates][0] : null;
}
function repairAnswer(value: unknown, path: string, diagnostics: CourseValidationDiagnostics): unknown {
  if (!object(value) || !['single', 'multi'].includes(value.kind) || !Array.isArray(value.options) || value.options.some(o => !object(o) || typeof o.id !== 'string' || typeof o.text !== 'string')) return value;
  const q = { ...value }, options = q.options as ChoiceOption[];
  if (q.kind === 'single') {
    const id = optionId(q.answer, options);
    if (id !== null && id !== q.answer) { q.answer = id; diagnostics.repairs.push({ path: `${path}.answer`, reason: 'Mapped an unambiguous option text or letter to its option ID' }); }
  } else {
    let raw = q.answer;
    if (typeof raw === 'string') {
      const id = optionId(raw, options);
      if (id !== null) raw = [id];
      else if (/^[a-h](?:\s*[,;]\s*[a-h])+$/i.test(raw.trim())) raw = raw.trim().split(/\s*[,;]\s*/);
    }
    if (Array.isArray(raw) && raw.length) {
      const ids = raw.map(a => optionId(a, options));
      if (ids.every((id): id is string => id !== null)) {
        const answer = [...new Set(ids)];
        if (JSON.stringify(answer) !== JSON.stringify(q.answer)) diagnostics.repairs.push({ path: `${path}.answer`, reason: 'Mapped unambiguous multi-choice keys to unique option IDs' });
        q.answer = answer;
      }
    }
  }
  return q;
}
function normalizedStep(step: ClassroomStep): ClassroomStep {
  return normalizeClassroomPlan({ title: 'Validate generated step', bossName: 'Validator', steps: [step] }).steps[0];
}

/** Generated drafts are recoverable; teacher-authored classroom plans still use the strict normalizer. */
export function recoverGeneratedCourse(value: unknown, preset: CoursePreset = 'lesson', diagnostics = validationDiagnostics(), sources = new Map<string, any>()): ClassroomPlan {
  if (Buffer.byteLength(JSON.stringify(value) ?? '') > 256_000) throw new CourseValidationError(['Generated course is too large']);
  const selected = normalizeCoursePreset(preset), prepared = applyCoursePreset(structuredClone(value) as ClassroomPlan, selected);
  if (!prepared || !Array.isArray(prepared.steps) || !prepared.steps.length) throw new CourseValidationError(['A lesson needs 1–12 steps; the plan is empty']);
  const errors: string[] = [], stepIds = new Set<string>();
  for (let i = 12; i < prepared.steps.length; i++) diagnostics.droppedItems.push({ path: `steps[${i}]`, reason: 'Lesson exceeds 12 steps', raw: prepared.steps[i] });
  const steps = prepared.steps.slice(0, 12).map((raw, index) => {
    const path = `steps[${index}]`;
    if (!object(raw)) { errors.push(`${path}: Invalid or empty step`); return raw; }
    const step = { ...raw };
    if (step.questionContext === null) delete step.questionContext;
    if (typeof step.id !== 'string' || !step.id.trim() || step.id.length > 60 || stepIds.has(step.id.trim())) {
      let serial = index + 1, id = `step-${serial}`; while (stepIds.has(id)) id = `step-${++serial}`;
      step.id = id; diagnostics.repairs.push({ path: `${path}.id`, reason: 'Assigned a unique step ID' });
    }
    stepIds.add(step.id.trim());
    if (selected === 'lesson' && (step.mode === 'questions' || step.mode === 'mixed') &&
      (step.questions == null || (Array.isArray(step.questions) && !step.questions.length))) {
      try {
        // Validate the original code fields before considering a mode repair. A
        // question-only shell or malformed code task must still fail closed.
        normalizedStep({ ...step, mode: 'code', questions: undefined, brief: undefined } as ClassroomStep);
        step.mode = 'code'; delete step.questions;
        diagnostics.repairs.push({ path: `${path}.mode`, reason: 'Changed an empty questions/mixed step with a valid code task to code' });
      } catch (error) {
        errors.push(`${path}: Empty question step cannot become code: ${message(error)}`);
      }
    }
    if ((step.mode === 'questions' || step.mode === 'mixed') && Array.isArray(step.questions)) {
      const ids = new Set<string>(), questions: ClassroomQuestion[] = [];
      step.questions.forEach((rawQuestion: unknown, qIndex: number) => {
        const qPath = `${path}.questions[${qIndex}]`;
        try {
          let question = repairAnswer(rawQuestion, qPath, diagnostics);
          if (object(question) && question.kind === 'blank' && typeof question.prompt === 'string' && Array.isArray(question.blanks)) {
            let prompt = question.prompt;
            const shapes = prompt.match(/_{3,}|\{\s*\d+\s*\}|\{\{\s*(?:blank|answer)\s*\}\}/gi);
            if (!/\{\{\d+\}\}/.test(prompt) && shapes?.length === question.blanks.length) {
              let n = 0; prompt = prompt.replace(/_{3,}|\{\s*\d+\s*\}|\{\{\s*(?:blank|answer)\s*\}\}/gi, () => '{{' + (++n) + '}}');
            } else if (question.blanks.length === 1 && !/\{\{|\}\}/.test(prompt)) prompt += '\n{{1}}';
            if (prompt !== question.prompt) {
              question = { ...question, prompt };
              diagnostics.repairs.push({ path: `${qPath}.prompt`, reason: 'Repaired unambiguous blank input markers without changing accepted answers' });
            }
          }
          if (object(question) && typeof question.prompt === 'string' && !/```/.test(question.prompt) && !/```/.test(step.questionContext ?? '') && object(question.verification) && typeof question.verification.code === 'string' && question.verification.code.trim()) {
            const prompt = question.prompt + '\n```python\n' + question.verification.code.trim() + '\n```';
            if (prompt.length <= 2000) {
              question = { ...question, prompt };
              diagnostics.repairs.push({ path: `${qPath}.prompt`, reason: 'Included this question own verification code to make its implementation explicit; still requires sandbox key verification' });
            }
          }
          if (object(question) && (typeof question.id !== 'string' || !/^[a-z0-9-]{1,32}$/.test(question.id) || ids.has(question.id))) {
            let serial = qIndex + 1, id = `q-${serial}`; while (ids.has(id)) id = `q-${++serial}`;
            question = { ...question, id }; diagnostics.repairs.push({ path: `${qPath}.id`, reason: 'Assigned a unique question ID' });
          }
          const normalized = normalizeQuestions([question])[0];
          if (questions.length >= 30) throw new Error('Question set exceeds 30 valid questions');
          ids.add(normalized.id); questions.push(normalized); sources.set(step.id.trim() + ':' + normalized.id, question);
        } catch (error) { diagnostics.droppedItems.push({ path: qPath, reason: message(error), raw: rawQuestion }); }
      });
      step.questions = questions;
    }
    if (step.mode !== 'questions' && Array.isArray(step.checks)) {
      step.checks = step.checks.filter((check: unknown, checkIndex: number) => {
        try {
          normalizedStep({ id: 'check', title: 'Check validation', instructions: 'Validate a generated check.', durationSec: 0, rubric: defaultRubric(), checksWeight: 0, checks: [check as ClassroomStep['checks'][number]] });
          return true;
        } catch (error) { diagnostics.droppedItems.push({ path: `${path}.checks[${checkIndex}]`, reason: message(error), raw: check }); return false; }
      });
    }
    if (step.mode !== 'questions' && object(step.rubric) && Array.isArray(step.rubric.criteria)) {
      const criteria = step.rubric.criteria.filter((criterion: unknown, criterionIndex: number) => {
        try {
          if (!object(criterion) || typeof criterion.weight !== 'number' || !Number.isFinite(criterion.weight) || criterion.weight < 0) throw new Error('Invalid rubric criterion or weight');
          // Zero-weight criteria can be valid in a larger rubric; validate their other fields with a unit weight.
          normalizeRubric({ title: 'Criterion validation', source: 'default', criteria: [{ ...criterion, weight: criterion.weight || 1 }] });
          return true;
        } catch (error) { diagnostics.droppedItems.push({ path: `${path}.rubric.criteria[${criterionIndex}]`, reason: message(error), raw: criterion }); return false; }
      });
      step.rubric = { ...step.rubric, criteria };
    }
    try {
      const withoutBrief = normalizedStep({ ...step, brief: undefined } as ClassroomStep);
      if (step.brief === undefined) return withoutBrief;
      try { return normalizedStep(step as ClassroomStep); }
      catch (error) {
        diagnostics.droppedItems.push({ path: `${path}.brief`, reason: message(error), raw: step.brief });
        return withoutBrief;
      }
    } catch (error) {
      errors.push(`${path}: ${message(error)}`);
      return step as ClassroomStep;
    }
  });
  if (errors.length) throw new CourseValidationError([...errors, ...diagnostics.droppedItems.map(d => `${d.path}: ${d.reason}`)]);
  const plan = normalizeClassroomPlan({ ...prepared, steps });
  for (const step of plan.steps) {
    const floor = stepQuestionSeconds(step);
    if (floor > 7200) throw new CourseValidationError(['Question workload exceeds the 7200-second step limit; split the questions across shorter steps']);
    if (step.durationSec < floor) { step.durationSec = floor; diagnostics.repairs.push({ path: `steps[${plan.steps.indexOf(step)}].durationSec`, reason: `Raised timer to ${floor} seconds from question type, code and input workload` }); }
  }
  return reconcileQuestionInstructions({ title: plan.title, bossName: plan.bossName, steps: plan.steps }, diagnostics);
}

/** Balance key positions per lesson with seeded tie breaks; remap IDs and keys together before publication. */
export function shuffleCourseOptions(plan: ClassroomPlan, seed: number): ClassroomPlan {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let n = Math.imul(state ^ state >>> 15, state | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
  const copy = structuredClone(plan), loads = new Map<number, number[]>();
  const shuffle = <T>(items: T[]): T[] => {
    for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
    return items;
  };
  for (const step of copy.steps) for (const q of step.questions ?? []) if (q.kind !== 'blank') {
    const keys = new Set(q.kind === 'single' ? [q.answer] : q.answer), options = shuffle([...q.options]);
    const count = options.length, used = loads.get(count) ?? Array(count).fill(0); loads.set(count, used);
    // Seeded tie breaks allocate the least-used positions across this whole
    // lesson, including multi keys. Each option-count bucket differs by at most 1.
    const positions = shuffle(Array.from({ length: count }, (_, i) => i)).sort((a, b) => used[a] - used[b]);
    const correct = options.filter(o => keys.has(o.id)), other = options.filter(o => !keys.has(o.id));
    const chosen = new Set(positions.slice(0, correct.length)); for (const i of chosen) used[i]++;
    q.options = Array.from({ length: count }, (_, i) => chosen.has(i) ? correct.shift()! : other.shift()!);
    const ids = new Map(q.options.map((option, i) => [option.id, String.fromCharCode(97 + i)]));
    q.options = q.options.map(option => ({ ...option, id: ids.get(option.id)! }));
    if (q.kind === 'single') q.answer = ids.get(q.answer)!; else q.answer = q.answer.map(id => ids.get(id)!);
  }
  return copy;
}
export function courseKeyHistogram(plan: ClassroomPlan): Record<string, number[]> {
  const histogram: Record<string, number[]> = {};
  for (const step of plan.steps) for (const q of step.questions ?? []) if (q.kind !== 'blank') {
    const bins = histogram[q.options.length] ??= Array(q.options.length).fill(0);
    const keys = q.kind === 'single' ? [q.answer] : q.answer;
    for (const key of keys) { const position = q.options.findIndex(o => o.id === key); if (position >= 0) bins[position]++; }
  }
  return histogram;
}

/** Update explicit item-count phrases after local recovery, without rewriting code. */
export function reconcileQuestionInstructions(plan: ClassroomPlan, diagnostics: CourseValidationDiagnostics): ClassroomPlan {
  const words = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');
  for (const [i, step] of plan.steps.entries()) if (step.questions?.length) {
    const n = step.questions.length;
    const fix = (text: string) => text.split(/(```[\s\S]*?```)/g).map((part, index) => index % 2 ? part : part
      .replace(/\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)(\s+(?:(?:quick|short|practice|checkpoint|fun)\s+)?(?:questions?|challenges?|items?|checkpoints?))\b/gi, (all, value, rest, offset, whole) => {
        if (/\bitems?\b/i.test(rest) && !/\b(?:answer|complete|these|following|quiz|checkpoint|all)\s*$/i.test(whole.slice(0, offset))) return all;
        return (Number.isNaN(Number(value)) ? words.indexOf(value.toLowerCase()) : Number(value)) === n ? all : n + (n === 1 ? rest.replace(/\b(questions|challenges|items|checkpoints)\b/gi, (word: string) => word.slice(0, -1)) : rest);
      })
      .replace(/[一二三四五六七八九十\d]+((?:道|个)(?:小题|题目|问题|题))/g, (_all, rest) => n + rest)).join('');
    const update = (text: string, path: string, maximum: number): string => {
      const next = fix(text);
      if (next !== text) { if (next.length > maximum) throw new CourseValidationError(['Reconciled question-count text exceeds its character limit']); diagnostics.repairs.push({ path, reason: 'Aligned explicit question-count wording with the published item count' }); }
      return next;
    };
    step.instructions = update(step.instructions, `steps[${i}].instructions`, 8000);
    if (step.questionContext !== undefined) step.questionContext = update(step.questionContext, `steps[${i}].questionContext`, 4000);
    if (step.brief) step.brief.todo = step.brief.todo.map((text, j) => update(text, `steps[${i}].brief.todo[${j}]`, 160));
  }
  return plan;
}
