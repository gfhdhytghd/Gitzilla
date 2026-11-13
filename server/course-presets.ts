import type { ClassroomPlan } from '../shared/classroom';
import { stepQuestionSeconds } from './course-question-policy';

export const COURSE_PRESETS = ['lesson', 'quiz', 'exercise', 'warmup', 'exam'] as const;
export type CoursePreset = typeof COURSE_PRESETS[number];
export const MAX_COURSE_PROMPT_CHARS = 2000;
// A 2000-character URI-encoded CJK prompt can exceed Node's default 16 KiB header limit.
export const COURSE_REQUEST_MAX_HEADER_BYTES = 32 * 1024;
export function normalizeCoursePreset(value: unknown = 'lesson'): CoursePreset {
  if (typeof value !== 'string' || !(COURSE_PRESETS as readonly string[]).includes(value)) throw new Error('Invalid course preset: choose lesson, quiz, exercise, warmup or exam');
  return value as CoursePreset;
}
export function normalizeTeacherPrompt(value: unknown = ''): string {
  if (typeof value !== 'string' || value.length > MAX_COURSE_PROMPT_CHARS) throw new Error('Teacher prompt must contain 0–2000 characters');
  return value;
}
const timer = (value: number, fallback: number, max: number) => Number.isInteger(value) && value >= 0 ? Math.min(value || fallback, max) : value;

/** Apply trusted structural settings before the ordinary lesson normalizer validates the result. */
export function applyCoursePreset(plan: ClassroomPlan, preset: CoursePreset): ClassroomPlan {
  if (!plan || !Array.isArray(plan.steps) || preset === 'lesson') return plan;
  return { ...plan, steps: plan.steps.map(step => {
    if (!step || typeof step !== 'object') return step;
    if (preset === 'quiz' || preset === 'warmup') {
      return { ...step, mode: 'questions', answerFeedback: 'after-close', revealAnswers: 'after-raid',
        durationSec: Math.max(preset === 'quiz' ? timer(step.durationSec, 120, 180) : timer(step.durationSec, 30, Math.min(60, Math.floor(120 / plan.steps.length))), stepQuestionSeconds(step)),
        brief: undefined, starter: undefined,
        ...(preset === 'warmup' && Array.isArray(step.questions) ? { questions: step.questions.map(q => ({ ...q, points: 1 })) } : {}) };
    }
    if (preset === 'exercise') {
      return { ...step, mode: 'mixed', answerFeedback: 'immediate', revealAnswers: 'after-raid',
        ...(Array.isArray(step.questions) ? { questions: step.questions.map(q => ({ ...q, maxAttempts: 3 })) } : {}) };
    }
    return { ...step, answerFeedback: 'after-close', revealAnswers: 'never', starter: undefined,
      ...(Array.isArray(step.questions) ? { questions: step.questions.map(q => ({ ...q, maxAttempts: 1 })) } : {}),
      ...(step.brief ? { brief: { ...step.brief, hints: undefined, example: undefined } } : {}) };
  }) };
}
