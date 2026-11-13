import type { CriterionResult, Rubric } from './types';
import type { AIReview, ReviewSettings } from './classroom-review';

export interface ClassroomCheck {
  id: string;
  label: string;
  kind: 'file' | 'contains' | 'doctest' | 'ci';
  path: string; // repository-relative file, or exact GitHub check name
  text?: string;
}
export interface ClassroomStep {
  id: string;
  title: string;
  instructions: string;
  durationSec: number; // 0 = teacher advances manually
  rubric: Rubric;
  checks: ClassroomCheck[];
  checksWeight: number; // 0..100; only used when checks exist
  // In-app editor (no GitHub needed): starter files students edit in the browser. When present the student UI opens
  // the editor by default; GitHub submission stays available as an alternative.
  // Structured, student-facing task brief (preferred over the free-text `instructions` when present).
  brief?: StepBrief;
  starter?: InAppFile[];
  language?: 'python';     // editor highlighting / optional in-browser run (Pyodide); doctests run in the server sandbox
  // Question sets (TopHat/Pearson style). A step holds a code task, a question set, or both.
  // Absent `mode` = 'code' (every plan saved before questions existed).
  mode?: StepMode;
  questions?: ClassroomQuestion[];   // 'questions' | 'mixed': 1..30, ids unique within the step
  questionContext?: string;          // ≤ 4000 chars, Markdown-lite: shared code/reading shown once above the step's questions
  questionsWeight?: number;          // 'mixed' only, 0..100: share of the step score from questions (default 50)
  answerFeedback?: AnswerFeedback;   // default 'after-close'
  revealAnswers?: 'after-raid' | 'never';  // default 'after-raid': keys + explanations reach students in feedback/complete
}
export type StepMode = 'code' | 'questions' | 'mixed';
// 'after-close': answers are editable until submissions close; correctness is hidden until reveal.
// 'immediate': every save is graded at once (Pearson style); each question allows `maxAttempts` checks,
//              after which (or when correct) that question locks for the student.
export type AnswerFeedback = 'after-close' | 'immediate';

interface QuestionBase {
  id: string;            // [a-z0-9-]{1,32}, unique within the step
  prompt: string;        // ≤ 2000 chars, Markdown-lite (inline `code`, fenced code blocks)
  points?: number;       // integer 1..100, default 1; weight inside the question set
  explain?: string;      // ≤ 1000 chars; shown with the key on reveal
  maxAttempts?: number;  // 'immediate' only, 1..10, default 3
}
export interface ChoiceOption { id: string; text: string }   // id [a-z0-9-]{1,16}; text ≤ 300 chars; 2..8 options
export interface SingleChoiceQuestion extends QuestionBase { kind: 'single'; options: ChoiceOption[]; answer: string }
export interface MultiChoiceQuestion extends QuestionBase {
  kind: 'multi'; options: ChoiceOption[]; answer: string[];   // ≥ 1 correct option
  scoring?: 'exact' | 'partial';  // default 'partial': max(0, (rightPicked − wrongPicked) / answer.length)
}
// Fill in the blank: the prompt marks blanks as {{1}}, {{2}} … in order; blanks[i] grades {{i+1}}. 1..6 blanks.
export interface BlankSpec {
  accept: string[];        // 1..10 accepted answers, each ≤ 200 chars; compared after trim + whitespace collapse
  caseSensitive?: boolean; // default false
  numeric?: { value: number; tolerance: number };  // when set, a number within ±tolerance is correct (accept is display text)
}
export interface BlankQuestion extends QuestionBase { kind: 'blank'; blanks: BlankSpec[] }
export type ClassroomQuestion = SingleChoiceQuestion | MultiChoiceQuestion | BlankQuestion;

// What a student may see before reveal: no keys, no explanations.
export type StudentQuestion =
  | (Omit<SingleChoiceQuestion, 'answer' | 'explain'>)
  | (Omit<MultiChoiceQuestion, 'answer' | 'explain'>)
  | (Omit<BlankQuestion, 'blanks' | 'explain'> & { blankCount: number; blankNumeric?: boolean[] });  // blankNumeric[i]: blank i takes a number (input hint only)

