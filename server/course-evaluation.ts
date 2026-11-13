import { CourseGenerationError, type CourseGenerationResult } from './course-generation';
import { courseKeyHistogram } from './course-output';

/** Pure formatting for the manual evaluator; importing this helper never calls a provider. */
export function courseEvaluationSummary(name: string, timeMs: number, result?: CourseGenerationResult, error?: unknown) {
  const diagnostics = result?.diagnostics ?? (error instanceof CourseGenerationError ? error.diagnostics : undefined);
  const attemptErrors = diagnostics?.attempts.filter(attempt => attempt.errors.length) ?? [];
  const failureReason = result ? null : attemptErrors.length
    ? attemptErrors.map(attempt => `${attempt.provider}${attempt.repair ? ' repair' : ''}: ${attempt.errors.join('; ')}`).join(' | ')
    : error instanceof Error ? error.message : 'Generation failed';
  const verificationCounts = (finalOnly = false) => Object.fromEntries(['passed', 'failed', 'missing', 'not-required'].map(status => [status, diagnostics?.keyVerification?.filter(v => v.status === status && (!finalOnly || v.attempt === diagnostics.attempts.length)).length ?? 0]));
  return {
    case: name, status: result ? 'PASS' : 'FAIL', provider: result?.provider ?? diagnostics?.attempts.at(-1)?.provider ?? 'unavailable',
    model: result?.model ?? diagnostics?.attempts.at(-1)?.model ?? 'unknown',
    timeMs: Math.round(timeMs), repairRounds: diagnostics?.repairRounds ?? 0, repairs: diagnostics?.repairs.length ?? 0,
    droppedItems: diagnostics?.droppedItems.length ?? 0, droppedDetails: diagnostics?.droppedItems ?? [],
    keyVerification: verificationCounts(), finalKeyVerification: verificationCounts(true),
    publishedQuestions: result?.plan.steps.reduce((n, s) => n + (s.questions?.length ?? 0), 0) ?? 0,
    publishedBlanks: result?.plan.steps.flatMap(s => s.questions ?? []).filter(q => q.kind === 'blank').length ?? 0,
    verificationDetails: diagnostics?.keyVerification ?? [],
    attemptErrors, fallbacks: diagnostics?.fallbacks ?? [], failureReason, keyPositionHistogram: result ? courseKeyHistogram(result.plan) : {},
  };
}
