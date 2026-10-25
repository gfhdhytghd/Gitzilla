import type { CriterionResult, Rubric } from './types';

export interface ClassroomCheck {
  id: string;
  label: string;
  kind: 'file' | 'contains' | 'ci';
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
  language?: 'python';     // editor highlighting / optional in-browser run (Pyodide); grading stays static
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
export interface ClassroomPlan { title: string; bossName: string; steps: ClassroomStep[] }
export type ClassroomPhase = 'setup' | 'coding' | 'paused' | 'raid' | 'feedback' | 'complete';
export interface ClassroomRow {
  id: string; name: string; connected: boolean;
  status: 'empty' | 'queued' | 'submitted' | 'error';
  repo?: string; commit?: string; score?: number; improvement: number;
  damage: number; totalDamage: number; attempts: number;
}
export interface ClassroomAttack {
  id: string; name: string; score: number; improvement: number; damage: number; commit: string;
}
export interface ClassroomRound {
  stepId: string; attempt: number; at: number; bossBefore: number; bossAfter: number;
  attacks: ClassroomAttack[];
  // Anonymous class-level aggregates frozen at attack time (safe for the projector; no names).
  roster?: number;                 // students in the room when the attack ran
  checkStats?: { label: string; passed: number; total: number }[];   // one per step check, same order; total = scored submissions
}
export interface ClassroomReport {
  stepId: string; attempt: number; repo: string; commit: string; submittedAt: number;
  source?: 'github' | 'in-app';   // in-app: repo = "in-app", commit = content hash ("inapp:<8 hex>")
  files?: InAppFile[];            // in-app submissions: the submitted files (teacher's read-only viewer; never public)
  score: number; improvement: number; checks: { label: string; passed: boolean; detail: string }[];
  criteria: CriterionResult[]; advice: string[];
  teacherReview?: { score: number; note: string };
}
export interface ClassroomState {
  plan: ClassroomPlan; phase: ClassroomPhase; stepIndex: number; attempt: number;
  deadline: number | null; remainingMs: number | null; serverTime: number;
  raidEndsAt: number | null; bossHp: number; bossMaxHp: number;
  rows: ClassroomRow[]; rounds: ClassroomRound[];
  notice?: string;
  // Host pause (same shape as MatchState.paused): the raid clock freezes; resumeAt = 3s resume countdown target.
  paused?: { by: string; since: number; resumeAt: number | null } | null;
}
export type ClassroomCommand = 'start' | 'pause' | 'resume' | 'attack' | 'next' | 'retry' | 'finish' | 'extend';
