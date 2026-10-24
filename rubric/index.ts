// Browser-safe entry point. PDF extraction lives separately in ./pdf.ts (Node only).
export { parseRubric, defaultRubric } from './parser.ts';
export { scoreRepo, weightedScore } from './scoring.ts';
export { buildFeedback } from './feedback.ts';
export type { FeedbackMatchStats } from './feedback.ts';