export type QuestionAnswer = { choice: string } | { choices: string[] } | { blanks: string[] };
export interface QuestionResult {
  answer: QuestionAnswer;
  attempts: number;        // graded saves of this question
  locked?: boolean;        // 'immediate': correct or out of attempts
  // Present for the teacher always; for the student only when feedback is 'immediate' or answers are revealed.
  correct?: boolean;
  score?: number;          // 0..1 of this question's points
  blankCorrect?: boolean[];
  key?: QuestionAnswer;    // revealed key ('immediate' after lock, or reveal)
  explain?: string;
}
// Anonymous per-question aggregates (safe for the projector once frozen in a round).
export interface QuestionStat {
  id: string; answered: number; correct: number; total: number;   // total = students on the roster
  options?: { id: string; count: number }[];   // single/multi: picks per option
}
export interface InAppFile { path: string; content: string }
export interface StepBrief {
  goal: string;               // one sentence: what you are building ("Print a personal introduction card.")
  todo: string[];             // 2–6 concrete actions, imperative, each ≤ ~90 chars; `code` in backticks
  doneWhen: string[];         // observable success criteria, mirrors the step's checks ("Running it prints `Hello, Python!`")
  example?: { title?: string; output: string };   // expected program output / sample, shown in a code block
  hints?: string[];           // collapsed by default
  concepts?: string[];        // 1–4 tags shown as chips ("print()", "f-strings", "variables")
}  // repo-relative path, UTF-8 text
export interface ClassroomPlan { title: string; bossName: string; guideUrl?: string; guideText?: string; grading?: ReviewSettings; steps: ClassroomStep[] }
export type ClassroomPhase = 'setup' | 'coding' | 'paused' | 'raid' | 'feedback' | 'complete';
export interface ClassroomRow {
  id: string; name: string; connected: boolean;
  status: 'empty' | 'queued' | 'submitted' | 'error';
  repo?: string; commit?: string; score?: number; improvement: number;
  damage: number; totalDamage: number; attempts: number;
  reviewPending?: boolean;
}
export interface ClassroomAttack {
  id: string; name: string; score: number; improvement: number; damage: number; commit: string;
  reviewPending?: boolean;
}
export interface ClassroomRound {
  stepId: string; attempt: number; at: number; bossBefore: number; bossAfter: number;
  attacks: ClassroomAttack[];
  // Anonymous class-level aggregates frozen at attack time (safe for the projector; no names).
  roster?: number;                 // students in the room when the attack ran
  checkStats?: { label: string; passed: number; total: number }[];   // one per step check, same order; total = scored submissions
  questionStats?: QuestionStat[];  // one per step question, same order
}
export interface ClassroomReport {
  stepId: string; attempt: number; repo: string; commit: string; submittedAt: number;
  source?: 'github' | 'in-app';   // in-app: repo = "in-app", commit = content hash ("inapp:<8 hex>")
  files?: InAppFile[];            // in-app submissions: the submitted files (teacher's read-only viewer; never public)
  score: number; improvement: number; checks: { label: string; passed: boolean; detail: string }[];
  criteria: CriterionResult[]; advice: string[];
  teacherReview?: { score: number; note: string };
  automaticScore?: number;
  aiReview?: AIReview;
  reviewPending?: boolean;
  // Question sets: per-question results; codeScore/questionScore are the 0..100 parts blended into `score`.
  answers?: Record<string, QuestionResult>;
  questionScore?: number;
  codeScore?: number;
}
export interface ClassroomState {
  plan: ClassroomPlan; phase: ClassroomPhase; stepIndex: number; attempt: number;
  deadline: number | null; remainingMs: number | null; serverTime: number;
  raidEndsAt: number | null; bossHp: number; bossMaxHp: number;
  rows: ClassroomRow[]; rounds: ClassroomRound[];
  notice?: string;
  // Host pause (same shape as MatchState.paused): the raid clock freezes; resumeAt = 3s resume countdown target.
  paused?: { by: string; since: number; resumeAt: number | null } | null;
  // Current step, coding/paused only: students who saved an answer, per question (same order). Anonymous; no correctness.
  questionAnswered?: number[];
}
export type ClassroomCommand = 'start' | 'pause' | 'resume' | 'attack' | 'next' | 'retry' | 'finish' | 'extend';
